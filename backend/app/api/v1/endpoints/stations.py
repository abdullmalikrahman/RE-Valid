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
