'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/Badge';
import { Download, Loader2, FileText, ExternalLink } from 'lucide-react';
import customerApi from '@/lib/customer-api';
import Link from 'next/link';

type Color = 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue';

const STATUS_CFG: Record<string, { label: string; color: Color }> = {
  PENDING:    { label: 'Pending',    color: 'amber' },
  PROCESSING: { label: 'Processing', color: 'blue'  },
  COMPLETED:  { label: 'Completed',  color: 'green' },
  FAILED:     { label: 'Failed',     color: 'red'   },
};

// ── Order payout (CompanyPayoutRecord) ────────────────────────────────────────

interface OrderPayout {
  id: string;
  order_id: string;
  order?: { task?: { title?: string } };
  gross_amount_aud: number;
  platform_fee_aud: number;
  net_amount_aud: number;
  status: string;
  initiated_at?: string | null;
  created_at: string;
}

// ── TC payout (TenderContractPayoutRecord) ────────────────────────────────────

interface TcPayout {
  id: string;
  method: string;
  status: string;
  gross_amount_aud: string;
  platform_fee_aud: string;
  net_amount_aud: string;
  transfer_reference: string | null;
  commission_invoice_number: string | null;
  commission_invoice_blob_path: string | null;
  receipt_blob_path: string | null;
  initiated_at: string | null;
  completed_at: string | null;
  created_at: string;
  invoice: {
    id: string;
    invoice_number: string;
    total_aud: string;
    contract: {
      id: string;
      scope_snapshot: { title?: string } | null;
    };
    milestone: { id: string; name: string } | null;
  };
}

interface Stats {
  total_earned_aud: number;
  this_month_aud: number;
  pending_aud: number;
}

type Tab = 'contracts' | 'orders';

function fmt(n: number | string) {
  return `AUD ${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
}

// ── TC Payouts tab ────────────────────────────────────────────────────────────

function TcPayoutsTab({ records }: { records: TcPayout[] }) {
  const [downloading, setDownloading] = useState<string | null>(null);

  async function downloadCommissionInvoice(payoutId: string, invoiceNumber: string) {
    setDownloading(payoutId);
    try {
      const res = await customerApi.get(
        `/api/v1/provider/tc-payouts/${payoutId}/commission-invoice?dl=1`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoiceNumber}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // handled by interceptor
    } finally {
      setDownloading(null);
    }
  }

  if (records.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-16 text-center">
        <p className="text-slate-400">No tender contract payouts yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
              <th className="px-5 py-3 font-medium">Contract</th>
              <th className="px-5 py-3 font-medium">Milestone</th>
              <th className="px-5 py-3 font-medium">Invoice</th>
              <th className="px-5 py-3 font-medium text-right">Gross</th>
              <th className="px-5 py-3 font-medium text-right">Platform Fee</th>
              <th className="px-5 py-3 font-medium text-right">Net</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Commission</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {records.map((p) => {
              const cfg = STATUS_CFG[p.status] ?? { label: p.status, color: 'slate' as Color };
              const scopeTitle = (p.invoice.contract.scope_snapshot as { title?: string } | null)?.title ?? '—';
              const date = p.completed_at ?? p.initiated_at ?? p.created_at;
              return (
                <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-4 text-slate-300 max-w-[180px]">
                    <Link
                      href={`/contractor/contracts/${p.invoice.contract.id}`}
                      className="flex items-center gap-1 hover:text-teal-400 transition-colors truncate"
                    >
                      <span className="truncate">{scopeTitle}</span>
                      <ExternalLink size={11} className="shrink-0 opacity-50" />
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-slate-400 text-xs">
                    {p.invoice.milestone?.name ?? '—'}
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-500">
                    {p.invoice.invoice_number}
                  </td>
                  <td className="px-5 py-4 text-right text-slate-400">{fmt(p.gross_amount_aud)}</td>
                  <td className="px-5 py-4 text-right text-red-400">−{fmt(p.platform_fee_aud)}</td>
                  <td className="px-5 py-4 text-right font-semibold text-teal-400">{fmt(p.net_amount_aud)}</td>
                  <td className="px-5 py-4">
                    <Badge color={cfg.color}>{cfg.label}</Badge>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-500">
                    {format(new Date(date), 'd MMM yyyy')}
                  </td>
                  <td className="px-5 py-4">
                    {p.status === 'COMPLETED' ? (
                      <button
                        onClick={() => { void downloadCommissionInvoice(p.id, p.commission_invoice_number ?? 'commission-invoice'); }}
                        disabled={downloading === p.id}
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                      >
                        {downloading === p.id
                          ? <Loader2 size={11} className="animate-spin" />
                          : <Download size={11} />}
                        {p.commission_invoice_blob_path ? 'Download' : 'Generate'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Order Payouts tab ─────────────────────────────────────────────────────────

function OrderPayoutsTab({ records }: { records: OrderPayout[] }) {
  const [downloading, setDownloading] = useState<string | null>(null);

  async function downloadInvoice(orderId: string) {
    setDownloading(orderId);
    try {
      const res = await customerApi.get<{ success: boolean; data: { url: string } }>(
        `/api/v1/orders/${orderId}/invoice`,
      );
      window.open(res.data.data.url, '_blank');
    } catch {
      // handled by interceptor
    } finally {
      setDownloading(null);
    }
  }

  if (records.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-16 text-center">
        <p className="text-slate-400">No order payouts yet. Complete your first order to start earning.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
              <th className="px-5 py-3 font-medium">Order</th>
              <th className="px-5 py-3 font-medium">Task</th>
              <th className="px-5 py-3 font-medium text-right">Gross</th>
              <th className="px-5 py-3 font-medium text-right">Platform Fee</th>
              <th className="px-5 py-3 font-medium text-right">Net</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Invoice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {records.map((p) => {
              const cfg = STATUS_CFG[p.status] ?? { label: p.status, color: 'slate' as Color };
              const date = p.initiated_at ?? p.created_at;
              return (
                <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-4 font-mono text-xs text-slate-500">
                    #{p.order_id.slice(-8).toUpperCase()}
                  </td>
                  <td className="px-5 py-4 text-slate-300 max-w-[200px]">
                    <span className="line-clamp-1">{p.order?.task?.title ?? '—'}</span>
                  </td>
                  <td className="px-5 py-4 text-right text-slate-400">{fmt(p.gross_amount_aud)}</td>
                  <td className="px-5 py-4 text-right text-red-400">−{fmt(p.platform_fee_aud)}</td>
                  <td className="px-5 py-4 text-right font-semibold text-teal-400">{fmt(p.net_amount_aud)}</td>
                  <td className="px-5 py-4">
                    <Badge color={cfg.color}>{cfg.label}</Badge>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-500">
                    {format(new Date(date), 'd MMM yyyy')}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => { void downloadInvoice(p.order_id); }}
                      disabled={downloading === p.order_id}
                      className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 transition-colors disabled:opacity-50"
                    >
                      {downloading === p.order_id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <Download size={11} />}
                      Download
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PayoutsPage() {
  const [orderPayouts, setOrderPayouts] = useState<OrderPayout[]>([]);
  const [tcPayouts, setTcPayouts] = useState<TcPayout[]>([]);
  const [stats, setStats] = useState<Stats>({ total_earned_aud: 0, this_month_aud: 0, pending_aud: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('contracts');

  useEffect(() => {
    Promise.all([
      customerApi
        .get<{ success: boolean; data: { payouts: OrderPayout[]; stats: Stats } }>('/api/v1/contractor/payouts')
        .then((r) => r.data.data)
        .catch(() => ({ payouts: [] as OrderPayout[], stats: { total_earned_aud: 0, this_month_aud: 0, pending_aud: 0 } })),
      customerApi
        .get<{ success: boolean; data: { records: TcPayout[] } }>('/api/v1/provider/tc-payouts')
        .then((r) => r.data.data.records)
        .catch(() => [] as TcPayout[]),
    ]).then(([orderData, tcRecords]) => {
      setOrderPayouts(orderData.payouts);
      setTcPayouts(tcRecords);

      // Merge stats: add TC completed/pending amounts on top of order stats
      const tcTotal  = tcRecords.filter((r) => r.status === 'COMPLETED').reduce((s, r) => s + Number(r.net_amount_aud), 0);
      const tcPending = tcRecords.filter((r) => ['PENDING','PROCESSING'].includes(r.status)).reduce((s, r) => s + Number(r.net_amount_aud), 0);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const tcThisMonth = tcRecords
        .filter((r) => r.status === 'COMPLETED' && new Date(r.completed_at ?? r.created_at) >= monthStart)
        .reduce((s, r) => s + Number(r.net_amount_aud), 0);

      setStats({
        total_earned_aud: orderData.stats.total_earned_aud + tcTotal,
        this_month_aud:   orderData.stats.this_month_aud   + tcThisMonth,
        pending_aud:      orderData.stats.pending_aud      + tcPending,
      });

      // Default to contracts tab if there are TC payouts, otherwise orders
      if (tcRecords.length > 0) setTab('contracts');
      else if (orderData.payouts.length > 0) setTab('orders');
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <h1 className="font-display font-bold text-2xl text-slate-100">Payout History</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Earned',    value: stats.total_earned_aud },
          { label: 'This Month',      value: stats.this_month_aud },
          { label: 'Pending Payouts', value: stats.pending_aud },
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="text-xl font-semibold text-teal-400">{fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {([
          { id: 'contracts' as Tab, label: 'Tender Contracts', count: tcPayouts.length,   icon: FileText },
          { id: 'orders'    as Tab, label: 'Orders',           count: orderPayouts.length, icon: FileText },
        ]).map(({ id, label, count, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === id
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon size={13} />
            {label}
            <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
              tab === id ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-800 text-slate-500'
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {tab === 'contracts' && <TcPayoutsTab records={tcPayouts} />}
      {tab === 'orders'    && <OrderPayoutsTab records={orderPayouts} />}
    </div>
  );
}
