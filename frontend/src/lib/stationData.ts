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
  lastMeasurementAt: string | null; // Timestamp of last actual MQTT measurement
  firstMeasurementAt: string | null; // Timestamp of first actual MQTT measurement
  period: string;
  variables: string;
  mcpStatus: 'selesai' | 'berjalan' | 'pending';
  rmse: number;
  bias: number;
  r2: number;
  windSpeed: number; // m/s avg
  irradiation: number; // kWh/m²/day
  windBaseline?: number | null; // GWA/ERA5 atlas reference (m/s)
  ghiBaseline?: number | null; // GSA/ERA5 atlas reference (kWh/m²/day)
  windBaselineGwa?: number | null;  // Global Wind Atlas GeoTIFF 100m (m/s)
  ghiBaselineGsa?: number | null;   // Global Solar Atlas / Solargis API (kWh/m²/day)
  windBaselineNasa?: number | null; // ERA5/ECMWF wind speed 100m via Open-Meteo (m/s) — legacy column name
  ghiBaselineNasa?: number | null;  // ERA5/ECMWF GHI via Open-Meteo (kWh/m²/day) — legacy column name
  aep: number; // MWh/year estimated (wind, primary)
  windAep?: number | null; // MWh/year from wind validation
  solarAep?: number | null; // MWh/year from solar validation
  photo?: string;
  // Per-variable validation metrics
  windRmse?: number | null;
  windBias?: number | null;
  windR2?: number | null;
  solarRmse?: number | null;
  solarBias?: number | null;
  solarR2?: number | null;
}

// ─── Relative time formatter (works with ISO timestamp strings) ──────────────
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (!Number.isFinite(secs) || secs < 0) return '—';
  if (secs < 60) return `${secs} dtk lalu`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} mnt lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}
