"""add unique constraint on (station_id, measured_at)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-27 00:00:00.000000

Tambah unique index pada (station_id, measured_at) untuk mencegah data duplikat
di level database. Sebelum membuat constraint, bersihkan row duplikat yang sudah
ada dengan mempertahankan hanya satu row (id terkecil) per pasangan unik.

Catatan TimescaleDB:
  UNIQUE index pada hypertable wajib menyertakan kolom partisi (measured_at),
  sehingga format (station_id, measured_at) sudah memenuhi syarat ini.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Hapus duplikat: pertahankan hanya row dengan id terkecil per (station_id, measured_at)
    op.execute("""
        DELETE FROM measurements
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM measurements
            GROUP BY station_id, measured_at
        )
    """)

    # Buat unique index — mencegah duplikat di level database setelah cleanup
    op.create_index(
        "uq_measurements_station_time",
        "measurements",
        ["station_id", "measured_at"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_measurements_station_time", table_name="measurements")
