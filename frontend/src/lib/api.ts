import type { Station } from './stationData';

const API_BASE = '/api/v1';

/**
 * Wrapper fetch yang otomatis redirect ke /login jika server
 * mengembalikan 401 (token expired atau tidak valid).
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    // Hapus token yang sudah tidak valid
    localStorage.removeItem('re_valid_token');
    localStorage.removeItem('re_valid_username');
    localStorage.removeItem('re_valid_role');
    if (typeof window !== 'undefined') {
      // Beritahu Navbar di tab yang sama agar segera update state login
      window.dispatchEvent(new CustomEvent('re_valid_auth_change'));
      // Redirect ke login — gunakan window.location agar bersih dari SWR cache
      window.location.href = '/login';
    }
  }
  return res;
}

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
  wind_baseline_gwa: number | null;
  ghi_baseline_gsa: number | null;
  wind_baseline_nasa: number | null;
  ghi_baseline_nasa: number | null;
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
    windBaselineGwa: s.wind_baseline_gwa,
    ghiBaselineGsa: s.ghi_baseline_gsa,
    windBaselineNasa: s.wind_baseline_nasa,
    ghiBaselineNasa: s.ghi_baseline_nasa,
    aep: s.aep ?? 0,
    rmse: s.rmse ?? 0,
    bias: s.bias ?? 0,
    r2: s.r2 ?? 0,
  };
}

export async function fetchStations(): Promise<Station[]> {
  const res = await apiFetch(`${API_BASE}/stations`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data: ApiStation[] = await res.json();
  return data.map(mapStation);
}

export interface HeatmapData {
  type: 'wind' | 'solar';
  source: string;
  points: [number, number, number][];   // [lat, lon, intensity 0-1]
  min_val: number;
  max_val: number;
  unit: string;
}

export async function fetchHeatmapData(type: 'wind' | 'solar'): Promise<HeatmapData> {
  const res = await apiFetch(`${API_BASE}/atlas/heatmap?type=${type}`);
  if (!res.ok) throw new Error(`Heatmap API error: ${res.status}`);
  return res.json();
}
