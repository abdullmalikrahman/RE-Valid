"""add atlas baseline columns to stations

Revision ID: a1b2c3d4e5f6
Revises: 77a3f4d5c7bd
Create Date: 2026-04-20 00:00:00.000000

Tambah dua kolom baseline atlas ke tabel stations:
  wind_baseline  — kecepatan angin rata-rata dari GWA (m/s) per koordinat stasiun
  ghi_baseline   — iradiasi GHI rata-rata dari PVGIS/GSA (kWh/m²/hari) per koordinat stasiun
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '77a3f4d5c7bd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'stations',
        sa.Column('wind_baseline', sa.Numeric(5, 2), nullable=True,
                  comment='Long-term mean wind speed from GWA atlas (m/s)'),
    )
    op.add_column(
        'stations',
        sa.Column('ghi_baseline', sa.Numeric(5, 2), nullable=True,
                  comment='Long-term mean GHI from PVGIS/GSA atlas (kWh/m²/day)'),
    )


def downgrade() -> None:
    op.drop_column('stations', 'ghi_baseline')
    op.drop_column('stations', 'wind_baseline')
