'use client';

import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, DollarSign, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useDomainOptions, useDomainMap, getDomainLabel } from '@/hooks/useDomains';
// Single source of truth for the GST decision. Catalogue browse is AU-by-
// default — see docs/tax-invoicing-payment-analysis.html §6 (R12).
import { decideGstTreatment } from '@onys/shared';

// ─── SCHEMA ───────────────────────────────────────────────────────────────────

export const taskFormSchema = z
  .object({
    title: z.string().min(10, 'Title must be at least 10 characters').max(120, 'Title too long'),
    domain: z.string().min(1, 'Select a domain'),
    objective: z
      .string()
      .min(50, 'Describe the objective in at least 50 characters')
      .max(2000),
    in_scope: z
      .array(z.object({ value: z.string().min(5, 'Too short').max(200) }))
      .min(1, 'Add at least one in-scope item'),
    out_of_scope: z.array(z.object({ value: z.string().min(5).max(200) })).default([]),
    assumptions: z.array(z.object({ value: z.string().min(5).max(200) })).default([]),
    prerequisites: z.array(z.object({ value: z.string().min(5).max(200) })).default([]),
    deliverables: z
      .array(z.object({ value: z.string().min(5).max(200) }))
      .min(1, 'Add at least one deliverable'),
    currency: z.string().default('AUD'),
    price: z.coerce.number().min(50, 'Minimum price is 50'),
    hours_min: z.coerce.number().int().min(1, 'Minimum 1 hour'),
    hours_max: z.coerce.number().int().min(1, 'Minimum 1 hour'),
  })
  .refine((d) => d.hours_max >= d.hours_min, {
    message: 'Maximum hours must be ≥ minimum hours',
    path: ['hours_max'],
  });

export type TaskFormValues = z.infer<typeof taskFormSchema>;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'SGD', 'CAD'];
// Platform is subscription-only — no commission on engagements.
const COMMISSION_RATE = 0;

// ─── PRICE PREVIEW ────────────────────────────────────────────────────────────

interface PricePreviewProps {
  price: number;
  currency: string;
  /** Defaults to true (typical AU GST-registered supplier creating a listing). */
  supplierGstRegistered?: boolean;
}

function PricePreview({ price, currency, supplierGstRegistered = true }: PricePreviewProps) {
  if (!price || price < 50) return null;
  // Listing previews assume an AU supplier billing an AU customer (the
  // common case). Final invoice uses the customer's actual billing
  // country at engagement time.
  const decision = decideGstTreatment({
    issuer_country: 'AU',
    issuer_gst_registered: supplierGstRegistered,
    recipient_country: 'AU',
    amount_ex_gst_cents: Math.round(price * 100),
  });
  const gst = decision.gst_amount_cents / 100;
  const customerTotal = price + gst;
  const commission = price * COMMISSION_RATE;
  const yourPayout = price - commission;

  const customerSub = decision.charge_gst
    ? 'incl. 10% GST'
    : decision.treatment_reason;

  return (
    <div className="mt-3 p-4 bg-slate-800/50 border border-slate-700 rounded-lg space-y-2">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
        Price Preview
      </p>
      {[
        { label: 'Customer pays',      value: `${currency} ${customerTotal.toFixed(2)}`, sub: customerSub, color: 'text-slate-200' },
        ...(COMMISSION_RATE > 0
          ? [{ label: 'Platform commission', value: `-${currency} ${commission.toFixed(2)}`, sub: `${COMMISSION_RATE * 100}% fee`, color: 'text-slate-400' }]
          : []),
        { label: 'Your payout',         value: `${currency} ${yourPayout.toFixed(2)}`,   sub: 'paid directly by customer',    color: 'text-teal-400' },
      ].map((row, i) => (
        <div key={i} className="flex justify-between items-baseline">
          <div>
            <span className="text-sm text-slate-400">{row.label}</span>
            <span className="text-xs text-slate-600 ml-2">{row.sub}</span>
          </div>
          <span className={`text-sm font-semibold font-display ${row.color}`}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── ARRAY FIELD SECTION ──────────────────────────────────────────────────────

interface ArrayFieldSectionProps {
  label: string;
  hint: string;
  placeholder: string;
  fields: { id: string }[];
  name: string;
  register: ReturnType<typeof useForm<TaskFormValues>>['register'];
  control: ReturnType<typeof useForm<TaskFormValues>>['control'];
  append: (val: { value: string }) => void;
  remove: (idx: number) => void;
  required?: boolean;
  minItems?: number;
  minChars?: number;
  error?: string | undefined;
}

// Live char counter per row — reads the current value via useWatch so
// the user sees immediate feedback as they type.
function RowCharCounter({
  control,
  name,
  index,
  minChars,
}: {
  control: ReturnType<typeof useForm<TaskFormValues>>['control'];
  name: string;
  index: number;
  minChars: number;
}) {
  const value = useWatch({
    control,
    name: `${name}.${index}.value` as Parameters<
      ReturnType<typeof useForm<TaskFormValues>>['register']
    >[0],
  }) as string | undefined;
  const len = (value ?? '').trim().length;
  const ok = len >= minChars;
  if (len === 0) return null;
  return (
    <span
      className={`text-[10px] tabular-nums shrink-0 mt-2 ${
        ok ? 'text-teal-400' : 'text-amber-400'
      }`}
    >
      {len}/{minChars}
    </span>
  );
}

function ArrayFieldSection({
  label, hint, placeholder, fields, name, register, control,
  append, remove, required, minItems = 0, minChars = 5, error,
}: ArrayFieldSectionProps) {
  const itemsBelowMin = minItems > 0 && fields.length < minItems;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <label className="text-sm font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
        <span
          className={`text-[11px] tabular-nums ${
            itemsBelowMin ? 'text-amber-400' : 'text-slate-600'
          }`}
        >
          {fields.length} added
          {minItems > 0 && ` · min ${minItems}`}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">{hint}</p>

      <div className="space-y-2">
        {fields.map((field, idx) => (
          <div key={field.id} className="flex gap-2 items-start">
            <input
              {...register(`${name}.${idx}.value` as Parameters<typeof register>[0])}
              placeholder={placeholder}
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder:text-slate-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none transition-all duration-200"
            />
            <RowCharCounter control={control} name={name} index={idx} minChars={minChars} />
            <button
              type="button"
              onClick={() => remove(idx)}
              className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors mt-0.5"
              aria-label="Remove item"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => append({ value: '' })}
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-teal-400 hover:text-teal-300 px-2.5 py-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/15 transition-colors"
      >
        <Plus size={14} />
        Add item
      </button>

      {itemsBelowMin && fields.length === 0 && (
        <p className="mt-2 text-[11px] text-amber-400 flex items-center gap-1.5">
          <AlertCircle size={11} />
          At least {minItems} {minItems === 1 ? 'item' : 'items'} required to publish (min {minChars} chars each)
        </p>
      )}
      {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
    </div>
  );
}

// ─── TASKFORM PROPS ───────────────────────────────────────────────────────────

interface TaskFormProps {
  defaultValues?: Partial<TaskFormValues>;
  onSubmit: (data: TaskFormValues, publish: boolean) => void;
  isLoading: boolean;
  mode: 'create' | 'edit';
  onCancel: () => void;
}

// ─── MAIN FORM ────────────────────────────────────────────────────────────────

export function TaskForm({ defaultValues, onSubmit, isLoading, mode, onCancel }: TaskFormProps) {
  const domainOptions = useDomainOptions();
  const domainMap = useDomainMap();
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<TaskFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(taskFormSchema) as any,
    defaultValues: {
      currency: 'AUD',
      in_scope: [{ value: '' }],
      out_of_scope: [],
      assumptions: [],
      prerequisites: [],
      deliverables: [{ value: '' }],
      ...defaultValues,
    },
  });

  const inScope      = useFieldArray({ control, name: 'in_scope' });
  const outOfScope   = useFieldArray({ control, name: 'out_of_scope' });
  const assumptions  = useFieldArray({ control, name: 'assumptions' });
  const prerequisites = useFieldArray({ control, name: 'prerequisites' });
  const deliverables = useFieldArray({ control, name: 'deliverables' });

  const watchedPrice    = watch('price');
  const watchedCurrency = watch('currency');

  const submitWith = (publish: boolean) =>
    void handleSubmit((data) => onSubmit(data as TaskFormValues, publish))();

  return (
    <div className="space-y-6">

      {/* BASICS */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-slate-200">1. Basics</h2>

        <Input
          label="Task Title"
          placeholder="e.g. Firewall Audit & Hardening — Palo Alto"
          {...register('title')}
          error={errors.title?.message}
        />

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Domain <span className="text-red-400">*</span>
          </label>
          <select
            {...register('domain')}
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none transition-all duration-200"
          >
            <option value="">Select a domain</option>
            {domainOptions.map((d) => (
              <option key={d.value} value={d.value}>{getDomainLabel(d.value, domainMap)}</option>
            ))}
          </select>
          {errors.domain && <p className="text-red-400 text-xs mt-1">{errors.domain.message}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Objective <span className="text-red-400">*</span>
          </label>
          <textarea
            {...register('objective')}
            rows={4}
            placeholder="Describe the measurable outcome the customer will have after this task..."
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm placeholder:text-slate-600 resize-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none transition-all duration-200"
          />
          {errors.objective && <p className="text-red-400 text-xs mt-1">{errors.objective.message}</p>}
        </div>
      </div>

      {/* SCOPE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-start justify-between mb-5">
          <h2 className="font-semibold text-slate-200">2. Scope Definition</h2>
          <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
            <AlertCircle size={12} />
            Be specific — vague scopes cause disputes
          </div>
        </div>

        <div className="space-y-6">
          <ArrayFieldSection
            label="In Scope"
            hint="What IS included in this task. Each line is one work item — be specific."
            placeholder="e.g. Review and harden firewall ruleset against CIS benchmarks"
            fields={inScope.fields} name="in_scope" register={register} control={control}
            append={inScope.append} remove={inScope.remove}
            required minItems={1} minChars={5}
            error={errors.in_scope?.message}
          />
          <ArrayFieldSection
            label="Out of Scope"
            hint="What is explicitly NOT included. Being explicit prevents scope creep and disputes."
            placeholder="e.g. Physical hardware installation or migration"
            fields={outOfScope.fields} name="out_of_scope" register={register} control={control}
            append={outOfScope.append} remove={outOfScope.remove}
            minChars={5}
          />
          <ArrayFieldSection
            label="Assumptions"
            hint="Conditions you're assuming the customer's environment meets."
            placeholder="e.g. SSH access to firewall + admin credentials provided"
            fields={assumptions.fields} name="assumptions" register={register} control={control}
            append={assumptions.append} remove={assumptions.remove}
            minChars={5}
          />
          <ArrayFieldSection
            label="Prerequisites"
            hint="What the customer must provide before work starts (access, credentials, data)."
            placeholder="e.g. SSH access to the firewall + admin credentials"
            fields={prerequisites.fields} name="prerequisites" register={register} control={control}
            append={prerequisites.append} remove={prerequisites.remove}
            minChars={5}
          />
          <ArrayFieldSection
            label="Deliverables"
            hint="Concrete, verifiable outputs the customer receives at completion."
            placeholder="e.g. Hardened config + as-built diagram + handover doc"
            fields={deliverables.fields} name="deliverables" register={register} control={control}
            append={deliverables.append} remove={deliverables.remove}
            required minItems={1} minChars={5}
            error={errors.deliverables?.message}
          />
        </div>
      </div>

      {/* PRICING */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-slate-200">3. Pricing &amp; Time</h2>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Currency</label>
            <select
              {...register('currency')}
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Price <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <DollarSign size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="number" step="0.01" min="50"
                {...register('price')}
                placeholder="950.00"
                className="w-full pl-8 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none"
              />
            </div>
            {errors.price && <p className="text-red-400 text-xs mt-1">{errors.price.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              <Clock size={13} className="inline mr-1" />
              Min hours <span className="text-red-400">*</span>
            </label>
            <input
              type="number" min="1" {...register('hours_min')} placeholder="6"
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none"
            />
            {errors.hours_min && <p className="text-red-400 text-xs mt-1">{errors.hours_min.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              <Clock size={13} className="inline mr-1" />
              Max hours <span className="text-red-400">*</span>
            </label>
            <input
              type="number" min="1" {...register('hours_max')} placeholder="10"
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none"
            />
            {errors.hours_max && <p className="text-red-400 text-xs mt-1">{errors.hours_max.message}</p>}
          </div>
        </div>

        <PricePreview price={Number(watchedPrice)} currency={watchedCurrency} />
      </div>

      {/* STICKY ACTION BAR */}
      <div className="flex gap-3 justify-end sticky bottom-6 bg-slate-950/90 backdrop-blur py-4 px-2 rounded-xl border border-slate-800/50">
        <Button variant="secondary" onClick={onCancel} type="button">
          Cancel
        </Button>
        {mode === 'create' && (
          <Button
            variant="secondary"
            type="button"
            loading={isLoading}
            onClick={() => submitWith(false)}
          >
            Save as Draft
          </Button>
        )}
        <Button
          variant="primary"
          type="button"
          loading={isLoading}
          onClick={() => submitWith(mode === 'create')}
        >
          {mode === 'create' ? 'Publish Task' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
