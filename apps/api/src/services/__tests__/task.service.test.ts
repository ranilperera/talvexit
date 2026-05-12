import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import type { Task, TaskMilestone, ContractorProfile } from '@prisma/client';
import { TaskService } from '../task.service.js';
import { scopeSchema } from '@onys/shared';

// ─── Fake factories ──────────────────────────────────────────────────────────

function fakeProfile(overrides: Partial<ContractorProfile> = {}): ContractorProfile {
  return {
    id: 'profile_1',
    user_id: 'user_1',
    status: 'ACTIVE',
    onboarding_step: 7,
    bio: null,
    linkedin_url: null,
    timezone: null,
    phone: null,
    employment_type: null,
    employer_name: null,
    has_employer_consent: null,
    employment_declared_at: null,
    domains: [],
    skills: [],
    hourly_rate_aud: null,
    availability_hours_per_week: null,
    available_from: null,
    identity_document_type: null,
    identity_document_blob_path: null,
    identity_status: 'NOT_STARTED',
    agreement_accepted_at: null,
    agreement_version: null,
    stripe_account_id: null,
    stripe_account_enabled: false,
    completed_orders_count: 0,
    kyc_status: 'NOT_STARTED',
    insurance_tier_met: false,
    activated_at: null,
    suspended_at: null,
    suspension_reason: null,
    banned_at: null,
    ban_reason: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as ContractorProfile;
}

function fakeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task_1',
    contractor_profile_id: 'profile_1',
    org_id: null,
    created_by_user_id: 'user_1',
    title: 'Configure Azure Firewall for enterprise network',
    domain: 'FIREWALL',
    objective: 'A'.repeat(60),
    in_scope: ['Item one that is long enough to pass validation'],
    out_of_scope: ['Out of scope item'],
    assumptions: ['Assumption item'],
    prerequisites: [],
    deliverables: ['Deliverable item that is long enough'],
    currency: 'AUD',
    price: new Prisma.Decimal(500),
    price_aud: new Prisma.Decimal(500),
    hours_min: 4,
    hours_max: 8,
    milestone_count: 1,
    status: 'DRAFT',
    published_at: null,
    archived_at: null,
    archive_reason: null,
    version: 1,
    search_vector: null,
    view_count: 0,
    order_count: 0,
    active_order_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Task;
}

// ─── Mock factory ────────────────────────────────────────────────────────────

type TxMock = {
  task: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  taskMilestone: { createMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
};

function makePrisma() {
  const tx: TxMock = {
    task: { create: vi.fn(), update: vi.fn() },
    taskMilestone: { createMany: vi.fn(), deleteMany: vi.fn() },
  };
  return {
    contractorProfile: { findUnique: vi.fn() },
    organisation: { findFirst: vi.fn() },
    task: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    taskMilestone: { createMany: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: TxMock) => Promise<unknown>) => fn(tx)),
    _tx: tx,
  };
}

// ─── Valid scope input ───────────────────────────────────────────────────────

const VALID_SCOPE = {
  title: 'Configure Azure Firewall for enterprise',
  domain: 'FIREWALL' as const,
  objective: 'A'.repeat(60),
  in_scope: ['Firewall rule configuration for all VLANs'],
  out_of_scope: ['Hardware procurement'],
  assumptions: ['Customer has Azure subscription'],
  prerequisites: [],
  deliverables: ['Firewall policy document and implementation'],
  currency: 'AUD' as const,
  price: 500,
  hours_min: 4,
  hours_max: 8,
  milestone_count: 1,
};

// ─── TaskService.createTask() ─────────────────────────────────────────────────

describe('TaskService.createTask()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: TaskService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new TaskService(prisma as never);
  });

  it('T-01: ACTIVE contractor creates valid task in AUD → DRAFT, price_aud matches price', async () => {
    prisma.contractorProfile.findUnique.mockResolvedValue(fakeProfile());
    const created = fakeTask();
    prisma._tx.task.create.mockResolvedValue(created);

    const result = await svc.createTask(VALID_SCOPE, 'user_1', 'INDIVIDUAL_CONTRACTOR');

    expect(prisma._tx.task.create).toHaveBeenCalledOnce();
    const callData = prisma._tx.task.create.mock.calls[0][0].data;
    expect(callData.status).toBe('DRAFT');
    expect(callData.currency).toBe('AUD');
    expect(Number(callData.price_aud)).toBe(500);
    expect(result.id).toBe('task_1');
  });

  it('T-02: ACTIVE contractor creates task in USD → price_aud = price * 1.55', async () => {
    prisma.contractorProfile.findUnique.mockResolvedValue(fakeProfile());
    const created = fakeTask({ currency: 'USD', price: new Prisma.Decimal(200), price_aud: new Prisma.Decimal(310) });
    prisma._tx.task.create.mockResolvedValue(created);

    const scopeUSD = { ...VALID_SCOPE, currency: 'USD' as const, price: 200 };
    await svc.createTask(scopeUSD, 'user_1', 'INDIVIDUAL_CONTRACTOR');

    const callData = prisma._tx.task.create.mock.calls[0][0].data;
    expect(callData.currency).toBe('USD');
    expect(Number(callData.price)).toBe(200);
    expect(Number(callData.price_aud)).toBe(310); // 200 * 1.55
  });

  it('T-03: Task with milestone_count 3 and 3 milestones → task + 3 TaskMilestone records created', async () => {
    prisma.contractorProfile.findUnique.mockResolvedValue(fakeProfile());
    const created = fakeTask({ milestone_count: 3 });
    prisma._tx.task.create.mockResolvedValue(created);
    prisma._tx.taskMilestone.createMany.mockResolvedValue({ count: 3 });

    const scopeWithMilestones = {
      ...VALID_SCOPE,
      milestone_count: 3,
      milestones: [
        { sequence: 1, name: 'Discovery phase start', description: 'Initial discovery and planning', percentage_of_total: 30 },
        { sequence: 2, name: 'Implementation phase', description: 'Core implementation work', percentage_of_total: 50 },
        { sequence: 3, name: 'Final delivery phase', description: 'Testing and handover', percentage_of_total: 20 },
      ],
    };

    await svc.createTask(scopeWithMilestones, 'user_1', 'INDIVIDUAL_CONTRACTOR');

    expect(prisma._tx.taskMilestone.createMany).toHaveBeenCalledOnce();
    const msData = prisma._tx.taskMilestone.createMany.mock.calls[0][0].data;
    expect(msData).toHaveLength(3);
    expect(msData.map((m: { percentage_of_total: number }) => m.percentage_of_total).reduce((a: number, b: number) => a + b, 0)).toBe(100);
  });

  it('T-04: Milestones sum to 99% → Zod rejects', () => {
    const result = scopeSchema.safeParse({
      ...VALID_SCOPE,
      milestone_count: 2,
      milestones: [
        { sequence: 1, name: 'First milestone name', description: 'Description for first milestone', percentage_of_total: 50 },
        { sequence: 2, name: 'Second milestone name', description: 'Description for second milestone', percentage_of_total: 49 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('sum to 100'))).toBe(true);
    }
  });

  it('T-05: Contractor with PENDING status → throws CONTRACTOR_NOT_ACTIVE 403', async () => {
    prisma.contractorProfile.findUnique.mockResolvedValue(fakeProfile({ status: 'PENDING' }));

    await expect(svc.createTask(VALID_SCOPE, 'user_1', 'INDIVIDUAL_CONTRACTOR'))
      .rejects.toMatchObject({ code: 'CONTRACTOR_NOT_ACTIVE', status: 403 });
  });

  it('T-06: hours_max < hours_min → Zod rejects', () => {
    const result = scopeSchema.safeParse({ ...VALID_SCOPE, hours_min: 10, hours_max: 5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('hours_max'))).toBe(true);
    }
  });
});

// ─── TaskService.publishTask() ────────────────────────────────────────────────

describe('TaskService.publishTask()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: TaskService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new TaskService(prisma as never);
  });

  it('T-07: DRAFT task with all required fields → PUBLISHED, published_at set', async () => {
    const task = fakeTask({ milestones: [] as TaskMilestone[] } as Partial<Task> & { milestones: TaskMilestone[] });
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ...task, milestones: [] });
    prisma.contractorProfile.findUnique.mockResolvedValue(fakeProfile());
    const published = fakeTask({ status: 'PUBLISHED', published_at: new Date() });
    prisma.task.update.mockResolvedValue(published);

    const result = await svc.publishTask('task_1', 'user_1');

    expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PUBLISHED' }),
    }));
    expect(result.status).toBe('PUBLISHED');
  });

  it('T-08: DRAFT task with missing objective → throws TASK_INCOMPLETE_SCOPE 422', async () => {
    const task = fakeTask({ objective: '', milestones: [] as TaskMilestone[] } as Partial<Task> & { milestones: TaskMilestone[] });
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ...task, milestones: [] });

    await expect(svc.publishTask('task_1', 'user_1'))
      .rejects.toMatchObject({ code: 'TASK_INCOMPLETE_SCOPE', status: 422 });
  });

  it('T-09: Already PUBLISHED task → throws TASK_NOT_DRAFT 409', async () => {
    const task = fakeTask({ status: 'PUBLISHED', milestones: [] as TaskMilestone[] } as Partial<Task> & { milestones: TaskMilestone[] });
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ...task, milestones: [] });

    await expect(svc.publishTask('task_1', 'user_1'))
      .rejects.toMatchObject({ code: 'TASK_NOT_DRAFT', status: 409 });
  });

  it('T-10: Contractor profile changed to SUSPENDED → throws CONTRACTOR_NOT_ACTIVE 403', async () => {
    const task = fakeTask({ milestones: [] as TaskMilestone[] } as Partial<Task> & { milestones: TaskMilestone[] });
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ...task, milestones: [] });
    prisma.contractorProfile.findUnique.mockResolvedValue(fakeProfile({ status: 'SUSPENDED' }));

    await expect(svc.publishTask('task_1', 'user_1'))
      .rejects.toMatchObject({ code: 'CONTRACTOR_NOT_ACTIVE', status: 403 });
  });
});

// ─── TaskService.archiveTask() ────────────────────────────────────────────────

describe('TaskService.archiveTask()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: TaskService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new TaskService(prisma as never);
  });

  it('T-11: PUBLISHED task with no active orders → archived successfully', async () => {
    prisma.task.findUnique.mockResolvedValue(fakeTask({ status: 'PUBLISHED', active_order_count: 0 }));
    const archived = fakeTask({ status: 'ARCHIVED', archived_at: new Date() });
    prisma.task.update.mockResolvedValue(archived);

    const result = await svc.archiveTask('task_1', 'user_1');

    expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ARCHIVED' }),
    }));
    expect(result.status).toBe('ARCHIVED');
  });

  it('T-12: PUBLISHED task with active_order_count > 0 → throws TASK_HAS_ACTIVE_ORDERS 409', async () => {
    prisma.task.findUnique.mockResolvedValue(fakeTask({ status: 'PUBLISHED', active_order_count: 2 }));

    await expect(svc.archiveTask('task_1', 'user_1'))
      .rejects.toMatchObject({ code: 'TASK_HAS_ACTIVE_ORDERS', status: 409 });
  });

  it('T-13: Non-owner tries to archive → throws FORBIDDEN 403', async () => {
    prisma.task.findUnique.mockResolvedValue(fakeTask({ status: 'PUBLISHED', created_by_user_id: 'other_user' }));

    await expect(svc.archiveTask('task_1', 'user_1'))
      .rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});

// ─── TaskService.searchTasks() ────────────────────────────────────────────────

describe('TaskService.searchTasks()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: TaskService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new TaskService(prisma as never);
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(0);
  });

  it('T-14: No filters → where clause contains status PUBLISHED only', async () => {
    await svc.searchTasks({ sort: 'newest', limit: 20 });

    const whereArg = prisma.task.findMany.mock.calls[0][0].where;
    expect(whereArg.status).toBe('PUBLISHED');
    expect(whereArg.domain).toBeUndefined();
    expect(whereArg.price_aud).toBeUndefined();
  });

  it('T-15: verified_only=true → where clause includes contractor status ACTIVE', async () => {
    await svc.searchTasks({ verified_only: true, sort: 'newest', limit: 20 });

    const whereArg = prisma.task.findMany.mock.calls[0][0].where;
    expect(whereArg.OR).toBeDefined();
    const contractorFilter = whereArg.OR.find(
      (o: { contractor_profile?: { status: string } }) => o.contractor_profile?.status === 'ACTIVE',
    );
    expect(contractorFilter).toBeDefined();
  });

  it('T-16: price_min and price_max in USD → price_aud filter uses AUD-converted values', async () => {
    await svc.searchTasks({
      currency: 'USD',
      price_min: 100,
      price_max: 200,
      sort: 'newest',
      limit: 20,
    });

    const whereArg = prisma.task.findMany.mock.calls[0][0].where;
    expect(whereArg.price_aud).toBeDefined();
    // 100 USD → 155 AUD, 200 USD → 310 AUD
    expect(Number(whereArg.price_aud.gte)).toBe(155);
    expect(Number(whereArg.price_aud.lte)).toBe(310);
  });

  it('T-17: cursor pagination → returns next_cursor when more records exist', async () => {
    const tasks = [
      fakeTask({ id: 'task_1' }),
      fakeTask({ id: 'task_2' }),
      fakeTask({ id: 'task_3' }),
    ];
    prisma.task.findMany.mockResolvedValue(tasks); // returns limit+1=3
    prisma.task.count.mockResolvedValue(5);

    const result = await svc.searchTasks({ sort: 'newest', limit: 2 });

    expect(result.tasks).toHaveLength(2); // extra item popped
    expect(result.next_cursor).toBe('task_2');
  });
});
