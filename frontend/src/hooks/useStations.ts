import useSWR from 'swr';
import { fetchStations } from '@/lib/api';
import { stations as fallbackStations, type Station } from '@/lib/stationData';

export function useStations() {
  const { data, error, isLoading } = useSWR<Station[]>(
    '/api/v1/stations',
    fetchStations,
    { fallbackData: fallbackStations },
  );
  return {
    stations: data ?? fallbackStations,
    isLoading,
    error,
  };
}
