"""add station_daily_baselines table

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-03 00:00:00.000000

Menambah tabel station_daily_baselines untuk menyimpan
daily climatology ERA5 per DOY (1–366) per stasiun.

Tabel ini digunakan agar perbandingan obs vs baseline
dilakukan secara temporal yang setara: hari pengukuran
dibandingkan dengan rata-rata hari yang SAMA di 2014–2025,
bukan dengan rata-rata tahunan yang flat (LTA).

Ukuran: 366 baris per stasiun (sangat kecil).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'station_daily_baselines',
        sa.Column('station_id', sa.String(10), sa.ForeignKey('stations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('doy', sa.SmallInteger(), nullable=False,
                  comment='Day of Year 1–366'),
        sa.Column('ghi_era5', sa.Numeric(6, 3), nullable=True,
                  comment='ERA5 mean GHI for this DOY, 2014–2025 (kWh/m²/hari)'),
        sa.Column('wind_era5', sa.Numeric(5, 3), nullable=True,
                  comment='ERA5 mean wind 100m for this DOY, 2014–2025 (m/s)'),
        sa.PrimaryKeyConstraint('station_id', 'doy'),
    )
    op.create_index(
        'ix_station_daily_baselines_station_id',
        'station_daily_baselines',
        ['station_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_station_daily_baselines_station_id', table_name='station_daily_baselines')
    op.drop_table('station_daily_baselines')
