"""
Celery tasks untuk RE-Valid.

validate_station_mcp:
  · Ambil N data sensor terbaru dari tabel measurements
  · Hitung RMSE, Bias (%), R² antara observasi vs baseline atlas:
      wind_speed  → baseline = nilai wind_baseline (m/s) dari kolom stations (NASA POWER / GWA)
      ghi         → baseline = nilai ghi_baseline (kWh/m²/hari) dari kolom stations (NASA POWER / PVGIS)
  · Baseline adalah konstanta per-stasiun (long-term atlas mean) yang dibanding dengan
    distribusi observasi untuk menilai deviasi relatif sensor terhadap referensi iklim.
  · Tulis hasilnya ke kolom rmse, bias, r2, mcp_status di tabel stations
"""

import math
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _rmse(obs: list[float], baseline: list[float]) -> float:
    n = len(obs)
    return math.sqrt(sum((o - b) ** 2 for o, b in zip(obs, baseline)) / n)


def _bias_pct(obs: list[float], baseline: list[float]) -> float:
    avg_b = sum(baseline) / len(baseline)
    if avg_b == 0:
        return 0.0
    return ((sum(obs) / len(obs)) - avg_b) / avg_b * 100


def _r2(obs: list[float], baseline: list[float]) -> float:
    """Nash-Sutcliffe Efficiency (NSE).

    Bila baseline adalah konstanta atlas (seperti NASA POWER ERA5), ss_tot = 0
    sehingga formula NSE standar tidak terdefinisi. Dalam kasus ini, gunakan
    variansi obs sebagai denominator — mengukur seberapa jauh atlas dari mean obs.
      NSE = 1 : obs sempurna cocok dengan atlas (no bias, no random error)
      NSE = 0 : atlas tidak lebih baik dari mean obs sebagai prediktor
      NSE < 0 : terdapat bias sistematis besar antara obs dan atlas (clamped ke 0)
    """
    mean_b = sum(baseline) / len(baseline)
    ss_tot = sum((b - mean_b) ** 2 for b in baseline)
    ss_res = sum((o - b) ** 2 for o, b in zip(obs, baseline))
    if ss_tot == 0:
        # Baseline konstan — gunakan variansi obs sebagai referensi (NSE modified)
        mean_obs = sum(obs) / len(obs)
        ss_obs = sum((o - mean_obs) ** 2 for o in obs)
        if ss_obs == 0:
            return 1.0  # obs tidak bervariasi dan sama persis dengan atlas
        return 1.0 - ss_res / ss_obs
    return 1.0 - ss_res / ss_tot


@celery_app.task(name="validate_station_mcp", bind=True)
def validate_station_mcp(self, station_id: str, variable: str = "wind", n: int = 90):
    """
    Compute RMSE, bias, R² for a station and persist the result.

    Args:
        station_id: e.g. "GWY-089"
        variable:  "wind" | "solar"
        n:         number of recent measurements to use (default 90 days)
    """
    import psycopg2  # sync driver for Celery worker
    from app.core.config import settings

    # Convert asyncpg URL (postgresql+asyncpg://...) to psycopg2 URL (postgresql://...)
    db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()

        # Mark station as running immediately so frontend can show progress
        cur.execute(
            "UPDATE stations SET mcp_status = 'berjalan' WHERE id = %s",
            (station_id,),
        )
        conn.commit()

        if variable == "wind":
            col = "wind_speed"
        else:
            col = "ghi"

        # Fetch recent non-null measurements
        cur.execute(
            f"""
            SELECT {col}
            FROM   measurements
            WHERE  station_id = %s
              AND  {col} IS NOT NULL
            ORDER  BY measured_at DESC
            LIMIT  %s
            """,
            (station_id, n),
        )
        rows = cur.fetchall()

        if len(rows) < 10:
            logger.warning("validate_station_mcp: not enough data for %s (%d rows)", station_id, len(rows))
            cur.close()
            conn.close()
            return {"station_id": station_id, "status": "insufficient_data", "count": len(rows)}

        obs = [float(r[0]) for r in rows]

        # Ambil nilai baseline atlas dari kolom stations
        if variable == "wind":
            cur.execute("SELECT wind_baseline FROM stations WHERE id = %s", (station_id,))
        else:
            cur.execute("SELECT ghi_baseline FROM stations WHERE id = %s", (station_id,))

        row_baseline = cur.fetchone()
        atlas_value = float(row_baseline[0]) if row_baseline and row_baseline[0] is not None else None

        if atlas_value is None or atlas_value <= 0:
            # Baseline atlas belum di-set → gagal dengan pesan informatif
            logger.warning(
                "validate_station_mcp: baseline atlas belum di-set untuk stasiun %s (variable=%s). "
                "Set wind_baseline/ghi_baseline via endpoint /fetch-atlas atau input manual di admin.",
                station_id, variable,
            )
            cur.execute(
                "UPDATE stations SET mcp_status = 'pending' WHERE id = %s",
                (station_id,),
            )
            conn.commit()
            cur.close()
            conn.close()
            return {
                "station_id": station_id,
                "status": "baseline_not_set",
                "message": f"Nilai {'wind_baseline' if variable == 'wind' else 'ghi_baseline'} "
                           "belum diisi. Gunakan tombol 'Ambil dari Atlas' atau isi manual di halaman admin.",
            }

        # Baseline = konstanta atlas per-stasiun (referensi iklim jangka panjang)
        # Dibandingkan dengan distribusi observasi harian untuk menghitung deviasi
        baseline = [atlas_value] * len(obs)

        rmse = round(_rmse(obs, baseline), 3)
        bias = round(_bias_pct(obs, baseline), 2)
        r2   = round(_r2(obs, baseline), 3)

        # Clamp R² to [0, 1]
        r2 = max(0.0, min(1.0, r2))

        # Persist to stations table
        cur.execute(
            """
            UPDATE stations
            SET    rmse       = %s,
                   bias       = %s,
                   r2         = %s,
                   mcp_status = 'selesai',
                   last_update = NOW()
            WHERE  id = %s
            """,
            (rmse, bias, r2, station_id),
        )
        conn.commit()
        cur.close()
        conn.close()

        logger.info(
            "validate_station_mcp DONE: station=%s var=%s rmse=%.3f bias=%.2f r2=%.3f",
            station_id, variable, rmse, bias, r2,
        )
        return {
            "station_id": station_id,
            "variable": variable,
            "n": len(obs),
            "rmse": rmse,
            "bias": bias,
            "r2": r2,
            "mcp_status": "selesai",
        }

    except Exception as exc:
        logger.error("validate_station_mcp ERROR: %s", exc)
        raise self.retry(exc=exc, countdown=30, max_retries=3)


@celery_app.task(name="generate_report")
def generate_report(report_params: dict):
    """Generate a report asynchronously (placeholder)."""
    return {"status": "report_generated", "params": report_params}
