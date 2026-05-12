import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import { handleStripeWebhook } from '../services/stripe-webhook.service.js';

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

/**
 * Stripe webhook receiver.
 *
 * Stripe signs the webhook body and we verify the signature against the raw
 * payload. Fastify's default JSON parser would mutate the body before we get
 * to it, so this plugin removes the JSON parser within its scope and replaces
 * it with one that keeps the raw Buffer. Encapsulating this in a plugin
 * keeps the override local — every other JSON-consuming route still uses the
 * default parser at the app level.
 *
 * Mounted at /api/v1/webhooks/stripe by app.ts.
 */
export async function webhookRoutes(
  app: FastifyInstance,
  opts: { prisma: PrismaClient; emailQueue: Queue<EmailJobPayload> },
) {
  const { prisma, emailQueue } = opts;

  // Replace the default JSON parser within this encapsulated plugin context
  // only, so we get the raw bytes Stripe signed instead of a parsed object.
  app.removeContentTypeParser(['application/json']);
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req: FastifyRequest, body: Buffer, done: (err: null, body: Buffer) => void) => {
      done(null, body);
    },
  );

  app.post('/webhooks/stripe', async (req, reply) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[webhook] STRIPE_WEBHOOK_SECRET is not configured');
      return reply
        .status(500)
        .send({ success: false, error: { code: 'NOT_CONFIGURED', message: 'Webhook secret not set.' } });
    }

    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') {
      return reply
        .status(400)
        .send({ success: false, error: { code: 'MISSING_SIGNATURE', message: 'Stripe-Signature header is required.' } });
    }

    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      return reply
        .status(400)
        .send({ success: false, error: { code: 'INVALID_BODY', message: 'Webhook body must be raw bytes.' } });
    }

    try {
      const result = await handleStripeWebhook(rawBody, signature, secret, prisma, emailQueue);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const e = err as { status?: number; code?: string; message?: string };
      const status = e.status ?? 500;
      return reply
        .status(status)
        .send({ success: false, error: { code: e.code ?? 'WEBHOOK_ERROR', message: e.message ?? 'Webhook failed.' } });
    }
  });
}
