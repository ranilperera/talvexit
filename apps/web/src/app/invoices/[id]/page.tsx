'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Download,
  Send as SendIcon,
  CheckCircle2,
  XCircle,
  CreditCard,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import { getToken } from '@/lib/customer-auth';
import { namespacedPath } from '@/lib/namespace';
import EvidenceUploadModal from '@/components/invoices/EvidenceUploadModal';
import PaymentInstructionsBlock from '@/components/invoices/PaymentInstructionsBlock';

// ─── Types ───────────────────────────────────────────────────────────────────

type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';
type EvidenceStatus = 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';

interface LineItem {
  description: string;
  quantity: number;
  unit_amount_cents: number;
}

interface PaymentEvidenceRow {
  id: string;
  payment_method: string;
  payment_reference: string | null;
  payment_date: string;
  amount_cents: number;
  currency: string;
  notes: string | null;
  evidence_file_url: string | null;
  evidence_file_name: string | null;
  status: EvidenceStatus;
  reviewed_at: string | null;
  rejection_reason: string | null;
  submitted_by_user_id: string;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  from_user_id: string;
  to_user_id: string | null;
  to_company_id: string | null;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  tax_description: string | null;
  line_items: LineItem[];
  notes: string | null;
  terms: string | null;
  due_date: string | null;
  paid_at: string | null;
  sent_at: string | null;
  created_at: string;
  agreed_payment_method: string | null;
  pdf_storage_url: string | null;
  from_user: {
    id: string;
    full_name: string;
    email: string;
    legal_entity_name: string | null;
    abn: string | null;
    payment_methods: Record<string, unknown>;
  };
  from_company: {
    id: string;
    company_name: string;
    abn: string | null;
  } | null;
  to_user: { id: string; full_name: string; email: string } | null;
  to_company: { id: string; company_name: string } | null;
  payment_evidence: PaymentEvidenceRow[];
}

const STATUS_COLOR: Record<
  InvoiceStatus,
  'green' | 'amber' | 'red' | 'slate' | 'teal'
> = {
  DRAFT: 'slate',
  OPEN: 'amber',
  PAID: 'green',
  VOID: 'slate',
  UNCOLLECTIBLE: 'red',
};

const EVIDENCE_COLOR: Record<EvidenceStatus, 'green' | 'amber' | 'red' | 'slate'> =
  {
    SUBMITTED: 'amber',
    VERIFIED: 'green',
    REJECTED: 'red',
    PENDING: 'slate',
  };

function fmtMoney(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return format(new Date(iso), 'd MMM yyyy');
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  // Mounted at /invoices/[id], /contractor/invoices/[id], and
  // /company/invoices/[id]; preserve whichever chrome the user came from
  // when they hit "Back to invoices". Namespace logic in lib/namespace.ts.
  const pathname = usePathname() ?? '';
  const listPath = namespacedPath(pathname, 'invoices');
  const id = params.id;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState<string | null>(null);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [paying, setPaying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [downloadingEvidenceId, setDownloadingEvidenceId] = useState<string | null>(null);

  const fetchInvoice = useCallback(async () => {
    try {
      const res = await customerApi.get<{ success: boolean; data: Invoice }>(
        `/api/v1/service-invoices/${id}`,
      );
      setInvoice(res.data.data);
    } catch {
      // toast handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Read user id from JWT (sub) without fetching /auth/me — keeps detail page
  // independent of that endpoint
  useEffect(() => {
    const t = getToken();
    if (!t) return;
    try {
      const payload = JSON.parse(atob(t.split('.')[1]!)) as { sub?: string };
      setMeId(payload.sub ?? null);
    } catch {
      setMeId(null);
    }
  }, []);

  useEffect(() => {
    void fetchInvoice();
  }, [fetchInvoice]);

  // Re-poll when ?paid=1 redirect lands (after Stripe checkout success)
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('paid') !== '1') return;
    const timer = setInterval(() => void fetchInvoice(), 1500);
    return () => clearInterval(timer);
  }, [fetchInvoice]);

  const isSender = useMemo(
    () => meId !== null && invoice?.from_user_id === meId,
    [meId, invoice],
  );
  const isRecipient = useMemo(
    () =>
      meId !== null &&
      (invoice?.to_user_id === meId ||
        // Member of recipient company → backend already authorized us; treat as recipient
        (!!invoice?.to_company_id && !isSender)),
    [meId, invoice, isSender],
  );

  // ─── Actions ────────────────────────────────────────────────────────────

  async function handleSend() {
    if (!invoice) return;
    setSending(true);
    try {
      await customerApi.post(`/api/v1/service-invoices/${invoice.id}/send`);
      toast.success('Invoice sent.');
      void fetchInvoice();
    } catch {
      // toast handled
    } finally {
      setSending(false);
    }
  }

  async function handleDownloadPdf() {
    if (!invoice) return;
    setDownloading(true);
    try {
      const res = await customerApi.get<{
        success: boolean;
        data: { download_url: string };
      }>(`/api/v1/service-invoices/${invoice.id}/pdf`);
      window.open(res.data.data.download_url, '_blank', 'noopener,noreferrer');
    } catch {
      // toast handled
    } finally {
      setDownloading(false);
    }
  }

  async function handlePayWithCard() {
    if (!invoice) return;
    setPaying(true);
    try {
      const res = await customerApi.post<{
        success: boolean;
        data: { checkout_url: string };
      }>(`/api/v1/service-invoices/${invoice.id}/payment-link`);
      window.location.href = res.data.data.checkout_url;
    } catch {
      setPaying(false);
    }
  }

  async function handleDownloadEvidence(evidenceId: string) {
    if (!invoice) return;
    setDownloadingEvidenceId(evidenceId);
    try {
      const res = await customerApi.get<{
        success: boolean;
        data: { download_url: string; file_name: string | null };
      }>(
        `/api/v1/service-invoices/${invoice.id}/evidence/${evidenceId}/download`,
      );
      window.open(res.data.data.download_url, '_blank', 'noopener,noreferrer');
    } catch {
      // toast handled
    } finally {
      setDownloadingEvidenceId(null);
    }
  }

  async function handleVerify(evidenceId: string, approved: boolean) {
    if (!invoice) return;
    let rejectionReason: string | null = null;
    if (!approved) {
      rejectionReason = window.prompt('Reason for rejecting this payment evidence:');
      if (!rejectionReason || !rejectionReason.trim()) return;
    }
    setVerifying(evidenceId);
    try {
      await customerApi.post(
        `/api/v1/service-invoices/${invoice.id}/verify-evidence/${evidenceId}`,
        {
          approved,
          rejection_reason: rejectionReason ?? undefined,
        },
      );
      toast.success(approved ? 'Payment confirmed.' : 'Evidence rejected.');
      void fetchInvoice();
    } catch {
      // toast handled
    } finally {
      setVerifying(null);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-4">
        <div className="h-8 w-1/3 bg-slate-900 rounded animate-pulse" />
        <div className="h-64 bg-slate-900 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
        <h1 className="text-2xl font-bold font-display text-slate-100">
          Invoice not found
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          It may have been deleted or you may not have access.
        </p>
        <Button asChild variant="primary" size="md" className="mt-6">
          <Link href={listPath}>Back to invoices</Link>
        </Button>
      </div>
    );
  }

  const issuerName = invoice.from_company
    ? invoice.from_company.company_name
    : invoice.from_user.legal_entity_name ?? invoice.from_user.full_name;
  const recipientName = invoice.to_company
    ? invoice.to_company.company_name
    : invoice.to_user?.full_name ?? '—';

  const hasStripeMethod =
    (invoice.from_user.payment_methods as { stripe?: { enabled?: boolean } })?.stripe
      ?.enabled === true;

  const overdue =
    invoice.status === 'OPEN' &&
    !!invoice.due_date &&
    new Date(invoice.due_date) < new Date();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      {/* ── Back link + actions ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push(listPath)}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
        >
          <ArrowLeft size={12} />
          Back to invoices
        </button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            loading={downloading}
            onClick={() => void handleDownloadPdf()}
          >
            <Download size={13} />
            PDF
          </Button>
          {isSender && invoice.status === 'DRAFT' && (
            <Button
              variant="primary"
              size="sm"
              loading={sending}
              onClick={() => void handleSend()}
            >
              <SendIcon size={13} />
              Send to client
            </Button>
          )}
          {isRecipient && invoice.status === 'OPEN' && hasStripeMethod && (
            <Button
              variant="primary"
              size="sm"
              loading={paying}
              onClick={() => void handlePayWithCard()}
            >
              <CreditCard size={13} />
              Pay with card
            </Button>
          )}
          {isRecipient && invoice.status === 'OPEN' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEvidenceModalOpen(true)}
            >
              Mark as paid
            </Button>
          )}
        </div>
      </div>

      {/* ── Header card ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {invoice.status === 'DRAFT' ? 'Draft' : 'Invoice'}{' '}
              <span className="font-mono text-slate-300 ml-1">
                {invoice.invoice_number}
              </span>
            </p>
            <h1 className="mt-1 text-3xl font-bold font-display text-slate-100 tabular-nums">
              {fmtMoney(invoice.total_cents, invoice.currency)}
            </h1>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <Badge color={STATUS_COLOR[invoice.status]}>{invoice.status}</Badge>
              {overdue && <Badge color="red">Overdue</Badge>}
              {invoice.paid_at && (
                <Badge color="green">
                  Paid {fmtDate(invoice.paid_at)}
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-0.5">
            <p>
              <span className="text-slate-400">From:</span>{' '}
              <span className="text-slate-200">{issuerName}</span>
              {invoice.from_user.abn && (
                <span className="ml-1">(ABN {invoice.from_user.abn})</span>
              )}
            </p>
            <p>
              <span className="text-slate-400">To:</span>{' '}
              <span className="text-slate-200">{recipientName}</span>
            </p>
            <p>Issued: {fmtDate(invoice.created_at)}</p>
            {invoice.sent_at && <p>Sent: {fmtDate(invoice.sent_at)}</p>}
            {invoice.due_date && (
              <p className={overdue ? 'text-red-400' : ''}>
                Due: {fmtDate(invoice.due_date)}
              </p>
            )}
          </div>
        </div>

        {/* Line items */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 font-semibold">Description</th>
                <th className="py-2 font-semibold text-right w-16">Qty</th>
                <th className="py-2 font-semibold text-right w-32">Unit</th>
                <th className="py-2 font-semibold text-right w-32">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.line_items.map((item, i) => (
                <tr key={i} className="border-b border-slate-800/40 last:border-b-0">
                  <td className="py-3 text-slate-200">{item.description}</td>
                  <td className="py-3 text-right tabular-nums text-slate-400">
                    {item.quantity}
                  </td>
                  <td className="py-3 text-right tabular-nums text-slate-400">
                    {fmtMoney(item.unit_amount_cents, invoice.currency)}
                  </td>
                  <td className="py-3 text-right tabular-nums text-slate-200">
                    {fmtMoney(
                      Math.round(item.unit_amount_cents * item.quantity),
                      invoice.currency,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="pt-4 text-right text-xs text-slate-500">
                  Subtotal
                </td>
                <td className="pt-4 text-right tabular-nums text-sm text-slate-200">
                  {fmtMoney(invoice.subtotal_cents, invoice.currency)}
                </td>
              </tr>
              {invoice.tax_cents > 0 && (
                <tr>
                  <td colSpan={3} className="pt-1 text-right text-xs text-slate-500">
                    {invoice.tax_description ?? 'Tax'}
                  </td>
                  <td className="pt-1 text-right tabular-nums text-sm text-slate-200">
                    {fmtMoney(invoice.tax_cents, invoice.currency)}
                  </td>
                </tr>
              )}
              <tr>
                <td
                  colSpan={3}
                  className="pt-2 text-right text-sm font-semibold text-slate-300 border-t border-slate-800"
                >
                  Total ({invoice.currency})
                </td>
                <td className="pt-2 text-right tabular-nums font-bold text-slate-100 border-t border-slate-800">
                  {fmtMoney(invoice.total_cents, invoice.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notes / terms */}
        {(invoice.notes || invoice.terms) && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
            {invoice.notes && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Notes
                </p>
                <p className="mt-1.5 text-sm text-slate-300 whitespace-pre-wrap">
                  {invoice.notes}
                </p>
              </div>
            )}
            {invoice.terms && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Terms
                </p>
                <p className="mt-1.5 text-sm text-slate-300 whitespace-pre-wrap">
                  {invoice.terms}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Payment instructions ─────────────────────────────────────────── */}
      {(invoice.status === 'OPEN' || invoice.status === 'DRAFT') && (
        <PaymentInstructionsBlock methods={invoice.from_user.payment_methods} />
      )}

      {/* ── Evidence history ─────────────────────────────────────────────── */}
      {invoice.payment_evidence.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-slate-200">
              Payment evidence
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {isSender
                ? 'Review and confirm to mark this invoice as paid.'
                : 'Submitted by you. Awaiting provider confirmation.'}
            </p>
          </div>
          <div className="divide-y divide-slate-800/60">
            {invoice.payment_evidence.map((ev) => (
              <div key={ev.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge color={EVIDENCE_COLOR[ev.status]}>{ev.status}</Badge>
                      <span className="text-xs text-slate-500">
                        {ev.payment_method.replace(/_/g, ' ')}
                      </span>
                      {ev.payment_reference && (
                        <span className="text-xs font-mono text-slate-500">
                          ref: {ev.payment_reference}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-300">
                      {fmtMoney(ev.amount_cents, ev.currency)} on{' '}
                      {fmtDate(ev.payment_date)}
                    </p>
                    {ev.notes && (
                      <p className="mt-1 text-xs text-slate-500 whitespace-pre-wrap">
                        {ev.notes}
                      </p>
                    )}
                    {ev.rejection_reason && (
                      <p className="mt-1 text-xs text-red-400">
                        Rejection reason: {ev.rejection_reason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {ev.evidence_file_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={downloadingEvidenceId === ev.id}
                        onClick={() => void handleDownloadEvidence(ev.id)}
                      >
                        <Download size={11} />
                        Receipt
                      </Button>
                    )}
                    {isSender && ev.status === 'SUBMITTED' && (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          loading={verifying === ev.id}
                          onClick={() => void handleVerify(ev.id, true)}
                        >
                          <CheckCircle2 size={13} />
                          Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={verifying === ev.id}
                          onClick={() => void handleVerify(ev.id, false)}
                        >
                          <XCircle size={13} />
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty evidence state for recipient on open invoices ──────────── */}
      {invoice.payment_evidence.length === 0 &&
        isRecipient &&
        invoice.status === 'OPEN' && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center">
            <AlertCircle size={20} className="mx-auto text-slate-500" />
            <p className="mt-2 text-sm text-slate-400">
              Once you&apos;ve paid using one of the methods above, click{' '}
              <span className="text-slate-200 font-medium">Mark as paid</span> to
              submit evidence.
            </p>
          </div>
        )}

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      <EvidenceUploadModal
        open={evidenceModalOpen}
        onClose={() => setEvidenceModalOpen(false)}
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoice_number}
        defaultAmountCents={invoice.total_cents}
        defaultCurrency={invoice.currency}
        onSubmitted={() => {
          void fetchInvoice();
        }}
      />
    </div>
  );
}
