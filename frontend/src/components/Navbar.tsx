'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

const navItems = [
  { href: '/', label: 'Beranda' },
  { href: '/peta', label: 'Peta Utama' },
  { href: '/analisis', label: 'Analisis Lokasi' },
  { href: '/kalkulator', label: 'Kalkulator' },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [loginHref, setLoginHref] = useState('/login');

  useEffect(() => {
    const check = () => {
      const token = localStorage.getItem('re_valid_token');
      setIsLoggedIn(!!token);
    };
    check();
    window.addEventListener('storage', check);
    // Tangkap perubahan auth dari tab yang sama (login/logout/401)
    window.addEventListener('re_valid_auth_change', check);

    // Read initial theme
    const saved = localStorage.getItem('re_valid_theme');
    setIsDark(saved !== 'light');

    const current = `${window.location.pathname}${window.location.search}`;
    const returnTo = current.startsWith('/login') ? '/admin' : current;
    setLoginHref(`/login?returnTo=${encodeURIComponent(returnTo)}`);

    return () => {
      window.removeEventListener('storage', check);
      window.removeEventListener('re_valid_auth_change', check);
    };
  }, []);

  function handleLogout() {
    localStorage.removeItem('re_valid_token');
    localStorage.removeItem('re_valid_username');
    localStorage.removeItem('re_valid_role');
    setIsLoggedIn(false);
    setMobileMenuOpen(false);
    router.push('/login');
  }

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('re_valid_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('re_valid_theme', 'light');
    }
  }

  return (
    <header className="relative h-14 flex-none flex items-center justify-between whitespace-nowrap border-b border-slate-300 dark:border-[#233648] bg-white dark:bg-[#111a22] px-4 lg:px-8 z-50">
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
                      : 'text-slate-500 dark:text-text-secondary text-[13px] font-medium hover:text-slate-900 dark:hover:text-white transition-colors'
                  }
                >
                  {item.label}
                </Link>
                {isActive && (
                  <div className="absolute -bottom-3.75 w-full h-0.5 bg-primary rounded-t-full" />
                )}
              </div>
            );
          })}
        </nav>

        <div className="h-5 w-px bg-slate-300 dark:bg-slate-700 mx-1 hidden md:block" />

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-slate-500 dark:text-text-secondary hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#233648] transition-colors"
            aria-label="Toggle theme"
          >
            <span className="material-symbols-outlined text-[20px]">
              {isDark ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
          <Link
            href={isLoggedIn ? '/admin' : loginHref}
            className="text-[13px] bg-primary hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            {isLoggedIn ? 'Admin' : 'Masuk'}
          </Link>
          {isLoggedIn && (
            <button
              onClick={handleLogout}
              className="text-[13px] border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:text-red-500 dark:hover:text-red-400 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors font-medium"
              aria-label="Keluar"
            >
              Keluar
            </button>
          )}
        </div>
      </div>

      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileMenuOpen(v => !v)}
        className="md:hidden ml-4 p-1 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#233648] rounded-lg transition-colors"
        aria-label="Toggle menu"
      >
        <span className="material-symbols-outlined text-[24px]">{mobileMenuOpen ? 'close' : 'menu'}</span>
      </button>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-14 left-0 right-0 bg-white dark:bg-[#111a22] border-b border-slate-200 dark:border-[#233648] z-50 shadow-xl">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-4 py-3 text-[13px] font-medium border-b border-slate-100 dark:border-[#1e2d3d] last:border-0 transition-colors ${
                  isActive
                    ? 'text-primary bg-primary/5 font-bold'
                    : 'text-slate-600 dark:text-text-secondary hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#192633]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 dark:border-[#233648]">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-text-secondary border border-slate-200 dark:border-[#233648] rounded-lg px-3 py-2 font-medium hover:bg-slate-50 dark:hover:bg-[#192633] transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">
                {isDark ? 'light_mode' : 'dark_mode'}
              </span>
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </button>
            <Link
              href={isLoggedIn ? '/admin' : loginHref}
              onClick={() => setMobileMenuOpen(false)}
              className="flex-1 text-center text-[13px] bg-primary hover:bg-blue-600 text-white px-3 py-2 rounded-lg transition-colors font-medium"
            >
              {isLoggedIn ? 'Admin' : 'Masuk'}
            </Link>
            {isLoggedIn && (
              <button
                onClick={handleLogout}
                className="text-[13px] border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:text-red-500 dark:hover:text-red-400 hover:border-red-400 px-3 py-2 rounded-lg transition-colors font-medium"
              >
                Keluar
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
