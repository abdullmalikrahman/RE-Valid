import type { Station } from './stationData';

const API_BASE = '/api/v1';

// Shape returned by backend (snake_case)
interface ApiStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: string | null;
  altitude: number | null;
  status: string;
  score: number;
  period: string | null;
  variables: string | null;
  mcp_status: string;
  wind_speed: number | null;
  irradiation: number | null;
  wind_baseline: number | null;
  ghi_baseline: number | null;
  aep: number | null;
  rmse: number | null;
  bias: number | null;
  r2: number | null;
  last_update: string;
}

function mapStation(s: ApiStation): Station {
  return {
    id: s.id,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    region: s.region ?? '',
    altitude: s.altitude ?? 0,
    status: s.status as Station['status'],
    score: s.score,
    lastUpdate: s.last_update,
    period: s.period ?? '—',
    variables: s.variables ?? '—',
    mcpStatus: s.mcp_status as Station['mcpStatus'],
    windSpeed: s.wind_speed ?? 0,
    irradiation: s.irradiation ?? 0,
    windBaseline: s.wind_baseline,
    ghiBaseline: s.ghi_baseline,
    aep: s.aep ?? 0,
    rmse: s.rmse ?? 0,
    bias: s.bias ?? 0,
    r2: s.r2 ?? 0,
  };
}

export async function fetchStations(): Promise<Station[]> {
  const res = await fetch(`${API_BASE}/stations`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data: ApiStation[] = await res.json();
  return data.map(mapStation);
}
