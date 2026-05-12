import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import PDFDocument from 'pdfkit';
import { AppError } from '../lib/errors.js';
import { writeAudit } from '../utils/audit.js';
import { stripe } from './stripe.service.js';
import { audToCents, calculatePayout } from '../utils/commission.js';
import { uploadToBlob } from '../utils/blob-storage.js';
import {
  buildInvoicePdf,
  decideGstTreatment,
  addressLines,
  buildPaymentInstructions,
} from '../utils/invoice-template.js';

type EmailJobPayload = { type: string; to?: string; [key: string]: unknown };

// ─── TenderContractPaymentService ────────────────────────────────────────────

export class TenderContractPaymentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ── 1. RAISE INVOICE (provider, per-milestone) ─────────────────────────────

  async raiseInvoice(
    contractId: string,
    milestoneId: string,
    userId: string,
    companyId?: string,
    metadata?: {
      customer_po_number?: string | null;
      service_period_start?: Date | null;
      service_period_end?: Date | null;
    },
  ) {
    // Load contract — include every field the shared invoice template needs
    // (addresses, ABNs, payment methods, country) so we don't re-query later.
    const c = await this.prisma.tenderContract.findUnique({
      where: { id: contractId },
      include: {
        customer: {
          select: {
            id: true, email: true, full_name: true,
            legal_entity_name: true, trading_name: true,
            billing_email: true, billing_phone: true,
            abn: true, acn: true,
            billing_address_1: true, billing_address_2: true,
            billing_city: true, billing_state: true, billing_postcode: true,
            billing_country: true,
          },
        },
        company: {
          select: {
            id: true, company_name: true, legal_company_name: true,
            abn: true, acn: true,
            abn_verified: true, gst_registered: true,
            billing_email: true, billing_phone: true,
            billing_address_1: true, billing_address_2: true,
            billing_city: true, billing_state: true, billing_postcode: true,
            billing_country: true,
            primary_admin_id: true,
            payout_preference: { select: { method: true } },
            primary_admin: {
              select: {
                email: true, payment_methods: true,
              },
            },
          },
        },
        contractor: {
          select: {
            id: true, full_name: true, email: true,
            legal_entity_name: true, trading_name: true,
            billing_phone: true,
            abn: true, acn: true, gst_registered: true,
            billing_address_1: true, billing_address_2: true,
            billing_city: true, billing_state: true, billing_postcode: true,
            billing_country: true,
            payment_methods: true,
          },
        },
      },
    });
    if (!c) throw new AppError('CONTRACT_NOT_FOUND', 404);

    // Access check: must be the provider
    const isProvider = companyId ? c.company_id === companyId : c.contractor_user_id === userId;
    if (!isProvider) throw new AppError('FORBIDDEN', 403);

    // Load milestone
    const ms = await this.prisma.tenderMilestone.findUnique({
      where: { id: milestoneId },
      include: { invoice: { select: { id: true } } },
    });
    if (!ms || ms.contract_id !== contractId) throw new AppError('MILESTONE_NOT_FOUND', 404);
    if (ms.status !== 'APPROVED') {
      throw new AppError('INVALID_STATE', 422, 'Milestone must be APPROVED before raising an invoice.');
    }
    if (ms.invoice) {
      throw new AppError('INVOICE_EXISTS', 409, 'An invoice has already been raised for this milestone.');
    }

    // Tax classification — single shared decision in invoice-template.ts.
    // Both this flow and the service-invoice flow call decideGstTreatment()
    // so the GST charge logic, rate, cross-border detection, and reason
    // text can never drift between the two.
    const isCompany = !!companyId;
    const providerGstRegistered = isCompany
      ? (c.company?.gst_registered ?? false)
      : (c.contractor?.gst_registered ?? false);
    const providerAbn = isCompany ? (c.company?.abn ?? null) : (c.contractor?.abn ?? null);
    const providerCountry = isCompany ? (c.company?.billing_country ?? null) : (c.contractor?.billing_country ?? null);
    const customerAbn = c.customer.abn ?? null;
    const customerCountry = c.customer.billing_country ?? null;
    const amountExGst = Number(ms.amount_aud);

    const gstDecision = decideGstTreatment({
      issuer_country: providerCountry,
      issuer_gst_registered: providerGstRegistered,
      recipient_country: customerCountry,
      amount_ex_gst_cents: Math.round(amountExGst * 100),
    });
    const chargeGst = gstDecision.charge_gst;
    const gstFree = !chargeGst;
    const isCrossBorder = gstDecision.is_cross_border;
    const gstAmount = gstDecision.gst_amount_cents / 100;
    const totalAmount = amountExGst + gstAmount;
    const gstTreatmentReason = gstDecision.treatment_reason;

    // Generate invoice number atomically
    const year = new Date().getFullYear();
    const seq = await this.prisma.documentSequence.upsert({
      where: { type: 'INV_TC' },
      create: { type: 'INV_TC', year, last_value: 1 },
      update: { last_value: { increment: 1 } },
    });
    const invoiceNumber = `INV-TC-${year}-${String(seq.last_value).padStart(6, '0')}`;

    const dueDate = new Date(Date.now() + 14 * 86_400_000);

    // Create invoice + update milestone status atomically
    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.tenderContractInvoice.create({
        data: {
          contract_id: contractId,
          milestone_id: milestoneId,
          company_id: companyId ?? null,
          contractor_user_id: companyId ? null : userId,
          created_by_id: userId,
          invoice_number: invoiceNumber,
          amount_aud: amountExGst,
          gst_amount_aud: gstAmount,
          total_aud: totalAmount,
          status: 'SENT',
          due_date: dueDate,
          is_tax_invoice: providerGstRegistered && !isCrossBorder,
          gst_free: gstFree,
          is_cross_border: isCrossBorder,
          provider_gst_registered: providerGstRegistered,
          provider_abn: providerAbn ?? null,
          customer_legal_name: c.customer.legal_entity_name ?? c.customer.full_name,
          customer_abn: customerAbn ?? null,
          gst_treatment_reason: gstTreatmentReason,
          customer_po_number: metadata?.customer_po_number ?? null,
          service_period_start: metadata?.service_period_start ?? null,
          service_period_end: metadata?.service_period_end ?? null,
        },
      });
      await tx.tenderMilestone.update({
        where: { id: milestoneId },
        data: { status: 'INVOICED', invoiced_at: new Date() },
      });
      return inv;
    });

    // Generate PDF using the shared invoice template (best-effort — failure
    // doesn't block invoice creation; the customer can request regeneration).
    try {
      const issuerName = isCompany
        ? (c.company?.legal_company_name ?? c.company?.company_name ?? 'Provider')
        : (c.contractor?.legal_entity_name ?? c.contractor?.full_name ?? 'Provider');
      const issuerTradingName = isCompany
        ? (c.company?.company_name && c.company.company_name !== c.company.legal_company_name
            ? c.company.company_name : null)
        : (c.contractor?.trading_name ?? null);
      const issuerEmail = isCompany
        ? (c.company?.billing_email ?? c.company?.primary_admin?.email ?? null)
        : (c.contractor?.email ?? null);
      const issuerPhone = isCompany ? (c.company?.billing_phone ?? null) : (c.contractor?.billing_phone ?? null);
      const issuerAcn = isCompany ? (c.company?.acn ?? null) : (c.contractor?.acn ?? null);
      const issuerEntity = isCompany
        ? c.company
        : c.contractor;
      const paymentMethods = isCompany
        ? (c.company?.primary_admin?.payment_methods as Record<string, unknown> | null)
        : (c.contractor?.payment_methods as Record<string, unknown> | null);

      // Engagement references — surface contract + tender + milestone IDs
      // so the customer's AP team has a paper trail to the engagement.
      const engagementRefs = [
        { label: 'Contract', value: contractId },
        { label: 'Milestone', value: ms.name },
      ];

      const pdfBuffer = await buildInvoicePdf({
        invoice_number: invoiceNumber,
        status: 'SENT',
        issued_date: new Date(),
        due_date: dueDate,
        paid_date: null,
        service_period_start: metadata?.service_period_start ?? null,
        service_period_end: metadata?.service_period_end ?? null,
        customer_po_number: metadata?.customer_po_number ?? null,

        issuer_name: issuerName,
        issuer_trading_name: issuerTradingName,
        issuer_email: issuerEmail,
        issuer_phone: issuerPhone,
        issuer_abn: providerAbn,
        issuer_acn: issuerAcn,
        issuer_gst_registered: providerGstRegistered,
        issuer_address_lines: issuerEntity ? addressLines(issuerEntity) : [],

        recipient_name: c.customer.legal_entity_name ?? c.customer.full_name,
        recipient_email: c.customer.billing_email ?? c.customer.email,
        recipient_abn: customerAbn,
        recipient_address_lines: addressLines(c.customer),

        engagement_refs: engagementRefs,

        line_items: [{
          description: `Milestone: ${ms.name}`,
          ...(ms.description ? { detail: ms.description } : {}),
          quantity: 1,
          unit_amount_cents: Math.round(amountExGst * 100),
        }],
        currency: 'AUD',
        subtotal_cents: Math.round(amountExGst * 100),
        tax_cents: Math.round(gstAmount * 100),
        total_cents: Math.round(totalAmount * 100),
        gst_treatment_reason: gstTreatmentReason,

        payment_instructions: buildPaymentInstructions(paymentMethods),
        payment_reference: invoiceNumber,
        payment_terms: 'Net 14',

        notes: null,
        footer_text: null,
      });
      const blobPath = `tc-invoices/${contractId}/${invoiceNumber}.pdf`;
      await uploadToBlob(blobPath, pdfBuffer, 'application/pdf');
      await this.prisma.tenderContractInvoice.update({
        where: { id: invoice.id },
        data: { pdf_blob_path: blobPath },
      });
    } catch (err) {
      console.error('[tc-invoice] PDF generation failed:', err);
    }

    void writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'TC_INVOICE_RAISED',
      entityType: 'TenderContractInvoice',
      entityId: invoice.id,
      metadata: { contract_id: contractId, milestone_id: milestoneId, invoice_number: invoiceNumber, amount: totalAmount },
    });

    // Notify customer
    const customerEmail = c.customer.billing_email ?? c.customer.email;
    void this.emailQueue.add('tc-invoice-sent', {
      type: 'tc-invoice-sent',
      to: customerEmail,
      contract_id: contractId,
      invoice_number: invoiceNumber,
      total_aud: totalAmount,
      due_date: dueDate.toISOString(),
    }).catch(() => {});

    return this.getInvoice(invoice.id, c.customer_id);
  }

  // ── 2. GET INVOICE ──────────────────────────────────────────────────────────

  async getInvoice(invoiceId: string, requestingUserId: string, companyId?: string) {
    const inv = await this.prisma.tenderContractInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        contract: { select: { customer_id: true, company_id: true, contractor_user_id: true } },
        milestone: { select: { id: true, name: true, amount_aud: true } },
        bank_transfer: true,
        payout_record: { select: { id: true, status: true, net_amount_aud: true, commission_invoice_number: true } },
      },
    });
    if (!inv) throw new AppError('INVOICE_NOT_FOUND', 404);

    const c = inv.contract;
    const isCustomer = c.customer_id === requestingUserId;
    const isProvider = companyId ? c.company_id === companyId : c.contractor_user_id === requestingUserId;
    if (!isCustomer && !isProvider) throw new AppError('FORBIDDEN', 403);

    return inv;
  }

  // ── 3. LIST INVOICES for a contract ────────────────────────────────────────

  async listContractInvoices(contractId: string, requestingUserId: string, companyId?: string) {
    const c = await this.prisma.tenderContract.findUnique({
      where: { id: contractId },
      select: { customer_id: true, company_id: true, contractor_user_id: true },
    });
    if (!c) throw new AppError('CONTRACT_NOT_FOUND', 404);
    const isCustomer = c.customer_id === requestingUserId;
    const isProvider = companyId ? c.company_id === companyId : c.contractor_user_id === requestingUserId;
    if (!isCustomer && !isProvider) throw new AppError('FORBIDDEN', 403);

    return this.prisma.tenderContractInvoice.findMany({
      where: { contract_id: contractId },
      include: {
        milestone: { select: { id: true, name: true } },
        bank_transfer: { select: { id: true, status: true } },
        payout_record: { select: { id: true, status: true, net_amount_aud: true } },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  // ── 4. CREATE STRIPE PAYMENT INTENT (customer) ─────────────────────────────

  async createStripePaymentIntent(invoiceId: string, customerId: string) {
    const inv = await this.prisma.tenderContractInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        contract: { select: { customer_id: true } },
        bank_transfer: { select: { id: true } },
      },
    });
    if (!inv) throw new AppError('INVOICE_NOT_FOUND', 404);
    if (inv.contract.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);
    if (inv.status === 'PAID') throw new AppError('INVOICE_ALREADY_PAID', 409);
    if (inv.status === 'VOID') throw new AppError('INVOICE_VOIDED', 409);
    if (inv.bank_transfer) throw new AppError('BANK_TRANSFER_PENDING', 409, 'A bank transfer is already in progress for this invoice.');

    // Reuse or create PI
    if (inv.stripe_payment_intent_id) {
      const existing = await stripe.paymentIntents.retrieve(inv.stripe_payment_intent_id);
      if (existing.status === 'requires_payment_method' || existing.status === 'requires_confirmation') {
        return { client_secret: existing.client_secret, payment_intent_id: existing.id };
      }
    }

    const pi = await stripe.paymentIntents.create({
      amount: audToCents(Number(inv.total_aud)),
      currency: 'aud',
      description: `Invoice ${inv.invoice_number} — Tender Contract`,
      metadata: {
        tc_invoice_id: invoiceId,
        contract_id: inv.contract_id,
        milestone_id: inv.milestone_id ?? '',
      },
    });

    await this.prisma.tenderContractInvoice.update({
      where: { id: invoiceId },
      data: { stripe_payment_intent_id: pi.id },
    });

    return { client_secret: pi.client_secret, payment_intent_id: pi.id };
  }

  // ── 5. HANDLE STRIPE PAYMENT SUCCESS (webhook) ─────────────────────────────

  async handleStripePaymentSuccess(paymentIntentId: string) {
    const inv = await this.prisma.tenderContractInvoice.findFirst({
      where: { stripe_payment_intent_id: paymentIntentId },
      include: {
        contract: {
          include: {
            company: {
              select: { id: true, completed_orders_count: true, payout_preference: { select: { method: true } } },
            },
          },
        },
        milestone: { select: { id: true } },
      },
    });
    if (!inv) return; // not a TC invoice — ignore
    if (inv.status === 'PAID') return; // idempotent

    await this._markPaidAndCreatePayout(inv.id, 'STRIPE');
  }

  // ── 6. SUBMIT BANK TRANSFER (customer) ─────────────────────────────────────

  async submitBankTransfer(
    invoiceId: string,
    customerId: string,
    data: { method: string; payment_reference?: string },
  ) {
    const inv = await this.prisma.tenderContractInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        contract: { select: { customer_id: true } },
        bank_transfer: { select: { id: true } },
      },
    });
    if (!inv) throw new AppError('INVOICE_NOT_FOUND', 404);
    if (inv.contract.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);
    if (inv.status === 'PAID') throw new AppError('INVOICE_ALREADY_PAID', 409);
    if (inv.bank_transfer) throw new AppError('BANK_TRANSFER_EXISTS', 409, 'A bank transfer already exists for this invoice.');

    const VALID_METHODS = ['PAYID_EMAIL', 'AU_BSB', 'SWIFT'];
    if (!VALID_METHODS.includes(data.method)) {
      throw new AppError('INVALID_METHOD', 422, 'method must be PAYID_EMAIL, AU_BSB, or SWIFT.');
    }

    const bt = await this.prisma.tenderContractBankTransfer.create({
      data: {
        invoice_id: invoiceId,
        contract_id: inv.contract_id,
        method: data.method,
        amount_aud: inv.total_aud,
        payment_reference: data.payment_reference ?? null,
        status: 'PENDING',
      },
    });

    return bt;
  }

  // ── 7. UPLOAD BANK TRANSFER RECEIPT (customer) ─────────────────────────────

  async uploadBankTransferReceipt(
    invoiceId: string,
    customerId: string,
    blobPath: string,
  ) {
    const inv = await this.prisma.tenderContractInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        contract: { select: { customer_id: true } },
        bank_transfer: { select: { id: true, status: true } },
      },
    });
    if (!inv) throw new AppError('INVOICE_NOT_FOUND', 404);
    if (inv.contract.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);
    if (!inv.bank_transfer) throw new AppError('NO_BANK_TRANSFER', 404, 'Submit a bank transfer first.');
    if (inv.bank_transfer.status !== 'PENDING') {
      throw new AppError('BANK_TRANSFER_NOT_PENDING', 422, 'Bank transfer has already been processed.');
    }

    await this.prisma.tenderContractBankTransfer.update({
      where: { id: inv.bank_transfer.id },
      data: { receipt_blob_path: blobPath },
    });
  }

  // ── 8. ADMIN: list pending bank transfers ──────────────────────────────────

  async adminListBankTransfers(params: { status?: string; limit?: number; cursor?: string }) {
    const limit = Math.min(params.limit ?? 20, 50);
    const where = params.status ? { status: params.status } : {};
    const [records, total] = await Promise.all([
      this.prisma.tenderContractBankTransfer.findMany({
        where,
        take: limit,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        orderBy: { submitted_at: 'desc' },
        include: {
          invoice: {
            select: {
              id: true, invoice_number: true, total_aud: true, amount_aud: true,
              contract: {
                select: {
                  id: true,
                  scope_snapshot: true,
                  customer: { select: { id: true, full_name: true, email: true } },
                  company: { select: { id: true, company_name: true } },
                  contractor: { select: { id: true, full_name: true } },
                },
              },
            },
          },
          confirmed_by: { select: { id: true, full_name: true } },
        },
      }),
      this.prisma.tenderContractBankTransfer.count({ where }),
    ]);
    return { records, total };
  }

  // ── 9. ADMIN: confirm bank transfer ────────────────────────────────────────

  async adminConfirmBankTransfer(transferId: string, adminId: string) {
    const bt = await this.prisma.tenderContractBankTransfer.findUnique({
      where: { id: transferId },
      include: { invoice: { select: { id: true, status: true } } },
    });
    if (!bt) throw new AppError('BANK_TRANSFER_NOT_FOUND', 404);
    if (bt.status !== 'PENDING') throw new AppError('ALREADY_PROCESSED', 422, `Bank transfer is already ${bt.status}.`);

    await this.prisma.tenderContractBankTransfer.update({
      where: { id: transferId },
      data: { status: 'CONFIRMED', confirmed_at: new Date(), confirmed_by_id: adminId },
    });

    await this._markPaidAndCreatePayout(bt.invoice_id, 'BANK_TRANSFER');

    void writeAudit(this.prisma, {
      actorId: adminId,
      actionType: 'TC_BANK_TRANSFER_CONFIRMED',
      entityType: 'TenderContractBankTransfer',
      entityId: transferId,
      metadata: { invoice_id: bt.invoice_id },
    });
  }

  // ── 10. ADMIN: reject bank transfer ────────────────────────────────────────

  async adminRejectBankTransfer(transferId: string, adminId: string, reason: string) {
    const bt = await this.prisma.tenderContractBankTransfer.findUnique({ where: { id: transferId } });
    if (!bt) throw new AppError('BANK_TRANSFER_NOT_FOUND', 404);
    if (bt.status !== 'PENDING') throw new AppError('ALREADY_PROCESSED', 422);

    await this.prisma.tenderContractBankTransfer.update({
      where: { id: transferId },
      data: { status: 'REJECTED', rejected_at: new Date(), rejection_reason: reason },
    });

    void writeAudit(this.prisma, {
      actorId: adminId,
      actionType: 'TC_BANK_TRANSFER_REJECTED',
      entityType: 'TenderContractBankTransfer',
      entityId: transferId,
      metadata: { invoice_id: bt.invoice_id, reason },
    });
  }

  // ── 11a. PROVIDER: assert payout ownership ────────────────────────────────

  async assertProviderOwnsPayout(payoutId: string, userId: string, companyId?: string) {
    const record = await this.prisma.tenderContractPayoutRecord.findUnique({
      where: { id: payoutId },
      select: { company_id: true, contractor_user_id: true },
    });
    if (!record) throw new AppError('PAYOUT_NOT_FOUND', 404);
    const isOwner = companyId
      ? record.company_id === companyId
      : record.contractor_user_id === userId;
    if (!isOwner) throw new AppError('FORBIDDEN', 403);
  }

  // ── 11. PROVIDER: list own TC payouts ─────────────────────────────────────

  async listProviderPayouts(userId: string, companyId?: string) {
    const where = companyId
      ? { company_id: companyId }
      : { contractor_user_id: userId };

    return this.prisma.tenderContractPayoutRecord.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        invoice: {
          select: {
            id: true, invoice_number: true, total_aud: true, amount_aud: true,
            contract: {
              select: {
                id: true,
                scope_snapshot: true,
                customer: { select: { id: true, full_name: true } },
              },
            },
            milestone: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  // ── 12. ADMIN: list payout queue ───────────────────────────────────────────

  async adminListPayouts(params: { status?: string; limit?: number; cursor?: string }) {
    const limit = Math.min(params.limit ?? 20, 50);
    const where = params.status ? { status: params.status } : {};
    const [records, total, statusGroups] = await Promise.all([
      this.prisma.tenderContractPayoutRecord.findMany({
        where,
        take: limit,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        orderBy: { created_at: 'desc' },
        include: {
          invoice: {
            select: {
              id: true, invoice_number: true, total_aud: true,
              contract: {
                select: {
                  id: true,
                  scope_snapshot: true,
                  company: {
                    select: {
                      id: true, company_name: true, abn: true,
                      payout_preference: true,
                      primary_admin: { select: { email: true } },
                      stripe_connect_account: true,
                    },
                  },
                  contractor: {
                    select: {
                      id: true, full_name: true, email: true,
                      contractor_profile: {
                        select: {
                          payout_methods: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          processed_by: { select: { id: true, full_name: true } },
        },
      }),
      this.prisma.tenderContractPayoutRecord.count({ where }),
      this.prisma.tenderContractPayoutRecord.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const status_counts: Record<string, number> = {};
    for (const row of statusGroups) status_counts[row.status] = row._count._all;
    return { records, total, status_counts };
  }

  // ── 12. ADMIN: process Stripe payout ──────────────────────────────────────

  async adminProcessStripePayout(payoutRecordId: string, adminId: string) {
    const record = await this.prisma.tenderContractPayoutRecord.findUnique({
      where: { id: payoutRecordId },
      include: {
        invoice: {
          select: {
            id: true, invoice_number: true,
            contract: {
              select: {
                company: {
                  select: {
                    id: true, company_name: true,
                    primary_admin: { select: { email: true } },
                    stripe_connect_account: true,
                  },
                },
                contractor: { select: { id: true, full_name: true, email: true } },
              },
            },
          },
        },
      },
    });
    if (!record) throw new AppError('PAYOUT_NOT_FOUND', 404);
    if (record.method !== 'STRIPE_CONNECT') throw new AppError('INVALID_PAYOUT_METHOD', 422, 'Use recordOfflinePayout for bank transfers.');
    if (record.status !== 'PENDING') throw new AppError('PAYOUT_NOT_PENDING', 422, `Payout is already ${record.status}.`);

    const isCompany = !!record.company_id;
    let connectAcct: { stripe_account_id: string; status: string } | null | undefined;
    if (isCompany) {
      connectAcct = record.invoice.contract.company?.stripe_connect_account;
    } else if (record.contractor_user_id) {
      const profile = await this.prisma.contractorProfile.findUnique({
        where: { user_id: record.contractor_user_id },
        select: { stripe_connect_account: true },
      });
      connectAcct = profile?.stripe_connect_account;
    }

    if (!connectAcct || connectAcct.status !== 'ENABLED') {
      throw new AppError('STRIPE_ACCOUNT_NOT_ENABLED', 422, 'Provider does not have an enabled Stripe Connect account.');
    }

    const transfer = await stripe.transfers.create({
      amount: audToCents(Number(record.net_amount_aud)),
      currency: 'aud',
      destination: connectAcct.stripe_account_id,
      description: `TC Payout. Invoice ${record.invoice.invoice_number}. Contract ${record.contract_id}.`,
      metadata: { tc_payout_record_id: payoutRecordId, contract_id: record.contract_id },
    });

    await this.prisma.tenderContractPayoutRecord.update({
      where: { id: payoutRecordId },
      data: { status: 'COMPLETED', transfer_reference: transfer.id, processed_by_id: adminId, completed_at: new Date() },
    });

    // Increment completed contracts count
    if (isCompany && record.company_id) {
      await this.prisma.consultingCompany.update({
        where: { id: record.company_id },
        data: { completed_orders_count: { increment: 1 } },
      });
    }

    void writeAudit(this.prisma, {
      actorId: adminId,
      actionType: 'TC_PAYOUT_STRIPE',
      entityType: 'TenderContractPayoutRecord',
      entityId: payoutRecordId,
      metadata: { transfer_id: transfer.id, net_amount_aud: Number(record.net_amount_aud) },
    });

    const notifyEmail = isCompany
      ? record.invoice.contract.company?.primary_admin?.email
      : record.invoice.contract.contractor?.email;
    if (notifyEmail) {
      void this.emailQueue.add('tc-payout-completed', {
        type: 'tc-payout-completed',
        to: notifyEmail,
        net_amount_aud: Number(record.net_amount_aud),
        method: 'STRIPE_CONNECT',
        transfer_id: transfer.id,
      }).catch(() => {});
    }

    try { await this.generateCommissionInvoice(payoutRecordId); } catch (e) { console.error('[tc-payout] commission invoice failed:', e); }
  }

  // ── 13. ADMIN: record offline payout ──────────────────────────────────────

  async adminRecordOfflinePayout(
    payoutRecordId: string,
    adminId: string,
    data: { reference: string; notes: string; transfer_date: Date },
  ) {
    const record = await this.prisma.tenderContractPayoutRecord.findUnique({
      where: { id: payoutRecordId },
      include: {
        invoice: {
          select: {
            invoice_number: true,
            contract: {
              select: {
                company: { select: { primary_admin: { select: { email: true } } } },
                contractor: { select: { email: true } },
              },
            },
          },
        },
      },
    });
    if (!record) throw new AppError('PAYOUT_NOT_FOUND', 404);
    if (record.method === 'STRIPE_CONNECT') throw new AppError('INVALID_PAYOUT_METHOD', 422, 'Use processStripePayout for Stripe Connect.');
    if (!['PENDING', 'PROCESSING'].includes(record.status)) throw new AppError('PAYOUT_NOT_ACTIONABLE', 422);
    if (!data.reference?.trim() || data.reference.trim().length < 3) throw new AppError('INVALID_REFERENCE', 422, 'Transfer reference must be at least 3 characters.');
    if (!data.notes?.trim() || data.notes.trim().length < 20) throw new AppError('NOTES_REQUIRED', 422, 'Notes must be at least 20 characters.');

    await this.prisma.tenderContractPayoutRecord.update({
      where: { id: payoutRecordId },
      data: {
        status: 'COMPLETED',
        transfer_reference: data.reference.trim(),
        admin_notes: data.notes.trim(),
        processed_by_id: adminId,
        completed_at: data.transfer_date,
      },
    });

    if (record.company_id) {
      await this.prisma.consultingCompany.update({
        where: { id: record.company_id },
        data: { completed_orders_count: { increment: 1 } },
      });
    }

    void writeAudit(this.prisma, {
      actorId: adminId,
      actionType: 'TC_PAYOUT_OFFLINE',
      entityType: 'TenderContractPayoutRecord',
      entityId: payoutRecordId,
      metadata: { method: record.method, reference: data.reference.trim(), net_amount_aud: Number(record.net_amount_aud) },
    });

    const notifyEmail = record.company_id
      ? record.invoice.contract.company?.primary_admin?.email
      : record.invoice.contract.contractor?.email;
    if (notifyEmail) {
      void this.emailQueue.add('tc-payout-completed', {
        type: 'tc-payout-completed',
        to: notifyEmail,
        net_amount_aud: Number(record.net_amount_aud),
        method: record.method,
        reference: data.reference.trim(),
      }).catch(() => {});
    }

    try { await this.generateCommissionInvoice(payoutRecordId); } catch (e) { console.error('[tc-payout] commission invoice failed:', e); }
  }

  // ── 14. GENERATE COMMISSION INVOICE ───────────────────────────────────────

  async generateCommissionInvoice(payoutRecordId: string) {
    const record = await this.prisma.tenderContractPayoutRecord.findUnique({
      where: { id: payoutRecordId },
      include: {
        invoice: {
          select: {
            invoice_number: true,
            contract: {
              select: {
                company: { select: { id: true, company_name: true, abn: true } },
                contractor: { select: { id: true, full_name: true, abn: true } },
              },
            },
          },
        },
      },
    });
    if (!record) throw new AppError('PAYOUT_NOT_FOUND', 404);

    // Commission invoice can only be generated once payout is completed — the
    // issue date on the PDF must match the actual transfer date.
    if (record.status !== 'COMPLETED') {
      throw new AppError('PAYOUT_NOT_COMPLETED', 422, 'Commission invoice is not available until the payout has been completed.');
    }

    if (record.commission_invoice_blob_path) {
      return { blob_path: record.commission_invoice_blob_path, invoice_number: record.commission_invoice_number! };
    }

    const year = new Date().getFullYear();
    const seq = await this.prisma.documentSequence.upsert({
      where: { type: 'COMM_TC' },
      create: { type: 'COMM_TC', year, last_value: 1 },
      update: { last_value: { increment: 1 } },
    });
    const commInvNumber = `COMM-TC-${year}-${String(seq.last_value).padStart(6, '0')}`;

    const isCompany = !!record.company_id;
    const providerName = isCompany
      ? (record.invoice.contract.company?.company_name ?? 'Provider')
      : (record.invoice.contract.contractor?.full_name ?? 'Provider');
    const providerAbn = isCompany
      ? (record.invoice.contract.company?.abn ?? null)
      : (record.invoice.contract.contractor?.abn ?? null);

    const gross = Number(record.gross_amount_aud);
    const commission = Number(record.platform_fee_aud);
    const net = Number(record.net_amount_aud);
    const commissionRate = gross > 0 ? ((commission / gross) * 100).toFixed(0) : '0';
    const gstOnCommission = Math.round(commission * 10) / 100;

    const pdfBuffer = await generateCommissionPdf({
      invoiceNumber: commInvNumber,
      issueDate: record.completed_at ?? new Date(),
      originalInvoiceNumber: record.invoice.invoice_number,
      contractId: record.contract_id,
      providerName,
      providerAbn,
      gross,
      commissionRate: Number(commissionRate),
      commission,
      gstOnCommission,
      totalCommissionCharge: commission + gstOnCommission,
      net,
    });

    const blobPath = `tc-commission-invoices/${payoutRecordId}/${commInvNumber}.pdf`;
    await uploadToBlob(blobPath, pdfBuffer, 'application/pdf');

    await this.prisma.tenderContractPayoutRecord.update({
      where: { id: payoutRecordId },
      data: { commission_invoice_blob_path: blobPath, commission_invoice_number: commInvNumber },
    });

    return { blob_path: blobPath, invoice_number: commInvNumber };
  }

  // ── Private: mark paid + create payout record ──────────────────────────────

  private async _markPaidAndCreatePayout(invoiceId: string, _trigger: 'STRIPE' | 'BANK_TRANSFER') {
    const inv = await this.prisma.tenderContractInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        contract: {
          include: {
            company: {
              select: { id: true, completed_orders_count: true, payout_preference: { select: { method: true } } },
            },
          },
        },
        payout_record: { select: { id: true } },
      },
    });
    if (!inv || inv.status === 'PAID') return;
    if (inv.payout_record) return; // idempotent

    const isCompany = !!inv.company_id;
    const gross = Number(inv.amount_aud);
    const completedCount = isCompany
      ? (inv.contract.company?.completed_orders_count ?? 0)
      : 0;
    const { commission_amount_aud, net_amount_aud } = calculatePayout(gross, completedCount);
    const payoutMethod = isCompany
      ? (inv.contract.company?.payout_preference?.method ?? 'AU_BANK')
      : 'AU_BANK';

    await this.prisma.$transaction([
      this.prisma.tenderContractInvoice.update({
        where: { id: invoiceId },
        data: { status: 'PAID', paid_at: new Date() },
      }),
      this.prisma.tenderMilestone.updateMany({
        where: { id: inv.milestone_id ?? '', status: 'INVOICED' },
        data: { status: 'PAID', paid_at: new Date() },
      }),
      this.prisma.tenderContractPayoutRecord.create({
        data: {
          invoice_id: invoiceId,
          contract_id: inv.contract_id,
          milestone_id: inv.milestone_id ?? null,
          company_id: inv.company_id ?? null,
          contractor_user_id: inv.contractor_user_id ?? null,
          method: payoutMethod,
          status: 'PENDING',
          gross_amount_aud: gross,
          platform_fee_aud: commission_amount_aud,
          net_amount_aud,
        },
      }),
    ]);

    // Notify provider
    if (inv.company_id) {
      const company = await this.prisma.consultingCompany.findUnique({
        where: { id: inv.company_id },
        select: { primary_admin: { select: { email: true } } },
      });
      if (company?.primary_admin?.email) {
        void this.emailQueue.add('tc-payment-received', {
          type: 'tc-payment-received',
          to: company.primary_admin.email,
          invoice_number: inv.invoice_number,
          net_amount_aud,
        }).catch(() => {});
      }
    } else if (inv.contractor_user_id) {
      const contractor = await this.prisma.user.findUnique({
        where: { id: inv.contractor_user_id },
        select: { email: true },
      });
      if (contractor?.email) {
        void this.emailQueue.add('tc-payment-received', {
          type: 'tc-payment-received',
          to: contractor.email,
          invoice_number: inv.invoice_number,
          net_amount_aud,
        }).catch(() => {});
      }
    }
  }

  // ── REGENERATE PAID INVOICE PDF ─────────────────────────────────────────
  // Re-renders the PDF for an invoice that's just transitioned to PAID,
  // stamping the PAID badge. Called by EngagementPaymentService after
  // confirmInvoicePayment(). Reuses the same blob path so the customer's
  // saved download URL still points at the up-to-date copy.

  async regeneratePaidInvoicePdf(invoiceId: string): Promise<void> {
    const invoice = await this.prisma.tenderContractInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        contract: {
          include: {
            customer: {
              select: {
                full_name: true, legal_entity_name: true, trading_name: true,
                email: true, billing_email: true, billing_phone: true,
                abn: true, acn: true,
                billing_address_1: true, billing_address_2: true,
                billing_city: true, billing_state: true, billing_postcode: true,
                billing_country: true,
              },
            },
            company: {
              select: {
                company_name: true, legal_company_name: true,
                abn: true, acn: true, gst_registered: true,
                billing_email: true, billing_phone: true,
                billing_address_1: true, billing_address_2: true,
                billing_city: true, billing_state: true, billing_postcode: true,
                billing_country: true,
                primary_admin: { select: { email: true, payment_methods: true } },
              },
            },
            contractor: {
              select: {
                full_name: true, legal_entity_name: true, trading_name: true,
                email: true, billing_phone: true,
                abn: true, acn: true, gst_registered: true,
                billing_address_1: true, billing_address_2: true,
                billing_city: true, billing_state: true, billing_postcode: true,
                billing_country: true,
                payment_methods: true,
              },
            },
          },
        },
        milestone: { select: { name: true, description: true, amount_aud: true } },
      },
    });
    if (!invoice || !invoice.milestone) return;

    const isCompany = !!invoice.company_id;
    const c = invoice.contract;
    const ms = invoice.milestone;

    const issuerName = isCompany
      ? (c.company?.legal_company_name ?? c.company?.company_name ?? 'Provider')
      : (c.contractor?.legal_entity_name ?? c.contractor?.full_name ?? 'Provider');
    const issuerTradingName = isCompany
      ? (c.company?.company_name && c.company.company_name !== c.company.legal_company_name
          ? c.company.company_name : null)
      : (c.contractor?.trading_name ?? null);
    const issuerEmail = isCompany
      ? (c.company?.billing_email ?? c.company?.primary_admin?.email ?? null)
      : (c.contractor?.email ?? null);
    const issuerPhone = isCompany ? (c.company?.billing_phone ?? null) : (c.contractor?.billing_phone ?? null);
    const issuerAcn = isCompany ? (c.company?.acn ?? null) : (c.contractor?.acn ?? null);
    const issuerEntity = isCompany ? c.company : c.contractor;
    const paymentMethods = isCompany
      ? (c.company?.primary_admin?.payment_methods as Record<string, unknown> | null)
      : (c.contractor?.payment_methods as Record<string, unknown> | null);

    const amountExGst = Number(invoice.amount_aud);
    const gstAmount = Number(invoice.gst_amount_aud);
    const totalAmount = Number(invoice.total_aud);

    const pdfBuffer = await buildInvoicePdf({
      invoice_number: invoice.invoice_number,
      status: 'PAID',
      issued_date: invoice.sent_at,
      due_date: invoice.due_date,
      paid_date: invoice.paid_at,
      service_period_start: invoice.service_period_start,
      service_period_end: invoice.service_period_end,
      customer_po_number: invoice.customer_po_number,

      issuer_name: issuerName,
      issuer_trading_name: issuerTradingName,
      issuer_email: issuerEmail,
      issuer_phone: issuerPhone,
      issuer_abn: invoice.provider_abn,
      issuer_acn: issuerAcn,
      issuer_gst_registered: invoice.provider_gst_registered,
      issuer_address_lines: issuerEntity ? addressLines(issuerEntity) : [],

      recipient_name: invoice.customer_legal_name ?? c.customer.legal_entity_name ?? c.customer.full_name,
      recipient_email: c.customer.billing_email ?? c.customer.email,
      recipient_abn: invoice.customer_abn,
      recipient_address_lines: addressLines(c.customer),

      engagement_refs: [
        { label: 'Contract', value: c.id },
        { label: 'Milestone', value: ms.name },
      ],

      line_items: [{
        description: `Milestone: ${ms.name}`,
        ...(ms.description ? { detail: ms.description } : {}),
        quantity: 1,
        unit_amount_cents: Math.round(amountExGst * 100),
      }],
      currency: 'AUD',
      subtotal_cents: Math.round(amountExGst * 100),
      tax_cents: Math.round(gstAmount * 100),
      total_cents: Math.round(totalAmount * 100),
      gst_treatment_reason: invoice.gst_treatment_reason ?? 'GST 10% applied',

      payment_instructions: buildPaymentInstructions(paymentMethods),
      payment_reference: invoice.invoice_number,
      payment_terms: 'Net 14',

      notes: null,
      footer_text: null,
    });

    const blobPath = invoice.pdf_blob_path ?? `tc-invoices/${invoice.contract_id}/${invoice.invoice_number}.pdf`;
    await uploadToBlob(blobPath, pdfBuffer, 'application/pdf');
    if (!invoice.pdf_blob_path) {
      await this.prisma.tenderContractInvoice.update({
        where: { id: invoiceId },
        data: { pdf_blob_path: blobPath },
      });
    }
  }
}

// Tender-contract invoice PDF generation moved to the shared template at
// apps/api/src/utils/invoice-template.ts (2026-05-07). The old per-service
// generator was inlined here; it lacked address blocks, payment instructions,
// PAID/OVERDUE badges, and the conditional TAX INVOICE / INVOICE title
// required for ATO compliance. raiseInvoice() now calls buildInvoicePdf()
// directly. regeneratePaidInvoicePdf is on the class itself — see above.

// ─── Commission PDF ───────────────────────────────────────────────────────────

interface CommissionPdfData {
  invoiceNumber: string;
  issueDate: Date;
  originalInvoiceNumber: string;
  contractId: string;
  providerName: string;
  providerAbn: string | null;
  gross: number;
  commissionRate: number;
  commission: number;
  gstOnCommission: number;
  totalCommissionCharge: number;
  net: number;
}

async function generateCommissionPdf(data: CommissionPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fmt = (n: number) => `AUD ${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDate = (d: Date) => d.toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });

    doc.fontSize(22).font('Helvetica-Bold').fillColor('#0f172a').text('Onsys Pty Ltd', 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#64748b')
      .text('Platform Commission Invoice (Tender Contract)', 50, 78)
      .text('ABN: 00 000 000 000  ·  admin@onys.online', 50, 91);

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text(data.invoiceNumber, 320, 50, { align: 'right', width: 225 });
    doc.fontSize(10).font('Helvetica').fillColor('#64748b')
      .text(`Issue date: ${fmtDate(data.issueDate)}`, 320, 66, { align: 'right', width: 225 })
      .text(`Ref: ${data.originalInvoiceNumber}`, 320, 80, { align: 'right', width: 225 });

    doc.moveTo(50, 110).lineTo(545, 110).strokeColor('#e2e8f0').stroke();

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b').text('PROVIDER', 50, 125);
    doc.fontSize(10).font('Helvetica').fillColor('#0f172a').text(data.providerName, 50, 139);
    if (data.providerAbn) doc.text(`ABN: ${data.providerAbn}`, 50, 153);

    const t = 190;
    doc.moveTo(50, t).lineTo(545, t).strokeColor('#e2e8f0').stroke();
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b').text('DESCRIPTION', 50, t + 8).text('AMOUNT', 440, t + 8, { align: 'right', width: 105 });
    doc.moveTo(50, t + 24).lineTo(545, t + 24).strokeColor('#e2e8f0').stroke();

    doc.fontSize(10).font('Helvetica').fillColor('#0f172a')
      .text(`Platform commission (${data.commissionRate}%) on gross ${fmt(data.gross)}`, 50, t + 34)
      .text(fmt(data.commission), 440, t + 34, { align: 'right', width: 105 });

    const tt = t + 70;
    doc.moveTo(350, tt).lineTo(545, tt).strokeColor('#e2e8f0').stroke();
    doc.fontSize(10).font('Helvetica').fillColor('#64748b')
      .text('Commission (excl. GST)', 350, tt + 10).text(fmt(data.commission), 440, tt + 10, { align: 'right', width: 105 })
      .text('GST on commission (10%)', 350, tt + 26).text(fmt(data.gstOnCommission), 440, tt + 26, { align: 'right', width: 105 });
    doc.moveTo(350, tt + 44).lineTo(545, tt + 44).strokeColor('#0f172a').stroke();
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a')
      .text('Total commission charge', 350, tt + 52).text(fmt(data.totalCommissionCharge), 440, tt + 52, { align: 'right', width: 105 });
    doc.fontSize(10).font('Helvetica').fillColor('#64748b')
      .text('Net payout to provider', 350, tt + 70).text(fmt(data.net), 440, tt + 70, { align: 'right', width: 105 });

    doc.end();
  });
}
