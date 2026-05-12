'use client';

import Link from 'next/link';
import { ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="text-center space-y-5 max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
          <ShieldOff size={22} className="text-red-400" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display font-bold text-2xl text-slate-100">Access denied</h1>
          <p className="text-sm text-slate-400">
            You don&apos;t have permission to view this page.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={() => window.history.back()} variant="secondary">
            ← Go Back
          </Button>
          <Button asChild>
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
