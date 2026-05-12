import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const { transitionOrderMock } = vi.hoisted(() => ({
  transitionOrderMock: vi.fn(),
}));

const { createTransferMock, refundPaymentIntentMock } = vi.hoisted(() => ({
  createTransferMock: vi.fn(),
  refundPaymentIntentMock: vi.fn(),
}));

vi.mock('../order-state-machine.service.js', () => ({
  transitionOrder: transitionOrderMock,
}));

vi.mock('../stripe.service.js', () => ({
  createTransfer: createTransferMock,
  refundPaymentIntent: refundPaymentIntentMock,
}));

import { DisputeService } from '../dispute.service.js';

function makePrisma() {
  const tx = {
    dispute: { create: vi.fn() },
  };

  return {
    order: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    dispute: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    disputeSubmission: { create: vi.fn() },
    contractorProfile: { findUnique: vi.fn() },
    user: { findUniqueOrThrow: vi.fn() },
    auditLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx)),
    _tx: tx,
  };
}

function makeQueue() {
  return { add: vi.fn(async () => ({})) };
}

function orderBase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order_1',
    status: 'IN_PROGRESS',
    customer_id: 'customer_1',
    contractor_user_id: 'contractor_user_1',
    customer: { id: 'customer_1', full_name: 'Customer', email: 'customer@test.com' },
    contractor_user: { id: 'contractor_user_1', full_name: 'Contractor', email: 'contractor@test.com' },
    dispute: null,
    scope_snapshot: { title: 'Firewall task' },
    price_aud: new Prisma.Decimal(1000),
    tax_amount_aud: new Prisma.Decimal(100),
    total_amount_aud: new Prisma.Decimal(1100),
    stripe_payment_intent_id: 'pi_1',
    contractor_profile: {
      completed_orders_count: 0,
      stripe_connect_account: { stripe_account_id: 'acct_1' },
    },
    ...overrides,
  };
}

describe('DisputeService.fileDispute()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: DisputeService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new DisputeService(prisma as never, queue as never);
    transitionOrderMock.mockResolvedValue({ id: 'order_1', status: 'DISPUTED' });
    prisma._tx.dispute.create.mockResolvedValue({
      id: 'disp_1',
      status: 'OPEN',
      submission_window_ends_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
  });

  it('DS-01: customer files from IN_PROGRESS -> order DISPUTED, dispute created, 72h window, priority emails', async () => {
    prisma.order.findUnique.mockResolvedValue(orderBase({ status: 'IN_PROGRESS' }));

    const before = Date.now();
    const result = await svc.fileDispute(
      'order_1',
      'customer_1',
      {
        grounds: 'SCOPE_MISMATCH',
        description: 'Work differs from scope',
        evidence_blob_paths: ['a.pdf'],
      } as never,
      { ip: '127.0.0.1', userAgent: 'vitest' },
    );

    expect(transitionOrderMock).toHaveBeenCalledWith(expect.anything(), 'order_1', 'DISPUTED', 'customer_1');
    expect(prisma._tx.dispute.create).toHaveBeenCalledOnce();
    expect(result.order.status).toBe('DISPUTED');

    const endsAt = prisma._tx.dispute.create.mock.calls[0][0].data.submission_window_ends_at as Date;
    const diffHrs = (endsAt.getTime() - before) / (1000 * 60 * 60);
    expect(diffHrs).toBeGreaterThan(71.9);
    expect(diffHrs).toBeLessThan(72.1);

    expect(queue.add).toHaveBeenCalledWith(
      'dispute-admin-alert',
      expect.objectContaining({ type: 'dispute-filed-admin-alert', order_id: 'order_1' }),
      { priority: 1 },
    );
    expect(queue.add).toHaveBeenCalledWith(
      'dispute-other-party-notice',
      expect.objectContaining({ type: 'dispute-filed-notice', to: 'contractor@test.com' }),
      { priority: 1 },
    );
  });

  it('DS-02: contractor files from PENDING_REVIEW -> role identified and allowed', async () => {
    prisma.order.findUnique.mockResolvedValue(orderBase({ status: 'PENDING_REVIEW' }));

    await svc.fileDispute(
      'order_1',
      'contractor_user_1',
      {
        grounds: 'PAYMENT_ISSUE',
        description: 'Need admin review',
        evidence_blob_paths: [],
      } as never,
      { ip: '127.0.0.1', userAgent: 'vitest' },
    );

    expect(queue.add).toHaveBeenCalledWith(
      'dispute-admin-alert',
      expect.objectContaining({ raised_by_role: 'contractor' }),
      { priority: 1 },
    );
  });

  it('DS-03: COMPLETED order -> DISPUTE_NOT_ALLOWED 422', async () => {
    prisma.order.findUnique.mockResolvedValue(orderBase({ status: 'COMPLETED' }));

    await expect(
      svc.fileDispute(
        'order_1',
        'customer_1',
        {
          grounds: 'SCOPE_MISMATCH',
          description: 'x',
          evidence_blob_paths: [],
        } as never,
        { ip: '127.0.0.1', userAgent: 'vitest' },
      ),
    ).rejects.toMatchObject({ code: 'DISPUTE_NOT_ALLOWED', status: 422 });
  });

  it('DS-04: existing dispute -> DISPUTE_EXISTS 409', async () => {
    prisma.order.findUnique.mockResolvedValue(orderBase({ dispute: { id: 'disp_existing' } }));

    await expect(
      svc.fileDispute(
        'order_1',
        'customer_1',
        {
          grounds: 'SCOPE_MISMATCH',
          description: 'x',
          evidence_blob_paths: [],
        } as never,
        { ip: '127.0.0.1', userAgent: 'vitest' },
      ),
    ).rejects.toMatchObject({ code: 'DISPUTE_EXISTS', status: 409 });
  });

  it('DS-05: unrelated user -> FORBIDDEN 403', async () => {
    prisma.order.findUnique.mockResolvedValue(orderBase());

    await expect(
      svc.fileDispute(
        'order_1',
        'outsider',
        {
          grounds: 'SCOPE_MISMATCH',
          description: 'x',
          evidence_blob_paths: [],
        } as never,
        { ip: '127.0.0.1', userAgent: 'vitest' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});

describe('DisputeService.addDisputeSubmission()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: DisputeService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new DisputeService(prisma as never, queue as never);
  });

  it('DS-06: within 72h window -> submission created', async () => {
    prisma.dispute.findUnique.mockResolvedValue({
      id: 'disp_1',
      status: 'OPEN',
      submission_window_ends_at: new Date(Date.now() + 60_000),
      order: { customer_id: 'customer_1', contractor_user_id: 'contractor_user_1' },
    });
    prisma.disputeSubmission.create.mockResolvedValue({ id: 'sub_1' });

    const result = await svc.addDisputeSubmission('disp_1', 'customer_1', {
      description: 'Evidence attached',
      file_blob_paths: ['a.pdf'],
    } as never);

    expect(result.id).toBe('sub_1');
    expect(prisma.disputeSubmission.create).toHaveBeenCalledOnce();
  });

  it('DS-07: window closed -> SUBMISSION_WINDOW_CLOSED 422', async () => {
    prisma.dispute.findUnique.mockResolvedValue({
      id: 'disp_1',
      status: 'OPEN',
      submission_window_ends_at: new Date(Date.now() - 60_000),
      order: { customer_id: 'customer_1', contractor_user_id: 'contractor_user_1' },
    });

    await expect(
      svc.addDisputeSubmission('disp_1', 'customer_1', {
        description: 'late',
        file_blob_paths: [],
      } as never),
    ).rejects.toMatchObject({ code: 'SUBMISSION_WINDOW_CLOSED', status: 422 });
  });

  it('DS-08: dispute determined -> DISPUTE_ALREADY_DETERMINED 422', async () => {
    prisma.dispute.findUnique.mockResolvedValue({
      id: 'disp_1',
      status: 'DETERMINED',
      submission_window_ends_at: new Date(Date.now() + 60_000),
      order: { customer_id: 'customer_1', contractor_user_id: 'contractor_user_1' },
    });

    await expect(
      svc.addDisputeSubmission('disp_1', 'customer_1', {
        description: 'x',
        file_blob_paths: [],
      } as never),
    ).rejects.toMatchObject({ code: 'DISPUTE_ALREADY_DETERMINED', status: 422 });
  });
});

describe('DisputeService.appointArbitrator()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: DisputeService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new DisputeService(prisma as never, queue as never);
  });

  it('DS-09: appoint active non-party arbitrator -> UNDER_REVIEW and email queued', async () => {
    prisma.dispute.findUnique.mockResolvedValue({ id: 'disp_1', status: 'OPEN', order_id: 'order_1', grounds: 'QUALITY' });
    prisma.contractorProfile.findUnique.mockResolvedValue({
      id: 'cp_arb',
      user_id: 'arb_user',
      status: 'ACTIVE',
      user: { id: 'arb_user', full_name: 'Arb', email: 'arb@test.com' },
    });
    prisma.order.findUnique.mockResolvedValue({ customer_id: 'customer_1', contractor_user_id: 'contractor_user_1' });
    prisma.dispute.update.mockResolvedValue({ id: 'disp_1', status: 'UNDER_REVIEW', arbitrator_profile_id: 'cp_arb' });

    const result = await svc.appointArbitrator('disp_1', 'admin_1', {
      arbitrator_contractor_id: 'cp_arb',
      appointment_notes: 'Please review',
    } as never);

    expect(result.status).toBe('UNDER_REVIEW');
    expect(queue.add).toHaveBeenCalledWith(
      'arbitrator-appointed',
      expect.objectContaining({ type: 'arbitrator-appointed', to: 'arb@test.com' }),
    );
  });

  it('DS-10: arbitrator is party -> ARBITRATOR_IS_PARTY 422', async () => {
    prisma.dispute.findUnique.mockResolvedValue({ id: 'disp_1', status: 'OPEN', order_id: 'order_1', grounds: 'QUALITY' });
    prisma.contractorProfile.findUnique.mockResolvedValue({
      id: 'cp_arb',
      user_id: 'contractor_user_1',
      status: 'ACTIVE',
      user: { id: 'contractor_user_1', full_name: 'Arb', email: 'arb@test.com' },
    });
    prisma.order.findUnique.mockResolvedValue({ customer_id: 'customer_1', contractor_user_id: 'contractor_user_1' });

    await expect(
      svc.appointArbitrator('disp_1', 'admin_1', { arbitrator_contractor_id: 'cp_arb' } as never),
    ).rejects.toMatchObject({ code: 'ARBITRATOR_IS_PARTY', status: 422 });
  });

  it('DS-11: arbitrator not active -> ARBITRATOR_NOT_ACTIVE 422', async () => {
    prisma.dispute.findUnique.mockResolvedValue({ id: 'disp_1', status: 'OPEN', order_id: 'order_1', grounds: 'QUALITY' });
    prisma.contractorProfile.findUnique.mockResolvedValue({
      id: 'cp_arb',
      user_id: 'arb_user',
      status: 'SUSPENDED',
      user: { id: 'arb_user', full_name: 'Arb', email: 'arb@test.com' },
    });

    await expect(
      svc.appointArbitrator('disp_1', 'admin_1', { arbitrator_contractor_id: 'cp_arb' } as never),
    ).rejects.toMatchObject({ code: 'ARBITRATOR_NOT_ACTIVE', status: 422 });
  });
});

describe('DisputeService.issueDetermination()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: DisputeService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new DisputeService(prisma as never, queue as never);

    prisma.dispute.findUnique.mockResolvedValue({ id: 'disp_1', status: 'UNDER_REVIEW', order_id: 'order_1' });
    prisma.order.findUniqueOrThrow.mockResolvedValue(orderBase({ status: 'DISPUTED' }));

    prisma.dispute.update
      .mockResolvedValueOnce({ id: 'disp_1', status: 'DETERMINED' })
      .mockResolvedValueOnce({ id: 'disp_1', status: 'CLOSED', payment_action_status: 'COMPLETED' });

    createTransferMock.mockResolvedValue({ id: 'tr_1' });
    refundPaymentIntentMock.mockResolvedValue({ id: 're_1' });
    transitionOrderMock.mockResolvedValue({ id: 'order_1', status: 'COMPLETED' });
  });

  it('DS-12: FULL_PAYMENT -> transfer created, order completed, dispute closed, both emails queued', async () => {
    const result = await svc.issueDetermination('disp_1', 'admin_1', {
      outcome: 'FULL_PAYMENT',
      written_reasons: 'Work delivered',
    } as never);

    expect(createTransferMock).toHaveBeenCalledOnce();
    expect(transitionOrderMock).toHaveBeenCalledWith(prisma, 'order_1', 'COMPLETED', 'admin_1', { skipGuards: true });
    expect(result.dispute.status).toBe('CLOSED');
    expect(queue.add).toHaveBeenCalledWith(
      'dispute-determination-issued',
      expect.objectContaining({ to: 'customer@test.com', outcome: 'FULL_PAYMENT' }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'dispute-determination-issued',
      expect.objectContaining({ to: 'contractor@test.com', outcome: 'FULL_PAYMENT' }),
    );
  });

  it('DS-13: FULL_REFUND -> refund called, order completed, dispute closed', async () => {
    await svc.issueDetermination('disp_1', 'admin_1', {
      outcome: 'FULL_REFUND',
      written_reasons: 'Refund justified',
    } as never);

    expect(refundPaymentIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: 'pi_1', reason: 'requested_by_customer' }),
    );
    expect(transitionOrderMock).toHaveBeenCalledOnce();
  });

  it('DS-14: PARTIAL_PAYMENT -> transfer + refund and payment_result contains both IDs', async () => {
    const result = await svc.issueDetermination('disp_1', 'admin_1', {
      outcome: 'PARTIAL_PAYMENT',
      payment_amount_aud: 600,
      written_reasons: 'Partial work complete',
    } as never);

    expect(createTransferMock).toHaveBeenCalledOnce();
    expect(refundPaymentIntentMock).toHaveBeenCalledOnce();
    expect(result.payment_result).toMatchObject({
      action: 'PARTIAL_SPLIT',
      transfer_id: 'tr_1',
      refund_id: 're_1',
    });
  });

  it('DS-15: REMEDY_REQUIRED -> no stripe action, order remains disputed, status DETERMINED', async () => {
    prisma.dispute.update.mockReset();
    prisma.dispute.update
      .mockResolvedValueOnce({ id: 'disp_1', status: 'DETERMINED' })
      .mockResolvedValueOnce({ id: 'disp_1', status: 'DETERMINED', payment_action_status: 'COMPLETED' });

    const result = await svc.issueDetermination('disp_1', 'admin_1', {
      outcome: 'REMEDY_REQUIRED',
      written_reasons: 'Contractor must fix deliverables',
    } as never);

    expect(createTransferMock).not.toHaveBeenCalled();
    expect(refundPaymentIntentMock).not.toHaveBeenCalled();
    expect(transitionOrderMock).not.toHaveBeenCalled();
    expect(result.dispute.status).toBe('DETERMINED');
  });

  it('DS-16: partial exceeds order amount -> AMOUNT_EXCEEDS_ORDER 422', async () => {
    await expect(
      svc.issueDetermination('disp_1', 'admin_1', {
        outcome: 'PARTIAL_PAYMENT',
        payment_amount_aud: 1001,
        written_reasons: 'invalid',
      } as never),
    ).rejects.toMatchObject({ code: 'AMOUNT_EXCEEDS_ORDER', status: 422 });
  });

  it('DS-17: already determined -> DISPUTE_ALREADY_DETERMINED 409', async () => {
    prisma.dispute.findUnique.mockResolvedValue({ id: 'disp_1', status: 'DETERMINED', order_id: 'order_1' });

    await expect(
      svc.issueDetermination('disp_1', 'admin_1', {
        outcome: 'FULL_PAYMENT',
        written_reasons: 'x',
      } as never),
    ).rejects.toMatchObject({ code: 'DISPUTE_ALREADY_DETERMINED', status: 409 });
  });
});
