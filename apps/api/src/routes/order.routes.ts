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
  reportPaymentSchema,
  disputeEvidenceSchema,
} from '@onys/shared';
import { z } from 'zod';
import type { OrderService } from '../services/order.service.js';
import type { EngagementPaymentService } from '../services/engagement-payment.service.js';
import type { SubscriptionGuards } from '../middleware/subscription-limits.js';
import type { SubscriptionService } from '../services/subscription.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { transitionOrder, isAuthorizedContractorSide } from '../services/order-state-machine.service.js';
import { uploadToBlob, downloadBlobStream } from '../utils/blob-storage.js';
import { prisma } from '../lib/prisma.js';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';
import { loadOrderParties, notifyOrderAccepted, notifyOrderCancelled } from '../services/order-notifications.js';
import type { NotificationService } from '../services/notification.service.js';

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
  const allowed = [
    'INDIVIDUAL_CONTRACTOR', 'ORGANIZATION_ADMIN', 'ORG_MEMBER',
    'COMPANY_ADMIN', 'COMPANY_MEMBER',
  ] as const;
  if (!req.user || !(allowed as readonly string[]).includes(req.user.accountType)) {
    await reply.status(403).send({
      success: false,
      error: { code: 'CONTRACTOR_ONLY', message: 'Only contractors or company members can perform this action' },
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
  opts: {
    orderService: OrderService;
    engagementPaymentService: EngagementPaymentService;
    notificationService: NotificationService;
    subscriptionGuards: SubscriptionGuards;
    subscriptionService: SubscriptionService;
  },
) {
  const { orderService, engagementPaymentService, notificationService, subscriptionGuards, subscriptionService } = opts;
  const forceTransitionSchema = z.object({
    target_status: z.string(),
    reason: z.string().optional(),
  });

  // ─── POST /orders ──────────────────────────────────────────────────────────
  // Customer subscription guards:
  //   - requireLimit('active_orders') — computed live, customer's concurrent
  //     in-flight order cap. No counter (Quota 2).
  //   - requireLimit('orders') — total orders this period. Counter, monthly
  //     reset (Quota 3).
  //   - task_bookings (Quota 1) is consumed only for catalog bookings
  //     (orders with a task_id). Handled inside the handler so the increment
  //     fires only when applicable. The pre-flight check still happens
  //     before order creation so the customer gets a clean 429 if at cap.

  app.post(
    '/orders',
    {
      preHandler: [
        authenticate,
        requireCustomer,
        subscriptionGuards.requireLimit('active_orders'),
        subscriptionGuards.requireLimit('orders'),
      ],
    },
    async (req, reply) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return validationError(reply, parsed.error.issues);
    }
    try {
      // Catalog booking? Consume task_bookings quota too. incrementUsage
      // throws SUBSCRIPTION_LIMIT_REACHED with the appropriate plan name +
      // limit if the customer is over cap, and we let it bubble.
      const isCatalogBooking = !!parsed.data.task_id;
      if (isCatalogBooking) {
        await subscriptionService.incrementUsage(req.user!.userId, 'task_bookings');
      }
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

  // ─── POST /orders/:id/accept ───────────────────────────────────────────────

  app.post(
    '/orders/:id/accept',
    {
      preHandler: [
        authenticate,
        requireContractorOrOrgMember,
        // active_orders caps concurrent in-delivery; orders caps the per-period
        // counter. active_orders runs first so the order isn't counted toward
        // the period if the concurrent cap rejects it.
        subscriptionGuards.requireLimit('active_orders'),
        subscriptionGuards.requireLimit('orders'),
      ],
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { notes?: string };
      try {
        const order = await prisma.order.findUnique({
          where: { id },
          select: { contractor_user_id: true, status: true },
        });
        if (!order) {
          return reply.status(404).send({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' } });
        }
        if (order.contractor_user_id !== req.user!.userId) {
          return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        if (order.status !== 'SCOPED') {
          return reply.status(422).send({ success: false, error: { code: 'INVALID_STATE', message: 'Order must be in SCOPED status to accept' } });
        }
        const updated = await transitionOrder(prisma, id, 'ACCEPTED', req.user!.userId, {
          ...(body.notes ? { reason: body.notes } : {}),
        });
        void writeAudit(prisma, {
          actorId: req.user!.userId,
          actionType: 'ORDER_ACCEPTED_BY_CONTRACTOR',
          entityType: 'Order',
          entityId: id,
          metadata: { notes: body.notes ?? null },
        });
        // Fire centralised lifecycle notification — tell the customer.
        const ctx = await loadOrderParties(prisma, id);
        if (ctx) {
          await notifyOrderAccepted(notificationService, ctx).catch((err: unknown) => {
            console.error('[order-events] notifyOrderAccepted failed:', err);
          });
        }
        return reply.status(200).send({ success: true, data: { order: updated } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /orders/:id/reject ───────────────────────────────────────────────

  app.post(
    '/orders/:id/reject',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = z.object({ reason: z.string().min(10, 'Reason must be at least 10 characters') }).safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);
      try {
        const order = await prisma.order.findUnique({
          where: { id },
          select: { contractor_user_id: true, status: true },
        });
        if (!order) {
          return reply.status(404).send({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' } });
        }
        if (order.contractor_user_id !== req.user!.userId) {
          return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        if (order.status !== 'SCOPED') {
          return reply.status(422).send({ success: false, error: { code: 'INVALID_STATE', message: 'Order must be in SCOPED status to reject' } });
        }
        const updated = await transitionOrder(prisma, id, 'CANCELLED', req.user!.userId, {
          reason: parsed.data.reason,
        });
        const cancelCtx = await loadOrderParties(prisma, id);
        if (cancelCtx) {
          await notifyOrderCancelled(notificationService, cancelCtx, parsed.data.reason, 'contractor').catch(
            (err: unknown) => console.error('[order-events] notifyOrderCancelled (reject) failed:', err),
          );
        }
        void writeAudit(prisma, {
          actorId: req.user!.userId,
          actionType: 'ORDER_REJECTED_BY_CONTRACTOR',
          entityType: 'Order',
          entityId: id,
          metadata: { reason: parsed.data.reason },
        });
        return reply.status(200).send({ success: true, data: { order: updated } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

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

  // ─── GET /orders/:id/deliverables ──────────────────────────────────────────

  app.get(
    '/orders/:id/deliverables',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const deliverables = await orderService.getDeliverables(id, req.user!.userId);
        return reply.status(200).send({ success: true, data: deliverables });
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

  // ─── POST /orders/:id/start ────────────────────────────────────────────────

  app.post(
    '/orders/:id/start',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const order = await orderService.startWork(id, req.user!.userId);
        return reply.status(200).send({
          success: true,
          data: { order, message: 'Work started. SLA clock is now running.' },
        });
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

  // ─── POST /orders/:id/start-work ──────────────────────────────────────────
  // Contractor-only: confirms work has started for PO_GENERATED orders.
  // Mirrors company assignMemberToOrder but self-assigns without membership check.

  app.post(
    '/orders/:id/start-work',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        await orderService.startContractorWork(id, req.user!.userId);
        return reply.status(200).send({ success: true, data: { message: 'Work started.' } });
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
          data: { order, message: 'Order approved. Payout is pending admin review.' },
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

  // ─── POST /orders/:id/start-revision ──────────────────────────────────────
  // Provider acknowledges revision request and moves back to IN_PROGRESS.

  app.post(
    '/orders/:id/start-revision',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const order = await prisma.order.findUnique({ where: { id } });
        if (!order) return reply.status(404).send({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } });
        if (!(await isAuthorizedContractorSide(order, req.user!.userId, prisma))) {
          return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized.' } });
        }
        await orderService.startRevision(id, req.user!.userId);
        return reply.status(200).send({ success: true, data: { message: 'Revision started.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /orders/:id/cancel ──────────────────────────────────────────────

  app.post('/orders/:id/cancel', { preHandler: [authenticate, requireCustomer] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const order = await orderService.cancelOrder(id, req.user!.userId);
      return reply.status(200).send({ success: true, data: { order } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /orders/:id/dispute-evidence ────────────────────────────────────
  // Multipart evidence upload for initial dispute filing. Returns blob_path.

  app.post(
    '/orders/:id/dispute-evidence',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      // Verify user is a party to the order
      const order = await prisma.order.findUnique({
        where: { id },
        select: { customer_id: true, contractor_user_id: true, company_id: true, executing_member_id: true },
      });
      if (!order) return handleError(reply, new AppError('ORDER_NOT_FOUND', 404));

      const isContractor = await isAuthorizedContractorSide(order, req.user!.userId, prisma);
      const isCustomer = order.customer_id === req.user!.userId;
      if (!isContractor && !isCustomer) {
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
        const blob_path = `dispute-evidence/${id}/${Date.now()}-${safeFilename}`;
        await uploadToBlob(blob_path, buffer, data.mimetype);

        return reply.status(200).send({ success: true, data: { blob_path, file_name: safeFilename } });
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

  // ─── GET /orders/:id/messages ─────────────────────────────────────────────

  app.get(
    '/orders/:id/messages',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const messages = await orderService.listMessages(id, req.user!.userId);
        return reply.status(200).send({ success: true, data: { messages } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /orders/:id/messages ────────────────────────────────────────────

  app.post(
    '/orders/:id/messages',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { body?: string };
      if (!body.body || body.body.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Message body is required' },
        });
      }
      if (body.body.trim().length > 4000) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Message too long (max 4000 chars)' },
        });
      }
      try {
        const message = await orderService.sendMessage(id, req.user!.userId, body.body.trim());
        return reply.status(201).send({ success: true, data: message });
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
            ...(parsed.data.outcome && { outcome: parsed.data.outcome }),
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

        // Phase 5: legacy executive payout removed. Determinations are advisory
        // only — admins act on dispute recommendations via the sanctions
        // endpoints, no platform-side fund movement.

        return reply.status(200).send({ success: true, data: { order, dispute } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /orders/:id/deliverables/upload ──────────────────────────────────
  // Uploads a file to Azure Blob and returns the blob_path.
  // Call this first, then POST /orders/:id/deliverables with the blob_path.

  app.post(
    '/orders/:id/deliverables/upload',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      const order = await prisma.order.findUnique({ where: { id } });
      if (!order) {
        return reply.status(404).send({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } });
      }
      if (!(await isAuthorizedContractorSide(order, req.user!.userId, prisma))) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized.' } });
      }
      if (order.company_order_status !== 'IN_PROGRESS' && order.company_order_status !== 'REVISION_REQUESTED') {
        return reply.status(422).send({ success: false, error: { code: 'ORDER_NOT_ACCEPTING_DELIVERABLES', message: 'Order is not accepting deliverables.' } });
      }

      try {
        const data = await req.file();
        if (!data) {
          return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded.' } });
        }

        const buffer = await data.toBuffer();
        if (buffer.length > 50 * 1024 * 1024) {
          return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'File must be under 50 MB.' } });
        }

        const safeFilename = data.filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
        const mimeType = data.mimetype || 'application/octet-stream';
        const blob_path = `deliverables/${id}/${req.user!.userId}/${Date.now()}-${safeFilename}`;

        await uploadToBlob(blob_path, buffer, mimeType);

        return reply.status(200).send({
          success: true,
          data: { blob_path, file_name: safeFilename, file_size_bytes: buffer.length, mime_type: mimeType },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /orders/:id/deliverables/:deliverableId/download ─────────────────
  // Streams a deliverable file through the API (no direct Azure URL exposed).

  app.get(
    '/orders/:id/deliverables/:deliverableId/download',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id, deliverableId } = req.params as { id: string; deliverableId: string };

      const order = await prisma.order.findUnique({ where: { id } });
      if (!order) return handleError(reply, new AppError('ORDER_NOT_FOUND', 404));

      const isContractor = await isAuthorizedContractorSide(order, req.user!.userId, prisma);
      const isCustomer = order.customer_id === req.user!.userId;
      if (!isContractor && !isCustomer) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized.' } });
      }

      const deliverable = await prisma.orderDeliverable.findUnique({ where: { id: deliverableId } });
      if (!deliverable || deliverable.order_id !== id) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Deliverable not found.' } });
      }
      if (!deliverable.blob_path) {
        return reply.status(404).send({ success: false, error: { code: 'FILE_NOT_AVAILABLE', message: 'No file attached to this deliverable.' } });
      }

      try {
        const { stream, contentType, contentLength } = await downloadBlobStream(deliverable.blob_path);
        reply.header('Content-Type', contentType ?? deliverable.mime_type ?? 'application/octet-stream');
        if (contentLength) reply.header('Content-Length', contentLength);
        reply.header('Content-Disposition', `attachment; filename="${deliverable.file_name ?? 'deliverable'}"`);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /orders/:id/activity ──────────────────────────────────────────────
  // Returns the full audit trail for an order — accessible to the order's
  // customer, any company member on the order, and platform/support admins.

  app.get(
    '/orders/:id/activity',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const userId = req.user!.userId;
      const accountType = req.user!.accountType;

      const adminTypes = ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'];

      // Load order with company membership info for access check
      const order = await prisma.order.findUnique({
        where: { id },
        select: {
          id: true,
          customer_id: true,
          company_id: true,
          executing_member_id: true,
          contractor_user_id: true,
        },
      });
      if (!order) {
        return reply.status(404).send({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } });
      }

      // Access control
      const isAdmin = adminTypes.includes(accountType);
      const isCustomer = order.customer_id === userId;
      const isAssignedContractor = order.contractor_user_id === userId || order.executing_member_id === userId;

      let isCompanyMember = false;
      if (!isAdmin && !isCustomer && !isAssignedContractor && order.company_id) {
        const membership = await prisma.companyMember.findFirst({
          where: { company_id: order.company_id, user_id: userId },
          select: { id: true },
        });
        isCompanyMember = !!membership;
      }

      if (!isAdmin && !isCustomer && !isAssignedContractor && !isCompanyMember) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized.' } });
      }

      // Collect related entity IDs so we can include their audit logs too —
      // invoices, payouts, disputes etc. live under different entity_type values
      // but are conceptually part of the order's activity.
      const [invoices, payouts, disputes, tenderInvoices] = await Promise.all([
        prisma.companyInvoice.findMany({
          where: { order_id: id },
          select: { id: true },
        }),
        prisma.companyPayoutRecord.findMany({
          where: { order_id: id },
          select: { id: true },
        }),
        prisma.dispute.findMany({
          where: { order_id: id },
          select: { id: true },
        }),
        // Tender contract invoices reference orders indirectly via tender_contract — skip if not joinable here
        Promise.resolve([] as { id: string }[]),
      ]);

      const orFilters: Array<{ entity_type: string; entity_id: string | { in: string[] } }> = [
        { entity_type: 'Order', entity_id: id },
      ];
      if (invoices.length > 0) {
        orFilters.push({ entity_type: 'CompanyInvoice', entity_id: { in: invoices.map((i) => i.id) } });
      }
      if (payouts.length > 0) {
        orFilters.push({ entity_type: 'CompanyPayoutRecord', entity_id: { in: payouts.map((p) => p.id) } });
      }
      if (disputes.length > 0) {
        orFilters.push({ entity_type: 'Dispute', entity_id: { in: disputes.map((d) => d.id) } });
      }
      if (tenderInvoices.length > 0) {
        orFilters.push({ entity_type: 'TenderContractInvoice', entity_id: { in: tenderInvoices.map((t) => t.id) } });
      }

      const logs = await prisma.auditLog.findMany({
        where: { OR: orFilters },
        orderBy: { timestamp: 'asc' },
        select: {
          id: true,
          action_type: true,
          actor_id: true,
          entity_type: true,
          entity_id: true,
          timestamp: true,
          metadata: true,
          ip_address: true,
        },
      });

      return reply.status(200).send({ success: true, data: { activity: logs } });
    },
  );

  // ─── GET /orders/:id/commission-invoice ───────────────────────────────────
  // Streams the platform commission invoice PDF for the contractor/company.
  // Accessible by the contractor (executing_member), company members, and admins.

  app.get(
    '/orders/:id/commission-invoice',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id: orderId } = req.params as { id: string };
      const { dl } = req.query as { dl?: string };
      try {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: {
            contractor_user_id: true,
            company_id: true,
            company_payout_record: {
              select: {
                commission_invoice_blob_path: true,
                commission_invoice_number: true,
              },
            },
          },
        });
        if (!order) {
          return reply.status(404).send({ success: false, error: { code: 'ORDER_NOT_FOUND' } });
        }

        const userId = req.user!.userId;
        const accountType = req.user!.accountType;
        const isAdmin = ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'].includes(accountType);
        const isContractor = order.contractor_user_id === userId;
        let isCompanyMember = false;
        if (!isContractor && order.company_id) {
          const member = await prisma.companyMember.findUnique({
            where: { company_id_user_id: { company_id: order.company_id, user_id: userId } },
            select: { status: true },
          });
          isCompanyMember = member?.status === 'ACTIVE';
        }
        if (!isAdmin && !isContractor && !isCompanyMember) {
          return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const blobPath = order.company_payout_record?.commission_invoice_blob_path;
        if (!blobPath) {
          return reply.status(404).send({
            success: false,
            error: { code: 'INVOICE_NOT_GENERATED', message: 'Commission invoice not yet available.' },
          });
        }

        const { stream, contentLength } = await downloadBlobStream(blobPath);
        const filename = order.company_payout_record?.commission_invoice_number ?? 'commission-invoice';
        reply.header('Content-Type', 'application/pdf');
        if (contentLength) reply.header('Content-Length', contentLength);
        reply.header('Content-Disposition', `${dl === '1' ? 'attachment' : 'inline'}; filename="${filename}.pdf"`);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ────────────────────────────────────────────────────────────────────────
  // ─── Direct-payment endpoints (Phase 2) ─────────────────────────────────
  // Active for orders created on/after PlatformConfig.direct_payment_cutover_at.
  // Pre-cutover orders continue to use the legacy /orders/:id/payment/create
  // (Stripe escrow) endpoint above; the service throws LEGACY_ESCROW_FLOW for
  // those, which the customer payment page detects and falls back accordingly.
  // ────────────────────────────────────────────────────────────────────────

  // ─── GET /orders/:id/payment-options ──────────────────────────────────────
  // Customer-side: returns the supplier's accepted payment methods + the
  // amount due. Used to render the new direct-payment page.
  app.get(
    '/orders/:id/payment-options',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const result = await engagementPaymentService.getOrderPaymentOptions(id, req.user!.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /orders/:id/payment/report ──────────────────────────────────────
  // Customer-side: "I have paid". Multipart body with optional evidence file
  // + payment_method, payment_reference, payment_amount_aud form fields.
  app.post(
    '/orders/:id/payment/report',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const data = await req.file();
        if (!data) {
          // Allow no file — some payment rails (Stripe-link) auto-confirm and
          // the customer just attests. Body must be JSON in that case.
          const parsed = reportPaymentSchema.safeParse(req.body);
          if (!parsed.success) return validationError(reply, parsed.error.issues);
          const order = await engagementPaymentService.reportOrderPayment(
            id,
            req.user!.userId,
            parsed.data,
          );
          return reply.status(200).send({ success: true, data: order });
        }

        // Multipart path: fields come back as { fieldname: { value: '...' } }
        const rawFields = (data.fields ?? {}) as Record<string, { value?: unknown }>;
        const fieldData = {
          payment_method: rawFields.payment_method?.value,
          payment_reference: rawFields.payment_reference?.value,
          payment_amount_aud: rawFields.payment_amount_aud?.value,
        };
        const parsed = reportPaymentSchema.safeParse(fieldData);
        if (!parsed.success) return validationError(reply, parsed.error.issues);

        const ALLOWED_MIME = [
          'image/jpeg', 'image/jpg', 'image/png',
          'application/pdf',
        ];
        if (!ALLOWED_MIME.includes(data.mimetype)) {
          return reply.status(415).send({
            success: false,
            error: { code: 'INVALID_FILE_TYPE', message: 'Only PDF, JPG, PNG accepted.' },
          });
        }
        const buffer = await data.toBuffer();
        if (buffer.length > 10 * 1024 * 1024) {
          return reply.status(413).send({
            success: false,
            error: { code: 'FILE_TOO_LARGE', message: 'Evidence must be under 10 MB.' },
          });
        }

        const order = await engagementPaymentService.reportOrderPayment(
          id,
          req.user!.userId,
          {
            ...parsed.data,
            evidence_file: {
              buffer,
              file_name: data.filename,
              content_type: data.mimetype,
            },
          },
        );
        return reply.status(200).send({ success: true, data: order });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /orders/:id/payment/confirm ─────────────────────────────────────
  // Supplier-side: "Yes, payment received."
  app.post(
    '/orders/:id/payment/confirm',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const order = await engagementPaymentService.confirmOrderPayment(id, req.user!.userId);
        return reply.status(200).send({ success: true, data: order });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /orders/:id/payment/dispute ─────────────────────────────────────
  // Supplier-side: rejects the customer's evidence (e.g. wrong account).
  // Resets the order to AWAITING_PAYMENT so the customer can resubmit.
  app.post(
    '/orders/:id/payment/dispute',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = disputeEvidenceSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);
      try {
        const order = await engagementPaymentService.disputeOrderEvidence(
          id,
          req.user!.userId,
          parsed.data.reason,
        );
        return reply.status(200).send({ success: true, data: order });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /orders/:id/payment/evidence ─────────────────────────────────────
  // Stream the customer's reported-payment evidence file. Both customer (who
  // uploaded it) and supplier (who needs to verify) can read.
  app.get(
    '/orders/:id/payment/evidence',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { dl } = req.query as { dl?: string };
      try {
        const order = await prisma.order.findUnique({
          where: { id },
          select: {
            customer_id: true,
            contractor_user_id: true,
            executing_member_id: true,
            company_id: true,
            payment_evidence_blob_path: true,
            payment_evidence_file_name: true,
          },
        });
        if (!order) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        const userId = req.user!.userId;
        let isCompanyAdmin = false;
        if (order.company_id) {
          const c = await prisma.consultingCompany.findUnique({
            where: { id: order.company_id },
            select: { primary_admin_id: true },
          });
          isCompanyAdmin = c?.primary_admin_id === userId;
        }
        const allowed =
          order.customer_id === userId ||
          order.contractor_user_id === userId ||
          order.executing_member_id === userId ||
          isCompanyAdmin;
        if (!allowed) {
          return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }
        if (!order.payment_evidence_blob_path) {
          return reply
            .status(404)
            .send({ success: false, error: { code: 'NO_EVIDENCE', message: 'No evidence uploaded.' } });
        }
        const { stream, contentType, contentLength } = await downloadBlobStream(
          order.payment_evidence_blob_path,
        );
        reply.header('Content-Type', contentType ?? 'application/octet-stream');
        if (contentLength) reply.header('Content-Length', contentLength);
        const disposition = dl === '1' ? 'attachment' : 'inline';
        reply.header(
          'Content-Disposition',
          `${disposition}; filename="${order.payment_evidence_file_name ?? 'evidence'}"`,
        );
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /orders/:id/payment/evidence-history ─────────────────────────────
  // Returns the full append-only list of every evidence the customer has
  // submitted on this order, with each entry's status (PENDING/CONFIRMED/
  // REJECTED) and any dispute reason. Customer and supplier both see the
  // same list — one source of truth that survives confirm/dispute cycles.
  app.get(
    '/orders/:id/payment/evidence-history',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const order = await prisma.order.findUnique({
          where: { id },
          select: {
            customer_id: true,
            contractor_user_id: true,
            executing_member_id: true,
            company_id: true,
            payment_evidence_history: true,
          },
        });
        if (!order) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        const userId = req.user!.userId;
        let isCompanyAdmin = false;
        if (order.company_id) {
          const c = await prisma.consultingCompany.findUnique({
            where: { id: order.company_id },
            select: { primary_admin_id: true },
          });
          isCompanyAdmin = c?.primary_admin_id === userId;
        }
        const allowed =
          order.customer_id === userId ||
          order.contractor_user_id === userId ||
          order.executing_member_id === userId ||
          isCompanyAdmin;
        if (!allowed) {
          return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }
        const history = Array.isArray(order.payment_evidence_history)
          ? order.payment_evidence_history
          : [];
        return reply.status(200).send({ success: true, data: history });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /orders/:id/payment/evidence/:entryId ────────────────────────────
  // Stream a specific historical evidence file by its history entry id. Used
  // by the "Payment evidence" card on customer + company order pages so users
  // can open older (rejected) evidence as well as the current one.
  app.get(
    '/orders/:id/payment/evidence/:entryId',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id, entryId } = req.params as { id: string; entryId: string };
      const { dl } = req.query as { dl?: string };
      try {
        const order = await prisma.order.findUnique({
          where: { id },
          select: {
            customer_id: true,
            contractor_user_id: true,
            executing_member_id: true,
            company_id: true,
            payment_evidence_history: true,
          },
        });
        if (!order) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        const userId = req.user!.userId;
        let isCompanyAdmin = false;
        if (order.company_id) {
          const c = await prisma.consultingCompany.findUnique({
            where: { id: order.company_id },
            select: { primary_admin_id: true },
          });
          isCompanyAdmin = c?.primary_admin_id === userId;
        }
        const allowed =
          order.customer_id === userId ||
          order.contractor_user_id === userId ||
          order.executing_member_id === userId ||
          isCompanyAdmin;
        if (!allowed) {
          return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }
        const history = Array.isArray(order.payment_evidence_history)
          ? (order.payment_evidence_history as Array<{
              id?: string;
              blob_path?: string | null;
              file_name?: string | null;
            }>)
          : [];
        const entry = history.find((e) => e.id === entryId);
        if (!entry?.blob_path) {
          return reply
            .status(404)
            .send({ success: false, error: { code: 'NO_EVIDENCE', message: 'Evidence not found.' } });
        }
        const { stream, contentType, contentLength } = await downloadBlobStream(entry.blob_path);
        reply.header('Content-Type', contentType ?? 'application/octet-stream');
        if (contentLength) reply.header('Content-Length', contentLength);
        const disposition = dl === '1' ? 'attachment' : 'inline';
        reply.header(
          'Content-Disposition',
          `${disposition}; filename="${entry.file_name ?? 'evidence'}"`,
        );
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
