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

export function useMeasurements(
  stationId: string | null,
  start = '2023-01-01',
  end = '2023-12-31',
) {
  const params = new URLSearchParams();
  if (stationId) params.set('station_id', stationId);
  params.set('start', start);
  params.set('end', end);
  params.set('limit', '365');

  const { data, error, isLoading } = useSWR<Measurement[]>(
    stationId ? `/api/v1/measurements?${params.toString()}` : null,
    fetchMeasurements,
  );

  return { measurements: data ?? [], isLoading, error };
}
