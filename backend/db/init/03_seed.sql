-- ============================================================
-- RE-Valid Seed Data  (6 stasiun Jawa Barat dari stationData.ts)
-- Run order: 03 (setelah 02_schema.sql)
-- ============================================================

INSERT INTO stations (
    id, name, lat, lon,
    region, altitude,
    status, score, period, variables, mcp_status,
    wind_speed, irradiation, aep,
    rmse, bias, r2
) VALUES
    (
        'GWY-089',
        'Pos Pegunungan Wayang',
        -7.2184, 107.6452,
        'Bandung Selatan, Jawa Barat', 1820,
        'prioritas', 92,
        'Jan 2023 – Des 2023', 'Angin, Iradiasi', 'selesai',
        6.8, 5.1, 14200,
        1.450, 1.20, 0.890
    ),
    (
        'CMH-001',
        'Stasiun Cimahi Utara',
        -6.8712, 107.5432,
        'Cimahi, Jawa Barat', 752,
        'prioritas', 87,
        'Jan 2023 – Des 2023', 'Angin, Iradiasi', 'selesai',
        6.2, 4.8, 12450,
        1.820, -0.80, 0.840
    ),
    (
        'PGD-023',
        'Pos Pesisir Pangandaran',
        -7.7041, 108.6508,
        'Pangandaran, Jawa Barat', 12,
        'kandidat', 71,
        'Mar 2023 – Des 2023', 'Angin, Iradiasi', 'berjalan',
        5.4, 4.6, 9800,
        2.310, 4.70, 0.710
    ),
    (
        'SBG-105',
        'Stasiun Subang Utara',
        -6.5891, 107.7621,
        'Subang, Jawa Barat', 48,
        'tidak_sesuai', 44,
        NULL, 'Surya', 'pending',
        3.2, 4.2, NULL,
        NULL, NULL, NULL
    ),
    (
        'GRT-056',
        'Stasiun Garut Selatan',
        -7.4833, 107.8717,
        'Garut, Jawa Barat', 730,
        'kandidat', 76,
        'Feb 2023 – Des 2023', 'Angin, Iradiasi', 'selesai',
        5.9, 4.9, 11100,
        1.930, 2.10, 0.810
    ),
    (
        'TSM-034',
        'Pos Tasikmalaya Timur',
        -7.3544, 108.2248,
        'Tasikmalaya, Jawa Barat', 368,
        'kandidat', 68,
        'Jan 2023 – Sep 2023', 'Angin', 'berjalan',
        5.1, 4.5, 8700,
        2.540, 3.80, 0.740
    )
ON CONFLICT (id) DO UPDATE SET
    name        = EXCLUDED.name,
    lat         = EXCLUDED.lat,
    lon         = EXCLUDED.lon,
    region      = EXCLUDED.region,
    altitude    = EXCLUDED.altitude,
    status      = EXCLUDED.status,
    score       = EXCLUDED.score,
    period      = EXCLUDED.period,
    variables   = EXCLUDED.variables,
    mcp_status  = EXCLUDED.mcp_status,
    wind_speed  = EXCLUDED.wind_speed,
    irradiation = EXCLUDED.irradiation,
    aep         = EXCLUDED.aep,
    rmse        = EXCLUDED.rmse,
    bias        = EXCLUDED.bias,
    r2          = EXCLUDED.r2,
    last_update = NOW();

-- Default admin user. Ganti password setelah deploy pertama.
-- Hash dihasilkan dengan bcrypt rounds=12 — GANTI di production!
INSERT INTO users (username, email, hashed_password, role)
VALUES (
    'admin',
    'admin@re-valid.id',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQyCgkMBpDjXk.UzYhOtT.uGa',
    'admin'
)
ON CONFLICT (username) DO NOTHING;
