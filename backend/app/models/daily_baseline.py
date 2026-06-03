from sqlalchemy import ForeignKey, Numeric, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class StationDailyBaseline(Base):
    """Daily climatology baseline ERA5 per DOY (1–366) per stasiun.

    Satu baris = satu hari-dalam-tahun untuk satu stasiun.
    Nilai = rata-rata 12 tahun (2014–2025) dari ERA5 untuk DOY tersebut.
    """
    __tablename__ = "station_daily_baselines"

    station_id: Mapped[str] = mapped_column(
        String(10),
        ForeignKey("stations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    doy: Mapped[int] = mapped_column(SmallInteger, primary_key=True,
                                     comment="Day of Year 1–366")
    ghi_era5: Mapped[float | None] = mapped_column(
        Numeric(6, 3), nullable=True,
        comment="ERA5 mean GHI for this DOY, 2014–2025 (kWh/m²/hari)",
    )
    wind_era5: Mapped[float | None] = mapped_column(
        Numeric(5, 3), nullable=True,
        comment="ERA5 mean wind 100m for this DOY, 2014–2025 (m/s)",
    )
