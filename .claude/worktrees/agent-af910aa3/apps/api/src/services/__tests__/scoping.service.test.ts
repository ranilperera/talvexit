import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingScope } from '@prisma/client';
import { ScopingService } from '../scoping.service.js';

const { queueAddMock } = vi.hoisted(() => ({
  queueAddMock: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: queueAddMock,
  })),
}));

function fakePendingScope(overrides: Partial<PendingScope> = {}): PendingScope {
  return {
    id: 'ps_1',
    customer_id: 'customer_1',
    requirement_text: 'Need firewall policy review and hardening for branch office.',
    context: null,
    domain_hint: 'FIREWALL',
    status: 'PENDING',
    bullmq_job_id: null,
    attempts: 0,
    last_error: null,
    ai_scope_raw: null,
    ai_scope: null,
    accepted_scope: null,
    has_customer_edits: false,
    edited_fields: [],
    regen_log: [],
    accepted_at: null,
    task_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as PendingScope;
}

function makePrisma() {
  return {
    user: { findUnique: vi.fn() },
    pendingScope: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
}

const META = { ip: '127.0.0.1', userAgent: 'vitest' };

const VALID_GENERATE = {
  requirement_text:
    'Need firewall policy review and hardening for branch office environment with clear deliverables and timeline.',
  context: {
    os: 'Windows Server 2022',
    tools: 'Cisco ASDM',
    environment: 'Branch office',
    constraints: 'Saturday window',
  },
  domain_hint: 'FIREWALL' as const,
};

const VALID_SCOPE = {
  title: 'Firewall Policy Review and Hardening',
  domain: 'FIREWALL',
  objective:
    'Review and harden existing firewall policy to reduce risk and provide validated secure configuration for production.',
  in_scope: ['ACL review and cleanup', 'Policy hardening and validation'],
  out_of_scope: ['Hardware replacement'],
  assumptions: ['Admin access is provided'],
  prerequisites: ['Backup snapshot available'],
  deliverables: ['Audit report and hardened config files'],
  currency: 'AUD',
  price: 950,
  hours_min: 6,
  hours_max: 10,
  milestone_count: 1,
};

describe('ScopingService.queueScopingJob()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: ScopingService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    svc = new ScopingService(prisma as never);
    queueAddMock.mockResolvedValue({ id: 'bull_1' });
  });

  it('SC-01: valid customer request creates PendingScope, enqueues job, returns pending', async () => {
    prisma.user.findUnique.mockResolvedValue({ account_type: 'CUSTOMER' });
    prisma.pendingScope.create.mockResolvedValue(fakePendingScope({ id: 'ps_1' }));
    prisma.pendingScope.update.mockResolvedValue(fakePendingScope({ id: 'ps_1', bullmq_job_id: 'bull_1' }));

    const result = await svc.queueScopingJob('customer_1', VALID_GENERATE, META);

    expect(prisma.pendingScope.create).toHaveBeenCalledOnce();
    expect(queueAddMock).toHaveBeenCalledWith(
      'generate-scope',
      { type: 'full', pendingScopeId: 'ps_1' },
      expect.any(Object),
    );
    expect(result).toEqual({ job_id: 'ps_1', status: 'PENDING' });
  });

  it('SC-02: response time is < 200ms with mocked prisma and queue', async () => {
    prisma.user.findUnique.mockResolvedValue({ account_type: 'CUSTOMER' });
    prisma.pendingScope.create.mockResolvedValue(fakePendingScope({ id: 'ps_1' }));
    prisma.pendingScope.update.mockResolvedValue(fakePendingScope({ id: 'ps_1', bullmq_job_id: 'bull_1' }));

    const start = Date.now();
    await svc.queueScopingJob('customer_1', VALID_GENERATE, META);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(200);
  });

  it('SC-03: non-CUSTOMER account type throws WRONG_ACCOUNT_TYPE 403', async () => {
    prisma.user.findUnique.mockResolvedValue({ account_type: 'INDIVIDUAL_CONTRACTOR' });

    await expect(svc.queueScopingJob('user_1', VALID_GENERATE, META)).rejects.toMatchObject({
      code: 'WRONG_ACCOUNT_TYPE',
      status: 403,
    });
  });
});

describe('ScopingService.getJobStatus()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: ScopingService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    svc = new ScopingService(prisma as never);
  });

  it('SC-04: PENDING job returns status PENDING and scope null', async () => {
    prisma.pendingScope.findFirst.mockResolvedValue(fakePendingScope({ status: 'PENDING', ai_scope: null }));

    const result = await svc.getJobStatus('ps_1', 'customer_1');

    expect(result.status).toBe('PENDING');
    expect(result.scope).toBeNull();
  });

  it('SC-05: COMPLETE job returns scope object with no error', async () => {
    prisma.pendingScope.findFirst.mockResolvedValue(
      fakePendingScope({ status: 'COMPLETE', ai_scope: VALID_SCOPE, last_error: null }),
    );

    const result = await svc.getJobStatus('ps_1', 'customer_1');

    expect(result.status).toBe('COMPLETE');
    expect(result.scope).toMatchObject(VALID_SCOPE);
    expect(result.error).toBeNull();
  });

  it('SC-06: FAILED job returns AI_SERVICE_UNAVAILABLE error message', async () => {
    prisma.pendingScope.findFirst.mockResolvedValue(
      fakePendingScope({ status: 'FAILED', last_error: 'AI_SERVICE_UNAVAILABLE' }),
    );

    const result = await svc.getJobStatus('ps_1', 'customer_1');

    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('AI_SERVICE_UNAVAILABLE');
  });

  it('SC-07: job for different customer throws JOB_NOT_FOUND 404', async () => {
    prisma.pendingScope.findFirst.mockResolvedValue(null);

    await expect(svc.getJobStatus('ps_1', 'customer_1')).rejects.toMatchObject({
      code: 'JOB_NOT_FOUND',
      status: 404,
    });
  });
});

describe('ScopingService.acceptScope()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: ScopingService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    svc = new ScopingService(prisma as never);
  });

  it('SC-08: accept without edits sets has_customer_edits false and empty edited_fields', async () => {
    prisma.pendingScope.findFirst.mockResolvedValue(
      fakePendingScope({ status: 'COMPLETE', ai_scope: VALID_SCOPE, accepted_at: null }),
    );
    prisma.pendingScope.update.mockResolvedValue(fakePendingScope({ accepted_at: new Date() }));

    const result = await svc.acceptScope(
      'ps_1',
      'customer_1',
      { scope: VALID_SCOPE } as never,
      META,
    );

    expect(result.has_customer_edits).toBe(false);
    expect(result.edited_fields).toEqual([]);
    expect(prisma.pendingScope.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accepted_at: expect.any(Date) }),
      }),
    );
  });

  it('SC-09: edit price before accepting marks edited_fields with price', async () => {
    prisma.pendingScope.findFirst.mockResolvedValue(
      fakePendingScope({ status: 'COMPLETE', ai_scope: VALID_SCOPE, accepted_at: null }),
    );
    prisma.pendingScope.update.mockResolvedValue(fakePendingScope({ accepted_at: new Date() }));

    const result = await svc.acceptScope(
      'ps_1',
      'customer_1',
      { scope: { ...VALID_SCOPE, price: 1200 } } as never,
      META,
    );

    expect(result.has_customer_edits).toBe(true);
    expect(result.edited_fields).toContain('price');
  });

  it('SC-10: edit in_scope array marks edited_fields with in_scope', async () => {
    prisma.pendingScope.findFirst.mockResolvedValue(
      fakePendingScope({ status: 'COMPLETE', ai_scope: VALID_SCOPE, accepted_at: null }),
    );
    prisma.pendingScope.update.mockResolvedValue(fakePendingScope({ accepted_at: new Date() }));

    const result = await svc.acceptScope(
      'ps_1',
      'customer_1',
      {
        scope: {
          ...VALID_SCOPE,
          in_scope: [...VALID_SCOPE.in_scope, 'Add rollback verification checklist'],
        },
      } as never,
      META,
    );

    expect(result.edited_fields).toContain('in_scope');
  });

  it('SC-11: PROCESSING status throws SCOPE_NOT_READY 422', async () => {
    prisma.pendingScope.findFirst.mockResolvedValue(fakePendingScope({ status: 'PROCESSING' }));

    await expect(
      svc.acceptScope('ps_1', 'customer_1', { scope: VALID_SCOPE } as never, META),
    ).rejects.toMatchObject({ code: 'SCOPE_NOT_READY', status: 422 });
  });

  it('SC-12: already accepted scope throws SCOPE_ALREADY_ACCEPTED 409', async () => {
    prisma.pendingScope.findFirst.mockResolvedValue(
      fakePendingScope({ status: 'COMPLETE', accepted_at: new Date() }),
    );

    await expect(
      svc.acceptScope('ps_1', 'customer_1', { scope: VALID_SCOPE } as never, META),
    ).rejects.toMatchObject({ code: 'SCOPE_ALREADY_ACCEPTED', status: 409 });
  });
});

describe('ScopingService.queueSectionRegen()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: ScopingService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    svc = new ScopingService(prisma as never);
    queueAddMock.mockResolvedValue({ id: 'bull_section_1' });
  });

  it('SC-13: valid regen on COMPLETE scope sets PROCESSING and enqueues section job', async () => {
    prisma.pendingScope.findFirst.mockResolvedValue(
      fakePendingScope({ status: 'COMPLETE', accepted_at: null }),
    );
    prisma.pendingScope.update.mockResolvedValue(fakePendingScope({ status: 'PROCESSING' }));

    const result = await svc.queueSectionRegen('ps_1', 'customer_1', {
      section: 'in_scope',
      feedback: 'Need clearer validation tasks',
    });

    expect(prisma.pendingScope.update).toHaveBeenCalledWith({
      where: { id: 'ps_1' },
      data: { status: 'PROCESSING' },
    });
    expect(queueAddMock).toHaveBeenCalledWith(
      'regen-section',
      expect.objectContaining({ type: 'section', pendingScopeId: 'ps_1', section: 'in_scope' }),
      expect.any(Object),
    );
    expect(result).toEqual({ job_id: 'ps_1', status: 'PENDING', section: 'in_scope' });
  });

  it('SC-14: regen on PENDING scope throws SCOPE_NOT_READY 422', async () => {
    prisma.pendingScope.findFirst.mockResolvedValue(fakePendingScope({ status: 'PENDING' }));

    await expect(
      svc.queueSectionRegen('ps_1', 'customer_1', { section: 'price' }),
    ).rejects.toMatchObject({ code: 'SCOPE_NOT_READY', status: 422 });
  });

  it('SC-15: regen on accepted scope throws SCOPE_ALREADY_ACCEPTED 409', async () => {
    prisma.pendingScope.findFirst.mockResolvedValue(
      fakePendingScope({ status: 'COMPLETE', accepted_at: new Date() }),
    );

    await expect(
      svc.queueSectionRegen('ps_1', 'customer_1', { section: 'price' }),
    ).rejects.toMatchObject({ code: 'SCOPE_ALREADY_ACCEPTED', status: 409 });
  });
});
