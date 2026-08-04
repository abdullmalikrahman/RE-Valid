from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class StationPeriodBaseline(Base):
    """Actual ERA5 baseline per local measurement date for one station."""

    __tablename__ = "station_period_baselines"

    station_id: Mapped[str] = mapped_column(
        String(10),
        ForeignKey("stations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    baseline_date: Mapped[date] = mapped_column(
        Date,
        primary_key=True,
        comment="Measurement-period date in Asia/Jakarta local time",
    )
    wind_era5_actual: Mapped[float | None] = mapped_column(
        Numeric(5, 3),
        nullable=True,
        comment="Actual ERA5 100m mean wind speed for this date (m/s)",
    )
    ghi_era5_actual: Mapped[float | None] = mapped_column(
        Numeric(6, 3),
        nullable=True,
        comment="Actual ERA5 daily GHI for this date (kWh/m2/day)",
    )
    source: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default="era5_actual",
        server_default="era5_actual",
    )
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
