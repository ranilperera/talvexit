import type { PrismaClient, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import Stripe from 'stripe';
import { constructWebhookEvent } from './stripe.service.js';
import { ServiceInvoiceService } from './service-invoice.service.js';
import { SubscriptionService } from './subscription.service.js';
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoiceCreated,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
} from './subscription-webhook.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

// ─── handleStripeWebhook ─────────────────────────────────────────────────────
// Phase 5: legacy escrow handlers (transfer.paid, account.updated, the
// order_id branch on payment_intent.succeeded, and payment_intent.payment_failed)
// were removed when the platform stopped holding engagement funds. The remaining
// surface area is subscription billing + the optional Stripe-rail service-invoice
// flow.

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
    update: {},
  });

  // 4. Route to handler
  try {
    const eventType = event.type as string;
    const obj = event.data.object;

    switch (eventType) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(obj as Stripe.PaymentIntent, prisma, emailQueue);
        break;
      case 'checkout.session.completed':
        await handleCheckoutCompleted(obj as Stripe.Checkout.Session, prisma);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(obj as Stripe.Subscription, prisma);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(obj as Stripe.Subscription, prisma);
        break;
      case 'invoice.created':
        await handleInvoiceCreated(obj as Stripe.Invoice, prisma);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(obj as Stripe.Invoice, prisma, emailQueue);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(obj as Stripe.Invoice, prisma, emailQueue);
        break;
      default:
        console.log(`[webhook] Unhandled event type: ${eventType}`);
    }

    await prisma.stripeWebhookEvent.update({
      where: { stripe_event_id: event.id },
      data: { processed: true, processed_at: new Date() },
    });
  } catch (err: unknown) {
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
// Only the B2B service-invoice path remains. Order/tender-invoice direct
// payments use evidence-based confirmation, not webhooks.

async function handlePaymentIntentSucceeded(
  pi: Stripe.PaymentIntent,
  prisma: PrismaClient,
  emailQueue: Queue<EmailJobPayload>,
): Promise<void> {
  if (pi.metadata.service_invoice_id) {
    const subscriptionService = new SubscriptionService(prisma);
    const siService = new ServiceInvoiceService(prisma, emailQueue, subscriptionService);
    await siService.markPaidByStripeWebhook(pi.metadata.service_invoice_id, pi.id);
    console.log(`[webhook] Service invoice paid: ${pi.metadata.service_invoice_id}`);
    return;
  }

  console.warn('[webhook] PI succeeded but no service_invoice_id in metadata; ignoring.');
}
