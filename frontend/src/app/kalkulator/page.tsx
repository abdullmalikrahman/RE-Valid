'use client';

import { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const barData = [
  { label: 'Y1', rev: 80, cost: 30 },
  { label: 'Y3', rev: 78, cost: 32 },
  { label: 'Y5', rev: 76, cost: 35 },
  { label: 'Y7', rev: 75, cost: 38 },
  { label: 'Y9', rev: 72, cost: 40 },
  { label: 'Y11', rev: 70, cost: 42 },
];

const cashFlowRows = [
  { year: 1, energy: 78.84, revenue: 6.3, opex: 0.68, net: '+5.62' },
  { year: 2, energy: 78.44, revenue: 6.27, opex: 0.69, net: '+5.58' },
  { year: 3, energy: 78.05, revenue: 6.24, opex: 0.71, net: '+5.53' },
  { year: 4, energy: 77.66, revenue: 6.21, opex: 0.72, net: '+5.49' },
  { year: 5, energy: 77.27, revenue: 6.18, opex: 0.74, net: '+5.44' },
];

export default function KalkulatorPage() {
  const [kapasitas, setKapasitas] = useState(50);
  const [faktorKapasitas, setFaktorKapasitas] = useState(18);
  const [umurProyek, setUmurProyek] = useState(20);
  const [degradasi, setDegradasi] = useState(0.5);
  const [opex, setOpex] = useState(1.5);
  const [diskonto, setDiskonto] = useState(8.5);
  const [capex, setCapex] = useState(45.5);

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex flex-col text-sm">
      <Navbar />

      <main className="flex-1 flex flex-col w-full max-w-[1440px] mx-auto px-4 lg:px-8 py-4">
        {/* Page header */}
        <div className="flex flex-col gap-3 mb-4 pt-1">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="flex flex-col gap-1.5 max-w-2xl">
              <h1 className="text-xl font-black leading-tight tracking-tight text-slate-900 dark:text-white">
                Kalkulator Energi &amp; Ekonomi
              </h1>
              <p className="text-slate-600 dark:text-[#92adc9] text-sm font-normal leading-relaxed">
                Simulasi estimasi produksi energi tahunan dan indikator kelayakan ekonomi (LCOE,
                NPV, ROI) untuk proyek energi terbarukan.
              </p>
              {/* Screening disclaimer — expanded callout */}
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 mt-1">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-yellow-500 text-[18px] shrink-0 mt-0.5">warning</span>
                  <div>
                    <p className="text-xs font-bold text-yellow-600 dark:text-yellow-400 mb-1">
                      Simulasi Screening Awal
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-500/80 leading-relaxed">
                      Hasil kalkulasi ini hanya untuk keperluan pre-feasibility / screening awal.
                      Tidak menggantikan studi kelayakan finansial (financial feasibility study)
                      atau analisis detail dari konsultan EBT bersertifikat.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-card-dark text-slate-700 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-border-dark transition-all text-sm font-medium">
                <span className="material-symbols-outlined text-[18px]">file_upload</span>
                Muat Skenario
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-card-dark text-slate-700 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-border-dark transition-all text-sm font-medium">
                <span className="material-symbols-outlined text-[18px]">download</span>
                Ekspor PDF
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 lg:gap-8 flex-1">
          {/* Input sidebar */}
          <aside className="xl:col-span-4 flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Parameter Masukan
                </h3>
                <button className="text-xs font-medium text-primary hover:text-blue-400">
                  Reset Default
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {/* Technical parameters */}
                <details
                  className="group flex flex-col rounded-lg border border-gray-200 dark:border-border-dark bg-white dark:bg-card-dark overflow-hidden"
                  open
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 bg-gray-50 dark:bg-[#23303d] hover:bg-gray-100 dark:hover:bg-[#2a3a4a] transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">
                        solar_power
                      </span>
                      <p className="text-slate-900 dark:text-white text-sm font-semibold">
                        Parameter Teknis
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-slate-500 dark:text-white text-[18px] transition-transform group-open:rotate-180">
                      expand_more
                    </span>
                  </summary>
                  <div className="p-4 flex flex-col gap-5 border-t border-gray-200 dark:border-border-dark">
                    {/* Kapasitas Terpasang */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">
                          Kapasitas Terpasang
                        </label>
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          MW
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          className="flex-1"
                          max="100"
                          min="1"
                          type="range"
                          value={kapasitas}
                          onChange={(e) => setKapasitas(Number(e.target.value))}
                        />
                        <input
                          className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                          type="number"
                          value={kapasitas}
                          onChange={(e) => setKapasitas(Number(e.target.value))}
                        />
                      </div>
                    </div>
                    {/* Faktor Kapasitas */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">
                          Faktor Kapasitas
                        </label>
                        <div className="flex items-center gap-2">
                          <button className="text-[10px] text-primary hover:underline font-medium">
                            Muat dari Analisis
                          </button>
                          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            %
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          className="flex-1"
                          max="60"
                          min="10"
                          type="range"
                          value={faktorKapasitas}
                          onChange={(e) => setFaktorKapasitas(Number(e.target.value))}
                        />
                        <input
                          className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                          type="number"
                          value={faktorKapasitas}
                          onChange={(e) => setFaktorKapasitas(Number(e.target.value))}
                        />
                      </div>
                    </div>
                    {/* Umur Proyek */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">
                          Umur Proyek
                        </label>
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          Tahun
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          className="flex-1"
                          max="30"
                          min="5"
                          type="range"
                          value={umurProyek}
                          onChange={(e) => setUmurProyek(Number(e.target.value))}
                        />
                        <input
                          className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                          type="number"
                          value={umurProyek}
                          onChange={(e) => setUmurProyek(Number(e.target.value))}
                        />
                      </div>
                    </div>
                    {/* Degradasi */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">
                          Degradasi Tahunan
                        </label>
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          %
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          className="flex-1"
                          max="5"
                          min="0"
                          step="0.1"
                          type="range"
                          value={degradasi}
                          onChange={(e) => setDegradasi(Number(e.target.value))}
                        />
                        <input
                          className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                          step="0.1"
                          type="number"
                          value={degradasi}
                          onChange={(e) => setDegradasi(Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                </details>

                {/* Financial parameters */}
                <details
                  className="group flex flex-col rounded-lg border border-gray-200 dark:border-border-dark bg-white dark:bg-card-dark overflow-hidden"
                  open
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 bg-gray-50 dark:bg-[#23303d] hover:bg-gray-100 dark:hover:bg-[#2a3a4a] transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-green-500 text-[20px]">
                        payments
                      </span>
                      <p className="text-slate-900 dark:text-white text-sm font-semibold">
                        Parameter Finansial
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-slate-500 dark:text-white text-[18px] transition-transform group-open:rotate-180">
                      expand_more
                    </span>
                  </summary>
                  <div className="p-4 flex flex-col gap-5 border-t border-gray-200 dark:border-border-dark">
                    {/* CAPEX */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">
                          CAPEX (Investasi)
                        </label>
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          Juta USD
                        </span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-slate-500 dark:text-gray-400 text-sm">
                          $
                        </span>
                        <input
                          className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-3 py-1.5 pl-6 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                          type="number"
                          value={capex}
                          onChange={(e) => setCapex(Number(e.target.value))}
                        />
                      </div>
                    </div>
                    {/* OPEX */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">
                          OPEX (Per Tahun)
                        </label>
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          % CAPEX
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          className="flex-1"
                          max="5"
                          min="0.5"
                          step="0.1"
                          type="range"
                          value={opex}
                          onChange={(e) => setOpex(Number(e.target.value))}
                        />
                        <input
                          className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                          step="0.1"
                          type="number"
                          value={opex}
                          onChange={(e) => setOpex(Number(e.target.value))}
                        />
                      </div>
                    </div>
                    {/* Diskonto */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">
                          Suku Bunga / Diskonto
                        </label>
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          %
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          className="flex-1"
                          max="15"
                          min="1"
                          step="0.1"
                          type="range"
                          value={diskonto}
                          onChange={(e) => setDiskonto(Number(e.target.value))}
                        />
                        <input
                          className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                          step="0.1"
                          type="number"
                          value={diskonto}
                          onChange={(e) => setDiskonto(Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                </details>
              </div>

              <button className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg shadow-lg shadow-blue-500/20 transition-all flex justify-center items-center gap-2 mt-1 text-sm">
                <span className="material-symbols-outlined text-[20px]">calculate</span>
                Hitung Simulasi
              </button>
            </div>
          </aside>

          {/* Results section */}
          <section className="xl:col-span-8 flex flex-col gap-6">
            <div className="flex justify-between items-center mb-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Hasil Simulasi &amp; Analisis
              </h3>
              <div className="text-xs text-slate-500 dark:text-text-secondary">
                Dihitung terakhir:{' '}
                <span className="font-mono">Baru saja</span>
              </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-[56px] text-primary">bolt</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-text-secondary font-medium uppercase tracking-wide mb-1.5">
                  Energi Tahunan (AEP)
                </p>
                <div className="flex items-baseline gap-1">
                  <h4 className="text-2xl font-black text-slate-900 dark:text-white">78.84</h4>
                  <span className="text-xs font-bold text-slate-400">GWh</span>
                </div>
                <div className="flex items-center gap-1 mt-2 text-green-500 text-xs font-medium">
                  <span className="material-symbols-outlined text-[16px]">trending_up</span>
                  <span>+4.2% dari target</span>
                </div>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-[56px] text-yellow-500">
                    price_check
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-text-secondary font-medium uppercase tracking-wide mb-1.5">
                  LCOE
                </p>
                <div className="flex items-baseline gap-1">
                  <h4 className="text-2xl font-black text-slate-900 dark:text-white">4.2</h4>
                  <span className="text-xs font-bold text-slate-400">¢/kWh</span>
                </div>
                <div className="flex items-center gap-1 mt-2 text-slate-500 text-xs font-medium">
                  <span className="material-symbols-outlined text-[16px]">horizontal_rule</span>
                  <span>Rata-rata Industri</span>
                </div>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-[56px] text-green-500">
                    account_balance_wallet
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-text-secondary font-medium uppercase tracking-wide mb-1.5">
                  NPV (Nilai Kini Bersih)
                </p>
                <div className="flex items-baseline gap-1">
                  <h4 className="text-2xl font-black text-slate-900 dark:text-white">12.5</h4>
                  <span className="text-xs font-bold text-slate-400">M USD</span>
                </div>
                <div className="flex items-center gap-1 mt-2 text-green-500 text-xs font-medium">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>Layak</span>
                </div>
              </div>
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-[56px] text-purple-500">
                    timelapse
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-text-secondary font-medium uppercase tracking-wide mb-1.5">
                  Periode Pengembalian
                </p>
                <div className="flex items-baseline gap-1">
                  <h4 className="text-2xl font-black text-slate-900 dark:text-white">7.2</h4>
                  <span className="text-xs font-bold text-slate-400">Tahun</span>
                </div>
                <div className="flex items-center gap-1 mt-2 text-purple-400 text-xs font-medium">
                  <span className="material-symbols-outlined text-[16px]">info</span>
                  <span>ROI: 14.5%</span>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[360px]">
              {/* Cumulative cash flow */}
              <div className="bg-white dark:bg-card-dark rounded-xl p-5 border border-gray-200 dark:border-border-dark flex flex-col">
                <div className="flex justify-between items-start mb-5">
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    Arus Kas Kumulatif
                  </h4>
                  <div className="flex gap-2 items-center">
                    <span className="size-2.5 rounded-full bg-primary/20 border border-primary" />
                    <span className="text-xs text-slate-500 dark:text-text-secondary">Proyeksi</span>
                  </div>
                </div>
                <div className="flex-1 w-full relative h-[220px] flex items-end px-4 pb-6 border-l border-b border-gray-200 dark:border-slate-700">
                  <div className="absolute left-[-28px] top-0 bottom-6 flex flex-col justify-between text-[10px] text-slate-400 font-mono h-full">
                    <span>20M</span>
                    <span>10M</span>
                    <span>0</span>
                    <span>-10M</span>
                    <span>-20M</span>
                  </div>
                  <div className="absolute left-0 right-0 top-[50%] border-t border-dashed border-slate-300 dark:border-slate-600 w-full" />
                  <svg
                    className="w-full h-full overflow-visible"
                    preserveAspectRatio="none"
                    viewBox="0 0 100 100"
                  >
                    <defs>
                      <linearGradient id="cashGradient" x1="0%" x2="0%" y1="0%" y2="100%">
                        <stop offset="0%" style={{ stopColor: '#137fec', stopOpacity: 1 }} />
                        <stop offset="100%" style={{ stopColor: '#137fec', stopOpacity: 0 }} />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,80 L10,80 L20,75 L30,65 L40,55 L50,45 L60,35 L70,25 L80,15 L90,5 L100,5 L100,80 Z"
                      fill="url(#cashGradient)"
                      opacity="0.2"
                    />
                    <path
                      d="M0,80 L10,80 L20,75 L30,65 L40,55 L50,45 L60,35 L70,25 L80,15 L90,5 L100,5"
                      fill="none"
                      stroke="#137fec"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle className="animate-pulse" cx="35" cy="60" fill="#137fec" r="1.5" />
                    <circle cx="70" cy="25" fill="#137fec" r="1.5" />
                  </svg>
                  <div className="absolute left-0 right-0 -bottom-5 flex justify-between text-[10px] text-slate-400 font-mono w-full">
                    <span>Y0</span>
                    <span>Y5</span>
                    <span>Y10</span>
                    <span>Y15</span>
                    <span>Y20</span>
                  </div>
                </div>
              </div>

              {/* Revenue vs Cost bar chart */}
              <div className="bg-white dark:bg-card-dark rounded-xl p-5 border border-gray-200 dark:border-border-dark flex flex-col">
                <div className="flex justify-between items-start mb-5">
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    Pendapatan vs Biaya
                  </h4>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-primary" />
                      <span className="text-xs text-slate-500 dark:text-text-secondary">Pendapatan</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-slate-400" />
                      <span className="text-xs text-slate-500 dark:text-text-secondary">Biaya</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex items-end justify-between gap-2 border-b border-gray-200 dark:border-slate-700 pb-2 px-2 relative h-[220px]">
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="w-full h-px bg-gray-100 dark:bg-slate-800" />
                    ))}
                    <div className="w-full h-px bg-transparent" />
                  </div>
                  {barData.map((bar) => (
                    <div
                      key={bar.label}
                      className="flex flex-col gap-1 items-center w-full group cursor-pointer"
                    >
                      <div className="flex gap-1 h-28 items-end">
                        <div
                          className="w-3 md:w-4 bg-primary rounded-t-sm group-hover:bg-blue-400 transition-colors"
                          style={{ height: `${bar.rev}%` }}
                        />
                        <div
                          className="w-3 md:w-4 bg-slate-400 rounded-t-sm"
                          style={{ height: `${bar.cost}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400">{bar.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Cash flow table */}
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 dark:border-border-dark flex justify-between items-center">
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  Rincian Arus Kas (5 Tahun Pertama)
                </h4>
                <button className="text-xs text-primary font-medium hover:underline">
                  Lihat Tabel Lengkap
                </button>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 dark:text-text-secondary uppercase bg-gray-50 dark:bg-[#1a232c] border-b border-gray-200 dark:border-border-dark">
                    <tr>
                      <th className="px-5 py-3 font-bold">Tahun</th>
                      <th className="px-5 py-3 font-bold">Energi (GWh)</th>
                      <th className="px-5 py-3 font-bold">Pendapatan ($Jt)</th>
                      <th className="px-5 py-3 font-bold">OPEX ($Jt)</th>
                      <th className="px-5 py-3 font-bold">Arus Kas Bersih ($Jt)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {cashFlowRows.map((row) => (
                      <tr
                        key={row.year}
                        className="bg-white dark:bg-card-dark hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">
                          {row.year}
                        </td>
                        <td className="px-5 py-3 text-slate-600 dark:text-text-secondary">
                          {row.energy}
                        </td>
                        <td className="px-5 py-3 text-slate-600 dark:text-text-secondary">
                          {row.revenue}
                        </td>
                        <td className="px-5 py-3 text-slate-600 dark:text-text-secondary">
                          {row.opex}
                        </td>
                        <td className="px-5 py-3 font-medium text-green-500">{row.net}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
