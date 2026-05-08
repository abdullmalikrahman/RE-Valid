"""add per-variable validation metrics columns

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-06 00:00:00.000000

Tambah enam kolom metrik validasi per-variabel ke tabel stations:
  wind_rmse  — RMSE validasi angin (m/s)
  wind_bias  — Bias validasi angin (%)
  wind_r2    — R² / skill score validasi angin
  solar_rmse — RMSE validasi iradiasi surya (kWh/m²/hari)
  solar_bias — Bias validasi iradiasi surya (%)
  solar_r2   — R² / skill score validasi iradiasi surya

Kolom rmse/bias/r2 yang sudah ada tetap dipertahankan sebagai
nilai dari validasi terakhir yang dijalankan (backward compat).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('stations', sa.Column('wind_rmse',  sa.Numeric(6, 3), nullable=True))
    op.add_column('stations', sa.Column('wind_bias',  sa.Numeric(6, 2), nullable=True))
    op.add_column('stations', sa.Column('wind_r2',    sa.Numeric(5, 3), nullable=True))
    op.add_column('stations', sa.Column('solar_rmse', sa.Numeric(6, 3), nullable=True))
    op.add_column('stations', sa.Column('solar_bias', sa.Numeric(6, 2), nullable=True))
    op.add_column('stations', sa.Column('solar_r2',   sa.Numeric(5, 3), nullable=True))

    # Backfill: stasiun yang sudah selesai divalidasi dengan variabel angin
    # → salin nilai rmse/bias/r2 yang ada ke wind_rmse/bias/r2
    # (karena semua validasi existing menggunakan variable="wind")
    op.execute("""
        UPDATE stations
        SET wind_rmse = rmse,
            wind_bias = bias,
            wind_r2   = r2
        WHERE mcp_status = 'selesai'
          AND rmse IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_column('stations', 'solar_r2')
    op.drop_column('stations', 'solar_bias')
    op.drop_column('stations', 'solar_rmse')
    op.drop_column('stations', 'wind_r2')
    op.drop_column('stations', 'wind_bias')
    op.drop_column('stations', 'wind_rmse')
