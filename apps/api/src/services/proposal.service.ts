import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import PDFDocument from 'pdfkit';
import { AppError } from '../lib/errors.js';
import { writeAudit } from '../utils/audit.js';
import { convertToAUD } from '../utils/currency.js';
import { uploadToBlob } from '../utils/blob-storage.js';
import { getProviderType, getProviderIds } from '../utils/order-provider.js';
import { decideGstTreatment } from '@onys/shared';

// ─── Job payload type (matches emailQueue pattern from other services) ─────────

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

// ─── Input / return shapes ─────────────────────────────────────────────────────

export interface CreateProposalInput {
  /** Full scope-of-work description (plain text or markdown). */
  scope_of_work: string;
  /** Estimated calendar days from start to delivery. */
  timeline_days?: number;
  /** Payment terms narrative, e.g. "Net 14 days" or "50% upfront, 50% on completion". */
  payment_terms?: string;
  /** Cover note or additional context visible to the customer at the top of the PDF. */
  notes?: string;
  /** Supplier-authored legal T&Cs. When omitted, the PO PDF falls back to
   *  the platform-config po_terms array. Multi-paragraph plain text. */
  legal_terms?: string;
  /** ISO-4217 currency code for the quoted price, e.g. "AUD", "USD". */
  currency: string;
  /** Quoted price in the given currency (before GST). */
  price: number;
}

// ─── Internal PDF data shapes ──────────────────────────────────────────────────

interface ProposalPdfData {
  orderId: string;
  proposal: {
    id: string;
    version: number;
    scope_of_work: string;
    timeline_days: number | null;
    proposed_price_aud: number;
    proposed_tax_aud: number;
    proposed_total_aud: number;
    payment_terms: string | null;
    notes: string | null;
    sent_at?: Date | null;
  };
  company: {
    company_name: string;
    abn: string | null;
    business_address: string | null;
    website_url: string | null;
  };
  customer: {
    full_name: string;
    email: string;
  };
}

// ─── ProposalService ───────────────────────────────────────────────────────────

export class ProposalService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── HELPER: generateDocumentNumber ────────────────────────────────────────
  // Atomically increments the sequence counter for 'PO' or 'INV' document types.
  // Returns a formatted string e.g. "PO-2026-000001".

  private async generateDocumentNumber(
    tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
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

  // ─── METHOD 1: createProposal ───────────────────────────────────────────────
  // Provider (company admin/senior OR individual contractor) creates a draft
  // proposal for a booked order.

  async createProposal(
    orderId: string,
    providerUserId: string,
    data: CreateProposalInput,
  ) {
    // 1. Load order + verify proposable state. Pulls supplier and customer
    // GST flags + billing countries so decideGstTreatment (below) can flag
    // cross-border supply correctly. Without this widening, the hardcoded
    // 10% used to fire for non-GST-registered suppliers — see
    // docs/tax-invoicing-payment-analysis.html §8.1 for the bug history.
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        company_id: true,
        contractor_profile_id: true,
        contractor_user_id: true,
        company_order_status: true,
        customer: { select: { billing_country: true } },
        company: { select: { gst_registered: true, billing_country: true } },
        contractor_user: { select: { gst_registered: true, billing_country: true } },
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404, 'Order not found.');

    const proposableStatuses = ['BOOKED', 'PROPOSAL_CHANGES_REQUESTED'] as const;
    if (!order.company_order_status || !proposableStatuses.includes(order.company_order_status as typeof proposableStatuses[number])) {
      throw new AppError(
        'INVALID_ORDER_STATUS',
        422,
        `Proposals can only be created when order status is BOOKED or PROPOSAL_CHANGES_REQUESTED. Current: ${order.company_order_status ?? 'not set'}.`,
      );
    }

    // 2. Verify provider has permission
    const providerType = getProviderType(order);
    if (providerType === 'company') {
      const membership = await this.prisma.companyMember.findFirst({
        where: { company_id: order.company_id!, user_id: providerUserId, status: 'ACTIVE' },
        select: { role: true },
      });
      if (!membership || !['COMPANY_ADMIN', 'SENIOR_CONSULTANT'].includes(membership.role)) {
        throw new AppError(
          'INSUFFICIENT_COMPANY_ROLE',
          403,
          'Only Company Admins and Senior Consultants can create proposals.',
        );
      }
    } else {
      // Individual contractor — must be the assigned contractor
      if (order.contractor_user_id !== providerUserId) {
        throw new AppError('FORBIDDEN', 403, 'Only the assigned expert can create proposals for this order.');
      }
    }

    // 3. Compute next version number
    const lastProposal = await this.prisma.companyOrderProposal.findFirst({
      where: { order_id: orderId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const newVersion = (lastProposal?.version ?? 0) + 1;

    // 4. Convert price to AUD and compute GST via the shared decision.
    // Single source of truth — the same function the invoice flows call.
    // GST is charged only when the supplier is AU GST-registered AND the
    // supply is domestic. Cross-border (supplier or customer overseas)
    // produces 0 GST with the right reason text on the eventual invoice.
    const priceAud = convertToAUD(data.price, data.currency);
    const supplierGstRegistered = order.company
      ? order.company.gst_registered
      : (order.contractor_user?.gst_registered ?? false);
    const supplierCountry = order.company
      ? (order.company.billing_country ?? null)
      : (order.contractor_user?.billing_country ?? null);
    const customerCountry = order.customer?.billing_country ?? null;
    const gstDecision = decideGstTreatment({
      issuer_country: supplierCountry,
      issuer_gst_registered: supplierGstRegistered,
      recipient_country: customerCountry,
      amount_ex_gst_cents: Math.round(priceAud * 100),
    });
    const gstAmount = gstDecision.gst_amount_cents / 100;
    const totalAmount = Math.round((priceAud + gstAmount) * 100) / 100;

    // 5. Create draft proposal
    const providerIds = getProviderIds(order);
    const proposal = await this.prisma.companyOrderProposal.create({
      data: {
        order_id: orderId,
        company_id: providerIds.company_id,
        contractor_profile_id: providerIds.contractor_profile_id,
        created_by_id: providerUserId,
        version: newVersion,
        status: 'DRAFT',
        scope_of_work: data.scope_of_work.trim(),
        timeline_days: data.timeline_days ?? null,
        proposed_price_aud: priceAud,
        proposed_tax_aud: gstAmount,
        proposed_total_aud: totalAmount,
        payment_terms: data.payment_terms?.trim() ?? null,
        notes: data.notes?.trim() ?? null,
        legal_terms: data.legal_terms?.trim() ?? null,
      },
    });

    // 6. Audit
    await writeAudit(this.prisma, {
      actorId: providerUserId,
      actionType: 'PROPOSAL_CREATED',
      entityType: 'CompanyOrderProposal',
      entityId: proposal.id,
      metadata: {
        order_id: orderId,
        version: newVersion,
        proposed_total_aud: totalAmount,
      },
    });

    return proposal;
  }

  // ─── METHOD 2: sendProposal ─────────────────────────────────────────────────
  // Generates PDF, transitions proposal to SENT, moves order to PROPOSAL_SENT,
  // supersedes any older SENT proposals, and notifies the customer.

  async sendProposal(proposalId: string, providerUserId: string) {
    // 1. Load proposal + related data
    const proposal = await this.prisma.companyOrderProposal.findUnique({
      where: { id: proposalId },
      select: {
        id: true,
        order_id: true,
        company_id: true,
        contractor_profile_id: true,
        version: true,
        status: true,
        scope_of_work: true,
        timeline_days: true,
        proposed_price_aud: true,
        proposed_tax_aud: true,
        proposed_total_aud: true,
        payment_terms: true,
        notes: true,
        order: {
          select: {
            contractor_user_id: true,
            customer_id: true,
            customer: { select: { full_name: true, email: true } },
          },
        },
        company: {
          select: {
            company_name: true,
            abn: true,
            business_address: true,
            website_url: true,
            primary_admin_id: true,
          },
        },
        contractor_profile: {
          select: {
            user_id: true,
            user: { select: { full_name: true, email: true, abn: true } },
          },
        },
      },
    });
    if (!proposal) throw new AppError('PROPOSAL_NOT_FOUND', 404, 'Proposal not found.');
    if (proposal.status !== 'DRAFT') {
      throw new AppError('PROPOSAL_NOT_DRAFT', 422, 'Only DRAFT proposals can be sent.');
    }

    // 2. Verify provider has permission
    const providerType = getProviderType(proposal);
    if (providerType === 'company') {
      const membership = await this.prisma.companyMember.findFirst({
        where: { company_id: proposal.company_id!, user_id: providerUserId, status: 'ACTIVE' },
        select: { role: true },
      });
      if (!membership || !['COMPANY_ADMIN', 'SENIOR_CONSULTANT'].includes(membership.role)) {
        throw new AppError('INSUFFICIENT_COMPANY_ROLE', 403, 'Only Company Admins and Senior Consultants can send proposals.');
      }
    } else {
      if (proposal.order.contractor_user_id !== providerUserId) {
        throw new AppError('FORBIDDEN', 403, 'Only the assigned expert can send proposals for this order.');
      }
    }

    // 3. Build PDF provider data — company or contractor
    const pdfProvider: ProposalPdfData['company'] = providerType === 'company'
      ? proposal.company!
      : {
          company_name: proposal.contractor_profile?.user.full_name ?? 'Expert',
          abn: proposal.contractor_profile?.user.abn ?? null,
          business_address: null,
          website_url: null,
        };

    // 4. Generate PDF (outside transaction — I/O should not hold a TX open)
    const now = new Date();
    const pdfBuffer = await generateProposalPdf({
      orderId: proposal.order_id,
      proposal: {
        id: proposal.id,
        version: proposal.version,
        scope_of_work: proposal.scope_of_work,
        timeline_days: proposal.timeline_days,
        proposed_price_aud: Number(proposal.proposed_price_aud),
        proposed_tax_aud: Number(proposal.proposed_tax_aud),
        proposed_total_aud: Number(proposal.proposed_total_aud),
        payment_terms: proposal.payment_terms,
        notes: proposal.notes,
        sent_at: now,
      },
      company: pdfProvider,
      customer: proposal.order.customer,
    });

    const pdfBlobPath = `proposals/${proposal.order_id}/proposal-v${proposal.version}.pdf`;
    await uploadToBlob(pdfBlobPath, pdfBuffer, 'application/pdf');

    // 5. Transactional DB updates
    const updated = await this.prisma.$transaction(async (tx) => {
      // Supersede any older SENT proposals on this order
      await tx.companyOrderProposal.updateMany({
        where: {
          order_id: proposal.order_id,
          status: 'SENT',
          id: { not: proposalId },
        },
        data: { status: 'SUPERSEDED' },
      });

      // Mark this proposal as SENT
      const updatedProposal = await tx.companyOrderProposal.update({
        where: { id: proposalId },
        data: { status: 'SENT', sent_at: now, pdf_blob_path: pdfBlobPath },
      });

      // Advance the order's workflow status
      await tx.order.update({
        where: { id: proposal.order_id },
        data: { company_order_status: 'PROPOSAL_SENT' },
      });

      return updatedProposal;
    });

    // 6. Audit
    await writeAudit(this.prisma, {
      actorId: providerUserId,
      actionType: 'PROPOSAL_SENT',
      entityType: 'CompanyOrderProposal',
      entityId: proposalId,
      metadata: {
        order_id: proposal.order_id,
        version: proposal.version,
        pdf_blob_path: pdfBlobPath,
      },
    });

    // 7. Notify customer
    const providerName = providerType === 'company'
      ? proposal.company!.company_name
      : (proposal.contractor_profile?.user.full_name ?? 'Your Expert');
    await this.emailQueue.add('proposal-received', {
      type: 'proposal-received',
      to: proposal.order.customer.email,
      order_id: proposal.order_id,
      company_name: providerName,
      proposal_version: proposal.version,
      total_amount_aud: Number(proposal.proposed_total_aud),
      cover_note: proposal.notes,
      action_url: `/orders/${proposal.order_id}/proposal`,
    });

    return updated;
  }

  // ─── METHOD 3: customerRespondToProposal ────────────────────────────────────
  // Customer either approves the proposal (triggering PO generation) or
  // requests changes with a note.

  async customerRespondToProposal(
    proposalId: string,
    customerId: string,
    data: {
      decision: 'APPROVE' | 'REQUEST_CHANGES';
      change_notes?: string;
      approval_ip?: string;
      approval_user_agent?: string;
    },
  ): Promise<{ proposal: Awaited<ReturnType<PrismaClient['companyOrderProposal']['findUniqueOrThrow']>>; purchase_order?: Awaited<ReturnType<PrismaClient['purchaseOrder']['findUniqueOrThrow']>> }> {
    // 1. Load proposal with order and provider data
    const proposal = await this.prisma.companyOrderProposal.findUnique({
      where: { id: proposalId },
      select: {
        id: true,
        order_id: true,
        company_id: true,
        contractor_profile_id: true,
        version: true,
        status: true,
        scope_of_work: true,
        proposed_price_aud: true,
        proposed_tax_aud: true,
        proposed_total_aud: true,
        payment_terms: true,
        notes: true,
        order: {
          select: {
            customer_id: true,
            contractor_user_id: true,
            customer: { select: { full_name: true, email: true } },
          },
        },
        company: {
          select: {
            company_name: true,
            abn: true,
            business_address: true,
            website_url: true,
            primary_admin_id: true,
            primary_admin: { select: { email: true } },
          },
        },
        contractor_profile: {
          select: {
            user: { select: { full_name: true, email: true } },
          },
        },
      },
    });
    if (!proposal) throw new AppError('PROPOSAL_NOT_FOUND', 404, 'Proposal not found.');
    if (proposal.status !== 'SENT') {
      throw new AppError('PROPOSAL_NOT_SENT', 422, 'Only SENT proposals can be approved or changed.');
    }
    if (proposal.order.customer_id !== customerId) {
      throw new AppError('FORBIDDEN', 403, 'You are not the customer on this order.');
    }

    // ─── APPROVE ──────────────────────────────────────────────────────────────
    if (data.decision === 'APPROVE') {
      const now = new Date();
      const priceAud = Number(proposal.proposed_price_aud);
      const taxAud = Number(proposal.proposed_tax_aud);
      const totalAud = Number(proposal.proposed_total_aud);

      // Generate PO number + create PurchaseOrder in a transaction
      const { updatedProposal, po } = await this.prisma.$transaction(async (tx) => {
        const poNumber = await this.generateDocumentNumber(tx, 'PO');

        const createdPo = await tx.purchaseOrder.create({
          data: {
            order_id: proposal.order_id,
            po_number: poNumber,
            amount_aud: priceAud,
            tax_aud: taxAud,
            total_aud: totalAud,
            issued_at: now,
            approved_at: now,
            ...(data.approval_ip !== undefined ? { approved_ip: data.approval_ip } : {}),
          },
        });

        const approvedProposal = await tx.companyOrderProposal.update({
          where: { id: proposalId },
          data: { status: 'APPROVED', approved_at: now },
        });

        await tx.order.update({
          where: { id: proposal.order_id },
          data: {
            company_order_status: 'PO_GENERATED',
            price_aud: priceAud,
            total_amount_aud: totalAud,
          },
        });

        return { updatedProposal: approvedProposal, po: createdPo };
      });

      // Generate PO PDF outside transaction (new HTML-based generator)
      const { generatePurchaseOrderPdf } = await import('./po-pdf.service.js');
      const poPdfBuffer = await generatePurchaseOrderPdf(po.id, this.prisma);

      // po_number already includes the "PO-" prefix (e.g. PO-2026-000008),
      // so the blob path uses it directly. Adding a second "PO-" produced
      // download filenames like "PO-PO-2026-000008.pdf".
      const poPdfPath = `purchase-orders/${proposal.order_id}/${po.po_number}.pdf`;
      await uploadToBlob(poPdfPath, poPdfBuffer, 'application/pdf');

      await this.prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { pdf_blob_path: poPdfPath },
      });

      // Audit
      await writeAudit(this.prisma, {
        actorId: customerId,
        actionType: 'PO_GENERATED',
        entityType: 'PurchaseOrder',
        entityId: po.id,
        ...(data.approval_ip !== undefined ? { ipAddress: data.approval_ip } : {}),
        ...(data.approval_user_agent !== undefined ? { userAgent: data.approval_user_agent } : {}),
        metadata: {
          po_number: po.po_number,
          approved_by: customerId,
          total_amount_aud: totalAud,
          order_id: proposal.order_id,
        },
      });

      // Notify provider (company admin OR contractor)
      const providerApproveEmail = getProviderType(proposal) === 'company'
        ? proposal.company?.primary_admin?.email
        : proposal.order.contractor_user_id
          ? (await this.prisma.user.findUnique({ where: { id: proposal.order.contractor_user_id }, select: { email: true } }))?.email
          : undefined;

      if (providerApproveEmail) {
        await this.emailQueue.add('proposal-approved', {
          type: 'proposal-approved',
          to: providerApproveEmail,
          order_id: proposal.order_id,
          po_number: po.po_number,
          customer_name: proposal.order.customer.full_name,
          total_amount_aud: totalAud,
        });
      }

      return { proposal: updatedProposal, purchase_order: po };
    }

    // ─── REQUEST_CHANGES ──────────────────────────────────────────────────────
    if (!data.change_notes || data.change_notes.trim().length < 20) {
      throw new AppError(
        'CHANGE_NOTES_REQUIRED',
        422,
        'Please describe what changes you need (minimum 20 characters).',
      );
    }

    const now = new Date();
    const updatedProposal = await this.prisma.companyOrderProposal.update({
      where: { id: proposalId },
      data: {
        status: 'CHANGES_REQUESTED',
        change_request_note: data.change_notes.trim(),
      },
    });

    await this.prisma.order.update({
      where: { id: proposal.order_id },
      data: { company_order_status: 'PROPOSAL_CHANGES_REQUESTED' },
    });

    await writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'PROPOSAL_CHANGES_REQUESTED',
      entityType: 'CompanyOrderProposal',
      entityId: proposalId,
      metadata: {
        order_id: proposal.order_id,
        version: proposal.version,
        change_notes: data.change_notes.trim(),
        customer_id: customerId,
        requested_at: now.toISOString(),
      },
    });

    // Notify provider (company admin OR contractor)
    const providerChangesEmail = getProviderType(proposal) === 'company'
      ? proposal.company?.primary_admin?.email
      : proposal.contractor_profile?.user.email;

    if (providerChangesEmail) {
      await this.emailQueue.add('proposal-changes-requested', {
        type: 'proposal-changes-requested',
        to: providerChangesEmail,
        order_id: proposal.order_id,
        version: proposal.version,
        change_notes: data.change_notes.trim(),
        customer_name: proposal.order.customer.full_name,
      });
    }

    return { proposal: updatedProposal };
  }

  // ─── METHOD 4: getProposalHistory ───────────────────────────────────────────
  // Returns all proposals for an order ordered by version desc.
  // Accessible by the order's customer, any company member, or platform admin.

  async getProposalHistory(orderId: string, requestingUserId: string) {
    // Load order to check access
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        customer_id: true,
        company_id: true,
        contractor_user_id: true,
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404, 'Order not found.');

    const isCustomer = order.customer_id === requestingUserId;
    const isContractor = order.contractor_user_id === requestingUserId;

    let isCompanyMember = false;
    if (!isCustomer && !isContractor && order.company_id) {
      const membership = await this.prisma.companyMember.findFirst({
        where: { company_id: order.company_id, user_id: requestingUserId, status: 'ACTIVE' },
        select: { id: true },
      });
      isCompanyMember = !!membership;
    }

    const isAdmin = await this.prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { account_type: true },
    }).then((u) => u?.account_type === 'PLATFORM_ADMIN' || u?.account_type === 'COMPLIANCE_ADMIN');

    if (!isCustomer && !isContractor && !isCompanyMember && !isAdmin) {
      throw new AppError('FORBIDDEN', 403, 'You do not have access to this order\'s proposals.');
    }

    return this.prisma.companyOrderProposal.findMany({
      where: { order_id: orderId },
      orderBy: { version: 'desc' },
      include: {
        created_by: { select: { id: true, full_name: true } },
      },
    });
  }
}

// ─── HELPER: generateProposalPdf ──────────────────────────────────────────────
// Generates a PDF buffer for a company proposal document.

async function generateProposalPdf(data: ProposalPdfData): Promise<Buffer> {
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
    const CONTENT_WIDTH = PAGE_WIDTH - 120;
    const COL2_X = 340;
    const RIGHT_WIDTH = PAGE_WIDTH - COL2_X - 60;

    // ─── HEADER ──────────────────────────────────────────────────────────────
    doc
      .fontSize(22).font('Helvetica-Bold').fillColor('#0f172a')
      .text(data.company.company_name, 60, 50);

    if (data.company.abn) {
      doc.fontSize(8).font('Helvetica').fillColor('#666666').text(`ABN: ${data.company.abn}`, 60, 78);
    }
    if (data.company.business_address) {
      doc.fontSize(8).font('Helvetica').fillColor('#666666').text(data.company.business_address, 60, 90);
    }
    if (data.company.website_url) {
      doc.fontSize(8).font('Helvetica').fillColor('#666666').text(data.company.website_url, 60, 102);
    }

    // Title + version badge (right side)
    doc
      .fontSize(26).font('Helvetica-Bold').fillColor('#0f172a')
      .text('PROPOSAL', COL2_X, 50, { align: 'right', width: RIGHT_WIDTH });

    doc
      .fontSize(10).font('Helvetica').fillColor('#64748b')
      .text(`Version ${data.proposal.version}`, COL2_X, 84, { align: 'right', width: RIGHT_WIDTH });

    const sentDateStr = data.proposal.sent_at
      ? data.proposal.sent_at.toLocaleDateString('en-AU')
      : new Date().toLocaleDateString('en-AU');
    doc
      .fontSize(9).font('Helvetica').fillColor('#444444')
      .text(`Date: ${sentDateStr}`, COL2_X, 98, { align: 'right', width: RIGHT_WIDTH });

    doc.moveTo(60, 125).lineTo(PAGE_WIDTH - 60, 125).strokeColor('#e2e8f0').lineWidth(1).stroke();

    // ─── BILL TO / FROM ───────────────────────────────────────────────────────
    let y = 145;

    doc
      .fontSize(8).font('Helvetica-Bold').fillColor('#94a3b8')
      .text('PREPARED FOR', 60, y)
      .text('PROPOSAL ID', COL2_X, y);

    y += 16;

    doc
      .fontSize(10).font('Helvetica-Bold').fillColor('#0f172a')
      .text(data.customer.full_name, 60, y)
      .text(data.proposal.id.slice(-8).toUpperCase(), COL2_X, y);

    doc
      .fontSize(9).font('Helvetica').fillColor('#444444')
      .text(data.customer.email, 60, y + 14)
      .text(`Order: ${data.orderId.slice(-8).toUpperCase()}`, COL2_X, y + 14);

    y += 55;

    doc.moveTo(60, y).lineTo(PAGE_WIDTH - 60, y).strokeColor('#e2e8f0').stroke();
    y += 20;

    // ─── COVER NOTE ───────────────────────────────────────────────────────────
    if (data.proposal.notes) {
      doc.rect(60, y, CONTENT_WIDTH, 14).fillColor('#f8fafc').fill();
      doc
        .fontSize(9).font('Helvetica-Oblique').fillColor('#475569')
        .text(data.proposal.notes, 68, y + 4, { width: CONTENT_WIDTH - 16 });
      y += Math.max(30, 14 + doc.currentLineHeight(true) * Math.ceil(data.proposal.notes.length / 80));
      y += 12;
    }

    // ─── SCOPE OF WORK ────────────────────────────────────────────────────────
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('Scope of Work', 60, y);
    y += 20;

    doc
      .fontSize(9).font('Helvetica').fillColor('#1e293b')
      .text(data.proposal.scope_of_work, 60, y, { width: CONTENT_WIDTH });
    y += doc.heightOfString(data.proposal.scope_of_work, { width: CONTENT_WIDTH }) + 20;

    // ─── TIMELINE ─────────────────────────────────────────────────────────────
    if (data.proposal.timeline_days) {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('Timeline', 60, y);
      y += 18;
      doc
        .fontSize(9).font('Helvetica').fillColor('#444444')
        .text(`Estimated duration: ${data.proposal.timeline_days} calendar days`, 60, y);
      y += 24;
    }

    // ─── PRICING ─────────────────────────────────────────────────────────────
    doc.moveTo(60, y).lineTo(PAGE_WIDTH - 60, y).strokeColor('#e2e8f0').stroke();
    y += 16;

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('Pricing', 60, y);
    y += 20;

    doc
      .fontSize(9).font('Helvetica').fillColor('#444444')
      .text('Service fee (ex. GST)', 60, y, { width: 300 })
      .text(`AUD $${data.proposal.proposed_price_aud.toFixed(2)}`, 370, y, { width: 165, align: 'right' });

    y += 18;
    doc
      .text('GST (10%)', 60, y, { width: 300 })
      .text(`AUD $${data.proposal.proposed_tax_aud.toFixed(2)}`, 370, y, { width: 165, align: 'right' });

    y += 16;
    doc.rect(60, y - 4, CONTENT_WIDTH, 26).fillColor('#0f172a').fill();
    doc
      .fontSize(11).font('Helvetica-Bold').fillColor('#ffffff')
      .text('TOTAL (AUD)', 66, y + 2, { width: 290 })
      .text(`$${data.proposal.proposed_total_aud.toFixed(2)}`, 370, y + 2, { width: 165, align: 'right' });

    y += 38;

    if (data.proposal.payment_terms) {
      doc
        .fontSize(8).font('Helvetica').fillColor('#64748b')
        .text(`Payment terms: ${data.proposal.payment_terms}`, 60, y);
      y += 20;
    }

    // ─── FOOTER ───────────────────────────────────────────────────────────────
    doc.moveTo(60, 760).lineTo(PAGE_WIDTH - 60, 760).strokeColor('#e2e8f0').stroke();
    doc
      .fontSize(7).font('Helvetica').fillColor('#94a3b8')
      .text(
        'This proposal is valid for 14 days from the date above. ' +
        'To accept, log in to onys.online and approve this proposal. ' +
        `Proposal reference: ${data.proposal.id}`,
        60, 770, { width: CONTENT_WIDTH, align: 'center' },
      );

    doc.end();
  });
}

