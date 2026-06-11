'use client';

import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStations } from '@/hooks/useStations';
import { apiFetch } from '@/lib/api';

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
  period: string;
  variables: string;
  mcpStatus: string;
  rmse: number;
  bias: number;
  r2: number;
  windRmse: number | null;
  windBias: number | null;
  windR2: number | null;
  solarRmse: number | null;
  solarBias: number | null;
  solarR2: number | null;
  windSpeed: number;
  irradiation: number;
  windBaseline: number | null;
  ghiBaseline: number | null;
  windBaselineGwa: number | null;
  ghiBaselineGsa: number | null;
  windBaselineNasa: number | null;
  ghiBaselineNasa: number | null;
  aep: number;
  windAep: number | null;
  solarAep: number | null;
  lastUpdate: string;
  lastMeasurementAt: string | null;
  firstMeasurementAt: string | null;
};

type StationFormData = Pick<
  AdminStation,
  | 'id'
  | 'name'
  | 'lat'
  | 'lon'
  | 'region'
  | 'altitude'
  | 'status'
  | 'score'
  | 'windBaseline'
  | 'ghiBaseline'
  | 'windBaselineGwa'
  | 'ghiBaselineGsa'
  | 'windBaselineNasa'
  | 'ghiBaselineNasa'
>;

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

// Format ISO timestamp to human-readable WIB (e.g. "25 Mei 2026, 15:32")
function formatLastUpdate(ts: string): string {
  const parsed = new Date(ts);
  if (isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' WIB';
}

//  Add / Edit Modal
type ModalProps = {
  station: AdminStation | null; // null = add mode
  onClose: () => void;
  onSave: (data: StationFormData) => Promise<string | undefined>;
  onRefresh: () => void; // Dipanggil setelah fetch-atlas agar SWR tabel terupdate
};

function StationModal({ station, onClose, onSave, onRefresh }: ModalProps) {
  const [form, setForm] = useState({
    id: station?.id ?? '',
    name: station?.name ?? '',
    lat: station?.lat ?? -7.0,
    lon: station?.lon ?? 107.5,
    region: station?.region ?? '',
    altitude: station?.altitude ?? 0,
    status: station?.status ?? 'kandidat' as const,
    score: station?.score ?? 50,
    windBaseline: station?.windBaseline ?? null as number | null,
    ghiBaseline: station?.ghiBaseline ?? null as number | null,
    windBaselineGwa: station?.windBaselineGwa ?? null as number | null,
    ghiBaselineGsa: station?.ghiBaselineGsa ?? null as number | null,
    windBaselineNasa: station?.windBaselineNasa ?? null as number | null,
    ghiBaselineNasa: station?.ghiBaselineNasa ?? null as number | null,
  });
  
  const isEdit = station !== null;
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isFetchingAtlas, setIsFetchingAtlas] = useState(false);
  const [atlasMsg, setAtlasMsg] = useState<string | null>(null);
  const [atlasSuccessCount, setAtlasSuccessCount] = useState<number | null>(null);
  const [isGeocodingRegion, setIsGeocodingRegion] = useState(false);
  const [isGeocodingAlt, setIsGeocodingAlt] = useState(false);
  const coordDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reverse geocoding: lat/lon → wilayah + altitude (debounced 900ms)
  // Dua request paralel: Nominatim zoom=18 (wilayah) + OpenTopoData SRTM90m (ketinggian)
  function triggerReverseGeocode(lat: number, lon: number) {
    if (coordDebounceRef.current) clearTimeout(coordDebounceRef.current);
    coordDebounceRef.current = setTimeout(async () => {
      if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) return;

      // ── Request 1: Nominatim reverse geocoding → wilayah ──────────────
      // zoom=18 mengembalikan detail tingkat desa/kelurahan untuk Indonesia
      setIsGeocodingRegion(true);
      fetch(
        'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon + '&zoom=18&accept-language=id',
        { headers: { 'User-Agent': 'RE-Valid/1.0' } }
      )
        .then((r) => r.json())
        .then((data) => {
          const addr = data.address ?? {};
          // Struktur Nominatim untuk Indonesia (hasil test aktual):
          //   village / hamlet / town / neighbourhood → nama desa/kelurahan
          //   city / municipality / county            → kota madya / kabupaten
          //   state                                   → provinsi
          const desa     = addr.village ?? addr.hamlet ?? addr.town ?? addr.neighbourhood ?? '';
          const kabkota  = addr.city ?? addr.municipality ?? addr.county ?? '';
          const provinsi = addr.state ?? '';
          const parts    = [desa, kabkota, provinsi].filter(Boolean);
          if (parts.length > 0) {
            setForm((prev) => ({ ...prev, region: parts.join(', ') }));
          }
        })
        .catch(() => { /* Nominatim gagal — biarkan user isi manual */ })
        .finally(() => setIsGeocodingRegion(false));

      // ── Request 2: open-elevation.com SRTM → altitude ────────────────
      // open-elevation.com menyediakan CORS header (* ) — aman dipanggil dari browser
      // Data bersumber dari SRTM NASA, akurasi ±5–15m, gratis tanpa API key
      setIsGeocodingAlt(true);
      fetch('https://api.open-elevation.com/api/v1/lookup?locations=' + lat + ',' + lon)
        .then((r) => r.json())
        .then((data) => {
          const elev = data?.results?.[0]?.elevation;
          if (elev !== undefined && elev !== null && !isNaN(Number(elev))) {
            setForm((prev) => ({ ...prev, altitude: Math.round(Number(elev)) }));
          }
        })
        .catch(() => { /* OpenTopoData gagal — biarkan 0 */ })
        .finally(() => setIsGeocodingAlt(false));
    }, 900);
  }

  useEffect(() => {
    return () => { if (coordDebounceRef.current) clearTimeout(coordDebounceRef.current); };
  }, []);

  // Ambil nilai baseline atlas dari GWA/GSA/ERA5 via endpoint backend
  async function handleFetchAtlas(overrideId?: string) {
    const targetId = overrideId ?? station?.id;
    if (!targetId) {
      setAtlasMsg('Simpan stasiun dahulu sebelum mengambil data atlas.');
      return;
    }
    setIsFetchingAtlas(true);
    setAtlasMsg(null);
    try {
      const res = await apiFetch(`/api/v1/stations/${targetId}/fetch-atlas`, {
        method: 'POST',
        headers: { ...authHeaders() },
      });
      const json = await res.json();
      if (!res.ok) {
        setAtlasMsg(json.detail ?? 'Gagal mengambil data atlas.');
        return;
      }
      setForm((prev) => ({
        ...prev,
        windBaseline: json.wind_baseline ?? prev.windBaseline,
        ghiBaseline: json.ghi_baseline ?? prev.ghiBaseline,
        windBaselineGwa: json.wind_baseline_gwa ?? prev.windBaselineGwa,
        ghiBaselineGsa: json.ghi_baseline_gsa ?? prev.ghiBaselineGsa,
        windBaselineNasa: json.wind_baseline_nasa ?? prev.windBaselineNasa,
        ghiBaselineNasa: json.ghi_baseline_nasa ?? prev.ghiBaselineNasa,
      }));
      const baselineFields = [
        json.wind_baseline, json.ghi_baseline,
        json.wind_baseline_gwa, json.ghi_baseline_gsa,
        json.wind_baseline_nasa, json.ghi_baseline_nasa,
      ];
      const fetchedCount = baselineFields.filter((v) => v !== null && v !== undefined).length;
      setAtlasSuccessCount(fetchedCount);
      const srcWind = json.wind_baseline_gwa ? 'GWA' : 'ERA5';
      const srcGhi = json.ghi_baseline_gsa ? 'GSA' : 'ERA5';
      setAtlasMsg(`${fetchedCount}/6 data berhasil diambil — Angin: ${json.wind_baseline ?? '-'} m/s (${srcWind}), GHI: ${json.ghi_baseline ?? '-'} kWh/m²/hari (${srcGhi}).`);
    } catch {
      setAtlasMsg('Tidak dapat terhubung ke server.');
    } finally {
      setIsFetchingAtlas(false);
    }
  }

  async function handleSubmit() {
    setSaveError(null);
    if (!form.name.trim()) {
      setSaveError('Nama stasiun tidak boleh kosong.');
      return;
    }
    if (!isEdit && !form.id.trim()) {
      setSaveError('Kode stasiun tidak boleh kosong.');
      return;
    }
    if (!isEdit && !/^[A-Za-z0-9-]{3,10}$/.test(form.id.trim())) {
      setSaveError('Kode stasiun harus 3–10 karakter (huruf, angka, atau tanda hubung).');
      return;
    }
    setIsSaving(true);
    try {
      const newId = !isEdit ? form.id.trim().toUpperCase() : '';
      const error = await onSave(form);
      if (error) { setSaveError(error); return; }
      if (!isEdit) {
        // Otomatis ambil data atlas setelah stasiun berhasil disimpan ke DB
        await handleFetchAtlas(newId);
        // Refresh SWR di parent agar tabel admin langsung memperlihatkan baseline terbaru
        onRefresh();
        // Tunda penutupan 3 detik agar user sempat melihat hasil fetch
        await new Promise((res) => setTimeout(res, 3000));
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-border-dark shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-border-dark">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Stasiun' : 'Tambah Stasiun Baru'}
          </h3>
          <button onClick={onClose} disabled={isSaving} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1">
          {/* Row 1: Kode + Status (edit saja, dihitung sistem saat add) + Nama */}
          <div className={`grid gap-3 ${isEdit ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
            {isEdit && (
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
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nama Stasiun</label>
              <input
                className="bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary"
                placeholder="Pos Pegunungan Wayang"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          </div>

          {/* Row 2: Wilayah + Koordinat */}
          <div className="grid grid-cols-4 gap-3">
            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                Wilayah
                {isGeocodingRegion && <span className="material-symbols-outlined text-[12px] text-blue-400 animate-spin">refresh</span>}
              </label>
              <input
                className="bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary"
                placeholder="Otomatis dari koordinat..."
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Latitude</label>
              <input
                className="bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary font-mono"
                step="0.0001" type="number"
                value={form.lat}
                onChange={(e) => {
                  const lat = Number(e.target.value);
                  setForm((prev) => ({ ...prev, lat }));
                  triggerReverseGeocode(lat, form.lon);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Longitude</label>
              <input
                className="bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary font-mono"
                step="0.0001" type="number"
                value={form.lon}
                onChange={(e) => {
                  const lon = Number(e.target.value);
                  setForm((prev) => ({ ...prev, lon }));
                  triggerReverseGeocode(form.lat, lon);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                Altitude (m)
                {isGeocodingAlt && <span className="material-symbols-outlined text-[12px] text-blue-400 animate-spin">refresh</span>}
              </label>
              <input
                className="bg-gray-50 dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary"
                type="number"
                value={form.altitude}
                onChange={(e) => setForm({ ...form, altitude: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* Row 3: Skor (read-only — dihitung otomatis oleh analisis MCP) */}
          {isEdit && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-border-dark">
              <span className="material-symbols-outlined text-[15px] text-gray-400">analytics</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Skor GIS-MCDA:</span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">{station?.score ?? 0}</span>
              <span className="text-sm text-gray-400">/100</span>
              <span className="ml-auto text-[11px] text-gray-400 italic">Dihitung otomatis oleh analisis MCP</span>
            </div>
          )}

          {/* ── Baseline Atlas ─────────────────────────────────────────── */}
          {!isEdit && atlasSuccessCount === null && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
              <span className="material-symbols-outlined text-[14px] text-blue-500">cloud_download</span>
              <span className="text-[11px] text-blue-600 dark:text-blue-400">Data baseline atlas (GWA · GSA · ERA5) akan diambil <strong>otomatis</strong> setelah lokasi disimpan.</span>
            </div>
          )}
          {!isEdit && atlasSuccessCount !== null && (
            <div className="flex flex-col gap-3 border border-green-200 dark:border-green-800 rounded-xl p-4 bg-green-50/50 dark:bg-green-900/10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[15px] text-green-600">check_circle</span>
                <div>
                  <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">Baseline Referensi Atlas</p>
                  <p className="text-[11px] text-green-600 dark:text-green-500 mt-0.5">Sumber: GWA (angin, GeoTIFF) · GSA (surya, API) · ERA5/ECMWF via Open-Meteo (pembanding)</p>
                </div>
                <span className="ml-auto text-[11px] text-gray-400 italic shrink-0">{atlasSuccessCount}/6 berhasil · menutup otomatis...</span>
              </div>
              <div className="rounded-lg border border-green-200 dark:border-green-800 overflow-hidden text-[11px]">
                <table className="w-full">
                  <thead>
                    <tr className="bg-green-100 dark:bg-green-900/30">
                      <th className="text-left px-3 py-1.5 text-green-700 dark:text-green-400 font-semibold">Sumber</th>
                      <th className="text-right px-3 py-1.5 text-green-700 dark:text-green-400 font-semibold">Angin (m/s)</th>
                      <th className="text-right px-3 py-1.5 text-green-700 dark:text-green-400 font-semibold">GHI (kWh/m²/hari)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-green-100 dark:divide-green-900/30">
                    <tr className="bg-white dark:bg-transparent">
                      <td className="px-3 py-1.5 font-medium text-gray-700 dark:text-gray-300">GWA</td>
                      <td className="px-3 py-1.5 text-right font-mono text-gray-800 dark:text-gray-200">{form.windBaselineGwa ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-gray-400">—</td>
                    </tr>
                    <tr className="bg-white dark:bg-transparent">
                      <td className="px-3 py-1.5 font-medium text-gray-700 dark:text-gray-300">GSA</td>
                      <td className="px-3 py-1.5 text-right font-mono text-gray-400">—</td>
                      <td className="px-3 py-1.5 text-right font-mono text-gray-800 dark:text-gray-200">{form.ghiBaselineGsa ?? <span className="text-gray-400">—</span>}</td>
                    </tr>
                    <tr className="bg-green-50/50 dark:bg-green-900/10">
                      <td className="px-3 py-1.5 font-medium text-gray-700 dark:text-gray-300">ERA5</td>
                      <td className="px-3 py-1.5 text-right font-mono text-gray-800 dark:text-gray-200">{form.windBaselineNasa ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-gray-800 dark:text-gray-200">{form.ghiBaselineNasa ?? <span className="text-gray-400">—</span>}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500 dark:text-gray-400">Angin 100m · m/s (best: GWA &gt; ERA5)</label>
                  <div className="bg-white dark:bg-input-bg-dark border border-gray-200 dark:border-border-dark rounded-lg px-3 py-2 text-sm font-mono text-gray-900 dark:text-white">
                    {form.windBaseline ?? <span className="text-gray-400">—</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500 dark:text-gray-400">GHI · kWh/m²/hari (best: GSA &gt; ERA5)</label>
                  <div className="bg-white dark:bg-input-bg-dark border border-gray-200 dark:border-border-dark rounded-lg px-3 py-2 text-sm font-mono text-gray-900 dark:text-white">
                    {form.ghiBaseline ?? <span className="text-gray-400">—</span>}
                  </div>
                </div>
              </div>
            </div>
          )}
          {isEdit && (
            <div className="flex flex-col gap-3 border border-blue-200 dark:border-blue-800 rounded-xl p-4 bg-blue-50/50 dark:bg-blue-900/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Baseline Referensi Atlas</p>
                  <p className="text-[11px] text-blue-500 dark:text-blue-500 mt-0.5">Sumber: GWA (angin, GeoTIFF) · GSA (surya, API) · ERA5/ECMWF via Open-Meteo (pembanding)</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleFetchAtlas()}
                  disabled={isFetchingAtlas || isSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors"
                >
                  <span className={`material-symbols-outlined text-[14px] ${isFetchingAtlas ? 'animate-spin' : ''}`}>
                    {isFetchingAtlas ? 'refresh' : 'cloud_download'}
                  </span>
                  {isFetchingAtlas ? 'Mengambil...' : 'Ambil dari Atlas'}
                </button>
              </div>
              {atlasMsg && (
                <p className={`text-[11px] px-2 py-1.5 rounded-md ${atlasMsg.toLowerCase().includes('berhasil') ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'}`}>
                  {atlasMsg}
                </p>
              )}
              {/* Tabel perbandingan 3 sumber */}
              {(form.windBaselineGwa || form.ghiBaselineGsa || form.windBaselineNasa) && (
                <div className="rounded-lg border border-blue-200 dark:border-blue-800 overflow-hidden text-[11px]">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-blue-100 dark:bg-blue-900/30">
                        <th className="text-left px-3 py-1.5 text-blue-700 dark:text-blue-400 font-semibold">Sumber</th>
                        <th className="text-right px-3 py-1.5 text-blue-700 dark:text-blue-400 font-semibold">Angin (m/s)</th>
                        <th className="text-right px-3 py-1.5 text-blue-700 dark:text-blue-400 font-semibold">GHI (kWh/m²/hari)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-100 dark:divide-blue-900/30">
                      <tr className="bg-white dark:bg-transparent">
                        <td className="px-3 py-1.5 font-medium text-gray-700 dark:text-gray-300">GWA</td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-800 dark:text-gray-200">{form.windBaselineGwa ?? <span className="text-gray-400">—</span>}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-400">—</td>
                      </tr>
                      <tr className="bg-white dark:bg-transparent">
                        <td className="px-3 py-1.5 font-medium text-gray-700 dark:text-gray-300">GSA</td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-400">—</td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-800 dark:text-gray-200">{form.ghiBaselineGsa ?? <span className="text-gray-400">—</span>}</td>
                      </tr>
                      <tr className="bg-blue-50/50 dark:bg-blue-900/10">
                        <td className="px-3 py-1.5 font-medium text-gray-700 dark:text-gray-300">ERA5</td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-800 dark:text-gray-200">{form.windBaselineNasa ?? <span className="text-gray-400">—</span>}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-800 dark:text-gray-200">{form.ghiBaselineNasa ?? <span className="text-gray-400">—</span>}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500 dark:text-gray-400">Angin 100m · m/s (best: GWA &gt; ERA5)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 5.20"
                    className="bg-white dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary font-mono"
                    value={form.windBaseline ?? ''}
                    onChange={(e) => setForm({ ...form, windBaseline: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500 dark:text-gray-400">GHI · kWh/m²/hari (best: GSA &gt; ERA5)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 4.65"
                    className="bg-white dark:bg-input-bg-dark border border-gray-300 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary font-mono"
                    value={form.ghiBaseline ?? ''}
                    onChange={(e) => setForm({ ...form, ghiBaseline: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="flex flex-col gap-2 px-5 py-4 border-t border-gray-200 dark:border-border-dark shrink-0">
          {saveError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs">
              <span className="material-symbols-outlined text-[15px] shrink-0">error</span>
              <span className="flex-1">{saveError}</span>
            </div>
          )}
          <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 h-9 rounded-lg border border-gray-300 dark:border-border-dark text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex-1 h-9 rounded-lg bg-primary hover:bg-blue-600 disabled:opacity-70 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
          >
            {isSaving ? (
              isFetchingAtlas ? (
                <><span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>Mengambil Data Atlas...</>
              ) : atlasSuccessCount !== null ? (
                <><span className="material-symbols-outlined text-[16px]">check_circle</span>{atlasSuccessCount}/6 Data Berhasil Diambil</>
              ) : (
                <><span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>Menyimpan...</>
              )
            ) : (
              isEdit ? 'Simpan Perubahan' : 'Tambah & Ambil Data Atlas'
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

//  Main Page
export default function AdminPage() {
  useEffect(() => { document.title = 'Admin | RE-Valid'; }, []);
  const router = useRouter();
  const { stations: initialStations, mutate } = useStations();

  // Auth guard — redirect to login if no token
  const [adminUsername, setAdminUsername] = useState('');
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login?returnTo=/admin');
      return;
    }
    setAdminUsername(localStorage.getItem('re_valid_username') ?? 'Admin');
    setIsDark(localStorage.getItem('re_valid_theme') !== 'light');
  }, [router]);

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
  const stationList: AdminStation[] = initialStations.map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    region: s.region,
    altitude: s.altitude,
    status: s.status as AdminStation['status'],
    score: s.score,
    period: s.period,
    variables: s.variables,
    mcpStatus: s.mcpStatus,
    rmse: s.rmse,
    bias: s.bias,
    r2: s.r2,
    windRmse: s.windRmse ?? null,
    windBias: s.windBias ?? null,
    windR2: s.windR2 ?? null,
    solarRmse: s.solarRmse ?? null,
    solarBias: s.solarBias ?? null,
    solarR2: s.solarR2 ?? null,
    windSpeed: s.windSpeed,
    irradiation: s.irradiation,
    windBaseline: s.windBaseline ?? null,
    ghiBaseline: s.ghiBaseline ?? null,
    windBaselineGwa: s.windBaselineGwa ?? null,
    ghiBaselineGsa: s.ghiBaselineGsa ?? null,
    windBaselineNasa: s.windBaselineNasa ?? null,
    ghiBaselineNasa: s.ghiBaselineNasa ?? null,
    aep: s.aep,
    windAep: s.windAep ?? null,
    solarAep: s.solarAep ?? null,
    lastUpdate: s.lastUpdate,
    lastMeasurementAt: s.lastMeasurementAt ?? null,
    firstMeasurementAt: s.firstMeasurementAt ?? null,
  }));

  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editStation, setEditStation] = useState<AdminStation | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [crudError, setCrudError] = useState<string | null>(null);
  const [exportingData, setExportingData] = useState(false);

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

  // Handlers
  async function handleSave(form: Parameters<ModalProps['onSave']>[0]): Promise<string | undefined> {
    try {
      if (editStation) {
        // Konversi SEMUA field camelCase ke snake_case agar backend (Pydantic) bisa membacanya
        const payload = {
          name: form.name,
          lat: form.lat,
          lon: form.lon,
          region: form.region,
          altitude: form.altitude,
          status: form.status,
          score: form.score,
          wind_baseline: form.windBaseline,
          ghi_baseline: form.ghiBaseline,
          wind_baseline_gwa: form.windBaselineGwa,
          ghi_baseline_gsa: form.ghiBaselineGsa,
          wind_baseline_nasa: form.windBaselineNasa,
          ghi_baseline_nasa: form.ghiBaselineNasa,
        };
        const res = await apiFetch(`/api/v1/stations/${editStation.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const json = await res.json();
          return json.detail ?? 'Gagal menyimpan perubahan';
        }
        setEditStation(null);
      } else {
        // POST hanya mengirim field yang ada di StationCreate.
        // status dan score TIDAK dikirim — backend default: kandidat, 0.
        // Keduanya akan dihitung otomatis oleh analisis MCP setelah ada data measurement.
        const payload = {
          id: form.id.trim().toUpperCase(),
          name: form.name.trim(),
          lat: form.lat,
          lon: form.lon,
          region: form.region.trim() || null,
          altitude: form.altitude,
        };
        const res = await apiFetch(`/api/v1/stations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const json = await res.json();
          return json.detail ?? 'Gagal menambah stasiun';
        }
        // Tidak auto-close di sini — modal akan menutup sendiri setelah fetch-atlas selesai
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
      const res = await apiFetch(`/api/v1/stations/${id}`, { method: 'DELETE', headers: authHeaders() });
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

  async function handleExport() {
    setExportingData(true);
    setCrudError(null);
    try {
      const { Workbook } = await import('exceljs');
      const wb = new Workbook();
      const exportedAt = new Date();
      const exportedAtLabel = exportedAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
      const rowsToExport = filtered;

      wb.creator = 'RE-Valid DSS';
      wb.created = exportedAt;
      wb.modified = exportedAt;

      const C_BLUE = 'FF137FEC';
      const C_NAVY = 'FF0F2D57';
      const C_WHITE = 'FFFFFFFF';
      const C_ALT = 'FFF0F5FF';
      const C_HDR = 'FFE8EFF9';
      const C_TEXT = 'FF111827';
      const C_GRAY = 'FF6B7280';
      const dash = '—';

      const statusLabel = (status: AdminStation['status']) => {
        if (status === 'prioritas') return 'Prioritas';
        if (status === 'kandidat') return 'Kandidat';
        return 'Tidak Sesuai';
      };
      const mcpLabel = (status: string) => {
        if (status === 'selesai') return 'Selesai';
        if (status === 'berjalan') return 'Berjalan';
        return 'Pending';
      };
      const scoreClass = (score: number) => {
        if (score >= 70) return 'Prioritas tinggi';
        if (score >= 50) return 'Kandidat';
        return 'Perlu evaluasi';
      };
      const asNumber = (value: number | null | undefined, digits = 2) =>
        value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
      const asTextDate = (value: string | null | undefined) => value ? formatLastUpdate(value) : dash;
      const parseDate = (value: string | null | undefined) => {
        if (!value) return null;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      };
      const daysBetween = (start: string | null, end: string | null) => {
        const s = parseDate(start);
        const e = parseDate(end);
        if (!s || !e) return null;
        return Number(((e.getTime() - s.getTime()) / 86_400_000).toFixed(1));
      };
      const ageHours = (value: string | null | undefined) => {
        const parsed = parseDate(value);
        if (!parsed) return null;
        return Number(((Date.now() - parsed.getTime()) / 3_600_000).toFixed(1));
      };
      const bestWindBaseline = (s: AdminStation) =>
        s.windBaseline ?? s.windBaselineGwa ?? s.windBaselineNasa ?? (s.windSpeed > 0 ? s.windSpeed : null);
      const bestGhiBaseline = (s: AdminStation) =>
        s.ghiBaseline ?? s.ghiBaselineGsa ?? s.ghiBaselineNasa ?? (s.irradiation > 0 ? s.irradiation : null);
      const windAepGross = (s: AdminStation) =>
        s.aep > 0 ? s.aep : s.windAep != null && s.windAep > 0 ? s.windAep : null;
      const windAepSource = (s: AdminStation) =>
        s.aep > 0 ? 'AEP utama/MCP' : s.windAep != null && s.windAep > 0 ? 'windAep fallback' : dash;
      const solarAepValue = (s: AdminStation) =>
        s.solarAep != null && s.solarAep > 0
          ? s.solarAep
          : bestGhiBaseline(s) != null ? bestGhiBaseline(s)! * 365 * 10 * 0.78 : null;
      const solarSpecificYield = (s: AdminStation) =>
        bestGhiBaseline(s) != null ? bestGhiBaseline(s)! * 365 * 0.78 : null;

      const styleTitle = (ws: import('exceljs').Worksheet, title: string, subtitle: string, maxCols: number) => {
        ws.mergeCells(1, 1, 1, maxCols);
        ws.mergeCells(2, 1, 2, maxCols);
        const titleCell = ws.getCell(1, 1);
        titleCell.value = title;
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_BLUE } };
        titleCell.font = { bold: true, size: 14, color: { argb: C_WHITE }, name: 'Calibri' };
        titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        ws.getRow(1).height = 24;

        const metaCell = ws.getCell(2, 1);
        metaCell.value = subtitle;
        metaCell.font = { italic: true, size: 9, color: { argb: C_GRAY }, name: 'Calibri' };
        metaCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        ws.getRow(2).height = 16;
      };

      const styleHeaderRow = (row: import('exceljs').Row, maxCols: number) => {
        row.eachCell({ includeEmpty: true }, (cell: import('exceljs').Cell, col: number) => {
          if (col > maxCols) return;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_NAVY } };
          cell.font = { bold: true, size: 9, color: { argb: C_WHITE }, name: 'Calibri' };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = { bottom: { style: 'thin', color: { argb: C_BLUE } } };
        });
        row.height = 24;
      };

      const styleDataRow = (row: import('exceljs').Row, index: number, maxCols: number) => {
        const isAlt = index % 2 === 1;
        row.eachCell({ includeEmpty: true }, (cell: import('exceljs').Cell, col: number) => {
          if (col > maxCols) return;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? C_ALT : C_WHITE } };
          cell.font = { size: 9, color: { argb: C_TEXT }, name: 'Calibri' };
          cell.alignment = { horizontal: col <= 3 ? 'left' : 'center', vertical: 'middle', wrapText: true };
          cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
        });
        row.height = 17;
      };

      type ExportColumn = {
        header: string;
        width: number;
        value: (station: AdminStation, index: number) => string | number | null;
        numFmt?: string;
        align?: 'left' | 'center' | 'right';
      };

      const addTableSheet = (name: string, subtitle: string, columns: ExportColumn[]) => {
        const ws = wb.addWorksheet(name);
        ws.columns = columns.map((col, index) => ({
          key: `c${index}`,
          width: col.width,
        }));
        styleTitle(ws, `RE-Valid — ${name}`, subtitle, columns.length);
        ws.addRow([]);
        const headerRow = ws.addRow(columns.map((col) => col.header));
        styleHeaderRow(headerRow, columns.length);
        rowsToExport.forEach((station, index) => {
          const row = ws.addRow(columns.map((col) => col.value(station, index) ?? dash));
          styleDataRow(row, index, columns.length);
          columns.forEach((col, colIndex) => {
            const cell = row.getCell(colIndex + 1);
            if (col.numFmt && typeof cell.value === 'number') cell.numFmt = col.numFmt;
            if (col.align) cell.alignment = { ...cell.alignment, horizontal: col.align };
          });
        });
        ws.views = [{ state: 'frozen', ySplit: 4 }];
        ws.autoFilter = {
          from: { row: 4, column: 1 },
          to: { row: 4, column: columns.length },
        };
      };

      const summary = wb.addWorksheet('Ringkasan');
      summary.columns = [
        { key: 'metric', width: 38 },
        { key: 'value', width: 28 },
        { key: 'note', width: 45 },
      ];
      styleTitle(
        summary,
        'RE-Valid — Ekspor Data Admin',
        `Diekspor: ${exportedAtLabel} | Baris ekspor: ${rowsToExport.length} dari ${stationList.length} stasiun`,
        3,
      );
      const addSection = (label: string) => {
        summary.addRow([]);
        const row = summary.addRow([label]);
        summary.mergeCells(row.number, 1, row.number, 3);
        const cell = row.getCell(1);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_NAVY } };
        cell.font = { bold: true, size: 9, color: { argb: C_WHITE }, name: 'Calibri' };
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        row.height = 17;
      };
      const addSummaryRow = (label: string, value: string | number, note = '', index = 0) => {
        const row = summary.addRow([label, value, note]);
        row.eachCell({ includeEmpty: true }, (cell: import('exceljs').Cell, col: number) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 ? C_ALT : col === 1 ? C_HDR : C_WHITE } };
          cell.font = { bold: col === 1, size: 9, color: { argb: C_TEXT }, name: 'Calibri' };
          cell.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle', indent: col === 1 ? 1 : 0, wrapText: true };
          cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
        });
        row.height = 17;
      };

      const filteredCounts = {
        prioritas: rowsToExport.filter((s) => s.status === 'prioritas').length,
        kandidat: rowsToExport.filter((s) => s.status === 'kandidat').length,
        tidak: rowsToExport.filter((s) => s.status === 'tidak_sesuai').length,
        active: rowsToExport.filter((s) => isRecentlyActive(s.lastMeasurementAt ?? s.lastUpdate)).length,
        mcpDone: rowsToExport.filter((s) => s.mcpStatus === 'selesai').length,
        mcpRunning: rowsToExport.filter((s) => s.mcpStatus === 'berjalan').length,
        mcpPending: rowsToExport.filter((s) => s.mcpStatus === 'pending').length,
      };
      const avg = (values: number[]) => values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : dash;

      addSection('FILTER EKSPOR');
      [
        ['Pencarian Aktif', query || dash, 'Nama/ID stasiun yang sedang difilter di halaman admin.'],
        ['Filter Status Aktif', filterStatus ? statusLabel(filterStatus as AdminStation['status']) : 'Semua status', 'Ekspor mengikuti filter yang sedang tampil.'],
        ['Jumlah Baris Diekspor', rowsToExport.length, `${stationList.length} total stasiun tersedia.`],
      ].forEach(([label, value, note], index) => addSummaryRow(String(label), value, String(note), index));

      addSection('RINGKASAN STATUS');
      [
        ['Prioritas', filteredCounts.prioritas, 'Stasiun dengan status prioritas.'],
        ['Kandidat', filteredCounts.kandidat, 'Stasiun kandidat pengembangan.'],
        ['Tidak Sesuai', filteredCounts.tidak, 'Stasiun yang tidak memenuhi kriteria saat ini.'],
        ['Aktif <24 Jam', filteredCounts.active, 'Berdasarkan last measurement atau last update.'],
        ['MCP Selesai', filteredCounts.mcpDone, 'Status proses validasi MCP selesai.'],
        ['MCP Berjalan', filteredCounts.mcpRunning, 'Status proses validasi MCP berjalan.'],
        ['MCP Pending', filteredCounts.mcpPending, 'Status proses validasi MCP pending.'],
      ].forEach(([label, value, note], index) => addSummaryRow(String(label), value, String(note), index));

      addSection('RINGKASAN NILAI');
      [
        ['Rata-rata Skor GIS', avg(rowsToExport.map((s) => s.score)), 'Skala 0-100.'],
        ['Rata-rata Angin Observasi', avg(rowsToExport.map((s) => s.windSpeed).filter((v) => v > 0)), 'm/s. Nilai 0 tidak dihitung.'],
        ['Rata-rata GHI Observasi', avg(rowsToExport.map((s) => s.irradiation).filter((v) => v > 0)), 'kWh/m²/hari. Nilai 0 tidak dihitung.'],
        ['Stasiun dengan AEP PLTB', rowsToExport.filter((s) => windAepGross(s) != null).length, 'Memakai aep utama atau windAep fallback.'],
        ['Stasiun dengan AEP PLTS', rowsToExport.filter((s) => solarAepValue(s) != null).length, 'Memakai solarAep atau estimasi GHI x 365 x 10 MWp x PR 78%.'],
      ].forEach(([label, value, note], index) => addSummaryRow(String(label), value, String(note), index));
      summary.views = [{ state: 'frozen', ySplit: 2 }];

      addTableSheet('Data Stasiun', 'Identitas lokasi, status, skor, periode, variabel, dan timestamp monitoring.', [
        { header: 'No', width: 6, value: (_s, i) => i + 1, align: 'center' },
        { header: 'Station ID', width: 14, value: (s) => s.id },
        { header: 'Nama Stasiun', width: 26, value: (s) => s.name },
        { header: 'Wilayah', width: 28, value: (s) => s.region },
        { header: 'Latitude', width: 13, value: (s) => s.lat, numFmt: '0.000000' },
        { header: 'Longitude', width: 13, value: (s) => s.lon, numFmt: '0.000000' },
        { header: 'Ketinggian (m dpl)', width: 16, value: (s) => s.altitude, numFmt: '0' },
        { header: 'Status', width: 15, value: (s) => statusLabel(s.status) },
        { header: 'Skor GIS', width: 10, value: (s) => s.score, numFmt: '0' },
        { header: 'Kategori Skor', width: 18, value: (s) => scoreClass(s.score) },
        { header: 'Status MCP', width: 14, value: (s) => mcpLabel(s.mcpStatus) },
        { header: 'Periode Data', width: 26, value: (s) => s.period },
        { header: 'Variabel', width: 22, value: (s) => s.variables },
        { header: 'First Measurement (WIB)', width: 24, value: (s) => asTextDate(s.firstMeasurementAt) },
        { header: 'Last Measurement (WIB)', width: 24, value: (s) => asTextDate(s.lastMeasurementAt) },
        { header: 'Last Update (WIB)', width: 24, value: (s) => asTextDate(s.lastUpdate) },
        { header: 'Status Data', width: 18, value: (s) => isRecentlyActive(s.lastMeasurementAt ?? s.lastUpdate) ? 'Aktif <24 jam' : 'Tidak aktif/belum ada data' },
      ]);

      addTableSheet('Baseline Atlas', 'Observasi lapangan dan baseline atlas GWA/GSA/ERA5 yang dipakai sistem.', [
        { header: 'Station ID', width: 14, value: (s) => s.id },
        { header: 'Nama Stasiun', width: 26, value: (s) => s.name },
        { header: 'Angin Obs (m/s)', width: 15, value: (s) => asNumber(s.windSpeed), numFmt: '0.00' },
        { header: 'Wind Baseline Best (m/s)', width: 20, value: (s) => asNumber(bestWindBaseline(s)), numFmt: '0.00' },
        { header: 'GWA 3.0 (m/s)', width: 15, value: (s) => asNumber(s.windBaselineGwa), numFmt: '0.00' },
        { header: 'ERA5 Angin (m/s)', width: 16, value: (s) => asNumber(s.windBaselineNasa), numFmt: '0.00' },
        { header: 'Baseline Angin Legacy (m/s)', width: 23, value: (s) => asNumber(s.windBaseline), numFmt: '0.00' },
        { header: 'GHI Obs (kWh/m²/hari)', width: 20, value: (s) => asNumber(s.irradiation), numFmt: '0.00' },
        { header: 'GHI Best (kWh/m²/hari)', width: 20, value: (s) => asNumber(bestGhiBaseline(s)), numFmt: '0.00' },
        { header: 'GSA/Solargis (kWh/m²/hari)', width: 24, value: (s) => asNumber(s.ghiBaselineGsa), numFmt: '0.00' },
        { header: 'ERA5 GHI (kWh/m²/hari)', width: 22, value: (s) => asNumber(s.ghiBaselineNasa), numFmt: '0.00' },
        { header: 'Baseline GHI Legacy', width: 18, value: (s) => asNumber(s.ghiBaseline), numFmt: '0.00' },
      ]);

      addTableSheet('Potensi Energi', 'AEP angin dan surya, termasuk fallback agar nilai tidak kosong saat field utama belum tersedia.', [
        { header: 'Station ID', width: 14, value: (s) => s.id },
        { header: 'Nama Stasiun', width: 26, value: (s) => s.name },
        { header: 'AEP PLTB Gross (MWh/thn)', width: 24, value: (s) => asNumber(windAepGross(s), 0), numFmt: '#,##0' },
        { header: 'Sumber AEP PLTB', width: 18, value: (s) => windAepSource(s) },
        { header: 'AEP PLTB P50 Net (MWh/thn)', width: 26, value: (s) => windAepGross(s) != null ? Math.round(windAepGross(s)! * 0.877) : null, numFmt: '#,##0' },
        { header: 'AEP PLTB P90 Net (MWh/thn)', width: 26, value: (s) => windAepGross(s) != null ? Math.round(windAepGross(s)! * 0.767) : null, numFmt: '#,##0' },
        { header: 'AEP PLTS 10 MWp PR 78% (MWh/thn)', width: 32, value: (s) => asNumber(solarAepValue(s), 0), numFmt: '#,##0' },
        { header: 'Sumber AEP PLTS', width: 20, value: (s) => s.solarAep != null && s.solarAep > 0 ? 'solarAep' : bestGhiBaseline(s) != null ? 'estimasi GHI' : dash },
        { header: 'Hasil Spesifik PLTS (kWh/kWp/thn)', width: 31, value: (s) => asNumber(solarSpecificYield(s), 0), numFmt: '#,##0' },
        { header: 'WindAEP Raw (MWh/thn)', width: 22, value: (s) => asNumber(s.windAep, 0), numFmt: '#,##0' },
        { header: 'SolarAEP Raw (MWh/thn)', width: 22, value: (s) => asNumber(s.solarAep, 0), numFmt: '#,##0' },
      ]);

      addTableSheet('Validasi MCP', 'Metrik validasi umum dan per variabel yang disimpan dari proses MCP.', [
        { header: 'Station ID', width: 14, value: (s) => s.id },
        { header: 'Nama Stasiun', width: 26, value: (s) => s.name },
        { header: 'Status MCP', width: 14, value: (s) => mcpLabel(s.mcpStatus) },
        { header: 'RMSE Umum', width: 13, value: (s) => asNumber(s.rmse), numFmt: '0.00' },
        { header: 'Bias Umum (%)', width: 14, value: (s) => asNumber(s.bias, 1), numFmt: '0.0' },
        { header: 'R² Umum', width: 11, value: (s) => asNumber(s.r2), numFmt: '0.00' },
        { header: 'Wind RMSE (m/s)', width: 17, value: (s) => asNumber(s.windRmse), numFmt: '0.00' },
        { header: 'Wind Bias (%)', width: 15, value: (s) => asNumber(s.windBias, 1), numFmt: '0.0' },
        { header: 'Wind R²', width: 11, value: (s) => asNumber(s.windR2), numFmt: '0.00' },
        { header: 'Solar RMSE (kWh/m²/hari)', width: 25, value: (s) => asNumber(s.solarRmse), numFmt: '0.00' },
        { header: 'Solar Bias (%)', width: 16, value: (s) => asNumber(s.solarBias, 1), numFmt: '0.0' },
        { header: 'Solar R²', width: 11, value: (s) => asNumber(s.solarR2), numFmt: '0.00' },
      ]);

      addTableSheet('MQTT Monitoring', 'Topic MQTT dan timestamp data untuk memeriksa aktivitas stasiun lapangan.', [
        { header: 'Station ID', width: 14, value: (s) => s.id },
        { header: 'Nama Stasiun', width: 26, value: (s) => s.name },
        { header: 'MQTT Topic', width: 26, value: (s) => `stations/${s.id}/data` },
        { header: 'First Measurement (WIB)', width: 24, value: (s) => asTextDate(s.firstMeasurementAt) },
        { header: 'Last Measurement (WIB)', width: 24, value: (s) => asTextDate(s.lastMeasurementAt) },
        { header: 'Last Update (WIB)', width: 24, value: (s) => asTextDate(s.lastUpdate) },
        { header: 'Rentang Data (hari)', width: 18, value: (s) => daysBetween(s.firstMeasurementAt, s.lastMeasurementAt), numFmt: '0.0' },
        { header: 'Umur Data Terakhir (jam)', width: 22, value: (s) => ageHours(s.lastMeasurementAt ?? s.lastUpdate), numFmt: '0.0' },
        { header: 'Status Aktivitas', width: 20, value: (s) => isRecentlyActive(s.lastMeasurementAt ?? s.lastUpdate) ? 'Aktif <24 jam' : 'Tidak aktif/belum ada data' },
      ]);

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RE-Valid_Admin_Stasiun_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setCrudError('Gagal mengekspor data admin. Coba ulangi beberapa saat lagi.');
    } finally {
      setExportingData(false);
    }
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
      const res = await apiFetch(
        `/api/v1/measurements/upload?station_id=${encodeURIComponent(csvStation)}`,
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
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle theme"
            >
              <span className="material-symbols-outlined text-[20px]">
                {isDark ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
          </div>
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
                  disabled={exportingData}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-surface-dark border border-gray-300 dark:border-border-dark rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-wait"
                >
                  <span className={`material-symbols-outlined text-[20px] ${exportingData ? 'animate-spin' : ''}`}>
                    {exportingData ? 'refresh' : 'download'}
                  </span>
                  {exportingData ? 'Memproses...' : 'Ekspor Data'}
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
                            {station.irradiation} kWh/m²/hari
                          </div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${station.score >= 70 ? 'bg-green-500' : station.score >= 50 ? 'bg-yellow-500' : 'bg-gray-400'}`}
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
                      const online = isRecentlyActive(s.lastMeasurementAt ?? '');
                      return (
                        <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                          <td className="px-6 py-3">
                            <div>
                              <p className="font-mono text-xs text-gray-900 dark:text-white font-semibold">{s.id}</p>
                              <p className="text-[11px] text-gray-400 truncate max-w-30">{s.name}</p>
                            </div>
                          </td>
                          <td className="px-6 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">stations/{s.id}/data</td>
                          <td className="px-6 py-3 text-xs text-gray-600 dark:text-gray-300">{formatLastUpdate(s.lastMeasurementAt ?? '')}</td>
                          <td className="px-6 py-3 text-xs text-gray-600 dark:text-gray-300">{online ? '~1 jam' : '—'}</td>
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
          onRefresh={mutate}
        />
      )}
    </div>
  );
}

