'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  DollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Download,
  Loader2,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { clsx } from 'clsx';
import customerApi from '@/lib/customer-api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatMoney, toNum } from '@/lib/format-utils';
import { PageContainer } from '@/components/layout/PageContainer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TcPayoutRecord {
  id: string;
  status: string;
  method: string;
  gross_amount_aud: string;
  platform_fee_aud: string;
  net_amount_aud: string;
  transfer_reference: string | null;
  admin_notes: string | null;
  commission_invoice_number: string | null;
  commission_invoice_blob_path: string | null;
  initiated_at: string | null;
  completed_at: string | null;
  created_at: string;
  invoice: {
    id: string;
    invoice_number: string;
    total_aud: string;
    amount_aud: string;
    milestone: { id: string; name: string } | null;
    contract: {
      id: string;
      scope_snapshot: { title?: string } | null;
      customer: { id: string; full_name: string };
    };
  };
}

interface PayoutRecord {
  id: string;
  order_id: string;
  gross_amount_aud: number | string;
  platform_fee_aud: number | string;
  net_amount_aud: number | string;
  method: 'STRIPE_CONNECT' | 'AU_BANK' | 'OVERSEAS_BANK';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  transfer_reference?: string | null;
  admin_notes?: string | null;
  receipt_blob_path?: string | null;
  commission_invoice_blob_path?: string | null;
  commission_invoice_number?: string | null;
  completed_at?: string | null;
  created_at: string;
  order: {
    id: string;
    company_invoice?: {
      invoice_number: string;
      total_aud: number | string;
    } | null;
  };
  processed_by?: { id: string; full_name: string } | null;
}

// ─── Config maps ──────────────────────────────────────────────────────────────

const METHOD_CFG: Record<string, { label: string; color: 'teal' | 'blue' | 'amber' }> = {
  AU_BANK:        { label: 'BSB Transfer',    color: 'teal'  },
  OVERSEAS_BANK:  { label: 'SWIFT Transfer',  color: 'amber' },
  STRIPE_CONNECT: { label: 'Stripe Transfer', color: 'blue'  },
};

const STATUS_CFG: Record<string, { label: string; color: 'amber' | 'blue' | 'teal' | 'red'; icon: typeof CheckCircle2 }> = {
  PENDING:    { label: 'Pending',    color: 'amber', icon: Clock        },
  PROCESSING: { label: 'Processing', color: 'blue',  icon: RefreshCw    },
  COMPLETED:  { label: 'Completed',  color: 'teal',  icon: CheckCircle2 },
  FAILED:     { label: 'Failed',     color: 'red',   icon: AlertTriangle },
};

// ─── CommissionInvoiceButton ──────────────────────────────────────────────────

function CommissionInvoiceButton({
  recordId,
  invoiceNumber,
}: {
  recordId: string;
  invoiceNumber?: string | null | undefined;
}) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const res = await customerApi.get(
        `/api/v1/companies/me/payout-history/${recordId}/commission-invoice?dl=1`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(
        new Blob([res.data as BlobPart], { type: 'application/pdf' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = invoiceNumber ? `${invoiceNumber}.pdf` : 'commission-invoice.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Commission invoice not available yet. Please try again later.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); void handleDownload(); }}
      disabled={loading}
      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      {invoiceNumber ? `Download ${invoiceNumber}` : 'Download Invoice'}
    </button>
  );
}

// ─── PayoutRow ────────────────────────────────────────────────────────────────

function PayoutRow({ record }: { record: PayoutRecord }) {
  const [expanded, setExpanded] = useState(false);

  const methodCfg = METHOD_CFG[record.method] ?? METHOD_CFG.AU_BANK!;
  const statusCfg = STATUS_CFG[record.status] ?? STATUS_CFG.PENDING!;
  const StatusIcon = statusCfg.icon;

  const commissionPct = Math.round(
    toNum(record.gross_amount_aud) > 0
      ? (toNum(record.platform_fee_aud) / toNum(record.gross_amount_aud)) * 100
      : 20,
  );

  const invoiceRef =
    record.order?.company_invoice?.invoice_number ?? `Order …${record.order_id.slice(-8)}`;

  return (
    <div
      className={clsx(
        'border rounded-xl overflow-hidden',
        record.status === 'PENDING'
          ? 'border-amber-500/20 bg-amber-500/5'
          : record.status === 'COMPLETED'
            ? 'border-teal-500/20 bg-teal-500/5'
            : record.status === 'FAILED'
              ? 'border-red-500/20 bg-red-500/5'
              : 'border-slate-700 bg-slate-900',
      )}
    >
      {/* Summary row */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
          <StatusIcon
            size={16}
            className={clsx(
              record.status === 'COMPLETED' ? 'text-teal-400'
              : record.status === 'FAILED' ? 'text-red-400'
              : record.status === 'PROCESSING' ? 'text-blue-400'
              : 'text-amber-400',
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-200 truncate">{invoiceRef}</p>
          <p className="text-xs text-slate-500">
            {record.commission_invoice_number && (
              <span className="font-mono mr-2">{record.commission_invoice_number}</span>
            )}
            {record.completed_at
              ? `Paid ${format(new Date(record.completed_at), 'd MMM yyyy')}`
              : `Created ${format(new Date(record.created_at), 'd MMM yyyy')}`}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="font-display font-bold text-teal-400 text-lg leading-none">
            AUD {formatMoney(record.net_amount_aud)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{commissionPct}% commission</p>
        </div>

        <Badge color={methodCfg.color}>{methodCfg.label}</Badge>
        <Badge color={statusCfg.color}>{statusCfg.label}</Badge>

        <ChevronDown
          size={16}
          className={clsx('text-slate-500 shrink-0 transition-transform', expanded && 'rotate-180')}
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-700/50 pt-4 space-y-4">
          {/* Amounts */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <p className="text-slate-500 text-xs mb-1">Gross Invoice (ex GST)</p>
              <p className="font-display font-bold text-slate-200">
                AUD {formatMoney(record.gross_amount_aud)}
              </p>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <p className="text-slate-500 text-xs mb-1">Platform Commission ({commissionPct}%)</p>
              <p className="font-display font-bold text-red-400">
                −AUD {formatMoney(record.platform_fee_aud)}
              </p>
            </div>
            <div className="bg-teal-500/10 border border-teal-500/30 rounded-lg p-3 text-center">
              <p className="text-teal-400 text-xs mb-1">Net Payout to You</p>
              <p className="font-display font-bold text-teal-400">
                AUD {formatMoney(record.net_amount_aud)}
              </p>
            </div>
          </div>

          {/* Transfer details */}
          {record.status === 'COMPLETED' && (
            <div className="flex items-start gap-2 text-sm text-teal-400 p-3 bg-teal-500/5 border border-teal-500/20 rounded-lg">
              <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Transfer completed</p>
                {record.transfer_reference && (
                  <p className="text-xs text-slate-400 mt-0.5">Ref: {record.transfer_reference}</p>
                )}
                {record.processed_by && (
                  <p className="text-xs text-slate-500">
                    Processed by {record.processed_by.full_name}
                    {record.completed_at &&
                      ` · ${format(new Date(record.completed_at), 'd MMM yyyy')}`}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Commission invoice */}
          {record.status === 'COMPLETED' && record.commission_invoice_blob_path && (
            <div className="flex items-center justify-between p-3 bg-slate-800 border border-slate-700 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <FileText size={14} className="text-blue-400" />
                <div>
                  <p className="font-medium">Commission Invoice</p>
                  {record.commission_invoice_number && (
                    <p className="text-xs text-slate-500 font-mono">{record.commission_invoice_number}</p>
                  )}
                </div>
              </div>
              <CommissionInvoiceButton
                recordId={record.id}
                invoiceNumber={record.commission_invoice_number}
              />
            </div>
          )}

          {/* Admin notes */}
          {record.admin_notes && (
            <p className="text-xs text-slate-500 italic">{record.admin_notes}</p>
          )}

          {/* Order reference */}
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <FileText size={11} />
            Order ID: <span className="font-mono text-slate-400">{record.order_id}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── TC Payouts tab ───────────────────────────────────────────────────────────

function TcPayoutsTab({ companyId }: { companyId?: string }) {
  const cq = companyId ? `?company_id=${companyId}` : '';
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['company-tc-payouts', companyId],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { records: TcPayoutRecord[] } }>(
          `/api/v1/provider/tc-payouts${cq}`,
        )
        .then((r) => r.data.data.records),
    staleTime: 30_000,
  });

  const records = data ?? [];

  if (isLoading) return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-slate-800 rounded-xl animate-pulse" />)}
    </div>
  );

  if (isError) return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
      <AlertTriangle size={28} className="text-red-400 mx-auto mb-3" />
      <p className="text-slate-300 font-medium">Failed to load tender payouts</p>
      <Button variant="secondary" className="mt-4" onClick={() => { void refetch(); }}>Try Again</Button>
    </div>
  );

  if (records.length === 0) return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-14 text-center">
      <DollarSign size={32} className="text-slate-600 mx-auto mb-3" />
      <p className="text-slate-300 font-medium">No tender contract payouts yet</p>
      <p className="text-sm text-slate-500 mt-1">
        Payouts appear here once a milestone invoice has been paid and processed.
      </p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">{records.length} record{records.length !== 1 ? 's' : ''}</p>
      {records.map((rec) => <TcPayoutRow key={rec.id} record={rec} />)}
    </div>
  );
}

function TcPayoutRow({ record }: { record: TcPayoutRecord }) {
  const [expanded, setExpanded] = useState(false);
  const [dlLoading, setDlLoading] = useState(false);

  const gross = Number(record.gross_amount_aud);
  const fee = Number(record.platform_fee_aud);
  const net = Number(record.net_amount_aud);
  const commPct = gross > 0 ? Math.round((fee / gross) * 100) : 0;
  const scopeTitle = record.invoice.contract.scope_snapshot?.title ?? 'Tender Contract';

  const statusCfg = STATUS_CFG[record.status] ?? STATUS_CFG.PENDING!;
  const StatusIcon = statusCfg.icon;

  async function downloadCommission() {
    setDlLoading(true);
    try {
      const res = await customerApi.get(
        `/api/v1/provider/tc-payouts/${record.id}/commission-invoice?dl=1`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = record.commission_invoice_number ? `${record.commission_invoice_number}.pdf` : 'commission-invoice.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Commission invoice not available yet.');
    } finally {
      setDlLoading(false);
    }
  }

  return (
    <div className={clsx(
      'border rounded-xl overflow-hidden',
      record.status === 'PENDING'    ? 'border-amber-500/20 bg-amber-500/5' :
      record.status === 'COMPLETED'  ? 'border-teal-500/20 bg-teal-500/5' :
      record.status === 'FAILED'     ? 'border-red-500/20 bg-red-500/5' :
      'border-slate-700 bg-slate-900',
    )}>
      <div className="flex items-center gap-4 p-4 cursor-pointer select-none" onClick={() => setExpanded((v) => !v)}>
        <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
          <StatusIcon size={16} className={clsx(
            record.status === 'COMPLETED' ? 'text-teal-400' :
            record.status === 'FAILED'    ? 'text-red-400' :
            record.status === 'PROCESSING'? 'text-blue-400' : 'text-amber-400',
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-200 truncate">{scopeTitle}</p>
          <p className="text-xs text-slate-500">
            <span className="font-mono mr-2">{record.invoice.invoice_number}</span>
            {record.invoice.milestone && <span className="mr-2">· {record.invoice.milestone.name}</span>}
            {record.completed_at
              ? `Paid ${format(new Date(record.completed_at), 'd MMM yyyy')}`
              : `Created ${format(new Date(record.created_at), 'd MMM yyyy')}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-display font-bold text-teal-400 text-lg leading-none">
            AUD {formatMoney(net)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{commPct}% commission</p>
        </div>
        <Badge color={statusCfg.color}>{statusCfg.label}</Badge>
        <ChevronDown size={16} className={clsx('text-slate-500 shrink-0 transition-transform', expanded && 'rotate-180')} />
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-700/50 pt-4 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <p className="text-slate-500 text-xs mb-1">Gross Invoice (ex GST)</p>
              <p className="font-display font-bold text-slate-200">AUD {formatMoney(gross)}</p>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <p className="text-slate-500 text-xs mb-1">Platform Commission ({commPct}%)</p>
              <p className="font-display font-bold text-red-400">−AUD {formatMoney(fee)}</p>
            </div>
            <div className="bg-teal-500/10 border border-teal-500/30 rounded-lg p-3 text-center">
              <p className="text-teal-400 text-xs mb-1">Net Payout to You</p>
              <p className="font-display font-bold text-teal-400">AUD {formatMoney(net)}</p>
            </div>
          </div>

          {record.status === 'COMPLETED' && (
            <div className="flex items-start gap-2 text-sm text-teal-400 p-3 bg-teal-500/5 border border-teal-500/20 rounded-lg">
              <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Transfer completed</p>
                {record.transfer_reference && (
                  <p className="text-xs text-slate-400 mt-0.5">Ref: {record.transfer_reference}</p>
                )}
                {record.completed_at && (
                  <p className="text-xs text-slate-500">{format(new Date(record.completed_at), 'd MMM yyyy')}</p>
                )}
              </div>
            </div>
          )}

          {record.status === 'COMPLETED' && record.commission_invoice_blob_path && (
            <div className="flex items-center justify-between p-3 bg-slate-800 border border-slate-700 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <FileText size={14} className="text-blue-400" />
                <div>
                  <p className="font-medium">Commission Invoice</p>
                  {record.commission_invoice_number && (
                    <p className="text-xs text-slate-500 font-mono">{record.commission_invoice_number}</p>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); void downloadCommission(); }}
                disabled={dlLoading}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
              >
                {dlLoading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                {record.commission_invoice_number ? `Download ${record.commission_invoice_number}` : 'Download Invoice'}
              </button>
            </div>
          )}

          {record.admin_notes && (
            <p className="text-xs text-slate-500 italic">{record.admin_notes}</p>
          )}

          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <FileText size={11} />
            Contract: <span className="font-mono text-slate-400">{record.invoice.contract.id}</span>
            <span className="mx-1">·</span>
            Customer: <span className="text-slate-400">{record.invoice.contract.customer.full_name}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function OrderPayoutsTab() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['company-payout-history'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { records: PayoutRecord[]; total: number } }>(
          '/api/v1/companies/me/payout-history',
        )
        .then((r) => r.data.data),
    staleTime: 30_000,
  });

  const records = data?.records ?? [];

  if (isLoading) return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-slate-800 rounded-xl animate-pulse" />)}
    </div>
  );

  if (isError) return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
      <AlertTriangle size={28} className="text-red-400 mx-auto mb-3" />
      <p className="text-slate-300 font-medium">Failed to load payout history</p>
      <Button variant="secondary" className="mt-4" onClick={() => { void refetch(); }}>Try Again</Button>
    </div>
  );

  if (records.length === 0) return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-14 text-center">
      <DollarSign size={32} className="text-slate-600 mx-auto mb-3" />
      <p className="text-slate-300 font-medium">No payouts yet</p>
      <p className="text-sm text-slate-500 mt-1">
        Payouts appear here once an invoice has been paid and processed by the platform.
      </p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">{records.length} record{records.length !== 1 ? 's' : ''}</p>
      {records.map((record) => <PayoutRow key={record.id} record={record} />)}
    </div>
  );
}

export default function CompanyPayoutsPage() {
  const [tab, setTab] = useState<'orders' | 'tenders'>('orders');

  return (
    <PageContainer className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-100">Payout History</h1>
        <p className="text-sm text-slate-400 mt-1">
          View completed payouts and download your platform commission invoices.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {([
          { id: 'orders',  label: 'Service Orders' },
          { id: 'tenders', label: 'Tender Contracts' },
        ] as { id: 'orders' | 'tenders'; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === id
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'orders'  && <OrderPayoutsTab />}
      {tab === 'tenders' && <TcPayoutsTab />}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          <span className="text-slate-400 font-medium">About commission invoices:</span> The
          platform issues a tax invoice for each payout showing the commission charged. You can
          download these for your records. Contact{' '}
          <span className="text-teal-400">accounts@onys.online</span> if you have billing
          queries.
        </p>
      </div>
    </PageContainer>
  );
}
