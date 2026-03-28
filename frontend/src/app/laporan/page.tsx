import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function LaporanPage() {
  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex flex-col text-sm">
      <Navbar />

      <main className="flex-1 flex flex-col w-full max-w-[1440px] mx-auto px-4 lg:px-8 py-4">
        {/* Page header */}
        <div className="flex flex-col gap-3 mb-5 pt-2">
          <div className="flex flex-wrap justify-between items-end gap-3">
            <div className="flex flex-col gap-1.5 max-w-2xl">
              <Link
                href="/analisis"
                className="flex items-center gap-1 text-xs font-semibold text-primary mb-0.5 hover:underline"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                Kembali ke Analisis
              </Link>
              <h1 className="text-xl font-black leading-tight tracking-tight text-slate-900 dark:text-white">
                Unduh Laporan
              </h1>
              <p className="text-slate-600 dark:text-[#92adc9] text-sm font-normal leading-relaxed">
                Laporan validasi data dan analisis potensi energi telah siap. Sesuaikan parameter
                di bawah ini dan pilih format unduhan yang Anda butuhkan.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Filter panel */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark overflow-hidden shadow-sm">
              <div className="p-5 border-b border-gray-200 dark:border-border-dark flex items-center gap-3">
                <div className="size-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[18px]">tune</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Filter Laporan
                </h3>
              </div>
              <div className="p-5 flex flex-col gap-5">
                {/* Date range */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-text-secondary uppercase tracking-wide">
                    Rentang Tanggal
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 min-w-0 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all date-input"
                      type="date"
                      defaultValue="2023-01-01"
                    />
                    <span className="text-slate-500 text-xs shrink-0">–</span>
                    <input
                      className="flex-1 min-w-0 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all date-input"
                      type="date"
                      defaultValue="2023-12-31"
                    />
                  </div>
                </div>

                {/* Location */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-text-secondary uppercase tracking-wide">
                    Lokasi / Stasiun
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 material-symbols-outlined text-[18px]">
                      location_on
                    </span>
                    <select className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg py-2 pl-9 pr-8 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all appearance-none">
                      <option>Semua Lokasi</option>
                      <option>Stasiun Cimahi Utara (CMH-001)</option>
                      <option>Pos Pesisir Pangandaran (PGD-023)</option>
                      <option>Stasiun Subang Utara (SBG-105)</option>
                      <option>Pos Pegunungan Wayang (GWY-089)</option>
                    </select>
                    <span className="absolute right-3 top-2.5 text-slate-400 material-symbols-outlined text-[18px] pointer-events-none">
                      expand_more
                    </span>
                  </div>
                </div>

                {/* Sections */}
                <div className="flex flex-col gap-3">
                  <label className="text-xs font-bold text-slate-700 dark:text-text-secondary uppercase tracking-wide">
                    Sertakan Bagian
                  </label>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        defaultChecked
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800"
                        type="checkbox"
                      />
                      <span className="text-sm text-slate-600 dark:text-slate-300 group-hover:text-primary transition-colors">
                        Ringkasan Eksekutif
                      </span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        defaultChecked
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800"
                        type="checkbox"
                      />
                      <span className="text-sm text-slate-600 dark:text-slate-300 group-hover:text-primary transition-colors">
                        Grafik Analisis Potensi
                      </span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800"
                        type="checkbox"
                      />
                      <span className="text-sm text-slate-600 dark:text-slate-300 group-hover:text-primary transition-colors">
                        Log Validasi Data Mentah
                      </span>
                    </label>
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
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                    Catatan Sistem
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-blue-100/70 leading-relaxed">
                    Data terakhir diperbarui pada 10 Oktober 2024. Referensi MCP: ERA5 (ECMWF). Atlas baseline: GWA/GSA. Data observasi lapangan digunakan sebagai acuan validasi.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Download section */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Success banner */}
            <div className="bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800/30 rounded-lg p-4 flex items-center gap-3">
              <div className="size-6 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-green-600 dark:text-green-300 text-[16px]">
                  check
                </span>
              </div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Laporan berhasil disiapkan. Silakan pilih format di bawah.
              </p>
            </div>

            {/* PDF contents list */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-[20px]">list_alt</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Isi Laporan PDF</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6">
                {([
                  { icon: 'sensors', label: 'Identitas Stasiun & Lokasi', desc: 'Nama, ID, koordinat, tipe, ketinggian' },
                  { icon: 'date_range', label: 'Periode Pengukuran', desc: 'Rentang tanggal, durasi overlap data' },
                  { icon: 'ssid_chart', label: 'Hasil Validasi', desc: 'RMSE, MAE, Bias, R², ketersediaan data' },
                  { icon: 'auto_graph', label: 'Hasil MCP', desc: 'Metode, faktor koreksi, AEP terkoreksi' },
                  { icon: 'bolt', label: 'Estimasi Energi', desc: 'AEP P50/P90, kapasitas, distribusi Weibull' },
                  { icon: 'layers', label: 'Faktor Kesesuaian GIS-MCDA', desc: 'Skor per kriteria, peta overlay prioritas' },
                  { icon: 'block', label: 'Constraint Utama', desc: 'Jarak grid, kawasan lindung, aksesibilitas' },
                  { icon: 'info', label: 'Asumsi & Keterbatasan', desc: 'Kapasitas turbin, CF referensi, scope studi' },
                  { icon: 'database', label: 'Sumber Data', desc: 'ERA5 (ECMWF), GWA/GSA, observasi lapangan' },
                ] as { icon: string; label: string; desc: string }[]).map((item) => (
                  <div key={item.label} className="flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-primary/70 text-[16px] mt-0.5 shrink-0">{item.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{item.label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-text-secondary">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Pilih Format Unduhan
            </h3>

            <div className="grid grid-cols-1 gap-4">
              {/* PDF */}
              <div className="group bg-white dark:bg-card-dark rounded-xl p-6 border border-gray-200 dark:border-border-dark hover:border-primary/50 transition-all shadow-sm hover:shadow-md flex flex-col sm:flex-row items-start sm:items-center gap-5">
                <div className="size-14 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <span className="material-symbols-outlined text-red-500 text-[32px]">
                    picture_as_pdf
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                      Laporan Presentasi (PDF)
                    </h4>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
                      2.4 MB
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-text-secondary leading-relaxed mb-3 sm:mb-0">
                    Dokumen siap cetak berisi ringkasan eksekutif, peta potensi, grafik validasi,
                    dan rekomendasi strategis. Cocok untuk presentasi ke pemangku kepentingan.
                  </p>
                </div>
                <button className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-blue-600 font-bold transition-all shadow-lg shadow-blue-500/20 text-sm w-full sm:w-auto justify-center">
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Unduh PDF
                </button>
              </div>

              {/* CSV */}
              <div className="group bg-white dark:bg-card-dark rounded-xl p-6 border border-gray-200 dark:border-border-dark hover:border-green-500/50 transition-all shadow-sm hover:shadow-md flex flex-col sm:flex-row items-start sm:items-center gap-5">
                <div className="size-14 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <span className="material-symbols-outlined text-green-600 text-[32px]">
                    table_view
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-green-500 transition-colors">
                      Data Analisis (CSV/Excel)
                    </h4>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
                      850 KB
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-text-secondary leading-relaxed mb-3 sm:mb-0">
                    Dataset lengkap deret waktu (time-series) hasil validasi dan perhitungan MCP.
                    Format terstruktur untuk analisis lanjutan di spreadsheet atau Python.
                  </p>
                </div>
                <button className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-transparent border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 font-bold transition-all text-sm w-full sm:w-auto justify-center">
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Unduh CSV
                </button>
              </div>

              {/* GeoJSON */}
              <div className="group bg-white dark:bg-card-dark rounded-xl p-6 border border-gray-200 dark:border-border-dark hover:border-purple-500/50 transition-all shadow-sm hover:shadow-md flex flex-col sm:flex-row items-start sm:items-center gap-5">
                <div className="size-14 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <span className="material-symbols-outlined text-purple-500 text-[32px]">map</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-purple-500 transition-colors">
                      Data Geospasial (GeoJSON)
                    </h4>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
                      1.2 MB
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-text-secondary leading-relaxed mb-3 sm:mb-0">
                    Fitur geografis mencakup titik stasiun, poligon wilayah potensi, dan hasil
                    GIS-MCDA. Siap diintegrasikan ke QGIS, ArcGIS, atau aplikasi peta web.
                  </p>
                </div>
                <button className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-transparent border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 font-bold transition-all text-sm w-full sm:w-auto justify-center">
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Unduh GeoJSON
                </button>
              </div>
            </div>

            {/* Report preview */}
            <div className="mt-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Pratinjau Isi Laporan
                </h3>
                <button className="text-xs font-medium text-primary hover:text-blue-400">
                  Lihat Full Preview
                </button>
              </div>
              <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl overflow-hidden p-6 relative">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white dark:to-card-dark/90 z-10 pointer-events-none" />
                <div className="opacity-50 blur-[0.5px] select-none pointer-events-none flex flex-col gap-4">
                  <div className="h-8 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="flex gap-4">
                    <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded" />
                    <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded" />
                  </div>
                  <div className="h-4 w-full bg-gray-100 dark:bg-gray-800 rounded" />
                  <div className="h-4 w-5/6 bg-gray-100 dark:bg-gray-800 rounded" />
                  <div className="h-64 w-full bg-gray-50 dark:bg-gray-800/50 rounded border border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center">
                    <span className="material-symbols-outlined text-gray-300 text-4xl">
                      bar_chart
                    </span>
                  </div>
                  <div className="h-4 w-full bg-gray-100 dark:bg-gray-800 rounded" />
                  <div className="h-4 w-4/6 bg-gray-100 dark:bg-gray-800 rounded" />
                </div>
                <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center">
                  <span className="bg-white dark:bg-slate-800 shadow-lg px-4 py-2 rounded-full text-xs font-bold text-slate-500 dark:text-slate-300 border border-gray-200 dark:border-gray-700">
                    Preview Halaman 1 dari 12
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
