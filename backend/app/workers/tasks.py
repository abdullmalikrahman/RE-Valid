"""
Celery tasks untuk RE-Valid.

validate_station_mcp:
  · Ambil N data sensor terbaru dari tabel measurements
  · Hitung RMSE, Bias (%), R² antara observasi vs baseline atlas:
      wind_speed  → baseline = nilai wind_baseline (m/s) dari kolom stations (ERA5 / GWA)
      ghi         → baseline = nilai ghi_baseline (kWh/m²/hari) dari kolom stations (ERA5 / GSA)
  · Baseline adalah konstanta per-stasiun (long-term atlas mean) yang dibanding dengan
    distribusi observasi untuk menilai deviasi relatif sensor terhadap referensi iklim.
  · Setelah validasi: hitung AEP estimasi dan score kesesuaian lokasi secara otomatis.
  · Tulis hasilnya ke kolom rmse, bias, r2, aep, score, mcp_status di tabel stations

Rumus AEP estimasi (referensi kapasitas terpasang 10 MW / 10 MWp):
  · Angin : AEP = wind_baseline³ × Cp × ρ/2 × A × 8760 / 1e6
            Pendekatan praktis: AEP (GWh) = (wind_baseline/vrated)^3 × CF_rated × 8760 × P_rated
            Implementasi: AEP (MWh) = wind_baseline × 520 × 8760 / 1000  (≈ 10 MW pada CF realistis)
  · Surya : AEP (MWh) = ghi_baseline × 365 × P_rated_MWp × PR
            Implementasi: AEP (MWh) = ghi_baseline × 365 × 10 × 0.78

Rumus Score kesesuaian lokasi (0–100, berbasis metrik validasi MCP):
  · Komponen R²     : bobot 40%  → sub_r2   = r2 × 100
  · Komponen Bias   : bobot 30%  → sub_bias = max(0, 100 - |bias_pct| × 2)
  · Komponen RMSE   : bobot 20%  → sub_rmse = max(0, 100 - rmse × 20)
  · Komponen atlas  : bobot 10%  → sub_atlas = min(100, wind_baseline/10 × 100) untuk angin
                                              = min(100, ghi_baseline/7 × 100) untuk surya
  Score = 0.40×sub_r2 + 0.30×sub_bias + 0.20×sub_rmse + 0.10×sub_atlas
"""

import math
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _compute_aep(variable: str, atlas_value: float) -> int:
    """Estimasi AEP (MWh/tahun) untuk kapasitas referensi 10 MW / 10 MWp.

    Angin : AEP ≈ wind_baseline × 520 × 8760 / 1000
      Asumsi: rata-rata daya ∝ kecepatan angin (linear approximation untuk screening)
      dengan faktor 520 W per (m/s) kapasitas untuk turbin 10 MW di kondisi Jawa Barat.
    Surya : AEP = ghi_baseline × 365 × 10 MWp × PR(0.78)
    """
    if variable == "wind":
        # MWh/thn = m/s × 520 W/(m/s) × 8760 jam / 1e6 × 1e3 (ke MWh)
        return round(atlas_value * 520 * 8760 / 1000)
    else:
        # MWh/thn = kWh/m²/hari × 365 hari × 10 MWp × 0.78 PR
        # = kWh/m²/day × 365 × P_MWp × PR  (no extra ×1000: kWh/kWp·yr × MWp/MWp = MWh/thn)
        return round(atlas_value * 365 * 10 * 0.78)


def _compute_score(r2: float, bias_pct: float, rmse: float, variable: str, atlas_value: float) -> int:
    """Hitung skor kesesuaian lokasi (0–100) berbasis metrik validasi MCP.

    Komponen:
      40% R² (skill score): seberapa dekat rata-rata obs dengan atlas
      30% Bias: penalti untuk deviasi sistematis terhadap atlas
      20% RMSE: penalti untuk error absolut (dalam unit asli)
      10% Potensi atlas: bonus untuk lokasi dengan potensi energi tinggi
    """
    sub_r2   = r2 * 100                              # 0–100
    sub_bias = max(0.0, 100.0 - abs(bias_pct) * 2)  # 100 jika bias=0%, 0 jika bias≥50%
    sub_rmse = max(0.0, 100.0 - rmse * 20)           # 100 jika rmse=0, 0 jika rmse≥5
    if variable == "wind":
        # Angin: atlas > 7 m/s = sangat baik (kelas 4+); < 3 m/s = buruk
        sub_atlas = min(100.0, max(0.0, (atlas_value - 2.0) / 6.0 * 100))
    else:
        # Surya: atlas > 6 kWh/m²/hari = sangat baik; < 3 = buruk
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
    """Skill score berbasis bias relatif untuk baseline konstan (atlas climatology).

    Bila baseline adalah konstanta atlas (ERA5/GWA/GSA), tidak ada variasi
    temporal pada referensi sehingga korelasi Pearson tidak terdefinisi.
    Gunakan skill score: R² = 1 - |bias_relatif|, di mana:
      R² = 1.0 : rata-rata obs sama persis dengan atlas (tidak ada bias sistematis)
      R² = 0.8 : rata-rata obs menyimpang 20% dari atlas
      R² = 0.0 : bias ≥ 100% (obs jauh dari atlas)
    Bila baseline bervariasi (misal ERA5 time-series), gunakan R² Pearson standar.

    CATATAN: Jangan gunakan `ss_tot == 0` untuk deteksi baseline konstan karena
    floating point arithmetic menyebabkan sum([2.67]*90)/90 != 2.67 (presisi ~1e-16),
    sehingga ss_tot menjadi ~1e-29 (bukan 0) dan pembagian menghasilkan R² = -inf → 0.
    Gunakan range (max-min) sebagai indikator konstanta yang robust.
    """
    # Deteksi baseline konstan secara robust (tahan floating point error)
    if max(baseline) - min(baseline) < 1e-9:
        # Baseline konstan — hitung skill score berbasis bias relatif
        mean_b = sum(baseline) / len(baseline)
        if mean_b == 0:
            return 0.0
        mean_obs = sum(obs) / len(obs)
        norm_bias = abs(mean_obs - mean_b) / mean_b
        return max(0.0, 1.0 - norm_bias)
    # Baseline bervariasi — gunakan R² Pearson standar
    mean_b = sum(baseline) / len(baseline)
    ss_tot = sum((b - mean_b) ** 2 for b in baseline)
    ss_res = sum((o - b) ** 2 for o, b in zip(obs, baseline))
    return 1.0 - ss_res / ss_tot


@celery_app.task(name="validate_station_mcp", bind=True)
def validate_station_mcp(self, station_id: str, variable: str = "wind", n: int = 14400):
    """
    Compute RMSE, bias, R² for a station and persist the result.

    Args:
        station_id: e.g. "LOC-01"
        variable:  "wind" | "solar"
        n:         Jumlah pembacaan terbaru yang digunakan.
                   Default: 14.400 = 10 hari × 24h × 60 menit (interval 1 menit ESP32).
                   Untuk interval 5 menit: 10 hari = 2.880 baris.
                   Nilai ini hanya batas atas — jika data lebih sedikit, semua data dipakai.
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

        # Fetch recent non-null measurements — explicit queries (no f-string interpolation)
        if variable == "wind":
            cur.execute(
                "SELECT wind_speed FROM measurements"
                " WHERE station_id = %s AND wind_speed IS NOT NULL"
                " ORDER BY measured_at DESC LIMIT %s",
                (station_id, n),
            )
        else:
            cur.execute(
                "SELECT ghi FROM measurements"
                " WHERE station_id = %s AND ghi IS NOT NULL"
                " ORDER BY measured_at DESC LIMIT %s",
                (station_id, n),
            )
        rows = cur.fetchall()

        if len(rows) < 10:
            logger.warning("validate_station_mcp: not enough data for %s (%d rows)", station_id, len(rows))
            # Reset mcp_status so it doesn't stay stuck at 'berjalan'
            cur.execute(
                "UPDATE stations SET mcp_status = 'pending' WHERE id = %s",
                (station_id,),
            )
            conn.commit()
            cur.close()
            conn.close()
            return {"station_id": station_id, "status": "insufficient_data", "count": len(rows)}

        obs = [float(r[0]) for r in rows]

        # Untuk solar: konversi GHI dari W/m² (rata-rata harian) ke kWh/m²/hari
        # agar unit konsisten dengan ghi_baseline yang disimpan dalam kWh/m²/hari
        if variable == "solar":
            obs = [o * 24 / 1000 for o in obs]

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

        # Rata-rata observasi: dipakai untuk mengisi wind_speed / irradiation di stations
        # sehingga halaman analisis menampilkan nilai aktual lapangan, bukan NULL/0
        obs_mean = round(sum(obs) / len(obs), 2)

        # Kalkulasi AEP estimasi dan score kesesuaian lokasi secara otomatis
        aep   = _compute_aep(variable, atlas_value)
        score = _compute_score(r2, bias, rmse, variable, atlas_value)

        # Derivasi status dari score secara otomatis:
        #   score ≥ 70  → prioritas
        #   score 50–69 → kandidat
        #   score < 50  → tidak_sesuai
        if score >= 70:
            derived_status = "prioritas"
        elif score >= 50:
            derived_status = "kandidat"
        else:
            derived_status = "tidak_sesuai"

        # ── Hitung period dan variables untuk ditampilkan di panel stasiun ──────
        MONTH_ID = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
                    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

        cur.execute(
            "SELECT MIN(measured_at), MAX(measured_at) FROM measurements WHERE station_id = %s",
            (station_id,),
        )
        row_dates = cur.fetchone()
        if row_dates and row_dates[0] and row_dates[1]:
            t_min, t_max = row_dates[0], row_dates[1]
            start_str = f"{t_min.day} {MONTH_ID[t_min.month]}"
            end_str   = f"{t_max.day} {MONTH_ID[t_max.month]} {t_max.year}"
            period_str = f"{start_str} \u2013 {end_str}"
        else:
            period_str = None

        # Tentukan variabel yang sudah divalidasi (gabungkan dengan yang sudah ada)
        if variable == "wind":
            cur.execute("SELECT solar_rmse FROM stations WHERE id = %s", (station_id,))
            row_chk = cur.fetchone()
            has_solar = row_chk and row_chk[0] is not None
            variables_str = "Angin, Iradiasi Surya" if has_solar else "Angin"
        else:
            cur.execute("SELECT wind_rmse FROM stations WHERE id = %s", (station_id,))
            row_chk = cur.fetchone()
            has_wind = row_chk and row_chk[0] is not None
            variables_str = "Angin, Iradiasi Surya" if has_wind else "Iradiasi Surya"

        # Persist to stations table
        # Angin (wind) = analisis utama: tulis wind_*, score, status, aep, rmse/bias/r2
        # Surya (solar) = analisis pelengkap: tulis solar_* SAJA, tidak timpa score/status/aep
        if variable == "wind":
            cur.execute(
                """
                UPDATE stations
                SET    wind_speed  = %s,
                       wind_rmse   = %s,
                       wind_bias   = %s,
                       wind_r2     = %s,
                       wind_aep    = %s,
                       rmse        = %s,
                       bias        = %s,
                       r2          = %s,
                       aep         = %s,
                       score       = %s,
                       status      = %s,
                       period      = COALESCE(%s, period),
                       variables   = %s,
                       mcp_status  = 'selesai',
                       last_update = NOW()
                WHERE  id = %s
                """,
                (obs_mean, rmse, bias, r2, aep, rmse, bias, r2, aep, score, derived_status,
                 period_str, variables_str, station_id),
            )
        else:
            # Solar: hanya tulis kolom solar_* dan mcp_status, tidak timpa score/status/aep
            cur.execute(
                """
                UPDATE stations
                SET    irradiation = %s,
                       solar_rmse  = %s,
                       solar_bias  = %s,
                       solar_r2    = %s,
                       solar_aep   = %s,
                       period      = COALESCE(%s, period),
                       variables   = %s,
                       mcp_status  = 'selesai',
                       last_update = NOW()
                WHERE  id = %s
                """,
                (obs_mean, rmse, bias, r2, aep, period_str, variables_str, station_id),
            )
        conn.commit()
        cur.close()
        conn.close()

        logger.info(
            "validate_station_mcp DONE: station=%s var=%s rmse=%.3f bias=%.2f r2=%.3f aep=%d score=%d status=%s",
            station_id, variable, rmse, bias, r2, aep, score, derived_status,
        )
        return {
            "station_id": station_id,
            "variable": variable,
            "n": len(obs),
            "rmse": rmse,
            "bias": bias,
            "r2": r2,
            "aep": aep,
            "score": score,
            "status": derived_status,
            "mcp_status": "selesai",
        }

    except Exception as exc:
        logger.error("validate_station_mcp ERROR: %s", exc)
        raise self.retry(exc=exc, countdown=30, max_retries=3)

