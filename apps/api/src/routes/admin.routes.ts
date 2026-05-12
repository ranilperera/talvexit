import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Queue } from 'bullmq';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin, requirePermission } from '../middleware/admin-guards.js';
import { AdminContractorService } from '../services/admin-contractor.service.js';
import { AmlService } from '../services/aml.service.js';
import { InsuranceService } from '../services/insurance.service.js';
import { getSystemHealth } from '../services/health.service.js';
import { generateSasUrl } from '../utils/blob-storage.js';
import type { PrismaClient, OrderStatus, CompanyPayoutStatus, CompanyPayoutMethod } from '@prisma/client';
import type { CompanyPayoutService } from '../services/company-payout.service.js';
import { invalidateConfigCache } from '../services/platform-config.service.js';
import type { TenderContractPaymentService } from '../services/tender-contract-payment.service.js';
import type { AccountSanctionsService } from '../services/account-sanctions.service.js';

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

const paymentMethodListSchema = z.object({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const rejectPaymentMethodSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

const bankTransferListSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const rejectBankTransferSchema = z.object({
  reason: z.string().min(5),
});

const confirmBankTransferSchema = z.object({
  admin_notes: z.string().optional(),
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

const payoutListSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  method: z.enum(['STRIPE_CONNECT', 'AU_BANK', 'OVERSEAS_BANK']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const recordOfflinePayoutSchema = z.object({
  reference: z.string().min(3),
  notes: z.string().min(20),
  transfer_date: z.coerce.date(),
});

interface AdminRouteOptions {
  adminContractorService: AdminContractorService;
  amlService: AmlService;
  insuranceService: InsuranceService;
  prisma: PrismaClient;
  payoutService: CompanyPayoutService;
  emailQueue: Queue;
  tcPaymentService?: TenderContractPaymentService;
  sanctionsService: AccountSanctionsService;
}

// ─── adminRoutes ─────────────────────────────────────────────────────────────

export async function adminRoutes(app: FastifyInstance, opts: AdminRouteOptions) {
  const { adminContractorService, amlService, insuranceService, prisma, payoutService, emailQueue, tcPaymentService, sanctionsService } = opts;

  // Binary body parser for receipt uploads
  const binaryParser = (_req: import('fastify').FastifyRequest, body: Buffer, done: (err: null, body: Buffer) => void) => done(null, body);
  for (const ct of ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']) {
    app.addContentTypeParser(ct, { parseAs: 'buffer' }, binaryParser);
  }

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

  // ─── GET /contractors/:id/identity-document-url ──────────────────────────

  app.get(
    '/contractors/:id/identity-document-url',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const profile = await prisma.contractorProfile.findUnique({
          where: { id },
          select: { identity_document_blob_path: true },
        });
        if (!profile) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        if (!profile.identity_document_blob_path) {
          return reply.status(404).send({ success: false, error: { code: 'NO_DOCUMENT', message: 'No identity document on file.' } });
        }
        const url = await generateSasUrl(profile.identity_document_blob_path, 60);
        return reply.status(200).send({ success: true, data: { url, expires_at: new Date(Date.now() + 60 * 60 * 1000) } });
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

  // ─── CONTRACTOR DOCUMENT REQUESTS ────────────────────────────────────────
  // POST /contractors/:id/document-requests  (id = contractorProfile.user_id)
  // GET  /contractors/:id/document-requests

  app.post(
    '/contractors/:id/document-requests',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id: contractorUserId } = req.params as { id: string };
      const body = req.body as { message?: string };
      if (!body.message?.trim()) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'message is required' } });
      }
      try {
        const request = await prisma.adminDocumentRequest.create({
          data: { contractor_user_id: contractorUserId, requested_by_id: req.user!.userId, message: body.message.trim() },
        });
        return reply.status(201).send({ success: true, data: request });
      } catch (err) { return handleError(reply, err); }
    },
  );

  app.get(
    '/contractors/:id/document-requests',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id: contractorUserId } = req.params as { id: string };
      try {
        const requests = await prisma.adminDocumentRequest.findMany({
          where: { contractor_user_id: contractorUserId },
          orderBy: { created_at: 'desc' },
          include: { requested_by: { select: { full_name: true } } },
        });
        return reply.status(200).send({ success: true, data: requests });
      } catch (err) { return handleError(reply, err); }
    },
  );

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
            company: {
              select: { id: true, company_name: true },
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

  // ─── GET /tenders ────────────────────────────────────────────────────────
  // Admin: list all tender requests across all customers

  app.get(
    '/tenders',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { status, cursor, limit: limitStr } = req.query as { status?: string; cursor?: string; limit?: string };
      const limit = Math.min(Number(limitStr ?? 20), 100);
      try {
        const where: Record<string, unknown> = {};
        if (status) where['status'] = status;
        if (cursor) where['id'] = { lt: cursor };

        const items = await prisma.tenderRequest.findMany({
          where,
          include: {
            customer: { select: { id: true, full_name: true, email: true } },
            _count: { select: { proposals: true, invitations: true } },
          },
          orderBy: { created_at: 'desc' },
          take: limit + 1,
        });

        const hasMore = items.length > limit;
        const page = hasMore ? items.slice(0, limit) : items;
        return reply.status(200).send({
          success: true,
          data: { tenders: page, next_cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null },
        });
      } catch (err) { return handleError(reply, err); }
    },
  );

  // ─── GET /tenders/:id ────────────────────────────────────────────────────

  app.get(
    '/tenders/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const tender = await prisma.tenderRequest.findUnique({
          where: { id },
          include: {
            customer: { select: { id: true, full_name: true, email: true } },
            invitations: {
              include: {
                invitee_user: { select: { id: true, full_name: true, email: true } },
                invitee_company: { select: { id: true, company_name: true } },
                proposal: { select: { id: true, status: true, proposed_price_aud: true } },
              },
              orderBy: { created_at: 'asc' },
            },
            _count: { select: { proposals: true, invitations: true } },
          },
        });
        if (!tender) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        return reply.status(200).send({ success: true, data: { tender } });
      } catch (err) { return handleError(reply, err); }
    },
  );

  // ─── GET /contracts ──────────────────────────────────────────────────────
  // Admin: list all tender contracts across all customers/providers

  app.get(
    '/contracts',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { status, cursor, limit: limitStr } = req.query as { status?: string; cursor?: string; limit?: string };
      const limit = Math.min(Number(limitStr ?? 20), 100);
      try {
        const where: Record<string, unknown> = {};
        if (status) where['status'] = status;
        if (cursor) where['id'] = { lt: cursor };

        const items = await prisma.tenderContract.findMany({
          where,
          include: {
            customer: { select: { id: true, full_name: true, email: true } },
            company: { select: { id: true, company_name: true } },
            contractor: { select: { id: true, full_name: true, email: true } },
            tender: { select: { id: true, title: true, domain: true } },
            _count: { select: { milestones: true, invoices: true } },
          },
          orderBy: { created_at: 'desc' },
          take: limit + 1,
        });

        const hasMore = items.length > limit;
        const page = hasMore ? items.slice(0, limit) : items;
        return reply.status(200).send({
          success: true,
          data: { contracts: page, next_cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null },
        });
      } catch (err) { return handleError(reply, err); }
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
        // If value arrives as a JSON string (e.g. from a raw API call), parse it so
        // the DB stores a proper Json object rather than a string-wrapped object.
        let storedValue = parsed.data.value;
        if (typeof storedValue === 'string') {
          try { storedValue = JSON.parse(storedValue); } catch { /* keep as string */ }
        }
        const updated = await prisma.platformConfig.upsert({
          where: { key },
          create: {
            key,
            value: storedValue as never,
            description: parsed.data.description ?? null,
            updated_by_id: req.user!.userId,
          },
          update: {
            value: storedValue as never,
            ...(parsed.data.description !== undefined && {
              description: parsed.data.description,
            }),
            updated_by_id: req.user!.userId,
          },
        });
        invalidateConfigCache();
        // If commission tiers changed, hot-reload the in-memory cache so
        // new payouts pick up the new rates immediately (no API restart).
        if (key === 'commission_tiers') {
          const { loadCommissionTiers } = await import('../utils/commission.js');
          await loadCommissionTiers(prisma);
        }
        // Phase 4 — direct-payment cutover. Reload the cached timestamp so
        // new orders/invoices are routed to the right path immediately.
        if (key === 'direct_payment_cutover_at') {
          const { loadDirectPaymentCutover } = await import('../utils/cutover.js');
          await loadDirectPaymentCutover(prisma);
        }
        return reply.status(200).send({ success: true, data: updated });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /payouts/orphaned ────────────────────────────────────────────────
  // Returns orders with PAYMENT_RECEIVED status but no payout record (lost records).

  app.get(
    '/payouts/orphaned',
    { preHandler: [authenticate, requireAdmin] },
    async (_req, reply) => {
      try {
        const orders = await prisma.order.findMany({
          where: {
            company_order_status: 'PAYMENT_RECEIVED',
            company_payout_record: null,
          },
          include: {
            company_invoice: { select: { id: true, invoice_number: true, total_aud: true, amount_aud: true } },
            company: { select: { id: true, company_name: true } },
            contractor_profile: { select: { id: true, user: { select: { id: true, full_name: true, email: true } } } },
          },
          orderBy: { created_at: 'desc' },
          take: 50,
        });
        return reply.status(200).send({ success: true, data: { orders } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /payouts/create-from-order/:orderId ─────────────────────────────
  // Creates a PENDING payout record for an orphaned PAYMENT_RECEIVED order.

  app.post(
    '/payouts/create-from-order/:orderId',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { orderId } = req.params as { orderId: string };
      try {
        const record = await payoutService.createPayoutRecordFromOrder(orderId);
        await (await import('../utils/audit.js')).writeAudit(prisma, {
          actorId: req.user!.userId,
          actionType: 'PAYOUT_RECORD_CREATED_MANUALLY',
          entityType: 'CompanyPayoutRecord',
          entityId: record.id,
          ipAddress: extractMeta(req).ip,
          userAgent: extractMeta(req).userAgent,
          metadata: { order_id: orderId },
        });
        return reply.status(201).send({ success: true, data: record });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /payouts/:id/commission-invoice ──────────────────────────────────
  // Generates (if needed) and streams the commission invoice PDF.

  app.get(
    '/payouts/:id/commission-invoice',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { dl } = req.query as { dl?: string };
      try {
        const { blob_path, invoice_number } = await payoutService.generateAndStoreCommissionInvoice(id);
        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentLength } = await downloadBlobStream(blob_path);
        reply.header('Content-Type', 'application/pdf');
        if (contentLength) reply.header('Content-Length', contentLength);
        const disposition = dl === '1' ? 'attachment' : 'inline';
        reply.header('Content-Disposition', `${disposition}; filename="${invoice_number}.pdf"`);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /payouts ─────────────────────────────────────────────────────────
  // Returns paginated company payout records for platform admin review.

  app.get(
    '/payouts',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const parsed = payoutListSchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query params' },
        });
      }
      try {
        const params: {
          status?: CompanyPayoutStatus;
          method?: CompanyPayoutMethod;
          cursor?: string;
          limit?: number;
        } = {};
        if (parsed.data.status !== undefined) params.status = parsed.data.status;
        if (parsed.data.method !== undefined) params.method = parsed.data.method;
        if (parsed.data.cursor !== undefined) params.cursor = parsed.data.cursor;
        if (parsed.data.limit !== undefined) params.limit = parsed.data.limit;
        const result = await payoutService.getPayoutQueue(params);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /payouts/:id ─────────────────────────────────────────────────────
  // Returns a single payout record by ID.

  app.get(
    '/payouts/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const record = await prisma.companyPayoutRecord.findUnique({
          where: { id },
          include: {
            company: {
              select: {
                id: true,
                company_name: true,
                payout_preference: true,
                abn: true,
              },
            },
            contractor_profile: {
              select: {
                id: true,
                user: {
                  select: {
                    id: true,
                    full_name: true,
                    email: true,
                    abn: true,
                  },
                },
              },
            },
            order: {
              select: {
                id: true,
                company_invoice: {
                  select: { invoice_number: true, total_aud: true },
                },
              },
            },
            processed_by: { select: { id: true, full_name: true } },
          },
        });
        if (!record) {
          return reply.status(404).send({
            success: false,
            error: { code: 'PAYOUT_NOT_FOUND', message: 'Payout record not found.' },
          });
        }
        return reply.status(200).send({ success: true, data: record });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /payouts/:id/process-stripe ────────────────────────────────────
  // Triggers a Stripe Transfer to the company's connected account.

  app.post(
    '/payouts/:id/process-stripe',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const result = await payoutService.processStripePayout(id, req.user!.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /payouts/:id/record-offline ────────────────────────────────────
  // Records an offline bank transfer payout (EFT, SWIFT, etc.).

  app.post(
    '/payouts/:id/record-offline',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = recordOfflinePayoutSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          },
        });
      }
      try {
        const result = await payoutService.recordOfflinePayout(id, req.user!.userId, {
          reference: parsed.data.reference,
          notes: parsed.data.notes,
          transfer_date: parsed.data.transfer_date,
        });
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /payouts/:id/receipt ───────────────────────────────────────────
  // Admin uploads a payout receipt (PDF/PNG/JPG) after completing the transfer.
  // Binary body with Content-Type and X-File-Name headers.

  app.post(
    '/payouts/:id/receipt',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const fileName = req.headers['x-file-name'];
      if (typeof fileName !== 'string' || !fileName) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'X-File-Name header required.' } });
      }
      const rawCt = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
      const extMap: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
      const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
      const ALLOWED = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      const ct = ALLOWED.includes(rawCt) ? rawCt : (extMap[ext] ?? rawCt);
      if (!ALLOWED.includes(ct)) {
        return reply.status(415).send({ success: false, error: { code: 'INVALID_FILE_TYPE', message: 'Only PDF, JPG, PNG allowed.' } });
      }
      const buffer = req.body as Buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'Body must be file binary.' } });
      }
      if (buffer.length > 10 * 1024 * 1024) {
        return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'Max 10 MB.' } });
      }
      try {
        const record = await prisma.companyPayoutRecord.findUnique({ where: { id }, select: { id: true } });
        if (!record) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        const safe = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
        const blobPath = `payout-receipts/${id}/${Date.now()}-${safe}`;
        const { uploadToBlob } = await import('../utils/blob-storage.js');
        await uploadToBlob(blobPath, buffer, ct);
        const updated = await prisma.companyPayoutRecord.update({
          where: { id },
          data: { receipt_blob_path: blobPath },
        });
        return reply.status(200).send({ success: true, data: { receipt_blob_path: updated.receipt_blob_path } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /payouts/:id/receipt ─────────────────────────────────────────────
  // Streams the payout receipt — accessible by admin and the provider.

  app.get(
    '/payouts/:id/receipt',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { dl } = req.query as { dl?: string };
      try {
        const record = await prisma.companyPayoutRecord.findUnique({
          where: { id },
          select: {
            receipt_blob_path: true,
            company_id: true,
            contractor_profile_id: true,
            company: { select: { primary_admin_id: true } },
            contractor_profile: { select: { user_id: true } },
          },
        });
        if (!record?.receipt_blob_path) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'No receipt uploaded yet.' } });
        }
        // Access: admin, company primary admin, or contractor
        const userId = req.user!.userId;
        const accountType = req.user!.accountType;
        const isAdmin = ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'].includes(accountType);
        const isProvider =
          record.company?.primary_admin_id === userId ||
          record.contractor_profile?.user_id === userId;
        if (!isAdmin && !isProvider) {
          // Check if user is a company member
          if (record.company_id) {
            const member = await prisma.companyMember.findUnique({
              where: { company_id_user_id: { company_id: record.company_id, user_id: userId } },
              select: { status: true },
            });
            if (member?.status !== 'ACTIVE') {
              return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
            }
          } else {
            return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
          }
        }
        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentType, contentLength } = await downloadBlobStream(record.receipt_blob_path);
        const fileName = record.receipt_blob_path.split('/').pop() ?? 'receipt';
        reply.header('Content-Type', contentType ?? 'application/octet-stream');
        if (contentLength) reply.header('Content-Length', contentLength);
        reply.header('Content-Disposition', `${dl === '1' ? 'attachment' : 'inline'}; filename="${fileName}"`);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /admin/compliance ────────────────────────────────────────────────
  // Returns compliance dashboard data: ABN pending, withholding required,
  // super liability flags, unsigned agreements, foreign providers pending screening.

  app.get(
    '/compliance',
    { preHandler: [authenticate, requireAdmin] },
    async (_req, reply) => {
      try {
        const [
          pendingAbnVerification,
          withholdingRequired,
          superLiabilityFlags,
          unsignedAgreements,
          foreignProvidersPending,
        ] = await Promise.all([
          // AU providers with ABN not yet verified
          prisma.user.findMany({
            where: {
              account_type: 'INDIVIDUAL_CONTRACTOR',
              is_foreign_entity: false,
              abn: { not: null },
              abn_verified: false,
            },
            select: { id: true, full_name: true, email: true, abn: true, created_at: true },
            orderBy: { created_at: 'desc' },
            take: 50,
          }),
          // Contractors with no ABN (withholding required)
          prisma.user.findMany({
            where: {
              account_type: 'INDIVIDUAL_CONTRACTOR',
              is_foreign_entity: false,
              abn: null,
              contractor_profile: { status: 'ACTIVE' },
            },
            select: { id: true, full_name: true, email: true, created_at: true },
            orderBy: { created_at: 'desc' },
            take: 50,
          }),
          // Contractors with super liability flag
          prisma.user.findMany({
            where: {
              account_type: 'INDIVIDUAL_CONTRACTOR',
              super_liability_flag: true,
            },
            select: {
              id: true,
              full_name: true,
              email: true,
              created_at: true,
            },
            orderBy: { created_at: 'desc' },
            take: 50,
          }),
          // Active contractors who haven't signed provider agreement
          prisma.user.findMany({
            where: {
              account_type: 'INDIVIDUAL_CONTRACTOR',
              provider_agreement_signed: false,
              contractor_profile: { status: 'ACTIVE' },
            },
            select: { id: true, full_name: true, email: true, created_at: true },
            orderBy: { created_at: 'desc' },
            take: 50,
          }),
          // Foreign providers pending sanctions screening
          prisma.user.findMany({
            where: {
              account_type: 'INDIVIDUAL_CONTRACTOR',
              is_foreign_entity: true,
              sanctions_screened: false,
            },
            select: {
              id: true,
              full_name: true,
              email: true,
              tax_residency_country: true,
              created_at: true,
            },
            orderBy: { created_at: 'desc' },
            take: 50,
          }),
        ]);

        return reply.status(200).send({
          success: true,
          data: {
            pending_abn_verification: pendingAbnVerification,
            withholding_required: withholdingRequired,
            super_liability_flags: superLiabilityFlags,
            unsigned_agreements: unsignedAgreements,
            foreign_providers_pending: foreignProvidersPending,
            summary: {
              pending_abn: pendingAbnVerification.length,
              withholding: withholdingRequired.length,
              super_liability: superLiabilityFlags.length,
              unsigned: unsignedAgreements.length,
              foreign_pending: foreignProvidersPending.length,
            },
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PATCH /admin/compliance/abn-verify ──────────────────────────────────────
  // Mark a provider's ABN as verified by admin.

  app.patch(
    '/compliance/abn-verify/:userId',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { userId } = req.params as { userId: string };
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { abn_verified: true },
        });
        return reply.status(200).send({ success: true, data: { message: 'ABN verified.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /companies/:id/payout-preference ────────────────────────────────
  // Returns the payout preference for a specific company (admin view, unmasked).

  app.get(
    '/companies/:id/payout-preference',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id: companyId } = req.params as { id: string };
      try {
        const preference = await prisma.companyPayoutPreference.findUnique({
          where: { company_id: companyId },
        });
        return reply.status(200).send({ success: true, data: preference ?? null });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /payment-methods/summary ───────────────────────────────────────
  // Returns pending counts per provider type for the admin UI tab badges.

  app.get(
    '/payment-methods/summary',
    { preHandler: [authenticate, requireAdmin] },
    async (_req, reply) => {
      try {
        const [contractorCounts, companyCounts] = await Promise.all([
          prisma.contractorPayoutMethod.groupBy({ by: ['verification_status'], _count: { _all: true } }),
          prisma.companyPayoutAccount.groupBy({ by: ['verification_status'], _count: { _all: true } }),
        ]);
        const toMap = (rows: { verification_status: string; _count: { _all: number } }[]) => {
          const m: Record<string, number> = {};
          for (const r of rows) m[r.verification_status] = r._count._all;
          return m;
        };
        return reply.status(200).send({
          success: true,
          data: { contractor: toMap(contractorCounts), company: toMap(companyCounts) },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /payment-methods ────────────────────────────────────────────────
  // List contractor payout methods for admin review. Supports status filter + cursor pagination.

  app.get(
    '/payment-methods',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const parsed = paymentMethodListSchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query params' } });
      }
      const { status, cursor, limit = 50 } = parsed.data;
      try {
        const [methods, counts] = await Promise.all([
          prisma.contractorPayoutMethod.findMany({
            where: {
              ...(status ? { verification_status: status } : {}),
              ...(cursor ? { id: { lt: cursor } } : {}),
            },
            orderBy: { created_at: 'desc' },
            take: limit + 1,
            include: {
              contractor_profile: {
                select: {
                  id: true,
                  legal_name: true,
                  user: { select: { id: true, full_name: true, email: true } },
                },
              },
            },
          }),
          prisma.contractorPayoutMethod.groupBy({
            by: ['verification_status'],
            _count: { _all: true },
          }),
        ]);

        const hasMore = methods.length > limit;
        const items = hasMore ? methods.slice(0, limit) : methods;
        const nextCursor = hasMore ? items[items.length - 1]?.id : null;

        const statusCounts: Record<string, number> = {};
        for (const row of counts) {
          statusCounts[row.verification_status] = row._count._all;
        }

        return reply.status(200).send({
          success: true,
          data: { methods: items, next_cursor: nextCursor ?? null, status_counts: statusCounts },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /payment-methods/:id/approve ───────────────────────────────────

  app.post(
    '/payment-methods/:id/approve',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const method = await prisma.contractorPayoutMethod.findUnique({
          where: { id },
          include: {
            contractor_profile: {
              select: { user: { select: { id: true, full_name: true, email: true } } },
            },
          },
        });
        if (!method) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Payment method not found.' } });
        }

        await prisma.contractorPayoutMethod.update({
          where: { id },
          data: {
            verification_status: 'VERIFIED',
            verified_at: new Date(),
            verified_by_id: req.user!.userId,
            rejection_reason: null,
          },
        });

        const u = method.contractor_profile.user;
        await emailQueue.add('payment-method-approved', {
          type: 'payment-method-approved',
          to: u.email,
          full_name: u.full_name,
          method_type: method.method_type,
          nickname: method.nickname,
        });

        await (await import('../utils/audit.js')).writeAudit(prisma, {
          actorId: req.user!.userId,
          actionType: 'PAYMENT_METHOD_APPROVED',
          entityType: 'ContractorPayoutMethod',
          entityId: id,
          ipAddress: extractMeta(req).ip,
          userAgent: extractMeta(req).userAgent,
          metadata: { method_type: method.method_type, contractor_user_id: u.id },
        });

        return reply.status(200).send({ success: true, data: { message: 'Payment method approved.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /payment-methods/:id/reject ────────────────────────────────────

  app.post(
    '/payment-methods/:id/reject',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = rejectPaymentMethodSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          },
        });
      }
      try {
        const method = await prisma.contractorPayoutMethod.findUnique({
          where: { id },
          include: {
            contractor_profile: {
              select: { user: { select: { id: true, full_name: true, email: true } } },
            },
          },
        });
        if (!method) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Payment method not found.' } });
        }

        await prisma.contractorPayoutMethod.update({
          where: { id },
          data: {
            verification_status: 'REJECTED',
            rejection_reason: parsed.data.reason,
            verified_at: null,
            verified_by_id: null,
          },
        });

        const u = method.contractor_profile.user;
        await emailQueue.add('payment-method-rejected', {
          type: 'payment-method-rejected',
          to: u.email,
          full_name: u.full_name,
          method_type: method.method_type,
          nickname: method.nickname,
          reason: parsed.data.reason,
        });

        await (await import('../utils/audit.js')).writeAudit(prisma, {
          actorId: req.user!.userId,
          actionType: 'PAYMENT_METHOD_REJECTED',
          entityType: 'ContractorPayoutMethod',
          entityId: id,
          ipAddress: extractMeta(req).ip,
          userAgent: extractMeta(req).userAgent,
          metadata: { method_type: method.method_type, contractor_user_id: u.id, reason: parsed.data.reason },
        });

        return reply.status(200).send({ success: true, data: { message: 'Payment method rejected.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /payment-methods/:id/document/download ───────────────────────────
  // Admin streams AML document blob. Query: doc_id (the document UUID in aml_documents JSON array).

  app.get(
    '/payment-methods/:id/document/download',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { doc_id } = req.query as { doc_id?: string };

      if (!doc_id) {
        return reply.status(400).send({ success: false, error: { code: 'MISSING_DOC_ID', message: 'doc_id query param required.' } });
      }

      try {
        const method = await prisma.contractorPayoutMethod.findUnique({
          where: { id },
          select: { aml_documents: true },
        });
        if (!method) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Payment method not found.' } });
        }

        const docs = (method.aml_documents as { id?: string; blob_path?: string; file_name?: string; mime_type?: string }[]) ?? [];
        const doc = docs.find((d) => d.id === doc_id);
        if (!doc?.blob_path) {
          return reply.status(404).send({ success: false, error: { code: 'DOC_NOT_FOUND', message: 'Document not found.' } });
        }

        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentType, contentLength } = await downloadBlobStream(doc.blob_path);
        reply.header('Content-Type', contentType ?? doc.mime_type ?? 'application/octet-stream');
        if (contentLength) reply.header('Content-Length', contentLength);
        reply.header('Content-Disposition', `inline; filename="${doc.file_name ?? 'document'}"`);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /company-payment-methods ────────────────────────────────────────
  // List company payout accounts for admin review.

  app.get(
    '/company-payment-methods',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { status, cursor, limit: limitStr } = req.query as { status?: string; cursor?: string; limit?: string };
      const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 100);
      try {
        const [accounts, counts] = await Promise.all([
          prisma.companyPayoutAccount.findMany({
            where: {
              ...(status ? { verification_status: status } : {}),
              ...(cursor ? { id: { lt: cursor } } : {}),
            },
            orderBy: { created_at: 'desc' },
            take: limit + 1,
            include: {
              company: {
                select: {
                  id: true,
                  company_name: true,
                  abn: true,
                  primary_admin: { select: { id: true, full_name: true, email: true } },
                },
              },
            },
          }),
          prisma.companyPayoutAccount.groupBy({
            by: ['verification_status'],
            _count: { _all: true },
          }),
        ]);

        const hasMore = accounts.length > limit;
        const items = hasMore ? accounts.slice(0, limit) : accounts;
        const nextCursor = hasMore ? items[items.length - 1]?.id : null;
        const statusCounts: Record<string, number> = {};
        for (const row of counts) statusCounts[row.verification_status] = row._count._all;

        return reply.status(200).send({
          success: true,
          data: { accounts: items, next_cursor: nextCursor ?? null, status_counts: statusCounts },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /company-payment-methods/:id/approve ────────────────────────────

  app.post(
    '/company-payment-methods/:id/approve',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const account = await prisma.companyPayoutAccount.findUnique({
          where: { id },
          include: { company: { select: { primary_admin: { select: { id: true, full_name: true, email: true } } } } },
        });
        if (!account) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        await prisma.companyPayoutAccount.update({
          where: { id },
          data: { verification_status: 'VERIFIED', verified_at: new Date(), verified_by_id: req.user!.userId, rejection_reason: null },
        });

        await (await import('../utils/audit.js')).writeAudit(prisma, {
          actorId: req.user!.userId,
          actionType: 'PAYMENT_METHOD_APPROVED',
          entityType: 'CompanyPayoutAccount',
          entityId: id,
          ipAddress: extractMeta(req).ip,
          userAgent: extractMeta(req).userAgent,
          metadata: { method_type: account.method_type, company_id: account.company_id },
        });

        return reply.status(200).send({ success: true, data: { message: 'Payment account approved.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /company-payment-methods/:id/reject ─────────────────────────────

  app.post(
    '/company-payment-methods/:id/reject',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { reason } = req.body as { reason?: string };
      if (!reason || reason.trim().length < 10) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'reason must be at least 10 characters.' } });
      }
      try {
        const account = await prisma.companyPayoutAccount.findUnique({ where: { id } });
        if (!account) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        await prisma.companyPayoutAccount.update({
          where: { id },
          data: { verification_status: 'REJECTED', rejection_reason: reason.trim(), verified_at: null, verified_by_id: null },
        });

        await (await import('../utils/audit.js')).writeAudit(prisma, {
          actorId: req.user!.userId,
          actionType: 'PAYMENT_METHOD_REJECTED',
          entityType: 'CompanyPayoutAccount',
          entityId: id,
          ipAddress: extractMeta(req).ip,
          userAgent: extractMeta(req).userAgent,
          metadata: { method_type: account.method_type, company_id: account.company_id, reason },
        });

        return reply.status(200).send({ success: true, data: { message: 'Payment account rejected.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /company-payment-methods/:id/document/download ──────────────────

  app.get(
    '/company-payment-methods/:id/document/download',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { doc_id } = req.query as { doc_id?: string };
      if (!doc_id) return reply.status(400).send({ success: false, error: { code: 'MISSING_DOC_ID' } });
      try {
        const account = await prisma.companyPayoutAccount.findUnique({ where: { id }, select: { aml_documents: true } });
        if (!account) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        const docs = (account.aml_documents as { id?: string; blob_path?: string; file_name?: string; mime_type?: string }[]) ?? [];
        const doc = docs.find((d) => d.id === doc_id);
        if (!doc?.blob_path) return reply.status(404).send({ success: false, error: { code: 'DOC_NOT_FOUND' } });
        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentType, contentLength } = await downloadBlobStream(doc.blob_path);
        reply.header('Content-Type', contentType ?? doc.mime_type ?? 'application/octet-stream');
        if (contentLength) reply.header('Content-Length', contentLength);
        reply.header('Content-Disposition', `inline; filename="${doc.file_name ?? 'document'}"`);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /compliance/customer-documents ───────────────────────────────────
  // List customers who have uploaded compliance documents. Query: ?status=pending|verified|all

  app.get(
    '/compliance/customer-documents',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { status = 'all' } = req.query as { status?: string };
      try {
        const users = await prisma.user.findMany({
          where: {
            compliance_documents: { not: { equals: [] } },
          },
          select: {
            id: true,
            full_name: true,
            email: true,
            compliance_documents: true,
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
        });

        const rows = users
          .map((u) => {
            const docs = (u.compliance_documents as {
              id: string; type: string; file_name: string; file_size: number | null;
              mime_type: string | null; uploaded_at: string; verified: boolean; verified_at: string | null;
            }[]) ?? [];
            const filtered = status === 'pending'
              ? docs.filter((d) => !d.verified)
              : status === 'verified'
              ? docs.filter((d) => d.verified)
              : docs;
            if (filtered.length === 0) return null;
            return {
              user: { id: u.id, full_name: u.full_name, email: u.email, created_at: u.created_at },
              documents: filtered,
            };
          })
          .filter(Boolean);

        return reply.status(200).send({ success: true, data: rows });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /compliance/customer-documents/:userId/:docId/download ───────────
  // Admin streams a customer compliance document blob.

  app.get(
    '/compliance/customer-documents/:userId/:docId/download',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { userId, docId } = req.params as { userId: string; docId: string };
      const { dl } = req.query as { dl?: string };
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { compliance_documents: true },
        });
        if (!user) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
        }
        const docs = (user.compliance_documents as { id?: string; blob_path?: string; file_name?: string; mime_type?: string }[]) ?? [];
        const doc = docs.find((d) => d.id === docId);
        if (!doc?.blob_path) {
          return reply.status(404).send({ success: false, error: { code: 'DOC_NOT_FOUND', message: 'Document not found.' } });
        }
        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentType, contentLength } = await downloadBlobStream(doc.blob_path);
        reply.header('Content-Type', contentType ?? doc.mime_type ?? 'application/octet-stream');
        if (contentLength) reply.header('Content-Length', contentLength);
        const disposition = dl === '1' ? 'attachment' : 'inline';
        reply.header('Content-Disposition', `${disposition}; filename="${doc.file_name ?? 'document'}"`);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PATCH /compliance/customer-documents/:userId/:docId ─────────────────
  // Approve or reject a customer compliance document.
  // Body: { action: 'approve' | 'reject', notes?: string }

  app.patch(
    '/compliance/customer-documents/:userId/:docId',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { userId, docId } = req.params as { userId: string; docId: string };
      const body = req.body as { action?: string; notes?: string };
      if (body.action !== 'approve' && body.action !== 'reject') {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'action must be approve or reject.' } });
      }
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { compliance_documents: true },
        });
        if (!user) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
        }
        const docs = (user.compliance_documents as {
          id: string; verified: boolean; verified_at: string | null; rejected?: boolean; rejection_notes?: string | null;
          [key: string]: unknown;
        }[]) ?? [];
        const idx = docs.findIndex((d) => d.id === docId);
        if (idx === -1) {
          return reply.status(404).send({ success: false, error: { code: 'DOC_NOT_FOUND', message: 'Document not found.' } });
        }
        const updated = [...docs];
        if (body.action === 'approve') {
          updated[idx] = { ...updated[idx], verified: true, verified_at: new Date().toISOString(), rejected: false, rejection_notes: null };
        } else {
          updated[idx] = { ...updated[idx], verified: false, verified_at: null, rejected: true, rejection_notes: body.notes ?? null };
        }
        await prisma.user.update({
          where: { id: userId },
          data: { compliance_documents: updated as import('@prisma/client').Prisma.InputJsonValue },
        });
        return reply.status(200).send({ success: true, data: { message: body.action === 'approve' ? 'Document approved.' : 'Document rejected.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /admin/bank-transfers ────────────────────────────────────────────
  // List customer bank transfer submissions with optional status filter.

  app.get(
    '/bank-transfers',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const parsed = bankTransferListSchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR' } });
      }
      const { status, cursor, limit = 20 } = parsed.data;
      try {
        const records = await prisma.bankTransferPayment.findMany({
          where: { ...(status ? { status } : {}) },
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { submitted_at: 'desc' },
          include: {
            invoice: {
              select: {
                id: true,
                invoice_number: true,
                total_aud: true,
                is_tax_invoice: true,
                provider_legal_name: true,
                customer_legal_name: true,
              },
            },
            order: {
              select: {
                id: true,
                customer: { select: { id: true, full_name: true, email: true } },
              },
            },
          },
        });

        const hasMore = records.length > limit;
        const data = hasMore ? records.slice(0, limit) : records;
        const nextCursor = hasMore ? data[data.length - 1]!.id : null;

        // Count by status
        const counts = await prisma.bankTransferPayment.groupBy({
          by: ['status'],
          _count: { id: true },
        });
        const statusCounts = Object.fromEntries(counts.map((c) => [c.status, c._count.id]));

        return reply.status(200).send({
          success: true,
          data: { transfers: data, next_cursor: nextCursor, status_counts: statusCounts },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /admin/bank-transfers/:id/receipt ────────────────────────────────
  // Returns a 60-min SAS URL for the uploaded receipt.

  app.get(
    '/bank-transfers/:id/receipt',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const record = await prisma.bankTransferPayment.findUnique({
          where: { id },
          select: { receipt_blob_path: true },
        });
        if (!record) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        if (!record.receipt_blob_path) {
          return reply.status(404).send({ success: false, error: { code: 'NO_RECEIPT', message: 'No receipt uploaded.' } });
        }
        const url = await generateSasUrl(record.receipt_blob_path, 60);
        return reply.status(200).send({ success: true, data: { url } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /admin/bank-transfers/:id/confirm ───────────────────────────────
  // Admin confirms receipt of bank transfer — marks invoice as PAID.

  app.post(
    '/bank-transfers/:id/confirm',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = confirmBankTransferSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR' } });
      }
      try {
        const record = await prisma.bankTransferPayment.findUnique({
          where: { id },
          select: { id: true, status: true, invoice_id: true, order_id: true },
        });
        if (!record) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        if (record.status !== 'PENDING') {
          return reply.status(422).send({
            success: false,
            error: { code: 'INVALID_STATUS', message: 'Only PENDING transfers can be confirmed.' },
          });
        }

        // Load order + company for payout record creation
        const order = await prisma.order.findUnique({
          where: { id: record.order_id },
          select: {
            id: true,
            company_id: true,
            contractor_profile_id: true,
            company: { select: { payout_preference: true, completed_orders_count: true } },
            contractor_profile: { select: { completed_orders_count: true } },
          },
        });
        if (!order) {
          return reply.status(404).send({ success: false, error: { code: 'ORDER_NOT_FOUND' } });
        }

        // Commission is calculated on the ex-GST subtotal — consistent with
        // company-payout.service.ts and invoice.service.ts. The GST portion
        // belongs to the ATO (or to the provider if GST-registered) and must
        // never be part of the platform commission base.
        const invoice = await prisma.companyInvoice.findUnique({
          where: { id: record.invoice_id },
          select: { amount_aud: true, total_aud: true },
        });
        const gross = Number(invoice?.amount_aud ?? invoice?.total_aud ?? 0);

        const { calculatePayout } = await import('../utils/commission.js');
        const isCompanyOrder = !!order.company_id;
        const completedCount = isCompanyOrder
          ? (order.company?.completed_orders_count ?? 0)
          : (order.contractor_profile?.completed_orders_count ?? 0);
        const { commission_amount_aud, commission_gst_aud, net_amount_aud } = calculatePayout(Number(gross), completedCount);
        const payoutMethod = isCompanyOrder
          ? (order.company?.payout_preference?.method ?? 'AU_BANK')
          : 'AU_BANK';

        const now = new Date();
        const [updated] = await prisma.$transaction([
          prisma.bankTransferPayment.update({
            where: { id },
            data: {
              status: 'CONFIRMED',
              confirmed_at: now,
              confirmed_by_id: req.user!.userId,
              admin_notes: parsed.data.admin_notes ?? null,
            },
          }),
          prisma.companyInvoice.update({
            where: { id: record.invoice_id },
            data: { status: 'PAID', paid_at: now },
          }),
          prisma.order.update({
            where: { id: record.order_id },
            data: { company_order_status: 'PAYMENT_RECEIVED' },
          }),
        ]);

        // Create payout record so admin can process the provider payment
        const existingPayout = await prisma.companyPayoutRecord.findUnique({
          where: { order_id: record.order_id },
        });
        if (!existingPayout) {
          await prisma.companyPayoutRecord.create({
            data: {
              order_id: record.order_id,
              ...(isCompanyOrder
                ? { company_id: order.company_id! }
                : { contractor_profile_id: order.contractor_profile_id! }),
              gross_amount_aud: gross,
              platform_fee_aud: commission_amount_aud,
              commission_gst_aud,
              net_amount_aud,
              method: payoutMethod,
              status: 'PENDING',
            },
          });
        }

        await (await import('../utils/audit.js')).writeAudit(prisma, {
          actorId: req.user!.userId,
          actionType: 'BANK_TRANSFER_CONFIRMED',
          entityType: 'BankTransferPayment',
          entityId: id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? 'unknown',
          metadata: { invoice_id: record.invoice_id, order_id: record.order_id },
        });

        return reply.status(200).send({ success: true, data: updated });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /admin/bank-transfers/:id/reject ────────────────────────────────
  // Admin rejects a bank transfer submission — customer must re-submit.

  app.post(
    '/bank-transfers/:id/reject',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = rejectBankTransferSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'reason is required (min 5 chars).' },
        });
      }
      try {
        const record = await prisma.bankTransferPayment.findUnique({
          where: { id },
          select: { id: true, status: true },
        });
        if (!record) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        if (record.status !== 'PENDING') {
          return reply.status(422).send({
            success: false,
            error: { code: 'INVALID_STATUS', message: 'Only PENDING transfers can be rejected.' },
          });
        }

        const updated = await prisma.bankTransferPayment.update({
          where: { id },
          data: {
            status: 'REJECTED',
            rejected_at: new Date(),
            rejection_reason: parsed.data.reason,
          },
        });

        await (await import('../utils/audit.js')).writeAudit(prisma, {
          actorId: req.user!.userId,
          actionType: 'BANK_TRANSFER_REJECTED',
          entityType: 'BankTransferPayment',
          entityId: id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? 'unknown',
          metadata: { reason: parsed.data.reason },
        });

        return reply.status(200).send({ success: true, data: updated });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TENDER CONTRACT PAYMENT ADMIN ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── List TC bank transfers ─────────────────────────────────────────────────

  app.get(
    '/tc-bank-transfers',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      if (!tcPaymentService) return reply.status(503).send({ success: false, error: { code: 'SERVICE_UNAVAILABLE' } });
      const query = req.query as { status?: string; limit?: string; cursor?: string };
      try {
        const result = await tcPaymentService.adminListBankTransfers({
          ...(query.status !== undefined ? { status: query.status } : {}),
          ...(query.limit !== undefined ? { limit: Number(query.limit) } : {}),
          ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
        });
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Confirm TC bank transfer ───────────────────────────────────────────────

  app.post(
    '/tc-bank-transfers/:id/confirm',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      if (!tcPaymentService) return reply.status(503).send({ success: false, error: { code: 'SERVICE_UNAVAILABLE' } });
      const { id } = req.params as { id: string };
      try {
        await tcPaymentService.adminConfirmBankTransfer(id, req.user!.userId);
        return reply.status(200).send({ success: true, data: { message: 'Bank transfer confirmed. Payout record created.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Reject TC bank transfer ────────────────────────────────────────────────

  const tcRejectTransferSchema = z.object({ reason: z.string().min(5).max(500) });

  app.post(
    '/tc-bank-transfers/:id/reject',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      if (!tcPaymentService) return reply.status(503).send({ success: false, error: { code: 'SERVICE_UNAVAILABLE' } });
      const { id } = req.params as { id: string };
      const parsed = tcRejectTransferSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'reason (min 5 chars) is required.' } });
      }
      try {
        await tcPaymentService.adminRejectBankTransfer(id, req.user!.userId, parsed.data.reason);
        return reply.status(200).send({ success: true, data: { message: 'Bank transfer rejected.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── List TC payout queue ───────────────────────────────────────────────────

  app.get(
    '/tc-payouts',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      if (!tcPaymentService) return reply.status(503).send({ success: false, error: { code: 'SERVICE_UNAVAILABLE' } });
      const query = req.query as { status?: string; limit?: string; cursor?: string };
      try {
        const result = await tcPaymentService.adminListPayouts({
          ...(query.status !== undefined ? { status: query.status } : {}),
          ...(query.limit !== undefined ? { limit: Number(query.limit) } : {}),
          ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
        });
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Process TC payout via Stripe Connect ──────────────────────────────────

  app.post(
    '/tc-payouts/:id/process-stripe',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      if (!tcPaymentService) return reply.status(503).send({ success: false, error: { code: 'SERVICE_UNAVAILABLE' } });
      const { id } = req.params as { id: string };
      try {
        await tcPaymentService.adminProcessStripePayout(id, req.user!.userId);
        return reply.status(200).send({ success: true, data: { message: 'Stripe transfer initiated.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Record TC offline payout ───────────────────────────────────────────────

  const tcOfflinePayoutSchema = z.object({
    reference: z.string().min(3),
    notes: z.string().min(20),
    transfer_date: z.coerce.date(),
  });

  app.post(
    '/tc-payouts/:id/record-offline',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      if (!tcPaymentService) return reply.status(503).send({ success: false, error: { code: 'SERVICE_UNAVAILABLE' } });
      const { id } = req.params as { id: string };
      const parsed = tcOfflinePayoutSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'reference, notes (min 20 chars), transfer_date are required.' } });
      }
      try {
        await tcPaymentService.adminRecordOfflinePayout(id, req.user!.userId, parsed.data);
        return reply.status(200).send({ success: true, data: { message: 'Offline payout recorded.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── POST /tc-payouts/:id/receipt ─────────────────────────────────────────
  // Admin uploads a bank transfer receipt for a tender contract payout.

  app.post(
    '/tc-payouts/:id/receipt',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const fileName = req.headers['x-file-name'];
      if (typeof fileName !== 'string' || !fileName) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'X-File-Name header required.' } });
      }
      const rawCt = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
      const extMap: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
      const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
      const ALLOWED = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      const ct = ALLOWED.includes(rawCt) ? rawCt : (extMap[ext] ?? rawCt);
      if (!ALLOWED.includes(ct)) {
        return reply.status(415).send({ success: false, error: { code: 'INVALID_FILE_TYPE', message: 'Only PDF, JPG, PNG allowed.' } });
      }
      const buffer = req.body as Buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'Body must be file binary.' } });
      }
      if (buffer.length > 10 * 1024 * 1024) {
        return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'Max 10 MB.' } });
      }
      try {
        const record = await prisma.tenderContractPayoutRecord.findUnique({ where: { id }, select: { id: true } });
        if (!record) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        const safe = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
        const blobPath = `tc-payout-receipts/${id}/${Date.now()}-${safe}`;
        const { uploadToBlob } = await import('../utils/blob-storage.js');
        await uploadToBlob(blobPath, buffer, ct);
        const updated = await prisma.tenderContractPayoutRecord.update({
          where: { id },
          data: { receipt_blob_path: blobPath },
          select: { receipt_blob_path: true },
        });
        return reply.status(200).send({ success: true, data: { receipt_blob_path: updated.receipt_blob_path } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── GET /tc-payouts/:id/receipt ───────────────────────────────────────────
  // Streams the TC payout receipt — admin or the provider.

  app.get(
    '/tc-payouts/:id/receipt',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { dl } = req.query as { dl?: string };
      try {
        const record = await prisma.tenderContractPayoutRecord.findUnique({
          where: { id },
          select: {
            receipt_blob_path: true,
            company_id: true,
            contractor_user_id: true,
          },
        });
        if (!record?.receipt_blob_path) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'No receipt uploaded yet.' } });
        }
        const userId = req.user!.userId;
        const accountType = req.user!.accountType;
        const isAdmin = ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'].includes(accountType);
        const isProvider = record.contractor_user_id === userId;
        if (!isAdmin && !isProvider) {
          if (record.company_id) {
            const member = await prisma.companyMember.findUnique({
              where: { company_id_user_id: { company_id: record.company_id, user_id: userId } },
              select: { status: true },
            });
            if (member?.status !== 'ACTIVE') {
              return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
            }
          } else {
            return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
          }
        }
        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentType, contentLength } = await downloadBlobStream(record.receipt_blob_path);
        const fileName = record.receipt_blob_path.split('/').pop() ?? 'receipt';
        reply.header('Content-Type', contentType ?? 'application/octet-stream');
        if (contentLength) reply.header('Content-Length', contentLength);
        reply.header('Content-Disposition', `${dl === '1' ? 'attachment' : 'inline'}; filename="${fileName}"`);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── GET /tc-payouts/:id/commission-invoice ────────────────────────────────
  // Generates (if needed) and streams the TC commission invoice PDF.

  app.get(
    '/tc-payouts/:id/commission-invoice',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { dl } = req.query as { dl?: string };
      if (!tcPaymentService) return reply.status(503).send({ success: false, error: { code: 'SERVICE_UNAVAILABLE' } });
      try {
        const { blob_path, invoice_number } = await tcPaymentService.generateCommissionInvoice(id);
        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentLength } = await downloadBlobStream(blob_path);
        reply.header('Content-Type', 'application/pdf');
        if (contentLength) reply.header('Content-Length', contentLength);
        const disposition = dl === '1' ? 'attachment' : 'inline';
        reply.header('Content-Disposition', `${disposition}; filename="${invoice_number}.pdf"`);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /admin/legal-name-requests ──────────────────────────────────────
  // List legal name change requests; defaults to PENDING.

  app.get(
    '/legal-name-requests',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { status = 'PENDING', cursor, limit: limitStr } = req.query as { status?: string; cursor?: string; limit?: string };
      const take = Math.min(parseInt(limitStr ?? '50', 10) || 50, 100);

      const requests = await prisma.legalNameChangeRequest.findMany({
        where: {
          status,
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: { created_at: 'asc' },
        take: take + 1,
        include: {
          contractor_profile: {
            select: {
              id: true,
              legal_name: true,
              legal_name_verified: true,
              user: { select: { id: true, full_name: true, email: true } },
            },
          },
        },
      });

      const hasMore = requests.length > take;
      const items = hasMore ? requests.slice(0, take) : requests;
      const nextCursor = hasMore ? items[items.length - 1]?.id : null;

      const counts = await prisma.legalNameChangeRequest.groupBy({
        by: ['status'],
        _count: true,
      });
      const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));

      return reply.status(200).send({ success: true, data: { requests: items, hasMore, nextCursor, counts: countMap } });
    },
  );

  // ─── GET /admin/legal-name-requests/:id/document ─────────────────────────
  // Stream the supporting document for a request.

  app.get(
    '/legal-name-requests/:id/document',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const request = await prisma.legalNameChangeRequest.findUnique({
        where: { id },
        select: { document_blob_path: true, document_file_name: true },
      });
      if (!request) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
      }
      try {
        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentType, contentLength } = await downloadBlobStream(request.document_blob_path);
        reply.header('Content-Type', contentType ?? 'application/octet-stream');
        if (contentLength) reply.header('Content-Length', contentLength);
        reply.header('Content-Disposition', `inline; filename="${request.document_file_name}"`);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch {
        return reply.status(404).send({ success: false, error: { code: 'FILE_NOT_FOUND' } });
      }
    },
  );

  // ─── PATCH /admin/legal-name-requests/:id/review ─────────────────────────
  // Approve or reject. On approval, updates ContractorProfile.legal_name.

  app.patch(
    '/legal-name-requests/:id/review',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { action?: string; rejection_reason?: string };

      if (!body.action || !['APPROVE', 'REJECT'].includes(body.action)) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'action must be APPROVE or REJECT.' } });
      }
      if (body.action === 'REJECT' && (!body.rejection_reason || body.rejection_reason.trim().length < 5)) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'rejection_reason is required when rejecting.' } });
      }

      const request = await prisma.legalNameChangeRequest.findUnique({
        where: { id },
        select: { id: true, status: true, contractor_id: true, requested_name: true },
      });
      if (!request) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
      }
      if (request.status !== 'PENDING') {
        return reply.status(409).send({ success: false, error: { code: 'ALREADY_REVIEWED', message: 'This request has already been reviewed.' } });
      }

      const newStatus = body.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

      await prisma.$transaction(async (tx) => {
        await tx.legalNameChangeRequest.update({
          where: { id },
          data: {
            status: newStatus,
            reviewed_by_id: req.user!.userId,
            reviewed_at: new Date(),
            ...(body.action === 'REJECT' ? { rejection_reason: body.rejection_reason!.trim() } : {}),
          },
        });

        if (body.action === 'APPROVE') {
          await tx.contractorProfile.update({
            where: { id: request.contractor_id },
            data: {
              legal_name: request.requested_name,
              legal_name_verified: true,
            },
          });
        }
      });

      return reply.status(200).send({
        success: true,
        data: { message: body.action === 'APPROVE' ? 'Legal name approved and updated.' : 'Request rejected.' },
      });
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // ─── Account sanctions (Phase 3) ───────────────────────────────────────────
  // Admin imposes / lifts suspensions or bans on either customers or
  // suppliers. Independent of dispute outcomes — admins act based on dispute
  // recommendations or other evidence at their discretion.
  // ───────────────────────────────────────────────────────────────────────────

  const sanctionBodySchema = z.object({
    reason: z
      .string()
      .trim()
      .min(5, 'Reason must be at least 5 characters')
      .max(1000),
  });

  function meta(req: FastifyRequest) {
    return {
      ip: req.ip,
      user_agent: req.headers['user-agent'] ?? 'unknown',
    };
  }

  function handleSanctionError(reply: FastifyReply, err: unknown) {
    const e = err as { status?: number; code?: string; message?: string };
    return reply.status(e.status ?? 500).send({
      success: false,
      error: { code: e.code ?? 'INTERNAL_ERROR', message: e.message ?? 'An unexpected error occurred' },
    });
  }

  app.post(
    '/users/:id/suspend',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = sanctionBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          },
        });
      }
      try {
        await sanctionsService.suspend(id, {
          reason: parsed.data.reason,
          admin_id: req.user!.userId,
          ...meta(req),
        });
        return reply.status(200).send({ success: true, data: { message: 'User suspended.' } });
      } catch (err) {
        return handleSanctionError(reply, err);
      }
    },
  );

  app.post(
    '/users/:id/unsuspend',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = sanctionBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          },
        });
      }
      try {
        await sanctionsService.unsuspend(id, {
          reason: parsed.data.reason,
          admin_id: req.user!.userId,
          ...meta(req),
        });
        return reply.status(200).send({ success: true, data: { message: 'Suspension lifted.' } });
      } catch (err) {
        return handleSanctionError(reply, err);
      }
    },
  );

  app.post(
    '/users/:id/ban',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = sanctionBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          },
        });
      }
      try {
        await sanctionsService.ban(id, {
          reason: parsed.data.reason,
          admin_id: req.user!.userId,
          ...meta(req),
        });
        return reply.status(200).send({ success: true, data: { message: 'User banned.' } });
      } catch (err) {
        return handleSanctionError(reply, err);
      }
    },
  );

  app.post(
    '/users/:id/unban',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = sanctionBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          },
        });
      }
      try {
        await sanctionsService.unban(id, {
          reason: parsed.data.reason,
          admin_id: req.user!.userId,
          ...meta(req),
        });
        return reply.status(200).send({ success: true, data: { message: 'Ban lifted.' } });
      } catch (err) {
        return handleSanctionError(reply, err);
      }
    },
  );

  app.get(
    '/users/:id/sanction',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const result = await sanctionsService.getActiveSanction(id);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleSanctionError(reply, err);
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // ─── Direct payments ledger (Phase 4) ──────────────────────────────────────
  // Unified read-only view across orders + tender-contract invoices that have
  // been touched by the direct-payment flow (i.e. customer reported a payment
  // at some point). Replaces the legacy /admin/payouts queue conceptually:
  // the platform no longer holds funds, so there's nothing to approve — only
  // a record of what happened.
  // ───────────────────────────────────────────────────────────────────────────

  const paymentsLedgerSchema = z.object({
    status: z
      .enum(['ALL', 'AWAITING_PAYMENT', 'PAYMENT_REPORTED', 'PAYMENT_CONFIRMED', 'PAID', 'DISPUTED'])
      .default('ALL'),
    method: z
      .enum(['ALL', 'STRIPE', 'PAYPAL', 'BANK_TRANSFER_BSB', 'BANK_TRANSFER_SWIFT', 'WISE', 'OTHER'])
      .default('ALL'),
    kind: z.enum(['ALL', 'order', 'tender_invoice']).default('ALL'),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  });

  app.get(
    '/payments',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const parsed = paymentsLedgerSchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid filters' },
        });
      }
      const { status, method, kind, cursor, limit } = parsed.data;

      // Build per-entity where clauses.
      const orderWhere: Record<string, unknown> = {
        // Only entities that have entered the direct-payment flow
        OR: [
          { customer_reported_paid_at: { not: null } },
          { status: { in: ['AWAITING_PAYMENT', 'PAYMENT_REPORTED', 'PAYMENT_CONFIRMED'] } },
        ],
      };
      const invoiceWhere: Record<string, unknown> = {
        OR: [
          { customer_reported_paid_at: { not: null } },
          { status: { in: ['AWAITING_PAYMENT', 'PAYMENT_REPORTED'] } },
        ],
      };

      if (status !== 'ALL') {
        if (status === 'DISPUTED') {
          orderWhere['payment_dispute_raised_at'] = { not: null };
          invoiceWhere['payment_dispute_raised_at'] = { not: null };
        } else if (status === 'PAID') {
          // PAID maps to invoice.status='PAID' OR order.status='PAYMENT_CONFIRMED'
          orderWhere['status'] = 'PAYMENT_CONFIRMED';
          invoiceWhere['status'] = 'PAID';
        } else {
          orderWhere['status'] = status;
          invoiceWhere['status'] = status;
        }
      }
      if (method !== 'ALL') {
        orderWhere['payment_method'] = method;
        invoiceWhere['payment_method'] = method;
      }

      // Per-side query — fetch a window from each then merge by reported_at
      // descending. Cursor is a base64-encoded {orderCursor, invCursor} pair
      // so each side can paginate independently.
      let orderCursor: string | undefined;
      let invCursor: string | undefined;
      if (cursor) {
        try {
          const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString()) as {
            o?: string;
            i?: string;
          };
          orderCursor = decoded.o;
          invCursor = decoded.i;
        } catch { /* ignore malformed cursor */ }
      }

      const [orders, invoices] = await Promise.all([
        kind === 'tender_invoice'
          ? Promise.resolve([])
          : prisma.order.findMany({
              where: orderWhere,
              take: limit + 1,
              ...(orderCursor && { skip: 1, cursor: { id: orderCursor } }),
              orderBy: [{ customer_reported_paid_at: 'desc' }, { updated_at: 'desc' }],
              select: {
                id: true,
                status: true,
                payment_method: true,
                payment_reference: true,
                payment_amount_reported_aud: true,
                customer_reported_paid_at: true,
                supplier_confirmed_paid_at: true,
                payment_dispute_reason: true,
                payment_dispute_raised_at: true,
                payment_evidence_file_name: true,
                total_amount_aud: true,
                created_at: true,
                customer: { select: { id: true, full_name: true, email: true } },
                contractor_user: { select: { id: true, full_name: true, email: true } },
                company: { select: { id: true, company_name: true } },
              },
            }),
        kind === 'order'
          ? Promise.resolve([])
          : prisma.tenderContractInvoice.findMany({
              where: invoiceWhere,
              take: limit + 1,
              ...(invCursor && { skip: 1, cursor: { id: invCursor } }),
              orderBy: [{ customer_reported_paid_at: 'desc' }, { updated_at: 'desc' }],
              select: {
                id: true,
                invoice_number: true,
                status: true,
                payment_method: true,
                payment_reference: true,
                payment_amount_reported_aud: true,
                customer_reported_paid_at: true,
                supplier_confirmed_paid_at: true,
                payment_dispute_reason: true,
                payment_dispute_raised_at: true,
                payment_evidence_file_name: true,
                total_aud: true,
                created_at: true,
                contract: {
                  select: {
                    id: true,
                    customer: { select: { id: true, full_name: true, email: true } },
                    contractor: { select: { id: true, full_name: true, email: true } },
                  },
                },
                company: { select: { id: true, company_name: true } },
              },
            }),
      ]);

      const orderHasMore = orders.length > limit;
      const invHasMore = invoices.length > limit;
      const orderItems = orderHasMore ? orders.slice(0, limit) : orders;
      const invItems = invHasMore ? invoices.slice(0, limit) : invoices;

      type Row = {
        id: string;
        kind: 'order' | 'tender_invoice';
        reference: string;
        status: string;
        payment_method: string | null;
        payment_reference: string | null;
        amount_aud: string | null;
        amount_reported_aud: string | null;
        reported_at: string | null;
        confirmed_at: string | null;
        dispute_reason: string | null;
        dispute_raised_at: string | null;
        evidence_file_name: string | null;
        customer: { id: string; full_name: string; email: string } | null;
        supplier: { id: string; name: string } | null;
      };

      const rows: Row[] = [
        ...orderItems.map((o): Row => ({
          id: o.id,
          kind: 'order',
          reference: `ORD-${o.id.slice(-8)}`,
          status: o.status,
          payment_method: o.payment_method,
          payment_reference: o.payment_reference,
          amount_aud: o.total_amount_aud.toString(),
          amount_reported_aud: o.payment_amount_reported_aud?.toString() ?? null,
          reported_at: o.customer_reported_paid_at?.toISOString() ?? null,
          confirmed_at: o.supplier_confirmed_paid_at?.toISOString() ?? null,
          dispute_reason: o.payment_dispute_reason,
          dispute_raised_at: o.payment_dispute_raised_at?.toISOString() ?? null,
          evidence_file_name: o.payment_evidence_file_name,
          customer: o.customer
            ? { id: o.customer.id, full_name: o.customer.full_name, email: o.customer.email }
            : null,
          supplier: o.company
            ? { id: o.company.id, name: o.company.company_name }
            : o.contractor_user
              ? { id: o.contractor_user.id, name: o.contractor_user.full_name }
              : null,
        })),
        ...invItems.map((i): Row => ({
          id: i.id,
          kind: 'tender_invoice',
          reference: i.invoice_number,
          status: i.status,
          payment_method: i.payment_method,
          payment_reference: i.payment_reference,
          amount_aud: i.total_aud.toString(),
          amount_reported_aud: i.payment_amount_reported_aud?.toString() ?? null,
          reported_at: i.customer_reported_paid_at?.toISOString() ?? null,
          confirmed_at: i.supplier_confirmed_paid_at?.toISOString() ?? null,
          dispute_reason: i.payment_dispute_reason,
          dispute_raised_at: i.payment_dispute_raised_at?.toISOString() ?? null,
          evidence_file_name: i.payment_evidence_file_name,
          customer: i.contract.customer
            ? {
                id: i.contract.customer.id,
                full_name: i.contract.customer.full_name,
                email: i.contract.customer.email,
              }
            : null,
          supplier: i.company
            ? { id: i.company.id, name: i.company.company_name }
            : i.contract.contractor
              ? { id: i.contract.contractor.id, name: i.contract.contractor.full_name }
              : null,
        })),
      ];

      // Merge by reported_at desc, then created/updated time as fallback
      rows.sort((a, b) => {
        const at = a.reported_at ?? '';
        const bt = b.reported_at ?? '';
        return bt.localeCompare(at);
      });

      const lastOrder = orderItems[orderItems.length - 1];
      const lastInv = invItems[invItems.length - 1];
      const nextCursor = orderHasMore || invHasMore
        ? Buffer.from(
            JSON.stringify({
              ...(orderHasMore && lastOrder ? { o: lastOrder.id } : {}),
              ...(invHasMore && lastInv ? { i: lastInv.id } : {}),
            }),
          ).toString('base64')
        : null;

      return reply.status(200).send({
        success: true,
        data: {
          rows: rows.slice(0, limit),
          next_cursor: nextCursor,
          has_more: orderHasMore || invHasMore,
        },
      });
    },
  );
}
