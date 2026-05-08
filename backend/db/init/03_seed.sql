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
        'kandidat', 68,
        'Jan 2025 – Des 2025', 'Angin, Iradiasi', 'selesai',
        6.8, 5.1, 16353,
        1.09, 19.80, 0.800
    ),
    (
        'CMH-001',
        'Stasiun Cimahi Utara',
        -6.8712, 107.5432,
        'Cimahi, Jawa Barat', 752,
        'prioritas', 78,
        'Jan 2025 – Des 2025', 'Angin, Iradiasi', 'selesai',
        6.2, 4.8, 16353,
        0.93, 11.42, 0.886
    ),
    (
        'PGD-023',
        'Pos Pesisir Pangandaran',
        -7.7041, 108.6508,
        'Pangandaran, Jawa Barat', 12,
        'prioritas', 86,
        'Mar 2025 – Des 2025', 'Angin, Iradiasi', 'berjalan',
        5.4, 4.6, 19997,
        0.86, 4.78, 0.952
    ),
    (
        'SBG-105',
        'Stasiun Subang Utara',
        -6.5891, 107.7621,
        'Subang, Jawa Barat', 48,
        'tidak_sesuai', 44,
        NULL, 'Surya', 'pending',
        3.2, 4.2, 17902,
        NULL, NULL, NULL
    ),
    (
        'GRT-056',
        'Stasiun Garut Selatan',
        -7.4833, 107.8717,
        'Garut, Jawa Barat', 730,
        'prioritas', 83,
        'Feb 2025 – Des 2025', 'Angin, Iradiasi', 'selesai',
        5.9, 4.9, 21546,
        0.91, 7.82, 0.922
    ),
    (
        'TSM-034',
        'Pos Tasikmalaya Timur',
        -7.3544, 108.2248,
        'Tasikmalaya, Jawa Barat', 368,
        'prioritas', 88,
        'Jan 2025 – Sep 2025', 'Angin', 'berjalan',
        5.1, 4.5, 21546,
        0.84, -2.75, 0.972
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
-- Hash dihasilkan dengan bcrypt rounds=12 untuk password "admin" — GANTI di production!
INSERT INTO users (username, email, hashed_password, role)
VALUES (
    'admin',
    'admin@re-valid.id',
    '$2b$12$q8UKcAMAz7m5AyR3U7bNZe7Z3b2V8gihoNPiz.lZtUr/bYpwC/Oau',
    'admin'
)
ON CONFLICT (username) DO NOTHING;
