'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  X as XIcon,
  Lock,
  CreditCard,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import axios from 'axios';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import { getToken } from '@/lib/customer-auth';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PublicPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  plan_type: string;
  monthly_price_aud: string | null;
  yearly_price_aud: string | null;
  trial_days: number;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  badge_text: string | null;
  highlight_color: string | null;
  custom_features: string[];
  max_active_tasks: number | null;
  max_team_seats: number | null;
  max_bids_per_month: number | null;
  max_ai_requests_per_month: number | null;
  max_orders_per_month: number | null;
  max_active_orders: number | null;
  max_active_tenders: number | null;
  max_active_contracts: number | null;
  max_domain_categories: number | null;
  allowed_listing_items: number | null;
  // Customer-side limits
  max_task_bookings_per_month: number | null;
  max_contracts_per_month: number | null;
  // Removed columns kept as optional for legacy callers — API stops returning
  // them after the 2026-05-06 supplier rebuild migration.
  max_active_projects?: number | null;
  max_consultant_profiles?: number | null;
  max_storage_gb?: number | null;
  allow_overseas_contractors: boolean;
  allow_project_mode: boolean;
  allow_priority_listing: boolean;
  allow_advanced_analytics: boolean;
  allow_custom_sla: boolean;
  allow_dedicated_manager: boolean;
}

interface CurrentSubscription {
  id: string;
  status: string;
  billing_interval: 'MONTHLY' | 'YEARLY';
  plan: { id: string; name: string };
}

const publicApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? '',
  timeout: 15000,
});

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubscribeClient() {
  const router = useRouter();
  const params = useSearchParams();

  const planId = params.get('plan_id');
  const initialInterval =
    (params.get('interval') as 'monthly' | 'yearly') ?? 'monthly';
  // Optional subject — set by /company/plans when COMPANY_ADMIN browses to
  // checkout, so the resulting Stripe customer + Subscription row is owned
  // by the ConsultingCompany rather than the admin's personal account.
  const subjectKind = params.get('subject') === 'company' ? 'company' : 'user';
  const subjectQS = subjectKind === 'company' ? '?subject=company' : '';

  const [interval, setInterval] = useState<'monthly' | 'yearly'>(
    initialInterval === 'yearly' ? 'yearly' : 'monthly',
  );
  const [plan, setPlan] = useState<PublicPlan | null>(null);
  const [currentSub, setCurrentSub] = useState<CurrentSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authed, setAuthed] = useState(false);

  const fetchData = useCallback(async () => {
    if (!planId) {
      setLoading(false);
      return;
    }
    try {
      // Plans endpoint is public; no auth needed
      const plansRes = await publicApi.get<{
        success: boolean;
        data: PublicPlan[];
      }>('/api/v1/subscriptions/plans');
      const found = plansRes.data.data.find((p) => p.id === planId);
      setPlan(found ?? null);

      // Current sub only if authed
      if (getToken()) {
        try {
          const cur = await customerApi.get<{
            success: boolean;
            data: CurrentSubscription | null;
          }>(`/api/v1/subscriptions/current${subjectQS}`);
          setCurrentSub(cur.data.data);
        } catch {
          // ignore — interceptor handles 401
        }
      }
    } finally {
      setLoading(false);
    }
  }, [planId, subjectQS]);

  useEffect(() => {
    setAuthed(!!getToken());
    void fetchData();
  }, [fetchData]);

  async function handleSubscribe() {
    if (!plan) return;
    if (!authed) {
      const subjectQuery = subjectKind === 'company' ? '&subject=company' : '';
      router.push(
        `/login?return=${encodeURIComponent(`/subscribe?plan_id=${plan.id}&interval=${interval}${subjectQuery}`)}`,
      );
      return;
    }
    // Paid plans require a Stripe price ID; free plans bypass Stripe so this
    // guard only applies when the plan has a non-zero price.
    const planPrice = interval === 'monthly'
      ? plan.monthly_price_aud
      : plan.yearly_price_aud;
    const isPaid = planPrice != null && Number(planPrice) > 0;
    const priceId =
      interval === 'monthly'
        ? plan.stripe_price_id_monthly
        : plan.stripe_price_id_yearly;
    if (isPaid && !priceId) return;

    setSubmitting(true);
    try {
      const res = await customerApi.post<{
        success: boolean;
        data: { checkout_url: string };
      }>(`/api/v1/subscriptions/checkout${subjectQS}`, {
        plan_id: plan.id,
        interval,
      });
      window.location.href = res.data.data.checkout_url;
    } catch {
      // toast surfaced by interceptor
      setSubmitting(false);
    }
  }

  // ── Render: missing plan_id ───────────────────────────────────────────────

  if (!planId) {
    return (
      <CenterShell>
        <h1 className="text-2xl font-bold font-display text-slate-100">
          No plan selected
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          Pick a plan from the pricing page first.
        </p>
        <Button asChild variant="primary" size="lg" className="mt-6">
          <Link href="/pricing">View pricing</Link>
        </Button>
      </CenterShell>
    );
  }

  if (loading) {
    return (
      <CenterShell>
        <RefreshCw size={28} className="animate-spin text-slate-500 mx-auto" />
        <p className="mt-4 text-sm text-slate-500">Loading plan…</p>
      </CenterShell>
    );
  }

  // ── Render: plan not found ────────────────────────────────────────────────

  if (!plan) {
    return (
      <CenterShell>
        <h1 className="text-2xl font-bold font-display text-slate-100">
          Plan not found
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          This plan may have been removed or changed.
        </p>
        <Button asChild variant="primary" size="lg" className="mt-6">
          <Link href="/pricing">Back to pricing</Link>
        </Button>
      </CenterShell>
    );
  }

  const priceStr =
    interval === 'monthly' ? plan.monthly_price_aud : plan.yearly_price_aud;
  const price = priceStr ? Number(priceStr) : null;
  const isFree = price !== null && price === 0;
  const hasStripePrice =
    interval === 'monthly'
      ? !!plan.stripe_price_id_monthly
      : !!plan.stripe_price_id_yearly;
  // Free plans bypass Stripe — always activatable. Paid plans need a price ID.
  const hasPrice = isFree || hasStripePrice;

  const sameAsCurrent =
    currentSub?.plan.id === plan.id &&
    currentSub.billing_interval === (interval === 'monthly' ? 'MONTHLY' : 'YEARLY');
  const onDifferentPlan =
    currentSub != null && currentSub.status !== 'CANCELLED' && !sameAsCurrent;

  // Build feature list. Audience-aware: customer plans render the six
  // customer-side quotas explicitly (with ✓/✗ for included vs excluded);
  // supplier plans get the longer free-form list of supplier limits and
  // feature flags. Same pattern as PlanSelector.
  type Feature = { label: string; included: boolean };
  const features: Feature[] = [];
  const isCustomerPlan = plan.plan_type.startsWith('CUSTOMER_');

  if (isCustomerPlan) {
    features.push(buildCustomerFeature('Task bookings / month', plan.max_task_bookings_per_month));
    features.push(buildCustomerFeature('Active orders', plan.max_active_orders));
    features.push(buildCustomerFeature('Total orders / month', plan.max_orders_per_month));
    features.push(buildCustomerFeature('AI scopes / month', plan.max_ai_requests_per_month));
    features.push(buildCustomerFeature('Contracts / month', plan.max_contracts_per_month));
    features.push(buildCustomerFeature('Active tenders', plan.max_active_tenders));
    features.push({ label: 'Order history retained for 36 months', included: true });
    features.push({ label: 'Raise disputes', included: true });
  } else {
    // Supplier audience — explicit 9-quota matrix per
    // docs/supplier-subscription-plan.html §4. ✓ for positive, ✗ for 0.
    features.push(buildCustomerFeature('Active listings', plan.max_active_tasks));
    features.push(buildCustomerFeature('Catalogue size', plan.allowed_listing_items));
    features.push(buildCustomerFeature('Active orders', plan.max_active_orders));
    features.push(buildCustomerFeature('Orders / month', plan.max_orders_per_month));
    features.push(buildCustomerFeature('Active tender bids', plan.max_active_tenders));
    features.push(buildCustomerFeature('Active contracts', plan.max_active_contracts));
    features.push(buildCustomerFeature('Bids / month', plan.max_bids_per_month));
    features.push(buildCustomerFeature('Domain categories', plan.max_domain_categories));
    features.push(buildCustomerFeature('Team seats', plan.max_team_seats));
    if (plan.allow_priority_listing) features.push({ label: 'Priority listing', included: true });
    if (plan.allow_advanced_analytics) features.push({ label: 'Advanced analytics', included: true });
    if (plan.allow_custom_sla) features.push({ label: 'Custom SLA', included: true });
    if (plan.allow_dedicated_manager) features.push({ label: 'Dedicated account manager', included: true });
    if (plan.allow_overseas_contractors) features.push({ label: 'Overseas contractors', included: true });
    if (plan.allow_project_mode) features.push({ label: 'Project mode', included: true });
  }

  const accent = plan.highlight_color ?? '#14b8a6';

  // Back-target resolves to the page the user was on before checkout. Falls
  // back to /pricing only for anon visitors who deep-linked here without
  // having gone through an authed plan picker.
  //   - subject=company → /company/plans (company admin managing their org's sub)
  //   - supplier plan + authed → /contractor/plans
  //   - customer plan + authed → /customer/plans
  //   - anon / unknown → /pricing (public)
  const backHref = !authed
    ? '/pricing'
    : subjectKind === 'company'
      ? '/company/plans'
      : plan.plan_type.startsWith('SUPPLIER_')
        ? '/contractor/plans'
        : '/customer/plans';

  return (
    <div className="min-h-screen bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 no-underline"
        >
          <ArrowLeft size={12} />
          Back to plans
        </Link>

        <h1 className="mt-3 text-3xl font-bold font-display text-slate-100">
          Confirm your subscription
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Review the plan below, then continue to Stripe to enter payment details.
          You can cancel any time from the billing portal.
        </p>

        {/* ── Already on this plan banner ─────────────────────────────────── */}
        {sameAsCurrent && (
          <div className="mt-5 rounded-xl bg-teal-500/10 border border-teal-500/30 p-4 text-sm text-teal-300 flex items-start gap-3">
            <Check size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">
                You&apos;re already subscribed to {plan.name} ({interval}).
              </p>
              <p className="mt-0.5 text-teal-300/80 text-xs">
                Manage your existing subscription from the billing dashboard.
              </p>
            </div>
          </div>
        )}

        {/* ── Active different plan banner ────────────────────────────────── */}
        {onDifferentPlan && (
          <div className="mt-5 rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-sm text-amber-300 flex items-start gap-3">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">
                Switching from your current plan
              </p>
              <p className="mt-0.5 text-amber-300/80 text-xs">
                You&apos;re currently on{' '}
                <span className="font-semibold">{currentSub.plan.name}</span> (
                {currentSub.billing_interval.toLowerCase()}). Subscribing here
                will replace it. Stripe will prorate the difference automatically.
              </p>
            </div>
          </div>
        )}

        {/* ── Plan summary card ───────────────────────────────────────────── */}
        <div
          className="mt-6 rounded-2xl bg-slate-900 p-6 border-2"
          style={{ borderColor: plan.badge_text ? accent : '#1e293b' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-100">
                  {plan.name}
                </h2>
                {plan.badge_text && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
                    style={{ background: accent, color: '#0f172a' }}
                  >
                    {plan.badge_text}
                  </span>
                )}
              </div>
              {plan.description && (
                <p className="mt-1 text-sm text-slate-400">{plan.description}</p>
              )}
            </div>
            <Badge color="slate">{plan.plan_type.replace(/_/g, ' ')}</Badge>
          </div>

          {/* Interval toggle */}
          <div className="mt-5 inline-flex items-center gap-1 rounded-full bg-slate-950 border border-slate-800 p-1">
            <IntervalButton
              active={interval === 'monthly'}
              onClick={() => setInterval('monthly')}
              label="Monthly"
              available={!!plan.stripe_price_id_monthly}
            />
            <IntervalButton
              active={interval === 'yearly'}
              onClick={() => setInterval('yearly')}
              label="Yearly"
              available={!!plan.stripe_price_id_yearly}
            />
          </div>

          {/* Price */}
          <div className="mt-5 pt-5 border-t border-slate-800">
            <div className="flex items-end justify-between">
              <div>
                {price !== null ? (
                  <>
                    <span className="text-4xl font-bold text-slate-100 tabular-nums">
                      ${price.toFixed(0)}
                    </span>
                    <span className="ml-2 text-sm text-slate-500">
                      AUD / {interval === 'monthly' ? 'month' : 'year'}
                    </span>
                  </>
                ) : (
                  <span className="text-base text-slate-500">
                    No {interval} price configured
                  </span>
                )}
                {plan.trial_days > 0 && hasPrice && (
                  <p className="mt-1 text-xs" style={{ color: accent }}>
                    Includes {plan.trial_days}-day free trial
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Features. Customer plans use ✓/✗ so excluded quotas (e.g.
              "Contracts / month — not included" on Free Starter) are
              visibly distinct from included ones. */}
          <ul className="mt-5 space-y-2.5 pt-5 border-t border-slate-800">
            {features.map((f, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 text-sm ${
                  f.included
                    ? 'text-slate-300'
                    : 'text-slate-500 line-through decoration-slate-700'
                }`}
              >
                {f.included ? (
                  <Check
                    size={14}
                    className="shrink-0 mt-0.5"
                    style={{ color: accent }}
                  />
                ) : (
                  <XIcon size={14} className="shrink-0 mt-0.5 text-red-500/70" />
                )}
                <span>{f.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Trust / activation line ────────────────────────────────────── */}
        <div className="mt-5 flex items-center gap-2 text-xs text-slate-500 justify-center">
          <Lock size={12} />
          {isFree
            ? 'Free plan — no credit card required'
            : 'Secure payment by Stripe — we never see your card details'}
        </div>

        {/* ── CTA ────────────────────────────────────────────────────────── */}
        <div className="mt-6">
          {sameAsCurrent ? (
            <Button asChild variant="secondary" size="lg" fullWidth>
              <Link href={subjectKind === 'company' ? '/company/billing' : '/billing'}>
                Manage in billing
              </Link>
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={!hasPrice}
              onClick={() => void handleSubscribe()}
            >
              <CreditCard size={16} />
              {hasPrice
                ? authed
                  ? isFree
                    ? 'Activate free plan'
                    : 'Subscribe with Stripe'
                  : isFree
                    ? 'Sign in to activate'
                    : 'Sign in to subscribe'
                : 'Unavailable'}
            </Button>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-600">
          By subscribing, you agree to our{' '}
          <Link
            href="/terms"
            className="underline hover:text-slate-400 no-underline"
          >
            terms
          </Link>{' '}
          and{' '}
          <Link
            href="/privacy"
            className="underline hover:text-slate-400 no-underline"
          >
            privacy policy
          </Link>
          . Cancel any time.
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CenterShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-12">
      <div className="text-center max-w-md">{children}</div>
    </div>
  );
}

function IntervalButton({
  active,
  onClick,
  label,
  available,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  available: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!available}
      className="px-4 py-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: active ? '#14b8a6' : 'transparent',
        color: active ? '#0f172a' : '#94a3b8',
      }}
    >
      {label}
    </button>
  );
}

// Customer feature row builder — same shape as PlanSelector.buildCustomerFeature.
// null = Unlimited (✓), 0 = Not included (✗), n > 0 = "<n> <label>" (✓).
function buildCustomerFeature(
  label: string,
  value: number | null,
): { label: string; included: boolean } {
  if (value === null) return { label: `Unlimited ${label.toLowerCase()}`, included: true };
  if (value === 0) return { label: `${label} — not included`, included: false };
  return { label: `${value} ${label.toLowerCase()}`, included: true };
}
