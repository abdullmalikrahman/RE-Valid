'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useStations } from '@/hooks/useStations';

const statusLabel: Record<string, string> = {
  prioritas: 'Prioritas',
  kandidat: 'Kandidat',
  tidak_sesuai: 'Tidak Sesuai',
};

const statusBg: Record<string, string> = {
  prioritas: 'bg-green-500/10 border-green-500/30 text-green-400',
  kandidat: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  tidak_sesuai: 'bg-slate-500/10 border-slate-500/30 text-slate-400',
};

const mcpLabel: Record<string, string> = {
  selesai: 'Selesai',
  berjalan: 'Berjalan',
  pending: 'Pending',
};

const mcpBadge: Record<string, string> = {
  selesai: 'bg-primary/10 border-primary/30 text-primary',
  berjalan: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  pending: 'bg-slate-500/10 border-slate-500/30 text-slate-400',
};

function LaporanContent() {
  const { stations } = useStations();
  const searchParams = useSearchParams();
  const router = useRouter();
  const stationId = searchParams.get('station') ?? stations[0].id;
  const station = stations.find((s) => s.id === stationId) ?? stations[0];

  const mcdaFactors = [
    { label: 'Potensi EBT', pct: Math.min(100, station.score + 5) },
    { label: 'Topografi', pct: station.altitude > 500 ? 80 : 55 },
    { label: 'Aksesibilitas', pct: station.altitude > 1000 ? 55 : 75 },
    { label: 'Infrastruktur', pct: Math.max(30, station.score - 15) },
  ];

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex flex-col text-sm">
      <Navbar />

      <main className="flex-1 flex flex-col w-full max-w-360 mx-auto px-4 lg:px-8 py-4">
        {/* Header */}
        <div className="flex flex-col gap-3 mb-5 pt-2">
          <div className="flex flex-wrap justify-between items-end gap-3">
            <div className="flex flex-col gap-1.5 max-w-2xl">
              <Link
                href="/peta"
                className="flex items-center gap-1 text-xs font-semibold text-primary mb-0.5 hover:underline"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                Kembali ke Peta
              </Link>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-black leading-tight tracking-tight text-slate-900 dark:text-white">
                  Laporan Lengkap
                </h1>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusBg[station.status]}`}>
                  {statusLabel[station.status]}
                </span>
              </div>
              <p className="text-slate-600 dark:text-text-secondary text-sm font-normal leading-relaxed">
                {station.name} &middot; {station.region} &middot; Skor {station.score}/100
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: filter panel */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark overflow-hidden shadow-sm">
              <div className="p-5 border-b border-gray-200 dark:border-border-dark flex items-center gap-3">
                <div className="size-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[18px]">tune</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Filter Laporan</h3>
              </div>
              <div className="p-5 flex flex-col gap-5">
                {/* Station selector */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-text-secondary uppercase tracking-wide">
                    Stasiun
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 material-symbols-outlined text-[18px]">
                      location_on
                    </span>
                    <select
                      value={station.id}
                      onChange={(e) => router.push(`/laporan?station=${e.target.value}`)}
                      className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg py-2 pl-9 pr-8 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all appearance-none"
                    >
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.id})
                        </option>
                      ))}
                    </select>
                    <span className="absolute right-3 top-2.5 text-slate-400 material-symbols-outlined text-[18px] pointer-events-none">
                      expand_more
                    </span>
                  </div>
                </div>

                {/* Date range */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-text-secondary uppercase tracking-wide">
                    Rentang Tanggal
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 min-w-0 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                      type="date"
                      defaultValue="2023-01-01"
                    />
                    <span className="text-slate-500 text-xs shrink-0">&ndash;</span>
                    <input
                      className="flex-1 min-w-0 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                      type="date"
                      defaultValue="2023-12-31"
                    />
                  </div>
                </div>

                {/* Sections */}
                <div className="flex flex-col gap-3">
                  <label className="text-xs font-bold text-slate-700 dark:text-text-secondary uppercase tracking-wide">
                    Sertakan Bagian
                  </label>
                  <div className="flex flex-col gap-2">
                    {[
                      { label: 'Ringkasan Eksekutif', checked: true },
                      { label: 'Grafik Analisis Potensi', checked: true },
                      { label: 'Log Validasi Data Mentah', checked: false },
                    ].map((item) => (
                      <label key={item.label} className="flex items-center gap-3 cursor-pointer group">
                        <input
                          defaultChecked={item.checked}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 accent-primary"
                          type="checkbox"
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-300 group-hover:text-primary transition-colors">
                          {item.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <button className="w-full mt-2 bg-slate-800 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-gray-200 font-bold py-2.5 px-4 rounded-lg transition-colors flex justify-center items-center gap-2 text-sm">
                  <span className="material-symbols-outlined text-[18px]">refresh</span>
                  Terapkan Filter
                </button>
              </div>
            </div>

            {/* System notice */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-5 border border-blue-100 dark:border-blue-800/30">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary text-[24px]">info</span>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Catatan Sistem</h4>
                  <p className="text-xs text-slate-600 dark:text-blue-100/70 leading-relaxed">
                    Referensi MCP: ERA5 (ECMWF). Atlas baseline: GWA/GSA. Data observasi lapangan
                    digunakan sebagai acuan validasi. Periode: {station.period}.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: report content */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Station identity */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        station.status === 'prioritas'
                          ? 'bg-green-500 animate-pulse'
                          : station.status === 'kandidat'
                          ? 'bg-amber-400'
                          : 'bg-slate-400'
                      }`}
                    />
                    <span className="text-xs font-mono text-slate-400">{station.id}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusBg[station.status]}`}>
                      {statusLabel[station.status]}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{station.name}</h2>
                  <p className="text-sm text-slate-500 dark:text-text-secondary">{station.region}</p>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${mcpBadge[station.mcpStatus]} shrink-0`}>
                  MCP: {mcpLabel[station.mcpStatus]}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                  { label: 'Koordinat', value: `${station.lat.toFixed(4)}, ${station.lon.toFixed(4)}` },
                  { label: 'Ketinggian', value: `${station.altitude.toLocaleString('id')} m dpl` },
                  { label: 'Periode', value: station.period },
                  { label: 'Variabel', value: station.variables },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="bg-slate-50 dark:bg-[#111a22] rounded-lg p-3 border border-slate-100 dark:border-[#233648]"
                  >
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{item.label}</p>
                    <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Validation metrics */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-violet-400 text-[20px]">query_stats</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Metrik Validasi</h4>
                <span className="ml-auto text-[11px] text-slate-400">Angin — ERA5 vs Observasi Lapangan</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'RMSE', value: station.rmse.toFixed(2), unit: 'm/s', color: 'text-blue-400' },
                  {
                    label: 'Bias',
                    value: `${station.bias > 0 ? '+' : ''}${station.bias.toFixed(1)}`,
                    unit: '%',
                    color: station.bias > 0 ? 'text-amber-400' : 'text-green-400',
                  },
                  { label: 'R²', value: station.r2.toFixed(2), unit: '', color: 'text-primary' },
                  {
                    label: 'Skor',
                    value: `${station.score}`,
                    unit: '/100',
                    color: station.score >= 80 ? 'text-green-400' : 'text-amber-400',
                  },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="bg-slate-50 dark:bg-[#111a22] rounded-xl p-4 border border-slate-100 dark:border-[#233648] text-center"
                  >
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{m.label}</p>
                    <p className={`text-2xl font-black ${m.color}`}>
                      {m.value}
                      <span className="text-[13px] font-medium text-slate-400 ml-0.5">{m.unit}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Solar validation metrics */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-amber-400 text-[20px]">wb_sunny</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Validasi Surya (GHI)</h4>
                <span className="ml-auto text-[11px] text-slate-400">GSA vs Observasi Lapangan</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-[#111a22] rounded-xl p-4 border border-slate-100 dark:border-[#233648] text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">GHI Observasi</p>
                  <p className="text-2xl font-black text-amber-400">
                    {station.irradiation.toFixed(1)}
                    <span className="text-[12px] font-medium text-slate-400 ml-0.5">kWh/m²/hr</span>
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-[#111a22] rounded-xl p-4 border border-slate-100 dark:border-[#233648] text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">GHI Baseline (GSA)</p>
                  <p className="text-2xl font-black text-slate-400 dark:text-slate-300">
                    {(station.irradiation * 0.958).toFixed(1)}
                    <span className="text-[12px] font-medium text-slate-400 ml-0.5">kWh/m²/hr</span>
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-[#111a22] rounded-xl p-4 border border-slate-100 dark:border-[#233648] text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Clearness Index (Kt)</p>
                  <p className={`text-2xl font-black ${
                    station.irradiation / 8.5 >= 0.40 && station.irradiation / 8.5 <= 0.65
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}>
                    {(station.irradiation / 8.5).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Rentang: 0.40–0.65</p>
                </div>
                <div className="bg-slate-50 dark:bg-[#111a22] rounded-xl p-4 border border-slate-100 dark:border-[#233648] text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Bias vs GSA</p>
                  <p className={`text-2xl font-black ${
                    Math.abs(station.bias * 0.8) <= 10 ? 'text-green-400' : 'text-amber-400'
                  }`}>
                    {station.bias * 0.8 > 0 ? '+' : ''}{(station.bias * 0.8).toFixed(1)}
                    <span className="text-[13px] font-medium text-slate-400 ml-0.5">%</span>
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300">IEC 61853</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border bg-amber-500/10 border-amber-500/30 text-amber-400">SOLARGIS / GSA</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  station.irradiation / 8.5 >= 0.40 && station.irradiation / 8.5 <= 0.65
                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}>
                  {'Kt = '}{(station.irradiation / 8.5).toFixed(2)}{station.irradiation / 8.5 >= 0.40 && station.irradiation / 8.5 <= 0.65 ? ' ✓ Valid' : ' ⚠ Di luar rentang'}
                </span>
              </div>
            </div>

            {/* Energy potential */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-yellow-400 text-[20px]">bolt</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Potensi Energi</h4>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-xl p-4 text-center">
                  <span className="material-symbols-outlined text-blue-400 text-[24px] mb-1 block">air</span>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Kec. Angin Rata-rata</p>
                  <p className="text-2xl font-black text-blue-400">
                    {station.windSpeed}
                    <span className="text-sm font-medium text-slate-400 ml-1">m/s</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1.5">Sumber: GWA 3.0</p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-800/30 rounded-xl p-4 text-center">
                  <span className="material-symbols-outlined text-yellow-400 text-[24px] mb-1 block">wb_sunny</span>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Iradiasi Matahari (GHI)</p>
                  <p className="text-2xl font-black text-yellow-400">
                    {station.irradiation}
                    <span className="text-sm font-medium text-slate-400 ml-1">kWh/m²/hari</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1.5">Sumber: GSA / SOLARGIS</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800/30 rounded-xl p-4 text-center">
                  <span className="material-symbols-outlined text-green-400 text-[24px] mb-1 block">electric_bolt</span>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">AEP PLTB (P50)</p>
                  <p className="text-2xl font-black text-green-400">
                    {station.aep.toLocaleString('id')}
                    <span className="text-sm font-medium text-slate-400 ml-1">MWh/thn</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1.5">Estimasi ERA5 / MCP</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 rounded-xl p-4 text-center">
                  <span className="material-symbols-outlined text-amber-400 text-[24px] mb-1 block">solar_power</span>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Hasil Spesifik PLTS</p>
                  <p className="text-2xl font-black text-amber-400">
                    {Math.round(station.irradiation * 365 * 0.75).toLocaleString('id')}
                    <span className="text-sm font-medium text-slate-400 ml-1">kWh/kWp·thn</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1.5">PR = 75% (asumsi)</p>
                </div>
              </div>
            </div>

            {/* GIS-MCDA */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-emerald-400 text-[20px]">layers</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Faktor Kesesuaian GIS-MCDA</h4>
                <span className="ml-auto font-bold text-base text-slate-900 dark:text-white">
                  {station.score}/100
                </span>
              </div>
              <div className="space-y-3">
                {mcdaFactors.map((f) => (
                  <div key={f.label}>
                    <div className="flex justify-between text-xs text-slate-500 dark:text-text-secondary mb-1">
                      <span className="font-medium">{f.label}</span>
                      <span
                        className={`font-bold ${
                          f.pct >= 75 ? 'text-green-400' : f.pct >= 55 ? 'text-amber-400' : 'text-red-400'
                        }`}
                      >
                        {f.pct}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-[#233648]">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          f.pct >= 75 ? 'bg-green-500' : f.pct >= 55 ? 'bg-amber-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${f.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Download */}
            <h3 className="text-lg font-bold text-slate-900 dark:text-white -mb-2">Unduh Laporan</h3>
            <div className="grid grid-cols-1 gap-4">
              {[
                {
                  icon: 'picture_as_pdf',
                  iconColor: 'text-red-500',
                  bgColor: 'bg-red-50 dark:bg-red-900/20',
                  title: 'Laporan Presentasi (PDF)',
                  size: '2.4 MB',
                  desc: 'Dokumen siap cetak berisi ringkasan eksekutif, peta potensi, grafik validasi, dan rekomendasi strategis. Cocok untuk presentasi ke pemangku kepentingan.',
                  btnClass: 'bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20',
                  hoverBorder: 'hover:border-primary/50',
                },
                {
                  icon: 'table_view',
                  iconColor: 'text-green-600',
                  bgColor: 'bg-green-50 dark:bg-green-900/20',
                  title: 'Data Analisis (CSV/Excel)',
                  size: '850 KB',
                  desc: 'Dataset lengkap deret waktu hasil validasi dan perhitungan MCP. Format terstruktur untuk analisis lanjutan di spreadsheet atau Python.',
                  btnClass:
                    'bg-white dark:bg-transparent border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800',
                  hoverBorder: 'hover:border-green-500/50',
                },
                {
                  icon: 'map',
                  iconColor: 'text-purple-500',
                  bgColor: 'bg-purple-50 dark:bg-purple-900/20',
                  title: 'Data Geospasial (GeoJSON)',
                  size: '1.2 MB',
                  desc: 'Fitur geografis: titik stasiun, poligon wilayah potensi, dan hasil GIS-MCDA. Siap untuk QGIS, ArcGIS, atau aplikasi peta web.',
                  btnClass:
                    'bg-white dark:bg-transparent border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800',
                  hoverBorder: 'hover:border-purple-500/50',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className={`group bg-white dark:bg-card-dark rounded-xl p-6 border border-gray-200 dark:border-border-dark ${item.hoverBorder} transition-all shadow-sm hover:shadow-md flex flex-col sm:flex-row items-start sm:items-center gap-5`}
                >
                  <div
                    className={`size-14 rounded-xl ${item.bgColor} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
                  >
                    <span className={`material-symbols-outlined ${item.iconColor} text-[32px]`}>{item.icon}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-base font-bold text-slate-900 dark:text-white">{item.title}</h4>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
                        {item.size}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-text-secondary leading-relaxed">{item.desc}</p>
                  </div>
                  <button
                    className={`shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold transition-all text-sm w-full sm:w-auto justify-center ${item.btnClass}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">download</span>
                    Unduh
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function LaporanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
          <span className="material-symbols-outlined text-primary animate-spin text-[40px]">
            progress_activity
          </span>
        </div>
      }
    >
      <LaporanContent />
    </Suspense>
  );
}
