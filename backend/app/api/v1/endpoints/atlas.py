"""
Endpoint heatmap atlas untuk halaman Peta.

GET /api/v1/atlas/heatmap?type=wind|solar

Strategi sumber data:
  wind  → GWA GeoTIFF  (jika file tersedia)  else  IDW dari station wind_baseline
  solar → IDW dari station ghi_baseline  (GSA/NASA POWER; tidak ada bulk raster tersedia)

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

import math
import logging
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.station import get_all_stations

logger = logging.getLogger(__name__)
router = APIRouter()

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
    - solar : IDW dari station ghi_baseline (GSA/NASA POWER)
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
    src_base = "NASA POWER" if type == "wind" else "GSA/NASA POWER"
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
