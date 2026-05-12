import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { uploadToBlobMock } = vi.hoisted(() => ({
  uploadToBlobMock: vi.fn(),
}));

const { writeAuditMock } = vi.hoisted(() => ({
  writeAuditMock: vi.fn(),
}));

const {
  stripeCreatePiMock,
  stripeRetrievePiMock,
} = vi.hoisted(() => ({
  stripeCreatePiMock: vi.fn(),
  stripeRetrievePiMock: vi.fn(),
}));

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../utils/blob-storage.js', () => ({
  uploadToBlob: uploadToBlobMock,
  generateSasUrl: vi.fn(),
}));

vi.mock('../../utils/audit.js', () => ({
  writeAudit: writeAuditMock,
}));

vi.mock('../stripe.service.js', () => ({
  stripe: {
    paymentIntents: {
      create: stripeCreatePiMock,
      retrieve: stripeRetrievePiMock,
    },
  },
}));

// Mock PDFKit — emit end immediately so PDF generation resolves without real PDF work
vi.mock('pdfkit', () => {
  const EventEmitter = require('events');
  const PDFDocumentMock = vi.fn().mockImplementation(() => {
    const emitter = new EventEmitter();
    setImmediate(() => {
      emitter.emit('data', Buffer.from('pdf'));
      emitter.emit('end');
    });
    return {
      on: emitter.on.bind(emitter),
      end: vi.fn(),
      fontSize: vi.fn().mockReturnThis(),
      font: vi.fn().mockReturnThis(),
      fillColor: vi.fn().mockReturnThis(),
      text: vi.fn().mockReturnThis(),
      moveTo: vi.fn().mockReturnThis(),
      lineTo: vi.fn().mockReturnThis(),
      strokeColor: vi.fn().mockReturnThis(),
      lineWidth: vi.fn().mockReturnThis(),
      stroke: vi.fn().mockReturnThis(),
      rect: vi.fn().mockReturnThis(),
      fill: vi.fn().mockReturnThis(),
      heightOfString: vi.fn().mockReturnValue(20),
      currentLineHeight: vi.fn().mockReturnValue(12),
    };
  });
  return { default: PDFDocumentMock };
});

import { InvoiceService } from '../invoice.service.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    order: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    companyMember: {
      findFirst: vi.fn(),
    },
    companyInvoice: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    companyPayoutRecord: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    documentSequence: {
      upsert: vi.fn(),
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

function setupTransaction(prisma: ReturnType<typeof makePrisma>) {
  prisma.$transaction.mockImplementation(async (fnOrArray: unknown) => {
    if (typeof fnOrArray === 'function') {
      return (fnOrArray as (tx: unknown) => Promise<unknown>)(prisma);
    }
    return Promise.all(fnOrArray as Array<Promise<unknown>>);
  });
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order1',
    company_id: 'co1',
    company_order_status: 'DELIVERABLES_ACCEPTED',
    customer_id: 'cust1',
    customer: { full_name: 'Customer Name', email: 'cust@test.com' },
    company: {
      id: 'co1',
      company_name: 'Acme Consulting',
      abn: '12345678901',
      business_address: '1 Main St',
      website_url: 'https://acme.com',
      primary_admin_id: 'admin1',
    },
    purchase_order: {
      id: 'po1',
      po_number: 'PO-2026-000001',
      amount_aud: new Prisma.Decimal(1000),
      tax_aud: new Prisma.Decimal(100),
      total_aud: new Prisma.Decimal(1100),
    },
    ...overrides,
  };
}

// ─── createInvoice tests ──────────────────────────────────────────────────────

describe('InvoiceService.createInvoice()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: InvoiceService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new InvoiceService(prisma as never, queue as never);

    uploadToBlobMock.mockResolvedValue(undefined);
    writeAuditMock.mockResolvedValue(undefined);

    // Default: generateDocumentNumber uses prisma directly (not tx)
    prisma.documentSequence.upsert.mockResolvedValue({
      type: 'INV',
      year: 2026,
      last_value: 1,
    });

    prisma.companyInvoice.create.mockResolvedValue({
      id: 'inv1',
      invoice_number: 'INV-2026-000001',
      order_id: 'order1',
      company_id: 'co1',
      amount_aud: new Prisma.Decimal(1000),
      tax_aud: new Prisma.Decimal(100),
      total_aud: new Prisma.Decimal(1100),
      paid_at: null,
      pdf_blob_path: null,
    });
    prisma.companyInvoice.update.mockResolvedValue({});
    prisma.order.update.mockResolvedValue({});
  });

  it('INV-01: DELIVERABLES_ACCEPTED order, admin, PO exists -> invoice created, order INVOICE_SENT, email sent', async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder());
    prisma.companyInvoice.findUnique.mockResolvedValue(null);
    prisma.companyMember.findFirst.mockResolvedValue({ role: 'COMPANY_ADMIN' });

    const result = await svc.createInvoice('order1', 'admin1', {});

    // Invoice created
    expect(prisma.companyInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          order_id: 'order1',
          company_id: 'co1',
        }),
      }),
    );
    // invoice_number comes from documentSequence
    const createArgs = prisma.companyInvoice.create.mock.calls[0][0] as { data: { invoice_number: string } };
    expect(createArgs.data.invoice_number).toMatch(/^INV-\d{4}-\d{6}$/);

    // Order advanced to INVOICE_SENT
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order1' },
        data: expect.objectContaining({ company_order_status: 'INVOICE_SENT' }),
      }),
    );

    // Email to customer
    expect(queue.add).toHaveBeenCalledWith(
      'invoice-received',
      expect.objectContaining({ type: 'invoice-received', to: 'cust@test.com' }),
    );

    expect(result).toMatchObject({ id: 'inv1' });
  });

  it('INV-02: wrong order status (IN_PROGRESS) -> throws DELIVERABLES_NOT_ACCEPTED 422', async () => {
    prisma.order.findUnique.mockResolvedValue(
      baseOrder({ company_order_status: 'IN_PROGRESS' }),
    );

    await expect(svc.createInvoice('order1', 'admin1', {})).rejects.toMatchObject({
      code: 'DELIVERABLES_NOT_ACCEPTED',
      status: 422,
    });
  });

  it('INV-03: invoice already exists -> throws INVOICE_EXISTS 409', async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder());
    prisma.companyInvoice.findUnique.mockResolvedValue({
      id: 'inv_existing',
      invoice_number: 'INV-2026-000001',
    });

    await expect(svc.createInvoice('order1', 'admin1', {})).rejects.toMatchObject({
      code: 'INVOICE_EXISTS',
      status: 409,
    });
  });
});

// ─── createInvoicePaymentIntent tests ─────────────────────────────────────────

describe('InvoiceService.createInvoicePaymentIntent()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: InvoiceService;

  function baseInvoice(overrides: Record<string, unknown> = {}) {
    return {
      id: 'inv1',
      order_id: 'order1',
      company_id: 'co1',
      invoice_number: 'INV-2026-000001',
      total_aud: new Prisma.Decimal(1100),
      paid_at: null,
      order: {
        customer_id: 'cust1',
        stripe_payment_intent_id: null,
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new InvoiceService(prisma as never, queue as never);
    writeAuditMock.mockResolvedValue(undefined);
    prisma.order.update.mockResolvedValue({});
  });

  it('INV-04: no existing PI -> creates new PI, stores on order, returns client_secret', async () => {
    prisma.companyInvoice.findUnique.mockResolvedValue(baseInvoice());
    stripeCreatePiMock.mockResolvedValue({
      id: 'pi_test',
      client_secret: 'secret_test',
    });

    const result = await svc.createInvoicePaymentIntent('inv1', 'cust1');

    expect(stripeCreatePiMock).toHaveBeenCalledOnce();
    // Should NOT include on_behalf_of (platform collects funds)
    const createArgs = stripeCreatePiMock.mock.calls[0][0] as Record<string, unknown>;
    expect(createArgs).not.toHaveProperty('on_behalf_of');

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order1' },
        data: { stripe_payment_intent_id: 'pi_test' },
      }),
    );
    expect(result).toEqual({ client_secret: 'secret_test', payment_intent_id: 'pi_test' });
  });

  it('INV-04b: existing non-canceled PI -> returns existing, no new PI created', async () => {
    prisma.companyInvoice.findUnique.mockResolvedValue(
      baseInvoice({ order: { customer_id: 'cust1', stripe_payment_intent_id: 'pi_existing' } }),
    );
    stripeRetrievePiMock.mockResolvedValue({
      id: 'pi_existing',
      client_secret: 'secret_existing',
      status: 'requires_payment_method',
    });

    const result = await svc.createInvoicePaymentIntent('inv1', 'cust1');

    expect(stripeRetrievePiMock).toHaveBeenCalledWith('pi_existing');
    expect(stripeCreatePiMock).not.toHaveBeenCalled();
    expect(result).toEqual({ client_secret: 'secret_existing', payment_intent_id: 'pi_existing' });
  });

  it('INV-04c: wrong customer -> throws FORBIDDEN 403', async () => {
    prisma.companyInvoice.findUnique.mockResolvedValue(baseInvoice());

    await expect(
      svc.createInvoicePaymentIntent('inv1', 'wrong_cust'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('INV-04d: already paid invoice -> throws INVOICE_ALREADY_PAID 409', async () => {
    prisma.companyInvoice.findUnique.mockResolvedValue(
      baseInvoice({ paid_at: new Date() }),
    );

    await expect(
      svc.createInvoicePaymentIntent('inv1', 'cust1'),
    ).rejects.toMatchObject({ code: 'INVOICE_ALREADY_PAID', status: 409 });
  });
});

// ─── handleInvoicePaymentSuccess tests ────────────────────────────────────────

describe('InvoiceService.handleInvoicePaymentSuccess()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: InvoiceService;

  function baseOrderWithInvoice(overrides: Record<string, unknown> = {}) {
    return {
      id: 'order1',
      company_id: 'co1',
      company_invoice: {
        id: 'inv1',
        invoice_number: 'INV-2026-000001',
        paid_at: null,
        amount_aud: new Prisma.Decimal(1000), // excl. GST — payout base
        total_aud: new Prisma.Decimal(1100),
      },
      company: {
        id: 'co1',
        company_name: 'Acme Consulting',
        primary_admin_id: 'admin1',
        primary_admin: { email: 'admin@acme.com' },
        completed_orders_count: 5,
        payout_preference: { method: 'AU_BANK' },
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new InvoiceService(prisma as never, queue as never);

    writeAuditMock.mockResolvedValue(undefined);
    setupTransaction(prisma);

    prisma.companyInvoice.update.mockResolvedValue({});
    prisma.order.update.mockResolvedValue({});
    prisma.companyPayoutRecord.create.mockResolvedValue({
      id: 'payout1',
      platform_fee_aud: new Prisma.Decimal(200),
      net_amount_aud: new Prisma.Decimal(800),
    });
    prisma.user.findMany.mockResolvedValue([
      { email: 'platform_admin@test.com' },
    ]);
  });

  it('INV-05: payment success -> invoice marked paid, order PAYMENT_RECEIVED, payout record created with correct commission', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrderWithInvoice());

    await svc.handleInvoicePaymentSuccess('pi_test');

    // Invoice marked paid
    expect(prisma.companyInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv1' },
        data: expect.objectContaining({ paid_at: expect.any(Date) }),
      }),
    );
    // Order advanced to PAYMENT_RECEIVED
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order1' },
        data: expect.objectContaining({ company_order_status: 'PAYMENT_RECEIVED' }),
      }),
    );
    // Payout record created — 5 orders = 20% commission on 1000 = 200
    expect(prisma.companyPayoutRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          platform_fee_aud: 200, // 20% of 1000
          net_amount_aud: 800,
          status: 'PENDING',
        }),
      }),
    );
    // Email to platform admins
    expect(queue.add).toHaveBeenCalledWith(
      'payout-awaiting-action',
      expect.objectContaining({ type: 'payout-awaiting-action', to: 'platform_admin@test.com' }),
    );
  });

  it('INV-05b: idempotency — already paid invoice -> skips all updates', async () => {
    prisma.order.findFirst.mockResolvedValue(
      baseOrderWithInvoice({
        company_invoice: {
          id: 'inv1',
          invoice_number: 'INV-2026-000001',
          paid_at: new Date(), // already paid
          amount_aud: new Prisma.Decimal(1000),
          total_aud: new Prisma.Decimal(1100),
        },
      }),
    );

    await svc.handleInvoicePaymentSuccess('pi_test');

    expect(prisma.companyInvoice.update).not.toHaveBeenCalled();
    expect(prisma.companyPayoutRecord.create).not.toHaveBeenCalled();
  });

  it('INV-05c: no company invoice found -> returns silently without error', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    // Should not throw
    await expect(svc.handleInvoicePaymentSuccess('pi_unknown')).resolves.toBeUndefined();
    expect(prisma.companyPayoutRecord.create).not.toHaveBeenCalled();
  });
});
