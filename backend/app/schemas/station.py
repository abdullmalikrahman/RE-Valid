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
    wind_baseline: Optional[float] = Field(None, ge=0, description="Best-available wind baseline (GWA jika tersedia, else NASA POWER) (m/s)")
    ghi_baseline: Optional[float] = Field(None, ge=0, description="Best-available GHI baseline (GSA, else NASA POWER) (kWh/m²/day)")
    wind_baseline_gwa: Optional[float] = Field(None, ge=0, description="GWA GeoTIFF 100m mean wind speed (m/s)")
    ghi_baseline_gsa: Optional[float] = Field(None, ge=0, description="GSA/Solargis mean GHI (kWh/m²/day)")
    wind_baseline_nasa: Optional[float] = Field(None, ge=0, description="NASA POWER ERA5 WS100M (m/s)")
    ghi_baseline_nasa: Optional[float] = Field(None, ge=0, description="NASA POWER ERA5 ALLSKY_SFC_SW_DWN (kWh/m²/day)")


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
    wind_baseline: float | None
    ghi_baseline: float | None
    wind_baseline_gwa: float | None
    ghi_baseline_gsa: float | None
    wind_baseline_nasa: float | None
    ghi_baseline_nasa: float | None
    aep: int | None
    rmse: float | None
    bias: float | None
    r2: float | None
    last_update: datetime
