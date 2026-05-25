import type { Station } from './stationData';

const API_BASE = '/api/v1';

// ── Token auto-refresh ────────────────────────────────────────────────────────

/** Decode payload dari JWT tanpa library eksternal (JWT = header.payload.sig base64). */
function getTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Sisa waktu token dalam detik. Negatif = sudah expire. */
function tokenSecondsLeft(token: string): number {
  const exp = getTokenExpiry(token);
  if (exp === null) return 0;
  return exp - Math.floor(Date.now() / 1000);
}

let _refreshPromise: Promise<string | null> | null = null;

/** Minta token baru dari /auth/refresh. Mengembalikan token baru atau null jika gagal. */
async function silentRefresh(currentToken: string): Promise<string | null> {
  // Deduplikasi: jika sudah ada refresh berjalan, tunggu hasilnya
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          // Token benar-benar expired — hapus dari localStorage agar loop berhenti
          localStorage.removeItem('re_valid_token');
          localStorage.removeItem('re_valid_username');
          localStorage.removeItem('re_valid_role');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('re_valid_auth_change'));
          }
        }
        return null;
      }
      const data = await res.json();
      localStorage.setItem('re_valid_token', data.access_token);
      return data.access_token as string;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

/**
 * Wrapper fetch yang:
 * 1. Otomatis menyertakan Authorization header dari localStorage
 * 2. Menyegarkan token secara diam-diam jika tersisa < 5 menit
 * 3. Redirect ke /login jika server mengembalikan 401
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let token = localStorage.getItem('re_valid_token');

  // Refresh diam-diam jika token tersisa < 5 menit (300 detik)
  if (token && tokenSecondsLeft(token) < 300) {
    const refreshed = await silentRefresh(token);
    if (refreshed) token = refreshed;
  }

  // Inject Authorization header jika ada token
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    // Token benar-benar tidak valid (mungkin sudah expire sebelum sempat refresh)
    localStorage.removeItem('re_valid_token');
    localStorage.removeItem('re_valid_username');
    localStorage.removeItem('re_valid_role');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('re_valid_auth_change'));
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
  wind_aep: number | null;
  solar_aep: number | null;
  rmse: number | null;
  bias: number | null;
  r2: number | null;
  wind_rmse: number | null;
  wind_bias: number | null;
  wind_r2: number | null;
  solar_rmse: number | null;
  solar_bias: number | null;
  solar_r2: number | null;
  last_update: string | null;
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
    lastUpdate: s.last_update ?? '',
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
    windAep: s.wind_aep ?? null,
    solarAep: s.solar_aep ?? null,
    rmse: s.rmse ?? 0,
    bias: s.bias ?? 0,
    r2: s.r2 ?? 0,
    windRmse: s.wind_rmse,
    windBias: s.wind_bias,
    windR2: s.wind_r2,
    solarRmse: s.solar_rmse,
    solarBias: s.solar_bias,
    solarR2: s.solar_r2,
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
