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
#   3. NASA POWER ERA5            — REST API (fallback & pembanding)
#
# Prioritas:
#   wind_baseline = GWA  jika file GeoTIFF tersedia, else NASA POWER
#   ghi_baseline  = GSA  (selalu tersedia via API), else NASA POWER
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
      · NASA → wind_baseline_nasa + ghi_baseline_nasa  (dari NASA POWER ERA5)
    Nilai wind_baseline dan ghi_baseline diisi dengan sumber terbaik yang tersedia.
    """
    from app.workers.atlas_reader import fetch_gsa_ghi, read_gwa_wind

    station = await get_station_by_id(db, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Stasiun tidak ditemukan")

    lat, lon = float(station.lat), float(station.lon)

    # ── 1. GWA : baca dari GeoTIFF lokal (sync, tidak perlu await) ────────────
    gwa_wind: float | None = read_gwa_wind(lat, lon)

    # ── 2. GSA : Solargis REST API ─────────────────────────────────────────────
    gsa_ghi: float | None = await fetch_gsa_ghi(lat, lon)

    # ── 3. NASA POWER ERA5 : REST API ─────────────────────────────────────────
    nasa_wind: float | None = None
    nasa_ghi: float | None = None

    nasa_url = "https://power.larc.nasa.gov/api/temporal/climatology/point"
    nasa_params = {
        "parameters": "ALLSKY_SFC_SW_DWN,WS100M",
        "community": "RE",
        "longitude": lon,
        "latitude": lat,
        "format": "JSON",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(nasa_url, params=nasa_params)
            r.raise_for_status()
            params_data = r.json()["properties"]["parameter"]
            raw_ghi  = params_data.get("ALLSKY_SFC_SW_DWN", {}).get("ANN")
            raw_wind = params_data.get("WS100M", {}).get("ANN")
            if raw_wind is not None and float(raw_wind) > 0:
                nasa_wind = round(float(raw_wind), 2)
            if raw_ghi is not None and float(raw_ghi) > 0:
                nasa_ghi = round(float(raw_ghi), 2)
    except Exception as exc:
        # NASA POWER gagal — lanjutkan dengan GWA/GSA saja jika tersedia
        import logging
        logging.getLogger(__name__).warning("NASA POWER gagal: %s", exc)

    # ── Tentukan nilai terbaik ─────────────────────────────────────────────────
    best_wind = gwa_wind if gwa_wind is not None else nasa_wind
    best_ghi  = gsa_ghi  if gsa_ghi  is not None else nasa_ghi

    if best_wind is None and best_ghi is None:
        raise HTTPException(
            status_code=502,
            detail=(
                "Semua sumber atlas gagal (GWA file tidak ada, GSA API tidak responsif, "
                "NASA POWER tidak responsif). Coba input baseline secara manual."
            ),
        )

    update_data = StationUpdate(
        wind_baseline=best_wind,
        ghi_baseline=best_ghi,
        wind_baseline_gwa=gwa_wind,
        ghi_baseline_gsa=gsa_ghi,
        wind_baseline_nasa=nasa_wind,
        ghi_baseline_nasa=nasa_ghi,
    )
    updated = await update_station(db, station_id, update_data)
    return updated
