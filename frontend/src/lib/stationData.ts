// ─── Jawa Barat station data ──────────────────────────────────────────────────

export type StationStatus = 'prioritas' | 'kandidat' | 'tidak_sesuai';

export interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: string;
  altitude: number; // meters
  status: StationStatus;
  score: number; // 0-100
  lastUpdate: string;
  period: string;
  variables: string;
  mcpStatus: 'selesai' | 'berjalan' | 'pending';
  rmse: number;
  bias: number;
  r2: number;
  windSpeed: number; // m/s avg
  irradiation: number; // kWh/m²/day
  windBaseline?: number | null; // GWA/NASA POWER atlas reference (m/s)
  ghiBaseline?: number | null; // PVGIS/NASA POWER atlas reference (kWh/m²/day)
  windBaselineGwa?: number | null;  // Global Wind Atlas GeoTIFF 100m (m/s)
  ghiBaselineGsa?: number | null;   // Global Solar Atlas / Solargis API (kWh/m²/day)
  windBaselineNasa?: number | null; // NASA POWER ERA5 WS100M (m/s)
  ghiBaselineNasa?: number | null;  // NASA POWER ERA5 GHI (kWh/m²/day)
  aep: number; // MWh/year estimated
  photo?: string;
}

// ─── Relative time formatter (works with ISO timestamp strings) ──────────────
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs} dtk lalu`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} mnt lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

export const stations: Station[] = [
  {
    id: 'GWY-089',
    name: 'Pos Pegunungan Wayang',
    lat: -7.2184,
    lon: 107.6452,
    region: 'Bandung Selatan, Jawa Barat',
    altitude: 1820,
    status: 'kandidat',
    score: 68,
    lastUpdate: '2026-04-20T09:55:00Z',
    period: 'Jan 2023 – Des 2023',
    variables: 'Angin, Iradiasi',
    mcpStatus: 'selesai',
    rmse: 1.09,
    bias: 19.8,
    r2: 0.80,
    windSpeed: 6.8,
    irradiation: 5.1,
    aep: 16353,
  },
  {
    id: 'CMH-001',
    name: 'Stasiun Cimahi Utara',
    lat: -6.8712,
    lon: 107.5432,
    region: 'Cimahi, Jawa Barat',
    altitude: 752,
    status: 'prioritas',
    score: 78,
    lastUpdate: '2026-04-20T09:52:00Z',
    period: 'Jan 2023 – Des 2023',
    variables: 'Angin, Iradiasi',
    mcpStatus: 'selesai',
    rmse: 0.93,
    bias: 11.42,
    r2: 0.89,
    windSpeed: 6.2,
    irradiation: 4.8,
    aep: 16353,
  },
  {
    id: 'PGD-023',
    name: 'Pos Pesisir Pangandaran',
    lat: -7.7041,
    lon: 108.6508,
    region: 'Pangandaran, Jawa Barat',
    altitude: 12,
    status: 'prioritas',
    score: 86,
    lastUpdate: '2026-04-20T08:00:00Z',
    period: 'Mar 2023 – Des 2023',
    variables: 'Angin, Iradiasi',
    mcpStatus: 'berjalan',
    rmse: 0.86,
    bias: 4.78,
    r2: 0.95,
    windSpeed: 5.4,
    irradiation: 4.6,
    aep: 19997,
  },
  {
    id: 'SBG-105',
    name: 'Stasiun Subang Utara',
    lat: -6.5891,
    lon: 107.7621,
    region: 'Subang, Jawa Barat',
    altitude: 48,
    status: 'tidak_sesuai',
    score: 44,
    lastUpdate: '2026-04-16T10:00:00Z',
    period: '—',
    variables: 'Surya',
    mcpStatus: 'pending',
    rmse: 0,
    bias: 0,
    r2: 0,
    windSpeed: 3.2,
    irradiation: 4.2,
    aep: 17902,
  },
  {
    id: 'GRT-056',
    name: 'Stasiun Garut Selatan',
    lat: -7.4833,
    lon: 107.8717,
    region: 'Garut, Jawa Barat',
    altitude: 730,
    status: 'prioritas',
    score: 83,
    lastUpdate: '2026-04-20T09:15:00Z',
    period: 'Feb 2023 – Des 2023',
    variables: 'Angin, Iradiasi',
    mcpStatus: 'selesai',
    rmse: 0.91,
    bias: 7.82,
    r2: 0.92,
    windSpeed: 5.9,
    irradiation: 4.9,
    aep: 21546,
  },
  {
    id: 'TSM-034',
    name: 'Pos Tasikmalaya Timur',
    lat: -7.3544,
    lon: 108.2248,
    region: 'Tasikmalaya, Jawa Barat',
    altitude: 368,
    status: 'prioritas',
    score: 88,
    lastUpdate: '2026-04-20T08:30:00Z',
    period: 'Jan 2023 – Sep 2023',
    variables: 'Angin',
    mcpStatus: 'berjalan',
    rmse: 0.84,
    bias: -2.75,
    r2: 0.97,
    windSpeed: 5.1,
    irradiation: 4.5,
    aep: 21546,
  },
];

// ─── Wind speed heatmap grid (simplified for Jawa Barat bbox) ─────────────────
// Each point: [lat, lon, intensity 0-1]
export const windHeatPoints: [number, number, number][] = [
  // High wind: Pegunungan Wayang area
  [-7.20, 107.64, 0.95], [-7.22, 107.62, 0.92], [-7.24, 107.66, 0.88],
  [-7.18, 107.60, 0.83], [-7.26, 107.68, 0.79],
  // Garut highlands
  [-7.45, 107.87, 0.82], [-7.50, 107.90, 0.78], [-7.48, 107.85, 0.76],
  // Cimahi-Bandung area
  [-6.87, 107.54, 0.75], [-6.90, 107.57, 0.71], [-6.93, 107.50, 0.68],
  // Pangandaran coast
  [-7.70, 108.65, 0.64], [-7.72, 108.68, 0.61], [-7.68, 108.62, 0.58],
  // Subang lowlands - low wind
  [-6.58, 107.76, 0.32], [-6.55, 107.80, 0.28], [-6.60, 107.72, 0.30],
  // Tasikmalaya
  [-7.35, 108.22, 0.60], [-7.38, 108.25, 0.57], [-7.32, 108.20, 0.55],
  // Scattered mid-points
  [-7.00, 107.70, 0.65], [-7.10, 107.80, 0.62], [-6.95, 107.65, 0.58],
  [-7.30, 107.95, 0.70], [-7.15, 108.00, 0.67],
  [-6.80, 107.90, 0.45], [-7.60, 108.40, 0.52], [-7.05, 108.10, 0.59],
];

// ─── Solar irradiation heatmap grid ──────────────────────────────────────────
export const solarHeatPoints: [number, number, number][] = [
  // High solar: Pangandaran coast & Subang
  [-7.70, 108.65, 0.92], [-7.68, 108.62, 0.88], [-7.72, 108.68, 0.85],
  [-6.58, 107.76, 0.86], [-6.55, 107.80, 0.83], [-6.60, 107.72, 0.80],
  // Garut selatan
  [-7.48, 107.87, 0.82], [-7.50, 107.90, 0.79],
  // Tasikmalaya
  [-7.35, 108.22, 0.78], [-7.38, 108.25, 0.75],
  // Cimahi - moderate
  [-6.87, 107.54, 0.74], [-6.90, 107.57, 0.70],
  // Pegunungan - lower solar (clouds)
  [-7.22, 107.64, 0.60], [-7.24, 107.66, 0.55], [-7.20, 107.62, 0.58],
  // Mid-range
  [-7.00, 107.70, 0.72], [-7.10, 107.80, 0.68], [-6.95, 107.65, 0.65],
  [-7.30, 107.95, 0.76], [-7.15, 108.00, 0.73],
  [-6.80, 107.90, 0.69], [-7.60, 108.40, 0.80], [-7.05, 108.10, 0.71],
];
