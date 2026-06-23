from datetime import datetime, timedelta, timezone
from decimal import Decimal
from math import sqrt

from app.core.config import settings

WIB = timezone(timedelta(hours=7))

# Firmware default anemometer before the final backend calibration flow.
# The stored column is named wind_speed, but historical firmware generated it
# from RPM with this factor rather than sending calibrated wind speed.
DEFAULT_SENSOR_FACTOR_MPS_PER_RPM = 0.00576

# Final calibration from the latest anemometer test:
# wind_speed (m/s) = 0.6959 * RPS + 0.3427, where RPS = RPM / 60.
FINAL_RPS_SLOPE = 0.6959
FINAL_INTERCEPT = 0.3427

# Older equation that was briefly embedded in LOC-02 firmware after
# 12 Jun 2026 14:20 WIB. Backend must invert this first to avoid applying
# calibration twice.
OLD_POLY_A = -0.0181
OLD_POLY_B = 1.3859
OLD_POLY_C = 1.4055

DEFAULT_CALIBRATION_STATIONS = {"LOC-01", "LOC-02", "LOC-03"}
OLD_FIRMWARE_STATIONS = {"LOC-02"}


def _station_ids() -> set[str]:
    configured = {
        item.strip().upper()
        for item in settings.WIND_CALIBRATION_STATIONS.split(",")
        if item.strip()
    }
    return DEFAULT_CALIBRATION_STATIONS | configured


def _cutoff() -> datetime:
    value = datetime.fromisoformat(settings.WIND_CALIBRATION_CUTOFF)
    if value.tzinfo is None:
        return value.replace(tzinfo=WIB)
    return value


def _as_wib(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=WIB)
    return value.astimezone(WIB)


def _is_old_firmware_output(station_id: str, measured_at: datetime) -> bool:
    return (
        station_id.upper() in OLD_FIRMWARE_STATIONS
        and _as_wib(measured_at) >= _cutoff().astimezone(WIB)
    )


def should_calibrate_wind(station_id: str, measured_at: datetime) -> bool:
    return (
        settings.WIND_CALIBRATION_ENABLED
        and station_id.upper() in _station_ids()
        and measured_at is not None
    )


def _final_from_default_sensor(raw_value: float) -> float:
    if raw_value <= 0:
        return 0.0

    rpm = raw_value / DEFAULT_SENSOR_FACTOR_MPS_PER_RPM
    rps = rpm / 60.0
    return max((FINAL_RPS_SLOPE * rps) + FINAL_INTERCEPT, 0.0)


def _old_firmware_to_default_sensor(old_value: float) -> float:
    if old_value <= 0:
        return 0.0

    discriminant = (OLD_POLY_B**2) - (4.0 * OLD_POLY_A * (OLD_POLY_C - old_value))
    root = (-OLD_POLY_B + sqrt(max(discriminant, 0.0))) / (2.0 * OLD_POLY_A)
    return max(root, 0.0)


def calibrate_wind_speed(raw_value: float | Decimal | None) -> float | None:
    if raw_value is None:
        return None

    corrected = _final_from_default_sensor(float(raw_value))
    return round(corrected, 3)


def calibrate_old_firmware_wind_speed(raw_value: float | Decimal | None) -> float | None:
    if raw_value is None:
        return None

    default_sensor_value = _old_firmware_to_default_sensor(float(raw_value))
    corrected = _final_from_default_sensor(default_sensor_value)
    return round(corrected, 3)


def calibrated_wind_speed(
    station_id: str,
    measured_at: datetime,
    raw_value: float | Decimal | None,
) -> float | Decimal | None:
    if not should_calibrate_wind(station_id, measured_at):
        return raw_value

    if _is_old_firmware_output(station_id, measured_at):
        return calibrate_old_firmware_wind_speed(raw_value)

    return calibrate_wind_speed(raw_value)


def _final_from_default_sql(default_expr: str) -> str:
    return (
        "CASE "
        f"WHEN ({default_expr}) <= 0 THEN 0.0 "
        "ELSE GREATEST("
        f"({FINAL_RPS_SLOPE} * ((({default_expr}) / {DEFAULT_SENSOR_FACTOR_MPS_PER_RPM}) / 60.0)) "
        f"+ {FINAL_INTERCEPT}, "
        "0.0) "
        "END"
    )


def _old_firmware_to_default_sql(old_expr: str) -> str:
    discriminant = (
        f"(({OLD_POLY_B} * {OLD_POLY_B}) "
        f"- (4.0 * ({OLD_POLY_A}) * ({OLD_POLY_C} - ({old_expr}))))"
    )
    return (
        "GREATEST("
        f"(((-{OLD_POLY_B}) + SQRT(GREATEST({discriminant}, 0.0))) "
        f"/ (2.0 * ({OLD_POLY_A}))), "
        "0.0)"
    )


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
    old_station_ids = ", ".join(f"'{sid}'" for sid in sorted(OLD_FIRMWARE_STATIONS))
    cutoff_sql = _cutoff().astimezone(WIB).isoformat()
    value_expr = f"({value_col})::float"
    default_expr = _final_from_default_sql(value_expr)
    old_output_expr = _final_from_default_sql(_old_firmware_to_default_sql(value_expr))

    return (
        "CASE "
        f"WHEN {value_col} IS NULL THEN NULL "
        f"WHEN UPPER({station_col}) IN ({old_station_ids}) "
        f"AND {measured_col} >= TIMESTAMPTZ '{cutoff_sql}' "
        f"THEN {old_output_expr} "
        f"WHEN UPPER({station_col}) IN ({station_ids}) "
        f"THEN {default_expr} "
        f"ELSE {value_expr} "
        "END"
    )
