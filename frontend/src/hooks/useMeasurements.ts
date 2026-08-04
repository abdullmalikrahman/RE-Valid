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
  limit = 10080,
) {
  const params = new URLSearchParams();
  if (stationId) params.set('station_id', stationId);
  // Pastikan end mencakup seluruh hari (backend parse 'YYYY-MM-DD' sebagai midnight,
  // sehingga data di hari yang sama (jam > 00:00) akan terpotong tanpa ini).
  params.set('start', start.includes('T') ? start : `${start}T00:00:00`);
  params.set('end', end.includes('T') ? end : `${end}T23:59:59`);
  params.set('limit', String(limit));

  const { data, error, isLoading } = useSWR<Measurement[]>(
    stationId ? `/api/v1/measurements?${params.toString()}` : null,
    fetchMeasurements,
    { refreshInterval: 300_000 }, // 5 menit; 10.080 baris per fetch untuk kampanye 7 hari
  );

  return { measurements: data ?? [], isLoading, error };
}
