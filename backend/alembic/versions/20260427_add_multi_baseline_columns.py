"""add multi-source baseline columns to stations

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-27 00:00:00.000000

Tambah empat kolom baseline per-sumber ke tabel stations:
  wind_baseline_gwa  — kecepatan angin rata-rata dari GWA GeoTIFF 100m (m/s)
  ghi_baseline_gsa   — iradiasi GHI rata-rata dari GSA/Solargis API (kWh/m²/hari)
  wind_baseline_nasa — kecepatan angin rata-rata dari NASA POWER ERA5 100m (m/s)
  ghi_baseline_nasa  — iradiasi GHI rata-rata dari NASA POWER ERA5 (kWh/m²/hari)

Kolom wind_baseline dan ghi_baseline yang sudah ada tetap dipakai sebagai
nilai "terbaik yang tersedia" (GWA/GSA jika ada, fallback ke NASA POWER):
  wind_baseline = wind_baseline_gwa  jika tersedia, else wind_baseline_nasa
  ghi_baseline  = ghi_baseline_gsa   (selalu tersedia via API)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'stations',
        sa.Column('wind_baseline_gwa', sa.Numeric(5, 2), nullable=True,
                  comment='Mean wind speed at 100m from GWA GeoTIFF (m/s)'),
    )
    op.add_column(
        'stations',
        sa.Column('ghi_baseline_gsa', sa.Numeric(5, 2), nullable=True,
                  comment='Mean GHI from Global Solar Atlas / Solargis API (kWh/m²/day)'),
    )
    op.add_column(
        'stations',
        sa.Column('wind_baseline_nasa', sa.Numeric(5, 2), nullable=True,
                  comment='Mean wind speed at 100m from NASA POWER ERA5 (m/s)'),
    )
    op.add_column(
        'stations',
        sa.Column('ghi_baseline_nasa', sa.Numeric(5, 2), nullable=True,
                  comment='Mean GHI from NASA POWER ERA5 (kWh/m²/day)'),
    )


def downgrade() -> None:
    op.drop_column('stations', 'ghi_baseline_nasa')
    op.drop_column('stations', 'wind_baseline_nasa')
    op.drop_column('stations', 'ghi_baseline_gsa')
    op.drop_column('stations', 'wind_baseline_gwa')
