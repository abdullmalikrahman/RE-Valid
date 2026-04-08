from datetime import datetime

from sqlalchemy import (
    BigInteger,
    ForeignKey,
    Numeric,
    PrimaryKeyConstraint,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Measurement(Base):
    __tablename__ = "measurements"

    id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    station_id: Mapped[str] = mapped_column(
        String(10),
        ForeignKey("stations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    measured_at: Mapped[datetime] = mapped_column(nullable=False)

    # Wind
    wind_speed: Mapped[float | None] = mapped_column(Numeric(6, 3))   # m/s
    wind_dir: Mapped[float | None] = mapped_column(Numeric(5, 1))     # degrees

    # Solar
    ghi: Mapped[float | None] = mapped_column(Numeric(8, 3))          # W/m²
    dni: Mapped[float | None] = mapped_column(Numeric(8, 3))          # W/m²

    # Atmospheric
    temperature: Mapped[float | None] = mapped_column(Numeric(5, 2))  # °C
    humidity: Mapped[float | None] = mapped_column(Numeric(5, 2))     # %
    pressure: Mapped[float | None] = mapped_column(Numeric(7, 2))     # hPa

    __table_args__ = (
        # TimescaleDB requires time column in PK for hypertable partitioning
        PrimaryKeyConstraint("id", "measured_at", name="pk_measurements"),
    )

    def __repr__(self) -> str:
        return f"<Measurement station={self.station_id} at={self.measured_at}>"
