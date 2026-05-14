import useSWR from 'swr';
import { apiFetch } from '@/lib/api';

export interface Measurement {
  id: number;
  station_id: string;
  measured_at: string;
  wind_speed: number | null;
  wind_dir: number | null;
  ghi: number | null;
  dni: number | null;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
}

async function fetchMeasurements(url: string): Promise<Measurement[]> {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to fetch measurements');
  return res.json();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function oneYearAgoStr() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function useMeasurements(
  stationId: string | null,
  start = oneYearAgoStr(),
  end = todayStr(),
  limit = 2000,
) {
  const params = new URLSearchParams();
  if (stationId) params.set('station_id', stationId);
  params.set('start', start);
  params.set('end', end);
  params.set('limit', String(limit));

  const { data, error, isLoading } = useSWR<Measurement[]>(
    stationId ? `/api/v1/measurements?${params.toString()}` : null,
    fetchMeasurements,
    { refreshInterval: 60_000 },
  );

  return { measurements: data ?? [], isLoading, error };
}
