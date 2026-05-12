import type { Order, WorkLog, OrderDeliverable, ChangeRequest, Dispute, PrismaClient, CompanyOrderStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

// Values that are valid for the CompanyOrderStatus Prisma enum
const COMPANY_STATUS_SET = new Set<string>([
  'BOOKED', 'PROPOSAL_DRAFT', 'PROPOSAL_SENT', 'PROPOSAL_CHANGES_REQUESTED',
  'PO_GENERATED', 'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED',
  'DELIVERABLES_ACCEPTED', 'INVOICE_SENT', 'BANK_TRANSFER_PENDING', 'PAYMENT_RECEIVED', 'PAYOUT_PENDING',
  'PAYOUT_PROCESSING', 'COMPLETED', 'DISPUTED', 'CANCELLED',
]);
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
import { decideGstTreatment } from '@onys/shared';
import { convertToAUD } from '../utils/currency.js';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';
import { emailUrls } from '../utils/urls.js';
import { transitionOrder, getOrderSlaStatus, isAuthorizedContractorSide } from './order-state-machine.service.js';
import type { NotificationService } from './notification.service.js';
import {
  loadOrderParties,
  notifyOrderCreated,
  notifyOrderSubmitted,
  notifyOrderRevisionRequested,
  notifyOrderCompleted,
} from './order-notifications.js';

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
    company: { select: { id: true; company_name: true; logo_blob_path: true } };
    executing_member: { select: { id: true; full_name: true } };
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
    company_invoice: {
      select: { id: true; invoice_number: true; total_aud: true; status: true };
    };
    company_payout_record: {
      select: { id: true; receipt_blob_path: true; status: true };
    };
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
    private readonly notificationService: NotificationService,
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
    let companyId: string | null = null;
    let taskId: string | null = null;
    let contractorEmail: string | null = null;
    let companyNotificationTarget: { adminId: string; companyName: string; taskTitle: string } | null = null;
    // Supplier GST + country resolved per branch (catalog vs AI-scoped).
    // Used by decideGstTreatment to flag cross-border supply.
    let supplierGstRegistered = false;
    let supplierCountry: string | null = null;

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

      // Resolve supplier GST + country for the GST decision below.
      if (task.company_id) {
        // Company-owned task — contractor_user will be set when a member is assigned
        companyId = task.company_id;
        contractorProfileId = null;
        contractorUserId = null;

        // Prepare notification for company primary admin
        const company = await this.prisma.consultingCompany.findUnique({
          where: { id: task.company_id },
          select: {
            primary_admin_id: true, company_name: true,
            gst_registered: true, billing_country: true,
          },
        });
        if (company) {
          companyNotificationTarget = {
            adminId: company.primary_admin_id,
            companyName: company.company_name,
            taskTitle: task.title,
          };
          supplierGstRegistered = company.gst_registered;
          supplierCountry = company.billing_country ?? null;
        }
      } else {
        // Individual contractor-owned task
        const profile = task.contractor_profile;
        if (!profile || profile.status !== 'ACTIVE') {
          throw new AppError('CONTRACTOR_NOT_AVAILABLE', 422, 'This expert is no longer available');
        }
        contractorProfileId = profile.id;
        contractorUserId = profile.user_id;

        // Get contractor email + GST + country for notification + tax decision
        const contractorUser = await this.prisma.user.findUnique({
          where: { id: profile.user_id },
          select: { email: true, gst_registered: true, billing_country: true },
        });
        contractorEmail = contractorUser?.email ?? null;
        supplierGstRegistered = contractorUser?.gst_registered ?? false;
        supplierCountry = contractorUser?.billing_country ?? null;
      }

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

    // 4. Calculate tax via shared decideGstTreatment. Single source of
    // truth — the same function the invoice flows call. GST is charged
    // only when supplier is AU GST-registered AND supply is domestic.
    const customerForTax = await this.prisma.user.findUnique({
      where: { id: customerId },
      select: { billing_country: true },
    });
    const customerCountry = customerForTax?.billing_country ?? null;
    const _orderGstDecision = decideGstTreatment({
      issuer_country: supplierCountry,
      issuer_gst_registered: supplierGstRegistered,
      recipient_country: customerCountry,
      amount_ex_gst_cents: Math.round(priceAud * 100),
    });
    const taxAud = _orderGstDecision.gst_amount_cents / 100;
    const totalAud = Math.round((priceAud + taxAud) * 100) / 100;

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
        company_id: companyId ?? null,
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
        // ALL orders use the uniform workflow (BOOKED → Proposal → PO → IN_PROGRESS → …)
        company_order_status: 'BOOKED',
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

    // 9. Fire order-created notifications (in-app + email).
    // Centralised in order-notifications.ts so all order alerts share copy.
    if (origin === 'CATALOG_TASK') {
      if (contractorEmail) {
        // Individual contractor — they get the alert directly
        const ctx = await loadOrderParties(this.prisma, order.id);
        if (ctx) {
          await notifyOrderCreated(this.notificationService, ctx).catch((err: unknown) => {
            console.error('[order-events] notifyOrderCreated failed:', err);
          });
        }
      } else if (companyNotificationTarget) {
        // Company order — notify the primary admin to assign a member.
        // Stays as plain in-app + email (admin assignment is company-specific UX).
        const adminUser = await this.prisma.user.findUnique({
          where: { id: companyNotificationTarget.adminId },
          select: { id: true, email: true },
        });
        if (adminUser) {
          await this.notificationService
            .notify({
              userId: adminUser.id,
              category: 'ORDER',
              title: 'New order needs a team-member assignment',
              body: `${customerUser.full_name} placed an order for "${companyNotificationTarget.taskTitle}". Assign a team member to start work.`,
              linkUrl: `/contractor/orders/${order.id}`,
              metadata: { order_id: order.id, event: 'order.created.company' },
              email: {
                jobName: 'company-order-needs-assignment',
                payload: {
                  type: 'company-order-needs-assignment',
                  to: adminUser.email,
                  order_id: order.id,
                  company_name: companyNotificationTarget.companyName,
                  task_title: companyNotificationTarget.taskTitle,
                  customer_name: customerUser.full_name,
                  assign_url: emailUrls.contractorOrder(order.id),
                },
              },
            })
            .catch((err: unknown) => {
              console.error('[order-events] company assignment notify failed:', err);
            });
        }
      }
    }

    return order;
  }

  // ─── METHOD 2: getOrderById ─────────────────────────────────────────────────

  async getOrderById(orderId: string, requestingUserId: string): Promise<EnrichedOrder> {
    // billing_country, gst_registered, and abn are returned on every party
    // so the client-side PricePreview can call decideGstTreatment from
    // @onys/shared with the right inputs (cross-border supply, supplier
    // GST status, etc.). The previous shape only carried name + email —
    // see docs/tax-invoicing-payment-analysis.html §8.1.
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: {
            id: true, full_name: true, email: true,
            billing_country: true, gst_registered: true, abn: true,
          },
        },
        contractor_user: {
          select: {
            id: true, full_name: true, email: true,
            billing_country: true, gst_registered: true, abn: true,
          },
        },
        contractor_profile: true,
        task: {
          select: {
            id: true, title: true, domain: true,
            objective: true, in_scope: true, out_of_scope: true,
            deliverables: true, hours_min: true, hours_max: true,
            price: true, currency: true,
          },
        },
        company: {
          select: {
            id: true, company_name: true, logo_blob_path: true,
            billing_country: true, gst_registered: true, abn: true,
          },
        },
        executing_member: { select: { id: true, full_name: true } },
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
        company_invoice: {
          select: {
            id: true,
            invoice_number: true,
            total_aud: true,
            status: true,
          },
        },
        company_payout_record: {
          select: {
            id: true,
            receipt_blob_path: true,
            commission_invoice_blob_path: true,
            commission_invoice_number: true,
            net_amount_aud: true,
            status: true,
            completed_at: true,
          },
        },
      },
    });

    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);

    // 2. Verify access
    const isCustomer = order.customer_id === requestingUserId;
    const isContractor = await isAuthorizedContractorSide(order, requestingUserId, this.prisma);
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

    const userFilter: Prisma.OrderWhereInput =
      role === 'as_customer'
        ? { customer_id: userId }
        : role === 'as_expert'
          ? { contractor_user_id: userId }
          : { OR: [{ customer_id: userId }, { contractor_user_id: userId }] };

    const statusValues = status !== undefined
      ? (Array.isArray(status) ? status : [status])
      : undefined;

    // Only pass values that are valid for the CompanyOrderStatus enum to Prisma
    const companyStatusValues = statusValues
      ?.filter((v) => COMPANY_STATUS_SET.has(v)) as CompanyOrderStatus[] | undefined;

    const where: Prisma.OrderWhereInput = {
      ...userFilter,
      ...(companyStatusValues !== undefined && companyStatusValues.length > 0 && {
        company_order_status: { in: companyStatusValues },
      }),
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
        company: { select: { id: true, company_name: true } },
        company_invoice: {
          select: {
            id: true,
            invoice_number: true,
            total_aud: true,
            paid_at: true,
            pdf_blob_path: true,
          },
        },
        purchase_order: {
          select: { id: true, po_number: true, total_aud: true },
        },
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
    if (!(await isAuthorizedContractorSide(order, contractorUserId, this.prisma))) {
      throw new AppError('FORBIDDEN', 403);
    }
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

  // ─── METHOD 5a: getDeliverables ────────────────────────────────────────────

  async getDeliverables(orderId: string, requestingUserId: string): Promise<OrderDeliverable[]> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);

    const isContractor = await isAuthorizedContractorSide(order, requestingUserId, this.prisma);
    const isCustomer = order.customer_id === requestingUserId;
    if (!isContractor && !isCustomer) throw new AppError('FORBIDDEN', 403);

    return this.prisma.orderDeliverable.findMany({
      where: { order_id: orderId },
      orderBy: { created_at: 'asc' },
    });
  }

  // ─── METHOD 5b: addDeliverable ─────────────────────────────────────────────

  async addDeliverable(
    orderId: string,
    contractorUserId: string,
    data: AddDeliverableInput,
  ): Promise<OrderDeliverable> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (!(await isAuthorizedContractorSide(order, contractorUserId, this.prisma))) {
      throw new AppError('FORBIDDEN', 403);
    }

    // All orders use company_order_status for the workflow state
    if (order.company_order_status !== 'IN_PROGRESS' && order.company_order_status !== 'REVISION_REQUESTED') {
      throw new AppError('ORDER_NOT_ACCEPTING_DELIVERABLES', 422);
    }

    const deliverable = await this.prisma.orderDeliverable.create({
      data: {
        order_id: orderId,
        uploaded_by: contractorUserId,
        file_name: data.file_name ?? null,
        blob_path: data.blob_path ?? null,
        file_size_bytes: data.file_size_bytes ?? null,
        mime_type: data.mime_type ?? null,
        description: data.description,
      },
    });

    void writeAudit(this.prisma, {
      actorId: contractorUserId,
      actionType: 'DELIVERABLE_UPLOADED',
      entityType: 'Order',
      entityId: orderId,
      metadata: { file_name: data.file_name ?? null, uploaded_by: contractorUserId },
    });

    return deliverable;
  }

  // ─── METHOD: startContractorWork ───────────────────────────────────────────
  // Used when a contractor order reaches PO_GENERATED and the contractor
  // confirms they are starting work. Sets executing_member_id and advances
  // company_order_status to IN_PROGRESS.

  async startContractorWork(orderId: string, contractorUserId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.contractor_user_id !== contractorUserId) throw new AppError('FORBIDDEN', 403);
    // PO_GENERATED is the legacy escrow path (customer accepted proposal but
    // hasn't paid yet — work starts on PO issue, payment held in escrow).
    // PAYMENT_RECEIVED is the direct-payment path (customer paid directly to
    // the supplier; supplier confirmed receipt). Both are valid starting
    // points for work, so accept either.
    const startable = ['PO_GENERATED', 'PAYMENT_RECEIVED'] as const;
    if (!startable.includes(order.company_order_status as typeof startable[number])) {
      throw new AppError(
        'INVALID_STATE',
        422,
        `Order must be PO_GENERATED or PAYMENT_RECEIVED to start work (current: ${order.company_order_status ?? 'none'})`,
      );
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        executing_member_id: contractorUserId,
        company_order_status: 'IN_PROGRESS',
      },
    });

    await writeAudit(this.prisma, {
      actorId: contractorUserId,
      actionType: 'CONTRACTOR_WORK_STARTED',
      entityType: 'Order',
      entityId: orderId,
      metadata: {},
    });
  }

  // ─── METHOD 6: submitDeliverables ──────────────────────────────────────────

  // ─── METHOD: startWork ─────────────────────────────────────────────────────

  async startWork(orderId: string, contractorUserId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: { select: { email: true } } },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (!(await isAuthorizedContractorSide(order, contractorUserId, this.prisma))) {
      throw new AppError('FORBIDDEN', 403);
    }
    if (order.status !== 'PAYMENT_HELD') {
      throw new AppError('INVALID_STATE', 422, `Order must be PAYMENT_HELD to start work (current: ${order.status})`);
    }

    const updatedOrder = await transitionOrder(
      this.prisma,
      orderId,
      'IN_PROGRESS',
      contractorUserId,
    );

    await writeAudit(this.prisma, {
      actorId: contractorUserId,
      actionType: 'ORDER_WORK_STARTED',
      entityType: 'Order',
      entityId: orderId,
      metadata: {},
    });

    return updatedOrder;
  }

  async submitDeliverables(orderId: string, contractorUserId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: { select: { email: true } } },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (!(await isAuthorizedContractorSide(order, contractorUserId, this.prisma))) {
      throw new AppError('FORBIDDEN', 403);
    }

    const deliverableCount = await this.prisma.orderDeliverable.count({
      where: { order_id: orderId },
    });
    if (deliverableCount === 0) throw new AppError('NO_DELIVERABLES', 422);

    if (order.company_order_status !== 'IN_PROGRESS') {
      throw new AppError('INVALID_STATUS_FOR_SUBMISSION', 422);
    }

    // All orders: advance company_order_status to PENDING_REVIEW
    const currentHistory = Array.isArray(order.status_history) ? order.status_history : [];
    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        company_order_status: 'PENDING_REVIEW',
        status_history: [
          ...currentHistory,
          {
            from: order.company_order_status,
            to: 'PENDING_REVIEW',
            at: new Date().toISOString(),
            actor_id: contractorUserId,
            reason: 'Deliverables submitted for review',
          },
        ] as Prisma.InputJsonValue,
      },
    });

    // Centralised lifecycle notification (in-app + email).
    const ctx = await loadOrderParties(this.prisma, orderId);
    if (ctx) {
      await notifyOrderSubmitted(this.notificationService, ctx).catch((err: unknown) => {
        console.error('[order-events] notifyOrderSubmitted failed:', err);
      });
    }

    void writeAudit(this.prisma, {
      actorId: contractorUserId,
      actionType: 'DELIVERABLES_SUBMITTED',
      entityType: 'Order',
      entityId: orderId,
      metadata: { deliverable_count: deliverableCount },
    });

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

    // All orders: advance company_order_status to DELIVERABLES_ACCEPTED
    if (order.company_order_status !== 'PENDING_REVIEW') {
      throw new AppError('INVALID_STATUS', 422, `Order must be PENDING_REVIEW to approve (current: ${order.company_order_status})`);
    }

    const currentHistory = Array.isArray(order.status_history) ? order.status_history : [];
    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        company_order_status: 'DELIVERABLES_ACCEPTED',
        status_history: [
          ...currentHistory,
          { from: 'PENDING_REVIEW', to: 'DELIVERABLES_ACCEPTED', at: new Date().toISOString(), actor_id: customerId, reason: 'Customer approved deliverables' },
        ] as Prisma.InputJsonValue,
      },
    });

    // Enqueue credential purge with 48-hour delay (M10)
    const fortyEightHours = 48 * 60 * 60 * 1000;
    void this.credentialPurgeQueue
      .add(
        'purge-credentials',
        {
          order_id: orderId,
          triggered_by: 'deliverables_accepted',
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

    // Centralised lifecycle notification — tell the contractor work was accepted.
    const ctx = await loadOrderParties(this.prisma, orderId);
    if (ctx) {
      await notifyOrderCompleted(this.notificationService, ctx).catch((err: unknown) => {
        console.error('[order-events] notifyOrderCompleted failed:', err);
      });
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

    // All orders: advance company_order_status to REVISION_REQUESTED
    // Idempotent: already in revision — return success without re-writing
    if (order.company_order_status === 'REVISION_REQUESTED') {
      console.log(`[revision] Order ${orderId} already REVISION_REQUESTED — idempotent success`);
      return order;
    }
    if (order.company_order_status !== 'PENDING_REVIEW') {
      throw new AppError('INVALID_STATUS', 422, `Order must be PENDING_REVIEW to request revision (current: ${order.company_order_status})`);
    }

    const currentHistory = Array.isArray(order.status_history) ? order.status_history : [];
    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        company_order_status: 'REVISION_REQUESTED',
        status_history: [
          ...currentHistory,
          { from: 'PENDING_REVIEW', to: 'REVISION_REQUESTED', at: new Date().toISOString(), actor_id: customerId, reason: data.reason },
        ] as Prisma.InputJsonValue,
      },
    });

    // Centralised lifecycle notification — tell the contractor revisions were requested.
    const ctx = await loadOrderParties(this.prisma, orderId);
    if (ctx) {
      await notifyOrderRevisionRequested(this.notificationService, ctx, data.reason).catch((err: unknown) => {
        console.error('[order-events] notifyOrderRevisionRequested failed:', err);
      });
    }

    void writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'REVISION_REQUESTED',
      entityType: 'Order',
      entityId: orderId,
      metadata: { reason: data.reason },
    });

    return updatedOrder;
  }

  // ─── METHOD: startRevision ──────────────────────────────────────────────────
  // Contractor/company provider acknowledges the revision request and moves
  // the order back to IN_PROGRESS so they can re-upload deliverables.
  // Auth is checked in the route via isAuthorizedContractorSide().

  async startRevision(orderId: string, providerUserId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.company_order_status !== 'REVISION_REQUESTED') {
      throw new AppError('INVALID_STATE', 422, `Order must be REVISION_REQUESTED to start revision (current: ${order.company_order_status ?? 'none'})`);
    }

    const currentHistory = Array.isArray(order.status_history) ? order.status_history : [];
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        company_order_status: 'IN_PROGRESS',
        status_history: [
          ...currentHistory,
          { from: 'REVISION_REQUESTED', to: 'IN_PROGRESS', at: new Date().toISOString(), actor_id: providerUserId },
        ] as Prisma.InputJsonValue,
      },
    });

    void writeAudit(this.prisma, {
      actorId: providerUserId,
      actionType: 'REVISION_STARTED',
      entityType: 'Order',
      entityId: orderId,
      metadata: {},
    });
  }

  // ─── METHOD: cancelOrder ───────────────────────────────────────────────────

  async cancelOrder(orderId: string, customerId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);

    const cancellableStatuses = ['PENDING_APPROVAL', 'SCOPED', 'ACCEPTED'];
    if (!cancellableStatuses.includes(order.status)) {
      throw new AppError(
        'CANCEL_NOT_ALLOWED',
        422,
        `Order in status ${order.status} cannot be cancelled by the customer.`,
      );
    }

    // For company orders: block cancellation once PO has been issued.
    // company_order_status advances past the pre-PO stages once the customer approves the proposal.
    const companyPrePOStatuses = ['BOOKED', 'PROPOSAL_DRAFT', 'PROPOSAL_SENT', 'PROPOSAL_CHANGES_REQUESTED'];
    if (order.company_order_status && !companyPrePOStatuses.includes(order.company_order_status)) {
      throw new AppError(
        'CANCEL_NOT_ALLOWED',
        422,
        'A Purchase Order has been issued — this order can no longer be cancelled.',
      );
    }

    const updated = await transitionOrder(this.prisma, orderId, 'CANCELLED', customerId);
    await writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'ORDER_CANCELLED',
      entityType: 'Order',
      entityId: orderId,
      metadata: { previous_status: order.status },
    });
    return updated;
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

  // ─── METHOD: listMessages ──────────────────────────────────────────────────

  async listMessages(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        customer_id: true,
        contractor_user_id: true,
        company_id: true,
        executing_member_id: true,
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);

    const isParty =
      order.customer_id === userId ||
      (await isAuthorizedContractorSide(order, userId, this.prisma));
    if (!isParty) throw new AppError('FORBIDDEN', 403);

    return this.prisma.orderMessage.findMany({
      where: { order_id: orderId },
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        body: true,
        created_at: true,
        sender: { select: { id: true, full_name: true, account_type: true } },
      },
    });
  }

  // ─── METHOD: sendMessage ───────────────────────────────────────────────────

  async sendMessage(orderId: string, senderId: string, body: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        customer_id: true,
        contractor_user_id: true,
        company_id: true,
        executing_member_id: true,
        status: true,
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);

    const isParty =
      order.customer_id === senderId ||
      (await isAuthorizedContractorSide(order, senderId, this.prisma));
    if (!isParty) throw new AppError('FORBIDDEN', 403);

    const terminalStatuses = ['COMPLETED', 'CANCELLED', 'DISPUTED'];
    if (terminalStatuses.includes(order.status)) {
      throw new AppError('ORDER_CLOSED', 422, 'Cannot send messages on a closed order');
    }

    return this.prisma.orderMessage.create({
      data: { order_id: orderId, sender_id: senderId, body },
      select: {
        id: true,
        body: true,
        created_at: true,
        sender: { select: { id: true, full_name: true, account_type: true } },
      },
    });
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
    if (!(await isAuthorizedContractorSide(order, contractorUserId, this.prisma))) {
      throw new AppError('CONTRACTOR_ONLY', 403, 'Only an authorized contractor-side user can raise a change request');
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
