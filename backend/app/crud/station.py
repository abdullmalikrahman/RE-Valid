from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.measurement import Measurement
from app.models.station import Station
from app.schemas.station import StationCreate, StationUpdate


async def get_all_stations(db: AsyncSession) -> list[Station]:
    result = await db.execute(select(Station).order_by(Station.name))
    stations = list(result.scalars().all())

    if stations:
        # Attach last_measurement_at (MAX measured_at per station) to each object
        station_ids = [s.id for s in stations]
        meas_result = await db.execute(
            select(Measurement.station_id, func.max(Measurement.measured_at).label("last_meas"))
            .where(Measurement.station_id.in_(station_ids))
            .group_by(Measurement.station_id)
        )
        last_meas_map = {row.station_id: row.last_meas for row in meas_result}
        for s in stations:
            s.last_measurement_at = last_meas_map.get(s.id)  # type: ignore[attr-defined]

    return stations


async def get_station_by_id(db: AsyncSession, station_id: str) -> Station | None:
    result = await db.execute(select(Station).where(Station.id == station_id))
    return result.scalar_one_or_none()


async def create_station(db: AsyncSession, data: StationCreate) -> Station:
    station = Station(**data.model_dump())
    db.add(station)
    await db.commit()
    await db.refresh(station)
    return station


async def update_station(
    db: AsyncSession, station_id: str, data: StationUpdate
) -> Station | None:
    station = await get_station_by_id(db, station_id)
    if station is None:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(station, field, value)
    await db.commit()
    await db.refresh(station)
    return station


async def delete_station(db: AsyncSession, station_id: str) -> bool:
    station = await get_station_by_id(db, station_id)
    if station is None:
        return False
    await db.delete(station)
    await db.commit()
    return True
