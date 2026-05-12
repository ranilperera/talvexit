import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  fileDisputeSchema,
  addSubmissionSchema,
  assignDisputeSchema,
  appointArbitratorSchema,
  determinationSchema,
} from '@onys/shared';
import { z } from 'zod';
import type { DisputeService } from '../services/dispute.service.js';
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

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const adminTypes = ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'] as const;
  if (!req.user || !(adminTypes as readonly string[]).includes(req.user.accountType)) {
    await reply.status(403).send({
      success: false,
      error: { code: 'ADMIN_ONLY', message: 'Admin access required' },
    });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function disputeRoutes(
  app: FastifyInstance,
  opts: { disputeService: DisputeService },
) {
  const { disputeService } = opts;

  const listDisputesQuerySchema = z.object({
    status: z
      .enum(['OPEN', 'ASSIGNED', 'UNDER_REVIEW', 'DETERMINED', 'CLOSED'])
      .optional(),
    grounds: z
      .enum([
        'DELIVERABLES_NOT_AS_SCOPED',
        'WORK_ABANDONED',
        'ACCESS_EXCEEDED',
        'CUSTOMER_WITHHOLDING_APPROVAL',
        'SCOPE_MISREPRESENTATION',
        'DATA_BREACH',
      ])
      .optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  });

  // ─── POST /orders/:id/disputes ────────────────────────────────────────────
  // Either party files a dispute on an in-progress order

  app.post(
    '/orders/:id/disputes',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id: orderId } = req.params as { id: string };
      const parsed = fileDisputeSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);

      try {
        const result = await disputeService.fileDispute(
          orderId,
          req.user!.userId,
          parsed.data,
          extractMeta(req),
        );
        return reply.status(201).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /disputes/:id/submission ────────────────────────────────────────
  // Either party adds evidence/argument during submission window

  app.post(
    '/disputes/:id/submission',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id: disputeId } = req.params as { id: string };
      const parsed = addSubmissionSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);

      try {
        const result = await disputeService.addDisputeSubmission(
          disputeId,
          req.user!.userId,
          parsed.data,
        );
        return reply.status(201).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /disputes/:id ────────────────────────────────────────────────────
  // Party or admin fetches dispute details

  app.get(
    '/disputes/:id',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id: disputeId } = req.params as { id: string };

      try {
        const result = await disputeService.getDisputeById(disputeId, req.user!.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /admin/disputes/:id/assign ──────────────────────────────────────
  // Admin assigns a dispute to an admin handler

  app.post(
    '/admin/disputes/:id/assign',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id: disputeId } = req.params as { id: string };
      const parsed = assignDisputeSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);

      try {
        const result = await disputeService.assignDisputeAdmin(
          disputeId,
          req.user!.userId,
          parsed.data,
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /admin/disputes/:id/appoint-arbitrator ──────────────────────────
  // Admin appoints an independent contractor as arbitrator

  app.post(
    '/admin/disputes/:id/appoint-arbitrator',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id: disputeId } = req.params as { id: string };
      const parsed = appointArbitratorSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);

      try {
        const result = await disputeService.appointArbitrator(
          disputeId,
          req.user!.userId,
          parsed.data,
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /admin/disputes/:id/determine ───────────────────────────────────
  // Admin issues final determination + triggers Stripe action

  app.post(
    '/admin/disputes/:id/determine',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id: disputeId } = req.params as { id: string };
      const parsed = determinationSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);

      try {
        const result = await disputeService.issueDetermination(
          disputeId,
          req.user!.userId,
          parsed.data,
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /admin/disputes ──────────────────────────────────────────────────
  // Admin lists disputes with optional status/grounds filter

  app.get(
    '/admin/disputes',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const parsed = listDisputesQuerySchema.safeParse(req.query);
      if (!parsed.success) return validationError(reply, parsed.error.issues);

      try {
        const result = await disputeService.listDisputes(
          parsed.data.status,
          parsed.data.cursor,
          parsed.data.limit,
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
