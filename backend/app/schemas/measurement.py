from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MeasurementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    station_id: str
    measured_at: datetime
    wind_speed: float | None
    wind_dir: float | None
    ghi: float | None
    dni: float | None
    temperature: float | None
    humidity: float | None
    pressure: float | None
