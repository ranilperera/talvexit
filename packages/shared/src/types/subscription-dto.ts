// Plain DTOs that mirror the API response shapes for the subscription and
// service-invoice modules. These don't depend on Prisma so the web app and
// external consumers can import them safely. Use the Zod schemas in
// `schemas/subscription.schema.ts` and `schemas/service-invoice.schema.ts`
// for input validation; use these DTOs for response typing.

import type {
  SubscriptionStatus,
  BillingInterval,
  PlanType,
  LimitType,
} from '../schemas/subscription.schema.js';

// ─── Plan ────────────────────────────────────────────────────────────────────

export interface SubscriptionPlanDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  plan_type: PlanType;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;

  monthly_price_aud: string | null;
  yearly_price_aud: string | null;
  monthly_price_usd: string | null;
  yearly_price_usd: string | null;
  trial_days: number;

  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  stripe_product_id: string | null;

  // Limits — null = unlimited
  max_active_tasks: number | null;
  max_active_projects: number | null;
  max_team_seats: number | null;
  max_consultant_profiles: number | null;
  max_bids_per_month: number | null;
  max_domain_categories: number | null;
  max_ai_requests_per_month: number | null;
  max_storage_gb: number | null;
  allowed_listing_items: number | null;

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

  custom_features: string[];

  badge_text: string | null;
  cta_text: string | null;
  highlight_color: string | null;

  created_at: string;
  updated_at: string;
}

// ─── Subscription ────────────────────────────────────────────────────────────

export interface SubscriptionDto {
  id: string;
  status: SubscriptionStatus;
  billing_interval: BillingInterval;

  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_current_period_start: string | null;
  stripe_current_period_end: string | null;
  stripe_cancel_at_period_end: boolean;
  stripe_trial_end: string | null;

  current_task_count: number;
  current_project_count: number;
  current_bid_count: number;
  current_ai_request_count: number;
  usage_reset_at: string | null;

  plan_id: string;
  user_id: string | null;
  company_id: string | null;

  started_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionWithPlanDto extends SubscriptionDto {
  plan: SubscriptionPlanDto;
}

// ─── Subscription invoice (platform billing) ─────────────────────────────────

export type InvoiceStatusValue =
  | 'DRAFT'
  | 'OPEN'
  | 'PAID'
  | 'VOID'
  | 'UNCOLLECTIBLE';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  period_start?: string | null;
  period_end?: string | null;
}

export interface InvoiceDto {
  id: string;
  invoice_number: string;
  status: InvoiceStatusValue;

  subscription_id: string;
  billed_to_user_id: string | null;
  billed_to_company_id: string | null;

  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;

  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  amount_paid_cents: number;

  tax_rate: string;
  tax_description: string;
  tax_invoice_number: string | null;

  line_items: InvoiceLineItem[];
  billing_period_start: string | null;
  billing_period_end: string | null;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;

  pdf_storage_url: string | null;
  pdf_generated_at: string | null;

  created_at: string;
  updated_at: string;
}

// ─── Service invoice (B2B direct invoicing) ──────────────────────────────────

export interface ServiceInvoiceLineItem {
  description: string;
  quantity: number;
  unit_amount_cents: number;
}

export interface ServiceInvoiceDto {
  id: string;
  invoice_number: string;
  status: InvoiceStatusValue;

  from_user_id: string;
  to_user_id: string | null;
  from_company_id: string | null;
  to_company_id: string | null;

  task_id: string | null;
  order_id: string | null;
  project_id: string | null;

  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  amount_paid_cents: number;

  supplier_abn: string | null;
  supplier_gst_registered: boolean;
  tax_rate: string | null;
  tax_description: string | null;

  line_items: ServiceInvoiceLineItem[];
  notes: string | null;
  terms: string | null;
  due_date: string | null;
  paid_at: string | null;

  agreed_payment_method: ServiceInvoicePaymentMethodValue | null;
  payment_instructions: Record<string, unknown> | null;

  pdf_storage_url: string | null;
  pdf_generated_at: string | null;
  stripe_payment_intent_id: string | null;

  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Payment evidence ────────────────────────────────────────────────────────

export type PaymentEvidenceStatusValue =
  | 'PENDING'
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'REJECTED';

export type ServiceInvoicePaymentMethodValue =
  | 'STRIPE'
  | 'PAYPAL'
  | 'BANK_TRANSFER_BSB'
  | 'BANK_TRANSFER_SWIFT'
  | 'WISE'
  | 'OTHER';

export interface PaymentEvidenceDto {
  id: string;
  service_invoice_id: string;
  submitted_by_user_id: string;

  payment_method: ServiceInvoicePaymentMethodValue;
  payment_reference: string | null;
  payment_date: string;
  amount_cents: number;
  currency: string;
  notes: string | null;

  evidence_file_url: string | null;
  evidence_file_name: string | null;

  status: PaymentEvidenceStatusValue;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;

  created_at: string;
  updated_at: string;
}

// ─── Payment method config (provider settings) ───────────────────────────────

export interface PaymentMethodConfig {
  stripe?: { enabled: boolean };
  bank_au?: {
    enabled: boolean;
    bsb?: string;
    account_number?: string;
    account_name?: string;
  };
  bank_swift?: {
    enabled: boolean;
    bank_name?: string;
    swift_code?: string;
    iban?: string;
    account_number?: string;
    account_name?: string;
    bank_address?: string;
  };
  paypal?: { enabled: boolean; email?: string };
  wise?: { enabled: boolean; email?: string; currency?: string };
  other?: { enabled: boolean; description?: string };
}

// ─── Usage metrics ───────────────────────────────────────────────────────────
// Returned by /admin/subscriptions/metrics — broader than per-user usage.

export interface AdminSubscriptionMetricsDto {
  counts_by_status: { status: SubscriptionStatus; count: number }[];
  mrr_aud: number;
  arr_aud: number;
  tier_breakdown: { plan_id: string; count: number }[];
  churn_rate_30d: number;
  active_count: number;
  cancelled_last_30d: number;
}

// Per-user usage snapshot from /subscriptions/current — useful for client-side
// progress meters without re-deriving from the raw subscription record.

export interface UsageMetrics {
  tasks: { current: number; limit: number | null; pct: number };
  projects: { current: number; limit: number | null; pct: number };
  bids: { current: number; limit: number | null; pct: number };
  ai_requests: { current: number; limit: number | null; pct: number };
  team_seats?: { current: number; limit: number | null; pct: number };
  consultant_profiles?: { current: number; limit: number | null; pct: number };
}

// Re-export the existing LimitType from the schema for convenience.
export type { LimitType };
