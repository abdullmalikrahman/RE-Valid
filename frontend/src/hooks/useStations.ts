import useSWR from 'swr';
import { fetchStations } from '@/lib/api';
import type { Station } from '@/lib/stationData';

export function useStations() {
  const { data, error, isLoading, mutate } = useSWR<Station[]>(
    '/api/v1/stations',
    fetchStations,
    { refreshInterval: 120_000 }, // 2 menit — metadata stasiun jarang berubah
  );
  return {
    stations: data ?? [],
    isLoading,
    error,
    mutate,
  };
}
