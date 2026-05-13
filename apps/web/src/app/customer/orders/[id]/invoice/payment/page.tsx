'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Lock, CreditCard, Building2, Smartphone, Globe,
  CheckCircle2, Upload, X, ChevronRight, Copy,
} from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements, PaymentElement, useStripe, useElements,
} from '@stripe/react-stripe-js';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import DirectPaymentFlow from '@/components/payment/DirectPaymentFlow';
// Display-only preview — the actual amount Stripe charges is server-side.
// Default both sides to AU; matches the typical case. For cross-border
// customers, the server's authoritative number will be shown elsewhere.
import { decideGstTreatment } from '@onys/shared';

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

// ─── Stripe payment form ──────────────────────────────────────────────────────

function StripeForm({ orderId, price }: { orderId: string; price: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  // Display-only — actual charge amount is server-driven via the Stripe
  // payment intent. Defaults match the typical AU-AU case.
  const _decision = decideGstTreatment({
    issuer_country: 'AU',
    issuer_gst_registered: true,
    recipient_country: 'AU',
    amount_ex_gst_cents: Math.round(price * 100),
  });
  const gst = _decision.gst_amount_cents / 100;
  const total = price + gst;

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError('');
    setPaying(true);
    const returnUrl = `${window.location.origin}/customer/orders/${orderId}?payment=success`;
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
          <span className="text-slate-400">Subtotal</span>
          <span className="text-slate-200">AUD {price.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">GST (10%)</span>
          <span className="text-slate-200">AUD {gst.toFixed(2)}</span>
        </div>
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
  orderId,
  invoiceNumber,
  totalAud,
  bankData,
}: {
  invoiceId: string;
  orderId: string;
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

  const auEnabled = bankData.au_bank?.enabled;
  const payidEnabled = bankData.payid?.enabled;
  const swiftEnabled = bankData.swift?.enabled;

  const ALL_METHODS: { id: BankMethod; label: string; sub: string; Icon: React.ElementType; enabled: boolean }[] = [
    { id: 'AU_BSB',      label: 'BSB / Account',  sub: 'Domestic AU bank transfer',   Icon: Building2,  enabled: !!auEnabled },
    { id: 'PAYID_EMAIL', label: 'PayID',           sub: 'Instant via PayID email',     Icon: Smartphone, enabled: !!payidEnabled },
    { id: 'SWIFT',       label: 'SWIFT / Wire',   sub: 'International bank transfer', Icon: Globe,      enabled: !!swiftEnabled },
  ];
  const METHODS = ALL_METHODS.filter((m) => m.enabled);

  async function handleSubmit() {
    if (!method) return;
    setSubmitting(true);
    try {
      // 1. Submit bank transfer record
      await customerApi.post(`/api/v1/company-invoices/${invoiceId}/bank-transfer`, {
        method,
        payment_reference: reference || null,
      });

      // 2. Upload receipt if provided
      if (receiptFile) {
        setUploading(true);
        const buffer = await receiptFile.arrayBuffer();
        await customerApi.post(
          `/api/v1/company-invoices/${invoiceId}/bank-transfer/receipt`,
          buffer,
          {
            headers: {
              'Content-Type': receiptFile.type,
              'X-File-Name': receiptFile.name,
            },
          },
        );
        setUploading(false);
      }

      setStep('done');
    } catch {
      toast.error('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }

  // ── Step: method selection ──
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

  // ── Step: bank details ──
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

        {/* Amount to pay */}
        <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl px-5 py-4">
          <p className="text-xs text-teal-400/70 font-medium mb-1">Amount to transfer</p>
          <p className="text-2xl font-bold text-teal-300">AUD {totalAud.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">Include this exact amount to avoid processing delays.</p>
        </div>

        {/* Bank details */}
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

          {/* Reference */}
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
          Waveful Digital Platforms is authorised to issue tax invoices and collect payments on behalf of the service provider.
          Once your transfer is received and confirmed by our team, this invoice will be marked as paid.
        </div>

        <Button size="lg" fullWidth onClick={() => setStep('receipt')}>
          I've Made the Transfer — Upload Receipt
        </Button>
      </div>
    );
  }

  // ── Step: upload receipt ──
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
          This helps our team verify your payment faster.
        </p>

        {/* Receipt upload */}
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

        {/* Reference confirmation */}
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

        <Button
          size="lg"
          fullWidth
          onClick={() => { void handleSubmit(); }}
          loading={submitting || uploading}
        >
          {uploading ? 'Uploading Receipt…' : submitting ? 'Submitting…' : 'Submit Payment Notification'}
        </Button>

        <p className="text-center text-xs text-slate-600">
          Receipt upload is optional but recommended — you can also skip and submit without one.
        </p>
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

  // ── Step: done ──
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
        <Link href={`/customer/orders/${orderId}`}>Back to Order</Link>
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface OrderData {
  id: string;
  price_aud?: number | null;
  scope_snapshot?: { title?: string; price?: number } | null;
  task?: { title?: string } | null;
  company_invoice?: { id: string; invoice_number: string; total_aud: string } | null;
}

type FlowMode = 'unknown' | 'direct' | 'legacy';

export default function PaymentPage() {
  const { id } = useParams<{ id: string }>();
  const [choice, setChoice] = useState<PaymentChoice | null>(null);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [bankData, setBankData] = useState<PlatformBankData | null>(null);
  const [loading, setLoading] = useState(true);
  const [intentError, setIntentError] = useState('');
  const [flowMode, setFlowMode] = useState<FlowMode>('unknown');

  const init = useCallback(async () => {
    // Probe the direct-payment endpoint first. Post-cutover orders → 200; pre-cutover
    // ones throw LEGACY_ESCROW_FLOW (409) and we fall back to the existing flow.
    let mode: FlowMode = 'legacy';
    try {
      await customerApi.get(`/api/v1/orders/${id}/payment-options`);
      mode = 'direct';
    } catch (err) {
      const code = (err as { response?: { data?: { error?: { code?: string } } } })
        .response?.data?.error?.code;
      mode = code === 'LEGACY_ESCROW_FLOW' ? 'legacy' : 'legacy';
    }
    setFlowMode(mode);

    if (mode === 'direct') {
      // DirectPaymentFlow loads its own data; we only need to keep the page chrome
      setLoading(false);
      return;
    }

    // Legacy path — fetch order + platform bank in parallel
    const [orderResult, bankResult] = await Promise.allSettled([
      customerApi.get<{ success: boolean; data: OrderData }>(`/api/v1/orders/${id}`),
      customerApi.get<{ success: boolean; data: PlatformBankData }>('/api/v1/platform/bank-account'),
    ]);

    if (orderResult.status === 'rejected') {
      setIntentError('Could not load order. Please refresh.');
    } else {
      setOrder(orderResult.value.data.data);
    }

    if (bankResult.status === 'fulfilled') {
      setBankData(bankResult.value.data.data);
    }
    // bank failure is silent — credit card still works without bank transfer

    setLoading(false);
  }, [id]);

  useEffect(() => { void init(); }, [init]);

  async function handleSelectCard() {
    setChoice('card');
    if (clientSecret) return; // already fetched
    try {
      // Use invoice payment intent if this is a company order with invoice
      const invoice = order?.company_invoice;
      const res = invoice
        ? await customerApi.post<{ success: boolean; data: { client_secret: string } }>(
            `/api/v1/company-invoices/${invoice.id}/payment/create`,
          )
        : await customerApi.post<{ success: boolean; data: { client_secret: string } }>(
            `/api/v1/orders/${id}/payment/create`,
          );
      setClientSecret(res.data.data.client_secret);
    } catch (err) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setIntentError(e.response?.data?.error?.message ?? 'Could not initialise payment');
      setChoice(null);
    }
  }

  const title = order?.task?.title ?? order?.scope_snapshot?.title ?? 'Complete Payment';
  const price = Number(
    order?.company_invoice?.total_aud ??
    order?.price_aud ??
    order?.scope_snapshot?.price ??
    0,
  );
  const invoice = order?.company_invoice;
  const bankEnabled = bankData?.enabled &&
    (bankData.au_bank?.enabled || bankData.payid?.enabled || bankData.swift?.enabled);

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <Link
        href={`/customer/orders/${id}`}
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors no-underline mb-6"
      >
        <ArrowLeft size={14} /> Back to Order
      </Link>

      <h1 className="font-display font-bold text-2xl text-slate-100 mb-1">Complete Payment</h1>
      <p className="text-sm text-slate-400 mb-8 line-clamp-2">{order ? title : '\u00a0'}</p>

      {loading && (
        <div className="space-y-3">
          <div className="h-[72px] bg-slate-800/60 border border-slate-700/50 rounded-2xl animate-pulse" />
          <div className="h-[72px] bg-slate-800/60 border border-slate-700/50 rounded-2xl animate-pulse" />
        </div>
      )}

      {!loading && intentError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-6 py-8 text-center">
          <p className="text-red-400 text-sm">{intentError}</p>
          <Button className="mt-4" variant="secondary" onClick={() => { void init(); }}>Retry</Button>
        </div>
      )}

      {/* Direct-payment flow (post-cutover orders) — supplier-instructed payment + evidence upload */}
      {!loading && !intentError && flowMode === 'direct' && (
        <DirectPaymentFlow
          kind="order"
          entityId={id}
          backHref={`/customer/orders/${id}`}
          backLabel="Back to order"
        />
      )}

      {!loading && !intentError && flowMode === 'legacy' && !choice && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Choose payment method</p>

          {/* Credit Card */}
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

          {/* Bank Transfer */}
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
            AUD {price.toFixed(2)} · Invoice #{invoice?.invoice_number ?? '—'}
          </p>
        </div>
      )}

      {/* Credit card form */}
      {!loading && flowMode === 'legacy' && choice === 'card' && (
        <div>
          <button
            onClick={() => setChoice(null)}
            className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-6"
          >
            <ArrowLeft size={13} /> Other payment methods
          </button>
          {clientSecret ? (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: STRIPE_APPEARANCE }}>
              <StripeForm orderId={id} price={price} />
            </Elements>
          ) : (
            <div className="space-y-4">
              <div className="h-28 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
              <div className="h-48 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
            </div>
          )}
        </div>
      )}

      {/* Bank transfer flow */}
      {!loading && flowMode === 'legacy' && choice === 'bank' && bankData && invoice && (
        <div>
          <button
            onClick={() => setChoice(null)}
            className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-6"
          >
            <ArrowLeft size={13} /> Other payment methods
          </button>
          <BankTransferFlow
            invoiceId={invoice.id}
            orderId={id}
            invoiceNumber={invoice.invoice_number}
            totalAud={price}
            bankData={bankData}
          />
        </div>
      )}
    </div>
  );
}
