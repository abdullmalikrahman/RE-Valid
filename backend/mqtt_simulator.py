"""
RE-Valid MQTT Sensor Simulator
===============================
Mensimulasikan sensor lapangan yang mengirim data meteorologi ke sistem RE-Valid.

━━ MODE REAL-TIME (default) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kirim data ke broker MQTT setiap interval tertentu (timestamp = sekarang).

    python mqtt_simulator.py                           # semua stasiun, 60s interval
    python mqtt_simulator.py --interval 10             # setiap 10 detik
    python mqtt_simulator.py --stations LOC-01         # stasiun tertentu saja

━━ MODE BACKFILL (data historis) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Insert data historis langsung ke DB (tanpa MQTT, tanpa menunggu real-time).
Berguna untuk mensimulasikan kampanye pengukuran 7 hari sebelum sensor siap.

    python mqtt_simulator.py --backfill --start 2026-06-08 --end 2026-06-14
    python mqtt_simulator.py --backfill --start 2026-06-08 --end 2026-06-14 --measure-interval 10

Argumen backfill:
  --start              Tanggal mulai (YYYY-MM-DD), default: 7 hari terakhir termasuk hari ini
  --end                Tanggal akhir  (YYYY-MM-DD), default: hari ini
  --measure-interval   Interval antar pembacaan dalam MENIT (default: 1 menit)
                       1 menit → ~10 080 baris per 7 hari
                       10 menit → ~1 008 baris per 7 hari
"""

import argparse
import json
import math
import os
import random
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import paho.mqtt.client as mqtt

# ─── Konfigurasi broker ────────────────────────────────────────────────────────
# Credentials dibaca dari .env (jangan hardcode di sini)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass  # python-dotenv tidak terinstall — gunakan env var yang sudah di-set

BROKER_HOST = os.environ.get("MQTT_BROKER", "localhost")
BROKER_PORT = int(os.environ.get("MQTT_PORT", "11883"))  # host port (Docker: 11883 → container 1883)
MQTT_USERNAME = os.environ.get("MQTT_USERNAME", "")
MQTT_PASSWORD = os.environ.get("MQTT_PASSWORD", "")
DEFAULT_INTERVAL = 60  # detik

# ─── Profil setiap stasiun ─────────────────────────────────────────────────────
# base_wind : m/s  — sesuaikan dengan wind_baseline stasiun (dari GWA/ERA5)
# base_ghi  : W/m² rata-rata harian — konversi dari kWh/m²/hari × 1000 / 24
#             Contoh: GSA 4.47 kWh/m²/hari → 4.47 × 1000 / 24 ≈ 186 W/m²
#             MQTT client menyimpan ke measurements.ghi (W/m²)
#             tasks.py mengonversi × 24/1000 → kWh/m²/hari saat validasi MCP
# altitude  : meter dpl — dari data stasiun
#
# Tambahkan entri baru di sini setiap kali ada stasiun baru didaftarkan di /admin.
STATIONS = {
    # Pengukuran 1 - Sumbersari (Sumbersari, Purwakarta)
    # Baseline: GWA 2.84 m/s | GSA 4.47 kWh/m²/hari (186 W/m²) | ERA5 2.21 m/s / 5.03 kWh
    "LOC-01": {"base_wind": 2.84, "base_ghi": 186.0, "altitude": 619},
}


def _doy(dt: datetime) -> float:
    """Day-of-year (1–365) dari datetime tertentu (untuk variasi musiman)."""
    return dt.timetuple().tm_yday


def generate_reading(station_id: str, profile: dict, at: datetime | None = None) -> dict:
    """Generate one realistic measurement reading for a station.

    Args:
        at: Timestamp untuk reading ini. Default = sekarang (UTC).
            Pada mode backfill, gunakan timestamp historis agar variasi
            musiman (angin/GHI) sesuai dengan periode waktu yang disimulasikan.
    """
    dt = at if at is not None else datetime.now(timezone.utc)
    doy = _doy(dt)
    base_wind: float = profile["base_wind"]
    base_ghi: float = profile["base_ghi"]

    # Wind speed: base + seasonal + random noise
    wind_seasonal = 0.9 * math.sin(doy * 2 * math.pi / 365)
    wind_noise = random.gauss(0, 0.3)
    wind_speed = round(max(0.5, base_wind + wind_seasonal + wind_noise), 2)

    wind_dir = round(random.uniform(0, 360), 1)

    # GHI: base + seasonal (kemarau lebih tinggi) + noise
    ghi_seasonal = 45 * math.cos((doy - 258) * 2 * math.pi / 365)
    ghi_noise = random.gauss(0, 20)
    ghi = round(max(60, base_ghi + ghi_seasonal + ghi_noise), 1)
    dni = round(max(30, ghi * 0.85 + random.gauss(0, 10)), 1)

    # Temperature: warmer during dry season
    temperature = round(24.5 + 2.5 * math.sin((doy - 90) * 2 * math.pi / 365) + random.gauss(0, 0.5), 1)

    # Humidity: higher during wet season
    humidity = round(min(98, max(50, 72.0 - 12 * math.sin((doy - 90) * 2 * math.pi / 365) + random.gauss(0, 3))), 1)

    # Pressure: nearly constant
    pressure = round(1013.0 - profile["altitude"] * 0.115 + random.gauss(0, 0.5), 1)

    return {
        "measured_at": dt.isoformat(),
        "wind_speed": wind_speed,
        "wind_dir": wind_dir,
        "ghi": ghi,
        "dni": dni,
        "temperature": temperature,
        "humidity": humidity,
        "pressure": pressure,
    }


def run_simulator(station_ids: list[str], interval: int) -> None:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc == 0:
            print(f"[simulator] Connected to broker {BROKER_HOST}:{BROKER_PORT}")
        else:
            print(f"[simulator] Connection failed (rc={rc})")

    client.on_connect = on_connect
    client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
    client.loop_start()

    # Wait for connection
    time.sleep(1.5)

    print(f"[simulator] Publishing to {len(station_ids)} station(s) every {interval}s")
    print(f"[simulator] Stations: {', '.join(station_ids)}")
    print("[simulator] Press Ctrl+C to stop\n")

    tick = 0
    try:
        while True:
            tick += 1
            for sid in station_ids:
                profile = STATIONS[sid]
                reading = generate_reading(sid, profile)
                topic = f"stations/{sid}/data"
                payload = json.dumps(reading)
                result = client.publish(topic, payload, qos=1)
                status = "OK" if result.rc == 0 else f"ERR(rc={result.rc})"
                print(
                    f"[tick {tick:04d}] {status} -> {topic} | "
                    f"wind={reading['wind_speed']}m/s  "
                    f"GHI={reading['ghi']}W/m²  "
                    f"T={reading['temperature']}°C"
                )
            print()
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n[simulator] Stopped by user")
    finally:
        client.loop_stop()
        client.disconnect()


def run_backfill(
    station_ids: list[str],
    start: date,
    end: date,
    measure_interval_min: int,
) -> None:
    """Insert data historis langsung ke DB (bypass MQTT) untuk simulasi kampanye pengukuran.

    Berguna untuk:
    - Testing sistem sebelum sensor lapangan siap
    - Mensimulasikan 7 hari kampanye pengukuran (misal: 8-14 Juni 2026)
    - Validasi MCP dengan data yang merepresentasikan periode tertentu

    Timestamp setiap baris diset ke periode historis sehingga variasi musiman
    (angin/GHI) sesuai dengan bulan yang disimulasikan — bukan bulan saat ini.
    """
    try:
        import psycopg2
        from psycopg2 import extras as pg_extras
    except ImportError:
        print("[backfill] ERROR: psycopg2 tidak terinstall. Jalankan: pip install psycopg2-binary")
        return

    # Dapatkan DATABASE_URL dari app settings (baca .env otomatis)
    try:
        from app.core.config import settings
        db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    except Exception as e:
        print(f"[backfill] ERROR: Tidak bisa membaca DATABASE_URL dari config: {e}")
        return

    # Hitung total langkah
    step = timedelta(minutes=measure_interval_min)
    start_dt = datetime.combine(start, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_dt   = datetime.combine(end,   datetime.max.time()).replace(tzinfo=timezone.utc)
    total_steps = int((end_dt - start_dt).total_seconds() / step.total_seconds()) + 1

    print(f"\n[backfill] Periode  : {start.isoformat()} s/d {end.isoformat()}")
    print(f"[backfill] Interval : {measure_interval_min} menit → ~{total_steps} pembacaan per stasiun")
    print(f"[backfill] Stasiun  : {', '.join(station_ids)}")
    print(f"[backfill] Total baris yang akan digenerate: {total_steps * len(station_ids)}")
    print("[backfill] Menghubungkan ke database...\n")

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
    except Exception as e:
        print(f"[backfill] ERROR: Koneksi DB gagal: {e}")
        return

    # Generate semua baris
    rows: list[tuple] = []
    at = start_dt
    tick = 0
    while at <= end_dt:
        tick += 1
        for sid in station_ids:
            profile = STATIONS[sid]
            r = generate_reading(sid, profile, at=at)
            rows.append((
                sid,
                r["measured_at"],
                r["wind_speed"],
                r["wind_dir"],
                r["ghi"],
                r["dni"],
                r["temperature"],
                r["humidity"],
                r["pressure"],
            ))
        if tick % 500 == 0:
            pct = tick / total_steps * 100
            print(f"[backfill] Generating... {tick}/{total_steps} ({pct:.0f}%)")
        at += step

    print(f"[backfill] {len(rows)} baris siap — menginsert ke DB...")

    try:
        # Hapus data lama di rentang yang sama sebelum insert ulang
        # (TimescaleDB PK = (id, measured_at), ON CONFLICT tidak bisa deteksi duplikat
        # berdasarkan station_id+measured_at saja karena id auto-increment selalu baru)
        cur.execute(
            "DELETE FROM measurements WHERE station_id = ANY(%s)"
            " AND measured_at >= %s AND measured_at <= %s",
            (station_ids, start_dt, end_dt),
        )
        deleted = cur.rowcount if cur.rowcount >= 0 else 0
        if deleted:
            print(f"[backfill] {deleted} baris lama dihapus (replace mode).")

        pg_extras.execute_values(
            cur,
            """INSERT INTO measurements
                   (station_id, measured_at, wind_speed, wind_dir, ghi, dni,
                    temperature, humidity, pressure)
               VALUES %s""",
            rows,
            page_size=500,
        )
        conn.commit()
        print(f"\n[backfill] Selesai! {len(rows)} baris diinsert.")
        print(f"[backfill] Jalankan analisis MCP di /analisis untuk melihat hasilnya.")
    except Exception as e:
        conn.rollback()
        print(f"[backfill] ERROR saat insert: {e}")
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="RE-Valid MQTT Sensor Simulator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # ─── Mode selection ────────────────────────────────────────────────────────
    parser.add_argument(
        "--backfill", action="store_true",
        help="Mode backfill: insert data historis langsung ke DB (tidak pakai MQTT)",
    )

    # ─── Shared: stations ─────────────────────────────────────────────────────
    parser.add_argument(
        "--stations", nargs="+", default=list(STATIONS.keys()),
        choices=list(STATIONS.keys()),
        help="Daftar station_id yang akan disimulasikan (default: semua)",
    )

    # ─── Real-time mode args ───────────────────────────────────────────────────
    parser.add_argument(
        "--interval", type=int, default=DEFAULT_INTERVAL,
        help=f"[Real-time] Interval antar publish dalam detik (default: {DEFAULT_INTERVAL})",
    )

    # ─── Backfill mode args ────────────────────────────────────────────────────
    _today = date.today()
    parser.add_argument(
        "--start", type=date.fromisoformat,
        default=(_today - timedelta(days=6)).isoformat(),
        help="[Backfill] Tanggal mulai YYYY-MM-DD (default: 7 hari terakhir termasuk hari ini)",
    )
    parser.add_argument(
        "--end", type=date.fromisoformat,
        default=_today.isoformat(),
        help="[Backfill] Tanggal akhir YYYY-MM-DD (default: hari ini)",
    )
    parser.add_argument(
        "--measure-interval", type=int, default=1, dest="measure_interval",
        help="[Backfill] Interval antar pembacaan dalam MENIT (default: 1 menit)",
    )

    args = parser.parse_args()

    if args.backfill:
        run_backfill(args.stations, args.start, args.end, args.measure_interval)
    else:
        run_simulator(args.stations, args.interval)

