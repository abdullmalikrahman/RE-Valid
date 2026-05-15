"""
RE-Valid MQTT Sensor Simulator
===============================
Mensimulasikan sensor lapangan yang mengirim data meteorologi real-time
ke broker MQTT setiap interval tertentu.

Cara menjalankan (dari folder backend/):
    python mqtt_simulator.py

Atau dengan interval custom (detik):
    python mqtt_simulator.py --interval 30

Atau untuk stasiun tertentu saja:
    python mqtt_simulator.py --stations LOC-01
"""

import argparse
import json
import math
import os
import random
import time
from datetime import datetime, timezone
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


def _now_doy() -> float:
    """Day-of-year as float 1–365."""
    return datetime.now().timetuple().tm_yday


def generate_reading(station_id: str, profile: dict) -> dict:
    """Generate one realistic measurement reading for a station."""
    doy = _now_doy()
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
        "measured_at": datetime.now(timezone.utc).isoformat(),
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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RE-Valid MQTT Sensor Simulator")
    parser.add_argument(
        "--interval", type=int, default=DEFAULT_INTERVAL,
        help=f"Interval antar publish dalam detik (default: {DEFAULT_INTERVAL})",
    )
    parser.add_argument(
        "--stations", nargs="+", default=list(STATIONS.keys()),
        choices=list(STATIONS.keys()),
        help="Daftar station_id yang akan disimulasikan (default: semua)",
    )
    args = parser.parse_args()
    run_simulator(args.stations, args.interval)
