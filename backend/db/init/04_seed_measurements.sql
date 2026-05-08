-- ============================================================
-- RE-Valid Seed: Measurement Data (Sintetik 2025)
-- 365 hari × 6 stasiun = 2190 baris
-- Kecepatan angin: base_wind dikalibrasi terhadap wind_baseline (ERA5 ECMWF)
--   sehingga bias antara obs dan atlas berada dalam rentang ±5–20% yang realistis
-- GHI (W/m²): nilai rata-rata harian; tasks.py mengonversi × 24/1000 → kWh/m²/hari
--   sebelum dibandingkan dengan ghi_baseline (kWh/m²/hari)
-- base_wind / bias terhadap atlas per stasiun:
--   CMH-001: 4.0 m/s vs atlas 3.59 → +11.4%
--   GRT-056: 5.1 m/s vs atlas 4.73 → +7.8%
--   GWY-089: 4.3 m/s vs atlas 3.59 → +19.8% (mountain ridge, orographic enhancement)
--   PGD-023: 4.6 m/s vs atlas 4.39 → +4.8%
--   SBG-105: 3.5 m/s vs atlas 3.93 → -11.0% (dataran rendah, low-wind site)
--   TSM-034: 4.6 m/s vs atlas 4.73 → -2.8%
-- base_ghi / bias terhadap atlas per stasiun (setelah konversi ke kWh/m²/hari):
--   CMH-001: 209 W/m² → 5.02 vs atlas 5.01 → +0.1%
--   GRT-056: 205 W/m² → 4.92 vs atlas 5.08 → -3.1%
--   GWY-089: 195 W/m² → 4.68 vs atlas 5.08 → -7.9% (awan lebih banyak di pegunungan)
--   PGD-023: 215 W/m² → 5.16 vs atlas 4.91 → +5.1%
--   SBG-105: 210 W/m² → 5.04 vs atlas 5.01 → +0.6%
--   TSM-034: 200 W/m² → 4.80 vs atlas 4.91 → -2.2%
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
        (1, 'CMH-001', 4.0, 209.0),
        (2, 'GRT-056', 5.1, 205.0),
        (3, 'GWY-089', 4.3, 195.0),
        (4, 'PGD-023', 4.6, 215.0),
        (5, 'SBG-105', 3.5, 210.0),
        (6, 'TSM-034', 4.6, 200.0)
) AS s(row_num, sid, base_wind, base_ghi)

CROSS JOIN generate_series(
    '2025-01-01 07:00:00+07'::timestamptz,
    '2025-12-31 07:00:00+07'::timestamptz,
    '1 day'::interval
) AS gs;
