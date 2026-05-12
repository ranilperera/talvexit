'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Briefcase,
  Bot,
  FileText,
  ListChecks,
  Users,
  AlertTriangle,
  ArrowRight,
  ShoppingCart,
  FileSearch,
  Truck,
  FileSignature,
  Layers,
} from 'lucide-react';
import SubscriptionSection from '@/components/customer/SubscriptionSection';
import SubscriptionUsagePanel from '@/components/customer/SubscriptionUsagePanel';
import SupplierUsagePanel from '@/components/supplier/SupplierUsagePanel';
import { Button } from '@/components/ui/Button';
import {
  useSubscription,
  type LimitType,
  type LimitInfo,
} from '@/hooks/useSubscription';
import { plansRouteFor, getUser } from '@/lib/customer-auth';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BillingDashboardProps {
  /**
   * Which sub to manage. 'user' (default) = caller's personal sub.
   * 'company' = the consulting company they primary-admin (used by
   * /company/billing).
   */
  subject?: 'user' | 'company';
  /** Override the "View plans" link target. Defaults to plansRouteFor(). */
  plansHrefOverride?: string;
  /** Override the "Order history" link target. */
  orderHistoryHref?: string;
  /** Hide the "Order history" link entirely (e.g. company billing). */
  hideOrderHistoryLink?: boolean;
  /** Override the page title. Defaults to "Billing". */
  title?: string;
  /** Override the page subtitle. */
  subtitle?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Reusable billing dashboard. Used by both /billing (personal sub) and
 * /company/billing (company sub via subject='company'). Lives outside the
 * /app tree because Next.js doesn't allow named exports from page.tsx files.
 */
export function BillingDashboard({
  subject = 'user',
  plansHrefOverride,
  orderHistoryHref,
  hideOrderHistoryLink,
  title,
  subtitle,
}: BillingDashboardProps) {
  const sub = useSubscription({ subject });
  const plansHref = plansHrefOverride ?? plansRouteFor();

  // Audience-aware usage panels (rebuilt 2026-05-06):
  //   - Customers: SubscriptionUsagePanel (6 customer quotas)
  //   - Suppliers (individuals + companies): SupplierUsagePanel (9 quotas)
  //   - Both panels hit the same /subscriptions/me/usage endpoint and branch
  //     on the audience tag in the response.
  const [accountType, setAccountType] = useState<string | null>(null);
  useEffect(() => {
    setAccountType(getUser()?.account_type ?? null);
  }, []);
  const isCustomer = accountType === 'CUSTOMER' && subject === 'user';
  const isSupplier =
    accountType === 'INDIVIDUAL_CONTRACTOR' ||
    accountType === 'ORGANIZATION_ADMIN' ||
    accountType === 'COMPANY_ADMIN' ||
    subject === 'company';

  const showLegacyUsage = !isCustomer && !isSupplier && sub.isUsable && Object.keys(sub.limits).length > 0;
  const nearLimit =
    showLegacyUsage &&
    Object.values(sub.limits).some(
      (l) => !l.unlimited && l.pct >= 80,
    );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-100">
          {title ?? 'Billing'}
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          {subtitle ?? 'Manage your subscription, monitor usage, and download tax invoices.'}
        </p>
      </div>

      {/* ── Near-limit upgrade banner ────────────────────────────────────── */}
      {nearLimit && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3">
          <AlertTriangle
            size={18}
            className="text-amber-400 shrink-0 mt-0.5"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-300">
              You&apos;re close to a plan limit
            </p>
            <p className="mt-0.5 text-xs text-amber-300/80">
              One of your usage counters is above 80%. Upgrade to keep working
              without interruption.
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href={plansHref}>
              View plans
              <ArrowRight size={12} />
            </Link>
          </Button>
        </div>
      )}

      {/* ── Subscription card + invoices ────────────────────────────────── */}
      <SubscriptionSection subject={subject} />

      {/* ── Customer usage panel ─────────────────────────────────────────── */}
      {/* Six customer-specific quotas (Task bookings, Active orders, Total
          orders, AI scopes, Contracts, Active tenders), anniversary-monthly
          resets, tiered warning thresholds, closed-period history. */}
      {isCustomer && <SubscriptionUsagePanel />}

      {/* ── Supplier usage panel ─────────────────────────────────────────── */}
      {/* Nine supplier quotas (Active listings, Catalogue size, Active orders,
          Orders this period, Active tender bids, Active contracts, Bids this
          period, Domain categories, Team seats). */}
      {isSupplier && <SupplierUsagePanel />}

      {/* ── Legacy usage meters (admin / fallback) ───────────────────────── */}
      {showLegacyUsage && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Activity size={16} className="text-teal-400" />
                Usage this period
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Counters reset on the subscription anniversary each month for
                ACTIVE and TRIALING subscriptions.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={plansHref}>
                Upgrade plan
                <ArrowRight size={12} />
              </Link>
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <UsageMeter
              type="tasks"
              info={sub.limits.tasks}
              label="Active tasks"
              icon={ListChecks}
            />
            <UsageMeter
              type="projects"
              info={sub.limits.projects}
              label="Active projects"
              icon={Briefcase}
            />
            <UsageMeter
              type="bids"
              info={sub.limits.bids}
              label="Bids this month"
              icon={FileText}
            />
            <UsageMeter
              type="ai_requests"
              info={sub.limits.ai_requests}
              label="AI requests this month"
              icon={Bot}
            />
            <UsageMeter
              type="orders"
              info={sub.limits.orders}
              label="Orders this month"
              icon={ShoppingCart}
            />
            <UsageMeter
              type="tenders"
              info={sub.limits.tenders}
              label="Active tenders"
              icon={FileSearch}
            />
            {sub.plan?.max_active_orders !== null && (
              <UsageMeter
                type="active_orders"
                info={sub.limits.active_orders}
                label="Active orders (in delivery)"
                icon={Truck}
                showCounterAsBadge
              />
            )}
            {sub.plan?.max_active_contracts !== null && (
              <UsageMeter
                type="active_contracts"
                info={sub.limits.active_contracts}
                label="Active tender contracts"
                icon={FileSignature}
                showCounterAsBadge
              />
            )}
            {sub.plan?.max_domain_categories !== null && (
              <UsageMeter
                type="domain_categories"
                info={sub.limits.domain_categories}
                label="Domain categories"
                icon={Layers}
                showCounterAsBadge
              />
            )}
            {sub.plan?.max_team_seats !== null && (
              <UsageMeter
                type="team_seats"
                info={sub.limits.team_seats}
                label="Team seats"
                icon={Users}
                showCounterAsBadge
              />
            )}
          </div>
        </div>
      )}

      {/* ── Order history link (existing /customer/billing content) ──────── */}
      {!hideOrderHistoryLink && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-slate-200">
              Order history
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Per-engagement payments, escrow status, and order tax invoices.
            </p>
          </div>
          <Button asChild variant="secondary" size="md">
            <Link href={orderHistoryHref ?? '/customer/billing'}>
              View order history
              <ArrowRight size={14} />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── UsageMeter ──────────────────────────────────────────────────────────────

function UsageMeter({
  type,
  info,
  label,
  icon: Icon,
  showCounterAsBadge,
}: {
  type: LimitType;
  info: LimitInfo | undefined;
  label: string;
  icon: React.ElementType;
  /** If true, show "X / Y" badge instead of progress bar (for computed limits like team_seats) */
  showCounterAsBadge?: boolean;
}) {
  if (!info) return null;

  const isOver = !info.unlimited && info.current >= (info.limit ?? 0);
  const pct = info.unlimited ? 0 : info.pct;
  const barColor =
    pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-teal-500';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Icon size={14} className="text-slate-500" />
          <span>{label}</span>
        </div>
        {info.unlimited ? (
          <span className="text-[11px] uppercase tracking-wider text-teal-400 font-semibold">
            Unlimited
          </span>
        ) : showCounterAsBadge ? (
          <span className="text-xs font-mono text-slate-300">
            {info.current} / {info.limit}
          </span>
        ) : (
          <span
            className={`text-xs font-mono ${isOver ? 'text-red-400' : 'text-slate-300'}`}
          >
            <span className="tabular-nums">{info.current}</span>
            <span className="text-slate-600"> / </span>
            <span className="tabular-nums">{info.limit}</span>
          </span>
        )}
      </div>
      {!info.unlimited && !showCounterAsBadge && (
        <div className="mt-3 h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${Math.min(100, pct)}%` }}
            data-limit-type={type}
          />
        </div>
      )}
    </div>
  );
}
