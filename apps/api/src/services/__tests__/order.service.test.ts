import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { OrderService } from '../order.service.js';

function fakeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order_1',
    origin: 'CATALOG_TASK',
    task_id: 'task_1',
    customer_id: 'customer_1',
    contractor_profile_id: 'cp_1',
    contractor_user_id: 'contractor_1',
    scope_snapshot: { hours_max: 8 },
    scope_version: 1,
    currency: 'AUD',
    price: new Prisma.Decimal(500),
    price_aud: new Prisma.Decimal(500),
    tax_amount_aud: new Prisma.Decimal(50),
    total_amount_aud: new Prisma.Decimal(550),
    status: 'IN_PROGRESS',
    status_history: [],
    accept_deadline_at: null,
    review_deadline_at: null,
    completed_at: null,
    disputed_at: null,
    customer: { email: 'customer@example.com', full_name: 'Customer Name' },
    contractor_user: { email: 'contractor@example.com' },
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makePrisma() {
  return {
    user: { findUnique: vi.fn() },
    task: { findUnique: vi.fn(), update: vi.fn() },
    order: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    workLog: { create: vi.fn() },
    orderDeliverable: { create: vi.fn(), count: vi.fn() },
    dispute: { create: vi.fn() },
    changeRequest: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    contractorProfile: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn(async () => ({})) },
  };
}

function makeQueue() {
  return { add: vi.fn(async () => ({})) };
}

const META = { ip: '127.0.0.1', userAgent: 'vitest' };

describe('OrderService.createOrder()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let emailQueue: ReturnType<typeof makeQueue>;
  let svc: OrderService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    emailQueue = makeQueue();
    svc = new OrderService(prisma as never, emailQueue as never, { notify: () => Promise.resolve() } as never);
    prisma.task.update.mockResolvedValue({});
  });

  it('OR-01: valid catalog task order by CUSTOMER -> SCOPED, accept_deadline_at +48h', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'customer_1',
      account_type: 'CUSTOMER',
      full_name: 'Customer',
    });
    prisma.task.findUnique.mockResolvedValue({
      id: 'task_1',
      status: 'PUBLISHED',
      title: 'Task',
      domain: 'FIREWALL',
      objective: 'Objective',
      in_scope: ['A'],
      out_of_scope: ['B'],
      assumptions: ['C'],
      prerequisites: [],
      deliverables: ['D'],
      currency: 'AUD',
      price: new Prisma.Decimal(500),
      price_aud: new Prisma.Decimal(500),
      hours_min: 4,
      hours_max: 8,
      milestone_count: 1,
      contractor_profile: { id: 'cp_1', user_id: 'contractor_1', status: 'ACTIVE' },
    });
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'customer_1',
      account_type: 'CUSTOMER',
      full_name: 'Customer',
    }).mockResolvedValueOnce({ email: 'contractor@example.com' });
    const created = fakeOrder({
      status: 'SCOPED',
      accept_deadline_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    prisma.order.create.mockResolvedValue(created);

    const result = await svc.createOrder('customer_1', { task_id: 'task_1' } as never, META);

    expect(result.status).toBe('SCOPED');
    expect(result.accept_deadline_at).toBeInstanceOf(Date);
    const orderData = prisma.order.create.mock.calls[0][0].data;
    expect(orderData.status).toBe('SCOPED');
    expect(orderData.accept_deadline_at).toBeInstanceOf(Date);
  });

  it('OR-02: task not PUBLISHED -> TASK_NOT_AVAILABLE 422', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'customer_1', account_type: 'CUSTOMER', full_name: 'Customer' });
    prisma.task.findUnique.mockResolvedValue({ id: 'task_1', status: 'DRAFT' });

    await expect(
      svc.createOrder('customer_1', { task_id: 'task_1' } as never, META),
    ).rejects.toMatchObject({ code: 'TASK_NOT_AVAILABLE', status: 422 });
  });

  it('OR-03: contractor profile SUSPENDED -> CONTRACTOR_NOT_AVAILABLE 422', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'customer_1', account_type: 'CUSTOMER', full_name: 'Customer' });
    prisma.task.findUnique.mockResolvedValue({
      id: 'task_1',
      status: 'PUBLISHED',
      contractor_profile: { id: 'cp_1', user_id: 'contractor_1', status: 'SUSPENDED' },
    });

    await expect(
      svc.createOrder('customer_1', { task_id: 'task_1' } as never, META),
    ).rejects.toMatchObject({ code: 'CONTRACTOR_NOT_AVAILABLE', status: 422 });
  });

  it('OR-04: non-CUSTOMER account type -> WRONG_ACCOUNT_TYPE 403', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user_1', account_type: 'INDIVIDUAL_CONTRACTOR' });

    await expect(
      svc.createOrder('user_1', { task_id: 'task_1' } as never, META),
    ).rejects.toMatchObject({ code: 'WRONG_ACCOUNT_TYPE', status: 403 });
  });

  it('OR-05: USD price converts to AUD and total_amount_aud includes 10% GST', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'customer_1',
        account_type: 'CUSTOMER',
        full_name: 'Customer',
      })
      // Contractor lookup — must carry gst_registered + billing_country
      // so the decideGstTreatment call charges 10% GST as the test asserts.
      .mockResolvedValueOnce({
        email: 'contractor@example.com',
        gst_registered: true,
        billing_country: 'AU',
      })
      // Customer billing_country lookup — AU keeps the supply domestic.
      .mockResolvedValueOnce({ billing_country: 'AU' });
    prisma.task.findUnique.mockResolvedValue({
      id: 'task_1',
      status: 'PUBLISHED',
      title: 'Task',
      domain: 'FIREWALL',
      objective: 'Objective',
      in_scope: ['A'],
      out_of_scope: ['B'],
      assumptions: ['C'],
      prerequisites: [],
      deliverables: ['D'],
      currency: 'USD',
      price: new Prisma.Decimal(200),
      price_aud: new Prisma.Decimal(310),
      hours_min: 4,
      hours_max: 8,
      milestone_count: 1,
      contractor_profile: { id: 'cp_1', user_id: 'contractor_1', status: 'ACTIVE' },
    });
    prisma.order.create.mockResolvedValue(fakeOrder());

    await svc.createOrder('customer_1', { task_id: 'task_1' } as never, META);

    const data = prisma.order.create.mock.calls[0][0].data;
    expect(Number(data.price_aud)).toBe(310);
    expect(Number(data.total_amount_aud)).toBe(341);
  });
});

describe('OrderService.addWorkLog()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let emailQueue: ReturnType<typeof makeQueue>;
  let svc: OrderService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    emailQueue = makeQueue();
    svc = new OrderService(prisma as never, emailQueue as never, { notify: () => Promise.resolve() } as never);
  });

  it('OR-06: valid work log on IN_PROGRESS by assigned contractor -> creates log and audit', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder({ status: 'IN_PROGRESS', contractor_user_id: 'contractor_1' }));
    prisma.workLog.create.mockResolvedValue({ id: 'wl_1', order_id: 'order_1' });

    await svc.addWorkLog('order_1', 'contractor_1', {
      hours_worked: 2,
      description: 'Configured firewall rules',
      started_at: '2026-01-01T00:00:00.000Z',
    } as never);

    expect(prisma.workLog.create).toHaveBeenCalledOnce();
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
  });

  it('OR-07: order not IN_PROGRESS -> ORDER_NOT_IN_PROGRESS 422', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder({ status: 'PENDING_REVIEW', contractor_user_id: 'contractor_1' }));

    await expect(
      svc.addWorkLog('order_1', 'contractor_1', {
        hours_worked: 1,
        description: 'note',
        started_at: '2026-01-01T00:00:00.000Z',
      } as never),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_IN_PROGRESS', status: 422 });
  });

  it('OR-08: unrelated user tries to add work log -> FORBIDDEN 403', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder({ status: 'IN_PROGRESS', contractor_user_id: 'contractor_1' }));

    await expect(
      svc.addWorkLog('order_1', 'other_user', {
        hours_worked: 1,
        description: 'note',
        started_at: '2026-01-01T00:00:00.000Z',
      } as never),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});

describe('OrderService.submitDeliverables()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let emailQueue: ReturnType<typeof makeQueue>;
  let svc: OrderService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    emailQueue = makeQueue();
    svc = new OrderService(prisma as never, emailQueue as never, { notify: () => Promise.resolve() } as never);
  });

  it('OR-09: IN_PROGRESS with deliverables -> PENDING_REVIEW, review_deadline_at +72h, email queued', async () => {
    const order = fakeOrder({
      status: 'IN_PROGRESS',
      contractor_user_id: 'contractor_1',
      customer: { email: 'customer@example.com' },
      status_history: [],
    });
    prisma.order.findUnique.mockResolvedValue(order);
    prisma.orderDeliverable.count.mockResolvedValue(1);
    prisma.order.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...order, ...data }));

    const result = await svc.submitDeliverables('order_1', 'contractor_1');

    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.review_deadline_at).toBeInstanceOf(Date);
    expect(emailQueue.add).toHaveBeenCalledWith(
      'deliverables-submitted',
      expect.objectContaining({ type: 'deliverables-submitted', order_id: 'order_1' }),
    );
  });

  it('OR-10: IN_PROGRESS with no deliverables -> NO_DELIVERABLES 422', async () => {
    const order = fakeOrder({
      status: 'IN_PROGRESS',
      contractor_user_id: 'contractor_1',
      customer: { email: 'customer@example.com' },
    });
    prisma.order.findUnique.mockResolvedValue(order);
    prisma.orderDeliverable.count.mockResolvedValue(0);

    await expect(
      svc.submitDeliverables('order_1', 'contractor_1'),
    ).rejects.toMatchObject({ code: 'NO_DELIVERABLES', status: 422 });
  });
});

describe('OrderService.approveDeliverables()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let emailQueue: ReturnType<typeof makeQueue>;
  let svc: OrderService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    emailQueue = makeQueue();
    svc = new OrderService(prisma as never, emailQueue as never, { notify: () => Promise.resolve() } as never);
  });

  it('OR-11: PENDING_REVIEW -> COMPLETED by customer -> completed_at set, payout job queued, contractor count incremented', async () => {
    const order = fakeOrder({
      status: 'PENDING_REVIEW',
      customer_id: 'customer_1',
      task_id: 'task_1',
      contractor_profile_id: 'cp_1',
      contractor_user: { email: 'contractor@example.com' },
      status_history: [],
    });
    prisma.order.findUnique.mockResolvedValue(order);
    prisma.order.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...order, ...data }));
    prisma.task.update.mockResolvedValue({});
    prisma.contractorProfile.update.mockResolvedValue({});

    const result = await svc.approveDeliverables('order_1', 'customer_1');

    expect(result.status).toBe('COMPLETED');
    expect(result.completed_at).toBeInstanceOf(Date);
    expect(prisma.contractorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { completed_orders_count: { increment: 1 } },
      }),
    );
    expect(emailQueue.add).toHaveBeenCalledWith(
      'order-completed',
      expect.objectContaining({ type: 'order-completed-payout-pending', order_id: 'order_1' }),
    );
  });

  it('OR-12: non-customer tries approve -> FORBIDDEN 403', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder({ status: 'PENDING_REVIEW', customer_id: 'customer_1' }));

    await expect(
      svc.approveDeliverables('order_1', 'other_user'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});

describe('OrderService.raiseDispute()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let emailQueue: ReturnType<typeof makeQueue>;
  let svc: OrderService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    emailQueue = makeQueue();
    svc = new OrderService(prisma as never, emailQueue as never, { notify: () => Promise.resolve() } as never);
  });

  it('OR-13: customer raises dispute from IN_PROGRESS -> DISPUTED, Dispute created, admin email queued', async () => {
    const order = fakeOrder({
      status: 'IN_PROGRESS',
      customer_id: 'customer_1',
      contractor_user_id: 'contractor_1',
      customer: { full_name: 'Customer', email: 'customer@example.com' },
      contractor_user: { email: 'contractor@example.com' },
      dispute: null,
      status_history: [],
    });
    prisma.order.findUnique.mockResolvedValue(order);
    prisma.order.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...order, ...data }));
    prisma.dispute.create.mockResolvedValue({ id: 'disp_1', order_id: 'order_1' });

    const result = await svc.raiseDispute('order_1', 'customer_1', {
      grounds: 'WORK_ABANDONED',
      description: 'Contractor stopped responding',
      evidence_blob_paths: [],
    } as never);

    expect(result.order.status).toBe('DISPUTED');
    expect(result.dispute.id).toBe('disp_1');
    expect(emailQueue.add).toHaveBeenCalledWith(
      'dispute-admin',
      expect.objectContaining({ type: 'dispute-raised-admin', order_id: 'order_1' }),
    );
  });

  it('OR-14: dispute raised from COMPLETED -> DISPUTE_NOT_ALLOWED 422', async () => {
    prisma.order.findUnique.mockResolvedValue(
      fakeOrder({
        status: 'COMPLETED',
        customer_id: 'customer_1',
        contractor_user_id: 'contractor_1',
        customer: { full_name: 'Customer', email: 'customer@example.com' },
        contractor_user: { email: 'contractor@example.com' },
        dispute: null,
      }),
    );

    await expect(
      svc.raiseDispute('order_1', 'customer_1', {
        grounds: 'WORK_ABANDONED',
        description: 'desc',
        evidence_blob_paths: [],
      } as never),
    ).rejects.toMatchObject({ code: 'DISPUTE_NOT_ALLOWED', status: 422 });
  });

  it('OR-15: second dispute on same order -> DISPUTE_EXISTS 409', async () => {
    prisma.order.findUnique.mockResolvedValue(
      fakeOrder({
        status: 'IN_PROGRESS',
        customer_id: 'customer_1',
        contractor_user_id: 'contractor_1',
        dispute: { id: 'disp_existing' },
      }),
    );

    await expect(
      svc.raiseDispute('order_1', 'customer_1', {
        grounds: 'WORK_ABANDONED',
        description: 'desc',
        evidence_blob_paths: [],
      } as never),
    ).rejects.toMatchObject({ code: 'DISPUTE_EXISTS', status: 409 });
  });
});

describe('OrderService.createChangeRequest()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let emailQueue: ReturnType<typeof makeQueue>;
  let svc: OrderService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    emailQueue = makeQueue();
    svc = new OrderService(prisma as never, emailQueue as never, { notify: () => Promise.resolve() } as never);
  });

  it('OR-16: contractor raises CR on IN_PROGRESS -> CR created, customer email queued, expires_at +48h', async () => {
    prisma.order.findUnique.mockResolvedValue(
      fakeOrder({
        status: 'IN_PROGRESS',
        contractor_user_id: 'contractor_1',
        currency: 'AUD',
        customer: { email: 'customer@example.com' },
      }),
    );
    prisma.changeRequest.findFirst.mockResolvedValue(null);
    prisma.changeRequest.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'cr_1', ...data }));

    const cr = await svc.createChangeRequest('order_1', 'contractor_1', {
      description: 'Need extra scope',
      unforeseen_finding: 'Firewall complexity larger than expected',
      additional_hours: 2,
      additional_cost: 100,
    } as never);

    expect(cr.id).toBe('cr_1');
    expect(new Date(cr.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(emailQueue.add).toHaveBeenCalledWith(
      'change-request',
      expect.objectContaining({ type: 'change-request-received', order_id: 'order_1' }),
    );
  });

  it('OR-17: pending CR already exists -> CHANGE_REQUEST_PENDING 409', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder({ status: 'IN_PROGRESS', contractor_user_id: 'contractor_1' }));
    prisma.changeRequest.findFirst.mockResolvedValue({ id: 'cr_pending' });

    await expect(
      svc.createChangeRequest('order_1', 'contractor_1', {
        description: 'Need extra scope',
        unforeseen_finding: 'finding',
        additional_hours: 1,
        additional_cost: 10,
      } as never),
    ).rejects.toMatchObject({ code: 'CHANGE_REQUEST_PENDING', status: 409 });
  });

  it('OR-18: customer tries to raise CR -> CONTRACTOR_ONLY 403', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder({ status: 'IN_PROGRESS', contractor_user_id: 'contractor_1' }));

    await expect(
      svc.createChangeRequest('order_1', 'customer_1', {
        description: 'Need extra scope',
        unforeseen_finding: 'finding',
        additional_hours: 1,
        additional_cost: 10,
      } as never),
    ).rejects.toMatchObject({ code: 'CONTRACTOR_ONLY', status: 403 });
  });
});

describe('OrderService.decideChangeRequest()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let emailQueue: ReturnType<typeof makeQueue>;
  let svc: OrderService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    emailQueue = makeQueue();
    svc = new OrderService(prisma as never, emailQueue as never, { notify: () => Promise.resolve() } as never);
  });

  it('OR-19: customer APPROVES CR -> order totals updated, scope_snapshot.hours_max incremented, audit written', async () => {
    prisma.order.findUnique.mockResolvedValue(
      fakeOrder({
        id: 'order_1',
        customer_id: 'customer_1',
        price: new Prisma.Decimal(500),
        price_aud: new Prisma.Decimal(500),
        scope_snapshot: { hours_max: 8 },
        contractor_user: { email: 'contractor@example.com' },
      }),
    );
    prisma.changeRequest.findUnique.mockResolvedValue({
      id: 'cr_1',
      order_id: 'order_1',
      status: 'PENDING',
      expires_at: new Date(Date.now() + 60_000),
      additional_cost: new Prisma.Decimal(100),
      additional_cost_aud: new Prisma.Decimal(100),
      additional_hours: 2,
    });
    prisma.changeRequest.update.mockResolvedValue({ id: 'cr_1', status: 'APPROVED' });
    prisma.order.update.mockResolvedValue({});

    await svc.decideChangeRequest('order_1', 'cr_1', 'customer_1', {
      decision: 'APPROVE',
      decision_notes: 'Approved',
    } as never);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          price: expect.any(Prisma.Decimal),
          price_aud: expect.any(Prisma.Decimal),
          total_amount_aud: expect.any(Prisma.Decimal),
          scope_snapshot: expect.objectContaining({ hours_max: 10 }),
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
  });

  it('OR-20: customer DECLINES CR -> CR status DECLINED, order price unchanged', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder({ customer_id: 'customer_1' }));
    prisma.changeRequest.findUnique.mockResolvedValue({
      id: 'cr_1',
      order_id: 'order_1',
      status: 'PENDING',
      expires_at: new Date(Date.now() + 60_000),
      additional_cost: new Prisma.Decimal(100),
      additional_cost_aud: new Prisma.Decimal(100),
      additional_hours: 2,
    });
    prisma.changeRequest.update.mockResolvedValue({ id: 'cr_1', status: 'DECLINED' });

    const cr = await svc.decideChangeRequest('order_1', 'cr_1', 'customer_1', {
      decision: 'DECLINE',
      decision_notes: 'Not needed',
    } as never);

    expect(cr.status).toBe('DECLINED');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('OR-21: CR already expired -> CHANGE_REQUEST_EXPIRED 422', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder({ customer_id: 'customer_1' }));
    prisma.changeRequest.findUnique.mockResolvedValue({
      id: 'cr_1',
      order_id: 'order_1',
      status: 'PENDING',
      expires_at: new Date(Date.now() - 1000),
      additional_cost: new Prisma.Decimal(100),
      additional_cost_aud: new Prisma.Decimal(100),
      additional_hours: 2,
    });

    await expect(
      svc.decideChangeRequest('order_1', 'cr_1', 'customer_1', {
        decision: 'APPROVE',
      } as never),
    ).rejects.toMatchObject({ code: 'CHANGE_REQUEST_EXPIRED', status: 422 });
  });
});
