'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Globe2,
  Mail,
  Send as SendIcon,
  CreditCard,
  Info,
  Save,
  User as UserIcon,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import { namespacedPath } from '@/lib/namespace';
import { getUser } from '@/lib/customer-auth';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PaymentMethods {
  stripe?: { enabled?: boolean; payment_link_url?: string };
  bank_au?: {
    enabled?: boolean;
    bsb?: string;
    account_number?: string;
    account_name?: string;
  };
  bank_swift?: {
    enabled?: boolean;
    bank_name?: string;
    swift_code?: string;
    iban?: string;
    account_number?: string;
    account_name?: string;
    bank_address?: string;
  };
  paypal?: { enabled?: boolean; email?: string; payment_link_url?: string };
  wise?: { enabled?: boolean; email?: string; currency?: string; payment_link_url?: string };
  other?: { enabled?: boolean; description?: string; payment_link_url?: string };
}

interface Owner {
  kind: 'user' | 'company';
  id: string;
  display_name: string;
}

interface MyPaymentMethodsResponse {
  owner: Owner;
  methods: PaymentMethods;
}

const inputCls =
  'w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none disabled:opacity-50';

// ─── Component ───────────────────────────────────────────────────────────────

export default function PaymentMethodsSettingsPage() {
  // Mounted at /settings/payment-methods (top-level), and re-exported at
  // /contractor/payment-instructions and /company/payment-instructions.
  // Resolve the back-link target from the caller's chrome so they don't
  // get bounced to /invoices when coming from a sidebar.
  const pathname = usePathname();
  const invoicesBase = namespacedPath(pathname, 'invoices');

  // Guard against customer accounts hitting the page directly. The form
  // on this page configures payment rails the supplier exposes to
  // customers — irrelevant for customer-side accounts, who pay each
  // supplier directly per the invoice they receive. Render a friendly
  // not-applicable card instead of the form (and skip the API call,
  // which would fail with NOT_A_PROVIDER for customer accounts).
  const [accountType, setAccountType] = useState<string | null>(null);
  useEffect(() => {
    const u = getUser();
    setAccountType(u?.account_type ?? null);
  }, []);
  const isCustomer = accountType === 'CUSTOMER';

  const [data, setData] = useState<PaymentMethods>({});
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await customerApi.get<{ success: boolean; data: MyPaymentMethodsResponse }>(
        '/api/v1/providers/me/payment-methods',
      );
      setOwner(res.data.data?.owner ?? null);
      setData(res.data.data?.methods ?? {});
    } catch {
      // toast handled
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Skip the supplier-only fetch for customer accounts — there's nothing
    // to load and the API would 403 us anyway.
    if (accountType === null) return; // still resolving from localStorage
    if (isCustomer) {
      setLoading(false);
      return;
    }
    void fetchData();
  }, [fetchData, accountType, isCustomer]);

  async function handleSave() {
    setSaving(true);
    try {
      await customerApi.put('/api/v1/providers/me/payment-methods', data);
      toast.success('Payment instructions saved.');
      void fetchData();
    } catch {
      // toast handled
    } finally {
      setSaving(false);
    }
  }

  function setMethod<K extends keyof PaymentMethods>(
    key: K,
    patch: Partial<NonNullable<PaymentMethods[K]>>,
  ) {
    setData((d) => ({ ...d, [key]: { ...(d[key] ?? {}), ...patch } } as PaymentMethods));
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-4">
        <div className="h-8 w-1/2 bg-slate-900 rounded animate-pulse" />
        <div className="h-64 bg-slate-900 rounded-2xl animate-pulse" />
      </div>
    );
  }

  // Customer accounts get the not-applicable card. We keep the back-to-
  // invoices link consistent with the namespaced path so the chrome
  // matches what the customer expects.
  if (isCustomer) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Link
          href="/customer/profile"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 no-underline"
        >
          <ArrowLeft size={12} />
          Back to profile
        </Link>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <h1 className="font-display font-bold text-lg text-slate-100 mb-1.5">
                Payment methods aren&apos;t set up here for customer accounts
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                This page is for suppliers — it configures the bank, Stripe,
                PayPal or Wise rails their customers use to pay them directly.
                As a customer you don&apos;t need to set anything up here. You pay
                each supplier per the invoice they raise; their invoice will
                include their own payment instructions.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/customer/profile"
                  className="inline-flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 no-underline transition-colors"
                >
                  Go to my profile
                </Link>
                <Link
                  href="/invoices"
                  className="inline-flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:border-slate-600 text-slate-200 no-underline transition-colors"
                >
                  View my invoices
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div>
        <Link
          href={invoicesBase}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 no-underline"
        >
          <ArrowLeft size={12} />
          Back to invoices
        </Link>
        <h1 className="mt-3 font-display font-bold text-2xl text-slate-100">
          Payment instructions
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Configure how clients pay you directly. Enabled methods appear on the
          invoice PDF and the customer&apos;s payment page. The platform never
          handles funds — payments go straight to the account you set up below.
        </p>
      </div>

      {/* ── Owner banner ─────────────────────────────────────────────────── */}
      {owner && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 flex items-center gap-3">
          {owner.kind === 'company' ? (
            <Building2 size={16} className="text-teal-400 shrink-0" />
          ) : (
            <UserIcon size={16} className="text-teal-400 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 uppercase tracking-wider">
              Editing instructions for
            </p>
            <p className="text-sm font-semibold text-slate-100 truncate">
              {owner.display_name}
              <span className="ml-2 text-xs font-normal text-slate-500">
                {owner.kind === 'company' ? 'Consulting company' : 'Personal'}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* ── Bank AU ──────────────────────────────────────────────────────── */}
      <MethodCard
        title="Bank Transfer (Australia)"
        icon={Building2}
        enabled={!!data.bank_au?.enabled}
        onToggle={(v) => setMethod('bank_au', { enabled: v })}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account name">
            <input
              className={inputCls}
              value={data.bank_au?.account_name ?? ''}
              disabled={!data.bank_au?.enabled}
              onChange={(e) => setMethod('bank_au', { account_name: e.target.value })}
            />
          </Field>
          <Field label="BSB" help="6 digits, optional hyphen (e.g. 062-001)">
            <input
              className={inputCls}
              value={data.bank_au?.bsb ?? ''}
              disabled={!data.bank_au?.enabled}
              placeholder="000-000"
              onChange={(e) => setMethod('bank_au', { bsb: e.target.value })}
            />
          </Field>
          <Field label="Account number">
            <input
              className={inputCls}
              value={data.bank_au?.account_number ?? ''}
              disabled={!data.bank_au?.enabled}
              onChange={(e) =>
                setMethod('bank_au', { account_number: e.target.value })
              }
            />
          </Field>
        </div>
      </MethodCard>

      {/* ── SWIFT ────────────────────────────────────────────────────────── */}
      <MethodCard
        title="International Wire (SWIFT)"
        icon={Globe2}
        enabled={!!data.bank_swift?.enabled}
        onToggle={(v) => setMethod('bank_swift', { enabled: v })}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bank name">
            <input
              className={inputCls}
              value={data.bank_swift?.bank_name ?? ''}
              disabled={!data.bank_swift?.enabled}
              onChange={(e) =>
                setMethod('bank_swift', { bank_name: e.target.value })
              }
            />
          </Field>
          <Field label="SWIFT/BIC" help="8 or 11 alphanumerics">
            <input
              className={inputCls}
              value={data.bank_swift?.swift_code ?? ''}
              disabled={!data.bank_swift?.enabled}
              onChange={(e) =>
                setMethod('bank_swift', {
                  swift_code: e.target.value.toUpperCase(),
                })
              }
            />
          </Field>
          <Field label="IBAN (if applicable)">
            <input
              className={inputCls}
              value={data.bank_swift?.iban ?? ''}
              disabled={!data.bank_swift?.enabled}
              onChange={(e) => setMethod('bank_swift', { iban: e.target.value })}
            />
          </Field>
          <Field label="Account number">
            <input
              className={inputCls}
              value={data.bank_swift?.account_number ?? ''}
              disabled={!data.bank_swift?.enabled}
              onChange={(e) =>
                setMethod('bank_swift', { account_number: e.target.value })
              }
            />
          </Field>
          <Field label="Account name">
            <input
              className={inputCls}
              value={data.bank_swift?.account_name ?? ''}
              disabled={!data.bank_swift?.enabled}
              onChange={(e) =>
                setMethod('bank_swift', { account_name: e.target.value })
              }
            />
          </Field>
          <Field label="Bank address">
            <input
              className={inputCls}
              value={data.bank_swift?.bank_address ?? ''}
              disabled={!data.bank_swift?.enabled}
              onChange={(e) =>
                setMethod('bank_swift', { bank_address: e.target.value })
              }
            />
          </Field>
        </div>
      </MethodCard>

      {/* ── Stripe Payment Link ──────────────────────────────────────────── */}
      <MethodCard
        title="Stripe payment link"
        icon={CreditCard}
        enabled={!!data.stripe?.enabled}
        onToggle={(v) => setMethod('stripe', { enabled: v })}
      >
        <Field
          label="Stripe-hosted payment link URL"
          help="Create a Payment Link in your Stripe Dashboard (Products → Payment links). Funds settle directly to your Stripe account — the platform is not involved."
        >
          <div className="flex items-center gap-2">
            <input
              type="url"
              className={inputCls}
              placeholder="https://buy.stripe.com/..."
              value={data.stripe?.payment_link_url ?? ''}
              disabled={!data.stripe?.enabled}
              onChange={(e) => setMethod('stripe', { payment_link_url: e.target.value })}
            />
            {data.stripe?.payment_link_url && (
              <a
                href={data.stripe.payment_link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-teal-400 shrink-0"
                title="Open link"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </Field>
      </MethodCard>

      {/* ── PayPal ───────────────────────────────────────────────────────── */}
      <MethodCard
        title="PayPal"
        icon={Mail}
        enabled={!!data.paypal?.enabled}
        onToggle={(v) => setMethod('paypal', { enabled: v })}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="PayPal email">
            <input
              type="email"
              className={inputCls}
              value={data.paypal?.email ?? ''}
              disabled={!data.paypal?.enabled}
              onChange={(e) => setMethod('paypal', { email: e.target.value })}
            />
          </Field>
          <Field label="PayPal.me link (optional)" help="e.g. https://paypal.me/yourhandle">
            <input
              type="url"
              className={inputCls}
              placeholder="https://paypal.me/..."
              value={data.paypal?.payment_link_url ?? ''}
              disabled={!data.paypal?.enabled}
              onChange={(e) => setMethod('paypal', { payment_link_url: e.target.value })}
            />
          </Field>
        </div>
      </MethodCard>

      {/* ── Wise ─────────────────────────────────────────────────────────── */}
      <MethodCard
        title="Wise"
        icon={SendIcon}
        enabled={!!data.wise?.enabled}
        onToggle={(v) => setMethod('wise', { enabled: v })}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wise email">
            <input
              type="email"
              className={inputCls}
              value={data.wise?.email ?? ''}
              disabled={!data.wise?.enabled}
              onChange={(e) => setMethod('wise', { email: e.target.value })}
            />
          </Field>
          <Field label="Preferred currency" help="ISO 3-letter, e.g. AUD">
            <input
              className={inputCls}
              maxLength={3}
              value={data.wise?.currency ?? ''}
              disabled={!data.wise?.enabled}
              onChange={(e) =>
                setMethod('wise', { currency: e.target.value.toUpperCase() })
              }
            />
          </Field>
          <div className="col-span-2">
            <Field label="Wise payment link (optional)" help="Wise.com → Request → copy link">
              <input
                type="url"
                className={inputCls}
                placeholder="https://wise.com/pay/..."
                value={data.wise?.payment_link_url ?? ''}
                disabled={!data.wise?.enabled}
                onChange={(e) => setMethod('wise', { payment_link_url: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </MethodCard>

      {/* ── Other ────────────────────────────────────────────────────────── */}
      <MethodCard
        title="Other"
        icon={Info}
        enabled={!!data.other?.enabled}
        onToggle={(v) => setMethod('other', { enabled: v })}
      >
        <Field
          label="Free-form payment instructions"
          help="Anything not covered above (e.g. crypto, cheque, in-person)"
        >
          <textarea
            className={inputCls}
            rows={3}
            value={data.other?.description ?? ''}
            disabled={!data.other?.enabled}
            onChange={(e) => setMethod('other', { description: e.target.value })}
          />
        </Field>
        <div className="mt-3">
          <Field label="Payment link (optional)">
            <input
              type="url"
              className={inputCls}
              placeholder="https://..."
              value={data.other?.payment_link_url ?? ''}
              disabled={!data.other?.enabled}
              onChange={(e) => setMethod('other', { payment_link_url: e.target.value })}
            />
          </Field>
        </div>
      </MethodCard>

      <div className="flex items-center justify-end gap-2 sticky bottom-4">
        <Button variant="primary" size="md" onClick={() => void handleSave()} loading={saving}>
          <Save size={14} />
          Save payment instructions
        </Button>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MethodCard({
  title,
  icon: Icon,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ElementType;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Icon size={16} className={enabled ? 'text-teal-400' : 'text-slate-500'} />
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <span
            className={`text-xs font-medium ${enabled ? 'text-teal-300' : 'text-slate-500'}`}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
          <input
            type="checkbox"
            className="sr-only peer"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <div className="w-9 h-5 rounded-full bg-slate-700 peer-checked:bg-teal-500 transition-colors relative">
            <div
              className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform"
              style={{ transform: enabled ? 'translateX(16px)' : 'translateX(0)' }}
            />
          </div>
        </label>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
  help,
}: {
  label: string;
  children: React.ReactNode;
  help?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      {children}
      {help && <span className="text-[11px] text-slate-500">{help}</span>}
    </label>
  );
}
