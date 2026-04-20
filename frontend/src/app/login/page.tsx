'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  // Redirect to admin panel if already logged in
  useEffect(() => {
    const token = localStorage.getItem('re_valid_token');
    if (token) router.replace('/admin');
  }, [router]);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(
        '/api/v1/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.detail ?? 'Terjadi kesalahan, coba lagi.');
        return;
      }

      const data = await res.json();
      localStorage.setItem('re_valid_token', data.access_token);
      localStorage.setItem('re_valid_username', data.username);
      localStorage.setItem('re_valid_role', data.role);

      router.push('/admin');
    } catch {
      setError('Tidak dapat terhubung ke server. Periksa koneksi Anda.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-background-dark text-gray-100 h-screen overflow-hidden flex flex-col antialiased font-display">
      <main className="w-full h-screen grid grid-cols-1 lg:grid-cols-2">

        {/* Left — hero panel (visual only, no external image) */}
        <div className="relative hidden lg:flex flex-col justify-end h-full w-full bg-black overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Pemandangan danau pegunungan yang tenang mencerminkan langit"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-105"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBmgZWTV0QPKkaMChKCBysj-qWROZjNwB2SIwPf2x8c-thzVE0b8UEROXlpxb07HlBQelibAAY4PYN5BYQf30GPiwru9ty37DPeemNzeyWlMvdOg445ktKPKn5kkLploDSAjyW-B4ZojRXY_yNuKUI4uEwnb8Pk1loiX1xP2AI9LTWMywpLEzGrgy1N6KtiCS4qYF835M2P_lzzVR--45sOWPWj9GBKzV6_hQ9JxYHvdFnnVmEM1l25s1nd-Nbg6JiK8iFGtt7HsUQb"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent" />

          <div className="relative z-10 p-10 w-full">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-primary text-[24px]">bolt</span>
              <span className="text-white font-bold text-lg tracking-tight">RE-Valid</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-3 leading-tight">
              Validasi Potensi EBT Berbasis WebGIS untuk Jawa Barat
            </h1>
            <p className="text-gray-300 text-sm leading-relaxed max-w-md">
              Platform Sistem Pendukung Keputusan untuk validasi potensi angin dan surya
              menggunakan data lapangan, analisis statistik MCP/R², peta interaktif PostGIS,
              dan pemodelan kelayakan LCOE/NPV.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {[
                { icon: 'air', label: 'Angin', color: 'text-sky-400' },
                { icon: 'wb_sunny', label: 'Surya', color: 'text-amber-400' },
                { icon: 'map', label: 'WebGIS', color: 'text-emerald-400' },
                { icon: 'analytics', label: 'MCP / R²', color: 'text-violet-400' },
              ].map((b) => (
                <span key={b.label} className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-xs text-gray-200">
                  <span className={`material-symbols-outlined text-[14px] ${b.color}`}>{b.icon}</span>
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right — login form */}
        <div className="flex flex-col justify-center items-center w-full h-full bg-white dark:bg-surface-dark p-6 sm:p-10 lg:p-16 border-l border-gray-200 dark:border-border-dark overflow-y-auto">
          <div className="w-full max-w-md mx-auto">

            {/* Logo */}
            <div className="flex items-center gap-3 mb-8">
              <div className="size-9 flex items-center justify-center rounded-xl bg-primary/10">
                <span className="material-symbols-outlined text-[24px] text-primary">bolt</span>
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                RE-Valid
              </span>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1.5">
                Masuk
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Gunakan akun yang telah diberikan administrator.
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div className="mb-4 flex items-center gap-2.5 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="username">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-gray-400 text-[20px]">person</span>
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    className="block w-full pl-10 pr-3 py-3 bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary focus:border-transparent text-sm transition-shadow"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="password">
                  Kata Sandi
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-gray-400 text-[20px]">lock</span>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full pl-10 pr-10 py-3 bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary focus:border-transparent text-sm transition-shadow"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-300 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:focus:ring-offset-surface-dark transition-colors"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    Memproses…
                  </>
                ) : (
                  <>
                    Masuk
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500">
              Hubungi administrator jika belum memiliki akun.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

