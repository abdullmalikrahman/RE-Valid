from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.measurement import get_latest_per_station, get_measurements
from app.schemas.measurement import MeasurementResponse

router = APIRouter()


@router.get("/latest", response_model=list[MeasurementResponse])
async def latest_measurements(db: AsyncSession = Depends(get_db)):
    return await get_latest_per_station(db)


@router.get("", response_model=list[MeasurementResponse])
async def list_measurements(
    station_id: str,
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    limit: int = Query(1000, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
):
    return await get_measurements(db, station_id, start, end, limit)
