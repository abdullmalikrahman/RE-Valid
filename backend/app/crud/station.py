from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.station import Station


async def get_all_stations(db: AsyncSession) -> list[Station]:
    result = await db.execute(select(Station).order_by(Station.name))
    return list(result.scalars().all())


async def get_station_by_id(db: AsyncSession, station_id: str) -> Station | None:
    result = await db.execute(select(Station).where(Station.id == station_id))
    return result.scalar_one_or_none()
