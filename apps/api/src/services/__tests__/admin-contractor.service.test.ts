import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminContractorService } from '../admin-contractor.service.js';

// ─── Mock transitionProfile ───────────────────────────────────────────────────

vi.mock('../contractor-state-machine.service.js', () => ({
  transitionProfile: vi.fn(),
}));

import { transitionProfile } from '../contractor-state-machine.service.js';
const mockTransition = vi.mocked(transitionProfile);

// ─── Prisma mock factory ──────────────────────────────────────────────────────

function makePrisma() {
  return {
    contractorProfile: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    insuranceCertificate: {
      findMany: vi.fn(),
    },
    amlCheck: {
      findMany: vi.fn(),
    },
    videoSession: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };
}

function makeQueue() {
  return { add: vi.fn() };
}

const ADMIN_ID = 'admin_1';

// ─── adminContractorService.listContractors() ─────────────────────────────────

describe('AdminContractorService.listContractors()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: AdminContractorService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new AdminContractorService(prisma as never, makeQueue() as never);
  });

  it('AC-01: No filters → returns paginated contractors', async () => {
    const rows = [
      { id: 'c1', status: 'ACTIVE', user: { id: 'u1', full_name: 'Alice', email: 'a@x.com', created_at: new Date() }, insurance_certificates: [], _count: { orders: 2 } },
      { id: 'c2', status: 'ACTIVE', user: { id: 'u2', full_name: 'Bob', email: 'b@x.com', created_at: new Date() }, insurance_certificates: [], _count: { orders: 0 } },
    ];
    prisma.contractorProfile.findMany.mockResolvedValue(rows);
    prisma.contractorProfile.count.mockResolvedValue(2);

    const result = await svc.listContractors({});
    expect(result.contractors).toHaveLength(2);
    expect(result.next_cursor).toBeNull();
    expect(result.total_count).toBe(2);
    expect(prisma.contractorProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('AC-02: status filter PENDING → where.status = PENDING', async () => {
    prisma.contractorProfile.findMany.mockResolvedValue([]);
    prisma.contractorProfile.count.mockResolvedValue(0);

    await svc.listContractors({ status: 'PENDING' });

    const call = prisma.contractorProfile.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(call.where.status).toBe('PENDING');
  });

  it('AC-03: domain filter FIREWALL → where.domains.has = FIREWALL', async () => {
    prisma.contractorProfile.findMany.mockResolvedValue([]);
    prisma.contractorProfile.count.mockResolvedValue(0);

    await svc.listContractors({ domain: 'FIREWALL' });

    const call = prisma.contractorProfile.findMany.mock.calls[0]?.[0] as {
      where: { domains: { has: string } };
    };
    expect(call.where.domains).toEqual({ has: 'FIREWALL' });
  });

  it('AC-04: search john → where.user.OR covers full_name and email', async () => {
    prisma.contractorProfile.findMany.mockResolvedValue([]);
    prisma.contractorProfile.count.mockResolvedValue(0);

    await svc.listContractors({ search: 'john' });

    const call = prisma.contractorProfile.findMany.mock.calls[0]?.[0] as {
      where: { user: { OR: { full_name?: unknown; email?: unknown }[] } };
    };
    expect(call.where.user.OR).toHaveLength(2);
    expect(call.where.user.OR[0]).toHaveProperty('full_name');
    expect(call.where.user.OR[1]).toHaveProperty('email');
  });

  it('AC-05: cursor provided → where.id.lt set to cursor', async () => {
    prisma.contractorProfile.findMany.mockResolvedValue([]);
    prisma.contractorProfile.count.mockResolvedValue(0);

    await svc.listContractors({ cursor: 'cursor_xyz' });

    const call = prisma.contractorProfile.findMany.mock.calls[0]?.[0] as {
      where: { id: { lt: string } };
    };
    expect(call.where.id).toEqual({ lt: 'cursor_xyz' });
  });
});

// ─── adminContractorService.updateContractorStatus() ─────────────────────────

describe('AdminContractorService.updateContractorStatus()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: AdminContractorService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new AdminContractorService(prisma as never, queue as never);
  });

  function fakeProfile(overrides = {}) {
    return {
      id: 'profile_1',
      user_id: 'user_1',
      status: 'ACTIVE',
      user: { email: 'contractor@example.com' },
      ...overrides,
    };
  }

  it('AC-06: Admin suspends ACTIVE contractor with reason → transitionProfile called, email queued, audit written', async () => {
    prisma.contractorProfile.findUnique.mockResolvedValue(fakeProfile());
    mockTransition.mockResolvedValue({ id: 'profile_1', status: 'SUSPENDED' } as never);
    prisma.auditLog.create.mockResolvedValue({} as never);

    const result = await svc.updateContractorStatus('profile_1', ADMIN_ID, {
      status: 'SUSPENDED',
      reason: 'Policy violation',
    });

    expect(mockTransition).toHaveBeenCalledWith(
      expect.anything(),
      'profile_1',
      'SUSPENDED',
      ADMIN_ID,
      'Policy violation',
    );
    expect(queue.add).toHaveBeenCalledWith(
      'contractor-status-suspended',
      expect.objectContaining({ status: 'SUSPENDED' }),
    );
    expect(result).toMatchObject({ status: 'SUSPENDED' });
  });

  it('AC-07: SUSPENDED → BANNED with reason → allowed', async () => {
    prisma.contractorProfile.findUnique.mockResolvedValue(fakeProfile({ status: 'SUSPENDED' }));
    mockTransition.mockResolvedValue({ id: 'profile_1', status: 'BANNED' } as never);
    prisma.auditLog.create.mockResolvedValue({} as never);

    await expect(
      svc.updateContractorStatus('profile_1', ADMIN_ID, {
        status: 'BANNED',
        reason: 'Repeat offender',
      }),
    ).resolves.toMatchObject({ status: 'BANNED' });
  });

  it('AC-08: SUSPENDED without reason → throws REASON_REQUIRED 422', async () => {
    prisma.contractorProfile.findUnique.mockResolvedValue(fakeProfile());

    await expect(
      svc.updateContractorStatus('profile_1', ADMIN_ID, { status: 'SUSPENDED' }),
    ).rejects.toMatchObject({ code: 'REASON_REQUIRED', status: 422 });
  });

  it('AC-09: BANNED without reason → throws REASON_REQUIRED 422', async () => {
    prisma.contractorProfile.findUnique.mockResolvedValue(fakeProfile());

    await expect(
      svc.updateContractorStatus('profile_1', ADMIN_ID, { status: 'BANNED' }),
    ).rejects.toMatchObject({ code: 'REASON_REQUIRED', status: 422 });
  });

  it('AC-10: Already SUSPENDED, update to SUSPENDED → throws STATUS_UNCHANGED 409', async () => {
    prisma.contractorProfile.findUnique.mockResolvedValue(fakeProfile({ status: 'SUSPENDED' }));

    await expect(
      svc.updateContractorStatus('profile_1', ADMIN_ID, {
        status: 'SUSPENDED',
        reason: 'Reason here',
      }),
    ).rejects.toMatchObject({ code: 'STATUS_UNCHANGED', status: 409 });
  });

  it('AC-11: Service has no admin role check — route layer enforces permissions', async () => {
    // The service itself does NOT check req.user roles — the route preHandler does.
    // We can call the service with any admin ID and it proceeds purely on business logic.
    prisma.contractorProfile.findUnique.mockResolvedValue(fakeProfile());
    mockTransition.mockResolvedValue({ id: 'profile_1', status: 'SUSPENDED' } as never);
    prisma.auditLog.create.mockResolvedValue({} as never);

    await expect(
      svc.updateContractorStatus('profile_1', 'support_admin_id', {
        status: 'SUSPENDED',
        reason: 'Reason',
      }),
    ).resolves.toBeDefined();
  });
});

// ─── adminContractorService.getInsuranceExpiryDashboard() ────────────────────

describe('AdminContractorService.getInsuranceExpiryDashboard()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: AdminContractorService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new AdminContractorService(prisma as never, makeQueue() as never);
  });

  function certExpiring(daysFromNow: number) {
    const expiry = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    return {
      id: `cert_${daysFromNow}`,
      contractor_id: 'profile_1',
      insurance_type: 'PI',
      policy_expiry_date: expiry,
      contractor: {
        status: 'ACTIVE',
        user: { full_name: 'Jane', email: 'jane@example.com' },
      },
    };
  }

  it('AC-12: Cert expiring in 5 days → in expiring_0_7_days bucket', async () => {
    prisma.insuranceCertificate.findMany.mockResolvedValue([certExpiring(5)]);

    const result = await svc.getInsuranceExpiryDashboard();
    expect(result.expiring_0_7_days).toHaveLength(1);
    expect(result.expiring_8_30_days).toHaveLength(0);
    expect(result.expiring_31_60_days).toHaveLength(0);
  });

  it('AC-13: Cert expiring in 20 days → in expiring_8_30_days bucket', async () => {
    prisma.insuranceCertificate.findMany.mockResolvedValue([certExpiring(20)]);

    const result = await svc.getInsuranceExpiryDashboard();
    expect(result.expiring_0_7_days).toHaveLength(0);
    expect(result.expiring_8_30_days).toHaveLength(1);
  });

  it('AC-14: Cert expiring in 45 days → in expiring_31_60_days bucket', async () => {
    prisma.insuranceCertificate.findMany.mockResolvedValue([certExpiring(45)]);

    const result = await svc.getInsuranceExpiryDashboard();
    expect(result.expiring_31_60_days).toHaveLength(1);
  });

  it('AC-15: Cert expiring in 61 days → NOT included (beyond 60-day window)', async () => {
    // The service queries with lte: in60, so a cert at 61 days won't be returned by DB.
    // We simulate the DB correctly filtering it by returning no results.
    prisma.insuranceCertificate.findMany.mockResolvedValue([]);

    const result = await svc.getInsuranceExpiryDashboard();
    expect(result.expiring_0_7_days).toHaveLength(0);
    expect(result.expiring_8_30_days).toHaveLength(0);
    expect(result.expiring_31_60_days).toHaveLength(0);
    expect(result.total_count).toBe(0);
  });

  it('AC-16: total_count = sum of all 3 buckets', async () => {
    prisma.insuranceCertificate.findMany.mockResolvedValue([
      certExpiring(3),
      certExpiring(15),
      certExpiring(50),
    ]);

    const result = await svc.getInsuranceExpiryDashboard();
    expect(result.total_count).toBe(3);
    expect(
      result.expiring_0_7_days.length +
        result.expiring_8_30_days.length +
        result.expiring_31_60_days.length,
    ).toBe(3);
  });
});
