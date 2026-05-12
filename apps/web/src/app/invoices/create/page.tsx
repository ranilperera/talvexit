'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Send as SendIcon,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import { namespacedPath } from '@/lib/namespace';
import RecipientPicker, {
  type RecipientSelection,
} from '@/components/invoices/RecipientPicker';
import { getUser } from '@/lib/customer-auth';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LineItem {
  description: string;
  quantity: number;
  unit_amount_cents: number;
}

const PAYMENT_METHODS = [
  { value: 'BANK_TRANSFER_BSB', label: 'Bank Transfer (AU BSB)' },
  { value: 'BANK_TRANSFER_SWIFT', label: 'Bank Transfer (SWIFT)' },
  { value: 'PAYPAL', label: 'PayPal' },
  { value: 'WISE', label: 'Wise' },
  { value: 'STRIPE', label: 'Stripe / Card' },
  { value: 'OTHER', label: 'Other' },
] as const;

const inputCls =
  'w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none';

function fmtMoney(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CreateInvoicePage() {
  const router = useRouter();
  // Mounted at /invoices/create, /contractor/invoices/create, and
  // /company/invoices/create. Resolve the namespace once and reuse for
  // every internal link / redirect so the user stays in their chrome.
  const pathname = usePathname();
  const invoicesBase = namespacedPath(pathname, 'invoices');
  const paymentMethodsBase = namespacedPath(pathname, 'payment-methods');

  // Customer accounts never issue invoices — the form on this page raises an
  // invoice from the current user (the supplier) to a recipient. Redirect
  // customers back to the listing where they can view received invoices.
  const [accountType, setAccountType] = useState<string | null>(null);
  useEffect(() => {
    setAccountType(getUser()?.account_type ?? null);
  }, []);
  const isCustomer = accountType === 'CUSTOMER';

  const [recipientType, setRecipientType] = useState<'user' | 'company'>('user');
  const [recipient, setRecipient] = useState<RecipientSelection | null>(null);
  const [taskId, setTaskId] = useState('');
  const [orderId, setOrderId] = useState('');

  const [items, setItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unit_amount_cents: 0 },
  ]);
  const [currency, setCurrency] = useState('AUD');
  const [supplierAbn, setSupplierAbn] = useState('');
  const [supplierGstRegistered, setSupplierGstRegistered] = useState(true);
  const [taxRatePct, setTaxRatePct] = useState(10);
  const [dueDate, setDueDate] = useState('');
  const [agreedPaymentMethod, setAgreedPaymentMethod] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');

  const [savingDraft, setSavingDraft] = useState(false);
  const [sending, setSending] = useState(false);

  // ── Totals (live preview) ────────────────────────────────────────────────

  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (sum, it) => sum + Math.round(it.unit_amount_cents * (it.quantity || 0)),
      0,
    );
    const taxRate = supplierGstRegistered ? taxRatePct / 100 : 0;
    const tax = Math.round(subtotal * taxRate);
    const total = subtotal + tax;
    return { subtotal, tax, total, taxRate };
  }, [items, supplierGstRegistered, taxRatePct]);

  // ── Validation ───────────────────────────────────────────────────────────

  const errors = useMemo(() => {
    const e: string[] = [];
    if (!recipient) e.push('Pick a recipient.');
    if (items.length === 0) e.push('Add at least one line item.');
    items.forEach((it, i) => {
      if (!it.description.trim()) e.push(`Line ${i + 1}: description required.`);
      if (it.quantity <= 0) e.push(`Line ${i + 1}: quantity must be > 0.`);
      if (it.unit_amount_cents < 0) e.push(`Line ${i + 1}: unit price invalid.`);
    });
    if (supplierAbn && !/^\d{11}$/.test(supplierAbn))
      e.push('ABN must be exactly 11 digits, no spaces.');
    return e;
  }, [recipient, items, supplierAbn]);

  // ── Item helpers ─────────────────────────────────────────────────────────

  function addItem() {
    setItems((prev) => [
      ...prev,
      { description: '', quantity: 1, unit_amount_cents: 0 },
    ]);
  }

  function updateItem(i: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function removeItem(i: number) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  function buildPayload() {
    return {
      ...(recipient?.type === 'user'
        ? { to_user_id: recipient.id }
        : recipient?.type === 'company'
          ? { to_company_id: recipient.id }
          : {}),
      ...(taskId.trim() && { task_id: taskId.trim() }),
      ...(orderId.trim() && { order_id: orderId.trim() }),
      line_items: items.map((it) => ({
        description: it.description.trim(),
        quantity: Number(it.quantity),
        unit_amount_cents: Math.round(Number(it.unit_amount_cents)),
      })),
      currency: currency.toUpperCase(),
      supplier_gst_registered: supplierGstRegistered,
      ...(supplierAbn.trim() && { supplier_abn: supplierAbn.trim() }),
      ...(supplierGstRegistered && { tax_rate: taxRatePct / 100 }),
      ...(dueDate && { due_date: new Date(dueDate).toISOString() }),
      ...(agreedPaymentMethod && { agreed_payment_method: agreedPaymentMethod }),
      ...(notes.trim() && { notes: notes.trim() }),
      ...(terms.trim() && { terms: terms.trim() }),
    };
  }

  async function handleSaveDraft() {
    if (errors.length > 0) {
      toast.error(errors[0] ?? 'Please fix the form errors first.');
      return;
    }
    setSavingDraft(true);
    try {
      const res = await customerApi.post<{
        success: boolean;
        data: { id: string };
      }>('/api/v1/service-invoices', buildPayload());
      toast.success('Draft saved.');
      router.push(`${invoicesBase}/${res.data.data.id}`);
    } catch {
      // toast handled
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleSendNow() {
    if (errors.length > 0) {
      toast.error(errors[0] ?? 'Please fix the form errors first.');
      return;
    }
    setSending(true);
    try {
      // Two-step: create draft, then send
      const created = await customerApi.post<{
        success: boolean;
        data: { id: string };
      }>('/api/v1/service-invoices', buildPayload());
      const id = created.data.data.id;
      await customerApi.post(`/api/v1/service-invoices/${id}/send`);
      toast.success('Invoice sent.');
      router.push(`${invoicesBase}/${id}`);
    } catch {
      // toast handled
      setSending(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  // Customer guard — render a friendly explanation rather than the form.
  if (isCustomer) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Link
          href={invoicesBase}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 no-underline"
        >
          <ArrowLeft size={12} />
          Back to invoices
        </Link>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <h1 className="font-display font-bold text-lg text-slate-100 mb-1.5">
                Customers don&apos;t issue invoices on TalvexIT
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                Invoices are raised by the service provider in their own name and
                ABN once an engagement&apos;s deliverables are accepted — you receive
                the invoice and pay the provider directly per the instructions
                on it. There&apos;s nothing for you to issue from this side.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href={invoicesBase}
                  className="inline-flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 no-underline transition-colors"
                >
                  View received invoices
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div>
        <Link
          href={invoicesBase}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 no-underline"
        >
          <ArrowLeft size={12} />
          Back to invoices
        </Link>
        <h1 className="mt-3 font-display font-bold text-2xl text-slate-100">
          New invoice
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Bill a client for completed work. Configure your{' '}
          <Link
            href={paymentMethodsBase}
            className="text-teal-400 hover:text-teal-300 underline"
          >
            payment methods
          </Link>{' '}
          first so they appear on the invoice.
        </p>
      </div>

      {/* ── Recipient ───────────────────────────────────────────────────── */}
      <Section title="Recipient">
        <div className="flex items-center gap-3 mb-4">
          <RecipientTab
            active={recipientType === 'user'}
            onClick={() => {
              setRecipientType('user');
              if (recipient && recipient.type !== 'user') setRecipient(null);
            }}
            label="Individual"
          />
          <RecipientTab
            active={recipientType === 'company'}
            onClick={() => {
              setRecipientType('company');
              if (recipient && recipient.type !== 'company') setRecipient(null);
            }}
            label="Company"
          />
        </div>
        <Field
          label={recipientType === 'company' ? 'Client company' : 'Client'}
          help={
            recipientType === 'company'
              ? 'Search a company you have invoiced or worked with before — or enter a company ID manually.'
              : 'Search a person from your past orders or invoices — or enter a user ID manually.'
          }
        >
          <RecipientPicker
            forceType={recipientType}
            selected={recipient}
            onSelect={setRecipient}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Linked task ID (optional)">
            <input
              className={inputCls}
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              placeholder="task-id..."
            />
          </Field>
          <Field label="Linked order ID (optional)" help="If you delivered an order">
            <input
              className={inputCls}
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="order-id..."
            />
          </Field>
        </div>
      </Section>

      {/* ── Line items ──────────────────────────────────────────────────── */}
      <Section title="Line items">
        <div className="space-y-2">
          <div className="hidden md:grid grid-cols-[1fr_80px_140px_140px_30px] gap-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold px-1">
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit ({currency})</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          {items.map((it, i) => {
            const amount = Math.round(it.unit_amount_cents * (it.quantity || 0));
            return (
              <div
                key={i}
                className="grid grid-cols-[1fr_80px_140px_140px_30px] gap-2 items-start"
              >
                <input
                  className={inputCls}
                  placeholder="Service description"
                  value={it.description}
                  onChange={(e) => updateItem(i, { description: e.target.value })}
                />
                <input
                  className={`${inputCls} text-right`}
                  type="number"
                  min="0"
                  step="1"
                  value={it.quantity}
                  onChange={(e) =>
                    updateItem(i, { quantity: Number(e.target.value) || 0 })
                  }
                />
                <input
                  className={`${inputCls} text-right tabular-nums`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={(it.unit_amount_cents / 100).toString()}
                  onChange={(e) =>
                    updateItem(i, {
                      unit_amount_cents: Math.round(
                        (Number(e.target.value) || 0) * 100,
                      ),
                    })
                  }
                />
                <div className="text-right text-sm text-slate-300 tabular-nums py-2">
                  {fmtMoney(amount, currency)}
                </div>
                <button
                  type="button"
                  disabled={items.length === 1}
                  onClick={() => removeItem(i)}
                  className="p-2 text-slate-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 mt-2 text-xs text-teal-400 hover:text-teal-300 font-medium"
          >
            <Plus size={12} />
            Add line
          </button>
        </div>

        {/* Totals preview */}
        <div className="mt-5 pt-4 border-t border-slate-800 space-y-1 text-sm max-w-sm ml-auto">
          <div className="flex items-center justify-between text-slate-400">
            <span>Subtotal</span>
            <span className="tabular-nums">{fmtMoney(totals.subtotal, currency)}</span>
          </div>
          {totals.tax > 0 && (
            <div className="flex items-center justify-between text-slate-400">
              <span>
                {supplierGstRegistered ? 'GST' : 'Tax'} ({(totals.taxRate * 100).toFixed(0)}%)
              </span>
              <span className="tabular-nums">{fmtMoney(totals.tax, currency)}</span>
            </div>
          )}
          <div className="flex items-center justify-between font-semibold text-slate-100 pt-1 border-t border-slate-800">
            <span>Total ({currency})</span>
            <span className="tabular-nums">{fmtMoney(totals.total, currency)}</span>
          </div>
        </div>
      </Section>

      {/* ── Tax + meta ──────────────────────────────────────────────────── */}
      <Section title="Tax & details">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency">
            <input
              className={inputCls}
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Your ABN" help="11 digits, no spaces — required for GST">
            <input
              className={inputCls}
              value={supplierAbn}
              onChange={(e) => setSupplierAbn(e.target.value.replace(/\s/g, ''))}
              placeholder="00000000000"
            />
          </Field>
          <div className="col-span-2 flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="gst"
              checked={supplierGstRegistered}
              onChange={(e) => setSupplierGstRegistered(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-teal-500"
            />
            <label htmlFor="gst" className="text-sm text-slate-300">
              I am GST-registered (renders &ldquo;TAX INVOICE&rdquo; with GST line)
            </label>
          </div>
          {supplierGstRegistered && (
            <Field label="Tax rate %" help="Default GST is 10% in Australia">
              <input
                type="number"
                step="0.1"
                min="0"
                max="50"
                className={inputCls}
                value={taxRatePct}
                onChange={(e) => setTaxRatePct(Number(e.target.value) || 0)}
              />
            </Field>
          )}
          <Field label="Due date (optional)">
            <input
              type="date"
              className={inputCls}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <Field label="Preferred payment method (optional)">
            <select
              className={inputCls}
              value={agreedPaymentMethod}
              onChange={(e) => setAgreedPaymentMethod(e.target.value)}
            >
              <option value="">No preference</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      {/* ── Notes / terms ──────────────────────────────────────────────── */}
      <Section title="Notes & terms">
        <div className="space-y-3">
          <Field label="Notes">
            <textarea
              className={inputCls}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the client should know"
            />
          </Field>
          <Field label="Terms">
            <textarea
              className={inputCls}
              rows={3}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="e.g. Net 30, late fees, etc."
            />
          </Field>
        </div>
      </Section>

      {/* ── Validation summary ──────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-300">
              Fix the following before saving:
            </p>
            <ul className="mt-1 text-xs text-red-300/80 list-disc list-inside space-y-0.5">
              {errors.slice(0, 5).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          variant="secondary"
          size="md"
          loading={savingDraft}
          disabled={errors.length > 0}
          onClick={() => void handleSaveDraft()}
        >
          <Save size={14} />
          Save as draft
        </Button>
        <Button
          variant="primary"
          size="md"
          loading={sending}
          disabled={errors.length > 0}
          onClick={() => void handleSendNow()}
        >
          <SendIcon size={14} />
          Send to client
        </Button>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-800">
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
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

function RecipientTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-teal-500 text-slate-950'
          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );
}
