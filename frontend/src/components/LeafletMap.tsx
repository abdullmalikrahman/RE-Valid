'use client';

import { useEffect, useRef, useState } from 'react';
import type { Station } from '@/lib/stationData';

interface Props {
  stations: Station[];
  activeLayer: 'none' | 'wind' | 'solar';
  showStations: boolean;
  showConstraints: boolean;
  showSatellite: boolean;
  showMCDA: boolean;
  showJaringanListrik: boolean;
  showAksesJalan: boolean;
  showBufferPermukiman: boolean;
  showTopografi: boolean;
  selectedStation: Station | null;
  onSelectStation: (s: Station | null) => void;
  windPoints: [number, number, number][];
  solarPoints: [number, number, number][];
}

// ── Mock infrastructure data ───────────────────────────────────────────────────

const jaringanListrikLines: [number, number][][] = [
  [[-6.23, 106.99], [-6.50, 107.10], [-6.92, 107.62], [-7.21, 107.65]],
  [[-6.92, 107.62], [-6.93, 107.86], [-7.07, 108.10], [-7.33, 108.22]],
  [[-6.92, 107.62], [-7.10, 107.60], [-7.35, 107.70], [-7.48, 107.87]],
  [[-6.59, 107.76], [-6.70, 107.90], [-6.80, 108.10], [-6.71, 108.55]],
  [[-6.92, 107.62], [-6.86, 107.54], [-6.59, 107.76]],
];

const garduIndukPoints: [number, number][] = [
  [-6.9175, 107.6191], [-6.5891, 107.7621], [-6.2381, 106.9920],
  [-7.0711, 108.1025], [-6.7063, 108.5574], [-7.3500, 107.8700], [-7.7041, 108.6508],
];

const aksesJalanLines: [number, number][][] = [
  [[-6.42, 107.46], [-6.40, 107.70], [-6.38, 108.00], [-6.35, 108.25], [-6.71, 108.55]],
  [[-6.92, 107.62], [-6.93, 107.85], [-6.85, 108.20], [-6.71, 108.55]],
  [[-6.92, 107.62], [-7.10, 107.70], [-7.22, 107.87], [-7.33, 108.10], [-7.33, 108.22]],
  [[-6.92, 107.62], [-6.80, 107.30], [-6.93, 106.93], [-6.60, 106.80]],
  [[-6.23, 106.99], [-6.30, 107.33], [-6.42, 107.46]],
];

const permukimanCenters: { lat: number; lon: number; radius: number }[] = [
  { lat: -6.9175, lon: 107.6191, radius: 8000 },
  { lat: -6.2381, lon: 106.9920, radius: 6000 },
  { lat: -6.5971, lon: 106.8060, radius: 5000 },
  { lat: -6.7063, lon: 108.5574, radius: 5000 },
  { lat: -7.3274, lon: 108.2207, radius: 4500 },
  { lat: -6.9277, lon: 106.9299, radius: 4000 },
  { lat: -7.2111, lon: 107.9063, radius: 4000 },
  { lat: -6.8712, lon: 107.5432, radius: 3500 },
  { lat: -6.5891, lon: 107.7621, radius: 3500 },
];

const topoPoints: [number, number, number][] = [
  [-6.1, 107.2, 0.05], [-6.1, 107.5, 0.05], [-6.1, 107.8, 0.05],
  [-6.1, 108.1, 0.05], [-6.1, 108.4, 0.05], [-6.3, 106.9, 0.07],
  [-6.4, 107.3, 0.08], [-6.4, 107.6, 0.08], [-6.5, 107.8, 0.10],
  [-6.6, 108.1, 0.10], [-6.7, 108.4, 0.08], [-6.4, 108.6, 0.06],
  [-6.6, 107.0, 0.20], [-6.7, 107.2, 0.22], [-6.7, 107.4, 0.25],
  [-6.8, 107.6, 0.28], [-6.9, 107.9, 0.30], [-6.8, 108.0, 0.32],
  [-7.0, 108.3, 0.30], [-7.1, 108.5, 0.25], [-6.6, 106.9, 0.18],
  [-7.1, 107.3, 0.32], [-7.2, 107.5, 0.35],
  [-6.9, 107.1, 0.50], [-7.0, 107.3, 0.55], [-7.1, 107.6, 0.60],
  [-7.2, 107.7, 0.65], [-7.3, 107.9, 0.60], [-7.4, 108.0, 0.55],
  [-7.3, 108.2, 0.52], [-7.1, 108.1, 0.50], [-6.9, 107.6, 0.55],
  [-7.0, 107.5, 0.58],
  [-7.05, 107.50, 0.85], [-7.21, 107.65, 0.95], [-7.10, 107.75, 0.88],
  [-6.78, 107.00, 0.80], [-7.40, 107.73, 0.82], [-7.25, 107.73, 0.90],
  [-7.5, 107.0, 0.15], [-7.6, 107.4, 0.12], [-7.7, 107.8, 0.10],
  [-7.7, 108.2, 0.10], [-7.7, 108.5, 0.08],
];

// ─────────────────────────────────────────────────────────────────────────────

export default function LeafletMap({
  stations,
  activeLayer,
  showStations,
  showConstraints,
  showSatellite,
  showMCDA,
  showJaringanListrik,
  showAksesJalan,
  showBufferPermukiman,
  showTopografi,
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
  const constraintLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mcdaLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jaringanLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jalanLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bufferLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topoLayerRef = useRef<any>(null);
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
          .on('click', () => onSelectStation(station));

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
    mapInstanceRef.current.flyTo([selectedStation.lat, selectedStation.lon], Math.min(z, 10), { duration: 0.8 });
  }, [mapReady, selectedStation]);

  // ── Wind / Solar heatmap (gradient circles) ─────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    if (heatLayerRef.current) { heatLayerRef.current.remove(); heatLayerRef.current = null; }
    if (activeLayer === 'none') return;

    import('leaflet').then((L) => {
      const points = activeLayer === 'wind' ? windPoints : solarPoints;
      const gW = { 0.0: '#2563eb', 0.3: '#22c55e', 0.6: '#eab308', 0.85: '#f97316', 1.0: '#ef4444' };
      const gS = { 0.0: '#fde68a', 0.4: '#f59e0b', 0.7: '#f97316', 1.0: '#ef4444' };
      const grp = L.layerGroup();
      points.forEach(([lat, lon, intensity]) => {
        const grad = activeLayer === 'wind' ? gW : gS;
        const stops = Object.entries(grad).map(([k, v]) => ({ stop: parseFloat(k), color: v }));
        let color = stops[stops.length - 1].color;
        for (let i = 0; i < stops.length - 1; i++) {
          if (intensity >= stops[i].stop && intensity <= stops[i + 1].stop) { color = stops[i + 1].color; break; }
        }
        L.circle([lat, lon], { radius: 28000, color: 'transparent', fillColor: color, fillOpacity: 0.22 + intensity * 0.28, interactive: false }).addTo(grp);
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

  // ── Constraint Regulasi (KKP / KBAM) ──────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    if (constraintLayerRef.current) { constraintLayerRef.current.remove(); constraintLayerRef.current = null; }
    if (!showConstraints) return;

    import('leaflet').then((L) => {
      const grp = L.layerGroup();
      const zones: [number, number][][] = [
        [[-7.60, 108.20], [-7.60, 108.40], [-7.75, 108.40], [-7.75, 108.20]],
        [[-6.70, 107.45], [-6.70, 107.55], [-6.80, 107.55], [-6.80, 107.45]],
        [[-7.05, 107.35], [-7.05, 107.50], [-7.20, 107.50], [-7.20, 107.35]],
        [[-6.50, 106.75], [-6.50, 106.90], [-6.65, 106.90], [-6.65, 106.75]],
      ];
      zones.forEach((c) => L.polygon(c, {
        color: '#ef4444', weight: 1.5, opacity: 0.8, fillColor: '#ef4444', fillOpacity: 0.15, interactive: false,
      }).addTo(grp));
      grp.addTo(mapInstanceRef.current);
      constraintLayerRef.current = grp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, showConstraints]);

  // ── Jaringan Listrik PLN ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    if (jaringanLayerRef.current) { jaringanLayerRef.current.remove(); jaringanLayerRef.current = null; }
    if (!showJaringanListrik) return;

    import('leaflet').then((L) => {
      const grp = L.layerGroup();
      jaringanListrikLines.forEach((line) =>
        L.polyline(line, { color: '#facc15', weight: 2, opacity: 0.85, dashArray: '6 4', interactive: false }).addTo(grp)
      );
      garduIndukPoints.forEach(([lat, lon]) =>
        L.circleMarker([lat, lon], { radius: 5, color: '#facc15', weight: 2, fillColor: '#fef08a', fillOpacity: 1, interactive: false }).addTo(grp)
      );
      grp.addTo(mapInstanceRef.current);
      jaringanLayerRef.current = grp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, showJaringanListrik]);

  // ── Akses Jalan Arteri ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    if (jalanLayerRef.current) { jalanLayerRef.current.remove(); jalanLayerRef.current = null; }
    if (!showAksesJalan) return;

    import('leaflet').then((L) => {
      const grp = L.layerGroup();
      aksesJalanLines.forEach((line) =>
        L.polyline(line, { color: '#fb923c', weight: 3, opacity: 0.75, interactive: false }).addTo(grp)
      );
      grp.addTo(mapInstanceRef.current);
      jalanLayerRef.current = grp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, showAksesJalan]);

  // ── Buffer Permukiman ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    if (bufferLayerRef.current) { bufferLayerRef.current.remove(); bufferLayerRef.current = null; }
    if (!showBufferPermukiman) return;

    import('leaflet').then((L) => {
      const grp = L.layerGroup();
      permukimanCenters.forEach(({ lat, lon, radius }) => {
        L.circle([lat, lon], { radius, color: '#a78bfa', weight: 1.5, opacity: 0.7, fillColor: '#8b5cf6', fillOpacity: 0.10, interactive: false }).addTo(grp);
        L.circle([lat, lon], { radius: radius * 0.35, color: '#a78bfa', weight: 1, opacity: 0.5, fillColor: '#8b5cf6', fillOpacity: 0.20, interactive: false }).addTo(grp);
      });
      grp.addTo(mapInstanceRef.current);
      bufferLayerRef.current = grp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, showBufferPermukiman]);

  // ── Topografi / Elevasi DEM ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    if (topoLayerRef.current) { topoLayerRef.current.remove(); topoLayerRef.current = null; }
    if (!showTopografi) return;

    import('leaflet').then((L) => {
      const grp = L.layerGroup();
      topoPoints.forEach(([lat, lon, elev]) => {
        const color = elev < 0.15 ? '#fde68a' : elev < 0.35 ? '#86efac' : elev < 0.55 ? '#4ade80' : elev < 0.75 ? '#166534' : '#78350f';
        L.circle([lat, lon], {
          radius: 22000, color: 'transparent', fillColor: color, fillOpacity: 0.30 + elev * 0.20, interactive: false,
        }).addTo(grp);
      });
      grp.addTo(mapInstanceRef.current);
      topoLayerRef.current = grp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, showTopografi]);

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
