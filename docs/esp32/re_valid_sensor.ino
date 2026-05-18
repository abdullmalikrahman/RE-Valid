/**
 * RE-Valid Sensor Node — ESP32 + SIM7600G
 * =========================================
 * Mengirim data meteorologi ke RE-Valid backend via MQTT over GPRS/LTE.
 *
 * Library yang diperlukan (install via Arduino Library Manager):
 *   - TinyGSM          by Volodymyr Shymanskyy
 *   - PubSubClient     by Nick O'Leary
 *   - Adafruit BME280  by Adafruit
 *   - Adafruit ADS1X15 by Adafruit
 *   - Adafruit Unified Sensor by Adafruit
 *   - RTClib            by Adafruit
 *
 * Konfigurasi yang WAJIB diisi sebelum upload:
 *   1. STATION_ID  — ID stasiun sesuai yang didaftarkan di halaman /admin
 *   2. APN         — APN provider kartu SIM yang dipakai
 *   3. MQTT_SERVER — IP server atau domain (jika sudah deploy)
 *   4. ANEMO_MS_PER_RPM — kalibrasi anemometer (lihat komentar di bawah)
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

// ===================== MODEM SIM7600G (TINY GSM) =====================
#define TINY_GSM_MODEM_SIM7600
#include <TinyGsmClient.h>
#include <PubSubClient.h>

#define MODEM_TX      27
#define MODEM_RX      26
#define MODEM_PWRKEY  4
#define MODEM_FLIGHT  25

HardwareSerial SerialAT(1);
TinyGsm        modem(SerialAT);
TinyGsmClient  gsmClient(modem);
PubSubClient   mqttClient(gsmClient);

// ===================== KONFIGURASI — WAJIB DISESUAIKAN =====================
// Semua nilai sensitif (IP, password, APN) dipisah ke secrets.h
// Salin secrets.h.example → secrets.h lalu isi nilainya sebelum upload ke ESP32
#include "secrets.h"

#define MQTT_CLIENT_ID "esp32-" STATION_ID

// Topik MQTT — jangan diubah, sudah sesuai format backend
#define MQTT_TOPIC "stations/" STATION_ID "/data"

// Kalibrasi anemometer: konversi RPM → m/s
// Cek datasheet anemometer Anda. Contoh umum:
//   Cup anemometer generic (lengan 7.5cm): RPM × 0.00785
//   Jika tidak ada datasheet, gunakan 0.10 sebagai estimasi awal
//   lalu kalibrasi manual vs anemometer referensi.
#define ANEMO_MS_PER_RPM 0.10f   // <-- SESUAIKAN dengan spesifikasi anemometer

// Interval pengiriman data ke MQTT (milidetik)
// Terlalu sering = boros data seluler. Rekomendasi: 60000 (1 menit) atau 300000 (5 menit)
const unsigned long MQTT_PUBLISH_INTERVAL_MS = 60000UL;

// Interval sampling lokal (pembacaan sensor) — tidak perlu diubah
const unsigned long SAMPLE_INTERVAL_MS = 5000UL;

// ===================== I2C =====================
#define SDA_PIN 21
#define SCL_PIN 22
#define BME280_ADDR 0x76
#define ADS1115_ADDR 0x48

// ===================== MICROSD SPI =====================
#define SD_MOSI 15
#define SD_SCLK 14
#define SD_CS   13
#define SD_MISO 2

// ===================== ANEMOMETER =====================
#define ANEMO_PIN 34
#define ANEMO_PPR 1.0f

// ===================== WIND DIRECTION UART =====================
#define WIND_RX_PIN 33
#define WIND_TX_PIN 32

// ===================== PYRANOMETER RS485 =====================
#define PYRO_RX_PIN    19
#define PYRO_TX_PIN    23
#define PYRO_DE_RE_PIN 5
#define PYRO_SLAVE_ID  0x01
#define PYRO_START_REG 0x0000
#define PYRO_REG_COUNT 1
#define PYRO_BAUDRATE  4800

Adafruit_BME280 bme;
RTC_DS3231      rtc;
Adafruit_ADS1X15 ads;

HardwareSerial WindSerial(2);
SoftwareSerial RS485Serial(PYRO_RX_PIN, PYRO_TX_PIN);

volatile uint32_t anemoPulseCount = 0;
uint32_t          lastPulseCount  = 0;

unsigned long lastSampleMs  = 0;
unsigned long lastPublishMs = 0;

// Akumulator untuk rata-rata selama interval publish
float   sumWindSpeed   = 0;
float   sumWindDirX    = 0;   // komponen X untuk rata-rata sudut
float   sumWindDirY    = 0;   // komponen Y untuk rata-rata sudut
float   sumGhi         = 0;
float   sumTemperature = 0;
float   sumHumidity    = 0;
float   sumPressure    = 0;
int     sampleCount    = 0;
int     windDirLastDeg = -1;  // derajat arah angin terakhir (-1 = unknown)

String arah_angin = "unknown";
bool   pyrOK      = false;
uint16_t pyrValue = 0;

// ===================== INTERRUPT =====================
void IRAM_ATTR anemoISR() {
  anemoPulseCount++;
}

// ===================== UTILITIES =====================
String getFormattedTime(const DateTime &dt) {
  char buffer[20];
  snprintf(buffer, sizeof(buffer), "%04d-%02d-%02dT%02d:%02d:%02d",
           dt.year(), dt.month(), dt.day(), dt.hour(), dt.minute(), dt.second());
  return String(buffer);
}

/**
 * Konversi arah angin dari teks ke derajat (0–360).
 * Backend menyimpan wind_dir sebagai FLOAT derajat, bukan string.
 */
int windDirToDegrees(const String &arah) {
  if (arah == "utara")      return 0;
  if (arah == "timur laut") return 45;
  if (arah == "timur")      return 90;
  if (arah == "tenggara")   return 135;
  if (arah == "selatan")    return 180;
  if (arah == "barat daya") return 225;
  if (arah == "barat")      return 270;
  if (arah == "barat laut") return 315;
  return -1; // unknown
}

// ===================== ARAH ANGIN =====================
String decodeWindDirection(char c) {
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

void readWindDirectionSerial() {
  while (WindSerial.available()) {
    char c = (char)WindSerial.read();
    if (c >= '1' && c <= '8') {
      arah_angin    = decodeWindDirection(c);
      windDirLastDeg = windDirToDegrees(arah_angin);
    }
  }
}

// ===================== PYRANOMETER =====================
uint16_t modbusCRC(const uint8_t *buf, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t pos = 0; pos < len; pos++) {
    crc ^= (uint16_t)buf[pos];
    for (int i = 0; i < 8; i++) {
      if (crc & 0x0001) crc = (crc >> 1) ^ 0xA001;
      else              crc >>= 1;
    }
  }
  return crc;
}

bool readPyranometerOnce(uint8_t slaveId, uint8_t functionCode, uint16_t startReg,
                         uint16_t regCount, uint16_t &outValue) {
  uint8_t req[8] = {slaveId, functionCode,
                    (uint8_t)(startReg >> 8), (uint8_t)(startReg & 0xFF),
                    (uint8_t)(regCount >> 8),  (uint8_t)(regCount & 0xFF), 0, 0};
  uint16_t crc = modbusCRC(req, 6);
  req[6] = crc & 0xFF;
  req[7] = (crc >> 8) & 0xFF;

  while (RS485Serial.available()) RS485Serial.read();

  digitalWrite(PYRO_DE_RE_PIN, HIGH);
  delay(2);
  RS485Serial.write(req, sizeof(req));
  RS485Serial.flush();
  digitalWrite(PYRO_DE_RE_PIN, LOW);

  uint8_t resp[16] = {0};
  unsigned long t0 = millis();
  size_t idx = 0;
  while ((millis() - t0) < 1000 && idx < 7) {
    if (RS485Serial.available()) resp[idx++] = (uint8_t)RS485Serial.read();
  }

  if (idx < 7 || resp[0] != slaveId || resp[1] != functionCode || resp[2] != 0x02)
    return false;
  if ((((uint16_t)resp[6] << 8) | resp[5]) != modbusCRC(resp, 5))
    return false;

  outValue = ((uint16_t)resp[3] << 8) | resp[4];
  return true;
}

bool readPyranometer(uint16_t &outValue) {
  if (readPyranometerOnce(PYRO_SLAVE_ID, 0x03, PYRO_START_REG, PYRO_REG_COUNT, outValue)) return true;
  if (readPyranometerOnce(PYRO_SLAVE_ID, 0x04, PYRO_START_REG, PYRO_REG_COUNT, outValue)) return true;
  return false;
}

// ===================== SD CARD LOGGING =====================
void logToSDCard(String filename, String dataString) {
  File file = SD.open(filename, FILE_APPEND);
  if (file) {
    file.println(dataString);
    file.close();
  } else {
    Serial.println("[ERROR] Gagal menulis ke SD Card: " + filename);
  }
}

// ===================== MQTT — KONEKSI & PUBLISH =====================
bool connectGPRS() {
  Serial.print("[INFO] Menghubungkan ke GPRS (APN: "); Serial.print(APN); Serial.print(")...");
  if (!modem.gprsConnect(APN, GPRS_USER, GPRS_PASS)) {
    Serial.println(" GAGAL");
    return false;
  }
  Serial.println(" OK");
  return true;
}

bool connectMQTT() {
  Serial.print("[INFO] Menghubungkan ke MQTT broker " MQTT_SERVER "...");
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setKeepAlive(60);

  if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASSWORD)) {
    Serial.println(" OK");
    return true;
  }
  Serial.print(" GAGAL (state="); Serial.print(mqttClient.state()); Serial.println(")");
  return false;
}

/**
 * Bangun payload JSON sesuai format yang diharapkan backend RE-Valid.
 *
 * Field yang diharapkan backend (mqtt/client.py _NUMERIC_FIELDS):
 *   wind_speed  : m/s   (BUKAN rpm)
 *   wind_dir    : derajat 0–360 (BUKAN string teks)
 *   ghi         : W/m²
 *   dni         : W/m²  (opsional — tidak ada sensor DNI, dihilangkan)
 *   temperature : °C
 *   humidity    : %
 *   pressure    : hPa
 *   measured_at : ISO 8601 string (opsional, server pakai NOW() jika tidak ada)
 */
String buildMqttPayload(const DateTime &dt, float windSpeedMs, int windDirDeg,
                        float ghiWm2, float tempC, float humPct, float preHpa) {
  String payload = "{";
  payload += "\"measured_at\":\"" + getFormattedTime(dt) + "\",";
  payload += "\"wind_speed\":"    + String(windSpeedMs, 2) + ",";

  if (windDirDeg >= 0) {
    payload += "\"wind_dir\":"    + String(windDirDeg) + ",";
  }

  if (ghiWm2 >= 0) {
    payload += "\"ghi\":"         + String(ghiWm2, 1) + ",";
  }

  payload += "\"temperature\":"  + String(tempC, 2) + ",";
  payload += "\"humidity\":"      + String(humPct, 2) + ",";
  payload += "\"pressure\":"      + String(preHpa, 2);
  payload += "}";
  return payload;
}

void publishToMQTT(const DateTime &dt, float windSpeedMs, int windDirDeg,
                   float ghiWm2, float tempC, float humPct, float preHpa) {
  // Pastikan GPRS masih terhubung
  if (!modem.isGprsConnected()) {
    Serial.println("[WARNING] GPRS terputus, mencoba reconnect...");
    if (!connectGPRS()) return;
  }

  // Pastikan MQTT masih terhubung
  if (!mqttClient.connected()) {
    Serial.println("[WARNING] MQTT terputus, mencoba reconnect...");
    if (!connectMQTT()) return;
  }

  mqttClient.loop();

  String payload = buildMqttPayload(dt, windSpeedMs, windDirDeg, ghiWm2, tempC, humPct, preHpa);
  bool ok = mqttClient.publish(MQTT_TOPIC, payload.c_str());

  Serial.print("[MQTT] Publish ke " MQTT_TOPIC ": ");
  Serial.println(ok ? "OK" : "GAGAL");
  if (ok) {
    Serial.println("[MQTT] Payload: " + payload);
  }
}

// ===================== SETUP =====================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== Inisialisasi Sistem IoT RE-Valid ===");
  Serial.println("[INFO] Stasiun: " STATION_ID);
  Serial.println("[INFO] Topik MQTT: " MQTT_TOPIC);

  Wire.begin(SDA_PIN, SCL_PIN);

  // ---------------- SETUP MODEM ----------------
  SerialAT.begin(115200, SERIAL_8N1, MODEM_RX, MODEM_TX);

  pinMode(MODEM_PWRKEY, OUTPUT);
  digitalWrite(MODEM_PWRKEY, LOW); delay(100);
  digitalWrite(MODEM_PWRKEY, HIGH); delay(1000);
  digitalWrite(MODEM_PWRKEY, LOW);

  pinMode(MODEM_FLIGHT, OUTPUT);
  digitalWrite(MODEM_FLIGHT, HIGH);

  Serial.println("[INFO] Menunggu Modem Ready...");
  int retry = 0;
  while (!modem.testAT(1000)) {
    Serial.print(".");
    if (retry++ > 30) {
      digitalWrite(MODEM_PWRKEY, LOW); delay(100);
      digitalWrite(MODEM_PWRKEY, HIGH); delay(1000);
      digitalWrite(MODEM_PWRKEY, LOW);
      retry = 0;
    }
  }
  Serial.println("\n[OK] Modem siap!");

  // Koneksi GPRS
  connectGPRS();

  // Koneksi MQTT
  connectMQTT();

  // ---------------- SETUP SENSOR ----------------
  pinMode(ANEMO_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(ANEMO_PIN), anemoISR, RISING);

  WindSerial.begin(9600, SERIAL_8N1, WIND_RX_PIN, WIND_TX_PIN);
  RS485Serial.begin(PYRO_BAUDRATE);

  pinMode(PYRO_DE_RE_PIN, OUTPUT);
  digitalWrite(PYRO_DE_RE_PIN, LOW);

  // ---------------- SETUP MICROSD ----------------
  SPI.begin(SD_SCLK, SD_MISO, SD_MOSI, SD_CS);
  if (SD.begin(SD_CS)) {
    Serial.println("[OK] MicroSD Terbaca.");
    File fileCSV = SD.open("/datalog.csv", FILE_READ);
    if (!fileCSV) {
      fileCSV = SD.open("/datalog.csv", FILE_WRITE);
      if (fileCSV) {
        fileCSV.println("Waktu,Suhu(C),Lembap(%),Tekanan(hPa),KecepatanAngin(m/s),ArahAngin(deg),Radiasi(W/m2)");
        fileCSV.close();
      }
    } else {
      fileCSV.close();
    }
  }

  if (!bme.begin(BME280_ADDR)) Serial.println("[ERROR] BME280 gagal!");
  if (!rtc.begin())             Serial.println("[ERROR] DS3231 RTC gagal!");
  if (rtc.lostPower())          rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  if (ads.begin(ADS1115_ADDR, &Wire)) ads.setGain(GAIN_ONE);

  Serial.println("=== Sistem Siap ===\n");
  lastSampleMs  = millis();
  lastPublishMs = millis();
}

// ===================== MAIN LOOP =====================
void loop() {
  readWindDirectionSerial();
  mqttClient.loop(); // jaga koneksi MQTT tetap hidup

  if (millis() - lastSampleMs < SAMPLE_INTERVAL_MS) {
    delay(10);
    return;
  }
  lastSampleMs = millis();

  // ---------------- AMBIL DATA SENSOR ----------------
  DateTime now          = rtc.now();
  float temperature     = bme.readTemperature();
  float humidity        = bme.readHumidity();
  float pressure        = bme.readPressure() / 100.0F;
  float a1_v            = ads.computeVolts(ads.readADC_SingleEnded(1));

  uint32_t pulseDelta   = anemoPulseCount - lastPulseCount;
  lastPulseCount        = anemoPulseCount;
  float rpm             = (pulseDelta / ANEMO_PPR) * (60.0f / (SAMPLE_INTERVAL_MS / 1000.0f));

  // Konversi RPM → m/s menggunakan faktor kalibrasi
  float windSpeedMs     = rpm * ANEMO_MS_PER_RPM;

  pyrOK = readPyranometer(pyrValue);
  float ghiWm2          = pyrOK ? (float)pyrValue : -1.0f;

  int windDirDeg        = windDirLastDeg; // derajat dari pembacaan arah angin terakhir

  // Akumulasi untuk rata-rata di interval publish
  sumWindSpeed   += windSpeedMs;
  sumTemperature += temperature;
  sumHumidity    += humidity;
  sumPressure    += pressure;
  if (pyrOK)   sumGhi += ghiWm2;
  if (windDirDeg >= 0) {
    // Rata-rata sudut menggunakan komponen vektor (menghindari ambiguitas 0/360)
    float rad   = windDirDeg * DEG_TO_RAD;
    sumWindDirX += cos(rad);
    sumWindDirY += sin(rad);
  }
  sampleCount++;

  // ---------------- TAMPILKAN KE SERIAL ----------------
  Serial.println("\n====================================");
  Serial.print("Waktu         : "); Serial.println(getFormattedTime(now));
  Serial.print("Suhu          : "); Serial.print(temperature, 2);  Serial.println(" C");
  Serial.print("Kelembapan    : "); Serial.print(humidity, 2);     Serial.println(" %");
  Serial.print("Tekanan Udara : "); Serial.print(pressure, 2);     Serial.println(" hPa");
  Serial.print("Kec. Angin    : "); Serial.print(windSpeedMs, 2);  Serial.println(" m/s (= " + String(rpm, 1) + " RPM)");
  Serial.print("Arah Angin    : "); Serial.print(arah_angin);
  if (windDirDeg >= 0) { Serial.print(" ("); Serial.print(windDirDeg); Serial.println(" deg)"); }
  else                  { Serial.println(""); }
  Serial.print("Radiasi Surya : "); Serial.println(pyrOK ? String(pyrValue) + " W/m2" : "[GAGAL]");
  Serial.print("Tegangan ADC  : "); Serial.print(a1_v, 4);         Serial.println(" V");
  Serial.println("====================================");

  // ---------------- SIMPAN KE SD CARD ----------------
  String csvRow = getFormattedTime(now) + "," +
                  String(temperature, 2) + "," +
                  String(humidity, 2) + "," +
                  String(pressure, 2) + "," +
                  String(windSpeedMs, 3) + "," +
                  (windDirDeg >= 0 ? String(windDirDeg) : "NaN") + "," +
                  (pyrOK ? String(pyrValue) : "NaN");
  logToSDCard("/datalog.csv", csvRow);

  // ---------------- KIRIM KE MQTT (setiap MQTT_PUBLISH_INTERVAL_MS) ----------------
  if (millis() - lastPublishMs >= MQTT_PUBLISH_INTERVAL_MS && sampleCount > 0) {
    lastPublishMs = millis();

    // Hitung rata-rata
    float avgWindSpeed = sumWindSpeed   / sampleCount;
    float avgTemp      = sumTemperature / sampleCount;
    float avgHum       = sumHumidity    / sampleCount;
    float avgPres      = sumPressure    / sampleCount;
    float avgGhi       = (sumGhi > 0) ? (sumGhi / sampleCount) : -1.0f;

    // Rata-rata arah angin via komponen vektor
    int avgWindDir = -1;
    if (sumWindDirX != 0.0f || sumWindDirY != 0.0f) {
      float avgRad = atan2(sumWindDirY, sumWindDirX);
      avgWindDir   = (int)(avgRad * RAD_TO_DEG);
      if (avgWindDir < 0) avgWindDir += 360;
    }

    publishToMQTT(now, avgWindSpeed, avgWindDir, avgGhi, avgTemp, avgHum, avgPres);

    // Reset akumulator
    sumWindSpeed = sumWindDirX = sumWindDirY = 0;
    sumGhi = sumTemperature = sumHumidity = sumPressure = 0;
    sampleCount = 0;
  }
}
