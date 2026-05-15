'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';
import { AlertTriangle, History, ArrowUpRight, Sparkles } from 'lucide-react';
import customerApi from '@/lib/customer-api';

// ── Types ────────────────────────────────────────────────────────────────────

interface QuotaSnapshot {
  used: number;
  limit: number | null;
  remaining: number | null;
  warn: boolean;
}

interface UsageResponse {
  plan: { slug: string; name: string; status: string } | null;
  period: { start: string | null; end: string | null } | null;
  quotas: Record<string, QuotaSnapshot>;
  history: Array<{
    period_start: string;
    period_end: string;
    plan_name: string;
    task_bookings_used: number;   task_bookings_limit: number | null;
    orders_used: number;          orders_limit: number | null;
    ai_scopes_used: number;       ai_scopes_limit: number | null;
    contracts_used: number;       contracts_limit: number | null;
    manual_tenders_used: number;  manual_tenders_limit: number | null;
  }>;
}

const QUOTA_LABELS: Record<string, string> = {
  task_bookings:  'Task bookings',
  active_orders:  'Active orders',
  orders:         'Total orders',
  ai_scopes:      'AI scopes',
  contracts:      'Contracts',
  active_tenders: 'Active tenders',
  manual_tenders: 'Manual tenders',
};

// Display order — matches the plan matrix in the design doc.
const QUOTA_ORDER = [
  'task_bookings', 'active_orders', 'orders', 'ai_scopes', 'contracts', 'active_tenders', 'manual_tenders',
];

// ── Component ────────────────────────────────────────────────────────────────

export default function SubscriptionUsagePanel() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    // Endpoint now returns { audience, payload } — customer panel only renders
    // when audience === 'customer' (the dispatcher routes by plan_type).
    customerApi
      .get<{ success: boolean; data: { audience: string; payload: UsageResponse } }>(
        '/api/v1/subscriptions/me/usage',
      )
      .then((res) => {
        if (res.data.data.audience === 'customer') {
          setData(res.data.data.payload);
        }
      })
      .catch(() => { /* shown via fallback below */ })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 animate-pulse">
        <div className="h-5 w-48 bg-slate-800 rounded mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-slate-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || !data.plan) {
    return null;
  }

  const periodEnd = data.period?.end ? new Date(data.period.end) : null;
  const resetIn = periodEnd ? formatDistanceToNow(periodEnd, { addSuffix: false }) : null;
  const anyWarn = Object.values(data.quotas).some((q) => q.warn);

  return (
    <section
      className={clsx(
        'rounded-2xl border p-6',
        anyWarn
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-slate-800 bg-slate-900/40',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-400 mb-1">
            Usage this period
          </p>
          <h2 className="font-display font-bold text-xl text-slate-100 flex items-center gap-2">
            {data.plan.name}
            {data.plan.status === 'TRIALING' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300">
                Trial
              </span>
            )}
          </h2>
          {periodEnd && (
            <p className="text-xs text-slate-400 mt-1">
              Resets in <span className="text-slate-200">{resetIn}</span> · {format(periodEnd, 'd MMM yyyy')}
            </p>
          )}
        </div>
        <Link
          href="/customer/plans"
          className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:border-teal-500 hover:text-teal-400 text-slate-300 no-underline transition-colors"
        >
          <Sparkles size={12} /> Upgrade plan
          <ArrowUpRight size={12} />
        </Link>
      </div>

      {/* Anywarn banner */}
      {anyWarn && (
        <div className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 flex items-start gap-2.5">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-200 leading-relaxed">
            You&apos;re close to one or more quotas this period. Consider upgrading
            to keep going without interruption.
          </p>
        </div>
      )}

      {/* Quota grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {QUOTA_ORDER.map((key) => {
          const q = data.quotas[key];
          if (!q) return null;
          return <UsageBar key={key} label={QUOTA_LABELS[key] ?? key} q={q} />;
        })}
      </div>

      {/* History */}
      {data.history.length > 0 && (
        <div className="mt-6 border-t border-slate-800 pt-5">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1.5 transition-colors"
          >
            <History size={12} />
            {historyOpen ? 'Hide' : 'Show'} usage history ({data.history.length} {data.history.length === 1 ? 'period' : 'periods'})
          </button>
          {historyOpen && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-slate-500">
                    <th className="py-2 pr-3 font-medium">Period</th>
                    <th className="py-2 pr-3 font-medium">Plan</th>
                    <th className="py-2 pr-3 font-medium text-right">Bookings</th>
                    <th className="py-2 pr-3 font-medium text-right">Orders</th>
                    <th className="py-2 pr-3 font-medium text-right">AI scopes</th>
                    <th className="py-2 pr-3 font-medium text-right">Contracts</th>
                    <th className="py-2 pr-3 font-medium text-right">Manual tenders</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((h, i) => (
                    <tr key={i} className="border-b border-slate-800/40 text-slate-300">
                      <td className="py-2 pr-3 text-slate-400">
                        {format(new Date(h.period_start), 'd MMM')} — {format(new Date(h.period_end), 'd MMM yyyy')}
                      </td>
                      <td className="py-2 pr-3 text-slate-400">{h.plan_name}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {h.task_bookings_used} / {h.task_bookings_limit ?? '∞'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {h.orders_used} / {h.orders_limit ?? '∞'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {h.ai_scopes_used} / {h.ai_scopes_limit ?? '∞'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {h.contracts_used} / {h.contracts_limit ?? '∞'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {h.manual_tenders_used} / {h.manual_tenders_limit ?? '∞'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── UsageBar ─────────────────────────────────────────────────────────────────

function UsageBar({ label, q }: { label: string; q: QuotaSnapshot }) {
  const isUnlimited = q.limit === null;
  const pct = isUnlimited ? 0 : q.limit && q.limit > 0 ? Math.min(100, Math.round((q.used / q.limit) * 100)) : 0;
  const atCap = !isUnlimited && q.remaining === 0;
  const tone = atCap ? 'red' : q.warn ? 'amber' : 'teal';
  const barColour =
    tone === 'red'
      ? 'bg-red-500'
      : tone === 'amber'
        ? 'bg-amber-400'
        : 'bg-teal-500';
  const textColour =
    tone === 'red'
      ? 'text-red-400'
      : tone === 'amber'
        ? 'text-amber-300'
        : 'text-slate-200';

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className={clsx('text-xs font-semibold tabular-nums', textColour)}>
          {q.used} / {isUnlimited ? '∞' : q.limit}
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', barColour)}
          style={{ width: isUnlimited ? '0%' : `${pct}%` }}
        />
      </div>
      {atCap ? (
        <p className="text-[11px] text-red-400 mt-1.5">Limit reached for this period</p>
      ) : q.warn ? (
        <p className="text-[11px] text-amber-300 mt-1.5">
          Only {q.remaining} left this period
        </p>
      ) : isUnlimited ? (
        <p className="text-[11px] text-slate-500 mt-1.5">Unlimited on your plan</p>
      ) : null}
    </div>
  );
}
