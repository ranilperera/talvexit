import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createOrderSchema,
  listOrdersSchema,
  createWorkLogSchema,
  addDeliverableSchema,
  requestRevisionSchema,
  raiseDisputeSchema,
  createChangeRequestSchema,
  decideChangeRequestSchema,
  disputeDeterminationSchema,
} from '@onys/shared';
import { z } from 'zod';
import type { OrderService } from '../services/order.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { transitionOrder } from '../services/order-state-machine.service.js';
import { prisma } from '../lib/prisma.js';
import { writeAudit } from '../utils/audit.js';

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

// ─── Actor guards (used as preHandlers) ───────────────────────────────────────

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

export async function orderRoutes(
  app: FastifyInstance,
  opts: { orderService: OrderService },
) {
  const { orderService } = opts;
  const forceTransitionSchema = z.object({
    target_status: z.string(),
    reason: z.string().optional(),
  });

  // ─── POST /orders ──────────────────────────────────────────────────────────

  app.post('/orders', { preHandler: [authenticate, requireCustomer] }, async (req, reply) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return validationError(reply, parsed.error.issues);
    }
    try {
      const order = await orderService.createOrder(req.user!.userId, parsed.data, extractMeta(req));
      return reply.status(201).send({ success: true, data: order });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /orders ───────────────────────────────────────────────────────────

  app.get('/orders', { preHandler: [authenticate] }, async (req, reply) => {
    const parsed = listOrdersSchema.safeParse(req.query);
    if (!parsed.success) {
      return validationError(reply, parsed.error.issues);
    }
    try {
      const result = await orderService.listOrders(req.user!.userId, parsed.data);
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /orders/:id ───────────────────────────────────────────────────────

  app.get('/orders/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const order = await orderService.getOrderById(id, req.user!.userId);
      return reply.status(200).send({ success: true, data: order });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /orders/:id/work-log ─────────────────────────────────────────────

  app.post(
    '/orders/:id/work-log',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = createWorkLogSchema.safeParse(req.body);
      if (!parsed.success) {
        return validationError(reply, parsed.error.issues);
      }
      try {
        const workLog = await orderService.addWorkLog(id, req.user!.userId, parsed.data);
        return reply.status(201).send({ success: true, data: workLog });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /orders/:id/deliverables ─────────────────────────────────────────

  app.post(
    '/orders/:id/deliverables',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = addDeliverableSchema.safeParse(req.body);
      if (!parsed.success) {
        return validationError(reply, parsed.error.issues);
      }
      try {
        const deliverable = await orderService.addDeliverable(id, req.user!.userId, parsed.data);
        return reply.status(201).send({ success: true, data: deliverable });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /orders/:id/submit ───────────────────────────────────────────────

  app.post(
    '/orders/:id/submit',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const order = await orderService.submitDeliverables(id, req.user!.userId);
        return reply.status(200).send({
          success: true,
          data: { order, message: 'Deliverables submitted. Customer has 72 hours to review.' },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /orders/:id/approve ──────────────────────────────────────────────

  app.post(
    '/orders/:id/approve',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const order = await orderService.approveDeliverables(id, req.user!.userId);
        return reply.status(200).send({
          success: true,
          data: { order, message: 'Order approved. Payout initiated.' },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /orders/:id/request-revision ────────────────────────────────────

  app.post(
    '/orders/:id/request-revision',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = requestRevisionSchema.safeParse(req.body);
      if (!parsed.success) {
        return validationError(reply, parsed.error.issues);
      }
      try {
        const order = await orderService.requestRevision(id, req.user!.userId, parsed.data);
        return reply.status(200).send({
          success: true,
          data: { order, message: 'Revision requested. Expert has 48 hours to resubmit.' },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /orders/:id/dispute ──────────────────────────────────────────────

  app.post('/orders/:id/dispute', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = raiseDisputeSchema.safeParse(req.body);
    if (!parsed.success) {
      return validationError(reply, parsed.error.issues);
    }
    try {
      const result = await orderService.raiseDispute(id, req.user!.userId, parsed.data);
      return reply.status(201).send({
        success: true,
        data: {
          ...result,
          message: 'Dispute raised. Admin will be in touch within 4 hours.',
        },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /orders/:id/change-requests ─────────────────────────────────────

  app.post(
    '/orders/:id/change-requests',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = createChangeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return validationError(reply, parsed.error.issues);
      }
      try {
        const changeRequest = await orderService.createChangeRequest(
          id,
          req.user!.userId,
          parsed.data,
        );
        return reply.status(201).send({ success: true, data: changeRequest });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /orders/:id/change-requests/:cr_id/decide ───────────────────────

  app.post(
    '/orders/:id/change-requests/:cr_id/decide',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { id, cr_id } = req.params as { id: string; cr_id: string };
      const parsed = decideChangeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return validationError(reply, parsed.error.issues);
      }
      try {
        const changeRequest = await orderService.decideChangeRequest(
          id,
          cr_id,
          req.user!.userId,
          parsed.data,
        );
        const message =
          parsed.data.decision === 'APPROVE'
            ? 'Change request approved. Order amount updated.'
            : 'Change request declined.';
        return reply.status(200).send({ success: true, data: { changeRequest, message } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: GET /admin/orders/disputed ────────────────────────────────────

  app.get(
    '/admin/orders/disputed',
    { preHandler: [authenticate, requireAdmin] },
    async (_req, reply) => {
      try {
        const orders = await prisma.order.findMany({
          where: { status: 'DISPUTED' },
          include: {
            customer: { select: { id: true, full_name: true, email: true } },
            contractor_user: { select: { id: true, full_name: true, email: true } },
            dispute: true,
          },
          orderBy: { disputed_at: 'asc' },
        });
        return reply.status(200).send({
          success: true,
          data: { orders, count: orders.length },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: POST /admin/orders/:id/force-transition ──────────────────────

  app.post(
    '/admin/orders/:id/force-transition',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = forceTransitionSchema.safeParse(req.body);
      if (!parsed.success) {
        return validationError(reply, parsed.error.issues);
      }
      try {
        const order = await transitionOrder(
          prisma,
          id,
          parsed.data.target_status,
          req.user!.userId,
          {
            skipGuards: true,
            ...(parsed.data.reason !== undefined && { reason: parsed.data.reason }),
          },
        );
        return reply.status(200).send({ success: true, data: order });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: POST /admin/orders/:id/dispute/assign ─────────────────────────

  app.post(
    '/admin/orders/:id/dispute/assign',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const dispute = await prisma.dispute.update({
          where: { order_id: id },
          data: {
            assigned_admin_id: req.user!.userId,
            assigned_at: new Date(),
            status: 'ASSIGNED',
          },
        });
        return reply.status(200).send({ success: true, data: dispute });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: POST /admin/orders/:id/dispute/determine ──────────────────────

  app.post(
    '/admin/orders/:id/dispute/determine',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = disputeDeterminationSchema.safeParse(req.body);
      if (!parsed.success) {
        return validationError(reply, parsed.error.issues);
      }
      try {
        const adminId = req.user!.userId;
        const now = new Date();

        // 1. Update dispute record
        const dispute = await prisma.dispute.update({
          where: { order_id: id },
          data: {
            outcome: parsed.data.outcome,
            written_reasons: parsed.data.written_reasons,
            ...(parsed.data.payment_amount_aud !== undefined && {
              payment_amount_aud: parsed.data.payment_amount_aud,
            }),
            ...(parsed.data.payment_action_status && {
              payment_action_status: parsed.data.payment_action_status,
            }),
            determined_at: now,
            determined_by_id: adminId,
            status: 'DETERMINED',
          },
        });

        // 2. Transition order to COMPLETED (all M11 outcomes close the order)
        const order = await transitionOrder(prisma, id, 'COMPLETED', adminId, { skipGuards: true });

        // 3. Fetch parties for email notification
        const orderRecord = await prisma.order.findUnique({
          where: { id },
          include: {
            customer: { select: { email: true } },
            contractor_user: { select: { email: true } },
          },
        });

        // 4. Audit
        void writeAudit(prisma, {
          actorId: adminId,
          actionType: 'DISPUTE_DETERMINED',
          entityType: 'Order',
          entityId: id,
          metadata: {
            outcome: parsed.data.outcome,
            payment_amount_aud: parsed.data.payment_amount_aud ?? null,
            customer_email: orderRecord?.customer.email ?? null,
            contractor_email: orderRecord?.contractor_user?.email ?? null,
          },
        });

        // TODO M09: trigger payout job to 'payments' queue with payout_action details
        // void paymentsQueue.add('dispute-payout', { order_id: id, payout_action: parsed.data.payout_action, ... })

        return reply.status(200).send({ success: true, data: { order, dispute } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
