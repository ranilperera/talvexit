'use client';

import Link from 'next/link';

export function AppFooter() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-800/50 bg-slate-950/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          © {year}  Waveful Digital Platforms  . All rights reserved.
        </span>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-slate-300 transition-colors no-underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-slate-300 transition-colors no-underline">
            Terms
          </Link>
          <Link href="/contact" className="hover:text-slate-300 transition-colors no-underline">
            Contact
          </Link>
          <span className="text-slate-600">v{version}</span>
        </div>
      </div>
    </footer>
  );
}
