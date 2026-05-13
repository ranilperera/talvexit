import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import type { ProposalService } from '../services/proposal.service.js';
import { prisma } from '../lib/prisma.js';
// downloadBlobStream is dynamically imported in the document handler.

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const createProposalSchema = z.object({
  scope_of_work: z.string().min(1),
  timeline_days: z.number().int().positive().optional(),
  payment_terms: z.string().optional(),
  notes: z.string().optional(),
  // Supplier-authored legal terms (multi-paragraph). When omitted, the PO
  // PDF falls back to the platform-config po_terms array. Capped at 32 KB
  // so a runaway paste can't blow up the proposal row.
  legal_terms: z.string().max(32_000).optional(),
  currency: z.string().min(3).max(3),
  price: z.number().positive(),
});

const respondToProposalSchema = z.object({
  decision: z.enum(['APPROVE', 'REQUEST_CHANGES']),
  change_notes: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  return reply.status(e.status ?? 500).send({
    success: false,
    error: { code: e.code ?? 'INTERNAL_ERROR', message: e.message ?? 'An unexpected error occurred' },
  });
}

// ─── Route options ────────────────────────────────────────────────────────────

interface ProposalRouteOptions {
  proposalService: ProposalService;
}

// ─── proposalRoutes ───────────────────────────────────────────────────────────

export async function proposalRoutes(app: FastifyInstance, opts: ProposalRouteOptions) {
  const { proposalService } = opts;

  // ─── POST /orders/:id/proposals ───────────────────────────────────────────
  // Company admin or senior consultant creates a draft proposal.

  app.post(
    '/orders/:id/proposals',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: orderId } = req.params as { id: string };
      const parsed = createProposalSchema.safeParse(req.body);
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
        const proposalData: import('../services/proposal.service.js').CreateProposalInput = {
          scope_of_work: parsed.data.scope_of_work,
          currency: parsed.data.currency,
          price: parsed.data.price,
          ...(parsed.data.timeline_days !== undefined && { timeline_days: parsed.data.timeline_days }),
          ...(parsed.data.payment_terms !== undefined && { payment_terms: parsed.data.payment_terms }),
          ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
          ...(parsed.data.legal_terms !== undefined && { legal_terms: parsed.data.legal_terms }),
        };
        const result = await proposalService.createProposal(orderId, req.user.userId, proposalData);
        return reply.status(201).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /proposals/:id/send ─────────────────────────────────────────────
  // Company admin or senior consultant sends a DRAFT proposal to the customer.

  app.post(
    '/proposals/:id/send',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: proposalId } = req.params as { id: string };
      try {
        const result = await proposalService.sendProposal(proposalId, req.user.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /orders/:id/proposals ────────────────────────────────────────────
  // Returns all proposal versions for a company order.

  app.get(
    '/orders/:id/proposals',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: orderId } = req.params as { id: string };
      try {
        const result = await proposalService.getProposalHistory(orderId, req.user.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /proposals/:id ───────────────────────────────────────────────────
  // Returns a single proposal by ID. The service-level auth is deferred to
  // the order-level guards inside getProposalHistory; here we do a direct lookup.

  app.get(
    '/proposals/:id',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: proposalId } = req.params as { id: string };
      try {
        const proposal = await prisma.companyOrderProposal.findUnique({
          where: { id: proposalId },
          include: {
            order: {
              select: { customer_id: true, company_id: true, executing_member_id: true },
            },
            company: { select: { company_name: true, abn: true } },
            created_by: { select: { full_name: true } },
          },
        });
        if (!proposal) {
          return reply.status(404).send({
            success: false,
            error: { code: 'PROPOSAL_NOT_FOUND', message: 'Proposal not found.' },
          });
        }

        // Access check: customer, executing member, or company member
        const userId = req.user.userId;
        const isCustomer = proposal.order.customer_id === userId;
        const isExecutingMember = proposal.order.executing_member_id === userId;
        let isCompanyMember = false;
        if (!isCustomer && !isExecutingMember && proposal.order.company_id) {
          const membership = await prisma.companyMember.findUnique({
            where: {
              company_id_user_id: { company_id: proposal.order.company_id, user_id: userId },
            },
            select: { status: true },
          });
          isCompanyMember = membership?.status === 'ACTIVE';
        }
        if (!isCustomer && !isExecutingMember && !isCompanyMember) {
          const actor = await prisma.user.findUnique({
            where: { id: userId },
            select: { account_type: true },
          });
          if (
            actor?.account_type !== 'PLATFORM_ADMIN' &&
            actor?.account_type !== 'COMPLIANCE_ADMIN'
          ) {
            return reply.status(403).send({
              success: false,
              error: { code: 'FORBIDDEN', message: 'You do not have access to this proposal.' },
            });
          }
        }

        return reply.status(200).send({ success: true, data: proposal });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /proposals/:id/respond ──────────────────────────────────────────
  // Customer approves or requests changes to a SENT proposal.

  app.post(
    '/proposals/:id/respond',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: proposalId } = req.params as { id: string };
      const parsed = respondToProposalSchema.safeParse(req.body);
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
        const respondData: {
          decision: 'APPROVE' | 'REQUEST_CHANGES';
          change_notes?: string;
          approval_ip?: string;
          approval_user_agent?: string;
        } = { decision: parsed.data.decision };
        if (parsed.data.change_notes !== undefined) respondData.change_notes = parsed.data.change_notes;
        if (req.ip) respondData.approval_ip = req.ip;
        const ua = req.headers['user-agent'];
        if (ua) respondData.approval_user_agent = ua;
        const result = await proposalService.customerRespondToProposal(
          proposalId,
          req.user.userId,
          respondData,
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /orders/:id/purchase-order ──────────────────────────────────────
  // Returns the accepted Purchase Order for a company order.

  app.get(
    '/orders/:id/purchase-order',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: orderId } = req.params as { id: string };
      try {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: {
            customer_id: true,
            company_id: true,
            executing_member_id: true,
          },
        });
        if (!order) {
          return reply.status(404).send({
            success: false,
            error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' },
          });
        }

        const userId = req.user.userId;
        const isCustomer = order.customer_id === userId;
        const isExecutingMember = order.executing_member_id === userId;
        let isCompanyMember = false;
        if (!isCustomer && !isExecutingMember && order.company_id) {
          const membership = await prisma.companyMember.findUnique({
            where: {
              company_id_user_id: { company_id: order.company_id, user_id: userId },
            },
            select: { status: true },
          });
          isCompanyMember = membership?.status === 'ACTIVE';
        }
        if (!isCustomer && !isExecutingMember && !isCompanyMember) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'You do not have access to this order.' },
          });
        }

        const po = await prisma.purchaseOrder.findUnique({
          where: { order_id: orderId },
        });
        if (!po) {
          return reply.status(404).send({
            success: false,
            error: { code: 'PO_NOT_FOUND', message: 'No purchase order exists for this order.' },
          });
        }
        return reply.status(200).send({ success: true, data: po });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /purchase-orders/:id/document ───────────────────────────────────
  // Returns a 1-hour SAS URL for the Purchase Order PDF stored in Blob Storage.

  app.get(
    '/purchase-orders/:id/document',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: poId } = req.params as { id: string };
      try {
        const po = await prisma.purchaseOrder.findUnique({
          where: { id: poId },
          select: {
            id: true,
            po_number: true,
            pdf_blob_path: true,
            order: {
              select: { customer_id: true, company_id: true, executing_member_id: true },
            },
          },
        });
        if (!po) {
          return reply.status(404).send({
            success: false,
            error: { code: 'PO_NOT_FOUND', message: 'Purchase order not found.' },
          });
        }
        if (!po.pdf_blob_path) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NO_DOCUMENT', message: 'PDF not yet generated for this purchase order.' },
          });
        }

        const userId = req.user.userId;
        const isCustomer = po.order.customer_id === userId;
        const isExecutingMember = po.order.executing_member_id === userId;
        let isCompanyMember = false;
        if (!isCustomer && !isExecutingMember && po.order.company_id) {
          const membership = await prisma.companyMember.findUnique({
            where: {
              company_id_user_id: { company_id: po.order.company_id, user_id: userId },
            },
            select: { status: true },
          });
          isCompanyMember = membership?.status === 'ACTIVE';
        }
        if (!isCustomer && !isExecutingMember && !isCompanyMember) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'You do not have access to this document.' },
          });
        }

        // Stream the PO PDF through the API rather than returning a SAS
        // URL — keeps the Azure URL out of the browser and keeps every
        // download gated by the platform auth check.
        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentType, contentLength } = await downloadBlobStream(po.pdf_blob_path);
        const fileName = po.pdf_blob_path.split('/').pop() ?? `${po.po_number ?? 'purchase-order'}.pdf`;
        const { dl } = req.query as { dl?: string };
        const disposition = dl === '1' ? 'attachment' : 'inline';
        reply.header('Content-Type', contentType ?? 'application/pdf');
        if (contentLength) reply.header('Content-Length', contentLength);
        reply.header('Content-Disposition', `${disposition}; filename="${fileName}"`);
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('Cache-Control', 'private, no-store');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
