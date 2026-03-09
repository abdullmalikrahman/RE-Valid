import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="flex-none bg-[#111a22] px-6 py-4 z-40 border-t border-[#1e2a36]">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-[13px] text-[#5b6b7c]">
          © 2026 RE-Valid. Semua hak dilindungi.
        </p>
        <div className="flex items-center gap-6">
          <Link href="#" className="text-[13px] text-[#5b6b7c] hover:text-white transition-colors">
            Kebijakan Privasi
          </Link>
          <Link href="#" className="text-[13px] text-[#5b6b7c] hover:text-white transition-colors">
            Syarat &amp; Ketentuan
          </Link>
          <Link href="#" className="text-[13px] text-[#5b6b7c] hover:text-white transition-colors">
            Peta Situs
          </Link>
        </div>
      </div>
    </footer>
  );
}
