'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  CreditCard,
  Lock,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import PaymentInstructionsBlock from '@/components/invoices/PaymentInstructionsBlock';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LineItem {
  description: string;
  quantity: number;
  unit_amount_cents: number;
}

interface PublicInvoice {
  id: string;
  invoice_number: string;
  status: 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE' | 'DRAFT';
  issued_date: string;
  due_date: string | null;
  paid_date: string | null;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  tax_description: string | null;
  line_items: LineItem[];
  notes: string | null;
  terms: string | null;
  issuer: { name: string; email: string; abn: string | null };
  recipient: { name: string };
  payment_methods: Record<string, unknown>;
  stripe_pay_available: boolean;
}

const publicApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? '',
  timeout: 15000,
});

function fmtMoney(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return format(new Date(iso), 'd MMM yyyy');
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PublicInvoiceClient() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const fetchInvoice = useCallback(async () => {
    try {
      const res = await publicApi.get<{ success: boolean; data: PublicInvoice }>(
        `/api/v1/public/invoices/${token}`,
      );
      setInvoice(res.data.data);
      setError(null);
    } catch (err) {
      const e = err as {
        response?: { status?: number; data?: { error?: { message?: string } } };
      };
      if (e.response?.status === 404) {
        setError('This invoice link is invalid or has expired.');
      } else {
        setError(e.response?.data?.error?.message ?? 'Could not load invoice.');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchInvoice();
  }, [fetchInvoice]);

  // Re-poll on ?paid=1 redirect (Stripe success)
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('paid') !== '1') return;
    const timer = setInterval(() => void fetchInvoice(), 1500);
    return () => clearInterval(timer);
  }, [fetchInvoice]);

  async function handlePayWithCard() {
    setPaying(true);
    try {
      const res = await publicApi.post<{
        success: boolean;
        data: { checkout_url: string };
      }>(`/api/v1/public/invoices/${token}/pay-stripe`);
      window.location.href = res.data.data.checkout_url;
    } catch (err) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Could not start payment.');
      setPaying(false);
    }
  }

  // ── Render: loading / error ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-16">
        <Loader2 size={28} className="animate-spin text-slate-500" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-6">
            <AlertCircle size={28} className="text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold font-display text-slate-100">
            Invoice unavailable
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            {error ?? 'Invoice not found.'}
          </p>
          <Button asChild variant="primary" size="md" className="mt-6">
            <Link href="/">Go to talvexIT</Link>
          </Button>
        </div>
      </div>
    );
  }

  const isPaid = invoice.status === 'PAID';
  const isOpen = invoice.status === 'OPEN';

  return (
    <div className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="text-center">
          <Link href="/" className="inline-block no-underline">
            <span className="font-display font-bold text-lg text-slate-100">
              talvex<span className="text-teal-400">IT</span>
            </span>
          </Link>
          <p className="mt-3 text-xs text-slate-500 inline-flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-teal-400" />
            You&apos;re viewing a secure invoice link from {invoice.issuer.name}
          </p>
        </div>

        {/* ── Paid banner ─────────────────────────────────────────────────── */}
        {isPaid && (
          <div className="rounded-xl bg-teal-500/10 border border-teal-500/30 p-4 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-teal-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-teal-300">Paid in full</p>
              <p className="text-xs text-teal-300/80">
                {invoice.paid_date
                  ? `Settled ${fmtDate(invoice.paid_date)}`
                  : 'Settled'}
              </p>
            </div>
          </div>
        )}

        {/* ── Header card ─────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Invoice{' '}
                <span className="font-mono text-slate-300 ml-1">
                  {invoice.invoice_number}
                </span>
              </p>
              <h1 className="mt-1 text-3xl font-bold font-display text-slate-100 tabular-nums">
                {fmtMoney(invoice.total_cents, invoice.currency)}
              </h1>
              <Badge color={isPaid ? 'green' : isOpen ? 'amber' : 'slate'} className="mt-2">
                {invoice.status}
              </Badge>
            </div>
            <div className="text-right text-xs text-slate-500 space-y-0.5">
              <p>
                <span className="text-slate-400">From:</span>{' '}
                <span className="text-slate-200">{invoice.issuer.name}</span>
              </p>
              {invoice.issuer.abn && <p>ABN {invoice.issuer.abn}</p>}
              <p>
                <span className="text-slate-400">To:</span>{' '}
                <span className="text-slate-200">{invoice.recipient.name}</span>
              </p>
              <p>Issued: {fmtDate(invoice.issued_date)}</p>
              {invoice.due_date && <p>Due: {fmtDate(invoice.due_date)}</p>}
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

        {/* ── Pay with card ───────────────────────────────────────────────── */}
        {isOpen && invoice.stripe_pay_available && (
          <div className="rounded-2xl border-2 border-teal-500/40 bg-gradient-to-br from-teal-500/10 to-slate-900 p-6 text-center">
            <CreditCard size={24} className="mx-auto text-teal-400" />
            <h2 className="mt-3 text-lg font-semibold text-slate-100">
              Pay {fmtMoney(invoice.total_cents, invoice.currency)} with card
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Stripe handles payment securely. Funds settle directly to{' '}
              {invoice.issuer.name}.
            </p>
            <Button
              variant="primary"
              size="lg"
              className="mt-4"
              loading={paying}
              onClick={() => void handlePayWithCard()}
            >
              <Lock size={14} />
              Pay with card via Stripe
            </Button>
          </div>
        )}

        {/* ── Manual payment instructions ─────────────────────────────────── */}
        {isOpen && (
          <PaymentInstructionsBlock
            methods={invoice.payment_methods}
            hideStripe={invoice.stripe_pay_available}
          />
        )}

        {/* ── Sign-in to manage prompt ─────────────────────────────────────── */}
        {isOpen && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-center">
            <p className="text-sm text-slate-300">
              Already have a TalvexIT account?
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Sign in to access your full invoice history, submit payment evidence
              with file attachments, and message the provider.
            </p>
            <Button asChild variant="secondary" size="md" className="mt-3">
              <Link href={`/login?return=/invoices/${invoice.id}`}>
                Sign in to manage
              </Link>
            </Button>
          </div>
        )}

        {/* ── Footer disclaimer ───────────────────────────────────────────── */}
        <p className="text-[11px] text-slate-600 text-center max-w-xl mx-auto leading-relaxed">
          TalvexIT (operated by Waveful Digital Platforms) is a technology platform. Payments
          on this invoice are made directly between you and {invoice.issuer.name}.
          TalvexIT is not a party to this transaction.
        </p>
      </div>
    </div>
  );
}
