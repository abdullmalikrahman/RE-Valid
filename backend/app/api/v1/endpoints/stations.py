import asyncio
import math
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.crud.station import (
    create_station,
    delete_station,
    get_all_stations,
    get_station_by_id,
    update_station,
)
from app.schemas.station import StationCreate, StationResponse, StationUpdate

# ── Cache in-memory untuk hasil GIS-MCDA (TTL 6 jam per stasiun) ──────────────
_GIS_CACHE: dict[str, tuple[float, dict]] = {}
_GIS_CACHE_TTL = 6 * 3600  # detik


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Jarak Haversine antara dua koordinat dalam km."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


async def _overpass_nearest_km(
    lat: float, lon: float, osm_filter: str, max_km: int = 100
) -> float | None:
    """
    Cari fitur OSM terdekat via Overpass API dengan pencarian radius bertahap.
    Mengembalikan jarak minimum (km) ke centroid way terdekat, atau None jika
    Overpass tidak responsif atau tidak ada fitur ditemukan dalam max_km.
    """
    url = "https://overpass-api.de/api/interpreter"
    radii = [r for r in [5_000, 20_000, 50_000, max_km * 1_000] if r <= max_km * 1_000]
    for radius_m in radii:
        query = (
            f"[out:json][timeout:20];\n"
            f"(way{osm_filter}(around:{radius_m},{lat},{lon}););\n"
            f"out center;"
        )
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                resp = await client.post(url, data={"data": query})
            if resp.status_code != 200:
                continue
            elements = resp.json().get("elements", [])
            if not elements:
                continue
            # Hitung jarak ke centroid setiap way — ambil minimum
            dists = [
                _haversine_km(lat, lon, el["center"]["lat"], el["center"]["lon"])
                for el in elements
                if "center" in el
            ]
            if dists:
                return round(min(dists), 2)
        except Exception:
            continue
    return None


def _road_pct(d: float | None) -> int:
    """Skor aksesibilitas (%) berdasarkan jarak ke jalan terdekat (km)."""
    if d is None:
        return 20  # fallback jika Overpass tidak tersedia
    if d < 1:    return 90
    if d < 5:    return 75
    if d < 15:   return 55
    if d < 30:   return 35
    return 15


def _power_pct(d: float | None) -> int:
    """Skor infrastruktur (%) berdasarkan jarak ke saluran transmisi terdekat (km)."""
    if d is None:
        return 30  # fallback jika Overpass tidak tersedia
    if d < 5:    return 80
    if d < 20:   return 60
    if d < 50:   return 40
    if d < 100:  return 25
    return 10


def _topo_pct(alt: int | None) -> int:
    """Skor topografi (%) berdasarkan kelas elevasi DEMNAS/SRTM (Pedoman ESDM No. 1/2012)."""
    if alt is None:
        return 50
    if alt < 200:   return 70   # dataran rendah, lereng <8°
    if alt < 600:   return 55   # perbukitan rendah
    if alt < 1500:  return 65   # perbukitan tinggi, eksposur angin baik
    return 40                   # pegunungan, lereng curam

router = APIRouter()


@router.get("", response_model=list[StationResponse])
async def list_stations(db: AsyncSession = Depends(get_db)):
    return await get_all_stations(db)


@router.get("/{station_id}", response_model=StationResponse)
async def get_station(station_id: str, db: AsyncSession = Depends(get_db)):
    station = await get_station_by_id(db, station_id)
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stasiun tidak ditemukan",
        )
    return station


@router.post("", response_model=StationResponse, status_code=status.HTTP_201_CREATED)
async def add_station(
    data: StationCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    existing = await get_station_by_id(db, data.id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Stasiun dengan ID '{data.id}' sudah ada",
        )
    return await create_station(db, data)


@router.patch("/{station_id}", response_model=StationResponse)
async def edit_station(
    station_id: str,
    data: StationUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    station = await update_station(db, station_id, data)
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stasiun tidak ditemukan",
        )
    return station


@router.delete("/{station_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_station(
    station_id: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    deleted = await delete_station(db, station_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stasiun tidak ditemukan",
        )


# ---------------------------------------------------------------------------
# Endpoint: ambil nilai baseline dari tiga sumber atlas
#   1. GWA  (Global Wind Atlas)   — GeoTIFF 100m, resolusi 250m
#   2. GSA  (Global Solar Atlas)  — Solargis REST API
#   3. ERA5 (ECMWF)               — Open-Meteo ERA5 Archive API (fallback & pembanding)
#
# Prioritas:
#   wind_baseline = GWA  jika file GeoTIFF tersedia, else ERA5
#   ghi_baseline  = GSA  (selalu tersedia via API), else ERA5
# ---------------------------------------------------------------------------

@router.post("/{station_id}/fetch-atlas", response_model=StationResponse)
async def fetch_atlas_baseline(
    station_id: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    Ambil nilai baseline atlas dari tiga sumber dan simpan ke DB:
      · GWA  → wind_baseline_gwa   (dari GeoTIFF lokal jika tersedia)
      · GSA  → ghi_baseline_gsa    (dari Solargis REST API)
      · ERA5 → wind_baseline_nasa + ghi_baseline_nasa  (dari Open-Meteo ERA5 Archive, ECMWF)
    Nilai wind_baseline dan ghi_baseline diisi dengan sumber terbaik yang tersedia.
    """
    from app.workers.atlas_reader import fetch_era5_baseline, fetch_gsa_ghi, read_gwa_wind

    station = await get_station_by_id(db, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Stasiun tidak ditemukan")

    lat, lon = float(station.lat), float(station.lon)

    # ── 1. GWA : baca dari GeoTIFF lokal (sync, tidak perlu await) ────────────
    gwa_wind: float | None = read_gwa_wind(lat, lon)

    # ── 2. GSA : Solargis REST API ─────────────────────────────────────────────
    gsa_ghi: float | None = await fetch_gsa_ghi(lat, lon)

    # ── 3. ERA5 (ECMWF) via Open-Meteo ERA5 Archive API ───────────────────────
    # Data: wind_speed_100m dan shortwave_radiation, rata-rata 12 tahun (2014–2025)
    # Disimpan di kolom wind_baseline_nasa / ghi_baseline_nasa (nama kolom lama, isi ERA5)
    era5 = await fetch_era5_baseline(lat, lon)
    era5_wind: float | None = era5.get("wind")
    era5_ghi:  float | None = era5.get("ghi")

    # ── Tentukan nilai terbaik ─────────────────────────────────────────────────
    best_wind = gwa_wind if gwa_wind is not None else era5_wind
    best_ghi  = gsa_ghi  if gsa_ghi  is not None else era5_ghi

    if best_wind is None and best_ghi is None:
        raise HTTPException(
            status_code=502,
            detail=(
                "Semua sumber atlas gagal (GWA file tidak ada, GSA API tidak responsif, "
                "ERA5/Open-Meteo tidak responsif). Coba input baseline secara manual."
            ),
        )

    update_data = StationUpdate(
        wind_baseline=best_wind,
        ghi_baseline=best_ghi,
        wind_baseline_gwa=gwa_wind,
        ghi_baseline_gsa=gsa_ghi,
        wind_baseline_nasa=era5_wind,
        ghi_baseline_nasa=era5_ghi,
    )
    updated = await update_station(db, station_id, update_data)
    return updated


# ---------------------------------------------------------------------------
# Endpoint: hitung faktor GIS-MCDA berdasarkan koordinat nyata
#   · Aksesibilitas  → jarak ke jalan terdekat via Overpass API (OSM)
#   · Infrastruktur  → jarak ke saluran transmisi listrik terdekat via Overpass API
#   · Topografi      → kelas elevasi DEMNAS/SRTM (altitude dari DB)
#   · Potensi EBT    → skor validasi MCP langsung dari station.score
#
# Cache 6 jam per stasiun (jaringan jalan & transmisi jarang berubah).
# ---------------------------------------------------------------------------

@router.get("/{station_id}/gis-mcda")
async def get_gis_mcda(station_id: str, db: AsyncSession = Depends(get_db)):
    """
    Hitung faktor kesesuaian GIS-MCDA berbasis koordinat nyata stasiun.
    Aksesibilitas dan Infrastruktur menggunakan jarak aktual ke fitur OSM
    via Overpass API — bukan lookup tier-altitude generik.
    """
    # ── Cache check ───────────────────────────────────────────────────────────
    cached = _GIS_CACHE.get(station_id)
    if cached and (time.time() - cached[0]) < _GIS_CACHE_TTL:
        return cached[1]

    station = await get_station_by_id(db, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Stasiun tidak ditemukan")

    lat, lon, alt = float(station.lat), float(station.lon), station.altitude

    # ── Query Overpass API secara paralel ─────────────────────────────────────
    road_filter = (
        '["highway"~"^(motorway|trunk|primary|secondary|tertiary'
        '|unclassified|residential|track)$"]'
    )
    power_filter = '["power"="line"]'

    road_result, power_result = await asyncio.gather(
        _overpass_nearest_km(lat, lon, road_filter, max_km=50),
        _overpass_nearest_km(lat, lon, power_filter, max_km=150),
        return_exceptions=True,
    )
    road_dist: float | None = None if isinstance(road_result, Exception) else road_result
    power_dist: float | None = None if isinstance(power_result, Exception) else power_result

    result = {
        "station_id": station_id,
        "lat": lat,
        "lon": lon,
        "altitude": alt,
        "road_dist_km": road_dist,
        "power_dist_km": power_dist,
        "data_source": (
            "Overpass API (OpenStreetMap)"
            if (road_dist is not None or power_dist is not None)
            else "Fallback tier-altitude (Overpass tidak responsif)"
        ),
        "factors": [
            {
                "label": "Potensi EBT",
                "pct": station.score,
                "source": "Hasil validasi MCP (atlas vs. observasi lapangan)",
                "detail": None,
            },
            {
                "label": "Topografi",
                "pct": _topo_pct(alt),
                "source": "Kelas elevasi DEMNAS/SRTM — Pedoman ESDM No. 1/2012",
                "detail": f"{alt} m dpl" if alt is not None else None,
            },
            {
                "label": "Aksesibilitas",
                "pct": _road_pct(road_dist),
                "source": "Jarak ke jalan terdekat via OSM/Overpass API",
                "detail": (
                    f"{road_dist:.1f} km ke jalan terdekat"
                    if road_dist is not None
                    else "Fallback (Overpass tidak tersedia)"
                ),
            },
            {
                "label": "Infrastruktur",
                "pct": _power_pct(power_dist),
                "source": "Jarak ke saluran transmisi listrik terdekat via OSM/Overpass API",
                "detail": (
                    f"{power_dist:.1f} km ke transmisi listrik terdekat"
                    if power_dist is not None
                    else "Fallback (Overpass tidak tersedia)"
                ),
            },
        ],
    }

    _GIS_CACHE[station_id] = (time.time(), result)
    return result
