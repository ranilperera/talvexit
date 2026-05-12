import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    paymentIntents: { retrieve: vi.fn() },
  })),
}));

const {
  stripeRetrieveMock,
  stripeCreatePiMock,
  createTransferMock,
  createConnectAccountMock,
  createOnboardingLinkMock,
} = vi.hoisted(() => ({
  stripeRetrieveMock: vi.fn(),
  stripeCreatePiMock: vi.fn(),
  createTransferMock: vi.fn(),
  createConnectAccountMock: vi.fn(),
  createOnboardingLinkMock: vi.fn(),
}));

const { generateInvoicePdfMock, generateInvoiceNumberMock } = vi.hoisted(() => ({
  generateInvoicePdfMock: vi.fn(),
  generateInvoiceNumberMock: vi.fn(),
}));

const { uploadToBlobMock, generateSasUrlMock } = vi.hoisted(() => ({
  uploadToBlobMock: vi.fn(),
  generateSasUrlMock: vi.fn(),
}));

const { isCurrentlyValidMock } = vi.hoisted(() => ({
  isCurrentlyValidMock: vi.fn(),
}));

vi.mock('../stripe.service.js', () => ({
  stripe: {
    paymentIntents: { retrieve: stripeRetrieveMock },
  },
  createPaymentIntent: stripeCreatePiMock,
  createTransfer: createTransferMock,
  createConnectAccount: createConnectAccountMock,
  createOnboardingLink: createOnboardingLinkMock,
}));

vi.mock('../../utils/invoice-generator.js', () => ({
  generateInvoicePdf: generateInvoicePdfMock,
  generateInvoiceNumber: generateInvoiceNumberMock,
}));

vi.mock('../../utils/blob-storage.js', () => ({
  uploadToBlob: uploadToBlobMock,
  generateSasUrl: generateSasUrlMock,
}));

vi.mock('../insurance-tier.service.js', () => ({
  isCurrentlyValid: isCurrentlyValidMock,
}));

import * as commission from '../../utils/commission.js';
import { PaymentService } from '../payment.service.js';

function makePrisma() {
  return {
    order: { findUnique: vi.fn(), update: vi.fn() },
    payoutRecord: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
    contractorProfile: { findUnique: vi.fn() },
    auditLog: { create: vi.fn(async () => ({})) },
    stripeConnectAccount: { create: vi.fn(), update: vi.fn() },
    milestoneRelease: { create: vi.fn(), update: vi.fn() },
  };
}

function makeQueue() {
  return { add: vi.fn(async () => ({})) };
}

function scopedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order_1',
    customer_id: 'customer_1',
    contractor_profile_id: 'cp_1',
    status: 'SCOPED',
    stripe_payment_intent_id: null,
    price_aud: new Prisma.Decimal(1000),
    tax_amount_aud: new Prisma.Decimal(100),
    total_amount_aud: new Prisma.Decimal(1100),
    contractor_profile: {
      completed_orders_count: 0,
      stripe_connect_account: { status: 'ENABLED', stripe_account_id: 'acct_1' },
      insurance_certificates: [{}],
    },
    ...overrides,
  };
}

describe('PaymentService.createPaymentIntent()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: PaymentService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new PaymentService(prisma as never, queue as never);
    isCurrentlyValidMock.mockReturnValue(true);
    stripeCreatePiMock.mockResolvedValue({ id: 'pi_1', client_secret: 'sec_1' });
  });

  it('PA-01: valid payable order + enabled connect + valid insurance -> PI created and order updated', async () => {
    prisma.order.findUnique.mockResolvedValue(scopedOrder());
    prisma.order.update.mockResolvedValue({});

    const result = await svc.createPaymentIntent('order_1', 'customer_1', { ip: '1.1.1.1', userAgent: 'ua' });

    expect(stripeCreatePiMock).toHaveBeenCalledOnce();
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: { stripe_payment_intent_id: 'pi_1' },
    });
    expect(result).toMatchObject({ payment_intent_id: 'pi_1', client_secret: 'sec_1' });
  });

  it('PA-02: existing PI idempotency -> retrieve existing and do not create new PI', async () => {
    prisma.order.findUnique.mockResolvedValue(
      scopedOrder({ stripe_payment_intent_id: 'pi_existing' }),
    );
    stripeRetrieveMock.mockResolvedValue({
      id: 'pi_existing',
      client_secret: 'sec_existing',
      status: 'requires_payment_method',
    });

    const result = await svc.createPaymentIntent('order_1', 'customer_1', { ip: '1.1.1.1', userAgent: 'ua' });

    expect(stripeRetrieveMock).toHaveBeenCalledWith('pi_existing');
    expect(stripeCreatePiMock).not.toHaveBeenCalled();
    expect(result.payment_intent_id).toBe('pi_existing');
  });

  it('PA-03: contractor connect status pending -> CONTRACTOR_PAYOUTS_NOT_ENABLED 402', async () => {
    prisma.order.findUnique.mockResolvedValue(
      scopedOrder({ contractor_profile: { stripe_connect_account: { status: 'PENDING', stripe_account_id: 'acct_1' }, insurance_certificates: [{}] } }),
    );

    await expect(
      svc.createPaymentIntent('order_1', 'customer_1', { ip: '1.1.1.1', userAgent: 'ua' }),
    ).rejects.toMatchObject({ code: 'CONTRACTOR_PAYOUTS_NOT_ENABLED', status: 402 });
  });

  it('PA-04: contractor insurance expired -> INSURANCE_EXPIRED 402', async () => {
    prisma.order.findUnique.mockResolvedValue(scopedOrder());
    isCurrentlyValidMock.mockReturnValue(false);

    await expect(
      svc.createPaymentIntent('order_1', 'customer_1', { ip: '1.1.1.1', userAgent: 'ua' }),
    ).rejects.toMatchObject({ code: 'INSURANCE_EXPIRED', status: 402 });
  });

  it('PA-05: order status COMPLETED -> ORDER_NOT_PAYABLE 422', async () => {
    prisma.order.findUnique.mockResolvedValue(scopedOrder({ status: 'COMPLETED' }));

    await expect(
      svc.createPaymentIntent('order_1', 'customer_1', { ip: '1.1.1.1', userAgent: 'ua' }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_PAYABLE', status: 422 });
  });

  it('PA-06: wrong customer -> FORBIDDEN 403', async () => {
    prisma.order.findUnique.mockResolvedValue(scopedOrder({ customer_id: 'other_customer' }));

    await expect(
      svc.createPaymentIntent('order_1', 'customer_1', { ip: '1.1.1.1', userAgent: 'ua' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});

describe('PaymentService.initiateContractorPayout()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: PaymentService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new PaymentService(prisma as never, queue as never);
    generateInvoicePdfMock.mockResolvedValue(Buffer.from('pdf'));
    generateInvoiceNumberMock.mockReturnValue('INV-001');
    uploadToBlobMock.mockResolvedValue(undefined);
  });

  function completedOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: 'order_1',
      status: 'COMPLETED',
      customer: { id: 'customer_1', full_name: 'Cust', email: 'c@test.com' },
      contractor_user: { id: 'contractor_1', full_name: 'Cont', email: 'x@test.com' },
      contractor_profile_id: 'cp_1',
      contractor_profile: {
        completed_orders_count: 0,
        stripe_connect_account: { stripe_account_id: 'acct_1' },
      },
      scope_snapshot: { title: 'Task', domain: 'FIREWALL', in_scope: ['a'] },
      price_aud: new Prisma.Decimal(1000),
      tax_amount_aud: new Prisma.Decimal(100),
      total_amount_aud: new Prisma.Decimal(1100),
      completed_at: new Date(),
      ...overrides,
    };
  }

  it('PA-07: fresh completed order -> payout initiated flow + invoice + email', async () => {
    const calcSpy = vi.spyOn(commission, 'calculatePayout');
    prisma.order.findUnique.mockResolvedValue(completedOrder());
    prisma.payoutRecord.findUnique.mockResolvedValue(null);
    prisma.payoutRecord.create.mockResolvedValue({ id: 'po_1', commission_rate: new Prisma.Decimal(0.2), net_amount_aud: new Prisma.Decimal(800) });
    createTransferMock.mockResolvedValue({ id: 'tr_1', object: 'transfer' });
    prisma.payoutRecord.update
      .mockResolvedValueOnce({ id: 'po_1', commission_rate: new Prisma.Decimal(0.2), net_amount_aud: new Prisma.Decimal(800) })
      .mockResolvedValueOnce({ id: 'po_1' });
    prisma.order.update.mockResolvedValue({});
    prisma.payoutRecord.findUniqueOrThrow.mockResolvedValue({ id: 'po_1', status: 'INITIATED' });

    const result = await svc.initiateContractorPayout('order_1');

    expect(calcSpy).toHaveBeenCalledWith(1000, 0);
    expect(createTransferMock).toHaveBeenCalledOnce();
    expect(prisma.payoutRecord.create).toHaveBeenCalledOnce();
    expect(generateInvoicePdfMock).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledWith(
      'payout-initiated',
      expect.objectContaining({ type: 'payout-initiated', order_id: 'order_1' }),
    );
    expect(result).toMatchObject({ id: 'po_1' });
  });

  it('PA-08: payout already initiated -> returns existing, no duplicate transfer', async () => {
    prisma.order.findUnique.mockResolvedValue(completedOrder());
    prisma.payoutRecord.findUnique.mockResolvedValue({ id: 'po_existing', status: 'INITIATED' });

    const result = await svc.initiateContractorPayout('order_1');

    expect(result).toMatchObject({ id: 'po_existing' });
    expect(createTransferMock).not.toHaveBeenCalled();
  });

  it('PA-09: 0-order contractor -> transfer uses 80% net', async () => {
    prisma.order.findUnique.mockResolvedValue(completedOrder({ price_aud: new Prisma.Decimal(1000), contractor_profile: { completed_orders_count: 0, stripe_connect_account: { stripe_account_id: 'acct_1' } } }));
    prisma.payoutRecord.findUnique.mockResolvedValue(null);
    prisma.payoutRecord.create.mockResolvedValue({ id: 'po_1', commission_rate: new Prisma.Decimal(0.2), net_amount_aud: new Prisma.Decimal(800) });
    createTransferMock.mockResolvedValue({ id: 'tr_1', object: 'transfer' });
    prisma.payoutRecord.update.mockResolvedValue({ id: 'po_1', commission_rate: new Prisma.Decimal(0.2), net_amount_aud: new Prisma.Decimal(800) });
    prisma.order.update.mockResolvedValue({});
    prisma.payoutRecord.findUniqueOrThrow.mockResolvedValue({ id: 'po_1' });

    await svc.initiateContractorPayout('order_1');
    expect(createTransferMock).toHaveBeenCalledWith(
      expect.objectContaining({ netAmountAud: 800 }),
    );
  });

  it('PA-10: 50-order contractor -> transfer uses 85% net', async () => {
    prisma.order.findUnique.mockResolvedValue(completedOrder({ price_aud: new Prisma.Decimal(1000), contractor_profile: { completed_orders_count: 50, stripe_connect_account: { stripe_account_id: 'acct_1' } } }));
    prisma.payoutRecord.findUnique.mockResolvedValue(null);
    prisma.payoutRecord.create.mockResolvedValue({ id: 'po_1', commission_rate: new Prisma.Decimal(0.15), net_amount_aud: new Prisma.Decimal(850) });
    createTransferMock.mockResolvedValue({ id: 'tr_1', object: 'transfer' });
    prisma.payoutRecord.update.mockResolvedValue({ id: 'po_1', commission_rate: new Prisma.Decimal(0.15), net_amount_aud: new Prisma.Decimal(850) });
    prisma.order.update.mockResolvedValue({});
    prisma.payoutRecord.findUniqueOrThrow.mockResolvedValue({ id: 'po_1' });

    await svc.initiateContractorPayout('order_1');
    expect(createTransferMock).toHaveBeenCalledWith(
      expect.objectContaining({ netAmountAud: 850 }),
    );
  });
});

describe('PaymentService.getConnectStatus()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: PaymentService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new PaymentService(prisma as never, queue as never);
  });

  it('PA-11: no Connect account -> pending and all false', async () => {
    prisma.contractorProfile.findUnique.mockResolvedValue({
      stripe_connect_account: null,
    });

    const result = await svc.getConnectStatus('contractor_1');

    expect(result).toEqual({
      status: 'PENDING',
      charges_enabled: false,
      payouts_enabled: false,
      requirements_due: [],
      onboarding_url: null,
    });
  });

  it('PA-12: enabled account -> capability fields true', async () => {
    prisma.contractorProfile.findUnique.mockResolvedValue({
      stripe_connect_account: {
        status: 'ENABLED',
        charges_enabled: true,
        payouts_enabled: true,
        requirements_due: [],
        onboarding_url: 'https://onboard',
      },
    });

    const result = await svc.getConnectStatus('contractor_1');
    expect(result).toMatchObject({
      status: 'ENABLED',
      charges_enabled: true,
      payouts_enabled: true,
    });
  });
});
