import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  createPlanSchema,
  updatePlanSchema,
  createCheckoutSchema,
} from '@onys/shared';
import type { SubscriptionService } from '../services/subscription.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin, requirePermission } from '../middleware/admin-guards.js';

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  const status = e.status ?? 500;
  const code = e.code ?? 'INTERNAL_ERROR';
  const message = e.message ?? 'An unexpected error occurred';
  return reply.status(status).send({ success: false, error: { code, message } });
}

// Pull `?subject=company` off the request and resolve to a SubscriptionSubject.
// Defaults to the personal subject. Company subjects require the caller to be
// the company's primary admin (resolveSubject enforces that).
function pickSubjectKind(req: FastifyRequest): 'user' | 'company' {
  const q = req.query as { subject?: unknown } | undefined;
  return q?.subject === 'company' ? 'company' : 'user';
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

export async function subscriptionRoutes(
  app: FastifyInstance,
  opts: { subscriptionService: SubscriptionService },
) {
  const { subscriptionService } = opts;

  // ─── PUBLIC: list active public plans ───────────────────────────────────────

  app.get('/subscriptions/plans', async (_req, reply) => {
    try {
      const plans = await subscriptionService.getPublicPlans();
      return reply.status(200).send({ success: true, data: plans });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── AUTH: current subscription ────────────────────────────────────────────
  // All authenticated subscription endpoints accept `?subject=company` to
  // target the caller's company subscription instead of their personal one.
  // resolveSubject() enforces that the caller is the company's primary
  // admin when subject=company is requested.

  app.get(
    '/subscriptions/current',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        const subject = await subscriptionService.resolveSubject(req.user!.userId, {
          as: pickSubjectKind(req),
        });
        const sub = await subscriptionService.getCurrentSubscription(subject);
        return reply.status(200).send({ success: true, data: sub });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── AUTH: usage for the customer's current period + history ──────────────
  // Returns:
  //   - current period: per-quota { used, limit, remaining, warn } object,
  //     plus period_start / period_end so the UI can show "resets in X days".
  //   - history: most recent 12 closed periods from SubscriptionUsageHistory.
  // Available to any authenticated user; the LimitType check ensures only
  // customer-relevant quotas are returned for customer accounts.

  app.get(
    '/subscriptions/me/usage',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        // Audience-aware dispatcher — returns { audience, payload }. Customer
        // panel and supplier panel render different quota sets, but call the
        // same endpoint and branch on response shape.
        const usage = await subscriptionService.getUsageForUser(req.user!.userId);
        return reply.status(200).send({ success: true, data: usage });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── AUTH: start checkout ──────────────────────────────────────────────────

  app.post(
    '/subscriptions/checkout',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const parsed = createCheckoutSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);
      try {
        const subject = await subscriptionService.resolveSubject(req.user!.userId, {
          as: pickSubjectKind(req),
        });
        const url = await subscriptionService.createCheckoutSession(
          subject,
          parsed.data.plan_id,
          parsed.data.interval,
        );
        return reply.status(200).send({ success: true, data: { checkout_url: url } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── AUTH: explicit reconcile from Stripe ─────────────────────────────────
  // Recovery path when a webhook was dropped (e.g. stripe listen wasn't
  // running when the customer completed checkout). getCurrentSubscription()
  // already auto-reconciles on every load, but this route is wired to a
  // "Refresh from Stripe" button on /billing for an explicit user action.

  app.post(
    '/subscriptions/sync',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        const subject = await subscriptionService.resolveSubject(req.user!.userId, {
          as: pickSubjectKind(req),
        });
        const result = await subscriptionService.reconcileFromStripe(subject);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── AUTH: open Stripe billing portal ──────────────────────────────────────

  app.post(
    '/subscriptions/portal',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        const subject = await subscriptionService.resolveSubject(req.user!.userId, {
          as: pickSubjectKind(req),
        });
        const url = await subscriptionService.createPortalSession(subject);
        return reply.status(200).send({ success: true, data: { portal_url: url } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── AUTH: cancel at period end ────────────────────────────────────────────

  app.post(
    '/subscriptions/cancel',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        const subject = await subscriptionService.resolveSubject(req.user!.userId, {
          as: pickSubjectKind(req),
        });
        const sub = await subscriptionService.cancelSubscription(subject);
        return reply.status(200).send({ success: true, data: sub });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── AUTH: list invoices ───────────────────────────────────────────────────

  app.get(
    '/subscriptions/invoices',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        const subject = await subscriptionService.resolveSubject(req.user!.userId, {
          as: pickSubjectKind(req),
        });
        const invoices = await subscriptionService.getInvoicesForSubject(subject);
        return reply.status(200).send({ success: true, data: invoices });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── AUTH: download invoice PDF (returns time-limited SAS URL) ─────────────

  app.get(
    '/subscriptions/invoices/:id/pdf',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const subject = await subscriptionService.resolveSubject(req.user!.userId, {
          as: pickSubjectKind(req),
        });
        const url = await subscriptionService.getInvoicePdfDownloadUrl(id, subject);
        return reply.status(200).send({ success: true, data: { download_url: url } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: list all plans (incl. inactive) ────────────────────────────────

  app.get(
    '/admin/subscriptions/plans',
    { preHandler: [authenticate, requireAdmin] },
    async (_req, reply) => {
      try {
        const plans = await subscriptionService.getAllPlans();
        return reply.status(200).send({ success: true, data: plans });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: create plan ────────────────────────────────────────────────────

  app.post(
    '/admin/subscriptions/plans',
    { preHandler: [authenticate, requirePermission('manage_platform_config')] },
    async (req, reply) => {
      const parsed = createPlanSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);
      try {
        const plan = await subscriptionService.createPlan(parsed.data);
        return reply.status(201).send({ success: true, data: plan });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: update plan ────────────────────────────────────────────────────

  app.put(
    '/admin/subscriptions/plans/:id',
    { preHandler: [authenticate, requirePermission('manage_platform_config')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = updatePlanSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);
      try {
        const plan = await subscriptionService.updatePlan(id, parsed.data);
        return reply.status(200).send({ success: true, data: plan });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: soft-delete plan ───────────────────────────────────────────────

  app.delete(
    '/admin/subscriptions/plans/:id',
    { preHandler: [authenticate, requirePermission('manage_platform_config')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        await subscriptionService.deletePlan(id);
        return reply.status(200).send({ success: true, data: { message: 'Plan deactivated.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: sync plan to Stripe ────────────────────────────────────────────

  app.post(
    '/admin/subscriptions/plans/:id/sync-stripe',
    { preHandler: [authenticate, requirePermission('manage_platform_config')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const plan = await subscriptionService.syncPlanToStripe(id);
        return reply.status(200).send({ success: true, data: plan });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: list all subscriptions ─────────────────────────────────────────

  app.get(
    '/admin/subscriptions/all',
    { preHandler: [authenticate, requireAdmin] },
    async (_req, reply) => {
      try {
        const subs = await subscriptionService.getAllSubscriptions();
        return reply.status(200).send({ success: true, data: subs });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: metrics (MRR / ARR / churn / tier breakdown) ───────────────────

  app.get(
    '/admin/subscriptions/metrics',
    { preHandler: [authenticate, requireAdmin] },
    async (_req, reply) => {
      try {
        const metrics = await subscriptionService.getAdminMetrics();
        return reply.status(200).send({ success: true, data: metrics });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
