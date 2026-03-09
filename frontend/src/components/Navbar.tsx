'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Beranda' },
  { href: '/peta', label: 'Peta Utama' },
  { href: '/analisis', label: 'Analisis Lokasi' },
  { href: '/kalkulator', label: 'Kalkulator' },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="h-14 flex-none flex items-center justify-between whitespace-nowrap border-b border-slate-200 dark:border-[#233648] bg-white dark:bg-[#111a22] px-4 lg:px-8 z-50">
      <Link href="/" className="flex items-center gap-2.5">
        <div className="size-7 flex items-center justify-center rounded-lg bg-primary/10">
          <span className="material-symbols-outlined text-[18px] text-primary">bolt</span>
        </div>
        <h2 className="text-slate-900 dark:text-white text-sm font-bold leading-tight tracking-tight">
          RE-Valid
        </h2>
      </Link>

      <div className="flex flex-1 justify-end gap-6 items-center">
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <div key={item.href} className="relative flex flex-col items-center">
                <Link
                  href={item.href}
                  className={
                    isActive
                      ? 'text-slate-900 dark:text-white text-[13px] font-bold'
                      : 'text-slate-500 dark:text-[#92adc9] text-[13px] font-medium hover:text-slate-900 dark:hover:text-white transition-colors'
                  }
                >
                  {item.label}
                </Link>
                {isActive && (
                  <div className="absolute -bottom-[15px] w-full h-[2px] bg-primary rounded-t-full" />
                )}
              </div>
            );
          })}
        </nav>

        <div className="h-5 w-px bg-slate-700 mx-1 hidden md:block" />

        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="text-[13px] text-slate-500 dark:text-[#92adc9] hover:text-slate-900 dark:hover:text-white transition-colors font-medium"
          >
            Admin
          </Link>
          <Link
            href="/login"
            className="text-[13px] bg-primary hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            Masuk
          </Link>
        </div>
      </div>

      {/* Mobile menu button */}
      <div className="md:hidden text-slate-900 dark:text-white ml-4">
        <span className="material-symbols-outlined">menu</span>
      </div>
    </header>
  );
}
