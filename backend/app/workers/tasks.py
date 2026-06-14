"""
Celery tasks untuk RE-Valid.

Analisis dibuat bertingkat agar sesuai dengan kampanye pengukuran 10 hari:
- quick_check: minimal 10 sampling mentah untuk memastikan sensor masuk.
- daily_check: minimal 1 hari valid untuk membandingkan observasi harian vs ERA5 DOY/LTA.
- preliminary: minimal 5 hari valid untuk MCP/GHI screening awal.
- campaign_10_day: minimal 10 hari valid, target utama pengukuran per lokasi.

Hasil ini tetap screening/pre-feasibility, bukan MCP/WRA/SRA final bankable.
"""

import logging
import math

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

QUICK_CHECK_MIN_SAMPLES = 10
VALID_DAY_MIN_SAMPLES = 360       # 6 jam data pada interval 1 menit
SOLAR_FULL_DAY_MIN_SAMPLES = 720  # 12 jam data pada interval 1 menit
PRELIMINARY_MIN_DAYS = 5
CAMPAIGN_TARGET_DAYS = 10


def _compute_aep(variable: str, atlas_value: float) -> int:
    """Estimasi AEP (MWh/tahun) untuk kapasitas referensi 10 MW / 10 MWp."""
    if variable == "wind":
        return round(atlas_value * 520 * 8760 / 1000)
    return round(atlas_value * 365 * 10 * 0.78)


def _compute_score(r2: float, bias_pct: float, rmse: float, variable: str, atlas_value: float) -> int:
    """Hitung skor kesesuaian lokasi 0-100 untuk screening awal."""
    sub_r2 = r2 * 100
    sub_bias = max(0.0, 100.0 - abs(bias_pct) * 2)
    sub_rmse = max(0.0, 100.0 - rmse * 20)
    if variable == "wind":
        sub_atlas = min(100.0, max(0.0, (atlas_value - 2.0) / 6.0 * 100))
    else:
        sub_atlas = min(100.0, max(0.0, (atlas_value - 2.0) / 5.0 * 100))

    score = 0.40 * sub_r2 + 0.30 * sub_bias + 0.20 * sub_rmse + 0.10 * sub_atlas
    return max(0, min(100, round(score)))


def _rmse(obs: list[float], baseline: list[float]) -> float:
    n = len(obs)
    return math.sqrt(sum((o - b) ** 2 for o, b in zip(obs, baseline)) / n)


def _bias_pct(obs: list[float], baseline: list[float]) -> float:
    avg_b = sum(baseline) / len(baseline)
    if avg_b == 0:
        return 0.0
    return ((sum(obs) / len(obs)) - avg_b) / avg_b * 100


def _r2(obs: list[float], baseline: list[float]) -> float:
    """Skill score berbasis bias level terhadap baseline referensi."""
    mean_b = sum(baseline) / len(baseline)
    if mean_b == 0:
        return 0.0
    mean_obs = sum(obs) / len(obs)
    norm_bias = abs(mean_obs - mean_b) / mean_b
    return max(0.0, 1.0 - norm_bias)


def _date_filter_sql(start_date: str | None, end_date: str | None) -> tuple[str, list[str]]:
    sql = ""
    params: list[str] = []
    if start_date:
        sql += " AND DATE(measured_at AT TIME ZONE 'Asia/Jakarta') >= %s::date"
        params.append(start_date)
    if end_date:
        sql += " AND DATE(measured_at AT TIME ZONE 'Asia/Jakarta') <= %s::date"
        params.append(end_date)
    return sql, params


def _analysis_level(valid_days: int) -> str:
    if valid_days >= CAMPAIGN_TARGET_DAYS:
        return "campaign_10_day"
    if valid_days >= PRELIMINARY_MIN_DAYS:
        return "preliminary"
    return "daily_check"


def _analysis_warning(variable: str, valid_days: int, sample_quality: str | None = None) -> str | None:
    label = "MCP angin" if variable == "wind" else "validasi GHI"
    if valid_days >= CAMPAIGN_TARGET_DAYS:
        return "Campaign 10 hari selesai. Hasil tetap screening/pre-feasibility, bukan analisis final bankable."
    if valid_days >= PRELIMINARY_MIN_DAYS:
        return f"{label} preliminary: {valid_days} hari valid. Target campaign adalah 10 hari valid per lokasi."

    if variable == "solar" and sample_quality == "partial":
        return (
            f"Validasi GHI harian awal: {valid_days} hari valid parsial. "
            "Data harian belum penuh, hasil bisa sedikit underestimate."
        )
    return (
        f"Perbandingan harian awal: {valid_days} hari valid. "
        f"Belum cukup untuk {label} preliminary yang membutuhkan minimal {PRELIMINARY_MIN_DAYS} hari valid."
    )


def _format_period(t_min, t_max) -> str | None:
    if not t_min or not t_max:
        return None
    month_id = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
    start_str = f"{t_min.day} {month_id[t_min.month]}"
    end_str = f"{t_max.day} {month_id[t_max.month]} {t_max.year}"
    return f"{start_str} - {end_str}"


@celery_app.task(name="validate_station_mcp", bind=True)
def validate_station_mcp(
    self,
    station_id: str,
    variable: str = "wind",
    n: int = 14400,
    start_date: str | None = None,
    end_date: str | None = None,
):
    """
    Hitung validasi untuk satu stasiun.

    start_date/end_date adalah tanggal WIB dalam format YYYY-MM-DD dan dipakai agar
    periode analisis sama dengan filter tanggal di halaman analisis.
    """
    import psycopg2
    from app.core.config import settings

    db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    date_sql, date_params = _date_filter_sql(start_date, end_date)

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()

        cur.execute("UPDATE stations SET mcp_status = 'berjalan' WHERE id = %s", (station_id,))
        conn.commit()

        cur.execute(
            "SELECT doy, ghi_era5, wind_era5 FROM station_daily_baselines"
            " WHERE station_id = %s ORDER BY doy",
            (station_id,),
        )
        doy_rows = cur.fetchall()
        doy_baseline: dict[int, dict[str, float | None]] = {
            int(r[0]): {
                "ghi": float(r[1]) if r[1] is not None else None,
                "wind": float(r[2]) if r[2] is not None else None,
            }
            for r in doy_rows
        }
        has_daily_baseline = len(doy_baseline) >= 300

        value_col = "wind_speed" if variable == "wind" else "ghi"
        raw_params = [station_id, *date_params]
        cur.execute(
            f"""
            SELECT COUNT(*), AVG({value_col}::float)
            FROM measurements
            WHERE station_id = %s AND {value_col} IS NOT NULL{date_sql}
            """,
            raw_params,
        )
        raw_row = cur.fetchone()
        raw_count = int(raw_row[0] or 0)
        raw_avg = float(raw_row[1]) if raw_row and raw_row[1] is not None else None

        if raw_count < QUICK_CHECK_MIN_SAMPLES:
            cur.execute("UPDATE stations SET mcp_status = 'pending' WHERE id = %s", (station_id,))
            conn.commit()
            cur.close()
            conn.close()
            return {
                "station_id": station_id,
                "variable": variable,
                "status": "insufficient_data",
                "count": raw_count,
                "minimum": QUICK_CHECK_MIN_SAMPLES,
                "unit": "sampling",
                "message": "Sampling sensor belum cukup untuk quick check.",
            }

        cur.execute(
            "SELECT MIN(measured_at AT TIME ZONE 'Asia/Jakarta'),"
            "       MAX(measured_at AT TIME ZONE 'Asia/Jakarta')"
            " FROM measurements WHERE station_id = %s" + date_sql,
            [station_id, *date_params],
        )
        row_dates = cur.fetchone()
        period_str = _format_period(row_dates[0], row_dates[1]) if row_dates else None

        baseline: list[float] | None = None
        baseline_source = "lta"
        sample_quality: str | None = None

        if variable == "wind":
            cur.execute(
                """
                SELECT
                    DATE(measured_at AT TIME ZONE 'Asia/Jakarta') AS obs_day,
                    COUNT(*) AS n_obs,
                    AVG(wind_speed::float) AS daily_avg_ms,
                    EXTRACT(DOY FROM DATE(measured_at AT TIME ZONE 'Asia/Jakarta'))::int AS doy
                FROM measurements
                WHERE station_id = %s AND wind_speed IS NOT NULL
                """
                + date_sql
                + """
                GROUP BY obs_day
                ORDER BY obs_day ASC
                LIMIT 365
                """,
                [station_id, *date_params],
            )
            day_agg = cur.fetchall()
            valid_day_rows = [
                (float(r[2]), int(r[3]), int(r[1]))
                for r in day_agg
                if r[2] is not None and int(r[1]) >= VALID_DAY_MIN_SAMPLES
            ]

            if not valid_day_rows:
                cur.execute(
                    """
                    UPDATE stations
                    SET wind_speed = COALESCE(%s, wind_speed),
                        period = COALESCE(%s, period),
                        variables = COALESCE(variables, 'Angin'),
                        mcp_status = 'pending',
                        last_update = NOW()
                    WHERE id = %s
                    """,
                    (round(raw_avg, 2) if raw_avg is not None else None, period_str, station_id),
                )
                conn.commit()
                cur.close()
                conn.close()
                return {
                    "station_id": station_id,
                    "variable": variable,
                    "status": "quick_check",
                    "analysis_level": "quick_check",
                    "sample_count": raw_count,
                    "valid_days": 0,
                    "minimum": 1,
                    "unit": "hari_valid",
                    "obs_mean": round(raw_avg, 2) if raw_avg is not None else None,
                    "message": (
                        "Quick check sensor angin berhasil, tetapi belum ada 1 hari valid "
                        f"(minimal {VALID_DAY_MIN_SAMPLES} sampling/hari) untuk perbandingan harian."
                    ),
                    "mcp_status": "pending",
                }

            obs = [v for v, _, _ in valid_day_rows]
            valid_days = len(obs)

            if has_daily_baseline:
                matched_obs: list[float] = []
                matched_baseline: list[float] = []
                for ws_val, doy, _ in valid_day_rows:
                    b = doy_baseline.get(doy, {}).get("wind")
                    if b is not None and b > 0:
                        matched_obs.append(ws_val)
                        matched_baseline.append(b)
                if matched_obs:
                    obs = matched_obs
                    baseline = matched_baseline
                    baseline_source = "era5_doy"
                    valid_days = len(obs)

        else:
            cur.execute(
                """
                SELECT
                    DATE(measured_at AT TIME ZONE 'Asia/Jakarta') AS obs_day,
                    COUNT(*) AS n_obs,
                    SUM(ghi::float) / 60000.0 AS daily_kwh_m2,
                    EXTRACT(DOY FROM DATE(measured_at AT TIME ZONE 'Asia/Jakarta'))::int AS doy
                FROM measurements
                WHERE station_id = %s AND ghi IS NOT NULL
                """
                + date_sql
                + """
                GROUP BY obs_day
                ORDER BY obs_day ASC
                LIMIT 365
                """,
                [station_id, *date_params],
            )
            day_agg = cur.fetchall()
            full_day_rows = [
                (float(r[2]), int(r[3]), int(r[1]))
                for r in day_agg
                if r[2] is not None and int(r[1]) >= SOLAR_FULL_DAY_MIN_SAMPLES
            ]
            partial_day_rows = [
                (float(r[2]), int(r[3]), int(r[1]))
                for r in day_agg
                if r[2] is not None and int(r[1]) >= VALID_DAY_MIN_SAMPLES
            ]

            if full_day_rows:
                obs_with_doy = full_day_rows
                sample_quality = "full"
            elif partial_day_rows:
                obs_with_doy = partial_day_rows
                sample_quality = "partial"
            else:
                cur.execute("UPDATE stations SET mcp_status = 'pending' WHERE id = %s", (station_id,))
                conn.commit()
                cur.close()
                conn.close()
                return {
                    "station_id": station_id,
                    "variable": variable,
                    "status": "quick_check",
                    "analysis_level": "quick_check",
                    "sample_count": raw_count,
                    "valid_days": 0,
                    "minimum": VALID_DAY_MIN_SAMPLES,
                    "unit": "sampling_per_hari",
                    "obs_mean_wm2": round(raw_avg, 2) if raw_avg is not None else None,
                    "message": (
                        "Quick check sensor GHI berhasil, tetapi belum ada 1 hari dengan "
                        f"minimal {VALID_DAY_MIN_SAMPLES} sampling untuk validasi harian."
                    ),
                    "mcp_status": "pending",
                }

            obs = [v for v, _, _ in obs_with_doy]
            valid_days = len(obs)

            if has_daily_baseline:
                matched_obs = []
                matched_baseline = []
                for ghi_val, doy, _ in obs_with_doy:
                    b = doy_baseline.get(doy, {}).get("ghi")
                    if b is not None and b > 0:
                        matched_obs.append(ghi_val)
                        matched_baseline.append(b)
                if matched_obs:
                    obs = matched_obs
                    baseline = matched_baseline
                    baseline_source = "era5_doy"
                    valid_days = len(obs)

        cur.execute(
            "SELECT wind_baseline FROM stations WHERE id = %s"
            if variable == "wind"
            else "SELECT ghi_baseline FROM stations WHERE id = %s",
            (station_id,),
        )
        row_baseline = cur.fetchone()
        atlas_value = float(row_baseline[0]) if row_baseline and row_baseline[0] is not None else None

        if atlas_value is None or atlas_value <= 0:
            cur.execute("UPDATE stations SET mcp_status = 'pending' WHERE id = %s", (station_id,))
            conn.commit()
            cur.close()
            conn.close()
            return {
                "station_id": station_id,
                "variable": variable,
                "status": "baseline_not_set",
                "message": (
                    f"Nilai {'wind_baseline' if variable == 'wind' else 'ghi_baseline'} belum diisi. "
                    "Gunakan tombol Ambil dari Atlas atau isi manual di halaman admin."
                ),
            }

        if baseline is None:
            baseline = [atlas_value] * len(obs)

        rmse = round(_rmse(obs, baseline), 3)
        bias = round(_bias_pct(obs, baseline), 2)
        r2 = round(max(0.0, min(1.0, _r2(obs, baseline))), 3)
        obs_mean = round(sum(obs) / len(obs), 2)
        aep = _compute_aep(variable, atlas_value)
        score = _compute_score(r2, bias, rmse, variable, atlas_value)

        if score >= 70:
            derived_status = "prioritas"
        elif score >= 50:
            derived_status = "kandidat"
        else:
            derived_status = "tidak_sesuai"

        if variable == "wind":
            cur.execute("SELECT solar_rmse FROM stations WHERE id = %s", (station_id,))
            row_chk = cur.fetchone()
            has_solar = row_chk and row_chk[0] is not None
            variables_str = "Angin, Iradiasi Surya" if has_solar else "Angin"
            cur.execute(
                """
                UPDATE stations
                SET wind_speed = %s,
                    wind_rmse = %s,
                    wind_bias = %s,
                    wind_r2 = %s,
                    wind_aep = %s,
                    rmse = %s,
                    bias = %s,
                    r2 = %s,
                    aep = %s,
                    score = %s,
                    status = %s,
                    period = COALESCE(%s, period),
                    variables = %s,
                    mcp_status = 'selesai',
                    last_update = NOW()
                WHERE id = %s
                """,
                (
                    obs_mean,
                    rmse,
                    bias,
                    r2,
                    aep,
                    rmse,
                    bias,
                    r2,
                    aep,
                    score,
                    derived_status,
                    period_str,
                    variables_str,
                    station_id,
                ),
            )
        else:
            cur.execute("SELECT wind_rmse FROM stations WHERE id = %s", (station_id,))
            row_chk = cur.fetchone()
            has_wind = row_chk and row_chk[0] is not None
            variables_str = "Angin, Iradiasi Surya" if has_wind else "Iradiasi Surya"
            cur.execute(
                """
                UPDATE stations
                SET irradiation = %s,
                    solar_rmse = %s,
                    solar_bias = %s,
                    solar_r2 = %s,
                    solar_aep = %s,
                    period = COALESCE(%s, period),
                    variables = %s,
                    mcp_status = 'selesai',
                    last_update = NOW()
                WHERE id = %s
                """,
                (obs_mean, rmse, bias, r2, aep, period_str, variables_str, station_id),
            )

        conn.commit()
        cur.close()
        conn.close()

        level = _analysis_level(valid_days)
        warning = _analysis_warning(variable, valid_days, sample_quality)
        logger.info(
            "validate_station_mcp DONE: station=%s var=%s level=%s samples=%d days=%d rmse=%.3f bias=%.2f r2=%.3f",
            station_id,
            variable,
            level,
            raw_count,
            valid_days,
            rmse,
            bias,
            r2,
        )
        return {
            "station_id": station_id,
            "variable": variable,
            "n": len(obs),
            "sample_count": raw_count,
            "valid_days": valid_days,
            "analysis_level": level,
            "sample_quality": sample_quality,
            "baseline_source": baseline_source,
            "rmse": rmse,
            "bias": bias,
            "r2": r2,
            "aep": aep,
            "score": score,
            "status": derived_status,
            "mcp_status": "selesai",
            "warning": warning,
        }

    except Exception as exc:
        logger.error("validate_station_mcp ERROR: %s", exc)
        raise self.retry(exc=exc, countdown=30, max_retries=3)
