'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, useCallback, useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import { windHeatPoints, solarHeatPoints, relativeTime, type Station } from '@/lib/stationData';
import { useStations } from '@/hooks/useStations';

// Leaflet must be client-side only (no SSR)
const LeafletMap = dynamic(() => import('@/components/LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#e8e0d8]">
      <div className="flex flex-col items-center gap-3">
        <span className="material-symbols-outlined text-primary animate-spin text-[40px]">progress_activity</span>
        <p className="text-text-secondary text-sm">Memuat peta...</p>
      </div>
    </div>
  ),
});

type HeatLayer = 'none' | 'wind' | 'solar';

// --- Station detail panel ---
function StationPanel({
  station,
  onClose,
}: {
  station: Station;
  onClose: () => void;
}) {
  const statusColor: Record<string, string> = {
    prioritas: 'text-green-500',
    kandidat: 'text-amber-400',
    tidak_sesuai: 'text-slate-400',
  };
  const statusBg: Record<string, string> = {
    prioritas: 'bg-green-500/10 border-green-500/30 text-green-400',
    kandidat: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    tidak_sesuai: 'bg-slate-500/10 border-slate-500/30 text-slate-400',
  };
  const statusLabel: Record<string, string> = {
    prioritas: 'Prioritas',
    kandidat: 'Kandidat',
    tidak_sesuai: 'Tidak Sesuai',
  };
  const mcpBadge: Record<string, string> = {
    selesai: 'bg-primary/10 border-primary/30 text-primary',
    berjalan: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    pending: 'bg-slate-500/10 border-slate-500/30 text-slate-400',
  };
  const mcpLabel: Record<string, string> = {
    selesai: 'Selesai',
    berjalan: 'Berjalan',
    pending: 'Pending',
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed left-0 right-0 bottom-0 max-h-[75vh] rounded-t-2xl lg:absolute lg:left-auto lg:right-16 lg:top-4 lg:bottom-4 lg:max-h-none lg:w-80 lg:rounded-xl bg-white/95 dark:bg-panel-dark/95 backdrop-blur-md border border-slate-200 dark:border-[#233648] shadow-2xl z-1000 flex flex-col overflow-hidden">
      {/* Mobile drag handle */}
      <div className="lg:hidden flex justify-center pt-2 pb-1 shrink-0">
        <div className="w-8 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
      </div>
      <div className="p-4 border-b border-slate-200 dark:border-[#233648] flex justify-between items-start bg-slate-50/50 dark:bg-[#192633]/50 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${station.status === 'prioritas' ? 'bg-green-500 animate-pulse' : station.status === 'kandidat' ? 'bg-amber-400' : 'bg-slate-400'} shrink-0`} />
            <span className={`text-[12px] font-semibold uppercase tracking-wide ${statusColor[station.status]}`}>
              {statusLabel[station.status]}
            </span>
            <span className="text-[11px] text-slate-400 ml-auto whitespace-nowrap flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">schedule</span>
              {relativeTime(station.lastUpdate)}
            </span>
          </div>
          <h2 className="text-[17px] font-bold text-slate-900 dark:text-white leading-tight">{station.name}</h2>
          <p className="text-[12px] text-slate-500 dark:text-text-secondary mt-0.5">{station.region}</p>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
            {station.id} &middot; {station.lat.toFixed(4)}, {station.lon.toFixed(4)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-white ml-2 shrink-0 p-1 hover:bg-slate-100 dark:hover:bg-[#233648] rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined text-[22px]">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[13px]">
        <section>
          <h3 className="text-[13px] font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary text-[17px]">info</span>
            Informasi Lokasi
          </h3>
          <div className="bg-slate-50 dark:bg-[#111a22] rounded-lg border border-slate-200 dark:border-[#233648] divide-y divide-slate-100 dark:divide-[#1e2d3d]">
            {[
              { label: 'Periode', value: station.period },
              { label: 'Variabel', value: station.variables },
              { label: 'Ketinggian', value: `${station.altitude.toLocaleString('id')} m dpl` },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center px-3 py-2">
                <span className="text-slate-500 dark:text-text-secondary">{row.label}</span>
                <span className="font-medium text-slate-800 dark:text-slate-200 text-right">{row.value}</span>
              </div>
            ))}
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-slate-500 dark:text-text-secondary">Status Lokasi</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusBg[station.status]}`}>
                {statusLabel[station.status]}
              </span>
            </div>
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-slate-500 dark:text-text-secondary">Skor Kesesuaian</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {station.score}/100
                {' '}&#8212;
                <span className={station.score >= 80 ? 'text-green-500' : station.score >= 60 ? 'text-amber-400' : 'text-red-400'}>
                  {station.score >= 80 ? 'Tinggi' : station.score >= 60 ? 'Sedang' : 'Rendah'}
                </span>
              </span>
            </div>
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-slate-500 dark:text-text-secondary">Status MCP</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${mcpBadge[station.mcpStatus]}`}>
                {mcpLabel[station.mcpStatus]}
              </span>
            </div>
          </div>
        </section>

        {station.rmse > 0 && (
          <section>
            <h3 className="text-[13px] font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-violet-400 text-[17px]">query_stats</span>
              Metrik Validasi
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { k: 'RMSE', v: station.rmse.toFixed(2) },
                { k: 'Bias', v: `${station.bias > 0 ? '+' : ''}${station.bias.toFixed(1)}%` },
                { k: 'R²', v: station.r2.toFixed(2) },
                { k: 'Skor', v: `${station.score}%` },
              ].map((m) => (
                <div key={m.k} className="bg-slate-50 dark:bg-[#111a22] p-3 rounded-lg border border-slate-200 dark:border-[#233648] text-center">
                  <p className="text-[11px] text-slate-400 dark:text-text-secondary mb-0.5">{m.k}</p>
                  <p className="text-[17px] font-bold text-slate-900 dark:text-white">{m.v}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="text-[13px] font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-yellow-400 text-[17px]">bolt</span>
            Potensi Energi
          </h3>
          <div className="bg-slate-50 dark:bg-[#111a22] rounded-lg border border-slate-200 dark:border-[#233648] divide-y divide-slate-100 dark:divide-[#1e2d3d]">
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-slate-500 dark:text-text-secondary">Kec. Angin Rata-rata</span>
              <span className="font-bold text-slate-900 dark:text-white">{station.windSpeed} m/s</span>
            </div>
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-slate-500 dark:text-text-secondary">Iradiasi Matahari</span>
              <span className="font-bold text-slate-900 dark:text-white">{station.irradiation} kWh/m²/hari</span>
            </div>
            {station.aep > 0 && (
              <div className="flex justify-between items-center px-3 py-2">
                <span className="text-slate-500 dark:text-text-secondary">AEP Estimasi (P50)</span>
                <span className="font-bold text-primary">{station.aep.toLocaleString('id')} MWh/thn</span>
              </div>
            )}
          </div>
        </section>

      </div>

      <div className="p-4 border-t border-slate-200 dark:border-[#233648] shrink-0 flex gap-2">
        <Link
          href={`/analisis?station=${station.id}`}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg h-10 px-3 border border-primary text-primary hover:bg-primary hover:text-white text-[12px] font-bold transition-all"
        >
          <span className="material-symbols-outlined text-[15px]">bar_chart</span>
          <span>Analisis</span>
        </Link>
        <Link
          href={`/laporan?station=${station.id}`}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg h-10 px-3 bg-primary hover:bg-blue-600 text-white text-[12px] font-bold shadow-lg shadow-blue-500/20 transition-all"
        >
          <span className="material-symbols-outlined text-[15px]">description</span>
          <span>Laporan</span>
        </Link>
      </div>
    </div>
  );
}

// --- Analisis Modal ---
function AnalisisModal({ onClose, stations }: { onClose: () => void; stations: Station[] }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function runAnalysis() {
    setDone(true);
  }

  return (
    <div
      className="fixed inset-0 z-2000 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-panel-dark border border-slate-200 dark:border-[#233648] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#233648]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">analytics</span>
            <h2 className="font-bold text-slate-900 dark:text-white text-[15px]">Analisis Wilayah</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#233648] transition-colors">
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {!done ? (
            <>
              <p className="text-[13px] text-slate-500 dark:text-text-secondary">
                Peringkat lokasi berdasarkan skor kesesuaian yang dihitung dari data validasi lapangan: kecepatan angin, iradiasi surya, RMSE, R², Bias, dan ketinggian stasiun.
              </p>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                {[
                  { icon: 'sensors', label: 'Stasiun Aktif', value: `${stations.filter(s => s.status !== 'tidak_sesuai').length} lokasi` },
                  { icon: 'layers', label: 'Kriteria Skor', value: '6 variabel' },
                  { icon: 'area_chart', label: 'Cakupan', value: 'Jawa Barat' },
                  { icon: 'schedule', label: 'Est. Waktu', value: 'Instan' },
                ].map((s) => (
                  <div key={s.label} className="bg-slate-50 dark:bg-[#111a22] rounded-lg p-3 border border-slate-200 dark:border-[#233648] flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-primary text-[18px]">{s.icon}</span>
                    <div>
                      <p className="text-slate-400 text-[11px]">{s.label}</p>
                      <p className="font-bold text-slate-900 dark:text-white">{s.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={runAnalysis} className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-primary hover:bg-blue-600 text-white font-bold text-[13px] transition-all">
                <span className="material-symbols-outlined text-[18px]">play_arrow</span>Jalankan Analisis
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-green-500 mb-2">
                <span className="material-symbols-outlined text-[24px]">check_circle</span>
                <span className="font-bold text-[14px]">Analisis selesai</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {[...stations].sort((a, b) => b.score - a.score).map((s, i) => (
                  <Link key={s.id} href={`/analisis?station=${s.id}`} className="flex items-center gap-3 bg-slate-50 dark:bg-[#111a22] p-3 rounded-lg border border-slate-200 dark:border-[#233648] hover:border-primary hover:bg-blue-50 dark:hover:bg-[#0d1c2a] transition-colors group">
                    <span className="text-[12px] font-bold text-slate-400 w-4 shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-slate-900 dark:text-white truncate group-hover:text-primary transition-colors">{s.name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{s.id}</p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div>
                        <p className="text-[12px] font-bold text-slate-900 dark:text-white">{s.score}/100</p>
                        <p className={`text-[11px] font-medium ${s.status === 'prioritas' ? 'text-green-500' : s.status === 'kandidat' ? 'text-amber-400' : 'text-slate-400'}`}>
                          {s.status === 'prioritas' ? 'Prioritas' : s.status === 'kandidat' ? 'Kandidat' : 'Tidak Sesuai'}
                        </p>
                      </div>
                      <span className="material-symbols-outlined text-[16px] text-slate-300 group-hover:text-primary transition-colors">chevron_right</span>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="flex gap-2">
                <Link href={`/analisis?station=${[...stations].sort((a, b) => b.score - a.score)[0].id}`} className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-primary hover:bg-blue-600 text-white font-bold text-[12px] transition-all">
                  <span className="material-symbols-outlined text-[15px]">bar_chart</span>Buka Analisis
                </Link>
                <button onClick={onClose} className="flex-1 h-9 rounded-lg border border-slate-300 dark:border-[#233648] text-slate-600 dark:text-slate-300 text-[12px] font-medium hover:bg-slate-50 dark:hover:bg-[#233648] transition-all">
                  Tutup
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main page ---
export default function PetaPage() {
  const { stations } = useStations();
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [activeLayer, setActiveLayer] = useState<HeatLayer>('none');
  // Lapisan Aktif
  const [showSatellite, setShowSatellite] = useState(false);
  const [showStations, setShowStations] = useState(true);
  const [showMCDA, setShowMCDA] = useState(false);
  const [filterPriority, setFilterPriority] = useState<'all' | 'prioritas' | 'kandidat' | 'tidak_sesuai'>('all');
  const [showAnalisis, setShowAnalisis] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const handleSelectStation = useCallback((s: Station | null) => setSelectedStation(s), []);

  const searchRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchQuery('');
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape' && searchQuery) {
        // Stop propagation so StationPanel's ESC listener doesn't also fire
        e.stopImmediatePropagation();
        setSearchQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    // Use capture:true so this fires before StationPanel's bubble-phase listener
    document.addEventListener('keydown', handleEsc, { capture: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc, { capture: true });
    };
  }, [searchQuery]);

  // Search searches ALL stations regardless of active filter
  const searchResults = searchQuery === ''
    ? []
    : stations.filter((s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.region.toLowerCase().includes(searchQuery.toLowerCase())
      );

  // Main list & map follow the status filter only
  const filteredStations = stations.filter(
    (s) => filterPriority === 'all' || s.status === filterPriority
  );

  // Clear selected station if it is no longer in the filtered list
  useEffect(() => {
    if (selectedStation && !filteredStations.some((s) => s.id === selectedStation.id)) {
      setSelectedStation(null);
    }
  }, [filteredStations, selectedStation]);

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white font-display overflow-hidden h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 relative flex overflow-hidden">

        {/* Mobile sidebar backdrop */}
        {showMobileSidebar && (
          <div
            className="lg:hidden fixed inset-0 top-14 bg-black/50 z-30"
            onClick={() => setShowMobileSidebar(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`flex flex-col border-r border-slate-200 dark:border-[#233648] bg-white dark:bg-[#111a22] shrink-0 fixed top-14 bottom-0 left-0 z-40 w-72 transition-transform duration-300 ease-in-out ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:top-auto lg:bottom-auto lg:left-auto lg:z-20 lg:translate-x-0`}>
          {/* Mobile close button */}
          <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-[#233648] shrink-0">
            <span className="text-[12px] font-bold text-slate-500 dark:text-text-secondary uppercase tracking-wider">Kontrol Peta</span>
            <button onClick={() => setShowMobileSidebar(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-[#233648] transition-colors">
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>
          <div className="p-4 flex flex-col h-full overflow-hidden">

            <div className="mb-4" ref={searchRef}>
              <div className="flex w-full items-center rounded-lg border border-slate-200 dark:border-[#233648] bg-slate-50 dark:bg-[#192633] focus-within:ring-2 focus-within:ring-primary/50 px-3 h-10">
                <span className="material-symbols-outlined text-slate-400 text-[20px] shrink-0">search</span>
                <input
                  className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-text-secondary px-2 text-[13px]"
                  placeholder="Cari ID atau nama stasiun..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                )}
              </div>
              {searchQuery && searchResults.length > 0 && (
                <div className="mt-1 bg-white dark:bg-[#192633] border border-slate-200 dark:border-[#233648] rounded-lg shadow-xl overflow-hidden z-30 relative">
                  {searchResults.map((s) => (
                    <button key={s.id} onClick={() => {
                      setSelectedStation(s);
                      setSearchQuery('');
                      setShowMobileSidebar(false);
                      // If the selected station is not in the current filter, reset to 'all'
                      if (filterPriority !== 'all' && s.status !== filterPriority) {
                        setFilterPriority('all');
                      }
                    }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-[#233648] text-left transition-colors border-b border-slate-100 dark:border-[#1e2d3d] last:border-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${s.status === 'prioritas' ? 'bg-green-500' : s.status === 'kandidat' ? 'bg-amber-400' : 'bg-slate-400'}`} />
                      <div>
                        <p className="text-[12px] font-semibold text-slate-900 dark:text-white">{s.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{s.id} &middot; {s.status === 'prioritas' ? 'Prioritas' : s.status === 'kandidat' ? 'Kandidat' : 'Tidak Sesuai'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery && searchResults.length === 0 && (
                <div className="mt-1 bg-white dark:bg-[#192633] border border-slate-200 dark:border-[#233648] rounded-lg px-3 py-3">
                  <p className="text-[12px] text-slate-400 text-center">Tidak ditemukan</p>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4">

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-primary text-[19px]">layers</span>
                  <h3 className="text-slate-900 dark:text-white text-[12px] font-bold uppercase tracking-wider">Lapisan Aktif</h3>
                </div>
                <div className="bg-slate-50 dark:bg-panel-dark rounded-lg p-3 border border-slate-200 dark:border-[#233648] space-y-1">
                  {/* Lapisan Dasar Atlas */}
                  <label className="flex items-center gap-3 py-1.5 cursor-pointer group">
                    <input type="checkbox" checked={showSatellite} onChange={() => setShowSatellite(v => !v)} className="h-4 w-4 rounded border-slate-300 dark:border-[#324d67] accent-primary" />
                    <div>
                      <p className="text-slate-700 dark:text-white text-[13px] font-medium group-hover:text-primary transition-colors">Lapisan Dasar Atlas</p>
                      <p className="text-slate-400 text-[11px]">Citra satelit &amp; medan</p>
                    </div>
                  </label>
                  {/* Hasil Validasi */}
                  <label className="flex items-center gap-3 py-1.5 cursor-pointer group border-t border-slate-200 dark:border-[#233648]/50">
                    <input type="checkbox" checked={showStations} onChange={() => setShowStations(v => !v)} className="h-4 w-4 rounded border-slate-300 dark:border-[#324d67] accent-primary" />
                    <div>
                      <p className="text-slate-700 dark:text-white text-[13px] font-medium group-hover:text-primary transition-colors">Hasil Validasi</p>
                      <p className="text-slate-400 text-[11px]">Penanda stasiun &amp; metrik</p>
                    </div>
                  </label>
                  {/* Kecepatan Angin */}
                  <label className="flex items-center gap-3 py-1.5 cursor-pointer group border-t border-slate-200 dark:border-[#233648]/50">
                    <input type="checkbox" checked={activeLayer === 'wind'} onChange={() => setActiveLayer(v => v === 'wind' ? 'none' : 'wind')} className="h-4 w-4 rounded border-slate-300 dark:border-[#324d67] accent-primary" />
                    <div>
                      <p className="text-slate-700 dark:text-white text-[13px] font-medium group-hover:text-primary transition-colors">Kecepatan Angin (Heatmap)</p>
                      <p className="text-slate-400 text-[11px]">ERA5 (ECMWF) &middot; m/s</p>
                    </div>
                  </label>
                  {/* Iradiasi Surya */}
                  <label className="flex items-center gap-3 py-1.5 cursor-pointer group border-t border-slate-200 dark:border-[#233648]/50">
                    <input type="checkbox" checked={activeLayer === 'solar'} onChange={() => setActiveLayer(v => v === 'solar' ? 'none' : 'solar')} className="h-4 w-4 rounded border-slate-300 dark:border-[#324d67] accent-primary" />
                    <div>
                      <p className="text-slate-700 dark:text-white text-[13px] font-medium group-hover:text-primary transition-colors">Iradiasi Surya (Heatmap)</p>
                      <p className="text-slate-400 text-[11px]">GWA/GSA &middot; kWh/m&sup2;/hari</p>
                    </div>
                  </label>
                  {/* Prioritas GIS-MCDA */}
                  <label className="flex items-center gap-3 py-1.5 cursor-pointer group border-t border-slate-200 dark:border-[#233648]/50">
                    <input type="checkbox" checked={showMCDA} onChange={() => setShowMCDA(v => !v)} className="h-4 w-4 rounded border-slate-300 dark:border-[#324d67] accent-primary" />
                    <div>
                      <p className="text-slate-700 dark:text-white text-[13px] font-medium group-hover:text-primary transition-colors">Prioritas GIS-MCDA</p>
                      <p className="text-slate-400 text-[11px]">Peta zona potensi energi</p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-primary text-[19px]">tune</span>
                  <h3 className="text-slate-900 dark:text-white text-[12px] font-bold uppercase tracking-wider">Filter Status</h3>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(['all', 'prioritas', 'kandidat', 'tidak_sesuai'] as const).map((f) => (
                    <button key={f} onClick={() => setFilterPriority(f)}
                      className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg border transition-all ${
                        filterPriority === f
                          ? f === 'tidak_sesuai' ? 'bg-slate-500 text-white border-slate-500' : 'bg-primary text-white border-primary'
                          : 'bg-white dark:bg-[#111a22] border-slate-200 dark:border-[#233648] text-slate-500 dark:text-slate-400 hover:border-primary/50'
                      }`}>
                      {f === 'all' ? 'Semua' : f === 'prioritas' ? 'Prioritas' : f === 'kandidat' ? 'Kandidat' : 'Tidak Sesuai'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-slate-900 dark:text-white text-[12px] font-bold uppercase tracking-wider">Daftar Stasiun</h3>
                  <span className="text-[11px] text-slate-400">{filteredStations.length} lokasi</span>
                </div>
                <div className="space-y-1.5">
                  {filteredStations.length === 0 ? (
                    <div className="text-center py-6">
                      <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[32px]">location_off</span>
                      <p className="text-[12px] text-slate-400 mt-1">Tidak ada lokasi</p>
                    </div>
                  ) : filteredStations.map((s) => (
                    <button key={s.id} onClick={() => { setSelectedStation(prev => prev?.id === s.id ? null : s); setShowMobileSidebar(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all ${selectedStation?.id === s.id ? 'bg-primary/10 border-primary/50' : 'bg-white dark:bg-panel-dark border-slate-200 dark:border-[#233648] hover:border-primary/40 hover:bg-slate-50 dark:hover:bg-[#192633]'}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${s.status === 'prioritas' ? 'bg-green-500' : s.status === 'kandidat' ? 'bg-amber-400' : 'bg-slate-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-slate-900 dark:text-white truncate">{s.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{s.id} · {s.score}/100</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-[#233648] shrink-0">
              <button onClick={() => setShowAnalisis(true)}
                className="w-full flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-primary hover:bg-blue-600 text-white text-[13px] font-bold shadow-lg shadow-blue-500/20 transition-all">
                <span className="material-symbols-outlined text-[18px]">analytics</span>
                Analisis Wilayah
              </button>
            </div>
          </div>
        </aside>

        {/* Map area */}
        <div className="flex-1 relative bg-[#e8e0d8] w-full h-full">

          <LeafletMap
            stations={filteredStations}
            activeLayer={activeLayer}
            showStations={showStations}
            showSatellite={showSatellite}
            showMCDA={showMCDA}
            selectedStation={selectedStation}
            onSelectStation={handleSelectStation}
            windPoints={windHeatPoints}
            solarPoints={solarHeatPoints}
          />

          {/* Zoom controls - wired via leaflet map ref via window */}
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-1000">
            {[
              { icon: 'add', title: 'Zoom In', action: 'zoomin' },
              { icon: 'remove', title: 'Zoom Out', action: 'zoomout' },
            ].map((btn) => (
              <button key={btn.action}
                onClick={() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const w = window as any;
                  if (w.__leafletMap) btn.action === 'zoomin' ? w.__leafletMap.zoomIn() : w.__leafletMap.zoomOut();
                }}
                className="bg-white dark:bg-[#192633] text-slate-700 dark:text-white p-2.5 rounded-lg shadow-lg hover:bg-slate-50 dark:hover:bg-[#233648] border border-slate-200 dark:border-[#233648] transition-colors"
                title={btn.title}>
                <span className="material-symbols-outlined block text-[22px]">{btn.icon}</span>
              </button>
            ))}
            <button
              onClick={() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const w = window as any;
                if (w.__leafletMap) w.__leafletMap.setView([-7.0, 107.8], 9);
              }}
              className="mt-1 bg-white dark:bg-[#192633] text-slate-700 dark:text-white p-2.5 rounded-lg shadow-lg hover:bg-slate-50 dark:hover:bg-[#233648] border border-slate-200 dark:border-[#233648] transition-colors"
              title="Reset ke Jawa Barat">
              <span className="material-symbols-outlined block text-[22px]">my_location</span>
            </button>
          </div>

          {/* Left side controls */}
          <div className="absolute top-4 left-4 z-1000 flex flex-col gap-2">
            {/* Mobile: open sidebar button */}
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="lg:hidden flex items-center gap-2 bg-white dark:bg-[#192633] text-slate-700 dark:text-white px-3 py-2 rounded-lg shadow-lg border border-slate-200 dark:border-[#233648] text-[12px] font-bold transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
              <span>Kontrol Peta</span>
            </button>
            {/* Active layer badge */}
            {activeLayer !== 'none' && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold border backdrop-blur-sm ${activeLayer === 'wind' ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'}`}>
                <span className="material-symbols-outlined text-[14px]">{activeLayer === 'wind' ? 'air' : 'wb_sunny'}</span>
                {activeLayer === 'wind' ? 'Layer: Kecepatan Angin' : 'Layer: Iradiasi Surya'}
                <button onClick={() => setActiveLayer('none')} className="ml-1 opacity-70 hover:opacity-100">
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-1000 bg-white/90 dark:bg-[#111a22]/95 backdrop-blur-sm p-3.5 rounded-xl shadow-xl border border-slate-200 dark:border-[#233648]">
            {activeLayer !== 'none' && (
              <div className="mb-3">
                <h4 className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1.5">
                  {activeLayer === 'wind' ? 'Kecepatan Angin' : 'Iradiasi Surya'}
                </h4>
                <div className="w-36 h-2 rounded-full" style={{
                  background: activeLayer === 'wind'
                    ? 'linear-gradient(to right, #2563eb, #22c55e, #eab308, #f97316, #ef4444)'
                    : 'linear-gradient(to right, #fde68a, #f59e0b, #f97316, #dc2626)'
                }} />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>Rendah</span><span>Tinggi</span>
                </div>
              </div>
            )}
            {showMCDA && (
              <div className="mb-3">
                <h4 className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1.5">Zona GIS-MCDA</h4>
                <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-text-secondary">
                  <span className="inline-flex items-center justify-center w-5 h-5 shrink-0">
                    <span className="block w-4 h-4 rounded-full border-2 border-green-500/70 bg-green-500/10" />
                  </span>
                  <span>Besar = skor lebih tinggi</span>
                </div>
              </div>
            )}
            <h4 className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">Status Stasiun</h4>
            {[
              { color: 'bg-green-500', label: 'Prioritas' },
              { color: 'bg-amber-400', label: 'Kandidat' },
              { color: 'bg-slate-500', label: 'Tidak Sesuai' },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-text-secondary mb-1 last:mb-0">
                <span className={`w-3 h-3 ${s.color} rounded-full shrink-0`} />
                {s.label}
              </div>
            ))}
          </div>

          {/* Station detail panel — hidden when Analisis modal is open so ESC only closes the top layer */}
          {selectedStation && !showAnalisis && (
            <StationPanel station={selectedStation} onClose={() => setSelectedStation(null)} />
          )}
        </div>
      </main>

      {showAnalisis && <AnalisisModal onClose={() => setShowAnalisis(false)} stations={stations} />}
    </div>
  );
}

