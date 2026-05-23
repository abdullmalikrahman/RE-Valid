/**
 * RE-Valid Sensor Node — ESP32 + SIM7600G + Zhafira Anemometer V1.3
 * ============================================================
 * Arsitektur queue-based (tahan offline):
 *   Tiap 1 menit → baca sensor → simpan ke /datalog.csv + /queue.json
 *   Tiap 1 jam   → kirim semua antrian dari /queue.json via MQTT LTE
 *                  (data tidak hilang jika jaringan sementara down)
 *
 * Sensor:
 *   - BME280      : suhu, kelembapan, tekanan udara
 *   - DS3231      : RTC (waktu presisi)
 *   - ADS1115     : ADC (tegangan baterai via voltage divider)
 *   - Zhafira V1.3: anemometer cup 3-blade, Hall Effect A3144, 2 magnet
 *   - Wind Dir    : sensor arah angin UART ASCII '1'-'8'
 *   - Pyranometer : RS485 Modbus RTU (Sentec SEM228A / sejenis)
 *   - GPS         : modul onboard SIM7600G
 *
 * File di SD Card:
 *   /datalog.csv  — arsip lengkap format CSV (append only)
 *   /queue.json   — antrian kirim MQTT, 1 JSON per baris
 *   /qptr.txt     — byte-offset progress pengiriman
 *
 * Konfigurasi:
 *   Salin secrets.h.example → secrets.h, isi semua nilai sebelum upload.
 *
 * Library (install via Arduino Library Manager):
 *   TinyGSM · PubSubClient · Adafruit_BME280
 *   Adafruit_ADS1X15 · Adafruit Unified Sensor · RTClib
 * ============================================================
 */

#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <RTClib.h>
#include <Adafruit_ADS1X15.h>
#include <SPI.h>
#include <SD.h>
#include <FS.h>
#include <SoftwareSerial.h>

// ===================== MODEM SIM7600G =====================
#define TINY_GSM_MODEM_SIM7600
#define TINY_GSM_RX_BUFFER 1024
#include <TinyGsmClient.h>
#include <PubSubClient.h>

// ===================== PIN MAPPING =====================
#define MODEM_TX     27
#define MODEM_RX     26
#define MODEM_PWRKEY  4
#define MODEM_FLIGHT 25

#define SDA_PIN      21
#define SCL_PIN      22
#define BME280_ADDR  0x76
#define ADS1115_ADDR 0x48

#define SD_MOSI 15
#define SD_SCLK 14
#define SD_CS   13
#define SD_MISO  2

#define ANEMO_PIN  34
#define ANEMO_PPR  1.0f   // pulse per satuan RPM (dikalibrasi empiris bersama ANEMO_FACTOR)

#define WIND_RX_PIN 33
#define WIND_TX_PIN 32

#define PYRO_RX_PIN    19
#define PYRO_TX_PIN    23
#define PYRO_DE_RE_PIN  5
#define PYRO_SLAVE_ID  0x01
#define PYRO_START_REG 0x0000
#define PYRO_REG_COUNT 1
#define PYRO_BAUDRATE  4800

// ===================== KALIBRASI ANEMOMETER =====================
// Anemometer: Zhafira V1.3 Evoteknologi (Hall Effect A3144, 2 magnet, cup 3-blade)
// Faktor konversi RPM → m/s (raw, sebelum koreksi kalibrasi)
#define ANEMO_FACTOR 0.00576f

// Koreksi kalibrasi polinomial (sumber: data kalibrasi vs anemometer referensi):
//   v_true = -0.0181 × v_raw² + 1.3859 × v_raw + 1.4055
// Diterapkan hanya saat v_raw > 0.05 m/s (di bawah threshold → 0)
float applyAnemometerCalibration(float v_raw) {
  if (v_raw < 0.05f) return 0.0f;
  float v_cal = -0.0181f * v_raw * v_raw + 1.3859f * v_raw + 1.4055f;
  return (v_cal > 0.0f) ? v_cal : 0.0f;
}

// ===================== INTERVAL WAKTU =====================
const unsigned long SAMPLE_INTERVAL_MS    = 60000UL;   // 1 menit: baca sensor → SD Card
const unsigned long SEND_INTERVAL_MS      = 3600000UL; // 1 jam:   kirim antrian via MQTT
const unsigned long MQTT_PUBLISH_DELAY_MS = 100UL;     // jeda antar publish (ms)

// ===================== KREDENSIAL — dari secrets.h =====================
// Salin secrets.h.example → secrets.h, isi semua nilai sebelum upload!
#include "secrets.h"
// secrets.h mendefinisikan:
//   STATION_ID, APN, GPRS_USER, GPRS_PASS
//   MQTT_SERVER, MQTT_PORT, MQTT_USER, MQTT_PASSWORD

// Topik MQTT (diisi di setup())
String MQTT_TOPIC;

// ===================== FILE SD CARD =====================
#define FILE_CSV   "/datalog.csv"  // arsip lengkap CSV
#define FILE_QUEUE "/queue.json"   // antrian kirim MQTT (1 JSON per baris)
#define FILE_QPTR  "/qptr.txt"     // byte-offset progress pengiriman

// ===================== OBJEK =====================
HardwareSerial   SerialAT(1);
TinyGsm          modem(SerialAT);
TinyGsmClient    gsmClient(modem);
PubSubClient     mqtt(gsmClient);

Adafruit_BME280  bme;
RTC_DS3231       rtc;
Adafruit_ADS1X15 ads;

HardwareSerial   WindSerial(2);
SoftwareSerial   RS485Serial(PYRO_RX_PIN, PYRO_TX_PIN);

// ===================== VARIABEL GLOBAL =====================
volatile uint32_t anemoPulseCount = 0;
uint32_t          lastPulseCount  = 0;
unsigned long     lastSampleMs    = 0;
unsigned long     lastSendMs      = 0;

String   arah_angin    = "unknown";
bool     pyrOK         = false;
uint16_t pyrValue      = 0;
float    latGPS        = 0.0f;
float    lonGPS        = 0.0f;
bool     gpsValid      = false;
bool     gprsConnected = false;

// ===================== ISR ANEMOMETER =====================
void IRAM_ATTR anemoISR() { anemoPulseCount++; }

// ===================================================================
//  UTILITAS WAKTU
// ===================================================================
// Format ISO 8601 untuk JSON/MQTT payload
String getISOTime(const DateTime &dt) {
  char buf[20];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d",
           dt.year(), dt.month(), dt.day(),
           dt.hour(), dt.minute(), dt.second());
  return String(buf);
}

// Format human-readable untuk CSV
String getCSVTime(const DateTime &dt) {
  char buf[20];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02d %02d:%02d:%02d",
           dt.year(), dt.month(), dt.day(),
           dt.hour(), dt.minute(), dt.second());
  return String(buf);
}

// ===================================================================
//  KONVERSI ARAH ANGIN
// ===================================================================
String decodeWindDir(char c) {
  if (c == '1') return "utara";
  if (c == '2') return "timur laut";
  if (c == '3') return "timur";
  if (c == '4') return "tenggara";
  if (c == '5') return "selatan";
  if (c == '6') return "barat daya";
  if (c == '7') return "barat";
  if (c == '8') return "barat laut";
  return "unknown";
}

float windDirToDegrees(const String &dir) {
  if (dir == "utara")      return   0.0f;
  if (dir == "timur laut") return  45.0f;
  if (dir == "timur")      return  90.0f;
  if (dir == "tenggara")   return 135.0f;
  if (dir == "selatan")    return 180.0f;
  if (dir == "barat daya") return 225.0f;
  if (dir == "barat")      return 270.0f;
  if (dir == "barat laut") return 315.0f;
  return -1.0f; // unknown → null di JSON
}

void readWindDirectionSerial() {
  while (WindSerial.available()) {
    char c = (char)WindSerial.read();
    if (c >= '1' && c <= '8') arah_angin = decodeWindDir(c);
  }
}

// ===================================================================
//  PYRANOMETER MODBUS RS485
// ===================================================================
uint16_t modbusCRC(const uint8_t *buf, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; i++) {
    crc ^= (uint16_t)buf[i];
    for (int b = 0; b < 8; b++)
      crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1;
  }
  return crc;
}

bool readPyrOnce(uint8_t sid, uint8_t fc, uint16_t reg,
                 uint16_t cnt, uint16_t &val) {
  uint8_t req[8] = { sid, fc,
                     (uint8_t)(reg >> 8), (uint8_t)(reg & 0xFF),
                     (uint8_t)(cnt >> 8), (uint8_t)(cnt & 0xFF), 0, 0 };
  uint16_t crc = modbusCRC(req, 6);
  req[6] = crc & 0xFF; req[7] = crc >> 8;

  while (RS485Serial.available()) RS485Serial.read();
  digitalWrite(PYRO_DE_RE_PIN, HIGH); delay(2);
  RS485Serial.write(req, 8); RS485Serial.flush();
  digitalWrite(PYRO_DE_RE_PIN, LOW);

  uint8_t resp[16] = {0};
  unsigned long t0 = millis();
  size_t idx = 0;
  while (millis() - t0 < 1000 && idx < 7)
    if (RS485Serial.available()) resp[idx++] = RS485Serial.read();

  if (idx < 7 || resp[0] != sid || resp[1] != fc || resp[2] != 0x02) return false;
  if ((((uint16_t)resp[6] << 8) | resp[5]) != modbusCRC(resp, 5)) return false;
  val = ((uint16_t)resp[3] << 8) | resp[4];
  return true;
}

bool readPyranometer(uint16_t &val) {
  if (readPyrOnce(PYRO_SLAVE_ID, 0x03, PYRO_START_REG, PYRO_REG_COUNT, val)) return true;
  if (readPyrOnce(PYRO_SLAVE_ID, 0x04, PYRO_START_REG, PYRO_REG_COUNT, val)) return true;
  return false;
}

// ===================================================================
//  SD CARD — BACA / TULIS
// ===================================================================
void appendToSD(const char *filename, const String &data) {
  File f = SD.open(filename, FILE_APPEND);
  if (f) { f.println(data); f.close(); }
  else Serial.println(String("[ERROR] Gagal tulis SD: ") + filename);
}

uint32_t readQueuePointer() {
  File f = SD.open(FILE_QPTR, FILE_READ);
  if (!f) return 0;
  String s = f.readStringUntil('\n');
  f.close();
  return (uint32_t)s.toInt();
}

void writeQueuePointer(uint32_t pos) {
  SD.remove(FILE_QPTR);
  File f = SD.open(FILE_QPTR, FILE_WRITE);
  if (f) { f.println(pos); f.close(); }
}

// ===================================================================
//  JARINGAN — GPRS / LTE
// ===================================================================
bool ensureGPRS() {
  if (!modem.isNetworkConnected()) {
    Serial.println("[LTE] Jaringan terputus, mencoba reconnect...");
    if (!modem.waitForNetwork(60000L, true)) {
      Serial.println("[LTE] Gagal reconnect!"); gprsConnected = false; return false;
    }
  }
  if (!modem.isGprsConnected()) {
    Serial.print("[LTE] Konek APN: "); Serial.println(APN);
    if (!modem.gprsConnect(APN, GPRS_USER, GPRS_PASS)) {
      Serial.println("[LTE] GPRS gagal!"); gprsConnected = false; return false;
    }
    Serial.print("[LTE] IP: "); Serial.println(modem.localIP());
  }
  gprsConnected = true;
  return true;
}

// ===================================================================
//  MQTT — KONEKSI
// ===================================================================
bool mqttConnect() {
  if (!ensureGPRS()) return false;
  Serial.print("[MQTT] Konek ke "); Serial.print(MQTT_SERVER);
  Serial.print(":"); Serial.println(MQTT_PORT);
  String clientId = String("esp32-") + STATION_ID;
  bool ok = (strlen(MQTT_USER) > 0)
            ? mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD)
            : mqtt.connect(clientId.c_str());
  if (ok) Serial.println("[MQTT] Terhubung!");
  else  { Serial.print("[MQTT] Gagal, rc="); Serial.println(mqtt.state()); }
  return ok;
}

// ===================================================================
//  MQTT — KIRIM DATA DARI SD CARD (QUEUE FILE)
//
//  Logika:
//    1. Baca byte-offset dari /qptr.txt (progress pengiriman sebelumnya)
//    2. Buka /queue.json, seek ke offset tersebut
//    3. Kirim tiap baris JSON ke MQTT satu per satu
//    4. Update offset setelah tiap baris berhasil terkirim
//    5. Jika koneksi putus di tengah → simpan progress, lanjut jam berikutnya
//    6. Jika semua baris terkirim → compact (hapus queue, reset pointer)
// ===================================================================
void sendQueuedData() {
  Serial.println("\n[MQTT-SEND] === Mulai pengiriman dari SD Card ===");

  File qFile = SD.open(FILE_QUEUE, FILE_READ);
  if (!qFile) {
    Serial.println("[MQTT-SEND] Tidak ada file antrian (/queue.json)."); return;
  }

  uint32_t fileSize = qFile.size();
  uint32_t startPos = readQueuePointer();

  if (startPos >= fileSize) {
    qFile.close();
    Serial.println("[MQTT-SEND] Semua data sudah terkirim sebelumnya."); return;
  }

  Serial.printf("[MQTT-SEND] File: %u bytes | Progress: %u | Sisa: %u bytes\n",
                fileSize, startPos, fileSize - startPos);
  qFile.seek(startPos);

  if (!mqtt.connected()) {
    if (!mqttConnect()) {
      qFile.close();
      Serial.println("[MQTT-SEND] Gagal konek MQTT. Ditunda ke jam depan."); return;
    }
  }

  int  sentCount   = 0, failCount = 0;
  uint32_t lastGoodPos = startPos;

  while (qFile.available()) {
    mqtt.loop();
    if (!mqtt.connected()) {
      if (!mqttConnect()) { break; }
    }

    String line = qFile.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) { lastGoodPos = qFile.position(); continue; }

    bool ok = mqtt.publish(MQTT_TOPIC.c_str(), line.c_str(), false);
    if (ok) {
      lastGoodPos = qFile.position();
      sentCount++;
      if (sentCount % 10 == 0)
        Serial.printf("[MQTT-SEND] Terkirim %d baris...\n", sentCount);
      delay(MQTT_PUBLISH_DELAY_MS);
    } else {
      failCount++;
      Serial.printf("[MQTT-SEND] Publish gagal (baris %d). Berhenti.\n", sentCount + failCount);
      break;
    }
  }

  qFile.close();
  Serial.printf("[MQTT-SEND] Selesai: %d berhasil, %d gagal.\n", sentCount, failCount);

  if (failCount == 0 && lastGoodPos >= fileSize) {
    SD.remove(FILE_QUEUE); SD.remove(FILE_QPTR);
    Serial.println("[MQTT-SEND] Queue dibersihkan (semua terkirim).");
  } else {
    writeQueuePointer(lastGoodPos);
    Serial.printf("[MQTT-SEND] Progress disimpan di offset %u.\n", lastGoodPos);
  }
  Serial.println("[MQTT-SEND] ==========================================");
}

// ===================================================================
//  SAMPLING SENSOR + SIMPAN KE SD CARD (tiap 1 menit)
// ===================================================================
void doSampleAndLog() {

  // --- GPS dari SIM7600G ---
  float s_lat=0, s_lon=0, s_spd=0, s_alt=0, s_acc=0;
  int   s_vs=0, s_us=0, y=0, mo=0, d=0, h=0, mn=0, sc=0;
  gpsValid = modem.getGPS(&s_lat, &s_lon, &s_spd, &s_alt,
                           &s_vs, &s_us, &s_acc,
                           &y, &mo, &d, &h, &mn, &sc);
  if (gpsValid && s_lat != 0.0f && s_lon != 0.0f) {
    latGPS = s_lat; lonGPS = s_lon;
  }

  // --- Baca sensor ---
  DateTime now      = rtc.now();
  float temperature = bme.readTemperature();
  float humidity    = bme.readHumidity();
  float pressure    = bme.readPressure() / 100.0F;
  float a1_v        = ads.computeVolts(ads.readADC_SingleEnded(1));

  uint32_t pulseDelta = anemoPulseCount - lastPulseCount;
  lastPulseCount      = anemoPulseCount;
  float rpm           = (pulseDelta / ANEMO_PPR) *
                        (60.0f / (SAMPLE_INTERVAL_MS / 1000.0f));
  float windRaw     = rpm * ANEMO_FACTOR;
  float windSpeedMs = applyAnemometerCalibration(windRaw);
  float windDirDeg  = windDirToDegrees(arah_angin);

  pyrOK = readPyranometer(pyrValue);

  String timeISO = getISOTime(now);
  String timeCSV = getCSVTime(now);
  String latStr  = gpsValid ? String(latGPS, 6) : "0.0";
  String lonStr  = gpsValid ? String(lonGPS, 6) : "0.0";

  // --- Serial Monitor ---
  Serial.println("\n====================================");
  Serial.print("[LOG] Waktu        : "); Serial.println(timeCSV);
  Serial.print("[LOG] Stasiun      : "); Serial.println(STATION_ID);
  Serial.print("[LOG] GPS          : ");
  if (gpsValid) { Serial.print(latGPS,6); Serial.print(", "); Serial.println(lonGPS,6); }
  else            Serial.println("Mencari satelit...");
  Serial.print("[LOG] Suhu         : "); Serial.print(temperature,2); Serial.println(" C");
  Serial.print("[LOG] Kelembapan   : "); Serial.print(humidity,2);    Serial.println(" %");
  Serial.print("[LOG] Tekanan      : "); Serial.print(pressure,2);    Serial.println(" hPa");
  Serial.print("[LOG] Tegangan     : "); Serial.print(a1_v,4);        Serial.println(" V");
  Serial.print("[LOG] RPM          : "); Serial.print(rpm,2);         Serial.println(" RPM");
  Serial.print("[LOG] Wind Raw     : "); Serial.print(windRaw,3);     Serial.println(" m/s (pra-kalibrasi)");
  Serial.print("[LOG] Wind Speed   : "); Serial.print(windSpeedMs,3); Serial.println(" m/s (pasca-kalibrasi)");
  Serial.print("[LOG] Arah Angin   : "); Serial.print(arah_angin);
  if (windDirDeg >= 0) { Serial.print(" ("); Serial.print(windDirDeg,0); Serial.print(" deg)"); }
  Serial.println();
  Serial.print("[LOG] Radiasi GHI  : ");
  Serial.println(pyrOK ? String(pyrValue) + " W/m2" : "[GAGAL BACA]");
  Serial.println("====================================");

  // --- Simpan ke /datalog.csv (arsip permanen) ---
  String csvLine =
    timeCSV + "," + latStr + "," + lonStr + "," +
    String(temperature,2) + "," + String(humidity,2) + "," +
    String(pressure,2) + "," + String(a1_v,4) + "," +
    String(pulseDelta) + "," + String(rpm,2) + "," +
    String(windRaw,3) + "," + String(windSpeedMs,3) + "," +
    arah_angin + "," +
    (windDirDeg >= 0 ? String(windDirDeg,1) : "NaN") + "," +
    (pyrOK ? String(pyrValue) : "NaN");
  appendToSD(FILE_CSV, csvLine);

  // --- Simpan ke /queue.json (antrian MQTT) ---
  // Format sesuai backend RE-Valid (app/mqtt/client.py):
  //   field: wind_speed, wind_dir, ghi, dni, temperature, humidity, pressure, measured_at
  String jsonLine = "{";
  jsonLine += "\"measured_at\":\""  + timeISO + "\",";
  jsonLine += "\"temperature\":"    + String(temperature,2) + ",";
  jsonLine += "\"humidity\":"       + String(humidity,2) + ",";
  jsonLine += "\"pressure\":"       + String(pressure,2) + ",";
  jsonLine += "\"wind_speed\":"     + String(windSpeedMs,3) + ",";
  jsonLine += "\"wind_dir\":"       + (windDirDeg >= 0 ? String(windDirDeg,1) : "null") + ",";
  jsonLine += "\"ghi\":"            + (pyrOK ? String(pyrValue) : "null") + ",";
  jsonLine += "\"dni\":null";
  jsonLine += "}";
  appendToSD(FILE_QUEUE, jsonLine);

  Serial.println("[LOG] Data tersimpan ke SD Card.");
}

// ===================================================================
//  SETUP
// ===================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== Inisialisasi Sistem IoT RE-Valid ===");

  MQTT_TOPIC = "stations/" + String(STATION_ID) + "/data";
  Serial.println("[INFO] Stasiun    : " + String(STATION_ID));
  Serial.println("[INFO] MQTT Topic : " + MQTT_TOPIC);
  Serial.printf( "[INFO] Sampling   : tiap %lu detik\n", SAMPLE_INTERVAL_MS / 1000);
  Serial.printf( "[INFO] Kirim MQTT : tiap %lu menit\n", SEND_INTERVAL_MS / 60000);

  Wire.begin(SDA_PIN, SCL_PIN);

  // --- Modem ---
  SerialAT.begin(115200, SERIAL_8N1, MODEM_RX, MODEM_TX);
  pinMode(MODEM_PWRKEY, OUTPUT);
  digitalWrite(MODEM_PWRKEY, LOW);  delay(100);
  digitalWrite(MODEM_PWRKEY, HIGH); delay(1000);
  digitalWrite(MODEM_PWRKEY, LOW);
  pinMode(MODEM_FLIGHT, OUTPUT);
  digitalWrite(MODEM_FLIGHT, HIGH);

  Serial.println("[INFO] Menunggu Modem...");
  int retry = 0;
  while (!modem.testAT(1000)) {
    Serial.print(".");
    if (++retry > 30) {
      digitalWrite(MODEM_PWRKEY, LOW);  delay(100);
      digitalWrite(MODEM_PWRKEY, HIGH); delay(1000);
      digitalWrite(MODEM_PWRKEY, LOW);  retry = 0;
    }
  }
  Serial.println("\n[OK] Modem siap!");
  modem.setNetworkMode(2); // 2 = Auto (GSM+LTE)

  // --- GPRS ---
  Serial.println("[INFO] Konek GPRS/LTE...");
  if (modem.waitForNetwork(60000L)) {
    if (modem.gprsConnect(APN, GPRS_USER, GPRS_PASS)) {
      Serial.print("[OK] GPRS. IP: "); Serial.println(modem.localIP());
      gprsConnected = true;
    } else {
      Serial.println("[WARNING] GPRS gagal, akan retry saat jam kirim.");
    }
  } else {
    Serial.println("[WARNING] Jaringan tidak ditemukan.");
  }

  // --- MQTT ---
  mqtt.setBufferSize(512); // perbesar buffer dari default 256 byte
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setKeepAlive(60);
  // Tidak langsung konek — hanya konek saat jam kirim untuk hemat resource

  // --- GPS ---
  Serial.println("[INFO] Aktifkan GPS...");
  modem.sendAT("+CGNSSMODE=15,1");
  modem.waitResponse(5000);
  if (!modem.enableGPS()) {
    modem.disableGPS(); delay(1000); modem.enableGPS();
  }
  Serial.println("[OK] GPS aktif.");

  // --- Sensor ---
  pinMode(ANEMO_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(ANEMO_PIN), anemoISR, RISING);
  WindSerial.begin(9600, SERIAL_8N1, WIND_RX_PIN, WIND_TX_PIN);
  RS485Serial.begin(PYRO_BAUDRATE);
  pinMode(PYRO_DE_RE_PIN, OUTPUT);
  digitalWrite(PYRO_DE_RE_PIN, LOW);

  // --- MicroSD ---
  SPI.begin(SD_SCLK, SD_MISO, SD_MOSI, SD_CS);
  if (SD.begin(SD_CS)) {
    Serial.println("[OK] MicroSD siap.");
    // Buat header CSV jika file belum ada
    if (!SD.exists(FILE_CSV)) {
      File f = SD.open(FILE_CSV, FILE_WRITE);
      if (f) {
        f.println("Waktu,Lat,Lon,Suhu(C),Lembap(%),Tekanan(hPa),Tegangan(V),"
                  "Pulse,RPM,WindRaw(m/s),WindSpeed(m/s),Arah_Angin,WindDir(deg),Radiasi_GHI(W/m2)");
        f.close();
      }
    }
    Serial.printf("[INFO] Queue pointer: %u bytes.\n", readQueuePointer());
  } else {
    Serial.println("[ERROR] MicroSD gagal!");
  }

  // --- Sensor lain ---
  if (!bme.begin(BME280_ADDR)) Serial.println("[ERROR] BME280 gagal!");
  if (!rtc.begin())            Serial.println("[ERROR] RTC gagal!");
  if (rtc.lostPower())         rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  if (ads.begin(ADS1115_ADDR, &Wire)) ads.setGain(GAIN_ONE);

  lastSampleMs = millis();
  lastSendMs   = millis();

  Serial.println("\n=== Sistem Siap ===");
  Serial.println("[INFO] Sampling tiap 1 menit. Kirim MQTT tiap 1 jam.");
}

// ===================================================================
//  MAIN LOOP
// ===================================================================
void loop() {
  // Keepalive MQTT (jika sedang terhubung)
  if (mqtt.connected()) mqtt.loop();

  // Baca arah angin secara kontinyu (UART non-blocking)
  readWindDirectionSerial();

  unsigned long nowMs = millis();

  // --- Tiap 1 menit: baca sensor → simpan ke SD Card ---
  if (nowMs - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = nowMs;
    doSampleAndLog();
  }

  // --- Tiap 1 jam: kirim antrian dari SD Card via MQTT ---
  if (nowMs - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = nowMs;
    sendQueuedData();
  }

  delay(10);
}
