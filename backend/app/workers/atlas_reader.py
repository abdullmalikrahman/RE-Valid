"""
Atlas baseline readers untuk RE-Valid.

Sumber data:
  - GWA (Global Wind Atlas) : GeoTIFF per-piksel, resolusi ~250m
    → File: backend/data/atlas/IDN_wind-speed_100m.tif
    → Download: https://globalwindatlas.info → Download → GIS files → Indonesia → Wind speed → 100m
    → Jika file tidak ada, fungsi return None (fallback ke NASA POWER)

  - GSA (Global Solar Atlas) : REST API Solargis, tanpa autentikasi
    → Endpoint: https://api.globalsolaratlas.info/data/lta?loc={lat},{lon}
    → Mengembalikan GHI tahunan (kWh/m²/tahun) → dibagi 365 → kWh/m²/hari

Catatan unit:
  - GWA GeoTIFF   : m/s (langsung dipakai)
  - GSA API       : kWh/m²/tahun → ÷365 → kWh/m²/hari
  - NASA POWER    : kWh/m²/hari (sudah dikonversi di endpoint fetch-atlas)
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
