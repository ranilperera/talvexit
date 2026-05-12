import type { PrismaClient, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import type Stripe from 'stripe';
import { stripe } from './stripe.service.js';
import { generateAndStoreInvoicePdf } from './subscription-invoice-pdf.service.js';
import { writeAudit } from '../utils/audit.js';

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

// Map a Stripe subscription status to our enum
function mapStripeStatus(s: Stripe.Subscription['status']): Prisma.SubscriptionUpdateInput['status'] {
  switch (s) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
      return 'CANCELLED';
    case 'unpaid':
      return 'UNPAID';
    case 'paused':
      return 'PAUSED';
    case 'incomplete':
    case 'incomplete_expired':
    default:
      return 'INACTIVE';
  }
}

/**
 * Resolves the email recipient for a subscription billing notification. For
 * personal subs we email the user; for company subs we fall back to the
 * company's primary admin (since `Subscription.user_id` is null on company
 * subs and otherwise no receipt would go out at all).
 *
 * Returns null when no recipient can be determined — caller should skip the
 * email and just log.
 */
async function resolveSubscriptionRecipient(
  prisma: PrismaClient,
  sub: { user_id: string | null; company_id: string | null },
): Promise<{ email: string; full_name: string; actorId: string } | null> {
  if (sub.user_id) {
    const user = await prisma.user.findUnique({
      where: { id: sub.user_id },
      select: { id: true, email: true, full_name: true },
    });
    if (user?.email) {
      return { email: user.email, full_name: user.full_name, actorId: user.id };
    }
  }
  if (sub.company_id) {
    const company = await prisma.consultingCompany.findUnique({
      where: { id: sub.company_id },
      select: {
        primary_admin: { select: { id: true, email: true, full_name: true } },
      },
    });
    const admin = company?.primary_admin;
    if (admin?.email) {
      return { email: admin.email, full_name: admin.full_name, actorId: admin.id };
    }
  }
  return null;
}

/**
 * Resolves a Stripe price id back to one of our SubscriptionPlan rows. Used
 * when reconciling plan changes (Stripe Billing Portal upgrades/downgrades
 * etc) — the webhook only tells us "subscription updated, here's the new
 * price" and we have to map it ourselves.
 */
export async function resolvePlanFromStripePrice(
  prisma: PrismaClient,
  priceId: string,
): Promise<{ planId: string; interval: 'MONTHLY' | 'YEARLY' } | null> {
  const monthly = await prisma.subscriptionPlan.findFirst({
    where: { stripe_price_id_monthly: priceId },
    select: { id: true },
  });
  if (monthly) return { planId: monthly.id, interval: 'MONTHLY' };
  const yearly = await prisma.subscriptionPlan.findFirst({
    where: { stripe_price_id_yearly: priceId },
    select: { id: true },
  });
  if (yearly) return { planId: yearly.id, interval: 'YEARLY' };
  return null;
}

// ─── checkout.session.completed ──────────────────────────────────────────────
// First time the user buys: create the local Subscription record from Stripe data.

export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  prisma: PrismaClient,
): Promise<void> {
  if (session.mode !== 'subscription') return;
  const stripeSubId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  if (!stripeSubId) {
    console.warn('[sub-webhook] checkout.session.completed without subscription id');
    return;
  }
  const userId = session.metadata?.user_id ?? null;
  const companyId = session.metadata?.company_id ?? null;
  const planId = session.metadata?.plan_id;
  const interval = session.metadata?.interval === 'yearly' ? 'YEARLY' : 'MONTHLY';
  if (!planId || (!userId && !companyId)) {
    console.warn(
      `[sub-webhook] checkout.session.completed missing plan_id or owner metadata: ${session.id}`,
    );
    return;
  }

  const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id ?? null;

  const ownerData = companyId ? { company_id: companyId } : { user_id: userId! };

  // Persist the customer id back onto whichever owner this checkout belongs
  // to, so a future portal/cancel/sync call resolves to the same Stripe
  // customer regardless of which admin initiates it.
  if (customerId) {
    if (companyId) {
      await prisma.consultingCompany
        .update({
          where: { id: companyId },
          data: { stripe_customer_id: customerId },
        })
        .catch((err: unknown) => {
          console.warn(
            `[sub-webhook] could not persist stripe_customer_id on company ${companyId}:`,
            err,
          );
        });
    } else if (userId) {
      await prisma.user
        .update({
          where: { id: userId },
          data: { stripe_customer_id: customerId },
        })
        .catch((err: unknown) => {
          console.warn(
            `[sub-webhook] could not persist stripe_customer_id on user ${userId}:`,
            err,
          );
        });
    }
  }

  await prisma.subscription.upsert({
    where: { stripe_subscription_id: stripeSubId },
    create: {
      ...ownerData,
      plan_id: planId,
      billing_interval: interval,
      status: mapStripeStatus(stripeSub.status) as never,
      stripe_customer_id: customerId,
      stripe_subscription_id: stripeSubId,
      stripe_current_period_start: new Date(stripeSub.current_period_start * 1000),
      stripe_current_period_end: new Date(stripeSub.current_period_end * 1000),
      stripe_cancel_at_period_end: stripeSub.cancel_at_period_end,
      stripe_trial_end: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
      started_at: new Date(),
    },
    update: {
      plan_id: planId,
      billing_interval: interval,
      status: mapStripeStatus(stripeSub.status) as never,
      stripe_customer_id: customerId,
      stripe_current_period_start: new Date(stripeSub.current_period_start * 1000),
      stripe_current_period_end: new Date(stripeSub.current_period_end * 1000),
      stripe_cancel_at_period_end: stripeSub.cancel_at_period_end,
      stripe_trial_end: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
    },
  });

  // Audit actor: prefer user_id when present; otherwise the company's primary admin.
  let actorId: string = userId ?? 'stripe-webhook';
  if (!userId && companyId) {
    const company = await prisma.consultingCompany.findUnique({
      where: { id: companyId },
      select: { primary_admin_id: true },
    });
    actorId = company?.primary_admin_id ?? 'stripe-webhook';
  }

  void writeAudit(prisma, {
    actorId,
    actionType: 'SUBSCRIPTION_CREATED',
    entityType: 'Subscription',
    entityId: stripeSubId,
    metadata: {
      plan_id: planId,
      interval,
      stripe_status: stripeSub.status,
      ...(companyId ? { company_id: companyId } : {}),
      ...(userId ? { user_id: userId } : {}),
    },
  });
  console.log(
    `[sub-webhook] subscription created/upserted for ${
      companyId ? `company ${companyId}` : `user ${userId}`
    }, plan ${planId}`,
  );
}

// ─── customer.subscription.updated / .deleted ────────────────────────────────

export async function handleSubscriptionUpdated(
  sub: Stripe.Subscription,
  prisma: PrismaClient,
): Promise<void> {
  const existing = await prisma.subscription.findUnique({
    where: { stripe_subscription_id: sub.id },
    select: { id: true, user_id: true, plan_id: true, billing_interval: true },
  });
  if (!existing) {
    console.warn(`[sub-webhook] update for unknown subscription: ${sub.id}`);
    return;
  }

  // Detect plan changes (Stripe Billing Portal upgrades/downgrades arrive as
  // customer.subscription.updated with a new price id on item[0]). If the
  // new price maps to a different plan, switch the local row over.
  const stripePriceId = sub.items.data[0]?.price?.id;
  let planChange: { planId: string; interval: 'MONTHLY' | 'YEARLY' } | null = null;
  if (stripePriceId) {
    const resolved = await resolvePlanFromStripePrice(prisma, stripePriceId);
    if (
      resolved &&
      (resolved.planId !== existing.plan_id || resolved.interval !== existing.billing_interval)
    ) {
      planChange = resolved;
    }
  }

  // Mirror Stripe's billing period into our period_start / period_end so the
  // lazy rollover in SubscriptionService.rolloverIfDue() uses Stripe as the
  // source of truth for paid plans. Free / cancelled plans keep our locally-
  // computed anniversary period.
  const stripePeriodStart = new Date(sub.current_period_start * 1000);
  const stripePeriodEnd = new Date(sub.current_period_end * 1000);

  await prisma.subscription.update({
    where: { id: existing.id },
    data: {
      status: mapStripeStatus(sub.status) as never,
      stripe_current_period_start: stripePeriodStart,
      stripe_current_period_end: stripePeriodEnd,
      stripe_cancel_at_period_end: sub.cancel_at_period_end,
      stripe_trial_end: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      // Sync our local period bounds with Stripe so quota checks key off the
      // same period Stripe is billing for.
      period_start: stripePeriodStart,
      period_end: stripePeriodEnd,
      ...(planChange && {
        plan_id: planChange.planId,
        billing_interval: planChange.interval,
      }),
      ...(sub.status === 'canceled' && { cancelled_at: new Date() }),
    },
  });

  void writeAudit(prisma, {
    actorId: existing.user_id ?? 'stripe-webhook',
    actionType: planChange ? 'SUBSCRIPTION_PLAN_CHANGED' : 'SUBSCRIPTION_UPDATED',
    entityType: 'Subscription',
    entityId: existing.id,
    metadata: {
      stripe_status: sub.status,
      cancel_at_period_end: sub.cancel_at_period_end,
      ...(planChange && {
        from_plan_id: existing.plan_id,
        to_plan_id: planChange.planId,
        new_interval: planChange.interval,
      }),
    },
  });
}

export async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  prisma: PrismaClient,
): Promise<void> {
  const existing = await prisma.subscription.findUnique({
    where: { stripe_subscription_id: sub.id },
    select: { id: true, user_id: true, plan: { select: { plan_type: true } } },
  });
  if (!existing) return;

  // Cancellation policy — both audiences auto-downgrade to their respective
  // Free tier on Stripe deletion (see docs/{customer,supplier}-subscription-plan.html):
  //   - The Subscription row is preserved with plan_id flipped to the Free
  //     plan, so lazy rollover keeps ticking and limit checks still find an
  //     active sub.
  //   - Stripe pointers (subscription_id, current_period_*) are cleared.
  //   - Counters reset to 0 on the new period boundary.
  const planType = existing.plan?.plan_type ?? '';
  const isCustomerPlan = planType.startsWith('CUSTOMER_');
  const isSupplierPlan = planType.startsWith('SUPPLIER_');

  if (isCustomerPlan || isSupplierPlan) {
    const targetSlug = isCustomerPlan ? 'customer-starter' : 'supplier-free';
    const freePlan = await prisma.subscriptionPlan.findUnique({
      where: { slug: targetSlug },
      select: { id: true },
    });
    if (freePlan) {
      const now = new Date();
      const nextEnd = new Date(now);
      nextEnd.setUTCMonth(nextEnd.getUTCMonth() + 1);
      await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          plan_id: freePlan.id,
          status: 'ACTIVE',
          stripe_subscription_id: null,
          stripe_current_period_start: null,
          stripe_current_period_end: null,
          stripe_cancel_at_period_end: false,
          billing_interval: 'MONTHLY',
          period_start: now,
          period_end: nextEnd,
          // Reset every counter on the new Free period — covers both audiences.
          // Computed quotas (active_orders, active_tenders, etc.) need no reset.
          current_task_booking_count: 0,
          current_order_count: 0,
          current_ai_request_count: 0,
          current_contract_count: 0,
          current_bid_count: 0,
          cancelled_at: now,
        },
      });
      void writeAudit(prisma, {
        actorId: existing.user_id ?? 'stripe-webhook',
        actionType: 'SUBSCRIPTION_AUTO_DOWNGRADED_TO_FREE',
        entityType: 'Subscription',
        entityId: existing.id,
        metadata: { from_stripe_subscription: sub.id, downgraded_to: targetSlug },
      });
      return;
    }
    // Free plan missing (seed not run) — fall through to plain CANCELLED
    console.warn(
      `[sub-webhook] ${targetSlug} plan missing — cannot auto-downgrade. Run seed:subscriptions.`,
    );
  }

  await prisma.subscription.update({
    where: { id: existing.id },
    data: {
      status: 'CANCELLED',
      cancelled_at: new Date(),
    },
  });

  void writeAudit(prisma, {
    actorId: existing.user_id ?? 'stripe-webhook',
    actionType: 'SUBSCRIPTION_DELETED',
    entityType: 'Subscription',
    entityId: existing.id,
    metadata: { stripe_subscription_id: sub.id },
  });
}

// ─── invoice.* ───────────────────────────────────────────────────────────────

export async function handleInvoiceCreated(
  inv: Stripe.Invoice,
  prisma: PrismaClient,
): Promise<void> {
  if (!inv.subscription) return; // not a subscription invoice
  const stripeSubId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription.id;

  const sub = await prisma.subscription.findUnique({
    where: { stripe_subscription_id: stripeSubId },
    select: { id: true, user_id: true, company_id: true },
  });
  if (!sub) {
    console.warn(`[sub-webhook] invoice.created for unknown subscription: ${stripeSubId}`);
    return;
  }

  const lineItems = inv.lines.data.map((l) => ({
    description: l.description ?? '',
    quantity: l.quantity ?? 1,
    unit_amount: l.price?.unit_amount ?? l.amount,
    amount: l.amount,
    period_start: l.period?.start ? new Date(l.period.start * 1000).toISOString() : null,
    period_end: l.period?.end ? new Date(l.period.end * 1000).toISOString() : null,
  }));

  await prisma.invoice.upsert({
    where: { stripe_invoice_id: inv.id },
    create: {
      invoice_number: inv.number ?? `STRIPE-${inv.id}`,
      status: 'OPEN',
      subscription_id: sub.id,
      billed_to_user_id: sub.user_id,
      billed_to_company_id: sub.company_id,
      stripe_invoice_id: inv.id,
      stripe_payment_intent_id:
        typeof inv.payment_intent === 'string'
          ? inv.payment_intent
          : inv.payment_intent?.id ?? null,
      currency: inv.currency.toUpperCase(),
      subtotal_cents: inv.subtotal,
      tax_cents: inv.tax ?? 0,
      total_cents: inv.total,
      amount_paid_cents: inv.amount_paid,
      line_items: lineItems as Prisma.InputJsonValue,
      billing_period_start: inv.period_start ? new Date(inv.period_start * 1000) : null,
      billing_period_end: inv.period_end ? new Date(inv.period_end * 1000) : null,
      due_date: inv.due_date ? new Date(inv.due_date * 1000) : null,
      tax_invoice_number: inv.number ?? null,
    },
    update: {
      status: 'OPEN',
      total_cents: inv.total,
      tax_cents: inv.tax ?? 0,
      subtotal_cents: inv.subtotal,
      amount_paid_cents: inv.amount_paid,
      line_items: lineItems as Prisma.InputJsonValue,
    },
  });
}

export async function handleInvoicePaymentSucceeded(
  inv: Stripe.Invoice,
  prisma: PrismaClient,
  emailQueue: Queue<EmailJobPayload>,
): Promise<void> {
  if (!inv.subscription) return;

  const stripeSubId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription.id;
  const sub = await prisma.subscription.findUnique({
    where: { stripe_subscription_id: stripeSubId },
    select: { id: true, user_id: true, company_id: true },
  });
  if (!sub) return;

  // Upsert in case invoice.created didn't fire first
  const lineItems = inv.lines.data.map((l) => ({
    description: l.description ?? '',
    quantity: l.quantity ?? 1,
    unit_amount: l.price?.unit_amount ?? l.amount,
    amount: l.amount,
  }));

  const invoiceRow = await prisma.invoice.upsert({
    where: { stripe_invoice_id: inv.id },
    create: {
      invoice_number: inv.number ?? `STRIPE-${inv.id}`,
      status: 'PAID',
      subscription_id: sub.id,
      billed_to_user_id: sub.user_id,
      billed_to_company_id: sub.company_id,
      stripe_invoice_id: inv.id,
      stripe_payment_intent_id:
        typeof inv.payment_intent === 'string'
          ? inv.payment_intent
          : inv.payment_intent?.id ?? null,
      currency: inv.currency.toUpperCase(),
      subtotal_cents: inv.subtotal,
      tax_cents: inv.tax ?? 0,
      total_cents: inv.total,
      amount_paid_cents: inv.amount_paid,
      line_items: lineItems as Prisma.InputJsonValue,
      billing_period_start: inv.period_start ? new Date(inv.period_start * 1000) : null,
      billing_period_end: inv.period_end ? new Date(inv.period_end * 1000) : null,
      paid_at: new Date(),
      tax_invoice_number: inv.number ?? null,
    },
    update: {
      status: 'PAID',
      amount_paid_cents: inv.amount_paid,
      paid_at: new Date(),
      stripe_payment_intent_id:
        typeof inv.payment_intent === 'string'
          ? inv.payment_intent
          : inv.payment_intent?.id ?? null,
    },
  });

  // Generate and persist tax invoice PDF (best-effort — don't block webhook 200)
  try {
    await generateAndStoreInvoicePdf(invoiceRow.id, prisma);
  } catch (err) {
    console.error(`[sub-webhook] PDF generation failed for invoice ${invoiceRow.id}:`, err);
  }

  // Queue receipt email — for company subs, the primary admin gets it.
  const recipient = await resolveSubscriptionRecipient(prisma, sub);
  if (recipient) {
    await emailQueue.add('subscription-payment-receipt', {
      type: 'subscription-payment-receipt',
      to: recipient.email,
      full_name: recipient.full_name,
      amount_aud: inv.amount_paid / 100,
      invoice_number: inv.number ?? inv.id,
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
    });
  } else {
    console.warn(
      `[sub-webhook] no recipient resolved for paid invoice ${inv.id} on sub ${sub.id} — receipt skipped`,
    );
  }

  void writeAudit(prisma, {
    actorId: recipient?.actorId ?? sub.user_id ?? 'stripe-webhook',
    actionType: 'SUBSCRIPTION_PAYMENT_SUCCEEDED',
    entityType: 'Subscription',
    entityId: sub.id,
    metadata: {
      stripe_invoice_id: inv.id,
      amount_cents: inv.amount_paid,
      ...(sub.company_id ? { company_id: sub.company_id } : {}),
    },
  });
}

export async function handleInvoicePaymentFailed(
  inv: Stripe.Invoice,
  prisma: PrismaClient,
  emailQueue: Queue<EmailJobPayload>,
): Promise<void> {
  if (!inv.subscription) return;

  const stripeSubId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription.id;
  const sub = await prisma.subscription.findUnique({
    where: { stripe_subscription_id: stripeSubId },
    select: { id: true, user_id: true, company_id: true },
  });
  if (!sub) return;

  await prisma.invoice
    .update({
      where: { stripe_invoice_id: inv.id },
      data: { status: 'OPEN' }, // remains unpaid; Stripe will retry
    })
    .catch(() => null);

  const recipient = await resolveSubscriptionRecipient(prisma, sub);
  if (recipient) {
    await emailQueue.add('subscription-payment-failed', {
      type: 'subscription-payment-failed',
      to: recipient.email,
      full_name: recipient.full_name,
      amount_aud: inv.amount_due / 100,
      invoice_number: inv.number ?? inv.id,
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
    });
  } else {
    console.warn(
      `[sub-webhook] no recipient resolved for failed invoice ${inv.id} on sub ${sub.id} — alert skipped`,
    );
  }

  void writeAudit(prisma, {
    actorId: recipient?.actorId ?? sub.user_id ?? 'stripe-webhook',
    actionType: 'SUBSCRIPTION_PAYMENT_FAILED',
    entityType: 'Subscription',
    entityId: sub.id,
    metadata: {
      stripe_invoice_id: inv.id,
      amount_cents: inv.amount_due,
      attempt: inv.attempt_count,
      ...(sub.company_id ? { company_id: sub.company_id } : {}),
    },
  });
}
