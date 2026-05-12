'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Large ghost "404" */}
      <span
        className="absolute select-none font-display font-bold text-slate-800 pointer-events-none"
        style={{ fontSize: 'clamp(8rem, 25vw, 20rem)', lineHeight: 1, opacity: 0.4 }}
        aria-hidden
      >
        404
      </span>

      {/* Foreground content */}
      <div className="relative text-center space-y-5 max-w-md">
        <h1 className="font-display font-bold text-2xl text-slate-100">Page not found</h1>
        <p className="text-slate-400 text-sm">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <div className="flex items-center justify-center gap-3 pt-1">
          <Button
            variant="secondary"
            onClick={() => window.history.back()}
          >
            ← Go Back
          </Button>
          <Button asChild>
            <Link href="/tasks">Browse Tasks</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
