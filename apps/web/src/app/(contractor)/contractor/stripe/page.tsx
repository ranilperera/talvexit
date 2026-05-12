'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';

type Color = 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue';

const STATUS_CFG: Record<string, { label: string; color: Color }> = {
  ENABLED:      { label: 'Enabled',       color: 'green' },
  RESTRICTED:   { label: 'Restricted',    color: 'amber' },
  PENDING:      { label: 'Pending Setup', color: 'amber' },
  DISCONNECTED: { label: 'Not Connected', color: 'slate' },
};

interface StripeStatus {
  stripe_account_id: string | null;
  stripe_connect_status: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements_due: string[];
  onboarding_url: string | null;
}

function StripePageContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('success')) toast.success('Stripe Connect setup complete!');
    if (searchParams.get('refresh')) toast('Please reconnect your Stripe account.');
  }, [searchParams]);

  useEffect(() => {
    customerApi
      .get<{ success: boolean; data: StripeStatus }>('/api/v1/contractor/stripe/status')
      .then((res) => setStatus(res.data.data))
      .catch(() => setStatus({
        stripe_account_id: null,
        stripe_connect_status: 'DISCONNECTED',
        charges_enabled: false,
        payouts_enabled: false,
        requirements_due: [],
        onboarding_url: null,
      }))
      .finally(() => setLoading(false));
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await customerApi.post<{ success: boolean; data: { onboarding_url: string } }>(
        '/api/v1/contractor/stripe/connect',
        {
          return_url: `${window.location.origin}/contractor/stripe?success=true`,
          refresh_url: `${window.location.origin}/contractor/stripe?refresh=true`,
        },
      );
      window.location.href = res.data.data.onboarding_url;
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      const msg = e.response?.data?.error?.message ?? 'Could not start Stripe setup. Please try again later.';
      setConnectError(msg);
    } finally {
      setConnecting(false);
    }
  }

  const stripeStatus = status?.stripe_connect_status ?? 'DISCONNECTED';
  const cfg = STATUS_CFG[stripeStatus] ?? STATUS_CFG.DISCONNECTED;
  const isEnabled = stripeStatus === 'ENABLED';
  const isRestricted = stripeStatus === 'RESTRICTED';
  const isConnected = !!status?.stripe_account_id;

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-100">Stripe Connect</h1>
        <p className="text-sm text-slate-400 mt-1">
          Connect Stripe to receive payouts. Your account is already active — this step is optional and can be set up at any time.
        </p>
      </div>

      {!isConnected ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💳</span>
            <div>
              <h2 className="font-display font-semibold text-lg text-slate-100">Enable Payouts</h2>
              <p className="text-sm text-slate-400">
                Connect your Stripe account to receive payouts from completed orders.
              </p>
            </div>
          </div>

          <ul className="space-y-2">
            {[
              'Automatic payouts after customer approval',
              'Commission deducted automatically',
              'Full payout history',
              'Next-business-day settlement',
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-slate-300">
                <span className="text-teal-400">✓</span>
                {feature}
              </li>
            ))}
          </ul>

          {connectError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
              {connectError}
            </div>
          )}

          <Button onClick={() => { void handleConnect(); }} loading={connecting} size="lg">
            Connect with Stripe
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-slate-100">Account Status</h2>
              <Badge color={cfg.color}>{cfg.label}</Badge>
            </div>

            {isEnabled && (
              <div className="flex items-center gap-2 text-sm text-teal-400">
                <span>✓</span>
                <span>Payouts enabled. You&apos;re ready to receive payments.</span>
              </div>
            )}

            {isRestricted && (
              <div className="space-y-4">
                <p className="text-sm text-amber-300 font-medium">Required before payouts are enabled:</p>
                <ul className="space-y-1">
                  {(status?.requirements_due ?? []).map((req) => (
                    <li key={req} className="text-sm text-slate-300">• {req}</li>
                  ))}
                </ul>
                {connectError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
                    {connectError}
                  </div>
                )}
                <Button onClick={() => { void handleConnect(); }} loading={connecting} variant="secondary">
                  Update Stripe Details
                </Button>
              </div>
            )}

            {!isEnabled && !isRestricted && (
              <div className="space-y-3">
                <p className="text-sm text-slate-400">Your Stripe account is being set up.</p>
                {connectError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
                    {connectError}
                  </div>
                )}
                <Button onClick={() => { void handleConnect(); }} loading={connecting} variant="secondary">
                  Continue Setup
                </Button>
              </div>
            )}
          </div>

          {status?.stripe_account_id && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">Account ID</span>
              <span className="text-xs font-mono text-slate-400">{status.stripe_account_id}</span>
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-5 py-4 text-xs text-slate-500">
        Stripe Connect is required only when you are ready to receive payouts. Your account remains fully active without it.
      </div>
    </div>
  );
}

export default function StripePage() {
  return (
    <Suspense>
      <StripePageContent />
    </Suspense>
  );
}
