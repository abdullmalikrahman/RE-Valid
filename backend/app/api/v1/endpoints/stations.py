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
# Endpoint: ambil nilai baseline atlas dari PVGIS (GHI) dan GWA (wind speed)
# ---------------------------------------------------------------------------

@router.post("/{station_id}/fetch-atlas", response_model=StationResponse)
async def fetch_atlas_baseline(
    station_id: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    Ambil nilai GHI (kWh/m²/hari) dan kecepatan angin 100m (m/s) dari
    NASA POWER Climatology API berdasarkan koordinat lat/lon stasiun,
    lalu simpan ke kolom wind_baseline dan ghi_baseline di DB.
    API ini gratis dan tidak memerlukan autentikasi.
    """
    station = await get_station_by_id(db, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Stasiun tidak ditemukan")

    lat, lon = station.lat, station.lon

    ghi_val: float | None = None
    wind_val: float | None = None

    # NASA POWER Climatology API — data reanalysis ERA5, rata-rata multi-tahun
    # Parameter: ALLSKY_SFC_SW_DWN (GHI kWh/m²/day), WS100M (wind speed 100m m/s)
    nasa_url = "https://power.larc.nasa.gov/api/temporal/climatology/point"
    nasa_params = {
        "parameters": "ALLSKY_SFC_SW_DWN,WS100M",
        "community": "RE",
        "longitude": lon,
        "latitude": lat,
        "format": "JSON",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.get(nasa_url, params=nasa_params)
            r.raise_for_status()
            data = r.json()
            params_data = data["properties"]["parameter"]

            # ANN = annual climatological mean
            raw_ghi = params_data.get("ALLSKY_SFC_SW_DWN", {}).get("ANN")
            raw_wind = params_data.get("WS100M", {}).get("ANN")

            if raw_ghi is not None and float(raw_ghi) > 0:
                ghi_val = round(float(raw_ghi), 2)
            if raw_wind is not None and float(raw_wind) > 0:
                wind_val = round(float(raw_wind), 2)

        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Gagal mengambil data dari NASA POWER: {exc}. Coba input manual.",
            )

    if ghi_val is None and wind_val is None:
        raise HTTPException(
            status_code=502,
            detail="NASA POWER tidak mengembalikan data valid. Coba input nilai baseline secara manual.",
        )

    update_data = StationUpdate(
        wind_baseline=wind_val,
        ghi_baseline=ghi_val,
    )
    updated = await update_station(db, station_id, update_data)
    return updated
