'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Lock, CreditCard, Building2, Smartphone, Globe,
  CheckCircle2, Upload, X, ChevronRight, Copy, Receipt,
} from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements, PaymentElement, useStripe, useElements,
} from '@stripe/react-stripe-js';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import DirectPaymentFlow from '@/components/payment/DirectPaymentFlow';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '');

const STRIPE_APPEARANCE = {
  theme: 'night' as const,
  variables: {
    colorPrimary: '#00C2A8',
    colorBackground: '#1E2435',
    colorText: '#EEF1F6',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '12px',
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuBankConfig { bsb: string; account_number: string; account_name: string; bank_name: string; enabled: boolean }
interface SwiftConfig { swift_code: string; iban: string; account_name: string; bank_name: string; bank_address: string; currency: string; enabled: boolean }
interface PayIdConfig { email: string; name: string; enabled: boolean }

interface PlatformBankData {
  enabled: boolean;
  au_bank?: AuBankConfig | null;
  swift?: SwiftConfig | null;
  payid?: PayIdConfig | null;
}

type BankMethod = 'AU_BSB' | 'PAYID_EMAIL' | 'SWIFT';
type PaymentChoice = 'card' | 'bank';
type BankStep = 'method' | 'details' | 'receipt' | 'done';

interface TcInvoice {
  id: string;
  invoice_number: string;
  amount_aud: string;
  gst_amount_aud: string;
  total_aud: string;
  status: string;
  due_date: string | null;
  milestone: { id: string; name: string } | null;
  contract: { scope_snapshot: { title?: string } | null };
  bank_transfer: { id: string; status: string } | null;
}

// ─── Copy helper ──────────────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  function copy() {
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
        <span className="flex-1 font-mono text-sm text-slate-200 select-all">{value}</span>
        <button onClick={copy} className="text-slate-500 hover:text-teal-400 transition-colors p-0.5">
          <Copy size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Stripe form ──────────────────────────────────────────────────────────────

function StripeForm({ contractId, invoice }: { contractId: string; invoice: TcInvoice }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  const total = Number(invoice.total_aud);
  const amountExGst = Number(invoice.amount_aud);
  const gst = Number(invoice.gst_amount_aud);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError('');
    setPaying(true);
    const returnUrl = `${window.location.origin}/customer/contracts/${contractId}?payment=success`;
    const { error: stripeErr } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });
    if (stripeErr) {
      setError(stripeErr.message ?? 'Payment failed. Please try again.');
      toast.error(stripeErr.message ?? 'Payment failed');
    }
    setPaying(false);
  }

  return (
    <form onSubmit={(e) => { void handlePay(e); }} className="space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-400">Milestone: {invoice.milestone?.name ?? 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Subtotal (ex GST)</span>
          <span className="text-slate-200">AUD {amountExGst.toFixed(2)}</span>
        </div>
        {gst > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-400">GST (10%)</span>
            <span className="text-slate-200">AUD {gst.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-800 pt-2 mt-2">
          <span className="font-semibold text-slate-100">Total</span>
          <span className="font-bold text-teal-400 text-base">AUD {total.toFixed(2)}</span>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <PaymentElement />
      </div>
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{error}</div>
      )}
      <Button type="submit" size="lg" fullWidth loading={paying} disabled={!stripe}>
        Pay AUD {total.toFixed(2)}
      </Button>
      <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
        <Lock size={12} />
        <span>Secured by Stripe. Your card details are never stored on our servers.</span>
      </div>
    </form>
  );
}

// ─── Bank transfer flow ───────────────────────────────────────────────────────

function BankTransferFlow({
  invoiceId,
  contractId,
  invoiceNumber,
  totalAud,
  bankData,
}: {
  invoiceId: string;
  contractId: string;
  invoiceNumber: string;
  totalAud: number;
  bankData: PlatformBankData;
}) {
  const [step, setStep] = useState<BankStep>('method');
  const [method, setMethod] = useState<BankMethod | null>(null);
  const [reference, setReference] = useState(`INV-${invoiceNumber}`);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const ALL_METHODS: { id: BankMethod; label: string; sub: string; Icon: React.ElementType; enabled: boolean }[] = [
    { id: 'AU_BSB',      label: 'BSB / Account',  sub: 'Domestic AU bank transfer',   Icon: Building2,  enabled: !!bankData.au_bank?.enabled },
    { id: 'PAYID_EMAIL', label: 'PayID',           sub: 'Instant via PayID email',     Icon: Smartphone, enabled: !!bankData.payid?.enabled },
    { id: 'SWIFT',       label: 'SWIFT / Wire',    sub: 'International bank transfer', Icon: Globe,      enabled: !!bankData.swift?.enabled },
  ];
  const METHODS = ALL_METHODS.filter((m) => m.enabled);

  async function handleSubmit() {
    if (!method) return;
    setSubmitting(true);
    try {
      await customerApi.post(`/api/v1/tender-contract-invoices/${invoiceId}/bank-transfer`, {
        method,
        ...(reference.trim() ? { payment_reference: reference.trim() } : {}),
      });

      if (receiptFile) {
        setUploading(true);
        const buffer = await receiptFile.arrayBuffer();
        await customerApi.post(
          `/api/v1/tender-contract-invoices/${invoiceId}/bank-transfer/receipt`,
          buffer,
          { headers: { 'Content-Type': receiptFile.type, 'X-File-Name': receiptFile.name } },
        );
        setUploading(false);
      }

      setStep('done');
    } catch (err) {
      const e = err as { response?: { data?: { error?: { code?: string } } } };
      if (e.response?.data?.error?.code === 'BANK_TRANSFER_EXISTS') {
        setStep('done');
        return;
      }
      toast.error('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }

  if (step === 'method') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-400">Select how you will make the payment:</p>
        <div className="space-y-2">
          {METHODS.map(({ id, label, sub, Icon }) => (
            <button
              key={id}
              onClick={() => { setMethod(id); setStep('details'); }}
              className="w-full flex items-center gap-4 px-4 py-4 bg-slate-900 border border-slate-800
                hover:border-teal-500/50 rounded-2xl text-left transition-colors group"
            >
              <div className="p-2 bg-slate-800 group-hover:bg-teal-500/20 rounded-xl transition-colors">
                <Icon size={18} className="text-slate-400 group-hover:text-teal-400 transition-colors" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-200">{label}</p>
                <p className="text-xs text-slate-500">{sub}</p>
              </div>
              <ChevronRight size={15} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === 'details') {
    const au = bankData.au_bank;
    const payid = bankData.payid;
    const sw = bankData.swift;

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <button onClick={() => setStep('method')} className="text-slate-500 hover:text-slate-300 transition-colors">
            <ArrowLeft size={15} />
          </button>
          <p className="text-sm font-semibold text-slate-200">
            {method === 'AU_BSB' ? 'AU Bank Transfer' : method === 'PAYID_EMAIL' ? 'PayID' : 'SWIFT / Wire'}
          </p>
        </div>

        <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl px-5 py-4">
          <p className="text-xs text-teal-400/70 font-medium mb-1">Amount to transfer</p>
          <p className="text-2xl font-bold text-teal-300">AUD {totalAud.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">Include this exact amount to avoid processing delays.</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          {method === 'AU_BSB' && au && (
            <>
              <CopyField label="Bank Name" value={au.bank_name} />
              <div className="grid grid-cols-2 gap-4">
                <CopyField label="BSB" value={au.bsb} />
                <CopyField label="Account Number" value={au.account_number} />
              </div>
              <CopyField label="Account Name" value={au.account_name} />
            </>
          )}
          {method === 'PAYID_EMAIL' && payid && (
            <>
              <CopyField label="PayID Email" value={payid.email} />
              <CopyField label="Account Name" value={payid.name} />
            </>
          )}
          {method === 'SWIFT' && sw && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <CopyField label="SWIFT / BIC" value={sw.swift_code} />
                <CopyField label="Currency" value={sw.currency} />
              </div>
              <CopyField label="IBAN / Account" value={sw.iban} />
              <CopyField label="Account Name" value={sw.account_name} />
              <CopyField label="Bank Name" value={sw.bank_name} />
              {sw.bank_address && <CopyField label="Bank Address" value={sw.bank_address} />}
            </>
          )}

          <div>
            <p className="text-xs text-slate-500 mb-1">Payment Reference <span className="text-amber-400">— include this</span></p>
            <div className="flex items-center gap-2 bg-slate-800 border border-amber-500/30 rounded-xl px-3 py-2">
              <span className="flex-1 font-mono text-sm text-amber-300 select-all">{reference}</span>
              <button
                onClick={() => { void navigator.clipboard.writeText(reference); toast.success('Reference copied'); }}
                className="text-slate-500 hover:text-amber-400 transition-colors p-0.5"
              >
                <Copy size={13} />
              </button>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500 bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3">
          Waveful Digital Platforms is authorised to collect payments on behalf of the service provider.
          Once your transfer is received and confirmed by our team, this invoice will be marked as paid.
        </div>

        <Button size="lg" fullWidth onClick={() => setStep('receipt')}>
          I&apos;ve Made the Transfer — Upload Receipt
        </Button>
      </div>
    );
  }

  if (step === 'receipt') {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <button onClick={() => setStep('details')} className="text-slate-500 hover:text-slate-300 transition-colors">
            <ArrowLeft size={15} />
          </button>
          <p className="text-sm font-semibold text-slate-200">Upload Payment Receipt</p>
        </div>

        <p className="text-sm text-slate-400">
          Upload your bank transfer receipt or confirmation screenshot (PDF, PNG, JPG — max 10 MB).
        </p>

        <label className="block cursor-pointer">
          <div className={`border-2 border-dashed rounded-2xl px-5 py-8 text-center transition-colors ${
            receiptFile ? 'border-teal-500/50 bg-teal-500/5' : 'border-slate-700 hover:border-slate-600'
          }`}>
            {receiptFile ? (
              <div className="flex items-center justify-center gap-3">
                <CheckCircle2 size={18} className="text-teal-400" />
                <span className="text-sm text-slate-200">{receiptFile.name}</span>
                <button
                  onClick={(e) => { e.preventDefault(); setReceiptFile(null); }}
                  className="text-slate-500 hover:text-red-400 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <>
                <Upload size={20} className="mx-auto text-slate-600 mb-2" />
                <p className="text-sm text-slate-400">Click to upload receipt</p>
                <p className="text-xs text-slate-600 mt-1">PDF, PNG, JPG · max 10 MB</p>
              </>
            )}
          </div>
          <input
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Payment reference you used <span className="text-slate-600">(optional)</span>
          </label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm
              font-mono text-slate-200 focus:outline-none focus:border-teal-500/50"
          />
        </div>

        <Button size="lg" fullWidth onClick={() => { void handleSubmit(); }} loading={submitting || uploading}>
          {uploading ? 'Uploading Receipt…' : submitting ? 'Submitting…' : 'Submit Payment Notification'}
        </Button>

        <button
          onClick={() => { void handleSubmit(); }}
          disabled={submitting}
          className="w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Submit without receipt →
        </button>
      </div>
    );
  }

  // done
  return (
    <div className="text-center py-8 space-y-4">
      <div className="w-16 h-16 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center mx-auto">
        <CheckCircle2 size={28} className="text-teal-400" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-100">Payment Notification Received</h2>
        <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">
          Our team will verify your bank transfer and mark the invoice as paid — typically within 1 business day.
        </p>
      </div>
      <Button asChild size="lg" fullWidth>
        <Link href={`/customer/contracts/${contractId}`}>Back to Contract</Link>
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type FlowMode = 'unknown' | 'direct' | 'legacy';

export default function TcPaymentPage() {
  const { id: contractId, invoiceId } = useParams<{ id: string; invoiceId: string }>();
  const [choice, setChoice] = useState<PaymentChoice | null>(null);
  const [invoice, setInvoice] = useState<TcInvoice | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [bankData, setBankData] = useState<PlatformBankData | null>(null);
  const [loading, setLoading] = useState(true);
  const [intentError, setIntentError] = useState('');
  const [flowMode, setFlowMode] = useState<FlowMode>('unknown');

  const init = useCallback(async () => {
    // Probe direct-payment endpoint first to detect cutover.
    let mode: FlowMode = 'legacy';
    try {
      await customerApi.get(`/api/v1/tender-contract-invoices/${invoiceId}/payment-options`);
      mode = 'direct';
    } catch {
      mode = 'legacy';
    }
    setFlowMode(mode);

    if (mode === 'direct') {
      setLoading(false);
      return;
    }

    const [invResult, bankResult] = await Promise.allSettled([
      customerApi.get<{ success: boolean; data: { invoice: TcInvoice } }>(
        `/api/v1/tender-contract-invoices/${invoiceId}`,
      ),
      customerApi.get<{ success: boolean; data: PlatformBankData }>('/api/v1/platform/bank-account'),
    ]);

    if (invResult.status === 'rejected') {
      setIntentError('Could not load invoice. Please refresh.');
    } else {
      setInvoice(invResult.value.data.data.invoice);
    }

    if (bankResult.status === 'fulfilled') {
      setBankData(bankResult.value.data.data);
    }

    setLoading(false);
  }, [invoiceId]);

  useEffect(() => { void init(); }, [init]);

  async function handleSelectCard() {
    setChoice('card');
    if (clientSecret) return;
    try {
      const res = await customerApi.post<{ success: boolean; data: { client_secret: string } }>(
        `/api/v1/tender-contract-invoices/${invoiceId}/payment/create`,
      );
      setClientSecret(res.data.data.client_secret);
    } catch (err) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setIntentError(e.response?.data?.error?.message ?? 'Could not initialise payment');
      setChoice(null);
    }
  }

  const title = invoice?.contract?.scope_snapshot?.title ?? 'Pay Invoice';
  const total = Number(invoice?.total_aud ?? 0);
  const bankEnabled = bankData?.enabled &&
    (bankData.au_bank?.enabled || bankData.payid?.enabled || bankData.swift?.enabled);

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <Link
        href={`/customer/contracts/${contractId}`}
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors no-underline mb-6"
      >
        <ArrowLeft size={14} /> Back to Contract
      </Link>

      <div className="flex items-center gap-2 mb-1">
        <Receipt size={18} className="text-teal-400" />
        <h1 className="font-display font-bold text-2xl text-slate-100">Pay Invoice</h1>
      </div>
      <p className="text-sm text-slate-400 mb-1 line-clamp-2">{invoice ? title : '\u00a0'}</p>
      {invoice && (
        <p className="text-xs text-slate-500 mb-8">
          {invoice.invoice_number}
          {invoice.milestone && ` · ${invoice.milestone.name}`}
          {invoice.due_date && ` · Due ${new Date(invoice.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`}
        </p>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-[72px] bg-slate-800/60 border border-slate-700/50 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && intentError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-6 py-8 text-center">
          <p className="text-red-400 text-sm">{intentError}</p>
          <Button className="mt-4" variant="secondary" onClick={() => { void init(); }}>Retry</Button>
        </div>
      )}

      {/* Direct-payment flow (post-cutover invoices) */}
      {!loading && !intentError && flowMode === 'direct' && (
        <DirectPaymentFlow
          kind="tender_invoice"
          entityId={invoiceId}
          backHref={`/customer/contracts/${contractId}`}
          backLabel="Back to contract"
        />
      )}

      {/* Already paid */}
      {!loading && flowMode === 'legacy' && invoice?.status === 'PAID' && (
        <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl px-6 py-8 text-center space-y-4">
          <CheckCircle2 size={32} className="text-teal-400 mx-auto" />
          <p className="text-slate-200 font-semibold">This invoice has already been paid.</p>
          <Button asChild variant="secondary">
            <Link href={`/customer/contracts/${contractId}`}>Back to Contract</Link>
          </Button>
        </div>
      )}

      {/* Bank transfer already submitted (pending review) */}
      {!loading && flowMode === 'legacy' && invoice?.status !== 'PAID' && invoice?.bank_transfer && invoice.bank_transfer.status !== 'REJECTED' && (
        <div className="text-center py-8 space-y-4">
          <div className="w-16 h-16 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} className="text-teal-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">Payment Notification Received</h2>
            <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">
              Our team will verify your bank transfer and mark the invoice as paid — typically within 1 business day.
            </p>
          </div>
          <Button asChild size="lg" fullWidth>
            <Link href={`/customer/contracts/${contractId}`}>Back to Contract</Link>
          </Button>
        </div>
      )}

      {!loading && !intentError && flowMode === 'legacy' && invoice?.status !== 'PAID' && !invoice?.bank_transfer && !choice && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Choose payment method</p>

          <button
            onClick={() => { void handleSelectCard(); }}
            className="w-full flex items-center gap-4 px-5 py-4 bg-slate-900 border border-slate-800
              hover:border-teal-500/50 rounded-2xl text-left transition-colors group"
          >
            <div className="p-2.5 bg-slate-800 group-hover:bg-teal-500/20 rounded-xl transition-colors">
              <CreditCard size={20} className="text-slate-400 group-hover:text-teal-400 transition-colors" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-200">Credit / Debit Card</p>
              <p className="text-xs text-slate-500">Instant · Secured by Stripe</p>
            </div>
            <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-300 transition-colors" />
          </button>

          {bankEnabled && (
            <button
              onClick={() => setChoice('bank')}
              className="w-full flex items-center gap-4 px-5 py-4 bg-slate-900 border border-slate-800
                hover:border-teal-500/50 rounded-2xl text-left transition-colors group"
            >
              <div className="p-2.5 bg-slate-800 group-hover:bg-teal-500/20 rounded-xl transition-colors">
                <Building2 size={20} className="text-slate-400 group-hover:text-teal-400 transition-colors" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-200">Bank Transfer</p>
                <p className="text-xs text-slate-500">SWIFT · BSB · PayID · 1–3 business days</p>
              </div>
              <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-300 transition-colors" />
            </button>
          )}

          <p className="text-center text-xs text-slate-600 pt-2">
            AUD {total.toFixed(2)} · Invoice #{invoice?.invoice_number ?? '—'}
          </p>
        </div>
      )}

      {!loading && flowMode === 'legacy' && choice === 'card' && invoice && (
        <div>
          <button
            onClick={() => setChoice(null)}
            className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-6"
          >
            <ArrowLeft size={13} /> Other payment methods
          </button>
          {clientSecret ? (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: STRIPE_APPEARANCE }}>
              <StripeForm contractId={contractId} invoice={invoice} />
            </Elements>
          ) : (
            <div className="space-y-4">
              <div className="h-28 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
              <div className="h-48 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
            </div>
          )}
        </div>
      )}

      {!loading && flowMode === 'legacy' && choice === 'bank' && bankData && invoice && (
        <div>
          <button
            onClick={() => setChoice(null)}
            className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-6"
          >
            <ArrowLeft size={13} /> Other payment methods
          </button>
          <BankTransferFlow
            invoiceId={invoiceId}
            contractId={contractId}
            invoiceNumber={invoice.invoice_number}
            totalAud={total}
            bankData={bankData}
          />
        </div>
      )}
    </div>
  );
}
