'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowRight,
  Crown,
  Download,
  ExternalLink,
  RefreshCw,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import { plansRouteFor } from '@/lib/customer-auth';

// ─── Types ───────────────────────────────────────────────────────────────────

type StatusValue =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'TRIALING'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'PAUSED'
  | 'UNPAID';

interface CurrentSubscription {
  id: string;
  status: StatusValue;
  billing_interval: 'MONTHLY' | 'YEARLY';
  stripe_current_period_end: string | null;
  stripe_cancel_at_period_end: boolean;
  stripe_trial_end: string | null;
  started_at: string | null;
  cancelled_at: string | null;
  plan: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    monthly_price_aud: string | null;
    yearly_price_aud: string | null;
    badge_text: string | null;
    highlight_color: string | null;
  };
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';
  total_cents: number;
  currency: string;
  paid_at: string | null;
  created_at: string;
  pdf_storage_url: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
}

const STATUS_CFG: Record<
  StatusValue,
  { label: string; color: 'green' | 'blue' | 'amber' | 'red' | 'slate' }
> = {
  ACTIVE: { label: 'Active', color: 'green' },
  TRIALING: { label: 'Trialing', color: 'blue' },
  PAST_DUE: { label: 'Past due', color: 'amber' },
  UNPAID: { label: 'Unpaid', color: 'amber' },
  PAUSED: { label: 'Paused', color: 'slate' },
  CANCELLED: { label: 'Cancelled', color: 'red' },
  INACTIVE: { label: 'Inactive', color: 'slate' },
};

const INVOICE_STATUS_COLOR: Record<
  InvoiceRow['status'],
  'green' | 'amber' | 'red' | 'slate'
> = {
  PAID: 'green',
  OPEN: 'amber',
  DRAFT: 'slate',
  VOID: 'slate',
  UNCOLLECTIBLE: 'red',
};

function fmtMoney(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface SubscriptionSectionProps {
  /**
   * Whose subscription this section is showing. Defaults to 'user' (the
   * caller's personal sub). Pass 'company' on the company-admin /company/billing
   * page to manage the ConsultingCompany's subscription instead.
   */
  subject?: 'user' | 'company';
}

export default function SubscriptionSection({
  subject = 'user',
}: SubscriptionSectionProps = {}) {
  const subjectQS = subject === 'company' ? '?subject=company' : '';
  const [sub, setSub] = useState<CurrentSubscription | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [subRes, invRes] = await Promise.all([
        customerApi.get<{ success: boolean; data: CurrentSubscription | null }>(
          `/api/v1/subscriptions/current${subjectQS}`,
        ),
        customerApi.get<{ success: boolean; data: InvoiceRow[] }>(
          `/api/v1/subscriptions/invoices${subjectQS}`,
        ),
      ]);
      setSub(subRes.data.data);
      setInvoices(invRes.data.data);
    } catch {
      // 401 already handled by interceptor; other errors silently no-op so
      // the order-billing section below still renders.
    } finally {
      setLoading(false);
    }
  }, [subjectQS]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function handleOpenPortal() {
    setOpening(true);
    try {
      const res = await customerApi.post<{
        success: boolean;
        data: { portal_url: string };
      }>(`/api/v1/subscriptions/portal${subjectQS}`);
      window.location.href = res.data.data.portal_url;
    } catch {
      // toast surfaced by interceptor
    } finally {
      setOpening(false);
    }
  }

  // Explicit "Refresh from Stripe" — use when a Stripe-side change (upgrade,
  // downgrade, cancel) didn't reach the local DB because a webhook was
  // dropped (e.g. stripe listen wasn't running). Server reconciles via
  // /api/v1/subscriptions/sync; we then refetch the local view.
  const [syncing, setSyncing] = useState(false);
  async function handleSyncFromStripe() {
    setSyncing(true);
    try {
      const res = await customerApi.post<{
        success: boolean;
        data: { changed: boolean; reason: string };
      }>(`/api/v1/subscriptions/sync${subjectQS}`);
      if (res.data.data.changed) {
        toast.success('Plan synced from Stripe.');
      } else {
        toast.success(`Already in sync (${res.data.data.reason}).`);
      }
      void fetchAll();
    } catch {
      // toast surfaced by interceptor
    } finally {
      setSyncing(false);
    }
  }

  async function handleCancel() {
    if (
      !window.confirm(
        'Cancel your subscription at the end of the current billing period? You will retain access until then.',
      )
    ) {
      return;
    }
    setCancelling(true);
    try {
      await customerApi.post(`/api/v1/subscriptions/cancel${subjectQS}`);
      toast.success('Subscription will end at the period close.');
      void fetchAll();
    } catch {
      // toast surfaced by interceptor
    } finally {
      setCancelling(false);
    }
  }

  async function handleDownloadInvoice(inv: InvoiceRow) {
    setDownloadingId(inv.id);
    try {
      const res = await customerApi.get<{
        success: boolean;
        data: { download_url: string };
      }>(`/api/v1/subscriptions/invoices/${inv.id}/pdf${subjectQS}`);
      window.open(res.data.data.download_url, '_blank', 'noopener,noreferrer');
    } catch {
      // toast surfaced by interceptor
    } finally {
      setDownloadingId(null);
    }
  }

  // ── Render: loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <p className="text-sm text-slate-500">Loading subscription…</p>
      </div>
    );
  }

  // ── Render: no active subscription ───────────────────────────────────────

  if (!sub) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-900/50 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-teal-500/10 border border-teal-500/30 p-3">
              <Crown size={20} className="text-teal-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                No active subscription
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Subscribe to a plan to unlock higher monthly limits and additional
                features.
              </p>
            </div>
          </div>
          <Button asChild variant="primary" size="md">
            <Link href={plansRouteFor()}>
              View plans
              <ArrowRight size={14} />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: has subscription ─────────────────────────────────────────────

  const statusCfg = STATUS_CFG[sub.status];
  const monthlyPrice = sub.plan.monthly_price_aud
    ? Number(sub.plan.monthly_price_aud)
    : null;
  const yearlyPrice = sub.plan.yearly_price_aud
    ? Number(sub.plan.yearly_price_aud)
    : null;
  const currentPrice = sub.billing_interval === 'MONTHLY' ? monthlyPrice : yearlyPrice;
  const isEnding = sub.stripe_cancel_at_period_end;

  return (
    <div className="space-y-4">
      {/* ── Subscription card ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div
                className="rounded-xl border p-3 shrink-0"
                style={{
                  background: sub.plan.highlight_color
                    ? `${sub.plan.highlight_color}1a`
                    : 'rgba(20, 184, 166, 0.1)',
                  borderColor: sub.plan.highlight_color ?? 'rgba(20, 184, 166, 0.3)',
                }}
              >
                <Crown
                  size={20}
                  style={{ color: sub.plan.highlight_color ?? '#14b8a6' }}
                />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-slate-100">
                    {sub.plan.name}
                  </h2>
                  <Badge color={statusCfg.color}>{statusCfg.label}</Badge>
                  {isEnding && <Badge color="amber">Ending</Badge>}
                  {sub.plan.badge_text && (
                    <Badge color="teal">{sub.plan.badge_text}</Badge>
                  )}
                </div>
                {sub.plan.description && (
                  <p className="mt-1 text-sm text-slate-400">{sub.plan.description}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500">
                  {currentPrice !== null && (
                    <span>
                      <span className="text-slate-300 font-semibold tabular-nums">
                        ${currentPrice.toFixed(2)}
                      </span>{' '}
                      / {sub.billing_interval === 'MONTHLY' ? 'month' : 'year'} AUD
                    </span>
                  )}
                  {sub.stripe_current_period_end && (
                    <span>
                      {isEnding ? 'Ends' : 'Renews'}{' '}
                      <span className="text-slate-300">
                        {format(new Date(sub.stripe_current_period_end), 'd MMM yyyy')}
                      </span>
                    </span>
                  )}
                  {sub.stripe_trial_end &&
                    new Date(sub.stripe_trial_end) > new Date() && (
                      <span>
                        Trial ends{' '}
                        <span className="text-slate-300">
                          {format(new Date(sub.stripe_trial_end), 'd MMM yyyy')}
                        </span>
                      </span>
                    )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="md"
                loading={syncing}
                onClick={() => void handleSyncFromStripe()}
                title="Pull the latest plan + status from Stripe (use after a portal upgrade if your plan hasn't updated)"
              >
                <RefreshCw size={14} />
                Sync from Stripe
              </Button>
              <Button
                variant="secondary"
                size="md"
                loading={opening}
                onClick={() => void handleOpenPortal()}
              >
                <ExternalLink size={14} />
                Manage in portal
              </Button>
            </div>
          </div>

          {/* ── Cancel banner ──────────────────────────────────────────────── */}
          {isEnding && (
            <div className="mt-5 rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <p className="font-medium text-amber-300">
                  Subscription scheduled to cancel
                </p>
                <p className="mt-1 text-amber-300/80">
                  Your subscription will end on{' '}
                  {sub.stripe_current_period_end
                    ? format(new Date(sub.stripe_current_period_end), 'd MMM yyyy')
                    : 'the next billing date'}
                  . You&apos;ll keep access until then. To resume, manage the subscription
                  in the Stripe portal.
                </p>
              </div>
            </div>
          )}

          {/* ── Footer actions ─────────────────────────────────────────────── */}
          {!isEnding && sub.status !== 'CANCELLED' && (
            <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4">
              <Link
                href={plansRouteFor()}
                className="text-xs text-slate-500 hover:text-slate-300 no-underline inline-flex items-center gap-1"
              >
                Change plan
                <ArrowRight size={11} />
              </Link>
              <button
                onClick={() => void handleCancel()}
                disabled={cancelling}
                className="text-xs text-slate-500 hover:text-red-400 inline-flex items-center gap-1 disabled:opacity-50"
              >
                {cancelling ? (
                  <RefreshCw size={11} className="animate-spin" />
                ) : (
                  <XCircle size={11} />
                )}
                Cancel subscription
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Subscription invoices ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-200">
            Subscription invoices
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Tax invoices for your monthly / yearly billing.
          </p>
        </div>

        {invoices.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-500">
            No subscription invoices yet — your first one will appear after the next
            billing cycle.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 bg-slate-950/40 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3 font-semibold">Invoice</th>
                  <th className="px-6 py-3 font-semibold">Period</th>
                  <th className="px-6 py-3 font-semibold text-right">Amount</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-slate-800/40 last:border-b-0"
                  >
                    <td className="px-6 py-3">
                      <div className="font-mono text-xs text-slate-300">
                        {inv.invoice_number}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {inv.paid_at
                          ? `Paid ${format(new Date(inv.paid_at), 'd MMM yyyy')}`
                          : `Created ${format(new Date(inv.created_at), 'd MMM yyyy')}`}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-400">
                      {inv.billing_period_start && inv.billing_period_end
                        ? `${format(
                            new Date(inv.billing_period_start),
                            'd MMM',
                          )} → ${format(
                            new Date(inv.billing_period_end),
                            'd MMM yyyy',
                          )}`
                        : '—'}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-slate-300">
                      {fmtMoney(inv.total_cents, inv.currency)}
                    </td>
                    <td className="px-6 py-3">
                      <Badge color={INVOICE_STATUS_COLOR[inv.status]}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {inv.pdf_storage_url ? (
                        <button
                          onClick={() => void handleDownloadInvoice(inv)}
                          disabled={downloadingId === inv.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:border-teal-400 hover:text-teal-400 disabled:opacity-50"
                        >
                          {downloadingId === inv.id ? (
                            <RefreshCw size={11} className="animate-spin" />
                          ) : (
                            <Download size={11} />
                          )}
                          PDF
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600">Generating…</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
