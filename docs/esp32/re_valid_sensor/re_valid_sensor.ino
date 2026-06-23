/*
 * ============================================================
 *  IoT Monitoring Station — LilyGo T-SIM7600G-H
 *  Sensor : BME280, DS3231, ADS1115, Anemometer, Wind Dir,
 *           Pyranometer RS485 (Sentec SEM228A)
 *  Logger : MicroSD — tiap 1 MENIT
 *  Kirim  : LTE/GPRS → MQTT → RE-Valid — tiap 1 JAM
 *           (membaca data dari SD Card, bukan live sensor)
 * ============================================================
 *  FIRMWARE v3.0 — FINAL VERSION + BUGFIX v2
 *  Gabungan terbaik firmware1 + firmware2
 * ============================================================
 *  PERBAIKAN (dari firmware3_final.ino):
 *
 *  [BUG #1 — ROOT CAUSE stuck setelah "Sistem Siap"]
 *    readADSAvg() tidak mengecek apakah ADS1115 berhasil diinit.
 *    Akibat: 8x I2C transaction ke alamat 0x48 yang tidak ada
 *    → ESP32 I2C bus hang → doSampleAndLog() macet permanen.
 *    FIX: tambah flag `adsReady`, skip jika false → return NAN.
 *
 *  [BUG #2 — GPIO error saat boot]
 *    GPIO34 adalah input-only pad di ESP32 (tidak ada internal PU).
 *    FIX: pindah ke GPIO18 yang mendukung INPUT_PULLUP + interrupt.
 *
 *  [BUG #3 — Arah angin selalu "unknown"]
 *    Filter penerimaan data WindSerial hanya menerima ASCII '1'–'8'
 *    (byte 0x31–0x38). Banyak sensor UART mengirim nilai binary
 *    0x01–0x08 — semua dibuang → buffer kosong → selalu "unknown".
 *    FIX: terima KEDUANYA: binary 0x01–0x08 dan ASCII '1'–'8',
 *    normalisasi ke ASCII sebelum disimpan ke circular buffer.
 *    Juga perbaiki urutan stale-check vs buffer-empty check.
 *
 *  [PERUBAHAN — Tegangan (ADS1115) dihapus dari semua output]
 *    Dihapus dari: Serial monitor, CSV header, CSV data, JSON payload.
 *    Kode init ADS1115 tetap ada (untuk jaga-jaga) tapi tidak dipakai.
 * ============================================================
 *  Alur:
 *    [Loop]
 *      Tiap 1 mnt → baca sensor → tulis ke /datalog.csv
 *                                            /datalog.json
 *                                            /queue.json
 *      Tiap 1 jam → buka /queue.json dari posisi terakhir
 *                 → kirim tiap baris ke MQTT satu per satu
 *                 → simpan progress di /qptr.txt
 *                   (jika putus di tengah, lanjut jam berikutnya)
 *                 → jika semua terkirim, compact queue file
 *
 *  File di SD Card:
 *    /datalog.csv  — arsip lengkap format CSV (append only)
 *    /datalog.json — arsip lengkap format JSON (append only)
 *    /queue.json   — antrian kirim ke MQTT
 *    /qptr.txt     — byte-offset terakhir yang sudah terkirim
 * ============================================================
 *  Perbaikan & Peningkatan:
 *
 *  [RTC — dari firmware2, lebih baik]
 *    ① Boot sync dari Network Time (AT+CCLK via TinyGSM)
 *       bukan compile time yang bisa kadaluarsa berbulan-bulan
 *    ② GPS UTC → WIB (+7 jam) sebelum update RTC
 *       firmware1 menyimpan UTC mentah = timestamp salah 7 jam
 *    ③ Threshold koreksi 30 detik (hindari micro-adjustment)
 *
 *  [GPS — dari firmware2, lebih ketat]
 *    ④ Filter kualitas: min 4 satelit + akurasi < 50 meter
 *       firmware1 hanya cek lat/lon != 0 (bisa false fix)
 *    ⑤ Koordinat double precision (7 digit signifikan)
 *       firmware1 pakai float (hanya 6 digit)
 *
 *  [BME280 — dari firmware2, lebih tinggi oversampling]
 *    ⑥ MODE_NORMAL + SAMPLING_X4 suhu & humidity + IIR FILTER_X4
 *       firmware1 pakai SAMPLING_X2 (lebih rendah)
 *    ⑦ Rata-rata 3 pembacaan, delay 50ms antar baca
 *       (firmware1: 15ms — terlalu singkat untuk konversi X4)
 *    ⑧ Validasi range per-sample + isnan() guard gabungan
 *
 *  [ADS1115 — gabungan firmware1 + firmware2]
 *    ⑨ Rata-rata 8 sampel, delay 5ms antar baca (setDataRate 128SPS)
 *    ⑩ Validasi range output (0.1–4.1 V) → NaN jika di luar range
 *
 *  [Anemometer — terbaik dari firmware1]
 *    ⑪ ISR debounce 5ms (cegah false pulse EMI/mechanical bounce)
 *    ⑫ RPM dari elapsed time AKTUAL (bukan konstanta SAMPLE_INTERVAL)
 *       firmware2 pakai konstanta = error jika loop ada variasi waktu
 *    ⑬ Atomic read dengan noInterrupts() guard (ESP32 dual-core safe)
 *
 *  [Wind Direction — dari firmware2, jauh lebih robust]
 *    ⑭ Circular buffer 10 sampel + mode voting
 *       firmware1: langsung ambil nilai terbaru = rentan spike sesaat
 *    ⑮ Timeout 2 menit stale → "unknown"
 *       dikombinasikan dengan mode voting, bukan salah satu saja
 *
 *  [Pyranometer RS485 — gabungan firmware1 + firmware2]
 *    ⑯ Rata-rata 3 pembacaan (dari firmware2) — toleran spike Modbus
 *    ⑰ DE/RE timing 5ms settling + 2ms sebelum switch receive (firmware2)
 *    ⑱ Konversi raw → float W/m² via PYRO_SCALE_FACTOR (dari firmware1)
 *       firmware2 menyimpan raw uint16_t tanpa konversi unit
 *
 *  [SD Card — dari firmware1]
 *    ⑲ Monitoring free space tiap jam, warning jika < 10%
 *    ⑳ Arsip ganda: datalog.csv + datalog.json (tidak pernah dihapus)
 *
 *  [JSON / Memory — gabungan terbaik keduanya]
 *    ㉑ snprintf ke char buffer (dari firmware2) — cegah heap fragmentation
 *       firmware1 pakai String += berulang = risiko crash jangka panjang
 *    ㉒ station_id di payload JSON (dari firmware1) — required backend
 *    ㉓ fmtFloat() helper: "null" untuk JSON, "NaN" untuk CSV
 *    ㉔ appendToSD overload untuk char* (hindari String temporary)
 * ============================================================
 *  Library:
 *    TinyGSM · PubSubClient · Adafruit_BME280
 *    Adafruit_ADS1X15 · RTClib
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
#include <math.h>   // isnan(), isinf()

// ===================== MODEM SIM7600G =====================
#define TINY_GSM_MODEM_SIM7600
#define TINY_GSM_RX_BUFFER 1024
#include <TinyGsmClient.h>
#include <PubSubClient.h>

#define MODEM_TX     27
#define MODEM_RX     26
#define MODEM_PWRKEY  4
#define MODEM_FLIGHT 25

HardwareSerial SerialAT(1);
TinyGsm        modem(SerialAT);
TinyGsmClient  gsmClient(modem);
PubSubClient   mqtt(gsmClient);

// ===================== KONFIGURASI SENSITIF =====================
// Salin docs/esp32/secrets.h.example ke folder sketch ini sebagai secrets.h,
// lalu isi APN, STATION_ID, dan kredensial MQTT di file tersebut.
#include "secrets.h"
String MQTT_TOPIC;

// ===================== INTERVAL WAKTU =====================
const unsigned long SAMPLE_INTERVAL_MS    = 60000UL;    //  1 menit
const unsigned long SEND_INTERVAL_MS      = 3600000UL;  //  1 jam
const unsigned long MQTT_PUBLISH_DELAY_MS = 100UL;      //  jeda antar publish

unsigned long lastSampleMs = 0;
unsigned long lastSendMs   = 0;

// ===================== PIN I2C =====================
#define SDA_PIN      21
#define SCL_PIN      22
#define BME280_ADDR  0x77
#define ADS1115_ADDR 0x48

// ===================== PIN MICROSD (SPI) =====================
#define SD_MOSI 15
#define SD_SCLK 14
#define SD_CS   13
#define SD_MISO  2

// ===================== FILE SD CARD =====================
#define FILE_CSV    "/datalog.csv"    // arsip CSV  (tidak pernah dihapus)
#define FILE_JSON   "/datalog.json"   // arsip JSON (tidak pernah dihapus)
#define FILE_QUEUE  "/queue.json"     // antrian kirim ke MQTT
#define FILE_QPTR   "/qptr.txt"       // byte-offset progress pengiriman

// ===================== ANEMOMETER =====================
// FIX: GPIO34 adalah input-only pad (tidak ada internal pull-up).
// Dipindah ke GPIO18: bidirectional, mendukung INPUT_PULLUP + interrupt,
// bukan strapping pin, tidak dipakai peripheral lain di firmware ini.
// Hubungkan kabel sinyal anemometer ke GPIO18 di header LilyGo T-SIM7600G-H.
#define ANEMO_PIN         18
#define ANEMO_PPR         1.0f
// Firmware mengirim nilai default berbasis RPM.
// Kalibrasi final anemometer dilakukan di backend agar semua lokasi dan
// periode historis bisa memakai aturan koreksi yang sama.
#define ANEMO_DEFAULT_FACTOR 0.00576f
#define ANEMO_DEBOUNCE_US 5000UL      // ⑪ 5ms debounce ISR

// ===================== WIND DIRECTION UART =====================
#define WIND_RX_PIN         33
#define WIND_TX_PIN         32
#define WIND_DIR_BUF_SIZE   10        // ⑭ ukuran circular buffer mode voting
#define WIND_DIR_TIMEOUT_MS 120000UL  // ⑮ 2 menit tanpa data → "unknown"

// ===================== PYRANOMETER RS485 =====================
#define PYRO_RX_PIN       19
#define PYRO_TX_PIN       23
#define PYRO_DE_RE_PIN     5
#define PYRO_SLAVE_ID     0x01
#define PYRO_START_REG    0x0000
#define PYRO_REG_COUNT    1
#define PYRO_BAUDRATE     4800
// ⑱ Scale factor: nilai register = irradiance × 10 → W/m² = raw / 1.0
// Verifikasi dengan datasheet fisik sensor sebelum deploy!
#define PYRO_SCALE_FACTOR 1.0f
#define PYRO_AVG_SAMPLES  3           // ⑯ rata-rata 3 pembacaan

// ===================== BME280 =====================
#define BME_AVG_SAMPLES 3             // ⑦ rata-rata 3 pembacaan per siklus
#define BME_READ_DELAY  50            // ⑦ ms antar baca (cukup untuk konversi X4)

// ===================== ADS1115 =====================
#define ADS_AVG_SAMPLES  8            // ⑨ rata-rata 8 sampel
#define ADS_READ_DELAY   5            // ⑨ ms antar baca

// ===================== GPS FILTER =====================
#define GPS_MIN_SAT      4            // ④ minimum satelit untuk valid fix
#define GPS_MAX_ACC_M    50.0f        // ④ maksimum akurasi horizontal (meter)

// ===================== RTC TIMEZONE =====================
#define WIB_OFFSET_SECONDS 25200L     // ② UTC+7 = 7 × 3600 detik

// ===================== OBJEK SENSOR =====================
Adafruit_BME280  bme;
RTC_DS3231       rtc;
Adafruit_ADS1X15 ads;

HardwareSerial WindSerial(2);
SoftwareSerial RS485Serial(PYRO_RX_PIN, PYRO_TX_PIN);

// ===================== VARIABEL GLOBAL =====================

// --- Anemometer ---
volatile uint32_t anemoPulseCount = 0;
volatile uint32_t lastPulseUs     = 0;   // ⑪ timestamp micros() untuk debounce ISR
uint32_t          lastPulseCount  = 0;
unsigned long     lastAnemoMs     = 0;   // ⑫ tracking elapsed time aktual

// --- Wind Direction — circular buffer + stale detection ---
char     windDirBuf[WIND_DIR_BUF_SIZE]; // ⑭ circular buffer karakter '1'–'8'
uint8_t  windDirWr    = 0;
bool     windDirFull  = false;
unsigned long lastWindDirMs = 0;         // ⑮ timestamp terakhir terima data valid

// --- Pyranometer ---
bool  pyrOK       = false;
float pyrValueWm2 = 0.0f;               // ⑱ nilai sudah dikonversi ke W/m²

// --- GPS — double precision ⑤ ---
double latGPS      = 0.0;
double lonGPS      = 0.0;
bool   gpsValid    = false;
bool   gprsConnected = false;

// --- Status inisialisasi sensor (FIX: cegah I2C hang jika sensor tidak ada) ---
bool adsReady = false;   // FIX #1: flag ADS1115
bool bmeReady = false;   // flag BME280
bool rtcReady = false;   // flag RTC DS3231

// ===================================================================
//  ISR ANEMOMETER — ⑪ Debounce 5ms
// ===================================================================
void IRAM_ATTR anemoISR() {
  uint32_t now = micros();
  if ((now - lastPulseUs) >= ANEMO_DEBOUNCE_US) {
    anemoPulseCount++;
    lastPulseUs = now;
  }
}

// ===================================================================
//  UTILITAS WAKTU
// ===================================================================

// Format ISO 8601 (untuk JSON / MQTT payload)
String getISOTime(const DateTime &dt) {
  char buf[20];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d",
           dt.year(), dt.month(), dt.day(),
           dt.hour(), dt.minute(), dt.second());
  return String(buf);
}

// Format human-readable (untuk CSV)
String getCSVTime(const DateTime &dt) {
  char buf[20];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02d %02d:%02d:%02d",
           dt.year(), dt.month(), dt.day(),
           dt.hour(), dt.minute(), dt.second());
  return String(buf);
}

// ===================================================================
//  ㉓ HELPER — Format float ke string
//     JSON:  NaN/Inf → "null"
//     CSV:   NaN/Inf → "NaN"
// ===================================================================
void fmtFloat(char *dst, size_t sz, float v, int dec) {
  if (isnan(v) || isinf(v)) strncpy(dst, "null", sz);
  else                       snprintf(dst, sz, "%.*f", dec, v);
}

void fmtFloatCSV(char *dst, size_t sz, float v, int dec) {
  if (isnan(v) || isinf(v)) strncpy(dst, "NaN", sz);
  else                       snprintf(dst, sz, "%.*f", dec, v);
}

// ===================================================================
//  RTC — ① SYNC DARI NETWORK TIME (AT+CCLK via TinyGSM)
// ===================================================================
bool syncRTCFromNetwork() {
  Serial.println("[RTC] Mencoba sync dari jaringan seluler (AT+CCLK)...");
  int   year, month, day, hour, minute, second;
  float tz;
  if (!modem.getNetworkTime(&year, &month, &day, &hour, &minute, &second, &tz)) {
    Serial.println("[RTC] Gagal baca network time dari modem.");
    return false;
  }
  if (year < 2024 || year > 2099) {
    Serial.printf("[RTC] Network time tidak valid: tahun=%d\n", year);
    return false;
  }
  // Operator Indonesia (Telkomsel/XL/Indosat) umumnya mengembalikan
  // waktu lokal WIB (UTC+7) via AT+CCLK — langsung pakai tanpa konversi.
  DateTime netTime(year, month, day, hour, minute, second);
  rtc.adjust(netTime);
  Serial.printf("[RTC] ① Sync jaringan OK: %04d-%02d-%02d %02d:%02d:%02d WIB\n",
                year, month, day, hour, minute, second);
  return true;
}

// ===================================================================
//  RTC — ② SYNC DARI GPS (UTC → WIB), ③ Threshold 30 Detik
// ===================================================================
bool syncRTCFromGPS(int y, int mo, int d, int h, int mn, int sc) {
  // Sanity check nilai GPS
  if (y  < 2024 || y  > 2099) return false;
  if (mo < 1    || mo > 12)   return false;
  if (d  < 1    || d  > 31)   return false;

  // ② Konversi GPS UTC → WIB (UTC+7)
  DateTime gpsUTC(y, mo, d, h, mn, sc);
  DateTime wib(gpsUTC.unixtime() + WIB_OFFSET_SECONDS);

  // ③ Hanya koreksi jika selisih > 30 detik
  DateTime rtcNow = rtc.now();
  long diff = abs((long)wib.unixtime() - (long)rtcNow.unixtime());
  if (diff <= 30) return false;

  rtc.adjust(wib);
  Serial.printf("[RTC] ② Sync GPS OK: selisih %ld dtk → %04d-%02d-%02d %02d:%02d:%02d WIB\n",
                diff, wib.year(), wib.month(), wib.day(),
                wib.hour(), wib.minute(), wib.second());
  return true;
}

// ===================================================================
//  KONVERSI SENSOR
// ===================================================================
float windDirToDegrees(const String &dir) {
  if (dir == "utara")      return   0.0f;
  if (dir == "timur laut") return  45.0f;
  if (dir == "timur")      return  90.0f;
  if (dir == "tenggara")   return 135.0f;
  if (dir == "selatan")    return 180.0f;
  if (dir == "barat daya") return 225.0f;
  if (dir == "barat")      return 270.0f;
  if (dir == "barat laut") return 315.0f;
  return -1.0f; // unknown → "null" di JSON
}

float rpmToWindSpeed(float rpm) {
  if (rpm <= 0.0f) return 0.0f;
  float windSpeedMs = rpm * ANEMO_DEFAULT_FACTOR;
  return (windSpeedMs > 0.0f) ? windSpeedMs : 0.0f;
}

// ===================================================================
//  ⑭⑮ WIND DIRECTION — Circular Buffer + Mode Voting + Stale Detection
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

// ⑭ Baca UART non-blocking, simpan ke circular buffer
// FIX WIND DIR: Banyak sensor UART mengirim nilai binary 0x01–0x08,
// bukan ASCII '1'–'8' (0x31–0x38). Kode lama hanya menerima ASCII
// sehingga buffer selalu kosong → selalu "unknown".
// Sekarang diterima KEDUANYA: binary 0x01–0x08 dan ASCII '1'–'8'.
// Semua dinormalisasi ke ASCII '1'–'8' sebelum disimpan ke buffer.
void readWindDirectionSerial() {
  while (WindSerial.available()) {
    uint8_t b = (uint8_t)WindSerial.read();

    // Debug: tampilkan byte mentah sekali per detik pertama ada data
    // (aktifkan sementara jika masih unknown — bantu identifikasi format sensor)
    // Serial.printf("[WIND-RAW] 0x%02X ('%c')\n", b, (b >= 0x20 && b < 0x7F) ? b : '.');

    char normalized = 0;

    // Format 1: Binary 0x01–0x08 (banyak sensor UART China mengirim ini)
    if (b >= 0x01 && b <= 0x08) {
      normalized = '0' + b;  // 0x01 → '1', 0x08 → '8'
    }
    // Format 2: ASCII '1'–'8' (0x31–0x38)
    else if (b >= '1' && b <= '8') {
      normalized = (char)b;
    }
    // Format 3: ASCII karakter arah (N/E/S/W dan kombinasinya)
    else if (b == 'N' || b == 'E' || b == 'S' || b == 'W') {
      // Simpan huruf, akan diproses di getWindDirMode jika format ini
      // — abaikan dulu, butuh buffer string terpisah untuk NESW
      // Saat ini fokus pada format 0x01-0x08 dan '1'-'8'
    }
    // Format lain (0x00, \r, \n, spasi, dll): diabaikan

    if (normalized >= '1' && normalized <= '8') {
      windDirBuf[windDirWr] = normalized;
      windDirWr = (windDirWr + 1) % WIND_DIR_BUF_SIZE;
      if (!windDirFull && windDirWr == 0) windDirFull = true;
      lastWindDirMs = millis();
    }
  }
}

// ⑭ Mode voting: ambil arah paling sering dari buffer
// ⑮ Stale detection: kembalikan "unknown" jika > 2 menit tanpa data
String getWindDirMode() {
  // ⑭ Mode voting dari circular buffer
  int n = windDirFull ? WIND_DIR_BUF_SIZE : (int)windDirWr;

  // FIX: Pisahkan stale dari "belum ada data sama sekali"
  if (n == 0) {
    // Belum pernah ada data masuk (lastWindDirMs masih 0)
    // Ini normal saat sensor baru saja mulai — bukan error
    return "unknown";
  }

  // ⑮ Cek stale: data ada di buffer tapi sensor tidak kirim data baru >2 menit
  if ((millis() - lastWindDirMs) > WIND_DIR_TIMEOUT_MS) {
    Serial.println("[WARN] Data arah angin stale (>2 menit) → dicatat sebagai unknown.");
    return "unknown";
  }

  uint8_t cnt[9] = {0};
  for (int i = 0; i < n; i++) cnt[(uint8_t)(windDirBuf[i] - '0')]++;
  uint8_t best = 1;
  for (int i = 2; i <= 8; i++) if (cnt[i] > cnt[best]) best = i;
  return decodeWindDir('0' + best);
}

// ===================================================================
//  ⑯⑰⑱ PYRANOMETER MODBUS RS485
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

  while (RS485Serial.available()) RS485Serial.read();   // flush Rx
  digitalWrite(PYRO_DE_RE_PIN, HIGH);
  delay(5);                              // ⑰ 5ms settling RS485 driver
  RS485Serial.write(req, 8);
  RS485Serial.flush();
  delay(2);                              // ⑰ 2ms sebelum switch ke receive mode
  digitalWrite(PYRO_DE_RE_PIN, LOW);

  uint8_t resp[16] = {0};
  unsigned long t0 = millis();
  size_t idx = 0;
  while (millis() - t0 < 1000 && idx < 7)
    if (RS485Serial.available()) resp[idx++] = RS485Serial.read();

  if (idx < 7 || resp[0] != sid || resp[1] != fc || resp[2] != 0x02) return false;
  // ⑰ CRC Modbus little-endian: resp[5]=CRC_lo, resp[6]=CRC_hi
  uint16_t respCRC = ((uint16_t)resp[6] << 8) | resp[5];
  if (respCRC != modbusCRC(resp, 5)) return false;
  val = ((uint16_t)resp[3] << 8) | resp[4];
  return true;
}

// ⑯ Rata-rata 3 pembacaan → ⑱ Konversi ke W/m²
bool readPyranometer(float &wm2) {
  uint16_t readings[PYRO_AVG_SAMPLES];
  int ok = 0;
  for (int i = 0; i < PYRO_AVG_SAMPLES; i++) {
    uint16_t v = 0;
    if (readPyrOnce(PYRO_SLAVE_ID, 0x03, PYRO_START_REG, PYRO_REG_COUNT, v) ||
        readPyrOnce(PYRO_SLAVE_ID, 0x04, PYRO_START_REG, PYRO_REG_COUNT, v)) {
      readings[ok++] = v;
    }
    if (i < PYRO_AVG_SAMPLES - 1) delay(30); // jeda antar percobaan
  }
  if (ok == 0) return false;
  uint32_t sum = 0;
  for (int i = 0; i < ok; i++) sum += readings[i];
  wm2 = (float)(sum / ok) / PYRO_SCALE_FACTOR;  // ⑱ raw / 10.0 = W/m²
  return true;
}

// ===================================================================
//  ⑥⑦⑧ BME280 — Rata-rata 3 baca, validasi range, isnan guard
// ===================================================================
void readBME(float &temp, float &hum, float &pres) {
  if (!bmeReady) { temp = NAN; hum = NAN; pres = NAN; return; }  // FIX: guard flag
  float sumT = 0, sumH = 0, sumP = 0;
  int   vT = 0, vH = 0, vP = 0;
  for (int i = 0; i < BME_AVG_SAMPLES; i++) {
    float t = bme.readTemperature();
    float h = bme.readHumidity();
    float p = bme.readPressure() / 100.0F;   // Pa → hPa
    // ⑧ Validasi range per-sample + isnan guard
    if (!isnan(t) && t > -40.0f && t < 85.0f)    { sumT += t; vT++; }
    if (!isnan(h) && h >= 0.0f  && h <= 100.0f)  { sumH += h; vH++; }
    if (!isnan(p) && p > 300.0f && p < 1100.0f)  { sumP += p; vP++; }
    if (i < BME_AVG_SAMPLES - 1) delay(BME_READ_DELAY);  // ⑦ 50ms
  }
  temp = (vT > 0) ? sumT / vT : NAN;
  hum  = (vH > 0) ? sumH / vH : NAN;
  pres = (vP > 0) ? sumP / vP : NAN;
}

// ===================================================================
//  ⑨⑩ ADS1115 — Rata-rata 8 sampel + validasi range
// ===================================================================
float readADSAvg(uint8_t channel) {
  // FIX #1: Jika ADS1115 tidak ditemukan saat init, JANGAN lakukan I2C.
  // Tanpa guard ini, ads.readADC_SingleEnded() akan mencoba 8x I2C ke
  // alamat yang tidak ada → ESP32 I2C bus hang → seluruh loop macet!
  if (!adsReady) return NAN;

  float sum = 0.0f;
  for (int i = 0; i < ADS_AVG_SAMPLES; i++) {
    sum += ads.computeVolts(ads.readADC_SingleEnded(channel));
    delay(ADS_READ_DELAY);
  }
  float v = sum / ADS_AVG_SAMPLES;
  if (v < 0.0f || v > 4.1f) return NAN;  // ⑩ validasi range ADC (0.0 bukan 0.1)
  return v;
}

// ===================================================================
//  SD CARD — ㉔ APPEND (overload String + char* hindari temporary)
// ===================================================================
void appendToSD(const char *filename, const String &data) {
  File f = SD.open(filename, FILE_APPEND);
  if (f) { f.println(data); f.close(); }
  else Serial.println(String("[ERROR] Gagal tulis SD: ") + filename);
}

void appendToSD(const char *filename, const char *data) {
  File f = SD.open(filename, FILE_APPEND);
  if (f) { f.println(data); f.close(); }
  else Serial.println(String("[ERROR] Gagal tulis SD: ") + filename);
}

// ===================================================================
//  SD CARD — QUEUE POINTER
// ===================================================================
uint32_t readQueuePointer() {
  File f = SD.open(FILE_QPTR, FILE_READ);
  if (!f) return 0;
  String s = f.readStringUntil('\n');
  f.close();
  return (uint32_t)s.toInt();
}

void writeQueuePointer(uint32_t pos) {
  SD.remove(FILE_QPTR);  // SD.h tidak support overwrite langsung
  File f = SD.open(FILE_QPTR, FILE_WRITE);
  if (f) { f.println(pos); f.close(); }
}

// ===================================================================
//  ⑲ SD CARD — MONITORING FREE SPACE
// ===================================================================
void checkSDSpace() {
  uint64_t total  = SD.totalBytes();
  uint64_t used   = SD.usedBytes();
  uint64_t freeB  = total - used;
  float pctFree   = (total > 0) ? (100.0f * freeB / total) : 0.0f;
  Serial.printf("[SD] Total: %.1f MB | Used: %.1f MB | Free: %.1f MB (%.1f%%)\n",
                total / 1048576.0, used / 1048576.0,
                freeB / 1048576.0, pctFree);
  if (pctFree < 10.0f)
    Serial.println("[SD] *** WARNING: SD Card hampir penuh (<10%)! ***");
}

// ===================================================================
//  JARINGAN — GPRS / LTE (auto-reconnect)
// ===================================================================
bool ensureGPRS() {
  if (!modem.isNetworkConnected()) {
    Serial.println("[LTE] Jaringan terputus, mencoba reconnect...");
    if (!modem.waitForNetwork(60000L, true)) {
      Serial.println("[LTE] Gagal reconnect jaringan!");
      gprsConnected = false; return false;
    }
  }
  if (!modem.isGprsConnected()) {
    Serial.print("[LTE] Konek APN: "); Serial.println(APN);
    if (!modem.gprsConnect(APN, GPRS_USER, GPRS_PASS)) {
      Serial.println("[LTE] GPRS gagal!");
      gprsConnected = false; return false;
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
  Serial.printf("[MQTT] Konek ke %s:%d ...\n", MQTT_SERVER, MQTT_PORT);
  String clientId = String("esp32-") + STATION_ID;
  bool ok = (strlen(MQTT_USER) > 0)
            ? mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD)
            : mqtt.connect(clientId.c_str());
  if (ok) Serial.println("[MQTT] Terhubung!");
  else    Serial.printf("[MQTT] Gagal, rc=%d\n", mqtt.state());
  return ok;
}

// ===================================================================
//  MQTT — KIRIM DATA DARI SD CARD (QUEUE FILE)
//
//  Logika:
//    1. Baca byte-offset dari /qptr.txt (progress sebelumnya)
//    2. Buka /queue.json, seek ke offset tersebut
//    3. Kirim tiap baris JSON ke MQTT satu per satu
//    4. Setelah tiap baris berhasil, update offset
//    5. Jika koneksi putus → simpan progress, lanjut jam depan
//    6. Jika semua baris terkirim → compact (hapus queue, reset pointer)
// ===================================================================
void sendQueuedData() {
  Serial.println("\n[MQTT-SEND] === Mulai pengiriman dari SD Card ===");
  checkSDSpace();  // ⑲ monitoring storage setiap jam kirim

  File qFile = SD.open(FILE_QUEUE, FILE_READ);
  if (!qFile) {
    Serial.println("[MQTT-SEND] Tidak ada file antrian (/queue.json).");
    return;
  }

  uint32_t fileSize = qFile.size();
  uint32_t startPos = readQueuePointer();

  if (startPos >= fileSize) {
    qFile.close();
    Serial.println("[MQTT-SEND] Semua data sudah terkirim sebelumnya.");
    return;
  }

  Serial.printf("[MQTT-SEND] File: %u B | Terkirim: %u B | Sisa: %u B\n",
                fileSize, startPos, fileSize - startPos);

  qFile.seek(startPos);

  if (!mqtt.connected()) {
    if (!mqttConnect()) {
      qFile.close();
      Serial.println("[MQTT-SEND] Gagal konek MQTT. Kirim ditunda ke jam depan.");
      return;
    }
  }

  int      sentCount  = 0;
  int      failCount  = 0;
  uint32_t lastGoodPos = startPos;

  while (qFile.available()) {
    mqtt.loop();

    if (!mqtt.connected()) {
      Serial.println("[MQTT-SEND] Koneksi MQTT putus di tengah pengiriman!");
      if (!mqttConnect()) {
        Serial.println("[MQTT-SEND] Reconnect gagal. Simpan progress dan berhenti.");
        break;
      }
    }

    String line = qFile.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) {
      lastGoodPos = qFile.position();
      continue;
    }

    bool ok = mqtt.publish(MQTT_TOPIC.c_str(), line.c_str(), false);
    if (ok) {
      lastGoodPos = qFile.position();
      sentCount++;
      if (sentCount % 10 == 0)
        Serial.printf("[MQTT-SEND] Terkirim %d baris...\n", sentCount);
      delay(MQTT_PUBLISH_DELAY_MS);
    } else {
      failCount++;
      Serial.printf("[MQTT-SEND] Publish gagal (baris %d). Berhenti.\n",
                    sentCount + failCount);
      break;
    }
  }

  qFile.close();
  Serial.printf("[MQTT-SEND] Selesai: %d berhasil, %d gagal.\n", sentCount, failCount);

  if (failCount == 0 && lastGoodPos >= fileSize) {
    SD.remove(FILE_QUEUE);
    SD.remove(FILE_QPTR);
    Serial.println("[MQTT-SEND] Queue dibersihkan (semua terkirim).");
  } else {
    writeQueuePointer(lastGoodPos);
    Serial.printf("[MQTT-SEND] Progress disimpan di offset %u.\n", lastGoodPos);
  }
  Serial.println("[MQTT-SEND] ===================================");
}

// ===================================================================
//  SAMPLING SENSOR + SIMPAN KE SD CARD (tiap 1 menit)
// ===================================================================
void doSampleAndLog() {
  Serial.println("[INFO] >> Mulai sampling sensor...");  // FIX: debug awal fungsi

  // ---------------------------------------------------------------
  //  GPS — ④ filter kualitas + ⑤ double precision + ② GPS→RTC sync
  // ---------------------------------------------------------------
  float s_lat=0, s_lon=0, s_spd=0, s_alt=0, s_acc=999.0f;
  int   s_vs=0, s_us=0, y=0, mo=0, d=0, h=0, mn=0, sc=0;
  bool  rawGPS = modem.getGPS(&s_lat, &s_lon, &s_spd, &s_alt,
                               &s_vs, &s_us, &s_acc,
                               &y, &mo, &d, &h, &mn, &sc);

  // ④ Validasi kualitas GPS (firmware2 lebih ketat dari firmware1)
  gpsValid = rawGPS
             && s_vs  >= GPS_MIN_SAT    // min 4 satelit
             && s_acc <= GPS_MAX_ACC_M  // akurasi < 50m
             && s_lat != 0.0f
             && s_lon != 0.0f;

  if (gpsValid) {
    latGPS = (double)s_lat;  // ⑤ cast ke double
    lonGPS = (double)s_lon;
    syncRTCFromGPS(y, mo, d, h, mn, sc);  // ②③ UTC→WIB, threshold 30s
  }

  // ---------------------------------------------------------------
  //  Waktu dari RTC
  // ---------------------------------------------------------------
  DateTime now = rtcReady ? rtc.now() : DateTime(2000, 1, 1, 0, 0, 0);  // FIX: guard rtcReady

  // ---------------------------------------------------------------
  //  BME280 — ⑥⑦⑧ oversampling x4, rata-rata 3 baca, validasi range
  // ---------------------------------------------------------------
  float temperature, humidity, pressure;
  readBME(temperature, humidity, pressure);

  // ---------------------------------------------------------------
  //  ADS1115 — DIHAPUS sesuai permintaan (sensor tidak terpasang)
  // ---------------------------------------------------------------
  // float a1_v = readADSAvg(1);  // ← dihapus

  // ---------------------------------------------------------------
  //  Anemometer — ⑫ elapsed time AKTUAL (bukan konstanta interval)
  // ---------------------------------------------------------------
  unsigned long nowMs          = millis();
  unsigned long actualInterval = nowMs - lastAnemoMs;
  if (actualInterval == 0) actualInterval = SAMPLE_INTERVAL_MS; // fallback safety
  lastAnemoMs = nowMs;

  // ⑬ Atomic read — aman di ESP32 dual-core
  uint32_t pulseDelta;
  noInterrupts();
  pulseDelta     = anemoPulseCount - lastPulseCount;
  lastPulseCount = anemoPulseCount;
  interrupts();

  // ⑫ RPM dari elapsed time aktual (firmware1 lebih akurat dari firmware2)
  float rpm         = (pulseDelta / ANEMO_PPR) * (60000.0f / actualInterval);
  float windSpeedMs = rpmToWindSpeed(rpm);

  // ---------------------------------------------------------------
  //  Wind Direction — ⑭ mode voting + ⑮ stale detection
  // ---------------------------------------------------------------
  String arah_angin = getWindDirMode();
  float  windDirDeg = windDirToDegrees(arah_angin);

  // ---------------------------------------------------------------
  //  Pyranometer — ⑯⑰⑱ rata-rata 3 baca → float W/m²
  // ---------------------------------------------------------------
  pyrOK = readPyranometer(pyrValueWm2);

  // ---------------------------------------------------------------
  //  Format string waktu & koordinat
  // ---------------------------------------------------------------
  String timeISO = getISOTime(now);
  String timeCSV = getCSVTime(now);
  String latStr  = gpsValid ? String(latGPS, 6) : "0.000000";
  String lonStr  = gpsValid ? String(lonGPS, 6) : "0.000000";

  // ---------------------------------------------------------------
  //  Serial Monitor
  // ---------------------------------------------------------------
  Serial.println("\n====================================");
  Serial.print("[LOG] Waktu       : "); Serial.println(timeCSV);
  Serial.print("[LOG] GPS         : ");
  if (gpsValid) {
    Serial.print(latGPS, 6); Serial.print(", "); Serial.print(lonGPS, 6);
    Serial.printf("  (sat=%d, acc=%.1fm)\n", s_vs, s_acc);
  } else Serial.println("Mencari satelit...");
  Serial.print("[LOG] Suhu        : ");
  if (isnan(temperature)) Serial.println("[SENSOR FAULT]");
  else { Serial.print(temperature, 2); Serial.println(" C"); }
  Serial.print("[LOG] Kelembapan  : ");
  if (isnan(humidity)) Serial.println("[SENSOR FAULT]");
  else { Serial.print(humidity, 2); Serial.println(" %"); }
  Serial.print("[LOG] Tekanan     : ");
  if (isnan(pressure)) Serial.println("[SENSOR FAULT]");
  else { Serial.print(pressure, 2); Serial.println(" hPa"); }
  // Tegangan dihapus
  Serial.print("[LOG] Arah Angin  : "); Serial.print(arah_angin);
  if (windDirDeg >= 0) { Serial.print(" ("); Serial.print(windDirDeg, 0); Serial.print(" deg)"); }
  Serial.println();
  Serial.printf("[LOG] RPM         : %.2f RPM (interval aktual: %lu ms)\n", rpm, actualInterval);
  Serial.printf("[LOG] Wind Default: %.3f m/s\n", windSpeedMs);
  Serial.print("[LOG] GHI         : ");
  Serial.println(pyrOK ? String(pyrValueWm2, 1) + " W/m2" : "[GAGAL BACA]");
  Serial.println("====================================");

  // ---------------------------------------------------------------
  //  ㉑㉓ Pre-format nilai float ke string
  //  JSON: null  |  CSV: NaN
  // ---------------------------------------------------------------
  char tempJ[10], humJ[10], presJ[10], wsJ[10];
  char tempC[10], humC[10], presC[10], wsC[10];

  fmtFloat(tempJ, sizeof(tempJ), temperature,  2); 
  fmtFloat(humJ,  sizeof(humJ),  humidity,     2);
  fmtFloat(presJ, sizeof(presJ), pressure,     2);
  fmtFloat(wsJ,   sizeof(wsJ),   windSpeedMs,  3);

  fmtFloatCSV(tempC, sizeof(tempC), temperature,  2);
  fmtFloatCSV(humC,  sizeof(humC),  humidity,     2);
  fmtFloatCSV(presC, sizeof(presC), pressure,     2);
  fmtFloatCSV(wsC,   sizeof(wsC),   windSpeedMs,  3);

  char wdJson[8],  ghiJson[12];
  char wdCsv[8],   ghiCsv[12];
  if (windDirDeg >= 0) {
    snprintf(wdJson, sizeof(wdJson),   "%.1f", windDirDeg);
    snprintf(wdCsv,  sizeof(wdCsv),    "%.1f", windDirDeg);
  } else {
    strncpy(wdJson, "null", sizeof(wdJson));
    strncpy(wdCsv,  "NaN",  sizeof(wdCsv));
  }
  if (pyrOK) {
    snprintf(ghiJson, sizeof(ghiJson), "%.1f", pyrValueWm2);
    snprintf(ghiCsv,  sizeof(ghiCsv),  "%.1f", pyrValueWm2);
  } else {
    strncpy(ghiJson, "null", sizeof(ghiJson));
    strncpy(ghiCsv,  "NaN",  sizeof(ghiCsv));
  }

  // ---------------------------------------------------------------
  //  ⑳ Tulis ke /datalog.csv (arsip permanen, tidak pernah dihapus)
  // ---------------------------------------------------------------
  char csvBuf[300];
  snprintf(csvBuf, sizeof(csvBuf),
    "%s,%.6f,%.6f,%s,%s,%s,%u,%.2f,%s,%s,%s,%s",
    timeCSV.c_str(),
    gpsValid ? latGPS : 0.0, gpsValid ? lonGPS : 0.0,
    tempC, humC, presC,
    (unsigned)pulseDelta, rpm, wsC,
    arah_angin.c_str(), wdCsv, ghiCsv
  );
  appendToSD(FILE_CSV, csvBuf);

  // ---------------------------------------------------------------
  //  ㉑㉒ JSON payload — snprintf + station_id (required backend RE-Valid)
  // ---------------------------------------------------------------
  char jsonBuf[300];
  snprintf(jsonBuf, sizeof(jsonBuf),
    "{"
    "\"station_id\":\"%s\","
    "\"measured_at\":\"%s\","
    "\"temperature\":%s,"
    "\"humidity\":%s,"
    "\"pressure\":%s,"
    "\"wind_speed\":%s,"
    "\"wind_dir\":%s,"
    "\"ghi\":%s,"
    "\"lat\":%.6f,"
    "\"lon\":%.6f"
    "}",
    STATION_ID,
    timeISO.c_str(),
    tempJ, humJ, presJ,
    wsJ, wdJson, ghiJson,
    gpsValid ? latGPS : 0.0,
    gpsValid ? lonGPS : 0.0
  );

  appendToSD(FILE_QUEUE, jsonBuf);  // antrian MQTT
  appendToSD(FILE_JSON,  jsonBuf);  // ⑳ arsip JSON permanen

  Serial.println("[LOG] Data tersimpan ke SD Card (CSV + JSON + Queue).");
}

// ===================================================================
//  FIX: I2C Bus Recovery — reset bus jika stuck (9 clock pulses)
//  Dipanggil saat sensor I2C tidak merespons saat init.
// ===================================================================
void recoverI2CBus() {
  Wire.end();
  delay(10);
  // Toggle SCL 9x untuk membebaskan SDA yang mungkin tertahan slave
  pinMode(SCL_PIN, OUTPUT);
  for (int i = 0; i < 9; i++) {
    digitalWrite(SCL_PIN, HIGH); delayMicroseconds(5);
    digitalWrite(SCL_PIN, LOW);  delayMicroseconds(5);
  }
  // STOP condition
  pinMode(SDA_PIN, OUTPUT);
  digitalWrite(SDA_PIN, LOW);  delayMicroseconds(5);
  digitalWrite(SCL_PIN, HIGH); delayMicroseconds(5);
  digitalWrite(SDA_PIN, HIGH); delayMicroseconds(5);
  delay(10);
  Wire.begin(SDA_PIN, SCL_PIN);
  delay(50);
}

// ===================================================================
//  SETUP
// ===================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== IoT Monitoring Station — Firmware v3.0 (Final) ===");

  MQTT_TOPIC = "stations/" + String(STATION_ID) + "/data";
  Serial.println("[INFO] MQTT Topic : " + MQTT_TOPIC);
  Serial.printf( "[INFO] Station ID : %s\n", STATION_ID);
  Serial.printf( "[INFO] Sampling   : tiap %lu detik\n", SAMPLE_INTERVAL_MS / 1000);
  Serial.printf( "[INFO] Kirim MQTT : tiap %lu menit\n", SEND_INTERVAL_MS / 60000);

  Wire.begin(SDA_PIN, SCL_PIN);

  // --- Modem SIM7600G ---
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
      // Power cycle modem jika tidak merespons
      digitalWrite(MODEM_PWRKEY, LOW);  delay(100);
      digitalWrite(MODEM_PWRKEY, HIGH); delay(1000);
      digitalWrite(MODEM_PWRKEY, LOW);  retry = 0;
    }
  }
  Serial.println("\n[OK] Modem siap!");
  modem.setNetworkMode(2); // 2 = Auto (GSM+LTE)

  // --- GPRS / LTE ---
  Serial.println("[INFO] Konek GPRS/LTE...");
  if (modem.waitForNetwork(60000L)) {
    if (modem.gprsConnect(APN, GPRS_USER, GPRS_PASS)) {
      Serial.print("[OK] GPRS. IP: "); Serial.println(modem.localIP());
      gprsConnected = true;
    } else {
      Serial.println("[WARNING] GPRS gagal. Akan retry saat jam kirim.");
    }
  } else {
    Serial.println("[WARNING] Jaringan tidak ditemukan.");
  }

  // --- MQTT ---
  mqtt.setBufferSize(512);
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setKeepAlive(60);

  // --- GPS ---
  Serial.println("[INFO] Aktifkan GPS (GNSS)...");
  modem.sendAT("+CGNSSMODE=15,1");
  modem.waitResponse(5000);
  if (!modem.enableGPS()) {
    modem.disableGPS(); delay(1000); modem.enableGPS();
  }
  Serial.println("[OK] GPS aktif.");

  // --- Anemometer ---
  // GPIO18: bidirectional, mendukung INPUT_PULLUP internal (tidak perlu resistor eksternal).
  // INPUT_PULLUP menjaga pin tetap HIGH saat tidak ada pulsa — reed switch ke GND.
  pinMode(ANEMO_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ANEMO_PIN), anemoISR, RISING);

  // --- Wind Direction UART ---
  WindSerial.begin(9600, SERIAL_8N1, WIND_RX_PIN, WIND_TX_PIN);

  // --- Pyranometer RS485 ---
  RS485Serial.begin(PYRO_BAUDRATE);
  pinMode(PYRO_DE_RE_PIN, OUTPUT);
  digitalWrite(PYRO_DE_RE_PIN, LOW);  // default: receive mode

  // --- MicroSD ---
  SPI.begin(SD_SCLK, SD_MISO, SD_MOSI, SD_CS);
  if (SD.begin(SD_CS)) {
    Serial.println("[OK] MicroSD siap.");
    checkSDSpace();  // ⑲ tampilkan info storage saat boot
    // Buat header CSV jika file belum ada
    if (!SD.exists(FILE_CSV)) {
      File f = SD.open(FILE_CSV, FILE_WRITE);
      if (f) {
        f.println("Waktu,Lat,Lon,Suhu(C),Lembap(%),Tekanan(hPa),"
                  "Pulse,RPM,WindDefault(m/s),Arah_Angin,WindDir(deg),GHI(W/m2)");
        f.close();
      }
    }
    uint32_t ptr = readQueuePointer();
    Serial.printf("[INFO] Queue pointer saat ini: %u bytes.\n", ptr);
    File fj = SD.open(FILE_JSON, FILE_READ);
    if (fj) {
      Serial.printf("[INFO] datalog.json ada, ukuran: %u bytes.\n", fj.size());
      fj.close();
    } else {
      Serial.println("[INFO] datalog.json belum ada, dibuat saat logging pertama.");
    }
  } else {
    Serial.println("[ERROR] MicroSD gagal! Periksa wiring SPI.");
  }

  // --- BME280 ---
  if (!bme.begin(BME280_ADDR)) {
    Serial.println("[ERROR] BME280 tidak ditemukan! Periksa alamat I2C (0x76/0x77).");
    recoverI2CBus();  // FIX: coba recovery I2C bus sebelum inisialisasi berikutnya
  } else {
    bmeReady = true;  // FIX: set flag
    // ⑥ MODE_NORMAL: sensor sampling secara otomatis (tidak perlu takeForcedMeasurement)
    //    SAMPLING_X4 temperature & humidity → SNR lebih baik dari X2
    //    FILTER_X4 → haluskan fluktuasi tekanan akibat angin/getaran
    //    STANDBY_MS_500 → update internal tiap 500ms
    bme.setSampling(
      Adafruit_BME280::MODE_NORMAL,
      Adafruit_BME280::SAMPLING_X4,     // temperature oversampling ⑥
      Adafruit_BME280::SAMPLING_X2,     // pressure oversampling
      Adafruit_BME280::SAMPLING_X4,     // humidity oversampling  ⑥
      Adafruit_BME280::FILTER_X4,       // IIR filter coefficient  ⑥
      Adafruit_BME280::STANDBY_MS_500   // 500ms standby normal mode
    );
    Serial.println("[OK] BME280 siap (MODE_NORMAL, oversamp x4/x2/x4, IIR x4).");
  }

  // --- RTC DS3231 ---
  if (!rtc.begin()) {
    Serial.println("[ERROR] RTC DS3231 tidak ditemukan! Periksa wiring I2C.");
    recoverI2CBus();
  } else {
    rtcReady = true;  // FIX: set flag
    if (rtc.lostPower()) {
      // ① Prioritas sync: Network Time → compile time (sementara)
      Serial.println("[RTC] Daya RTC hilang (baterai habis / first boot).");
      if (!syncRTCFromNetwork()) {
        // Fallback compile time — akan dikoreksi otomatis GPS saat lock
        Serial.println("[RTC] Fallback ke compile time (sementara).");
        Serial.println("[RTC] Akan dikoreksi otomatis saat GPS mendapat sinyal.");
        rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
      }
    } else {
      DateTime now = rtc.now();
      Serial.printf("[RTC] OK — %04d-%02d-%02d %02d:%02d:%02d WIB\n",
                    now.year(), now.month(), now.day(),
                    now.hour(), now.minute(), now.second());
    }
  }

  // --- ADS1115 ---
  if (ads.begin(ADS1115_ADDR, &Wire)) {
    adsReady = true;  // FIX #1: set flag — wajib sebelum readADSAvg() dipanggil
    ads.setGain(GAIN_ONE);              // ⑨ ±4.096 V, 0.125 mV/bit
    ads.setDataRate(RATE_ADS1115_128SPS); // 128 SPS — cepat cukup untuk 8 avg
    Serial.println("[OK] ADS1115 siap (GAIN_ONE, 128SPS, avg 8 sampel).");
  } else {
    Serial.println("[ERROR] ADS1115 tidak ditemukan! Periksa alamat I2C (0x48).");
    recoverI2CBus();  // FIX: reset I2C bus agar sensor lain tidak terpengaruh
  }

  // --- Inisialisasi timer ---
  lastAnemoMs  = millis();
  lastSampleMs = millis();
  lastSendMs   = millis();

  Serial.println("\n=== Sistem Siap — Firmware v3.0 Final ===");
  Serial.printf("[INFO] Sampling tiap %lu menit | Kirim MQTT tiap %lu jam.\n",
                SAMPLE_INTERVAL_MS / 60000, SEND_INTERVAL_MS / 3600000);
  Serial.println("==========================================\n");
}

// ===================================================================
//  MAIN LOOP
// ===================================================================
void loop() {
  // Keepalive MQTT (non-blocking, jika sedang terhubung)
  if (mqtt.connected()) mqtt.loop();

  // ⑭ Baca arah angin secara kontinyu — isi circular buffer
  readWindDirectionSerial();

  unsigned long nowMs = millis();

  // -------- TIAP 1 MENIT: Baca sensor → simpan ke SD Card --------
  if (nowMs - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = nowMs;
    doSampleAndLog();
  }

  // -------- TIAP 1 JAM: Kirim data dari SD Card via MQTT --------
  if (nowMs - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = nowMs;
    sendQueuedData();
  }

  delay(10);
}
