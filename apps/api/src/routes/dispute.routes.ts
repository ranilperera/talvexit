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
import { uploadToBlob } from '../utils/blob-storage.js';
import { prisma } from '../lib/prisma.js';

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

  // ─── POST /disputes/:id/evidence ──────────────────────────────────────────
  // Additional evidence upload during submission window

  app.post(
    '/disputes/:id/evidence',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id: disputeId } = req.params as { id: string };

      const dispute = await prisma.dispute.findUnique({
        where: { id: disputeId },
        select: { order: { select: { customer_id: true, contractor_user_id: true } } },
      });
      if (!dispute) {
        return reply.status(404).send({ success: false, error: { code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found.' } });
      }
      const userId = req.user!.userId;
      const isParty = dispute.order.customer_id === userId || dispute.order.contractor_user_id === userId;
      if (!isParty) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized.' } });
      }

      try {
        const data = await req.file();
        if (!data) {
          return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded.' } });
        }
        const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf',
          'text/plain', 'text/csv', 'application/zip', 'video/mp4'];
        if (!ALLOWED_MIME.includes(data.mimetype)) {
          return reply.status(415).send({ success: false, error: { code: 'INVALID_FILE_TYPE', message: 'Unsupported file type.' } });
        }
        const buffer = await data.toBuffer();
        if (buffer.length > 20 * 1024 * 1024) {
          return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'File must be under 20 MB.' } });
        }
        const safeFilename = data.filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
        const blob_path = `dispute-evidence/${disputeId}/${Date.now()}-${safeFilename}`;
        await uploadToBlob(blob_path, buffer, data.mimetype);
        return reply.status(200).send({ success: true, data: { blob_path, file_name: safeFilename } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /disputes/:id/arbitrator-recommendation ─────────────────────────
  // Appointed arbitrator submits an advisory recommendation (advisory only — admin decides).

  app.post(
    '/disputes/:id/arbitrator-recommendation',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id: disputeId } = req.params as { id: string };
      const body = req.body as { recommendation?: string };
      if (typeof body.recommendation !== 'string' || body.recommendation.trim().length < 50) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'recommendation must be at least 50 characters.' },
        });
      }
      try {
        const result = await disputeService.submitArbitratorRecommendation(disputeId, req.user!.userId, body.recommendation);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /arbitration/my ──────────────────────────────────────────────────
  // Lists disputes where current user (contractor) is appointed arbitrator.

  app.get(
    '/arbitration/my',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const userId = req.user!.userId;
      try {
        const profile = await prisma.contractorProfile.findUnique({
          where: { user_id: userId },
          select: { id: true },
        });
        if (!profile) {
          return reply.status(200).send({ success: true, data: { disputes: [] } });
        }
        const disputes = await prisma.dispute.findMany({
          where: { arbitrator_profile_id: profile.id },
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            grounds: true,
            status: true,
            created_at: true,
            arbitrator_recommended_at: true,
            order: { select: { id: true, scope_snapshot: true } },
          },
        });
        const shaped = disputes.map((d) => ({
          id: d.id,
          grounds: d.grounds,
          status: d.status,
          created_at: d.created_at,
          recommendation_submitted: d.arbitrator_recommended_at !== null,
          order_id: d.order.id,
          order_title: (d.order.scope_snapshot as Record<string, unknown> | null)?.title ?? 'Untitled',
        }));
        return reply.status(200).send({ success: true, data: { disputes: shaped } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /disputes/my ─────────────────────────────────────────────────────
  // Returns all disputes where current user is a party

  app.get(
    '/disputes/my',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const userId = req.user!.userId;
      try {
        const disputes = await prisma.dispute.findMany({
          where: {
            OR: [
              { order: { customer_id: userId } },
              { order: { contractor_user_id: userId } },
            ],
          },
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            grounds: true,
            status: true,
            created_at: true,
            outcome: true,
            order: {
              select: {
                id: true,
                scope_snapshot: true,
                customer_id: true,
                contractor_user_id: true,
              },
            },
          },
        });

        const shaped = disputes.map((d) => ({
          id: d.id,
          grounds: d.grounds,
          status: d.status,
          outcome: d.outcome,
          created_at: d.created_at,
          order_id: d.order.id,
          order_title: (d.order.scope_snapshot as Record<string, unknown> | null)?.title ?? 'Untitled',
          my_role: d.order.customer_id === userId ? 'CUSTOMER' : 'CONTRACTOR',
        }));

        return reply.status(200).send({ success: true, data: { disputes: shaped } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
