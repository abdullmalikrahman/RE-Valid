'use client';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function PetaPage() {
  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white font-display overflow-hidden h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 relative flex overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-80 flex-col border-r border-slate-200 dark:border-[#233648] bg-white dark:bg-[#111a22] z-20">
          <div className="p-5 flex flex-col h-full">
            {/* Search */}
            <div className="mb-6">
              <label className="flex flex-col h-11">
                <div className="flex w-full flex-1 items-stretch rounded-lg h-full border border-slate-200 dark:border-[#233648] bg-slate-50 dark:bg-[#192633] focus-within:ring-2 focus-within:ring-primary/50">
                  <div className="text-slate-400 dark:text-[#92adc9] flex items-center justify-center pl-3">
                    <span className="material-symbols-outlined text-[22px]">search</span>
                  </div>
                  <input
                    className="w-full min-w-0 flex-1 resize-none bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#92adc9] px-3 text-[15px] font-normal"
                    placeholder="Cari koordinat atau ID stasiun..."
                  />
                </div>
              </label>
            </div>

            <div className="flex-1 overflow-y-auto pr-2">
              {/* Active Layers */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-primary text-[22px]">layers</span>
                  <h3 className="text-slate-900 dark:text-white text-[15px] font-semibold">Lapisan Aktif</h3>
                </div>
                <div className="space-y-1 bg-slate-50 dark:bg-[#16202a] rounded-lg p-3 border border-slate-200 dark:border-[#233648]">
                  <label className="flex items-start gap-3 py-2 cursor-pointer group">
                    <input
                      defaultChecked
                      className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-[#324d67] bg-transparent"
                      type="checkbox"
                    />
                    <div>
                      <p className="text-slate-700 dark:text-white text-[15px] font-medium leading-none group-hover:text-primary transition-colors">
                        Atlas Angin/Surya (Mentah)
                      </p>
                      <p className="text-slate-500 dark:text-[#92adc9] text-[13px] mt-1.5">
                        Data mentah GWA &amp; ERA5 (ECMWF)
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 py-2 cursor-pointer group border-t border-slate-200 dark:border-[#233648]/50">
                    <input
                      defaultChecked
                      className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-[#324d67] bg-transparent"
                      type="checkbox"
                    />
                    <div>
                      <p className="text-slate-700 dark:text-white text-[15px] font-medium leading-none group-hover:text-primary transition-colors">
                        Data Observasi / Stasiun
                      </p>
                      <p className="text-slate-500 dark:text-[#92adc9] text-[13px] mt-1.5">
                        Penanda stasiun &amp; metrik pengukuran lapangan
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 py-2 cursor-pointer group border-t border-slate-200 dark:border-[#233648]/50">
                    <input
                      className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-[#324d67] bg-transparent"
                      type="checkbox"
                    />
                    <div>
                      <p className="text-slate-700 dark:text-white text-[15px] font-medium leading-none group-hover:text-primary transition-colors">
                        Hasil Koreksi Bias
                      </p>
                      <p className="text-slate-500 dark:text-[#92adc9] text-[13px] mt-1.5">
                        Atlas pasca koreksi MCP/ERA5
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 py-2 cursor-pointer group border-t border-slate-200 dark:border-[#233648]/50">
                    <input
                      className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-[#324d67] bg-transparent"
                      type="checkbox"
                    />
                    <div>
                      <p className="text-slate-700 dark:text-white text-[15px] font-medium leading-none group-hover:text-primary transition-colors">
                        Prioritas GIS-MCDA
                      </p>
                      <p className="text-slate-500 dark:text-[#92adc9] text-[13px] mt-1.5">
                        Peta panas zona potensial
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Constraint & Infrastructure Layers */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-amber-500 text-[22px]">policy</span>
                  <h3 className="text-slate-900 dark:text-white text-[15px] font-semibold">Constraint &amp; Infrastruktur</h3>
                </div>
                <div className="space-y-1 bg-slate-50 dark:bg-[#16202a] rounded-lg p-3 border border-slate-200 dark:border-[#233648]">
                  {[
                    { label: 'Constraint Regulasi', desc: 'KKP, KBAM, zona lindung', color: 'text-red-500' },
                    { label: 'Jaringan Listrik', desc: 'Grid PLN & gardu induk', color: 'text-yellow-500' },
                    { label: 'Akses Jalan', desc: 'Jalan arteri & kolektor', color: 'text-orange-400' },
                    { label: 'Buffer Permukiman', desc: 'Zona penyangga 300m–500m', color: 'text-purple-400' },
                    { label: 'Topografi / Elevasi', desc: 'DEM SRTM 30m — slope summary', color: 'text-teal-400' },
                  ].map((layer, i) => (
                    <label
                      key={layer.label}
                      className={`flex items-start gap-3 py-2 cursor-pointer group ${i > 0 ? 'border-t border-slate-200 dark:border-[#233648]/50' : ''}`}
                    >
                      <input
                        className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-[#324d67] bg-transparent"
                        type="checkbox"
                      />
                      <div>
                        <p className={`text-[15px] font-medium leading-none transition-colors group-hover:text-primary ${layer.color}`}>
                          {layer.label}
                        </p>
                        <p className="text-slate-500 dark:text-[#92adc9] text-[13px] mt-1.5">
                          {layer.desc}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Validation Filter */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-primary text-[22px]">tune</span>
                  <h3 className="text-slate-900 dark:text-white text-[15px] font-semibold">Filter Validasi</h3>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-[#233648] bg-slate-50 dark:bg-[#16202a]">
                  <div className="mb-3">
                    <label className="text-[13px] text-slate-500 dark:text-[#92adc9] font-medium mb-1 block">
                      Rentang Tanggal
                    </label>
                    <select className="w-full bg-white dark:bg-[#111a22] border border-slate-300 dark:border-[#324d67] rounded text-[14px] text-slate-900 dark:text-white p-2.5">
                      <option>30 Hari Terakhir</option>
                      <option>Kuartal Terakhir</option>
                      <option>Tahun Berjalan</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[13px] text-slate-500 dark:text-[#92adc9] font-medium mb-1 block">
                      Prioritas Wilayah
                    </label>
                    <div className="flex gap-2">
                      <button className="flex-1 py-2 text-[13px] font-medium rounded bg-primary text-white">
                        Tinggi
                      </button>
                      <button className="flex-1 py-2 text-[13px] font-medium rounded bg-slate-200 dark:bg-[#233648] text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-[#324d67]">
                        Sedang
                      </button>
                      <button className="flex-1 py-2 text-[13px] font-medium rounded bg-slate-200 dark:bg-[#233648] text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-[#324d67]">
                        Rendah
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-auto pt-4 border-t border-slate-200 dark:border-[#233648]">
              <button className="w-full flex items-center justify-center gap-2 rounded-lg h-11 px-4 bg-primary hover:bg-blue-600 text-white text-[15px] font-bold shadow-lg shadow-blue-500/20 transition-all">
                <span className="material-symbols-outlined text-[22px]">analytics</span>
                <span>Analisis Wilayah</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Map area */}
        <div className="flex-1 relative bg-[#0a1017] w-full h-full">
          {/* Map placeholder */}
          <div
            className="absolute inset-0 w-full h-full bg-cover bg-center opacity-80"
            style={{
              backgroundImage:
                'url("https://lh3.googleusercontent.com/aida-public/AB6AXuByb90LM2KfWc70zGlvjba4keLOjXHTKEVfG_iN-1ipAG0YzfJYpHpcK7oIJKAWUoXspuSdUMU5UbrFI6Q1Yt2f76OqZrYV-AWTgHwxQIIbs6nyMuFPExR3jARFKt3sukR6Kz-HankRtEtZvgPxE59sMFtHFNi1QhKblcTLeDXy56qP0SmSKXYTrFTsD20ihy77EjkzT0hMXTWy6ca61VKzfwspLKpTeZgvHWtecaSl5LwH6fn1x3Iu39c2C158dCHWniyacBY0VtM3")',
              filter:
                'grayscale(100%) invert(100%) hue-rotate(180deg) brightness(0.6) contrast(1.2)',
            }}
          />

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#111a22] via-transparent to-transparent opacity-60 pointer-events-none" />

          {/* Station markers — color-coded by lokasi status */}
          {/* STM-021: Prioritas */}
          <div className="absolute top-[30%] left-[45%] flex flex-col items-center gap-1 cursor-pointer group z-10">
            <div className="relative flex items-center justify-center">
              <div className="size-5 bg-green-500 rounded-full animate-ping absolute opacity-60" />
              <div className="size-5 bg-green-600 border-2 border-white dark:border-[#111a22] rounded-full shadow-lg z-10 flex items-center justify-center">
                <span className="material-symbols-outlined text-white" style={{fontSize:'10px'}}>bolt</span>
              </div>
            </div>
            <div className="bg-white dark:bg-[#192633] border border-slate-200 dark:border-[#233648] px-3 py-2 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity absolute top-7 left-1/2 -translate-x-1/2 whitespace-nowrap z-20 pointer-events-none">
              <p className="text-[13px] font-bold text-slate-900 dark:text-white">STM-021</p>
              <p className="text-[11px] text-green-500 font-semibold mt-0.5">● Prioritas</p>
              <p className="text-[11px] text-slate-400 mt-0.5">⏱ 14 mnt lalu</p>
            </div>
          </div>
          {/* WND-033: Kandidat */}
          <div className="absolute top-[42%] left-[55%] flex flex-col items-center gap-1 cursor-pointer group z-10">
            <div className="size-4 bg-amber-500 border-2 border-white dark:border-[#111a22] rounded-full shadow-lg" />
            <div className="bg-white dark:bg-[#192633] border border-slate-200 dark:border-[#233648] px-3 py-2 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity absolute top-6 left-1/2 -translate-x-1/2 whitespace-nowrap z-20 pointer-events-none">
              <p className="text-[13px] font-bold text-slate-900 dark:text-white">WND-033</p>
              <p className="text-[11px] text-amber-500 font-semibold mt-0.5">◑ Kandidat</p>
              <p className="text-[11px] text-slate-400 mt-0.5">⏱ 2 jam lalu</p>
            </div>
          </div>
          {/* SLR-087: Tidak Sesuai */}
          <div className="absolute top-[55%] left-[38%] flex flex-col items-center gap-1 cursor-pointer group z-10">
            <div className="size-4 bg-slate-500 border-2 border-white dark:border-[#111a22] rounded-full shadow-lg" />
            <div className="bg-white dark:bg-[#192633] border border-slate-200 dark:border-[#233648] px-3 py-2 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity absolute top-6 left-1/2 -translate-x-1/2 whitespace-nowrap z-20 pointer-events-none">
              <p className="text-[13px] font-bold text-slate-900 dark:text-white">SLR-087</p>
              <p className="text-[11px] text-slate-400 font-semibold mt-0.5">✕ Tidak Sesuai</p>
              <p className="text-[11px] text-slate-400 mt-0.5">⏱ 5 jam lalu</p>
            </div>
          </div>

          {/* Zoom controls */}
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-30">
            <button className="bg-white dark:bg-[#192633] text-slate-700 dark:text-white p-2.5 rounded-lg shadow-lg hover:bg-slate-50 dark:hover:bg-[#233648] border border-slate-200 dark:border-[#233648]">
              <span className="material-symbols-outlined block text-[24px]">add</span>
            </button>
            <button className="bg-white dark:bg-[#192633] text-slate-700 dark:text-white p-2.5 rounded-lg shadow-lg hover:bg-slate-50 dark:hover:bg-[#233648] border border-slate-200 dark:border-[#233648]">
              <span className="material-symbols-outlined block text-[24px]">remove</span>
            </button>
            <button className="mt-2 bg-white dark:bg-[#192633] text-slate-700 dark:text-white p-2.5 rounded-lg shadow-lg hover:bg-slate-50 dark:hover:bg-[#233648] border border-slate-200 dark:border-[#233648]">
              <span className="material-symbols-outlined block text-[24px]">my_location</span>
            </button>
          </div>

          {/* Legend */}
          <div className="absolute bottom-6 left-6 z-30 bg-white/90 dark:bg-[#111a22]/90 backdrop-blur-sm p-4 rounded-lg shadow-xl border border-slate-200 dark:border-[#233648] min-w-[210px]">
            <h4 className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
              Indeks Kesesuaian
            </h4>
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-[#92adc9] mb-1">
              <div className="w-full h-2 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-500" />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 w-full mb-3">
              <span>Rendah</span>
              <span>Tinggi</span>
            </div>
            <div className="border-t border-slate-200 dark:border-[#233648] pt-3 space-y-2">
              <h4 className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
                Status Stasiun
              </h4>
              <div className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-[#92adc9]">
                <span className="w-3.5 h-3.5 bg-green-600 rounded-full shrink-0" />
                Prioritas
              </div>
              <div className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-[#92adc9]">
                <span className="w-3.5 h-3.5 bg-amber-500 rounded-full shrink-0" />
                Kandidat
              </div>
              <div className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-[#92adc9]">
                <span className="w-3.5 h-3.5 bg-slate-500 rounded-full shrink-0" />
                Tidak Sesuai
              </div>
            </div>
          </div>

          {/* Station detail panel */}
          <div className="absolute top-4 bottom-4 right-16 w-80 bg-white/95 dark:bg-[#16202a]/95 backdrop-blur-md border border-slate-200 dark:border-[#233648] rounded-xl shadow-2xl z-20 flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-[#233648] flex justify-between items-start bg-slate-50/50 dark:bg-[#192633]/50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                  <span className="text-[13px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
                    Prioritas
                  </span>
                  <span className="text-[11px] text-slate-400 ml-auto whitespace-nowrap">⏱ 14 mnt lalu</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Stasiun: STM-021</h2>
                <p className="text-[13px] text-slate-500 dark:text-[#92adc9] mt-0.5">
                  Lat: -6.2088, Lon: 106.8456
                </p>
              </div>
              <button className="text-slate-400 hover:text-slate-600 dark:hover:text-white ml-2 shrink-0">
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Informasi Analisis */}
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">info</span>
                  Informasi Analisis
                </h3>
                <div className="bg-slate-50 dark:bg-[#111a22] rounded-lg border border-slate-200 dark:border-[#233648] divide-y divide-slate-200 dark:divide-[#233648] text-[13px]">
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <span className="text-slate-500 dark:text-[#92adc9]">Periode Pengukuran</span>
                    <span className="font-medium text-slate-800 dark:text-slate-100">Jan 2023 – Jan 2024</span>
                  </div>
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <span className="text-slate-500 dark:text-[#92adc9]">Variabel Utama</span>
                    <span className="font-medium text-slate-800 dark:text-slate-100">Angin, Iradiasi</span>
                  </div>
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <span className="text-slate-500 dark:text-[#92adc9]">Status MCP</span>
                    <span className="bg-primary/10 text-primary border border-primary/30 text-[11px] font-bold px-2 py-0.5 rounded-full">
                      ✓ Selesai
                    </span>
                  </div>
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <span className="text-slate-500 dark:text-[#92adc9]">Sumber Referensi</span>
                    <span className="font-medium text-slate-800 dark:text-slate-100">ERA5 (ECMWF)</span>
                  </div>
                </div>
              </div>

              {/* Validation metrics */}
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">query_stats</span>
                  Metrik Validasi
                </h3>
                <div className="bg-slate-50 dark:bg-[#111a22] rounded-lg border border-slate-200 dark:border-[#233648] divide-y divide-slate-200 dark:divide-[#233648] text-[13px]">
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <span className="text-slate-500 dark:text-[#92adc9]">Skor Kesesuaian</span>
                    <span className="font-bold text-green-500">92/100 — Tinggi</span>
                  </div>
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <span className="text-slate-500 dark:text-[#92adc9]">RMSE</span>
                    <span className="font-bold text-slate-900 dark:text-white">0.45 m/s</span>
                  </div>
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <span className="text-slate-500 dark:text-[#92adc9]">Bias</span>
                    <span className="font-bold text-emerald-500">+0.12 m/s</span>
                  </div>
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <span className="text-slate-500 dark:text-[#92adc9]">R²</span>
                    <span className="font-bold text-slate-900 dark:text-white">0.89</span>
                  </div>
                </div>
              </div>

              {/* Energy potential */}
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-yellow-500 text-[20px]">bolt</span>
                  Potensi Energi
                </h3>
                <div className="bg-slate-50 dark:bg-[#111a22] rounded-lg border border-slate-200 dark:border-[#233648] divide-y divide-slate-200 dark:divide-[#233648] text-[13px]">
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <span className="text-slate-500 dark:text-[#92adc9]">Iradiasi Matahari</span>
                    <span className="font-bold text-slate-900 dark:text-white">4.8 kWh/m²</span>
                  </div>
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <span className="text-slate-500 dark:text-[#92adc9]">Kecepatan Angin (Rata-rata)</span>
                    <span className="font-bold text-slate-900 dark:text-white">6.2 m/s</span>
                  </div>
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <span className="text-slate-500 dark:text-[#92adc9]">AEP Estimasi (P50)</span>
                    <span className="font-bold text-primary">12,450 MWh</span>
                  </div>
                </div>
              </div>

              {/* Faktor Penentu Kesesuaian */}
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500 text-[20px]">checklist</span>
                  Faktor Penentu Kesesuaian
                </h3>
                <div className="bg-slate-50 dark:bg-[#111a22] rounded-lg border border-slate-200 dark:border-[#233648] divide-y divide-slate-200 dark:divide-[#233648] text-[13px]">
                  {[
                    { label: 'Potensi angin/surya', value: 'Tinggi', ok: true },
                    { label: 'Dekat jaringan listrik', value: 'Ya (< 5 km)', ok: true },
                    { label: 'Kawasan lindung', value: 'Tidak', ok: true },
                    { label: 'Buffer permukiman', value: 'Aman (> 500m)', ok: true },
                    { label: 'Akses jalan', value: 'Cukup', ok: true },
                    { label: 'Elevasi/topografi', value: 'Sesuai (< 15°)', ok: true },
                  ].map((f) => (
                    <div key={f.label} className="flex justify-between items-center px-3 py-2.5">
                      <span className="text-slate-500 dark:text-[#92adc9]">{f.label}</span>
                      <span className={`font-medium text-[12px] ${f.ok ? 'text-green-500' : 'text-red-400'}`}>
                        {f.ok ? '✓' : '✗'} {f.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Station photo — optional, at bottom */}
              <div>
                <h3 className="text-[13px] font-semibold text-slate-500 dark:text-[#92adc9] mb-2 uppercase tracking-wide">
                  Foto Lokasi
                </h3>
                <div className="rounded-lg overflow-hidden h-32 w-full relative group">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                    style={{
                      backgroundImage:
                        'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDK5cPck2Vgbc4BE2byk0Y9pu-0X4cN9o_3wr6sBOYVHeKfQH9mNDF2nY_jFZHQDfbGZDTU-Yg9toH7jivbBetN2Sh30wi-mKfFSCmHpZcJARkibHpZk1nTHa7KyP_3ZQnFKuIiyIMdd3DHtvyaIi1oiVT3u33xsct6fFhshXnupxhGSotOLb_zglubNeDQGEcf3uFbC0VuS9BrLAVLN2zA9mDDqbU-C0ZnMJJk0fl9leFRwR1dv4h3AgarMrU0e8UW5sizr8uzAlE1")',
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 dark:border-[#233648] bg-slate-50/50 dark:bg-[#192633]/50">
              <button className="w-full flex items-center justify-center gap-2 rounded-lg h-11 px-4 border border-slate-300 dark:border-[#324d67] text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-[#233648] text-[15px] font-medium transition-colors">
                <span>Lihat Laporan Lengkap</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
