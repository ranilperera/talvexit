import type { PrismaClient, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import Stripe from 'stripe';
import { constructWebhookEvent } from './stripe.service.js';
import { transitionOrder } from './order-state-machine.service.js';
import { writeAudit } from '../utils/audit.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

// ─── handleStripeWebhook ─────────────────────────────────────────────────────

export async function handleStripeWebhook(
  rawBody: Buffer,
  signature: string,
  webhookSecret: string,
  prisma: PrismaClient,
  emailQueue: Queue<EmailJobPayload>,
): Promise<{ received: boolean; event_type: string }> {
  // 1. Verify signature
  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err);
    throw { code: 'INVALID_SIGNATURE', status: 401, message: 'Webhook signature verification failed' };
  }

  // 2. Idempotency check
  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { stripe_event_id: event.id },
  });
  if (existing?.processed) {
    console.log(`[webhook] Already processed: ${event.id}`);
    return { received: true, event_type: event.type };
  }

  // 3. Store event (upsert — handles retry after crash before mark-processed)
  await prisma.stripeWebhookEvent.upsert({
    where: { stripe_event_id: event.id },
    create: {
      stripe_event_id: event.id,
      event_type: event.type,
      raw_payload: event as unknown as Prisma.InputJsonValue,
      processed: false,
    },
    update: {}, // don't overwrite if exists
  });

  // 4. Route to handler
  try {
    const eventType = event.type as string;
    const obj = event.data.object;

    switch (eventType) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(obj as Stripe.PaymentIntent, prisma);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(obj as Stripe.PaymentIntent, prisma, emailQueue);
        break;
      case 'transfer.paid':
        await handleTransferPaid(obj as Stripe.Transfer, prisma, emailQueue);
        break;
      case 'account.updated':
        await handleAccountUpdated(obj as Stripe.Account, prisma);
        break;
      default:
        console.log(`[webhook] Unhandled event type: ${eventType}`);
    }

    // Mark as processed
    await prisma.stripeWebhookEvent.update({
      where: { stripe_event_id: event.id },
      data: { processed: true, processed_at: new Date() },
    });
  } catch (err: unknown) {
    // Mark error but don't re-throw — return 200 to Stripe
    // (re-throwing causes Stripe to retry endlessly)
    const message = err instanceof Error ? err.message : String(err);
    await prisma.stripeWebhookEvent.update({
      where: { stripe_event_id: event.id },
      data: { processing_error: message },
    });
    console.error(`[webhook] Handler error for ${event.type}:`, err);
  }

  return { received: true, event_type: event.type };
}

// ─── HANDLER: payment_intent.succeeded ───────────────────────────────────────

async function handlePaymentIntentSucceeded(
  pi: Stripe.PaymentIntent,
  prisma: PrismaClient,
): Promise<void> {
  const orderId = pi.metadata.order_id;
  if (!orderId) {
    console.warn('[webhook] PI succeeded but no order_id in metadata');
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    console.warn(`[webhook] Order not found: ${orderId}`);
    return;
  }

  // Only transition if not already PAYMENT_HELD or beyond
  const alreadyProgressed = [
    'PAYMENT_HELD',
    'IN_PROGRESS',
    'PENDING_REVIEW',
    'COMPLETED',
    'DISPUTED',
  ].includes(order.status);
  if (alreadyProgressed) {
    console.log(`[webhook] Order already past PAYMENT_HELD: ${orderId}`);
    return;
  }

  await transitionOrder(prisma, orderId, 'PAYMENT_HELD', 'stripe-webhook', {
    skipGuards: true, // payment is confirmed — skip insurance recheck
  });

  void writeAudit(prisma, {
    actorId: 'stripe-webhook',
    actionType: 'PAYMENT_RECEIVED',
    entityType: 'Order',
    entityId: orderId,
    metadata: { payment_intent_id: pi.id, amount: pi.amount },
  });

  console.log(`[webhook] Payment held for order: ${orderId}`);
}

// ─── HANDLER: payment_intent.payment_failed ──────────────────────────────────

async function handlePaymentIntentFailed(
  pi: Stripe.PaymentIntent,
  prisma: PrismaClient,
  emailQueue: Queue<EmailJobPayload>,
): Promise<void> {
  const orderId = pi.metadata.order_id;
  if (!orderId) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: { select: { email: true, full_name: true } } },
  });
  if (!order) return;

  void writeAudit(prisma, {
    actorId: 'stripe-webhook',
    actionType: 'PAYMENT_FAILED',
    entityType: 'Order',
    entityId: orderId,
    metadata: {
      payment_intent_id: pi.id,
      failure_code: pi.last_payment_error?.code ?? null,
      failure_message: pi.last_payment_error?.message ?? null,
    },
  });

  await emailQueue.add('payment-failed', {
    type: 'payment-failed',
    to: order.customer.email,
    order_id: orderId,
    failure_reason: pi.last_payment_error?.message ?? 'Payment declined',
    retry_url: `${process.env.FRONTEND_URL}/orders/${orderId}/payment`,
  });

  console.log(`[webhook] Payment failed for order: ${orderId}`);
}

// ─── HANDLER: transfer.paid ───────────────────────────────────────────────────

async function handleTransferPaid(
  transfer: Stripe.Transfer,
  prisma: PrismaClient,
  emailQueue: Queue<EmailJobPayload>,
): Promise<void> {
  const orderId = transfer.metadata.order_id;
  if (!orderId) return;

  // Find PayoutRecord by transfer ID
  const payoutRecord = await prisma.payoutRecord.findFirst({
    where: { stripe_transfer_id: transfer.id },
    include: {
      contractor_profile: {
        include: { user: { select: { email: true, full_name: true } } },
      },
    },
  });

  if (!payoutRecord) {
    // Could be a milestone transfer
    const milestoneRelease = await prisma.milestoneRelease.findFirst({
      where: { stripe_transfer_id: transfer.id },
    });
    if (milestoneRelease) {
      await prisma.milestoneRelease.update({
        where: { id: milestoneRelease.id },
        data: { status: 'TRANSFERRED' },
      });
      return;
    }
    console.warn(`[webhook] Transfer not linked to payout or milestone: ${transfer.id}`);
    return;
  }

  // Update PayoutRecord to COMPLETED
  await prisma.payoutRecord.update({
    where: { id: payoutRecord.id },
    data: {
      status: 'COMPLETED',
      stripe_transfer_status: 'paid',
      completed_at: new Date(),
    },
  });

  await prisma.order.update({
    where: { id: orderId },
    data: { payout_status: 'COMPLETED' },
  });

  void writeAudit(prisma, {
    actorId: 'stripe-webhook',
    actionType: 'PAYOUT_COMPLETED',
    entityType: 'Order',
    entityId: orderId,
    metadata: {
      transfer_id: transfer.id,
      amount_aud: transfer.amount / 100,
    },
  });

  const contractor = payoutRecord.contractor_profile?.user;
  if (contractor) {
    await emailQueue.add('payout-completed', {
      type: 'payout-completed',
      to: contractor.email,
      order_id: orderId,
      amount_aud: transfer.amount / 100,
      transfer_id: transfer.id,
    });
  }

  console.log(`[webhook] Payout completed: ${transfer.id}`);
}

// ─── HANDLER: account.updated ────────────────────────────────────────────────

async function handleAccountUpdated(
  account: Stripe.Account,
  prisma: PrismaClient,
): Promise<void> {
  const connectRecord = await prisma.stripeConnectAccount.findUnique({
    where: { stripe_account_id: account.id },
  });
  if (!connectRecord) {
    console.warn(`[webhook] Connect account not found: ${account.id}`);
    return;
  }

  // Determine new status
  let newStatus: 'PENDING' | 'ENABLED' | 'RESTRICTED' = 'PENDING';
  if (account.charges_enabled && account.payouts_enabled) {
    newStatus = 'ENABLED';
  } else if (account.details_submitted) {
    newStatus = 'RESTRICTED';
  }

  await prisma.stripeConnectAccount.update({
    where: { id: connectRecord.id },
    data: {
      status: newStatus,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      requirements_due: account.requirements?.currently_due ?? [],
      account_updated_at: new Date(),
    },
  });

  console.log(`[webhook] Connect account updated: ${account.id} → ${newStatus}`);
}
