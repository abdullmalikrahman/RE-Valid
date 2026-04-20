'use client';

import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStations } from '@/hooks/useStations';

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('re_valid_token') ?? '';
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Local editable station shape
type AdminStation = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: string;
  altitude: number;
  status: 'prioritas' | 'kandidat' | 'tidak_sesuai';
  score: number;
  mcpStatus: string;
  windSpeed: number;
  irradiation: number;
  lastUpdate: string;
};

// Status badge
function StatusBadge({ status }: { status: string }) {
  if (status === 'prioritas') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
        <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-green-500" />
        Prioritas
      </span>
    );
  }
  if (status === 'kandidat') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">
        <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-yellow-500 animate-pulse" />
        Kandidat
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
      <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-gray-500" />
      Tidak Sesuai
    </span>
  );
}

// Determines if a station has sent data recently (within 24 h)
function isRecentlyActive(lastUpdate: string): boolean {
  const parsed = new Date(lastUpdate);
  if (isNaN(parsed.getTime())) return false;
  return Date.now() - parsed.getTime() < 24 * 60 * 60 * 1000;
}

//  Add / Edit Modal
type ModalProps = {
  station: AdminStation | null; // null = add mode
  onClose: () => void;
  onSave: (data: Omit<AdminStation, 'score' | 'windSpeed' | 'irradiation' | 'lastUpdate' | 'mcpStatus'> & { score: number }) => Promise<string | undefined>;
};

function StationModal({ station, onClose, onSave }: ModalProps) {
  const [form, setForm] = useState({
    id: station?.id ?? '',
    name: station?.name ?? '',
    lat: station?.lat ?? -7.0,
    lon: station?.lon ?? 107.5,
    region: station?.region ?? '',
    altitude: station?.altitude ?? 0,
    status: station?.status ?? 'kandidat' as const,
    score: station?.score ?? 50,
  });

  const isEdit = station !== null;
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !isSaving) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, isSaving]);

  async function handleSubmit() {
    setSaveError(null);
    setIsSaving(true);
    try {
      const error = await onSave(form);
      if (error) setSaveError(error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-border-dark shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-border-dark">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Stasiun' : 'Tambah Stasiun Baru'}
          </h3>
          <button onClick={onClose} disabled={isSaving} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Kode Stasiun</label>
              <input
                disabled={isEdit}
                className="bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="GWY-089"
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</label>
              <select
                className="bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as AdminStation['status'] })}
              >
                <option value="prioritas">Prioritas</option>
                <option value="kandidat">Kandidat</option>
                <option value="tidak_sesuai">Tidak Sesuai</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nama Stasiun</label>
            <input
              className="bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary"
              placeholder="Pos Pegunungan Wayang"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Wilayah</label>
            <input
              className="bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary"
              placeholder="Bandung Selatan, Jawa Barat"
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Latitude</label>
              <input
                className="bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary font-mono"
                step="0.0001" type="number"
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Longitude</label>
              <input
                className="bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary font-mono"
                step="0.0001" type="number"
                value={form.lon}
                onChange={(e) => setForm({ ...form, lon: Number(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Altitude (m)</label>
              <input
                className="bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary"
                type="number"
                value={form.altitude}
                onChange={(e) => setForm({ ...form, altitude: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Skor GIS-MCDA (0–100)</label>
            <div className="flex items-center gap-3">
              <input className="flex-1" max="100" min="0" type="range" value={form.score} onChange={(e) => setForm({ ...form, score: Number(e.target.value) })} />
              <span className="w-10 text-right text-sm font-bold text-gray-900 dark:text-white">{form.score}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          {saveError && (
            <div className="mb-0 -mt-2 w-full px-1">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs">
                <span className="material-symbols-outlined text-[15px] shrink-0">error</span>
                <span className="flex-1">{saveError}</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 h-10 rounded-lg border border-gray-300 dark:border-border-dark text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex-1 h-10 rounded-lg bg-primary hover:bg-blue-600 disabled:opacity-70 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <><span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>Menyimpan...</>
            ) : (
              isEdit ? 'Simpan Perubahan' : 'Tambah Stasiun'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

//  Main Page
export default function AdminPage() {
  const router = useRouter();
  const { stations: initialStations, mutate } = useStations();

  // Auth guard — redirect to login if no token
  const [adminUsername, setAdminUsername] = useState('');
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    setAdminUsername(localStorage.getItem('re_valid_username') ?? 'Admin');
  }, [router]);
  const stationList: AdminStation[] = initialStations.map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    region: s.region,
    altitude: s.altitude,
    status: s.status as AdminStation['status'],
    score: s.score,
    mcpStatus: s.mcpStatus,
    windSpeed: s.windSpeed,
    irradiation: s.irradiation,
    lastUpdate: s.lastUpdate,
  }));

  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editStation, setEditStation] = useState<AdminStation | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [crudError, setCrudError] = useState<string | null>(null);

  // CSV upload state
  const [csvStation, setCsvStation] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Derived
  const filtered = stationList.filter((s) => {
    const matchQuery =
      !query ||
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.id.toLowerCase().includes(query.toLowerCase());
    const matchStatus = !filterStatus || s.status === filterStatus;
    return matchQuery && matchStatus;
  });

  const counts = {
    total: stationList.length,
    prioritas: stationList.filter((s) => s.status === 'prioritas').length,
    kandidat: stationList.filter((s) => s.status === 'kandidat').length,
    tidak: stationList.filter((s) => s.status === 'tidak_sesuai').length,
  };

  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

  // Handlers
  async function handleSave(form: Parameters<ModalProps['onSave']>[0]): Promise<string | undefined> {
    try {
      if (editStation) {
        const res = await fetch(`${API}/api/v1/stations/${editStation.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const json = await res.json();
          return json.detail ?? 'Gagal menyimpan perubahan';
        }
        setEditStation(null);
      } else {
        const res = await fetch(`${API}/api/v1/stations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const json = await res.json();
          return json.detail ?? 'Gagal menambah stasiun';
        }
        setShowAddModal(false);
      }
      await mutate();
      return undefined;
    } catch {
      return 'Tidak dapat terhubung ke server.';
    }
  }

  async function handleDelete(id: string) {
    setCrudError(null);
    try {
      const res = await fetch(`${API}/api/v1/stations/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok && res.status !== 204) {
        const json = await res.json();
        setCrudError(json.detail ?? 'Gagal menghapus stasiun');
        return;
      }
      setDeleteId(null);
      await mutate();
    } catch {
      setCrudError('Tidak dapat terhubung ke server.');
    }
  }

  function handleExport() {
    const header = ['id', 'name', 'lat', 'lon', 'region', 'altitude', 'status', 'score'];
    const rows = filtered.map((s) =>
      [s.id, `"${s.name}"`, s.lat, s.lon, `"${s.region}"`, s.altitude, s.status, s.score].join(',')
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stasiun_re-valid.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLogout() {
    localStorage.removeItem('re_valid_token');
    localStorage.removeItem('re_valid_username');
    localStorage.removeItem('re_valid_role');
    router.push('/login');
  }

  async function handleCsvUpload() {
    if (!csvStation || !csvFile) return;
    setCsvUploading(true);
    setCsvResult(null);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      const res = await fetch(
        `${API}/api/v1/measurements/upload?station_id=${encodeURIComponent(csvStation)}`,
        { method: 'POST', body: formData, headers: authHeaders() },
      );
      const json = await res.json();
      if (!res.ok) {
        const detail = json.detail?.message ?? json.detail ?? 'Upload gagal';
        setCsvResult({ type: 'error', message: typeof detail === 'string' ? detail : JSON.stringify(detail) });
      } else {
        setCsvResult({
          type: 'success',
          message: `Berhasil: ${json.inserted} baris dimasukkan, ${json.skipped} baris dilewati (duplikat).${json.parse_errors?.length ? ` ${json.parse_errors.length} baris error.` : ''}`,
        });
        setCsvFile(null);
        if (csvInputRef.current) csvInputRef.current.value = '';
      }
    } catch {
      setCsvResult({ type: 'error', message: 'Tidak dapat terhubung ke server. Pastikan FastAPI sedang berjalan.' });
    } finally {
      setCsvUploading(false);
    }
  }

  return (
    <div className="bg-gray-100 dark:bg-background-dark text-gray-900 dark:text-gray-100 min-h-screen flex overflow-hidden antialiased font-display">
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 h-screen w-64 bg-white dark:bg-surface-dark border-r border-gray-200 dark:border-border-dark hidden md:flex flex-col z-20">
        <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-border-dark">
          <Link href="/" className="flex items-center gap-0">
            <span className="material-symbols-outlined text-primary mr-2">bolt</span>
            <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">RE-Valid</span>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <Link href="/" className="group flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all">
            <span className="material-symbols-outlined mr-3 text-[20px]">dashboard</span>
            Dashboard
          </Link>
          <Link href="/admin" className="group flex items-center px-3 py-2.5 text-sm font-medium bg-primary/10 text-primary rounded-lg transition-all">
            <span className="material-symbols-outlined mr-3 text-[20px]">location_on</span>
            Data Lokasi
          </Link>
          <Link href="/analisis" className="group flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all">
            <span className="material-symbols-outlined mr-3 text-[20px]">bar_chart</span>
            Metrik Validasi
          </Link>
          <Link href="/peta" className="group flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all">
            <span className="material-symbols-outlined mr-3 text-[20px]">map</span>
            Peta Potensi (GIS)
          </Link>
        </nav>
        <div className="p-4 border-t border-gray-200 dark:border-border-dark">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold">{adminUsername.slice(0, 2).toUpperCase() || 'AD'}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{adminUsername || 'Admin'}</p>
              <p className="text-xs text-gray-500 truncate">Administrator</p>
            </div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300" title="Keluar">
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-64">
        {/* Top header */}
        <header className="h-16 fixed top-0 left-64 right-0 z-10 hidden md:flex items-center justify-between px-4 sm:px-6 lg:px-8 bg-white dark:bg-surface-dark border-b border-gray-200 dark:border-border-dark">
          <div className="flex items-center gap-4">
            <button className="md:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <nav className="hidden sm:flex" aria-label="Breadcrumb">
              <ol className="flex items-center space-x-2" role="list">
                <li><span className="text-sm font-medium text-gray-500 dark:text-gray-400">Admin</span></li>
                <li><span className="text-gray-300 dark:text-gray-600">/</span></li>
                <li><span className="text-sm font-medium text-primary" aria-current="page">Lokasi Pengukuran</span></li>
              </ol>
            </nav>
          </div>
          <div className="flex items-center gap-4" />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto mt-16 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* CRUD error banner */}
            {crudError && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span className="flex-1">{crudError}</span>
                <button onClick={() => setCrudError(null)} className="shrink-0 text-red-400 hover:text-red-600">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            )}
            {/* Page title + actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pengelolaan Lokasi</h1>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Kelola daftar stasiun meteorologi dan parameter geografis.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleExport}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-surface-dark border border-gray-300 dark:border-border-dark rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Ekspor Data
                </button>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">add</span>
                  Tambah Lokasi
                </button>
              </div>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Stasiun', value: counts.total, icon: 'sensors', color: 'text-primary', bg: 'bg-primary/10' },
                { label: 'Prioritas', value: counts.prioritas, icon: 'check_circle', color: 'text-green-500', bg: 'bg-green-500/10' },
                { label: 'Kandidat', value: counts.kandidat, icon: 'pending', color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
                { label: 'Tidak Sesuai', value: counts.tidak, icon: 'cancel', color: 'text-gray-400', bg: 'bg-gray-500/10' },
              ].map((card) => (
                <div key={card.label} className="bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-border-dark p-4 flex items-center gap-4">
                  <div className={`size-10 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                    <span className={`material-symbols-outlined ${card.color} text-[22px]`}>{card.icon}</span>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-gray-900 dark:text-white">{card.value}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{card.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Search + filter */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-6 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-gray-400 text-[20px]">search</span>
                </div>
                <input
                  className="block w-full pl-10 pr-3 py-2.5 bg-white dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="Cari berdasarkan nama stasiun atau kode..."
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="md:col-span-4">
                <select
                  className="block w-full py-2.5 px-3 bg-white dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary focus:border-primary"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="">Semua Status</option>
                  <option value="prioritas">Prioritas</option>
                  <option value="kandidat">Kandidat</option>
                  <option value="tidak_sesuai">Tidak Sesuai</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <button
                  onClick={() => { setQuery(''); setFilterStatus(''); }}
                  className="w-full h-full flex items-center justify-center gap-1 bg-white dark:bg-surface-dark border border-gray-300 dark:border-border-dark rounded-lg text-gray-500 hover:text-primary hover:border-primary transition-colors text-xs font-medium py-2"
                >
                  <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
                  Reset
                </button>
              </div>
            </div>

            {/* Stations table */}
            <div className="bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-border-dark overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-border-dark">
                  <thead className="bg-gray-50 dark:bg-black/20">
                    <tr>
                      {['Nama Stasiun', 'Wilayah', 'Koordinat', 'Angin', 'GHI', 'Skor', 'Status', 'Aksi'].map((col, i) => (
                        <th key={col} scope="col" className={`px-5 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${i === 7 ? 'text-right' : 'text-left'}`}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-border-dark">
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                          <span className="material-symbols-outlined text-[40px] mb-2 block text-gray-300">search_off</span>
                          Tidak ada stasiun yang cocok dengan filter
                        </td>
                      </tr>
                    )}
                    {filtered.map((station) => (
                      <tr key={station.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-primary mr-3 shrink-0">
                              <span className="material-symbols-outlined text-[18px]">sensors</span>
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-900 dark:text-white">{station.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">ID: {station.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300 max-w-35 truncate">{station.region}</td>
                        <td className="px-5 py-4 whitespace-nowrap text-xs font-mono text-gray-600 dark:text-gray-300">
                          {station.lat.toFixed(4)}, {station.lon.toFixed(4)}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                          <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px] text-blue-400">air</span>
                            {station.windSpeed} m/s
                          </div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                          <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px] text-amber-400">wb_sunny</span>
                            {station.irradiation} kWh/m²/hr
                          </div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${station.score >= 80 ? 'bg-green-500' : station.score >= 60 ? 'bg-yellow-500' : 'bg-gray-400'}`}
                                style={{ width: `${station.score}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-900 dark:text-white">{station.score}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <StatusBadge status={station.status} />
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/analisis?station=${station.id}`}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                              title="Lihat Analisis"
                            >
                              <span className="material-symbols-outlined text-[18px]">bar_chart</span>
                            </Link>
                            <button
                              onClick={() => setEditStation(station)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                              title="Edit"
                            >
                              <span className="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                            {deleteId === station.id ? (
                              <div className="flex items-center gap-1 ml-1">
                                <button
                                  onClick={() => handleDelete(station.id)}
                                  className="px-2 py-1 rounded text-xs font-bold bg-red-500 hover:bg-red-600 text-white transition-colors"
                                >
                                  Hapus
                                </button>
                                <button
                                  onClick={() => setDeleteId(null)}
                                  className="px-2 py-1 rounded text-xs font-medium border border-gray-300 dark:border-border-dark text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteId(station.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                title="Hapus"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 flex items-center justify-between border-t border-gray-200 dark:border-border-dark bg-white dark:bg-surface-dark">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Menampilkan <span className="font-semibold text-gray-900 dark:text-white">{filtered.length}</span> dari{' '}
                  <span className="font-semibold text-gray-900 dark:text-white">{stationList.length}</span> stasiun
                </p>
                <p className="text-xs text-gray-400">Tersimpan di database</p>
              </div>
            </div>

            {/* MQTT Status table */}
            <div className="bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-border-dark overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-border-dark flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">sensors</span>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">Status MQTT Stasiun</h2>
                </div>
                <span className="text-xs text-gray-400">Live dari database</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-border-dark text-sm">
                  <thead className="bg-gray-50 dark:bg-black/20">
                    <tr>
                      {['Stasiun', 'Topik MQTT', 'Data Terakhir', 'Frekuensi', 'Status'].map((col) => (
                        <th key={col} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-border-dark">
                    {stationList.map((s) => {
                      const online = isRecentlyActive(s.lastUpdate);
                      return (
                        <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                          <td className="px-6 py-3">
                            <div>
                              <p className="font-mono text-xs text-gray-900 dark:text-white font-semibold">{s.id}</p>
                              <p className="text-[11px] text-gray-400 truncate max-w-30">{s.name}</p>
                            </div>
                          </td>
                          <td className="px-6 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">stations/{s.id}/data</td>
                          <td className="px-6 py-3 text-xs text-gray-600 dark:text-gray-300">{s.lastUpdate}</td>
                          <td className="px-6 py-3 text-xs text-gray-600 dark:text-gray-300">{online ? '~3 dtk' : '—'}</td>
                          <td className="px-6 py-3">
                            {online ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Online
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />Offline
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CSV Upload */}
            <div className="bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-border-dark overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-border-dark flex items-center gap-2">
                <span className="material-symbols-outlined text-green-400 text-[20px]">upload_file</span>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Upload Data CSV</h2>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: form */}
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pilih Stasiun</label>
                    <select
                      value={csvStation}
                      onChange={(e) => { setCsvStation(e.target.value); setCsvResult(null); }}
                      className="bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary"
                    >
                      <option value="">-- Pilih stasiun --</option>
                      {stationList.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">File CSV</label>
                    <input
                      ref={csvInputRef}
                      type="file"
                      accept=".csv"
                      onChange={(e) => { setCsvFile(e.target.files?.[0] ?? null); setCsvResult(null); }}
                      className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg"
                    />
                    {csvFile && (
                      <p className="text-xs text-gray-400">{csvFile.name} · {(csvFile.size / 1024).toFixed(1)} KB</p>
                    )}
                  </div>
                  <button
                    onClick={handleCsvUpload}
                    disabled={!csvStation || !csvFile || csvUploading}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {csvUploading
                      ? <><span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>Mengunggah...</>
                      : <><span className="material-symbols-outlined text-[18px]">cloud_upload</span>Upload &amp; Simpan ke Database</>
                    }
                  </button>
                  {csvResult && (
                    <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${csvResult.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                      <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">{csvResult.type === 'success' ? 'check_circle' : 'error'}</span>
                      <span>{csvResult.message}</span>
                    </div>
                  )}
                </div>
                {/* Right: format guide */}
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Format CSV yang Diterima</p>
                  <div className="bg-gray-50 dark:bg-input-bg-dark rounded-lg p-4 border border-gray-200 dark:border-border-dark overflow-x-auto">
                    <pre className="text-[11px] text-gray-600 dark:text-green-400 font-mono leading-relaxed whitespace-pre">{`measured_at,wind_speed,wind_dir,ghi,dni,temperature,humidity,pressure
2024-01-01T00:00:00,5.2,180,350.5,290.0,25.3,78.0,1012.5
2024-01-02T00:00:00,6.1,175,380.0,310.0,26.1,75.0,1011.0`}</pre>
                  </div>
                  <ul className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <li className="flex items-start gap-1.5"><span className="text-primary font-bold shrink-0">•</span><span><code className="text-primary">measured_at</code> — wajib, format ISO-8601 (misal <code>2024-01-01T00:00:00</code>)</span></li>
                    <li className="flex items-start gap-1.5"><span className="text-gray-400 font-bold shrink-0">•</span><span><code className="text-gray-400">wind_speed</code> m/s · <code className="text-gray-400">wind_dir</code> derajat (0–360)</span></li>
                    <li className="flex items-start gap-1.5"><span className="text-gray-400 font-bold shrink-0">•</span><span><code className="text-gray-400">ghi</code> / <code className="text-gray-400">dni</code> W/m² · <code className="text-gray-400">temperature</code> °C · <code className="text-gray-400">humidity</code> % · <code className="text-gray-400">pressure</code> hPa</span></li>
                    <li className="flex items-start gap-1.5"><span className="text-gray-400 font-bold shrink-0">•</span><span>Kolom numerik bersifat opsional — kosongkan jika tidak ada data</span></li>
                    <li className="flex items-start gap-1.5"><span className="text-gray-400 font-bold shrink-0">•</span><span>Baris duplikat (stasiun + tanggal sama) otomatis dilewati</span></li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-6 border-t border-gray-200 dark:border-border-dark">
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">© 2026 RE-Valid · Sistem Pendukung Keputusan Potensi EBT Jawa Barat</p>
            </div>
          </div>
        </main>
      </div>

      {/* Add / Edit modal */}
      {(showAddModal || editStation !== null) && (
        <StationModal
          station={editStation}
          onClose={() => { setShowAddModal(false); setEditStation(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

