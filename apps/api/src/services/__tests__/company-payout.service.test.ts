import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { stripeTransfersCreateMock } = vi.hoisted(() => ({
  stripeTransfersCreateMock: vi.fn(),
}));

const { writeAuditMock } = vi.hoisted(() => ({
  writeAuditMock: vi.fn(),
}));

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../stripe.service.js', () => ({
  stripe: {
    transfers: {
      create: stripeTransfersCreateMock,
    },
  },
}));

vi.mock('../../utils/audit.js', () => ({
  writeAudit: writeAuditMock,
}));

import { CompanyPayoutService } from '../company-payout.service.js';
import { calculatePayout } from '../../utils/commission.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    companyPayoutRecord: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    companyMember: {
      findFirst: vi.fn(),
    },
    companyPayoutPreference: {
      upsert: vi.fn(),
    },
    consultingCompany: {
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(async () => ({})),
    },
    $transaction: vi.fn(),
  };
}

function makeQueue() {
  return { add: vi.fn(async () => ({})) };
}

function basePayoutRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payout1',
    order_id: 'order1',
    company_id: 'co1',
    method: 'STRIPE_CONNECT',
    status: 'PENDING',
    gross_amount_aud: new Prisma.Decimal(2000),
    platform_fee_aud: new Prisma.Decimal(400),
    net_amount_aud: new Prisma.Decimal(1600),
    transfer_reference: null,
    admin_notes: null,
    processed_by_id: null,
    completed_at: null,
    company: {
      id: 'co1',
      company_name: 'Acme Consulting',
      primary_admin_id: 'admin1',
      primary_admin: { email: 'admin@acme.com' },
      completed_orders_count: 5,
      stripe_connect_account: {
        stripe_account_id: 'acct_test123',
        status: 'ENABLED',
      },
    },
    order: {
      id: 'order1',
      company_invoice: { invoice_number: 'INV-2026-000001' },
    },
    ...overrides,
  };
}

// ─── processStripePayout tests ─────────────────────────────────────────────────

describe('CompanyPayoutService.processStripePayout()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: CompanyPayoutService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new CompanyPayoutService(prisma as never, queue as never);

    writeAuditMock.mockResolvedValue(undefined);
    stripeTransfersCreateMock.mockResolvedValue({ id: 'tr_test' });
    prisma.companyPayoutRecord.update.mockResolvedValue({
      id: 'payout1',
      status: 'COMPLETED',
      transfer_reference: 'tr_test',
      completed_at: new Date(),
    });
    prisma.order.update.mockResolvedValue({});
    prisma.consultingCompany.update.mockResolvedValue({});
  });

  it('PAY-01: STRIPE_CONNECT, PENDING, ENABLED account -> transfer created in cents, record COMPLETED, company count incremented', async () => {
    prisma.companyPayoutRecord.findUnique.mockResolvedValue(basePayoutRecord());

    const result = await svc.processStripePayout('payout1', 'platform_admin1');

    // Transfer amount in cents: 1600 * 100 = 160000
    expect(stripeTransfersCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 160000,
        currency: 'aud',
        destination: 'acct_test123',
      }),
    );
    // Record updated to COMPLETED with transfer reference
    expect(prisma.companyPayoutRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payout1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          transfer_reference: 'tr_test',
          completed_at: expect.any(Date),
        }),
      }),
    );
    // Company completed_orders_count incremented
    expect(prisma.consultingCompany.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'co1' },
        data: { completed_orders_count: { increment: 1 } },
      }),
    );
    expect(result).toMatchObject({ id: 'payout1', status: 'COMPLETED' });
  });

  it('PAY-02: Stripe account not ENABLED (PENDING) -> throws STRIPE_ACCOUNT_NOT_ENABLED 422', async () => {
    prisma.companyPayoutRecord.findUnique.mockResolvedValue(
      basePayoutRecord({
        company: {
          id: 'co1',
          company_name: 'Acme',
          primary_admin_id: 'admin1',
          primary_admin: { email: 'admin@acme.com' },
          completed_orders_count: 5,
          stripe_connect_account: {
            stripe_account_id: 'acct_test123',
            status: 'PENDING', // not ENABLED
          },
        },
      }),
    );

    await expect(
      svc.processStripePayout('payout1', 'platform_admin1'),
    ).rejects.toMatchObject({ code: 'STRIPE_ACCOUNT_NOT_ENABLED', status: 422 });

    expect(stripeTransfersCreateMock).not.toHaveBeenCalled();
  });

  it('PAY-02b: no stripe_connect_account -> throws STRIPE_ACCOUNT_NOT_ENABLED 422', async () => {
    prisma.companyPayoutRecord.findUnique.mockResolvedValue(
      basePayoutRecord({
        company: {
          id: 'co1',
          company_name: 'Acme',
          primary_admin_id: 'admin1',
          primary_admin: { email: 'admin@acme.com' },
          completed_orders_count: 5,
          stripe_connect_account: null,
        },
      }),
    );

    await expect(
      svc.processStripePayout('payout1', 'platform_admin1'),
    ).rejects.toMatchObject({ code: 'STRIPE_ACCOUNT_NOT_ENABLED', status: 422 });
  });

  it('PAY-02c: wrong method (AU_BANK) -> throws INVALID_PAYOUT_METHOD 422', async () => {
    prisma.companyPayoutRecord.findUnique.mockResolvedValue(
      basePayoutRecord({ method: 'AU_BANK' }),
    );

    await expect(
      svc.processStripePayout('payout1', 'platform_admin1'),
    ).rejects.toMatchObject({ code: 'INVALID_PAYOUT_METHOD', status: 422 });
  });

  it('PAY-02d: already COMPLETED payout -> throws PAYOUT_NOT_PENDING 422', async () => {
    prisma.companyPayoutRecord.findUnique.mockResolvedValue(
      basePayoutRecord({ status: 'COMPLETED' }),
    );

    await expect(
      svc.processStripePayout('payout1', 'platform_admin1'),
    ).rejects.toMatchObject({ code: 'PAYOUT_NOT_PENDING', status: 422 });
  });
});

// ─── recordOfflinePayout tests ─────────────────────────────────────────────────

describe('CompanyPayoutService.recordOfflinePayout()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: CompanyPayoutService;

  function auBankRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'payout1',
      order_id: 'order1',
      company_id: 'co1',
      method: 'AU_BANK',
      status: 'PENDING',
      gross_amount_aud: new Prisma.Decimal(2000),
      platform_fee_aud: new Prisma.Decimal(400),
      net_amount_aud: new Prisma.Decimal(1600),
      transfer_reference: null,
      admin_notes: null,
      processed_by_id: null,
      completed_at: null,
      company: {
        id: 'co1',
        company_name: 'Acme Consulting',
        primary_admin_id: 'admin1',
        primary_admin: { email: 'admin@acme.com' },
        completed_orders_count: 5,
      },
      ...overrides,
    };
  }

  const validData = {
    reference: 'BSB-REF-123',
    notes: 'Transferred via NAB internet banking on 2026-03-19',
    transfer_date: new Date('2026-03-19'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new CompanyPayoutService(prisma as never, queue as never);

    writeAuditMock.mockResolvedValue(undefined);
    prisma.companyPayoutRecord.update.mockResolvedValue({
      id: 'payout1',
      status: 'COMPLETED',
      transfer_reference: 'BSB-REF-123',
      completed_at: new Date('2026-03-19'),
    });
    prisma.order.update.mockResolvedValue({});
    prisma.consultingCompany.update.mockResolvedValue({});
  });

  it('PAY-03: AU_BANK payout -> record COMPLETED, transfer_reference set, email to company admin', async () => {
    prisma.companyPayoutRecord.findUnique.mockResolvedValue(auBankRecord());

    const result = await svc.recordOfflinePayout('payout1', 'platform_admin1', validData);

    expect(prisma.companyPayoutRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payout1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          transfer_reference: 'BSB-REF-123',
          completed_at: validData.transfer_date,
        }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'payout-completed',
      expect.objectContaining({ type: 'payout-completed', to: 'admin@acme.com' }),
    );
    expect(result).toMatchObject({ id: 'payout1', status: 'COMPLETED' });
  });

  it('PAY-04: OVERSEAS_BANK payout -> record COMPLETED', async () => {
    prisma.companyPayoutRecord.findUnique.mockResolvedValue(
      auBankRecord({ method: 'OVERSEAS_BANK' }),
    );

    await svc.recordOfflinePayout('payout1', 'platform_admin1', {
      reference: 'SWIFT-REF-XYZ',
      notes: 'International wire transfer via Commonwealth Bank SWIFT channel.',
      transfer_date: new Date('2026-03-19'),
    });

    expect(prisma.companyPayoutRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          transfer_reference: 'SWIFT-REF-XYZ',
        }),
      }),
    );
  });

  it('PAY-05: notes too short (< 20 chars) -> throws NOTES_REQUIRED 422', async () => {
    prisma.companyPayoutRecord.findUnique.mockResolvedValue(auBankRecord());

    await expect(
      svc.recordOfflinePayout('payout1', 'platform_admin1', {
        reference: 'BSB-REF-123',
        notes: 'short',
        transfer_date: new Date(),
      }),
    ).rejects.toMatchObject({ code: 'NOTES_REQUIRED', status: 422 });

    expect(prisma.companyPayoutRecord.update).not.toHaveBeenCalled();
  });

  it('PAY-05b: reference too short (< 3 chars) -> throws INVALID_REFERENCE 422', async () => {
    prisma.companyPayoutRecord.findUnique.mockResolvedValue(auBankRecord());

    await expect(
      svc.recordOfflinePayout('payout1', 'platform_admin1', {
        reference: 'AB',
        notes: 'Transferred via NAB internet banking on 2026-03-19',
        transfer_date: new Date(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE', status: 422 });
  });

  it('PAY-05c: STRIPE_CONNECT record -> throws INVALID_PAYOUT_METHOD 422', async () => {
    prisma.companyPayoutRecord.findUnique.mockResolvedValue(
      auBankRecord({ method: 'STRIPE_CONNECT' }),
    );

    await expect(
      svc.recordOfflinePayout('payout1', 'platform_admin1', validData),
    ).rejects.toMatchObject({ code: 'INVALID_PAYOUT_METHOD', status: 422 });
  });
});

// ─── Commission utility tests (direct import) ─────────────────────────────────

describe('calculatePayout() — commission tier verification', () => {
  it('PAY-06: 5 completed orders (tier 1, 20%) -> commission 400, net 1600 on gross 2000', () => {
    const result = calculatePayout(2000, 5);
    expect(result).toMatchObject({
      commission_amount_aud: 400,
      net_amount_aud: 1600,
      commission_rate: 0.20,
      tier: 'TIER_1_NEW',
    });
  });

  it('PAY-07: 15 completed orders (tier 2, 17%) -> commission 340, net 1660 on gross 2000', () => {
    const result = calculatePayout(2000, 15);
    expect(result).toMatchObject({
      commission_amount_aud: 340,
      net_amount_aud: 1660,
      commission_rate: 0.17,
      tier: 'TIER_2_ESTABLISHED',
    });
  });

  it('PAY-07b: 50+ completed orders (tier 3, 15%) -> commission 300, net 1700 on gross 2000', () => {
    const result = calculatePayout(2000, 50);
    expect(result).toMatchObject({
      commission_amount_aud: 300,
      net_amount_aud: 1700,
      commission_rate: 0.15,
      tier: 'TIER_3_SENIOR',
    });
  });
});
