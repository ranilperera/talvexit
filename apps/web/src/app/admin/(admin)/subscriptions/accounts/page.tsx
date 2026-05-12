'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Search } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Badge } from '@/components/ui/Badge';

type StatusValue =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'TRIALING'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'PAUSED'
  | 'UNPAID';

type IntervalValue = 'MONTHLY' | 'YEARLY';

interface SubscriptionRow {
  id: string;
  status: StatusValue;
  billing_interval: IntervalValue;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_current_period_end: string | null;
  stripe_cancel_at_period_end: boolean;
  started_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  plan: {
    id: string;
    name: string;
    slug: string;
    plan_type: string;
  };
  user: {
    id: string;
    full_name: string;
    email: string;
    account_type: string;
  } | null;
  company: {
    id: string;
    company_name: string;
  } | null;
}

const STATUS_COLORS: Record<StatusValue, 'teal' | 'green' | 'amber' | 'red' | 'slate' | 'blue'> = {
  ACTIVE: 'green',
  TRIALING: 'blue',
  PAST_DUE: 'amber',
  UNPAID: 'amber',
  PAUSED: 'slate',
  CANCELLED: 'red',
  INACTIVE: 'slate',
};

const STATUSES: (StatusValue | 'ALL')[] = [
  'ALL',
  'ACTIVE',
  'TRIALING',
  'PAST_DUE',
  'CANCELLED',
  'INACTIVE',
  'PAUSED',
  'UNPAID',
];

const INTERVALS: (IntervalValue | 'ALL')[] = ['ALL', 'MONTHLY', 'YEARLY'];

const PAGE_SIZE = 25;

export default function AdminSubscriptionAccountsPage() {
  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusValue | 'ALL'>('ALL');
  const [intervalFilter, setIntervalFilter] = useState<IntervalValue | 'ALL'>('ALL');
  const [planTypeFilter, setPlanTypeFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: SubscriptionRow[] }>(
        '/api/v1/admin/subscriptions/all',
      );
      setSubs(res.data.data);
    } catch {
      toast.error('Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const planTypes = useMemo(() => {
    const set = new Set<string>();
    for (const s of subs) set.add(s.plan.plan_type);
    return ['ALL', ...Array.from(set).sort()];
  }, [subs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subs.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (intervalFilter !== 'ALL' && s.billing_interval !== intervalFilter) return false;
      if (planTypeFilter !== 'ALL' && s.plan.plan_type !== planTypeFilter) return false;
      if (q) {
        const haystack = [
          s.user?.full_name,
          s.user?.email,
          s.company?.company_name,
          s.plan.name,
          s.plan.slug,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [subs, statusFilter, intervalFilter, planTypeFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, intervalFilter, planTypeFilter, search]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/subscriptions"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 no-underline"
          >
            <ArrowLeft size={12} />
            Back to Plans
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-100">
            Subscriber Accounts
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            All customers and companies currently on a subscription, plus historical
            cancellations.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Showing</p>
          <p className="text-lg font-semibold text-slate-200">
            {filtered.length} of {subs.length}
          </p>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, company, plan…"
            className="w-full rounded-lg bg-slate-950 border border-slate-700 pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusValue | 'ALL')}
          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 outline-none"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'ALL' ? 'All statuses' : s}
            </option>
          ))}
        </select>

        <select
          value={intervalFilter}
          onChange={(e) => setIntervalFilter(e.target.value as IntervalValue | 'ALL')}
          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 outline-none"
        >
          {INTERVALS.map((i) => (
            <option key={i} value={i}>
              {i === 'ALL' ? 'All intervals' : i}
            </option>
          ))}
        </select>

        <select
          value={planTypeFilter}
          onChange={(e) => setPlanTypeFilter(e.target.value)}
          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 outline-none"
        >
          {planTypes.map((p) => (
            <option key={p} value={p}>
              {p === 'ALL' ? 'All plan types' : p}
            </option>
          ))}
        </select>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">Subscriber</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Interval</th>
                <th className="px-4 py-3 font-semibold">Period End</th>
                <th className="px-4 py-3 font-semibold">Started</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : pageData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    No subscriptions match the current filters.
                  </td>
                </tr>
              ) : (
                pageData.map((sub) => {
                  const expanded = expandedId === sub.id;
                  return (
                    <>
                      <tr
                        key={sub.id}
                        onClick={() => setExpandedId(expanded ? null : sub.id)}
                        className="border-b border-slate-800/60 hover:bg-slate-800/30 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          {sub.company ? (
                            <>
                              <div className="font-medium text-slate-200">
                                {sub.company.company_name}
                              </div>
                              <div className="text-xs text-slate-500">
                                Company subscription
                              </div>
                            </>
                          ) : sub.user ? (
                            <>
                              <div className="font-medium text-slate-200">
                                {sub.user.full_name}
                              </div>
                              <div className="text-xs text-slate-500">
                                {sub.user.email}
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-300">
                            {sub.plan.name}
                          </div>
                          <div className="font-mono text-xs text-slate-500">
                            {sub.plan.plan_type}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Badge color={STATUS_COLORS[sub.status]}>{sub.status}</Badge>
                            {sub.stripe_cancel_at_period_end && (
                              <Badge color="amber">Ending</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {sub.billing_interval}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {sub.stripe_current_period_end
                            ? format(new Date(sub.stripe_current_period_end), 'dd MMM yyyy')
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {sub.started_at
                            ? format(new Date(sub.started_at), 'dd MMM yyyy')
                            : format(new Date(sub.created_at), 'dd MMM yyyy')}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-950/40">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="grid grid-cols-2 gap-4 text-xs md:grid-cols-3">
                              <DetailRow
                                label="Subscription ID"
                                value={sub.id}
                                mono
                              />
                              <DetailRow
                                label="Stripe Customer"
                                value={sub.stripe_customer_id ?? '—'}
                                mono
                              />
                              <DetailRow
                                label="Stripe Subscription"
                                value={sub.stripe_subscription_id ?? '—'}
                                mono
                              />
                              <DetailRow
                                label="Plan slug"
                                value={sub.plan.slug}
                                mono
                              />
                              <DetailRow
                                label="Cancelled at"
                                value={
                                  sub.cancelled_at
                                    ? format(new Date(sub.cancelled_at), 'dd MMM yyyy')
                                    : '—'
                                }
                              />
                              <DetailRow
                                label="Cancel at period end"
                                value={
                                  sub.stripe_cancel_at_period_end ? 'Yes' : 'No'
                                }
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ────────────────────────────────────────────────────── */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
            <span>
              Page {page} of {totalPages} · {filtered.length} total
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-slate-400 hover:border-slate-600 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-slate-400 hover:border-slate-600 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className={`mt-0.5 break-all text-slate-300 ${
          mono ? 'font-mono text-[11px]' : 'text-xs'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
