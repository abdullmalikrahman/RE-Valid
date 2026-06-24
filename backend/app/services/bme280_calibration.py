from decimal import Decimal

from app.core.config import settings

# The calibration charts use FLUKE 971 as X and BME280 as Y:
#   BME temperature = 0.8319 * FLUKE temperature + 2.5098
#   BME humidity    = 0.9719 * FLUKE humidity    + 4.3824
# Backend receives stored BME280 readings, so use the inverse equations to
# return FLUKE-equivalent values.
TEMP_SLOPE = 0.8319
TEMP_INTERCEPT = 2.5098
HUMIDITY_SLOPE = 0.9719
HUMIDITY_INTERCEPT = 4.3824


def calibrate_temperature(raw_value: float | Decimal | None) -> float | None:
    if raw_value is None:
        return None
    if not settings.BME280_CALIBRATION_ENABLED:
        return float(raw_value)

    calibrated = (float(raw_value) - TEMP_INTERCEPT) / TEMP_SLOPE
    return round(calibrated, 2)


def calibrate_humidity(raw_value: float | Decimal | None) -> float | None:
    if raw_value is None:
        return None
    if not settings.BME280_CALIBRATION_ENABLED:
        return float(raw_value)

    calibrated = (float(raw_value) - HUMIDITY_INTERCEPT) / HUMIDITY_SLOPE
    return round(min(max(calibrated, 0.0), 100.0), 2)
