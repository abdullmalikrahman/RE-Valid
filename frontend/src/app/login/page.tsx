'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="bg-gray-100 dark:bg-[#0B1116] text-gray-900 dark:text-gray-100 h-screen overflow-hidden flex flex-col antialiased font-display">
      <main className="w-full h-screen grid grid-cols-1 lg:grid-cols-2">
        {/* Left — hero panel */}
        <div className="relative hidden lg:flex flex-col justify-end h-full w-full bg-black overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Pemandangan danau pegunungan yang tenang mencerminkan langit"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-105"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBmgZWTV0QPKkaMChKCBysj-qWROZjNwB2SIwPf2x8c-thzVE0b8UEROXlpxb07HlBQelibAAY4PYN5BYQf30GPiwru9ty37DPeemNzeyWlMvdOg445ktKPKn5kkLploDSAjyW-B4ZojRXY_yNuKUI4uEwnb8Pk1loiX1xP2AI9LTWMywpLEzGrgy1N6KtiCS4qYF835M2P_lzzVR--45sOWPWj9GBKzV6_hQ9JxYHvdFnnVmEM1l25s1nd-Nbg6JiK8iFGtt7HsUQb"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
          <div className="relative z-10 p-10 w-full">
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-primary text-[22px]">bolt</span>
              <span className="text-white font-bold text-base tracking-tight">RE-Valid</span>
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
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-xs text-gray-200">
                <span className="material-symbols-outlined text-[14px] text-sky-400">air</span>
                Angin
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-xs text-gray-200">
                <span className="material-symbols-outlined text-[14px] text-amber-400">wb_sunny</span>
                Surya
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-xs text-gray-200">
                <span className="material-symbols-outlined text-[14px] text-emerald-400">map</span>
                WebGIS
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-xs text-gray-200">
                <span className="material-symbols-outlined text-[14px] text-violet-400">analytics</span>
                MCP / R²
              </span>
            </div>
          </div>
        </div>

        {/* Right — login form */}
        <div className="flex flex-col justify-center items-center w-full h-full bg-white dark:bg-[#161B22] p-6 sm:p-10 lg:p-16 relative border-l border-gray-200 dark:border-[#30363D] overflow-y-auto">
          <div className="w-full max-w-md mx-auto">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-6">
              <div className="size-9 flex items-center justify-center rounded-xl bg-primary/10">
                <span className="material-symbols-outlined text-[24px] text-primary">bolt</span>
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                RE-Valid
              </span>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1.5">
                Akses Portal
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Masuk untuk menggunakan platform RE-Valid.
              </p>
            </div>

            <form action="#" className="space-y-4" method="POST">
              {/* Email field */}
              <div className="space-y-2">
                <label
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  htmlFor="email"
                >
                  Email atau Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-gray-400 text-[20px]">mail</span>
                  </div>
                  <input
                    className="block w-full pl-10 pr-3 py-3 bg-gray-50 dark:bg-[#0D1117] border border-gray-300 dark:border-[#30363D] rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary focus:border-transparent text-sm transition-shadow"
                    id="email"
                    name="email"
                    placeholder="user@re-valid.id"
                    type="text"
                  />
                </div>
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <label
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  htmlFor="password"
                >
                  Kata Sandi
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-gray-400 text-[20px]">lock</span>
                  </div>
                  <input
                    className="block w-full pl-10 pr-10 py-3 bg-gray-50 dark:bg-[#0D1117] border border-gray-300 dark:border-[#30363D] rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary focus:border-transparent text-sm transition-shadow"
                    id="password"
                    name="password"
                    placeholder="••••••••"
                    type={showPassword ? 'text' : 'password'}
                  />
                  <div
                    className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    <span className="material-symbols-outlined text-gray-400 text-[20px] hover:text-gray-300">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Remember + Forgot */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center">
                  <input
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-[#0D1117]"
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                  />
                  <label
                    className="ml-2 block text-sm text-gray-600 dark:text-gray-400"
                    htmlFor="remember-me"
                  >
                    Ingat saya
                  </label>
                </div>
                <div className="text-sm">
                  <Link
                    href="#"
                    className="font-medium text-primary hover:text-blue-500"
                  >
                    Lupa Kata Sandi?
                  </Link>
                </div>
              </div>

              <button
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-primary hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:focus:ring-offset-[#161B22] transition-colors"
                type="submit"
              >
                Masuk
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </form>

            <div className="mt-5 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Belum punya akun?{' '}
                <Link href="#" className="font-medium text-primary hover:text-blue-500">
                  Minta Akses
                </Link>
              </p>
            </div>

            <div className="mt-5 text-center border-t border-gray-200 dark:border-[#30363D] pt-4">
              <p className="text-xs text-gray-400 dark:text-gray-500 leading-tight">
                Dilindungi oleh RE-Valid. Dengan masuk, Anda menyetujui{' '}
                <Link href="#" className="underline hover:text-gray-300">
                  Ketentuan Layanan
                </Link>{' '}
                dan{' '}
                <Link href="#" className="underline hover:text-gray-300">
                  Kebijakan Privasi
                </Link>{' '}
                kami.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
