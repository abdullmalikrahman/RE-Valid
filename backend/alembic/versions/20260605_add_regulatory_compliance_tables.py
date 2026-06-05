"""add regulatory compliance layers

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-05 00:00:00.000000

Menyediakan tabel layer regulasi resmi untuk compliance engine.
Layer dapat diisi dari GeoJSON/SHP resmi yang sudah dikonversi ke GeoJSON.
Endpoint compliance kemudian melakukan overlay koordinat stasiun ke fitur
spasial ini menggunakan PostGIS.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "regulatory_layers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("source", sa.String(200), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("source_date", sa.String(40), nullable=True),
        sa.Column("is_official", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("code", name="uq_regulatory_layers_code"),
    )
    op.create_index(
        "ix_regulatory_layers_category",
        "regulatory_layers",
        ["category"],
    )

    op.create_table(
        "regulatory_features",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "layer_id",
            sa.Integer(),
            sa.ForeignKey("regulatory_layers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(250), nullable=True),
        sa.Column("rule_code", sa.String(100), nullable=True),
        sa.Column("status_rule", sa.String(30), nullable=False, server_default="review"),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("properties", sa.JSON(), nullable=True),
        sa.Column("geom", Geometry("GEOMETRY", srid=4326, spatial_index=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "status_rule IN ('allowed', 'conditional', 'restricted', 'review', 'informational')",
            name="ck_regulatory_features_status_rule",
        ),
    )
    op.create_index(
        "ix_regulatory_features_layer_id",
        "regulatory_features",
        ["layer_id"],
    )
    op.create_index(
        "ix_regulatory_features_status_rule",
        "regulatory_features",
        ["status_rule"],
    )
    op.create_index(
        "idx_regulatory_features_geom",
        "regulatory_features",
        ["geom"],
        postgresql_using="gist",
    )


def downgrade() -> None:
    op.drop_index("idx_regulatory_features_geom", table_name="regulatory_features")
    op.drop_index("ix_regulatory_features_status_rule", table_name="regulatory_features")
    op.drop_index("ix_regulatory_features_layer_id", table_name="regulatory_features")
    op.drop_table("regulatory_features")
    op.drop_index("ix_regulatory_layers_category", table_name="regulatory_layers")
    op.drop_table("regulatory_layers")
