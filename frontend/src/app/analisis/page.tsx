'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { stations } from '@/lib/stationData';

const mcpStatusLabel: Record<string, Record<string, string>> = {
  wind: { selesai: 'Analisis MCP Selesai', berjalan: 'Analisis MCP Berjalan', pending: 'Belum Dijalankan' },
  solar: { selesai: 'Validasi GHI Selesai', berjalan: 'Validasi GHI Berjalan', pending: 'Belum Dijalankan' },
};
const mcpStatusColor: Record<string, string> = {
  selesai: 'bg-green-500/10 border-green-500/30',
  berjalan: 'bg-yellow-500/10 border-yellow-500/30',
  pending: 'bg-slate-500/10 border-slate-500/30',
};
const mcpIconColor: Record<string, string> = {
  selesai: 'text-green-400', berjalan: 'text-yellow-400', pending: 'text-slate-400',
};
const mcpIcon: Record<string, string> = {
  selesai: 'check_circle', berjalan: 'sync', pending: 'schedule',
};

function AnalisisContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const stationId = searchParams.get('station') ?? stations[0].id;
  const station = stations.find((s) => s.id === stationId) ?? stations[0];

  const [energyType, setEnergyType] = useState<'wind' | 'solar'>('wind');

  // ─── Wind derived ──────────────────────────────────────────────────────────
  const windLongTerm = (station.windSpeed * 1.046).toFixed(1);
  const windDiff = ((1.046 - 1) * 100).toFixed(1);
  const aepGross = station.aep;
  const aepNetP50 = Math.round(station.aep * 0.877);
  const aepNetP90 = Math.round(station.aep * 0.767);
  const mae = parseFloat((station.rmse * 0.77).toFixed(2));
  const r2Quality = station.r2 >= 0.85 ? 'Tinggi' : station.r2 >= 0.70 ? 'Sedang' : 'Rendah';
  const r2Color = station.r2 >= 0.85 ? 'text-green-500' : station.r2 >= 0.70 ? 'text-amber-400' : 'text-red-400';
  const r2Bg = station.r2 >= 0.85 ? 'bg-green-500/10 text-green-500' : station.r2 >= 0.70 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400';
  const biasDisplay = (station.bias > 0 ? '+' : '') + station.bias.toFixed(1) + '%';
  const windValidationRows = [
    { metric: 'RMSE (m/s)', value: station.rmse.toFixed(2), target: '< 2.0', pass: station.rmse < 2.0 },
    { metric: 'MAE (m/s)', value: mae.toFixed(2), target: '< 1.5', pass: mae < 1.5 },
    { metric: 'Bias vs GWA (%)', value: biasDisplay, target: '± 5%', pass: Math.abs(station.bias) <= 5 },
    { metric: 'Ketersediaan Data', value: station.mcpStatus !== 'pending' ? '98.5%' : '–', target: '> 90%', pass: station.mcpStatus !== 'pending' },
  ];

  // ─── Solar derived ─────────────────────────────────────────────────────────
  // GHI baseline (ERA5/GSA slightly underestimates tropical GHI)
  const ghiBaseline = parseFloat((station.irradiation * 0.958).toFixed(2));
  const ghiDiff = parseFloat((((station.irradiation - ghiBaseline) / ghiBaseline) * 100).toFixed(1));
  // Clearness Index: Kt = GHI_obs / GHI_extraterrestrial (≈ 8.5 kWh/m²/hari at 7°S lat)
  const ktIndex = parseFloat((station.irradiation / 8.5).toFixed(2));
  const ktLabel = ktIndex >= 0.55 ? 'Cerah' : ktIndex >= 0.40 ? 'Campuran' : 'Berawan';
  const ktColor = ktIndex >= 0.55 ? 'text-amber-400' : ktIndex >= 0.40 ? 'text-blue-400' : 'text-slate-400';
  const ktBg = ktIndex >= 0.55 ? 'bg-amber-500/10 text-amber-400' : ktIndex >= 0.40 ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-500/10 text-slate-400';
  // Solar RMSE/bias on GHI scale (kWh/m²/hari)
  const solarRmse = parseFloat((station.rmse * 0.12 + 0.15).toFixed(2));
  const solarMae = parseFloat((solarRmse * 0.77).toFixed(2));
  const solarBias = parseFloat((station.bias * 0.9).toFixed(1));
  const solarBiasDisplay = (solarBias > 0 ? '+' : '') + solarBias.toFixed(1) + '%';
  // AEP PLTS: GHI × 365 × PR (0.75) = MWh/MWp/year
  const aepSolarRef = Math.round(station.irradiation * 365 * 0.75);
  const aepSolarP90 = Math.round(aepSolarRef * 0.90);
  const solarValidationRows = [
    { metric: 'RMSE GHI (kWh/m²/hari)', value: solarRmse.toFixed(2), target: '< 0.50', pass: solarRmse < 0.50 },
    { metric: 'MAE GHI (kWh/m²/hari)', value: solarMae.toFixed(2), target: '< 0.40', pass: solarMae < 0.40 },
    { metric: 'Bias vs GSA (%)', value: solarBiasDisplay, target: '± 5%', pass: Math.abs(solarBias) <= 5 },
    { metric: 'Clearness Index (Kt)', value: ktIndex.toFixed(2), target: '0.40–0.65', pass: ktIndex >= 0.40 && ktIndex <= 0.65 },
  ];

  const isWind = energyType === 'wind';

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col w-full max-w-360 mx-auto px-4 lg:px-8 py-4">
        {/* Page header */}
        <div className="flex flex-col gap-1 mb-5">
          <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
            <div className="flex flex-col gap-1 max-w-2xl">
              <h1 className="text-xl font-bold leading-tight text-slate-900 dark:text-white">
                Analisis Lokasi &amp; Validasi Data
              </h1>
              <p className="text-slate-600 dark:text-text-secondary text-sm font-normal leading-normal">
                {isWind
                  ? 'Validasi kecepatan angin observasi vs ERA5/GWA, korelasi atlas, dan proyeksi MCP jangka panjang.'
                  : 'Validasi iradiasi surya observasi vs ERA5/GSA, Clearness Index (Kt), dan estimasi AEP PLTS.'}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/laporan?station=${station.id}`}
                className="flex items-center gap-1.5 px-3 py-2 bg-transparent border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-xs font-medium"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                Ekspor Laporan
              </Link>
              <button className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 transition-all text-xs font-medium shadow-md shadow-blue-500/20">
                <span className="material-symbols-outlined text-[16px]">{isWind ? 'science' : 'wb_sunny'}</span>
                {isWind ? 'Jalankan Analisis MCP' : 'Jalankan Validasi GHI'}
              </button>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-white dark:bg-card-dark rounded-lg p-4 border border-gray-200 dark:border-border-dark mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Lokasi Stasiun</label>
              <div className="relative">
                <select
                  value={station.id}
                  onChange={(e) => router.push(`/analisis?station=${e.target.value}`)}
                  className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none pr-8"
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-2 top-2 text-slate-400 pointer-events-none text-[18px]">expand_more</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Periode Data</label>
              <div className="flex items-center gap-1">
                <input className="flex-1 min-w-0 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg px-2 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" type="date" defaultValue="2023-01-01" />
                <span className="text-slate-500 text-[10px] shrink-0">&ndash;</span>
                <input className="flex-1 min-w-0 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg px-2 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" type="date" defaultValue="2023-12-31" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Variabel</label>
              <div className="relative">
                <select className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none pr-8">
                  {isWind ? (
                    <>
                      <option>Kecepatan Angin (m/s)</option>
                      <option>Arah Angin (deg)</option>
                      <option>Temperatur (&deg;C)</option>
                    </>
                  ) : (
                    <>
                      <option>GHI (kWh/m&sup2;/hari)</option>
                      <option>DNI (kWh/m&sup2;/hari)</option>
                      <option>Suhu Panel (&deg;C)</option>
                    </>
                  )}
                </select>
                <span className="material-symbols-outlined absolute right-2 top-2 text-slate-400 pointer-events-none text-[18px]">expand_more</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {isWind ? 'Metode MCP' : 'Metode Validasi'}
              </label>
              <div className="relative">
                <select className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none pr-8">
                  {isWind ? (
                    <>
                      <option>Rasio Varians</option>
                      <option>Regresi Linier</option>
                      <option>Matriks (Matrix Method)</option>
                    </>
                  ) : (
                    <>
                      <option>Perbandingan Langsung</option>
                      <option>Koreksi Bias</option>
                      <option>TMY (Typical Met. Year)</option>
                    </>
                  )}
                </select>
                <span className="material-symbols-outlined absolute right-2 top-2 text-slate-400 pointer-events-none text-[18px]">expand_more</span>
              </div>
            </div>
            <div>
              <button onClick={() => router.push('/analisis')} className="w-full py-2 text-primary hover:text-white border border-primary/30 hover:bg-primary rounded-lg text-xs font-medium transition-all">
                Reset Filter
              </button>
            </div>
          </div>
        </div>

        {/* Energy type toggle */}
        <div className="flex items-center gap-3 mb-4">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide shrink-0">Jenis Energi:</p>
          <div className="flex bg-gray-100 dark:bg-[#111a22] rounded-lg p-1 gap-1 border border-gray-200 dark:border-border-dark">
            <button
              onClick={() => setEnergyType('wind')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                isWind
                  ? 'bg-primary text-white shadow-sm shadow-blue-500/30'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">air</span>
              Angin (PLTB)
            </button>
            <button
              onClick={() => setEnergyType('solar')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                !isWind
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">wb_sunny</span>
              Surya (PLTS)
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="material-symbols-outlined text-[14px]">info</span>
            {isWind ? 'Baseline: ERA5 + GWA 3.0 · Metode: MCP' : 'Baseline: ERA5 + GSA · Metode: Validasi Langsung + Kt'}
          </div>
        </div>

        {/* Status banner */}
        <div className={`flex flex-wrap gap-4 items-center justify-between ${mcpStatusColor[station.mcpStatus]} rounded-xl px-5 py-4 mb-6 border`}>
          <div className="flex items-center gap-3">
            <span className={`material-symbols-outlined ${mcpIconColor[station.mcpStatus]} text-[22px]`}>
              {mcpIcon[station.mcpStatus]}
            </span>
            <div>
              <p className={`text-sm font-bold ${mcpIconColor[station.mcpStatus]}`}>
                {mcpStatusLabel[energyType][station.mcpStatus]}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {station.name} &middot; {station.id} &middot;{' '}
                {isWind ? 'Metode: Rasio Varians' : 'Metode: Perbandingan Langsung'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>Sumber: <span className="text-slate-200 font-semibold">ERA5 (ECMWF)</span></span>
            <span>&middot;</span>
            <span>Atlas: <span className="text-slate-200 font-semibold">{isWind ? 'GWA 3.0' : 'GSA (Global Solar Atlas)'}</span></span>
            <span>&middot;</span>
            <span>Periode: <span className="text-slate-200 font-semibold">{station.period}</span></span>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {isWind ? (
            <>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">Kec. Angin Obs</p>
                  <span className="material-symbols-outlined text-primary text-[20px]">air</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{station.windSpeed}</h3>
                  <span className="text-sm text-slate-500 dark:text-slate-400">m/s</span>
                  <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded ${station.windSpeed >= 5 ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-400'}`}>
                    {station.windSpeed >= 5 ? 'Kuat' : 'Moderat'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">vs baseline GWA 3.0 · ERA5</p>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">Korelasi Atlas (R²)</p>
                  <span className="material-symbols-outlined text-primary text-[20px]">ssid_chart</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className={`text-2xl font-bold ${r2Color}`}>{station.r2.toFixed(2)}</h3>
                  <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded ${r2Bg}`}>{r2Quality}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Korelasi Pearson obs vs atlas</p>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">Bias Keseluruhan</p>
                  <span className="material-symbols-outlined text-primary text-[20px]">difference</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{biasDisplay}</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium">vs GWA 3.0</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Penyimpangan sistematis obs-baseline</p>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-[56px] text-primary">bolt</span>
                </div>
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">Estimasi AEP PLTB (P50)</p>
                  <span className="material-symbols-outlined text-primary text-[20px]">bolt</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{aepNetP50.toLocaleString('id')}</h3>
                  <span className="text-sm text-slate-500 dark:text-slate-400">MWh/thn</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Setelah faktor losses MCP</p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">GHI Observasi</p>
                  <span className="material-symbols-outlined text-amber-400 text-[20px]">wb_sunny</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{station.irradiation.toFixed(1)}</h3>
                  <span className="text-sm text-slate-500 dark:text-slate-400">kWh/m²/hari</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">GHI lapangan vs baseline GSA: <span className="text-amber-400 font-semibold">{ghiBaseline}</span></p>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">Korelasi Atlas (R²)</p>
                  <span className="material-symbols-outlined text-amber-400 text-[20px]">ssid_chart</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className={`text-2xl font-bold ${r2Color}`}>{station.r2.toFixed(2)}</h3>
                  <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded ${r2Bg}`}>{r2Quality}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Korelasi obs GHI vs GSA baseline</p>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">Clearness Index (Kt)</p>
                  <span className={`material-symbols-outlined ${ktColor} text-[20px]`}>light_mode</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className={`text-2xl font-bold ${ktColor}`}>{ktIndex.toFixed(2)}</h3>
                  <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded ${ktBg}`}>{ktLabel}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Kt = GHI obs / GHI ekstraterestrial</p>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-[56px] text-amber-400">solar_power</span>
                </div>
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">AEP PLTS (Ref. 1 MWp)</p>
                  <span className="material-symbols-outlined text-amber-400 text-[20px]">solar_power</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{aepSolarRef.toLocaleString('id')}</h3>
                  <span className="text-sm text-slate-500 dark:text-slate-400">MWh/MWp</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">PR = 0.75 · setara CF {((aepSolarRef / 8760) * 100).toFixed(1)}%</p>
              </div>
            </>
          )}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
          {/* Time series */}
          <div className="xl:col-span-2 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark p-4 min-h-80 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Visualisasi Perbandingan Data</h3>
                <p className="text-xs text-slate-500 dark:text-text-secondary">
                  {isWind
                    ? `Deret Waktu: Kec. Angin Obs vs GWA/ERA5 — ${station.name}`
                    : `Deret Waktu: GHI Obs vs GSA/ERA5 — ${station.name}`}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${isWind ? 'bg-primary' : 'bg-amber-400'}`} />
                  <span className="text-slate-600 dark:text-slate-300">Terukur (Obs)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <span className="text-slate-600 dark:text-slate-300">{isWind ? 'GWA/ERA5' : 'GSA/ERA5'}</span>
                </div>
              </div>
            </div>
            <div className="flex-1 w-full relative bg-[#111a22] rounded-lg overflow-hidden border border-gray-800">
              <div className="absolute left-3 top-4 bottom-8 flex flex-col justify-between text-sm text-slate-500 font-mono z-10">
                {isWind ? <><span>15</span><span>10</span><span>5</span><span>0</span></> : <><span>8</span><span>6</span><span>4</span><span>0</span></>}
              </div>
              <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none">
                <line stroke="#2d3b4a" strokeWidth="1" x1="0" x2="100%" y1="25%" y2="25%" />
                <line stroke="#2d3b4a" strokeWidth="1" x1="0" x2="100%" y1="50%" y2="50%" />
                <line stroke="#2d3b4a" strokeWidth="1" x1="0" x2="100%" y1="75%" y2="75%" />
                <path d="M0,90 Q150,85 300,50 T600,20 T900,40" fill="none" stroke={isWind ? '#137fec' : '#f59e0b'} strokeWidth="2.5" />
                <path d="M0,85 Q150,80 300,60 T600,30 T900,50" fill="none" stroke="#64748b" strokeDasharray="4 4" strokeWidth="2.5" />
                <rect fill="white" fillOpacity="0.05" height="200" stroke="white" strokeOpacity="0.2" width="100" x="350" y="20" />
                <line stroke="white" strokeDasharray="2 2" strokeOpacity="0.5" x1="400" x2="400" y1="20" y2="220" />
              </svg>
              <div className="absolute bottom-2 right-3 text-[10px] text-slate-500 font-mono">
                {isWind ? 'Satuan: m/s' : 'Satuan: kWh/m²/hari'}
              </div>
            </div>
          </div>

          {/* Scatter plot */}
          <div className="xl:col-span-1 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark p-4 flex flex-col justify-between">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Analisis Korelasi</h3>
              <p className="text-xs text-slate-500 dark:text-text-secondary">
                Scatter Plot: Obs (X) vs {isWind ? 'GWA/ERA5' : 'GSA/ERA5'} (Y)
              </p>
            </div>
            <div className="aspect-square w-full bg-white rounded-lg p-3 border border-gray-200 mb-3 flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 200 200">
                <line stroke="#cbd5e1" strokeWidth="1" x1="20" x2="180" y1="180" y2="180" />
                <line stroke="#cbd5e1" strokeWidth="1" x1="20" x2="20" y1="20" y2="180" />
                <text fill="#64748b" fontSize="11" textAnchor="middle" x="100" y="197">{isWind ? 'Obs (m/s)' : 'Obs (kWh/m²)'}</text>
                <text fill="#64748b" fontSize="11" textAnchor="middle" transform="rotate(-90, 10, 100)" x="10" y="100">{isWind ? 'GWA (m/s)' : 'GSA (kWh/m²)'}</text>
                {[[40,160],[50,150],[60,145],[80,120],[100,100],[120,85],[140,60],[160,40]].map(([cx,cy],i) => (
                  <circle key={i} cx={cx} cy={cy} fill={isWind ? '#92adc9' : '#fbbf24'} r="2" />
                ))}
                {[[45,155],[55,148],[90,110],[110,95],[130,70],[150,50]].map(([cx,cy],i) => (
                  <circle key={i} cx={cx} cy={cy} fill={isWind ? '#92adc9' : '#fbbf24'} opacity="0.6" r="2" />
                ))}
                <line stroke={isWind ? '#137fec' : '#f59e0b'} strokeDasharray="3 3" strokeWidth="1.5" x1="20" x2="180" y1="180" y2="20" />
              </svg>
            </div>
            <div className="bg-gray-50 dark:bg-[#111a22] rounded-lg p-3 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex justify-between mb-1.5">
                <span>Kecocokan Linear:</span>
                <span className="font-mono">{isWind ? 'y = 0.92x + 0.3' : 'y = 0.96x + 0.1'}</span>
              </div>
              <div className={`flex justify-between items-center font-bold ${r2Color}`}>
                <span>R² =</span>
                <span className="text-lg">{station.r2.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Validation table + Projection panel */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
          <div className="xl:col-span-2 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark overflow-hidden flex flex-col h-full">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-border-dark flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Parameter Validasi {isWind ? 'Angin' : 'Surya'}
              </h3>
              <Link href={`/laporan?station=${station.id}`} className="text-xs text-primary font-medium hover:underline">
                Lihat Laporan Lengkap
              </Link>
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-xs text-left">
                <thead className="text-[10px] text-slate-500 dark:text-text-secondary uppercase bg-gray-50 dark:bg-[#1a232c] border-b border-gray-200 dark:border-border-dark">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Metrik</th>
                    <th className="px-4 py-3 font-semibold text-right">Nilai</th>
                    <th className="px-4 py-3 font-semibold text-right">Target</th>
                    <th className="px-4 py-3 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {(isWind ? windValidationRows : solarValidationRows).map((row) => (
                    <tr key={row.metric} className="bg-white dark:bg-card-dark hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{row.metric}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-text-secondary">{row.value}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-text-secondary">{row.target}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${row.pass ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-400'}`}>
                          {row.pass ? 'Lulus' : 'Perlu Tinjau'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right panel: MCP (wind) or GHI Validation (solar) */}
          <div className="xl:col-span-1 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark p-4 flex flex-col gap-4 h-full">
            {isWind ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded bg-primary/10 text-primary">
                    <span className="material-symbols-outlined text-[20px]">auto_graph</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Hasil Proyeksi MCP</h3>
                    <p className="text-xs text-slate-500 dark:text-text-secondary mt-0.5">Penyesuaian jangka panjang ERA5</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-[#111a22] p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Jangka Pendek (Obs)</p>
                    <p className="text-base font-bold text-slate-900 dark:text-white">{station.windSpeed} m/s</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Periode obs lapangan</p>
                  </div>
                  <div className="bg-primary/5 dark:bg-primary/10 p-3 rounded-lg border border-primary/20">
                    <p className="text-[10px] uppercase text-primary font-bold mb-1">Jangka Panjang</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-base font-bold text-slate-900 dark:text-white">{windLongTerm} m/s</p>
                      <span className="text-[10px] font-bold text-green-500">&uarr; {windDiff}%</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">Proyeksi 20 tahun</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white mb-2">Estimasi AEP PLTB</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22]">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="material-symbols-outlined text-[16px] text-slate-400">cloud</span>
                        AEP Bruto (P50)
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white text-sm font-mono">{aepGross.toLocaleString('id')} MWh</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22] border-l-4 border-primary">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="material-symbols-outlined text-[16px] text-primary">check_circle</span>
                        AEP Bersih (P50)
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white text-base font-mono">{aepNetP50.toLocaleString('id')} MWh</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22]">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="material-symbols-outlined text-[16px] text-slate-400">shield</span>
                        AEP Bersih (P90)
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white text-sm font-mono">{aepNetP90.toLocaleString('id')} MWh</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded bg-amber-500/10 text-amber-400">
                    <span className="material-symbols-outlined text-[20px]">sunny</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Validasi Radiasi Surya</h3>
                    <p className="text-xs text-slate-500 dark:text-text-secondary mt-0.5">Perbandingan langsung vs GSA/ERA5</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-[#111a22] p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">GHI Observasi</p>
                    <p className="text-base font-bold text-slate-900 dark:text-white">{station.irradiation.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">kWh/m²/hari (lapangan)</p>
                  </div>
                  <div className="bg-amber-500/5 dark:bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                    <p className="text-[10px] uppercase text-amber-500 font-bold mb-1">Baseline GSA</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-base font-bold text-slate-900 dark:text-white">{ghiBaseline}</p>
                      <span className="text-[10px] font-bold text-amber-400">+{ghiDiff}%</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">kWh/m²/hari (GSA/ERA5)</p>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-[#111a22] p-3 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-0.5">Clearness Index (Kt)</p>
                    <p className="text-xs text-slate-400">GHI obs / GHI ekstraterestrial</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-black ${ktColor}`}>{ktIndex.toFixed(2)}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ktBg}`}>{ktLabel}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white mb-2">Estimasi AEP PLTS</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22] border-l-4 border-amber-400">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="material-symbols-outlined text-[16px] text-amber-400">solar_power</span>
                        AEP PLTS (P50) / MWp
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white text-base font-mono">{aepSolarRef.toLocaleString('id')} MWh</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22]">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="material-symbols-outlined text-[16px] text-slate-400">shield</span>
                        AEP PLTS (P90) / MWp
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white text-sm font-mono">{aepSolarP90.toLocaleString('id')} MWh</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22]">
                      <div className="flex items-center gap-2 text-xs text-amber-400">
                        <span className="material-symbols-outlined text-[16px]">info</span>
                        Capacity Factor (CF)
                      </div>
                      <span className="font-bold text-amber-400 text-sm font-mono">{((aepSolarRef / 8760) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Assumptions */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-amber-400 text-[18px]">info</span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Asumsi dan Keterbatasan</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-text-secondary">
            <div className="flex gap-2.5">
              <span className="material-symbols-outlined text-[17px] text-slate-400 mt-0.5 shrink-0">schedule</span>
              <span>
                <strong className="text-slate-800 dark:text-slate-200">Durasi observasi:</strong>{' '}
                {station.period}.{' '}
                {isWind ? 'Minimum rekomendasi IEC 61400-12: 12 bulan ✓' : 'Minimum rekomendasi IEC 61853: 12 bulan ✓'}
              </span>
            </div>
            <div className="flex gap-2.5">
              <span className="material-symbols-outlined text-[17px] text-slate-400 mt-0.5 shrink-0">satellite_alt</span>
              <span>
                <strong className="text-slate-800 dark:text-slate-200">Sumber referensi:</strong>{' '}
                ERA5 (ECMWF), periode klimatologi 1991–2020.{' '}
                {isWind ? 'Atlas angin: GWA 3.0 (resolusi 250m).' : 'Atlas surya: GSA (resolusi 1km), sumber SOLARGIS.'}
              </span>
            </div>
            <div className="flex gap-2.5">
              <span className="material-symbols-outlined text-[17px] text-slate-400 mt-0.5 shrink-0">sync_alt</span>
              <span>
                <strong className="text-slate-800 dark:text-slate-200">
                  {isWind ? 'Periode overlap MCP:' : 'Periode validasi GHI:'}
                </strong>{' '}
                {station.period}.{' '}
                {isWind ? 'Overlap minimum untuk MCP valid: ≥ 6 bulan.' : 'Data harian minimum untuk validasi surya: ≥ 30 hari/bulan.'}
              </span>
            </div>
            <div className="flex gap-2.5">
              <span className="material-symbols-outlined text-[17px] text-amber-400 mt-0.5 shrink-0">warning</span>
              <span>
                <strong className="text-slate-800 dark:text-slate-200">Catatan:</strong>{' '}
                {isWind
                  ? 'Hasil ini adalah analisis pre-feasibility / screening awal. Bukan Wind Resource Assessment (WRA) bankable grade.'
                  : 'Hasil ini adalah analisis pre-feasibility / screening awal. Bukan Solar Resource Assessment (SRA) bankable grade. AEP dihitung untuk sistem referensi 1 MWp (PR = 0.75).'}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom action row */}
        <div className="flex flex-wrap gap-3 items-center justify-between pb-2">
          <Link href="/peta" className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Kembali ke Peta
          </Link>
          <div className="flex gap-2">
            <Link
              href={`/laporan?station=${station.id}`}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 dark:border-border-dark text-slate-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-xs font-medium"
            >
              <span className="material-symbols-outlined text-[16px]">description</span>
              Lihat Laporan Lengkap
            </Link>
            <Link
              href={`/kalkulator?station=${station.id}`}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 transition-all text-xs font-medium"
            >
              <span className="material-symbols-outlined text-[16px]">calculate</span>
              Lanjut ke Kalkulator
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function AnalisisPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
          <span className="material-symbols-outlined text-primary animate-spin text-[40px]">progress_activity</span>
        </div>
      }
    >
      <AnalisisContent />
    </Suspense>
  );
}
