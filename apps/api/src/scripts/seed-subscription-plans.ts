/**
 * Seed all 8 subscription plans (4 customer + 4 supplier) with sensible
 * defaults for limits, feature flags, and pricing. Idempotent — upserts by
 * slug so it's safe to re-run.
 *
 * Optional Stripe sync: if STRIPE_SECRET_KEY is configured (test or live),
 * each plan is also synced to Stripe — creating a Product and one or two
 * recurring Prices, then writing the IDs back to the plan row.
 *
 * Run: pnpm --filter @onys/api seed:subscriptions
 */

// Load .env BEFORE any prisma/pg imports
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv') as { config: (opts: { path: string }) => void };
dotenv.config({ path: resolve(__dir, '../../.env') });

import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { SubscriptionService } from '../services/subscription.service.js';
import { CUSTOMER_PLAN_LIST, SUPPLIER_PLAN_LIST } from '@onys/shared';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ─── Plan definitions ────────────────────────────────────────────────────────
// Prices are illustrative defaults. Edit before going live with real pricing.

type PlanSeed = {
  name: string;
  slug: string;
  description: string;
  plan_type:
    | 'CUSTOMER_STARTER'
    | 'CUSTOMER_BUSINESS'
    | 'CUSTOMER_PROFESSIONAL'
    | 'CUSTOMER_ENTERPRISE'
    | 'SUPPLIER_FREE'
    | 'SUPPLIER_SOLO'
    | 'SUPPLIER_COMPANY_STARTER'
    | 'SUPPLIER_GLOBAL';
  is_public: boolean;
  sort_order: number;
  monthly_price_aud: number | null;
  yearly_price_aud: number | null;
  monthly_price_usd?: number | null;
  yearly_price_usd?: number | null;
  trial_days?: number;
  // Limits — null = unlimited (customer plans use null; supplier plans never do)
  max_active_tasks?: number | null;
  max_team_seats?: number | null;
  max_bids_per_month?: number | null;
  max_domain_categories?: number | null;
  max_ai_requests_per_month?: number | null;
  allowed_listing_items?: number | null;
  max_orders_per_month?: number | null;
  max_active_tenders?: number | null;
  max_active_orders?: number | null;
  max_active_contracts?: number | null;
  // Customer-side additions
  max_task_bookings_per_month?: number | null;
  max_contracts_per_month?: number | null;
  max_manual_tenders_per_month?: number | null;
  // Feature flags
  flags?: Partial<Record<
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
    | 'allow_video_facility',
    boolean
  >>;
  custom_features?: string[];
  badge_text?: string | null;
  cta_text?: string | null;
  highlight_color?: string | null;
};

// ── Customer plans are sourced from packages/shared/src/subscription-config.ts ──
// That file is the single source of truth — edit numbers there, re-run this
// script. We adapt the shared `CustomerPlanDef` shape into the local PlanSeed
// shape (which still drives Stripe sync + supplier plans below).
const CUSTOMER_PLAN_SEEDS: PlanSeed[] = CUSTOMER_PLAN_LIST.map((p) => ({
  name: p.name,
  slug: p.slug,
  description: p.description,
  plan_type: p.plan_type,
  is_public: true,
  sort_order: p.sort_order,
  monthly_price_aud: p.price_aud_monthly,
  yearly_price_aud: p.price_aud_yearly,
  trial_days: p.trial_days,
  max_orders_per_month: p.limits.orders,
  max_ai_requests_per_month: p.limits.ai_scopes,
  max_active_tenders: p.limits.active_tenders,
  // active_orders, task_bookings, contracts are stored in the Stripe-sync-
  // facing JSON `effective_limits` snapshot too, but the plan-row columns
  // below are the runtime-checked source. New columns added in the
  // schema migration:
  max_active_orders: p.limits.active_orders,
  // PlanSeed type doesn't yet declare these — written through as raw
  // overrides when we build the upsert data below.
  ...({
    max_task_bookings_per_month: p.limits.task_bookings,
    max_contracts_per_month: p.limits.contracts,
    max_manual_tenders_per_month: p.limits.manual_tenders,
  } as Record<string, number | null>),
  badge_text: p.badge_text ?? null,
  cta_text: p.cta_text,
  highlight_color: p.highlight_color,
  custom_features: [
    'Browse all posted experts and tasks',
    'Order history retained for 36 months',
    'Raise disputes',
    'In-order messaging',
  ],
}));

// ── Supplier plans are also sourced from packages/shared/subscription-config.ts ──
// Same pattern as customer plans — edit numbers there, re-run this script.
// Documented in docs/supplier-subscription-plan.html.
const SUPPLIER_PLAN_SEEDS: PlanSeed[] = SUPPLIER_PLAN_LIST.map((p) => ({
  name: p.name,
  slug: p.slug,
  description: p.description,
  plan_type: p.plan_type,
  is_public: true,
  sort_order: p.sort_order,
  monthly_price_aud: p.price_aud_monthly,
  yearly_price_aud: p.price_aud_yearly,
  monthly_price_usd: p.price_usd_monthly ?? null,
  yearly_price_usd: p.price_usd_yearly ?? null,
  trial_days: p.trial_days,
  // Quota → plan column mapping (see docs/supplier-subscription-plan.html §3)
  max_active_tasks: p.limits.active_tasks,
  allowed_listing_items: p.limits.listing_items,
  max_active_orders: p.limits.active_orders,
  max_orders_per_month: p.limits.orders,
  max_active_tenders: p.limits.active_tenders,
  max_active_contracts: p.limits.active_contracts,
  max_bids_per_month: p.limits.bids,
  max_domain_categories: p.limits.domain_categories,
  max_team_seats: p.limits.team_seats,
  flags: p.feature_flags,
  badge_text: p.badge_text ?? null,
  cta_text: p.cta_text,
  highlight_color: p.highlight_color,
}));

const PLANS: PlanSeed[] = [
  ...CUSTOMER_PLAN_SEEDS,
  ...SUPPLIER_PLAN_SEEDS,
];

const ALL_FLAGS = [
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

// ─── Run ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[seed-plans] starting…');

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripeReady =
    typeof stripeKey === 'string' &&
    (stripeKey.startsWith('sk_test_') || stripeKey.startsWith('sk_live_'));
  if (!stripeReady) {
    console.warn(
      '[seed-plans] STRIPE_SECRET_KEY not set or not a real key — plans will be created in DB but NOT synced to Stripe.',
    );
  }

  const svc = new SubscriptionService(prisma);

  for (const p of PLANS) {
    const flagsResolved = ALL_FLAGS.reduce<Record<string, boolean>>((acc, k) => {
      acc[k] = !!p.flags?.[k];
      return acc;
    }, {});

    const data = {
      name: p.name,
      description: p.description,
      plan_type: p.plan_type,
      is_active: true,
      is_public: p.is_public,
      sort_order: p.sort_order,
      monthly_price_aud:
        p.monthly_price_aud == null
          ? null
          : new Prisma.Decimal(p.monthly_price_aud),
      yearly_price_aud:
        p.yearly_price_aud == null
          ? null
          : new Prisma.Decimal(p.yearly_price_aud),
      monthly_price_usd:
        p.monthly_price_usd == null
          ? null
          : new Prisma.Decimal(p.monthly_price_usd),
      yearly_price_usd:
        p.yearly_price_usd == null
          ? null
          : new Prisma.Decimal(p.yearly_price_usd),
      trial_days: p.trial_days ?? 0,
      max_active_tasks: p.max_active_tasks ?? null,
      max_team_seats: p.max_team_seats ?? null,
      max_bids_per_month: p.max_bids_per_month ?? null,
      max_domain_categories: p.max_domain_categories ?? null,
      max_ai_requests_per_month: p.max_ai_requests_per_month ?? null,
      allowed_listing_items: p.allowed_listing_items ?? null,
      max_orders_per_month: p.max_orders_per_month ?? null,
      max_active_tenders: p.max_active_tenders ?? null,
      max_active_orders: p.max_active_orders ?? null,
      max_active_contracts: p.max_active_contracts ?? null,
      max_task_bookings_per_month: p.max_task_bookings_per_month ?? null,
      max_contracts_per_month: p.max_contracts_per_month ?? null,
      max_manual_tenders_per_month: p.max_manual_tenders_per_month ?? null,
      ...flagsResolved,
      custom_features: (p.custom_features ?? []) as Prisma.InputJsonValue,
      badge_text: p.badge_text ?? null,
      cta_text: p.cta_text ?? null,
      highlight_color: p.highlight_color ?? null,
    };

    const upserted = await prisma.subscriptionPlan.upsert({
      where: { slug: p.slug },
      create: { slug: p.slug, ...data },
      update: data,
    });
    console.log(`[seed-plans] upserted plan: ${p.slug} (${upserted.id})`);

    if (stripeReady) {
      try {
        await svc.syncPlanToStripe(upserted.id);
        console.log(`[seed-plans] ✓ synced ${p.slug} to Stripe`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[seed-plans] ✗ Stripe sync failed for ${p.slug}: ${msg}`);
      }
    }
  }

  // Deactivate any CUSTOMER_* / SUPPLIER_* plan in the DB that's no longer in
  // the canonical list. We don't delete (existing Subscription rows might
  // still reference them); we just hide them from the public plans endpoint
  // and prevent new signups. Admins can still see them via /admin/plans.
  const canonicalSlugs = new Set(PLANS.map((p) => p.slug));
  const stale = await prisma.subscriptionPlan.findMany({
    where: {
      slug: { notIn: [...canonicalSlugs] },
      plan_type: { in: ['CUSTOMER_STARTER','CUSTOMER_BUSINESS','CUSTOMER_PROFESSIONAL','CUSTOMER_ENTERPRISE','SUPPLIER_FREE','SUPPLIER_SOLO','SUPPLIER_COMPANY_STARTER','SUPPLIER_COMPANY_PRO','SUPPLIER_GLOBAL'] },
      OR: [{ is_active: true }, { is_public: true }],
    },
    select: { id: true, slug: true, name: true },
  });
  for (const s of stale) {
    await prisma.subscriptionPlan.update({
      where: { id: s.id },
      data: { is_active: false, is_public: false },
    });
    console.log(`[seed-plans] retired stale plan: ${s.slug} (${s.name}) — set is_active=false, is_public=false`);
  }
  if (stale.length === 0) {
    console.log('[seed-plans] no stale plans to retire.');
  }

  await prisma.$disconnect();
  console.log('[seed-plans] done.');
}

main().catch((err) => {
  console.error('[seed-plans] fatal:', err);
  process.exit(1);
});
