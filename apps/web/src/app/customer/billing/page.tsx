'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { FileText, Download, CreditCard, AlertCircle, CheckCircle2, Clock, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import { toNum, formatMoney } from '@/lib/format-utils';
import SubscriptionUsagePanel from '@/components/customer/SubscriptionUsagePanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BillingOrder {
  id: string;
  status: string;
  company_order_status?: string | null;
  company_id?: string | null;
  created_at: string;
  completed_at?: string | null;
  payment_captured_at?: string | null;
  // Individual contractor order amount
  price_aud?: number | string | null;
  total_amount_aud?: number | string | null;
  scope_snapshot?: { title?: string } | null;
  task?: { id: string; title?: string; domain?: string } | null;
  contractor_user?: { id: string; full_name?: string } | null;
  company?: { id: string; company_name: string } | null;
  company_invoice?: {
    id: string;
    invoice_number: string;
    total_aud: number | string;
    paid_at?: string | null;
    pdf_blob_path?: string | null;
  } | null;
  purchase_order?: {
    id: string;
    po_number: string;
    total_aud: number | string;
  } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrderTitle(order: BillingOrder): string {
  return (order.scope_snapshot as { title?: string } | null)?.title
    ?? order.task?.title
    ?? `Order ${order.id.slice(-8)}`;
}

/** For company orders use invoice total (incl GST). For individual orders use price * 1.1. */
function getOrderAmount(order: BillingOrder): number {
  if (order.company_id) {
    return toNum(order.company_invoice?.total_aud ?? order.purchase_order?.total_aud ?? 0);
  }
  // Individual contractor — price_aud is ex-GST
  const base = toNum(order.total_amount_aud ?? order.price_aud ?? 0);
  // If total_amount_aud already includes GST it won't have price_aud; use as-is
  return order.total_amount_aud ? base : base * 1.1;
}

function isOrderPaid(order: BillingOrder): boolean {
  if (order.company_id) {
    return (
      ['PAYMENT_RECEIVED', 'PAYOUT_PENDING', 'PAYOUT_PROCESSING', 'COMPLETED'].includes(
        order.company_order_status ?? '',
      ) || !!order.company_invoice?.paid_at
    );
  }
  return order.status === 'COMPLETED';
}

function isInvoicePending(order: BillingOrder): boolean {
  return order.company_order_status === 'INVOICE_SENT' && !order.company_invoice?.paid_at;
}

function isActiveEscrow(order: BillingOrder): boolean {
  if (order.company_id) {
    return ['PO_GENERATED', 'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED', 'DELIVERABLES_ACCEPTED'].includes(
      order.company_order_status ?? '',
    );
  }
  return ['ACCEPTED', 'PAYMENT_HELD', 'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED'].includes(order.status);
}

function fmt(date?: string | null) {
  if (!date) return '—';
  return format(new Date(date), 'd MMM yyyy');
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = false,
  warn = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={clsx(
        'rounded-2xl border p-5',
        accent ? 'bg-teal-500/10 border-teal-500/30' : warn ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-900 border-slate-800',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
          <p
            className={clsx(
              'text-2xl font-bold font-display',
              accent ? 'text-teal-400' : warn ? 'text-amber-400' : 'text-slate-100',
            )}
          >
            {value}
          </p>
          {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        </div>
        <div
          className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            accent ? 'bg-teal-500/20' : warn ? 'bg-amber-500/20' : 'bg-slate-800',
          )}
        >
          <Icon size={18} className={accent ? 'text-teal-400' : warn ? 'text-amber-400' : 'text-slate-400'} />
        </div>
      </div>
    </div>
  );
}

// ─── InvoiceDownloadButton ────────────────────────────────────────────────────

function InvoiceDownloadButton({ order }: { order: BillingOrder }) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      // Try the company invoice endpoint first. The endpoint now streams
      // the PDF rather than returning a SAS URL — fetch as blob and open
      // via a local Object URL.
      if (order.company_invoice?.id) {
        const res = await customerApi.get(
          `/api/v1/invoices/${order.company_invoice.id}/document`,
          { responseType: 'blob' },
        );
        const blob = res.data as Blob;
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => { URL.revokeObjectURL(url); }, 60_000);
          return;
        }
      }
      // Fall back to order-level invoice endpoint (legacy — may still
      // return a JSON shape with a message; tolerate that for now).
      const res = await customerApi.get<{ success: boolean; data: { url?: string; message?: string } }>(
        `/api/v1/orders/${order.id}/invoice`,
      );
      if (res.data.data.message) {
        toast.info(res.data.data.message);
      } else {
        toast.info('Invoice not yet available');
      }
    } catch {
      toast.error('Invoice not available yet');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" loading={loading} onClick={() => { void handleDownload(); }}>
      <Download size={13} />
      Invoice
    </Button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: 'teal' | 'amber' | 'green' | 'slate' | 'red' }> = {
  SCOPED:             { label: 'Scoped',         color: 'slate' },
  ACCEPTED:           { label: 'Accepted',        color: 'teal'  },
  PAYMENT_HELD:       { label: 'In Escrow',       color: 'teal'  },
  IN_PROGRESS:        { label: 'In Progress',     color: 'teal'  },
  PENDING_REVIEW:     { label: 'Under Review',    color: 'teal'  },
  REVISION_REQUESTED: { label: 'Revision',        color: 'amber' },
  COMPLETED:          { label: 'Completed',       color: 'green' },
  DISPUTED:           { label: 'Disputed',        color: 'red'   },
  CANCELLED:          { label: 'Cancelled',       color: 'slate' },
  // Company order statuses
  PO_GENERATED:           { label: 'PO Generated',    color: 'teal'  },
  DELIVERABLES_ACCEPTED:  { label: 'Accepted',         color: 'teal'  },
  INVOICE_SENT:           { label: 'Invoice Due',      color: 'amber' },
  PAYMENT_RECEIVED:       { label: 'Paid',             color: 'green' },
};

export default function BillingPage() {
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await customerApi.get<{
        success: boolean;
        data: { orders: BillingOrder[]; next_cursor: string | null };
      }>('/api/v1/orders', { params: { role: 'as_customer', limit: 100 } });
      setOrders(res.data.data.orders);
    } catch {
      toast.error('Failed to load billing history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchOrders(); }, [fetchOrders]);

  const paidOrders     = orders.filter(isOrderPaid);
  const pendingInvoice = orders.filter(isInvoicePending);
  const activeOrders   = orders.filter(isActiveEscrow);

  const totalSpent     = paidOrders.reduce((s, o) => s + getOrderAmount(o), 0);
  const heldInEscrow   = activeOrders.reduce((s, o) => s + getOrderAmount(o), 0);
  const outstandingAmt = pendingInvoice.reduce((s, o) => s + getOrderAmount(o), 0);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div className="h-8 w-40 bg-slate-800 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">

      {/* Subscription usage — current period quotas + history. */}
      <SubscriptionUsagePanel />

      {/* Header */}
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-100">Order history</h1>
        <p className="text-sm text-slate-400 mt-1">Per-engagement payments and order invoices.</p>
        <div className="mt-3 text-xs text-slate-500">
          Looking for subscription billing?{' '}
          <a href="/billing" className="text-teal-400 hover:text-teal-300 underline">
            Go to billing dashboard
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Spent"
          value={`AUD ${formatMoney(totalSpent)}`}
          sub={`${paidOrders.length} completed order${paidOrders.length !== 1 ? 's' : ''}`}
          icon={CheckCircle2}
          accent={totalSpent > 0}
        />
        <StatCard
          label="Held in Escrow"
          value={`AUD ${formatMoney(heldInEscrow)}`}
          sub={`${activeOrders.length} active order${activeOrders.length !== 1 ? 's' : ''}`}
          icon={CreditCard}
        />
        <StatCard
          label="Outstanding"
          value={outstandingAmt > 0 ? `AUD ${formatMoney(outstandingAmt)}` : 'None'}
          sub={
            outstandingAmt > 0
              ? `${pendingInvoice.length} invoice${pendingInvoice.length !== 1 ? 's' : ''} awaiting payment`
              : 'All payments up to date'
          }
          icon={AlertCircle}
          warn={outstandingAmt > 0}
        />
      </div>

      {/* Outstanding company invoices */}
      {pendingInvoice.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Outstanding Invoices
          </h2>
          <div className="bg-slate-900 border border-amber-500/30 rounded-2xl divide-y divide-slate-800">
            {pendingInvoice.map((order) => (
              <div key={order.id} className="px-5 py-4 flex items-center gap-4">
                <AlertCircle size={16} className="text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{getOrderTitle(order)}</p>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                    {order.company && <><Building2 size={11} />{order.company.company_name}</>}
                    {order.company_invoice?.invoice_number && (
                      <span className="font-mono">{order.company_invoice.invoice_number}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-amber-400">AUD {formatMoney(getOrderAmount(order))}</p>
                  <p className="text-xs text-slate-500">incl. GST</p>
                </div>
                <Link href={`/customer/orders/${order.id}/invoice/payment`}>
                  <Button size="sm">Pay Now</Button>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active orders */}
      {activeOrders.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Active Orders — Funds in Escrow
          </h2>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800">
            {activeOrders.map((order) => {
              const statusKey = order.company_id ? (order.company_order_status ?? '') : order.status;
              const cfg = STATUS_CONFIG[statusKey] ?? { label: statusKey, color: 'slate' as const };
              return (
                <div key={order.id} className="px-5 py-4 flex items-center gap-4">
                  <Clock size={16} className="text-teal-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{getOrderTitle(order)}</p>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                      {order.company
                        ? <><Building2 size={11} />{order.company.company_name}</>
                        : order.contractor_user?.full_name ?? 'Expert TBA'}
                      <span className="text-slate-700">·</span>
                      {fmt(order.created_at)}
                    </div>
                  </div>
                  <Badge color={cfg.color}>{cfg.label}</Badge>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-200">AUD {formatMoney(getOrderAmount(order))}</p>
                    <p className="text-xs text-slate-500">incl. GST</p>
                  </div>
                  <Link href={`/customer/orders/${order.id}`} className="shrink-0">
                    <Button size="sm" variant="secondary">View</Button>
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Payment history */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
          Payment History
        </h2>

        {paidOrders.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-12 text-center">
            <FileText size={28} className="text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No completed payments yet.</p>
            <p className="text-xs text-slate-600 mt-1">Completed orders will appear here with invoice download links.</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_180px_130px_120px_100px] gap-4 px-5 py-3 border-b border-slate-800 text-xs font-medium text-slate-500 uppercase tracking-wider">
              <span>Service</span>
              <span>Provider</span>
              <span>Paid</span>
              <span className="text-right">Amount (incl. GST)</span>
              <span />
            </div>

            <div className="divide-y divide-slate-800">
              {paidOrders.map((order) => {
                const amount = getOrderAmount(order);
                const paidDate = order.company_invoice?.paid_at ?? order.completed_at ?? order.created_at;
                return (
                  <div
                    key={order.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_180px_130px_120px_100px] gap-2 sm:gap-4 items-center px-5 py-4"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/customer/orders/${order.id}`}
                        className="text-sm font-medium text-slate-200 hover:text-teal-400 transition-colors no-underline truncate block"
                      >
                        {getOrderTitle(order)}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {order.task?.domain?.replace(/_/g, ' ') ?? 'IT Services'}
                        {order.company_invoice?.invoice_number && (
                          <span className="font-mono ml-2">{order.company_invoice.invoice_number}</span>
                        )}
                      </p>
                    </div>
                    <p className="text-sm text-slate-400 truncate flex items-center gap-1.5">
                      {order.company
                        ? <><Building2 size={12} className="text-slate-500 shrink-0" />{order.company.company_name}</>
                        : order.contractor_user?.full_name ?? '—'}
                    </p>
                    <p className="text-sm text-slate-400">{fmt(paidDate)}</p>
                    <p className="text-sm font-semibold text-teal-400 sm:text-right">
                      AUD {formatMoney(amount)}
                    </p>
                    <div className="flex sm:justify-end">
                      {(order.company_invoice || order.status === 'COMPLETED') && (
                        <InvoiceDownloadButton order={order} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-700 px-5 py-3 flex items-center justify-between bg-slate-800/40">
              <span className="text-xs text-slate-500">{paidOrders.length} payment{paidOrders.length !== 1 ? 's' : ''}</span>
              <div className="text-right">
                <span className="text-xs text-slate-500">Total paid: </span>
                <span className="text-sm font-bold text-teal-400">AUD {formatMoney(totalSpent)}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-600">
        All amounts shown include 10% GST. TalvexIT — operated by Waveful Digital Platforms (ABN 49 602 081 005) · Invoices are generated automatically on order completion.
      </p>
    </div>
  );
}
