from datetime import datetime

from pydantic import BaseModel, ConfigDict


class StationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    lat: float
    lon: float
    region: str | None
    altitude: int | None
    status: str
    score: int
    period: str | None
    variables: str | None
    mcp_status: str
    wind_speed: float | None
    irradiation: float | None
    aep: int | None
    rmse: float | None
    bias: float | None
    r2: float | None
    last_update: datetime
