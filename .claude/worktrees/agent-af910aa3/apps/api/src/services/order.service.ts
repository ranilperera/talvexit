import type { Order, WorkLog, OrderDeliverable, ChangeRequest, Dispute, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import type {
  CreateOrderInput,
  ListOrdersInput,
  CreateWorkLogInput,
  AddDeliverableInput,
  RequestRevisionInput,
  RaiseDisputeInput,
  CreateChangeRequestInput,
  DecideChangeRequestInput,
} from '@onys/shared';
import { convertToAUD } from '../utils/currency.js';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';
import { transitionOrder, getOrderSlaStatus } from './order-state-machine.service.js';

// ─── Email payload type ───────────────────────────────────────────────────────

type OrderEmailPayload = {
  type: string;
  to?: string;
  order_id?: string;
  [key: string]: unknown;
};

// ─── Enriched order type ──────────────────────────────────────────────────────

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    customer: { select: { id: true; full_name: true; email: true } };
    contractor_user: { select: { id: true; full_name: true; email: true } };
    contractor_profile: true;
    task: { select: { id: true; title: true; domain: true } };
    work_logs: { include: { user: { select: { id: true; full_name: true } } } };
    deliverables: true;
    change_requests: {
      include: { raised_by_user: { select: { id: true; full_name: true } } };
    };
    scope_modification_requests: {
      include: {
        requested_by_user: { select: { id: true; full_name: true } };
        responded_by_user: { select: { id: true; full_name: true } };
      };
    };
    dispute: true;
  };
}>;

type EnrichedOrder = OrderWithRelations & {
  sla_status: ReturnType<typeof getOrderSlaStatus>;
  total_hours_logged: number;
};

// ─── OrderService ─────────────────────────────────────────────────────────────

export class OrderService {
  private readonly credentialPurgeQueue: Queue;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<OrderEmailPayload>,
  ) {
    this.credentialPurgeQueue = new Queue('credential-purge', {
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    });
  }

  // ─── METHOD 1: createOrder ──────────────────────────────────────────────────

  async createOrder(
    customerId: string,
    data: CreateOrderInput,
    _meta: { ip: string; userAgent: string },
  ): Promise<Order> {
    // 1. Verify user exists and is CUSTOMER
    const customerUser = await this.prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, full_name: true, account_type: true },
    });
    if (!customerUser) throw new AppError('USER_NOT_FOUND', 404);
    if (customerUser.account_type !== 'CUSTOMER') {
      throw new AppError('WRONG_ACCOUNT_TYPE', 403, 'Only CUSTOMER accounts can create orders');
    }

    const now = new Date();
    let scopeSnapshot: Record<string, unknown>;
    let origin: 'CATALOG_TASK' | 'AI_SCOPED';
    let contractorProfileId: string | null = null;
    let contractorUserId: string | null = null;
    let taskId: string | null = null;
    let contractorEmail: string | null = null;

    // 2a. Catalog task path
    if (data.task_id) {
      taskId = data.task_id;

      const task = await this.prisma.task.findUnique({
        where: { id: data.task_id },
        include: {
          contractor_profile: true,
        },
      });

      if (!task) throw new AppError('TASK_NOT_FOUND', 404);
      if (task.status !== 'PUBLISHED') throw new AppError('TASK_NOT_AVAILABLE', 422);

      const profile = task.contractor_profile;
      if (!profile || profile.status !== 'ACTIVE') {
        throw new AppError('CONTRACTOR_NOT_AVAILABLE', 422, 'This expert is no longer available');
      }

      scopeSnapshot = {
        title: task.title,
        domain: task.domain,
        objective: task.objective,
        in_scope: task.in_scope,
        out_of_scope: task.out_of_scope,
        assumptions: task.assumptions,
        prerequisites: task.prerequisites,
        deliverables: task.deliverables,
        currency: task.currency,
        price: Number(task.price),
        price_aud: Number(task.price_aud),
        hours_min: task.hours_min,
        hours_max: task.hours_max,
        milestone_count: task.milestone_count,
      };

      origin = 'CATALOG_TASK';
      contractorProfileId = profile.id;
      contractorUserId = profile.user_id;

      // Get contractor email for notification
      const contractorUser = await this.prisma.user.findUnique({
        where: { id: profile.user_id },
        select: { email: true },
      });
      contractorEmail = contractorUser?.email ?? null;

      // Increment task active_order_count
      void this.prisma.task
        .update({ where: { id: task.id }, data: { active_order_count: { increment: 1 } } })
        .catch(() => {});
    } else {
      // 2b. AI scoped path (M08 — not yet implemented)
      throw new AppError('FEATURE_NOT_AVAILABLE', 501, 'AI scoping path not yet available (M08)');
    }

    // 3. Calculate price_aud
    const rawPrice = scopeSnapshot.price as number;
    const currency = scopeSnapshot.currency as string;
    const priceAud = currency === 'AUD' ? rawPrice : convertToAUD(rawPrice, currency);

    // 4. Calculate tax and total (10% GST)
    const taxAud = Math.round(priceAud * 0.1 * 100) / 100;
    const totalAud = Math.round(priceAud * 1.1 * 100) / 100;

    // 5 & 6. Create Order — CATALOG_TASK starts at SCOPED with SLA timestamps
    const initialHistory = [
      {
        from: 'PENDING_APPROVAL',
        to: origin === 'CATALOG_TASK' ? 'SCOPED' : 'PENDING_APPROVAL',
        at: now.toISOString(),
        actor_id: customerId,
        reason: null,
      },
    ];

    const order = await this.prisma.order.create({
      data: {
        origin,
        task_id: taskId ?? null,
        scoping_job_id: data.scoping_job_id ?? null,
        customer_id: customerId,
        contractor_profile_id: contractorProfileId ?? null,
        contractor_user_id: contractorUserId ?? null,
        scope_snapshot: scopeSnapshot as Prisma.InputJsonValue,
        scope_version: 1,
        currency: scopeSnapshot.currency as 'AUD' | 'USD' | 'GBP' | 'EUR' | 'NZD' | 'SGD' | 'CAD',
        price: new Prisma.Decimal(rawPrice),
        price_aud: new Prisma.Decimal(priceAud),
        tax_amount_aud: new Prisma.Decimal(taxAud),
        total_amount_aud: new Prisma.Decimal(totalAud),
        ...(data.environment_details !== undefined && {
          environment_details: data.environment_details as Prisma.InputJsonValue,
        }),
        status: origin === 'CATALOG_TASK' ? 'SCOPED' : 'PENDING_APPROVAL',
        ...(origin === 'CATALOG_TASK' && {
          scoped_at: now,
          accept_deadline_at: new Date(now.getTime() + 48 * 60 * 60 * 1000),
        }),
        status_history: initialHistory as Prisma.InputJsonValue,
      },
    });

    // 8. Write audit
    void writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'ORDER_CREATED',
      entityType: 'Order',
      entityId: order.id,
      metadata: { origin, task_id: taskId, customer_id: customerId, contractor_profile_id: contractorProfileId },
    });

    // 9. Queue email to contractor (catalog path only)
    if (contractorEmail && origin === 'CATALOG_TASK') {
      void this.emailQueue
        .add('new-order-received', {
          type: 'new-order-received',
          to: contractorEmail,
          order_id: order.id,
          customer_name: customerUser.full_name,
          task_title: scopeSnapshot.title as string,
        })
        .catch(() => {});
    }

    return order;
  }

  // ─── METHOD 2: getOrderById ─────────────────────────────────────────────────

  async getOrderById(orderId: string, requestingUserId: string): Promise<EnrichedOrder> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { id: true, full_name: true, email: true } },
        contractor_user: { select: { id: true, full_name: true, email: true } },
        contractor_profile: true,
        task: { select: { id: true, title: true, domain: true } },
        work_logs: {
          include: { user: { select: { id: true, full_name: true } } },
          orderBy: { started_at: 'asc' },
        },
        deliverables: { orderBy: { created_at: 'desc' } },
        change_requests: {
          include: { raised_by_user: { select: { id: true, full_name: true } } },
          orderBy: { created_at: 'desc' },
        },
        scope_modification_requests: {
          include: {
            requested_by_user: { select: { id: true, full_name: true } },
            responded_by_user: { select: { id: true, full_name: true } },
          },
          orderBy: { round_number: 'asc' },
        },
        dispute: true,
      },
    });

    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);

    // 2. Verify access
    const isCustomer = order.customer_id === requestingUserId;
    const isContractor = order.contractor_user_id === requestingUserId;
    if (!isCustomer && !isContractor) throw new AppError('FORBIDDEN', 403);

    // 3. Attach SLA status
    const sla_status = getOrderSlaStatus(order);

    // 4. Compute total hours logged
    const total_hours_logged = order.work_logs.reduce(
      (sum, wl) => sum + Number(wl.hours_worked),
      0,
    );

    return { ...order, sla_status, total_hours_logged };
  }

  // ─── METHOD 3: listOrders ───────────────────────────────────────────────────

  async listOrders(
    userId: string,
    params: ListOrdersInput,
  ): Promise<{ orders: Order[]; next_cursor: string | null }> {
    const { status, role, cursor, limit } = params;

    const where: Prisma.OrderWhereInput = {
      ...(status !== undefined && { status }),
      ...(role === 'as_customer'
        ? { customer_id: userId }
        : role === 'as_expert'
          ? { contractor_user_id: userId }
          : { OR: [{ customer_id: userId }, { contractor_user_id: userId }] }),
    };

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: {
        customer: { select: { id: true, full_name: true } },
        contractor_user: { select: { id: true, full_name: true } },
        task: { select: { id: true, title: true, domain: true } },
      },
    });

    let next_cursor: string | null = null;
    if (orders.length > limit) {
      orders.pop();
      next_cursor = orders[orders.length - 1]?.id ?? null;
    }

    return { orders, next_cursor };
  }

  // ─── METHOD 4: addWorkLog ───────────────────────────────────────────────────

  async addWorkLog(
    orderId: string,
    contractorUserId: string,
    data: CreateWorkLogInput,
  ): Promise<WorkLog> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.contractor_user_id !== contractorUserId) throw new AppError('FORBIDDEN', 403);
    if (order.status !== 'IN_PROGRESS') {
      throw new AppError(
        'ORDER_NOT_IN_PROGRESS',
        422,
        'Work logs can only be added when order is IN_PROGRESS',
      );
    }

    const workLog = await this.prisma.workLog.create({
      data: {
        order_id: orderId,
        logged_by: contractorUserId,
        hours_worked: new Prisma.Decimal(data.hours_worked),
        description: data.description,
        started_at: new Date(data.started_at),
      },
    });

    void writeAudit(this.prisma, {
      actorId: contractorUserId,
      actionType: 'WORK_LOG_ADDED',
      entityType: 'Order',
      entityId: orderId,
      metadata: { hours_worked: data.hours_worked, logged_by: contractorUserId },
    });

    return workLog;
  }

  // ─── METHOD 5: addDeliverable ───────────────────────────────────────────────

  async addDeliverable(
    orderId: string,
    contractorUserId: string,
    data: AddDeliverableInput,
  ): Promise<OrderDeliverable> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.contractor_user_id !== contractorUserId) throw new AppError('FORBIDDEN', 403);
    if (order.status !== 'IN_PROGRESS' && order.status !== 'REVISION_REQUESTED') {
      throw new AppError('ORDER_NOT_ACCEPTING_DELIVERABLES', 422);
    }

    const deliverable = await this.prisma.orderDeliverable.create({
      data: {
        order_id: orderId,
        uploaded_by: contractorUserId,
        file_name: data.file_name,
        blob_path: data.blob_path,
        file_size_bytes: data.file_size_bytes,
        mime_type: data.mime_type ?? null,
        description: data.description ?? null,
      },
    });

    void writeAudit(this.prisma, {
      actorId: contractorUserId,
      actionType: 'DELIVERABLE_UPLOADED',
      entityType: 'Order',
      entityId: orderId,
      metadata: { file_name: data.file_name, uploaded_by: contractorUserId },
    });

    return deliverable;
  }

  // ─── METHOD 6: submitDeliverables ──────────────────────────────────────────

  async submitDeliverables(orderId: string, contractorUserId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: { select: { email: true } } },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.contractor_user_id !== contractorUserId) throw new AppError('FORBIDDEN', 403);

    const updatedOrder = await transitionOrder(
      this.prisma,
      orderId,
      'PENDING_REVIEW',
      contractorUserId,
    );

    void this.emailQueue
      .add('deliverables-submitted', {
        type: 'deliverables-submitted',
        to: order.customer.email,
        order_id: orderId,
        review_deadline: updatedOrder.review_deadline_at?.toISOString(),
        view_url: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/orders/${orderId}`,
      })
      .catch(() => {});

    return updatedOrder;
  }

  // ─── METHOD 7: approveDeliverables ─────────────────────────────────────────

  async approveDeliverables(orderId: string, customerId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { contractor_user: { select: { email: true } } },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);

    const updatedOrder = await transitionOrder(
      this.prisma,
      orderId,
      'COMPLETED',
      customerId,
    );

    // Decrement task active_order_count and increment order_count
    if (order.task_id) {
      void this.prisma.task
        .update({
          where: { id: order.task_id },
          data: {
            active_order_count: { decrement: 1 },
            order_count: { increment: 1 },
          },
        })
        .catch(() => {});
    }

    // Increment contractor completed_orders_count
    if (order.contractor_profile_id) {
      void this.prisma.contractorProfile
        .update({
          where: { id: order.contractor_profile_id },
          data: { completed_orders_count: { increment: 1 } },
        })
        .catch(() => {});
    }

    // Enqueue credential purge with 48-hour delay (M10)
    const fortyEightHours = 48 * 60 * 60 * 1000;
    void this.credentialPurgeQueue
      .add(
        'purge-credentials',
        {
          order_id: orderId,
          triggered_by: 'order_completed',
          scheduled_for: new Date(Date.now() + fortyEightHours).toISOString(),
        },
        {
          delay: fortyEightHours,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10 * 60 * 1000 },
        },
      )
      .catch((err: unknown) => {
        console.error(`[order] Failed to enqueue credential purge for ${orderId}:`, err);
      });

    if (order.contractor_user?.email) {
      void this.emailQueue
        .add('order-completed', {
          type: 'order-completed-payout-pending',
          to: order.contractor_user.email,
          order_id: orderId,
        })
        .catch(() => {});
    }

    void writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'ORDER_APPROVED',
      entityType: 'Order',
      entityId: orderId,
      metadata: { customer_id: customerId },
    });

    return updatedOrder;
  }

  // ─── METHOD 8: requestRevision ─────────────────────────────────────────────

  async requestRevision(
    orderId: string,
    customerId: string,
    data: RequestRevisionInput,
  ): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { contractor_user: { select: { email: true } } },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);

    const updatedOrder = await transitionOrder(
      this.prisma,
      orderId,
      'REVISION_REQUESTED',
      customerId,
      { reason: data.reason },
    );

    if (order.contractor_user?.email) {
      void this.emailQueue
        .add('revision-requested', {
          type: 'revision-requested',
          to: order.contractor_user.email,
          order_id: orderId,
          reason: data.reason,
          deadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        })
        .catch(() => {});
    }

    return updatedOrder;
  }

  // ─── METHOD 9: raiseDispute ─────────────────────────────────────────────────

  async raiseDispute(
    orderId: string,
    raisingUserId: string,
    data: RaiseDisputeInput,
  ): Promise<{ order: Order; dispute: Dispute }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { full_name: true, email: true } },
        contractor_user: { select: { email: true } },
        dispute: true,
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);

    const isCustomer = order.customer_id === raisingUserId;
    const isContractor = order.contractor_user_id === raisingUserId;
    if (!isCustomer && !isContractor) throw new AppError('FORBIDDEN', 403);

    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      throw new AppError(
        'DISPUTE_NOT_ALLOWED',
        422,
        `Cannot raise dispute on ${order.status} order`,
      );
    }

    if (order.dispute) throw new AppError('DISPUTE_EXISTS', 409);

    // Transition order to DISPUTED then create Dispute record
    // Note: done sequentially (not in a transaction) due to PrismaClient/TransactionClient
    // type distinction — atomicity improvement deferred to production hardening
    const updatedOrder = await transitionOrder(
      this.prisma,
      orderId,
      'DISPUTED',
      raisingUserId,
    );

    const dispute = await this.prisma.dispute.create({
      data: {
        order_id: orderId,
        raised_by_user_id: raisingUserId,
        grounds: data.grounds,
        description: data.description,
        evidence_blob_paths: data.evidence_blob_paths,
      },
    });

    // Queue admin notification
    void this.emailQueue
      .add('dispute-admin', {
        type: 'dispute-raised-admin',
        order_id: orderId,
        raised_by: isCustomer ? order.customer.full_name : (order.contractor_user?.email ?? 'contractor'),
        grounds: data.grounds,
      })
      .catch(() => {});

    // Queue notification to the OTHER party
    const otherPartyEmail = isCustomer
      ? order.contractor_user?.email
      : order.customer.email;
    if (otherPartyEmail) {
      void this.emailQueue
        .add('dispute-notice', {
          type: 'dispute-raised-notice',
          to: otherPartyEmail,
          order_id: orderId,
          grounds: data.grounds,
        })
        .catch(() => {});
    }

    return { order: updatedOrder, dispute };
  }

  // ─── METHOD 10: createChangeRequest ────────────────────────────────────────

  async createChangeRequest(
    orderId: string,
    contractorUserId: string,
    data: CreateChangeRequestInput,
  ): Promise<ChangeRequest> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: { select: { email: true } } },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.contractor_user_id !== contractorUserId) {
      throw new AppError('CONTRACTOR_ONLY', 403, 'Only the assigned contractor can raise a change request');
    }
    if (order.status !== 'IN_PROGRESS') {
      throw new AppError('ORDER_NOT_IN_PROGRESS', 422);
    }

    // Check no pending change request
    const existing = await this.prisma.changeRequest.findFirst({
      where: { order_id: orderId, status: 'PENDING' },
    });
    if (existing) {
      throw new AppError('CHANGE_REQUEST_PENDING', 409, 'A change request is already awaiting decision');
    }

    const additionalCostAud = convertToAUD(data.additional_cost, order.currency);

    const cr = await this.prisma.changeRequest.create({
      data: {
        order_id: orderId,
        raised_by_user_id: contractorUserId,
        description: data.description,
        unforeseen_finding: data.unforeseen_finding,
        additional_hours: data.additional_hours,
        additional_cost: new Prisma.Decimal(data.additional_cost),
        additional_cost_aud: new Prisma.Decimal(additionalCostAud),
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });

    void this.emailQueue
      .add('change-request', {
        type: 'change-request-received',
        to: order.customer.email,
        order_id: orderId,
        additional_hours: data.additional_hours,
        additional_cost: data.additional_cost,
        currency: order.currency,
        unforeseen_finding: data.unforeseen_finding,
      })
      .catch(() => {});

    void writeAudit(this.prisma, {
      actorId: contractorUserId,
      actionType: 'CHANGE_REQUEST_RAISED',
      entityType: 'Order',
      entityId: orderId,
      metadata: { additional_hours: data.additional_hours, additional_cost_aud: additionalCostAud },
    });

    return cr;
  }

  // ─── METHOD 11: decideChangeRequest ────────────────────────────────────────

  async decideChangeRequest(
    orderId: string,
    changeRequestId: string,
    customerId: string,
    data: DecideChangeRequestInput,
  ): Promise<ChangeRequest> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { contractor_user: { select: { email: true } } },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);

    const cr = await this.prisma.changeRequest.findUnique({
      where: { id: changeRequestId },
    });
    if (!cr || cr.order_id !== orderId) throw new AppError('CHANGE_REQUEST_NOT_FOUND', 404);
    if (cr.status !== 'PENDING') throw new AppError('CHANGE_REQUEST_ALREADY_DECIDED', 409);

    const now = new Date();
    if (cr.expires_at < now) throw new AppError('CHANGE_REQUEST_EXPIRED', 422);

    const updatedCr = await this.prisma.changeRequest.update({
      where: { id: changeRequestId },
      data: {
        status: data.decision === 'APPROVE' ? 'APPROVED' : 'DECLINED',
        decided_by_user_id: customerId,
        decision_notes: data.decision_notes ?? null,
        decided_at: now,
      },
    });

    // If approved, update order price and scope_snapshot hours_max
    if (data.decision === 'APPROVE') {
      const newPriceAud = Number(order.price_aud) + Number(cr.additional_cost_aud);
      const newPrice = Number(order.price) + Number(cr.additional_cost);
      const newTotalAud = Math.round(newPriceAud * 1.1 * 100) / 100;

      const currentSnapshot = order.scope_snapshot as Record<string, unknown>;
      const currentHoursMax = typeof currentSnapshot.hours_max === 'number' ? currentSnapshot.hours_max : 0;
      const updatedSnapshot = {
        ...currentSnapshot,
        hours_max: currentHoursMax + cr.additional_hours,
      };

      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          price: new Prisma.Decimal(newPrice),
          price_aud: new Prisma.Decimal(newPriceAud),
          total_amount_aud: new Prisma.Decimal(newTotalAud),
          scope_snapshot: updatedSnapshot as Prisma.InputJsonValue,
        },
      });

      void writeAudit(this.prisma, {
        actorId: customerId,
        actionType: 'CHANGE_REQUEST_APPROVED',
        entityType: 'Order',
        entityId: orderId,
        metadata: {
          new_price_aud: newPriceAud,
          new_hours_max: currentHoursMax + cr.additional_hours,
        },
      });
    }

    if (order.contractor_user?.email) {
      void this.emailQueue
        .add('change-request-decided', {
          type: 'change-request-decided',
          to: order.contractor_user.email,
          decision: data.decision,
          order_id: orderId,
        })
        .catch(() => {});
    }

    return updatedCr;
  }
}
