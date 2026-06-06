'use client';

import { useEffect, useRef, useState } from 'react';
import type { Station } from '@/lib/stationData';
import { fetchAtlasSample, fetchGisMcda, type AtlasSampleData, type GisMcdaData } from '@/lib/api';

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
  const samplePopupRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mcdaLayerRef = useRef<any>(null);
  // Ref to track current selectedStation inside marker click closures (avoids stale state)
  const selectedStationRef = useRef(selectedStation);
  const [mapReady, setMapReady] = useState(false);
  // GIS-MCDA data cache: station_id → fetched data
  const [mcdaCache, setMcdaCache] = useState<Record<string, GisMcdaData>>({});

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const renderSamplePopup = (
    layer: 'wind' | 'solar',
    lat: number,
    lon: number,
    sample?: AtlasSampleData,
    error?: string,
  ) => {
    const isWind = layer === 'wind';
    const color = isWind ? '#60a5fa' : '#fbbf24';
    const icon = isWind ? 'air' : 'wb_sunny';
    const title = isWind ? 'Kecepatan Angin Atlas' : 'Iradiasi Surya Atlas';
    const value = error
      ? 'Tidak tersedia'
      : sample
        ? sample.value == null
          ? 'Tidak tersedia'
          : `${sample.value.toFixed(2)} ${escapeHtml(sample.unit)}`
        : 'Memuat...';
    const source = error ? error : sample ? sample.source : 'Mengambil nilai atlas...';

    return `
      <div class="atlas-pop">
        <div class="atlas-pop-head">
          <span class="material-symbols-outlined atlas-pop-icon" style="color:${color}">${icon}</span>
          <span>${title}</span>
        </div>
        <div class="atlas-pop-value" style="color:${color}">${value}</div>
        <div class="atlas-pop-grid">
          <span>Koordinat</span>
          <strong>${lat.toFixed(4)}, ${lon.toFixed(4)}</strong>
        </div>
        <div class="atlas-pop-source">${escapeHtml(source)}</div>
        <div class="atlas-pop-note">Baseline LTA atlas untuk pembacaan potensi lokasi.</div>
      </div>
    `;
  };

  // ── Initialize map ──────────────────────────────────────────────────────────
  useEffect(() => {
    const mapEl = mapRef.current;
    if (!mapEl || mapInstanceRef.current) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((mapEl as any)._leaflet_id) delete (mapEl as any)._leaflet_id;

    import('leaflet').then((L) => {
      if (cancelled || mapInstanceRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((mapEl as any)._leaflet_id) delete (mapEl as any)._leaflet_id;

      // @ts-expect-error leaflet internal
      delete L.Icon.Default.prototype._getIconUrl;

      const map = L.map(mapEl, {
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
        delete (mapEl as any)._leaflet_id;
        setMapReady(false);
      }
    };

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

        const marker = L.marker([station.lat, station.lon], { icon, bubblingMouseEvents: false })
          .addTo(mapInstanceRef.current)
          .on('click', () => onSelectStation(selectedStationRef.current?.id === station.id ? null : station));

        marker.bindTooltip(
          `<div class="lf-tt-inner"><span style="color:${color}">&#9679;</span> ${station.id}<br/><span class="lf-tt-name">${station.name}</span></div>`,
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

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current;
    if (samplePopupRef.current) {
      samplePopupRef.current.remove();
      samplePopupRef.current = null;
    }
    if (activeLayer === 'none') return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;
    let requestId = 0;

    import('leaflet').then((L) => {
      if (cancelled || !mapInstanceRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handleClick = (e: any) => {
        const lat = Number(e.latlng.lat);
        const lon = Number(e.latlng.lng);
        if (lat < -8.1 || lat > -5.9 || lon < 106.4 || lon > 109.5) return;

        const currentRequest = ++requestId;
        const popup = L.popup({
          className: 'atlas-sample-popup',
          closeButton: true,
          maxWidth: 260,
          autoPan: true,
        })
          .setLatLng(e.latlng)
          .setContent(renderSamplePopup(activeLayer, lat, lon))
          .openOn(map);

        samplePopupRef.current = popup;

        fetchAtlasSample(activeLayer, lat, lon)
          .then((sample) => {
            if (cancelled || currentRequest !== requestId) return;
            popup.setContent(renderSamplePopup(activeLayer, lat, lon, sample));
          })
          .catch(() => {
            if (cancelled || currentRequest !== requestId) return;
            popup.setContent(renderSamplePopup(activeLayer, lat, lon, undefined, 'Nilai atlas tidak dapat diambil.'));
          });
      };

      map.on('click', handleClick);
      cleanup = () => map.off('click', handleClick);
    });

    return () => {
      cancelled = true;
      cleanup?.();
      if (samplePopupRef.current) {
        samplePopupRef.current.remove();
        samplePopupRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, activeLayer]);

  // ── Wind / Solar heatmap (canvas imageOverlay — smooth bilinear gradient) ──
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    if (heatLayerRef.current) { heatLayerRef.current.remove(); heatLayerRef.current = null; }
    if (activeLayer === 'none') return;

    const points = activeLayer === 'wind' ? windPoints : solarPoints;
    if (points.length === 0) return;

    import('leaflet').then((L) => {
      // ── Grid constants matching backend/app/api/v1/endpoints/atlas.py ───
      const LAT_MIN = -8.1, LAT_MAX = -5.9;
      const LON_MIN = 106.4, LON_MAX = 109.5;
      const STEP = 0.15;
      const nLat = Math.floor((LAT_MAX - LAT_MIN) / STEP) + 1; // 15 rows
      const nLon = Math.floor((LON_MAX - LON_MIN) / STEP) + 1; // 21 cols

      // ── Build flat 2D grid from IDW points ───────────────────────────────
      const grid = new Float32Array(nLat * nLon).fill(-1);
      for (const [lat, lon, v] of points) {
        const r = Math.round((lat - LAT_MIN) / STEP);
        const c = Math.round((lon - LON_MIN) / STEP);
        if (r >= 0 && r < nLat && c >= 0 && c < nLon) {
          grid[r * nLon + c] = v;
        }
      }

      // ── Color stop lerp (t ∈ [0,1] → [r,g,b]) ───────────────────────────
      type Stop = [number, number, number, number]; // [t, r, g, b]
      const stops: Stop[] = activeLayer === 'wind'
        ? [[0, 37, 99, 235], [0.25, 34, 197, 94], [0.5, 234, 179, 8], [0.75, 249, 115, 22], [1, 239, 68, 68]]
        : [[0, 253, 230, 138], [0.35, 245, 158, 11], [0.65, 249, 115, 22], [1, 185, 28, 28]];

      function lerpColor(t: number): [number, number, number] {
        const ct = Math.max(0, Math.min(1, t));
        for (let i = 1; i < stops.length; i++) {
          if (ct <= stops[i][0]) {
            const [t0, r0, g0, b0] = stops[i - 1];
            const [t1, r1, g1, b1] = stops[i];
            const f = (ct - t0) / (t1 - t0);
            return [
              Math.round(r0 + (r1 - r0) * f),
              Math.round(g0 + (g1 - g0) * f),
              Math.round(b0 + (b1 - b0) * f),
            ];
          }
        }
        const last = stops[stops.length - 1];
        return [last[1], last[2], last[3]];
      }

      // ── Render canvas with bilinear interpolation ────────────────────────
      // Canvas pixel (0,0) = NW corner (LAT_MAX, LON_MIN); Leaflet imageOverlay handles projection
      const W = 420, H = 300;
      const cvs = document.createElement('canvas');
      cvs.width = W;
      cvs.height = H;
      const ctx = cvs.getContext('2d')!;
      const imgData = ctx.createImageData(W, H);

      for (let py = 0; py < H; py++) {
        // py=0 → LAT_MAX (north), py=H-1 → LAT_MIN (south)
        const gr = ((H - 1 - py) / (H - 1)) * (nLat - 1);
        for (let px = 0; px < W; px++) {
          // px=0 → LON_MIN (west), px=W-1 → LON_MAX (east)
          const gc = (px / (W - 1)) * (nLon - 1);

          const c0 = Math.max(0, Math.floor(gc));
          const c1 = Math.min(nLon - 1, c0 + 1);
          const r0 = Math.max(0, Math.floor(gr));
          const r1 = Math.min(nLat - 1, r0 + 1);
          const tc = gc - c0;
          const tr = gr - r0;

          const v00 = grid[r0 * nLon + c0];
          const v10 = grid[r1 * nLon + c0];
          const v01 = grid[r0 * nLon + c1];
          const v11 = grid[r1 * nLon + c1];

          const valid = [v00, v10, v01, v11].filter((v) => v >= 0);
          if (valid.length === 0) continue;

          const intensity =
            valid.length === 4
              ? v00 * (1 - tr) * (1 - tc) +
                v10 * tr * (1 - tc) +
                v01 * (1 - tr) * tc +
                v11 * tr * tc
              : valid.reduce((a, b) => a + b, 0) / valid.length;

          const [r, g, b] = lerpColor(intensity);
          const idx = (py * W + px) * 4;
          imgData.data[idx]     = r;
          imgData.data[idx + 1] = g;
          imgData.data[idx + 2] = b;
          imgData.data[idx + 3] = 220; // ~86% opaque per pixel; final opacity via overlay
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // ── Clip to Banten + Jawa Barat boundary (fetch GeoJSON) ─────────────
      const lonToX = (lon: number) => ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * (W - 1);
      const latToY = (lat: number) => ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (H - 1);

      const applyClipAndAddOverlay = (ring: [number, number][]) => {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        ctx.beginPath();
        ring.forEach(([lon, lat], i) => {
          const x = lonToX(lon);
          const y = latToY(lat);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fill();
        ctx.restore();

        const overlay = L.imageOverlay(
          cvs.toDataURL('image/png'),
          [[LAT_MIN, LON_MIN], [LAT_MAX, LON_MAX]],
          { opacity: 0.72, interactive: false },
        );
        overlay.addTo(mapInstanceRef.current);
        heatLayerRef.current = overlay;
      };

      // Fetch boundary from public asset; fall back to bbox on error
      fetch('/geodata/jabar-banten.json')
        .then((r) => r.json())
        .then((geom: { type: string; coordinates: [number, number][][] }) => {
          const ring = geom.coordinates[0] as [number, number][];
          applyClipAndAddOverlay(ring);
        })
        .catch(() => {
          // Fallback: no clip, show full bbox
          const overlay = L.imageOverlay(
            cvs.toDataURL('image/png'),
            [[LAT_MIN, LON_MIN], [LAT_MAX, LON_MAX]],
            { opacity: 0.72, interactive: false },
          );
          overlay.addTo(mapInstanceRef.current);
          heatLayerRef.current = overlay;
        });
    });

  }, [mapReady, activeLayer, windPoints, solarPoints]);

  // ── Fetch GIS-MCDA data when layer is enabled ──────────────────────────────
  useEffect(() => {
    if (!showMCDA || stations.length === 0) return;
    const toFetch = stations.filter((s) => !mcdaCache[s.id]);
    if (toFetch.length === 0) return;
    Promise.all(
      toFetch.map((s) =>
        fetchGisMcda(s.id)
          .then((d) => ({ id: s.id, data: d }))
          .catch(() => ({ id: s.id, data: null }))
      )
    ).then((results) => {
      setMcdaCache((prev) => {
        const next = { ...prev };
        results.forEach((r) => { if (r.data) next[r.id] = r.data; });
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMCDA, stations]);

  // ── Prioritas GIS-MCDA ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    if (mcdaLayerRef.current) { mcdaLayerRef.current.remove(); mcdaLayerRef.current = null; }
    if (!showMCDA) return;

    import('leaflet').then((L) => {
      const grp = L.layerGroup();
      stations.forEach((s) => {
        const color = s.status === 'prioritas' ? '#22c55e' : s.status === 'kandidat' ? '#f59e0b' : '#64748b';

        // Radius berdasarkan skor komposit (rata-rata Topografi + Aksesibilitas + Infrastruktur)
        // Skala: 1km (composite=0%) -> 5km (composite=100%)
        const mcda = mcdaCache[s.id];
        let composite = 40; // default sementara selama data belum dimuat
        if (mcda) {
          const gisFactors = mcda.factors.filter((f) =>
            f.label === 'Topografi' || f.label === 'Aksesibilitas' || f.label === 'Infrastruktur'
          );
          if (gisFactors.length > 0) {
            composite = gisFactors.reduce((sum, f) => sum + f.pct, 0) / gisFactors.length;
          }
        }
        const r = 1000 + (composite / 100) * 4000;

        // Warna persentase berdasarkan nilai (bukan warna status stasiun yang bisa gelap)
        const pctColor = (pct: number) => pct >= 75 ? '#4ade80' : pct >= 50 ? '#fbbf24' : '#f87171';

        // Tooltip breakdown GIS-MCDA per faktor
        const gisRows = mcda
          ? mcda.factors
              .filter((f) => ['Topografi', 'Aksesibilitas', 'Infrastruktur'].includes(f.label))
              .map(
                (f) =>
                  `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:14px;margin-top:4px">`
                  + `<span style="color:#cbd5e1;font-size:11px">${f.label}</span>`
                  + `<span style="font-weight:700;color:${pctColor(f.pct)};font-size:12px">${f.pct}%`
                  + `${f.detail ? `<span style="font-weight:400;color:#94a3b8;font-size:10px"> · ${f.detail}</span>` : ''}`
                  + `</span></div>`
              )
              .join('')
          : `<div style="color:#94a3b8;margin-top:3px;font-size:11px">Memuat data GIS…</div>`;

        const tooltipHtml =
          `<div class="lf-tt-inner" style="min-width:200px;padding:8px 11px">`
          + `<div style="margin-bottom:6px;font-size:11px;font-weight:700;color:#f1f5f9">`
          + `<span style="color:${color}">&#9679;</span> ${s.id} <span style="color:#94a3b8;font-weight:400;font-size:10px">— GIS-MCDA</span></div>`
          + gisRows
          + (mcda ? `<div style="font-size:9px;color:#64748b;margin-top:7px;border-top:1px solid rgba(148,163,184,0.15);padding-top:5px">${mcda.data_source}</div>` : '')
          + `</div>`;

        // Lingkaran luar: zona prioritas GIS-MCDA
        L.circle([s.lat, s.lon], {
          radius: r, color, weight: 2, opacity: 0.7,
          fillColor: color, fillOpacity: 0.10, interactive: true,
        })
          .bindTooltip(tooltipHtml, { permanent: false, direction: 'top', className: 'leaflet-tooltip-custom' })
          .addTo(grp);

        // Lingkaran dalam: inti representatif stasiun (~30% radius)
        L.circle([s.lat, s.lon], {
          radius: r * 0.30, color, weight: 1.5, opacity: 0.6,
          fillColor: color, fillOpacity: 0.22, interactive: false,
        }).addTo(grp);
      });
      grp.addTo(mapInstanceRef.current);
      mcdaLayerRef.current = grp;
    });

  }, [mapReady, showMCDA, stations, mcdaCache]);

  return (
    <>
      <style>{`
        @keyframes ping {
          0%,100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.8); opacity: 0; }
        }
        .leaflet-tooltip-custom { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
        .leaflet-attribution-flag { display: none !important; }
        .lf-tt-inner {
          background: rgba(17,26,34,0.92);
          border: 1px solid rgba(50,77,103,0.8);
          border-radius: 6px;
          padding: 5px 8px;
          font-size: 11px;
          color: #c9d6e0;
          line-height: 1.5;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }
        .lf-tt-name { font-weight: 600; color: #e2eaf0; }
        .atlas-sample-popup .leaflet-popup-content-wrapper {
          background: rgba(17,26,34,0.96);
          border: 1px solid rgba(50,77,103,0.9);
          border-radius: 10px;
          box-shadow: 0 18px 40px rgba(0,0,0,0.35);
        }
        .atlas-sample-popup .leaflet-popup-content {
          margin: 0;
          min-width: 220px;
        }
        .atlas-sample-popup .leaflet-popup-tip {
          background: rgba(17,26,34,0.96);
          border: 1px solid rgba(50,77,103,0.9);
        }
        .atlas-sample-popup .leaflet-popup-close-button {
          color: #94a3b8 !important;
          padding: 8px 8px 0 0 !important;
        }
        .atlas-pop {
          padding: 12px 13px;
          color: #cbd5e1;
          font-size: 12px;
          line-height: 1.45;
        }
        .atlas-pop-head {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #f8fafc;
          font-size: 12px;
          font-weight: 800;
          padding-right: 18px;
        }
        .atlas-pop-icon {
          font-size: 17px;
          line-height: 1;
        }
        .atlas-pop-value {
          font-size: 24px;
          font-weight: 900;
          margin-top: 7px;
        }
        .atlas-pop-grid {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(148,163,184,0.16);
          color: #94a3b8;
        }
        .atlas-pop-grid strong {
          color: #e2e8f0;
          font-family: monospace;
          font-size: 11px;
        }
        .atlas-pop-source {
          margin-top: 7px;
          color: #93c5fd;
          font-size: 11px;
          font-weight: 650;
        }
        .atlas-pop-note {
          margin-top: 3px;
          color: #64748b;
          font-size: 10px;
        }
      `}</style>
      <div ref={mapRef} className="absolute inset-0 w-full h-full bg-[#e8e0d8] dark:bg-background-dark" style={{ zIndex: 0 }} />
    </>
  );
}
