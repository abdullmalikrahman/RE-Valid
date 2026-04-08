"""initial_schema

Revision ID: 77a3f4d5c7bd
Revises: 
Create Date: 2026-04-07 00:52:06.790622

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry


# revision identifiers, used by Alembic.
revision: str = '77a3f4d5c7bd'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── stations ──────────────────────────────────────────────────────────────
    op.create_table(
        "stations",
        sa.Column("id",          sa.String(10),  primary_key=True),
        sa.Column("name",        sa.String(150), nullable=False),
        sa.Column("lat",         sa.Float,       nullable=False),
        sa.Column("lon",         sa.Float,       nullable=False),
        sa.Column("geom",        Geometry("POINT", srid=4326), nullable=True),
        sa.Column("region",      sa.String(200)),
        sa.Column("altitude",    sa.Integer),
        sa.Column("status",      sa.String(20),  nullable=False, server_default="kandidat"),
        sa.Column("score",       sa.SmallInteger, server_default="0"),
        sa.Column("period",      sa.String(100)),
        sa.Column("variables",   sa.String(200)),
        sa.Column("mcp_status",  sa.String(20),  nullable=False, server_default="pending"),
        sa.Column("wind_speed",  sa.Numeric(5, 2)),
        sa.Column("irradiation", sa.Numeric(5, 2)),
        sa.Column("aep",         sa.Integer),
        sa.Column("rmse",        sa.Numeric(6, 3)),
        sa.Column("bias",        sa.Numeric(6, 2)),
        sa.Column("r2",          sa.Numeric(5, 3)),
        sa.Column("last_update", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('prioritas', 'kandidat', 'tidak_sesuai')",
            name="ck_stations_status",
        ),
        sa.CheckConstraint(
            "mcp_status IN ('selesai', 'berjalan', 'pending')",
            name="ck_stations_mcp_status",
        ),
    )
    op.create_index("idx_stations_geom",   "stations", ["geom"],   postgresql_using="gist")
    op.create_index("idx_stations_status", "stations", ["status"])

    # Trigger: auto-fill geom from lat/lon
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_stations_update_geom()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lon, NEW.lat), 4326);
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_stations_geom ON stations;
        CREATE TRIGGER trg_stations_geom
            BEFORE INSERT OR UPDATE OF lat, lon ON stations
            FOR EACH ROW EXECUTE FUNCTION fn_stations_update_geom();
    """)

    # ── measurements (TimescaleDB hypertable) ─────────────────────────────────
    op.create_table(
        "measurements",
        sa.Column("id",          sa.BigInteger, nullable=False),
        sa.Column("station_id",  sa.String(10),
                  sa.ForeignKey("stations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("wind_speed",  sa.Numeric(6, 3)),
        sa.Column("wind_dir",    sa.Numeric(5, 1)),
        sa.Column("ghi",         sa.Numeric(8, 3)),
        sa.Column("dni",         sa.Numeric(8, 3)),
        sa.Column("temperature", sa.Numeric(5, 2)),
        sa.Column("humidity",    sa.Numeric(5, 2)),
        sa.Column("pressure",    sa.Numeric(7, 2)),
        sa.PrimaryKeyConstraint("id", "measured_at", name="pk_measurements"),
    )
    op.create_index("idx_measurements_station_time", "measurements",
                    ["station_id", sa.text("measured_at DESC")])

    op.execute("""
        DO $$
        BEGIN
            PERFORM create_hypertable(
                'measurements', 'measured_at',
                chunk_time_interval => INTERVAL '1 week',
                if_not_exists       => TRUE
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'TimescaleDB tidak tersedia: %', SQLERRM;
        END $$;
    """)

    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id",              sa.Integer,     primary_key=True, autoincrement=True),
        sa.Column("username",        sa.String(50),  nullable=False, unique=True),
        sa.Column("email",           sa.String(150), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role",            sa.String(20),  nullable=False, server_default="viewer"),
        sa.Column("is_active",       sa.Boolean,     server_default="true"),
        sa.Column("created_at",      sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "role IN ('admin', 'analyst', 'viewer')",
            name="ck_users_role",
        ),
    )
    op.create_index("idx_users_username", "users", ["username"])
    op.create_index("idx_users_email",    "users", ["email"])


def downgrade() -> None:
    op.drop_table("measurements")
    op.drop_table("users")
    op.execute("DROP TRIGGER IF EXISTS trg_stations_geom ON stations")
    op.execute("DROP FUNCTION IF EXISTS fn_stations_update_geom")
    op.drop_table("stations")

