from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Integer,
    Numeric,
    SmallInteger,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Station(Base):
    __tablename__ = "stations"

    id: Mapped[str] = mapped_column(String(10), primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    lat: Mapped[float] = mapped_column(nullable=False)
    lon: Mapped[float] = mapped_column(nullable=False)
    geom: Mapped[str | None] = mapped_column(
        Geometry("POINT", srid=4326), nullable=True
    )
    region: Mapped[str | None] = mapped_column(String(200))
    altitude: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="kandidat"
    )
    score: Mapped[int] = mapped_column(SmallInteger, default=0)
    period: Mapped[str | None] = mapped_column(String(100))
    variables: Mapped[str | None] = mapped_column(String(200))
    mcp_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )
    wind_speed: Mapped[float | None] = mapped_column(Numeric(5, 2))
    irradiation: Mapped[float | None] = mapped_column(Numeric(5, 2))
    aep: Mapped[int | None] = mapped_column(Integer)
    rmse: Mapped[float | None] = mapped_column(Numeric(6, 3))
    bias: Mapped[float | None] = mapped_column(Numeric(6, 2))
    r2: Mapped[float | None] = mapped_column(Numeric(5, 3))
    last_update: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('prioritas', 'kandidat', 'tidak_sesuai')",
            name="ck_stations_status",
        ),
        CheckConstraint(
            "mcp_status IN ('selesai', 'berjalan', 'pending')",
            name="ck_stations_mcp_status",
        ),
    )

    def __repr__(self) -> str:
        return f"<Station {self.id} {self.name}>"
