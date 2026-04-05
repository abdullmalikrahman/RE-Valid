import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="flex-none bg-panel-dark px-6 py-4 z-40 border-t border-border-dark">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-[13px] text-text-secondary">
          © 2026 RE-Valid. Semua hak dilindungi.
        </p>
        <div className="flex items-center gap-6">
          <Link href="#" className="text-[13px] text-text-secondary hover:text-white transition-colors">
            Kebijakan Privasi
          </Link>
          <Link href="#" className="text-[13px] text-text-secondary hover:text-white transition-colors">
            Syarat &amp; Ketentuan
          </Link>
          <Link href="#" className="text-[13px] text-text-secondary hover:text-white transition-colors">
            Peta Situs
          </Link>
        </div>
      </div>
    </footer>
  );
}
