import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  generateScopeSchema,
  acceptScopeSchema,
  regenerateSectionSchema,
} from '@onys/shared';
import type { ScopingService } from '../services/scoping.service.js';
import type { SubscriptionGuards } from '../middleware/subscription-limits.js';
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

// ─── Guard ────────────────────────────────────────────────────────────────────

async function requireCustomer(req: FastifyRequest, reply: FastifyReply) {
  if (req.user?.accountType !== 'CUSTOMER') {
    await reply.status(403).send({
      success: false,
      error: {
        code: 'CUSTOMER_ONLY',
        message: 'Only customers can use the AI scoping engine',
      },
    });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function scopingRoutes(
  app: FastifyInstance,
  opts: { scopingService: ScopingService; subscriptionGuards: SubscriptionGuards },
) {
  const { scopingService, subscriptionGuards } = opts;

  // ─── POST /scoping/generate ────────────────────────────────────────────────

  app.post(
    '/scoping/generate',
    {
      preHandler: [
        authenticate,
        requireCustomer,
        // Customer Quota 4 — uses the customer-facing 'ai_scopes' label
        // which maps to the same counter column (current_ai_request_count).
        subscriptionGuards.requireLimit('ai_scopes'),
      ],
    },
    async (req, reply) => {
      const parsed = generateScopeSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({
              field: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }

      try {
        const start = Date.now();
        const result = await scopingService.queueScopingJob(
          req.user!.userId,
          parsed.data,
          extractMeta(req),
        );
        const elapsed = Date.now() - start;

        if (elapsed > 150) {
          console.warn(`[scoping] queueScopingJob slow: ${elapsed}ms`);
        }

        return reply.status(202).send({
          success: true,
          data: {
            job_id: result.job_id,
            status: 'PENDING',
            poll_url: `/api/v1/scoping/${result.job_id}/status`,
            message: 'Scope generation queued. Poll the status endpoint.',
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /scoping/:job_id/status ───────────────────────────────────────────

  app.get(
    '/scoping/:job_id/status',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { job_id } = req.params as { job_id: string };

      try {
        const result = await scopingService.getJobStatus(job_id, req.user!.userId);

        if (result.status === 'PENDING' || result.status === 'PROCESSING') {
          void reply.header('Retry-After', '3');
        }

        return reply.status(200).send({
          success: true,
          data: {
            job_id,
            ...result,
            ...(result.status === 'COMPLETE'
              ? {
                  next_steps: {
                    review: 'Review the generated scope below.',
                    edit: 'You can edit any field before accepting.',
                    regenerate_section:
                      'Use /regenerate-section to redo a specific section.',
                    accept: `POST /api/v1/scoping/${job_id}/accept to confirm.`,
                  },
                }
              : {}),
            ...(result.status === 'FAILED'
              ? { retry_hint: 'POST /api/v1/scoping/generate to try again.' }
              : {}),
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /scoping/:job_id/accept ──────────────────────────────────────────

  app.post(
    '/scoping/:job_id/accept',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { job_id } = req.params as { job_id: string };

      const parsed = acceptScopeSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({
              field: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }

      try {
        const result = await scopingService.acceptScope(
          job_id,
          req.user!.userId,
          parsed.data,
          extractMeta(req),
        );
        return reply.status(200).send({
          success: true,
          data: {
            ...result,
            order_hint: `POST /api/v1/orders with { "scoping_job_id": "${job_id}" } to place your order.`,
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /scoping/:job_id/regenerate-section ──────────────────────────────

  app.post(
    '/scoping/:job_id/regenerate-section',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { job_id } = req.params as { job_id: string };

      const parsed = regenerateSectionSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({
              field: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }

      try {
        const result = await scopingService.queueSectionRegen(
          job_id,
          req.user!.userId,
          parsed.data,
        );
        return reply.status(202).send({
          success: true,
          data: {
            ...result,
            poll_url: `/api/v1/scoping/${job_id}/status`,
            message: `"${parsed.data.section}" section is being regenerated. Poll status.`,
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
