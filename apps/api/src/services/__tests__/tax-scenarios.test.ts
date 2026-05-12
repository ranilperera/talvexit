/**
 * Tax + invoicing + payment scenario matrix tests.
 *
 * Verifies that every combination of customer (AU / overseas) and supplier
 * (AU company GST / no-GST, overseas company, AU contractor GST / no-GST,
 * overseas contractor) produces the correct GST treatment when:
 *
 *   1. The decision helper is called directly (decideGstTreatment)
 *   2. A catalog order is placed (order.service.createOrder)
 *   3. A proposal is drafted (proposal.service.createProposal)
 *   4. A tender-contract milestone invoice is raised
 *      (tender-contract-payment.service.raiseInvoice)
 *
 * The unit-level decision tests live in tax-decision.test.ts; this file
 * is the *integration* layer — it threads each scenario through the
 * service methods and asserts on what gets persisted to the database.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { uploadToBlobMock } = vi.hoisted(() => ({ uploadToBlobMock: vi.fn() }));
const { convertToAUDMock } = vi.hoisted(() => ({ convertToAUDMock: vi.fn() }));
const { writeAuditMock } = vi.hoisted(() => ({ writeAuditMock: vi.fn() }));

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

// Mock the order-notifications module — its real implementation calls
// prisma.order.findUnique, which would force every order test to mock that
// even when the test's only concern is the persisted tax row.
vi.mock('../order-notifications.js', () => ({
  loadOrderParties: vi.fn(async () => null),
  notifyOrderCreated: vi.fn(async () => undefined),
  notifyOrderSubmitted: vi.fn(async () => undefined),
  notifyOrderRevisionRequested: vi.fn(async () => undefined),
  notifyOrderCompleted: vi.fn(async () => undefined),
}));

// PDF generation — emit empty buffer to avoid pulling in pdfkit's full
// rendering pipeline. Same shape as proposal.service.test.ts.
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
      pipe: vi.fn(),
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
      roundedRect: vi.fn().mockReturnThis(),
      fill: vi.fn().mockReturnThis(),
      heightOfString: vi.fn().mockReturnValue(20),
      currentLineHeight: vi.fn().mockReturnValue(12),
    };
  });
  return { default: PDFDocumentMock };
});

// Imports after mocks
import { Prisma } from '@prisma/client';
import { decideGstTreatment, AU_GST_RATE } from '@onys/shared';
import { ProposalService } from '../proposal.service.js';
import { TenderContractPaymentService } from '../tender-contract-payment.service.js';
import { OrderService } from '../order.service.js';

// ─── Scenario fixtures ─────────────────────────────────────────────────────────

interface SupplierFixture {
  label: string;
  kind: 'company' | 'contractor';
  gst_registered: boolean;
  billing_country: string | null;
  abn?: string | null;
}

interface CustomerFixture {
  label: string;
  billing_country: string | null;
  abn?: string | null;
}

const SUPPLIERS: Record<string, SupplierFixture> = {
  au_company_gst:        { label: 'AU company + GST',        kind: 'company',    gst_registered: true,  billing_country: 'AU', abn: '12345678901' },
  au_company_no_gst:     { label: 'AU company no GST',       kind: 'company',    gst_registered: false, billing_country: 'AU', abn: '12345678901' },
  overseas_company:      { label: 'Overseas company',        kind: 'company',    gst_registered: false, billing_country: 'GB', abn: null },
  au_contractor_gst:     { label: 'AU contractor + GST',     kind: 'contractor', gst_registered: true,  billing_country: 'AU', abn: '98765432109' },
  au_contractor_no_gst:  { label: 'AU contractor no GST',    kind: 'contractor', gst_registered: false, billing_country: 'AU', abn: null },
  overseas_contractor:   { label: 'Overseas contractor',     kind: 'contractor', gst_registered: false, billing_country: 'US', abn: null },
};

const CUSTOMERS: Record<string, CustomerFixture> = {
  au_customer:        { label: 'AU customer',        billing_country: 'AU', abn: '11111111111' },
  overseas_customer:  { label: 'Overseas customer',  billing_country: 'NZ', abn: null },
};

// Expected GST behaviour per (customer, supplier) — matches docs §3.
interface ExpectedOutcome {
  charge_gst: boolean;
  expected_gst_cents: (priceCents: number) => number;
  treatment_reason: string;
  is_tax_invoice: boolean;
  is_cross_border: boolean;
}

function expectedFor(customer: CustomerFixture, supplier: SupplierFixture): ExpectedOutcome {
  const supplierAu = supplier.billing_country === 'AU';
  const customerAu = customer.billing_country === 'AU';
  const isCrossBorder = supplier.billing_country !== customer.billing_country &&
    (supplier.billing_country !== 'AU' || customer.billing_country !== 'AU');

  // Domestic AU + GST-registered supplier → 10% GST
  if (supplierAu && customerAu && supplier.gst_registered) {
    return {
      charge_gst: true,
      expected_gst_cents: (cents) => Math.round(cents * AU_GST_RATE),
      treatment_reason: 'GST 10% applied',
      is_tax_invoice: true,
      is_cross_border: false,
    };
  }
  // Domestic AU but supplier not GST-registered
  if (supplierAu && customerAu && !supplier.gst_registered) {
    return {
      charge_gst: false,
      expected_gst_cents: () => 0,
      treatment_reason: 'GST not applicable — supplier is not registered for GST',
      is_tax_invoice: false,
      is_cross_border: false,
    };
  }
  // AU supplier → overseas customer (export)
  if (supplierAu && !customerAu) {
    return {
      charge_gst: false,
      expected_gst_cents: () => 0,
      treatment_reason: 'GST-free export of services (s38-190 of the GST Act)',
      is_tax_invoice: false,
      is_cross_border: true,
    };
  }
  // Overseas supplier → AU customer (reverse-charge prompt)
  if (!supplierAu && customerAu) {
    return {
      charge_gst: false,
      expected_gst_cents: () => 0,
      treatment_reason: 'Reverse-charge may apply — AU recipient liable for GST under Div 84',
      is_tax_invoice: false,
      is_cross_border: true,
    };
  }
  // Overseas supplier → overseas customer (out of AU GST scope).
  // is_cross_border is true when the parties' countries differ.
  return {
    charge_gst: false,
    expected_gst_cents: () => 0,
    treatment_reason: 'No GST — overseas supplier (not subject to Australian GST)',
    is_tax_invoice: false,
    is_cross_border: isCrossBorder,
  };
}

// ─── Test 1: Decision helper directly ──────────────────────────────────────────

describe('Tax scenario matrix — decideGstTreatment direct', () => {
  for (const [custKey, customer] of Object.entries(CUSTOMERS)) {
    for (const [supKey, supplier] of Object.entries(SUPPLIERS)) {
      it(`${custKey} × ${supKey}: ${customer.label} ← ${supplier.label}`, () => {
        const priceCents = 100_000; // $1,000
        const expected = expectedFor(customer, supplier);
        const decision = decideGstTreatment({
          issuer_country: supplier.billing_country,
          issuer_gst_registered: supplier.gst_registered,
          recipient_country: customer.billing_country,
          amount_ex_gst_cents: priceCents,
        });

        expect(decision.charge_gst, `charge_gst for ${custKey}×${supKey}`).toBe(expected.charge_gst);
        expect(decision.gst_amount_cents).toBe(expected.expected_gst_cents(priceCents));
        expect(decision.treatment_reason).toBe(expected.treatment_reason);
        expect(decision.is_tax_invoice).toBe(expected.is_tax_invoice);
        expect(decision.is_cross_border).toBe(expected.is_cross_border);
      });
    }
  }
});

// ─── Test 2: ProposalService.createProposal stores correct GST ────────────────

describe('Tax scenario matrix — proposal.createProposal persistence', () => {
  function makePrisma() {
    return {
      order: { findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      companyOrderProposal: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      auditLog: { create: vi.fn(async () => ({})) },
      $transaction: vi.fn(),
    };
  }

  function makeQueue() {
    return { add: vi.fn(async () => ({})) };
  }

  let prisma: ReturnType<typeof makePrisma>;
  let svc: ProposalService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    svc = new ProposalService(prisma as never, makeQueue() as never);
    convertToAUDMock.mockImplementation((price: number) => price);
    writeAuditMock.mockResolvedValue(undefined);
  });

  for (const [custKey, customer] of Object.entries(CUSTOMERS)) {
    for (const [supKey, supplier] of Object.entries(SUPPLIERS)) {
      it(`${custKey} × ${supKey}: persisted proposed_tax_aud matches matrix`, async () => {
        const priceAud = 1000;
        const expected = expectedFor(customer, supplier);

        // Mock the order load — proposal.service.ts now selects customer
        // billing_country + supplier (company OR contractor) gst_registered
        // and billing_country.
        prisma.order.findUnique.mockResolvedValue({
          id: 'order1',
          company_id: supplier.kind === 'company' ? 'co1' : null,
          contractor_profile_id: null,
          contractor_user_id: supplier.kind === 'contractor' ? 'contractor1' : null,
          company_order_status: 'BOOKED',
          customer: { billing_country: customer.billing_country },
          company: supplier.kind === 'company'
            ? { gst_registered: supplier.gst_registered, billing_country: supplier.billing_country }
            : null,
          contractor_user: supplier.kind === 'contractor'
            ? { gst_registered: supplier.gst_registered, billing_country: supplier.billing_country }
            : null,
        });

        if (supplier.kind === 'company') {
          prisma.companyMember.findFirst.mockResolvedValue({ role: 'COMPANY_ADMIN' });
        }
        prisma.companyOrderProposal.findFirst.mockResolvedValue(null);
        prisma.companyOrderProposal.create.mockResolvedValue({
          id: 'prop1', status: 'DRAFT', version: 1, order_id: 'order1',
        });

        const callerId = supplier.kind === 'company' ? 'admin1' : 'contractor1';
        await svc.createProposal('order1', callerId, {
          scope_of_work: 'Network audit covering perimeter and internal segments.',
          timeline_days: 30,
          payment_terms: 'Net 14',
          notes: 'note',
          currency: 'AUD',
          price: priceAud,
        });

        const expectedTaxAud = expected.expected_gst_cents(Math.round(priceAud * 100)) / 100;
        const expectedTotalAud = priceAud + expectedTaxAud;

        expect(prisma.companyOrderProposal.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              proposed_price_aud: priceAud,
              proposed_tax_aud: expectedTaxAud,
              proposed_total_aud: expectedTotalAud,
            }),
          }),
        );
      });
    }
  }
});

// ─── Test 3: TenderContractPaymentService.raiseInvoice — GST treatment ────────

describe('Tax scenario matrix — raiseInvoice persists GST treatment', () => {
  function makePrisma() {
    return {
      tenderContract: { findUnique: vi.fn() },
      tenderMilestone: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      tenderContractInvoice: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      documentSequence: {
        upsert: vi.fn(async () => ({ last_value: 1 })),
      },
      $transaction: vi.fn(),
    };
  }

  function makeQueue() {
    return { add: vi.fn(async () => ({})) };
  }

  let prisma: ReturnType<typeof makePrisma>;
  let svc: TenderContractPaymentService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    svc = new TenderContractPaymentService(prisma as never, makeQueue() as never);
    writeAuditMock.mockResolvedValue(undefined);
    uploadToBlobMock.mockResolvedValue(undefined);

    // $transaction passes through to the same mock prisma
    prisma.$transaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === 'function') {
        return (fn as (tx: unknown) => Promise<unknown>)(prisma);
      }
      return Promise.all((fn as Array<Promise<unknown>>));
    });
  });

  for (const [custKey, customer] of Object.entries(CUSTOMERS)) {
    for (const [supKey, supplier] of Object.entries(SUPPLIERS)) {
      it(`${custKey} × ${supKey}: invoice row stamped with correct gst_treatment_reason`, async () => {
        const milestoneAud = 1000;
        const expected = expectedFor(customer, supplier);

        // Build the contract record raiseInvoice loads.
        const contract = {
          id: 'contract1',
          company_id: supplier.kind === 'company' ? 'co1' : null,
          contractor_user_id: supplier.kind === 'contractor' ? 'contractor1' : null,
          customer_id: 'cust1',
          customer: {
            id: 'cust1', email: 'cust@example.com', full_name: 'Customer Co',
            legal_entity_name: 'Customer Co Pty Ltd', trading_name: null,
            billing_email: 'billing@example.com', billing_phone: null,
            abn: customer.abn, acn: null,
            billing_address_1: '1 Main St', billing_address_2: null,
            billing_city: 'Sydney', billing_state: 'NSW', billing_postcode: '2000',
            billing_country: customer.billing_country,
          },
          company: supplier.kind === 'company' ? {
            id: 'co1', company_name: 'Supplier Co', legal_company_name: 'Supplier Co Pty Ltd',
            abn: supplier.abn, acn: null, abn_verified: true,
            gst_registered: supplier.gst_registered,
            billing_email: 's@example.com', billing_phone: null,
            billing_address_1: '2 Supplier St', billing_address_2: null,
            billing_city: 'Sydney', billing_state: 'NSW', billing_postcode: '2000',
            billing_country: supplier.billing_country,
            primary_admin_id: 'admin1',
            payout_preference: { method: 'BANK_AU' },
            primary_admin: { email: 'admin@example.com', payment_methods: {} },
          } : null,
          contractor: supplier.kind === 'contractor' ? {
            id: 'contractor1', full_name: 'Solo Contractor', email: 'solo@example.com',
            legal_entity_name: 'Solo Contractor Pty Ltd', trading_name: null,
            billing_phone: null,
            abn: supplier.abn, acn: null, gst_registered: supplier.gst_registered,
            billing_address_1: '3 Solo St', billing_address_2: null,
            billing_city: 'Sydney', billing_state: 'NSW', billing_postcode: '2000',
            billing_country: supplier.billing_country,
            payment_methods: {},
          } : null,
        };

        prisma.tenderContract.findUnique.mockResolvedValue(contract);
        prisma.tenderMilestone.findUnique.mockResolvedValue({
          id: 'ms1',
          contract_id: 'contract1',
          name: 'Milestone 1',
          description: 'First batch',
          amount_aud: milestoneAud,
          status: 'APPROVED',
          invoice: null,
        });
        prisma.tenderContractInvoice.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'inv1', ...data,
        }));
        prisma.tenderContractInvoice.findUnique.mockResolvedValue({
          id: 'inv1',
          contract: { customer_id: 'cust1', company_id: contract.company_id, contractor_user_id: contract.contractor_user_id },
          milestone: { id: 'ms1', name: 'Milestone 1', amount_aud: milestoneAud },
          bank_transfer: null,
          payout_record: null,
        });

        const callerId = supplier.kind === 'company' ? 'admin1' : 'contractor1';
        const callerCompanyId = supplier.kind === 'company' ? 'co1' : undefined;
        await svc.raiseInvoice('contract1', 'ms1', callerId, callerCompanyId);

        // Capture the invoice create payload
        const createCall = prisma.tenderContractInvoice.create.mock.calls[0]?.[0] as
          | { data: Record<string, unknown> }
          | undefined;
        expect(createCall, 'tenderContractInvoice.create should have been called').toBeDefined();
        const data = createCall!.data;

        const expectedGstAud = expected.expected_gst_cents(Math.round(milestoneAud * 100)) / 100;
        const expectedTotal = milestoneAud + expectedGstAud;

        expect(data.amount_aud).toBe(milestoneAud);
        expect(data.gst_amount_aud).toBe(expectedGstAud);
        expect(data.total_aud).toBe(expectedTotal);
        expect(data.gst_free).toBe(!expected.charge_gst);
        expect(data.is_tax_invoice).toBe(expected.is_tax_invoice);
        expect(data.is_cross_border).toBe(expected.is_cross_border);
        expect(data.gst_treatment_reason).toBe(expected.treatment_reason);
        expect(data.provider_gst_registered).toBe(supplier.gst_registered);
        expect(data.provider_abn).toBe(supplier.abn ?? null);
        expect(data.customer_abn).toBe(customer.abn ?? null);
      });
    }
  }
});

// ─── Test 4: OrderService.createOrder persists correct GST per matrix ────────

describe('Tax scenario matrix — order.createOrder persistence', () => {
  function makePrisma() {
    return {
      user: { findUnique: vi.fn() },
      task: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
      consultingCompany: { findUnique: vi.fn() },
      order: { create: vi.fn() },
      auditLog: { create: vi.fn(async () => ({})) },
    };
  }

  function makeQueue() {
    return { add: vi.fn(async () => ({})) };
  }

  let prisma: ReturnType<typeof makePrisma>;
  let svc: OrderService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    svc = new OrderService(
      prisma as never,
      makeQueue() as never,
      { notify: vi.fn(async () => undefined) } as never,
    );
    convertToAUDMock.mockImplementation((price: number) => price);
    writeAuditMock.mockResolvedValue(undefined);
  });

  for (const [custKey, customer] of Object.entries(CUSTOMERS)) {
    for (const [supKey, supplier] of Object.entries(SUPPLIERS)) {
      it(`${custKey} × ${supKey}: order row persists tax_amount_aud per matrix`, async () => {
        const priceAud = 1000;
        const expected = expectedFor(customer, supplier);

        // 1st user.findUnique → customer auth check (CUSTOMER account_type)
        // 2nd user.findUnique → contractor lookup (only for contractor-owned task)
        // last user.findUnique → customer billing_country for tax decision
        const customerAuth = {
          id: 'cust1',
          account_type: 'CUSTOMER',
          full_name: 'Customer Co',
        };
        const customerForTax = { billing_country: customer.billing_country };
        const contractorRow = supplier.kind === 'contractor' ? {
          email: 'contractor@example.com',
          gst_registered: supplier.gst_registered,
          billing_country: supplier.billing_country,
        } : null;

        if (supplier.kind === 'contractor') {
          prisma.user.findUnique
            .mockResolvedValueOnce(customerAuth)   // auth
            .mockResolvedValueOnce(contractorRow)  // contractor for tax + email
            .mockResolvedValueOnce(customerForTax); // customer for tax
        } else {
          prisma.user.findUnique
            .mockResolvedValueOnce(customerAuth)   // auth
            .mockResolvedValueOnce(customerForTax) // customer for tax
            .mockResolvedValueOnce({ id: 'admin1', email: 'admin@example.com' }); // notification
        }

        prisma.task.findUnique.mockResolvedValue({
          id: 'task1',
          status: 'PUBLISHED',
          title: 'Pen test',
          domain: 'PENETRATION_TESTING',
          objective: 'Test',
          in_scope: ['A'],
          out_of_scope: ['B'],
          assumptions: [],
          prerequisites: [],
          deliverables: ['Report'],
          currency: 'AUD',
          price: new Prisma.Decimal(priceAud),
          price_aud: new Prisma.Decimal(priceAud),
          hours_min: 4,
          hours_max: 8,
          milestone_count: 1,
          company_id: supplier.kind === 'company' ? 'co1' : null,
          contractor_profile: supplier.kind === 'contractor'
            ? { id: 'cp1', user_id: 'contractor1', status: 'ACTIVE' }
            : null,
        });

        if (supplier.kind === 'company') {
          prisma.consultingCompany.findUnique.mockResolvedValue({
            primary_admin_id: 'admin1',
            company_name: 'Supplier Co',
            gst_registered: supplier.gst_registered,
            billing_country: supplier.billing_country,
          });
        }

        prisma.order.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'order1', ...data,
        }));

        await svc.createOrder(
          'cust1',
          { task_id: 'task1' } as never,
          { ip: '127.0.0.1', userAgent: 'vitest' },
        );

        const createCall = prisma.order.create.mock.calls[0]?.[0] as
          | { data: { tax_amount_aud: Prisma.Decimal; total_amount_aud: Prisma.Decimal; price_aud: Prisma.Decimal } }
          | undefined;
        expect(createCall, 'order.create should have been called').toBeDefined();
        const data = createCall!.data;

        const expectedTaxAud = expected.expected_gst_cents(Math.round(priceAud * 100)) / 100;
        const expectedTotal = priceAud + expectedTaxAud;

        expect(Number(data.price_aud)).toBe(priceAud);
        expect(Number(data.tax_amount_aud)).toBe(expectedTaxAud);
        expect(Number(data.total_amount_aud)).toBe(expectedTotal);
      });
    }
  }
});

// ─── Test 5: Domestic AU end-to-end smoke (full cents arithmetic) ──────────────

describe('Domestic AU end-to-end — cents arithmetic precision', () => {
  it('$1,234.50 ex-GST → $123.45 GST, $1,357.95 total (rounding-correct)', () => {
    const decision = decideGstTreatment({
      issuer_country: 'AU',
      issuer_gst_registered: true,
      recipient_country: 'AU',
      amount_ex_gst_cents: 123_450,
    });
    expect(decision.gst_amount_cents).toBe(12_345);
    expect(decision.charge_gst).toBe(true);
  });

  it('$0.01 ex-GST → $0.00 GST (rounded down)', () => {
    const decision = decideGstTreatment({
      issuer_country: 'AU',
      issuer_gst_registered: true,
      recipient_country: 'AU',
      amount_ex_gst_cents: 1,
    });
    expect(decision.gst_amount_cents).toBe(0); // 1 * 0.10 = 0.1 → 0
  });

  it('$0.05 ex-GST → $0.01 GST (rounded up via banker-style Math.round)', () => {
    const decision = decideGstTreatment({
      issuer_country: 'AU',
      issuer_gst_registered: true,
      recipient_country: 'AU',
      amount_ex_gst_cents: 5,
    });
    // 5 * 0.10 = 0.5 → Math.round(0.5) = 1 (round-half-up in JS)
    expect(decision.gst_amount_cents).toBe(1);
  });
});

// ─── Test 6: Customer GST status doesn't affect supplier's invoice ─────────────

describe('Customer GST registration does NOT affect supplier GST charge', () => {
  it('AU customer, GST-registered, with AU GST-registered supplier → 10% GST (no change)', () => {
    const decision = decideGstTreatment({
      issuer_country: 'AU',
      issuer_gst_registered: true,
      recipient_country: 'AU',
      amount_ex_gst_cents: 100_000,
    });
    expect(decision.gst_amount_cents).toBe(10_000);
    // Customer's own GST registration is intentionally not in the input —
    // under AU GST law the supplier's status determines whether GST is
    // charged. The customer's status only affects ITC eligibility.
  });

  it('AU customer, NOT GST-registered, with AU GST-registered supplier → still 10% GST', () => {
    const decision = decideGstTreatment({
      issuer_country: 'AU',
      issuer_gst_registered: true,
      recipient_country: 'AU',
      amount_ex_gst_cents: 100_000,
    });
    expect(decision.gst_amount_cents).toBe(10_000);
    // Same input — the function doesn't take customer GST status as an arg.
    // Test exists to lock in the design intent.
  });
});
