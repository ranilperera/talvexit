'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ChevronRight, CheckCircle2, DollarSign } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import customerApi from '@/lib/customer-api';
import { PageContainer } from '@/components/layout/PageContainer';
// Single source of truth for the GST decision — see
// docs/tax-invoicing-payment-analysis.html §8.
import { decideGstTreatment } from '@onys/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderDetail {
  id: string;
  company_order_status: string;
  price_aud: number | null;
  task: {
    id: string;
    title: string;
    objective?: string;
    in_scope?: string[];
    out_of_scope?: string[];
    deliverables?: string[];
    hours_min?: number;
    hours_max?: number;
    price?: number;
    currency?: string;
    domain?: string;
  } | null;
  customer: {
    id: string;
    full_name: string;
    billing_country?: string | null;
    gst_registered?: boolean | null;
  } | null;
  company?: {
    id: string;
    company_name?: string;
    billing_country?: string | null;
    gst_registered?: boolean | null;
  } | null;
  contractor_user?: {
    id: string;
    billing_country?: string | null;
    gst_registered?: boolean | null;
  } | null;
  latest_proposal?: {
    id: string;
    status: string;
    price: number;
    currency: string;
    notes?: string | null;
    scope_of_work?: string | null;
    timeline_days?: number | null;
    payment_terms?: string | null;
  } | null;
}

interface ProposalPayload {
  notes?: string;
  scope_of_work: string;
  timeline_days?: number;
  currency: string;
  price: number;
  payment_terms?: string;
  status: 'DRAFT' | 'SENT';
}

interface CreateProposalResponse {
  success: boolean;
  data: { id: string; status: string };
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Platform is subscription-only — no commission on engagements.
// Kept as a constant so the (now-hidden) fee row stays trivial to revive.
const COMMISSION_RATE = 0;

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'SGD', 'CAD'];

// ─── Price Preview ─────────────────────────────────────────────────────────────

interface PricePreviewProps {
  price: number;
  currency: string;
  supplierCountry: string | null;
  supplierGstRegistered: boolean;
  customerCountry: string | null;
}

function PricePreview({
  price, currency, supplierCountry, supplierGstRegistered, customerCountry,
}: PricePreviewProps) {
  if (!price || price <= 0) return null;
  const decision = decideGstTreatment({
    issuer_country: supplierCountry,
    issuer_gst_registered: supplierGstRegistered,
    recipient_country: customerCountry,
    amount_ex_gst_cents: Math.round(price * 100),
  });
  const customerTotal = price + decision.gst_amount_cents / 100;
  const payout = price * (1 - COMMISSION_RATE);

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-4 space-y-2 mt-2">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Live Pricing Preview</p>
      <div className="flex justify-between text-sm">
        <span className="text-slate-400">
          {decision.charge_gst ? 'Customer pays (incl. 10% GST)' : 'Customer pays'}
        </span>
        <span className="text-slate-200 font-semibold">
          {currency} {customerTotal.toFixed(2)}
        </span>
      </div>
      {!decision.charge_gst && (
        <p className="text-[11px] text-slate-500 italic">{decision.treatment_reason}</p>
      )}
      {COMMISSION_RATE > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Platform commission ({COMMISSION_RATE * 100}%)</span>
          <span className="text-slate-400">−{currency} {(price * COMMISSION_RATE).toFixed(2)}</span>
        </div>
      )}
      <div className="flex justify-between text-sm border-t border-slate-700 pt-2 mt-2">
        <span className="text-slate-400">Your payout</span>
        <span className="text-teal-400 font-bold">{currency} {payout.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ─── Field Error ──────────────────────────────────────────────────────────────

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="text-red-400 text-xs mt-1">{message}</p>;
}

// ─── Reference Panel ─────────────────────────────────────────────────────────

function ReferencePanel({ order }: { order: OrderDetail | undefined }) {
  if (!order?.task) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-200">Original Task Requirements</h3>
        </CardHeader>
        <CardBody>
          <p className="text-slate-500 text-sm">Loading task data…</p>
        </CardBody>
      </Card>
    );
  }

  const task = order.task;

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold text-slate-200">Original Task Requirements</h3>
        <p className="text-xs text-slate-500 mt-1">Read-only reference — customer&apos;s original brief</p>
      </CardHeader>
      <CardBody className="space-y-5">
        {task.objective && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Objective</p>
            <p className="text-sm text-slate-300">{task.objective}</p>
          </div>
        )}

        {task.in_scope && task.in_scope.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">In Scope</p>
            <ul className="space-y-1">
              {task.in_scope.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <ChevronRight size={13} className="text-teal-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {task.deliverables && task.deliverables.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Deliverables</p>
            <ul className="space-y-1">
              {task.deliverables.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <CheckCircle2 size={13} className="text-green-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-slate-800/50 rounded-xl px-4 py-3 space-y-2">
          {task.price && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Listed price</span>
              <span className="text-slate-200 font-semibold">
                {task.currency ?? 'AUD'} {Number(task.price).toFixed(2)}
              </span>
            </div>
          )}
          {(task.hours_min ?? task.hours_max) && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Est. hours</span>
              <span className="text-slate-200">
                {task.hours_min ?? '?'}–{task.hours_max ?? '?'}h
              </span>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// ─── Form State ───────────────────────────────────────────────────────────────

interface FormData {
  notes: string;
  scope_of_work: string;
  timeline_days: string;
  currency: string;
  price: string;
  payment_terms: string;
}

interface FormErrors {
  scope_of_work?: string;
  price?: string;
}

function validate(data: FormData): FormErrors {
  const errors: FormErrors = {};
  if (!data.scope_of_work.trim()) {
    errors.scope_of_work = 'Scope of work is required.';
  }
  const priceNum = parseFloat(data.price);
  if (!data.price || isNaN(priceNum) || priceNum <= 0) {
    errors.price = 'A valid price is required.';
  }
  return errors;
}

// ─── Page Inner ───────────────────────────────────────────────────────────────

function NewProposalPageInner() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const router = useRouter();

  const [formData, setFormData] = useState<FormData>({
    notes: '',
    scope_of_work: '',
    timeline_days: '',
    currency: 'AUD',
    price: '',
    payment_terms: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Fetch order
  const { data: order, isLoading } = useQuery({
    queryKey: ['company-order', orderId],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: OrderDetail }>(`/api/v1/orders/${orderId}`)
        .then((r) => r.data.data),
    enabled: !!orderId,
  });

  // Pre-fill from task + previous proposal
  useEffect(() => {
    if (!order) return;
    const task = order.task;
    const prev = order.latest_proposal;

    setFormData((f) => ({
      ...f,
      scope_of_work:
        prev?.scope_of_work ??
        (task?.objective
          ? `${task.objective}\n\n${(task.in_scope ?? []).map((s) => `• ${s}`).join('\n')}`
          : ''),
      timeline_days: prev?.timeline_days?.toString() ?? (task?.hours_max ? String(Math.ceil(task.hours_max / 8)) : ''),
      currency: prev?.currency ?? task?.currency ?? 'AUD',
      price: prev?.price?.toString() ?? task?.price?.toString() ?? '',
      payment_terms: prev?.payment_terms ?? 'Net 14 days',
      notes: prev?.notes ?? '',
    }));
  }, [order]);

  function set(field: keyof FormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    const errField = field as keyof FormErrors;
    if (errors[errField]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[errField];
        return next;
      });
    }
  }

  async function submit(sendNow: boolean) {
    const errs = validate(formData);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);

    try {
      const body: ProposalPayload = {
        scope_of_work: formData.scope_of_work.trim(),
        currency: formData.currency,
        price: parseFloat(formData.price),
        status: sendNow ? 'SENT' : 'DRAFT',
        ...(formData.notes.trim() ? { notes: formData.notes.trim() } : {}),
        ...(formData.timeline_days ? { timeline_days: parseInt(formData.timeline_days, 10) } : {}),
        ...(formData.payment_terms.trim() ? { payment_terms: formData.payment_terms.trim() } : {}),
      };

      const res = await customerApi.post<CreateProposalResponse>(
        `/api/v1/orders/${orderId}/proposals`,
        body,
      );

      const proposalId = res.data.data.id;

      if (sendNow) {
        await customerApi.post(`/api/v1/proposals/${proposalId}/send`);
        toast.success('Proposal sent to customer.');
      } else {
        toast.success('Proposal saved as draft.');
      }

      router.push(`/company/orders/${orderId}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Failed to submit proposal.');
    } finally {
      setSubmitting(false);
    }
  }

  const priceNum = parseFloat(formData.price) || 0;

  return (
    <PageContainer className="space-y-6">
      {/* Back */}
      <Link
        href={`/company/orders/${orderId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
      >
        <ArrowLeft size={14} />
        Order Details
      </Link>

      <div>
        <h1 className="font-display font-bold text-xl text-slate-100">
          {order?.latest_proposal ? 'Revise Proposal' : 'Create Proposal'}
        </h1>
        {order?.task?.title && (
          <p className="text-sm text-slate-400 mt-1">{order.task.title}</p>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse bg-slate-800 rounded-2xl" />
            ))}
          </div>
          <div className="h-96 animate-pulse bg-slate-800 rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* LEFT: form (2/3 width) */}
          <div className="lg:col-span-2 space-y-5">
            {/* Cover note */}
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-slate-200">Cover Note</h2>
                <p className="text-xs text-slate-500 mt-0.5">Optional personal message to the customer</p>
              </CardHeader>
              <CardBody>
                <textarea
                  value={formData.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Introduce your approach, highlight your team's expertise, or set expectations…"
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm placeholder-slate-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none transition-all resize-none"
                />
                <p className={clsx('text-xs mt-1 text-right', formData.notes.length > 950 ? 'text-amber-400' : 'text-slate-600')}>
                  {formData.notes.length}/1000
                </p>
              </CardBody>
            </Card>

            {/* Scope of work */}
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-slate-200">
                  Scope of Work <span className="text-red-400">*</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Detail what you will deliver — this forms part of the contract</p>
              </CardHeader>
              <CardBody>
                <textarea
                  value={formData.scope_of_work}
                  onChange={(e) => set('scope_of_work', e.target.value)}
                  rows={8}
                  placeholder="Describe the work to be performed, methodology, and expected outcomes…"
                  className={clsx(
                    'w-full px-3 py-2.5 bg-slate-800 border rounded-xl text-slate-200 text-sm placeholder-slate-600 focus:ring-1 focus:ring-teal-500/30 focus:outline-none transition-all resize-none',
                    errors.scope_of_work ? 'border-red-500 focus:border-red-500' : 'border-slate-700 focus:border-teal-500',
                  )}
                />
                <FieldError message={errors.scope_of_work} />
              </CardBody>
            </Card>

            {/* Pricing & timeline */}
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-slate-200">Pricing &amp; Timeline</h2>
              </CardHeader>
              <CardBody className="space-y-4">
                {/* Currency + price */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Currency</label>
                    <select
                      value={formData.currency}
                      onChange={(e) => set('currency', e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Price <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.price}
                        onChange={(e) => set('price', e.target.value)}
                        placeholder="0.00"
                        className={clsx(
                          'w-full pl-8 pr-4 py-2.5 bg-slate-800 border rounded-xl text-slate-200 text-sm focus:ring-1 focus:ring-teal-500/30 focus:outline-none transition-all',
                          errors.price ? 'border-red-500 focus:border-red-500' : 'border-slate-700 focus:border-teal-500',
                        )}
                      />
                    </div>
                    <FieldError message={errors.price} />
                  </div>
                </div>

                {/* Timeline */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Estimated timeline (days, optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.timeline_days}
                    onChange={(e) => set('timeline_days', e.target.value)}
                    placeholder="e.g. 5"
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none transition-all"
                  />
                </div>

                {/* Payment terms */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Payment terms (optional)
                  </label>
                  <input
                    type="text"
                    value={formData.payment_terms}
                    onChange={(e) => set('payment_terms', e.target.value)}
                    placeholder="e.g. Net 14 days"
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm placeholder-slate-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none transition-all"
                  />
                </div>

                <PricePreview
                  price={priceNum}
                  currency={formData.currency}
                  supplierCountry={
                    order?.company?.billing_country
                      ?? order?.contractor_user?.billing_country
                      ?? null
                  }
                  supplierGstRegistered={
                    order?.company?.gst_registered
                      ?? order?.contractor_user?.gst_registered
                      ?? false
                  }
                  customerCountry={order?.customer?.billing_country ?? null}
                />
              </CardBody>
            </Card>

            {/* Actions */}
            <div className="flex gap-3 sticky bottom-6 bg-slate-950/90 backdrop-blur py-4 px-2 rounded-xl border border-slate-800/50">
              <Button
                variant="secondary"
                loading={submitting}
                onClick={() => { void submit(false); }}
                className="flex-1"
              >
                Save Draft
              </Button>
              <Button
                loading={submitting}
                onClick={() => { void submit(true); }}
                className="flex-1"
              >
                Send to Customer →
              </Button>
            </div>
          </div>

          {/* RIGHT: reference panel (1/3 width) */}
          <div className="lg:col-span-1">
            <ReferencePanel order={order} />
          </div>
        </div>
      )}
    </PageContainer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewProposalPage() {
  return (
    <Suspense fallback={null}>
      <NewProposalPageInner />
    </Suspense>
  );
}
