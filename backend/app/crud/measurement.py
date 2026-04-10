from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.measurement import Measurement


async def bulk_insert_measurements(
    db: AsyncSession,
    rows: list[dict],
) -> dict[str, int]:
    """Insert measurement rows from CSV upload. Skips duplicates (same station_id + measured_at)."""
    if not rows:
        return {"inserted": 0, "skipped": 0}

    stmt = (
        insert(Measurement)
        .values(rows)
        .on_conflict_do_nothing(index_elements=["station_id", "measured_at"])
    )
    result = await db.execute(stmt)
    await db.commit()
    inserted = result.rowcount if result.rowcount >= 0 else len(rows)
    skipped = len(rows) - inserted
    return {"inserted": inserted, "skipped": skipped}


async def get_measurements(
    db: AsyncSession,
    station_id: str,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = 1000,
) -> list[Measurement]:
    q = select(Measurement).where(Measurement.station_id == station_id)
    if start:
        q = q.where(Measurement.measured_at >= start)
    if end:
        q = q.where(Measurement.measured_at <= end)
    q = q.order_by(Measurement.measured_at.asc()).limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_latest_per_station(db: AsyncSession) -> list[Measurement]:
    subq = (
        select(
            Measurement.station_id,
            func.max(Measurement.measured_at).label("max_at"),
        )
        .group_by(Measurement.station_id)
        .subquery()
    )
    q = select(Measurement).join(
        subq,
        (Measurement.station_id == subq.c.station_id)
        & (Measurement.measured_at == subq.c.max_at),
    )
    result = await db.execute(q)
    return list(result.scalars().all())
