"""
Atlas baseline readers untuk RE-Valid.

Sumber data:
  - GWA (Global Wind Atlas) : GeoTIFF per-piksel, resolusi ~250m
    → File: backend/data/atlas/IDN_wind-speed_100m.tif
    → Download: https://globalwindatlas.info → Download → GIS files → Indonesia → Wind speed → 100m
    → Jika file tidak ada, fungsi return None (fallback ke ERA5)

  - GSA (Global Solar Atlas) : REST API Solargis, tanpa autentikasi
    → Endpoint: https://api.globalsolaratlas.info/data/lta?loc={lat},{lon}
    → Mengembalikan GHI tahunan (kWh/m²/tahun) → dibagi 365 → kWh/m²/hari

Catatan unit:
  - GWA GeoTIFF   : m/s (langsung dipakai)
  - GSA API       : kWh/m²/tahun → ÷365 → kWh/m²/hari
  - ERA5/ECMWF    : m/s dan kWh/m²/hari via Open-Meteo ERA5 Archive API
"""

import logging
from pathlib import Path

import httpx

logger = logging.getLogger("atlas_reader")

# ─── Lokasi file GeoTIFF ──────────────────────────────────────────────────────
_ATLAS_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "atlas"
GWA_TIFF   = _ATLAS_DIR / "IDN_wind-speed_100m.tif"


# ─── GWA : baca angin dari GeoTIFF ───────────────────────────────────────────

def read_gwa_wind(lat: float, lon: float) -> float | None:
    """Baca kecepatan angin rata-rata tahunan di 100m (m/s) dari GeoTIFF GWA.

    Returns:
        float: nilai m/s, atau None jika file tidak tersedia / koordinat di luar cakupan.
    """
    if not GWA_TIFF.exists():
        logger.info(
            "GWA GeoTIFF tidak ditemukan di %s. "
            "Download dari https://globalwindatlas.info → Download → GIS files "
            "→ Indonesia → Wind speed → 100m, simpan sebagai IDN_wind-speed_100m.tif",
            GWA_TIFF,
        )
        return None

    try:
        import rasterio  # lazy import — tidak crash jika rasterio tidak terinstall

        with rasterio.open(GWA_TIFF) as ds:
            # Konversi koordinat geografis → baris/kolom piksel
            py, px = ds.index(lon, lat)
            # Baca piksel 1×1
            window = rasterio.windows.Window(px, py, 1, 1)
            data = ds.read(1, window=window)
            val = float(data[0, 0])

            # Sanity check: kecepatan angin realistis 0.5–30 m/s
            # nodata biasanya -9999 atau 0
            nodata = ds.nodata
            if nodata is not None and abs(val - nodata) < 1e-3:
                return None
            if val <= 0 or val > 30:
                return None

            return round(val, 2)

    except Exception as exc:
        logger.warning("Gagal membaca GWA GeoTIFF (%s): %s", GWA_TIFF.name, exc)
        return None


# ─── GSA : ambil GHI dari Solargis REST API ──────────────────────────────────

async def fetch_gsa_ghi(lat: float, lon: float) -> float | None:
    """Ambil GHI rata-rata tahunan (kWh/m²/hari) dari Global Solar Atlas API.

    Endpoint: https://api.globalsolaratlas.info/data/lta?loc={lat},{lon}
    Respons : annual.data.GHI → kWh/m²/tahun → dibagi 365 → kWh/m²/hari.
    API ini gratis dan tidak memerlukan autentikasi.
    """
    url = "https://api.globalsolaratlas.info/data/lta"
    params = {"loc": f"{lat},{lon}"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()

        ghi_annual = data.get("annual", {}).get("data", {}).get("GHI")
        if ghi_annual is None or float(ghi_annual) <= 0:
            return None

        # GHI dari GSA = kWh/m²/tahun → konversi ke kWh/m²/hari
        ghi_daily = round(float(ghi_annual) / 365.0, 2)

        # Sanity check: 1–10 kWh/m²/hari (batas realistis untuk Indonesia)
        if ghi_daily < 1.0 or ghi_daily > 10.0:
            return None

        return ghi_daily

    except Exception as exc:
        logger.warning("Gagal mengambil data GSA dari Solargis API: %s", exc)
        return None


# ─── ERA5 : ambil angin 100m dan GHI dari Open-Meteo ERA5 Archive ────────────

async def fetch_era5_baseline(lat: float, lon: float) -> dict:
    """Ambil rata-rata iklim tahunan dari Open-Meteo ERA5 Archive (ECMWF ERA5).

    Menggunakan data 12 tahun (2014–2025) sesuai standar minimum IEC 61400-12 untuk
    long-term average yang representatif dan tahan terhadap anomali iklim tahunan.

    Returns:
        dict dengan key:
          'wind': float|None  — rata-rata tahunan kecepatan angin 100m (m/s)
          'ghi':  float|None  — rata-rata harian GHI tahunan (kWh/m²/hari)
    """
    url = "https://archive-api.open-meteo.com/v1/era5"
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": "2014-01-01",
        "end_date": "2025-12-31",
        "hourly": "wind_speed_100m,shortwave_radiation",
        "wind_speed_unit": "ms",
        "timezone": "UTC",
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            hourly = r.json()["hourly"]

        wind_vals = [v for v in hourly.get("wind_speed_100m", []) if v is not None]
        rad_vals  = [v for v in hourly.get("shortwave_radiation", []) if v is not None]

        wind_mean: float | None = None
        ghi_daily: float | None = None

        if wind_vals:
            wind_mean = round(sum(wind_vals) / len(wind_vals), 2)
            if not (0.1 <= wind_mean <= 30.0):
                wind_mean = None

        if rad_vals:
            # shortwave_radiation = W/m² per jam → kWh/m²/hari
            # Energi per jam = W/m² × 1h = Wh/m²
            # Rata-rata harian = total Wh / (jumlah hari × 1000)
            n_days = len(rad_vals) / 24.0
            ghi_daily = round(sum(rad_vals) / (n_days * 1000.0), 2)
            if not (1.0 <= ghi_daily <= 10.0):
                ghi_daily = None

        return {"wind": wind_mean, "ghi": ghi_daily}

    except Exception as exc:
        logger.warning("Gagal mengambil data ERA5 dari Open-Meteo: %s", exc)
        return {"wind": None, "ghi": None}


# ─── ERA5 : daily climatology per DOY (1–366) ────────────────────────────────

async def fetch_era5_daily_climatology(lat: float, lon: float) -> dict[int, dict]:
    """Ambil daily climatology ERA5 per DOY (1–366) dari Open-Meteo ERA5 Archive.

    Strategi:
      - Query Open-Meteo daily endpoint: shortwave_radiation_sum (MJ/m²) dan
        wind_speed_10m_max (m/s), periode 2014-01-01 s/d 2025-12-31.
      - Untuk wind 100m: digunakan hourly wind_speed_100m lalu di-aggregate per hari.
        Open-Meteo daily tidak punya wind_100m_mean, jadi kita rata-rata per hari dari hourly.
      - Group by DOY, rata-rata semua tahun → 366 nilai (DOY 366 hanya tahun kabisat).

    Returns:
        dict[doy: int, {"ghi": float|None, "wind": float|None}]
        doy 1..366; ghi dalam kWh/m²/hari; wind dalam m/s.
        DOY 366 bisa None jika tidak ada data (tahun tidak kabisat).
    """
    url = "https://archive-api.open-meteo.com/v1/era5"

    # Step 1: ambil data daily untuk GHI (shortwave_radiation_sum dalam MJ/m²)
    # Step 2: ambil data hourly untuk wind 100m, lalu aggregate per hari
    # Keduanya dalam satu request dengan "daily" + "hourly"

    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": "2014-01-01",
        "end_date": "2025-12-31",
        "daily": "shortwave_radiation_sum",
        "hourly": "wind_speed_100m",
        "wind_speed_unit": "ms",
        "timezone": "UTC",
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()

        daily_section = data.get("daily", {})
        hourly_section = data.get("hourly", {})

        dates_daily = daily_section.get("time", [])
        ghi_daily_vals = daily_section.get("shortwave_radiation_sum", [])

        dates_hourly = hourly_section.get("time", [])
        wind_hourly_vals = hourly_section.get("wind_speed_100m", [])

        # ── Hitung DOY → mean GHI ──────────────────────────────────────────
        # shortwave_radiation_sum dari Open-Meteo daily = MJ/m² → bagi 3.6 → kWh/m²
        from collections import defaultdict

        ghi_by_doy: dict[int, list[float]] = defaultdict(list)
        for date_str, ghi_val in zip(dates_daily, ghi_daily_vals):
            if ghi_val is None:
                continue
            # date_str format: "YYYY-MM-DD"
            from datetime import date as date_t
            d = date_t.fromisoformat(date_str)
            doy = d.timetuple().tm_yday
            ghi_kwh = float(ghi_val) / 3.6  # MJ/m² → kWh/m²
            if 0.0 <= ghi_kwh <= 15.0:      # sanity: max ~10 di tropis, 15 = safety margin
                ghi_by_doy[doy].append(ghi_kwh)

        # ── Hitung wind 100m per hari → DOY → mean ────────────────────────
        # Hourly timestamps: "YYYY-MM-DDTHH:MM"
        wind_by_doy: dict[int, list[float]] = defaultdict(list)
        day_wind_acc: dict[str, list[float]] = defaultdict(list)

        for ts, w_val in zip(dates_hourly, wind_hourly_vals):
            if w_val is None:
                continue
            date_str = ts[:10]           # ambil "YYYY-MM-DD"
            w = float(w_val)
            if 0.0 <= w <= 50.0:
                day_wind_acc[date_str].append(w)

        for date_str, winds in day_wind_acc.items():
            from datetime import date as date_t
            d = date_t.fromisoformat(date_str)
            doy = d.timetuple().tm_yday
            wind_by_doy[doy].append(sum(winds) / len(winds))

        # ── Build hasil dict[doy] ──────────────────────────────────────────
        result: dict[int, dict] = {}
        for doy in range(1, 367):
            ghi_list = ghi_by_doy.get(doy, [])
            wind_list = wind_by_doy.get(doy, [])

            ghi_mean = round(sum(ghi_list) / len(ghi_list), 3) if ghi_list else None
            wind_mean = round(sum(wind_list) / len(wind_list), 3) if wind_list else None

            result[doy] = {"ghi": ghi_mean, "wind": wind_mean}

        logger.info(
            "ERA5 daily climatology berhasil untuk (%.4f, %.4f): %d DOY terisi",
            lat, lon, sum(1 for v in result.values() if v["ghi"] is not None),
        )
        return result

    except Exception as exc:
        logger.warning("Gagal mengambil ERA5 daily climatology: %s", exc)
        return {}

