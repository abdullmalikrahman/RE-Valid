'use client';

import { useEffect, useRef, useState } from 'react';
import type { Station } from '@/lib/stationData';

interface Props {
  stations: Station[];
  activeLayer: 'none' | 'wind' | 'solar';
  showStations: boolean;
  showSatellite: boolean;
  showMCDA: boolean;
  selectedStation: Station | null;
  onSelectStation: (s: Station | null) => void;
  windPoints: [number, number, number][];
  solarPoints: [number, number, number][];
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LeafletMap({
  stations,
  activeLayer,
  showStations,
  showSatellite,
  showMCDA,
  selectedStation,
  onSelectStation,
  windPoints,
  solarPoints,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseTileRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heatLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mcdaLayerRef = useRef<any>(null);
  // Ref to track current selectedStation inside marker click closures (avoids stale state)
  const selectedStationRef = useRef(selectedStation);
  const [mapReady, setMapReady] = useState(false);

  // ── Initialize map ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((mapRef.current as any)._leaflet_id) delete (mapRef.current as any)._leaflet_id;

    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((mapRef.current as any)._leaflet_id) delete (mapRef.current as any)._leaflet_id;

      // @ts-expect-error leaflet internal
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current, {
        center: [-7.0, 107.8], zoom: 9, zoomControl: false, attributionControl: true,
      });

      const osmTile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      });
      osmTile.addTo(map);
      baseTileRef.current = osmTile;
      mapInstanceRef.current = map;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__leafletMap = map;
      setMapReady(true);
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        baseTileRef.current = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (mapRef.current) delete (mapRef.current as any)._leaflet_id;
        setMapReady(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Basemap toggle OSM / Satellite ──────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    import('leaflet').then((L) => {
      const map = mapInstanceRef.current;
      if (baseTileRef.current) map.removeLayer(baseTileRef.current);
      const tile = L.tileLayer(
        showSatellite
          ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: showSatellite
            ? '&copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }
      );
      tile.addTo(map);
      baseTileRef.current = tile;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, showSatellite]);

  useEffect(() => { selectedStationRef.current = selectedStation; }, [selectedStation]);

  // ── Station markers (Hasil Validasi) ───────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    import('leaflet').then((L) => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (!showStations) return;

      stations.forEach((station) => {
        const colorMap: Record<string, string> = {
          prioritas: '#22c55e', kandidat: '#f59e0b', tidak_sesuai: '#64748b',
        };
        const color = colorMap[station.status] ?? '#64748b';

        const icon = L.divIcon({
          className: '',
          html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;">
            ${station.status === 'prioritas' ? `<div style="position:absolute;width:28px;height:28px;border-radius:50%;background:${color};opacity:0.35;animation:ping 1.5s infinite;"></div>` : ''}
            <div style="width:18px;height:18px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;position:relative;z-index:1;">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 96 960 960" fill="white"><path d="m393 976 39-224H192l288-560h88l-38 216h240L481 976h-88Z"/></svg>
            </div></div>`,
          iconSize: [28, 28], iconAnchor: [14, 14],
        });

        const marker = L.marker([station.lat, station.lon], { icon })
          .addTo(mapInstanceRef.current)
          .on('click', () => onSelectStation(selectedStationRef.current?.id === station.id ? null : station));

        marker.bindTooltip(
          `<div style="font-size:12px;font-weight:700;color:#fff;background:#192633;border:1px solid #233648;padding:6px 10px;border-radius:6px;line-height:1.5;"><span style="color:${color}">&#9679;</span> ${station.id}<br/><span style="font-weight:400;color:#92adc9;">${station.name}</span></div>`,
          { permanent: false, direction: 'top', offset: [0, -10], className: 'leaflet-tooltip-custom' }
        );
        markersRef.current.push(marker);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, showStations, stations]);

  // ── Fly to selected station ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !selectedStation) return;
    const z = mapInstanceRef.current.getZoom();
    // Zoom IN to at least level 10; don't zoom out if already closer
    mapInstanceRef.current.flyTo([selectedStation.lat, selectedStation.lon], Math.max(z, 10), { duration: 0.8 });
  }, [mapReady, selectedStation]);

  // ── Wind / Solar heatmap (gradient circles) ─────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    if (heatLayerRef.current) { heatLayerRef.current.remove(); heatLayerRef.current = null; }
    if (activeLayer === 'none') return;

    import('leaflet').then((L) => {
      const points = activeLayer === 'wind' ? windPoints : solarPoints;
      // Gradient stops: intensity → color
      const stopsWind = [
        { stop: 0.0, color: '#2563eb' },
        { stop: 0.3, color: '#22c55e' },
        { stop: 0.6, color: '#eab308' },
        { stop: 0.85, color: '#f97316' },
        { stop: 1.0, color: '#ef4444' },
      ];
      const stopsSolar = [
        { stop: 0.0, color: '#fde68a' },
        { stop: 0.4, color: '#f59e0b' },
        { stop: 0.7, color: '#f97316' },
        { stop: 1.0, color: '#dc2626' },
      ];
      const stops = activeLayer === 'wind' ? stopsWind : stopsSolar;

      // Pick the color of the stop the intensity has reached (floor)
      function pickColor(intensity: number) {
        let color = stops[0].color;
        for (let i = 0; i < stops.length; i++) {
          if (intensity >= stops[i].stop) color = stops[i].color;
        }
        return color;
      }

      const grp = L.layerGroup();
      points.forEach(([lat, lon, intensity]) => {
        L.circle([lat, lon], {
          radius: 18000,
          color: 'transparent',
          fillColor: pickColor(intensity),
          fillOpacity: 0.10 + intensity * 0.18, // max ~0.28 per circle
          interactive: false,
        }).addTo(grp);
      });
      grp.addTo(mapInstanceRef.current);
      heatLayerRef.current = grp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, activeLayer]);

  // ── Prioritas GIS-MCDA ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    if (mcdaLayerRef.current) { mcdaLayerRef.current.remove(); mcdaLayerRef.current = null; }
    if (!showMCDA) return;

    import('leaflet').then((L) => {
      const grp = L.layerGroup();
      stations.forEach((s) => {
        const color = s.status === 'prioritas' ? '#22c55e' : s.status === 'kandidat' ? '#f59e0b' : '#64748b';
        const r = 12000 + (s.score / 100) * 18000;
        L.circle([s.lat, s.lon], { radius: r, color, weight: 2, opacity: 0.7, fillColor: color, fillOpacity: 0.12, interactive: false }).addTo(grp);
        L.circle([s.lat, s.lon], { radius: r * 0.35, color, weight: 1, opacity: 0.5, fillColor: color, fillOpacity: 0.25, interactive: false }).addTo(grp);
      });
      grp.addTo(mapInstanceRef.current);
      mcdaLayerRef.current = grp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, showMCDA, stations]);

  return (
    <>
      <style>{`
        @keyframes ping {
          0%,100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.8); opacity: 0; }
        }
        .leaflet-tooltip-custom { background: transparent !important; border: none !important; box-shadow: none !important; }
        .leaflet-attribution-flag { display: none !important; }
      `}</style>
      <div ref={mapRef} className="absolute inset-0 w-full h-full" style={{ background: '#e8e0d8', zIndex: 0 }} />
    </>
  );
}
