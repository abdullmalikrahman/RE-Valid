'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useStations } from '@/hooks/useStations';
import { relativeTime, type Station, type StationStatus } from '@/lib/stationData';

type GeoPolygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

type ProjectedPoint = {
  x: number;
  y: number;
};

const statusMeta: Record<StationStatus, { label: string; dot: string; text: string; fill: string }> = {
  prioritas: {
    label: 'Prioritas',
    dot: 'bg-green-500',
    text: 'text-green-700 dark:text-green-400',
    fill: '#22c55e',
  },
  kandidat: {
    label: 'Kandidat',
    dot: 'bg-amber-400',
    text: 'text-amber-700 dark:text-amber-300',
    fill: '#f59e0b',
  },
  tidak_sesuai: {
    label: 'Tidak Sesuai',
    dot: 'bg-slate-500',
    text: 'text-slate-600 dark:text-slate-400',
    fill: '#64748b',
  },
};

const actions = [
  {
    href: '/peta',
    icon: 'map',
    label: 'Buka Peta Utama',
    detail: 'Lihat sebaran stasiun, heatmap potensi, dan status GIS-MCDA.',
  },
  {
    href: '/analisis',
    icon: 'bar_chart',
    label: 'Analisis Lokasi',
    detail: 'Bandingkan observasi lapangan dengan GWA, GSA, dan ERA5.',
  },
  {
    href: '/kalkulator',
    icon: 'calculate',
    label: 'Kalkulator EBT',
    detail: 'Simulasikan AEP, LCOE, NPV, payback, dan kelayakan awal.',
  },
];

function isRecentlyActive(station: Station): boolean {
  const ts = station.lastMeasurementAt ?? station.lastUpdate;
  if (!ts) return false;
  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) return false;
  return Date.now() - parsed.getTime() < 24 * 60 * 60 * 1000;
}

function average(values: number[]): number | null {
  const clean = values.filter((value) => Number.isFinite(value) && value > 0);
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return value.toFixed(digits);
}

function statusCount(stations: Station[], status: StationStatus): number {
  return stations.filter((station) => station.status === status).length;
}

function timestampValue(station: Station): number {
  const parsed = new Date(station.lastMeasurementAt ?? station.lastUpdate ?? '').getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function useJabarShape() {
  const [shape, setShape] = useState<GeoPolygon | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/geodata/jabar-banten.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: GeoPolygon | null) => {
        if (!cancelled && data?.type === 'Polygon') setShape(data);
      })
      .catch(() => {
        if (!cancelled) setShape(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return shape;
}

function buildMapProjection(shape: GeoPolygon | null, stations: Station[]) {
  const shapeCoords = shape?.coordinates?.[0] ?? [];
  const stationCoords = stations.map((station) => [station.lon, station.lat]);
  const coords = [...shapeCoords, ...stationCoords].filter(
    ([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat),
  );

  if (coords.length === 0) return null;

  const lons = coords.map(([lon]) => lon);
  const lats = coords.map(([, lat]) => lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const pad = 6;

  const project = (lon: number, lat: number): ProjectedPoint => {
    const width = Math.max(maxLon - minLon, 0.0001);
    const height = Math.max(maxLat - minLat, 0.0001);
    return {
      x: pad + ((lon - minLon) / width) * (100 - pad * 2),
      y: pad + ((maxLat - lat) / height) * (100 - pad * 2),
    };
  };

  const path = shapeCoords.length > 0
    ? shapeCoords
        .map(([lon, lat], index) => {
          const point = project(lon, lat);
          return `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
        })
        .join(' ') + ' Z'
    : '';

  return { project, path };
}

function OperationalMap({ stations }: { stations: Station[] }) {
  const shape = useJabarShape();
  const projection = useMemo(() => buildMapProjection(shape, stations), [shape, stations]);
  const rankedStations = useMemo(
    () => [...stations].sort((a, b) => b.score - a.score).slice(0, 3),
    [stations],
  );

  return (
    <section className="rounded-xl border border-slate-200 dark:border-border-dark bg-white/95 dark:bg-card-dark/95 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-border-dark px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-primary text-[20px] shrink-0">public</span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Peta Operasional Jawa Barat</h2>
            <p className="text-[11px] text-slate-500 dark:text-text-secondary truncate">
              Batas wilayah, stasiun, dan status validasi terbaru
            </p>
          </div>
        </div>
        <Link href="/peta" className="shrink-0 text-xs font-semibold text-primary hover:text-blue-600">
          Buka
        </Link>
      </div>

      <div className="relative min-h-[300px] bg-[#edf4f8] dark:bg-[#111a22]">
        <div className="absolute inset-0 opacity-70 dark:opacity-40">
          <div className="absolute left-[12%] top-0 bottom-0 w-px bg-slate-300/60 dark:bg-slate-700/70" />
          <div className="absolute left-[34%] top-0 bottom-0 w-px bg-slate-300/50 dark:bg-slate-700/60" />
          <div className="absolute left-[58%] top-0 bottom-0 w-px bg-slate-300/50 dark:bg-slate-700/60" />
          <div className="absolute left-[82%] top-0 bottom-0 w-px bg-slate-300/60 dark:bg-slate-700/70" />
          <div className="absolute left-0 right-0 top-[25%] h-px bg-slate-300/60 dark:bg-slate-700/70" />
          <div className="absolute left-0 right-0 top-[50%] h-px bg-slate-300/50 dark:bg-slate-700/60" />
          <div className="absolute left-0 right-0 top-[75%] h-px bg-slate-300/60 dark:bg-slate-700/70" />
        </div>

        <svg viewBox="0 0 100 100" role="img" aria-label="Preview peta stasiun RE-Valid" className="absolute inset-0 h-full w-full">
          {projection?.path && (
            <>
              <path d={projection.path} fill="rgba(19,127,236,0.08)" stroke="rgba(19,127,236,0.62)" strokeWidth="0.7" />
              <path d={projection.path} fill="none" stroke="rgba(15,23,42,0.20)" strokeWidth="0.18" />
            </>
          )}
          {projection && stations.map((station) => {
            const point = projection.project(station.lon, station.lat);
            const meta = statusMeta[station.status];
            return (
              <g key={station.id}>
                <circle cx={point.x} cy={point.y} r="2.8" fill={meta.fill} opacity="0.16" />
                <circle cx={point.x} cy={point.y} r="1.35" fill={meta.fill} stroke="white" strokeWidth="0.35" />
              </g>
            );
          })}
        </svg>

        <div className="absolute left-4 top-4 rounded-lg border border-slate-200 dark:border-border-dark bg-white/90 dark:bg-[#0d1117]/85 px-3 py-2 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-text-secondary">
            Koordinat Sistem
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-700 dark:text-slate-200">106.3E - 108.8E</p>
          <p className="font-mono text-[11px] text-slate-700 dark:text-slate-200">5.9S - 7.8S</p>
        </div>

        <div className="absolute bottom-4 left-4 right-4 grid gap-2 sm:grid-cols-3">
          {rankedStations.length > 0 ? rankedStations.map((station) => (
            <Link
              href={`/analisis?station=${station.id}`}
              key={station.id}
              className="rounded-lg border border-slate-200 dark:border-border-dark bg-white/92 dark:bg-[#0d1117]/86 px-3 py-2 shadow-sm hover:border-primary/60 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold text-slate-900 dark:text-white">{station.name}</span>
                <span className="font-mono text-xs font-bold text-primary">{station.score}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-text-secondary">
                <span className={`h-1.5 w-1.5 rounded-full ${statusMeta[station.status].dot}`} />
                <span className="truncate">{station.id} &middot; {statusMeta[station.status].label}</span>
              </div>
            </Link>
          )) : (
            <div className="sm:col-span-3 rounded-lg border border-slate-200 dark:border-border-dark bg-white/90 dark:bg-[#0d1117]/85 px-3 py-2 text-xs text-slate-500 dark:text-text-secondary">
              Data stasiun akan muncul setelah API tersambung.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { stations, isLoading } = useStations();

  const activeStations = stations.filter(isRecentlyActive).length;
  const avgWind = average(stations.map((station) => station.windSpeed));
  const avgGhi = average(stations.map((station) => station.irradiation));
  const bestStation = [...stations].sort((a, b) => b.score - a.score)[0] ?? null;
  const latestStation = [...stations].sort((a, b) => timestampValue(b) - timestampValue(a))[0] ?? null;

  const stats = [
    { label: 'Stasiun Terdaftar', value: isLoading ? '...' : String(stations.length), note: 'basis data lokasi', icon: 'sensors' },
    { label: 'Aktif <24 Jam', value: isLoading ? '...' : String(activeStations), note: 'berdasarkan data terakhir', icon: 'settings_input_antenna' },
    { label: 'Angin Rata-rata', value: `${formatNumber(avgWind)} m/s`, note: 'observasi lapangan', icon: 'air' },
    { label: 'GHI Rata-rata', value: `${formatNumber(avgGhi)} kWh/m2`, note: 'radiasi harian', icon: 'wb_sunny' },
  ];

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-white flex flex-col font-display">
      <Navbar />

      <main className="flex-1">
        <section className="border-b border-slate-200 dark:border-border-dark">
          <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(460px,1.08fr)] lg:px-8 lg:py-10">
            <div className="flex flex-col justify-between gap-6">
              <div>
                <div className="inline-flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                  <span className="material-symbols-outlined text-[15px]">verified</span>
                  DSS Validasi EBT - Jawa Barat
                </div>

                <h1 className="mt-5 max-w-2xl text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                  Pantau potensi energi dari data stasiun, atlas, dan validasi lapangan.
                </h1>

                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 dark:text-text-secondary sm:text-base">
                  RE-Valid menggabungkan observasi angin dan surya, baseline GWA/GSA/ERA5,
                  analisis MCP, GIS-MCDA, dan simulasi ekonomi dalam satu alur kerja.
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/peta"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white shadow-lg shadow-blue-900/20 transition-colors hover:bg-blue-600"
                  >
                    <span className="material-symbols-outlined text-[19px]">map</span>
                    Buka Peta Utama
                  </Link>
                  <Link
                    href="/analisis"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-50 dark:border-border-dark dark:bg-card-dark dark:text-white dark:hover:bg-panel-dark"
                  >
                    <span className="material-symbols-outlined text-[19px]">analytics</span>
                    Mulai Analisis
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {stats.map((stat) => (
                  <div key={stat.label} className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-border-dark dark:bg-card-dark">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-text-secondary">
                      <span className="material-symbols-outlined text-primary text-[17px]">{stat.icon}</span>
                      <span className="truncate">{stat.label}</span>
                    </div>
                    <p className="mt-2 text-xl font-black text-slate-950 dark:text-white">{stat.value}</p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-text-secondary">{stat.note}</p>
                  </div>
                ))}
              </div>
            </div>

            <OperationalMap stations={stations} />
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-border-dark dark:bg-card-dark">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Status Kesesuaian Lokasi</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-text-secondary">
                  Ringkasan kategori hasil GIS-MCDA dari seluruh stasiun.
                </p>
              </div>
              {latestStation && (
                <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-border-dark">
                  <span className="text-slate-500 dark:text-text-secondary">Update terakhir: </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {relativeTime(latestStation.lastMeasurementAt ?? latestStation.lastUpdate)}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {(Object.keys(statusMeta) as StationStatus[]).map((status) => {
                const count = statusCount(stations, status);
                const pct = stations.length > 0 ? Math.round((count / stations.length) * 100) : 0;
                return (
                  <div key={status} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-border-dark dark:bg-[#111a22]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${statusMeta[status].dot}`} />
                        <span className={`truncate text-xs font-bold ${statusMeta[status].text}`}>
                          {statusMeta[status].label}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-black text-slate-900 dark:text-white">{count}</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div className={`h-full ${statusMeta[status].dot}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-text-secondary">{pct}% dari stasiun</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-border-dark dark:bg-card-dark">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Fokus Operasional</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">Lokasi terbaik saat ini</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                      {bestStation ? bestStation.name : 'Belum ada data'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-text-secondary">
                      {bestStation ? `${bestStation.id} - ${bestStation.region}` : 'Tambahkan stasiun untuk mulai validasi.'}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-2xl font-black text-primary">
                    {bestStation ? bestStation.score : '-'}
                  </span>
                </div>
              </div>

              {actions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-primary/60 hover:bg-white dark:border-border-dark dark:bg-[#111a22] dark:hover:bg-panel-dark"
                >
                  <span className="material-symbols-outlined text-primary text-[22px] shrink-0">{action.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900 dark:text-white">{action.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-text-secondary">{action.detail}</span>
                  </span>
                  <span className="material-symbols-outlined text-slate-400 transition-colors group-hover:text-primary">chevron_right</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
