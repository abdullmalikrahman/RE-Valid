from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class StationCreate(BaseModel):
    id: str = Field(..., max_length=10)
    name: str = Field(..., max_length=150)
    lat: float
    lon: float
    region: Optional[str] = None
    altitude: Optional[int] = None
    status: str = Field("kandidat", pattern="^(prioritas|kandidat|tidak_sesuai)$")
    score: int = Field(0, ge=0, le=100)


class StationUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=150)
    lat: Optional[float] = None
    lon: Optional[float] = None
    region: Optional[str] = None
    altitude: Optional[int] = None
    status: Optional[str] = Field(None, pattern="^(prioritas|kandidat|tidak_sesuai)$")
    score: Optional[int] = Field(None, ge=0, le=100)


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
