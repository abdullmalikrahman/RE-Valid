"""
Endpoint heatmap atlas untuk halaman Peta.

GET /api/v1/atlas/heatmap?type=wind|solar

Strategi sumber data:
  wind  → GWA GeoTIFF  (jika file tersedia)  else  IDW dari station wind_baseline
  solar → IDW dari station ghi_baseline  (GSA/ERA5; tidak ada bulk raster tersedia)
          Fallback (belum ada stasiun): IDW dari grid kontrol GSA API (0.75° step, ~20 titik, cache 24 jam)

Response:
  {
    "type": "wind" | "solar",
    "source": "<deskripsi sumber>",
    "points": [[lat, lon, intensity_0_1], ...],
    "min_val": float,   # nilai asli sebelum normalisasi
    "max_val": float,
    "unit": "m/s" | "kWh/m²/hari"
  }
"""

import asyncio
import math
import logging
import time
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.station import get_all_stations

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── Cache GSA control grid (24 jam) ─────────────────────────────────────────
_gsa_grid_cache: list[tuple[float, float, float]] | None = None
_gsa_grid_cache_ts: float = 0.0
_GSA_CACHE_TTL: float = 86_400.0   # detik
_GSA_CTRL_STEP: float = 0.75       # ° → ~20 titik kontrol grid

# ─── Bbox Jawa Barat + buffer ─────────────────────────────────────────────────
_LAT_MIN, _LAT_MAX = -8.1, -5.9
_LON_MIN, _LON_MAX = 106.4, 109.5
_GRID_STEP = 0.15   # °  ≈ 16 km; menghasilkan ~300 titik grid


# ─── IDW Interpolation ───────────────────────────────────────────────────────

def _idw(lat: float, lon: float,
         ctrl_pts: list[tuple[float, float, float]],
         power: float = 2.0) -> float:
    """Inverse Distance Weighting dari sekumpulan titik kontrol."""
    num = den = 0.0
    for clat, clon, cval in ctrl_pts:
        d = math.sqrt((lat - clat) ** 2 + (lon - clon) ** 2)
        if d < 1e-6:
            return cval
        w = 1.0 / (d ** power)
        num += w * cval
        den += w
    return num / den if den > 0 else ctrl_pts[0][2]


def _grid_latlon() -> list[tuple[float, float]]:
    """Hasilkan daftar (lat, lon) pada grid reguler atas bbox Jawa Barat."""
    pts = []
    lat = _LAT_MIN
    while lat <= _LAT_MAX + 1e-9:
        lon = _LON_MIN
        while lon <= _LON_MAX + 1e-9:
            pts.append((round(lat, 4), round(lon, 4)))
            lon += _GRID_STEP
        lat += _GRID_STEP
    return pts


def _normalize(raw_pts: list[tuple[float, float, float]]) \
        -> tuple[list[list], float, float]:
    """Normalisasi intensitas ke [0, 1]. Returns (points_norm, min_val, max_val)."""
    vals = [v for _, _, v in raw_pts]
    min_v, max_v = min(vals), max(vals)
    rng = max_v - min_v if (max_v - min_v) > 1e-6 else 1.0
    return (
        [[lat, lon, round((v - min_v) / rng, 3)] for lat, lon, v in raw_pts],
        round(min_v, 2),
        round(max_v, 2),
    )


# ─── GSA control-grid fetcher (fallback heatmap surya) ──────────────────────

async def _fetch_gsa_control_grid() -> list[tuple[float, float, float]]:
    """Ambil GHI dari GSA API pada grid kasar sebagai titik kontrol IDW.

    Grid step 0.75° menghasilkan ~20 titik atas bbox Jawa Barat.
    Semua request dijalankan secara paralel (asyncio.gather).
    Hasil di-cache selama 24 jam.
    """
    global _gsa_grid_cache, _gsa_grid_cache_ts

    if _gsa_grid_cache is not None and (time.time() - _gsa_grid_cache_ts) < _GSA_CACHE_TTL:
        return _gsa_grid_cache

    from app.workers.atlas_reader import fetch_gsa_ghi

    # Buat grid kontrol kasar
    ctrl_grid: list[tuple[float, float]] = []
    lat = _LAT_MIN
    while lat <= _LAT_MAX + 1e-9:
        lon = _LON_MIN
        while lon <= _LON_MAX + 1e-9:
            ctrl_grid.append((round(lat, 2), round(lon, 2)))
            lon += _GSA_CTRL_STEP
        lat += _GSA_CTRL_STEP

    logger.info("GSA fallback: mengambil %d titik kontrol secara paralel...", len(ctrl_grid))

    # Fetch semua secara paralel
    results = await asyncio.gather(
        *[fetch_gsa_ghi(lat, lon) for lat, lon in ctrl_grid],
        return_exceptions=True,
    )

    ctrl_pts: list[tuple[float, float, float]] = []
    for (clat, clon), val in zip(ctrl_grid, results):
        if isinstance(val, float):
            ctrl_pts.append((clat, clon, val))

    if ctrl_pts:
        _gsa_grid_cache = ctrl_pts
        _gsa_grid_cache_ts = time.time()
        logger.info("GSA control grid berhasil: %d/%d titik", len(ctrl_pts), len(ctrl_grid))
    else:
        logger.warning("GSA API mengembalikan semua None — tidak ada cache disimpan")

    return ctrl_pts


# ─── GWA GeoTIFF grid sampler ────────────────────────────────────────────────

def _sample_gwa_grid() -> dict:
    """Sample grid dari GWA GeoTIFF menggunakan rasterio."""
    try:
        import rasterio
        import rasterio.windows
        from app.workers.atlas_reader import GWA_TIFF

        raw: list[tuple[float, float, float]] = []
        grid = _grid_latlon()

        with rasterio.open(GWA_TIFF) as ds:
            nodata = ds.nodata
            for lat, lon in grid:
                try:
                    py, px = ds.index(lon, lat)
                    window = rasterio.windows.Window(px, py, 1, 1)
                    val = float(ds.read(1, window=window)[0, 0])
                    if nodata is not None and abs(val - nodata) < 1.0:
                        continue
                    if val <= 0.5 or val > 30:
                        continue
                    raw.append((lat, lon, val))
                except Exception:
                    continue

        if not raw:
            return {"type": "wind", "source": "GWA GeoTIFF (area kosong)",
                    "points": [], "min_val": 0, "max_val": 0, "unit": "m/s"}

        points_norm, min_v, max_v = _normalize(raw)
        return {
            "type": "wind",
            "source": "GWA 3.0 GeoTIFF (raster 250m)",
            "points": points_norm,
            "min_val": min_v,
            "max_val": max_v,
            "unit": "m/s",
        }
    except Exception as exc:
        logger.warning("GWA grid sampling gagal: %s", exc)
        return None


# ─── Route ───────────────────────────────────────────────────────────────────

@router.get("/heatmap")
async def get_heatmap(
    type: Literal["wind", "solar"] = Query("wind"),
    db: AsyncSession = Depends(get_db),
):
    """
    Hasilkan titik heatmap untuk layer angin atau surya.

    Sumber data (urutan prioritas):
    - wind  : GWA GeoTIFF → IDW dari station wind_baseline
    - solar : IDW dari station ghi_baseline (GSA/ERA5)
    """
    # ── Coba GWA GeoTIFF untuk angin ─────────────────────────────────────────
    if type == "wind":
        from app.workers.atlas_reader import GWA_TIFF
        if GWA_TIFF.exists():
            result = _sample_gwa_grid()
            if result and result["points"]:
                return result
            logger.info("GWA grid kosong, fallback ke IDW")

    # ── Ambil station baselines dari DB ──────────────────────────────────────
    stations = await get_all_stations(db)

    if type == "wind":
        ctrl: list[tuple[float, float, float]] = [
            (float(s.lat), float(s.lon), float(s.wind_baseline))
            for s in stations
            if s.wind_baseline is not None
        ]
        unit = "m/s"
    else:
        ctrl = [
            (float(s.lat), float(s.lon), float(s.ghi_baseline))
            for s in stations
            if s.ghi_baseline is not None
        ]
        unit = "kWh/m²/hari"

    if not ctrl:
            # ── Fallback solar: IDW dari GSA API (grid kontrol kasar) ────────────
        if type == "solar":
            gsa_ctrl = await _fetch_gsa_control_grid()
            if gsa_ctrl:
                grid = _grid_latlon()
                raw_fb: list[tuple[float, float, float]] = [
                    (lat, lon, _idw(lat, lon, gsa_ctrl))
                    for lat, lon in grid
                ]
                pts_fb, min_fb, max_fb = _normalize(raw_fb)
                return {
                    "type": "solar",
                    "source": f"GSA Solargis IDW dari {len(gsa_ctrl)} titik kontrol (belum ada stasiun — tambahkan via /admin untuk data aktual)",
                    "points": pts_fb,
                    "min_val": min_fb,
                    "max_val": max_fb,
                    "unit": "kWh/m²/hari",
                }
            # GSA juga gagal — estimasi klimatologi sebagai last resort
            grid = _grid_latlon()
            raw_lr: list[tuple[float, float, float]] = []
            for flat, flon in grid:
                east_factor   = (flon - 106.4) / (111.0 - 106.4) * 0.30
                mountain_dist = math.sqrt(max(0.0, -(flat + 7.2)) ** 2
                                          + max(0.0, abs(flon - 107.8) - 0.7) ** 2)
                mountain_factor = max(0.0, 0.35 - mountain_dist * 0.5)
                ghi = max(4.2, min(5.5, 5.0 + east_factor - mountain_factor))
                raw_lr.append((flat, flon, round(ghi, 2)))
            pts_lr, min_lr, max_lr = _normalize(raw_lr)
            return {
                "type": "solar",
                "source": "Estimasi klimatologi (GSA tidak tersedia — tambahkan stasiun via /admin)",
                "points": pts_lr,
                "min_val": min_lr,
                "max_val": max_lr,
                "unit": "kWh/m²/hari",
            }
        return {
            "type": type,
            "source": "Tidak ada data baseline tersedia",
            "points": [],
            "min_val": 0,
            "max_val": 0,
            "unit": unit,
        }

    # ── IDW interpolasi pada grid ─────────────────────────────────────────────
    grid = _grid_latlon()
    raw: list[tuple[float, float, float]] = [
        (lat, lon, _idw(lat, lon, ctrl))
        for lat, lon in grid
    ]

    points_norm, min_v, max_v = _normalize(raw)

    src_type = "GWA + " if type == "wind" else ""
    src_base = "ERA5" if type == "wind" else "GSA/ERA5"
    n_ctrl = len(ctrl)
    source = f"IDW dari {n_ctrl} stasiun ({src_type}{src_base} baselines)"

    return {
        "type": type,
        "source": source,
        "points": points_norm,
        "min_val": min_v,
        "max_val": max_v,
        "unit": unit,
    }
