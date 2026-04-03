import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function AnalisisPage() {
  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col w-full max-w-[1440px] mx-auto px-4 lg:px-8 py-4">
        {/* Page header */}
        <div className="flex flex-col gap-1 mb-5">
          <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
            <div className="flex flex-col gap-1 max-w-2xl">
              <h1 className="text-xl font-bold leading-tight text-slate-900 dark:text-white">
                Analisis Lokasi &amp; Validasi Data
              </h1>
              <p className="text-slate-600 dark:text-[#92adc9] text-sm font-normal leading-normal">
                Validasi pengukuran stasiun meteorologi, korelasi atlas, dan proyeksi MCP.
              </p>
            </div>
            <div className="flex gap-2">
              <button suppressHydrationWarning className="flex items-center gap-1.5 px-3 py-2 bg-transparent border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-xs font-medium">
                <span className="material-symbols-outlined text-[16px]">download</span>
                Ekspor CSV
              </button>
              <button suppressHydrationWarning className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 transition-all text-xs font-medium shadow-md shadow-blue-500/20">
                <span className="material-symbols-outlined text-[16px]">science</span>
                Jalankan Analisis MCP
              </button>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-white dark:bg-card-dark rounded-lg p-4 border border-gray-200 dark:border-border-dark mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Lokasi Stasiun
              </label>
              <div className="relative">
                <select suppressHydrationWarning className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none pr-8">
                  <option>Pos Pegunungan Wayang (Bandung Selatan)</option>
                  <option>Stasiun Cimahi Utara (Cimahi)</option>
                </select>
                <span className="material-symbols-outlined absolute right-2 top-2 text-slate-400 pointer-events-none text-[18px]">
                  expand_more
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Periode Data
              </label>
              <div className="flex items-center gap-1">
                <input
                  suppressHydrationWarning
                  className="flex-1 min-w-0 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg px-2 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary date-input"
                  type="date"
                  defaultValue="2023-01-01"
                />
                <span className="text-slate-500 text-[10px] shrink-0">–</span>
                <input
                  suppressHydrationWarning
                  className="flex-1 min-w-0 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg px-2 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary date-input"
                  type="date"
                  defaultValue="2023-12-31"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Variabel
              </label>
              <div className="relative">
                <select suppressHydrationWarning className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none pr-8">
                  <option>Kecepatan Angin (m/s)</option>
                  <option>Arah Angin (deg)</option>
                  <option>Temperatur (&deg;C)</option>
                </select>
                <span className="material-symbols-outlined absolute right-2 top-2 text-slate-400 pointer-events-none text-[18px]">
                  expand_more
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Metode MCP
              </label>
              <div className="relative">
                <select suppressHydrationWarning className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none pr-8">
                  <option>Rasio Varians</option>
                  <option>Regresi Linier</option>
                  <option>Matriks (Matrix Method)</option>
                </select>
                <span className="material-symbols-outlined absolute right-2 top-2 text-slate-400 pointer-events-none text-[18px]">
                  expand_more
                </span>
              </div>
            </div>
            <div>
              <button suppressHydrationWarning className="w-full py-2 text-primary hover:text-white border border-primary/30 hover:bg-primary rounded-lg text-xs font-medium transition-all">
                Reset Filter
              </button>
            </div>
          </div>
        </div>

        {/* Analysis status banner */}
        <div className="flex flex-wrap gap-4 items-center justify-between bg-green-500/10 border border-green-500/30 rounded-xl px-5 py-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-green-400 text-[22px]">check_circle</span>
            <div>
              <p className="text-sm font-bold text-green-400">Analisis Selesai</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Dijalankan: 9 Mar 2026, 14:32 WIB · Metode: Rasio Varians
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>Sumber referensi: <span className="text-slate-200 font-semibold">ERA5 (ECMWF)</span></span>
            <span>·</span>
            <span>Atlas: <span className="text-slate-200 font-semibold">GWA 3.0</span></span>
            <span>·</span>
            <span>Periode overlap: <span className="text-slate-200 font-semibold">12 bulan</span></span>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
            <div className="flex justify-between items-start mb-1.5">
              <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">
                Rata-rata Kec. Angin (Obs)
              </p>
              <span className="material-symbols-outlined text-primary text-[20px]">air</span>
            </div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">6.4</h3>
              <span className="text-sm text-slate-500 dark:text-slate-400">m/s</span>
              <span className="ml-auto bg-green-500/10 text-green-500 text-xs font-bold px-2 py-0.5 rounded">
                +2.1%
              </span>
            </div>
          </div>
          <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
            <div className="flex justify-between items-start mb-1.5">
              <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">
                Korelasi Atlas (R²)
              </p>
              <span className="material-symbols-outlined text-primary text-[20px]">ssid_chart</span>
            </div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">0.89</h3>
              <span className="ml-auto bg-green-500/10 text-green-500 text-xs font-bold px-2 py-0.5 rounded">
                Tinggi
              </span>
            </div>
          </div>
          <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark">
            <div className="flex justify-between items-start mb-1.5">
              <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">
                Bias Keseluruhan
              </p>
              <span className="material-symbols-outlined text-primary text-[20px]">difference</span>
            </div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">+1.2%</h3>
              <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium">
                vs GWA 3.0
              </span>
            </div>
          </div>
          {/* AEP card — summary output dari analisis MCP */}
          <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-[56px] text-primary">bolt</span>
            </div>
            <div className="flex justify-between items-start mb-1.5">
              <p className="text-xs text-slate-500 dark:text-text-secondary font-semibold">
                Estimasi AEP (P50)
              </p>
              <span className="material-symbols-outlined text-primary text-[20px]">bolt</span>
            </div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">12,450</h3>
              <span className="text-sm text-slate-500 dark:text-slate-400">MWh</span>
            </div>
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
          {/* Time series chart */}
          <div className="xl:col-span-2 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark p-4 min-h-[320px] flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Visualisasi Perbandingan Data
                </h3>
                <p className="text-xs text-slate-500 dark:text-text-secondary">
                  Deret Waktu: Pengukuran Lapangan (Obs) vs Atlas
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                  <span className="text-slate-600 dark:text-slate-300">Terukur (Obs)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <span className="text-slate-600 dark:text-slate-300">Atlas</span>
                </div>
              </div>
            </div>
            <div className="flex-1 w-full relative bg-[#111a22] rounded-lg overflow-hidden border border-gray-800">
              <div className="absolute left-3 top-4 bottom-8 flex flex-col justify-between text-sm text-slate-500 font-mono z-10">
                <span>15</span>
                <span>10</span>
                <span>5</span>
                <span>0</span>
              </div>
              <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none">
                <line stroke="#2d3b4a" strokeWidth="1" x1="0" x2="100%" y1="25%" y2="25%" />
                <line stroke="#2d3b4a" strokeWidth="1" x1="0" x2="100%" y1="50%" y2="50%" />
                <line stroke="#2d3b4a" strokeWidth="1" x1="0" x2="100%" y1="75%" y2="75%" />
                <path
                  d="M0,90 Q150,85 300,50 T600,20 T900,40"
                  fill="none"
                  stroke="#137fec"
                  strokeWidth="2.5"
                />
                <path
                  d="M0,85 Q150,80 300,60 T600,30 T900,50"
                  fill="none"
                  stroke="#64748b"
                  strokeDasharray="4 4"
                  strokeWidth="2.5"
                />
                <rect
                  fill="white"
                  fillOpacity="0.05"
                  height="200"
                  stroke="white"
                  strokeOpacity="0.2"
                  width="100"
                  x="350"
                  y="20"
                />
                <line
                  stroke="white"
                  strokeDasharray="2 2"
                  strokeOpacity="0.5"
                  x1="400"
                  x2="400"
                  y1="20"
                  y2="220"
                />
              </svg>
            </div>
          </div>

          {/* Correlation scatter plot */}
          <div className="xl:col-span-1 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark p-4 flex flex-col justify-between">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Analisis Korelasi</h3>
              <p className="text-xs text-slate-500 dark:text-text-secondary">
                Scatter Plot: Obs (X) vs Atlas (Y)
              </p>
            </div>
            <div className="aspect-square w-full bg-white rounded-lg p-3 border border-gray-200 mb-3 flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 200 200">
                <line stroke="#cbd5e1" strokeWidth="1" x1="20" x2="180" y1="180" y2="180" />
                <line stroke="#cbd5e1" strokeWidth="1" x1="20" x2="20" y1="20" y2="180" />
                <text fill="#64748b" fontSize="12" textAnchor="middle" x="100" y="195">
                  Obs (m/s)
                </text>
                <text
                  fill="#64748b"
                  fontSize="12"
                  textAnchor="middle"
                  transform="rotate(-90, 10, 100)"
                  x="10"
                  y="100"
                >
                  Atlas (m/s)
                </text>
                {[
                  [40, 160],[50, 150],[60, 145],[80, 120],[100, 100],
                  [120, 85],[140, 60],[160, 40],
                ].map(([cx, cy], i) => (
                  <circle key={i} cx={cx} cy={cy} fill="#92adc9" r="2" />
                ))}
                {[
                  [45, 155],[55, 148],[90, 110],[110, 95],[130, 70],[150, 50],
                ].map(([cx, cy], i) => (
                  <circle key={i} cx={cx} cy={cy} fill="#92adc9" opacity="0.6" r="2" />
                ))}
                <line
                  stroke="#137fec"
                  strokeDasharray="3 3"
                  strokeWidth="1.5"
                  x1="20"
                  x2="180"
                  y1="180"
                  y2="20"
                />
              </svg>
            </div>
            <div className="bg-gray-50 dark:bg-[#111a22] rounded-lg p-3 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex justify-between mb-1.5">
                <span>Kecocokan Linear:</span>
                <span className="font-mono">y = 0.92x + 0.3</span>
              </div>
              <div className="flex justify-between items-center font-bold text-slate-900 dark:text-white">
                <span>R² = </span>
                <span className="text-lg">0.89</span>
              </div>
            </div>
          </div>
        </div>

        {/* Validation table + MCP results */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
          {/* Validation parameters table */}
          <div className="xl:col-span-2 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark overflow-hidden flex flex-col h-full">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-border-dark flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Parameter Validasi
              </h3>
              <button suppressHydrationWarning className="text-xs text-primary font-medium hover:underline">
                Lihat Detail
              </button>
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
                  {[
                    { metric: 'RMSE (m/s)', value: '1.45', target: '< 2.0' },
                    { metric: 'MAE (m/s)', value: '1.12', target: '< 1.5' },
                    { metric: 'Bias (%)', value: '+1.2%', target: '± 5%' },
                    { metric: 'Ketersediaan Data', value: '98.5%', target: '> 90%' },
                  ].map((row) => (
                    <tr
                      key={row.metric}
                      className="bg-white dark:bg-card-dark hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        {row.metric}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-text-secondary">
                        {row.value}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-text-secondary">
                        {row.target}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-green-500/10 text-green-500 px-2 py-1 rounded text-[10px] font-bold uppercase">
                          Lulus
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* MCP Projection Results */}
          <div className="xl:col-span-1 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark p-4 flex flex-col gap-4 h-full">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-[20px]">auto_graph</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  Hasil Proyeksi MCP
                </h3>
                <p className="text-xs text-slate-500 dark:text-text-secondary mt-0.5">
                  Penyesuaian jangka panjang diterapkan
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 dark:bg-[#111a22] p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">
                  Jangka Pendek (Obs)
                </p>
                <p className="text-base font-bold text-slate-900 dark:text-white">6.4 m/s</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Periode: 12 Bulan</p>
              </div>
              <div className="bg-primary/5 dark:bg-primary/10 p-3 rounded-lg border border-primary/20">
                <p className="text-[10px] uppercase text-primary font-bold mb-1">
                  Jangka Panjang
                </p>
                <div className="flex items-center gap-1.5">
                  <p className="text-base font-bold text-slate-900 dark:text-white">6.7 m/s</p>
                  <span className="text-[10px] font-bold text-green-500">▲ 4.6%</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">Periode: 20 Tahun</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white mb-2">
                Estimasi Produksi Energi (AEP)
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22]">
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="material-symbols-outlined text-[16px] text-slate-400">cloud</span>
                    AEP Bruto (P50)
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white text-sm font-mono">
                    14,200 MWh
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22] border-l-4 border-primary">
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="material-symbols-outlined text-[16px] text-primary">
                      check_circle
                    </span>
                    AEP Bersih (P50)
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white text-base font-mono">
                    12,450 MWh
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 rounded bg-gray-50 dark:bg-[#111a22]">
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="material-symbols-outlined text-[16px] text-slate-400">shield</span>
                    AEP Bersih (P90)
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white text-sm font-mono">
                    10,890 MWh
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Asumsi dan Keterbatasan */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-amber-400 text-[18px]">info</span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Asumsi dan Keterbatasan</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-[#92adc9]">
            <div className="flex gap-2.5">
              <span className="material-symbols-outlined text-[17px] text-slate-400 mt-0.5 shrink-0">schedule</span>
              <span>
                <strong className="text-slate-800 dark:text-slate-200">Durasi observasi:</strong>{' '}
                12 bulan (Jan 2023–Jan 2024). Minimum rekomendasi IEC 61400-12: 12 bulan ✓
              </span>
            </div>
            <div className="flex gap-2.5">
              <span className="material-symbols-outlined text-[17px] text-slate-400 mt-0.5 shrink-0">satellite_alt</span>
              <span>
                <strong className="text-slate-800 dark:text-slate-200">Sumber referensi:</strong>{' '}
                ERA5 (ECMWF), periode klimatologi 1991–2020. Atlas angin: GWA 3.0.
              </span>
            </div>
            <div className="flex gap-2.5">
              <span className="material-symbols-outlined text-[17px] text-slate-400 mt-0.5 shrink-0">sync_alt</span>
              <span>
                <strong className="text-slate-800 dark:text-slate-200">Periode overlap tervalidasi:</strong>{' '}
                Jan 2023 – Jan 2024. Overlap minimum untuk MCP valid: ≥ 6 bulan.
              </span>
            </div>
            <div className="flex gap-2.5">
              <span className="material-symbols-outlined text-[17px] text-amber-400 mt-0.5 shrink-0">warning</span>
              <span>
                <strong className="text-slate-800 dark:text-slate-200">Catatan:</strong>{' '}
                Hasil ini adalah analisis pre-feasibility / screening awal. Bukan Wind Resource Assessment (WRA) bankable grade dan tidak menggantikan studi kelayakan final.
              </span>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
