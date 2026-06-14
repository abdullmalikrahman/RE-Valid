from datetime import datetime, timezone, timedelta
from decimal import Decimal

from app.core.config import settings

WIB = timezone(timedelta(hours=7))


def _station_ids() -> set[str]:
    return {
        item.strip().upper()
        for item in settings.WIND_CALIBRATION_STATIONS.split(",")
        if item.strip()
    }


def _cutoff() -> datetime:
    value = datetime.fromisoformat(settings.WIND_CALIBRATION_CUTOFF)
    if value.tzinfo is None:
        return value.replace(tzinfo=WIB)
    return value


def _as_wib(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=WIB)
    return value.astimezone(WIB)


def should_calibrate_wind(station_id: str, measured_at: datetime) -> bool:
    return (
        settings.WIND_CALIBRATION_ENABLED
        and station_id.upper() in _station_ids()
        and _as_wib(measured_at) < _cutoff().astimezone(WIB)
    )


def calibrate_wind_speed(raw_value: float | Decimal | None) -> float | None:
    if raw_value is None:
        return None

    x = float(raw_value)
    if x <= 0:
        return 0.0

    calibrated = -0.0181 * (x**2) + 1.3859 * x + 1.4055
    return round(max(calibrated, 0.0), 3)


def calibrated_wind_speed(
    station_id: str,
    measured_at: datetime,
    raw_value: float | Decimal | None,
) -> float | Decimal | None:
    if not should_calibrate_wind(station_id, measured_at):
        return raw_value
    return calibrate_wind_speed(raw_value)


def wind_speed_sql_expr(
    value_col: str = "wind_speed",
    station_col: str = "station_id",
    measured_col: str = "measured_at",
) -> str:
    if not settings.WIND_CALIBRATION_ENABLED:
        return value_col

    stations = sorted(_station_ids())
    if not stations:
        return value_col

    station_ids = ", ".join(f"'{sid}'" for sid in stations)
    cutoff_sql = _cutoff().astimezone(WIB).isoformat()
    return (
        "CASE "
        f"WHEN {station_col} IN ({station_ids}) "
        f"AND {measured_col} < TIMESTAMPTZ '{cutoff_sql}' "
        f"AND {value_col} IS NOT NULL "
        f"THEN CASE WHEN {value_col}::float <= 0 THEN 0.0 "
        f"ELSE GREATEST(-0.0181 * POWER({value_col}::float, 2) "
        f"+ 1.3859 * {value_col}::float + 1.4055, 0.0) END "
        f"ELSE {value_col}::float END"
    )
