// ─── EngagementPaymentService ───────────────────────────────────────────────
// Subscription-only marketplace pivot — Phase 2.
//
// Replaces the legacy escrow flow for orders and tender-contract invoices
// created on/after the direct-payment cutover. Customers pay the supplier
// directly (Stripe payment-link, bank transfer, SWIFT, etc.) and upload
// evidence; suppliers confirm receipt; the platform records but does not
// process funds.

import crypto from 'node:crypto';
import type { PrismaClient, Order, TenderContractInvoice, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { PaymentMethodsFullView } from '@onys/shared';
import { AppError } from '../lib/errors.js';
import { writeAudit } from '../utils/audit.js';
import { uploadToBlob } from '../utils/blob-storage.js';
import { isDirectPaymentEntity } from '../utils/cutover.js';

// ─── Payment evidence history ──────────────────────────────────────────────
// Stored as a JSONB array on Order.payment_evidence_history (and the same
// shape on TenderContractInvoice). Append-only — entries are never removed,
// only updated when the supplier confirms or rejects.

export type PaymentEvidenceStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

export interface PaymentEvidenceEntry {
  id: string;
  blob_path: string | null;
  file_name: string | null;
  uploaded_at: string; // ISO
  payment_method: PaymentMethod;
  payment_reference: string | null;
  amount_aud: number;
  status: PaymentEvidenceStatus;
  dispute_reason: string | null;
  decided_at: string | null; // ISO
}

function readHistory(value: unknown): PaymentEvidenceEntry[] {
  if (!Array.isArray(value)) return [];
  return value as PaymentEvidenceEntry[];
}

function appendHistory(
  existing: unknown,
  entry: PaymentEvidenceEntry,
): PaymentEvidenceEntry[] {
  return [...readHistory(existing), entry];
}

function markLatestPending(
  existing: unknown,
  status: 'CONFIRMED' | 'REJECTED',
  disputeReason: string | null,
): PaymentEvidenceEntry[] {
  const list = readHistory(existing);
  // Find the most recent PENDING entry and flip it. We mutate from the tail
  // so a confirm/dispute resolves the latest report rather than the first.
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i]!;
    if (entry.status === 'PENDING') {
      list[i] = {
        ...entry,
        status,
        dispute_reason: disputeReason,
        decided_at: new Date().toISOString(),
      };
      return list;
    }
  }
  return list;
}

type EmailJobPayload = { type: string; [key: string]: unknown };

export type EngagementType = 'order' | 'tender_invoice';

interface ResolvedSupplier {
  user_id: string | null;
  company_id: string | null;
}

interface ReportPaymentInput {
  payment_method: PaymentMethod;
  payment_reference?: string | undefined;
  payment_amount_aud: number; // Decimal as plain number — caller validated
  evidence_file?: { buffer: Buffer; file_name: string; content_type: string } | undefined;
}

interface PaymentOptionsView {
  amount_due_aud: string;
  currency: 'AUD';
  supplier: { kind: 'user' | 'company'; id: string; name: string };
  // Full unmasked methods — the customer is authenticated, has placed the
  // order / received the invoice, and needs full bank/account details to
  // actually transfer funds. Authorization is enforced upstream via
  // loadOrderForCustomer / loadInvoiceForCustomer.
  payment_methods: PaymentMethodsFullView;
  current_status: string;
  customer_reported_paid_at: Date | null;
  supplier_confirmed_paid_at: Date | null;
  payment_dispute_reason: string | null;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class EngagementPaymentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ── ORDERS ────────────────────────────────────────────────────────────────

  async getOrderPaymentOptions(orderId: string, userId: string): Promise<PaymentOptionsView> {
    const order = await this.loadOrderForCustomer(orderId, userId);
    this.assertDirectPaymentEnabled(order.created_at);
    const supplier = this.resolveOrderSupplier(order);
    const methods = await this.loadSupplierPaymentMethods(supplier);
    return {
      amount_due_aud: order.total_amount_aud.toString(),
      currency: 'AUD',
      supplier: await this.describeSupplier(supplier),
      payment_methods: methods,
      current_status: order.status,
      customer_reported_paid_at: order.customer_reported_paid_at,
      supplier_confirmed_paid_at: order.supplier_confirmed_paid_at,
      payment_dispute_reason: order.payment_dispute_reason,
    };
  }

  async reportOrderPayment(
    orderId: string,
    userId: string,
    input: ReportPaymentInput,
  ): Promise<Order> {
    const order = await this.loadOrderForCustomer(orderId, userId);
    this.assertDirectPaymentEnabled(order.created_at);
    this.assertReportableStatus(order.status);

    const evidence = input.evidence_file
      ? await this.uploadEvidence('order', orderId, input.evidence_file)
      : null;

    // Append the new report to the history. We always add a row even when
    // there's no file, so the customer's "I paid via PayPal, no attachment"
    // is still surfaced as a discrete report instead of silently overwriting.
    const newEntry: PaymentEvidenceEntry = {
      id: `evd_${crypto.randomBytes(8).toString('hex')}`,
      blob_path: evidence?.blob_path ?? null,
      file_name: evidence?.file_name ?? null,
      uploaded_at: new Date().toISOString(),
      payment_method: input.payment_method,
      payment_reference: input.payment_reference ?? null,
      amount_aud: input.payment_amount_aud,
      status: 'PENDING',
      dispute_reason: null,
      decided_at: null,
    };
    const updatedHistory = appendHistory(order.payment_evidence_history, newEntry);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PAYMENT_REPORTED',
        // Mirror onto company_order_status so the supplier-side WorkflowBar
        // and customer-side COMPANY_STATUS_CONFIG stay in sync. The closest
        // existing label is BANK_TRANSFER_PENDING — "Payment Under Review".
        company_order_status: 'BANK_TRANSFER_PENDING',
        payment_method: input.payment_method,
        payment_reference: input.payment_reference ?? null,
        payment_amount_reported_aud: input.payment_amount_aud,
        customer_reported_paid_at: new Date(),
        supplier_confirmed_paid_at: null, // reset on resubmit
        payment_dispute_reason: null,
        payment_dispute_raised_at: null,
        payment_evidence_history: updatedHistory as unknown as Prisma.InputJsonValue,
        ...(evidence && {
          payment_evidence_blob_path: evidence.blob_path,
          payment_evidence_file_name: evidence.file_name,
        }),
      },
    });

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'ORDER_PAYMENT_REPORTED',
      entityType: 'Order',
      entityId: orderId,
      metadata: {
        method: input.payment_method,
        reference: input.payment_reference ?? null,
        amount_aud: input.payment_amount_aud,
      },
    });

    await this.emailQueue
      .add('order-payment-reported', {
        type: 'order-payment-reported',
        order_id: orderId,
      })
      .catch(() => {/* non-fatal */});

    return updated;
  }

  async confirmOrderPayment(orderId: string, supplierUserId: string): Promise<Order> {
    const order = await this.loadOrderForSupplier(orderId, supplierUserId);
    this.assertDirectPaymentEnabled(order.created_at);
    if (order.status !== 'PAYMENT_REPORTED') {
      throw new AppError(
        'INVALID_STATE',
        409,
        `Cannot confirm payment from status ${order.status}`,
      );
    }

    // Two flows converge here:
    //   1. Direct-payment first: customer paid before any work was done.
    //      Confirming payment unlocks "Start Work" → IN_PROGRESS → ... → COMPLETED.
    //   2. Legacy "work-first": deliverables were already submitted and the
    //      customer approved (status_history shows a DELIVERABLES_ACCEPTED
    //      transition). Payment is the *last* gate — once received, the
    //      order is done. Auto-advance straight to COMPLETED so the
    //      contractor doesn't see a misleading "Start Work" button.
    const history = (order.status_history as Array<{ to?: string }> | null) ?? [];
    const workAlreadyApproved = history.some(
      (h) => h?.to === 'DELIVERABLES_ACCEPTED' || h?.to === 'COMPLETED',
    );
    const now = new Date();

    const updatedHistory = markLatestPending(order.payment_evidence_history, 'CONFIRMED', null);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        // status: top-level lifecycle. PAYMENT_CONFIRMED is the post-payment
        // marker; if work is already done we also flip the master status
        // to COMPLETED so terminal-state checks (notifications etc.) fire.
        status: workAlreadyApproved ? 'COMPLETED' : 'PAYMENT_CONFIRMED',
        company_order_status: workAlreadyApproved ? 'COMPLETED' : 'PAYMENT_RECEIVED',
        supplier_confirmed_paid_at: now,
        ...(workAlreadyApproved && { completed_at: now }),
        payment_dispute_reason: null,
        payment_dispute_raised_at: null,
        payment_evidence_history: updatedHistory as unknown as Prisma.InputJsonValue,
      },
    });

    await writeAudit(this.prisma, {
      actorId: supplierUserId,
      actionType: workAlreadyApproved
        ? 'ORDER_COMPLETED_AFTER_PAYMENT'
        : 'ORDER_PAYMENT_CONFIRMED',
      entityType: 'Order',
      entityId: orderId,
      metadata: { auto_completed: workAlreadyApproved },
    });

    await this.emailQueue
      .add('order-payment-confirmed', {
        type: 'order-payment-confirmed',
        order_id: orderId,
      })
      .catch(() => {/* non-fatal */});

    return updated;
  }

  async disputeOrderEvidence(
    orderId: string,
    supplierUserId: string,
    reason: string,
  ): Promise<Order> {
    const order = await this.loadOrderForSupplier(orderId, supplierUserId);
    this.assertDirectPaymentEnabled(order.created_at);
    if (order.status !== 'PAYMENT_REPORTED') {
      throw new AppError(
        'INVALID_STATE',
        409,
        `Cannot dispute evidence from status ${order.status}`,
      );
    }

    const updatedHistory = markLatestPending(order.payment_evidence_history, 'REJECTED', reason);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'AWAITING_PAYMENT',
        // Roll company_order_status back to INVOICE_SENT so the customer's
        // status banner prompts them to make payment again.
        company_order_status: 'INVOICE_SENT',
        payment_dispute_reason: reason,
        payment_dispute_raised_at: new Date(),
        payment_evidence_history: updatedHistory as unknown as Prisma.InputJsonValue,
        // Keep evidence path so admin can review the rejected submission
      },
    });

    await writeAudit(this.prisma, {
      actorId: supplierUserId,
      actionType: 'ORDER_PAYMENT_EVIDENCE_DISPUTED',
      entityType: 'Order',
      entityId: orderId,
      metadata: { reason },
    });

    return updated;
  }

  // ── TENDER CONTRACT INVOICES ──────────────────────────────────────────────

  async getInvoicePaymentOptions(invoiceId: string, userId: string): Promise<PaymentOptionsView> {
    const invoice = await this.loadInvoiceForCustomer(invoiceId, userId);
    this.assertDirectPaymentEnabled(invoice.created_at);
    const supplier = this.resolveInvoiceSupplier(invoice);
    const methods = await this.loadSupplierPaymentMethods(supplier);
    return {
      amount_due_aud: invoice.total_aud.toString(),
      currency: 'AUD',
      supplier: await this.describeSupplier(supplier),
      payment_methods: methods,
      current_status: invoice.status,
      customer_reported_paid_at: invoice.customer_reported_paid_at,
      supplier_confirmed_paid_at: invoice.supplier_confirmed_paid_at,
      payment_dispute_reason: invoice.payment_dispute_reason,
    };
  }

  async reportInvoicePayment(
    invoiceId: string,
    userId: string,
    input: ReportPaymentInput,
  ): Promise<TenderContractInvoice> {
    const invoice = await this.loadInvoiceForCustomer(invoiceId, userId);
    this.assertDirectPaymentEnabled(invoice.created_at);
    if (invoice.status === 'PAID') {
      throw new AppError('INVALID_STATE', 409, 'Invoice already paid');
    }
    if (invoice.status === 'VOID') {
      throw new AppError('INVALID_STATE', 409, 'Invoice has been voided');
    }

    const evidence = input.evidence_file
      ? await this.uploadEvidence('tender_invoice', invoiceId, input.evidence_file)
      : null;

    const newEntry: PaymentEvidenceEntry = {
      id: `evd_${crypto.randomBytes(8).toString('hex')}`,
      blob_path: evidence?.blob_path ?? null,
      file_name: evidence?.file_name ?? null,
      uploaded_at: new Date().toISOString(),
      payment_method: input.payment_method,
      payment_reference: input.payment_reference ?? null,
      amount_aud: input.payment_amount_aud,
      status: 'PENDING',
      dispute_reason: null,
      decided_at: null,
    };
    const updatedHistory = appendHistory(invoice.payment_evidence_history, newEntry);

    const updated = await this.prisma.tenderContractInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAYMENT_REPORTED',
        payment_method: input.payment_method,
        payment_reference: input.payment_reference ?? null,
        payment_amount_reported_aud: input.payment_amount_aud,
        customer_reported_paid_at: new Date(),
        supplier_confirmed_paid_at: null,
        payment_dispute_reason: null,
        payment_dispute_raised_at: null,
        payment_evidence_history: updatedHistory as unknown as Prisma.InputJsonValue,
        ...(evidence && {
          payment_evidence_blob_path: evidence.blob_path,
          payment_evidence_file_name: evidence.file_name,
        }),
      },
    });

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'TC_INVOICE_PAYMENT_REPORTED',
      entityType: 'TenderContractInvoice',
      entityId: invoiceId,
      metadata: {
        method: input.payment_method,
        reference: input.payment_reference ?? null,
        amount_aud: input.payment_amount_aud,
      },
    });

    await this.emailQueue
      .add('tc-invoice-payment-reported', {
        type: 'tc-invoice-payment-reported',
        invoice_id: invoiceId,
      })
      .catch(() => {});

    return updated;
  }

  async confirmInvoicePayment(
    invoiceId: string,
    supplierUserId: string,
  ): Promise<TenderContractInvoice> {
    const invoice = await this.loadInvoiceForSupplier(invoiceId, supplierUserId);
    this.assertDirectPaymentEnabled(invoice.created_at);
    if (invoice.status !== 'PAYMENT_REPORTED') {
      throw new AppError('INVALID_STATE', 409, `Cannot confirm from status ${invoice.status}`);
    }

    const now = new Date();
    const updatedHistory = markLatestPending(invoice.payment_evidence_history, 'CONFIRMED', null);

    const updated = await this.prisma.tenderContractInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        supplier_confirmed_paid_at: now,
        paid_at: now,
        payment_dispute_reason: null,
        payment_dispute_raised_at: null,
        payment_evidence_history: updatedHistory as unknown as Prisma.InputJsonValue,
      },
    });

    await writeAudit(this.prisma, {
      actorId: supplierUserId,
      actionType: 'TC_INVOICE_PAYMENT_CONFIRMED',
      entityType: 'TenderContractInvoice',
      entityId: invoiceId,
      metadata: {},
    });

    // Regenerate the PDF with the PAID badge stamped, then queue customer
    // copy + supplier receipt emails. Idempotent — paid_emails_sent_at is
    // checked first so a retry doesn't double-send.
    void this.dispatchPaymentPaidNotifications(invoiceId).catch((err) => {
      console.error('[tc-invoice] paid notification dispatch failed:', err);
    });

    return updated;
  }

  // Regenerate PDF with PAID badge + queue customer copy + supplier receipt.
  // Called from confirmInvoicePayment after the status transition.
  private async dispatchPaymentPaidNotifications(invoiceId: string): Promise<void> {
    const invoice = await this.prisma.tenderContractInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        contract: {
          select: {
            customer: { select: { email: true, billing_email: true, full_name: true, legal_entity_name: true } },
            company: { select: { primary_admin: { select: { email: true } } } },
            contractor: { select: { email: true } },
          },
        },
        milestone: { select: { name: true } },
      },
    });
    if (!invoice) return;
    if (invoice.paid_emails_sent_at) return; // already dispatched

    // Best-effort PDF regen — re-runs the milestone invoice generator with
    // the now-set paid_at so the PAID badge appears on the new copy. The
    // raiseInvoice path reads supplier+customer fresh, so a re-trigger is
    // safe even if profile data has changed since invoice creation.
    try {
      const { TenderContractPaymentService } = await import('./tender-contract-payment.service.js');
      // Construct a temporary instance just for the regeneration. Passing
      // the real emailQueue is fine — regeneratePdfForPaid only writes to
      // blob storage and the invoice row.
      const svc = new TenderContractPaymentService(this.prisma, this.emailQueue);
      await svc.regeneratePaidInvoicePdf(invoiceId);
    } catch (err) {
      console.error('[tc-invoice] PAID PDF regeneration failed:', err);
    }

    const customerEmail = invoice.contract.customer.billing_email ?? invoice.contract.customer.email;
    const supplierEmail = invoice.contract.company
      ? invoice.contract.company.primary_admin.email
      : invoice.contract.contractor?.email ?? null;

    const total = Number(invoice.total_aud);
    const downloadUrl = `${process.env.FRONTEND_URL ?? ''}/api/v1/tender-contract-invoices/${invoiceId}/download?dl=1`;

    if (customerEmail) {
      await this.emailQueue.add('tc-invoice-paid-customer-receipt', {
        type: 'tc-invoice-paid-customer-receipt',
        to: customerEmail,
        invoice_number: invoice.invoice_number,
        milestone_name: invoice.milestone?.name ?? null,
        total_aud: total,
        currency: 'AUD',
        paid_at: (invoice.paid_at ?? new Date()).toISOString(),
        download_url: downloadUrl,
      }).catch(() => {});
    }
    if (supplierEmail) {
      await this.emailQueue.add('tc-invoice-paid-supplier-receipt', {
        type: 'tc-invoice-paid-supplier-receipt',
        to: supplierEmail,
        invoice_number: invoice.invoice_number,
        customer_name: invoice.contract.customer.legal_entity_name ?? invoice.contract.customer.full_name,
        milestone_name: invoice.milestone?.name ?? null,
        total_aud: total,
        currency: 'AUD',
        paid_at: (invoice.paid_at ?? new Date()).toISOString(),
        download_url: downloadUrl,
      }).catch(() => {});
    }

    // Stamp paid_emails_sent_at so a retry doesn't double-send. We only
    // record the timestamp after queuing to avoid the case where queue
    // failure leaves the customer without their copy.
    if (customerEmail || supplierEmail) {
      await this.prisma.tenderContractInvoice.update({
        where: { id: invoiceId },
        data: { paid_emails_sent_at: new Date() },
      });
    }
  }

  async disputeInvoiceEvidence(
    invoiceId: string,
    supplierUserId: string,
    reason: string,
  ): Promise<TenderContractInvoice> {
    const invoice = await this.loadInvoiceForSupplier(invoiceId, supplierUserId);
    this.assertDirectPaymentEnabled(invoice.created_at);
    if (invoice.status !== 'PAYMENT_REPORTED') {
      throw new AppError('INVALID_STATE', 409, `Cannot dispute from status ${invoice.status}`);
    }

    const updatedHistory = markLatestPending(invoice.payment_evidence_history, 'REJECTED', reason);

    const updated = await this.prisma.tenderContractInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'AWAITING_PAYMENT',
        payment_dispute_reason: reason,
        payment_dispute_raised_at: new Date(),
        payment_evidence_history: updatedHistory as unknown as Prisma.InputJsonValue,
      },
    });

    await writeAudit(this.prisma, {
      actorId: supplierUserId,
      actionType: 'TC_INVOICE_PAYMENT_EVIDENCE_DISPUTED',
      entityType: 'TenderContractInvoice',
      entityId: invoiceId,
      metadata: { reason },
    });

    return updated;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private assertDirectPaymentEnabled(createdAt: Date): void {
    if (!isDirectPaymentEntity(createdAt)) {
      throw new AppError(
        'LEGACY_ESCROW_FLOW',
        409,
        'This engagement predates the direct-payment cutover and uses the legacy escrow flow.',
      );
    }
  }

  private assertReportableStatus(status: OrderStatus): void {
    // Direct-payment is decoupled from the work lifecycle. A customer can
    // report payment any time *before* it is already confirmed and *before*
    // the order is dead. Disallow only states where reporting makes no sense:
    //   - PAYMENT_HELD: legacy escrow flow (customer paid via Stripe escrow)
    //   - PAYMENT_CONFIRMED / IN_PROGRESS / PENDING_REVIEW / REVISION_REQUESTED
    //     / COMPLETED: payment was already confirmed; no need to re-report.
    //   - DISPUTED / CANCELLED: order is dead; payment reports would orphan.
    // Everything else (PENDING_APPROVAL, SCOPED, ACCEPTED, AWAITING_PAYMENT,
    // PAYMENT_REPORTED for resubmits) is fair game.
    const blocked: OrderStatus[] = [
      'PAYMENT_HELD',
      'PAYMENT_CONFIRMED',
      'IN_PROGRESS',
      'PENDING_REVIEW',
      'REVISION_REQUESTED',
      'COMPLETED',
      'DISPUTED',
      'CANCELLED',
    ];
    if (blocked.includes(status)) {
      const friendlyMessage = (() => {
        if (status === 'PAYMENT_CONFIRMED' || status === 'IN_PROGRESS' ||
            status === 'PENDING_REVIEW' || status === 'REVISION_REQUESTED' ||
            status === 'COMPLETED') {
          return 'Payment for this order has already been confirmed.';
        }
        if (status === 'DISPUTED') {
          return 'This order is in dispute. Payment cannot be reported until the dispute is resolved.';
        }
        if (status === 'CANCELLED') {
          return 'This order has been cancelled. Payment cannot be reported.';
        }
        return `Cannot report payment from status ${status}.`;
      })();
      throw new AppError('INVALID_STATE', 409, friendlyMessage);
    }
  }

  private async loadOrderForCustomer(orderId: string, userId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError('NOT_FOUND', 404);
    if (order.customer_id !== userId) throw new AppError('FORBIDDEN', 403);
    return order;
  }

  private async loadOrderForSupplier(orderId: string, userId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError('NOT_FOUND', 404);
    const isContractor = order.contractor_user_id === userId;
    const isExecutingMember = order.executing_member_id === userId;
    let isCompanyAdmin = false;
    if (order.company_id) {
      const company = await this.prisma.consultingCompany.findUnique({
        where: { id: order.company_id },
        select: { primary_admin_id: true },
      });
      isCompanyAdmin = company?.primary_admin_id === userId;
    }
    if (!isContractor && !isExecutingMember && !isCompanyAdmin) {
      throw new AppError('FORBIDDEN', 403);
    }
    return order;
  }

  private async loadInvoiceForCustomer(
    invoiceId: string,
    userId: string,
  ): Promise<TenderContractInvoice> {
    const invoice = await this.prisma.tenderContractInvoice.findUnique({
      where: { id: invoiceId },
      include: { contract: { select: { customer_id: true } } },
    });
    if (!invoice) throw new AppError('NOT_FOUND', 404);
    if (invoice.contract.customer_id !== userId) throw new AppError('FORBIDDEN', 403);
    return invoice;
  }

  private async loadInvoiceForSupplier(
    invoiceId: string,
    userId: string,
  ): Promise<TenderContractInvoice> {
    const invoice = await this.prisma.tenderContractInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new AppError('NOT_FOUND', 404);
    const isContractor = invoice.contractor_user_id === userId;
    let isCompanyAdmin = false;
    if (invoice.company_id) {
      const company = await this.prisma.consultingCompany.findUnique({
        where: { id: invoice.company_id },
        select: { primary_admin_id: true },
      });
      isCompanyAdmin = company?.primary_admin_id === userId;
    }
    if (!isContractor && !isCompanyAdmin) throw new AppError('FORBIDDEN', 403);
    return invoice;
  }

  private resolveOrderSupplier(order: Order): ResolvedSupplier {
    return {
      user_id: order.contractor_user_id,
      company_id: order.company_id,
    };
  }

  private resolveInvoiceSupplier(invoice: TenderContractInvoice): ResolvedSupplier {
    return {
      user_id: invoice.contractor_user_id,
      company_id: invoice.company_id,
    };
  }

  private async describeSupplier(
    s: ResolvedSupplier,
  ): Promise<{ kind: 'user' | 'company'; id: string; name: string }> {
    if (s.company_id) {
      const c = await this.prisma.consultingCompany.findUnique({
        where: { id: s.company_id },
        select: { id: true, company_name: true, legal_company_name: true },
      });
      if (!c) throw new AppError('SUPPLIER_NOT_FOUND', 500);
      return { kind: 'company', id: c.id, name: c.legal_company_name ?? c.company_name };
    }
    if (s.user_id) {
      const u = await this.prisma.user.findUnique({
        where: { id: s.user_id },
        select: { id: true, full_name: true, legal_entity_name: true },
      });
      if (!u) throw new AppError('SUPPLIER_NOT_FOUND', 500);
      return { kind: 'user', id: u.id, name: u.legal_entity_name ?? u.full_name };
    }
    throw new AppError('SUPPLIER_NOT_FOUND', 500);
  }

  private async loadSupplierPaymentMethods(
    s: ResolvedSupplier,
  ): Promise<PaymentMethodsFullView> {
    // Returns the FULL unmasked payment methods. Authorization is enforced
    // by the calling site (only the order's customer / invoice recipient
    // can hit this) — the customer needs full bank/account/email details
    // to actually transfer funds. For *public* surfaces (task booking
    // panel etc.) use the masked variant via maskPaymentMethods().
    let raw: Record<string, unknown> = {};
    if (s.company_id) {
      const c = await this.prisma.consultingCompany.findUnique({
        where: { id: s.company_id },
        select: { payment_methods: true },
      });
      raw = (c?.payment_methods as Record<string, unknown>) ?? {};
    } else if (s.user_id) {
      const u = await this.prisma.user.findUnique({
        where: { id: s.user_id },
        select: { payment_methods: true },
      });
      raw = (u?.payment_methods as Record<string, unknown>) ?? {};
    }
    return normaliseFullView(raw);
  }

  private async uploadEvidence(
    kind: EngagementType,
    entityId: string,
    file: { buffer: Buffer; file_name: string; content_type: string },
  ): Promise<{ blob_path: string; file_name: string }> {
    const safe = file.file_name.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    const blob_path = `payment-evidence/${kind}/${entityId}/${Date.now()}-${safe}`;
    await uploadToBlob(blob_path, file.buffer, file.content_type);
    return { blob_path, file_name: safe };
  }
}

// ─── Full-view normaliser ──────────────────────────────────────────────────
// Maps the raw payment_methods JSON column into the PaymentMethodsFullView
// shape. Only forwards keys the customer actually needs to make payment;
// undefined keys are stripped so the response stays compact.

function normaliseFullView(raw: Record<string, unknown>): PaymentMethodsFullView {
  const get = <T>(key: string) => raw[key] as T | undefined;
  const stripe = get<{ enabled?: boolean; payment_link_url?: string }>('stripe');
  const bankAu = get<{
    enabled?: boolean;
    bsb?: string;
    account_number?: string;
    account_name?: string;
  }>('bank_au');
  const bankSwift = get<{
    enabled?: boolean;
    bank_name?: string;
    swift_code?: string;
    iban?: string;
    account_number?: string;
    account_name?: string;
    bank_address?: string;
  }>('bank_swift');
  const paypal = get<{ enabled?: boolean; email?: string; payment_link_url?: string }>('paypal');
  const wise = get<{
    enabled?: boolean;
    email?: string;
    currency?: string;
    payment_link_url?: string;
  }>('wise');
  const other = get<{ enabled?: boolean; description?: string; payment_link_url?: string }>('other');

  return {
    stripe: {
      enabled: !!stripe?.enabled,
      ...(stripe?.payment_link_url && { payment_link_url: stripe.payment_link_url }),
    },
    bank_au: {
      enabled: !!bankAu?.enabled,
      ...(bankAu?.bsb && { bsb: bankAu.bsb }),
      ...(bankAu?.account_number && { account_number: bankAu.account_number }),
      ...(bankAu?.account_name && { account_name: bankAu.account_name }),
    },
    bank_swift: {
      enabled: !!bankSwift?.enabled,
      ...(bankSwift?.bank_name && { bank_name: bankSwift.bank_name }),
      ...(bankSwift?.swift_code && { swift_code: bankSwift.swift_code }),
      ...(bankSwift?.iban && { iban: bankSwift.iban }),
      ...(bankSwift?.account_number && { account_number: bankSwift.account_number }),
      ...(bankSwift?.account_name && { account_name: bankSwift.account_name }),
      ...(bankSwift?.bank_address && { bank_address: bankSwift.bank_address }),
    },
    paypal: {
      enabled: !!paypal?.enabled,
      ...(paypal?.email && { email: paypal.email }),
      ...(paypal?.payment_link_url && { payment_link_url: paypal.payment_link_url }),
    },
    wise: {
      enabled: !!wise?.enabled,
      ...(wise?.email && { email: wise.email }),
      ...(wise?.currency && { currency: wise.currency }),
      ...(wise?.payment_link_url && { payment_link_url: wise.payment_link_url }),
    },
    other: {
      enabled: !!other?.enabled,
      ...(other?.description && { description: other.description }),
      ...(other?.payment_link_url && { payment_link_url: other.payment_link_url }),
    },
  };
}
