'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Building2,
  Globe2,
  CreditCard,
  Mail,
  Send,
  Info,
  ChevronRight,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Upload,
  X,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';

// ─── Types ───────────────────────────────────────────────────────────────────

type EngagementKind = 'order' | 'tender_invoice';

type PaymentMethodCode =
  | 'STRIPE'
  | 'PAYPAL'
  | 'BANK_TRANSFER_BSB'
  | 'BANK_TRANSFER_SWIFT'
  | 'WISE'
  | 'OTHER';

// Full unmasked methods. The customer is authenticated, has placed the
// order / received the invoice, and needs the supplier's full bank/account
// details to actually transfer funds. Authorization is enforced server-side
// (only the order's customer can hit /payment-options).
interface PaymentMethodsView {
  stripe?: { enabled: boolean; payment_link_url?: string };
  bank_au?: {
    enabled: boolean;
    bsb?: string;
    account_number?: string;
    account_name?: string;
  };
  bank_swift?: {
    enabled: boolean;
    bank_name?: string;
    swift_code?: string;
    iban?: string;
    account_number?: string;
    account_name?: string;
    bank_address?: string;
  };
  paypal?: { enabled: boolean; email?: string; payment_link_url?: string };
  wise?: {
    enabled: boolean;
    email?: string;
    currency?: string;
    payment_link_url?: string;
  };
  other?: { enabled: boolean; description?: string; payment_link_url?: string };
}

interface PaymentOptions {
  amount_due_aud: string;
  currency: 'AUD';
  supplier: { kind: 'user' | 'company'; id: string; name: string };
  payment_methods: PaymentMethodsView;
  current_status: string;
  customer_reported_paid_at: string | null;
  supplier_confirmed_paid_at: string | null;
  payment_dispute_reason: string | null;
}

interface MethodOption {
  code: PaymentMethodCode;
  label: string;
  sub: string;
  Icon: React.ElementType;
  payment_link_url?: string;
  hint?: string;
}

interface DirectPaymentFlowProps {
  kind: EngagementKind;
  /** Order id, or tender-contract invoice id */
  entityId: string;
  /** Where the back-link goes (e.g. /customer/orders/:id) */
  backHref: string;
  backLabel: string;
}

// ─── API endpoints ───────────────────────────────────────────────────────────

function endpoints(kind: EngagementKind, id: string) {
  const base =
    kind === 'order'
      ? `/api/v1/orders/${id}`
      : `/api/v1/tender-contract-invoices/${id}`;
  return {
    options: `${base}/payment-options`,
    report: `${base}/payment/report`,
  };
}

// ─── Method config ───────────────────────────────────────────────────────────

function buildMethodOptions(view: PaymentMethodsView): MethodOption[] {
  const items: MethodOption[] = [];
  if (view.stripe?.enabled) {
    items.push({
      code: 'STRIPE',
      label: 'Stripe (card payment link)',
      sub: 'Pay via the supplier’s Stripe-hosted page',
      Icon: CreditCard,
      ...(view.stripe.payment_link_url ? { payment_link_url: view.stripe.payment_link_url } : {}),
      hint: 'Funds settle directly to the supplier’s Stripe account.',
    });
  }
  if (view.bank_au?.enabled) {
    items.push({
      code: 'BANK_TRANSFER_BSB',
      label: 'AU bank transfer (BSB)',
      sub: 'Domestic AU transfer',
      Icon: Building2,
    });
  }
  if (view.bank_swift?.enabled) {
    items.push({
      code: 'BANK_TRANSFER_SWIFT',
      label: 'International wire (SWIFT)',
      sub: 'For overseas suppliers',
      Icon: Globe2,
    });
  }
  if (view.paypal?.enabled) {
    items.push({
      code: 'PAYPAL',
      label: 'PayPal',
      sub: view.paypal.email ? `Send to ${view.paypal.email}` : 'PayPal email payment',
      Icon: Mail,
      ...(view.paypal.payment_link_url ? { payment_link_url: view.paypal.payment_link_url } : {}),
    });
  }
  if (view.wise?.enabled) {
    items.push({
      code: 'WISE',
      label: 'Wise',
      sub: view.wise.email ? `Send to ${view.wise.email}` : 'Wise transfer',
      Icon: Send,
      ...(view.wise.payment_link_url ? { payment_link_url: view.wise.payment_link_url } : {}),
    });
  }
  if (view.other?.enabled) {
    items.push({
      code: 'OTHER',
      label: 'Other',
      sub: 'Custom payment instructions',
      Icon: Info,
      ...(view.other.payment_link_url ? { payment_link_url: view.other.payment_link_url } : {}),
    });
  }
  return items;
}

// ─── Copy field ──────────────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  function copy() {
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
        <span className="flex-1 font-mono text-sm text-slate-200 select-all break-all">{value}</span>
        <button onClick={copy} className="text-slate-500 hover:text-teal-400 transition-colors p-0.5">
          <Copy size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DirectPaymentFlow({ kind, entityId, backHref, backLabel }: DirectPaymentFlowProps) {
  const ep = endpoints(kind, entityId);
  const [opts, setOpts] = useState<PaymentOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethodCode | null>(null);
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await customerApi.get<{ success: boolean; data: PaymentOptions }>(ep.options);
      setOpts(res.data.data);
      // Default reference to entity id prefix for convenience
      setReference((prev) => prev || (kind === 'order' ? `ORD-${entityId.slice(-8)}` : `INV-${entityId.slice(-8)}`));
      setAmount((prev) => prev || res.data.data.amount_due_aud);
    } catch (err) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setLoadError(e.response?.data?.error?.message ?? 'Could not load payment options.');
    } finally {
      setLoading(false);
    }
  }, [ep.options, kind, entityId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const methodOptions = opts ? buildMethodOptions(opts.payment_methods) : [];
  const selectedMethod = method ? methodOptions.find((m) => m.code === method) : null;

  async function handleSubmit() {
    if (!method) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('payment_method', method);
      fd.append('payment_amount_aud', amount);
      if (reference) fd.append('payment_reference', reference);
      if (evidenceFile) fd.append('file', evidenceFile);
      await customerApi.post(ep.report, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Payment reported. Awaiting supplier confirmation.');
      await refresh();
    } catch (err) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Could not submit payment report.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-20 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
        <div className="h-32 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (loadError || !opts) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-6 py-8 text-center">
        <p className="text-red-400 text-sm">{loadError ?? 'Could not load payment options.'}</p>
        <Button className="mt-4" variant="secondary" onClick={() => { setLoading(true); void refresh(); }}>
          Retry
        </Button>
      </div>
    );
  }

  const total = Number(opts.amount_due_aud);
  const isReported = opts.current_status === 'PAYMENT_REPORTED';
  const isConfirmed =
    opts.current_status === 'PAYMENT_CONFIRMED' ||
    opts.current_status === 'PAID' ||
    opts.supplier_confirmed_paid_at !== null;
  const wasDisputed = !!opts.payment_dispute_reason;

  // Already confirmed → done state
  if (isConfirmed) {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="w-16 h-16 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center mx-auto">
          <CheckCircle2 size={28} className="text-teal-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-100">Payment confirmed</h2>
          <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">
            The supplier has confirmed receipt of your payment. The engagement can now proceed.
          </p>
        </div>
        <Button asChild size="lg" fullWidth>
          <a href={backHref}>{backLabel}</a>
        </Button>
      </div>
    );
  }

  // Reported, awaiting supplier confirmation
  if (isReported) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-5 flex items-start gap-3">
          <Clock size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-300">Awaiting supplier confirmation</p>
            <p className="mt-1 text-xs text-amber-300/80">
              You reported payment on{' '}
              {opts.customer_reported_paid_at
                ? new Date(opts.customer_reported_paid_at).toLocaleString('en-AU')
                : '—'}
              . The supplier will confirm receipt and the engagement will proceed automatically.
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-500 text-center">
          If the supplier rejects your evidence you&apos;ll be able to resubmit here.
        </p>
        <Button asChild variant="secondary" size="lg" fullWidth>
          <a href={backHref}>{backLabel}</a>
        </Button>
      </div>
    );
  }

  // No methods available
  if (methodOptions.length === 0) {
    return (
      <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-5 flex items-start gap-3">
        <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-300">No payment methods available</p>
          <p className="mt-1 text-xs text-amber-300/80">
            The supplier ({opts.supplier.name}) hasn&apos;t configured payment instructions yet.
            Please contact them through the engagement chat to arrange payment.
          </p>
        </div>
      </div>
    );
  }

  // Method selected → instructions + report form
  if (selectedMethod) {
    return (
      <div className="space-y-5">
        <button
          onClick={() => setMethod(null)}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300"
        >
          <ArrowLeft size={13} /> Choose a different method
        </button>

        {/* Amount banner */}
        <div className="rounded-2xl bg-teal-500/10 border border-teal-500/30 px-5 py-4">
          <p className="text-xs text-teal-400/70 font-medium mb-1">Amount to pay</p>
          <p className="text-2xl font-bold text-teal-300">AUD {total.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">Pay this exact amount to {opts.supplier.name}.</p>
        </div>

        {/* Dispute banner if previous evidence rejected */}
        {wasDisputed && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300">Previous evidence was rejected</p>
              <p className="mt-1 text-xs text-red-300/80">{opts.payment_dispute_reason}</p>
              <p className="mt-1 text-xs text-red-300/60">
                Please review the supplier&apos;s feedback and resubmit below.
              </p>
            </div>
          </div>
        )}

        {/* Instructions card — method-specific */}
        <MethodInstructions
          method={selectedMethod}
          methods={opts.payment_methods}
          reference={reference}
          setReference={setReference}
        />

        <div className="text-xs text-slate-500 bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3 leading-relaxed">
          <span className="text-slate-400 font-medium">Direct payment.</span> The platform does
          not process or hold funds. Pay {opts.supplier.name} using the details above, then
          report your payment below so they can confirm receipt and start work.
        </div>

        {/* Report form */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Report your payment</h3>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Payment reference / transaction ID</span>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="mt-1.5 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-teal-500"
              placeholder="Bank transaction ID or your own reference"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Amount paid (AUD)</span>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1.5 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-teal-500"
            />
          </label>

          <div>
            <span className="text-xs font-medium text-slate-400 block mb-1.5">
              Evidence (PDF, JPG, PNG &middot; max 10 MB)
            </span>
            <label className="block cursor-pointer">
              <div
                className={`border-2 border-dashed rounded-xl px-4 py-6 text-center transition-colors ${
                  evidenceFile ? 'border-teal-500/50 bg-teal-500/5' : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                {evidenceFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <CheckCircle2 size={16} className="text-teal-400" />
                    <span className="text-sm text-slate-200">{evidenceFile.name}</span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setEvidenceFile(null);
                      }}
                      className="text-slate-500 hover:text-red-400"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload size={18} className="mx-auto text-slate-600 mb-2" />
                    <p className="text-sm text-slate-400">Click to upload</p>
                    <p className="text-xs text-slate-600 mt-1">Bank receipt, transaction screenshot, etc.</p>
                  </>
                )}
              </div>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <Button
            size="lg"
            fullWidth
            disabled={!amount || submitting}
            loading={submitting}
            onClick={() => { void handleSubmit(); }}
          >
            I have paid &mdash; submit for confirmation
          </Button>
        </div>
      </div>
    );
  }

  // Method picker
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 px-5 py-4">
        <p className="text-xs text-slate-500 uppercase tracking-wider">Pay supplier</p>
        <p className="text-sm font-semibold text-slate-100 mt-0.5">{opts.supplier.name}</p>
        <p className="mt-2 text-2xl font-bold text-teal-300">AUD {total.toFixed(2)}</p>
      </div>

      {wasDisputed && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">Previous evidence was rejected</p>
            <p className="mt-1 text-xs text-red-300/80">{opts.payment_dispute_reason}</p>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500 uppercase tracking-wider">Choose a payment method</p>

      <div className="space-y-2">
        {methodOptions.map(({ code, label, sub, Icon }) => (
          <button
            key={code}
            onClick={() => setMethod(code)}
            className="w-full flex items-center gap-4 px-5 py-4 bg-slate-900 border border-slate-800 hover:border-teal-500/50 rounded-2xl text-left transition-colors group"
          >
            <div className="p-2.5 bg-slate-800 group-hover:bg-teal-500/20 rounded-xl transition-colors">
              <Icon size={18} className="text-slate-400 group-hover:text-teal-400 transition-colors" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-200">{label}</p>
              <p className="text-xs text-slate-500">{sub}</p>
            </div>
            <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-300 transition-colors" />
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-slate-600 pt-2">
        Payments go directly to the supplier &mdash; the platform does not handle funds.
      </p>
    </div>
  );
}

// ─── Method-specific instructions panel ─────────────────────────────────────

function MethodInstructions({
  method,
  methods,
  reference,
  setReference,
}: {
  method: MethodOption;
  methods: PaymentMethodsView;
  reference: string;
  setReference: (s: string) => void;
}) {
  const referenceField = (
    <div>
      <p className="text-xs text-slate-500 mb-1">
        Payment reference <span className="text-amber-400">— include this</span>
      </p>
      <div className="flex items-center gap-2 bg-slate-800 border border-amber-500/30 rounded-xl px-3 py-2">
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="flex-1 bg-transparent font-mono text-sm text-amber-300 focus:outline-none"
        />
        <button
          onClick={() => {
            void navigator.clipboard.writeText(reference);
            toast.success('Reference copied');
          }}
          className="text-slate-500 hover:text-amber-400"
        >
          <Copy size={13} />
        </button>
      </div>
    </div>
  );

  if (method.code === 'STRIPE') {
    return (
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        {method.payment_link_url ? (
          <>
            <p className="text-sm text-slate-300">
              The supplier accepts Stripe payments via this link. Clicking the button below will
              open Stripe&apos;s hosted checkout in a new tab.
            </p>
            <Button asChild variant="primary" size="md" fullWidth>
              <a href={method.payment_link_url} target="_blank" rel="noopener noreferrer">
                Open Stripe payment page
                <ExternalLink size={13} />
              </a>
            </Button>
            <p className="text-xs text-slate-500">
              After paying on Stripe, return here to record the transaction reference and upload
              your Stripe receipt as evidence.
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-500">
            The supplier accepts Stripe but hasn&apos;t shared a payment-link URL yet. Contact them via
            the engagement chat to obtain one.
          </p>
        )}
        {referenceField}
      </div>
    );
  }

  if (method.code === 'BANK_TRANSFER_BSB') {
    const au = methods.bank_au;
    const hasAny = au?.account_name || au?.bsb || au?.account_number;
    return (
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        <p className="text-sm text-slate-300">
          Use the supplier&apos;s AU bank-transfer details below. Click any field to copy.
        </p>
        {hasAny ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {au?.account_name && <CopyField label="Account name" value={au.account_name} />}
            {au?.bsb && <CopyField label="BSB" value={au.bsb} />}
            {au?.account_number && (
              <CopyField label="Account number" value={au.account_number} />
            )}
          </div>
        ) : (
          <p className="text-xs text-amber-400">
            The supplier hasn&apos;t entered AU bank details yet. Contact them via the engagement
            chat before transferring.
          </p>
        )}
        {referenceField}
      </div>
    );
  }

  if (method.code === 'BANK_TRANSFER_SWIFT') {
    const sw = methods.bank_swift;
    const hasAny =
      sw?.bank_name || sw?.swift_code || sw?.iban || sw?.account_number ||
      sw?.account_name || sw?.bank_address;
    return (
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        <p className="text-sm text-slate-300">
          International wire details. Click any field to copy. SWIFT transfers typically take
          2&ndash;5 business days.
        </p>
        {hasAny ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sw?.account_name && <CopyField label="Account name" value={sw.account_name} />}
            {sw?.bank_name && <CopyField label="Bank name" value={sw.bank_name} />}
            {sw?.swift_code && <CopyField label="SWIFT / BIC" value={sw.swift_code} />}
            {sw?.iban && <CopyField label="IBAN" value={sw.iban} />}
            {sw?.account_number && (
              <CopyField label="Account number" value={sw.account_number} />
            )}
            {sw?.bank_address && (
              <div className="sm:col-span-2">
                <CopyField label="Bank address" value={sw.bank_address} />
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-amber-400">
            The supplier hasn&apos;t entered SWIFT details yet. Contact them via the engagement
            chat before transferring.
          </p>
        )}
        {referenceField}
      </div>
    );
  }

  if (method.code === 'PAYPAL') {
    const pp = methods.paypal;
    return (
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        {method.payment_link_url && (
          <>
            <p className="text-sm text-slate-300">Pay via the supplier&apos;s PayPal.me link:</p>
            <Button asChild variant="primary" size="md" fullWidth>
              <a href={method.payment_link_url} target="_blank" rel="noopener noreferrer">
                Open PayPal
                <ExternalLink size={13} />
              </a>
            </Button>
          </>
        )}
        {pp?.email && <CopyField label="PayPal email" value={pp.email} />}
        {!method.payment_link_url && !pp?.email && (
          <p className="text-xs text-amber-400">
            The supplier hasn&apos;t set a PayPal email or link yet. Contact them via the
            engagement chat before paying.
          </p>
        )}
        {referenceField}
      </div>
    );
  }

  if (method.code === 'WISE') {
    const w = methods.wise;
    return (
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        {method.payment_link_url && (
          <>
            <p className="text-sm text-slate-300">Pay via the supplier&apos;s Wise link:</p>
            <Button asChild variant="primary" size="md" fullWidth>
              <a href={method.payment_link_url} target="_blank" rel="noopener noreferrer">
                Open Wise
                <ExternalLink size={13} />
              </a>
            </Button>
          </>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {w?.email && <CopyField label="Wise email" value={w.email} />}
          {w?.currency && <CopyField label="Currency" value={w.currency} />}
        </div>
        {!method.payment_link_url && !w?.email && (
          <p className="text-xs text-amber-400">
            The supplier hasn&apos;t set a Wise email or link yet. Contact them via the
            engagement chat before paying.
          </p>
        )}
        {referenceField}
      </div>
    );
  }

  // OTHER
  const other = methods.other;
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
      {other?.description && (
        <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Instructions from supplier</p>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{other.description}</p>
        </div>
      )}
      {method.payment_link_url && (
        <Button asChild variant="primary" size="md" fullWidth>
          <a href={method.payment_link_url} target="_blank" rel="noopener noreferrer">
            Open payment link
            <ExternalLink size={13} />
          </a>
        </Button>
      )}
      {referenceField}
    </div>
  );
}
