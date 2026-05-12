'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="text-center space-y-5 max-w-md">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
          <span className="text-red-400 text-2xl">!</span>
        </div>

        <div className="space-y-2">
          <h1 className="font-display font-bold text-2xl text-slate-100">Something went wrong</h1>
          {error.digest && (
            <p className="text-xs font-mono text-slate-600">Error reference: {error.digest}</p>
          )}
          <p className="text-sm text-slate-400">
            An unexpected error occurred. Please try again or return to the home page.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button onClick={reset}>Try Again</Button>
          <Button variant="secondary" asChild>
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
