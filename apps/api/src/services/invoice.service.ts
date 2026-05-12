import type { PrismaClient, CompanyInvoice } from '@prisma/client';
import type { Queue } from 'bullmq';
import PDFDocument from 'pdfkit';
import { AppError } from '../lib/errors.js';
import { writeAudit } from '../utils/audit.js';
import { getFrontendUrl, emailUrls } from '../utils/urls.js';
import { uploadToBlob } from '../utils/blob-storage.js';
import { calculatePayout } from '../utils/commission.js';
import { stripe } from './stripe.service.js';
import {
  classifyInvoice,
  validateABN,
} from './compliance.service.js';
import { getProviderType, getProviderIds } from '../utils/order-provider.js';

// ─── Internal types ────────────────────────────────────────────────────────────

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

interface CompanyInvoicePdfData {
  invoice_number: string;
  invoice_type_label: string;
  is_tax_invoice: boolean;
  order_id: string;
  po_number: string;
  scope_title: string | null;
  issued_date: Date;
  due_date: Date;
  payment_terms_days: number;
  // Agent billing
  billing_agent_name: string;
  provider_legal_name: string;
  provider_abn: string | null;
  provider_gst_registered: boolean;
  provider_address: string | null;
  // Customer
  customer_legal_name: string;
  customer_abn: string | null;
  customer_email: string;
  // Amounts
  subtotal_ex_gst: number;
  gst_amount: number;
  total_aud: number;
  // Withholding
  withholding_applied: boolean;
  withholding_amount: number | null;
  withholding_rate: number | null;
  // Flags
  gst_free: boolean;
  is_cross_border: boolean;
  compliance_notes: string[];
}

// ─── InvoiceService ────────────────────────────────────────────────────────────

export class InvoiceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── HELPER: generateDocumentNumber ─────────────────────────────────────────
  // Atomically increments the document sequence and returns a formatted number.

  private async generateDocumentNumber(
    tx: TxClient,
    type: 'PO' | 'INV',
  ): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await tx.documentSequence.upsert({
      where: { type },
      create: { type, year, last_value: 1 },
      update: { last_value: { increment: 1 } },
    });
    return `${type}-${year}-${String(seq.last_value).padStart(6, '0')}`;
  }

  // ─── METHOD 1: createInvoice ─────────────────────────────────────────────────
  // Creates a tax invoice for a company order after deliverables are accepted.
  // Pricing is locked from the associated PurchaseOrder.

  /**
   * @param orderId - The order to invoice.
   * @param adminUserId - Must be a COMPANY_ADMIN of the order's company.
   * @param data - Optional due date override.
   * @returns The created CompanyInvoice record.
   * @throws {AppError} DELIVERABLES_NOT_ACCEPTED if wrong order status.
   * @throws {AppError} INVOICE_EXISTS if invoice already created for this order.
   * @throws {AppError} INSUFFICIENT_COMPANY_ROLE if not COMPANY_ADMIN.
   * @throws {AppError} PO_NOT_FOUND if no purchase order exists yet.
   */
  async createInvoice(
    orderId: string,
    adminUserId: string,
    data: { due_date_override?: Date },
  ): Promise<CompanyInvoice> {
    // 1. Load order with relationships (both company and contractor)
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        company_id: true,
        contractor_profile_id: true,
        contractor_user_id: true,
        company_order_status: true,
        customer_id: true,
        customer: {
          select: {
            full_name: true,
            email: true,
            legal_name: true,
            abn: true,
            tax_residency_country: true,
            is_foreign_entity: true,
          },
        },
        company: {
          select: {
            id: true,
            company_name: true,
            legal_company_name: true,
            abn: true,
            abn_verified: true,
            gst_registered: true,
            is_foreign_entity: true,
            business_address: true,
            website_url: true,
            primary_admin_id: true,
          },
        },
        contractor_user: {
          select: {
            id: true,
            full_name: true,
            legal_name: true,
            abn: true,
            abn_verified: true,
            gst_registered: true,
            is_foreign_entity: true,
            billing_address_1: true,
          },
        },
        purchase_order: {
          select: {
            id: true,
            po_number: true,
            scope_title: true,
            amount_aud: true,
            tax_aud: true,
            total_aud: true,
          },
        },
      },
    });

    if (!order) throw new AppError('ORDER_NOT_FOUND', 404, 'Order not found.');
    if (order.company_order_status !== 'DELIVERABLES_ACCEPTED') {
      throw new AppError(
        'DELIVERABLES_NOT_ACCEPTED',
        422,
        'Invoice can only be created after customer has accepted the deliverables.',
      );
    }

    // 2. Verify no invoice already exists
    const existing = await this.prisma.companyInvoice.findUnique({ where: { order_id: orderId } });
    if (existing) {
      throw new AppError(
        'INVOICE_EXISTS',
        409,
        `An invoice already exists for this order. Invoice: ${existing.invoice_number}`,
      );
    }

    // 3. Verify provider permission
    const providerType = getProviderType(order);
    if (providerType === 'company') {
      const membership = await this.prisma.companyMember.findFirst({
        where: { company_id: order.company_id!, user_id: adminUserId, status: 'ACTIVE' },
        select: { role: true },
      });
      if (!membership || membership.role !== 'COMPANY_ADMIN') {
        throw new AppError('INSUFFICIENT_COMPANY_ROLE', 403, 'Only Company Admins can create invoices.');
      }
    } else {
      if (order.contractor_user_id !== adminUserId) {
        throw new AppError('FORBIDDEN', 403, 'Only the assigned expert can create invoices for this order.');
      }
    }

    // 4. Require an approved PurchaseOrder to lock pricing
    const po = order.purchase_order;
    if (!po) {
      throw new AppError('PO_NOT_FOUND', 422, 'No purchase order found. The customer must approve a proposal first.');
    }

    // 5. Build unified provider data for compliance classification
    const providerData = providerType === 'company'
      ? {
          legal_name: order.company!.legal_company_name ?? order.company!.company_name,
          abn: order.company!.abn ?? null,
          abn_verified: order.company!.abn_verified,
          gst_registered: order.company!.gst_registered,
          is_foreign_entity: order.company!.is_foreign_entity,
          address: order.company!.business_address ?? null,
        }
      : {
          legal_name: order.contractor_user!.legal_name ?? order.contractor_user!.full_name,
          abn: order.contractor_user!.abn ?? null,
          abn_verified: order.contractor_user!.abn_verified ?? false,
          gst_registered: order.contractor_user!.gst_registered ?? false,
          is_foreign_entity: order.contractor_user!.is_foreign_entity ?? false,
          address: order.contractor_user!.billing_address_1 ?? null,
        };

    const customer = order.customer;
    const providerHasAbn = !!(providerData.abn && validateABN(providerData.abn));
    const customerIsForeign = (customer.is_foreign_entity) ||
      (customer.tax_residency_country !== null && customer.tax_residency_country !== 'AU');

    const subtotalExGst = Number(po.amount_aud);
    const classification = classifyInvoice({
      providerGstRegistered: providerData.gst_registered,
      providerHasAbn,
      providerIsForeign: providerData.is_foreign_entity,
      customerIsForeign,
      ...(customer.abn ? { customerAbn: customer.abn } : {}),
      invoiceAmountExGst: subtotalExGst,
    });

    // GST amount comes from classifyInvoice's pre-computed cents value
    // (decideGstTreatment in @onys/shared owns the math). No recompute here.
    const gstAmount = classification.gstAmountCents / 100;
    const totalAud = subtotalExGst + gstAmount;
    const withholdingAmount = classification.withholdingRequired
      ? Math.round(subtotalExGst * classification.withholdingRate * 100) / 100
      : 0;

    // 6. Generate invoice number atomically
    const invoice_number = await this.generateDocumentNumber(this.prisma, 'INV');

    // 7. Calculate due date (default 14 days)
    const DEFAULT_TERMS_DAYS = 14;
    const due_date =
      data.due_date_override ?? new Date(Date.now() + DEFAULT_TERMS_DAYS * 24 * 60 * 60 * 1000);

    const ONSYS_ABN = process.env['ONSYS_ABN'] ?? 'TBA';

    // 8. Create invoice with full compliance/agent billing fields
    const providerIds = getProviderIds(order);
    const invoice = await this.prisma.companyInvoice.create({
      data: {
        order_id: orderId,
        company_id: providerIds.company_id,
        contractor_profile_id: providerIds.contractor_profile_id,
        created_by_id: adminUserId,
        invoice_number,
        status: 'SENT',
        // ── Legacy amount fields (keep for backward compat) ────────────────
        amount_aud: po.amount_aud,
        tax_aud: gstAmount,
        total_aud: totalAud,
        due_date,
        sent_at: new Date(),
        payment_terms_days: DEFAULT_TERMS_DAYS,
        // ── Agent billing compliance fields ────────────────────────────────
        invoice_type_label: classification.label,
        is_tax_invoice: classification.isTaxInvoice,
        billing_agent_name: `Onsys Pty Ltd (ABN: ${ONSYS_ABN})`,
        provider_legal_name: providerData.legal_name,
        provider_abn: providerData.abn,
        provider_gst_registered: providerData.gst_registered,
        customer_legal_name: customer.legal_name ?? customer.full_name,
        customer_abn: customer.abn ?? null,
        subtotal_ex_gst_aud: subtotalExGst,
        gst_amount_aud: gstAmount,
        is_cross_border: customerIsForeign,
        gst_free: classification.gstFree,
        withholding_applied: classification.withholdingRequired,
        withholding_amount_aud: withholdingAmount > 0 ? withholdingAmount : null,
        withholding_rate: classification.withholdingRate > 0 ? classification.withholdingRate : null,
      },
    });

    // Log compliance notes if any
    if (classification.notes.length > 0) {
      console.log('[invoice] Compliance notes for', invoice_number, ':', classification.notes);
      await writeAudit(this.prisma, {
        actorId: adminUserId,
        actionType: 'INVOICE_COMPLIANCE_NOTES',
        entityType: 'CompanyInvoice',
        entityId: invoice.id,
        metadata: { notes: classification.notes },
      });
    }

    // 8. Generate PDF and upload to Blob
    const pdfBuffer = await generateCompanyInvoicePdf({
      invoice_number,
      invoice_type_label: classification.label,
      is_tax_invoice: classification.isTaxInvoice,
      order_id: orderId,
      po_number: po.po_number,
      scope_title: po.scope_title ?? null,
      issued_date: new Date(),
      due_date,
      payment_terms_days: DEFAULT_TERMS_DAYS,
      billing_agent_name: `Onsys Pty Ltd (ABN: ${ONSYS_ABN})`,
      provider_legal_name: providerData.legal_name,
      provider_abn: providerData.abn,
      provider_gst_registered: providerData.gst_registered,
      provider_address: providerData.address,
      customer_legal_name: customer.legal_name ?? customer.full_name,
      customer_abn: customer.abn ?? null,
      customer_email: customer.email,
      subtotal_ex_gst: subtotalExGst,
      gst_amount: gstAmount,
      total_aud: totalAud,
      withholding_applied: classification.withholdingRequired,
      withholding_amount: withholdingAmount > 0 ? withholdingAmount : null,
      withholding_rate: classification.withholdingRate > 0 ? classification.withholdingRate : null,
      gst_free: classification.gstFree,
      is_cross_border: customerIsForeign,
      compliance_notes: classification.notes,
    });

    const pdfBlobPath = `invoices/${orderId}/INV-${invoice_number}.pdf`;
    await uploadToBlob(pdfBlobPath, pdfBuffer, 'application/pdf');
    await this.prisma.companyInvoice.update({
      where: { id: invoice.id },
      data: { pdf_blob_path: pdfBlobPath },
    });

    // 9. Advance order status
    await this.prisma.order.update({
      where: { id: orderId },
      data: { company_order_status: 'INVOICE_SENT' },
    });

    // 10. Audit
    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'INVOICE_CREATED',
      entityType: 'CompanyInvoice',
      entityId: invoice.id,
      metadata: {
        invoice_number,
        total_aud: Number(po.total_aud),
        due_date: due_date.toISOString(),
        order_id: orderId,
      },
    });

    // 11. Notify customer via email queue
    await this.emailQueue.add('invoice-received', {
      type: 'invoice-received',
      to: order.customer.email,
      order_id: orderId,
      invoice_number,
      total_amount_aud: Number(po.total_aud),
      due_date: due_date.toISOString(),
      pdf_blob_path: pdfBlobPath,
      payment_url: `${getFrontendUrl()}/orders/${orderId}/payment`,
    });

    return { ...invoice, pdf_blob_path: pdfBlobPath };
  }

  // ─── METHOD 2: createInvoicePaymentIntent ────────────────────────────────────
  // Creates (or retrieves) a Stripe PaymentIntent for the customer to pay.
  // Funds go to the PLATFORM account; company payout is processed manually by admin.

  /**
   * @param invoiceId - The invoice to pay.
   * @param customerId - Must be the customer on the order.
   * @returns Stripe client_secret and payment_intent_id.
   * @throws {AppError} INVOICE_NOT_FOUND, FORBIDDEN, INVOICE_ALREADY_PAID.
   */
  async createInvoicePaymentIntent(
    invoiceId: string,
    customerId: string,
  ): Promise<{ client_secret: string; payment_intent_id: string }> {
    // 1. Load invoice with order for access check
    const invoice = await this.prisma.companyInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        order_id: true,
        company_id: true,
        invoice_number: true,
        total_aud: true,
        paid_at: true,
        stripe_payment_intent_id: true,
        order: {
          select: {
            customer_id: true,
            stripe_payment_intent_id: true,
          },
        },
      },
    });

    if (!invoice) throw new AppError('INVOICE_NOT_FOUND', 404, 'Invoice not found.');
    if (invoice.order.customer_id !== customerId) {
      throw new AppError('FORBIDDEN', 403, 'You are not the customer on this order.');
    }
    if (invoice.paid_at) {
      throw new AppError('INVOICE_ALREADY_PAID', 409, 'This invoice has already been paid.');
    }

    // 2. Idempotency — prefer PI on invoice (authoritative), fall back to Order (legacy)
    const existingPiId = invoice.stripe_payment_intent_id ?? invoice.order.stripe_payment_intent_id;
    if (existingPiId) {
      const existing = await stripe.paymentIntents.retrieve(existingPiId);
      if (existing.status !== 'canceled') {
        // Backfill onto invoice if it was only on Order
        if (!invoice.stripe_payment_intent_id) {
          await this.prisma.companyInvoice.update({
            where: { id: invoiceId },
            data: { stripe_payment_intent_id: existing.id },
          });
        }
        return {
          client_secret: existing.client_secret!,
          payment_intent_id: existing.id,
        };
      }
    }

    // 3. Create PaymentIntent — no on_behalf_of; platform collects funds
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(Number(invoice.total_aud) * 100),
      currency: 'aud',
      metadata: {
        payment_type: 'provider_invoice',
        invoice_id: invoiceId,
        order_id: invoice.order_id,
        company_id: invoice.company_id ?? '',
        invoice_number: invoice.invoice_number,
      },
      description: `Invoice ${invoice.invoice_number} — Order ${invoice.order_id}`,
    });

    // 4. Store PI ID on CompanyInvoice (authoritative) AND Order (backward compat)
    await this.prisma.companyInvoice.update({
      where: { id: invoiceId },
      data: { stripe_payment_intent_id: pi.id },
    });
    await this.prisma.order.update({
      where: { id: invoice.order_id },
      data: { stripe_payment_intent_id: pi.id },
    });
    console.log(`[invoice] PI saved to CompanyInvoice: ${pi.id} → ${invoiceId}`);

    return { client_secret: pi.client_secret!, payment_intent_id: pi.id };
  }

  // ─── METHOD 3: handleInvoicePaymentSuccess ───────────────────────────────────
  // Called by the Stripe webhook handler when payment_intent.succeeded fires
  // and the PI was created for a company invoice (metadata.invoice_id is set).
  // Idempotent — safe to call multiple times for the same PI.

  /**
   * @param paymentIntentId - The Stripe PaymentIntent ID from the webhook.
   */
  async handleInvoicePaymentSuccess(paymentIntentId: string): Promise<void> {
    // 1. Multi-strategy lookup — handles three scenarios:
    //    a) PI saved on CompanyInvoice (new path, post-fix)
    //    b) PI saved on Order (legacy path, pre-fix)
    //    c) PI saved only on CompanyInvoice.stripe_payment_intent_id via metadata

    const selectShape = {
      id: true,
      company_id: true,
      contractor_profile_id: true,
      company_invoice: {
        select: {
          id: true,
          invoice_number: true,
          paid_at: true,
          amount_aud: true, // excl. GST — gross for commission
          total_aud: true,
          stripe_payment_intent_id: true,
        },
      },
      company: {
        select: {
          id: true,
          company_name: true,
          primary_admin_id: true,
          primary_admin: { select: { email: true } },
          completed_orders_count: true,
          payout_preference: { select: { method: true } },
        },
      },
      contractor_profile: {
        select: {
          id: true,
          completed_orders_count: true,
          user: { select: { email: true } },
        },
      },
    } as const;

    // Strategy A: PI on Order.stripe_payment_intent_id
    let order = await this.prisma.order.findFirst({
      where: { stripe_payment_intent_id: paymentIntentId },
      select: selectShape,
    });

    // Strategy B: PI on CompanyInvoice.stripe_payment_intent_id
    if (!order?.company_invoice) {
      const inv = await this.prisma.companyInvoice.findFirst({
        where: { stripe_payment_intent_id: paymentIntentId },
        select: { order_id: true },
      });
      if (inv) {
        order = await this.prisma.order.findFirst({
          where: { id: inv.order_id },
          select: selectShape,
        });
      }
    }

    if (!order?.company_invoice) {
      console.warn('[invoice] handleInvoicePaymentSuccess: no invoice found for PI', paymentIntentId);
      return;
    }

    // Backfill PI onto invoice if it was only on Order (legacy)
    if (!order.company_invoice.stripe_payment_intent_id) {
      await this.prisma.companyInvoice.update({
        where: { id: order.company_invoice.id },
        data: { stripe_payment_intent_id: paymentIntentId },
      });
    }

    const inv = order.company_invoice;

    // 2. Idempotency guard
    if (inv.paid_at) return;

    const isCompanyOrder = !!order.company_id;
    const now = new Date();

    // Gross payout base (excl. GST)
    const gross = Number(inv.amount_aud);
    const completedCount = isCompanyOrder
      ? (order.company?.completed_orders_count ?? 0)
      : (order.contractor_profile?.completed_orders_count ?? 0);
    const { commission_amount_aud, commission_rate, commission_gst_aud, net_amount_aud } = calculatePayout(gross, completedCount);

    const payoutMethod = isCompanyOrder
      ? (order.company?.payout_preference?.method ?? 'AU_BANK')
      : 'AU_BANK';

    // 3. Transactional updates: mark paid, advance status, create payout record
    const payoutRecord = await this.prisma.$transaction(async (tx) => {
      await tx.companyInvoice.update({
        where: { id: inv.id },
        data: {
          paid_at: now,
          stripe_payment_intent_id: paymentIntentId, // ensure it's always set
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { company_order_status: 'PAYMENT_RECEIVED' },
      });

      return tx.companyPayoutRecord.create({
        data: {
          order_id: order.id,
          ...(isCompanyOrder
            ? { company_id: order.company_id! }
            : { contractor_profile_id: order.contractor_profile_id! }),
          gross_amount_aud: gross,
          platform_fee_aud: commission_amount_aud,
          commission_gst_aud,
          net_amount_aud,
          method: payoutMethod,
          status: 'PENDING',
        },
      });
    });

    // 4. Audit
    await writeAudit(this.prisma, {
      actionType: 'INVOICE_PAYMENT_RECEIVED',
      entityType: 'CompanyInvoice',
      entityId: inv.id,
      metadata: {
        payment_intent_id: paymentIntentId,
        gross_aud: gross,
        commission_rate,
        net_aud: net_amount_aud,
        payout_record_id: payoutRecord.id,
        order_id: order.id,
        provider_type: isCompanyOrder ? 'company' : 'contractor',
      },
    });

    // 5. Notify provider (company admin or individual contractor)
    const providerEmail = isCompanyOrder
      ? order.company?.primary_admin?.email
      : order.contractor_profile?.user?.email;

    if (providerEmail) {
      await this.emailQueue.add('invoice-paid', {
        type: 'invoice-paid',
        to: providerEmail,
        order_id: order.id,
        invoice_number: inv.invoice_number,
        amount_paid: Number(inv.total_aud),
        net_payout: net_amount_aud,
      });
    }

    // 6. Notify all platform admins that a payout requires action
    const platformAdmins = await this.prisma.user.findMany({
      where: { account_type: 'PLATFORM_ADMIN' },
      select: { email: true },
    });

    const providerLabel = isCompanyOrder
      ? (order.company?.company_name ?? 'Company')
      : 'Contractor';

    for (const admin of platformAdmins) {
      await this.emailQueue.add('payout-awaiting-action', {
        type: 'payout-awaiting-action',
        to: admin.email,
        order_id: order.id,
        company_name: providerLabel,
        net_payout_aud: net_amount_aud,
        method: payoutMethod,
        admin_url: emailUrls.adminPayout(payoutRecord.id),
      });
    }

    console.log(`[invoice] Payment processed: ${inv.invoice_number} → PAYMENT_RECEIVED (${isCompanyOrder ? 'company' : 'contractor'})`);
  }
}

// ─── HELPER: generateCompanyInvoicePdf ────────────────────────────────────────
// Generates an agent billing invoice PDF.
// Onsys Pty Ltd issues as non-exclusive billing agent for the provider.

async function generateCompanyInvoicePdf(data: CompanyInvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 60, right: 60 },
    });

    const buffers: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const PAGE_WIDTH = 595.28;
    const CONTENT_WIDTH = PAGE_WIDTH - 120; // 415.28
    const COL2_X = 340;
    const RIGHT_WIDTH = PAGE_WIDTH - COL2_X - 60; // 195.28

    // ─── HEADER LEFT: billing agent block ─────────────────────────────────────
    doc
      .fontSize(7).font('Helvetica').fillColor('#94a3b8')
      .text('ISSUED BY', 60, 50);

    doc
      .fontSize(11).font('Helvetica-Bold').fillColor('#0f172a')
      .text(data.billing_agent_name, 60, 62);

    doc
      .fontSize(7.5).font('Helvetica').fillColor('#64748b')
      .text('as non-exclusive billing and collection agent for:', 60, 78);

    doc
      .fontSize(10).font('Helvetica-Bold').fillColor('#0f172a')
      .text(data.provider_legal_name, 60, 92);

    let agentY = 108;
    if (data.provider_abn) {
      doc.fontSize(8).font('Helvetica').fillColor('#64748b')
        .text(`ABN: ${data.provider_abn}`, 60, agentY);
      agentY += 12;
    }
    if (data.provider_address) {
      doc.fontSize(8).font('Helvetica').fillColor('#64748b')
        .text(data.provider_address, 60, agentY, { width: 240 });
    }

    // ─── HEADER RIGHT: invoice type + number ──────────────────────────────────
    doc
      .fontSize(22).font('Helvetica-Bold').fillColor('#0f172a')
      .text(data.invoice_type_label.toUpperCase(), COL2_X, 50, { align: 'right', width: RIGHT_WIDTH });

    doc
      .fontSize(10).font('Helvetica-Bold').fillColor('#0ea5e9')
      .text(data.invoice_number, COL2_X, 82, { align: 'right', width: RIGHT_WIDTH });

    doc
      .fontSize(8).font('Helvetica').fillColor('#64748b')
      .text(`Date issued: ${data.issued_date.toLocaleDateString('en-AU')}`, COL2_X, 98, { align: 'right', width: RIGHT_WIDTH })
      .text(`Due: ${data.due_date.toLocaleDateString('en-AU')}`, COL2_X, 110, { align: 'right', width: RIGHT_WIDTH })
      .text(`Terms: Net ${data.payment_terms_days}`, COL2_X, 122, { align: 'right', width: RIGHT_WIDTH });

    doc.moveTo(60, 142).lineTo(PAGE_WIDTH - 60, 142).strokeColor('#e2e8f0').lineWidth(1).stroke();

    // ─── BILL TO / REFERENCE ──────────────────────────────────────────────────
    let y = 160;

    doc
      .fontSize(8).font('Helvetica-Bold').fillColor('#94a3b8')
      .text('BILL TO', 60, y)
      .text('REFERENCE', COL2_X, y);

    y += 14;

    doc
      .fontSize(10).font('Helvetica-Bold').fillColor('#0f172a')
      .text(data.customer_legal_name, 60, y);

    doc
      .fontSize(9).font('Helvetica').fillColor('#444444')
      .text(data.customer_email, 60, y + 14);

    if (data.customer_abn) {
      doc.fontSize(8).font('Helvetica').fillColor('#64748b')
        .text(`ABN: ${data.customer_abn}`, 60, y + 28);
    }

    doc
      .fontSize(9).font('Helvetica').fillColor('#444444')
      .text(`Invoice: ${data.invoice_number}`, COL2_X, y)
      .text(`PO: ${data.po_number}`, COL2_X, y + 14)
      .text(`Order: ${data.order_id.slice(-8).toUpperCase()}`, COL2_X, y + 28);

    y += 52;

    doc.moveTo(60, y).lineTo(PAGE_WIDTH - 60, y).strokeColor('#e2e8f0').stroke();
    y += 18;

    // ─── LINE ITEMS TABLE ─────────────────────────────────────────────────────
    doc.rect(60, y, CONTENT_WIDTH, 26).fillColor('#f8fafc').fill();
    doc
      .fontSize(8).font('Helvetica-Bold').fillColor('#64748b')
      .text('DESCRIPTION', 68, y + 8)
      .text('AMOUNT (AUD)', 370, y + 8, { width: 165, align: 'right' });

    y += 26;

    const lineDesc = data.scope_title
      ? data.scope_title
      : 'Professional consulting services as per approved proposal';

    doc
      .fontSize(9).font('Helvetica').fillColor('#1e293b')
      .text(lineDesc, 68, y + 6, { width: 290 })
      .text(`$${data.subtotal_ex_gst.toFixed(2)}`, 370, y + 6, { width: 165, align: 'right' });

    y += 34;

    doc.moveTo(60, y).lineTo(PAGE_WIDTH - 60, y).strokeColor('#e2e8f0').stroke();
    y += 14;

    // ─── TOTALS ───────────────────────────────────────────────────────────────
    doc
      .fontSize(9).font('Helvetica').fillColor('#64748b')
      .text('Subtotal (ex. GST)', 300, y, { width: 155, align: 'right' })
      .text(`$${data.subtotal_ex_gst.toFixed(2)}`, 460, y, { width: 75, align: 'right' });

    y += 16;

    if (data.is_tax_invoice) {
      doc
        .fontSize(9).font('Helvetica').fillColor('#64748b')
        .text('GST (10%)', 300, y, { width: 155, align: 'right' })
        .text(`$${data.gst_amount.toFixed(2)}`, 460, y, { width: 75, align: 'right' });
      y += 16;
    } else if (data.gst_free) {
      doc
        .fontSize(9).font('Helvetica').fillColor('#64748b')
        .text('GST: N/A (GST-free supply)', 300, y, { width: 155, align: 'right' })
        .text('$0.00', 460, y, { width: 75, align: 'right' });
      y += 16;
    } else {
      doc
        .fontSize(9).font('Helvetica').fillColor('#64748b')
        .text('GST: Not applicable', 300, y, { width: 155, align: 'right' })
        .text('—', 460, y, { width: 75, align: 'right' });
      y += 16;
    }

    doc.rect(295, y - 2, CONTENT_WIDTH - 235, 26).fillColor('#0f172a').fill();
    doc
      .fontSize(11).font('Helvetica-Bold').fillColor('#ffffff')
      .text('TOTAL (AUD)', 300, y + 4, { width: 155, align: 'right' })
      .text(`$${data.total_aud.toFixed(2)}`, 460, y + 4, { width: 75, align: 'right' });

    y += 36;

    // ─── WITHHOLDING NOTICE (if applicable) ───────────────────────────────────
    if (data.withholding_applied && data.withholding_amount !== null) {
      doc.rect(60, y, CONTENT_WIDTH, 48).fillColor('#fef3c7').fill();
      doc.rect(60, y, CONTENT_WIDTH, 48).strokeColor('#fcd34d').lineWidth(1).stroke();
      doc
        .fontSize(8.5).font('Helvetica-Bold').fillColor('#92400e')
        .text('WITHHOLDING TAX NOTICE', 68, y + 8);
      const wRate = data.withholding_rate ? `${(data.withholding_rate * 100).toFixed(0)}%` : '47%';
      doc
        .fontSize(8).font('Helvetica').fillColor('#92400e')
        .text(
          `No ABN was quoted. Withholding tax of ${wRate} ($${data.withholding_amount.toFixed(2)} AUD) ` +
          `has been deducted from the gross payment per ATO requirements. ` +
          `Net payable to provider: $${(data.subtotal_ex_gst - data.withholding_amount).toFixed(2)} AUD.`,
          68, y + 22, { width: CONTENT_WIDTH - 16 },
        );
      y += 58;
    }

    // ─── CROSS-BORDER NOTICE ──────────────────────────────────────────────────
    if (data.is_cross_border) {
      doc.rect(60, y, CONTENT_WIDTH, 36).fillColor('#eff6ff').fill();
      doc.rect(60, y, CONTENT_WIDTH, 36).strokeColor('#bfdbfe').lineWidth(1).stroke();
      doc
        .fontSize(8).font('Helvetica').fillColor('#1e40af')
        .text(
          'Cross-border supply: This invoice relates to a supply that may be GST-free under s.38-190 of the ' +
          'GST Act. Verify GST treatment with your accountant.',
          68, y + 10, { width: CONTENT_WIDTH - 16 },
        );
      y += 46;
    }

    // ─── PAYMENT INSTRUCTIONS ─────────────────────────────────────────────────
    doc.rect(60, y, CONTENT_WIDTH, 46).fillColor('#f0fdf4').fill();
    doc.rect(60, y, CONTENT_WIDTH, 46).strokeColor('#bbf7d0').lineWidth(1).stroke();
    doc
      .fontSize(8.5).font('Helvetica-Bold').fillColor('#15803d')
      .text('Payment instructions', 68, y + 8);
    doc
      .fontSize(8).font('Helvetica').fillColor('#166534')
      .text(
        'Pay securely online via your onys.online account. ' +
        `Log in and navigate to Orders › ${data.order_id.slice(-8).toUpperCase()} › Payment.`,
        68, y + 22, { width: CONTENT_WIDTH - 16 },
      );

    y += 56;

    // ─── LEGAL FOOTER DISCLAIMER ──────────────────────────────────────────────
    const FOOTER_Y = 695;
    doc.moveTo(60, FOOTER_Y).lineTo(PAGE_WIDTH - 60, FOOTER_Y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

    doc
      .fontSize(6.5).font('Helvetica').fillColor('#94a3b8')
      .text(
        `This ${data.invoice_type_label} is issued by Onsys Pty Ltd as non-exclusive commercial and billing agent ` +
        `for ${data.provider_legal_name}${data.provider_abn ? ` (ABN: ${data.provider_abn})` : ''}. ` +
        `Onsys Pty Ltd does not supply the underlying services. Payment obligations are to Onsys Pty Ltd as ` +
        `collecting agent only. Onsys will remit net proceeds to the provider after deducting its agreed commission. ` +
        `GST registered in Australia. All amounts in AUD.`,
        60, FOOTER_Y + 8, { width: CONTENT_WIDTH, lineGap: 1.5 },
      );

    doc
      .fontSize(6.5).font('Helvetica').fillColor('#94a3b8')
      .text(
        `${data.invoice_number} | PO: ${data.po_number} | Due: ${data.due_date.toLocaleDateString('en-AU')} | onys.online`,
        60, FOOTER_Y + 46, { width: CONTENT_WIDTH, align: 'center' },
      );

    doc.end();
  });
}
