-- ============================================================
-- RE-Valid Seed: Measurement Data (Sintetik 2023)
-- 365 hari × 6 stasiun = 2190 baris
-- Kecepatan angin: nilai dasar + variasi musiman + noise
-- GHI (W/m²): nilai dasar + siklus musiman + noise
-- Run order: 04 (setelah 03_seed.sql)
-- ============================================================

INSERT INTO measurements (
    station_id, measured_at,
    wind_speed, wind_dir,
    ghi, dni,
    temperature, humidity, pressure
)
SELECT
    s.sid                                                                   AS station_id,
    gs::timestamptz                                                         AS measured_at,

    -- Kecepatan angin (m/s): base + variasi musiman + noise deterministik
    GREATEST(0.5, ROUND((
        s.base_wind
        + 0.9 * SIN(EXTRACT(doy FROM gs) * 2 * PI() / 365.0)
        + 0.5 * SIN(EXTRACT(doy FROM gs) * 4 * PI() / 365.0 + 1.2)
        + (((EXTRACT(doy FROM gs)::int * 1337 + s.row_num * 7919) % 100) / 100.0 - 0.5) * 1.4
    )::NUMERIC, 3))                                                         AS wind_speed,

    -- Arah angin (0–360°): quasi-random
    ROUND((
        (EXTRACT(doy FROM gs)::int * 97 + s.row_num * 53) % 360
    )::NUMERIC, 1)                                                          AS wind_dir,

    -- GHI harian rata-rata (W/m²): musim kemarau (Apr–Sep) lebih tinggi
    GREATEST(60, ROUND((
        s.base_ghi
        + 45 * COS((EXTRACT(doy FROM gs) - 258) * 2 * PI() / 365.0)
        + (((EXTRACT(doy FROM gs)::int * 2053 + s.row_num * 4099) % 100) / 100.0 - 0.5) * 50
    )::NUMERIC, 3))                                                         AS ghi,

    -- DNI ≈ GHI × 0.85 dengan sedikit variasi
    GREATEST(30, ROUND((
        s.base_ghi * 0.85
        + 38 * COS((EXTRACT(doy FROM gs) - 258) * 2 * PI() / 365.0)
        + (((EXTRACT(doy FROM gs)::int * 3067 + s.row_num * 5003) % 100) / 100.0 - 0.5) * 40
    )::NUMERIC, 3))                                                         AS dni,

    -- Suhu udara (°C): hangat saat kemarau
    ROUND((
        24.5
        + 2.5 * SIN((EXTRACT(doy FROM gs) - 90) * 2 * PI() / 365.0)
        + (((EXTRACT(doy FROM gs)::int * 1789 + s.row_num * 6271) % 100) / 100.0 - 0.5) * 2.0
    )::NUMERIC, 2)                                                          AS temperature,

    -- Kelembaban (%) : lebih tinggi saat musim hujan
    ROUND(LEAST(98, GREATEST(50, (
        72.0
        - 12 * SIN((EXTRACT(doy FROM gs) - 90) * 2 * PI() / 365.0)
        + (((EXTRACT(doy FROM gs)::int * 2311 + s.row_num * 8191) % 100) / 100.0 - 0.5) * 12
    )))::NUMERIC, 2)                                                        AS humidity,

    -- Tekanan udara (hPa): hampir konstan + noise kecil
    ROUND((
        1013.0
        + (((EXTRACT(doy FROM gs)::int * 941 + s.row_num * 3571) % 100) / 100.0 - 0.5) * 4
    )::NUMERIC, 2)                                                          AS pressure

FROM (
    VALUES
        (1, 'CMH-001', 6.2, 220.0),
        (2, 'GRT-056', 5.9, 200.0),
        (3, 'GWY-089', 6.8, 185.0),
        (4, 'PGD-023', 5.4, 240.0),
        (5, 'SBG-105', 3.2, 230.0),
        (6, 'TSM-034', 5.1, 210.0)
) AS s(row_num, sid, base_wind, base_ghi)

CROSS JOIN generate_series(
    '2023-01-01 07:00:00+07'::timestamptz,
    '2023-12-31 07:00:00+07'::timestamptz,
    '1 day'::interval
) AS gs;
