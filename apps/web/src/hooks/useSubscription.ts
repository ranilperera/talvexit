'use client';

import { useQuery } from '@tanstack/react-query';
import customerApi from '@/lib/customer-api';
import { getToken } from '@/lib/customer-auth';

// ─── Types (mirrors API response from /subscriptions/current) ────────────────

export type SubscriptionStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'TRIALING'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'PAUSED'
  | 'UNPAID';

export type FeatureFlag =
  | 'allow_overseas_contractors'
  | 'allow_project_mode'
  | 'allow_api_access'
  | 'allow_priority_listing'
  | 'allow_advanced_analytics'
  | 'allow_custom_sla'
  | 'allow_whitelabel'
  | 'allow_sso'
  | 'allow_bulk_po'
  | 'allow_compliance_docs'
  | 'allow_dedicated_manager'
  | 'allow_video_facility';

export type LimitType =
  | 'tasks'
  | 'projects'
  | 'bids'
  | 'ai_requests'
  | 'team_seats'
  | 'consultant_profiles'
  | 'orders'
  | 'tenders'
  | 'active_orders'
  | 'active_contracts'
  | 'domain_categories';

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  plan_type: string;
  description: string | null;
  monthly_price_aud: string | null;
  yearly_price_aud: string | null;
  badge_text: string | null;
  highlight_color: string | null;
  // Limits — null = unlimited
  max_active_tasks: number | null;
  max_active_projects: number | null;
  max_team_seats: number | null;
  max_consultant_profiles: number | null;
  max_bids_per_month: number | null;
  max_ai_requests_per_month: number | null;
  max_orders_per_month: number | null;
  max_active_tenders: number | null;
  max_active_orders: number | null;
  max_active_contracts: number | null;
  max_domain_categories: number | null;
  // Feature flags — server returns booleans for all 12
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
}

export interface CurrentSubscription {
  id: string;
  status: SubscriptionStatus;
  billing_interval: 'MONTHLY' | 'YEARLY';
  stripe_subscription_id: string | null;
  stripe_current_period_start: string | null;
  stripe_current_period_end: string | null;
  stripe_cancel_at_period_end: boolean;
  stripe_trial_end: string | null;
  current_task_count: number;
  current_project_count: number;
  current_bid_count: number;
  current_ai_request_count: number;
  current_order_count: number;
  current_tender_count: number;
  usage_reset_at: string | null;
  started_at: string | null;
  cancelled_at: string | null;
  plan: SubscriptionPlan;
}

export interface LimitInfo {
  current: number;
  limit: number | null; // null = unlimited
  remaining: number | null;
  pct: number; // 0–100, capped at 100
  unlimited: boolean;
}

export interface UseSubscriptionResult {
  subscription: CurrentSubscription | null;
  plan: SubscriptionPlan | null;
  isLoading: boolean;
  isError: boolean;
  isActive: boolean;
  /** True if status is ACTIVE or TRIALING */
  isUsable: boolean;
  /** Returns true if the plan includes the given feature flag and the sub is usable */
  checkFeature: (flag: FeatureFlag) => boolean;
  /** Returns LimitInfo or null if no subscription / plan */
  checkLimit: (limit: LimitType) => LimitInfo | null;
  /** Convenience map of all known limits → LimitInfo for the current plan */
  limits: Partial<Record<LimitType, LimitInfo>>;
  refetch: () => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export type SubscriptionSubjectKind = 'user' | 'company';

export function useSubscription(opts: { subject?: SubscriptionSubjectKind } = {}): UseSubscriptionResult {
  const subjectKind = opts.subject ?? 'user';
  const enabled = typeof window !== 'undefined' && !!getToken();

  const query = useQuery<CurrentSubscription | null>({
    queryKey: ['subscriptions', 'current', subjectKind],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const url =
        subjectKind === 'company'
          ? '/api/v1/subscriptions/current?subject=company'
          : '/api/v1/subscriptions/current';
      const res = await customerApi.get<{
        success: boolean;
        data: CurrentSubscription | null;
      }>(url);
      return res.data.data;
    },
  });

  const subscription = query.data ?? null;
  const plan = subscription?.plan ?? null;
  const isUsable =
    !!subscription && (subscription.status === 'ACTIVE' || subscription.status === 'TRIALING');
  const isActive = !!subscription && subscription.status === 'ACTIVE';

  function checkFeature(flag: FeatureFlag): boolean {
    if (!isUsable || !plan) return false;
    return Boolean(plan[flag]);
  }

  function buildLimitInfo(current: number, limit: number | null): LimitInfo {
    if (limit === null) {
      return { current, limit: null, remaining: null, pct: 0, unlimited: true };
    }
    const remaining = Math.max(0, limit - current);
    const pct = limit === 0 ? 100 : Math.min(100, Math.round((current / limit) * 100));
    return { current, limit, remaining, pct, unlimited: false };
  }

  function checkLimit(type: LimitType): LimitInfo | null {
    if (!subscription || !plan) return null;
    switch (type) {
      case 'tasks':
        return buildLimitInfo(subscription.current_task_count, plan.max_active_tasks);
      case 'projects':
        return buildLimitInfo(
          subscription.current_project_count,
          plan.max_active_projects,
        );
      case 'bids':
        return buildLimitInfo(subscription.current_bid_count, plan.max_bids_per_month);
      case 'ai_requests':
        return buildLimitInfo(
          subscription.current_ai_request_count,
          plan.max_ai_requests_per_month,
        );
      case 'team_seats':
        // current is computed from CompanyMember count server-side; not exposed
        // here. Surface only the limit so UI can show "X seats" without progress.
        return buildLimitInfo(0, plan.max_team_seats);
      case 'consultant_profiles':
        return buildLimitInfo(0, plan.max_consultant_profiles);
      case 'orders':
        return buildLimitInfo(subscription.current_order_count, plan.max_orders_per_month);
      case 'tenders':
        return buildLimitInfo(subscription.current_tender_count, plan.max_active_tenders);
      case 'active_orders':
        // Computed server-side; client only knows the limit.
        return buildLimitInfo(0, plan.max_active_orders);
      case 'active_contracts':
        return buildLimitInfo(0, plan.max_active_contracts);
      case 'domain_categories':
        return buildLimitInfo(0, plan.max_domain_categories);
    }
  }

  const limits: Partial<Record<LimitType, LimitInfo>> = {};
  if (plan && subscription) {
    for (const t of [
      'tasks',
      'projects',
      'bids',
      'ai_requests',
      'team_seats',
      'consultant_profiles',
      'orders',
      'tenders',
      'active_orders',
      'active_contracts',
      'domain_categories',
    ] as const) {
      const info = checkLimit(t);
      if (info) limits[t] = info;
    }
  }

  return {
    subscription,
    plan,
    isLoading: query.isLoading,
    isError: query.isError,
    isActive,
    isUsable,
    checkFeature,
    checkLimit,
    limits,
    refetch: () => {
      void query.refetch();
    },
  };
}
