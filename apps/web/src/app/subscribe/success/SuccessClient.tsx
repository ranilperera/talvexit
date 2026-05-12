'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import { billingRouteFor, getUser } from '@/lib/customer-auth';

interface CurrentSubResponse {
  id: string;
  status: string;
  billing_interval: 'MONTHLY' | 'YEARLY';
  stripe_current_period_end: string | null;
  plan: { name: string };
}

// The Stripe webhook (handleCheckoutCompleted) creates the local Subscription
// row server-side. This page polls /subscriptions/current until that row
// exists, then shows the welcome card. Falls through to a generic success
// message if polling times out.

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 15000;

export default function SuccessClient() {
  const router = useRouter();
  const [sub, setSub] = useState<CurrentSubResponse | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const poll = useCallback(async () => {
    // Company admins subscribe their company, so their subscription lives at
    // ?subject=company. Without this branch the poll would query their
    // (non-existent) personal sub and time out forever.
    const u = getUser();
    const url =
      u?.account_type === 'COMPANY_ADMIN'
        ? '/api/v1/subscriptions/current?subject=company'
        : '/api/v1/subscriptions/current';

    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      try {
        const res = await customerApi.get<{
          success: boolean;
          data: CurrentSubResponse | null;
        }>(url);
        if (res.data.data && res.data.data.status !== 'INACTIVE') {
          setSub(res.data.data);
          return;
        }
      } catch {
        // 401 → interceptor redirects
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    setTimedOut(true);
  }, []);

  useEffect(() => {
    void poll();
  }, [poll]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        {!sub && !timedOut ? (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-6">
              <Loader2 size={28} className="text-teal-400 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold font-display text-slate-100">
              Confirming your subscription…
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              Stripe has accepted your payment. We&apos;re finalising your account
              — this usually takes only a few seconds.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mb-6">
              <CheckCircle2 size={28} className="text-teal-400" />
            </div>
            <h1 className="text-3xl font-bold font-display text-slate-100">
              {sub ? `Welcome to ${sub.plan.name}!` : 'Payment received'}
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              {sub
                ? 'Your subscription is active. You can manage billing, download invoices, or change plans any time from your billing dashboard.'
                : "Your payment was successful, but your account is still syncing. Refresh your billing page in a moment to see your subscription details."}
            </p>

            {sub?.stripe_current_period_end && (
              <p className="mt-4 text-xs text-slate-500">
                Next billing date:{' '}
                <span className="text-slate-300">
                  {format(new Date(sub.stripe_current_period_end), 'd MMM yyyy')}
                </span>{' '}
                ({sub.billing_interval.toLowerCase()})
              </p>
            )}

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="primary"
                size="lg"
                onClick={() => router.push(billingRouteFor())}
              >
                Go to billing
                <ArrowRight size={14} />
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/customer/dashboard">Back to dashboard</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
