import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PrismaClient, ServiceInvoice, PaymentEvidence } from '@prisma/client';
import type { Queue } from 'bullmq';
import type {
  CreateServiceInvoiceInput,
  UpdateDraftServiceInvoiceInput,
  SubmitEvidenceInput,
  VerifyEvidenceInput,
  LineItem,
  PaymentMethodsPublicView,
  PaymentMethodsOwner,
  MyPaymentMethodsResponse,
} from '@onys/shared';
import { AppError } from '../lib/errors.js';
import { writeAudit } from '../utils/audit.js';
import { generateSasUrl } from '../utils/blob-storage.js';
import { sha256Hash } from '../utils/tokens.js';
import { buildEmailUrl } from '../utils/urls.js';
import { generateAndStoreServiceInvoicePdf } from './service-invoice-pdf.service.js';
import { createServiceInvoiceCheckoutSession } from './stripe.service.js';
import type { SubscriptionService } from './subscription.service.js';
import { decideGstTreatment, AU_GST_RATE } from '../utils/invoice-template.js';

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

type RequiredRecipient =
  | { to_user_id: string; to_company_id?: never }
  | { to_user_id?: never; to_company_id: string };

// ─── ServiceInvoiceService ───────────────────────────────────────────────────

export class ServiceInvoiceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
    private readonly subscriptions: SubscriptionService,
  ) {}

  // ── createInvoice (provider) ─────────────────────────────────────────────

  async createInvoice(
    providerId: string,
    data: CreateServiceInvoiceInput,
  ): Promise<ServiceInvoice> {
    // 1. Subscription gate (per Phase 5 spec)
    const sub = await this.subscriptions.getEffectiveSubscription(providerId);
    if (!sub || (sub.status !== 'ACTIVE' && sub.status !== 'TRIALING')) {
      throw new AppError(
        'SUBSCRIPTION_REQUIRED',
        402,
        'An active subscription is required to send service invoices.',
      );
    }

    // 2. Recipient existence
    let recipientCountry: string | null = null;
    if (data.to_user_id) {
      const recipient = await this.prisma.user.findUnique({
        where: { id: data.to_user_id },
        select: { id: true, deleted_at: true, billing_country: true },
      });
      if (!recipient || recipient.deleted_at) {
        throw new AppError('RECIPIENT_NOT_FOUND', 404);
      }
      recipientCountry = recipient.billing_country;
    }
    if (data.to_company_id) {
      const company = await this.prisma.consultingCompany.findUnique({
        where: { id: data.to_company_id },
        select: { id: true, billing_country: true },
      });
      if (!company) throw new AppError('RECIPIENT_NOT_FOUND', 404);
      recipientCountry = company.billing_country;
    }

    // Issuer (provider) country — used by decideGstTreatment to flag
    // cross-border supply (s38-190 export / Div 84 reverse-charge).
    let issuerCountry: string | null = null;
    if (data.from_company_id) {
      const fromCompany = await this.prisma.consultingCompany.findUnique({
        where: { id: data.from_company_id },
        select: { billing_country: true },
      });
      issuerCountry = fromCompany?.billing_country ?? null;
    } else {
      const fromUser = await this.prisma.user.findUnique({
        where: { id: providerId },
        select: { billing_country: true },
      });
      issuerCountry = fromUser?.billing_country ?? null;
    }

    // 3. Optional task/order ownership check (only if provided)
    if (data.task_id) {
      const task = await this.prisma.task.findUnique({
        where: { id: data.task_id },
        select: { created_by_user_id: true, assigned_member_id: true },
      });
      if (!task) throw new AppError('TASK_NOT_FOUND', 404);
    }
    if (data.order_id) {
      const order = await this.prisma.order.findUnique({
        where: { id: data.order_id },
        select: { contractor_user_id: true, executing_member_id: true, customer_id: true },
      });
      if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
      const ownsOrder =
        order.contractor_user_id === providerId ||
        order.executing_member_id === providerId;
      if (!ownsOrder) {
        throw new AppError(
          'ORDER_NOT_OWNED',
          403,
          'You can only invoice for orders you delivered.',
        );
      }
    }
    if (data.from_company_id) {
      const member = await this.prisma.companyMember.findFirst({
        where: {
          user_id: providerId,
          company_id: data.from_company_id,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!member) {
        throw new AppError(
          'NOT_COMPANY_MEMBER',
          403,
          'You are not a member of the specified company.',
        );
      }
    }

    // 4. Compute totals — delegates to the shared decideGstTreatment() so
    // cross-border supply, the rate, and the treatment text stay in sync
    // with the tender-contract flow.
    const totals = computeTotals(
      data.line_items,
      data.supplier_gst_registered,
      data.tax_rate,
      issuerCountry,
      recipientCountry,
    );

    // 5. Generate invoice number (provider's per-year sequence)
    const invoice_number = await this.generateInvoiceNumber(providerId);

    // 6. Persist
    const invoice = await this.prisma.serviceInvoice.create({
      data: {
        invoice_number,
        status: 'DRAFT',
        from_user_id: providerId,
        ...(data.from_company_id && { from_company_id: data.from_company_id }),
        ...(data.to_user_id && { to_user_id: data.to_user_id }),
        ...(data.to_company_id && { to_company_id: data.to_company_id }),
        ...(data.task_id && { task_id: data.task_id }),
        ...(data.order_id && { order_id: data.order_id }),
        ...(data.project_id && { project_id: data.project_id }),
        currency: data.currency,
        subtotal_cents: totals.subtotal,
        tax_cents: totals.tax,
        total_cents: totals.total,
        line_items: data.line_items as unknown as Prisma.InputJsonValue,
        ...(data.supplier_abn && { supplier_abn: data.supplier_abn }),
        supplier_gst_registered: data.supplier_gst_registered,
        ...(totals.tax_rate !== null && { tax_rate: new Prisma.Decimal(totals.tax_rate) }),
        ...(totals.tax_description && { tax_description: totals.tax_description }),
        ...(data.notes && { notes: data.notes }),
        ...(data.terms && { terms: data.terms }),
        ...(data.due_date && { due_date: new Date(data.due_date) }),
        ...(data.agreed_payment_method && {
          agreed_payment_method: data.agreed_payment_method,
        }),
      } as Prisma.ServiceInvoiceUncheckedCreateInput,
    });

    void writeAudit(this.prisma, {
      actorId: providerId,
      actionType: 'SERVICE_INVOICE_CREATED',
      entityType: 'ServiceInvoice',
      entityId: invoice.id,
      metadata: { total_cents: totals.total, currency: data.currency },
    });

    return invoice;
  }

  // ── updateDraft (provider) ───────────────────────────────────────────────

  async updateDraft(
    invoiceId: string,
    providerId: string,
    data: UpdateDraftServiceInvoiceInput,
  ): Promise<ServiceInvoice> {
    const existing = await this.requireOwnedDraft(invoiceId, providerId);

    let totals: ReturnType<typeof computeTotals> | null = null;
    if (data.line_items || 'supplier_gst_registered' in data || 'tax_rate' in data) {
      const lineItems =
        data.line_items ?? (existing.line_items as unknown as LineItem[]);
      const gstRegistered =
        data.supplier_gst_registered ?? existing.supplier_gst_registered;
      const taxRate =
        data.tax_rate ??
        (existing.tax_rate ? Number(existing.tax_rate) : undefined);

      // Resolve issuer + recipient country for the cross-border decision.
      // updateDraft preserves the existing recipient unless changed in this
      // patch; same for the issuer entity.
      const recipientCountry = await this.resolveRecipientCountry(
        data.to_user_id ?? existing.to_user_id,
        data.to_company_id ?? existing.to_company_id,
      );
      const issuerCountry = await this.resolveIssuerCountry(
        providerId,
        data.from_company_id ?? existing.from_company_id,
      );

      totals = computeTotals(lineItems, gstRegistered, taxRate, issuerCountry, recipientCountry);
    }

    const updateData: Prisma.ServiceInvoiceUncheckedUpdateInput = {
      ...(data.to_user_id !== undefined && { to_user_id: data.to_user_id }),
      ...(data.to_company_id !== undefined && {
        to_company_id: data.to_company_id,
      }),
      ...(data.from_company_id !== undefined && {
        from_company_id: data.from_company_id,
      }),
      ...(data.task_id !== undefined && { task_id: data.task_id }),
      ...(data.order_id !== undefined && { order_id: data.order_id }),
      ...(data.project_id !== undefined && { project_id: data.project_id }),
      ...(data.line_items !== undefined && {
        line_items: data.line_items as unknown as Prisma.InputJsonValue,
      }),
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.supplier_abn !== undefined && { supplier_abn: data.supplier_abn }),
      ...(data.supplier_gst_registered !== undefined && {
        supplier_gst_registered: data.supplier_gst_registered,
      }),
      ...(data.tax_description !== undefined && {
        tax_description: data.tax_description,
      }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.terms !== undefined && { terms: data.terms }),
      ...(data.due_date !== undefined && { due_date: new Date(data.due_date) }),
      ...(data.agreed_payment_method !== undefined && {
        agreed_payment_method: data.agreed_payment_method,
      }),
      ...(totals && {
        subtotal_cents: totals.subtotal,
        tax_cents: totals.tax,
        total_cents: totals.total,
        ...(totals.tax_rate !== null && {
          tax_rate: new Prisma.Decimal(totals.tax_rate),
        }),
        ...(totals.tax_description !== null && {
          tax_description: totals.tax_description,
        }),
      }),
    };

    return this.prisma.serviceInvoice.update({
      where: { id: invoiceId },
      data: updateData,
    });
  }

  // ── sendInvoice (provider) ───────────────────────────────────────────────

  async sendInvoice(invoiceId: string, providerId: string): Promise<ServiceInvoice> {
    const invoice = await this.requireOwnedDraft(invoiceId, providerId);

    // 1. Generate PDF (best-effort — failure does not block send)
    try {
      await generateAndStoreServiceInvoicePdf(invoice.id, this.prisma);
    } catch (err) {
      console.error(
        `[service-invoice] PDF generation failed for ${invoice.id}:`,
        err,
      );
    }

    // 2. Generate magic-link token (only on first send)
    let rawToken: string | null = null;
    if (!invoice.public_view_token_hash) {
      const generated = this.generateMagicLinkToken();
      rawToken = generated.raw;
      await this.prisma.serviceInvoice.update({
        where: { id: invoice.id },
        data: { public_view_token_hash: generated.hash },
      });
    }

    // 3. Mark as sent
    const updated = await this.prisma.serviceInvoice.update({
      where: { id: invoice.id },
      data: { status: 'OPEN', sent_at: new Date() },
    });

    // 4. Resolve recipient email (user OR primary admin of company)
    const recipientEmail = await this.resolveRecipientEmail(invoice);

    // 5. Resolve provider name
    const provider = await this.prisma.user.findUniqueOrThrow({
      where: { id: providerId },
      select: { full_name: true, legal_entity_name: true },
    });
    const providerName = provider.legal_entity_name ?? provider.full_name;

    // 6. Build URLs — internal (auth) and public (magic link)
    const internalUrl = buildEmailUrl(`/invoices/${invoice.id}`);
    const publicUrl = rawToken
      ? buildEmailUrl(`/inv/${rawToken}`)
      : null;

    // 7. Queue email + in-app notification (best-effort)
    if (recipientEmail) {
      await this.emailQueue.add('service-invoice-sent', {
        type: 'service-invoice-sent',
        to: recipientEmail,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        provider_name: providerName,
        total_cents: invoice.total_cents,
        currency: invoice.currency,
        due_date: invoice.due_date?.toISOString() ?? null,
        internal_url: internalUrl,
        public_url: publicUrl,
      });
    }
    if (invoice.to_user_id) {
      await this.prisma.notification
        .create({
          data: {
            user_id: invoice.to_user_id,
            category: 'PAYMENT',
            title: `New invoice from ${providerName}`,
            body: `Invoice ${invoice.invoice_number} for ${formatMoney(
              invoice.total_cents,
              invoice.currency,
            )} is awaiting payment.`,
            link_url: `/invoices/${invoice.id}`,
            metadata: { invoice_id: invoice.id } as Prisma.InputJsonValue,
          },
        })
        .catch(() => null);
    }

    void writeAudit(this.prisma, {
      actorId: providerId,
      actionType: 'SERVICE_INVOICE_SENT',
      entityType: 'ServiceInvoice',
      entityId: invoice.id,
      metadata: { invoice_number: invoice.invoice_number },
    });

    return updated;
  }

  // ── List (provider sent) ─────────────────────────────────────────────────

  async getInvoicesAsSender(providerId: string) {
    return this.prisma.serviceInvoice.findMany({
      where: { from_user_id: providerId },
      include: {
        to_user: { select: { id: true, full_name: true, email: true } },
        to_company: { select: { id: true, company_name: true } },
        payment_evidence: {
          select: {
            id: true,
            status: true,
            payment_method: true,
            payment_date: true,
            amount_cents: true,
            currency: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  // ── List (client received) ───────────────────────────────────────────────

  async getInvoicesAsRecipient(clientId: string) {
    // Companies the user is an active member of
    const memberships = await this.prisma.companyMember.findMany({
      where: { user_id: clientId, status: 'ACTIVE' },
      select: { company_id: true },
    });
    const companyIds = memberships.map((m) => m.company_id);

    return this.prisma.serviceInvoice.findMany({
      where: {
        OR: [
          { to_user_id: clientId },
          ...(companyIds.length > 0 ? [{ to_company_id: { in: companyIds } }] : []),
        ],
        status: { in: ['OPEN', 'PAID', 'VOID'] },
      },
      include: {
        from_user: { select: { id: true, full_name: true, email: true } },
        from_company: { select: { id: true, company_name: true } },
        payment_evidence: {
          where: { submitted_by_user_id: clientId },
          select: {
            id: true,
            status: true,
            payment_method: true,
            payment_date: true,
            amount_cents: true,
            currency: true,
            rejection_reason: true,
          },
        },
      },
      orderBy: { sent_at: 'desc' },
    });
  }

  // ── Get by id (with auth check) ──────────────────────────────────────────

  async getInvoiceForUser(invoiceId: string, userId: string) {
    const invoice = await this.prisma.serviceInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        from_user: {
          select: {
            id: true,
            full_name: true,
            email: true,
            legal_entity_name: true,
            abn: true,
            payment_methods: true,
          },
        },
        from_company: { select: { id: true, company_name: true, abn: true } },
        to_user: { select: { id: true, full_name: true, email: true } },
        to_company: { select: { id: true, company_name: true } },
        payment_evidence: {
          orderBy: { created_at: 'desc' },
        },
      },
    });
    if (!invoice) throw new AppError('NOT_FOUND', 404);

    // Authorization
    const isFrom = invoice.from_user_id === userId;
    const isToUser = invoice.to_user_id === userId;
    let isToCompanyMember = false;
    if (!isFrom && !isToUser && invoice.to_company_id) {
      const member = await this.prisma.companyMember.findFirst({
        where: {
          user_id: userId,
          company_id: invoice.to_company_id,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      isToCompanyMember = !!member;
    }
    if (!isFrom && !isToUser && !isToCompanyMember) {
      throw new AppError('FORBIDDEN', 403);
    }
    return invoice;
  }

  async getInvoicePdfDownloadUrl(invoiceId: string, userId: string): Promise<string> {
    const invoice = await this.getInvoiceForUser(invoiceId, userId);
    if (!invoice.pdf_storage_url) {
      // Generate on demand if missing (e.g. send happened before PDF gen)
      await generateAndStoreServiceInvoicePdf(invoice.id, this.prisma);
      const refreshed = await this.prisma.serviceInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
      });
      if (!refreshed.pdf_storage_url) {
        throw new AppError('PDF_NOT_GENERATED', 500);
      }
      return generateSasUrl(refreshed.pdf_storage_url, 60);
    }
    return generateSasUrl(invoice.pdf_storage_url, 60);
  }

  // ── submitPaymentEvidence (client) ───────────────────────────────────────

  async submitPaymentEvidence(
    invoiceId: string,
    clientId: string,
    data: SubmitEvidenceInput,
  ): Promise<PaymentEvidence> {
    const invoice = await this.getInvoiceForUser(invoiceId, clientId);
    if (invoice.from_user_id === clientId) {
      throw new AppError(
        'CANNOT_SUBMIT_OWN',
        403,
        'You cannot submit payment evidence on an invoice you sent.',
      );
    }
    if (invoice.status !== 'OPEN') {
      throw new AppError(
        'INVOICE_NOT_OPEN',
        409,
        `Cannot submit evidence on an invoice in ${invoice.status} state.`,
      );
    }

    const evidence = await this.prisma.paymentEvidence.create({
      data: {
        service_invoice_id: invoice.id,
        submitted_by_user_id: clientId,
        payment_method: data.payment_method,
        ...(data.payment_reference && { payment_reference: data.payment_reference }),
        payment_date: new Date(data.payment_date),
        amount_cents: data.amount_cents,
        currency: data.currency,
        ...(data.notes && { notes: data.notes }),
        ...(data.evidence_file_url && { evidence_file_url: data.evidence_file_url }),
        ...(data.evidence_file_name && { evidence_file_name: data.evidence_file_name }),
        status: 'SUBMITTED',
      },
    });

    // Notify provider
    const provider = await this.prisma.user.findUnique({
      where: { id: invoice.from_user_id },
      select: { email: true, full_name: true },
    });
    if (provider?.email) {
      await this.emailQueue.add('service-invoice-evidence-submitted', {
        type: 'service-invoice-evidence-submitted',
        to: provider.email,
        provider_name: provider.full_name,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        amount_cents: data.amount_cents,
        currency: data.currency,
        payment_method: data.payment_method,
      });
    }
    await this.prisma.notification
      .create({
        data: {
          user_id: invoice.from_user_id,
          category: 'PAYMENT',
          title: `Payment evidence submitted for ${invoice.invoice_number}`,
          body: `Review and approve to mark as paid.`,
          link_url: `/invoices/${invoice.id}`,
          metadata: {
            invoice_id: invoice.id,
            evidence_id: evidence.id,
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => null);

    void writeAudit(this.prisma, {
      actorId: clientId,
      actionType: 'SERVICE_INVOICE_EVIDENCE_SUBMITTED',
      entityType: 'ServiceInvoice',
      entityId: invoice.id,
      metadata: { evidence_id: evidence.id, payment_method: data.payment_method },
    });

    return evidence;
  }

  // ── verifyPaymentEvidence (provider) ─────────────────────────────────────

  async verifyPaymentEvidence(
    evidenceId: string,
    providerId: string,
    data: VerifyEvidenceInput,
  ): Promise<PaymentEvidence> {
    const evidence = await this.prisma.paymentEvidence.findUnique({
      where: { id: evidenceId },
      include: { service_invoice: true },
    });
    if (!evidence) throw new AppError('NOT_FOUND', 404);
    if (evidence.service_invoice.from_user_id !== providerId) {
      throw new AppError('FORBIDDEN', 403);
    }
    if (evidence.status !== 'SUBMITTED') {
      throw new AppError(
        'EVIDENCE_NOT_PENDING',
        409,
        `Evidence is already ${evidence.status}.`,
      );
    }

    const newStatus = data.approved ? 'VERIFIED' : 'REJECTED';

    const [updated] = await this.prisma.$transaction([
      this.prisma.paymentEvidence.update({
        where: { id: evidenceId },
        data: {
          status: newStatus,
          reviewed_by_user_id: providerId,
          reviewed_at: new Date(),
          ...(data.rejection_reason && { rejection_reason: data.rejection_reason }),
        },
      }),
      ...(data.approved
        ? [
            this.prisma.serviceInvoice.update({
              where: { id: evidence.service_invoice_id },
              data: {
                status: 'PAID',
                paid_at: new Date(),
                amount_paid_cents: evidence.service_invoice.total_cents,
              },
            }),
          ]
        : []),
    ]);

    // Notify submitter
    const client = await this.prisma.user.findUnique({
      where: { id: evidence.submitted_by_user_id },
      select: { email: true, full_name: true },
    });
    if (client?.email) {
      await this.emailQueue.add(
        data.approved
          ? 'service-invoice-evidence-approved'
          : 'service-invoice-evidence-rejected',
        {
          type: data.approved
            ? 'service-invoice-evidence-approved'
            : 'service-invoice-evidence-rejected',
          to: client.email,
          full_name: client.full_name,
          invoice_id: evidence.service_invoice_id,
          invoice_number: evidence.service_invoice.invoice_number,
          rejection_reason: data.rejection_reason ?? null,
        },
      );
    }
    await this.prisma.notification
      .create({
        data: {
          user_id: evidence.submitted_by_user_id,
          category: 'PAYMENT',
          title: data.approved
            ? `Payment confirmed for ${evidence.service_invoice.invoice_number}`
            : `Payment evidence rejected`,
          body: data.approved
            ? 'The provider has confirmed receipt.'
            : data.rejection_reason ?? 'See invoice for details.',
          link_url: `/invoices/${evidence.service_invoice_id}`,
          metadata: {
            invoice_id: evidence.service_invoice_id,
            evidence_id: evidence.id,
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => null);

    void writeAudit(this.prisma, {
      actorId: providerId,
      actionType: data.approved
        ? 'SERVICE_INVOICE_PAID'
        : 'SERVICE_INVOICE_EVIDENCE_REJECTED',
      entityType: 'ServiceInvoice',
      entityId: evidence.service_invoice_id,
      metadata: {
        evidence_id: evidenceId,
        ...(data.rejection_reason && { rejection_reason: data.rejection_reason }),
      },
    });

    return updated;
  }

  // ── Payment-methods config ───────────────────────────────────────────────

  /**
   * Resolves which entity owns the payment instructions for the authenticated
   * caller. Primary admins of a consulting company manage instructions on the
   * company entity (so all members see the same details and the company
   * survives admin changes); everyone else (individual contractors,
   * organisation admins) manages instructions on their personal user record.
   */
  private async resolvePaymentMethodsOwner(userId: string): Promise<PaymentMethodsOwner> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        full_name: true,
        legal_entity_name: true,
        primary_admin_of: { select: { id: true, company_name: true, legal_company_name: true } },
      },
    });
    if (user.primary_admin_of) {
      return {
        kind: 'company',
        id: user.primary_admin_of.id,
        display_name: user.primary_admin_of.legal_company_name ?? user.primary_admin_of.company_name,
      };
    }
    return {
      kind: 'user',
      id: userId,
      display_name: user.legal_entity_name ?? user.full_name,
    };
  }

  async getMyPaymentMethods(userId: string): Promise<MyPaymentMethodsResponse> {
    const owner = await this.resolvePaymentMethodsOwner(userId);
    const methods = await this.readPaymentMethodsFor(owner);
    return { owner, methods };
  }

  private async readPaymentMethodsFor(
    owner: PaymentMethodsOwner,
  ): Promise<Record<string, unknown>> {
    if (owner.kind === 'company') {
      const company = await this.prisma.consultingCompany.findUniqueOrThrow({
        where: { id: owner.id },
        select: { payment_methods: true },
      });
      return (company.payment_methods as Record<string, unknown>) ?? {};
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: owner.id },
      select: { payment_methods: true },
    });
    return (user.payment_methods as Record<string, unknown>) ?? {};
  }

  async updatePaymentMethods(
    userId: string,
    methods: Record<string, unknown>,
  ): Promise<MyPaymentMethodsResponse> {
    const owner = await this.resolvePaymentMethodsOwner(userId);
    const existing = await this.readPaymentMethodsFor(owner);
    const merged = { ...existing, ...methods };
    if (owner.kind === 'company') {
      await this.prisma.consultingCompany.update({
        where: { id: owner.id },
        data: { payment_methods: merged as Prisma.InputJsonValue },
      });
    } else {
      await this.prisma.user.update({
        where: { id: owner.id },
        data: { payment_methods: merged as Prisma.InputJsonValue },
      });
    }
    return { owner, methods: merged };
  }

  /**
   * Returns the masked payment-methods view for an arbitrary provider.
   * `providerId` is a User id; if that user is the primary admin of a
   * consulting company, the company's instructions are returned instead.
   */
  async getPublicPaymentMethods(
    providerId: string,
  ): Promise<PaymentMethodsPublicView> {
    const owner = await this.resolvePaymentMethodsOwner(providerId);
    const raw = await this.readPaymentMethodsFor(owner);
    return maskPaymentMethods(raw);
  }

  // ── Recent clients (typeahead for /invoices/create) ──────────────────────

  /**
   * Returns the caller's recent counterparties — anyone they've delivered an
   * order to, sent a service invoice to, or had a task with. Used to populate
   * the recipient picker on the invoice creation form.
   */
  async getRecentClients(providerId: string): Promise<
    Array<{
      type: 'user' | 'company';
      id: string;
      name: string;
      email?: string;
      sub_label?: string;
      last_interaction_at: string | null;
    }>
  > {
    // 1. Customers from orders the provider delivered
    const orders = await this.prisma.order.findMany({
      where: {
        OR: [
          { contractor_user_id: providerId },
          { executing_member_id: providerId },
        ],
      },
      select: {
        customer_id: true,
        completed_at: true,
        created_at: true,
        customer: { select: { id: true, full_name: true, email: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    // 2. Recipients from prior service invoices
    const invoices = await this.prisma.serviceInvoice.findMany({
      where: { from_user_id: providerId },
      select: {
        to_user_id: true,
        to_company_id: true,
        sent_at: true,
        created_at: true,
        to_user: { select: { id: true, full_name: true, email: true } },
        to_company: { select: { id: true, company_name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    type Entry = {
      type: 'user' | 'company';
      id: string;
      name: string;
      email?: string;
      sub_label?: string;
      last_interaction_at: string | null;
    };
    const map = new Map<string, Entry>();
    const upsert = (key: string, entry: Entry) => {
      const existing = map.get(key);
      if (
        !existing ||
        (entry.last_interaction_at &&
          (!existing.last_interaction_at ||
            entry.last_interaction_at > existing.last_interaction_at))
      ) {
        map.set(key, entry);
      }
    };

    for (const o of orders) {
      if (!o.customer) continue;
      upsert(`user:${o.customer.id}`, {
        type: 'user',
        id: o.customer.id,
        name: o.customer.full_name,
        email: o.customer.email,
        sub_label: 'Past order',
        last_interaction_at: (o.completed_at ?? o.created_at).toISOString(),
      });
    }
    for (const inv of invoices) {
      const t = (inv.sent_at ?? inv.created_at).toISOString();
      if (inv.to_user) {
        upsert(`user:${inv.to_user.id}`, {
          type: 'user',
          id: inv.to_user.id,
          name: inv.to_user.full_name,
          email: inv.to_user.email,
          sub_label: 'Previously invoiced',
          last_interaction_at: t,
        });
      }
      if (inv.to_company) {
        upsert(`company:${inv.to_company.id}`, {
          type: 'company',
          id: inv.to_company.id,
          name: inv.to_company.company_name,
          sub_label: 'Previously invoiced',
          last_interaction_at: t,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const at = a.last_interaction_at ?? '';
      const bt = b.last_interaction_at ?? '';
      return bt.localeCompare(at);
    });
  }

  // ── Evidence file download ───────────────────────────────────────────────

  /** Returns a 60-min SAS URL for the evidence file. Either party may fetch. */
  async getEvidenceFileDownloadUrl(
    invoiceId: string,
    evidenceId: string,
    callerId: string,
  ): Promise<{ download_url: string; file_name: string | null }> {
    const evidence = await this.prisma.paymentEvidence.findUnique({
      where: { id: evidenceId },
      include: {
        service_invoice: {
          select: {
            id: true,
            from_user_id: true,
            to_user_id: true,
            to_company_id: true,
          },
        },
      },
    });
    if (!evidence || evidence.service_invoice.id !== invoiceId) {
      throw new AppError('NOT_FOUND', 404);
    }
    // Authorization mirrors getInvoiceForUser
    const inv = evidence.service_invoice;
    const isFrom = inv.from_user_id === callerId;
    const isTo = inv.to_user_id === callerId;
    let isToCompanyMember = false;
    if (!isFrom && !isTo && inv.to_company_id) {
      const member = await this.prisma.companyMember.findFirst({
        where: { user_id: callerId, company_id: inv.to_company_id, status: 'ACTIVE' },
        select: { id: true },
      });
      isToCompanyMember = !!member;
    }
    if (!isFrom && !isTo && !isToCompanyMember) {
      throw new AppError('FORBIDDEN', 403);
    }
    if (!evidence.evidence_file_url) {
      throw new AppError('NO_FILE', 404, 'No file attached to this evidence.');
    }
    const url = await generateSasUrl(evidence.evidence_file_url, 60);
    return { download_url: url, file_name: evidence.evidence_file_name };
  }

  // ── Stripe Payment via Connect ───────────────────────────────────────────

  // Looks up the issuer's Stripe Connect account (individual provider OR
  // company). Returns null if no enabled Connect account is on file — caller
  // surfaces a STRIPE_CONNECT_REQUIRED error.
  private async resolveProviderStripeAccount(
    invoice: ServiceInvoice,
  ): Promise<string | null> {
    if (invoice.from_company_id) {
      const account = await this.prisma.stripeConnectAccount.findFirst({
        where: { company_id: invoice.from_company_id, status: 'ENABLED' },
        select: { stripe_account_id: true },
      });
      return account?.stripe_account_id ?? null;
    }
    const account = await this.prisma.stripeConnectAccount.findFirst({
      where: {
        contractor_profile: { user_id: invoice.from_user_id },
        status: 'ENABLED',
      },
      select: { stripe_account_id: true },
    });
    return account?.stripe_account_id ?? null;
  }

  /** Provider-triggered: create a Stripe Checkout URL the client can pay at. */
  async createStripePaymentLink(
    invoiceId: string,
    callerId: string,
    successUrl?: string,
    cancelUrl?: string,
  ): Promise<{ checkout_url: string }> {
    const invoice = await this.getInvoiceForUser(invoiceId, callerId);
    if (invoice.status !== 'OPEN') {
      throw new AppError(
        'INVOICE_NOT_OPEN',
        409,
        `Cannot create a payment link for an invoice in ${invoice.status} state.`,
      );
    }
    const accountId = await this.resolveProviderStripeAccount(invoice);
    if (!accountId) {
      throw new AppError(
        'STRIPE_CONNECT_REQUIRED',
        400,
        'Provider has no enabled Stripe Connect account.',
      );
    }
    const session = await createServiceInvoiceCheckoutSession({
      providerStripeAccountId: accountId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      amountCents: invoice.total_cents,
      currency: invoice.currency,
      successUrl: successUrl ?? buildEmailUrl(`/invoices/${invoice.id}?paid=1`),
      cancelUrl: cancelUrl ?? buildEmailUrl(`/invoices/${invoice.id}`),
      ...(invoice.to_user?.email && { customerEmail: invoice.to_user.email }),
    });
    if (!session.url) throw new AppError('CHECKOUT_FAILED', 500);
    return { checkout_url: session.url };
  }

  // ── Magic-link public access ─────────────────────────────────────────────

  /** Public lookup by raw token. No auth — exposes only fields safe to share. */
  async getInvoiceByPublicToken(rawToken: string) {
    if (!rawToken || rawToken.length < 16) {
      throw new AppError('INVALID_TOKEN', 400);
    }
    const hash = sha256Hash(rawToken);
    const invoice = await this.prisma.serviceInvoice.findUnique({
      where: { public_view_token_hash: hash },
      include: {
        from_user: {
          select: {
            full_name: true,
            legal_entity_name: true,
            email: true,
            abn: true,
            payment_methods: true,
          },
        },
        from_company: {
          select: {
            company_name: true,
            legal_company_name: true,
            abn: true,
            payment_methods: true,
          },
        },
        to_user: { select: { full_name: true, email: true } },
        to_company: { select: { company_name: true } },
      },
    });
    if (!invoice) throw new AppError('NOT_FOUND', 404);

    // Check whether the provider has Stripe Connect for "Pay with card" UI
    const stripeReady = !!(await this.resolveProviderStripeAccount(invoice));

    return {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      status: invoice.status,
      issued_date: invoice.created_at,
      due_date: invoice.due_date,
      paid_date: invoice.paid_at,
      currency: invoice.currency,
      subtotal_cents: invoice.subtotal_cents,
      tax_cents: invoice.tax_cents,
      total_cents: invoice.total_cents,
      tax_description: invoice.tax_description,
      line_items: invoice.line_items,
      notes: invoice.notes,
      terms: invoice.terms,
      issuer: {
        name: invoice.from_company
          ? invoice.from_company.legal_company_name ?? invoice.from_company.company_name
          : invoice.from_user.legal_entity_name ?? invoice.from_user.full_name,
        email: invoice.from_user.email,
        abn: invoice.from_company?.abn ?? invoice.from_user.abn ?? null,
      },
      recipient: {
        name: invoice.to_company
          ? invoice.to_company.company_name
          : invoice.to_user?.full_name ?? '',
      },
      payment_methods: maskPaymentMethods(
        invoice.from_company
          ? ((invoice.from_company.payment_methods as Record<string, unknown>) ?? {})
          : ((invoice.from_user.payment_methods as Record<string, unknown>) ?? {}),
      ),
      stripe_pay_available: stripeReady,
    };
  }

  /** Public-facing Stripe checkout — anyone with the token can initiate. */
  async createPublicStripePayment(
    rawToken: string,
    successUrl?: string,
    cancelUrl?: string,
  ): Promise<{ checkout_url: string }> {
    if (!rawToken || rawToken.length < 16) {
      throw new AppError('INVALID_TOKEN', 400);
    }
    const hash = sha256Hash(rawToken);
    const invoice = await this.prisma.serviceInvoice.findUnique({
      where: { public_view_token_hash: hash },
      include: { to_user: { select: { email: true } } },
    });
    if (!invoice) throw new AppError('NOT_FOUND', 404);
    if (invoice.status !== 'OPEN') {
      throw new AppError(
        'INVOICE_NOT_OPEN',
        409,
        `Invoice is ${invoice.status}.`,
      );
    }
    const accountId = await this.resolveProviderStripeAccount(invoice);
    if (!accountId) {
      throw new AppError(
        'STRIPE_CONNECT_REQUIRED',
        400,
        'Provider has no enabled Stripe Connect account.',
      );
    }
    const session = await createServiceInvoiceCheckoutSession({
      providerStripeAccountId: accountId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      amountCents: invoice.total_cents,
      currency: invoice.currency,
      successUrl: successUrl ?? buildEmailUrl(`/inv/${rawToken}?paid=1`),
      cancelUrl: cancelUrl ?? buildEmailUrl(`/inv/${rawToken}`),
      ...(invoice.to_user?.email && { customerEmail: invoice.to_user.email }),
    });
    if (!session.url) throw new AppError('CHECKOUT_FAILED', 500);
    return { checkout_url: session.url };
  }

  // ── Webhook hook: mark service invoice paid via Stripe ───────────────────

  async markPaidByStripeWebhook(
    invoiceId: string,
    paymentIntentId: string,
  ): Promise<void> {
    const invoice = await this.prisma.serviceInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) {
      console.warn(`[service-invoice] webhook: unknown invoice ${invoiceId}`);
      return;
    }
    if (invoice.status === 'PAID') return; // idempotent

    await this.prisma.serviceInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        paid_at: new Date(),
        amount_paid_cents: invoice.total_cents,
        stripe_payment_intent_id: paymentIntentId,
      },
    });

    // Notify provider in-app
    await this.prisma.notification
      .create({
        data: {
          user_id: invoice.from_user_id,
          category: 'PAYMENT',
          title: `Invoice ${invoice.invoice_number} paid`,
          body: 'Stripe confirmed receipt — funds settling to your Connect account.',
          link_url: `/invoices/${invoice.id}`,
          metadata: { invoice_id: invoice.id } as Prisma.InputJsonValue,
        },
      })
      .catch(() => null);

    // Notify provider by email
    const provider = await this.prisma.user.findUnique({
      where: { id: invoice.from_user_id },
      select: { email: true, full_name: true },
    });
    if (provider?.email) {
      await this.emailQueue.add('service-invoice-paid', {
        type: 'service-invoice-paid',
        to: provider.email,
        full_name: provider.full_name,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        amount_cents: invoice.total_cents,
        currency: invoice.currency,
      });
    }

    void writeAudit(this.prisma, {
      actorId: 'stripe-webhook',
      actionType: 'SERVICE_INVOICE_PAID_VIA_STRIPE',
      entityType: 'ServiceInvoice',
      entityId: invoice.id,
      metadata: { payment_intent_id: paymentIntentId },
    });
  }

  // ── Overdue reminder (called from worker) ────────────────────────────────

  /** Returns the count of reminder emails queued. */
  async sendOverdueReminders(): Promise<{ reminded_count: number }> {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const overdue = await this.prisma.serviceInvoice.findMany({
      where: {
        status: 'OPEN',
        due_date: { lt: now },
        OR: [
          { last_reminder_sent_at: null },
          { last_reminder_sent_at: { lt: threeDaysAgo } },
        ],
      },
      include: {
        from_user: { select: { full_name: true, legal_entity_name: true } },
        from_company: { select: { company_name: true } },
        to_user: { select: { email: true, full_name: true } },
        to_company: { select: { billing_email: true } },
      },
      take: 500, // sane upper bound per run
    });

    let queued = 0;
    for (const inv of overdue) {
      const recipientEmail = inv.to_user?.email ?? inv.to_company?.billing_email;
      if (!recipientEmail) continue;
      const providerName = inv.from_company
        ? inv.from_company.company_name
        : inv.from_user.legal_entity_name ?? inv.from_user.full_name;
      await this.emailQueue.add('service-invoice-overdue', {
        type: 'service-invoice-overdue',
        to: recipientEmail,
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        provider_name: providerName,
        total_cents: inv.total_cents,
        currency: inv.currency,
        due_date: inv.due_date?.toISOString() ?? null,
        days_overdue: inv.due_date
          ? Math.floor((now.getTime() - inv.due_date.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      });
      await this.prisma.serviceInvoice.update({
        where: { id: inv.id },
        data: { last_reminder_sent_at: now },
      });
      queued += 1;
    }
    return { reminded_count: queued };
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private generateMagicLinkToken(): { raw: string; hash: string } {
    const raw = crypto.randomBytes(32).toString('hex'); // 64 hex chars
    return { raw, hash: sha256Hash(raw) };
  }

  // Look up the recipient's country from either the to_user_id or the
  // to_company_id. Used by computeTotals() to feed decideGstTreatment()
  // when the cross-border decision needs the customer's country. Returns
  // null when neither id is supplied (legacy drafts) or the row is gone.
  private async resolveRecipientCountry(
    toUserId: string | null,
    toCompanyId: string | null,
  ): Promise<string | null> {
    if (toCompanyId) {
      const company = await this.prisma.consultingCompany.findUnique({
        where: { id: toCompanyId },
        select: { billing_country: true },
      });
      return company?.billing_country ?? null;
    }
    if (toUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: toUserId },
        select: { billing_country: true },
      });
      return user?.billing_country ?? null;
    }
    return null;
  }

  // Same shape for the issuer (provider) side.
  private async resolveIssuerCountry(
    providerId: string,
    fromCompanyId: string | null,
  ): Promise<string | null> {
    if (fromCompanyId) {
      const company = await this.prisma.consultingCompany.findUnique({
        where: { id: fromCompanyId },
        select: { billing_country: true },
      });
      return company?.billing_country ?? null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: providerId },
      select: { billing_country: true },
    });
    return user?.billing_country ?? null;
  }

  private async requireOwnedDraft(
    invoiceId: string,
    providerId: string,
  ): Promise<ServiceInvoice> {
    const invoice = await this.prisma.serviceInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new AppError('NOT_FOUND', 404);
    if (invoice.from_user_id !== providerId) throw new AppError('FORBIDDEN', 403);
    if (invoice.status !== 'DRAFT') {
      throw new AppError(
        'INVOICE_NOT_DRAFT',
        409,
        `Cannot edit an invoice in ${invoice.status} state.`,
      );
    }
    return invoice;
  }

  private async generateInvoiceNumber(providerId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.serviceInvoice.count({
      where: {
        from_user_id: providerId,
        created_at: {
          gte: new Date(`${year}-01-01T00:00:00Z`),
          lt: new Date(`${year + 1}-01-01T00:00:00Z`),
        },
      },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `INV-${year}-${seq}`;
  }

  private async resolveRecipientEmail(
    invoice: ServiceInvoice & RequiredRecipient,
  ): Promise<string | null>;
  private async resolveRecipientEmail(
    invoice: ServiceInvoice,
  ): Promise<string | null>;
  private async resolveRecipientEmail(
    invoice: ServiceInvoice,
  ): Promise<string | null> {
    if (invoice.to_user_id) {
      const user = await this.prisma.user.findUnique({
        where: { id: invoice.to_user_id },
        select: { email: true },
      });
      return user?.email ?? null;
    }
    if (invoice.to_company_id) {
      const company = await this.prisma.consultingCompany.findUnique({
        where: { id: invoice.to_company_id },
        select: { billing_email: true, primary_admin: { select: { email: true } } },
      });
      return company?.billing_email ?? company?.primary_admin?.email ?? null;
    }
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Constant kept as a re-export for any caller that needs the AU GST rate
// directly. Mostly tests + the invoice template helpers.
export { AU_GST_RATE };

function computeTotals(
  items: LineItem[],
  gstRegistered: boolean,
  taxRateInput: number | undefined,
  issuerCountry: string | null,
  recipientCountry: string | null,
): {
  subtotal: number;
  tax: number;
  total: number;
  tax_rate: number | null;
  tax_description: string | null;
} {
  const subtotal = items.reduce(
    (sum, item) => sum + Math.round(item.unit_amount_cents * item.quantity),
    0,
  );

  // Two paths:
  //   1. Explicit tax_rate override (admin-supplied) — honour as-is.
  //   2. Otherwise — call decideGstTreatment so cross-border supply, the
  //      AU GST rate, and the treatment text stay in sync with the
  //      tender-contract flow. An AU GST-registered supplier billing an
  //      overseas customer no longer gets 10% GST applied.
  let effectiveRate: number;
  let tax_description: string | null;
  if (taxRateInput != null) {
    effectiveRate = taxRateInput;
    tax_description =
      effectiveRate > 0
        ? `Tax (${(effectiveRate * 100).toFixed(0)}%) applied`
        : 'No tax applied — admin override';
  } else {
    const decision = decideGstTreatment({
      issuer_country: issuerCountry,
      issuer_gst_registered: gstRegistered,
      recipient_country: recipientCountry,
      amount_ex_gst_cents: subtotal,
    });
    effectiveRate = decision.gst_rate;
    tax_description = decision.treatment_reason;
  }
  const tax = Math.round(subtotal * effectiveRate);
  const total = subtotal + tax;

  const tax_rate = effectiveRate > 0 ? effectiveRate : null;
  return { subtotal, tax, total, tax_rate, tax_description };
}

function formatMoney(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

// Convert raw payment_methods JSON → masked client-facing view.
// payment_link_url is intentionally exposed verbatim because it's a
// supplier-supplied hosted-payment URL meant to be clicked by the customer.
function maskPaymentMethods(raw: Record<string, unknown>): PaymentMethodsPublicView {
  const get = <T>(key: string) => (raw[key] as T | undefined);

  const stripe = get<{ enabled?: boolean; payment_link_url?: string }>('stripe');
  const bankAu = get<{
    enabled?: boolean;
    bsb?: string;
    account_number?: string;
  }>('bank_au');
  const bankSwift = get<{
    enabled?: boolean;
    swift_code?: string;
  }>('bank_swift');
  const paypal = get<{ enabled?: boolean; email?: string; payment_link_url?: string }>('paypal');
  const wise = get<{ enabled?: boolean; email?: string; payment_link_url?: string }>('wise');
  const other = get<{ enabled?: boolean; description?: string; payment_link_url?: string }>('other');

  return {
    stripe: {
      enabled: !!stripe?.enabled,
      ...(stripe?.payment_link_url && { payment_link_url: stripe.payment_link_url }),
    },
    bank_au: {
      enabled: !!bankAu?.enabled,
      ...(bankAu?.bsb && { bsb_masked: bankAu.bsb }),
    },
    bank_swift: {
      enabled: !!bankSwift?.enabled,
      ...(bankSwift?.swift_code && { swift_code: bankSwift.swift_code }),
    },
    paypal: {
      enabled: !!paypal?.enabled,
      ...(paypal?.email && { email_masked: maskEmail(paypal.email) }),
      ...(paypal?.payment_link_url && { payment_link_url: paypal.payment_link_url }),
    },
    wise: {
      enabled: !!wise?.enabled,
      ...(wise?.email && { email_masked: maskEmail(wise.email) }),
      ...(wise?.payment_link_url && { payment_link_url: wise.payment_link_url }),
    },
    other: {
      enabled: !!other?.enabled,
      ...(other?.description && { description: other.description }),
      ...(other?.payment_link_url && { payment_link_url: other.payment_link_url }),
    },
  };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.length > 2 ? local[0] + '***' + local[local.length - 1] : '***';
  return `${visible}@${domain}`;
}
