import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const features = [
  {
    href: '/peta',
    icon: 'map',
    title: 'Peta Utama',
    desc: 'Visualisasi spasial stasiun meteorologi dan potensi EBT berbasis WebGIS.',
    color: 'text-sky-500 dark:text-sky-400',
    border: 'border-sky-800',
  },
  {
    href: '/analisis',
    icon: 'bar_chart',
    title: 'Analisis Lokasi',
    desc: 'Validasi data angin & surya, time-series, scatter plot, dan metrik MCP.',
    color: 'text-violet-500 dark:text-violet-400',
    border: 'border-violet-800',
  },
  {
    href: '/kalkulator',
    icon: 'calculate',
    title: 'Kalkulator EBT',
    desc: 'Simulasi screening LCOE, NPV, dan kelayakan ekonomi proyek energi.',
    color: 'text-emerald-500 dark:text-emerald-400',
    border: 'border-emerald-800',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-white flex flex-col font-display">
      <Navbar />

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-14 text-center">
        <div className="mb-5 inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-full text-xs text-primary font-medium">
          <span className="material-symbols-outlined text-[14px]">energy_savings_leaf</span>
          Platform Validasi Energi Terbarukan &mdash; Jawa Barat
        </div>

        <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight mb-3 max-w-2xl leading-tight">
          Sistem Pendukung Keputusan{' '}
          <span className="text-primary">EBT</span> Berbasis WebGIS
        </h1>
        <p className="text-sm text-text-secondary max-w-xl mb-8">
          Validasi potensi angin dan surya menggunakan data lapangan, analisis statistik
          MCP/R&sup2;, dan pemodelan ekonomi untuk perencanaan proyek energi terbarukan.
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
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-card-dark hover:bg-gray-50 dark:hover:bg-panel-dark text-slate-900 dark:text-white font-semibold rounded-xl border border-gray-200 dark:border-border-dark transition-all text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">analytics</span>
            Mulai Analisis
          </Link>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl w-full">
          {features.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="group p-4 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark hover:border-primary text-left transition-all hover:shadow-lg"
            >
              <span className={`material-symbols-outlined text-[22px] mb-2 block ${f.color}`}>
                {f.icon}
              </span>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                {f.title}
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">{f.desc}</p>
            </Link>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
