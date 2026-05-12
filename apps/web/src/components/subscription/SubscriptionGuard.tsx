'use client';

import Link from 'next/link';
import { Lock, ArrowRight } from 'lucide-react';
import {
  useSubscription,
  type FeatureFlag,
  type LimitType,
} from '@/hooks/useSubscription';
import { Button } from '@/components/ui/Button';
import { plansRouteFor } from '@/lib/customer-auth';

interface Props {
  /** Plan feature flag that must be true to render children */
  feature?: FeatureFlag;
  /**
   * Limit type that must have remaining headroom (current < limit) to render
   * children. If both `feature` and `limit` are passed, both must pass.
   */
  limit?: LimitType;
  /**
   * Replacement node to render when access is denied. If omitted, a default
   * upgrade prompt card is shown.
   */
  fallback?: React.ReactNode;
  /** What to render while the subscription query is loading. Defaults to null. */
  loadingFallback?: React.ReactNode;
  /**
   * If true, allow children when the user has no subscription at all (used for
   * "free tier" actions that still want to show a soft upgrade hint elsewhere).
   * Defaults to false — no sub means access denied.
   */
  allowAnonymous?: boolean;
  children: React.ReactNode;
}

// ─── SubscriptionGuard ───────────────────────────────────────────────────────
// Proactive gate. Use to conditionally render UI based on plan entitlement
// rather than waiting for a server 429. Pair with UpgradePromptModal (which
// handles the reactive case when the server denies an action).
//
// Usage:
//   <SubscriptionGuard feature="allow_api_access">
//     <ApiKeysPanel />
//   </SubscriptionGuard>
//
//   <SubscriptionGuard limit="tasks">
//     <PublishButton />
//   </SubscriptionGuard>
//
//   <SubscriptionGuard feature="allow_overseas_contractors" fallback={null}>
//     <OverseasFilter />
//   </SubscriptionGuard>

export default function SubscriptionGuard({
  feature,
  limit,
  fallback,
  loadingFallback = null,
  allowAnonymous = false,
  children,
}: Props) {
  const sub = useSubscription();

  if (sub.isLoading) return <>{loadingFallback}</>;

  // No active subscription
  if (!sub.isUsable) {
    if (allowAnonymous) return <>{children}</>;
    return <>{fallback ?? <UpgradeCard reason="no_subscription" />}</>;
  }

  // Feature flag check
  if (feature && !sub.checkFeature(feature)) {
    return (
      <>
        {fallback ?? (
          <UpgradeCard
            reason="feature"
            feature={feature}
            currentPlan={sub.plan?.name ?? null}
          />
        )}
      </>
    );
  }

  // Limit check
  if (limit) {
    const info = sub.checkLimit(limit);
    if (info && !info.unlimited && info.current >= (info.limit ?? 0)) {
      return (
        <>
          {fallback ?? (
            <UpgradeCard
              reason="limit"
              limit={limit}
              currentPlan={sub.plan?.name ?? null}
              limitInfo={info}
            />
          )}
        </>
      );
    }
  }

  return <>{children}</>;
}

// ─── Default upgrade card ────────────────────────────────────────────────────

function UpgradeCard({
  reason,
  feature,
  limit,
  currentPlan,
  limitInfo,
}: {
  reason: 'no_subscription' | 'feature' | 'limit';
  feature?: FeatureFlag;
  limit?: LimitType;
  currentPlan?: string | null;
  limitInfo?: { current: number; limit: number | null };
}) {
  const heading =
    reason === 'no_subscription'
      ? 'Subscription required'
      : reason === 'feature'
        ? 'Upgrade required'
        : 'Limit reached';

  const body = (() => {
    if (reason === 'no_subscription') {
      return 'This area is part of a paid subscription. Pick a plan to unlock it.';
    }
    if (reason === 'feature') {
      return `Your ${currentPlan ?? 'current'} plan does not include this feature. Upgrade to gain access.`;
    }
    if (reason === 'limit' && limitInfo && limit) {
      const label = formatLimit(limit);
      return `You have used ${limitInfo.current} of ${limitInfo.limit ?? 0} ${label} on the ${currentPlan ?? 'current'} plan. Upgrade to keep going.`;
    }
    return '';
  })();

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
      <div className="mx-auto inline-flex items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/30 p-3">
        <Lock size={20} className="text-teal-400" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-100">{heading}</h3>
      <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto">{body}</p>
      {feature && (
        <p className="mt-1 text-[11px] text-slate-600 font-mono">{feature}</p>
      )}
      <Button asChild variant="primary" size="md" className="mt-5">
        <Link href={plansRouteFor()}>
          View plans
          <ArrowRight size={14} />
        </Link>
      </Button>
    </div>
  );
}

function formatLimit(limit: LimitType): string {
  switch (limit) {
    case 'tasks':
      return 'active tasks';
    case 'projects':
      return 'active projects';
    case 'bids':
      return 'monthly bids';
    case 'ai_requests':
      return 'monthly AI requests';
    case 'team_seats':
      return 'team seats';
    case 'consultant_profiles':
      return 'consultant profiles';
    case 'orders':
      return 'monthly orders';
    case 'tenders':
      return 'active tenders';
    case 'active_orders':
      return 'active orders';
    case 'active_contracts':
      return 'active tender contracts';
    case 'domain_categories':
      return 'domain categories';
  }
}
