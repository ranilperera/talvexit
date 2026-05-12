import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@prisma/client');
vi.mock('../insurance-tier.service.js', () => ({
  isCurrentlyValid: vi.fn(),
}));

import { transitionOrder, getOrderSlaStatus } from '../order-state-machine.service.js';
import { isCurrentlyValid } from '../insurance-tier.service.js';

type AnyOrder = Record<string, unknown> & {
  id: string;
  status: string;
  status_history: unknown[];
};

function fakeOrder(overrides: Partial<AnyOrder> = {}): AnyOrder {
  return {
    id: 'order_1',
    status: 'SCOPED',
    contractor_profile_id: 'cp_1',
    stripe_payment_intent_id: 'pi_1',
    status_history: [],
    accept_deadline_at: null,
    review_deadline_at: null,
    work_started_at: null,
    scope_snapshot: { hours_max: 8 },
    completed_at: null,
    ...overrides,
  };
}

function makePrisma(initialOrder: AnyOrder) {
  let stored = { ...initialOrder };
  const prisma = {
    order: {
      findUnique: vi.fn(async () => ({ ...stored })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        stored = { ...stored, ...data };
        return { ...stored };
      }),
    },
    contractorProfile: {
      findUnique: vi.fn(),
    },
    orderDeliverable: {
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn(async () => ({})),
    },
    getStored: () => ({ ...stored }),
  };
  return prisma;
}

describe('transitionOrder() - allowed transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('OM-01: SCOPED -> ACCEPTED by customer -> order updated, status history entry appended', async () => {
    const prisma = makePrisma(fakeOrder({ status: 'SCOPED' }));
    const updated = await transitionOrder(prisma as never, 'order_1', 'ACCEPTED', 'customer_1');

    expect(updated.status).toBe('ACCEPTED');
    const history = updated.status_history as Array<Record<string, unknown>>;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      from: 'SCOPED',
      to: 'ACCEPTED',
      actor_id: 'customer_1',
    });
    expect(typeof history[0].at).toBe('string');
  });

  it('OM-02: ACCEPTED -> PAYMENT_HELD with valid insurance -> allowed', async () => {
    const prisma = makePrisma(fakeOrder({ status: 'ACCEPTED' }));
    prisma.contractorProfile.findUnique.mockResolvedValue({ id: 'cp_1', insurance_certificates: [{}] });
    vi.mocked(isCurrentlyValid).mockReturnValue(true);

    const updated = await transitionOrder(prisma as never, 'order_1', 'PAYMENT_HELD', 'customer_1');

    expect(updated.status).toBe('PAYMENT_HELD');
    expect(prisma.contractorProfile.findUnique).toHaveBeenCalledOnce();
  });

  it('OM-03: ACCEPTED -> PAYMENT_HELD with EXPIRED insurance -> INSURANCE_EXPIRED 402', async () => {
    const prisma = makePrisma(fakeOrder({ status: 'ACCEPTED' }));
    prisma.contractorProfile.findUnique.mockResolvedValue({ id: 'cp_1', insurance_certificates: [{}] });
    vi.mocked(isCurrentlyValid).mockReturnValue(false);

    await expect(
      transitionOrder(prisma as never, 'order_1', 'PAYMENT_HELD', 'customer_1'),
    ).rejects.toMatchObject({ code: 'INSURANCE_EXPIRED', status: 402 });
  });

  it('OM-04: IN_PROGRESS -> PENDING_REVIEW with deliverables -> allowed', async () => {
    const prisma = makePrisma(fakeOrder({ status: 'IN_PROGRESS' }));
    prisma.orderDeliverable.count.mockResolvedValue(2);

    const updated = await transitionOrder(prisma as never, 'order_1', 'PENDING_REVIEW', 'contractor_1');

    expect(updated.status).toBe('PENDING_REVIEW');
    expect(updated.review_deadline_at).toBeInstanceOf(Date);
  });

  it('OM-05: IN_PROGRESS -> PENDING_REVIEW with no deliverables -> NO_DELIVERABLES 422', async () => {
    const prisma = makePrisma(fakeOrder({ status: 'IN_PROGRESS' }));
    prisma.orderDeliverable.count.mockResolvedValue(0);

    await expect(
      transitionOrder(prisma as never, 'order_1', 'PENDING_REVIEW', 'contractor_1'),
    ).rejects.toMatchObject({ code: 'NO_DELIVERABLES', status: 422 });
  });

  it('OM-06: PENDING_REVIEW -> COMPLETED sets completed_at and history entry', async () => {
    const prisma = makePrisma(fakeOrder({ status: 'PENDING_REVIEW' }));
    const updated = await transitionOrder(prisma as never, 'order_1', 'COMPLETED', 'customer_1');

    expect(updated.status).toBe('COMPLETED');
    expect(updated.completed_at).toBeInstanceOf(Date);
    const history = updated.status_history as Array<Record<string, unknown>>;
    expect(history.at(-1)).toMatchObject({
      from: 'PENDING_REVIEW',
      to: 'COMPLETED',
      actor_id: 'customer_1',
    });
  });

  it('OM-07: PENDING_REVIEW -> REVISION_REQUESTED allowed and history entry appended', async () => {
    const prisma = makePrisma(fakeOrder({ status: 'PENDING_REVIEW' }));
    const updated = await transitionOrder(
      prisma as never,
      'order_1',
      'REVISION_REQUESTED',
      'customer_1',
      { reason: 'Please adjust deliverable 2' },
    );

    expect(updated.status).toBe('REVISION_REQUESTED');
    const history = updated.status_history as Array<Record<string, unknown>>;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      from: 'PENDING_REVIEW',
      to: 'REVISION_REQUESTED',
      reason: 'Please adjust deliverable 2',
    });
  });
});

describe('transitionOrder() - blocked transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('OM-08: COMPLETED -> IN_PROGRESS throws INVALID_TRANSITION 422 mentioning terminal state', async () => {
    const prisma = makePrisma(fakeOrder({ status: 'COMPLETED' }));

    await expect(
      transitionOrder(prisma as never, 'order_1', 'IN_PROGRESS', 'user_1'),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 422 });

    await expect(
      transitionOrder(prisma as never, 'order_1', 'IN_PROGRESS', 'user_1'),
    ).rejects.toThrow(/terminal state/i);
  });

  it('OM-09: CANCELLED -> ACCEPTED throws INVALID_TRANSITION 422', async () => {
    const prisma = makePrisma(fakeOrder({ status: 'CANCELLED' }));

    await expect(
      transitionOrder(prisma as never, 'order_1', 'ACCEPTED', 'user_1'),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 422 });
  });

  it('OM-10: IN_PROGRESS -> SCOPED throws INVALID_TRANSITION 422', async () => {
    const prisma = makePrisma(fakeOrder({ status: 'IN_PROGRESS' }));

    await expect(
      transitionOrder(prisma as never, 'order_1', 'SCOPED', 'user_1'),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 422 });
  });
});

describe('transitionOrder() - status history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('OM-11: three sequential transitions create three history entries with correct values', async () => {
    const prisma = makePrisma(fakeOrder({ status: 'SCOPED' }));
    prisma.contractorProfile.findUnique.mockResolvedValue({ id: 'cp_1', insurance_certificates: [{}] });
    vi.mocked(isCurrentlyValid).mockReturnValue(true);

    await transitionOrder(prisma as never, 'order_1', 'ACCEPTED', 'customer_1');
    await transitionOrder(prisma as never, 'order_1', 'PAYMENT_HELD', 'customer_1');
    await transitionOrder(prisma as never, 'order_1', 'IN_PROGRESS', 'system_1', { skipGuards: true });

    const stored = prisma.getStored();
    const history = stored.status_history as Array<Record<string, unknown>>;
    expect(history).toHaveLength(3);
    expect(history[0]).toMatchObject({ from: 'SCOPED', to: 'ACCEPTED', actor_id: 'customer_1' });
    expect(history[1]).toMatchObject({ from: 'ACCEPTED', to: 'PAYMENT_HELD', actor_id: 'customer_1' });
    expect(history[2]).toMatchObject({ from: 'PAYMENT_HELD', to: 'IN_PROGRESS', actor_id: 'system_1' });
    expect(typeof history[0].at).toBe('string');
    expect(typeof history[1].at).toBe('string');
    expect(typeof history[2].at).toBe('string');
  });

  it('OM-12: admin skipGuards=true allows PAYMENT_HELD with expired insurance', async () => {
    const prisma = makePrisma(fakeOrder({ status: 'ACCEPTED' }));
    prisma.contractorProfile.findUnique.mockResolvedValue({ id: 'cp_1', insurance_certificates: [{}] });
    vi.mocked(isCurrentlyValid).mockReturnValue(false);

    const updated = await transitionOrder(
      prisma as never,
      'order_1',
      'PAYMENT_HELD',
      'admin_1',
      { skipGuards: true },
    );

    expect(updated.status).toBe('PAYMENT_HELD');
    expect(prisma.contractorProfile.findUnique).not.toHaveBeenCalled();
  });
});

describe('getOrderSlaStatus()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('OM-13: SCOPED with future accept_deadline_at -> not overdue and hours_remaining > 0', () => {
    const status = getOrderSlaStatus(
      fakeOrder({
        status: 'SCOPED',
        accept_deadline_at: new Date('2026-01-01T05:00:00.000Z'),
      }) as never,
    );

    expect(status.is_overdue).toBe(false);
    expect(status.hours_remaining).toBeGreaterThan(0);
  });

  it('OM-14: SCOPED with past accept_deadline_at -> overdue and hours_remaining = 0', () => {
    const status = getOrderSlaStatus(
      fakeOrder({
        status: 'SCOPED',
        accept_deadline_at: new Date('2025-12-31T23:00:00.000Z'),
      }) as never,
    );

    expect(status.is_overdue).toBe(true);
    expect(status.hours_remaining).toBe(0);
  });

  it('OM-15: IN_PROGRESS with hours_max=8 -> SLA deadline is 12h from work_started_at', () => {
    const status = getOrderSlaStatus(
      fakeOrder({
        status: 'IN_PROGRESS',
        work_started_at: new Date('2025-12-31T18:00:00.000Z'),
        scope_snapshot: { hours_max: 8 },
      }) as never,
    );

    expect(status.deadline?.toISOString()).toBe('2026-01-01T06:00:00.000Z');
  });

  it('OM-16: COMPLETED -> not overdue and no deadline', () => {
    const status = getOrderSlaStatus(
      fakeOrder({
        status: 'COMPLETED',
      }) as never,
    );

    expect(status.is_overdue).toBe(false);
    expect(status.deadline).toBeNull();
    expect(status.hours_remaining).toBeNull();
  });
});
