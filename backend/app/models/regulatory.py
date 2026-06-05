from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RegulatoryLayer(Base):
    __tablename__ = "regulatory_layers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    source: Mapped[str | None] = mapped_column(String(200))
    source_url: Mapped[str | None] = mapped_column(Text)
    source_date: Mapped[str | None] = mapped_column(String(40))
    is_official: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    features: Mapped[list["RegulatoryFeature"]] = relationship(
        back_populates="layer",
        cascade="all, delete-orphan",
    )


class RegulatoryFeature(Base):
    __tablename__ = "regulatory_features"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    layer_id: Mapped[int] = mapped_column(
        ForeignKey("regulatory_layers.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str | None] = mapped_column(String(250))
    rule_code: Mapped[str | None] = mapped_column(String(100))
    status_rule: Mapped[str] = mapped_column(String(30), nullable=False, default="review")
    message: Mapped[str | None] = mapped_column(Text)
    properties: Mapped[dict | None] = mapped_column(JSON)
    geom: Mapped[str] = mapped_column(
        Geometry("GEOMETRY", srid=4326, spatial_index=False),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    layer: Mapped[RegulatoryLayer] = relationship(back_populates="features")


Index("ix_regulatory_layers_category", RegulatoryLayer.category)
Index("ix_regulatory_features_layer_id", RegulatoryFeature.layer_id)
Index("ix_regulatory_features_status_rule", RegulatoryFeature.status_rule)
