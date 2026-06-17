from datetime import datetime, timezone

from sqlalchemy import func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import set_committed_value

from app.models.measurement import Measurement
from app.models.station import Station
from app.schemas.station import StationCreate, StationUpdate
from app.services.wind_calibration import wind_speed_sql_expr

MIN_REASONABLE_MEASUREMENT_AT = datetime(2024, 1, 1, tzinfo=timezone.utc)


async def _attach_measurement_summary(db: AsyncSession, stations: list[Station]) -> None:
    if not stations:
        return

    # Attach first/last measurement timestamps for sane sensor data only.
    # RTC/NTP failures can create ISO-valid rows around year 2000; those
    # must not become the default analysis period.
    station_ids = [s.id for s in stations]
    calibrated_wind_expr = literal_column(
        wind_speed_sql_expr(
            "measurements.wind_speed",
            "measurements.station_id",
            "measurements.measured_at",
        )
    )
    meas_result = await db.execute(
        select(
            Measurement.station_id,
            func.min(Measurement.measured_at).label("first_meas"),
            func.max(Measurement.measured_at).label("last_meas"),
        )
        .where(
            Measurement.station_id.in_(station_ids),
            Measurement.measured_at >= MIN_REASONABLE_MEASUREMENT_AT,
        )
        .group_by(Measurement.station_id)
    )
    meas_map = {row.station_id: row for row in meas_result}

    wind_result = await db.execute(
        select(
            Measurement.station_id,
            func.avg(calibrated_wind_expr).label("avg_wind_speed"),
        )
        .where(
            Measurement.station_id.in_(station_ids),
            Measurement.measured_at >= MIN_REASONABLE_MEASUREMENT_AT,
            Measurement.wind_speed.is_not(None),
        )
        .group_by(Measurement.station_id)
    )
    wind_avg_map = {row.station_id: row.avg_wind_speed for row in wind_result}

    for station in stations:
        row = meas_map.get(station.id)
        station.first_measurement_at = row.first_meas if row else None  # type: ignore[attr-defined]
        station.last_measurement_at = row.last_meas if row else None  # type: ignore[attr-defined]

        avg_wind_speed = wind_avg_map.get(station.id)
        if avg_wind_speed is not None:
            # Keep this as response-only data. The persisted stations.wind_speed
            # remains controlled by MCP/explicit station updates, not by reads.
            set_committed_value(station, "wind_speed", round(float(avg_wind_speed), 2))


async def get_all_stations(db: AsyncSession) -> list[Station]:
    result = await db.execute(select(Station).order_by(Station.name))
    stations = list(result.scalars().all())

    await _attach_measurement_summary(db, stations)

    return stations


async def get_station_by_id(db: AsyncSession, station_id: str) -> Station | None:
    result = await db.execute(select(Station).where(Station.id == station_id))
    station = result.scalar_one_or_none()
    if station is not None:
        await _attach_measurement_summary(db, [station])
    return station


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
