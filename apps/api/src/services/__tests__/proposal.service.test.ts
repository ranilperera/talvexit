import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { uploadToBlobMock } = vi.hoisted(() => ({
  uploadToBlobMock: vi.fn(),
}));

const { convertToAUDMock } = vi.hoisted(() => ({
  convertToAUDMock: vi.fn(),
}));

const { writeAuditMock } = vi.hoisted(() => ({
  writeAuditMock: vi.fn(),
}));

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../utils/blob-storage.js', () => ({
  uploadToBlob: uploadToBlobMock,
  generateSasUrl: vi.fn(),
}));

vi.mock('../../utils/currency.js', () => ({
  convertToAUD: convertToAUDMock,
}));

vi.mock('../../utils/audit.js', () => ({
  writeAudit: writeAuditMock,
}));

// Mock pdfkit — the PDF generation functions use it internally.
// We mock the module so PDFDocument emits 'end' immediately with empty data.
vi.mock('pdfkit', () => {
  const EventEmitter = require('events');
  const PDFDocumentMock = vi.fn().mockImplementation(() => {
    const emitter = new EventEmitter();
    // Simulate async end: emit 'data' then 'end' on nextTick
    setImmediate(() => {
      emitter.emit('data', Buffer.from('pdf'));
      emitter.emit('end');
    });
    return {
      on: emitter.on.bind(emitter),
      pipe: vi.fn(),
      end: vi.fn(() => {
        // end() is called by service; we already scheduled emit above
      }),
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

// Import the service AFTER mocks are set up
import { ProposalService } from '../proposal.service.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    order: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    companyMember: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    companyOrderProposal: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    purchaseOrder: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    companyInvoice: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    documentSequence: {
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
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
    return Promise.all((fnOrArray as Array<Promise<unknown>>));
  });
}

// ─── createProposal tests ──────────────────────────────────────────────────────

describe('ProposalService.createProposal()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: ProposalService;

  const baseInput = {
    scope_of_work: 'Full network security audit covering perimeter defences.',
    timeline_days: 30,
    payment_terms: 'Net 14 days',
    notes: 'Cover note here',
    currency: 'AUD',
    price: 2000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new ProposalService(prisma as never, queue as never);

    // Default: convertToAUD returns price as-is (1:1)
    convertToAUDMock.mockImplementation((price: number) => price);
    writeAuditMock.mockResolvedValue(undefined);
    uploadToBlobMock.mockResolvedValue(undefined);
  });

  it('PRP-01: BOOKED order, admin creates proposal -> DRAFT, version=1, audit written', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order1',
      company_id: 'co1',
      company_order_status: 'BOOKED',
    });
    prisma.companyMember.findFirst.mockResolvedValue({ role: 'COMPANY_ADMIN' });
    prisma.companyOrderProposal.findFirst.mockResolvedValue(null);
    prisma.companyOrderProposal.create.mockResolvedValue({
      id: 'prop1',
      order_id: 'order1',
      status: 'DRAFT',
      version: 1,
    });

    const result = await svc.createProposal('order1', 'admin1', baseInput);

    expect(prisma.companyOrderProposal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DRAFT',
          version: 1,
          order_id: 'order1',
          company_id: 'co1',
          created_by_id: 'admin1',
        }),
      }),
    );
    expect(writeAuditMock).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ id: 'prop1', status: 'DRAFT', version: 1 });
  });

  it('PRP-02: PROPOSAL_CHANGES_REQUESTED order, lastProposal v1 -> new version=2', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order1',
      company_id: 'co1',
      company_order_status: 'PROPOSAL_CHANGES_REQUESTED',
    });
    prisma.companyMember.findFirst.mockResolvedValue({ role: 'COMPANY_ADMIN' });
    prisma.companyOrderProposal.findFirst.mockResolvedValue({ version: 1 });
    prisma.companyOrderProposal.create.mockResolvedValue({
      id: 'prop2',
      status: 'DRAFT',
      version: 2,
    });

    await svc.createProposal('order1', 'admin1', baseInput);

    expect(prisma.companyOrderProposal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 2 }),
      }),
    );
  });

  it('PRP-03: wrong status (COMPLETED) -> throws INVALID_ORDER_STATUS 422', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order1',
      company_id: 'co1',
      company_order_status: 'COMPLETED',
    });

    await expect(
      svc.createProposal('order1', 'admin1', baseInput),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_STATUS', status: 422 });
  });

  it('PRP-04: non-admin member (JUNIOR_CONSULTANT) -> throws INSUFFICIENT_COMPANY_ROLE 403', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order1',
      company_id: 'co1',
      company_order_status: 'BOOKED',
    });
    prisma.companyMember.findFirst.mockResolvedValue({ role: 'JUNIOR_CONSULTANT' });

    await expect(
      svc.createProposal('order1', 'junior1', baseInput),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_COMPANY_ROLE', status: 403 });
  });
});

// ─── sendProposal tests ────────────────────────────────────────────────────────

describe('ProposalService.sendProposal()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: ProposalService;

  function baseDraftProposal(overrides: Record<string, unknown> = {}) {
    return {
      id: 'prop1',
      order_id: 'order1',
      company_id: 'co1',
      version: 1,
      status: 'DRAFT',
      scope_of_work: 'Scope text',
      timeline_days: 30,
      proposed_price_aud: 2000,
      proposed_tax_aud: 200,
      proposed_total_aud: 2200,
      payment_terms: 'Net 14',
      notes: null,
      order: {
        customer_id: 'cust1',
        customer: { full_name: 'Customer Name', email: 'cust@test.com' },
      },
      company: {
        company_name: 'Acme Consulting',
        abn: '12345678901',
        business_address: '1 Main St',
        website_url: 'https://acme.com',
        primary_admin_id: 'admin1',
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new ProposalService(prisma as never, queue as never);

    uploadToBlobMock.mockResolvedValue(undefined);
    writeAuditMock.mockResolvedValue(undefined);
    setupTransaction(prisma);

    // Default transactional mocks
    prisma.companyOrderProposal.updateMany.mockResolvedValue({ count: 0 });
    prisma.companyOrderProposal.update.mockResolvedValue({
      id: 'prop1',
      status: 'SENT',
    });
    prisma.order.update.mockResolvedValue({});
  });

  it('PRP-05: DRAFT proposal -> sends, updates to SENT, order to PROPOSAL_SENT, emails customer', async () => {
    prisma.companyOrderProposal.findUnique.mockResolvedValue(baseDraftProposal());
    prisma.companyMember.findFirst.mockResolvedValue({ role: 'COMPANY_ADMIN' });

    const result = await svc.sendProposal('prop1', 'admin1');

    // Proposal updated to SENT
    expect(prisma.companyOrderProposal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prop1' },
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
    // Order advanced to PROPOSAL_SENT
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order1' },
        data: expect.objectContaining({ company_order_status: 'PROPOSAL_SENT' }),
      }),
    );
    // Email queued for customer
    expect(queue.add).toHaveBeenCalledWith(
      'proposal-received',
      expect.objectContaining({ type: 'proposal-received', to: 'cust@test.com' }),
    );
    expect(result).toMatchObject({ id: 'prop1', status: 'SENT' });
  });

  it('PRP-06: non-DRAFT proposal -> throws PROPOSAL_NOT_DRAFT 422', async () => {
    prisma.companyOrderProposal.findUnique.mockResolvedValue(
      baseDraftProposal({ status: 'SENT' }),
    );

    await expect(svc.sendProposal('prop1', 'admin1')).rejects.toMatchObject({
      code: 'PROPOSAL_NOT_DRAFT',
      status: 422,
    });
  });

  it('PRP-07: supersedes older SENT proposals via updateMany', async () => {
    prisma.companyOrderProposal.findUnique.mockResolvedValue(baseDraftProposal());
    prisma.companyMember.findFirst.mockResolvedValue({ role: 'COMPANY_ADMIN' });

    await svc.sendProposal('prop1', 'admin1');

    expect(prisma.companyOrderProposal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          order_id: 'order1',
          status: 'SENT',
          id: { not: 'prop1' },
        }),
      }),
    );
  });
});

// ─── customerRespondToProposal tests ──────────────────────────────────────────

describe('ProposalService.customerRespondToProposal()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: ProposalService;

  function sentProposal(overrides: Record<string, unknown> = {}) {
    return {
      id: 'prop1',
      order_id: 'order1',
      company_id: 'co1',
      version: 1,
      status: 'SENT',
      scope_of_work: 'Audit scope',
      proposed_price_aud: 1000,
      proposed_tax_aud: 100,
      proposed_total_aud: 1100,
      payment_terms: 'Net 14',
      notes: null,
      order: {
        customer_id: 'cust1',
        customer: { full_name: 'Customer Name', email: 'cust@test.com' },
      },
      company: {
        company_name: 'Acme Consulting',
        abn: '12345678901',
        business_address: '1 Main St',
        website_url: 'https://acme.com',
        primary_admin_id: 'admin1',
        primary_admin: { email: 'admin@acme.com' },
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new ProposalService(prisma as never, queue as never);

    uploadToBlobMock.mockResolvedValue(undefined);
    writeAuditMock.mockResolvedValue(undefined);

    // Default sequence upsert
    prisma.documentSequence.upsert.mockResolvedValue({ last_value: 1, year: 2026, type: 'PO' });
    prisma.purchaseOrder.create.mockResolvedValue({
      id: 'po1',
      po_number: 'PO-2026-000001',
      amount_aud: 1000,
      tax_aud: 100,
      total_aud: 1100,
    });
    prisma.companyOrderProposal.update.mockResolvedValue({
      id: 'prop1',
      status: 'APPROVED',
    });
    prisma.order.update.mockResolvedValue({});
    prisma.purchaseOrder.update.mockResolvedValue({});

    setupTransaction(prisma);
  });

  it('PRP-08: APPROVE -> PO created, proposal APPROVED, order PO_GENERATED, email sent to company admin', async () => {
    prisma.companyOrderProposal.findUnique.mockResolvedValue(sentProposal());

    const result = await svc.customerRespondToProposal('prop1', 'cust1', {
      decision: 'APPROVE',
    });

    // PO created with correct fields
    expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          order_id: 'order1',
          po_number: expect.stringMatching(/^PO-\d{4}-\d{6}$/),
        }),
      }),
    );
    // Proposal updated to APPROVED
    expect(prisma.companyOrderProposal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prop1' },
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
    // Order updated to PO_GENERATED
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order1' },
        data: expect.objectContaining({ company_order_status: 'PO_GENERATED' }),
      }),
    );
    // Email to company admin
    expect(queue.add).toHaveBeenCalledWith(
      'proposal-approved',
      expect.objectContaining({ type: 'proposal-approved', to: 'admin@acme.com' }),
    );
    expect(result).toMatchObject({ proposal: { id: 'prop1', status: 'APPROVED' } });
  });

  it('PRP-09: PO number format is PO-YYYY-NNNNNN', async () => {
    prisma.companyOrderProposal.findUnique.mockResolvedValue(sentProposal());
    prisma.documentSequence.upsert.mockResolvedValue({ last_value: 42, year: 2026, type: 'PO' });

    await svc.customerRespondToProposal('prop1', 'cust1', { decision: 'APPROVE' });

    const createCall = prisma.purchaseOrder.create.mock.calls[0][0] as { data: { po_number: string } };
    expect(createCall.data.po_number).toMatch(/^PO-\d{4}-\d{6}$/);
    expect(createCall.data.po_number).toBe('PO-2026-000042');
  });

  it('PRP-10: REQUEST_CHANGES with valid notes -> proposal CHANGES_REQUESTED, order PROPOSAL_CHANGES_REQUESTED', async () => {
    prisma.companyOrderProposal.findUnique.mockResolvedValue(sentProposal());
    prisma.companyOrderProposal.update.mockResolvedValue({
      id: 'prop1',
      status: 'CHANGES_REQUESTED',
      change_request_note: 'Please add more detail about the firewall rules.',
    });

    const result = await svc.customerRespondToProposal('prop1', 'cust1', {
      decision: 'REQUEST_CHANGES',
      change_notes: 'Please add more detail about the firewall rules.',
    });

    expect(prisma.companyOrderProposal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prop1' },
        data: expect.objectContaining({
          status: 'CHANGES_REQUESTED',
          change_request_note: 'Please add more detail about the firewall rules.',
        }),
      }),
    );
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order1' },
        data: expect.objectContaining({ company_order_status: 'PROPOSAL_CHANGES_REQUESTED' }),
      }),
    );
    expect(result).toMatchObject({ proposal: { id: 'prop1', status: 'CHANGES_REQUESTED' } });
  });

  it('PRP-11: REQUEST_CHANGES without notes (undefined) -> throws CHANGE_NOTES_REQUIRED 422', async () => {
    prisma.companyOrderProposal.findUnique.mockResolvedValue(sentProposal());

    await expect(
      svc.customerRespondToProposal('prop1', 'cust1', {
        decision: 'REQUEST_CHANGES',
        // no change_notes
      }),
    ).rejects.toMatchObject({ code: 'CHANGE_NOTES_REQUIRED', status: 422 });
  });

  it('PRP-11b: REQUEST_CHANGES with notes < 20 chars -> throws CHANGE_NOTES_REQUIRED 422', async () => {
    prisma.companyOrderProposal.findUnique.mockResolvedValue(sentProposal());

    await expect(
      svc.customerRespondToProposal('prop1', 'cust1', {
        decision: 'REQUEST_CHANGES',
        change_notes: 'Too short',
      }),
    ).rejects.toMatchObject({ code: 'CHANGE_NOTES_REQUIRED', status: 422 });
  });

  it('PRP-12: wrong customer -> throws FORBIDDEN 403', async () => {
    prisma.companyOrderProposal.findUnique.mockResolvedValue(sentProposal());

    await expect(
      svc.customerRespondToProposal('prop1', 'other_cust', { decision: 'APPROVE' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});
