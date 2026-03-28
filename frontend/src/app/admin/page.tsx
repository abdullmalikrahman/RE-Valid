import Link from 'next/link';

// ─── Station data (Jawa Barat) ────────────────────────────────────────────────
const stations = [
  {
    name: 'Stasiun Cimahi Utara',
    id: 'CMH-001',
    region: 'Cimahi, Jawa Barat',
    coords: '-6.8712, 107.5432',
    installed: '12 Jan 2023',
    status: 'aktif',
    type: 'Dataran Tinggi',
    sensor: 'Lengkap',
    calibration: 'Valid',
    lastData: '8 mnt lalu',
    altitude: '752 m',
    power: 'Hybrid',
    pic: 'Ir. Budi S.',
  },
  {
    name: 'Pos Pesisir Pangandaran',
    id: 'PGD-023',
    region: 'Pangandaran, Jawa Barat',
    coords: '-7.7041, 108.6508',
    installed: '24 Mar 2023',
    status: 'maintenance',
    type: 'Pesisir',
    sensor: 'Angin',
    calibration: 'Kadaluarsa',
    lastData: '2 jam lalu',
    altitude: '12 m',
    power: 'Panel Surya',
    pic: 'Ir. Sari W.',
  },
  {
    name: 'Stasiun Subang Utara',
    id: 'SBG-105',
    region: 'Subang, Jawa Barat',
    coords: '-6.5891, 107.7621',
    installed: '05 Nov 2022',
    status: 'nonaktif',
    type: 'Dataran Rendah',
    sensor: 'Surya',
    calibration: '—',
    lastData: '4 hari lalu',
    altitude: '48 m',
    power: 'PLN',
    pic: 'Ir. Dewi R.',
  },
  {
    name: 'Pos Pegunungan Wayang',
    id: 'GWY-089',
    region: 'Bandung Selatan, Jawa Barat',
    coords: '-7.2184, 107.6452',
    installed: '15 Feb 2023',
    status: 'aktif',
    type: 'Dataran Tinggi',
    sensor: 'Lengkap',
    calibration: 'Valid',
    lastData: '5 mnt lalu',
    altitude: '1.820 m',
    power: 'Hybrid',
    pic: 'Ir. Andi M.',
  },
];

// ─── MQTT monitoring ──────────────────────────────────────────────────────────
const mqttData = [
  {
    id: 'CMH-001',
    lastPublish: '8 mnt lalu',
    rssi: -62,
    battery: '87%',
    batteryOk: true,
    uptime: '14j 32m',
    retries: 0,
    payloadValid: true,
    firmware: 'v2.1.4',
    online: true,
  },
  {
    id: 'PGD-023',
    lastPublish: '2j 14m lalu',
    rssi: -88,
    battery: '34%',
    batteryOk: false,
    uptime: '0j 12m',
    retries: 14,
    payloadValid: false,
    firmware: 'v2.0.9',
    online: false,
  },
  {
    id: 'SBG-105',
    lastPublish: '4 hari lalu',
    rssi: null,
    battery: '—',
    batteryOk: null,
    uptime: '—',
    retries: null,
    payloadValid: null,
    firmware: 'v1.8.2',
    online: false,
  },
  {
    id: 'GWY-089',
    lastPublish: '5 mnt lalu',
    rssi: -71,
    battery: '92%',
    batteryOk: true,
    uptime: '6j 48m',
    retries: 0,
    payloadValid: true,
    firmware: 'v2.1.4',
    online: true,
  },
];

// ─── Celery job queue ─────────────────────────────────────────────────────────
const jobs = [
  { id: 'job-4a2f', type: 'Analisis MCP', loc: 'GWY-089', started: '14:31 WIB', duration: '2m 14s', status: 'running', error: null },
  { id: 'job-7c1e', type: 'Analisis MCP', loc: 'CMH-001', started: '—', duration: '—', status: 'queued', error: null },
  { id: 'job-9d3b', type: 'Generate Laporan PDF', loc: 'GWY-089', started: '—', duration: '—', status: 'queued', error: null },
  { id: 'job-2e8f', type: 'Analisis MCP', loc: 'PGD-023', started: '12:05 WIB', duration: '8m 32s', status: 'failed', error: 'ERA5 fetch timeout' },
];

// ─── Audit log ────────────────────────────────────────────────────────────────
const auditLogs = [
  { time: '14:31', user: 'admin@re-valid.id', role: 'Admin', action: 'Memulai job Analisis MCP', target: 'GWY-089' },
  { time: '13:47', user: 'operator@re-valid.id', role: 'Operator', action: 'Update metadata stasiun', target: 'CMH-001' },
  { time: '12:05', user: 'admin@re-valid.id', role: 'Admin', action: 'Retry job MCP (ERA5 timeout)', target: 'PGD-023' },
  { time: '11:20', user: 'operator@re-valid.id', role: 'Operator', action: 'Tambah stasiun baru', target: 'SBG-105' },
  { time: '10:44', user: 'admin@re-valid.id', role: 'Admin', action: 'Unduh laporan PDF', target: 'GWY-089' },
];

// ─── Validation metrics preview ───────────────────────────────────────────────
const validationRows = [
  { id: 'CMH-001', name: 'Stasiun Cimahi Utara', period: 'Jan–Des 2023', rmse: '1.45', mae: '1.12', bias: '+1.2%', r2: '0.89', avail: '98.5%', status: 'lulus' },
  { id: 'GWY-089', name: 'Pos Pegunungan Wayang', period: 'Jan–Des 2023', rmse: '1.82', mae: '1.37', bias: '-2.1%', r2: '0.84', avail: '96.1%', status: 'lulus' },
  { id: 'PGD-023', name: 'Pos Pesisir Pangandaran', period: 'Mar–Des 2023', rmse: '2.31', mae: '1.89', bias: '+4.7%', r2: '0.71', avail: '78.3%', status: 'gagal' },
  { id: 'SBG-105', name: 'Stasiun Subang Utara', period: '—', rmse: '—', mae: '—', bias: '—', r2: '—', avail: '—', status: 'pending' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === 'aktif') return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
      <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-green-500" />Aktif
    </span>
  );
  if (status === 'maintenance') return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">
      <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-yellow-500 animate-pulse" />Perbaikan
    </span>
  );
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
      <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-gray-500" />Non-Aktif
    </span>
  );
}

function SensorBadge({ sensor }: { sensor: string }) {
  const map: Record<string, string> = {
    Lengkap: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    Angin: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    Surya: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[sensor] ?? 'bg-gray-100 text-gray-600'}`}>
      {sensor}
    </span>
  );
}

function CalibBadge({ status }: { status: string }) {
  if (status === 'Valid') return <span className="text-green-500 text-xs font-semibold">✓ Valid</span>;
  if (status === 'Kadaluarsa') return <span className="text-red-500 text-xs font-semibold">✗ Kadaluarsa</span>;
  return <span className="text-gray-400 text-xs">—</span>;
}

function NavItem({
  icon,
  label,
  active,
  badge,
  badgeColor,
}: {
  icon: string;
  label: string;
  active?: boolean;
  badge?: string;
  badgeColor?: 'red' | 'yellow' | 'blue';
}) {
  const badgeCls =
    badgeColor === 'red'
      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      : badgeColor === 'yellow'
      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';

  return (
    <Link
      href="#"
      className={`group flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
        active
          ? 'bg-primary/10 text-primary'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      <span className="flex items-center gap-3">
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
        {label}
      </span>
      {badge && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badgeCls}`}>{badge}</span>
      )}
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  return (
    <div className="bg-gray-100 dark:bg-[#0B1116] text-gray-900 dark:text-gray-100 h-screen flex overflow-hidden antialiased font-display">

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className="w-64 bg-white dark:bg-[#161B22] border-r border-gray-200 dark:border-[#30363D] hidden md:flex flex-col z-20 shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-[#30363D]">
          <Link href="/" className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">bolt</span>
            <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">RE-Valid</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          <NavItem icon="dashboard" label="Dashboard" />

          <div className="pt-4 pb-1">
            <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Operasional</p>
          </div>
          <NavItem icon="sensors" label="Stasiun & Lokasi" active />
          <NavItem icon="router" label="Monitoring IoT" badge="2 Alert" badgeColor="red" />
          <NavItem icon="queue" label="Job Analitik" badge="3" badgeColor="yellow" />

          <div className="pt-4 pb-1">
            <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Analitik & GIS</p>
          </div>
          <NavItem icon="bar_chart" label="Validasi & MCP" />
          <NavItem icon="layers" label="Peta GIS & Layer" />
          <NavItem icon="description" label="Laporan" />

          <div className="pt-4 pb-1">
            <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sistem</p>
          </div>
          <NavItem icon="group" label="Pengguna & Role" />
          <NavItem icon="history" label="Audit Log" />
          <NavItem icon="settings" label="Pengaturan" />
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-gray-200 dark:border-[#30363D]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold shrink-0">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">Admin Utama</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">admin@re-valid.id</p>
            </div>
            <button className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top header */}
        <header className="h-16 flex items-center justify-between px-6 bg-white dark:bg-[#161B22] border-b border-gray-200 dark:border-[#30363D] shrink-0">
          <nav className="flex items-center space-x-2 text-sm" aria-label="Breadcrumb">
            <Link href="/" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <span className="material-symbols-outlined text-[18px]">home</span>
            </Link>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <span className="text-gray-500 dark:text-gray-400">Admin</span>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <span className="font-medium text-primary">Stasiun &amp; Lokasi</span>
          </nav>
          <div className="flex items-center gap-4">
            <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 relative">
              <span className="material-symbols-outlined text-[22px]">notifications</span>
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-[#161B22]" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs bg-gray-100 dark:bg-[#0D1117] px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-gray-600 dark:text-gray-300">2 Stasiun Online</span>
            </div>
          </div>
        </header>

        {/* Page body */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-[1400px] mx-auto space-y-6">

            {/* ── Page title ──────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Stasiun &amp; Lokasi</h1>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Manajemen entitas stasiun pengukuran meteorologi di Jawa Barat — metadata sensor, kalibrasi, infrastruktur, dan operasional lapangan.
                </p>
              </div>
              <div className="flex gap-3 shrink-0">
                <button className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#161B22] border border-gray-300 dark:border-[#30363D] rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  Ekspor CSV
                </button>
                <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-sm font-medium shadow-sm transition-colors">
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Tambah Stasiun
                </button>
              </div>
            </div>

            {/* ── Summary stats ───────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Stasiun', value: '24', icon: 'sensors', color: 'text-primary', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                { label: 'Aktif', value: '18', icon: 'check_circle', color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
                { label: 'Perbaikan / Offline', value: '4 / 2', icon: 'warning', color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
                { label: 'Kalibrasi Kadaluarsa', value: '3', icon: 'error', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
              ].map((s) => (
                <div key={s.label} className="bg-white dark:bg-[#161B22] rounded-xl border border-gray-200 dark:border-[#30363D] p-4 flex items-center gap-4">
                  <div className={`size-10 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                    <span className={`material-symbols-outlined text-[22px] ${s.color}`}>{s.icon}</span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                    <p className="text-xl font-black text-gray-900 dark:text-white">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Search + filters ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-4 relative">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-gray-400 text-[18px]">search</span>
                </span>
                <input
                  className="block w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[#0D1117] border border-gray-300 dark:border-[#30363D] rounded-lg text-sm placeholder-gray-400 focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="Cari nama stasiun atau ID..."
                  type="text"
                />
              </div>
              <div className="md:col-span-2">
                <select className="block w-full py-2.5 px-3 bg-white dark:bg-[#0D1117] border border-gray-300 dark:border-[#30363D] rounded-lg text-sm focus:ring-1 focus:ring-primary">
                  <option>Semua Wilayah</option>
                  <option>Bandung</option>
                  <option>Cimahi</option>
                  <option>Subang</option>
                  <option>Pangandaran</option>
                  <option>Garut</option>
                  <option>Tasikmalaya</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <select className="block w-full py-2.5 px-3 bg-white dark:bg-[#0D1117] border border-gray-300 dark:border-[#30363D] rounded-lg text-sm focus:ring-1 focus:ring-primary">
                  <option>Semua Status</option>
                  <option>Aktif</option>
                  <option>Perbaikan</option>
                  <option>Non-Aktif</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <select className="block w-full py-2.5 px-3 bg-white dark:bg-[#0D1117] border border-gray-300 dark:border-[#30363D] rounded-lg text-sm focus:ring-1 focus:ring-primary">
                  <option>Semua Sensor</option>
                  <option>Lengkap</option>
                  <option>Angin</option>
                  <option>Surya</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <select className="block w-full py-2.5 px-3 bg-white dark:bg-[#0D1117] border border-gray-300 dark:border-[#30363D] rounded-lg text-sm focus:ring-1 focus:ring-primary">
                  <option>Semua Kalibrasi</option>
                  <option>Valid</option>
                  <option>Kadaluarsa</option>
                </select>
              </div>
            </div>

            {/* ── Station table ─────────────────────────────────────────── */}
            <div className="bg-white dark:bg-[#161B22] rounded-xl border border-gray-200 dark:border-[#30363D] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-[#30363D] flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Daftar Stasiun Pengukuran</h2>
                <span className="text-xs text-gray-400">4 dari 24 ditampilkan</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-[#30363D]">
                  <thead className="bg-gray-50 dark:bg-black/20">
                    <tr>
                      {[
                        'Stasiun', 'Wilayah', 'Tipe Lokasi', 'Sensor',
                        'Ketinggian', 'Kalibrasi', 'Sumber Daya',
                        'Data Terakhir', 'PIC', 'Status', 'Aksi',
                      ].map((col, i) => (
                        <th
                          key={col}
                          className={`px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap ${i === 10 ? 'text-right' : 'text-left'}`}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-[#30363D]">
                    {stations.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="size-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-primary shrink-0">
                              <span className="material-symbols-outlined text-[16px]">sensors</span>
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-900 dark:text-white">{s.name}</div>
                              <div className="text-[11px] text-gray-400 font-mono">{s.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">{s.region}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">{s.type}</td>
                        <td className="px-4 py-3 whitespace-nowrap"><SensorBadge sensor={s.sensor} /></td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-600 dark:text-gray-300">{s.altitude}</td>
                        <td className="px-4 py-3 whitespace-nowrap"><CalibBadge status={s.calibration} /></td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">{s.power}</td>
                        <td className={`px-4 py-3 whitespace-nowrap text-xs font-medium ${s.status === 'aktif' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                          {s.lastData}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">{s.pic}</td>
                        <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={s.status} /></td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <button className="text-primary hover:text-blue-600 mx-0.5 p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Lihat Detail">
                            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                          </button>
                          <button className="text-gray-500 hover:text-primary mx-0.5 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors" title="Edit">
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                          </button>
                          <button className="text-red-400 hover:text-red-600 mx-0.5 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Hapus">
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-3 border-t border-gray-200 dark:border-[#30363D] flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Menampilkan <span className="font-semibold text-gray-900 dark:text-white">1–4</span>{' '}
                  dari <span className="font-semibold text-gray-900 dark:text-white">24</span> stasiun
                </p>
                <div className="flex gap-1">
                  {['← Prev', '1', '2', '3', 'Next →'].map((p) => (
                    <button
                      key={p}
                      className={`px-3 py-1.5 text-xs border rounded transition-colors ${
                        p === '1'
                          ? 'border-primary bg-primary/10 text-primary font-semibold'
                          : 'border-gray-300 dark:border-[#30363D] bg-white dark:bg-[#161B22] text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Validasi & MCP Preview ───────────────────────────────── */}
            <div className="bg-white dark:bg-[#161B22] rounded-xl border border-gray-200 dark:border-[#30363D] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-[#30363D] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-violet-400 text-[20px]">bar_chart</span>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Validasi &amp; MCP — Status Terkini</h2>
                </div>
                <Link href="#" className="text-xs text-primary font-medium hover:underline">
                  Buka Halaman Validasi Lengkap →
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-[#30363D]">
                  <thead className="bg-gray-50 dark:bg-black/20">
                    <tr>
                      {['Stasiun', 'Periode', 'RMSE', 'MAE', 'Bias', 'R²', 'Ketersediaan Data', 'Status', 'Aksi'].map((col, i) => (
                        <th
                          key={col}
                          className={`px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap ${i === 8 ? 'text-right' : 'text-left'}`}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-[#30363D]">
                    {validationRows.map((v) => (
                      <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">{v.name}</div>
                          <div className="text-[11px] text-gray-400 font-mono">{v.id}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">{v.period}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-mono font-semibold text-gray-800 dark:text-gray-200">{v.rmse}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-600 dark:text-gray-300">{v.mae}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-600 dark:text-gray-300">{v.bias}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-mono font-semibold text-gray-800 dark:text-gray-200">{v.r2}</td>
                        <td className={`px-4 py-3 whitespace-nowrap text-xs font-medium ${v.avail === '—' ? 'text-gray-400' : parseFloat(v.avail) >= 90 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                          {v.avail}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {v.status === 'lulus' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 uppercase">
                              ✓ Lulus
                            </span>
                          )}
                          {v.status === 'gagal' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 uppercase">
                              ✗ Gagal
                            </span>
                          )}
                          {v.status === 'pending' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 uppercase">
                              — Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <button className="text-primary hover:text-blue-600 mx-0.5 p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Lihat Detail">
                            <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                          </button>
                          <button className="text-yellow-500 hover:text-yellow-600 mx-0.5 p-1 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded transition-colors" title="Jalankan Ulang Validasi">
                            <span className="material-symbols-outlined text-[15px]">replay</span>
                          </button>
                          <button className="text-violet-500 hover:text-violet-600 mx-0.5 p-1 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded transition-colors" title="Jalankan MCP">
                            <span className="material-symbols-outlined text-[15px]">auto_graph</span>
                          </button>
                          <button className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mx-0.5 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors" title="Lihat Hasil Terakhir">
                            <span className="material-symbols-outlined text-[15px]">visibility</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-2.5 border-t border-gray-100 dark:border-[#30363D]">
                <p className="text-[10px] text-gray-400">
                  * Target evaluasi internal penelitian: RMSE &lt; 2.0, MAE &lt; 1.5, Bias ±5%, Ketersediaan &gt; 90%
                </p>
              </div>
            </div>

            {/* ── Two column: MQTT + Job Queue ─────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

              {/* MQTT Monitoring */}
              <div className="bg-white dark:bg-[#161B22] rounded-xl border border-gray-200 dark:border-[#30363D] overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-[#30363D] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">router</span>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white">Monitoring IoT / MQTT</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
                      2 Alert
                    </span>
                    <span className="text-xs text-gray-400">Live · 30s</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-[#30363D]">
                    <thead className="bg-gray-50 dark:bg-black/20">
                      <tr>
                        {['ID', 'Last Publish', 'RSSI', 'Baterai', 'Uptime', 'Retry', 'Payload', 'FW'].map((c) => (
                          <th key={c} className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-[#30363D]">
                      {mqttData.map((m) => (
                        <tr
                          key={m.id}
                          className={`hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${
                            m.retries !== null && m.retries > 5 ? 'bg-red-50/40 dark:bg-red-900/10' : ''
                          }`}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${m.online ? 'bg-green-500' : 'bg-red-500'}`} />
                              <span className="font-mono font-bold text-xs text-gray-900 dark:text-white">{m.id}</span>
                            </div>
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap text-xs font-medium ${m.online ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                            {m.lastPublish}
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap text-xs font-mono ${m.rssi !== null ? (m.rssi > -75 ? 'text-green-600 dark:text-green-400' : 'text-red-500') : 'text-gray-400'}`}>
                            {m.rssi !== null ? `${m.rssi} dBm` : '—'}
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap text-xs font-medium ${m.batteryOk === true ? 'text-green-600 dark:text-green-400' : m.batteryOk === false ? 'text-red-500' : 'text-gray-400'}`}>
                            {m.battery}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">{m.uptime}</td>
                          <td className={`px-4 py-3 whitespace-nowrap text-xs font-mono font-bold ${m.retries !== null && m.retries > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {m.retries !== null ? m.retries : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs">
                            {m.payloadValid === true && <span className="text-green-500 font-semibold">✓ Valid</span>}
                            {m.payloadValid === false && <span className="text-red-500 font-semibold">✗ Invalid</span>}
                            {m.payloadValid === null && <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-[11px] font-mono text-gray-500 dark:text-gray-400">{m.firmware}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Celery Job Queue */}
              <div className="bg-white dark:bg-[#161B22] rounded-xl border border-gray-200 dark:border-[#30363D] overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-[#30363D] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-violet-400 text-[20px]">queue</span>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white">Job Analitik (Celery)</h2>
                  </div>
                  <div className="flex gap-2 text-[10px] font-bold">
                    <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">1 Berjalan</span>
                    <span className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 px-2 py-0.5 rounded-full">2 Antri</span>
                    <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">1 Gagal</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-[#30363D]">
                    <thead className="bg-gray-50 dark:bg-black/20">
                      <tr>
                        {['Job ID', 'Tipe', 'Lokasi', 'Mulai', 'Durasi', 'Status', 'Aksi'].map((c, i) => (
                          <th
                            key={c}
                            className={`px-4 py-2.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ${i === 6 ? 'text-right' : 'text-left'}`}
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-[#30363D]">
                      {jobs.map((job) => (
                        <tr
                          key={job.id}
                          className={`hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${job.status === 'failed' ? 'bg-red-50/40 dark:bg-red-900/10' : ''}`}
                        >
                          <td className="px-4 py-3 font-mono text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">{job.id}</td>
                          <td className="px-4 py-3 text-xs font-medium text-gray-900 dark:text-white whitespace-nowrap">{job.type}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{job.loc}</td>
                          <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{job.started}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{job.duration}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {job.status === 'running' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Berjalan
                              </span>
                            )}
                            {job.status === 'queued' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />Antri
                              </span>
                            )}
                            {job.status === 'failed' && (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />Gagal
                                </span>
                                {job.error && (
                                  <p className="text-[10px] text-red-400 mt-0.5 font-mono">{job.error}</p>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button className="text-primary hover:text-blue-600 mx-0.5 p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Lihat Detail">
                              <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                            </button>
                            <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 mx-0.5 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors" title="Lihat Log">
                              <span className="material-symbols-outlined text-[15px]">article</span>
                            </button>
                            {job.status === 'failed' && (
                              <button className="text-yellow-500 hover:text-yellow-600 mx-0.5 p-1 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded transition-colors" title="Retry">
                                <span className="material-symbols-outlined text-[15px]">replay</span>
                              </button>
                            )}
                            {(job.status === 'running' || job.status === 'queued') && (
                              <button className="text-red-400 hover:text-red-600 mx-0.5 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Batalkan">
                                <span className="material-symbols-outlined text-[15px]">cancel</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ── Audit Log ─────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-[#161B22] rounded-xl border border-gray-200 dark:border-[#30363D] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-[#30363D] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 text-[20px]">history</span>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Audit Log — Aktivitas Terkini</h2>
                </div>
                <button className="text-xs text-primary font-medium hover:underline">Lihat Semua Log</button>
              </div>
              <div className="px-6 py-3 border-b border-gray-100 dark:border-[#30363D] flex flex-wrap gap-3">
                <div className="relative">
                  <select className="bg-gray-50 dark:bg-[#0D1117] border border-gray-200 dark:border-[#30363D] rounded-lg px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-primary focus:border-primary outline-none appearance-none pr-7">
                    <option>Semua Role</option>
                    <option>Admin</option>
                    <option>Operator</option>
                  </select>
                  <span className="absolute right-2 top-1.5 text-gray-400 material-symbols-outlined text-[14px] pointer-events-none">expand_more</span>
                </div>
                <div className="relative">
                  <select className="bg-gray-50 dark:bg-[#0D1117] border border-gray-200 dark:border-[#30363D] rounded-lg px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-primary focus:border-primary outline-none appearance-none pr-7">
                    <option>Semua Aktivitas</option>
                    <option>Mulai Job</option>
                    <option>Update Metadata</option>
                    <option>Retry Job</option>
                    <option>Tambah Stasiun</option>
                    <option>Unduh Laporan</option>
                  </select>
                  <span className="absolute right-2 top-1.5 text-gray-400 material-symbols-outlined text-[14px] pointer-events-none">expand_more</span>
                </div>
                <input type="date" className="bg-gray-50 dark:bg-[#0D1117] border border-gray-200 dark:border-[#30363D] rounded-lg px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-primary focus:border-primary outline-none date-input" />
                <div className="relative">
                  <select className="bg-gray-50 dark:bg-[#0D1117] border border-gray-200 dark:border-[#30363D] rounded-lg px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-primary focus:border-primary outline-none appearance-none pr-7">
                    <option>Semua Stasiun</option>
                    <option>CMH-001</option>
                    <option>PGD-023</option>
                    <option>SBG-105</option>
                    <option>GWY-089</option>
                  </select>
                  <span className="absolute right-2 top-1.5 text-gray-400 material-symbols-outlined text-[14px] pointer-events-none">expand_more</span>
                </div>
                <button className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-[#30363D] rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">restart_alt</span>Reset
                </button>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-[#30363D]">
                {auditLogs.map((log, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    <span className="text-xs font-mono text-gray-400 shrink-0 w-10">{log.time}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        log.role === 'Admin'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {log.role}
                    </span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 min-w-0">{log.action}</span>
                    <span className="text-xs font-mono font-semibold text-gray-500 dark:text-gray-400 shrink-0">{log.target}</span>
                    <span className="text-xs text-gray-400 shrink-0 hidden lg:block truncate max-w-[180px]">{log.user}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 pb-2 border-t border-gray-200 dark:border-[#30363D] flex flex-col md:flex-row justify-between items-center gap-3">
              <p className="text-xs text-gray-400">© 2026 RE-Valid. Hak cipta dilindungi.</p>
              <div className="flex gap-4 text-xs text-gray-400">
                <Link href="#" className="hover:text-primary transition-colors">Ketentuan Layanan</Link>
                <Link href="#" className="hover:text-primary transition-colors">Kebijakan Privasi</Link>
                <Link href="#" className="hover:text-primary transition-colors">Bantuan</Link>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
