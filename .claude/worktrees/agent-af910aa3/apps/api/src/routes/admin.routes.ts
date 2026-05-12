import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin, requirePermission } from '../middleware/admin-guards.js';
import { AdminContractorService } from '../services/admin-contractor.service.js';
import { AmlService } from '../services/aml.service.js';
import { InsuranceService } from '../services/insurance.service.js';
import { getSystemHealth } from '../services/health.service.js';
import { generateSasUrl } from '../utils/blob-storage.js';
import type { PrismaClient, OrderStatus } from '@prisma/client';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const contractorListSchema = z.object({
  status: z.string().optional(),
  kyc_status: z.string().optional(),
  insurance_status: z.string().optional(),
  domain: z.string().optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const contractorStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']),
  reason: z.string().optional(),
});

const certReviewSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  admin_notes: z.string().optional(),
  rejection_reason: z.string().optional(),
});

const orderListSchema = z.object({
  status: z.string().optional(),
  customer_id: z.string().optional(),
  contractor_id: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const amlListSchema = z.object({
  result: z.string().optional(),
  flagged_only: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const auditLogSchema = z.object({
  actor_id: z.string().optional(),
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  action_type: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const configValueSchema = z.object({
  value: z.unknown(),
  description: z.string().optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  const status = e.status ?? 500;
  const code = e.code ?? 'INTERNAL_ERROR';
  const message = e.message ?? 'An unexpected error occurred';
  return reply.status(status).send({ success: false, error: { code, message } });
}

function extractMeta(req: FastifyRequest) {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'] ?? 'unknown',
  };
}

// ─── Route options types ──────────────────────────────────────────────────────

interface AdminRouteOptions {
  adminContractorService: AdminContractorService;
  amlService: AmlService;
  insuranceService: InsuranceService;
  prisma: PrismaClient;
}

// ─── adminRoutes ─────────────────────────────────────────────────────────────

export async function adminRoutes(app: FastifyInstance, opts: AdminRouteOptions) {
  const { adminContractorService, amlService, insuranceService, prisma } = opts;

  // ─── GET /contractors ─────────────────────────────────────────────────────

  app.get(
    '/contractors',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const parsed = contractorListSchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query params' },
        });
      }
      try {
          const params: Parameters<typeof adminContractorService.listContractors>[0] = {};
        if (parsed.data.status !== undefined) params.status = parsed.data.status;
        if (parsed.data.kyc_status !== undefined) params.kyc_status = parsed.data.kyc_status;
        if (parsed.data.insurance_status !== undefined) params.insurance_status = parsed.data.insurance_status;
        if (parsed.data.domain !== undefined) params.domain = parsed.data.domain;
        if (parsed.data.search !== undefined) params.search = parsed.data.search;
        if (parsed.data.cursor !== undefined) params.cursor = parsed.data.cursor;
        if (parsed.data.limit !== undefined) params.limit = parsed.data.limit;
        const result = await adminContractorService.listContractors(params);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /contractors/:id ─────────────────────────────────────────────────

  app.get(
    '/contractors/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const result = await adminContractorService.getContractorAdminDetail(id);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PATCH /contractors/:id/status ────────────────────────────────────────

  app.patch(
    '/contractors/:id/status',
    { preHandler: [authenticate, requirePermission('suspend_ban_contractors')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = contractorStatusSchema.safeParse(req.body);
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
        const statusData: Parameters<typeof adminContractorService.updateContractorStatus>[2] = {
          status: parsed.data.status,
          ...(parsed.data.reason !== undefined && { reason: parsed.data.reason }),
        };
        const result = await adminContractorService.updateContractorStatus(
          id,
          req.user!.userId,
          statusData,
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /certifications/queue ────────────────────────────────────────────

  app.get(
    '/certifications/queue',
    { preHandler: [authenticate, requirePermission('verify_insurance')] },
    async (_req, reply) => {
      try {
        const certs = await prisma.insuranceCertificate.findMany({
          where: { status: 'PENDING_REVIEW' },
          include: {
            contractor: {
              include: {
                user: { select: { id: true, full_name: true, email: true } },
              },
            },
          },
          orderBy: { created_at: 'asc' },
        });
        return reply.status(200).send({ success: true, data: { certs } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PATCH /certifications/:id/verify ────────────────────────────────────

  app.patch(
    '/certifications/:id/verify',
    { preHandler: [authenticate, requirePermission('verify_insurance')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = certReviewSchema.safeParse(req.body);
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
        const result = await insuranceService.adminReviewCertificate(
          id,
          req.user!.userId,
          parsed.data,
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /orders ──────────────────────────────────────────────────────────

  app.get(
    '/orders',
    { preHandler: [authenticate, requirePermission('view_all_orders')] },
    async (req, reply) => {
      const parsed = orderListSchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query params' },
        });
      }
      try {
        const { status, customer_id, contractor_id, cursor, limit = 20 } = parsed.data;

        const where: {
          status?: OrderStatus;
          customer_id?: string;
          contractor_profile_id?: string;
          id?: { lt: string };
        } = {};
        if (status) where.status = status as OrderStatus;
        if (customer_id) where.customer_id = customer_id;
        if (contractor_id) where.contractor_profile_id = contractor_id;
        if (cursor) where.id = { lt: cursor };

        const orders = await prisma.order.findMany({
          where,
          include: {
            customer: { select: { id: true, full_name: true, email: true } },
            contractor_profile: {
              include: { user: { select: { id: true, full_name: true, email: true } } },
            },
            task: { select: { id: true, title: true } },
          },
          orderBy: { created_at: 'desc' },
          take: limit + 1,
        });

        const hasMore = orders.length > limit;
        const items = hasMore ? orders.slice(0, limit) : orders;
        const next_cursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

        return reply.status(200).send({
          success: true,
          data: { orders: items, next_cursor },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /aml/screen/:user_id ────────────────────────────────────────────

  app.post(
    '/aml/screen/:user_id',
    { preHandler: [authenticate, requirePermission('trigger_aml_screens')] },
    async (req, reply) => {
      const { user_id } = req.params as { user_id: string };
      try {
        const result = await amlService.triggerScreen(
          user_id,
          req.user!.userId,
          extractMeta(req),
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /aml/checks ──────────────────────────────────────────────────────

  app.get(
    '/aml/checks',
    { preHandler: [authenticate, requirePermission('trigger_aml_screens')] },
    async (req, reply) => {
      const parsed = amlListSchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query params' },
        });
      }
      try {
        const amlParams: Parameters<typeof amlService.listAmlChecks>[0] = {};
        if (parsed.data.result !== undefined) amlParams.result = parsed.data.result;
        if (parsed.data.flagged_only !== undefined) amlParams.flagged_only = parsed.data.flagged_only;
        if (parsed.data.cursor !== undefined) amlParams.cursor = parsed.data.cursor;
        if (parsed.data.limit !== undefined) amlParams.limit = parsed.data.limit;
        const result = await amlService.listAmlChecks(amlParams);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /audit-log ───────────────────────────────────────────────────────

  app.get(
    '/audit-log',
    { preHandler: [authenticate, requirePermission('view_audit_logs')] },
    async (req, reply) => {
      const parsed = auditLogSchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query params' },
        });
      }
      try {
        const { actor_id, entity_type, entity_id, action_type, cursor, limit = 50 } =
          parsed.data;

        const where: {
          actor_id?: string;
          entity_type?: string;
          entity_id?: string;
          action_type?: string;
          id?: { lt: string };
        } = {};
        if (actor_id) where.actor_id = actor_id;
        if (entity_type) where.entity_type = entity_type;
        if (entity_id) where.entity_id = entity_id;
        if (action_type) where.action_type = action_type;
        if (cursor) where.id = { lt: cursor };

        const logs = await prisma.auditLog.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          take: limit + 1,
        });

        const hasMore = logs.length > limit;
        const items = hasMore ? logs.slice(0, limit) : logs;
        const next_cursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

        return reply.status(200).send({
          success: true,
          data: { logs: items, next_cursor },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /health ──────────────────────────────────────────────────────────

  app.get(
    '/health',
    { preHandler: [authenticate, requireAdmin] },
    async (_req, reply) => {
      try {
        const report = await getSystemHealth(prisma);
        return reply
          .status(200)
          .header('Cache-Control', 'no-store, max-age=30')
          .send({ success: true, data: report });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /certifications/:id/document-url ────────────────────────────────

  app.get(
    '/certifications/:id/document-url',
    { preHandler: [authenticate, requirePermission('verify_insurance')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const cert = await prisma.insuranceCertificate.findUnique({
          where: { id },
          select: { id: true, certificate_blob_path: true },
        });
        if (!cert) {
          return reply.status(404).send({
            success: false,
            error: { code: 'CERTIFICATE_NOT_FOUND', message: 'Certificate not found' },
          });
        }
        const expiryMinutes = 60;
        const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
        const url = await generateSasUrl(cert.certificate_blob_path, expiryMinutes);
        return reply.status(200).send({ success: true, data: { url, expires_at: expiresAt } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /insurance/expiry-dashboard ─────────────────────────────────────

  app.get(
    '/insurance/expiry-dashboard',
    { preHandler: [authenticate, requirePermission('verify_insurance')] },
    async (_req, reply) => {
      try {
        const result = await adminContractorService.getInsuranceExpiryDashboard();
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /config ──────────────────────────────────────────────────────────

  app.get(
    '/config',
    { preHandler: [authenticate, requirePermission('manage_platform_config')] },
    async (_req, reply) => {
      try {
        const configs = await prisma.platformConfig.findMany({
          orderBy: { key: 'asc' },
        });
        return reply.status(200).send({ success: true, data: { configs } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PATCH /config/:key ───────────────────────────────────────────────────

  app.patch(
    '/config/:key',
    { preHandler: [authenticate, requirePermission('manage_platform_config')] },
    async (req, reply) => {
      const { key } = req.params as { key: string };
      const parsed = configValueSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'value is required' },
        });
      }
      try {
        const updated = await prisma.platformConfig.upsert({
          where: { key },
          create: {
            key,
            value: parsed.data.value as never,
            description: parsed.data.description ?? null,
            updated_by_id: req.user!.userId,
          },
          update: {
            value: parsed.data.value as never,
            ...(parsed.data.description !== undefined && {
              description: parsed.data.description,
            }),
            updated_by_id: req.user!.userId,
          },
        });
        return reply.status(200).send({ success: true, data: updated });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
