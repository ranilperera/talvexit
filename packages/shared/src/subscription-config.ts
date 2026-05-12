// Single source of truth for customer subscription plans.
//
// Edit numbers here, then run `pnpm --filter @onys/api seed:subscriptions`
// — the seeder upserts SubscriptionPlan rows by slug and (if STRIPE_SECRET_KEY
// is set) updates Stripe Products/Prices to match. No schema migration needed
// for limit changes.
//
// Documented in docs/customer-subscription-plan.html. Quotas confirmed
// 2026-05-06; do NOT edit values without consulting that document, since
// the chosen numbers are tied to the pricing on the public /pricing page
// and to the Stripe price catalogue.

// ── Quota keys ──────────────────────────────────────────────────────────────
// One canonical key per quota. The same string is used to reference the
// limit in middleware (requireLimit('orders')), in the usage endpoint, and
// in the customer-facing billing UI labels.

export const CUSTOMER_QUOTA_KEYS = [
  'task_bookings', // Quota 1 — counter, monthly reset
  'active_orders', // Quota 2 — computed live (no counter)
  'orders',        // Quota 3 — counter, monthly reset
  'ai_scopes',     // Quota 4 — counter, monthly reset
  'contracts',     // Quota 5 — counter, monthly reset
  'active_tenders', // Quota 6 — computed live (no counter)
] as const;

export type CustomerQuotaKey = (typeof CUSTOMER_QUOTA_KEYS)[number];

// Quotas whose count is incremented on each gated action and reset to 0
// at every period boundary. The other two ("active_orders", "active_tenders")
// are derived from live row counts at check time.
export const COUNTER_QUOTAS: CustomerQuotaKey[] = [
  'task_bookings',
  'orders',
  'ai_scopes',
  'contracts',
];

// ── Plan definitions ────────────────────────────────────────────────────────
// `null` for any limit means unlimited. The check returns `allowed: true`
// when the plan limit is null (matches the existing convention used by
// supplier-side plans).

export interface CustomerPlanLimits {
  task_bookings: number | null;
  active_orders: number | null;
  orders: number | null;
  ai_scopes: number | null;
  contracts: number | null;
  active_tenders: number | null;
}

export interface CustomerPlanDef {
  slug: string;
  name: string;
  plan_type:
    | 'CUSTOMER_STARTER'
    | 'CUSTOMER_BUSINESS'
    | 'CUSTOMER_PROFESSIONAL'
    | 'CUSTOMER_ENTERPRISE';
  description: string;
  price_aud_monthly: number;
  price_aud_yearly: number; // convention: 10 × monthly
  trial_days: number;
  auto_activate_on_signup: boolean; // exactly one customer plan should be true
  badge_text?: string;
  cta_text: string;
  highlight_color: string;
  sort_order: number;
  limits: CustomerPlanLimits;
}

export const CUSTOMER_PLANS: Readonly<Record<string, CustomerPlanDef>> = {
  'customer-starter': {
    slug: 'customer-starter',
    name: 'Free Starter',
    plan_type: 'CUSTOMER_STARTER',
    description:
      'Get started on TalvexIT. Browse providers, book a small task, see how the workflow feels — no credit card required.',
    price_aud_monthly: 0,
    price_aud_yearly: 0,
    trial_days: 0,
    auto_activate_on_signup: true,
    cta_text: 'Get Started',
    highlight_color: '#64748b',
    sort_order: 10,
    limits: {
      task_bookings: 2,
      active_orders: 1,
      orders: 2,
      ai_scopes: 0,
      contracts: 0,
      active_tenders: 0,
    },
  },
  'customer-business': {
    slug: 'customer-business',
    name: 'Business',
    plan_type: 'CUSTOMER_BUSINESS',
    description:
      'For small teams making regular IT engagements — light AI scoping, structured contracts, formal tenders when you need them.',
    price_aud_monthly: 49,
    price_aud_yearly: 490,
    trial_days: 14,
    auto_activate_on_signup: false,
    cta_text: 'Start Trial',
    highlight_color: '#14b8a6',
    sort_order: 20,
    limits: {
      task_bookings: 5,
      active_orders: 2,
      orders: 5,
      ai_scopes: 1,
      contracts: 1,
      active_tenders: 1,
    },
  },
  'customer-professional': {
    slug: 'customer-professional',
    name: 'Professional',
    plan_type: 'CUSTOMER_PROFESSIONAL',
    description:
      'For growing teams running multiple IT engagements at once — full AI scoping, parallel tenders, ongoing contracts.',
    price_aud_monthly: 99,
    price_aud_yearly: 990,
    trial_days: 14,
    auto_activate_on_signup: false,
    badge_text: 'Most Popular',
    cta_text: 'Start Trial',
    highlight_color: '#0ea5e9',
    sort_order: 30,
    limits: {
      task_bookings: 10,
      active_orders: 5,
      orders: 10,
      ai_scopes: 5,
      contracts: 5,
      active_tenders: 2,
    },
  },
  'customer-enterprise': {
    slug: 'customer-enterprise',
    name: 'Enterprise',
    plan_type: 'CUSTOMER_ENTERPRISE',
    description:
      'For organisations procuring IT at scale — high concurrent engagements, parallel tenders, audit-ready volume.',
    price_aud_monthly: 299,
    price_aud_yearly: 2990,
    trial_days: 14,
    auto_activate_on_signup: false,
    cta_text: 'Start Trial',
    highlight_color: '#8b5cf6',
    sort_order: 40,
    limits: {
      task_bookings: 25,
      active_orders: 20,
      orders: 25,
      ai_scopes: 10,
      contracts: 10,
      active_tenders: 5,
    },
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

export const CUSTOMER_PLAN_LIST: CustomerPlanDef[] = Object.values(CUSTOMER_PLANS);

export const AUTO_ACTIVATE_CUSTOMER_PLAN_SLUG: string =
  CUSTOMER_PLAN_LIST.find((p) => p.auto_activate_on_signup)?.slug ?? 'customer-starter';

// Soft-cap warning threshold per plan.
//   - Free + Business / Free + Solo: warn at remaining <= 1 (caps are tiny)
//   - Professional + Enterprise / Company + Global: warn at remaining <= 20%
//   - Unlimited (null) plans never warn.
//
// Returns the threshold count (an integer); the UI compares remaining <= threshold.
export function warningThresholdFor(planSlug: string, limit: number | null): number {
  if (limit === null || limit === 0) return 0;
  const HIGHER_TIER = new Set([
    'customer-professional',
    'customer-enterprise',
    'supplier-company-starter',
    'supplier-global',
  ]);
  if (HIGHER_TIER.has(planSlug)) {
    return Math.max(1, Math.ceil(limit * 0.2));
  }
  return 1;
}

// Retention — keep SubscriptionUsageHistory rows for 36 months. Older rows
// are removed by a daily prune job. Customers can still see the current
// period and the 36 most recent closed periods at any time.
export const USAGE_HISTORY_RETENTION_MONTHS = 36;

// ─── SUPPLIER PLANS ─────────────────────────────────────────────────────────
// Companion to CUSTOMER_PLANS above. Edit numbers here, run
// `pnpm --filter @onys/api seed:subscriptions`. Documented in
// docs/supplier-subscription-plan.html — confirmed 2026-05-06.
//
// Differs from customer plans in three ways:
//   - No trials (suppliers must commit to paid to publish > 1 listing)
//   - Hard caps on every tier including Global (no `null` / unlimited)
//   - 9 quotas (7 computed + 2 counter), not 6

export const SUPPLIER_QUOTA_KEYS = [
  'active_tasks',      // computed — currently-published listings
  'listing_items',     // computed — total catalogue size (incl. drafts)
  'active_orders',     // computed — orders currently in delivery
  'orders',            // counter, monthly — orders accepted this period
  'active_tenders',    // computed — live bid submissions
  'active_contracts',  // computed — tender contracts in delivery
  'bids',              // counter, monthly — bids placed this period
  'domain_categories', // computed — length of domains[]
  'team_seats',        // computed — active CompanyMember rows
] as const;

export type SupplierQuotaKey = (typeof SUPPLIER_QUOTA_KEYS)[number];

// Quotas that increment a counter on each gated action and reset to 0 at
// every period boundary. Everything else is computed live from row counts.
export const SUPPLIER_COUNTER_QUOTAS: SupplierQuotaKey[] = ['orders', 'bids'];

export interface SupplierPlanLimits {
  active_tasks: number;
  listing_items: number;
  active_orders: number;
  orders: number;
  active_tenders: number;
  active_contracts: number;
  bids: number;
  domain_categories: number;
  team_seats: number;
}

export type SupplierFeatureFlag =
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

export interface SupplierPlanDef {
  slug: string;
  name: string;
  plan_type:
    | 'SUPPLIER_FREE'
    | 'SUPPLIER_SOLO'
    | 'SUPPLIER_COMPANY_STARTER'
    | 'SUPPLIER_GLOBAL';
  description: string;
  price_aud_monthly: number;
  price_aud_yearly: number;          // = 10 × monthly
  price_usd_monthly?: number;        // Global only
  price_usd_yearly?: number;         // Global only
  trial_days: 0;                     // Hard zero — see docs §9
  auto_activate_on_signup: boolean;  // Exactly one SUPPLIER_* should be true
  badge_text?: string;
  cta_text: string;
  highlight_color: string;
  sort_order: number;
  limits: SupplierPlanLimits;
  feature_flags: Partial<Record<SupplierFeatureFlag, boolean>>;
}

export const SUPPLIER_PLANS: Readonly<Record<string, SupplierPlanDef>> = {
  'supplier-free': {
    slug: 'supplier-free',
    name: 'Solo Free',
    plan_type: 'SUPPLIER_FREE',
    description:
      'Try the platform — publish 1 listing, browse all customer tenders, finish KYC. No credit card.',
    price_aud_monthly: 0,
    price_aud_yearly: 0,
    trial_days: 0,
    auto_activate_on_signup: true,
    cta_text: 'Get Started',
    highlight_color: '#64748b',
    sort_order: 50,
    limits: {
      active_tasks: 1,
      listing_items: 1,
      active_orders: 1,
      orders: 1,
      active_tenders: 0,
      active_contracts: 0,
      bids: 0,
      domain_categories: 2,
      team_seats: 1,
    },
    feature_flags: {},
  },
  'supplier-solo': {
    slug: 'supplier-solo',
    name: 'Solo Pro',
    plan_type: 'SUPPLIER_SOLO',
    description:
      'For active solo experts — 5 listings, 5 tender bids per month, priority placement.',
    price_aud_monthly: 29,
    price_aud_yearly: 290,
    trial_days: 0,
    auto_activate_on_signup: false,
    cta_text: 'Subscribe',
    highlight_color: '#14b8a6',
    sort_order: 60,
    limits: {
      active_tasks: 5,
      listing_items: 5,
      active_orders: 2,
      orders: 5,
      active_tenders: 2,
      active_contracts: 2,
      bids: 5,
      domain_categories: 5,
      team_seats: 1,
    },
    feature_flags: {
      allow_priority_listing: true,
    },
  },
  'supplier-company-starter': {
    slug: 'supplier-company-starter',
    name: 'Company',
    plan_type: 'SUPPLIER_COMPANY_STARTER',
    description:
      'For small consulting teams — multi-seat collaboration, project mode, advanced analytics, formal compliance documents.',
    price_aud_monthly: 99,
    price_aud_yearly: 990,
    trial_days: 0,
    auto_activate_on_signup: false,
    badge_text: 'Most Popular',
    cta_text: 'Subscribe',
    highlight_color: '#0ea5e9',
    sort_order: 70,
    limits: {
      active_tasks: 10,
      listing_items: 10,
      active_orders: 5,
      orders: 10,
      active_tenders: 5,
      active_contracts: 5,
      bids: 10,
      domain_categories: 10,
      team_seats: 5,
    },
    feature_flags: {
      allow_priority_listing: true,
      allow_project_mode: true,
      allow_advanced_analytics: true,
      allow_compliance_docs: true,
      allow_video_facility: true,
    },
  },
  'supplier-global': {
    slug: 'supplier-global',
    name: 'Global',
    plan_type: 'SUPPLIER_GLOBAL',
    description:
      'For multi-region consulting firms — high concurrent engagements, white-label, SSO, dedicated manager, API access.',
    price_aud_monthly: 299,
    price_aud_yearly: 2990,
    price_usd_monthly: 199,
    price_usd_yearly: 1990,
    trial_days: 0,
    auto_activate_on_signup: false,
    cta_text: 'Talk to Sales',
    highlight_color: '#8b5cf6',
    sort_order: 80,
    limits: {
      active_tasks: 25,
      listing_items: 50,
      active_orders: 25,
      orders: 50,
      active_tenders: 25,
      active_contracts: 25,
      bids: 50,
      domain_categories: 28,
      team_seats: 25,
    },
    feature_flags: {
      allow_overseas_contractors: true,
      allow_project_mode: true,
      allow_api_access: true,
      allow_priority_listing: true,
      allow_advanced_analytics: true,
      allow_custom_sla: true,
      allow_whitelabel: true,
      allow_sso: true,
      allow_bulk_po: true,
      allow_compliance_docs: true,
      allow_dedicated_manager: true,
      allow_video_facility: true,
    },
  },
};

export const SUPPLIER_PLAN_LIST: SupplierPlanDef[] = Object.values(SUPPLIER_PLANS);

export const AUTO_ACTIVATE_SUPPLIER_PLAN_SLUG: string =
  SUPPLIER_PLAN_LIST.find((p) => p.auto_activate_on_signup)?.slug ?? 'supplier-free';
