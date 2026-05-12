import { z } from 'zod';

// ─── Enum mirrors (kept in sync with Prisma enums) ───────────────────────────

export const SUBSCRIPTION_STATUS = [
  'ACTIVE',
  'INACTIVE',
  'TRIALING',
  'PAST_DUE',
  'CANCELLED',
  'PAUSED',
  'UNPAID',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[number];

export const BILLING_INTERVAL = ['MONTHLY', 'YEARLY'] as const;
export type BillingInterval = (typeof BILLING_INTERVAL)[number];

export const PLAN_TYPE = [
  'CUSTOMER_STARTER',
  'CUSTOMER_BUSINESS',
  'CUSTOMER_PROFESSIONAL',
  'CUSTOMER_ENTERPRISE',
  'SUPPLIER_FREE',
  'SUPPLIER_SOLO',
  'SUPPLIER_COMPANY_STARTER',
  'SUPPLIER_COMPANY_PRO',
  'SUPPLIER_GLOBAL',
] as const;
export type PlanType = (typeof PLAN_TYPE)[number];

// ─── Limit & feature flag types ──────────────────────────────────────────────

export const LIMIT_TYPES = [
  // Supplier-side quotas (rebuilt 2026-05-06 — see docs/supplier-subscription-plan.html)
  'active_tasks',     // computed — currently-published listings
  'listing_items',    // computed — total catalogue size
  'active_orders',    // computed — orders in delivery
  'orders',           // counter — orders accepted this period
  'active_tenders',   // computed — live bid submissions / customer-side too
  'active_contracts', // computed — tender contracts in delivery
  'bids',             // counter — bids placed this period
  'domain_categories', // computed — length of domains[]
  'team_seats',       // computed — active CompanyMember rows
  'ai_requests',      // counter — customer ai_scopes maps to this
  // Customer-side quotas (customer subscription rebuild, 2026-05-06)
  'task_bookings',
  'contracts',
  'ai_scopes',
] as const;
export type LimitType = (typeof LIMIT_TYPES)[number];

export const FEATURE_FLAGS = [
  'allow_overseas_contractors',
  'allow_project_mode',
  'allow_api_access',
  'allow_priority_listing',
  'allow_advanced_analytics',
  'allow_custom_sla',
  'allow_whitelabel',
  'allow_sso',
  'allow_bulk_po',
  'allow_compliance_docs',
  'allow_dedicated_manager',
  'allow_video_facility',
] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

// ─── createPlanSchema (admin) ────────────────────────────────────────────────

export const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumerics + hyphens'),
  description: z.string().max(2000).optional().nullable(),
  plan_type: z.enum(PLAN_TYPE),
  is_active: z.boolean().default(true),
  is_public: z.boolean().default(true),
  sort_order: z.number().int().default(0),

  // Pricing
  monthly_price_aud: z.number().nonnegative().optional().nullable(),
  yearly_price_aud: z.number().nonnegative().optional().nullable(),
  monthly_price_usd: z.number().nonnegative().optional().nullable(),
  yearly_price_usd: z.number().nonnegative().optional().nullable(),
  trial_days: z.number().int().min(0).default(0),

  // Limits — null = unlimited (customer plans use null; supplier plans use
  // hard caps). Supplier rebuild 2026-05-06 dropped max_active_projects,
  // max_consultant_profiles, max_storage_gb.
  max_active_tasks: z.number().int().min(0).optional().nullable(),
  max_team_seats: z.number().int().min(0).optional().nullable(),
  max_bids_per_month: z.number().int().min(0).optional().nullable(),
  max_domain_categories: z.number().int().min(0).optional().nullable(),
  max_ai_requests_per_month: z.number().int().min(0).optional().nullable(),
  allowed_listing_items: z.number().int().min(0).optional().nullable(),
  max_orders_per_month: z.number().int().min(0).optional().nullable(),
  max_active_tenders: z.number().int().min(0).optional().nullable(),
  max_active_orders: z.number().int().min(0).optional().nullable(),
  max_active_contracts: z.number().int().min(0).optional().nullable(),
  // Customer-side limits added in the customer subscription rebuild.
  max_task_bookings_per_month: z.number().int().min(0).optional().nullable(),
  max_contracts_per_month: z.number().int().min(0).optional().nullable(),

  // Feature flags
  allow_overseas_contractors: z.boolean().default(false),
  allow_project_mode: z.boolean().default(false),
  allow_api_access: z.boolean().default(false),
  allow_priority_listing: z.boolean().default(false),
  allow_advanced_analytics: z.boolean().default(false),
  allow_custom_sla: z.boolean().default(false),
  allow_whitelabel: z.boolean().default(false),
  allow_sso: z.boolean().default(false),
  allow_bulk_po: z.boolean().default(false),
  allow_compliance_docs: z.boolean().default(false),
  allow_dedicated_manager: z.boolean().default(false),
  allow_video_facility: z.boolean().default(false),

  // Custom features (admin-extensible)
  custom_features: z.array(z.unknown()).default([]),

  // Marketing
  badge_text: z.string().max(50).optional().nullable(),
  cta_text: z.string().max(50).optional().nullable(),
  highlight_color: z.string().max(20).optional().nullable(),
});

export const updatePlanSchema = createPlanSchema.partial();

// ─── createCheckoutSchema (auth) ─────────────────────────────────────────────

export const createCheckoutSchema = z.object({
  plan_id: z.string().min(1),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;

// ─── Service-layer DTOs ──────────────────────────────────────────────────────

export interface LimitCheckResult {
  allowed: boolean;
  current: number;
  limit: number | null; // null = unlimited
  plan_name: string | null;
  reason?: string;
}
