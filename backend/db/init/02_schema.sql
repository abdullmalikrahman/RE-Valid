-- ============================================================
-- RE-Valid Database Schema
-- Run order: 02 (after 01_extensions.sql)
-- ============================================================

-- ─── stations ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stations (
    id          VARCHAR(10) PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    geom        GEOMETRY(Point, 4326),
    region      VARCHAR(200),
    altitude    INTEGER,
    status      VARCHAR(20) NOT NULL DEFAULT 'kandidat'
                    CONSTRAINT ck_stations_status
                    CHECK (status IN ('prioritas', 'kandidat', 'tidak_sesuai')),
    score       SMALLINT DEFAULT 0,
    period      VARCHAR(100),
    variables   VARCHAR(200),
    mcp_status  VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CONSTRAINT ck_stations_mcp_status
                    CHECK (mcp_status IN ('selesai', 'berjalan', 'pending')),
    wind_speed  NUMERIC(5,2),        -- m/s rata-rata
    irradiation NUMERIC(5,2),        -- kWh/m²/hari rata-rata
    aep         INTEGER,             -- MWh/tahun estimasi
    rmse        NUMERIC(6,3),        -- m/s (angin) atau kWh/m²/hari (surya)
    bias        NUMERIC(6,2),        -- % relatif terhadap atlas
    r2          NUMERIC(5,3),        -- koefisien determinasi 0–1
    last_update TIMESTAMPTZ DEFAULT NOW(),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: otomatis isi kolom geom dari lat/lon
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

-- Indeks spasial dan status
CREATE INDEX IF NOT EXISTS idx_stations_geom   ON stations USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_stations_status ON stations(status);

-- ─── measurements ─────────────────────────────────────────────────────────────
-- TimescaleDB hypertable untuk data time-series sensor
CREATE TABLE IF NOT EXISTS measurements (
    id           BIGSERIAL,
    station_id   VARCHAR(10)  NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    measured_at  TIMESTAMPTZ  NOT NULL,

    -- Angin
    wind_speed   NUMERIC(6,3),    -- m/s
    wind_dir     NUMERIC(5,1),    -- derajat (0–360)

    -- Surya
    ghi          NUMERIC(8,3),    -- W/m² (Global Horizontal Irradiance)
    dni          NUMERIC(8,3),    -- W/m² (Direct Normal Irradiance)

    -- Atmosfer
    temperature  NUMERIC(5,2),    -- °C
    humidity     NUMERIC(5,2),    -- %
    pressure     NUMERIC(7,2),    -- hPa

    PRIMARY KEY (id, measured_at)
);

-- Konversi ke hypertable TimescaleDB (chunk mingguan)
DO $$
BEGIN
    PERFORM create_hypertable(
        'measurements', 'measured_at',
        chunk_time_interval => INTERVAL '1 week',
        if_not_exists       => TRUE
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TimescaleDB tidak tersedia, lewati create_hypertable: %', SQLERRM;
END $$;

-- Indeks komposit untuk query per stasiun + rentang waktu
CREATE INDEX IF NOT EXISTS idx_measurements_station_time
    ON measurements(station_id, measured_at DESC);

-- ─── users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50)  UNIQUE NOT NULL,
    email           VARCHAR(150) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role            VARCHAR(20)  NOT NULL DEFAULT 'viewer'
                        CONSTRAINT ck_users_role
                        CHECK (role IN ('admin', 'analyst', 'viewer')),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
