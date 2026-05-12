import type { PrismaClient, Subscription, SubscriptionPlan, Prisma } from '@prisma/client';
import {
  stripe,
  getOrCreateStripeCustomer,
  upsertStripeProductAndPrices,
  createSubscriptionCheckoutSession,
  createBillingPortalSession,
} from './stripe.service.js';
import { resolvePlanFromStripePrice } from './subscription-webhook.service.js';
import { AppError } from '../lib/errors.js';
import { writeAudit } from '../utils/audit.js';
import { buildEmailUrl } from '../utils/urls.js';
import { generateSasUrl } from '../utils/blob-storage.js';
import type {
  CreatePlanInput,
  UpdatePlanInput,
  LimitType,
  FeatureFlag,
  LimitCheckResult,
} from '@onys/shared';

type EffectiveSubscription = Subscription & { plan: SubscriptionPlan };
type UsageType =
  // Supplier-side counters
  | 'bids'
  | 'orders'
  // Customer-side counters
  | 'ai_requests'
  | 'task_bookings'
  | 'contracts';

// Add 1 calendar month to a Date with end-of-month clamping. Used to compute
// anniversary period boundaries (Jan 31 → Feb 28, then Mar 31, then Apr 30…).
// Postgres handles the same arithmetic in SQL, but we need a JS version too
// for in-process rollover.
function addOneMonth(d: Date): Date {
  const next = new Date(d.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);             // park on the 1st so month math doesn't overflow
  next.setUTCMonth(next.getUTCMonth() + 1);
  // How many days in the target month?
  const lastDayOfTargetMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return next;
}

// Strip undefined values — Prisma + exactOptionalPropertyTypes won't accept
// `key: undefined` for fields typed `T | null`.
function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

// ─── Subscription subject abstraction ──────────────────────────────────────
// A "subject" is whoever owns a Subscription row. Personal subscriptions are
// owned by a User; company subscriptions are owned by a ConsultingCompany.
// Service methods take a SubscriptionSubject discriminator so a single code
// path supports both — the calling route resolves which subject the request
// is targeting (personal by default, company when the caller passes
// ?subject=company AND is the company's primary admin).

export type SubscriptionSubject =
  | { kind: 'user'; userId: string }
  | { kind: 'company'; companyId: string; companyName: string };

export class SubscriptionService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Decide which subject a billing request targets. When `as = 'company'`
   * the caller must be the primary admin of the company they're trying to
   * manage; otherwise we fall back to the personal subject.
   *
   * Authorisation lives here so individual route handlers don't have to
   * re-implement the same check on every endpoint.
   */
  async resolveSubject(
    userId: string,
    opts: { as?: 'user' | 'company' } = {},
  ): Promise<SubscriptionSubject> {
    if (opts.as !== 'company') {
      return { kind: 'user', userId };
    }
    // Find the company this user is the primary admin of.
    const company = await this.prisma.consultingCompany.findFirst({
      where: { primary_admin_id: userId },
      select: { id: true, company_name: true },
    });
    if (!company) {
      throw new AppError(
        'NOT_COMPANY_ADMIN',
        403,
        'Only the company primary admin can manage the company subscription.',
      );
    }
    return { kind: 'company', companyId: company.id, companyName: company.company_name };
  }

  /** Where clause for Subscription lookups keyed on the subject. */
  private subjectWhere(s: SubscriptionSubject): { user_id: string } | { company_id: string } {
    return s.kind === 'user' ? { user_id: s.userId } : { company_id: s.companyId };
  }

  /** Identity fields when creating a new Subscription row for a subject. */
  private subjectCreateData(
    s: SubscriptionSubject,
  ): { user_id: string } | { company_id: string } {
    return s.kind === 'user' ? { user_id: s.userId } : { company_id: s.companyId };
  }

  // ─── Plan management (admin) ───────────────────────────────────────────────

  async createPlan(data: CreatePlanInput): Promise<SubscriptionPlan> {
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (existing) throw new AppError('PLAN_SLUG_TAKEN', 409);

    return this.prisma.subscriptionPlan.create({
      data: {
        ...omitUndefined(data),
        custom_features: data.custom_features as Prisma.InputJsonValue,
      } as Prisma.SubscriptionPlanCreateInput,
    });
  }

  async updatePlan(id: string, data: UpdatePlanInput): Promise<SubscriptionPlan> {
    if (data.slug) {
      const conflict = await this.prisma.subscriptionPlan.findFirst({
        where: { slug: data.slug, NOT: { id } },
        select: { id: true },
      });
      if (conflict) throw new AppError('PLAN_SLUG_TAKEN', 409);
    }
    const { custom_features, ...rest } = data;
    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...omitUndefined(rest),
        ...(custom_features !== undefined && {
          custom_features: custom_features as Prisma.InputJsonValue,
        }),
      } as Prisma.SubscriptionPlanUpdateInput,
    });
  }

  async deletePlan(id: string): Promise<void> {
    await this.prisma.subscriptionPlan.update({
      where: { id },
      data: { is_active: false },
    });
  }

  async getPublicPlans(): Promise<SubscriptionPlan[]> {
    return this.prisma.subscriptionPlan.findMany({
      where: { is_active: true, is_public: true },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
  }

  async getAllPlans(): Promise<SubscriptionPlan[]> {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: [{ is_active: 'desc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
    });
  }

  async getPlan(id: string): Promise<SubscriptionPlan> {
    return this.prisma.subscriptionPlan.findUniqueOrThrow({ where: { id } });
  }

  // ─── Stripe sync ──────────────────────────────────────────────────────────

  async syncPlanToStripe(planId: string): Promise<SubscriptionPlan> {
    const plan = await this.prisma.subscriptionPlan.findUniqueOrThrow({
      where: { id: planId },
    });

    const result = await upsertStripeProductAndPrices({
      productId: plan.stripe_product_id,
      monthlyPriceId: plan.stripe_price_id_monthly,
      yearlyPriceId: plan.stripe_price_id_yearly,
      name: plan.name,
      ...(plan.description != null && { description: plan.description }),
      monthlyPriceAud: plan.monthly_price_aud ? Number(plan.monthly_price_aud) : null,
      yearlyPriceAud: plan.yearly_price_aud ? Number(plan.yearly_price_aud) : null,
      slug: plan.slug,
    });

    return this.prisma.subscriptionPlan.update({
      where: { id: planId },
      data: {
        stripe_product_id: result.productId,
        stripe_price_id_monthly: result.monthlyPriceId,
        stripe_price_id_yearly: result.yearlyPriceId,
      },
    });
  }

  // ─── Checkout & portal ────────────────────────────────────────────────────

  async createCheckoutSession(
    subject: SubscriptionSubject,
    planId: string,
    interval: 'monthly' | 'yearly',
  ): Promise<string> {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.is_active) throw new AppError('PLAN_NOT_FOUND', 404);

    // Free plans bypass Stripe entirely — activate the Subscription row
    // directly and redirect to the success page.
    const priceAud =
      interval === 'monthly'
        ? plan.monthly_price_aud
        : plan.yearly_price_aud;
    if (priceAud != null && Number(priceAud) === 0) {
      return this.activateFreePlan(subject, planId, interval);
    }

    const priceId =
      interval === 'monthly' ? plan.stripe_price_id_monthly : plan.stripe_price_id_yearly;
    if (!priceId) {
      throw new AppError(
        'PLAN_NOT_SYNCED',
        400,
        `Plan has no ${interval} Stripe price. Sync the plan to Stripe first.`,
      );
    }

    // Resolve / lazily create the Stripe customer for this subject.
    // Personal subs use User.stripe_customer_id; company subs use
    // ConsultingCompany.stripe_customer_id so the same company always
    // bills against the same customer regardless of which admin starts
    // the checkout.
    let customerId: string | null;
    let auditActorId: string;
    let metadata: Record<string, string>;

    if (subject.kind === 'user') {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: subject.userId },
        select: { id: true, email: true, full_name: true, stripe_customer_id: true },
      });
      customerId = user.stripe_customer_id;
      if (!customerId) {
        const customer = await getOrCreateStripeCustomer({
          email: user.email,
          name: user.full_name,
          metadata: { user_id: user.id },
        });
        customerId = customer.id;
        await this.prisma.user.update({
          where: { id: user.id },
          data: { stripe_customer_id: customerId },
        });
      }
      auditActorId = user.id;
      metadata = { user_id: user.id, plan_id: planId, interval, subject_kind: 'user' };
    } else {
      const company = await this.prisma.consultingCompany.findUniqueOrThrow({
        where: { id: subject.companyId },
        select: {
          id: true,
          company_name: true,
          stripe_customer_id: true,
          primary_admin: { select: { id: true, email: true, full_name: true } },
        },
      });
      customerId = company.stripe_customer_id;
      if (!customerId) {
        const customer = await getOrCreateStripeCustomer({
          email: company.primary_admin.email,
          name: company.company_name,
          metadata: { company_id: company.id, primary_admin_id: company.primary_admin.id },
        });
        customerId = customer.id;
        await this.prisma.consultingCompany.update({
          where: { id: company.id },
          data: { stripe_customer_id: customerId },
        });
      }
      auditActorId = company.primary_admin.id;
      metadata = {
        company_id: company.id,
        plan_id: planId,
        interval,
        subject_kind: 'company',
      };
    }

    const session = await createSubscriptionCheckoutSession({
      customerId,
      priceId,
      successUrl: buildEmailUrl('/subscribe/success?session_id={CHECKOUT_SESSION_ID}'),
      cancelUrl: buildEmailUrl('/subscribe/cancel'),
      trialDays: plan.trial_days,
      metadata,
    });

    if (!session.url) throw new AppError('CHECKOUT_FAILED', 500);

    void writeAudit(this.prisma, {
      actorId: auditActorId,
      actionType: 'SUBSCRIPTION_CHECKOUT_STARTED',
      entityType: 'SubscriptionPlan',
      entityId: planId,
      metadata: {
        interval,
        session_id: session.id,
        subject_kind: subject.kind,
        ...(subject.kind === 'company' ? { company_id: subject.companyId } : {}),
      },
    });

    return session.url;
  }

  // ── Free-plan activation (no Stripe involvement) ────────────────────────
  // Used internally by createCheckoutSession when the chosen plan price is 0.
  // Returns the internal redirect URL so the route contract is unchanged
  // (frontend always does window.location.href = result).

  private async activateFreePlan(
    subject: SubscriptionSubject,
    planId: string,
    interval: 'monthly' | 'yearly',
  ): Promise<string> {
    const existing = await this.prisma.subscription.findUnique({
      where: this.subjectWhere(subject) as Prisma.SubscriptionWhereUniqueInput,
    });

    // Block downgrade-from-paid via this path — Stripe portal must cancel
    // the paid sub first to avoid double-billing.
    if (
      existing &&
      existing.stripe_subscription_id &&
      (existing.status === 'ACTIVE' || existing.status === 'TRIALING') &&
      !existing.stripe_cancel_at_period_end
    ) {
      throw new AppError(
        'PAID_SUBSCRIPTION_ACTIVE',
        409,
        'You already have a paid subscription. Cancel it through the billing portal first, then activate the free plan.',
      );
    }

    const billing_interval = interval === 'yearly' ? 'YEARLY' : 'MONTHLY';

    if (existing) {
      await this.prisma.subscription.update({
        where: { id: existing.id },
        data: {
          plan_id: planId,
          billing_interval: billing_interval as never,
          status: 'ACTIVE' as never,
          started_at: existing.started_at ?? new Date(),
          cancelled_at: null,
          // Clear any leftover Stripe IDs from prior paid sub
          stripe_subscription_id: null,
          stripe_current_period_start: null,
          stripe_current_period_end: null,
          stripe_cancel_at_period_end: false,
          stripe_trial_end: null,
        },
      });
    } else {
      await this.prisma.subscription.create({
        data: {
          ...this.subjectCreateData(subject),
          plan_id: planId,
          billing_interval: billing_interval as never,
          status: 'ACTIVE' as never,
          started_at: new Date(),
        },
      });
    }

    // Audit actor: for company subs we resolve the primary admin id so the
    // log line attributes to a real user; for personal subs the user is the
    // actor.
    const actorId =
      subject.kind === 'user'
        ? subject.userId
        : (
            await this.prisma.consultingCompany.findUnique({
              where: { id: subject.companyId },
              select: { primary_admin_id: true },
            })
          )?.primary_admin_id ?? 'system';

    void writeAudit(this.prisma, {
      actorId,
      actionType: 'FREE_PLAN_ACTIVATED',
      entityType: 'SubscriptionPlan',
      entityId: planId,
      metadata: {
        interval,
        subject_kind: subject.kind,
        ...(subject.kind === 'company' ? { company_id: subject.companyId } : {}),
      },
    });

    return buildEmailUrl('/subscribe/success?free=1');
  }

  async createPortalSession(subject: SubscriptionSubject): Promise<string> {
    let stripeCustomerId: string | null;
    let returnPath: string;

    if (subject.kind === 'user') {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: subject.userId },
        select: { stripe_customer_id: true },
      });
      stripeCustomerId = user.stripe_customer_id;
      returnPath = '/billing';
    } else {
      const company = await this.prisma.consultingCompany.findUniqueOrThrow({
        where: { id: subject.companyId },
        select: { stripe_customer_id: true },
      });
      stripeCustomerId = company.stripe_customer_id;
      returnPath = '/company/billing';
    }

    if (!stripeCustomerId) {
      throw new AppError(
        'NO_STRIPE_CUSTOMER',
        400,
        'No Stripe customer record yet. Subscribe to a plan first.',
      );
    }

    const session = await createBillingPortalSession({
      customerId: stripeCustomerId,
      returnUrl: process.env.STRIPE_PORTAL_RETURN_URL ?? buildEmailUrl(returnPath),
    });
    return session.url;
  }

  // ─── Subscription lifecycle ───────────────────────────────────────────────

  async cancelSubscription(subject: SubscriptionSubject): Promise<Subscription> {
    const sub = await this.prisma.subscription.findUnique({
      where: this.subjectWhere(subject) as Prisma.SubscriptionWhereUniqueInput,
    });
    if (!sub) throw new AppError('NO_SUBSCRIPTION', 404);
    if (!sub.stripe_subscription_id) {
      throw new AppError('NO_STRIPE_SUBSCRIPTION', 400);
    }

    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { stripe_cancel_at_period_end: true },
    });

    const actorId =
      subject.kind === 'user'
        ? subject.userId
        : (
            await this.prisma.consultingCompany.findUnique({
              where: { id: subject.companyId },
              select: { primary_admin_id: true },
            })
          )?.primary_admin_id ?? 'system';

    void writeAudit(this.prisma, {
      actorId,
      actionType: 'SUBSCRIPTION_CANCEL_REQUESTED',
      entityType: 'Subscription',
      entityId: sub.id,
      metadata: {
        plan_id: sub.plan_id,
        subject_kind: subject.kind,
        ...(subject.kind === 'company' ? { company_id: subject.companyId } : {}),
      },
    });

    return updated;
  }

  async getCurrentSubscription(subject: SubscriptionSubject): Promise<EffectiveSubscription | null> {
    // Best-effort sync from Stripe before reading the row. If a webhook got
    // dropped (e.g. stripe listen wasn't running when the customer completed
    // checkout), this picks up the missing change so the customer's billing
    // page reflects what they actually have at Stripe.
    await this.reconcileFromStripe(subject).catch((err: unknown) => {
      console.warn('[subscription] reconcileFromStripe failed (non-fatal):', err);
    });

    return this.prisma.subscription.findUnique({
      where: this.subjectWhere(subject) as Prisma.SubscriptionWhereUniqueInput,
      include: { plan: true },
    });
  }

  /**
   * Pulls the user's active Stripe subscription and updates the local
   * Subscription row when it drifts. Idempotent. No-ops when the user has no
   * Stripe customer id (free tier never touched checkout) or when the local
   * row already matches.
   *
   * Used by getCurrentSubscription() on every load to recover from missed
   * webhooks, and exposed via POST /subscriptions/sync for an explicit
   * "Refresh from Stripe" button on /billing.
   */
  async reconcileFromStripe(
    subject: SubscriptionSubject,
  ): Promise<{ changed: boolean; reason: string }> {
    let stripeCustomerId: string | null;
    let auditActorId: string;

    if (subject.kind === 'user') {
      const user = await this.prisma.user.findUnique({
        where: { id: subject.userId },
        select: { id: true, stripe_customer_id: true },
      });
      if (!user) return { changed: false, reason: 'user not found' };
      stripeCustomerId = user.stripe_customer_id;
      auditActorId = user.id;
    } else {
      const company = await this.prisma.consultingCompany.findUnique({
        where: { id: subject.companyId },
        select: { id: true, stripe_customer_id: true, primary_admin_id: true },
      });
      if (!company) return { changed: false, reason: 'company not found' };
      stripeCustomerId = company.stripe_customer_id;
      auditActorId = company.primary_admin_id;
    }

    if (!stripeCustomerId) {
      return { changed: false, reason: 'no stripe customer (free tier)' };
    }

    // List up to 5 most recent subscriptions on the customer; pick the first
    // active or trialing one as authoritative.
    const list = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 5,
    });
    const stripeSub =
      list.data.find((s) => s.status === 'active' || s.status === 'trialing') ?? list.data[0];

    if (!stripeSub) return { changed: false, reason: 'no stripe subscriptions' };

    const priceId = stripeSub.items.data[0]?.price?.id;
    if (!priceId) return { changed: false, reason: 'no price on stripe sub' };

    const resolved = await resolvePlanFromStripePrice(this.prisma, priceId);
    if (!resolved) {
      return { changed: false, reason: `unknown price id ${priceId}` };
    }

    const local = await this.prisma.subscription.findUnique({
      where: this.subjectWhere(subject) as Prisma.SubscriptionWhereUniqueInput,
      select: {
        id: true,
        plan_id: true,
        billing_interval: true,
        status: true,
        stripe_subscription_id: true,
      },
    });

    const desiredStatus =
      stripeSub.status === 'active'
        ? 'ACTIVE'
        : stripeSub.status === 'trialing'
          ? 'TRIALING'
          : stripeSub.status === 'past_due'
            ? 'PAST_DUE'
            : stripeSub.status === 'canceled'
              ? 'CANCELLED'
              : stripeSub.status === 'unpaid'
                ? 'UNPAID'
                : stripeSub.status === 'paused'
                  ? 'PAUSED'
                  : 'INACTIVE';

    const drift =
      !local ||
      local.plan_id !== resolved.planId ||
      local.billing_interval !== resolved.interval ||
      local.stripe_subscription_id !== stripeSub.id ||
      local.status !== desiredStatus;
    if (!drift) return { changed: false, reason: 'in sync' };

    const data: Prisma.SubscriptionUncheckedUpdateInput = {
      plan_id: resolved.planId,
      billing_interval: resolved.interval,
      status: desiredStatus as never,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSub.id,
      stripe_current_period_start: new Date(stripeSub.current_period_start * 1000),
      stripe_current_period_end: new Date(stripeSub.current_period_end * 1000),
      stripe_cancel_at_period_end: stripeSub.cancel_at_period_end,
      stripe_trial_end: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
      ...(stripeSub.status === 'canceled' && { cancelled_at: new Date() }),
    };

    if (local) {
      await this.prisma.subscription.update({ where: { id: local.id }, data });
    } else {
      await this.prisma.subscription.create({
        data: {
          ...this.subjectCreateData(subject),
          plan_id: resolved.planId,
          billing_interval: resolved.interval,
          status: desiredStatus as never,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSub.id,
          stripe_current_period_start: new Date(stripeSub.current_period_start * 1000),
          stripe_current_period_end: new Date(stripeSub.current_period_end * 1000),
          stripe_cancel_at_period_end: stripeSub.cancel_at_period_end,
          stripe_trial_end: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
          started_at: new Date(),
        },
      });
    }

    void writeAudit(this.prisma, {
      actorId: auditActorId,
      actionType: 'SUBSCRIPTION_RECONCILED_FROM_STRIPE',
      entityType: 'Subscription',
      entityId: stripeSub.id,
      metadata: {
        from_plan_id: local?.plan_id ?? null,
        to_plan_id: resolved.planId,
        interval: resolved.interval,
        stripe_status: stripeSub.status,
        subject_kind: subject.kind,
        ...(subject.kind === 'company' ? { company_id: subject.companyId } : {}),
      },
    });

    return { changed: true, reason: 'updated from stripe' };
  }

  // Resolve effective subscription — prefer company subscription if user is a
  // CompanyMember and the company has one, otherwise fall back to personal.
  async getEffectiveSubscription(userId: string): Promise<EffectiveSubscription | null> {
    const member = await this.prisma.companyMember.findFirst({
      where: { user_id: userId, status: 'ACTIVE' },
      select: { company_id: true },
    });

    if (member?.company_id) {
      const companySub = await this.prisma.subscription.findUnique({
        where: { company_id: member.company_id },
        include: { plan: true },
      });
      if (companySub) return companySub;
    }

    return this.prisma.subscription.findUnique({
      where: { user_id: userId },
      include: { plan: true },
    });
  }

  // ─── Limit & feature enforcement ──────────────────────────────────────────

  async checkFeature(
    userId: string,
    flag: FeatureFlag,
  ): Promise<{ allowed: boolean; plan_name: string | null }> {
    const sub = await this.getEffectiveSubscription(userId);
    if (!sub || (sub.status !== 'ACTIVE' && sub.status !== 'TRIALING')) {
      return { allowed: false, plan_name: null };
    }
    return {
      allowed: Boolean(sub.plan[flag]),
      plan_name: sub.plan.name,
    };
  }

  async checkLimit(userId: string, limitType: LimitType): Promise<LimitCheckResult> {
    let sub = await this.getEffectiveSubscription(userId);
    if (!sub || (sub.status !== 'ACTIVE' && sub.status !== 'TRIALING')) {
      return {
        allowed: false,
        current: 0,
        limit: 0,
        plan_name: null,
        reason: 'NO_ACTIVE_SUBSCRIPTION',
      };
    }
    // Lazy period rollover — if the subscription's anniversary period_end
    // has elapsed, archive the closed period(s) to SubscriptionUsageHistory
    // and reset the counter columns before the limit check runs.
    sub = await this.rolloverIfDue(sub);
    const { current, limit } = await this.resolveCurrentAndLimit(sub, limitType);
    return {
      allowed: limit === null ? true : current < limit,
      current,
      limit,
      plan_name: sub.plan.name,
    };
  }

  private async resolveCurrentAndLimit(
    sub: EffectiveSubscription,
    type: LimitType,
  ): Promise<{ current: number; limit: number | null }> {
    switch (type) {
      // ── Supplier-side quotas (rebuilt 2026-05-06) ────────────────────────
      case 'active_tasks': {
        // Computed: count of Task rows currently published on the marketplace
        // for this supplier. Replaces the old per-month counter semantics.
        // TaskStatus enum is DRAFT | PUBLISHED | ARCHIVED — "active" = PUBLISHED.
        const where = await this.taskOwnershipFilter(sub);
        if (!where) return { current: 0, limit: sub.plan.max_active_tasks };
        const count = await this.prisma.task
          .count({ where: { ...where, status: 'PUBLISHED' } })
          .catch(() => 0);
        return { current: count, limit: sub.plan.max_active_tasks };
      }
      case 'listing_items': {
        // Computed: total catalogue size (DRAFT + PUBLISHED). ARCHIVED rows
        // are excluded — they're soft-deletes and shouldn't count toward
        // the live catalogue cap.
        const where = await this.taskOwnershipFilter(sub);
        if (!where) return { current: 0, limit: sub.plan.allowed_listing_items };
        const count = await this.prisma.task
          .count({ where: { ...where, status: { in: ['DRAFT', 'PUBLISHED'] as never } } })
          .catch(() => 0);
        return { current: count, limit: sub.plan.allowed_listing_items };
      }
      case 'bids':
        return { current: sub.current_bid_count, limit: sub.plan.max_bids_per_month };
      case 'ai_requests':
        return {
          current: sub.current_ai_request_count,
          limit: sub.plan.max_ai_requests_per_month,
        };
      case 'team_seats': {
        if (!sub.company_id) return { current: 0, limit: sub.plan.max_team_seats };
        const seats = await this.prisma.companyMember.count({
          where: { company_id: sub.company_id, status: 'ACTIVE' },
        });
        return { current: seats, limit: sub.plan.max_team_seats };
      }
      case 'domain_categories': {
        // Computed: count the domains array on the supplier entity that owns
        // the subscription (company → ConsultingCompany.domains; user →
        // ContractorProfile.domains).
        if (sub.company_id) {
          const c = await this.prisma.consultingCompany.findUnique({
            where: { id: sub.company_id },
            select: { domains: true },
          });
          return { current: c?.domains.length ?? 0, limit: sub.plan.max_domain_categories };
        }
        if (sub.user_id) {
          const p = await this.prisma.contractorProfile.findUnique({
            where: { user_id: sub.user_id },
            select: { domains: true },
          });
          return { current: p?.domains.length ?? 0, limit: sub.plan.max_domain_categories };
        }
        return { current: 0, limit: sub.plan.max_domain_categories };
      }
      case 'orders':
        return {
          current: sub.current_order_count,
          limit: sub.plan.max_orders_per_month,
        };
      case 'active_orders': {
        // Computed: orders this supplier has currently in delivery
        const ACTIVE_STATUSES = [
          'ACCEPTED',
          'PAYMENT_HELD',
          'IN_PROGRESS',
          'PENDING_REVIEW',
          'REVISION_REQUESTED',
        ] as const;
        const where = sub.company_id
          ? { company_id: sub.company_id, status: { in: ACTIVE_STATUSES as never } }
          : sub.user_id
            ? {
                OR: [
                  { contractor_user_id: sub.user_id },
                  { executing_member_id: sub.user_id },
                ],
                status: { in: ACTIVE_STATUSES as never },
              }
            : null;
        if (!where) return { current: 0, limit: sub.plan.max_active_orders };
        const count = await this.prisma.order.count({ where });
        return { current: count, limit: sub.plan.max_active_orders };
      }
      case 'active_contracts': {
        // Computed: tender contracts in delivery for this supplier
        const ACTIVE_TC = ['PENDING', 'ACTIVE', 'IN_PROGRESS'] as const;
        const where = sub.company_id
          ? { company_id: sub.company_id, status: { in: ACTIVE_TC as never } }
          : sub.user_id
            ? {
                contractor_user_id: sub.user_id,
                status: { in: ACTIVE_TC as never },
              }
            : null;
        if (!where) return { current: 0, limit: sub.plan.max_active_contracts };
        const count = await this.prisma.tenderContract.count({ where });
        return { current: count, limit: sub.plan.max_active_contracts };
      }

      // ── Customer-side quotas (rebuild) ─────────────────────────────────────
      case 'task_bookings':
        // Counter — each Book Now click increments. Customer Quota 1.
        return {
          current: sub.current_task_booking_count,
          limit: sub.plan.max_task_bookings_per_month,
        };
      case 'ai_scopes':
        // Counter — each AI scope generate. Customer Quota 4. Same column
        // as 'ai_requests' but the LimitType key keeps the customer label
        // distinct in error messages.
        return {
          current: sub.current_ai_request_count,
          limit: sub.plan.max_ai_requests_per_month,
        };
      case 'contracts':
        // Counter — each contract acceptance. Customer Quota 5.
        return {
          current: sub.current_contract_count,
          limit: sub.plan.max_contracts_per_month,
        };
      case 'active_tenders': {
        // Branches on plan_type — the same key has audience-specific semantics:
        //   - CUSTOMER_*: tenders the customer has currently open (buyer)
        //   - SUPPLIER_*: TenderProposal rows the supplier has SUBMITTED or
        //     SHORTLISTED (i.e. still in flight), against open tenders
        const isSupplier = sub.plan.plan_type.startsWith('SUPPLIER_');
        if (isSupplier) {
          const LIVE_PROPOSAL = ['SUBMITTED', 'SHORTLISTED'] as const;
          const baseWhere = sub.company_id
            ? { company_id: sub.company_id }
            : sub.user_id
              ? { submitted_by_user_id: sub.user_id }
              : null;
          if (!baseWhere) return { current: 0, limit: sub.plan.max_active_tenders };
          const count = await this.prisma.tenderProposal
            .count({
              where: {
                ...baseWhere,
                status: { in: LIVE_PROPOSAL as never },
                tender: { status: 'OPEN' },
              },
            })
            .catch(() => 0);
          return { current: count, limit: sub.plan.max_active_tenders };
        }
        // Customer side — open tenders this customer published. Quota 6.
        if (!sub.user_id) return { current: 0, limit: sub.plan.max_active_tenders };
        const count = await this.prisma.tenderRequest.count({
          where: {
            customer_id: sub.user_id,
            status: 'OPEN',
          },
        }).catch(() => 0);
        return { current: count, limit: sub.plan.max_active_tenders };
      }
    }
  }

  // Resolve the where-clause that scopes a Task query to "rows owned by this
  // subscription's supplier." Company subs filter by company_id directly;
  // solo contractor subs need a contractor_profile lookup first.
  private async taskOwnershipFilter(
    sub: EffectiveSubscription,
  ): Promise<{ company_id: string } | { contractor_profile_id: string } | null> {
    if (sub.company_id) return { company_id: sub.company_id };
    if (!sub.user_id) return null;
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { user_id: sub.user_id },
      select: { id: true },
    });
    return profile ? { contractor_profile_id: profile.id } : null;
  }

  // ── Lazy period rollover ───────────────────────────────────────────────────
  // Called at the top of every checkLimit. If the subscription's anniversary
  // period_end has elapsed, archive the closed period(s) to
  // SubscriptionUsageHistory and reset counter columns to 0. Loops if multiple
  // periods have passed (customer didn't transact for several months).
  //
  // Idempotent — running it twice in quick succession is a no-op.
  async rolloverIfDue(sub: EffectiveSubscription): Promise<EffectiveSubscription> {
    // No period yet (legacy subscription) — initialise from started_at /
    // created_at and skip rollover this pass.
    if (!sub.period_end || !sub.period_start) {
      const start = sub.started_at ?? sub.created_at;
      const end = addOneMonth(start);
      const seeded = await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { period_start: start, period_end: end },
        include: { plan: true },
      });
      return seeded as EffectiveSubscription;
    }

    const now = new Date();
    if (now < sub.period_end) return sub;

    // One or more periods have elapsed. Archive each and roll forward.
    let cursor: EffectiveSubscription = sub;
    while (cursor.period_end && now >= cursor.period_end) {
      const closedStart = cursor.period_start ?? cursor.created_at;
      const closedEnd = cursor.period_end;
      const nextStart = closedEnd;
      const nextEnd = addOneMonth(nextStart);

      // Archive the closed period to history with current counter values
      // and the limits that were in force on the plan at the time.
      await this.prisma.subscriptionUsageHistory.create({
        data: {
          subscription_id: cursor.id,
          plan_id: cursor.plan_id,
          plan_name: cursor.plan.name,
          period_start: closedStart,
          period_end: closedEnd,
          task_bookings_used: cursor.current_task_booking_count,
          orders_used: cursor.current_order_count,
          ai_scopes_used: cursor.current_ai_request_count,
          contracts_used: cursor.current_contract_count,
          task_bookings_limit: cursor.plan.max_task_bookings_per_month,
          orders_limit: cursor.plan.max_orders_per_month,
          ai_scopes_limit: cursor.plan.max_ai_requests_per_month,
          contracts_limit: cursor.plan.max_contracts_per_month,
        },
      });

      // Bump the period and reset counter columns to 0. Active counts
      // (active_orders, active_tenders) are computed live so no reset.
      cursor = (await this.prisma.subscription.update({
        where: { id: cursor.id },
        data: {
          period_start: nextStart,
          period_end: nextEnd,
          // Customer-side counters
          current_task_booking_count: 0,
          current_order_count: 0,
          current_ai_request_count: 0,
          current_contract_count: 0,
          // Supplier-side counters (orders shares the same column)
          current_bid_count: 0,
          // Legacy columns (current_task_count, current_project_count,
          // current_tender_count) are no longer written — the post-rebuild
          // semantics use computed live counts. Columns kept on schema for
          // back-compat; will be dropped in a follow-up migration.
          usage_reset_at: nextStart,
        },
        include: { plan: true },
      })) as EffectiveSubscription;

      // Audit-log the rollover so support can correlate "my counter reset
      // unexpectedly" reports with a clear timestamp + period.
      void writeAudit(this.prisma, {
        actorId: cursor.user_id ?? cursor.company_id ?? 'system',
        actionType: 'SUBSCRIPTION_PERIOD_ROLLED',
        entityType: 'Subscription',
        entityId: cursor.id,
        metadata: {
          plan_slug: cursor.plan.slug,
          closed_period_start: closedStart.toISOString(),
          closed_period_end: closedEnd.toISOString(),
          new_period_start: nextStart.toISOString(),
          new_period_end: nextEnd.toISOString(),
        },
      });
    }
    return cursor;
  }

  // ── Customer usage view ────────────────────────────────────────────────────
  // Powers the /customer/billing usage panel. Resolves the customer's
  // effective subscription (running rolloverIfDue first), then computes
  // {used, limit, remaining, warn} for every customer-side quota plus the
  // 12 most-recent closed periods from history.
  //
  // The `warn` flag is true when remaining is at or below the soft-cap
  // threshold for the plan (Free + Business: <=1; Pro + Enterprise: <=20%).
  async getCustomerUsage(userId: string): Promise<{
    plan: { slug: string; name: string; status: string } | null;
    period: { start: string | null; end: string | null } | null;
    quotas: Record<string, { used: number; limit: number | null; remaining: number | null; warn: boolean }>;
    history: Array<{
      period_start: string;
      period_end: string;
      plan_name: string;
      task_bookings_used: number; task_bookings_limit: number | null;
      orders_used: number;        orders_limit: number | null;
      ai_scopes_used: number;     ai_scopes_limit: number | null;
      contracts_used: number;     contracts_limit: number | null;
    }>;
  }> {
    const { warningThresholdFor } = await import('@onys/shared');
    const sub0 = await this.getEffectiveSubscription(userId);
    if (!sub0 || (sub0.status !== 'ACTIVE' && sub0.status !== 'TRIALING')) {
      return {
        plan: sub0 ? { slug: sub0.plan.slug, name: sub0.plan.name, status: sub0.status } : null,
        period: null,
        quotas: {},
        history: [],
      };
    }
    const sub = await this.rolloverIfDue(sub0);

    const customerQuotas: LimitType[] = [
      'task_bookings', 'active_orders', 'orders', 'ai_scopes', 'contracts', 'active_tenders',
    ];
    const quotas: Record<string, { used: number; limit: number | null; remaining: number | null; warn: boolean }> = {};
    for (const q of customerQuotas) {
      const { current, limit } = await this.resolveCurrentAndLimit(sub, q);
      const remaining = limit === null ? null : Math.max(0, limit - current);
      const threshold = warningThresholdFor(sub.plan.slug, limit);
      const warn = remaining !== null && remaining <= threshold;
      quotas[q] = { used: current, limit, remaining, warn };
    }

    const historyRows = await this.prisma.subscriptionUsageHistory.findMany({
      where: { subscription_id: sub.id },
      orderBy: { period_end: 'desc' },
      take: 12,
    });

    return {
      plan: { slug: sub.plan.slug, name: sub.plan.name, status: sub.status },
      period: {
        start: sub.period_start?.toISOString() ?? null,
        end: sub.period_end?.toISOString() ?? null,
      },
      quotas,
      history: historyRows.map((h) => ({
        period_start: h.period_start.toISOString(),
        period_end: h.period_end.toISOString(),
        plan_name: h.plan_name,
        task_bookings_used: h.task_bookings_used,
        task_bookings_limit: h.task_bookings_limit,
        orders_used: h.orders_used,
        orders_limit: h.orders_limit,
        ai_scopes_used: h.ai_scopes_used,
        ai_scopes_limit: h.ai_scopes_limit,
        contracts_used: h.contracts_used,
        contracts_limit: h.contracts_limit,
      })),
    };
  }

  // ── Supplier usage view ────────────────────────────────────────────────────
  // Mirror of getCustomerUsage for supplier accounts. Returns the 9 supplier
  // quotas, the current period boundaries, and the most recent 12 closed
  // periods. The history-row shape is leaner than customer's because suppliers
  // only have two counter-backed quotas (orders, bids).
  async getSupplierUsage(userId: string): Promise<{
    plan: { slug: string; name: string; status: string } | null;
    period: { start: string | null; end: string | null } | null;
    quotas: Record<string, { used: number; limit: number | null; remaining: number | null; warn: boolean }>;
    history: Array<{
      period_start: string;
      period_end: string;
      plan_name: string;
      orders_used: number;        orders_limit: number | null;
      // bids re-uses the ai_scopes column on SubscriptionUsageHistory because
      // the schema only has 4 counter columns and bids/ai_scopes never appear
      // on the same plan (suppliers have bids; customers have ai_scopes).
      // The supplier UI relabels the column to "Bids" in the history table.
      bids_used: number;          bids_limit: number | null;
    }>;
  }> {
    const { warningThresholdFor } = await import('@onys/shared');
    const sub0 = await this.getEffectiveSubscription(userId);
    if (!sub0 || (sub0.status !== 'ACTIVE' && sub0.status !== 'TRIALING')) {
      return {
        plan: sub0 ? { slug: sub0.plan.slug, name: sub0.plan.name, status: sub0.status } : null,
        period: null,
        quotas: {},
        history: [],
      };
    }
    const sub = await this.rolloverIfDue(sub0);

    const supplierQuotas: LimitType[] = [
      'active_tasks',
      'listing_items',
      'active_orders',
      'orders',
      'active_tenders',
      'active_contracts',
      'bids',
      'domain_categories',
      'team_seats',
    ];
    const quotas: Record<string, { used: number; limit: number | null; remaining: number | null; warn: boolean }> = {};
    for (const q of supplierQuotas) {
      const { current, limit } = await this.resolveCurrentAndLimit(sub, q);
      const remaining = limit === null ? null : Math.max(0, limit - current);
      const threshold = warningThresholdFor(sub.plan.slug, limit);
      const warn = remaining !== null && remaining <= threshold;
      quotas[q] = { used: current, limit, remaining, warn };
    }

    const historyRows = await this.prisma.subscriptionUsageHistory.findMany({
      where: { subscription_id: sub.id },
      orderBy: { period_end: 'desc' },
      take: 12,
    });

    return {
      plan: { slug: sub.plan.slug, name: sub.plan.name, status: sub.status },
      period: {
        start: sub.period_start?.toISOString() ?? null,
        end: sub.period_end?.toISOString() ?? null,
      },
      quotas,
      history: historyRows.map((h) => ({
        period_start: h.period_start.toISOString(),
        period_end: h.period_end.toISOString(),
        plan_name: h.plan_name,
        orders_used: h.orders_used,
        orders_limit: h.orders_limit,
        // bids share ai_scopes_used column (see comment on the type above)
        bids_used: h.ai_scopes_used,
        bids_limit: h.ai_scopes_limit,
      })),
    };
  }

  // Audience-aware dispatcher — returns the appropriate usage shape based on
  // the user's effective subscription's plan_type. Frontend route pulls this.
  async getUsageForUser(userId: string): Promise<
    | { audience: 'customer'; payload: Awaited<ReturnType<SubscriptionService['getCustomerUsage']>> }
    | { audience: 'supplier'; payload: Awaited<ReturnType<SubscriptionService['getSupplierUsage']>> }
  > {
    const sub = await this.getEffectiveSubscription(userId);
    const isSupplier = sub?.plan.plan_type.startsWith('SUPPLIER_') ?? false;
    if (isSupplier) {
      return { audience: 'supplier', payload: await this.getSupplierUsage(userId) };
    }
    return { audience: 'customer', payload: await this.getCustomerUsage(userId) };
  }

  async incrementUsage(userId: string, usageType: UsageType): Promise<void> {
    // UsageType is a strict subset of LimitType (the counter-backed quotas).
    const check = await this.checkLimit(userId, usageType as LimitType);
    if (!check.allowed) {
      throw new AppError(
        'SUBSCRIPTION_LIMIT_REACHED',
        429,
        `You have reached your ${usageType} limit (${check.limit ?? 0}) on the ${
          check.plan_name ?? 'free'
        } plan.`,
      );
    }
    const sub = await this.getEffectiveSubscription(userId);
    if (!sub) return;

    const fieldMap: Record<UsageType, keyof Prisma.SubscriptionUpdateInput> = {
      // Supplier-side counters
      bids: 'current_bid_count',
      orders: 'current_order_count',
      // Customer-side counters
      ai_requests: 'current_ai_request_count',
      task_bookings: 'current_task_booking_count',
      contracts: 'current_contract_count',
    };

    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { [fieldMap[usageType]]: { increment: 1 } },
    });

    // Audit (Option A) — every counter increment is appended to AuditLog so
    // platform admins can reconstruct usage history per subscription.
    const counterField = fieldMap[usageType];
    const newCount = (updated as unknown as Record<string, number>)[counterField] ?? null;
    void writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'SUBSCRIPTION_USAGE_INCREMENT',
      entityType: 'Subscription',
      entityId: sub.id,
      metadata: {
        limit_type: usageType,
        new_count: newCount,
        plan_limit: check.limit,
        plan_id: sub.plan_id,
      },
    });
  }

  async resetMonthlyUsage(): Promise<{ reset_count: number }> {
    const result = await this.prisma.subscription.updateMany({
      where: { status: { in: ['ACTIVE', 'TRIALING'] } },
      data: {
        current_bid_count: 0,
        current_ai_request_count: 0,
        current_order_count: 0,
        current_task_booking_count: 0,
        current_contract_count: 0,
        usage_reset_at: new Date(),
      },
    });
    return { reset_count: result.count };
  }

  // ─── Invoices (read paths) ────────────────────────────────────────────────

  async getInvoicesForSubject(subject: SubscriptionSubject) {
    if (subject.kind === 'user') {
      return this.prisma.invoice.findMany({
        where: {
          OR: [
            { billed_to_user_id: subject.userId },
            { subscription: { user_id: subject.userId } },
          ],
        },
        orderBy: { created_at: 'desc' },
      });
    }
    return this.prisma.invoice.findMany({
      where: {
        OR: [
          { billed_to_company_id: subject.companyId },
          { subscription: { company_id: subject.companyId } },
        ],
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /** @deprecated Use getInvoicesForSubject({ kind: 'user', userId }) instead. */
  async getInvoicesForUser(userId: string) {
    return this.getInvoicesForSubject({ kind: 'user', userId });
  }

  async getInvoiceForSubject(invoiceId: string, subject: SubscriptionSubject) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        subscription: { select: { user_id: true, company_id: true } },
      },
    });
    if (!invoice) throw new AppError('NOT_FOUND', 404);

    if (subject.kind === 'user') {
      const ownsDirectly = invoice.billed_to_user_id === subject.userId;
      const ownsViaSubscription = invoice.subscription.user_id === subject.userId;
      let ownsViaCompany = false;
      if (!ownsDirectly && !ownsViaSubscription && invoice.subscription.company_id) {
        const member = await this.prisma.companyMember.findFirst({
          where: {
            user_id: subject.userId,
            company_id: invoice.subscription.company_id,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        ownsViaCompany = !!member;
      }
      if (!ownsDirectly && !ownsViaSubscription && !ownsViaCompany) {
        throw new AppError('FORBIDDEN', 403);
      }
    } else {
      const owns =
        invoice.billed_to_company_id === subject.companyId ||
        invoice.subscription.company_id === subject.companyId;
      if (!owns) throw new AppError('FORBIDDEN', 403);
    }
    return invoice;
  }

  async getInvoicePdfDownloadUrl(
    invoiceId: string,
    subject: SubscriptionSubject,
  ): Promise<string> {
    const invoice = await this.getInvoiceForSubject(invoiceId, subject);
    if (!invoice.pdf_storage_url) {
      throw new AppError('PDF_NOT_GENERATED', 404, 'Invoice PDF not yet generated.');
    }
    // pdf_storage_url stores the blob path
    return generateSasUrl(invoice.pdf_storage_url, 60);
  }

  // ─── Admin: list & metrics ────────────────────────────────────────────────

  async getAllSubscriptions() {
    return this.prisma.subscription.findMany({
      include: {
        plan: { select: { id: true, name: true, slug: true, plan_type: true } },
        user: { select: { id: true, full_name: true, email: true, account_type: true } },
        company: { select: { id: true, company_name: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async getAdminMetrics() {
    const counts = await this.prisma.subscription.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const activeSubs = await this.prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'TRIALING'] } },
      select: {
        billing_interval: true,
        plan: { select: { monthly_price_aud: true, yearly_price_aud: true } },
      },
    });

    let mrrCents = 0;
    for (const s of activeSubs) {
      if (s.billing_interval === 'MONTHLY' && s.plan.monthly_price_aud) {
        mrrCents += Math.round(Number(s.plan.monthly_price_aud) * 100);
      } else if (s.billing_interval === 'YEARLY' && s.plan.yearly_price_aud) {
        mrrCents += Math.round((Number(s.plan.yearly_price_aud) * 100) / 12);
      }
    }

    const tierBreakdown = await this.prisma.subscription.groupBy({
      by: ['plan_id'],
      where: { status: { in: ['ACTIVE', 'TRIALING'] } },
      _count: { _all: true },
    });

    // Approximate churn: cancelled in the last 30 days / active 30 days ago
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const cancelledLast30 = await this.prisma.subscription.count({
      where: { cancelled_at: { gte: thirtyDaysAgo } },
    });
    const activeNow = activeSubs.length;
    const churnRate =
      activeNow + cancelledLast30 === 0
        ? 0
        : cancelledLast30 / (activeNow + cancelledLast30);

    return {
      counts_by_status: counts.map((c) => ({ status: c.status, count: c._count._all })),
      mrr_aud: mrrCents / 100,
      arr_aud: (mrrCents * 12) / 100,
      tier_breakdown: tierBreakdown.map((b) => ({ plan_id: b.plan_id, count: b._count._all })),
      churn_rate_30d: Number(churnRate.toFixed(4)),
      active_count: activeNow,
      cancelled_last_30d: cancelledLast30,
    };
  }
}
