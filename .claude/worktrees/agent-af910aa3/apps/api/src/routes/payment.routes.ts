import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Queue } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { initiateConnectSchema, approveMilestoneSchema } from '@onys/shared';
import type { PaymentService } from '../services/payment.service.js';
import { handleStripeWebhook } from '../services/stripe-webhook.service.js';
import { authenticate } from '../middleware/authenticate.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractMeta(req: FastifyRequest) {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'] ?? 'unknown',
  };
}

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  const status = e.status ?? 500;
  const code = e.code ?? 'INTERNAL_ERROR';
  const message = e.message ?? 'An unexpected error occurred';
  return reply.status(status).send({ success: false, error: { code, message } });
}

function validationError(
  reply: FastifyReply,
  issues: { path: (string | number)[]; message: string }[],
) {
  return reply.status(400).send({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      fields: issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    },
  });
}

// ─── Actor guards ─────────────────────────────────────────────────────────────

async function requireCustomer(req: FastifyRequest, reply: FastifyReply) {
  if (req.user?.accountType !== 'CUSTOMER') {
    await reply.status(403).send({
      success: false,
      error: { code: 'CUSTOMER_ONLY', message: 'Only customers can perform this action' },
    });
  }
}

async function requireContractorOrOrgMember(req: FastifyRequest, reply: FastifyReply) {
  const allowed = ['INDIVIDUAL_CONTRACTOR', 'ORGANIZATION_ADMIN', 'ORG_MEMBER'] as const;
  if (!req.user || !(allowed as readonly string[]).includes(req.user.accountType)) {
    await reply.status(403).send({
      success: false,
      error: { code: 'CONTRACTOR_ONLY', message: 'Only contractors can perform this action' },
    });
  }
}

// ─── paymentRoutes ────────────────────────────────────────────────────────────

export async function paymentRoutes(
  app: FastifyInstance,
  opts: {
    paymentService: PaymentService;
    prisma: PrismaClient;
    emailQueue: Queue;
  },
) {
  const { paymentService, prisma, emailQueue } = opts;

  // ─── STRIPE WEBHOOK (raw body required) ──────────────────────────────────
  // Must be registered before standard JSON parsing routes.
  // Scoped content-type parser captures raw Buffer for HMAC verification.

  app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => {
        done(null, body);
      },
    );

    scope.post('/webhooks/stripe', async (req, reply) => {
      const rawBody = req.body as Buffer;
      const signature = req.headers['stripe-signature'] as string | undefined;

      if (!signature) {
        return reply.status(400).send({ error: 'Missing stripe-signature header' });
      }

      await handleStripeWebhook(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!,
        prisma,
        emailQueue,
      );

      return reply.status(200).send({ received: true });
    });
  });

  // ─── CUSTOMER: Create PaymentIntent ──────────────────────────────────────

  app.post(
    '/orders/:id/payment/create',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const result = await paymentService.createPaymentIntent(
          id,
          req.user!.userId,
          extractMeta(req),
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── CONTRACTOR: Initiate Stripe Connect onboarding ──────────────────────

  app.post(
    '/contractor/stripe/connect',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      const parsed = initiateConnectSchema.safeParse(req.body);
      if (!parsed.success) {
        return validationError(reply, parsed.error.issues);
      }
      try {
        const result = await paymentService.initiateConnectOnboarding(
          req.user!.userId,
          parsed.data,
        );
        return reply.status(200).send({
          success: true,
          data: {
            onboarding_url: result.onboarding_url,
            stripe_account_id: result.stripe_account_id,
            message: 'Complete Stripe Connect setup to enable payouts.',
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── CONTRACTOR: Get Connect status ──────────────────────────────────────

  app.get(
    '/contractor/stripe/status',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      try {
        const result = await paymentService.getConnectStatus(req.user!.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── CUSTOMER: Approve milestone ─────────────────────────────────────────

  app.post(
    '/orders/:id/milestones/:m_id/approve',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { id, m_id } = req.params as { id: string; m_id: string };
      const parsed = approveMilestoneSchema.safeParse(req.body);
      if (!parsed.success) {
        return validationError(reply, parsed.error.issues);
      }
      const milestoneSequence = Number(m_id);
      if (isNaN(milestoneSequence)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_MILESTONE', message: 'Milestone ID must be a number' },
        });
      }
      try {
        const result = await paymentService.approveMilestone(
          id,
          milestoneSequence,
          req.user!.userId,
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ANY: Get invoice SAS URL ─────────────────────────────────────────────

  app.get(
    '/orders/:id/invoice',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const result = await paymentService.getInvoiceSasUrl(id, req.user!.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── CONTRACTOR: Payout history ───────────────────────────────────────────

  app.get(
    '/contractor/payouts',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      try {
        const payouts = await paymentService.getPayoutHistory(req.user!.userId);
        return reply.status(200).send({
          success: true,
          data: { payouts, count: payouts.length },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
