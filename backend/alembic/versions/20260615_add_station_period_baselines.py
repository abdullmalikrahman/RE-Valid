"""add actual period baselines

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-15 00:00:00.000000

Menyimpan baseline ERA5 aktual per tanggal pengukuran.
Contoh kebutuhan revisi: LOC-02 periode 8-14 Juni 2026
dibandingkan dengan ERA5 aktual pada tanggal yang sama, bukan LTA.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "station_period_baselines",
        sa.Column(
            "station_id",
            sa.String(10),
            sa.ForeignKey("stations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "baseline_date",
            sa.Date(),
            nullable=False,
            comment="Measurement-period date in Asia/Jakarta local time",
        ),
        sa.Column(
            "wind_era5_actual",
            sa.Numeric(5, 3),
            nullable=True,
            comment="Actual ERA5 100m mean wind speed for this date (m/s)",
        ),
        sa.Column(
            "ghi_era5_actual",
            sa.Numeric(6, 3),
            nullable=True,
            comment="Actual ERA5 daily GHI for this date (kWh/m2/day)",
        ),
        sa.Column(
            "source",
            sa.String(40),
            nullable=False,
            server_default="era5_actual",
        ),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("station_id", "baseline_date"),
    )
    op.create_index(
        "ix_station_period_baselines_station_id",
        "station_period_baselines",
        ["station_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_station_period_baselines_station_id",
        table_name="station_period_baselines",
    )
    op.drop_table("station_period_baselines")
