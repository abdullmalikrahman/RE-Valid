'use client';

import { Suspense, useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, ReferenceLine,
} from 'recharts';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useStations } from '@/hooks/useStations';
import { useMeasurements, type Measurement } from '@/hooks/useMeasurements';
import { apiFetch } from '@/lib/api';

const mcpStatusLabel: Record<string, Record<string, string>> = {
  wind: { selesai: 'Analisis MCP Selesai', berjalan: 'Analisis MCP Berjalan', pending: 'Belum Dijalankan' },
  solar: { selesai: 'Validasi GHI Selesai', berjalan: 'Validasi GHI Berjalan', pending: 'Belum Dijalankan' },
};
const mcpStatusColor: Record<string, string> = {
  selesai: 'bg-green-500/10 border-green-500/30',
  berjalan: 'bg-yellow-500/10 border-yellow-500/30',
  pending: 'bg-slate-500/10 border-slate-500/30',
};
const mcpIconColor: Record<string, string> = {
  selesai: 'text-green-400', berjalan: 'text-yellow-400', pending: 'text-slate-400',
};
const mcpIcon: Record<string, string> = {
  selesai: 'check_circle', berjalan: 'sync', pending: 'schedule',
};

// Fungsi murni — dideklarasikan di luar komponen agar tidak di-recreate tiap render
function getDoy(isoDate: string): number {
  const dateOnly = isoDate.slice(0, 10);
  const d = new Date(dateOnly + 'T12:00:00');
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

function makeMeteoChartData(
  meas: Measurement[],
  getValue: (m: Measurement) => number | null,
  granularity: 'daily' | 'weekly' | 'monthly',
) {
  const groups = new Map<string, { label: string; values: number[] }>();
  meas.forEach((m) => {
    const v = getValue(m);
    if (v === null) return;
    const d = new Date(m.measured_at);
    let key: string, label: string;
    if (granularity === 'daily') {
      key = d.toISOString().slice(0, 10);
      label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    } else if (granularity === 'weekly') {
      const w = new Date(d); w.setDate(d.getDate() - d.getDay());
      key = w.toISOString().slice(0, 10);
      label = w.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    } else {
      key = d.toISOString().slice(0, 7);
      label = d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
    }
    if (!groups.has(key)) groups.set(key, { label, values: [] });
    groups.get(key)!.values.push(v);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, { values }]) => values.length > 0)
    .map(([, { label, values }]) => ({
      date: label,
      obs: parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)),
    }));
}

function AnalisisContent() {
  const { stations, mutate } = useStations();
  const searchParams = useSearchParams();
  const router = useRouter();
  const stationId = searchParams.get('station') ?? stations[0]?.id ?? '';
  const station = stations.find((s) => s.id === stationId) ?? stations[0];

  const [energyType, setEnergyType] = useState<'wind' | 'solar'>('wind');
  const [taskState, setTaskState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [taskMsg, setTaskMsg] = useState('');

  // Compute default date range: first measurement → first + 10 days.
  // Falls back to last 30 days when a station has no data yet.
  // PENTING: first_measurement_at dikirim backend sebagai UTC. ESP32 memakai RTC WIB (UTC+7),
  // sehingga tanggal harus diekstrak dalam WIB agar tidak off-by-one (mis. 26 Mei vs 27 Mei).
  function defaultDateRange(firstMeasAt: string | null | undefined): { start: string; end: string } {
    if (firstMeasAt) {
      const first = new Date(firstMeasAt);
      // Ekstrak tanggal dalam WIB (UTC+7) menggunakan en-CA locale (format YYYY-MM-DD)
      const start = first.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      const end = new Date(first.getTime() + 10 * 86_400_000)
        .toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      return { start, end };
    }
    const today = new Date();
    const start = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    return { start, end: today.toISOString().slice(0, 10) };
  }

  const [startDate, setStartDate] = useState(() => defaultDateRange(station?.firstMeasurementAt).start);
  const [endDate, setEndDate] = useState(() => defaultDateRange(station?.firstMeasurementAt).end);
  const prevStationIdRef = useRef<string | null>(null);

  // When station changes, reset dates to that station's first-measurement window
  useEffect(() => {
    if (prevStationIdRef.current === station?.id) return;
    prevStationIdRef.current = station?.id ?? null;
    const { start, end } = defaultDateRange(station?.firstMeasurementAt);
    setStartDate(start);
    setEndDate(end);
  }, [station?.id, station?.firstMeasurementAt]);

  const [exportingXlsx, setExportingXlsx] = useState(false);

  // ─── Daily Climatology Baseline (ERA5 per DOY) ───────────────────────────
  type DailyBaselineRow = { doy: number; ghi_era5: number | null; wind_era5: number | null };
  const [dailyBaseline, setDailyBaseline] = useState<Map<number, DailyBaselineRow>>(new Map());

  useEffect(() => {
    if (!station?.id) return;
    apiFetch(`/api/v1/stations/${station.id}/daily-baseline`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: DailyBaselineRow[]) => {
        const map = new Map<number, DailyBaselineRow>();
        rows.forEach((row) => map.set(row.doy, row));
        setDailyBaseline(map);
      })
      .catch(() => setDailyBaseline(new Map()));
  }, [station?.id]);

  // Reset task feedback whenever the user switches station or energy type
  useEffect(() => {
    setTaskState('idle');
    setTaskMsg('');
  }, [station?.id, energyType]);

  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    setIsDark(localStorage.getItem('re_valid_theme') !== 'light');
  }, []);
  const gridColor = isDark ? '#2d3b4a' : '#e2e8f0';
  const tooltipBg = isDark ? '#1c2630' : '#ffffff';
  const tooltipBorder = isDark ? '#2d3b4a' : '#e2e8f0';
  const tooltipLabel = isDark ? '#92adc9' : '#374151';

  async function runAnalysis() {
    setTaskState('loading');
    setTaskMsg('');
    const token = typeof window !== 'undefined' ? localStorage.getItem('re_valid_token') : null;
    try {
      const res = await apiFetch('/api/v1/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ station_id: station.id, variable: energyType, n: 14400 }),
      });
        if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          setTaskState('error');
          setTaskMsg('Diperlukan login admin untuk menjalankan analisis.');
          return;
        }
        throw new Error(await res.text());
      }
      const { task_id } = await res.json();

      // Poll hingga selesai, dengan timeout 120 detik
      const startedAt = Date.now();
      const MAX_WAIT_MS = 120_000;

      const poll = async () => {
        if (Date.now() - startedAt > MAX_WAIT_MS) {
          setTaskState('error');
          setTaskMsg('Analisis melebihi batas waktu 120 detik. Pastikan Celery worker sedang berjalan (jalankan: celery -A celery_worker.celery_app worker --pool=solo).');
          return;
        }
        const r = await apiFetch(`/api/v1/analyze/${task_id}`);
        const data = await r.json();
        if (data.status === 'success') {
          const innerStatus: string = data.result?.status ?? '';
          // Celery task completed, but check inner result for soft errors
          if (innerStatus === 'insufficient_data') {
            setTaskState('error');
            setTaskMsg(`Data tidak cukup (${data.result?.count ?? 0} baris, minimum 10). Pastikan sensor sudah mengirim data ke stasiun ini.`);
            mutate();
          } else if (innerStatus === 'baseline_not_set') {
            setTaskState('error');
            setTaskMsg('Baseline atlas belum diisi. Admin perlu mengisi nilai wind_baseline / ghi_baseline di halaman Pengelolaan Lokasi (/admin) terlebih dahulu (gunakan tombol "Ambil dari Atlas" atau input manual).');
          } else {
            setTaskState('success');
            setTaskMsg(`Selesai — RMSE: ${data.result?.rmse ?? '–'}  Bias: ${data.result?.bias ?? '–'}%  R²: ${data.result?.r2 ?? '–'}`);
            mutate();
          }
        } else if (data.status === 'failed') {
          setTaskState('error');
          // Tampilkan pesan khusus jika baseline belum di-set
          const errMsg: string = data.result?.message ?? data.error ?? 'Task gagal';
          if (errMsg.includes('baseline') || errMsg.includes('baseline_not_set')) {
            setTaskMsg('Baseline atlas belum diisi. Admin perlu mengisi nilai wind_baseline / ghi_baseline di halaman Pengelolaan Lokasi (/admin) terlebih dahulu (gunakan tombol "Ambil dari Atlas" atau input manual).');
          } else {
            setTaskMsg(errMsg);
          }
        } else {
          setTimeout(poll, 2000);
        }
      };
      setTimeout(poll, 1500);
    } catch (e: unknown) {
      setTaskState('error');
      setTaskMsg(e instanceof Error ? e.message : String(e));
    }
  }

  // ─── Hook: Measurements (harus dipanggil sebelum early return) ────────────
  const { measurements, isLoading: measLoading } = useMeasurements(station?.id ?? '', startDate, endDate);

  // ─── Memoized computations (HARUS sebelum early return — Rules of Hooks) ──────
  // isWind harus dideklarasikan sebelum useMemo yang menggunakannya
  const isWind = energyType === 'wind';
  // Baseline dihitung inline dengan null-safe station access karena station bisa undefined di sini.
  const hasDailyBaseline = dailyBaseline.size >= 300;

  const dailyValues = useMemo(() => {
    const _windBaseline = station?.windBaseline ?? (station?.windSpeed ?? 0) * 1.046;
    const _ghiBaseline = parseFloat((station?.ghiBaseline ?? (station?.irradiation ?? 0) * 0.958).toFixed(2));
    const _atlasBaseline = isWind ? _windBaseline : _ghiBaseline;
    return measurements.map((m) => {
      const obs = isWind ? parseFloat((m.wind_speed ?? 0).toString()) : 0;
      let baseline = _atlasBaseline;
      if (hasDailyBaseline) {
        const doy = getDoy(m.measured_at);
        const row = dailyBaseline.get(doy);
        const doyVal = isWind ? row?.wind_era5 : row?.ghi_era5;
        if (doyVal != null && doyVal > 0) baseline = doyVal;
      }
      return { obs, baseline };
    });
  }, [measurements, isWind, dailyBaseline, hasDailyBaseline, station?.windBaseline, station?.windSpeed, station?.ghiBaseline, station?.irradiation]);

  const chartGranularity = useMemo(() => {
    if (measurements.length < 2) return 'daily' as const;
    const first = new Date(measurements[0].measured_at).getTime();
    const last  = new Date(measurements[measurements.length - 1].measured_at).getTime();
    const days  = (last - first) / 86_400_000;
    return days <= 31 ? 'daily' as const : days <= 180 ? 'weekly' as const : 'monthly' as const;
  }, [measurements]);
  const chartGranularityLabel = chartGranularity === 'daily' ? 'Rata-rata Harian' : chartGranularity === 'weekly' ? 'Rata-rata Mingguan' : 'Rata-rata Bulanan';

  const chartData = useMemo(() => {
    const groups = new Map<string, { obs: number[]; rawGhi: number[]; baseline: number[]; label: string }>();
    measurements.forEach((m, i) => {
      const d = new Date(m.measured_at);
      let groupKey: string;
      let label: string;
      if (chartGranularity === 'daily') {
        groupKey = d.toISOString().slice(0, 10);
        label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      } else if (chartGranularity === 'weekly') {
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        groupKey = weekStart.toISOString().slice(0, 10);
        label = weekStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      } else {
        groupKey = d.toISOString().slice(0, 7);
        label = d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
      }
      if (!groups.has(groupKey)) groups.set(groupKey, { obs: [], rawGhi: [], baseline: [], label });
      const g = groups.get(groupKey)!;
      g.obs.push(dailyValues[i].obs);
      g.rawGhi.push(m.ghi ?? 0);
      g.baseline.push(dailyValues[i].baseline);
    });
    return [...groups.values()].map(({ label, obs, rawGhi, baseline }) => ({
      date: label,
      obs: isWind
        ? parseFloat((obs.reduce((a, b) => a + b, 0) / obs.length).toFixed(2))
        : parseFloat((rawGhi.reduce((a, b) => a + b, 0) / 60000).toFixed(2)),
      baseline: parseFloat((baseline.reduce((a, b) => a + b, 0) / baseline.length).toFixed(2)),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurements, dailyValues, isWind, chartGranularity]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const [tempChartData, humChartData, presChartData, windDirChartData] = useMemo(() => [
    makeMeteoChartData(measurements, (m) => m.temperature, chartGranularity),
    makeMeteoChartData(measurements, (m) => m.humidity,    chartGranularity),
    makeMeteoChartData(measurements, (m) => m.pressure,    chartGranularity),
    makeMeteoChartData(measurements, (m) => m.wind_dir,    chartGranularity),
  ], [measurements, chartGranularity]);

  const { tempAvg, humAvg, presAvg, windDirAvg } = useMemo(() => {
    const tv = measurements.map((m) => m.temperature).filter((v): v is number => v !== null);
    const hv = measurements.map((m) => m.humidity).filter((v): v is number => v !== null);
    const pv = measurements.map((m) => m.pressure).filter((v): v is number => v !== null);
    const wv = measurements.map((m) => m.wind_dir).filter((v): v is number => v !== null);
    return {
      tempAvg:    tv.length > 0 ? tv.reduce((a, b) => a + b, 0) / tv.length : null,
      humAvg:     hv.length > 0 ? hv.reduce((a, b) => a + b, 0) / hv.length : null,
      presAvg:    pv.length > 0 ? pv.reduce((a, b) => a + b, 0) / pv.length : null,
      windDirAvg: wv.length > 0 ? wv.reduce((a, b) => a + b, 0) / wv.length : null,
    };
  }, [measurements]);

  const availPct = useMemo(() => measurements.length > 0
    ? Math.round(measurements.filter((m) => (isWind ? m.wind_speed : m.ghi) !== null).length / measurements.length * 100)
    : null, [measurements, isWind]);

  // Jika belum ada stasiun di DB, tampilkan empty state
  if (!station) {
    return (
      <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
          <span className="material-symbols-outlined text-5xl text-slate-400">sensors_off</span>
          <p className="text-lg font-semibold text-slate-600 dark:text-slate-400">Belum ada stasiun terdaftar</p>
          <p className="text-sm text-slate-500 dark:text-slate-500 text-center max-w-sm">Tambahkan stasiun terlebih dahulu melalui halaman <a href="/admin" className="text-primary underline">Admin</a>, kemudian kembali ke halaman ini.</p>
        </main>
      </div>
    );
  }

  // ─── Wind derived ──────────────────────────────────────────────────────────
  // Gunakan wind_baseline dari atlas (ERA5/GWA) jika tersedia; fallback ke aproksimasi
  const windBaselineVal = station.windBaseline ?? (station.windSpeed ?? 0) * 1.046;
  const windLongTerm = windBaselineVal.toFixed(1);
  const windDiff = windBaselineVal > 0 ? (((station.windSpeed - windBaselineVal) / windBaselineVal) * 100).toFixed(1) : '0.0';
  // Per-source deviations
  const windDiffGwa = (station.windBaselineGwa != null && station.windBaselineGwa > 0)
    ? parseFloat((((station.windSpeed - station.windBaselineGwa) / station.windBaselineGwa) * 100).toFixed(1))
    : null
  const windDiffNasa = (station.windBaselineNasa != null && station.windBaselineNasa > 0)
    ? parseFloat((((station.windSpeed - station.windBaselineNasa) / station.windBaselineNasa) * 100).toFixed(1))
    : null;
  // hasWindObs: apakah ada data observasi angin yang valid (bukan 0 dari ketiadaan sensor)
  const hasWindObs = (station.aep ?? 0) > 0;
  // Jika tidak ada observasi angin, gunakan windAep (atlas GWA 3.0 estimate) sebagai fallback
  const aepGross = hasWindObs ? (station.aep ?? 0) : (station.windAep ?? 0);
  const aepNetP50 = Math.round(aepGross * 0.877);
  const aepNetP90 = Math.round(aepGross * 0.767);
  const biasDisplay = station.bias != null ? (station.bias > 0 ? '+' : '') + station.bias.toFixed(1) + '%' : '–';
  // Wind-specific R² (from windR2 column, fallback to generic r2)
  const windR2Val = station.windR2 ?? station.r2 ?? 0;
  const windR2Quality = windR2Val >= 0.85 ? 'Tinggi' : windR2Val >= 0.70 ? 'Sedang' : 'Rendah';
  const windR2Color = windR2Val >= 0.85 ? 'text-green-500' : windR2Val >= 0.70 ? 'text-amber-400' : 'text-red-400';
  const windR2Bg = windR2Val >= 0.85 ? 'bg-green-500/10 text-green-500' : windR2Val >= 0.70 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400';
  // Solar-specific R² (from solarR2 column, fallback to generic r2)
  const solarR2Val = station.solarR2 ?? station.r2 ?? 0;
  const solarR2Quality = solarR2Val >= 0.85 ? 'Tinggi' : solarR2Val >= 0.70 ? 'Sedang' : 'Rendah';
  const solarR2Color = solarR2Val >= 0.85 ? 'text-green-500' : solarR2Val >= 0.70 ? 'text-amber-400' : 'text-red-400';
  const solarR2Bg = solarR2Val >= 0.85 ? 'bg-green-500/10 text-green-500' : solarR2Val >= 0.70 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400';

  // ─── Solar derived ─────────────────────────────────────────────────────────
  // GHI baseline dari atlas (ERA5/GSA) jika tersedia; fallback ke aproksimasi
  const ghiBaseline = parseFloat((station.ghiBaseline ?? (station.irradiation ?? 0) * 0.958).toFixed(2));
  const ghiDiff = ghiBaseline > 0 ? parseFloat((((station.irradiation - ghiBaseline) / ghiBaseline) * 100).toFixed(1)) : 0;
  const ghiDiffGsa = (station.ghiBaselineGsa != null && station.ghiBaselineGsa > 0)
    ? parseFloat((((station.irradiation - station.ghiBaselineGsa) / station.ghiBaselineGsa) * 100).toFixed(1))
    : null;
  const ghiDiffNasa = (station.ghiBaselineNasa != null && station.ghiBaselineNasa > 0)
    ? parseFloat((((station.irradiation - station.ghiBaselineNasa) / station.ghiBaselineNasa) * 100).toFixed(1))
    : null;
  // Clearness Index: Kt = GHI_obs / GHI_extraterrestrial (≈ 8.5 kWh/m²/hari at 7°S lat)
  const ktIndex = parseFloat(((station.irradiation ?? 0) / 8.5).toFixed(2));
  const ktLabel = ktIndex >= 0.55 ? 'Cerah' : ktIndex >= 0.40 ? 'Campuran' : 'Berawan';
  const ktColor = ktIndex >= 0.55 ? 'text-amber-400' : ktIndex >= 0.40 ? 'text-blue-400' : 'text-slate-400';
  const ktBg = ktIndex >= 0.55 ? 'bg-amber-500/10 text-amber-400' : ktIndex >= 0.40 ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-500/10 text-slate-400';
  // AEP PLTS: gunakan solarAep dari DB (atlas-based, 10 MWp, PR=0.78); fallback ke kalkulasi obs
  // Bagi 10 untuk mendapatkan referensi per 1 MWp (unit industri standar)
  const aepSolar10mwp = (station.solarAep != null && station.solarAep > 0)
    ? station.solarAep
    : Math.round((station.ghiBaseline ?? station.ghiBaselineNasa ?? station.irradiation) * 365 * 10 * 0.78);
  const aepSolarRef = Math.round(aepSolar10mwp / 10);   // MWh per 1 MWp
  const aepSolarP90 = Math.round(aepSolarRef * 0.90);

  // ─── XLSX Export ───────────────────────────────────────────────────────────
  async function exportXlsx() {
    setExportingXlsx(true);
    try {
      const { Workbook } = await import('exceljs');
      const wb = new Workbook();
      wb.creator = 'RE-Valid DSS';
      const ws = wb.addWorksheet('Laporan Analisis');
      ws.columns = [
        { key: 'a', width: 38 },
        { key: 'b', width: 22 },
        { key: 'c', width: 18 },
        { key: 'd', width: 14 },
      ];

      const C_BLUE  = 'FF137FEC';
      const C_NAVY  = 'FF0F2D57';
      const C_WHITE = 'FFFFFFFF';
      const C_ALT   = 'FFF0F5FF';
      const C_HDR   = 'FFE8EFF9';
      const C_GREEN = 'FF16A34A';
      const C_RED   = 'FFB91C1C';
      const C_GRAY  = 'FF6B7280';
      const C_TEXT  = 'FF111827';

      const addTitle = (text: string) => {
        const xr = ws.addRow([text]);
        ws.mergeCells(`A${xr.number}:D${xr.number}`);
        const c = xr.getCell(1);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_BLUE } };
        c.font = { bold: true, size: 14, color: { argb: C_WHITE }, name: 'Calibri' };
        c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        xr.height = 24;
      };

      const addMeta = (text: string) => {
        const xr = ws.addRow([text]);
        ws.mergeCells(`A${xr.number}:D${xr.number}`);
        const c = xr.getCell(1);
        c.font = { italic: true, size: 9, color: { argb: C_GRAY }, name: 'Calibri' };
        c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        xr.height = 14;
      };

      const addSection = (text: string) => {
        ws.addRow([]);
        const xr = ws.addRow([text]);
        ws.mergeCells(`A${xr.number}:D${xr.number}`);
        const c = xr.getCell(1);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_NAVY } };
        c.font = { bold: true, size: 9, color: { argb: C_WHITE }, name: 'Calibri' };
        c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        xr.height = 16;
      };

      const addColHeaders = (labels: string[]) => {
        const xr = ws.addRow(labels);
        xr.eachCell({ includeEmpty: true }, (c, i) => {
          if (i > 4) return;
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_BLUE } };
          c.font = { bold: true, size: 9, color: { argb: C_WHITE }, name: 'Calibri' };
          c.alignment = { horizontal: 'center', vertical: 'middle' };
        });
        xr.height = 15;
      };

      const addInfoRow = (label: string, value: string, idx: number) => {
        const xr = ws.addRow([label, value]);
        const isAlt = idx % 2 === 1;
        const c1 = xr.getCell(1);
        const c2 = xr.getCell(2);
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? C_ALT : C_HDR } };
        c1.font = { bold: true, size: 9, color: { argb: C_TEXT }, name: 'Calibri' };
        c1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? C_ALT : 'FFFFFFFF' } };
        c2.font = { size: 9, color: { argb: C_TEXT }, name: 'Calibri' };
        c2.alignment = { horizontal: 'left', vertical: 'middle' };
        xr.height = 14;
      };

      const addDataRow = (vals: (string | number | null | undefined)[], idx: number, statusColIdx?: number) => {
        const xr = ws.addRow(vals);
        const isAlt = idx % 2 === 1;
        xr.eachCell({ includeEmpty: true }, (c, i) => {
          if (i > 4) return;
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? C_ALT : 'FFFFFFFF' } };
          c.font = { size: 9, color: { argb: C_TEXT }, name: 'Calibri' };
          c.alignment = { horizontal: i === 1 ? 'left' : 'center', vertical: 'middle', indent: i === 1 ? 1 : 0 };
          c.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
        });
        if (statusColIdx !== undefined) {
          const sv = String(vals[statusColIdx] ?? '');
          const sc = xr.getCell(statusColIdx + 1);
          if (sv === 'Lulus') sc.font = { size: 9, bold: true, color: { argb: C_GREEN }, name: 'Calibri' };
          else if (sv === 'Perlu Tinjau') sc.font = { size: 9, bold: true, color: { argb: C_RED }, name: 'Calibri' };
        }
        xr.height = 14;
      };

      addTitle('RE-Valid \u2014 Laporan Analisis EBT');
      addMeta(`Stasiun: ${station.name} (${station.id})  |  ${station.region}  |  ${isWind ? 'Angin (PLTB)' : 'Surya (PLTS)'}`);
      addMeta(`Diekspor: ${new Date().toLocaleString('id-ID')}  |  Sumber: ERA5 / GWA 3.0 / GSA (Solargis)`);

      addSection('INFO STASIUN');
      [
        ['Station ID', station.id],
        ['Nama', station.name],
        ['Wilayah', station.region],
        ['Koordinat', `${station.lat.toFixed(4)}, ${station.lon.toFixed(4)}`],
        ['Periode', station.period],
        ['Jenis Energi', isWind ? 'Angin (PLTB)' : 'Surya (PLTS)'],
      ].forEach((pair, i) => addInfoRow(pair[0], pair[1], i));

      addSection('METRIK VALIDASI');
      addColHeaders(['Metrik', 'Nilai', 'Target', 'Status']);
      const mRows = isWind ? windValidationRows : solarValidationRows;
      mRows.forEach((r, i) => {
        const status = r.pass === null ? 'N/A' : r.pass ? 'Lulus' : 'Perlu Tinjau';
        addDataRow([r.metric, r.value, r.target, status], i, 3);
      });

      if (measurements.length > 0) {
        if (isWind) {
          addSection('DATA PENGUKURAN');
          addColHeaders(['Tanggal/Waktu', 'Kec. Angin Obs (m/s)', 'Baseline Atlas (m/s)', 'Deviasi (m/s)']);
          measurements.forEach((m, i) => {
            const obs = m.wind_speed ?? 0;
            const dev = parseFloat((obs - windBaselineVal).toFixed(4));
            addDataRow([m.measured_at, obs, parseFloat(windBaselineVal.toFixed(4)), dev], i);
          });
        } else {
          // Untuk solar: agregasi per hari kalender — bandingkan total GHI harian vs atlas
          // GHI harian (kWh/m²/hari) = SUM(GHI_i W/m²) × (1/60 jam) / 1000 = SUM(GHI_i) / 60_000
          const dayGhiMap = new Map<string, number[]>();
          measurements.forEach((m) => {
            const day = new Date(m.measured_at).toISOString().slice(0, 10);
            if (!dayGhiMap.has(day)) dayGhiMap.set(day, []);
            dayGhiMap.get(day)!.push(m.ghi ?? 0);
          });
          addSection('DATA GHI HARIAN (Agregasi per Hari Kalender)');
          addColHeaders(['Tanggal', 'Total GHI Harian (kWh/m²/hari)', 'Baseline Atlas (kWh/m²/hari)', 'Deviasi (kWh/m²/hari)']);
          [...dayGhiMap.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([day, ghiArr], i) => {
            const dailyTotal = parseFloat((ghiArr.reduce((a, b) => a + b, 0) / 60000).toFixed(2));
            const dev = parseFloat((dailyTotal - ghiBaseline).toFixed(2));
            addDataRow([day, dailyTotal, parseFloat(ghiBaseline.toFixed(2)), dev], i);
          });
        }
      }

      const meteoForXlsx = measurements.filter((m) => m.temperature !== null || m.humidity !== null || m.pressure !== null || m.wind_dir !== null);
      if (meteoForXlsx.length > 0) {
        ws.getColumn(5).width = 14;
        addSection('DATA METEOROLOGI');
        const meteoHdrRow = ws.addRow(['Tanggal/Waktu', 'Suhu (°C)', 'Kelembapan (%)', 'Tekanan (hPa)', 'Arah Angin (°)']);
        meteoHdrRow.eachCell({ includeEmpty: true }, (c: import('exceljs').Cell, i: number) => {
          if (i > 5) return;
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_BLUE } };
          c.font = { bold: true, size: 9, color: { argb: C_WHITE }, name: 'Calibri' };
          c.alignment = { horizontal: 'center', vertical: 'middle' };
        });
        meteoHdrRow.height = 15;
        meteoForXlsx.forEach((m, i) => {
          const xr = ws.addRow([m.measured_at, m.temperature, m.humidity, m.pressure, m.wind_dir]);
          const isAlt = i % 2 === 1;
          xr.eachCell({ includeEmpty: true }, (c: import('exceljs').Cell, ci: number) => {
            if (ci > 5) return;
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? C_ALT : 'FFFFFFFF' } };
            c.font = { size: 9, color: { argb: C_TEXT }, name: 'Calibri' };
            c.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle', indent: ci === 1 ? 1 : 0 };
            c.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
          });
          xr.height = 14;
        });
      }

      ws.addRow([]);
      const fxr = ws.addRow(['Sumber: RE-Valid DSS \u2014 ERA5 (ECMWF) / GWA 3.0 / GSA (Solargis). Simulasi screening awal.']);
      ws.mergeCells(`A${fxr.number}:D${fxr.number}`);
      fxr.getCell(1).font = { italic: true, size: 8, color: { argb: C_GRAY }, name: 'Calibri' };

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analisis_${station.id}_${energyType}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingXlsx(false);
    }
  }

  // Scatter: 1 titik per hari untuk kedua tipe energi — dari chartData (nilai teragregasi harian)
  // Angin: rata-rata harian m/s vs DOY baseline → ~9 titik/10-hari
  // Surya: kWh/m²/hari (SUM/60000) vs DOY baseline → ~9 titik/10-hari
  // Tidak ada downsampling — data sudah per-hari, ringan di browser.
  const scatterData = chartData.map((d) => ({
    obs: d.obs,
    dev: parseFloat((d.obs - d.baseline).toFixed(3)),
  }));

  // Kec. angin obs dihitung dari rata-rata chartData (nilai harian campaign)
  // Tidak pakai station.windSpeed karena MQTT menimpa kolom itu setiap menit dengan pembacaan sesaat
  const obsWindMean = isWind && chartData.length > 0
    ? parseFloat((chartData.reduce((s, d) => s + d.obs, 0) / chartData.length).toFixed(2))
    : (station.windSpeed ?? 0);

  const meteoHasData = [tempChartData, humChartData, presChartData, windDirChartData].some((d) => d.length > 0);
  function compassDir(deg: number): string {
    return ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'][Math.round(deg / 45) % 8];
  }

  // MAE (Mean Absolute Error) per hari dari chartData (nilai teragregasi harian)
  const mae = chartData.length > 0
    ? parseFloat((chartData.reduce((s, d) => s + Math.abs(d.obs - d.baseline), 0) / chartData.length).toFixed(2))
    : null;

  // ─── Availability from actual measurements ──────────────────────────────────────
  const availDisplay = availPct !== null ? `${availPct}%` : '–';

  // ─── Data duration — used for validity warning when observasi period is too short ────
  const obsDurationDays = measurements.length >= 2
    ? Math.round((new Date(measurements[measurements.length - 1].measured_at).getTime() - new Date(measurements[0].measured_at).getTime()) / 86400000) + 1
    : measurements.length === 1 ? 1 : 0;
  const isDataShort = isWind ? obsDurationDays < 90 : obsDurationDays < 30;

  // ─── Validation rows (computed after measurements) ──────────────────────────────
  const windRmseForRow = station.windRmse ?? (station.rmse > 0 ? station.rmse : null);
  const windValidationRows: { metric: string; value: string; target: string; pass: boolean | null }[] = [
    { metric: 'RMSE (m/s)', value: windRmseForRow != null ? windRmseForRow.toFixed(2) : '–', target: '< 2.0', pass: windRmseForRow != null ? windRmseForRow < 2.0 : null },
    { metric: 'MAE (m/s)', value: mae !== null ? mae.toFixed(2) : '–', target: '< 1.5', pass: mae !== null ? mae < 1.5 : null },
    { metric: 'Korelasi Atlas (R²)', value: windR2Val > 0 ? windR2Val.toFixed(2) : '–', target: '> 0.70', pass: windR2Val > 0 ? windR2Val > 0.70 : null },
    { metric: 'Bias vs GWA (%)', value: windDiffGwa !== null ? (windDiffGwa >= 0 ? '+' : '') + windDiffGwa + '%' : '–', target: '± 5%', pass: windDiffGwa !== null ? Math.abs(windDiffGwa) <= 5 : null },
    { metric: 'Bias vs ERA5/ECMWF (%)', value: windDiffNasa !== null ? (windDiffNasa >= 0 ? '+' : '') + windDiffNasa + '%' : '–', target: '± 5%', pass: windDiffNasa !== null ? Math.abs(windDiffNasa) <= 5 : null },
    { metric: 'Ketersediaan Data', value: availDisplay, target: '> 90%', pass: availPct !== null ? availPct > 90 : null },
  ];
  const solarRmseVal = station.solarRmse ?? null;
  const solarValidationRows: { metric: string; value: string; target: string; pass: boolean | null }[] = [
    { metric: 'RMSE (kWh/m²/hari)', value: solarRmseVal !== null ? solarRmseVal.toFixed(2) : '–', target: '< 1.5', pass: solarRmseVal !== null ? solarRmseVal < 1.5 : null },
    { metric: 'MAE (kWh/m²/hari)', value: mae !== null ? mae.toFixed(2) : '–', target: '< 1.0', pass: mae !== null ? mae < 1.0 : null },
    { metric: 'Korelasi Atlas (R²)', value: solarR2Val > 0 ? solarR2Val.toFixed(2) : '–', target: '> 0.70', pass: solarR2Val > 0 ? solarR2Val > 0.70 : null },
    { metric: 'Bias vs GSA (%)', value: ghiDiffGsa !== null ? (ghiDiffGsa >= 0 ? '+' : '') + ghiDiffGsa + '%' : '–', target: '± 5%', pass: ghiDiffGsa !== null ? Math.abs(ghiDiffGsa) <= 5 : null },
    { metric: 'Bias vs ERA5/ECMWF (%)', value: ghiDiffNasa !== null ? (ghiDiffNasa >= 0 ? '+' : '') + ghiDiffNasa + '%' : '–', target: '± 5%', pass: ghiDiffNasa !== null ? Math.abs(ghiDiffNasa) <= 5 : null },
    { metric: 'Clearness Index (Kt)', value: ktIndex.toFixed(2), target: '0.40–0.65', pass: ktIndex >= 0.40 && ktIndex <= 0.65 },
    { metric: 'Ketersediaan Data', value: availDisplay, target: '> 90%', pass: availPct !== null ? availPct > 90 : null },
  ];

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col w-full max-w-360 mx-auto px-4 lg:px-8 py-4">
        {/* Page header */}
        <div className="flex flex-col gap-1 mb-5">
          <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
            <div className="flex flex-col gap-1 max-w-2xl">
              <h1 className="text-xl font-bold leading-tight text-slate-900 dark:text-white">
                Analisis Lokasi &amp; Validasi Data
              </h1>
              <p className="text-slate-600 dark:text-text-secondary text-sm font-normal leading-normal">
                {isWind
                  ? 'Validasi kecepatan angin observasi vs GWA 3.0/ERA5, korelasi atlas, dan proyeksi MCP jangka panjang.'
                  : 'Validasi iradiasi surya observasi vs GSA/ERA5, Clearness Index (Kt), dan estimasi AEP PLTS.'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                <Link
                  href={`/laporan?station=${station.id}&from=analisis`}
                  className="flex items-center gap-1.5 px-3 py-2 bg-transparent border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-xs font-medium"
                >
                  <span className="material-symbols-outlined text-[16px]">description</span>
                  Lihat Laporan
                </Link>
                <button
                  onClick={exportXlsx}
                  disabled={exportingXlsx}
                  className="flex items-center gap-1.5 px-3 py-2 bg-transparent border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-xs font-medium disabled:opacity-60 disabled:cursor-wait"
                  title="Download hasil analisis sebagai Excel (XLSX)"
                >
                  <span className={`material-symbols-outlined text-[16px] ${exportingXlsx ? 'animate-spin' : ''}`}>{exportingXlsx ? 'refresh' : 'download'}</span>
                  {exportingXlsx ? 'Memproses...' : 'Ekspor XLSX'}
                </button>
                <button
                  onClick={runAnalysis}
                  disabled={taskState === 'loading'}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all text-xs font-medium shadow-md shadow-blue-500/20"
                >
                  <span className={`material-symbols-outlined text-[16px] ${taskState === 'loading' ? 'animate-spin' : ''}`}>
                    {taskState === 'loading' ? 'progress_activity' : isWind ? 'science' : 'wb_sunny'}
                  </span>
                  {taskState === 'loading' ? 'Memproses…' : isWind ? 'Jalankan Analisis MCP' : 'Jalankan Validasi GHI'}
                </button>
              </div>
              {taskMsg && (
                <p className={`text-[11px] max-w-xs text-right wrap-break-word whitespace-normal leading-relaxed ${taskState === 'error' ? 'text-red-400' : 'text-green-400'}`}>{taskMsg}</p>
              )}
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-white dark:bg-card-dark rounded-lg p-4 border border-gray-200 dark:border-border-dark mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Lokasi Stasiun</label>
              <div className="relative">
                <select
                  value={station.id}
                  onChange={(e) => router.push(`/analisis?station=${e.target.value}`)}
                  className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none pr-8"
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-2 top-2 text-slate-400 pointer-events-none text-[18px]">expand_more</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Periode Data</label>
              <div className="flex items-center gap-1">
                <input className="flex-1 min-w-0 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg px-2 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <span className="text-slate-500 text-[10px] shrink-0">&ndash;</span>
                <input className="flex-1 min-w-0 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg px-2 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div>
              <button
                onClick={() => {
                  const d = new Date(); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() + 1);
                  setStartDate(d.toISOString().slice(0, 10));
                  setEndDate(new Date().toISOString().slice(0, 10));
                }}
                className="w-full py-2 text-primary hover:text-white border border-primary/30 hover:bg-primary rounded-lg text-xs font-medium transition-all"
              >
                Reset Filter
              </button>
            </div>
          </div>
        </div>

        {/* Energy type toggle */}
        <div className="flex items-center gap-3 mb-4">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide shrink-0">Jenis Energi:</p>
          <div className="flex bg-gray-100 dark:bg-[#111a22] rounded-lg p-1 gap-1 border border-gray-200 dark:border-border-dark">
            <button
              onClick={() => setEnergyType('wind')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                isWind
                  ? 'bg-primary text-white shadow-sm shadow-blue-500/30'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">air</span>
              Angin (PLTB)
            </button>
            <button
              onClick={() => setEnergyType('solar')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                !isWind
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">wb_sunny</span>
              Surya (PLTS)
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="material-symbols-outlined text-[14px]">info</span>
            {isWind ? 'Baseline: GWA 3.0 + ERA5 · Metode: MCP' : 'Baseline: GSA + ERA5 · Metode: Validasi Langsung + Kt'}
          </div>
        </div>

        {/* Status banner */}
        <div className={`flex flex-wrap gap-4 items-center justify-between ${mcpStatusColor[station.mcpStatus]} rounded-xl px-5 py-4 mb-6 border`}>
          <div className="flex items-center gap-3">
            <span className={`material-symbols-outlined ${mcpIconColor[station.mcpStatus]} text-[22px]`}>
              {mcpIcon[station.mcpStatus]}
            </span>
            <div>
              <p className={`text-sm font-bold ${mcpIconColor[station.mcpStatus]}`}>
                {mcpStatusLabel[energyType][station.mcpStatus]}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {station.name} &middot; {station.id} &middot;{' '}
                {isWind ? 'Metode: Rasio Varians' : 'Metode: Perbandingan Langsung'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>Sumber: <span className="text-slate-700 dark:text-slate-200 font-semibold">{isWind ? 'GWA 3.0 (Primer)' : 'GSA Solargis (Primer)'}</span></span>
            <span>&middot;</span>
            <span>Atlas: <span className="text-slate-700 dark:text-slate-200 font-semibold">{isWind ? 'GWA 3.0 + ERA5 (ECMWF)' : 'GSA (Solargis) + ERA5 (ECMWF)'}</span></span>
            <span>&middot;</span>
            <span>Periode: <span className="text-slate-700 dark:text-slate-200 font-semibold">{station.period}</span></span>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {isWind ? (
            <>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">Kec. Angin Obs</p>
                  <span className="material-symbols-outlined text-primary text-[20px]">air</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{obsWindMean.toFixed(2)}</h3>
                  <span className="text-sm text-slate-500 dark:text-slate-400">m/s</span>
                  <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded ${obsWindMean >= 5 ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-400'}`}>
                    {obsWindMean >= 5 ? 'Kuat' : 'Moderat'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">vs baseline GWA 3.0 · ERA5 (ECMWF)</p>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">Korelasi Atlas (R²)</p>
                  <span className="material-symbols-outlined text-primary text-[20px]">ssid_chart</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className={`text-2xl font-bold ${windR2Color}`}>{windR2Val.toFixed(2)}</h3>
                  <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded ${windR2Bg}`}>{windR2Quality}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Korelasi Pearson obs vs atlas</p>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">Bias Keseluruhan</p>
                  <span className="material-symbols-outlined text-primary text-[20px]">difference</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{biasDisplay}</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium">vs ERA5</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">MBE harian obs vs ERA5 selama periode obs</p>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-[56px] text-primary">bolt</span>
                </div>
                <div className="flex justify-between items-start mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">Estimasi AEP PLTB (P50)</p>
                    {!hasWindObs && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">Atlas</span>}
                  </div>
                  <span className="material-symbols-outlined text-primary text-[20px]">bolt</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{aepNetP50.toLocaleString('id')}</h3>
                  <span className="text-sm text-slate-500 dark:text-slate-400">MWh/thn</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {hasWindObs ? 'Setelah faktor losses MCP' : 'Estimasi GWA 3.0 · belum ada data observasi angin'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">GHI Observasi</p>
                  <span className="material-symbols-outlined text-amber-400 text-[20px]">wb_sunny</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{(station.irradiation ?? 0).toFixed(1)}</h3>
                  <span className="text-sm text-slate-500 dark:text-slate-400">kWh/m²/hari</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">GHI lapangan vs baseline GSA: <span className="text-amber-400 font-semibold">{ghiBaseline}</span></p>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">Korelasi Atlas (R²)</p>
                  <span className="material-symbols-outlined text-amber-400 text-[20px]">ssid_chart</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className={`text-2xl font-bold ${solarR2Color}`}>{solarR2Val.toFixed(2)}</h3>
                  <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded ${solarR2Bg}`}>{solarR2Quality}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Korelasi obs GHI vs GSA baseline</p>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">Bias Keseluruhan</p>
                  <span className="material-symbols-outlined text-amber-400 text-[20px]">difference</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {station.solarBias != null
                      ? `${station.solarBias > 0 ? '+' : ''}${station.solarBias.toFixed(1)}%`
                      : `${ghiDiff > 0 ? '+' : ''}${ghiDiff.toFixed(1)}%`}
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium">vs ERA5</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">MBE harian obs vs ERA5 · Kt: {ktIndex.toFixed(2)} ({ktLabel})</p>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-[56px] text-amber-400">solar_power</span>
                </div>
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">AEP PLTS (Ref. 1 MWp)</p>
                  <span className="material-symbols-outlined text-amber-400 text-[20px]">solar_power</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{aepSolarRef.toLocaleString('id')}</h3>
                  <span className="text-sm text-slate-500 dark:text-slate-400">MWh/MWp</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">PR = 0.78 · setara CF {((aepSolarRef / 8760) * 100).toFixed(1)}%</p>
              </div>
            </>
          )}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 mb-4">
          {/* Time series */}
          <div className="xl:col-span-3 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark p-4 flex flex-col" style={{ minHeight: '420px' }}>
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Visualisasi Perbandingan Data</h3>
                <p className="text-xs text-slate-500 dark:text-text-secondary">
                  {isWind
                    ? `Deret Waktu (${chartGranularityLabel}): Kec. Angin Obs vs ${hasDailyBaseline ? 'ERA5 Harian (DOY)' : 'GWA 3.0'} — ${station.name}`
                    : `Deret Waktu (${chartGranularityLabel}): GHI Obs vs ${hasDailyBaseline ? 'ERA5 Harian (DOY)' : 'GSA/Solargis'} — ${station.name}`}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${isWind ? 'bg-primary' : 'bg-amber-400'}`} />
                  <span className="text-slate-600 dark:text-slate-300">Terukur (Obs)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <span className="text-slate-600 dark:text-slate-300">{hasDailyBaseline ? 'ERA5 Harian (DOY)' : isWind ? 'GWA 3.0' : 'GSA (Solargis)'}</span>
                </div>
              </div>
            </div>
            <div className="w-full bg-gray-50 dark:bg-[#111a22] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 py-3 pr-3" style={{ flex: '1 1 0', minHeight: '320px' }}>
              {measLoading ? (
                <div className="flex items-center justify-center h-full min-h-55 text-sm text-slate-500">
                  <span className="material-symbols-outlined mr-2 text-[18px]">refresh</span>
                  Memuat data...
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-55 text-sm text-slate-500 gap-2">
                  <span className="material-symbols-outlined text-[32px]">ssid_chart</span>
                  <span>Belum ada data pengukuran</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 15, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', fontSize: 11 }}
                      labelStyle={{ color: tooltipLabel }}
                    />
                    <Line type="monotone" dataKey="obs" name="Terukur (Obs)" stroke={isWind ? '#137fec' : '#f59e0b'} dot={{ r: 4, fill: isWind ? '#137fec' : '#f59e0b' }} strokeWidth={2.5} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="baseline" name={hasDailyBaseline ? 'ERA5 Harian (DOY)' : isWind ? 'ERA5/GWA (LTA)' : 'ERA5/GSA (LTA)'} stroke="#94a3b8" strokeDasharray="5 3" dot={{ r: 3, fill: '#94a3b8' }} strokeWidth={2} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Scatter plot */}
          <div className="xl:col-span-2 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark p-4 flex flex-col" style={{ minHeight: '420px' }}>
            <div className="mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Analisis Korelasi</h3>
              <p className="text-xs text-slate-500 dark:text-text-secondary">
                Deviasi obs dari referensi {hasDailyBaseline ? 'ERA5 Harian (DOY)' : isWind ? 'atlas GWA 3.0' : 'atlas GSA/Solargis'} (Y = obs − atlas)
              </p>
            </div>
            <div className="w-full bg-gray-50 dark:bg-input-bg-dark rounded-lg border border-gray-200 dark:border-gray-800 mb-3" style={{ flex: '1 1 0', minHeight: '320px' }}>
              {measLoading ? (
                <div className="flex items-center justify-center h-full min-h-55 text-sm text-slate-500">
                  <span className="material-symbols-outlined mr-2 text-[18px]">refresh</span>
                  Memuat data...
                </div>
              ) : scatterData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-55 text-sm text-slate-500 gap-2">
                  <span className="material-symbols-outlined text-[32px]">scatter_plot</span>
                  <span>Belum ada data pengukuran</span>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 30, left: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis
                    dataKey="obs" name={isWind ? 'Obs (m/s)' : 'Obs (kWh/m²)'} type="number"
                    domain={['auto', 'auto']} tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false}
                    label={{ value: isWind ? 'Obs (m/s)' : 'Obs (kWh/m²)', position: 'insideBottom', offset: -16, fill: '#64748b', fontSize: 9 }}
                  />
                  <YAxis
                    dataKey="dev" name={isWind ? 'Deviasi (m/s)' : 'Deviasi (kWh/m²)'} type="number"
                    domain={['auto', (dataMax: number) => Math.max(dataMax + 0.5, 0.5)]}
                    tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false}
                    label={{ value: isWind ? 'Deviasi (m/s)' : 'Deviasi (kWh/m²)', angle: -90, position: 'insideLeft', offset: 10, fill: '#64748b', fontSize: 9 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', fontSize: 11 }}
                  />
                  <Scatter data={scatterData} fill={isWind ? '#137fec' : '#f59e0b'} opacity={0.55} />
                  {/* y = x reference line: perfect agreement */}
                  <ReferenceLine
                    y={0}
                    stroke="#e2e8f0"
                    strokeDasharray="5 3"
                    strokeWidth={1.5}
                    label={{ value: 'obs = atlas', position: 'insideTopLeft', fill: '#94a3b8', fontSize: 9 }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
              )}
            </div>
            <div className="bg-gray-50 dark:bg-[#111a22] rounded-lg p-3 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex justify-between mb-1.5">
                <span>Baseline {hasDailyBaseline ? 'ERA5 (DOY)' : 'atlas'}:</span>
                <span className="font-mono">
                {hasDailyBaseline
                  ? (isWind ? `ERA5 per-DOY (${dailyBaseline.size} hari)` : `ERA5 per-DOY (${dailyBaseline.size} hari)`)
                  : isWind
                    ? `${windLongTerm} m/s (${station.windBaselineGwa != null ? 'GWA 3.0' : 'ERA5 (ECMWF)'})`
                    : `${ghiBaseline} kWh/m²/hari (${station.ghiBaselineGsa != null ? 'GSA Solargis' : 'ERA5 (ECMWF)'})`}
              </span>
              </div>
              <div className={`flex justify-between items-center font-bold ${isWind ? windR2Color : solarR2Color}`}>
                <span>R² =</span>
                <span className="text-lg">{isWind ? windR2Val.toFixed(2) : solarR2Val.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Validation table + Projection panel */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
          <div className="xl:col-span-2 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark overflow-hidden flex flex-col h-full">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-border-dark flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Parameter Validasi {isWind ? 'Angin' : 'Surya'}
              </h3>
              <Link href={`/laporan?station=${station.id}&from=analisis`} className="text-xs text-primary font-medium hover:underline">
                Lihat Laporan Lengkap
              </Link>
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-xs text-left">
                <thead className="text-[10px] text-slate-500 dark:text-text-secondary uppercase bg-gray-50 dark:bg-[#1a232c] border-b border-gray-200 dark:border-border-dark">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Metrik</th>
                    <th className="px-4 py-3 font-semibold text-right">Nilai</th>
                    <th className="px-4 py-3 font-semibold text-right">Target</th>
                    <th className="px-4 py-3 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {(isWind ? windValidationRows : solarValidationRows).map((row) => (
                    <tr key={row.metric} className="bg-white dark:bg-card-dark hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{row.metric}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-text-secondary">{row.value}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-text-secondary">{row.target}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                          row.pass === null
                            ? 'bg-slate-500/10 text-slate-400'
                            : row.pass
                            ? 'bg-green-500/10 text-green-500'
                            : 'bg-red-500/10 text-red-400'
                        }`}>
                          {row.pass === null ? (measLoading ? 'Memuat' : 'N/A') : row.pass ? 'Lulus' : 'Perlu Tinjau'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right panel: MCP (wind) or GHI Validation (solar) */}
          <div className="xl:col-span-1 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark p-4 flex flex-col gap-4 h-full">
            {isWind ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded bg-primary/10 text-primary">
                    <span className="material-symbols-outlined text-[20px]">auto_graph</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Hasil Proyeksi MCP</h3>
                    <p className="text-xs text-slate-500 dark:text-text-secondary mt-0.5">Penyesuaian jangka panjang ERA5</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-[#111a22] p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Jangka Pendek (Obs)</p>
                    <p className="text-base font-bold text-slate-900 dark:text-white">{station.windSpeed} m/s</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Periode obs lapangan</p>
                  </div>
                  <div className="bg-primary/5 dark:bg-primary/10 p-3 rounded-lg border border-primary/20">
                    <p className="text-[10px] uppercase text-primary font-bold mb-1">Baseline Atlas</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-base font-bold text-slate-900 dark:text-white">{windLongTerm} m/s</p>
                      <span className={`text-[10px] font-bold ${parseFloat(windDiff) >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                        {parseFloat(windDiff) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(windDiff))}%
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">ERA5 (ECMWF, 2014–2025)</p>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Estimasi AEP PLTB</p>
                    {!hasWindObs && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                        Estimasi Atlas GWA 3.0
                      </span>
                    )}
                  </div>
                  {!hasWindObs && (
                    <p className="text-[10px] text-amber-400/80 mb-2 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[11px]">info</span>
                      Belum ada data observasi angin. Nilai berdasarkan baseline GWA 3.0 ({station.windBaselineGwa ?? station.windBaseline ?? '—'} m/s).
                    </p>
                  )}
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22]">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="material-symbols-outlined text-[16px] text-slate-400">cloud</span>
                        AEP Bruto (P50)
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white text-sm font-mono">{aepGross.toLocaleString('id')} MWh</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22] border-l-4 border-primary">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="material-symbols-outlined text-[16px] text-primary">check_circle</span>
                        AEP Bersih (P50)
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white text-base font-mono">{aepNetP50.toLocaleString('id')} MWh</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22]">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="material-symbols-outlined text-[16px] text-slate-400">shield</span>
                        AEP Bersih (P90)
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white text-sm font-mono">{aepNetP90.toLocaleString('id')} MWh</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded bg-amber-500/10 text-amber-400">
                    <span className="material-symbols-outlined text-[20px]">sunny</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Validasi Radiasi Surya</h3>
                    <p className="text-xs text-slate-500 dark:text-text-secondary mt-0.5">Perbandingan langsung vs GSA/ERA5</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-[#111a22] p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">GHI Observasi</p>
                    <p className="text-base font-bold text-slate-900 dark:text-white">{(station.irradiation ?? 0).toFixed(2)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">kWh/m²/hari (lapangan)</p>
                  </div>
                  <div className="bg-amber-500/5 dark:bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                    <p className="text-[10px] uppercase text-amber-500 font-bold mb-1">Baseline GSA</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-base font-bold text-slate-900 dark:text-white">{ghiBaseline}</p>
                      <span className={`text-[10px] font-bold ${ghiDiff >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                        {ghiDiff >= 0 ? '+' : ''}{ghiDiff}%
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">kWh/m²/hari (GSA/ERA5)</p>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-[#111a22] p-3 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-0.5">Clearness Index (Kt)</p>
                    <p className="text-xs text-slate-400">GHI obs / GHI ekstraterestrial</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-black ${ktColor}`}>{ktIndex.toFixed(2)}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ktBg}`}>{ktLabel}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white mb-2">Estimasi AEP PLTS</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22] border-l-4 border-amber-400">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="material-symbols-outlined text-[16px] text-amber-400">solar_power</span>
                        AEP PLTS (P50) / MWp
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white text-base font-mono">{aepSolarRef.toLocaleString('id')} MWh</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22]">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="material-symbols-outlined text-[16px] text-slate-400">shield</span>
                        AEP PLTS (P90) / MWp
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white text-sm font-mono">{aepSolarP90.toLocaleString('id')} MWh</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22]">
                      <div className="flex items-center gap-2 text-xs text-amber-400">
                        <span className="material-symbols-outlined text-[16px]">info</span>
                        Capacity Factor (CF)
                      </div>
                      <span className="font-bold text-amber-400 text-sm font-mono">{((aepSolarRef / 8760) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Perbandingan Sumber Baseline ─────────────────────────────── */}
        <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-border-dark flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[18px]">compare_arrows</span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Perbandingan Sumber Baseline</h3>
            <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              {isWind ? 'Angin · m/s' : 'Surya · kWh/m²/hari'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] text-slate-500 dark:text-text-secondary uppercase bg-gray-50 dark:bg-[#1a232c] border-b border-gray-200 dark:border-border-dark">
                <tr>
                  <th className="px-4 py-3 font-semibold text-left">Sumber Atlas</th>
                  <th className="px-4 py-3 font-semibold text-right">Nilai Baseline</th>
                  <th className="px-4 py-3 font-semibold text-right">Nilai Obs</th>
                  <th className="px-4 py-3 font-semibold text-right">Deviasi</th>
                  <th className="px-4 py-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {isWind ? (
                  <>
                    <tr className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                          <span className="font-semibold text-slate-900 dark:text-white">GWA 3.0</span>
                          <span className="text-[10px] text-slate-400">GeoTIFF 250m · 100m hub</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">
                        {station.windBaselineGwa != null ? `${station.windBaselineGwa} m/s` : <span className="text-slate-400">–</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">{station.windSpeed} m/s</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {windDiffGwa !== null
                          ? <span className={windDiffGwa >= 0 ? 'text-green-500 font-bold' : 'text-red-400 font-bold'}>{windDiffGwa >= 0 ? '+' : ''}{windDiffGwa}%</span>
                          : <span className="text-slate-400">–</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {station.windBaselineGwa != null
                          ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/30">Aktif</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-400">Belum Tersedia</span>}
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-900 dark:text-white">ERA5 (ECMWF)</span>
                          <span className="text-[10px] text-slate-400">Open-Meteo · 2014–2025</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">
                        {station.windBaselineNasa != null ? `${station.windBaselineNasa} m/s` : <span className="text-slate-400">–</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">{station.windSpeed} m/s</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {windDiffNasa !== null
                          ? <span className={windDiffNasa >= 0 ? 'text-green-500 font-bold' : 'text-red-400 font-bold'}>{windDiffNasa >= 0 ? '+' : ''}{windDiffNasa}%</span>
                          : <span className="text-slate-400">–</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {station.windBaselineNasa != null
                          ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              station.windBaselineGwa != null
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                : 'bg-primary/10 text-primary border border-primary/30'
                            }`}>{station.windBaselineGwa != null ? 'Pembanding' : 'Aktif (Fallback)'}</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-400">Belum Tersedia</span>}
                      </td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                          <span className="font-semibold text-slate-900 dark:text-white">GSA (Solargis)</span>
                          <span className="text-[10px] text-slate-400">REST API · resolusi 1km</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">
                        {station.ghiBaselineGsa != null ? `${station.ghiBaselineGsa} kWh/m²/hari` : <span className="text-slate-400">–</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">{station.irradiation != null ? station.irradiation.toFixed(2) : '–'} kWh/m²/hari</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {ghiDiffGsa !== null
                          ? <span className={ghiDiffGsa >= 0 ? 'text-green-500 font-bold' : 'text-red-400 font-bold'}>{ghiDiffGsa >= 0 ? '+' : ''}{ghiDiffGsa}%</span>
                          : <span className="text-slate-400">–</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {station.ghiBaselineGsa != null
                          ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30">Aktif</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-400">Belum Tersedia</span>}
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-900 dark:text-white">ERA5 (ECMWF)</span>
                          <span className="text-[10px] text-slate-400">Open-Meteo · 2014–2025</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">
                        {station.ghiBaselineNasa != null ? `${station.ghiBaselineNasa} kWh/m²/hari` : <span className="text-slate-400">–</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">{station.irradiation != null ? station.irradiation.toFixed(2) : '–'} kWh/m²/hari</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {ghiDiffNasa !== null
                          ? <span className={ghiDiffNasa >= 0 ? 'text-green-500 font-bold' : 'text-red-400 font-bold'}>{ghiDiffNasa >= 0 ? '+' : ''}{ghiDiffNasa}%</span>
                          : <span className="text-slate-400">–</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {station.ghiBaselineNasa != null
                          ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              station.ghiBaselineGsa != null
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                : 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                            }`}>{station.ghiBaselineGsa != null ? 'Pembanding' : 'Aktif (Fallback)'}</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-400">Belum Tersedia</span>}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-blue-50/50 dark:bg-blue-900/10 border-t border-blue-100 dark:border-blue-900/30 text-[10px] text-slate-400 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[13px] text-blue-400">info</span>
            Nilai <strong className="text-slate-500 dark:text-slate-300">Aktif</strong> dipakai sebagai baseline primer (GWA &gt; ERA5 untuk angin · GSA &gt; ERA5 untuk surya). Kolom kosong (–) artinya data atlas belum diambil — klik <em>Ambil dari Atlas</em> di halaman Admin.
          </div>
        </div>

        {/* ── Data Meteorologi ─────────────────────────────────────────── */}
        {meteoHasData && (
          <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-border-dark flex items-center gap-2">
              <span className="material-symbols-outlined text-teal-400 text-[18px]">device_thermostat</span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Data Meteorologi</h3>
              <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{chartGranularityLabel}</span>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
                {([
                  { label: 'Suhu', unit: '°C', data: tempChartData, color: '#f97316', icon: 'thermometer', textColor: 'text-orange-400' },
                  { label: 'Kelembapan', unit: '%', data: humChartData, color: '#06b6d4', icon: 'water_drop', textColor: 'text-cyan-400' },
                  { label: 'Tekanan Udara', unit: 'hPa', data: presChartData, color: '#8b5cf6', icon: 'compress', textColor: 'text-violet-400', domain: ['auto', 'auto'] as [string, string] },
                  { label: 'Arah Angin', unit: '°', data: windDirChartData, color: '#10b981', icon: 'explore', textColor: 'text-emerald-400', domain: [0, 360] as [number, number] },
                ] as { label: string; unit: string; data: { date: string; obs: number }[]; color: string; icon: string; textColor: string; domain?: [number, number] | [string, string] }[]).map(({ label, unit, data, color, icon, textColor, domain }) => (
                  <div key={label} className="bg-gray-50 dark:bg-[#111a22] rounded-lg border border-gray-100 dark:border-gray-800 p-3">
                    <p className={`text-xs font-semibold ${textColor} mb-2 flex items-center gap-1`}>
                      <span className="material-symbols-outlined text-[14px]">{icon}</span>
                      {label} ({unit})
                    </p>
                    {data.length === 0 ? (
                      <div className="h-30 flex items-center justify-center text-slate-400 text-xs">Belum ada data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={120}>
                        <LineChart data={data} margin={{ top: 5, right: 8, bottom: 5, left: -8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                          <XAxis dataKey="date" tick={{ fontSize: 7, fill: '#64748b' }} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 7, fill: '#64748b' }} tickLine={false} axisLine={false} domain={domain ?? ['auto', 'auto']} />
                          <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', fontSize: 10 }} />
                          <Line type="monotone" dataKey="obs" stroke={color} strokeWidth={2} dot={false} name={label} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Suhu Rata-rata', value: tempAvg !== null ? `${tempAvg.toFixed(1)} °C` : '–', color: 'text-orange-400' },
                  { label: 'Kelembapan Rata-rata', value: humAvg !== null ? `${humAvg.toFixed(1)} %` : '–', color: 'text-cyan-400' },
                  { label: 'Tekanan Udara Rata-rata', value: presAvg !== null ? `${presAvg.toFixed(1)} hPa` : '–', color: 'text-violet-400' },
                  { label: 'Arah Angin Dominan', value: windDirAvg !== null ? `${windDirAvg.toFixed(0)}° (${compassDir(windDirAvg)})` : '–', color: 'text-emerald-400' },
                ].map((s) => (
                  <div key={s.label} className="bg-gray-50 dark:bg-[#111a22] rounded-lg p-3 border border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] text-slate-400 uppercase mb-1">{s.label}</p>
                    <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Assumptions */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-amber-400 text-[18px]">info</span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Asumsi dan Keterbatasan</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-text-secondary">
            <div className="flex gap-2.5">
              <span className="material-symbols-outlined text-[17px] text-slate-400 mt-0.5 shrink-0">schedule</span>
              <span>
                <strong className="text-slate-800 dark:text-slate-200">Durasi observasi:</strong>{' '}
                {station.period}.{' '}
                {isWind ? 'Minimum rekomendasi IEC 61400-12: 12 bulan ✓' : 'Minimum rekomendasi IEC 61853: 12 bulan ✓'}
              </span>
            </div>
            <div className="flex gap-2.5">
              <span className="material-symbols-outlined text-[17px] text-slate-400 mt-0.5 shrink-0">satellite_alt</span>
              <span>
                <strong className="text-slate-800 dark:text-slate-200">Sumber referensi:</strong>{' '}
                ERA5 (ECMWF), rata-rata 12 tahun 2014–2025 (IEC 61400-12).{' '}
                {isWind ? 'Atlas angin: GWA 3.0 (resolusi 250m).' : 'Atlas surya: GSA (resolusi 1km), sumber SOLARGIS.'}
              </span>
            </div>
            <div className="flex gap-2.5">
              <span className="material-symbols-outlined text-[17px] text-slate-400 mt-0.5 shrink-0">sync_alt</span>
              <span>
                <strong className="text-slate-800 dark:text-slate-200">
                  {isWind ? 'Periode overlap MCP:' : 'Periode validasi GHI:'}
                </strong>{' '}
                {station.period}.{' '}
                {isWind ? 'Overlap minimum untuk MCP valid: ≥ 6 bulan.' : 'Data harian minimum untuk validasi surya: ≥ 30 hari/bulan.'}
              </span>
            </div>
            <div className="flex gap-2.5">
              <span className="material-symbols-outlined text-[17px] text-amber-400 mt-0.5 shrink-0">warning</span>
              <span>
                <strong className="text-slate-800 dark:text-slate-200">Catatan:</strong>{' '}
                {isWind
                  ? 'Hasil ini adalah analisis pre-feasibility / screening awal. Bukan Wind Resource Assessment (WRA) bankable grade.'
                  : 'Hasil ini adalah analisis pre-feasibility / screening awal. Bukan Solar Resource Assessment (SRA) bankable grade. AEP dihitung untuk sistem referensi 1 MWp (PR = 0.78).'}
              </span>
            </div>
          </div>
        </div>

      </main>

      <Footer />
    </div>
  );
}

export default function AnalisisPage() {
  useEffect(() => { document.title = 'Analisis | RE-Valid'; }, []);
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
          <span className="material-symbols-outlined text-primary animate-spin text-[40px]">progress_activity</span>
        </div>
      }
    >
      <AnalisisContent />
    </Suspense>
  );
}
