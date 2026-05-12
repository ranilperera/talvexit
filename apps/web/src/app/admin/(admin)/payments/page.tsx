'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Wallet,
  Filter,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Info,
} from 'lucide-react';
import api from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LedgerRow {
  id: string;
  kind: 'order' | 'tender_invoice';
  reference: string;
  status: string;
  payment_method: string | null;
  payment_reference: string | null;
  amount_aud: string | null;
  amount_reported_aud: string | null;
  reported_at: string | null;
  confirmed_at: string | null;
  dispute_reason: string | null;
  dispute_raised_at: string | null;
  evidence_file_name: string | null;
  customer: { id: string; full_name: string; email: string } | null;
  supplier: { id: string; name: string } | null;
}

interface PageData {
  rows: LedgerRow[];
  next_cursor: string | null;
  has_more: boolean;
}

const STATUS_FILTERS = [
  { value: 'ALL',                label: 'All' },
  { value: 'AWAITING_PAYMENT',   label: 'Awaiting payment' },
  { value: 'PAYMENT_REPORTED',   label: 'Reported' },
  { value: 'PAYMENT_CONFIRMED',  label: 'Confirmed (orders)' },
  { value: 'PAID',               label: 'Paid (invoices)' },
  { value: 'DISPUTED',           label: 'Disputed evidence' },
] as const;

const METHOD_FILTERS = [
  { value: 'ALL',                  label: 'All methods' },
  { value: 'STRIPE',               label: 'Stripe' },
  { value: 'BANK_TRANSFER_BSB',    label: 'AU bank' },
  { value: 'BANK_TRANSFER_SWIFT',  label: 'SWIFT' },
  { value: 'PAYPAL',               label: 'PayPal' },
  { value: 'WISE',                 label: 'Wise' },
  { value: 'OTHER',                label: 'Other' },
] as const;

const KIND_FILTERS = [
  { value: 'ALL',             label: 'Orders + Tender invoices' },
  { value: 'order',           label: 'Orders only' },
  { value: 'tender_invoice',  label: 'Tender invoices only' },
] as const;

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminPaymentsPage() {
  const [statusFilter, setStatusFilter] = useState<typeof STATUS_FILTERS[number]['value']>('ALL');
  const [methodFilter, setMethodFilter] = useState<typeof METHOD_FILTERS[number]['value']>('ALL');
  const [kindFilter, setKindFilter] = useState<typeof KIND_FILTERS[number]['value']>('ALL');
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        method: methodFilter,
        kind: kindFilter,
        limit: '50',
      });
      const res = await api.get<{ success: boolean; data: PageData }>(
        `/api/v1/admin/payments?${params.toString()}`,
      );
      setData(res.data.data);
    } catch (e: unknown) {
      const m = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(m ?? 'Failed to load payments ledger.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, methodFilter, kindFilter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100 flex items-center gap-2">
            <Wallet size={20} className="text-teal-400" />
            Direct payments
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Read-only ledger of customer-reported payments across orders and tender invoices.
            Funds flow directly between customer and supplier &mdash; the platform does not
            process or hold money. Adjust the cutover timestamp via{' '}
            <Link href="/admin/config" className="text-teal-400 hover:text-teal-300">
              Config
            </Link>{' '}
            (key <span className="font-mono text-slate-300">direct_payment_cutover_at</span>).
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="rounded-xl bg-blue-500/5 border border-blue-500/30 p-4 flex items-start gap-3">
        <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-400 leading-relaxed">
          This view is informational only. To take action on a disputed evidence submission,
          open the corresponding{' '}
          <Link href="/admin/disputes" className="text-blue-400 hover:text-blue-300">
            dispute
          </Link>{' '}
          and apply sanctions there.
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex items-center gap-3 flex-wrap">
        <Filter size={14} className="text-slate-500" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-teal-500"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value as typeof methodFilter)}
          className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-teal-500"
        >
          {METHOD_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
          className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-teal-500"
        >
          {KIND_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <span className="text-xs text-slate-500 ml-auto">
          {data ? `${data.rows.length} row${data.rows.length === 1 ? '' : 's'}` : ''}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="rounded-xl bg-slate-900 border border-slate-800 px-6 py-14 text-center">
          <p className="text-slate-400 text-sm">No payments match these filters.</p>
          <p className="text-xs text-slate-600 mt-1">
            Once direct-payment is enabled and customers report payments, entries appear here.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 bg-slate-950/40 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3 font-semibold">Reference</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Supplier</th>
                  <th className="px-5 py-3 font-semibold">Method</th>
                  <th className="px-5 py-3 font-semibold text-right">Amount</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Reported</th>
                  <th className="px-5 py-3 font-semibold text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className="border-b border-slate-800/40 last:border-b-0">
                    <td className="px-5 py-3">
                      <div className="font-mono text-xs text-slate-300">{r.reference}</div>
                      <div className="text-[11px] text-slate-600">
                        {r.kind === 'order' ? 'Order' : 'Tender invoice'}
                        {r.payment_reference && (
                          <span className="ml-1 text-slate-500">
                            &middot; ref {r.payment_reference}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-slate-300">{r.customer?.full_name ?? '—'}</p>
                      {r.customer?.email && (
                        <p className="text-[11px] text-slate-500">{r.customer.email}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-slate-300">{r.supplier?.name ?? '—'}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        {formatMethod(r.payment_method)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-300">
                      {r.amount_reported_aud
                        ? `A$${Number(r.amount_reported_aud).toLocaleString('en-AU')}`
                        : r.amount_aud
                          ? `A$${Number(r.amount_aud).toLocaleString('en-AU')}`
                          : '—'}
                      {r.amount_reported_aud &&
                        r.amount_aud &&
                        Number(r.amount_reported_aud) !== Number(r.amount_aud) && (
                          <p className="text-[10px] text-amber-400 mt-0.5">
                            of A${Number(r.amount_aud).toLocaleString('en-AU')}
                          </p>
                        )}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={r.status} disputed={!!r.dispute_raised_at} />
                      {r.evidence_file_name && (
                        <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                          <FileText size={10} />
                          <span className="truncate max-w-[160px]">{r.evidence_file_name}</span>
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">
                      {r.reported_at
                        ? format(new Date(r.reported_at), 'd MMM yyyy, HH:mm')
                        : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={
                          r.kind === 'order'
                            ? `/admin/orders/${r.id}`
                            : `/admin/contracts?invoice=${r.id}`
                        }
                        className="inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 no-underline"
                      >
                        Open <ExternalLink size={11} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ status, disputed }: { status: string; disputed: boolean }) {
  if (disputed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-300 border border-red-500/30">
        <AlertTriangle size={10} />
        Evidence rejected
      </span>
    );
  }
  switch (status) {
    case 'PAYMENT_CONFIRMED':
    case 'PAID':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-500/10 text-teal-300 border border-teal-500/30">
          <CheckCircle2 size={10} /> Confirmed
        </span>
      );
    case 'PAYMENT_REPORTED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
          <Clock size={10} /> Awaiting confirmation
        </span>
      );
    case 'AWAITING_PAYMENT':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
          Awaiting payment
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
          {status.replace(/_/g, ' ')}
        </span>
      );
  }
}

function formatMethod(m: string | null): string {
  if (!m) return '—';
  switch (m) {
    case 'STRIPE': return 'Stripe';
    case 'PAYPAL': return 'PayPal';
    case 'BANK_TRANSFER_BSB': return 'AU bank';
    case 'BANK_TRANSFER_SWIFT': return 'SWIFT';
    case 'WISE': return 'Wise';
    case 'OTHER': return 'Other';
    default: return m;
  }
}
