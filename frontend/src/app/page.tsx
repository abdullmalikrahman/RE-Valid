import Link from 'next/link';

const features = [
  {
    href: '/peta',
    icon: 'map',
    title: 'Peta Utama',
    desc: 'Visualisasi spasial stasiun meteorologi, atlas angin/surya, dan prioritas GIS-MCDA di Jawa Barat.',
    color: 'text-sky-400',
    border: 'border-sky-800',
  },
  {
    href: '/analisis',
    icon: 'bar_chart',
    title: 'Analisis Lokasi',
    desc: 'Validasi data angin & surya, time-series, scatter plot, dan metrik MCP.',
    color: 'text-violet-400',
    border: 'border-violet-800',
  },
  {
    href: '/kalkulator',
    icon: 'calculate',
    title: 'Kalkulator EBT',
    desc: 'Estimasi AEP, LCOE kasar, dan indikator ekonomi awal (pre-feasibility) proyek EBT.',
    color: 'text-emerald-400',
    border: 'border-emerald-800',
  },
  {
    href: '/laporan',
    icon: 'description',
    title: 'Unduh Laporan',
    desc: 'Ekspor laporan validasi dalam format PDF, CSV, atau GeoJSON.',
    color: 'text-amber-400',
    border: 'border-amber-800',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background-dark text-white flex flex-col">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-8 border-b border-border-dark">
        <Link href="/" className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">bolt</span>
          <span className="text-lg font-bold tracking-tight">RE-Valid</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="text-sm text-text-secondary hover:text-white transition-colors"
          >
            Admin
          </Link>
          <Link
            href="/login"
            className="text-sm bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors font-medium"
          >
            Masuk
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-14 text-center">
        <div className="mb-5 inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-full text-xs text-primary font-medium">
          <span className="material-symbols-outlined text-[14px]">energy_savings_leaf</span>
          Platform Validasi Energi Terbarukan &mdash; Jawa Barat
        </div>

        <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight mb-3 max-w-3xl leading-tight">
          Platform WebGIS untuk Validasi Potensi{' '}
          <span className="text-primary">Energi Angin dan Surya</span> di Jawa Barat
        </h1>
        <p className="text-sm text-text-secondary max-w-xl mb-8">
          Validasi data lapangan stasiun meteorologi, analisis statistik MCP/R&sup2;,
          dan indikator energi &amp; ekonomi awal untuk screening lokasi proyek EBT.
        </p>

        <div className="flex gap-3 flex-wrap justify-center mb-12">
          <Link
            href="/peta"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-blue-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-900/30 transition-all text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">map</span>
            Buka Peta
          </Link>
          <Link
            href="/analisis"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-card-dark hover:bg-[#243040] text-white font-semibold rounded-xl border border-border-dark transition-all text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">analytics</span>
            Mulai Analisis
          </Link>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl w-full">
          {features.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="group p-4 bg-card-dark rounded-xl border border-border-dark hover:border-primary text-left transition-all hover:shadow-lg"
            >
              <span className={`material-symbols-outlined text-[22px] mb-2 block ${f.color}`}>
                {f.icon}
              </span>
              <h3 className="text-sm font-semibold text-white mb-1">
                {f.title}
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">{f.desc}</p>
            </Link>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-dark px-8 py-4 flex items-center justify-between">
        <p className="text-xs text-text-secondary">&copy; 2026 RE-Valid. Semua hak dilindungi.</p>
        <div className="flex gap-6 text-xs text-text-secondary">
          <Link href="#" className="hover:text-white transition-colors">Kebijakan Privasi</Link>
          <Link href="#" className="hover:text-white transition-colors">Syarat &amp; Ketentuan</Link>
        </div>
      </footer>
    </div>
  );
}
