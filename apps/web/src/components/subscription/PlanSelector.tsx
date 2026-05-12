'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Check,
  X as XIcon,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Crown,
  ExternalLink,
  Lock,
  Sparkles,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import { useSubscription } from '@/hooks/useSubscription';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PublicPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  plan_type: string;
  sort_order: number;
  monthly_price_aud: string | null;
  yearly_price_aud: string | null;
  trial_days: number;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  badge_text: string | null;
  highlight_color: string | null;
  custom_features: string[];
  // Limits — null = unlimited (customers only); supplier plans always have
  // hard caps post-2026-05-06 supplier rebuild.
  max_active_tasks: number | null;
  max_team_seats: number | null;
  max_bids_per_month: number | null;
  max_ai_requests_per_month: number | null;
  max_orders_per_month: number | null;
  max_active_tenders: number | null;
  max_active_orders: number | null;
  max_active_contracts: number | null;
  max_domain_categories: number | null;
  allowed_listing_items: number | null;
  // Customer-side limits added in the customer subscription rebuild
  max_task_bookings_per_month: number | null;
  max_contracts_per_month: number | null;
  // Removed columns kept here as optional so legacy callers still typecheck.
  // The API stops returning them after the supplier rebuild migration.
  max_active_projects?: number | null;
  max_consultant_profiles?: number | null;
  max_storage_gb?: number | null;
  // Feature flags
  allow_overseas_contractors: boolean;
  allow_project_mode: boolean;
  allow_priority_listing: boolean;
  allow_advanced_analytics: boolean;
  allow_custom_sla: boolean;
  allow_dedicated_manager: boolean;
  allow_api_access: boolean;
  allow_whitelabel: boolean;
  allow_sso: boolean;
}

const publicApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? '',
  timeout: 15000,
});

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  /** Filter the plan list. Required — picks which audience this page serves. */
  audience: 'CUSTOMER' | 'SUPPLIER';
  /**
   * Whose subscription is being managed. 'user' = personal sub on the
   * caller; 'company' = the consulting company they primary-admin.
   * Defaults to 'user'.
   */
  subject?: 'user' | 'company';
}

export default function PlanSelector({ audience, subject = 'user' }: Props) {
  const router = useRouter();
  const sub = useSubscription({ subject });
  const subjectQS = subject === 'company' ? '?subject=company' : '';
  const subjectQSExtra = subject === 'company' ? '&subject=company' : '';
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [openingPortal, setOpeningPortal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);

  // Default the billing interval to whatever the user's current sub uses
  useEffect(() => {
    if (sub.subscription) {
      setBilling(sub.subscription.billing_interval === 'YEARLY' ? 'yearly' : 'monthly');
    }
  }, [sub.subscription]);

  const fetchPlans = useCallback(async () => {
    try {
      const res = await publicApi.get<{ success: boolean; data: PublicPlan[] }>(
        '/api/v1/subscriptions/plans',
      );
      setPlans(res.data.data);
    } catch {
      toast.error('Failed to load plans.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

  const filtered = useMemo(
    () =>
      plans
        .filter((p) =>
          audience === 'CUSTOMER'
            ? p.plan_type.startsWith('CUSTOMER_')
            : p.plan_type.startsWith('SUPPLIER_'),
        )
        .sort((a, b) => a.sort_order - b.sort_order),
    [plans, audience],
  );

  const currentPlan = useMemo(
    () => filtered.find((p) => p.id === sub.plan?.id) ?? null,
    [filtered, sub.plan?.id],
  );

  // ─── Actions ────────────────────────────────────────────────────────────

  async function handleSwitch(target: PublicPlan) {
    setSubmittingPlanId(target.id);
    // Free → anything: route through /subscribe (handles auth + Stripe + free activation)
    // Paid → Free: blocked by backend — direct user to portal to cancel first
    const targetIsFree =
      Number(billing === 'monthly' ? target.monthly_price_aud : target.yearly_price_aud) === 0;
    const currentIsPaid = !!sub.subscription?.stripe_subscription_id;

    if (currentIsPaid && targetIsFree) {
      toast.info(
        'Cancel your paid subscription first via Manage in portal — the free plan activates after the period ends.',
      );
      setSubmittingPlanId(null);
      return;
    }

    router.push(`/subscribe?plan_id=${target.id}&interval=${billing}${subjectQSExtra}`);
  }

  async function handleOpenPortal() {
    setOpeningPortal(true);
    try {
      const res = await customerApi.post<{
        success: boolean;
        data: { portal_url: string };
      }>(`/api/v1/subscriptions/portal${subjectQS}`);
      window.location.href = res.data.data.portal_url;
    } catch {
      // toast surfaced by interceptor
      setOpeningPortal(false);
    }
  }

  async function handleCancel() {
    if (
      !window.confirm(
        'Cancel your subscription at the end of the current billing period? You keep access until then.',
      )
    ) {
      return;
    }
    setCancelling(true);
    try {
      await customerApi.post(`/api/v1/subscriptions/cancel${subjectQS}`);
      toast.success('Subscription will end at the period close.');
      sub.refetch();
    } catch {
      // toast surfaced by interceptor
    } finally {
      setCancelling(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (sub.isLoading || loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="h-32 rounded-2xl bg-slate-900 animate-pulse" />
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-96 rounded-2xl bg-slate-900 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-100">Plans</h1>
        <p className="text-sm text-slate-400 mt-1">
          {audience === 'CUSTOMER'
            ? 'Pick the plan that fits your team. Upgrade or downgrade any time.'
            : 'Pick the plan that fits your delivery capacity. Upgrade or downgrade any time.'}
        </p>
      </div>

      {/* ── Current plan banner ────────────────────────────────────────────── */}
      {currentPlan ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="rounded-xl border p-3 shrink-0"
              style={{
                background: currentPlan.highlight_color
                  ? `${currentPlan.highlight_color}1a`
                  : 'rgba(20,184,166,0.10)',
                borderColor: currentPlan.highlight_color ?? 'rgba(20,184,166,0.30)',
              }}
            >
              <Crown size={18} style={{ color: currentPlan.highlight_color ?? '#14b8a6' }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Current plan
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-slate-100">{currentPlan.name}</h2>
                {sub.subscription && (
                  <Badge color={sub.subscription.status === 'ACTIVE' ? 'green' : 'amber'}>
                    {sub.subscription.status}
                  </Badge>
                )}
                {sub.subscription?.stripe_cancel_at_period_end && (
                  <Badge color="amber">Ending</Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {sub.subscription?.billing_interval === 'YEARLY' ? 'Yearly' : 'Monthly'}
                {sub.subscription?.stripe_current_period_end ? (
                  <>
                    {' · '}
                    {sub.subscription.stripe_cancel_at_period_end ? 'ends ' : 'renews '}
                    {format(
                      new Date(sub.subscription.stripe_current_period_end),
                      'd MMM yyyy',
                    )}
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sub.subscription?.stripe_subscription_id && (
              <Button
                variant="secondary"
                size="md"
                loading={openingPortal}
                onClick={() => void handleOpenPortal()}
              >
                <ExternalLink size={14} />
                Manage in portal
              </Button>
            )}
            {sub.subscription &&
              !sub.subscription.stripe_cancel_at_period_end &&
              sub.subscription.status !== 'CANCELLED' &&
              sub.subscription.stripe_subscription_id && (
                <Button
                  variant="ghost"
                  size="md"
                  loading={cancelling}
                  onClick={() => void handleCancel()}
                >
                  <XCircle size={14} />
                  Cancel
                </Button>
              )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
          <p className="text-sm font-medium text-amber-300">No active subscription</p>
          <p className="mt-1 text-xs text-amber-300/80">
            Pick any plan below to activate.
          </p>
        </div>
      )}

      {/* ── Billing interval toggle ────────────────────────────────────────── */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-full bg-slate-900 border border-slate-800 p-1">
          <IntervalButton
            active={billing === 'monthly'}
            onClick={() => setBilling('monthly')}
            label="Monthly"
          />
          <IntervalButton
            active={billing === 'yearly'}
            onClick={() => setBilling('yearly')}
            label="Yearly"
            {...(computeMaxYearlySavings(filtered) > 0 && {
              badge: `Save ${computeMaxYearlySavings(filtered)}%`,
            })}
          />
        </div>
      </div>

      {/* ── Plan grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            audience={audience}
            currentPlan={currentPlan}
            billing={billing}
            currentInterval={sub.subscription?.billing_interval ?? 'MONTHLY'}
            isCurrent={currentPlan?.id === plan.id}
            loading={submittingPlanId === plan.id}
            onSwitch={() => void handleSwitch(plan)}
          />
        ))}
      </div>

      <p className="text-center text-xs text-slate-600 pt-2">
        Stripe handles all paid subscriptions securely · Cancel any time
      </p>
    </div>
  );
}

// ─── PlanCard ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  audience,
  currentPlan,
  billing,
  currentInterval,
  isCurrent,
  loading,
  onSwitch,
}: {
  plan: PublicPlan;
  audience: 'CUSTOMER' | 'SUPPLIER';
  currentPlan: PublicPlan | null;
  billing: 'monthly' | 'yearly';
  currentInterval: 'MONTHLY' | 'YEARLY';
  isCurrent: boolean;
  loading: boolean;
  onSwitch: () => void;
}) {
  const priceStr = billing === 'monthly' ? plan.monthly_price_aud : plan.yearly_price_aud;
  const priceNum = priceStr ? Number(priceStr) : null;
  const isFree = priceNum !== null && priceNum === 0;
  const hasStripePrice =
    billing === 'monthly' ? !!plan.stripe_price_id_monthly : !!plan.stripe_price_id_yearly;
  const hasPrice = isFree || hasStripePrice;

  // Compare to current plan to determine direction
  const direction = useMemo(() => {
    if (!currentPlan) return 'none';
    if (currentPlan.id === plan.id) {
      // Same plan — only meaningful action is interval switch
      const targetInterval = billing.toUpperCase();
      return currentInterval === targetInterval ? 'current' : 'switch_interval';
    }
    if (plan.sort_order > currentPlan.sort_order) return 'upgrade';
    if (plan.sort_order < currentPlan.sort_order) return 'downgrade';
    return 'sidegrade';
  }, [currentPlan, plan, billing, currentInterval]);

  const accent = plan.highlight_color ?? '#14b8a6';

  // Build feature list. Customer-side: render the six customer quotas
  // explicitly (with green ✓ when included, red ✗ when value === 0) so
  // the user can see at a glance what's in their plan vs upgrades.
  // Supplier-side: existing free-form list with green ticks across the
  // available limits + flags + custom features.
  type Feature = { label: string; included: boolean };
  const features: Feature[] = [];

  if (audience === 'CUSTOMER') {
    // Order matches the matrix in docs/customer-subscription-plan.html §1.
    features.push(buildCustomerFeature('Task bookings / month', plan.max_task_bookings_per_month));
    features.push(buildCustomerFeature('Active orders', plan.max_active_orders));
    features.push(buildCustomerFeature('Total orders / month', plan.max_orders_per_month));
    features.push(buildCustomerFeature('AI scopes / month', plan.max_ai_requests_per_month));
    features.push(buildCustomerFeature('Contracts / month', plan.max_contracts_per_month));
    features.push(buildCustomerFeature('Active tenders', plan.max_active_tenders));
    // Always-included trust items kept short and not duplicated with limits
    features.push({ label: 'Order history retained for 36 months', included: true });
    features.push({ label: 'Raise disputes', included: true });
  } else {
    // Supplier audience — explicit 9-quota matrix (see
    // docs/supplier-subscription-plan.html §4). Same ✓/✗ rendering as
    // customers: 0 = red ✗ with strikethrough; positive = green ✓.
    features.push(buildCustomerFeature('Active listings', plan.max_active_tasks));
    features.push(buildCustomerFeature('Catalogue size', plan.allowed_listing_items));
    features.push(buildCustomerFeature('Active orders', plan.max_active_orders));
    features.push(buildCustomerFeature('Orders / month', plan.max_orders_per_month));
    features.push(buildCustomerFeature('Active tender bids', plan.max_active_tenders));
    features.push(buildCustomerFeature('Active contracts', plan.max_active_contracts));
    features.push(buildCustomerFeature('Bids / month', plan.max_bids_per_month));
    features.push(buildCustomerFeature('Domain categories', plan.max_domain_categories));
    features.push(buildCustomerFeature('Team seats', plan.max_team_seats));
    // Feature flags as add-on rows (only when included — no ✗ for absent
    // flags since the quota grid above is the primary differentiator).
    if (plan.allow_priority_listing) features.push({ label: 'Priority listing', included: true });
    if (plan.allow_advanced_analytics) features.push({ label: 'Advanced analytics', included: true });
    if (plan.allow_dedicated_manager) features.push({ label: 'Dedicated account manager', included: true });
    if (plan.allow_api_access) features.push({ label: 'API access', included: true });
    if (plan.allow_whitelabel) features.push({ label: 'White-label', included: true });
    if (plan.allow_sso) features.push({ label: 'SSO / SAML', included: true });
  }

  // Diff vs current — disabled for both audiences. Both render the full
  // quota matrix explicitly, so a "+ X more orders" diff would duplicate
  // information the user is already seeing in the row above.
  const diff: ReturnType<typeof buildDiff> = [];

  return (
    <div
      className={`relative flex flex-col rounded-2xl p-5 transition-all ${
        isCurrent ? 'ring-2' : 'border'
      } ${isCurrent ? '' : 'border-slate-800'} bg-slate-900`}
      style={{
        ...(isCurrent && { '--tw-ring-color': accent } as React.CSSProperties),
      }}
    >
      {plan.badge_text && !isCurrent && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ background: accent, color: '#0f172a' }}
        >
          {plan.badge_text}
        </div>
      )}
      {isCurrent && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ background: accent, color: '#0f172a' }}
        >
          Your plan
        </div>
      )}

      <div className="flex-1">
        <h3 className="text-base font-bold font-display text-slate-100">{plan.name}</h3>
        {plan.description && (
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">{plan.description}</p>
        )}

        <div className="mt-4">
          {priceNum !== null ? (
            isFree ? (
              <div>
                <span className="text-3xl font-bold tabular-nums text-slate-100">Free</span>
                <p className="mt-0.5 text-[11px] text-slate-500">no credit card</p>
              </div>
            ) : (
              <div>
                <span className="text-3xl font-bold tabular-nums text-slate-100">
                  ${priceNum.toFixed(0)}
                </span>
                <span className="ml-1.5 text-xs text-slate-500">
                  / {billing === 'monthly' ? 'mo' : 'yr'} AUD
                </span>
                {plan.trial_days > 0 && hasPrice && (
                  <p className="mt-0.5 text-[11px]" style={{ color: accent }}>
                    <Sparkles size={10} className="inline -mt-0.5 mr-0.5" />
                    {plan.trial_days}-day trial
                  </p>
                )}
              </div>
            )
          ) : (
            <span className="text-sm text-slate-500">No {billing} price</span>
          )}
        </div>

        {/* Diff vs current — only on non-current plans */}
        {diff.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-slate-800 pt-3">
            {diff.map((d, i) => (
              <li
                key={i}
                className={`text-[11px] flex items-start gap-1.5 ${
                  d.kind === 'gain' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                <span className="shrink-0">{d.kind === 'gain' ? '+' : '−'}</span>
                <span>{d.label}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Feature list — every quota row shown explicitly, included or not
            (✓ for available, red ✗ + strikethrough for "not included").
            Same treatment for both audiences post-2026-05-06: hiding rows
            after #6 made the cards harder to compare and broke the "see what
            you'd unlock by upgrading" intent. */}
        <ul className="mt-3 space-y-1.5">
          {features.map((f, i) => (
            <li
              key={i}
              className={`flex items-start gap-1.5 text-xs ${
                f.included ? 'text-slate-400' : 'text-slate-600 line-through decoration-slate-700'
              }`}
            >
              {f.included ? (
                <Check size={11} className="shrink-0 mt-0.5" style={{ color: accent }} />
              ) : (
                <XIcon size={11} className="shrink-0 mt-0.5 text-red-500/70" />
              )}
              <span>{f.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <div className="mt-5">
        {direction === 'current' ? (
          <Badge color="green" className="w-full justify-center py-2">
            <Lock size={11} />
            Active
          </Badge>
        ) : direction === 'switch_interval' ? (
          <Button
            variant="secondary"
            size="md"
            fullWidth
            disabled={!hasPrice}
            loading={loading}
            onClick={onSwitch}
          >
            <RefreshCw size={13} />
            Switch to {billing}
          </Button>
        ) : direction === 'upgrade' ? (
          <Button
            variant="primary"
            size="md"
            fullWidth
            disabled={!hasPrice}
            loading={loading}
            onClick={onSwitch}
          >
            <ArrowUp size={13} />
            Upgrade
          </Button>
        ) : direction === 'downgrade' ? (
          <Button
            variant="secondary"
            size="md"
            fullWidth
            disabled={!hasPrice}
            loading={loading}
            onClick={onSwitch}
          >
            <ArrowDown size={13} />
            Downgrade
          </Button>
        ) : direction === 'sidegrade' ? (
          <Button
            variant="secondary"
            size="md"
            fullWidth
            disabled={!hasPrice}
            loading={loading}
            onClick={onSwitch}
          >
            Switch
            <ArrowRight size={13} />
          </Button>
        ) : (
          // No current plan — just "Subscribe" / "Activate"
          <Button
            variant="primary"
            size="md"
            fullWidth
            disabled={!hasPrice}
            loading={loading}
            onClick={onSwitch}
          >
            {isFree ? 'Activate free' : 'Subscribe'}
            <ArrowRight size={13} />
          </Button>
        )}
        {!isCurrent && !hasPrice && (
          <p className="mt-1 text-center text-[10px] text-slate-600">
            Awaiting Stripe sync
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function IntervalButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
      {badge && (
        <span
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
            active ? 'bg-slate-950 text-teal-400' : 'bg-slate-800 text-teal-400'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Customer feature row builder. Maps a quota value to a Feature row:
//   - null    → "Unlimited <label>" with green tick
//   - 0       → "<label> — not included" with red X (struck-through in render)
//   - n > 0   → "<n> <label>" with green tick
function buildCustomerFeature(
  label: string,
  value: number | null,
): { label: string; included: boolean } {
  if (value === null) return { label: `Unlimited ${label.toLowerCase()}`, included: true };
  if (value === 0) return { label: `${label} — not included`, included: false };
  return { label: `${value} ${label.toLowerCase()}`, included: true };
}

function computeMaxYearlySavings(plans: PublicPlan[]): number {
  let max = 0;
  for (const p of plans) {
    if (!p.monthly_price_aud || !p.yearly_price_aud) continue;
    const m = Number(p.monthly_price_aud);
    const y = Number(p.yearly_price_aud);
    if (m <= 0 || y <= 0) continue;
    const annualMonthly = m * 12;
    if (annualMonthly <= y) continue;
    const savings = (annualMonthly - y) / annualMonthly;
    if (savings > max) max = savings;
  }
  return Math.round(max * 100);
}

interface DiffEntry {
  kind: 'gain' | 'lose';
  label: string;
}

const NUMERIC_LIMITS: { key: keyof PublicPlan; label: string }[] = [
  { key: 'max_orders_per_month', label: 'orders / month' },
  { key: 'max_active_orders', label: 'active orders' },
  { key: 'max_active_tasks', label: 'tasks / month' },
  { key: 'max_bids_per_month', label: 'tender responses / mo' },
  { key: 'max_active_tenders', label: 'active tenders' },
  { key: 'max_active_contracts', label: 'active contracts' },
  { key: 'max_ai_requests_per_month', label: 'AI requests / mo' },
  { key: 'max_domain_categories', label: 'domain categories' },
  { key: 'max_team_seats', label: 'team seats' },
];

const FLAG_LIMITS: { key: keyof PublicPlan; label: string }[] = [
  { key: 'allow_priority_listing', label: 'Priority listing' },
  { key: 'allow_advanced_analytics', label: 'Advanced analytics' },
  { key: 'allow_dedicated_manager', label: 'Dedicated manager' },
  { key: 'allow_api_access', label: 'API access' },
  { key: 'allow_custom_sla', label: 'Custom SLA' },
  { key: 'allow_whitelabel', label: 'White-label' },
  { key: 'allow_sso', label: 'SSO' },
  { key: 'allow_overseas_contractors', label: 'Overseas contractors' },
  { key: 'allow_project_mode', label: 'Project mode' },
];

function buildDiff(current: PublicPlan, target: PublicPlan): DiffEntry[] {
  const diffs: DiffEntry[] = [];
  // Numeric limits
  for (const { key, label } of NUMERIC_LIMITS) {
    const cv = current[key] as number | null;
    const tv = target[key] as number | null;
    if (cv === tv) continue;
    if (tv === null) diffs.push({ kind: 'gain', label: `Unlimited ${label}` });
    else if (cv === null) diffs.push({ kind: 'lose', label: `Capped at ${tv} ${label}` });
    else if (tv > cv) diffs.push({ kind: 'gain', label: `${tv} ${label} (was ${cv})` });
    else diffs.push({ kind: 'lose', label: `${tv} ${label} (was ${cv})` });
  }
  // Feature flags
  for (const { key, label } of FLAG_LIMITS) {
    const cv = current[key] as boolean;
    const tv = target[key] as boolean;
    if (cv === tv) continue;
    if (tv) diffs.push({ kind: 'gain', label });
    else diffs.push({ kind: 'lose', label });
  }
  return diffs;
}
