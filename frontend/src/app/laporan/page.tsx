'use client';

import { Suspense, useState, useMemo, useRef, useEffect } from 'react';
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
import {
  apiFetch,
  fetchGisMcda,
  type GisMcdaData,
} from '@/lib/api';

const statusLabel: Record<string, string> = {
  prioritas: 'Prioritas',
  kandidat: 'Kandidat',
  tidak_sesuai: 'Tidak Sesuai',
};

const statusBg: Record<string, string> = {
  prioritas: 'bg-green-500/10 border-green-500/30 text-green-400',
  kandidat: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  tidak_sesuai: 'bg-slate-500/10 border-slate-500/30 text-slate-400',
};

const mcpLabel: Record<string, string> = {
  selesai: 'Selesai',
  berjalan: 'Berjalan',
  pending: 'Pending',
};

const mcpBadge: Record<string, string> = {
  selesai: 'bg-primary/10 border-primary/30 text-primary',
  berjalan: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  pending: 'bg-slate-500/10 border-slate-500/30 text-slate-400',
};

const DISPLAY_TIME_ZONE = 'Asia/Jakarta';
const EXPECTED_SAMPLES_PER_DAY = 1440;
const REPORT_MEASUREMENT_FETCH_LIMIT = 20_000;
const jakartaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

type DailyBaselineRow = { doy: number; ghi_era5: number | null; wind_era5: number | null };
type ChartPoint = { key: string; date: string; obs: number; baseline: number };
type DeviationPoint = { obs: number; dev: number };
type Era5BaselineSummary = { value: number; mode: 'period' | 'annual'; count: number };

function getJakartaDateKey(isoDate: string): string {
  const parts = jakartaDateFormatter.formatToParts(new Date(isoDate));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isDateInput(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toJakartaDateInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2024) return null;
  return getJakartaDateKey(value);
}

function defaultDateRange(
  firstMeasAt: string | null | undefined,
  lastMeasAt: string | null | undefined,
): { start: string; end: string } {
  const start = toJakartaDateInput(firstMeasAt);
  const end = toJakartaDateInput(lastMeasAt);
  if (start && end && start <= end) return { start, end };
  if (start) return { start, end: start };
  if (end) return { start: end, end };

  const today = new Date();
  const fallbackStart = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  return { start: fallbackStart, end: today.toISOString().slice(0, 10) };
}

function dateKeyToUtcDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function getDoyFromDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = Date.UTC(year, month - 1, day);
  const start = Date.UTC(year, 0, 0);
  return Math.floor((date - start) / 86_400_000);
}

function getDoy(isoDate: string): number {
  return getDoyFromDateKey(getJakartaDateKey(isoDate));
}

function getWeekStartDateKey(dateKey: string): string {
  const d = dateKeyToUtcDate(dateKey);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

function formatDateKeyLabel(dateKey: string): string {
  return dateKeyToUtcDate(dateKey).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function formatReportDate(dateKey: string): string {
  return dateKeyToUtcDate(dateKey).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatMonthKeyLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1, 12)).toLocaleDateString('id-ID', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function roundNumber(value: number, digits = 2): number {
  return parseFloat(value.toFixed(digits));
}

function baselineSkillColor(value: number | null | undefined): string {
  const score = value ?? 0;
  return score >= 0.85 ? 'text-green-400' : score >= 0.70 ? 'text-amber-400' : 'text-red-400';
}

function LaporanContent() {
  const { stations } = useStations();
  const searchParams = useSearchParams();
  const router = useRouter();
  const stationId = searchParams.get('station') ?? stations[0]?.id ?? '';
  const station = stations.find((s) => s.id === stationId) ?? stations[0];

  const defaultRange = defaultDateRange(station?.firstMeasurementAt, station?.lastMeasurementAt);
  const queryStart = searchParams.get('start');
  const queryEnd = searchParams.get('end');
  const selectedStart = isDateInput(queryStart) ? queryStart : defaultRange.start;
  const selectedEnd = isDateInput(queryEnd) ? queryEnd : defaultRange.end;
  const reportStartDate = selectedStart <= selectedEnd ? selectedStart : selectedEnd;
  const reportEndDate = selectedStart <= selectedEnd ? selectedEnd : selectedStart;
  const reportPeriodLabel = `${formatReportDate(reportStartDate)} - ${formatReportDate(reportEndDate)}`;

  const fromPage = searchParams.get('from') ?? 'peta';
  const backHref = fromPage === 'analisis'
    ? `/analisis?station=${stationId}&start=${reportStartDate}&end=${reportEndDate}`
    : fromPage === 'kalkulator' ? '/kalkulator' : '/peta';
  const backLabel = fromPage === 'analisis' ? 'Kembali ke Analisis Lokasi' : fromPage === 'kalkulator' ? 'Kembali ke Kalkulator' : 'Kembali ke Peta';

  const { measurements } = useMeasurements(
    stationId,
    reportStartDate,
    reportEndDate,
    REPORT_MEASUREMENT_FETCH_LIMIT,
  );

  const [dailyBaseline, setDailyBaseline] = useState<Map<number, DailyBaselineRow>>(new Map());
  useEffect(() => {
    if (!stationId) return;
    apiFetch(`/api/v1/stations/${stationId}/daily-baseline?ensure=true`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: DailyBaselineRow[]) => {
        const map = new Map<number, DailyBaselineRow>();
        rows.forEach((row) => map.set(row.doy, row));
        setDailyBaseline(map);
      })
      .catch(() => setDailyBaseline(new Map()));
  }, [stationId]);

  // ── Prioritas GIS-MCDA: fetch dari backend (Overpass API / OSM) ────────────
  const [gisMcda, setGisMcda] = useState<GisMcdaData | null>(null);
  const [gisMcdaLoading, setGisMcdaLoading] = useState(false);
  useEffect(() => {
    if (!stationId) return;
    setGisMcda(null);
    setGisMcdaLoading(true);
    fetchGisMcda(stationId)
      .then(setGisMcda)
      .catch(() => setGisMcda(null))
      .finally(() => setGisMcdaLoading(false));
  }, [stationId]);

  // Derived baseline values — computed before any early return so hooks below are always called
  const windBaselineVal = station?.windBaseline ?? (station?.windSpeed ?? 0) * 1.046;
  const ghiBaselineVal = station?.ghiBaseline ?? (station?.irradiation ?? 0) * 0.958;

  const measurementDoys = useMemo(() => {
    const doys = new Set<number>();
    measurements.forEach((m) => doys.add(getDoy(m.measured_at)));
    return [...doys].sort((a, b) => a - b);
  }, [measurements]);

  const measurementDateKeys = useMemo(() => {
    const days = new Set<string>();
    measurements.forEach((m) => days.add(getJakartaDateKey(m.measured_at)));
    return [...days].sort();
  }, [measurements]);

  const sampleCoverage = useMemo(() => {
    const expected = measurementDateKeys.length * EXPECTED_SAMPLES_PER_DAY;
    const pct = (valid: number) => (expected > 0 ? Math.round((valid / expected) * 100) : null);
    const windValid = measurements.filter((m) => m.wind_speed != null).length;
    const ghiValid = measurements.filter((m) => m.ghi != null).length;
    return {
      days: measurementDateKeys.length,
      expected,
      total: measurements.length,
      wind: { valid: windValid, pct: pct(windValid) },
      ghi: { valid: ghiValid, pct: pct(ghiValid) },
    };
  }, [measurements, measurementDateKeys]);

  const era5WindSummary = useMemo<Era5BaselineSummary | null>(() => {
    const periodVals = measurementDoys
      .map((doy) => dailyBaseline.get(doy)?.wind_era5)
      .filter((v): v is number => v != null && v > 0);
    if (periodVals.length > 0) {
      return { value: roundNumber(average(periodVals) ?? 0, 2), mode: 'period', count: periodVals.length };
    }
    const annualVals = [...dailyBaseline.values()]
      .map((row) => row.wind_era5)
      .filter((v): v is number => v != null && v > 0);
    return annualVals.length > 0
      ? { value: roundNumber(average(annualVals) ?? 0, 2), mode: 'annual', count: annualVals.length }
      : null;
  }, [dailyBaseline, measurementDoys]);

  const era5GhiSummary = useMemo<Era5BaselineSummary | null>(() => {
    const periodVals = measurementDoys
      .map((doy) => dailyBaseline.get(doy)?.ghi_era5)
      .filter((v): v is number => v != null && v > 0);
    if (periodVals.length > 0) {
      return { value: roundNumber(average(periodVals) ?? 0, 2), mode: 'period', count: periodVals.length };
    }
    const annualVals = [...dailyBaseline.values()]
      .map((row) => row.ghi_era5)
      .filter((v): v is number => v != null && v > 0);
    return annualVals.length > 0
      ? { value: roundNumber(average(annualVals) ?? 0, 2), mode: 'annual', count: annualVals.length }
      : null;
  }, [dailyBaseline, measurementDoys]);

  const windEra5ComparisonBaseline = era5WindSummary?.value ?? station?.windBaselineNasa ?? null;
  const ghiEra5ComparisonBaseline = era5GhiSummary?.value ?? station?.ghiBaselineNasa ?? null;
  const windEra5Label = era5WindSummary
    ? era5WindSummary.mode === 'period'
      ? `ERA5 per-DOY (${era5WindSummary.count} hari periode)`
      : `ERA5 per-DOY (${era5WindSummary.count} DOY tahunan)`
    : 'ERA5 LTA';
  const ghiEra5Label = era5GhiSummary
    ? era5GhiSummary.mode === 'period'
      ? `ERA5 per-DOY (${era5GhiSummary.count} hari periode)`
      : `ERA5 per-DOY (${era5GhiSummary.count} DOY tahunan)`
    : 'ERA5 LTA';

  // Selalu tampilkan per hari — laporan menampilkan seluruh data validasi per titik harian
  const chartGranularity = 'daily' as const;

  const baselineForDoy = (doy: number, variable: 'wind' | 'solar') => {
    const row = dailyBaseline.get(doy);
    const doyValue = variable === 'wind' ? row?.wind_era5 : row?.ghi_era5;
    if (doyValue != null && doyValue > 0) return doyValue;
    return variable === 'wind' ? windBaselineVal : ghiBaselineVal;
  };

  function makeChartData(
    meas: Measurement[],
    getValue: (m: Measurement) => number | null,
    getBaseline: (doy: number) => number,
    granularity: 'daily' | 'weekly' | 'monthly',
    sumToKwhPerDay = false,
  ): ChartPoint[] {
    const groups = new Map<string, { label: string; values: number[]; baselinesByDoy: Map<number, number> }>();
    meas.forEach((m) => {
      const dateKey = getJakartaDateKey(m.measured_at);
      const doy = getDoyFromDateKey(dateKey);
      let key: string;
      let label: string;
      if (granularity === 'daily') {
        key = dateKey;
        label = formatDateKeyLabel(dateKey);
      } else if (granularity === 'weekly') {
        key = getWeekStartDateKey(dateKey);
        label = `Mgg ${formatDateKeyLabel(key)}`;
      } else {
        key = dateKey.slice(0, 7);
        label = formatMonthKeyLabel(key);
      }
      if (!groups.has(key)) groups.set(key, { label, values: [], baselinesByDoy: new Map() });
      const group = groups.get(key)!;
      const baseline = getBaseline(doy);
      if (baseline > 0) group.baselinesByDoy.set(doy, baseline);
      const value = getValue(m);
      if (value != null && Number.isFinite(value)) group.values.push(value);
    });

    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([, { values }]) => values.length > 0)
      .map(([key, { label, values, baselinesByDoy }]) => {
        const baselineMean = average([...baselinesByDoy.values()]) ?? 0;
        return {
          key,
          date: label,
          obs: sumToKwhPerDay
            ? roundNumber(values.reduce((a, b) => a + b, 0) / 60000, 2)
            : roundNumber(average(values) ?? 0, 2),
          baseline: roundNumber(baselineMean, 3),
        };
      });
  }

  const windChartData = useMemo(
    () => makeChartData(
      measurements,
      (m) => (m.wind_speed != null ? Number(m.wind_speed) : null),
      (doy) => baselineForDoy(doy, 'wind'),
      chartGranularity,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measurements, dailyBaseline, windBaselineVal, chartGranularity],
  );
  const ghiChartData = useMemo(
    // GHI harian (kWh/m²/hari) = SUM(GHI_i W/m²) / 60_000 (interval 1 menit, sumNotMean=true)
    () => makeChartData(
      measurements,
      (m) => (m.ghi != null ? Number(m.ghi) : null),
      (doy) => baselineForDoy(doy, 'solar'),
      chartGranularity,
      true,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measurements, dailyBaseline, ghiBaselineVal, chartGranularity],
  );
  const windScatterData = useMemo(() => {
    const all = windChartData.map((d) => ({ obs: d.obs, dev: roundNumber(d.obs - d.baseline, 3) }));
    // Downsample ke maks 400 titik.
    const step = all.length > 400 ? Math.ceil(all.length / 400) : 1;
    return step === 1 ? all : all.filter((_, i) => i % step === 0);
  }, [windChartData]);
  const ghiScatterData = useMemo(() => {
    const all = ghiChartData.map((d) => ({ obs: d.obs, dev: roundNumber(d.obs - d.baseline, 3) }));
    const step = all.length > 400 ? Math.ceil(all.length / 400) : 1;
    return step === 1 ? all : all.filter((_, i) => i % step === 0);
  }, [ghiChartData]);

  // ─── Meteorological chart data ────────────────────────────────────────────
  const tempChartData = useMemo(
    () => makeChartData(measurements, (m) => (m.temperature != null ? Number(m.temperature) : null), () => 0, chartGranularity),
    [measurements, chartGranularity],
  );
  const humChartData = useMemo(
    () => makeChartData(measurements, (m) => (m.humidity != null ? Number(m.humidity) : null), () => 0, chartGranularity),
    [measurements, chartGranularity],
  );
  const presChartData = useMemo(
    () => makeChartData(measurements, (m) => (m.pressure != null ? Number(m.pressure) : null), () => 0, chartGranularity),
    [measurements, chartGranularity],
  );
  const windDirChartData = useMemo(
    () => makeChartData(measurements, (m) => (m.wind_dir != null ? Number(m.wind_dir) : null), () => 0, chartGranularity),
    [measurements, chartGranularity],
  );
  const meteoHasData = [tempChartData, humChartData, presChartData, windDirChartData].some((d) => d.length > 0);

  // keep legacy aliases used by existing Recharts preview
  const chartTsRef = useRef<HTMLDivElement>(null);
  const chartScatterRef = useRef<HTMLDivElement>(null);
  const chartTsGhiRef = useRef<HTMLDivElement>(null);
  const chartScatterGhiRef = useRef<HTMLDivElement>(null);

  const [exporting, setExporting] = useState<'pdf' | 'csv' | 'geojson' | null>(null);

  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    setIsDark(localStorage.getItem('re_valid_theme') !== 'light');
  }, []);

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

  // Gunakan data angin jika stasiun memiliki variabel angin, surya jika tidak
  const hasWind = station.variables.toLowerCase().includes('angin');
  const hasSolar = station.variables.toLowerCase().includes('iradiasi')
    || station.variables.toLowerCase().includes('surya')
    || station.variables.toLowerCase().includes('ghi');
  const obsWindMean = windChartData.length > 0
    ? roundNumber(average(windChartData.map((d) => d.obs)) ?? 0, 2)
    : (station.windSpeed ?? 0);
  const obsGhiMean = ghiChartData.length > 0
    ? roundNumber(average(ghiChartData.map((d) => d.obs)) ?? 0, 2)
    : (station.irradiation ?? 0);
  const windRmseVal = station.windRmse ?? (station.rmse > 0 ? station.rmse : null);
  const windBiasVal = station.windBias ?? station.bias;
  const windR2Val = station.windR2 ?? (station.r2 > 0 ? station.r2 : null);
  const solarRmseVal = station.solarRmse ?? null;
  const solarBiasVal = station.solarBias ?? station.bias;
  const solarR2Val = station.solarR2 ?? (station.r2 > 0 ? station.r2 : null);
  const windMaeVal = windChartData.length > 0
    ? roundNumber(windChartData.reduce((sum, d) => sum + Math.abs(d.obs - d.baseline), 0) / windChartData.length, 2)
    : null;
  const solarMaeVal = ghiChartData.length > 0
    ? roundNumber(ghiChartData.reduce((sum, d) => sum + Math.abs(d.obs - d.baseline), 0) / ghiChartData.length, 2)
    : null;
  const windBiasGwa = station.windBaselineGwa != null && station.windBaselineGwa > 0
    ? roundNumber(((obsWindMean - station.windBaselineGwa) / station.windBaselineGwa) * 100, 1)
    : null;
  const windBiasEra5 = windEra5ComparisonBaseline != null && windEra5ComparisonBaseline > 0
    ? roundNumber(((obsWindMean - windEra5ComparisonBaseline) / windEra5ComparisonBaseline) * 100, 1)
    : null;
  const ghiBiasGsa = station.ghiBaselineGsa != null && station.ghiBaselineGsa > 0
    ? roundNumber(((obsGhiMean - station.ghiBaselineGsa) / station.ghiBaselineGsa) * 100, 1)
    : null;
  const ghiBiasEra5 = ghiEra5ComparisonBaseline != null && ghiEra5ComparisonBaseline > 0
    ? roundNumber(((obsGhiMean - ghiEra5ComparisonBaseline) / ghiEra5ComparisonBaseline) * 100, 1)
    : null;
  const ktVal = roundNumber(obsGhiMean / 8.5, 2);
  const windAvailabilityText = sampleCoverage.expected > 0
    ? `${sampleCoverage.wind.pct}% (${sampleCoverage.wind.valid}/${sampleCoverage.expected})`
    : '–';
  const ghiAvailabilityText = sampleCoverage.expected > 0
    ? `${sampleCoverage.ghi.pct}% (${sampleCoverage.ghi.valid}/${sampleCoverage.expected})`
    : '–';
  const firstMeasurementAt = measurements[0]?.measured_at ?? null;
  const lastMeasurementAt = measurements[measurements.length - 1]?.measured_at ?? null;
  const windAepGross = station.aep != null && station.aep > 0
    ? station.aep
    : station.windAep != null && station.windAep > 0 ? station.windAep : null;
  const windAepSource = station.aep != null && station.aep > 0 ? 'observasi/MCP' : station.windAep != null && station.windAep > 0 ? 'atlas GWA' : null;
  const windAepP50 = windAepGross != null ? Math.round(windAepGross * 0.877) : null;
  const windAepP90 = windAepGross != null ? Math.round(windAepGross * 0.767) : null;
  const solarAep10Mwp = station.solarAep != null && station.solarAep > 0
    ? Math.round(station.solarAep)
    : Math.round(ghiBaselineVal * 365 * 10 * 0.78);
  const solarSpecificYield = Math.round(ghiBaselineVal * 365 * 0.78);
  const validationDailyRows = (() => {
    const rows = new Map<string, {
      key: string;
      label: string;
      windObs: number | null;
      windBaseline: number | null;
      ghiObs: number | null;
      ghiBaseline: number | null;
      tempAvg: number | null;
      humAvg: number | null;
      presAvg: number | null;
      windDirAvg: number | null;
    }>();
    const ensureRow = (point: ChartPoint) => {
      if (!rows.has(point.key)) {
        rows.set(point.key, {
          key: point.key,
          label: point.date,
          windObs: null,
          windBaseline: null,
          ghiObs: null,
          ghiBaseline: null,
          tempAvg: null,
          humAvg: null,
          presAvg: null,
          windDirAvg: null,
        });
      }
      return rows.get(point.key)!;
    };
    windChartData.forEach((point) => {
      const row = ensureRow(point);
      row.windObs = point.obs;
      row.windBaseline = point.baseline;
    });
    ghiChartData.forEach((point) => {
      const row = ensureRow(point);
      row.ghiObs = point.obs;
      row.ghiBaseline = point.baseline;
    });
    tempChartData.forEach((point) => {
      ensureRow(point).tempAvg = point.obs;
    });
    humChartData.forEach((point) => {
      ensureRow(point).humAvg = point.obs;
    });
    presChartData.forEach((point) => {
      ensureRow(point).presAvg = point.obs;
    });
    windDirChartData.forEach((point) => {
      ensureRow(point).windDirAvg = point.obs;
    });
    return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
  })();
  const meteoDailyPointCount = validationDailyRows.filter((row) => (
    row.tempAvg != null || row.humAvg != null || row.presAvg != null || row.windDirAvg != null
  )).length;
  const meteoSummary = (() => {
    const tempVals = measurements.map((m) => m.temperature).filter((v): v is number => v != null);
    const humVals = measurements.map((m) => m.humidity).filter((v): v is number => v != null);
    const presVals = measurements.map((m) => m.pressure).filter((v): v is number => v != null);
    const windDirVals = measurements.map((m) => m.wind_dir).filter((v): v is number => v != null);
    return {
      count: measurements.filter((m) => m.temperature != null || m.humidity != null || m.pressure != null || m.wind_dir != null).length,
      tempAvg: average(tempVals),
      humAvg: average(humVals),
      presAvg: average(presVals),
      windDirAvg: average(windDirVals),
    };
  })();
  const granularityLabel = chartGranularity === 'daily' ? 'Rata-rata Harian' : chartGranularity === 'weekly' ? 'Rata-rata Mingguan' : 'Rata-rata Bulanan';
  const gridColor = isDark ? '#2d3b4a' : '#e2e8f0';
  const tooltipBg = isDark ? '#1c2630' : '#ffffff';
  const tooltipBorder = isDark ? '#2d3b4a' : '#e2e8f0';
  const tooltipLabel = isDark ? '#92adc9' : '#374151';

  // Faktor prioritas GIS-MCDA.
  // Jika data Overpass sudah tiba, gunakan jarak nyata per koordinat.
  // Jika gagal, gunakan fallback konservatif agar tidak memberi presisi palsu.
  const alt = station.altitude;
  const mcdaFactors: { label: string; pct: number; detail?: string | null }[] = gisMcda
    ? gisMcda.factors
    : [
        { label: 'Potensi EBT', pct: station.score, detail: null },
        {
          label: 'Topografi',
          pct: alt < 200 ? 70 : alt < 600 ? 55 : alt < 1500 ? 65 : 40,
          detail: `${alt} m dpl`,
        },
        {
          label: 'Aksesibilitas',
          pct: 20,
          detail: 'Skor sementara: data jalan OSM/Overpass belum berhasil dimuat',
        },
        {
          label: 'Infrastruktur',
          pct: 30,
          detail: 'Skor sementara: data transmisi OSM/Overpass belum berhasil dimuat',
        },
      ];

  async function handleExportPDF() {
    setExporting('pdf');
    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = pdf.internal.pageSize.getWidth();
      let y = 18;

      // Header bar
      pdf.setFillColor(19, 127, 236);
      pdf.rect(0, 0, W, 14, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RE-Valid — Laporan Validasi Potensi EBT', 10, 9.5);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Diekspor: ${new Date().toLocaleString('id-ID')}`, W - 10, 9.5, { align: 'right' });

      // Station title
      pdf.setTextColor(30, 30, 30);
      pdf.setFontSize(15);
      pdf.setFont('helvetica', 'bold');
      pdf.text(station.name, 10, y);
      y += 6;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 100, 100);
      pdf.text(`${station.region}  ·  ID: ${station.id}  ·  Status: ${statusLabel[station.status]}  ·  MCP: ${mcpLabel[station.mcpStatus]}`, 10, y);
      y += 8;

      // Section helper
      const sectionTitle = (title: string) => {
        if (y > 270) { pdf.addPage(); y = 18; }
        pdf.setFillColor(235, 240, 250);
        pdf.rect(10, y, W - 20, 7, 'F');
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(19, 127, 236);
        pdf.text(title, 12, y + 5);
        y += 10;
      };
      const row = (label: string, value: string, highlight?: boolean) => {
        if (y > 278) { pdf.addPage(); y = 18; }
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(80, 80, 80);
        pdf.text(label, 14, y);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(highlight ? 22 : 30, highlight ? 163 : 30, highlight ? 74 : 30);
        pdf.text(value, W - 14, y, { align: 'right' });
        y += 5.5;
      };

      // Identitas Stasiun
      sectionTitle('Identitas Stasiun');
      row('Koordinat', `${station.lat.toFixed(4)}, ${station.lon.toFixed(4)}`);
      row('Ketinggian', `${station.altitude.toLocaleString('id')} m dpl`);
      row('Periode', station.period);
      row('Periode Data Laporan', reportPeriodLabel);
      row('Variabel', station.variables);
      row('Jumlah Data Terambil', `${sampleCoverage.total.toLocaleString('id')} baris`);
      row('Cakupan Hari Data', `${sampleCoverage.days} hari`);
      row('Rentang Timestamp', firstMeasurementAt && lastMeasurementAt ? `${getJakartaDateKey(firstMeasurementAt)} s/d ${getJakartaDateKey(lastMeasurementAt)}` : '–');
      y += 3;

      // Metrik Validasi Angin
      sectionTitle('Metrik Validasi Angin (ERA5 DOY vs Observasi)');
      row('Kecepatan Angin Rata-rata Periode (Obs)', `${obsWindMean.toFixed(2)} m/s`);
      row('RMSE', windRmseVal != null ? `${windRmseVal.toFixed(2)} m/s` : '–');
      row('MAE Harian', windMaeVal != null ? `${windMaeVal.toFixed(2)} m/s` : '–');
      row('Bias vs GWA LTA', windBiasGwa != null ? `${windBiasGwa >= 0 ? '+' : ''}${windBiasGwa.toFixed(1)} %` : '–');
      row(`Bias vs ${windEra5Label}`, windBiasEra5 != null ? `${windBiasEra5 >= 0 ? '+' : ''}${windBiasEra5.toFixed(1)} %` : '–');
      row('Bias MBE Tersimpan', windBiasVal != null ? `${windBiasVal > 0 ? '+' : ''}${windBiasVal.toFixed(1)} %` : '–');
      row('Kelengkapan Sampel 1 Menit', windAvailabilityText);
      row('Skor Kesesuaian Baseline', windR2Val != null ? windR2Val.toFixed(2) : '–');
      row('AEP PLTB P50 (Bersih)', windAepP50 != null ? `${windAepP50.toLocaleString('id')} MWh/thn` : '–');
      row('AEP PLTB P90 (Bersih)', windAepP90 != null ? `${windAepP90.toLocaleString('id')} MWh/thn` : '–');
      row('Skor Teknis Lokasi', `${station.score} / 100`);
      y += 3;

      // Validasi Surya
      sectionTitle('Validasi Surya — GHI (ERA5 DOY/GSA vs Observasi)');
      row('GHI Observasi Rata-rata Periode', `${obsGhiMean.toFixed(2)} kWh/m²/hari`);
      row('GHI Baseline GSA (Solargis)', station.ghiBaselineGsa != null ? `${station.ghiBaselineGsa.toFixed(2)} kWh/m²/hari` : '—');
      row(`GHI Baseline ${ghiEra5Label}`, ghiEra5ComparisonBaseline != null ? `${ghiEra5ComparisonBaseline.toFixed(2)} kWh/m²/hari` : '—');
      row('GHI Best-Value', `${(station.ghiBaseline ?? (station.irradiation ?? 0) * 0.958).toFixed(2)} kWh/m²/hari`);
      row('RMSE', solarRmseVal != null ? `${solarRmseVal.toFixed(2)} kWh/m²/hari` : '–');
      row('MAE Harian', solarMaeVal != null ? `${solarMaeVal.toFixed(2)} kWh/m²/hari` : '–');
      row('Bias vs GSA LTA', ghiBiasGsa != null ? `${ghiBiasGsa >= 0 ? '+' : ''}${ghiBiasGsa.toFixed(1)} %` : '–');
      row(`Bias vs ${ghiEra5Label}`, ghiBiasEra5 != null ? `${ghiBiasEra5 >= 0 ? '+' : ''}${ghiBiasEra5.toFixed(1)} %` : '–');
      row('Bias MBE Tersimpan', solarBiasVal != null ? `${solarBiasVal > 0 ? '+' : ''}${solarBiasVal.toFixed(1)} %` : '–');
      row('Kelengkapan Sampel 1 Menit', ghiAvailabilityText);
      row('Skor Kesesuaian Baseline', solarR2Val != null ? solarR2Val.toFixed(2) : '–');
      row('Clearness Index (Kt)', ktVal.toFixed(2));
      y += 3;

      // Perbandingan Sumber Angin
      sectionTitle('Perbandingan Sumber Baseline Angin');
      row('Obs Lapangan (rata-rata periode)', `${obsWindMean.toFixed(2)} m/s`);
      row('GWA 3.0 (GeoTIFF 250m)', station.windBaselineGwa != null ? `${station.windBaselineGwa} m/s` : '— (belum tersedia)');
      row(windEra5Label, windEra5ComparisonBaseline != null ? `${windEra5ComparisonBaseline.toFixed(2)} m/s` : '— (belum tersedia)');
      row('Best-Value (dipakai MCP)', `${(station.windBaseline ?? station.windSpeed ?? 0).toFixed(2)} m/s`);
      y += 3;

      // Potensi Energi
      sectionTitle('Potensi Energi');
      row('Kecepatan Angin LTA untuk AEP (GWA/ERA5)', `${windBaselineVal.toFixed(2)} m/s`);
      row('Iradiasi GHI LTA untuk AEP (GSA/ERA5)', `${ghiBaselineVal.toFixed(2)} kWh/m²/hari`);
      row('AEP PLTB Gross', windAepGross != null ? `${Math.round(windAepGross).toLocaleString('id')} MWh/thn (${windAepSource})` : '–');
      row('AEP PLTB P50 Net (×0.877)', windAepP50 != null ? `${windAepP50.toLocaleString('id')} MWh/thn` : '–');
      row('AEP PLTB P90 Net (×0.767)', windAepP90 != null ? `${windAepP90.toLocaleString('id')} MWh/thn` : '–');
      row('AEP PLTS 10 MWp (PR=78%)', `${solarAep10Mwp.toLocaleString('id')} MWh/thn`);
      row('Hasil Spesifik PLTS /MWp (kWh/kWp·thn)', `${solarSpecificYield.toLocaleString('id')} kWh/kWp·thn`);
      y += 3;

      // Prioritas GIS-MCDA
      sectionTitle('Prioritas GIS-MCDA');
      mcdaFactors.forEach((f) => {
        const detailSuffix = f.detail ? ` (${f.detail})` : '';
        row(f.label, `${f.pct}%${detailSuffix}`);
      });
      if (gisMcda) {
        row('Sumber data', gisMcda.data_source);
      }
      y += 3;

      // Data Meteorologi — show if any sensor readings exist
      if (meteoSummary.count > 0) {
        const lastWindDir = [...measurements].reverse().find((m) => m.wind_dir !== null)?.wind_dir ?? null;
        sectionTitle('Data Meteorologi Rata-rata (Sensor Lapangan)');
        row('Suhu Rata-rata (°C)', meteoSummary.tempAvg != null ? `${meteoSummary.tempAvg.toFixed(1)} °C` : '–');
        row('Kelembapan Rata-rata (%)', meteoSummary.humAvg != null ? `${meteoSummary.humAvg.toFixed(1)} %` : '–');
        row('Tekanan Udara Rata-rata (hPa)', meteoSummary.presAvg != null ? `${meteoSummary.presAvg.toFixed(1)} hPa` : '–');
        row('Arah Angin Rata-rata (°)', meteoSummary.windDirAvg != null ? `${meteoSummary.windDirAvg.toFixed(0)}°` : '–');
        row('Arah Angin Terakhir (°)', lastWindDir != null ? `${lastWindDir.toFixed(0)}°` : '–');
        row('Jumlah Pembacaan Sensor', `${meteoSummary.count} data`);
        y += 3;
      }

      // Footer page 1
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(160, 160, 160);
      pdf.text('Sumber referensi: ERA5 (ECMWF) · GWA 3.0 · GSA/SOLARGIS · RE-Valid DSS', 10, y);
      y += 4;
      pdf.text(`Periode data: ${reportPeriodLabel}  ·  Referensi MCP: ERA5 (ECMWF)  ·  Atlas baseline: GWA/GSA`, 10, y);

      // ── Page 2: Grafik Visualisasi & Korelasi ─────────────────────────────
      pdf.addPage();
      y = 18;
      pdf.setFillColor(19, 127, 236);
      pdf.rect(0, 0, W, 14, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RE-Valid — Grafik Validasi', 10, 9.5);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${station.name} (${station.id})`, W - 10, 9.5, { align: 'right' });

      // ── Helpers: build chart data ─────────────────────────────────────────
      // ── Helpers: draw charts onto offscreen canvas ────────────────────────
      function drawLineChart(
        data: { date: string; obs: number; baseline: number }[],
        obsColor: string,
        obsLabel: string,
        unit: string,
        baselineLabel: string,
      ): HTMLCanvasElement {
        const CW = 1100, CH = 340;
        const cvs = document.createElement('canvas');
        cvs.width = CW; cvs.height = CH;
        const c = cvs.getContext('2d')!;
        const ML = 65, MR = 55, MT = 24, MB = 52;
        const PW = CW - ML - MR, PH = CH - MT - MB;
        c.fillStyle = '#f8fafc'; c.fillRect(0, 0, CW, CH);
        c.strokeStyle = '#e2e8f0'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, CW - 1, CH - 1);
        if (data.length === 0) {
          c.fillStyle = '#94a3b8'; c.font = '22px sans-serif'; c.textAlign = 'center';
          c.fillText('Belum ada data pengukuran', CW / 2, CH / 2);
          return cvs;
        }
        const vals = data.flatMap((d) => [d.obs, d.baseline]).filter(isFinite);
        const minV = Math.min(...vals), maxV = Math.max(...vals);
        const pad = (maxV - minV || 1) * 0.15;
        const lo = minV - pad, hi = maxV + pad;
        const xS = (i: number) => ML + (data.length < 2 ? PW / 2 : (i / (data.length - 1)) * PW);
        const yS = (v: number) => MT + PH - ((v - lo) / (hi - lo)) * PH;
        for (let i = 0; i <= 5; i++) {
          const yp = MT + (i / 5) * PH;
          c.strokeStyle = '#e2e8f0'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(ML, yp); c.lineTo(ML + PW, yp); c.stroke();
          c.fillStyle = '#94a3b8'; c.font = '17px sans-serif'; c.textAlign = 'right';
          c.fillText((hi - (i / 5) * (hi - lo)).toFixed(1), ML - 7, yp + 6);
        }
        const step = data.length <= 12 ? 1 : Math.ceil(data.length / 12);
        c.fillStyle = '#94a3b8'; c.font = '16px sans-serif'; c.textAlign = 'center';
        data.forEach((d, i) => { if (i % step === 0) c.fillText(d.date, xS(i), MT + PH + 30); });
        c.strokeStyle = '#94a3b8'; c.lineWidth = 2; c.setLineDash([7, 4]);
        c.beginPath();
        data.forEach((d, i) => {
          if (i === 0) c.moveTo(xS(i), yS(d.baseline));
          else c.lineTo(xS(i), yS(d.baseline));
        });
        c.stroke(); c.setLineDash([]);
        c.strokeStyle = obsColor; c.lineWidth = 2.5;
        c.beginPath();
        data.forEach((d, i) => {
          if (i === 0) c.moveTo(xS(i), yS(d.obs));
          else c.lineTo(xS(i), yS(d.obs));
        });
        c.stroke();
        c.fillStyle = obsColor;
        data.forEach((d, i) => { c.beginPath(); c.arc(xS(i), yS(d.obs), 4, 0, Math.PI * 2); c.fill(); });
        c.strokeStyle = '#cbd5e1'; c.lineWidth = 1; c.setLineDash([]);
        c.beginPath(); c.moveTo(ML, MT); c.lineTo(ML, MT + PH); c.lineTo(ML + PW, MT + PH); c.stroke();
        const lx = ML + PW - 230, ly = MT + 10;
        c.strokeStyle = obsColor; c.lineWidth = 2.5; c.setLineDash([]);
        c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 25, ly); c.stroke();
        c.fillStyle = '#374151'; c.font = '16px sans-serif'; c.textAlign = 'left';
        c.fillText(obsLabel, lx + 30, ly + 5);
        c.strokeStyle = '#94a3b8'; c.lineWidth = 2; c.setLineDash([7, 4]);
        c.beginPath(); c.moveTo(lx, ly + 22); c.lineTo(lx + 25, ly + 22); c.stroke();
        c.setLineDash([]); c.fillStyle = '#374151'; c.fillText(baselineLabel, lx + 30, ly + 27);
        c.save(); c.translate(14, MT + PH / 2); c.rotate(-Math.PI / 2);
        c.fillStyle = '#94a3b8'; c.font = '15px sans-serif'; c.textAlign = 'center';
        c.fillText(unit, 0, 0); c.restore();
        return cvs;
      }

      function drawScatterChart(
        data: DeviationPoint[],
        pointColor: string,
        unit: string,
      ): HTMLCanvasElement {
        const CW = 1100, CH = 300;
        const cvs = document.createElement('canvas');
        cvs.width = CW; cvs.height = CH;
        const c = cvs.getContext('2d')!;
        const ML = 65, MR = 55, MT = 20, MB = 55;
        const PW = CW - ML - MR, PH = CH - MT - MB;
        c.fillStyle = '#f8fafc'; c.fillRect(0, 0, CW, CH);
        c.strokeStyle = '#e2e8f0'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, CW - 1, CH - 1);
        if (data.length === 0) {
          c.fillStyle = '#94a3b8'; c.font = '22px sans-serif'; c.textAlign = 'center';
          c.fillText('Belum ada data', CW / 2, CH / 2); return cvs;
        }
        const xVals = data.map((d) => d.obs), yVals = data.map((d) => d.dev);
        const xPad = (Math.max(...xVals) - Math.min(...xVals) || 1) * 0.2;
        const yPad = (Math.max(...yVals) - Math.min(...yVals) || 1) * 0.2;
        const xl = Math.min(...xVals) - xPad, xh = Math.max(...xVals) + xPad;
        const yl = Math.min(...yVals) - yPad, yh = Math.max(...yVals) + yPad;
        const xS = (v: number) => ML + ((v - xl) / (xh - xl)) * PW;
        const yS = (v: number) => MT + PH - ((v - yl) / (yh - yl)) * PH;
        for (let i = 0; i <= 5; i++) {
          const yp = MT + (i / 5) * PH, xp = ML + (i / 5) * PW;
          c.strokeStyle = '#e2e8f0'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(ML, yp); c.lineTo(ML + PW, yp); c.stroke();
          c.beginPath(); c.moveTo(xp, MT); c.lineTo(xp, MT + PH); c.stroke();
          c.fillStyle = '#94a3b8'; c.font = '16px sans-serif';
          c.textAlign = 'right'; c.fillText((yh - (i / 5) * (yh - yl)).toFixed(1), ML - 7, yp + 5);
          c.textAlign = 'center'; c.fillText((xl + (i / 5) * (xh - xl)).toFixed(1), xp, MT + PH + 22);
        }
        if (yl <= 0 && yh >= 0) {
          c.strokeStyle = '#94a3b8'; c.lineWidth = 1.5; c.setLineDash([6, 3]);
          c.beginPath(); c.moveTo(ML, yS(0)); c.lineTo(ML + PW, yS(0)); c.stroke();
          c.setLineDash([]); c.fillStyle = '#94a3b8'; c.font = '15px sans-serif'; c.textAlign = 'left';
          c.fillText('obs = baseline', ML + 6, yS(0) - 5);
        }
        c.fillStyle = pointColor + 'bb';
        data.forEach((d) => { c.beginPath(); c.arc(xS(d.obs), yS(d.dev), 5, 0, Math.PI * 2); c.fill(); });
        c.strokeStyle = '#cbd5e1'; c.lineWidth = 1; c.setLineDash([]);
        c.beginPath(); c.moveTo(ML, MT); c.lineTo(ML, MT + PH); c.lineTo(ML + PW, MT + PH); c.stroke();
        c.fillStyle = '#6b7280'; c.font = '17px sans-serif'; c.textAlign = 'center';
        c.fillText(`Observasi (${unit})`, ML + PW / 2, CH - 5);
        c.save(); c.translate(16, MT + PH / 2); c.rotate(-Math.PI / 2);
        c.fillText(`Deviasi (${unit})`, 0, 0); c.restore();
        // info jumlah data
        c.fillStyle = '#94a3b8'; c.font = '15px sans-serif'; c.textAlign = 'right';
        c.fillText(`n = ${data.length} titik data`, ML + PW - 4, MT + 18);
        return cvs;
      }

      // ── Section renderer: title + line chart + scatter ────────────────────
      function addChartSection(
        title: string,
        subtitle: string,
        lineCanv: HTMLCanvasElement,
        scatCanv: HTMLCanvasElement,
      ) {
        const lH = Math.round((W - 20) * lineCanv.height / lineCanv.width);
        const sH = Math.round((W - 20) * scatCanv.height / scatCanv.width);
        if (y + 10 + lH + 14 + sH + 8 > 286) { pdf.addPage(); y = 18; }
        pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 30, 30);
        pdf.text(title, 10, y); y += 5;
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 100, 100);
        pdf.text(subtitle, 10, y); y += 5;
        pdf.addImage(lineCanv.toDataURL('image/png'), 'PNG', 10, y, W - 20, lH);
        y += lH + 4;
        pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(60, 60, 60);
        pdf.text('Analisis Deviasi (Y = observasi - baseline)', 10, y); y += 4;
        pdf.addImage(scatCanv.toDataURL('image/png'), 'PNG', 10, y, W - 20, sH);
        y += sH + 8;
      }

      // ── Draw wind + solar charts ──────────────────────────────────────────
      const hasWind = station.variables.toLowerCase().includes('angin');
      const hasSolar = station.variables.toLowerCase().includes('iradiasi')
        || station.variables.toLowerCase().includes('surya')
        || station.variables.toLowerCase().includes('ghi');
      if (!hasWind && !hasSolar) {
        pdf.setFontSize(9); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(150, 150, 150);
        pdf.text('Tidak ada data grafik tersedia untuk stasiun ini.', W / 2, 150, { align: 'center' });
      } else {
        if (hasWind) {
          addChartSection(
            'Kecepatan Angin — ERA5 Harian (DOY) vs Observasi',
            `${windEra5Label}: ${windEra5ComparisonBaseline != null ? windEra5ComparisonBaseline.toFixed(2) : '–'} m/s  ·  RMSE: ${windRmseVal != null ? windRmseVal.toFixed(2) : '–'} m/s  ·  MAE: ${windMaeVal != null ? windMaeVal.toFixed(2) : '–'} m/s  ·  Bias ERA5: ${windBiasEra5 != null ? `${windBiasEra5 >= 0 ? '+' : ''}${windBiasEra5.toFixed(1)}` : '–'}%`,
            drawLineChart(windChartData, '#137fec', 'Terukur (Obs)', 'm/s', 'ERA5 DOY'),
            drawScatterChart(windScatterData, '#137fec', 'm/s'),
          );
        }
        if (hasSolar) {
          addChartSection(
            'Iradiasi Matahari (GHI) — ERA5 Harian (DOY) vs Observasi',
            `${ghiEra5Label}: ${ghiEra5ComparisonBaseline != null ? ghiEra5ComparisonBaseline.toFixed(2) : '–'} kWh/m²/hari  ·  RMSE: ${solarRmseVal != null ? solarRmseVal.toFixed(2) : '–'}  ·  MAE: ${solarMaeVal != null ? solarMaeVal.toFixed(2) : '–'}  ·  Kt: ${ktVal.toFixed(2)}`,
            drawLineChart(ghiChartData, '#f59e0b', 'GHI Terukur (Obs)', 'kWh/m²/hari', 'ERA5 DOY'),
            drawScatterChart(ghiScatterData, '#f59e0b', 'kWh/m²/hari'),
          );
        }
      }

      pdf.setFontSize(7); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(160, 160, 160);
      pdf.text('RE-Valid DSS — Grafik Validasi  ·  ERA5/GWA/GSA', W / 2, y, { align: 'center' });

      pdf.save(`RE-Valid_Laporan_${station.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(null);
    }
  }

  async function handleExportCSV() {
    setExporting('csv');
    try {
      const { Workbook } = await import('exceljs');
      const wb = new Workbook();
      wb.creator = 'RE-Valid DSS';
      const ws = wb.addWorksheet('Laporan Stasiun');
      ws.columns = [
        { key: 'field', width: 44 },
        { key: 'value', width: 28 },
      ];

      const C_BLUE  = 'FF137FEC';
      const C_NAVY  = 'FF0F2D57';
      const C_WHITE = 'FFFFFFFF';
      const C_ALT   = 'FFF0F5FF';
      const C_HDR   = 'FFE8EFF9';
      const C_GRAY  = 'FF6B7280';
      const C_TEXT  = 'FF111827';

      const merge2 = (rn: number) => ws.mergeCells(`A${rn}:B${rn}`);

      const addTitle = (text: string) => {
        const xr = ws.addRow([text]);
        merge2(xr.number);
        const c = xr.getCell(1);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_BLUE } };
        c.font = { bold: true, size: 14, color: { argb: C_WHITE }, name: 'Calibri' };
        c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        xr.height = 24;
      };

      const addMeta = (text: string) => {
        const xr = ws.addRow([text]);
        merge2(xr.number);
        const c = xr.getCell(1);
        c.font = { italic: true, size: 9, color: { argb: C_GRAY }, name: 'Calibri' };
        c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        xr.height = 14;
      };

      const addSection = (text: string) => {
        ws.addRow([]);
        const xr = ws.addRow([text]);
        merge2(xr.number);
        const c = xr.getCell(1);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_NAVY } };
        c.font = { bold: true, size: 9, color: { argb: C_WHITE }, name: 'Calibri' };
        c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        xr.height = 16;
      };

      const addRow2 = (label: string, value: string | number | null | undefined, idx: number) => {
        const xr = ws.addRow([label, value ?? '\u2014']);
        const isAlt = idx % 2 === 1;
        const c1 = xr.getCell(1);
        const c2 = xr.getCell(2);
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? C_ALT : C_HDR } };
        c1.font = { bold: true, size: 9, color: { argb: C_TEXT }, name: 'Calibri' };
        c1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        c1.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
        c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? C_ALT : C_WHITE } };
        c2.font = { size: 9, color: { argb: C_TEXT }, name: 'Calibri' };
        c2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        c2.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
        xr.height = 14;
      };

      addTitle(`RE-Valid \u2014 Laporan Stasiun: ${station.name}`);
      addMeta(`${station.id}  |  ${station.region}  |  Periode data: ${reportPeriodLabel}`);
      addMeta(`Diekspor: ${new Date().toLocaleString('id-ID')}  |  Sumber: ERA5 (ECMWF) / GWA 3.0 / GSA (Solargis)`);

      addSection('IDENTITAS STASIUN');
      [
        ['Station ID', station.id],
        ['Nama', station.name],
        ['Wilayah', station.region],
        ['Latitude', station.lat.toFixed(4)],
        ['Longitude', station.lon.toFixed(4)],
        ['Ketinggian (m dpl)', String(station.altitude)],
        ['Status', station.status],
        ['Periode', station.period],
        ['Periode Data Laporan', reportPeriodLabel],
        ['Variabel', station.variables],
        ['Jumlah Data Terambil', `${sampleCoverage.total.toLocaleString('id')} baris`],
        ['Cakupan Hari Data', `${sampleCoverage.days} hari`],
        ['Rentang Timestamp', firstMeasurementAt && lastMeasurementAt ? `${getJakartaDateKey(firstMeasurementAt)} s/d ${getJakartaDateKey(lastMeasurementAt)}` : '–'],
      ].forEach((pair, i) => addRow2(pair[0], pair[1], i));

      addSection('METRIK VALIDASI ANGIN (ERA5 DOY vs Observasi)');
      [
        ['Kecepatan Angin Rata-rata Periode (Obs)', `${obsWindMean.toFixed(2)} m/s`],
        ['RMSE Angin (m/s)', windRmseVal != null ? `${windRmseVal.toFixed(2)} m/s` : '\u2013'],
        ['MAE Harian Angin (m/s)', windMaeVal != null ? `${windMaeVal.toFixed(2)} m/s` : '\u2013'],
        ['Bias vs GWA LTA (%)', windBiasGwa != null ? `${windBiasGwa >= 0 ? '+' : ''}${windBiasGwa.toFixed(1)} %` : '\u2013'],
        [`Bias vs ${windEra5Label} (%)`, windBiasEra5 != null ? `${windBiasEra5 >= 0 ? '+' : ''}${windBiasEra5.toFixed(1)} %` : '\u2013'],
        ['Bias MBE Tersimpan (%)', windBiasVal != null ? `${windBiasVal > 0 ? '+' : ''}${windBiasVal.toFixed(1)} %` : '\u2013'],
        ['Kelengkapan Sampel 1 Menit', windAvailabilityText],
        ['Skor Kesesuaian Baseline', windR2Val != null ? windR2Val.toFixed(2) : '\u2013'],
        ['AEP PLTB Gross (MWh/thn)', windAepGross != null ? `${Math.round(windAepGross).toLocaleString('id')} (${windAepSource})` : '\u2013'],
        ['AEP PLTB P50 Net (MWh/thn)', windAepP50 != null ? windAepP50.toLocaleString('id') : '\u2013'],
        ['AEP PLTB P90 Net (MWh/thn)', windAepP90 != null ? windAepP90.toLocaleString('id') : '\u2013'],
        ['Skor Teknis Lokasi (/100)', `${station.score} / 100`],
      ].forEach((pair, i) => addRow2(pair[0], pair[1], i));

      addSection('VALIDASI SURYA \u2014 GHI (ERA5 DOY/GSA vs Observasi)');
      [
        ['GHI Observasi Rata-rata Periode (kWh/m\u00b2/hari)', `${obsGhiMean.toFixed(2)} kWh/m\u00b2/hari`],
        ['GHI Baseline GSA/Solargis', station.ghiBaselineGsa != null ? `${station.ghiBaselineGsa.toFixed(2)} kWh/m\u00b2/hari` : '\u2014'],
        [`GHI Baseline ${ghiEra5Label}`, ghiEra5ComparisonBaseline != null ? `${ghiEra5ComparisonBaseline.toFixed(2)} kWh/m\u00b2/hari` : '\u2014'],
        ['GHI Best-Value (dipakai)', `${ghiBaselineVal.toFixed(2)} kWh/m\u00b2/hari`],
        ['RMSE Surya (kWh/m\u00b2/hari)', solarRmseVal != null ? `${solarRmseVal.toFixed(2)} kWh/m\u00b2/hari` : '\u2013'],
        ['MAE Harian Surya (kWh/m\u00b2/hari)', solarMaeVal != null ? `${solarMaeVal.toFixed(2)} kWh/m\u00b2/hari` : '\u2013'],
        ['Bias vs GSA LTA (%)', ghiBiasGsa != null ? `${ghiBiasGsa >= 0 ? '+' : ''}${ghiBiasGsa.toFixed(1)} %` : '\u2013'],
        [`Bias vs ${ghiEra5Label} (%)`, ghiBiasEra5 != null ? `${ghiBiasEra5 >= 0 ? '+' : ''}${ghiBiasEra5.toFixed(1)} %` : '\u2013'],
        ['Bias MBE Surya Tersimpan (%)', solarBiasVal != null ? `${solarBiasVal > 0 ? '+' : ''}${solarBiasVal.toFixed(1)} %` : '\u2013'],
        ['Kelengkapan Sampel 1 Menit', ghiAvailabilityText],
        ['Skor Kesesuaian Baseline', solarR2Val != null ? solarR2Val.toFixed(2) : '\u2013'],
        ['Clearness Index (Kt)', ktVal.toFixed(2)],
      ].forEach((pair, i) => addRow2(pair[0], pair[1], i));

      addSection('PERBANDINGAN BASELINE ANGIN');
      [
        ['Observasi Lapangan (rata-rata periode)', `${obsWindMean.toFixed(2)} m/s`],
        ['GWA 3.0 (GeoTIFF 250m)', station.windBaselineGwa != null ? `${station.windBaselineGwa} m/s` : '\u2014'],
        [windEra5Label, windEra5ComparisonBaseline != null ? `${windEra5ComparisonBaseline.toFixed(2)} m/s` : '\u2014'],
        ['Best-Value (dipakai MCP)', `${windBaselineVal.toFixed(2)} m/s`],
      ].forEach((pair, i) => addRow2(pair[0], pair[1], i));

      addSection('POTENSI ENERGI');
      [
        ['Kecepatan Angin LTA untuk AEP (GWA/ERA5)', `${windBaselineVal.toFixed(2)} m/s`],
        ['Iradiasi GHI LTA untuk AEP (GSA/ERA5)', `${ghiBaselineVal.toFixed(2)} kWh/m\u00b2/hari`],
        ['AEP PLTB Gross (MWh/thn)', windAepGross != null ? `${Math.round(windAepGross).toLocaleString('id')} (${windAepSource})` : '\u2013'],
        ['AEP PLTB P50 Net (MWh/thn)', windAepP50 != null ? windAepP50.toLocaleString('id') : '\u2013'],
        ['AEP PLTB P90 Net (MWh/thn)', windAepP90 != null ? windAepP90.toLocaleString('id') : '\u2013'],
        ['AEP PLTS 10 MWp PR=78% (MWh/thn)', solarAep10Mwp.toLocaleString('id')],
        ['Hasil Spesifik PLTS /MWp PR=78%', `${solarSpecificYield.toLocaleString('id')} kWh/kWp\u00b7thn`],
      ].forEach((pair, i) => addRow2(pair[0], pair[1], i));

      addSection('PRIORITAS GIS-MCDA');
      mcdaFactors.forEach(({ label, pct, detail }, i) => {
        const detailSuffix = detail ? ` (${detail})` : '';
        addRow2(label, `${pct}%${detailSuffix}`, i);
      });
      if (gisMcda) {
        addRow2('Sumber Data', gisMcda.data_source, mcdaFactors.length);
        if (gisMcda.road_dist_km !== null) {
          addRow2('Jarak ke Jalan Terdekat', `${gisMcda.road_dist_km.toFixed(1)} km`, mcdaFactors.length + 1);
        }
        if (gisMcda.power_dist_km !== null) {
          addRow2('Jarak ke Transmisi Terdekat', `${gisMcda.power_dist_km.toFixed(1)} km`, mcdaFactors.length + 2);
        }
      }
      addSection('RINGKASAN KUALITAS DATA');
      [
        ['Jumlah Sampling Terambil', `${sampleCoverage.total.toLocaleString('id')} baris`],
        ['Jumlah Hari Tercakup', `${sampleCoverage.days} hari`],
        ['Target Sampling 1 Menit', `${sampleCoverage.expected.toLocaleString('id')} baris`],
        ['Sampling Angin Valid', windAvailabilityText],
        ['Sampling GHI Valid', ghiAvailabilityText],
        ['Titik Validasi Harian Angin', `${windChartData.length} hari`],
        ['Titik Validasi Harian GHI', `${ghiChartData.length} hari`],
        ['Titik Harian Meteorologi', `${meteoDailyPointCount} hari`],
      ].forEach((pair, i) => addRow2(pair[0], pair[1], i));

      if (meteoSummary.count > 0) {
        addSection('RINGKASAN METEOROLOGI');
        [
          ['Jumlah Pembacaan Sensor', `${meteoSummary.count.toLocaleString('id')} baris`],
          ['Suhu Rata-rata', meteoSummary.tempAvg != null ? `${meteoSummary.tempAvg.toFixed(1)} °C` : '\u2013'],
          ['Kelembapan Rata-rata', meteoSummary.humAvg != null ? `${meteoSummary.humAvg.toFixed(1)} %` : '\u2013'],
          ['Tekanan Udara Rata-rata', meteoSummary.presAvg != null ? `${meteoSummary.presAvg.toFixed(1)} hPa` : '\u2013'],
          ['Arah Angin Rata-rata', meteoSummary.windDirAvg != null ? `${meteoSummary.windDirAvg.toFixed(0)}°` : '\u2013'],
        ].forEach((pair, i) => addRow2(pair[0], pair[1], i));
      }

      const styleHeaderRow = (row: import('exceljs').Row, maxCols: number) => {
        row.eachCell({ includeEmpty: true }, (cell: import('exceljs').Cell, col: number) => {
          if (col > maxCols) return;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_BLUE } };
          cell.font = { bold: true, size: 9, color: { argb: C_WHITE }, name: 'Calibri' };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = { bottom: { style: 'thin', color: { argb: C_NAVY } } };
        });
        row.height = 18;
      };

      const styleDataRow = (row: import('exceljs').Row, index: number, maxCols: number) => {
        const isAlt = index % 2 === 1;
        row.eachCell({ includeEmpty: true }, (cell: import('exceljs').Cell, col: number) => {
          if (col > maxCols) return;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? C_ALT : C_WHITE } };
          cell.font = { size: 9, color: { argb: C_TEXT }, name: 'Calibri' };
          cell.alignment = { horizontal: col <= 2 ? 'left' : 'center', vertical: 'middle', wrapText: true };
          cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
        });
        row.height = 15;
      };

      const dailyWs = wb.addWorksheet('Validasi Harian');
      dailyWs.columns = [
        { key: 'date', width: 16 },
        { key: 'label', width: 14 },
        { key: 'wind_obs', width: 18 },
        { key: 'wind_baseline', width: 18 },
        { key: 'wind_dev', width: 16 },
        { key: 'ghi_obs', width: 18 },
        { key: 'ghi_baseline', width: 18 },
        { key: 'ghi_dev', width: 16 },
        { key: 'temperature_avg', width: 18 },
        { key: 'humidity_avg', width: 18 },
        { key: 'pressure_avg', width: 18 },
        { key: 'wind_dir_avg', width: 18 },
      ];
      const dailyHeader = dailyWs.addRow([
        'Tanggal WIB',
        'Label',
        'Angin Obs (m/s)',
        'Angin ERA5 DOY (m/s)',
        'Deviasi Angin (m/s)',
        'GHI Obs (kWh/m²/hari)',
        'GHI ERA5 DOY (kWh/m²/hari)',
        'Deviasi GHI (kWh/m²/hari)',
        'Suhu BME280 Harian (\u00b0C)',
        'Kelembapan BME280 Harian (%)',
        'Tekanan BME280 Harian (hPa)',
        'Arah Angin Harian (\u00b0)',
      ]);
      styleHeaderRow(dailyHeader, 12);
      validationDailyRows.forEach((row, index) => {
        const windDev = row.windObs != null && row.windBaseline != null ? roundNumber(row.windObs - row.windBaseline, 3) : null;
        const ghiDev = row.ghiObs != null && row.ghiBaseline != null ? roundNumber(row.ghiObs - row.ghiBaseline, 3) : null;
        styleDataRow(dailyWs.addRow([
          row.key,
          row.label,
          row.windObs,
          row.windBaseline,
          windDev,
          row.ghiObs,
          row.ghiBaseline,
          ghiDev,
          row.tempAvg,
          row.humAvg,
          row.presAvg,
          row.windDirAvg,
        ]), index, 12);
      });
      dailyWs.views = [{ state: 'frozen', ySplit: 1 }];

      const rawWs = wb.addWorksheet('Data Mentah');
      rawWs.columns = [
        { key: 'measured_at', width: 28 },
        { key: 'tanggal_wib', width: 14 },
        { key: 'station_id', width: 12 },
        { key: 'wind_speed', width: 14 },
        { key: 'wind_dir', width: 14 },
        { key: 'ghi', width: 14 },
        { key: 'dni', width: 14 },
        { key: 'temperature', width: 14 },
        { key: 'humidity', width: 14 },
        { key: 'pressure', width: 14 },
      ];
      const rawHeader = rawWs.addRow([
        'Timestamp ISO',
        'Tanggal WIB',
        'Station ID',
        'Wind Speed (m/s)',
        'Wind Direction (°)',
        'GHI (W/m²)',
        'DNI (W/m²)',
        'Temperature (°C)',
        'Humidity (%)',
        'Pressure (hPa)',
      ]);
      styleHeaderRow(rawHeader, 10);
      measurements.forEach((m, index) => {
        styleDataRow(rawWs.addRow([
          m.measured_at,
          getJakartaDateKey(m.measured_at),
          m.station_id,
          m.wind_speed,
          m.wind_dir,
          m.ghi,
          m.dni,
          m.temperature,
          m.humidity,
          m.pressure,
        ]), index, 10);
      });
      rawWs.views = [{ state: 'frozen', ySplit: 1 }];

      ws.addRow([]);
      const fxr = ws.addRow(['Sumber: RE-Valid DSS \u2014 ERA5 (ECMWF) / GWA 3.0 / GSA (Solargis). Simulasi screening awal, bukan studi kelayakan.']);
      merge2(fxr.number);
      fxr.getCell(1).font = { italic: true, size: 8, color: { argb: C_GRAY }, name: 'Calibri' };

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RE-Valid_Laporan_${station.id}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }

  function handleExportGeoJSON() {
    setExporting('geojson');
    const latestMeasurement = measurements.length > 0 ? measurements[measurements.length - 1] : null;
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
          properties: {
            id: station.id,
            name: station.name,
            region: station.region,
            altitude_m: station.altitude,
            status: station.status,
            score: station.score,
            variables: station.variables,
            mcp_status: station.mcpStatus,
            station_period_label: station.period,
            report_start_date_wib: reportStartDate,
            report_end_date_wib: reportEndDate,
            report_period_label: reportPeriodLabel,
            measurement_count: sampleCoverage.total,
            covered_days: sampleCoverage.days,
            expected_1min_samples: sampleCoverage.expected,
            wind_valid_samples: sampleCoverage.wind.valid,
            wind_sample_completeness_pct: sampleCoverage.wind.pct,
            ghi_valid_samples: sampleCoverage.ghi.valid,
            ghi_sample_completeness_pct: sampleCoverage.ghi.pct,
            first_measurement_at: firstMeasurementAt,
            latest_measurement_at: latestMeasurement?.measured_at ?? null,
            wind_speed_period_avg_ms: obsWindMean,
            wind_baseline_gwa_ms: station.windBaselineGwa ?? null,
            wind_baseline_era5_period_ms: windEra5ComparisonBaseline,
            wind_baseline_best_ms: windBaselineVal,
            wind_rmse_ms: windRmseVal,
            wind_mae_ms: windMaeVal,
            wind_bias_gwa_pct: windBiasGwa,
            wind_bias_era5_pct: windBiasEra5,
            wind_bias_stored_pct: windBiasVal,
            wind_r2: windR2Val,
            ghi_period_avg_kwh_m2_day: obsGhiMean,
            ghi_baseline_gsa_kwh: station.ghiBaselineGsa ?? null,
            ghi_baseline_era5_period_kwh: ghiEra5ComparisonBaseline,
            ghi_baseline_best_kwh: ghiBaselineVal,
            solar_rmse_kwh_m2_day: solarRmseVal,
            solar_mae_kwh_m2_day: solarMaeVal,
            solar_bias_gsa_pct: ghiBiasGsa,
            solar_bias_era5_pct: ghiBiasEra5,
            solar_bias_stored_pct: solarBiasVal,
            solar_r2: solarR2Val,
            clearness_index_kt: ktVal,
            aep_pltb_gross_mwh_yr: windAepGross != null ? Math.round(windAepGross) : null,
            aep_pltb_source: windAepSource,
            aep_pltb_p50_net_mwh_yr: windAepP50,
            aep_pltb_p90_net_mwh_yr: windAepP90,
            solar_aep_10mwp_mwh_yr: solarAep10Mwp,
            solar_specific_yield_kwh_kwp_yr: solarSpecificYield,
            gis_mcda_source: gisMcda?.data_source ?? 'fallback',
            gis_mcda_road_dist_km: gisMcda?.road_dist_km ?? null,
            gis_mcda_power_dist_km: gisMcda?.power_dist_km ?? null,
            gis_mcda_factors: mcdaFactors,
            meteo_temperature_avg_c: meteoSummary.tempAvg != null ? roundNumber(meteoSummary.tempAvg, 2) : null,
            meteo_humidity_avg_pct: meteoSummary.humAvg != null ? roundNumber(meteoSummary.humAvg, 2) : null,
            meteo_pressure_avg_hpa: meteoSummary.presAvg != null ? roundNumber(meteoSummary.presAvg, 2) : null,
            meteo_wind_dir_avg_deg: meteoSummary.windDirAvg != null ? roundNumber(meteoSummary.windDirAvg, 1) : null,
            latest_temperature_c: latestMeasurement?.temperature ?? null,
            latest_humidity_pct: latestMeasurement?.humidity ?? null,
            latest_pressure_hpa: latestMeasurement?.pressure ?? null,
            latest_wind_dir_deg: latestMeasurement?.wind_dir ?? null,
            exported_at: new Date().toISOString(),
            source: 'RE-Valid DSS',
          },
        },
      ],
    };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RE-Valid_GeoJSON_${station.id}_${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(null);
  }

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex flex-col text-sm">
      <Navbar />

      <main className="flex-1 flex flex-col w-full max-w-360 mx-auto px-4 lg:px-8 py-4">
        {/* Header */}
        <div className="flex flex-col gap-3 mb-5 pt-2">
          <div className="flex flex-wrap justify-between items-end gap-3">
            <div className="flex flex-col gap-1.5 max-w-2xl">
              <Link
                href={backHref}
                className="flex items-center gap-1 text-xs font-semibold text-primary mb-0.5 hover:underline"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                {backLabel}
              </Link>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold leading-tight text-slate-900 dark:text-white">
                  Laporan Lengkap
                </h1>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusBg[station.status]}`}>
                  {statusLabel[station.status]}
                </span>
              </div>
              <p className="text-slate-600 dark:text-text-secondary text-sm font-normal leading-relaxed">
                {station.name} &middot; {station.region} &middot; Skor {station.score}/100
              </p>
            </div>
          </div>
        </div>

        {/* ── Control bar ───────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-2">
          <div className="flex-1 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark px-4 py-3 flex items-center gap-3 shadow-sm">
            <span className="material-symbols-outlined text-primary text-[18px] shrink-0">location_on</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-slate-500 dark:text-text-secondary uppercase tracking-wide mb-1">Pilih Stasiun</p>
              <div className="relative">
                <select
                  value={station.id}
                  onChange={(e) => router.push(`/laporan?station=${e.target.value}${fromPage !== 'peta' ? `&from=${fromPage}` : ''}`)}
                  className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg py-1.5 pl-3 pr-8 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all appearance-none"
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                  ))}
                </select>
                <span className="absolute right-2.5 top-2 text-slate-400 material-symbols-outlined text-[16px] pointer-events-none">expand_more</span>
              </div>
            </div>
          </div>
          <div className="flex-1 bg-blue-50 dark:bg-blue-900/20 rounded-xl px-4 py-3 border border-blue-100 dark:border-blue-800/30 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[18px] shrink-0">info</span>
            <p className="text-xs text-slate-600 dark:text-blue-100/70 leading-relaxed">
              <span className="font-bold text-slate-900 dark:text-white">Catatan: </span>
              Referensi MCP: ERA5 (ECMWF) · Atlas: GWA/GSA · Periode data: {reportPeriodLabel}
            </p>
          </div>
        </div>

        {/* ── Main content — full width ──────────────────────────────────────── */}
        <div className="flex flex-col gap-5">
          {/* Station identity full-width */}
          <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
              <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        station.status === 'prioritas'
                          ? 'bg-green-500 animate-pulse'
                          : station.status === 'kandidat'
                          ? 'bg-amber-400'
                          : 'bg-slate-400'
                      }`}
                    />
                    <span className="text-xs font-mono text-slate-400">{station.id}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusBg[station.status]}`}>
                      {statusLabel[station.status]}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{station.name}</h2>
                  <p className="text-sm text-slate-500 dark:text-text-secondary">{station.region}</p>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${mcpBadge[station.mcpStatus]} shrink-0`}>
                  MCP: {mcpLabel[station.mcpStatus]}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                  { label: 'Koordinat', value: `${station.lat.toFixed(4)}, ${station.lon.toFixed(4)}` },
                  { label: 'Ketinggian', value: `${station.altitude.toLocaleString('id')} m dpl` },
                  { label: 'Periode', value: station.period },
                  { label: 'Variabel', value: station.variables },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="bg-slate-50 dark:bg-[#111a22] rounded-lg p-3 border border-slate-100 dark:border-[#233648]"
                  >
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{item.label}</p>
                    <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Validation metrics */}

          {/* Row 2: metrik angin + validasi surya — 2 kolom sejajar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-[20px]">air</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Validasi Angin</h4>
                <span className="ml-auto text-[11px] text-slate-400">ERA5 DOY vs Observasi Lapangan</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Kec. Angin (Obs)', value: obsWindMean.toFixed(2), unit: 'm/s', color: 'text-blue-400' },
                  { label: 'RMSE', value: windRmseVal != null ? windRmseVal.toFixed(2) : '–', unit: windRmseVal != null ? 'm/s' : '', color: 'text-slate-200' },
                  { label: 'Skor Baseline', value: windR2Val != null ? windR2Val.toFixed(2) : '–', unit: '', color: baselineSkillColor(windR2Val) },
                  {
                    label: 'Bias ERA5 DOY',
                    value: windBiasEra5 != null ? `${windBiasEra5 >= 0 ? '+' : ''}${windBiasEra5.toFixed(1)}` : '–',
                    unit: windBiasEra5 != null ? '%' : '',
                    color: windBiasEra5 != null && Math.abs(windBiasEra5) <= 5 ? 'text-green-400' : 'text-amber-400',
                  },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="bg-slate-50 dark:bg-[#111a22] rounded-xl p-4 border border-slate-100 dark:border-[#233648] text-center"
                  >
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{m.label}</p>
                    <p className={`text-2xl font-bold ${m.color}`}>
                      {m.value}
                      <span className="text-[13px] font-medium text-slate-400 ml-0.5">{m.unit}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Solar validation metrics */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-amber-400 text-[20px]">wb_sunny</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Validasi Surya (GHI)</h4>
                <span className="ml-auto text-[11px] text-slate-400">ERA5 DOY vs Observasi Lapangan</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'GHI Observasi', value: obsGhiMean.toFixed(2), unit: 'kWh/m²/hari', color: 'text-amber-400' },
                  { label: 'RMSE', value: solarRmseVal != null ? solarRmseVal.toFixed(2) : '–', unit: solarRmseVal != null ? 'kWh/m²' : '', color: 'text-slate-200' },
                  { label: 'Skor Baseline', value: solarR2Val != null ? solarR2Val.toFixed(2) : '–', unit: '', color: baselineSkillColor(solarR2Val) },
                  {
                    label: 'Bias ERA5 DOY',
                    value: ghiBiasEra5 != null ? `${ghiBiasEra5 >= 0 ? '+' : ''}${ghiBiasEra5.toFixed(1)}` : '–',
                    unit: ghiBiasEra5 != null ? '%' : '',
                    color: ghiBiasEra5 != null && Math.abs(ghiBiasEra5) <= 10 ? 'text-amber-400' : 'text-red-400',
                  },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="bg-slate-50 dark:bg-[#111a22] rounded-xl p-4 border border-slate-100 dark:border-[#233648] text-center"
                  >
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{m.label}</p>
                    <p className={`text-2xl font-bold ${m.color}`}>
                      {m.value}
                      <span className="text-[13px] font-medium text-slate-400 ml-0.5">{m.unit}</span>
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-500">
                <span className="font-mono px-2 py-0.5 rounded border bg-amber-500/10 border-amber-500/30 text-amber-400">
                  GHI Obs: {obsGhiMean.toFixed(2)} kWh/m²/hari
                </span>
                <span className="font-mono px-2 py-0.5 rounded border bg-slate-500/10 border-slate-500/30 text-slate-400">
                  Baseline validasi ({ghiEra5Label}): {ghiEra5ComparisonBaseline != null ? ghiEra5ComparisonBaseline.toFixed(2) : '–'} kWh/m²/hari
                </span>
                <span className={`font-mono px-2 py-0.5 rounded border ${
                  ktVal >= 0.40 && ktVal <= 0.65
                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}>
                  Kt = {ktVal.toFixed(2)}{ktVal >= 0.40 && ktVal <= 0.65 ? ' ✓ Valid' : ' ⚠ Di luar rentang'}
                </span>
              </div>
            </div>
          </div>

          {/* Row 3: Grafik Validasi full-width */}
            {/* Grafik Validasi Preview */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-[20px]">ssid_chart</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Grafik Validasi</h4>
                <span className="ml-auto text-[11px] text-slate-400">
                  {hasWind && hasSolar ? 'Angin & GHI — Obs vs ERA5 Harian (DOY)' : hasWind ? 'Angin — Obs vs ERA5 Harian (DOY)' : 'GHI — Obs vs ERA5 Harian (DOY)'}
                  {' '}({granularityLabel})
                </span>
              </div>

              {/* ── Angin ──────────────────────────────────────────── */}
              {hasWind && (
                <>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-primary text-[14px]">air</span>
                    Kecepatan Angin (m/s)
                  </p>
                  <div ref={chartTsRef} className="w-full bg-gray-50 dark:bg-[#111a22] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 py-3 pr-3 mb-2" style={{ height: 200 }}>
                    {windChartData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-sm text-slate-500 gap-2">
                        <span className="material-symbols-outlined text-[28px]">ssid_chart</span><span>Belum ada data angin</span>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={windChartData} margin={{ top: 10, right: 15, bottom: 5, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} interval={0} />
                          <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', fontSize: 11 }} labelStyle={{ color: tooltipLabel }} />
                          <Line type="monotone" dataKey="obs" name="Terukur (Obs)" stroke="#137fec" dot={{ r: 3 }} strokeWidth={2.5} />
                          <Line type="monotone" dataKey="baseline" name="ERA5 Harian (DOY)" stroke="#94a3b8" strokeDasharray="5 3" dot={false} strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <div ref={chartScatterRef} className="w-full bg-gray-50 dark:bg-[#111a22] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 py-3 pr-3 mb-4" style={{ height: 180 }}>
                    {windScatterData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-sm text-slate-500 gap-2">
                        <span className="material-symbols-outlined text-[28px]">scatter_plot</span><span>Belum ada data</span>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 10, bottom: 24, left: 15 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                          <XAxis dataKey="obs" name="Observasi" type="number" domain={['auto','auto']} tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false}
                            label={{ value: 'Obs (m/s)', position: 'insideBottom', offset: -16, fill: '#64748b', fontSize: 9 }} />
                          <YAxis dataKey="dev" name="Deviasi" type="number" domain={['auto','auto']} tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false}
                            label={{ value: 'Deviasi (m/s)', angle: -90, position: 'insideLeft', offset: 10, fill: '#64748b', fontSize: 9 }} />
                          <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', fontSize: 11 }} />
                          <Scatter data={windScatterData} fill="#137fec" opacity={0.5} />
                          <ReferenceLine y={0} stroke="#e2e8f0" strokeDasharray="5 3" strokeWidth={1.5}
                            label={{ value: 'obs = baseline', position: 'insideTopLeft', fill: '#94a3b8', fontSize: 9 }} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 -mt-2 mb-3">
                    n = {windScatterData.length} titik data
                  </p>
                </>
              )}

              {/* ── GHI / Surya ─────────────────────────────────────── */}
              {hasSolar && (
                <>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-amber-400 text-[14px]">wb_sunny</span>
                    Iradiasi Matahari / GHI (kWh/m²/hari)
                  </p>
                  <div ref={chartTsGhiRef} className="w-full bg-gray-50 dark:bg-[#111a22] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 py-3 pr-3 mb-2" style={{ height: 200 }}>
                    {ghiChartData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-sm text-slate-500 gap-2">
                        <span className="material-symbols-outlined text-[28px]">wb_sunny</span><span>Belum ada data GHI</span>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={ghiChartData} margin={{ top: 10, right: 15, bottom: 5, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} interval={0} />
                          <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', fontSize: 11 }} labelStyle={{ color: tooltipLabel }} />
                          <Line type="monotone" dataKey="obs" name="GHI Terukur (Obs)" stroke="#f59e0b" dot={{ r: 3 }} strokeWidth={2.5} />
                          <Line type="monotone" dataKey="baseline" name="ERA5 Harian (DOY)" stroke="#94a3b8" strokeDasharray="5 3" dot={false} strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <div ref={chartScatterGhiRef} className="w-full bg-gray-50 dark:bg-[#111a22] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 py-3 pr-3 mb-4" style={{ height: 180 }}>
                    {ghiScatterData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-sm text-slate-500 gap-2">
                        <span className="material-symbols-outlined text-[28px]">scatter_plot</span><span>Belum ada data</span>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 10, bottom: 24, left: 15 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                          <XAxis dataKey="obs" name="Observasi" type="number" domain={['auto','auto']} tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false}
                            label={{ value: 'Obs (kWh/m²/hari)', position: 'insideBottom', offset: -16, fill: '#64748b', fontSize: 9 }} />
                          <YAxis dataKey="dev" name="Deviasi" type="number" domain={['auto','auto']} tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false}
                            label={{ value: 'Deviasi (kWh/m²/hari)', angle: -90, position: 'insideLeft', offset: 10, fill: '#64748b', fontSize: 9 }} />
                          <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', fontSize: 11 }} />
                          <Scatter data={ghiScatterData} fill="#f59e0b" opacity={0.5} />
                          <ReferenceLine y={0} stroke="#e2e8f0" strokeDasharray="5 3" strokeWidth={1.5}
                            label={{ value: 'obs = baseline', position: 'insideTopLeft', fill: '#94a3b8', fontSize: 9 }} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 -mt-2 mb-1">
                    n = {ghiScatterData.length} titik data
                  </p>
                </>
              )}

              <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">picture_as_pdf</span>
                Grafik di atas akan tertanam sebagai canvas di PDF yang diunduh.
              </p>
            </div>

            {/* Perbandingan 3 sumber baseline */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-violet-400 text-[20px]">compare_arrows</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Perbandingan Sumber Baseline</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Wind */}
                <div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-[14px]">air</span>Angin (m/s)
                  </p>
                  <div className="flex flex-col gap-2">
                    {[
                      { label: 'Observasi Lapangan', value: `${obsWindMean.toFixed(2)} m/s`, color: 'text-slate-900 dark:text-white', badge: null },
                      { label: 'GWA 3.0', value: station.windBaselineGwa != null ? `${station.windBaselineGwa} m/s` : '—', color: 'text-primary font-bold', badge: station.windBaselineGwa != null ? 'Aktif' : null },
                      { label: windEra5Label, value: windEra5ComparisonBaseline != null ? `${windEra5ComparisonBaseline.toFixed(2)} m/s` : '—', color: 'text-slate-600 dark:text-slate-400', badge: station.windBaselineGwa == null && windEra5ComparisonBaseline != null ? 'Fallback' : null },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center justify-between bg-slate-50 dark:bg-[#111a22] rounded-lg px-3 py-2 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">{r.label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono ${r.color}`}>{r.value}</span>
                          {r.badge && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">{r.badge}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Solar */}
                <div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-amber-400 text-[14px]">wb_sunny</span>GHI (kWh/m²/hari)
                  </p>
                  <div className="flex flex-col gap-2">
                    {[
                      { label: 'Observasi Lapangan', value: `${obsGhiMean.toFixed(2)} kWh/m²/hari`, color: 'text-slate-900 dark:text-white', badge: null },
                      { label: 'GSA Solargis', value: station.ghiBaselineGsa != null ? `${station.ghiBaselineGsa} kWh/m²/hari` : '—', color: 'text-amber-500 font-bold', badge: station.ghiBaselineGsa != null ? 'Aktif' : null },
                      { label: ghiEra5Label, value: ghiEra5ComparisonBaseline != null ? `${ghiEra5ComparisonBaseline.toFixed(2)} kWh/m²/hari` : '—', color: 'text-slate-600 dark:text-slate-400', badge: station.ghiBaselineGsa == null && ghiEra5ComparisonBaseline != null ? 'Fallback' : null },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center justify-between bg-slate-50 dark:bg-[#111a22] rounded-lg px-3 py-2 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">{r.label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono ${r.color}`}>{r.value}</span>
                          {r.badge && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30">{r.badge}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          {/* Row 3b: Grafik Meteorologi */}
          {meteoHasData && (
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-teal-400 text-[20px]">device_thermostat</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Grafik Meteorologi</h4>
                <span className="ml-auto text-[11px] text-slate-400">Suhu · Kelembapan · Tekanan · Arah Angin ({granularityLabel})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {([
                  { label: 'Suhu', unit: '°C', data: tempChartData, color: '#f97316', icon: 'thermometer', textColor: 'text-orange-400' },
                  { label: 'Kelembapan', unit: '%', data: humChartData, color: '#06b6d4', icon: 'water_drop', textColor: 'text-cyan-400' },
                  { label: 'Tekanan Udara', unit: 'hPa', data: presChartData, color: '#8b5cf6', icon: 'compress', textColor: 'text-violet-400', domain: ['auto', 'auto'] as [string, string] },
                  { label: 'Arah Angin', unit: '°', data: windDirChartData, color: '#10b981', icon: 'explore', textColor: 'text-emerald-400', domain: [0, 360] as [number, number] },
                ] as { label: string; unit: string; data: { date: string; obs: number; baseline: number }[]; color: string; icon: string; textColor: string; domain?: [number, number] | [string, string] }[]).map(({ label, unit, data, color, icon, textColor, domain }) => (
                  <div key={label} className="bg-gray-50 dark:bg-[#111a22] rounded-lg border border-gray-100 dark:border-gray-800 p-3">
                    <p className={`text-xs font-semibold ${textColor} mb-2 flex items-center gap-1`}>
                      <span className="material-symbols-outlined text-[14px]">{icon}</span>
                      {label} ({unit})
                    </p>
                    {data.length === 0 ? (
                      <div className="h-37 flex items-center justify-center text-slate-400 text-xs">Belum ada data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={150}>
                        <LineChart data={data} margin={{ top: 5, right: 8, bottom: 5, left: -8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 7, fill: '#64748b' }} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 7, fill: '#64748b' }} tickLine={false} axisLine={false} domain={domain ?? ['auto', 'auto']} />
                          <Tooltip
                            contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', fontSize: 10 }}
                            labelStyle={{ color: tooltipLabel }}
                          />
                          <Line type="monotone" dataKey="obs" stroke={color} strokeWidth={2} dot={{ r: 2 }} name={label} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Row 4: Perbandingan Baseline + Potensi Energi — 2 kolom */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Energy potential */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-yellow-400 text-[20px]">bolt</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Potensi Energi</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-xl p-4 text-center">
                  <span className="material-symbols-outlined text-blue-400 text-[24px] mb-1 block">air</span>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Kec. Angin LTA AEP</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {windBaselineVal.toFixed(2)}
                    <span className="text-sm font-medium text-slate-400 ml-1">m/s</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Sumber: {station.windBaselineGwa != null ? 'GWA 3.0' : station.windBaselineNasa != null ? 'ERA5 (ECMWF)' : 'Terukur'}
                  </p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-800/30 rounded-xl p-4 text-center">
                  <span className="material-symbols-outlined text-yellow-400 text-[24px] mb-1 block">wb_sunny</span>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">GHI LTA AEP</p>
                  <p className="text-2xl font-bold text-yellow-400">
                    {ghiBaselineVal.toFixed(2)}
                    <span className="text-sm font-medium text-slate-400 ml-1">kWh/m²/hari</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Sumber: {station.ghiBaselineGsa != null ? 'GSA Solargis' : station.ghiBaselineNasa != null ? 'ERA5 (ECMWF)' : 'Terukur'}
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800/30 rounded-xl p-4 text-center">
                  <span className="material-symbols-outlined text-green-400 text-[24px] mb-1 block">electric_bolt</span>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">AEP PLTB</p>
                  <p className="text-2xl font-bold text-green-400">
                    {windAepP50 != null ? windAepP50.toLocaleString('id') : '–'}
                    <span className="text-sm font-medium text-slate-400 ml-1">MWh/thn</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    P50 Net · P90: {windAepP90 != null ? `${windAepP90.toLocaleString('id')} MWh/thn` : '–'}
                  </p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 rounded-xl p-4 text-center">
                  <span className="material-symbols-outlined text-amber-400 text-[24px] mb-1 block">solar_power</span>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Hasil Spesifik PLTS</p>
                  <p className="text-2xl font-bold text-amber-400">
                    {solarSpecificYield.toLocaleString('id')}
                    <span className="text-sm font-medium text-slate-400 ml-1">kWh/kWp·thn</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1.5">PR = 78% (IEC tropik)</p>
                </div>
              </div>
            </div>{/* end Potensi Energi card */}

            {/* Prioritas GIS-MCDA */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-emerald-400 text-[20px]">layers</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Prioritas GIS-MCDA</h4>
                <span className="ml-auto font-bold text-sm text-slate-900 dark:text-white text-right">
                  {station.score}/100
                </span>
              </div>

              {/* Source badge */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {gisMcdaLoading ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400">
                    <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
                    Mengambil data koordinat dari OSM…
                  </span>
                ) : gisMcda && gisMcda.data_source_status !== 'fallback' ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <span className="material-symbols-outlined text-[12px]">gps_fixed</span>
                    Koordinat + OSM · {gisMcda.data_source}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
                    <span className="material-symbols-outlined text-[12px]">warning</span>
                    {gisMcda?.data_source ?? 'Skor sementara (GIS-MCDA belum termuat)'}
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {mcdaFactors.map((f) => (
                  <div key={f.label}>
                    <div className="flex justify-between text-xs text-slate-500 dark:text-text-secondary mb-0.5">
                      <span className="font-medium">{f.label}</span>
                      <span
                        className={`font-bold ${
                          f.pct >= 75 ? 'text-green-400' : f.pct >= 55 ? 'text-amber-400' : 'text-red-400'
                        }`}
                      >
                        {gisMcdaLoading && (f.label === 'Aksesibilitas' || f.label === 'Infrastruktur') ? '…' : `${f.pct}%`}
                      </span>
                    </div>
                    {f.detail && (
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 mb-1 leading-tight">{f.detail}</p>
                    )}
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-[#233648]">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          gisMcdaLoading && (f.label === 'Aksesibilitas' || f.label === 'Infrastruktur')
                            ? 'bg-slate-400 animate-pulse'
                            : f.pct >= 75 ? 'bg-green-500' : f.pct >= 55 ? 'bg-amber-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${f.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 5: Unduh Laporan */}
          <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary text-[20px]">download</span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Unduh Laporan</h3>
            </div>
            <div className="flex flex-col gap-3">
              {[
                {
                  key: 'pdf' as const,
                  icon: 'picture_as_pdf',
                  iconColor: 'text-red-500',
                  bgColor: 'bg-red-50 dark:bg-red-900/20',
                  title: 'Laporan Presentasi (PDF)',
                  desc: 'Dokumen siap cetak berisi identitas stasiun, metrik validasi, baseline, potensi energi, GIS-MCDA, meteorologi, dan grafik validasi.',
                  btnClass: 'bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20',
                  hoverBorder: 'hover:border-primary/50',
                  onClick: handleExportPDF,
                },
                {
                  key: 'csv' as const,
                  icon: 'table_view',
                  iconColor: 'text-green-600',
                  bgColor: 'bg-green-50 dark:bg-green-900/20',
                  title: 'Data Analisis (Excel)',
                  desc: 'Dataset parameter validasi dan estimasi potensi energi. Format Excel (.xlsx) terstruktur dengan styling rapi untuk analisis lanjutan di spreadsheet.',
                  btnClass: 'bg-white dark:bg-transparent border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800',
                  hoverBorder: 'hover:border-green-500/50',
                  onClick: handleExportCSV,
                },
                {
                  key: 'geojson' as const,
                  icon: 'map',
                  iconColor: 'text-purple-500',
                  bgColor: 'bg-purple-50 dark:bg-purple-900/20',
                  title: 'Data Geospasial (GeoJSON)',
                  desc: 'Fitur geografis: titik stasiun beserta seluruh atribut validasi dan potensi energi. Siap untuk QGIS, ArcGIS, atau aplikasi peta web.',
                  btnClass: 'bg-white dark:bg-transparent border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800',
                  hoverBorder: 'hover:border-purple-500/50',
                  onClick: handleExportGeoJSON,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className={`group bg-white dark:bg-card-dark rounded-xl p-6 border border-gray-200 dark:border-border-dark ${item.hoverBorder} transition-all shadow-sm hover:shadow-md flex flex-col sm:flex-row items-start sm:items-center gap-5`}
                >
                  <div className={`size-14 rounded-xl ${item.bgColor} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                    <span className={`material-symbols-outlined ${item.iconColor} text-[32px]`}>{item.icon}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1">{item.title}</h4>
                    <p className="text-sm text-slate-500 dark:text-text-secondary leading-relaxed">{item.desc}</p>
                  </div>
                  <button
                    onClick={item.onClick}
                    disabled={exporting !== null}
                    className={`shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold transition-all text-sm w-full sm:w-auto justify-center disabled:opacity-60 disabled:cursor-wait ${item.btnClass}`}
                  >
                    {exporting === item.key
                      ? <><span className="material-symbols-outlined text-[20px] animate-spin">refresh</span>Memproses...</>
                      : <><span className="material-symbols-outlined text-[20px]">download</span>Unduh</>
                    }
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function LaporanPage() {
  useEffect(() => { document.title = 'Laporan | RE-Valid'; }, []);
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
          <span className="material-symbols-outlined text-primary animate-spin text-[40px]">
            progress_activity
          </span>
        </div>
      }
    >
      <LaporanContent />
    </Suspense>
  );
}
