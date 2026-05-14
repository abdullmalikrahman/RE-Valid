import useSWR from 'swr';
import { fetchStations } from '@/lib/api';
import type { Station } from '@/lib/stationData';

export function useStations() {
  const { data, error, isLoading, mutate } = useSWR<Station[]>(
    '/api/v1/stations',
    fetchStations,
    { refreshInterval: 30_000 },
  );
  return {
    stations: data ?? [],
    isLoading,
    error,
    mutate,
  };
}
