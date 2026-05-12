import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('stripe', () => ({
  default: vi.fn(),
}));

const { constructWebhookEventMock } = vi.hoisted(() => ({
  constructWebhookEventMock: vi.fn(),
}));

const { transitionOrderMock } = vi.hoisted(() => ({
  transitionOrderMock: vi.fn(),
}));

vi.mock('../stripe.service.js', () => ({
  constructWebhookEvent: constructWebhookEventMock,
}));

vi.mock('../order-state-machine.service.js', () => ({
  transitionOrder: transitionOrderMock,
}));

import { handleStripeWebhook } from '../stripe-webhook.service.js';

function makePrisma() {
  return {
    stripeWebhookEvent: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(async () => ({})),
    },
    payoutRecord: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    milestoneRelease: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    stripeConnectAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
}

function makeQueue() {
  return { add: vi.fn(async () => ({})) };
}

const RAW = Buffer.from('payload');

function makeEvent(type: string, id = 'evt_1', object: Record<string, unknown> = {}) {
  return {
    id,
    type,
    data: { object },
  };
}

describe('handleStripeWebhook() - signature verification', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
  });

  it('WH-01: invalid signature throws INVALID_SIGNATURE 401', async () => {
    constructWebhookEventMock.mockImplementation(() => {
      throw new Error('bad sig');
    });

    await expect(
      handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never),
    ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE', status: 401 });
  });

  it('WH-02: valid signature proceeds to idempotency check', async () => {
    constructWebhookEventMock.mockReturnValue(makeEvent('unknown.event'));
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.stripeWebhookEvent.upsert.mockResolvedValue({});
    prisma.stripeWebhookEvent.update.mockResolvedValue({});

    await handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never);
    expect(prisma.stripeWebhookEvent.findUnique).toHaveBeenCalledWith({
      where: { stripe_event_id: 'evt_1' },
    });
  });
});

describe('handleStripeWebhook() - idempotency', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
  });

  it('WH-03: already processed event returns immediately', async () => {
    constructWebhookEventMock.mockReturnValue(makeEvent('payment_intent.succeeded'));
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue({ processed: true });

    const result = await handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never);

    expect(result).toMatchObject({ received: true, event_type: 'payment_intent.succeeded' });
    expect(prisma.stripeWebhookEvent.upsert).not.toHaveBeenCalled();
    expect(transitionOrderMock).not.toHaveBeenCalled();
  });

  it('WH-04: stored but not processed runs handler then marks processed', async () => {
    constructWebhookEventMock.mockReturnValue(
      makeEvent('payment_intent.succeeded', 'evt_4', {
        id: 'pi_1',
        metadata: { order_id: 'order_1' },
      }),
    );
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue({ processed: false });
    prisma.stripeWebhookEvent.upsert.mockResolvedValue({});
    prisma.order.findUnique.mockResolvedValue({ id: 'order_1', status: 'SCOPED' });
    prisma.stripeWebhookEvent.update.mockResolvedValue({});

    await handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never);

    expect(transitionOrderMock).toHaveBeenCalled();
    expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: true }) }),
    );
  });
});

describe('handleStripeWebhook() - payment_intent.succeeded', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.stripeWebhookEvent.upsert.mockResolvedValue({});
    prisma.stripeWebhookEvent.update.mockResolvedValue({});
  });

  it('WH-05: valid PI metadata order_id transitions to PAYMENT_HELD and writes audit', async () => {
    constructWebhookEventMock.mockReturnValue(
      makeEvent('payment_intent.succeeded', 'evt_5', {
        id: 'pi_1',
        metadata: { order_id: 'order_1' },
        amount: 110000,
      }),
    );
    prisma.order.findUnique.mockResolvedValue({ id: 'order_1', status: 'SCOPED' });

    await handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never);
    expect(transitionOrderMock).toHaveBeenCalledWith(
      prisma,
      'order_1',
      'PAYMENT_HELD',
      'stripe-webhook',
      { skipGuards: true },
    );
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
  });

  it('WH-06: order already PAYMENT_HELD skips transition', async () => {
    constructWebhookEventMock.mockReturnValue(
      makeEvent('payment_intent.succeeded', 'evt_6', {
        id: 'pi_1',
        metadata: { order_id: 'order_1' },
      }),
    );
    prisma.order.findUnique.mockResolvedValue({ id: 'order_1', status: 'PAYMENT_HELD' });

    await handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never);
    expect(transitionOrderMock).not.toHaveBeenCalled();
  });

  it('WH-07: unknown order_id logs warning and returns', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    constructWebhookEventMock.mockReturnValue(
      makeEvent('payment_intent.succeeded', 'evt_7', {
        id: 'pi_1',
        metadata: { order_id: 'missing_order' },
      }),
    );
    prisma.order.findUnique.mockResolvedValue(null);

    await handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never);
    expect(warnSpy).toHaveBeenCalled();
    expect(transitionOrderMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('handleStripeWebhook() - payment_intent.payment_failed', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.stripeWebhookEvent.upsert.mockResolvedValue({});
    prisma.stripeWebhookEvent.update.mockResolvedValue({});
  });

  it('WH-08: valid PI failure writes audit and queues customer email', async () => {
    constructWebhookEventMock.mockReturnValue(
      makeEvent('payment_intent.payment_failed', 'evt_8', {
        id: 'pi_fail',
        metadata: { order_id: 'order_1' },
        last_payment_error: { code: 'card_declined', message: 'Declined' },
      }),
    );
    prisma.order.findUnique.mockResolvedValue({
      id: 'order_1',
      customer: { email: 'cust@test.com', full_name: 'Customer' },
    });

    await handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never);
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledWith(
      'payment-failed',
      expect.objectContaining({ type: 'payment-failed', order_id: 'order_1' }),
    );
  });

  it('WH-09: missing order_id returns silently', async () => {
    constructWebhookEventMock.mockReturnValue(
      makeEvent('payment_intent.payment_failed', 'evt_9', {
        id: 'pi_fail',
        metadata: {},
      }),
    );

    await handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe('handleStripeWebhook() - transfer.paid', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.stripeWebhookEvent.upsert.mockResolvedValue({});
    prisma.stripeWebhookEvent.update.mockResolvedValue({});
  });

  it('WH-10: payout record found updates payout/order and queues contractor email', async () => {
    constructWebhookEventMock.mockReturnValue(
      makeEvent('transfer.paid', 'evt_10', {
        id: 'tr_1',
        amount: 80000,
        metadata: { order_id: 'order_1' },
      }),
    );
    prisma.payoutRecord.findFirst.mockResolvedValue({
      id: 'po_1',
      contractor_profile: { user: { email: 'contractor@test.com', full_name: 'Contractor' } },
    });
    prisma.payoutRecord.update.mockResolvedValue({});
    prisma.order.update.mockResolvedValue({});

    await handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never);
    expect(prisma.payoutRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: { payout_status: 'COMPLETED' },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'payout-completed',
      expect.objectContaining({ type: 'payout-completed', order_id: 'order_1' }),
    );
  });

  it('WH-11: milestone transfer updates milestone release status TRANSFERRED', async () => {
    constructWebhookEventMock.mockReturnValue(
      makeEvent('transfer.paid', 'evt_11', {
        id: 'tr_m1',
        amount: 20000,
        metadata: { order_id: 'order_2' },
      }),
    );
    prisma.payoutRecord.findFirst.mockResolvedValue(null);
    prisma.milestoneRelease.findFirst.mockResolvedValue({ id: 'mr_1' });
    prisma.milestoneRelease.update.mockResolvedValue({});

    await handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never);
    expect(prisma.milestoneRelease.update).toHaveBeenCalledWith({
      where: { id: 'mr_1' },
      data: { status: 'TRANSFERRED' },
    });
  });

  it('WH-12: transfer id not found in any record logs warning and no throw', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    constructWebhookEventMock.mockReturnValue(
      makeEvent('transfer.paid', 'evt_12', {
        id: 'tr_missing',
        amount: 1000,
        metadata: { order_id: 'order_3' },
      }),
    );
    prisma.payoutRecord.findFirst.mockResolvedValue(null);
    prisma.milestoneRelease.findFirst.mockResolvedValue(null);

    await expect(
      handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never),
    ).resolves.toMatchObject({ received: true, event_type: 'transfer.paid' });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('handleStripeWebhook() - account.updated', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.stripeWebhookEvent.upsert.mockResolvedValue({});
    prisma.stripeWebhookEvent.update.mockResolvedValue({});
  });

  it('WH-13: charges+payouts enabled updates status ENABLED', async () => {
    constructWebhookEventMock.mockReturnValue(
      makeEvent('account.updated', 'evt_13', {
        id: 'acct_1',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requirements: { currently_due: [] },
      }),
    );
    prisma.stripeConnectAccount.findUnique.mockResolvedValue({ id: 'sca_1' });
    prisma.stripeConnectAccount.update.mockResolvedValue({});

    await handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never);
    expect(prisma.stripeConnectAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ENABLED' }) }),
    );
  });

  it('WH-14: details submitted but payouts disabled -> RESTRICTED with requirements_due', async () => {
    constructWebhookEventMock.mockReturnValue(
      makeEvent('account.updated', 'evt_14', {
        id: 'acct_1',
        charges_enabled: true,
        payouts_enabled: false,
        details_submitted: true,
        requirements: { currently_due: ['external_account'] },
      }),
    );
    prisma.stripeConnectAccount.findUnique.mockResolvedValue({ id: 'sca_1' });

    await handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never);
    expect(prisma.stripeConnectAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RESTRICTED',
          requirements_due: ['external_account'],
        }),
      }),
    );
  });

  it('WH-15: account not in DB warns and no error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    constructWebhookEventMock.mockReturnValue(
      makeEvent('account.updated', 'evt_15', {
        id: 'acct_missing',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        requirements: { currently_due: [] },
      }),
    );
    prisma.stripeConnectAccount.findUnique.mockResolvedValue(null);

    await expect(
      handleStripeWebhook(RAW, 'sig', 'secret', prisma as never, queue as never),
    ).resolves.toMatchObject({ received: true, event_type: 'account.updated' });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
