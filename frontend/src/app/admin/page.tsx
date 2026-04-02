import Link from 'next/link';

const stations = [
  {
    name: 'Stasiun Merapi Utara',
    id: 'MTP-001',
    region: 'Jawa Tengah',
    coords: '-7.5412, 110.4456',
    installed: '12 Jan 2023',
    status: 'aktif',
  },
  {
    name: 'Pos Pengukuran Bromo',
    id: 'BRM-023',
    region: 'Jawa Timur',
    coords: '-7.9421, 112.9532',
    installed: '24 Mar 2023',
    status: 'maintenance',
  },
  {
    name: 'Stasiun Pesisir Baron',
    id: 'BRN-105',
    region: 'D.I. Yogyakarta',
    coords: '-8.1289, 110.5488',
    installed: '05 Nov 2022',
    status: 'nonaktif',
  },
  {
    name: 'Pos Bukit Bintang',
    id: 'BKB-089',
    region: 'D.I. Yogyakarta',
    coords: '-7.8452, 110.4791',
    installed: '15 Feb 2023',
    status: 'aktif',
  },
];

function StatusBadge({ status }: { status: string }) {
  if (status === 'aktif') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
        <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-green-500" />
        Aktif
      </span>
    );
  }
  if (status === 'maintenance') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">
        <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-yellow-500 animate-pulse" />
        Perbaikan
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
      <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-gray-500" />
      Non-Aktif
    </span>
  );
}

export default function AdminPage() {
  return (
    <div className="bg-gray-100 dark:bg-[#0B1116] text-gray-900 dark:text-gray-100 h-screen flex overflow-hidden antialiased font-display">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-[#161B22] border-r border-gray-200 dark:border-[#30363D] hidden md:flex flex-col z-20">
        <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-[#30363D]">
          <Link href="/" className="flex items-center gap-0">
            <span className="material-symbols-outlined text-primary mr-2">bolt</span>
            <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
              RE-Valid
            </span>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <Link
            href="#"
            className="group flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all"
          >
            <span className="material-symbols-outlined mr-3 text-[20px]">dashboard</span>
            Dashboard
          </Link>
          <Link
            href="#"
            className="group flex items-center px-3 py-2.5 text-sm font-medium bg-primary/10 text-primary rounded-lg transition-all"
          >
            <span className="material-symbols-outlined mr-3 text-[20px]">location_on</span>
            Data Lokasi
          </Link>
          <Link
            href="#"
            className="group flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all"
          >
            <span className="material-symbols-outlined mr-3 text-[20px]">bar_chart</span>
            Metrik Validasi
          </Link>
          <Link
            href="/peta"
            className="group flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all"
          >
            <span className="material-symbols-outlined mr-3 text-[20px]">map</span>
            Peta Potensi (GIS)
          </Link>

          <div className="pt-4 mt-4 border-t border-gray-200 dark:border-[#30363D]">
            <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Pengaturan
            </p>
            <Link
              href="#"
              className="group flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all"
            >
              <span className="material-symbols-outlined mr-3 text-[20px]">settings</span>
              Sistem
            </Link>
            <Link
              href="#"
              className="group flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all"
            >
              <span className="material-symbols-outlined mr-3 text-[20px]">group</span>
              Pengguna
            </Link>
          </div>
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-gray-200 dark:border-[#30363D]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                Admin Utama
              </p>
              <p className="text-xs text-gray-500 truncate">admin@re-valid.id</p>
            </div>
            <button className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 bg-white dark:bg-[#161B22] border-b border-gray-200 dark:border-[#30363D]">
          <div className="flex items-center gap-4">
            <button className="md:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <nav aria-label="Breadcrumb" className="hidden sm:flex">
              <ol className="flex items-center space-x-2" role="list">
                <li>
                  <Link href="/" className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
                    <span className="material-symbols-outlined text-[20px]">home</span>
                  </Link>
                </li>
                <li>
                  <span className="text-gray-300 dark:text-gray-600">/</span>
                </li>
                <li>
                  <Link
                    href="#"
                    className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Admin
                  </Link>
                </li>
                <li>
                  <span className="text-gray-300 dark:text-gray-600">/</span>
                </li>
                <li>
                  <span
                    aria-current="page"
                    className="text-sm font-medium text-primary"
                  >
                    Lokasi Pengukuran
                  </span>
                </li>
              </ol>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 relative">
              <span className="material-symbols-outlined text-[24px]">notifications</span>
              <span className="absolute top-2 right-2 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-[#161B22]" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Page title + actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  Pengelolaan Lokasi
                </h1>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Kelola daftar stasiun meteorologi dan parameter geografis.
                </p>
              </div>
              <div className="flex gap-3">
                <button className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#161B22] border border-gray-300 dark:border-[#30363D] rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Ekspor Data
                </button>
                <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg text-sm font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:focus:ring-offset-[#161B22]">
                  <span className="material-symbols-outlined text-[20px]">add</span>
                  Tambah Lokasi
                </button>
              </div>
            </div>

            {/* Search + filters */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-5 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-gray-400 text-[20px]">search</span>
                </div>
                <input
                  className="block w-full pl-10 pr-3 py-2.5 bg-white dark:bg-[#0D1117] border border-gray-300 dark:border-[#30363D] rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="Cari berdasarkan nama stasiun atau kode..."
                  type="text"
                />
              </div>
              <div className="md:col-span-3">
                <select className="block w-full py-2.5 px-3 bg-white dark:bg-[#0D1117] border border-gray-300 dark:border-[#30363D] rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary focus:border-primary">
                  <option value="">Semua Wilayah</option>
                  <option value="jawa-tengah">Jawa Tengah</option>
                  <option value="jawa-timur">Jawa Timur</option>
                  <option value="yogyakarta">D.I. Yogyakarta</option>
                  <option value="jawa-barat">Jawa Barat</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <select className="block w-full py-2.5 px-3 bg-white dark:bg-[#0D1117] border border-gray-300 dark:border-[#30363D] rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary focus:border-primary">
                  <option value="">Semua Status</option>
                  <option value="aktif">Aktif</option>
                  <option value="maintenance">Perbaikan</option>
                  <option value="non-aktif">Tidak Aktif</option>
                </select>
              </div>
              <div className="md:col-span-1">
                <button
                  className="w-full h-full flex items-center justify-center bg-white dark:bg-[#161B22] border border-gray-300 dark:border-[#30363D] rounded-lg text-gray-500 hover:text-primary hover:border-primary transition-colors"
                  title="Filter Lanjutan"
                >
                  <span className="material-symbols-outlined text-[20px]">tune</span>
                </button>
              </div>
            </div>

            {/* Stations table */}
            <div className="bg-white dark:bg-[#161B22] rounded-xl border border-gray-200 dark:border-[#30363D] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-[#30363D]">
                  <thead className="bg-gray-50 dark:bg-black/20">
                    <tr>
                      {['Nama Stasiun', 'Wilayah', 'Koordinat', 'Instalasi', 'Status', 'Aksi'].map(
                        (col, i) => (
                          <th
                            key={col}
                            className={`px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${
                              i === 5 ? 'text-right' : 'text-left'
                            }`}
                            scope="col"
                          >
                            {col}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-[#30363D]">
                    {stations.map((station) => (
                      <tr
                        key={station.id}
                        className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-primary mr-3">
                              <span className="material-symbols-outlined text-[18px]">sensors</span>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {station.name}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                ID: {station.id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                          {station.region}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600 dark:text-gray-300">
                          {station.coords}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                          {station.installed}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge status={station.status} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            className="text-primary hover:text-blue-600 mx-1 p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                            title="Edit"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          <button
                            className="text-red-500 hover:text-red-600 mx-1 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Hapus"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="bg-white dark:bg-[#161B22] px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-[#30363D] sm:px-6">
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Menampilkan{' '}
                      <span className="font-medium text-gray-900 dark:text-white">1</span> sampai{' '}
                      <span className="font-medium text-gray-900 dark:text-white">4</span> dari{' '}
                      <span className="font-medium text-gray-900 dark:text-white">24</span> hasil
                    </p>
                  </div>
                  <nav
                    aria-label="Pagination"
                    className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                  >
                    <Link
                      href="#"
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-[#30363D] bg-white dark:bg-[#161B22] text-sm font-medium text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <span className="sr-only">Sebelumnya</span>
                      <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                    </Link>
                    <Link
                      href="#"
                      aria-current="page"
                      className="z-10 bg-primary/10 border-primary text-primary relative inline-flex items-center px-4 py-2 border text-sm font-medium"
                    >
                      1
                    </Link>
                    <Link
                      href="#"
                      className="bg-white dark:bg-[#161B22] border-gray-300 dark:border-[#30363D] text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 relative inline-flex items-center px-4 py-2 border text-sm font-medium"
                    >
                      2
                    </Link>
                    <Link
                      href="#"
                      className="bg-white dark:bg-[#161B22] border-gray-300 dark:border-[#30363D] text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 relative inline-flex items-center px-4 py-2 border text-sm font-medium"
                    >
                      3
                    </Link>
                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-[#30363D] bg-white dark:bg-[#161B22] text-sm font-medium text-gray-700 dark:text-gray-400">
                      ...
                    </span>
                    <Link
                      href="#"
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-[#30363D] bg-white dark:bg-[#161B22] text-sm font-medium text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <span className="sr-only">Selanjutnya</span>
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </Link>
                  </nav>
                </div>
              </div>
            </div>
            {/* MQTT Station Monitoring */}
            <div className="bg-white dark:bg-[#161B22] rounded-xl border border-gray-200 dark:border-[#30363D] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-[#30363D] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">sensors</span>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">Status MQTT Stasiun</h2>
                </div>
                <span className="text-xs text-gray-400">Diperbarui: 14 mnt lalu</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-[#30363D] text-sm">
                  <thead className="bg-gray-50 dark:bg-black/20">
                    <tr>
                      {['Stasiun', 'Topik MQTT', 'Data Terakhir', 'Frekuensi', 'Status'].map((col) => (
                        <th key={col} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-[#30363D]">
                    {[
                      { id: 'MTP-001', topic: 'stations/MTP-001/data', last: '14 mnt lalu', freq: '10 mnt', ok: true },
                      { id: 'BRM-023', topic: 'stations/BRM-023/data', last: '2 jam lalu', freq: '10 mnt', ok: false },
                      { id: 'BRN-105', topic: 'stations/BRN-105/data', last: '3 hari lalu', freq: '\u2014', ok: false },
                      { id: 'BKB-089', topic: 'stations/BKB-089/data', last: '8 mnt lalu', freq: '10 mnt', ok: true },
                    ].map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                        <td className="px-6 py-3 font-mono text-xs text-gray-900 dark:text-white font-semibold">{row.id}</td>
                        <td className="px-6 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{row.topic}</td>
                        <td className="px-6 py-3 text-xs text-gray-600 dark:text-gray-300">{row.last}</td>
                        <td className="px-6 py-3 text-xs text-gray-600 dark:text-gray-300">{row.freq}</td>
                        <td className="px-6 py-3">
                          {row.ok ? (
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Celery Job Queue */}
            <div className="bg-white dark:bg-[#161B22] rounded-xl border border-gray-200 dark:border-[#30363D] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-[#30363D] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-violet-400 text-[20px]">queue</span>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">Antrian Job Celery</h2>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full font-medium">1 Berjalan</span>
                  <span className="bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full font-medium">2 Antri</span>
                  <span className="bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full font-medium">0 Gagal</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-[#30363D] text-sm">
                  <thead className="bg-gray-50 dark:bg-black/20">
                    <tr>
                      {['Job ID', 'Tipe', 'Lokasi', 'Dimulai', 'Status'].map((col) => (
                        <th key={col} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-[#30363D]">
                    {[
                      { id: 'job-4a2f', type: 'MCP Analysis', loc: 'BKB-089', started: '14:31 WIB', status: 'running' },
                      { id: 'job-7c1e', type: 'MCP Analysis', loc: 'MTP-001', started: '\u2014', status: 'queued' },
                      { id: 'job-9d3b', type: 'Laporan PDF', loc: 'BKB-089', started: '\u2014', status: 'queued' },
                    ].map((job) => (
                      <tr key={job.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                        <td className="px-6 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{job.id}</td>
                        <td className="px-6 py-3 text-xs font-medium text-gray-900 dark:text-white">{job.type}</td>
                        <td className="px-6 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{job.loc}</td>
                        <td className="px-6 py-3 text-xs text-gray-600 dark:text-gray-300">{job.started}</td>
                        <td className="px-6 py-3">
                          {job.status === 'running' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Berjalan
                            </span>
                          )}
                          {job.status === 'queued' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />Antri
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Footer */}
            <div className="pt-8 border-t border-gray-200 dark:border-[#30363D]">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  © 2026 RE-Valid. Hak cipta dilindungi.
                </p>
                <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500">
                  <Link href="#" className="hover:text-primary">
                    Ketentuan Layanan
                  </Link>
                  <Link href="#" className="hover:text-primary">
                    Kebijakan Privasi
                  </Link>
                  <Link href="#" className="hover:text-primary">
                    Bantuan
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
