from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
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
async def add_station(data: StationCreate, db: AsyncSession = Depends(get_db)):
    existing = await get_station_by_id(db, data.id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Stasiun dengan ID '{data.id}' sudah ada",
        )
    return await create_station(db, data)


@router.patch("/{station_id}", response_model=StationResponse)
async def edit_station(
    station_id: str, data: StationUpdate, db: AsyncSession = Depends(get_db)
):
    station = await update_station(db, station_id, data)
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stasiun tidak ditemukan",
        )
    return station


@router.delete("/{station_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_station(station_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await delete_station(db, station_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stasiun tidak ditemukan",
        )
