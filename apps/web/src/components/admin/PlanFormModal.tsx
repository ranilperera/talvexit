'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

// Mirror of SubscriptionPlan + Zod CreatePlanInput shape
export interface PlanFormData {
  id?: string;
  name: string;
  slug: string;
  description: string;
  plan_type: PlanTypeValue;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;

  monthly_price_aud: string;
  yearly_price_aud: string;
  monthly_price_usd: string;
  yearly_price_usd: string;
  trial_days: number;

  // Stripe (read-only display, populated by sync)
  stripe_product_id: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;

  // Limits (string for empty = unlimited)
  max_active_tasks: string;
  max_active_projects: string;
  max_team_seats: string;
  max_consultant_profiles: string;
  max_bids_per_month: string;
  max_domain_categories: string;
  max_ai_requests_per_month: string;
  max_storage_gb: string;
  allowed_listing_items: string;
  max_orders_per_month: string;
  max_active_tenders: string;
  max_active_orders: string;
  max_active_contracts: string;

  // Feature flags
  allow_overseas_contractors: boolean;
  allow_project_mode: boolean;
  allow_api_access: boolean;
  allow_priority_listing: boolean;
  allow_advanced_analytics: boolean;
  allow_custom_sla: boolean;
  allow_whitelabel: boolean;
  allow_sso: boolean;
  allow_bulk_po: boolean;
  allow_compliance_docs: boolean;
  allow_dedicated_manager: boolean;
  allow_video_facility: boolean;

  // Custom & marketing
  custom_features: string[];
  badge_text: string;
  cta_text: string;
  highlight_color: string;
}

export type PlanTypeValue =
  | 'CUSTOMER_STARTER'
  | 'CUSTOMER_BUSINESS'
  | 'CUSTOMER_PROFESSIONAL'
  | 'CUSTOMER_ENTERPRISE'
  | 'SUPPLIER_FREE'
  | 'SUPPLIER_SOLO'
  | 'SUPPLIER_COMPANY_STARTER'
  | 'SUPPLIER_COMPANY_PRO'
  | 'SUPPLIER_GLOBAL';

const PLAN_TYPES: { value: PlanTypeValue; label: string }[] = [
  { value: 'CUSTOMER_STARTER', label: 'Customer — Starter' },
  { value: 'CUSTOMER_BUSINESS', label: 'Customer — Business' },
  { value: 'CUSTOMER_PROFESSIONAL', label: 'Customer — Professional' },
  { value: 'CUSTOMER_ENTERPRISE', label: 'Customer — Enterprise' },
  { value: 'SUPPLIER_FREE', label: 'Supplier — Free' },
  { value: 'SUPPLIER_SOLO', label: 'Supplier — Solo' },
  { value: 'SUPPLIER_COMPANY_STARTER', label: 'Supplier — Company Starter' },
  { value: 'SUPPLIER_COMPANY_PRO', label: 'Supplier — Company Pro' },
  { value: 'SUPPLIER_GLOBAL', label: 'Supplier — Global' },
];

const FEATURE_FLAGS: { key: keyof PlanFormData; label: string; help?: string }[] = [
  { key: 'allow_overseas_contractors', label: 'Overseas contractors', help: 'Hire suppliers outside Australia' },
  { key: 'allow_project_mode', label: 'Project mode', help: 'Multi-task projects with milestones' },
  { key: 'allow_api_access', label: 'API access' },
  { key: 'allow_priority_listing', label: 'Priority listing' },
  { key: 'allow_advanced_analytics', label: 'Advanced analytics' },
  { key: 'allow_custom_sla', label: 'Custom SLA' },
  { key: 'allow_whitelabel', label: 'White-label branding' },
  { key: 'allow_sso', label: 'Single sign-on (SSO)' },
  { key: 'allow_bulk_po', label: 'Bulk purchase orders' },
  { key: 'allow_compliance_docs', label: 'Compliance documents' },
  { key: 'allow_dedicated_manager', label: 'Dedicated account manager' },
  { key: 'allow_video_facility', label: 'Video meeting facility' },
];

const LIMIT_FIELDS: { key: keyof PlanFormData; label: string; help?: string }[] = [
  { key: 'max_active_tasks', label: 'Max active tasks', help: 'Empty = unlimited' },
  { key: 'max_active_projects', label: 'Max active projects' },
  { key: 'max_team_seats', label: 'Max team seats' },
  { key: 'max_consultant_profiles', label: 'Max consultant profiles' },
  { key: 'max_bids_per_month', label: 'Max bids per month' },
  { key: 'max_domain_categories', label: 'Max domain categories' },
  { key: 'max_ai_requests_per_month', label: 'Max AI requests per month' },
  { key: 'max_storage_gb', label: 'Max storage (GB)' },
  { key: 'allowed_listing_items', label: 'Allowed listing items' },
  { key: 'max_orders_per_month', label: 'Max orders / month', help: 'Customer plans — empty = unlimited' },
  { key: 'max_active_tenders', label: 'Max active tenders', help: 'Customer plans — empty = unlimited' },
  { key: 'max_active_orders', label: 'Max active orders (concurrent)', help: 'Supplier plans — orders currently in delivery' },
  { key: 'max_active_contracts', label: 'Max active tender contracts', help: 'Supplier plans — concurrent in-flight contracts' },
];

export const EMPTY_PLAN: PlanFormData = {
  name: '',
  slug: '',
  description: '',
  plan_type: 'CUSTOMER_STARTER',
  is_active: true,
  is_public: true,
  sort_order: 0,
  monthly_price_aud: '',
  yearly_price_aud: '',
  monthly_price_usd: '',
  yearly_price_usd: '',
  trial_days: 0,
  stripe_product_id: null,
  stripe_price_id_monthly: null,
  stripe_price_id_yearly: null,
  max_active_tasks: '',
  max_active_projects: '',
  max_team_seats: '',
  max_consultant_profiles: '',
  max_bids_per_month: '',
  max_domain_categories: '',
  max_ai_requests_per_month: '',
  max_storage_gb: '',
  allowed_listing_items: '',
  max_orders_per_month: '',
  max_active_tenders: '',
  max_active_orders: '',
  max_active_contracts: '',
  allow_overseas_contractors: false,
  allow_project_mode: false,
  allow_api_access: false,
  allow_priority_listing: false,
  allow_advanced_analytics: false,
  allow_custom_sla: false,
  allow_whitelabel: false,
  allow_sso: false,
  allow_bulk_po: false,
  allow_compliance_docs: false,
  allow_dedicated_manager: false,
  allow_video_facility: false,
  custom_features: [],
  badge_text: '',
  cta_text: '',
  highlight_color: '#14b8a6',
};

// Convert API plan row → form state (numbers/decimals → strings for input compat)
export function toFormData(plan: Record<string, unknown> | null): PlanFormData {
  if (!plan) return EMPTY_PLAN;
  const v = (k: string) => {
    const val = plan[k];
    return val === null || val === undefined ? '' : String(val);
  };
  const b = (k: string, fallback = false) =>
    typeof plan[k] === 'boolean' ? (plan[k] as boolean) : fallback;
  return {
    id: plan['id'] as string,
    name: v('name'),
    slug: v('slug'),
    description: v('description'),
    plan_type: (plan['plan_type'] as PlanTypeValue) ?? 'CUSTOMER_STARTER',
    is_active: b('is_active', true),
    is_public: b('is_public', true),
    sort_order: Number(plan['sort_order'] ?? 0),
    monthly_price_aud: v('monthly_price_aud'),
    yearly_price_aud: v('yearly_price_aud'),
    monthly_price_usd: v('monthly_price_usd'),
    yearly_price_usd: v('yearly_price_usd'),
    trial_days: Number(plan['trial_days'] ?? 0),
    stripe_product_id: (plan['stripe_product_id'] as string) ?? null,
    stripe_price_id_monthly: (plan['stripe_price_id_monthly'] as string) ?? null,
    stripe_price_id_yearly: (plan['stripe_price_id_yearly'] as string) ?? null,
    max_active_tasks: v('max_active_tasks'),
    max_active_projects: v('max_active_projects'),
    max_team_seats: v('max_team_seats'),
    max_consultant_profiles: v('max_consultant_profiles'),
    max_bids_per_month: v('max_bids_per_month'),
    max_domain_categories: v('max_domain_categories'),
    max_ai_requests_per_month: v('max_ai_requests_per_month'),
    max_storage_gb: v('max_storage_gb'),
    allowed_listing_items: v('allowed_listing_items'),
    max_orders_per_month: v('max_orders_per_month'),
    max_active_tenders: v('max_active_tenders'),
    max_active_orders: v('max_active_orders'),
    max_active_contracts: v('max_active_contracts'),
    allow_overseas_contractors: b('allow_overseas_contractors'),
    allow_project_mode: b('allow_project_mode'),
    allow_api_access: b('allow_api_access'),
    allow_priority_listing: b('allow_priority_listing'),
    allow_advanced_analytics: b('allow_advanced_analytics'),
    allow_custom_sla: b('allow_custom_sla'),
    allow_whitelabel: b('allow_whitelabel'),
    allow_sso: b('allow_sso'),
    allow_bulk_po: b('allow_bulk_po'),
    allow_compliance_docs: b('allow_compliance_docs'),
    allow_dedicated_manager: b('allow_dedicated_manager'),
    allow_video_facility: b('allow_video_facility'),
    custom_features: Array.isArray(plan['custom_features'])
      ? (plan['custom_features'] as unknown[]).map(String)
      : [],
    badge_text: v('badge_text'),
    cta_text: v('cta_text'),
    highlight_color: v('highlight_color') || '#14b8a6',
  };
}

// Convert form state → API payload (strings → numbers, "" → null for limits)
export function toApiPayload(data: PlanFormData): Record<string, unknown> {
  const numOrNull = (s: string) => (s === '' ? null : Number(s));
  return {
    name: data.name.trim(),
    slug: data.slug.trim(),
    description: data.description.trim() || null,
    plan_type: data.plan_type,
    is_active: data.is_active,
    is_public: data.is_public,
    sort_order: data.sort_order,
    monthly_price_aud: numOrNull(data.monthly_price_aud),
    yearly_price_aud: numOrNull(data.yearly_price_aud),
    monthly_price_usd: numOrNull(data.monthly_price_usd),
    yearly_price_usd: numOrNull(data.yearly_price_usd),
    trial_days: data.trial_days,
    max_active_tasks: numOrNull(data.max_active_tasks),
    max_active_projects: numOrNull(data.max_active_projects),
    max_team_seats: numOrNull(data.max_team_seats),
    max_consultant_profiles: numOrNull(data.max_consultant_profiles),
    max_bids_per_month: numOrNull(data.max_bids_per_month),
    max_domain_categories: numOrNull(data.max_domain_categories),
    max_ai_requests_per_month: numOrNull(data.max_ai_requests_per_month),
    max_storage_gb: numOrNull(data.max_storage_gb),
    allowed_listing_items: numOrNull(data.allowed_listing_items),
    max_orders_per_month: numOrNull(data.max_orders_per_month),
    max_active_tenders: numOrNull(data.max_active_tenders),
    max_active_orders: numOrNull(data.max_active_orders),
    max_active_contracts: numOrNull(data.max_active_contracts),
    allow_overseas_contractors: data.allow_overseas_contractors,
    allow_project_mode: data.allow_project_mode,
    allow_api_access: data.allow_api_access,
    allow_priority_listing: data.allow_priority_listing,
    allow_advanced_analytics: data.allow_advanced_analytics,
    allow_custom_sla: data.allow_custom_sla,
    allow_whitelabel: data.allow_whitelabel,
    allow_sso: data.allow_sso,
    allow_bulk_po: data.allow_bulk_po,
    allow_compliance_docs: data.allow_compliance_docs,
    allow_dedicated_manager: data.allow_dedicated_manager,
    allow_video_facility: data.allow_video_facility,
    custom_features: data.custom_features,
    badge_text: data.badge_text.trim() || null,
    cta_text: data.cta_text.trim() || null,
    highlight_color: data.highlight_color || null,
  };
}

// ─── Internal: accordion section ─────────────────────────────────────────────

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-200 hover:text-white"
      >
        {title}
        <ChevronDown
          size={16}
          className={`transition-transform ${open ? 'rotate-180' : ''} text-slate-500`}
        />
      </button>
      {open && <div className="border-t border-slate-800 px-4 py-4">{children}</div>}
    </div>
  );
}

// ─── Internal: small labelled field helpers ──────────────────────────────────

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

const inputCls =
  'w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none';

function Toggle({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-teal-500"
      />
      <span className="flex-1">
        <span className="block text-sm text-slate-200">{label}</span>
        {help && <span className="block text-[11px] text-slate-500">{help}</span>}
      </span>
    </label>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  initial: PlanFormData;
  saving: boolean;
  onSave: (data: PlanFormData) => void;
  onSyncStripe?: () => void;
  syncing?: boolean;
}

export default function PlanFormModal({
  open,
  onClose,
  initial,
  saving,
  onSave,
  onSyncStripe,
  syncing,
}: Props) {
  const [data, setData] = useState<PlanFormData>(initial);
  const [openSections, setOpenSections] = useState({
    basic: true,
    pricing: true,
    limits: false,
    features: false,
    stripe: false,
    marketing: false,
  });
  const [newCustomFeature, setNewCustomFeature] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form whenever the modal is opened with a new plan
  useEffect(() => {
    if (open) {
      setData(initial);
      setErrors({});
      setNewCustomFeature('');
    }
  }, [open, initial]);

  const set = <K extends keyof PlanFormData>(key: K, value: PlanFormData[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  const toggleSection = (k: keyof typeof openSections) =>
    setOpenSections((s) => ({ ...s, [k]: !s[k] }));

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!data.name.trim()) e['name'] = 'Required';
    if (!data.slug.trim()) e['slug'] = 'Required';
    else if (!/^[a-z0-9-]+$/.test(data.slug)) e['slug'] = 'Lowercase letters, digits, hyphens only';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    onSave(data);
  }

  function addCustomFeature() {
    const v = newCustomFeature.trim();
    if (!v) return;
    setData((d) => ({ ...d, custom_features: [...d.custom_features, v] }));
    setNewCustomFeature('');
  }

  function removeCustomFeature(i: number) {
    setData((d) => ({
      ...d,
      custom_features: d.custom_features.filter((_, idx) => idx !== i),
    }));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={data.id ? `Edit plan: ${initial.name}` : 'Create new plan'}
      size="xl"
    >
      <div className="space-y-3">
        {/* ── BASIC ─────────────────────────────────────────────────────────── */}
        <Section
          title="Basic"
          open={openSections.basic}
          onToggle={() => toggleSection('basic')}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Plan name *">
              <input
                className={inputCls}
                value={data.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Business"
              />
              {errors['name'] && <span className="text-xs text-red-400">{errors['name']}</span>}
            </Field>
            <Field label="Slug *" help="Unique URL-safe identifier">
              <input
                className={inputCls}
                value={data.slug}
                onChange={(e) => set('slug', e.target.value)}
                placeholder="e.g. business"
              />
              {errors['slug'] && <span className="text-xs text-red-400">{errors['slug']}</span>}
            </Field>
            <Field label="Description">
              <textarea
                className={inputCls}
                rows={3}
                value={data.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
            <Field label="Plan type">
              <select
                className={inputCls}
                value={data.plan_type}
                onChange={(e) => set('plan_type', e.target.value as PlanTypeValue)}
              >
                {PLAN_TYPES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sort order" help="Lower = earlier on pricing page">
              <input
                type="number"
                className={inputCls}
                value={data.sort_order}
                onChange={(e) => set('sort_order', Number(e.target.value) || 0)}
              />
            </Field>
            <div className="flex flex-col gap-3 pt-5">
              <Toggle
                checked={data.is_active}
                onChange={(v) => set('is_active', v)}
                label="Active"
                help="Inactive plans cannot be subscribed to"
              />
              <Toggle
                checked={data.is_public}
                onChange={(v) => set('is_public', v)}
                label="Public"
                help="Show on the public /pricing page"
              />
            </div>
          </div>
        </Section>

        {/* ── PRICING ───────────────────────────────────────────────────────── */}
        <Section
          title="Pricing"
          open={openSections.pricing}
          onToggle={() => toggleSection('pricing')}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Monthly price (AUD)" help="Leave blank to disable monthly">
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputCls}
                value={data.monthly_price_aud}
                onChange={(e) => set('monthly_price_aud', e.target.value)}
              />
            </Field>
            <Field label="Yearly price (AUD)" help="Leave blank to disable yearly">
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputCls}
                value={data.yearly_price_aud}
                onChange={(e) => set('yearly_price_aud', e.target.value)}
              />
            </Field>
            <Field label="Monthly price (USD) — display only">
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputCls}
                value={data.monthly_price_usd}
                onChange={(e) => set('monthly_price_usd', e.target.value)}
              />
            </Field>
            <Field label="Yearly price (USD) — display only">
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputCls}
                value={data.yearly_price_usd}
                onChange={(e) => set('yearly_price_usd', e.target.value)}
              />
            </Field>
            <Field label="Trial days">
              <input
                type="number"
                min="0"
                className={inputCls}
                value={data.trial_days}
                onChange={(e) => set('trial_days', Number(e.target.value) || 0)}
              />
            </Field>
          </div>
        </Section>

        {/* ── LIMITS ────────────────────────────────────────────────────────── */}
        <Section
          title="Limits"
          open={openSections.limits}
          onToggle={() => toggleSection('limits')}
        >
          <p className="mb-3 text-xs text-slate-500">
            Leave any field blank for unlimited.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {LIMIT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} {...(f.help ? { help: f.help } : {})}>
                <input
                  type="number"
                  min="0"
                  className={inputCls}
                  value={data[f.key] as string}
                  onChange={(e) => set(f.key, e.target.value as never)}
                />
              </Field>
            ))}
          </div>
        </Section>

        {/* ── FEATURE FLAGS ─────────────────────────────────────────────────── */}
        <Section
          title="Feature flags"
          open={openSections.features}
          onToggle={() => toggleSection('features')}
        >
          <div className="grid grid-cols-2 gap-3">
            {FEATURE_FLAGS.map((f) => (
              <Toggle
                key={f.key as string}
                checked={data[f.key] as boolean}
                onChange={(v) => set(f.key, v as never)}
                label={f.label}
                {...(f.help ? { help: f.help } : {})}
              />
            ))}
          </div>
        </Section>

        {/* ── STRIPE ────────────────────────────────────────────────────────── */}
        <Section
          title="Stripe"
          open={openSections.stripe}
          onToggle={() => toggleSection('stripe')}
        >
          <p className="mb-3 text-xs text-slate-500">
            These IDs are populated automatically when you sync the plan to Stripe.
            They cannot be edited directly.
          </p>
          <div className="space-y-3">
            <Field label="Product ID">
              <input className={inputCls} value={data.stripe_product_id ?? ''} disabled />
            </Field>
            <Field label="Monthly Price ID">
              <input
                className={inputCls}
                value={data.stripe_price_id_monthly ?? ''}
                disabled
              />
            </Field>
            <Field label="Yearly Price ID">
              <input
                className={inputCls}
                value={data.stripe_price_id_yearly ?? ''}
                disabled
              />
            </Field>
            {onSyncStripe && data.id && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={!!syncing}
                onClick={onSyncStripe}
              >
                Sync to Stripe now
              </Button>
            )}
          </div>
        </Section>

        {/* ── MARKETING ─────────────────────────────────────────────────────── */}
        <Section
          title="Marketing"
          open={openSections.marketing}
          onToggle={() => toggleSection('marketing')}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Badge text" help='e.g. "Most Popular"'>
              <input
                className={inputCls}
                value={data.badge_text}
                onChange={(e) => set('badge_text', e.target.value)}
              />
            </Field>
            <Field label="CTA text" help='e.g. "Get Started"'>
              <input
                className={inputCls}
                value={data.cta_text}
                onChange={(e) => set('cta_text', e.target.value)}
              />
            </Field>
            <Field label="Highlight colour">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-9 w-12 rounded-lg bg-slate-900 border border-slate-700"
                  value={data.highlight_color}
                  onChange={(e) => set('highlight_color', e.target.value)}
                />
                <input
                  className={inputCls}
                  value={data.highlight_color}
                  onChange={(e) => set('highlight_color', e.target.value)}
                />
              </div>
            </Field>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-slate-400">Custom features</p>
            <div className="flex gap-2 mb-2">
              <input
                className={inputCls}
                value={newCustomFeature}
                onChange={(e) => setNewCustomFeature(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomFeature();
                  }
                }}
                placeholder="Add a feature line and press Enter"
              />
              <Button type="button" variant="secondary" size="sm" onClick={addCustomFeature}>
                <Plus size={14} />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.custom_features.map((feat, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-300"
                >
                  {feat}
                  <button
                    type="button"
                    onClick={() => removeCustomFeature(i)}
                    className="text-slate-500 hover:text-red-400"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              {data.custom_features.length === 0 && (
                <span className="text-xs text-slate-600">No custom features yet.</span>
              )}
            </div>
          </div>
        </Section>

        {/* ── ACTIONS ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            loading={saving}
            onClick={handleSubmit}
          >
            {data.id ? 'Save changes' : 'Create plan'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
