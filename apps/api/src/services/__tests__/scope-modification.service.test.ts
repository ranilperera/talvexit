import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScopeModificationRequest } from '@prisma/client';
import { ScopeModificationService } from '../scope-modification.service.js';
import { respondSmrSchema } from '@onys/shared';

// ─── Fake factories ──────────────────────────────────────────────────────────

function fakeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order_1',
    customer_id: 'user_customer',
    status: 'IN_PROGRESS',
    contractor_user_id: 'user_contractor',
    task_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function fakeSmr(overrides: Partial<ScopeModificationRequest> = {}): ScopeModificationRequest {
  return {
    id: 'smr_1',
    order_id: 'order_1',
    round_number: 1,
    requested_by_user_id: 'user_customer',
    element_type: 'PRICE',
    original_value: { amount: 500 },
    requested_value: { amount: 450 },
    reason: 'The price is too high for the scope of work described here',
    status: 'PENDING',
    responded_by_user_id: null,
    response: null,
    response_notes: null,
    revised_scope: null,
    revised_price: null,
    revised_price_aud: null,
    responded_at: null,
    expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as ScopeModificationRequest;
}

const VALID_SMR_INPUT = {
  element_type: 'PRICE' as const,
  original_value: { amount: 500 },
  requested_value: { amount: 450 },
  reason: 'The price is too high for the scope of work described here',
};

// ─── Mock factory ────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    order: { findUnique: vi.fn() },
    scopeModificationRequest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  };
}

function makeQueue() {
  return { add: vi.fn() };
}

const META = { ip: '127.0.0.1', userAgent: 'test-agent' };

// ─── ScopeModificationService.createSmr() ────────────────────────────────────

describe('ScopeModificationService.createSmr()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: ScopeModificationService;

  beforeEach(() => {
    prisma = makePrisma();
    queue = makeQueue();
    svc = new ScopeModificationService(prisma as never, queue as never);
  });

  it('SM-01: Valid round 1 SMR by customer → round_number=1, email queued', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder());
    prisma.scopeModificationRequest.findMany.mockResolvedValue([]);
    const smr = fakeSmr();
    prisma.scopeModificationRequest.create.mockResolvedValue(smr);
    prisma.user.findUnique.mockResolvedValue({ email: 'contractor@example.com' });

    const result = await svc.createSmr('order_1', 'user_customer', VALID_SMR_INPUT, META);

    expect(prisma.scopeModificationRequest.create).toHaveBeenCalledOnce();
    const createData = prisma.scopeModificationRequest.create.mock.calls[0][0].data;
    expect(createData.round_number).toBe(1);
    expect(createData.status).toBe('PENDING');
    expect(queue.add).toHaveBeenCalledWith('smr-received', expect.objectContaining({ type: 'smr-received' }));
    expect(result.id).toBe('smr_1');
  });

  it('SM-02: Valid round 1 SMR by contractor → created successfully', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder());
    prisma.scopeModificationRequest.findMany.mockResolvedValue([]);
    prisma.scopeModificationRequest.create.mockResolvedValue(fakeSmr({ requested_by_user_id: 'user_contractor' }));
    prisma.user.findUnique.mockResolvedValue({ email: 'customer@example.com' });

    const result = await svc.createSmr('order_1', 'user_contractor', VALID_SMR_INPUT, META);

    expect(prisma.scopeModificationRequest.create).toHaveBeenCalledOnce();
    expect(result.requested_by_user_id).toBe('user_contractor');
  });

  it('SM-03: Round 2 without round 1 ACCEPT_WITH_REVISION → throws ROUND_2_NOT_ELIGIBLE 422', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder());
    // 1 completed round with DECLINE response
    prisma.scopeModificationRequest.findMany.mockResolvedValue([
      fakeSmr({ round_number: 1, status: 'RESPONDED', response: 'DECLINE' }),
    ]);

    await expect(svc.createSmr('order_1', 'user_customer', VALID_SMR_INPUT, META))
      .rejects.toMatchObject({ code: 'ROUND_2_NOT_ELIGIBLE', status: 422 });
  });

  it('SM-04: Round 2 after round 1 ACCEPT_WITH_REVISION → allowed', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder());
    prisma.scopeModificationRequest.findMany.mockResolvedValue([
      fakeSmr({ round_number: 1, status: 'RESPONDED', response: 'ACCEPT_WITH_REVISION' }),
    ]);
    prisma.scopeModificationRequest.create.mockResolvedValue(fakeSmr({ round_number: 2 }));
    prisma.user.findUnique.mockResolvedValue({ email: 'contractor@example.com' });

    const result = await svc.createSmr('order_1', 'user_customer', VALID_SMR_INPUT, META);

    expect(prisma.scopeModificationRequest.create).toHaveBeenCalledOnce();
    const createData = prisma.scopeModificationRequest.create.mock.calls[0][0].data;
    expect(createData.round_number).toBe(2);
    expect(result.round_number).toBe(2);
  });

  it('SM-05: 2 completed rounds → throws MODIFICATION_ROUNDS_EXHAUSTED 422', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder());
    prisma.scopeModificationRequest.findMany.mockResolvedValue([
      fakeSmr({ round_number: 1, status: 'RESPONDED', response: 'ACCEPT_WITH_REVISION' }),
      fakeSmr({ id: 'smr_2', round_number: 2, status: 'RESPONDED', response: 'ACCEPT' }),
    ]);

    await expect(svc.createSmr('order_1', 'user_customer', VALID_SMR_INPUT, META))
      .rejects.toMatchObject({ code: 'MODIFICATION_ROUNDS_EXHAUSTED', status: 422 });
  });

  it('SM-06: Pending SMR already exists → throws SMR_ALREADY_PENDING 409', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder());
    prisma.scopeModificationRequest.findMany.mockResolvedValue([
      fakeSmr({ status: 'PENDING' }),
    ]);

    await expect(svc.createSmr('order_1', 'user_customer', VALID_SMR_INPUT, META))
      .rejects.toMatchObject({ code: 'SMR_ALREADY_PENDING', status: 409 });
  });

  it('SM-07: Order in COMPLETED status → throws ORDER_NOT_MODIFIABLE 422', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder({ status: 'COMPLETED' }));
    prisma.scopeModificationRequest.findMany.mockResolvedValue([]);

    await expect(svc.createSmr('order_1', 'user_customer', VALID_SMR_INPUT, META))
      .rejects.toMatchObject({ code: 'ORDER_NOT_MODIFIABLE', status: 422 });
  });

  it('SM-08: Unrelated user → throws FORBIDDEN 403', async () => {
    prisma.order.findUnique.mockResolvedValue(fakeOrder());

    await expect(svc.createSmr('order_1', 'user_unrelated', VALID_SMR_INPUT, META))
      .rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});

// ─── ScopeModificationService.respondToSmr() ─────────────────────────────────

describe('ScopeModificationService.respondToSmr()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: ScopeModificationService;

  beforeEach(() => {
    prisma = makePrisma();
    queue = makeQueue();
    svc = new ScopeModificationService(prisma as never, queue as never);
    // Default order lookup
    prisma.order.findUnique.mockResolvedValue(fakeOrder());
    // Default requester for email
    prisma.user.findUnique.mockResolvedValue({ email: 'customer@example.com' });
  });

  it('SM-09: ACCEPT response → SMR status RESPONDED, email queued', async () => {
    prisma.scopeModificationRequest.findUnique.mockResolvedValue(fakeSmr());
    const responded = fakeSmr({ status: 'RESPONDED', response: 'ACCEPT', responded_at: new Date() });
    prisma.scopeModificationRequest.update.mockResolvedValue(responded);

    const result = await svc.respondToSmr('order_1', 'smr_1', 'user_contractor', {
      response: 'ACCEPT',
    });

    expect(prisma.scopeModificationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RESPONDED', response: 'ACCEPT' }) }),
    );
    expect(queue.add).toHaveBeenCalledWith('smr-responded', expect.objectContaining({ type: 'smr-responded', response: 'ACCEPT' }));
    expect(result.status).toBe('RESPONDED');
  });

  it('SM-10: DECLINE response → SMR status RESPONDED', async () => {
    prisma.scopeModificationRequest.findUnique.mockResolvedValue(fakeSmr());
    const responded = fakeSmr({ status: 'RESPONDED', response: 'DECLINE' });
    prisma.scopeModificationRequest.update.mockResolvedValue(responded);

    const result = await svc.respondToSmr('order_1', 'smr_1', 'user_contractor', {
      response: 'DECLINE',
    });

    expect(result.response).toBe('DECLINE');
  });

  it('SM-11: ACCEPT_WITH_REVISION with revised_scope → allowed', async () => {
    prisma.scopeModificationRequest.findUnique.mockResolvedValue(fakeSmr());
    const responded = fakeSmr({ status: 'RESPONDED', response: 'ACCEPT_WITH_REVISION' });
    prisma.scopeModificationRequest.update.mockResolvedValue(responded);

    await svc.respondToSmr('order_1', 'smr_1', 'user_contractor', {
      response: 'ACCEPT_WITH_REVISION',
      revised_scope: { new_deliverable: 'Updated scope item here' },
    });

    const updateData = prisma.scopeModificationRequest.update.mock.calls[0][0].data;
    expect(updateData.response).toBe('ACCEPT_WITH_REVISION');
    expect(updateData.revised_scope).toBeDefined();
  });

  it('SM-12: ACCEPT_WITH_REVISION with no revised data → Zod rejects', () => {
    const result = respondSmrSchema.safeParse({ response: 'ACCEPT_WITH_REVISION' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('revised_scope') || i.message.includes('ACCEPT_WITH_REVISION'))).toBe(true);
    }
  });

  it('SM-13: Requester responds to own SMR → throws CANNOT_RESPOND_OWN_SMR 403', async () => {
    prisma.scopeModificationRequest.findUnique.mockResolvedValue(
      fakeSmr({ requested_by_user_id: 'user_contractor' }),
    );

    await expect(
      svc.respondToSmr('order_1', 'smr_1', 'user_contractor', { response: 'ACCEPT' }),
    ).rejects.toMatchObject({ code: 'CANNOT_RESPOND_OWN_SMR', status: 403 });
  });

  it('SM-14: Expired SMR → throws SMR_EXPIRED 422', async () => {
    prisma.scopeModificationRequest.findUnique.mockResolvedValue(
      fakeSmr({ expires_at: new Date(Date.now() - 1000) }), // 1 second in the past
    );

    await expect(
      svc.respondToSmr('order_1', 'smr_1', 'user_contractor', { response: 'ACCEPT' }),
    ).rejects.toMatchObject({ code: 'SMR_EXPIRED', status: 422 });
  });

  it('SM-15: Already responded SMR → throws SMR_ALREADY_RESPONDED 409', async () => {
    prisma.scopeModificationRequest.findUnique.mockResolvedValue(
      fakeSmr({ status: 'RESPONDED', response: 'ACCEPT' }),
    );

    await expect(
      svc.respondToSmr('order_1', 'smr_1', 'user_contractor', { response: 'DECLINE' }),
    ).rejects.toMatchObject({ code: 'SMR_ALREADY_RESPONDED', status: 409 });
  });
});
