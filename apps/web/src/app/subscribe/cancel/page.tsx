import type { Metadata } from 'next';
import Link from 'next/link';
import { XCircle, ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Subscription cancelled',
  robots: { index: false },
};

export default function SubscribeCancelPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-6">
          <XCircle size={28} className="text-slate-400" />
        </div>
        <h1 className="text-3xl font-bold font-display text-slate-100">
          Checkout cancelled
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          No payment was taken and your account is unchanged. You can pick a plan
          and try again whenever you&apos;re ready.
        </p>

        <div className="mt-6 rounded-xl bg-slate-900 border border-slate-800 p-4 text-left">
          <p className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
            <ShieldCheck size={12} className="text-teal-400" />
            Why subscribe
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-400">
            <li>• Higher monthly action limits</li>
            <li>• Priority listing and additional features</li>
            <li>• Cancel any time — no long-term commitment</li>
          </ul>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="primary" size="lg">
            <Link href="/pricing">
              View plans
              <ArrowRight size={14} />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/customer/dashboard">
              <ArrowLeft size={14} />
              Back to dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
