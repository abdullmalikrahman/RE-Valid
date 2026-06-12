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

const statusMeta: Record<StationStatus, { label: string; dot: string; fill: string }> = {
  prioritas: { label: 'Prioritas', dot: 'bg-green-500', fill: '#22c55e' },
  kandidat: { label: 'Kandidat', dot: 'bg-amber-400', fill: '#f59e0b' },
  tidak_sesuai: { label: 'Tidak Sesuai', dot: 'bg-slate-500', fill: '#64748b' },
};

const quickLinks = [
  { href: '/peta', icon: 'map', label: 'Peta Utama', note: 'Sebaran stasiun dan lapisan potensi' },
  { href: '/analisis', icon: 'bar_chart', label: 'Analisis Lokasi', note: 'Validasi data lapangan vs atlas' },
  { href: '/kalkulator', icon: 'calculate', label: 'Kalkulator', note: 'Screening energi dan ekonomi' },
];

function isRecentlyActive(station: Station): boolean {
  const ts = station.lastMeasurementAt ?? station.lastUpdate;
  if (!ts) return false;
  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) return false;
  return Date.now() - parsed.getTime() < 24 * 60 * 60 * 1000;
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
  const pad = 8;

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

function MapPreview({ stations, latestStation }: { stations: Station[]; latestStation: Station | null }) {
  const shape = useJabarShape();
  const projection = useMemo(() => buildMapProjection(shape, stations), [shape, stations]);

  return (
    <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white/92 shadow-sm dark:border-border-dark dark:bg-card-dark/95">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-border-dark">
        <div className="flex min-w-0 items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px] shrink-0">public</span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Preview WebGIS Jawa Barat</h2>
            <p className="truncate text-[11px] text-slate-500 dark:text-text-secondary">
              Batas wilayah dan titik stasiun RE-Valid
            </p>
          </div>
        </div>
        <Link href="/peta" className="shrink-0 text-xs font-bold text-primary hover:text-blue-600">
          Buka
        </Link>
      </div>

      <div className="relative h-[220px] bg-[#edf4f8] dark:bg-[#111a22] sm:h-[260px] lg:h-[260px] xl:h-[280px]">
        <div
          className="absolute inset-0 opacity-70 dark:opacity-35"
          style={{
            backgroundImage:
              'linear-gradient(rgba(100,116,139,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.18) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }}
        />

        <svg viewBox="0 0 100 100" role="img" aria-label="Preview peta stasiun RE-Valid" className="absolute inset-0 h-full w-full">
          {projection?.path && (
            <>
              <path d={projection.path} fill="rgba(19,127,236,0.08)" stroke="rgba(19,127,236,0.62)" strokeWidth="0.7" />
              <path d={projection.path} fill="none" stroke="rgba(15,23,42,0.18)" strokeWidth="0.18" />
            </>
          )}
          {projection && stations.map((station) => {
            const point = projection.project(station.lon, station.lat);
            const meta = statusMeta[station.status];
            return (
              <g key={station.id}>
                <circle cx={point.x} cy={point.y} r="2.9" fill={meta.fill} opacity="0.14" />
                <circle cx={point.x} cy={point.y} r="1.25" fill={meta.fill} stroke="white" strokeWidth="0.35" />
              </g>
            );
          })}
        </svg>

        <div className="absolute left-4 top-4 rounded-lg border border-slate-200 bg-white/88 px-3 py-2 text-[11px] shadow-sm dark:border-border-dark dark:bg-[#0d1117]/82">
          <p className="font-bold uppercase tracking-wide text-slate-500 dark:text-text-secondary">Koordinat</p>
          <p className="mt-1 font-mono text-slate-700 dark:text-slate-200">106.3E - 108.8E</p>
          <p className="font-mono text-slate-700 dark:text-slate-200">5.9S - 7.8S</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-2.5 text-xs dark:border-border-dark sm:flex-row sm:items-center sm:justify-between">
        <div className="text-slate-500 dark:text-text-secondary">
          Update terakhir:{' '}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {latestStation ? relativeTime(latestStation.lastMeasurementAt ?? latestStation.lastUpdate) : '-'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(statusMeta) as StationStatus[]).map((status) => (
            <span key={status} className="inline-flex items-center gap-1.5 text-slate-600 dark:text-text-secondary">
              <span className={`h-1.5 w-1.5 rounded-full ${statusMeta[status].dot}`} />
              {statusCount(stations, status)} {statusMeta[status].label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { stations, isLoading } = useStations();
  const activeStations = stations.filter(isRecentlyActive).length;
  const latestStation = [...stations].sort((a, b) => timestampValue(b) - timestampValue(a))[0] ?? null;

  const summary = [
    { label: 'Stasiun', value: isLoading ? '...' : String(stations.length) },
    { label: 'Aktif <24 Jam', value: isLoading ? '...' : String(activeStations) },
    { label: 'Prioritas', value: isLoading ? '...' : String(statusCount(stations, 'prioritas')) },
    { label: 'Tidak Sesuai', value: isLoading ? '...' : String(statusCount(stations, 'tidak_sesuai')) },
  ];

  return (
    <div className="flex min-h-screen bg-background-light text-slate-900 dark:bg-background-dark dark:text-white flex-col font-display lg:h-dvh lg:min-h-0">
      <Navbar />

      <main className="relative flex-1 overflow-hidden lg:min-h-0">
        <div
          className="pointer-events-none absolute inset-0 opacity-50 dark:opacity-15"
          style={{
            backgroundImage:
              'linear-gradient(rgba(100,116,139,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.14) 1px, transparent 1px)',
            backgroundSize: '72px 72px',
          }}
        />

        <section className="relative mx-auto grid w-full max-w-6xl gap-7 px-4 py-7 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8 lg:py-8 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              <span className="material-symbols-outlined text-[15px]">verified</span>
              SPK EBT - Jawa Barat
            </div>

            <h1 className="mt-4 max-w-2xl text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-[42px]">
              Sistem Pendukung Keputusan Potensi EBT Berbasis WebGIS.
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600 dark:text-text-secondary sm:text-base lg:leading-6">
              Validasi potensi angin dan surya menggunakan data lapangan, baseline GWA/GSA/ERA5,
              analisis MCP, GIS-MCDA, dan simulasi ekonomi untuk perencanaan EBT di Jawa Barat.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/peta"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white shadow-lg shadow-blue-900/20 transition-colors hover:bg-blue-600"
              >
                <span className="material-symbols-outlined text-[19px]">map</span>
                Buka Peta
              </Link>
              <Link
                href="/analisis"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-50 dark:border-border-dark dark:bg-card-dark dark:text-white dark:hover:bg-panel-dark"
              >
                <span className="material-symbols-outlined text-[19px]">analytics</span>
                Mulai Analisis
              </Link>
            </div>

            <dl className="mt-6 grid max-w-xl grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white/88 dark:border-border-dark dark:bg-card-dark/90 sm:grid-cols-4">
              {summary.map((item, index) => (
                <div
                  key={item.label}
                  className={`px-3 py-2.5 ${index > 0 ? 'border-l border-slate-200 dark:border-border-dark' : ''} ${index === 2 ? 'max-sm:border-l-0 max-sm:border-t max-sm:border-slate-200 max-sm:dark:border-border-dark' : ''} ${index === 3 ? 'max-sm:border-t max-sm:border-slate-200 max-sm:dark:border-border-dark' : ''}`}
                >
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-text-secondary">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-lg font-black text-slate-950 dark:text-white">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <MapPreview stations={stations} latestStation={latestStation} />
        </section>

        <section className="relative mx-auto max-w-6xl px-4 pb-6 sm:px-6 lg:px-8 lg:pb-5">
          <nav className="grid gap-2 rounded-xl border border-slate-200 bg-white/82 p-2 dark:border-border-dark dark:bg-card-dark/82 md:grid-cols-3" aria-label="Akses cepat">
            {quickLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-panel-dark"
              >
                <span className="material-symbols-outlined text-primary text-[22px] shrink-0">{item.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">{item.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-text-secondary">{item.note}</span>
                </span>
                <span className="material-symbols-outlined ml-auto text-slate-400 transition-colors group-hover:text-primary">chevron_right</span>
              </Link>
            ))}
          </nav>
        </section>
      </main>

      <Footer />
    </div>
  );
}
