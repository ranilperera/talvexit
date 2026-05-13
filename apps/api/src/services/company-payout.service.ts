import type {
  PrismaClient,
  CompanyPayoutRecord,
  CompanyPayoutPreference,
  CompanyPayoutMethod,
  CompanyPayoutStatus,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import PDFDocument from 'pdfkit';
import { AppError } from '../lib/errors.js';
import { writeAudit } from '../utils/audit.js';
import { emailUrls } from '../utils/urls.js';
import { stripe } from './stripe.service.js';
import { audToCents, calculatePayout } from '../utils/commission.js';
import { getProviderType } from '../utils/order-provider.js';
import { uploadToBlob } from '../utils/blob-storage.js';

// ─── Internal types ────────────────────────────────────────────────────────────

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

export interface CompanyPayoutPreferenceInput {
  method: 'STRIPE_CONNECT' | 'AU_BANK' | 'OVERSEAS_BANK';
  // STRIPE_CONNECT
  stripe_account_id?: string;
  // AU_BANK
  bsb?: string;           // 6 digits
  account_number?: string;
  account_name?: string;  // account holder name
  bank_name?: string;
  // OVERSEAS_BANK — reuses bank_name, account_name; iban optional
  swift_code?: string;
  iban?: string;
  bank_address?: string;  // full bank address including country
}

// ─── CompanyPayoutService ──────────────────────────────────────────────────────

export class CompanyPayoutService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── METHOD 1: getPayoutQueue ────────────────────────────────────────────────
  // Returns paginated payout records for platform admin review.
  // Includes company name, payout preference, and invoice details.

  /**
   * @param params - Optional filters (status, method) and cursor pagination.
   * @returns Payout records with company and order/invoice context, plus total count.
   */
  async getPayoutQueue(params: {
    status?: CompanyPayoutStatus;
    method?: CompanyPayoutMethod;
    cursor?: string;
    limit?: number;
  }) {
    const limit = Math.min(params.limit ?? 20, 50);
    const where: { status?: CompanyPayoutStatus; method?: CompanyPayoutMethod } = {};
    if (params.status) where.status = params.status;
    if (params.method) where.method = params.method;

    const [records, total, statusGroups] = await Promise.all([
      this.prisma.companyPayoutRecord.findMany({
        where,
        take: limit,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        orderBy: { created_at: 'desc' },
        include: {
          company: {
            select: {
              id: true,
              company_name: true,
              primary_admin_id: true,
              payout_preference: true,
              abn: true,
              payout_accounts: {
                orderBy: [{ is_primary: 'desc' }, { created_at: 'desc' }],
                take: 5,
              },
            },
          },
          contractor_profile: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  full_name: true,
                  email: true,
                  abn: true,
                },
              },
            },
          },
          order: {
            select: {
              id: true,
              company_invoice: {
                select: { invoice_number: true, total_aud: true },
              },
            },
          },
          processed_by: {
            select: { id: true, full_name: true },
          },
        },
      }),
      this.prisma.companyPayoutRecord.count({ where }),
      // Always count all statuses regardless of current filter
      this.prisma.companyPayoutRecord.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    const status_counts: Record<string, number> = {};
    for (const row of statusGroups) status_counts[row.status] = row._count._all;

    return { records, total, status_counts };
  }

  // ─── METHOD 2: processStripePayout ──────────────────────────────────────────
  // PATH A — company has an enabled Stripe Connect account.
  // Creates a Stripe Transfer for the net amount and marks the payout COMPLETED.

  /**
   * @param payoutRecordId - The CompanyPayoutRecord to process.
   * @param adminUserId - The platform admin authorising the transfer.
   * @returns Updated CompanyPayoutRecord.
   * @throws {AppError} INVALID_PAYOUT_METHOD if not STRIPE_CONNECT.
   * @throws {AppError} PAYOUT_NOT_PENDING if already processed.
   * @throws {AppError} STRIPE_ACCOUNT_NOT_ENABLED if connect account not ready.
   */
  async processStripePayout(
    payoutRecordId: string,
    adminUserId: string,
  ): Promise<CompanyPayoutRecord> {
    // 1. Load record with provider data
    const record = await this.prisma.companyPayoutRecord.findUnique({
      where: { id: payoutRecordId },
      include: {
        company: {
          select: {
            id: true,
            company_name: true,
            primary_admin_id: true,
            primary_admin: { select: { email: true } },
            completed_orders_count: true,
            stripe_connect_account: true,
          },
        },
        contractor_profile: {
          select: {
            id: true,
            user: { select: { id: true, email: true, full_name: true } },
            stripe_connect_account: true,
          },
        },
        order: {
          select: {
            id: true,
            company_invoice: { select: { invoice_number: true } },
          },
        },
      },
    });

    if (!record) throw new AppError('PAYOUT_RECORD_NOT_FOUND', 404, 'Payout record not found.');
    if (record.method !== 'STRIPE_CONNECT') {
      throw new AppError(
        'INVALID_PAYOUT_METHOD',
        422,
        'This action is for Stripe Connect payouts only. Use recordOfflinePayout for bank transfers.',
      );
    }
    if (record.status !== 'PENDING') {
      throw new AppError('PAYOUT_NOT_PENDING', 422, `Payout is already in status: ${record.status}.`);
    }

    // 2. Resolve Stripe Connect account for the provider
    const providerType = getProviderType(record);
    const connectAcct = providerType === 'company'
      ? record.company?.stripe_connect_account
      : record.contractor_profile?.stripe_connect_account;

    if (!connectAcct || connectAcct.status !== 'ENABLED') {
      throw new AppError(
        'STRIPE_ACCOUNT_NOT_ENABLED',
        422,
        'Provider does not have an enabled Stripe Connect account.',
      );
    }

    const invoiceNumber = record.order?.company_invoice?.invoice_number ?? 'N/A';
    const grossAud = Number(record.gross_amount_aud);
    const commissionPct =
      grossAud > 0
        ? ((Number(record.platform_fee_aud) / grossAud) * 100).toFixed(0)
        : '0';

    // 3. Create Stripe Transfer to provider's Connect account
    const transfer = await stripe.transfers.create({
      amount: audToCents(Number(record.net_amount_aud)),
      currency: 'aud',
      destination: connectAcct.stripe_account_id,
      description:
        `Payout for order ${record.order_id}. ` +
        `Invoice ${invoiceNumber}. ` +
        `Commission ${commissionPct}% deducted.`,
      metadata: {
        payout_record_id: payoutRecordId,
        order_id: record.order_id,
      },
    });

    const now = new Date();

    // 4. Update payout record
    const updated = await this.prisma.companyPayoutRecord.update({
      where: { id: payoutRecordId },
      data: {
        status: 'COMPLETED',
        transfer_reference: transfer.id,
        processed_by_id: adminUserId,
        completed_at: now,
      },
    });

    // 5. Complete the order + increment provider stats
    const orderUpdate = this.prisma.order.update({
      where: { id: record.order_id },
      data: { company_order_status: 'COMPLETED' },
    });
    if (providerType === 'company' && record.company_id) {
      await Promise.all([
        orderUpdate,
        this.prisma.consultingCompany.update({
          where: { id: record.company_id },
          data: { completed_orders_count: { increment: 1 } },
        }),
      ]);
    } else if (record.contractor_profile_id) {
      await Promise.all([
        orderUpdate,
        this.prisma.contractorProfile.update({
          where: { id: record.contractor_profile_id },
          data: { completed_orders_count: { increment: 1 } },
        }),
      ]);
    } else {
      await orderUpdate;
    }

    // 6. Audit
    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'PAYOUT_STRIPE_TRANSFER',
      entityType: 'CompanyPayoutRecord',
      entityId: payoutRecordId,
      metadata: {
        transfer_id: transfer.id,
        net_amount_aud: Number(record.net_amount_aud),
        commission_pct: commissionPct,
        processed_by: adminUserId,
        order_id: record.order_id,
      },
    });

    // 7. Notify provider
    const notifyEmail = providerType === 'company'
      ? record.company?.primary_admin?.email
      : record.contractor_profile?.user?.email;

    if (notifyEmail) {
      await this.emailQueue.add('payout-completed', {
        type: 'payout-completed',
        to: notifyEmail,
        order_id: record.order_id,
        net_amount_aud: Number(record.net_amount_aud),
        method: 'STRIPE_CONNECT',
        transfer_id: transfer.id,
      });
    }

    // 8. Generate commission invoice (best-effort)
    try {
      await this.generateAndStoreCommissionInvoice(payoutRecordId);
    } catch (err) {
      console.error('[payout] commission invoice generation failed:', err);
    }

    return updated;
  }

  // ─── METHOD 3: recordOfflinePayout ──────────────────────────────────────────
  // PATH B (AU bank) / PATH C (overseas SWIFT).
  // Platform admin confirms the offline transfer and records the reference.

  /**
   * @param payoutRecordId - The CompanyPayoutRecord to mark completed.
   * @param adminUserId - The platform admin recording the transfer.
   * @param data - Transfer reference, explanatory notes, and transfer date.
   * @returns Updated CompanyPayoutRecord.
   * @throws {AppError} INVALID_PAYOUT_METHOD if STRIPE_CONNECT (use processStripePayout).
   * @throws {AppError} PAYOUT_NOT_ACTIONABLE if already completed or failed.
   * @throws {AppError} INVALID_REFERENCE / NOTES_REQUIRED on validation failure.
   */
  async recordOfflinePayout(
    payoutRecordId: string,
    adminUserId: string,
    data: {
      reference: string;  // BSB transfer ref or SWIFT/IBAN ref
      notes: string;      // min 20 chars explaining the transfer
      transfer_date: Date;
    },
  ): Promise<CompanyPayoutRecord> {
    // 1. Load record with provider data
    const record = await this.prisma.companyPayoutRecord.findUnique({
      where: { id: payoutRecordId },
      include: {
        company: {
          select: {
            id: true,
            company_name: true,
            primary_admin_id: true,
            primary_admin: { select: { email: true } },
            completed_orders_count: true,
          },
        },
        contractor_profile: {
          select: {
            id: true,
            user: { select: { id: true, email: true } },
          },
        },
      },
    });

    if (!record) throw new AppError('PAYOUT_RECORD_NOT_FOUND', 404, 'Payout record not found.');
    if (record.method === 'STRIPE_CONNECT') {
      throw new AppError(
        'INVALID_PAYOUT_METHOD',
        422,
        'Use processStripePayout for Stripe Connect payouts.',
      );
    }
    if (!(['PENDING', 'PROCESSING'] as const).includes(record.status as 'PENDING' | 'PROCESSING')) {
      throw new AppError('PAYOUT_NOT_ACTIONABLE', 422, `Payout is already in status: ${record.status}.`);
    }

    // 2. Validate inputs
    if (!data.reference || data.reference.trim().length < 3) {
      throw new AppError('INVALID_REFERENCE', 422, 'Transfer reference must be at least 3 characters.');
    }
    if (!data.notes || data.notes.trim().length < 20) {
      throw new AppError(
        'NOTES_REQUIRED',
        422,
        'Notes must be at least 20 characters describing the transfer.',
      );
    }

    // 3. Mark payout completed
    const updated = await this.prisma.companyPayoutRecord.update({
      where: { id: payoutRecordId },
      data: {
        status: 'COMPLETED',
        transfer_reference: data.reference.trim(),
        admin_notes: data.notes.trim(),
        processed_by_id: adminUserId,
        completed_at: data.transfer_date,
      },
    });

    // 4. Complete the order + increment provider stats
    const providerType = getProviderType(record);
    const orderUpdate = this.prisma.order.update({
      where: { id: record.order_id },
      data: { company_order_status: 'COMPLETED' },
    });
    if (providerType === 'company' && record.company_id) {
      await Promise.all([
        orderUpdate,
        this.prisma.consultingCompany.update({
          where: { id: record.company_id },
          data: { completed_orders_count: { increment: 1 } },
        }),
      ]);
    } else if (record.contractor_profile_id) {
      await Promise.all([
        orderUpdate,
        this.prisma.contractorProfile.update({
          where: { id: record.contractor_profile_id },
          data: { completed_orders_count: { increment: 1 } },
        }),
      ]);
    } else {
      await orderUpdate;
    }

    // 5. Audit
    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'PAYOUT_OFFLINE_RECORDED',
      entityType: 'CompanyPayoutRecord',
      entityId: payoutRecordId,
      metadata: {
        method: record.method,
        reference: data.reference.trim(),
        net_amount_aud: Number(record.net_amount_aud),
        transfer_date: data.transfer_date.toISOString(),
        processed_by: adminUserId,
        order_id: record.order_id,
      },
    });

    // 6. Notify provider
    const notifyEmail = providerType === 'company'
      ? record.company?.primary_admin?.email
      : record.contractor_profile?.user?.email;

    if (notifyEmail) {
      await this.emailQueue.add('payout-completed', {
        type: 'payout-completed',
        to: notifyEmail,
        order_id: record.order_id,
        net_amount_aud: Number(record.net_amount_aud),
        method: record.method,
        reference: data.reference.trim(),
        notes: data.notes.trim(),
      });
    }

    // 7. Generate commission invoice (best-effort — don't fail the payout if PDF fails)
    try {
      await this.generateAndStoreCommissionInvoice(payoutRecordId);
    } catch (err) {
      console.error('[payout] commission invoice generation failed:', err);
    }

    return updated;
  }

  // ─── METHOD 4: updatePayoutPreference ───────────────────────────────────────
  // Upserts the company's preferred payout method and banking details.
  // Clears all payment fields on method change to avoid stale data.
  // Triggers a platform admin verification notification on every update.

  /**
   * @param companyId - The consulting company to update.
   * @param adminUserId - Must be a COMPANY_ADMIN of the company.
   * @param data - New payout method and relevant banking details.
   * @returns The upserted CompanyPayoutPreference.
   * @throws {AppError} INSUFFICIENT_COMPANY_ROLE if not COMPANY_ADMIN.
   * @throws {AppError} VALIDATION_ERROR on missing required fields per method.
   */
  async updatePayoutPreference(
    companyId: string,
    adminUserId: string,
    data: CompanyPayoutPreferenceInput,
  ): Promise<CompanyPayoutPreference> {
    // 1. Verify COMPANY_ADMIN role
    const membership = await this.prisma.companyMember.findFirst({
      where: { company_id: companyId, user_id: adminUserId, status: 'ACTIVE' },
      select: { role: true },
    });
    if (!membership || membership.role !== 'COMPANY_ADMIN') {
      throw new AppError('INSUFFICIENT_COMPANY_ROLE', 403, 'Only Company Admins can update payout preferences.');
    }

    // 2. Validate required fields per method
    if (data.method === 'STRIPE_CONNECT') {
      if (!data.stripe_account_id?.trim()) {
        throw new AppError('VALIDATION_ERROR', 422, 'stripe_account_id is required for Stripe Connect payouts.');
      }
    } else if (data.method === 'AU_BANK') {
      if (!data.bsb || !/^\d{6}$/.test(data.bsb)) {
        throw new AppError('VALIDATION_ERROR', 422, 'BSB must be exactly 6 digits (e.g. 062000).');
      }
      if (!data.account_number?.trim()) {
        throw new AppError('VALIDATION_ERROR', 422, 'account_number is required for AU bank payouts.');
      }
      if (!data.account_name?.trim()) {
        throw new AppError('VALIDATION_ERROR', 422, 'account_name (account holder) is required for AU bank payouts.');
      }
      if (!data.bank_name?.trim()) {
        throw new AppError('VALIDATION_ERROR', 422, 'bank_name is required for AU bank payouts.');
      }
    } else if (data.method === 'OVERSEAS_BANK') {
      if (!data.swift_code?.trim()) {
        throw new AppError('VALIDATION_ERROR', 422, 'swift_code is required for overseas bank payouts.');
      }
      if (!data.account_name?.trim()) {
        throw new AppError('VALIDATION_ERROR', 422, 'account_name (account holder name) is required.');
      }
      if (!data.bank_name?.trim()) {
        throw new AppError('VALIDATION_ERROR', 422, 'bank_name is required for overseas bank payouts.');
      }
      if (!data.bank_address?.trim()) {
        throw new AppError(
          'VALIDATION_ERROR',
          422,
          'bank_address (including country) is required for overseas bank payouts.',
        );
      }
    }

    // 3. Upsert — clear all payment fields on update to prevent stale data
    const preference = await this.prisma.companyPayoutPreference.upsert({
      where: { company_id: companyId },
      create: {
        company_id: companyId,
        method: data.method,
        stripe_account_id: data.stripe_account_id?.trim() ?? null,
        bsb: data.bsb ?? null,
        account_number: data.account_number?.trim() ?? null,
        account_name: data.account_name?.trim() ?? null,
        bank_name: data.bank_name?.trim() ?? null,
        swift_code: data.swift_code?.trim() ?? null,
        iban: data.iban?.trim() ?? null,
        bank_address: data.bank_address?.trim() ?? null,
      },
      update: {
        method: data.method,
        // Always clear all fields then set the relevant ones to avoid stale data
        stripe_account_id: data.stripe_account_id?.trim() ?? null,
        bsb: data.bsb ?? null,
        account_number: data.account_number?.trim() ?? null,
        account_name: data.account_name?.trim() ?? null,
        bank_name: data.bank_name?.trim() ?? null,
        swift_code: data.swift_code?.trim() ?? null,
        iban: data.iban?.trim() ?? null,
        bank_address: data.bank_address?.trim() ?? null,
      },
    });

    // 4. Audit
    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'PAYOUT_PREFERENCE_UPDATED',
      entityType: 'CompanyPayoutPreference',
      entityId: preference.id,
      metadata: {
        company_id: companyId,
        method: data.method,
        updated_by: adminUserId,
      },
    });

    // 5. Notify platform admins — bank detail changes require re-verification
    const platformAdmins = await this.prisma.user.findMany({
      where: { account_type: 'PLATFORM_ADMIN' },
      select: { email: true },
    });

    for (const admin of platformAdmins) {
      await this.emailQueue.add('payout-preference-updated', {
        type: 'payout-preference-updated',
        to: admin.email,
        company_id: companyId,
        method: data.method,
        admin_url: emailUrls.adminCompany(companyId),
      });
    }

    return preference;
  }

  // ─── METHOD 5: createPayoutRecordFromOrder ────────────────────────────────────
  // Creates a PENDING payout record for a PAYMENT_RECEIVED order that somehow
  // lost its payout record (Stripe webhook failure, manual test data, etc.).

  async createPayoutRecordFromOrder(orderId: string): Promise<CompanyPayoutRecord> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        company_invoice: { select: { id: true, amount_aud: true, total_aud: true } },
        company: { select: { id: true, completed_orders_count: true, payout_preference: { select: { method: true } } } },
        contractor_profile: { select: { id: true, completed_orders_count: true } },
      },
    });

    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.company_order_status !== 'PAYMENT_RECEIVED') {
      throw new AppError('INVALID_ORDER_STATUS', 422, 'Order must be in PAYMENT_RECEIVED status.');
    }
    const existing = await this.prisma.companyPayoutRecord.findUnique({ where: { order_id: orderId } });
    if (existing) throw new AppError('PAYOUT_RECORD_EXISTS', 409, 'A payout record already exists for this order.');

    const inv = order.company_invoice;
    if (!inv) throw new AppError('INVOICE_NOT_FOUND', 404, 'Order has no associated invoice.');

    const gross = Number(inv.amount_aud ?? inv.total_aud);
    const isCompanyOrder = !!order.company_id;
    const completedCount = isCompanyOrder
      ? (order.company?.completed_orders_count ?? 0)
      : (order.contractor_profile?.completed_orders_count ?? 0);
    const { commission_amount_aud, commission_gst_aud, net_amount_aud } = calculatePayout(gross, completedCount);
    const payoutMethod = isCompanyOrder
      ? (order.company?.payout_preference?.method ?? 'AU_BANK')
      : 'AU_BANK';

    return this.prisma.companyPayoutRecord.create({
      data: {
        order_id: orderId,
        ...(isCompanyOrder ? { company_id: order.company_id! } : { contractor_profile_id: order.contractor_profile_id! }),
        gross_amount_aud: gross,
        platform_fee_aud: commission_amount_aud,
        commission_gst_aud,
        net_amount_aud,
        method: payoutMethod,
        status: 'PENDING',
      },
    });
  }

  // ─── METHOD 6: generateAndStoreCommissionInvoice ──────────────────────────────
  // Generates a platform commission invoice PDF, uploads to Blob, and stores
  // the path + number on the CompanyPayoutRecord. Idempotent — skips if exists.

  async generateAndStoreCommissionInvoice(payoutRecordId: string): Promise<{ blob_path: string; invoice_number: string }> {
    const record = await this.prisma.companyPayoutRecord.findUnique({
      where: { id: payoutRecordId },
      include: {
        company: {
          select: {
            id: true, company_name: true, abn: true,
            primary_admin: { select: { full_name: true, email: true } },
          },
        },
        contractor_profile: {
          select: {
            id: true, legal_name: true,
            user: { select: { full_name: true, email: true, abn: true } },
          },
        },
        order: {
          select: {
            id: true,
            company_invoice: { select: { invoice_number: true } },
          },
        },
      },
    });

    if (!record) throw new AppError('PAYOUT_RECORD_NOT_FOUND', 404);

    // Idempotent
    if (record.commission_invoice_blob_path && record.commission_invoice_number) {
      return { blob_path: record.commission_invoice_blob_path, invoice_number: record.commission_invoice_number };
    }

    // Generate invoice number from sequence
    const year = new Date().getFullYear();
    const seq = await this.prisma.documentSequence.upsert({
      where: { type: 'COMM' },
      create: { type: 'COMM', year, last_value: 1 },
      update: { last_value: { increment: 1 } },
    });
    const invoiceNumber = `COMM-${year}-${String(seq.last_value).padStart(6, '0')}`;

    // Resolve provider details
    const isCompany = !!record.company_id;
    const providerName = isCompany
      ? (record.company?.company_name ?? 'Provider')
      : (record.contractor_profile?.legal_name ?? record.contractor_profile?.user?.full_name ?? 'Provider');
    const providerAbn = isCompany
      ? (record.company?.abn ?? null)
      : (record.contractor_profile?.user?.abn ?? null);
    const orderInvoiceNumber = record.order?.company_invoice?.invoice_number ?? record.order_id;

    const gross = Number(record.gross_amount_aud);
    const commission = Number(record.platform_fee_aud);
    const net = Number(record.net_amount_aud);
    const commissionRate = gross > 0 ? ((commission / gross) * 100).toFixed(0) : '0';
    // Read GST from the record — guaranteed to match what was deducted at payout creation.
    // Falls back to a fresh 10% calc for legacy rows where the field defaults to 0.
    const gstOnCommission = Number(record.commission_gst_aud) > 0
      ? Number(record.commission_gst_aud)
      : Math.round(commission * 10) / 100;
    const totalCommissionCharge = Math.round((commission + gstOnCommission) * 100) / 100;

    const pdfBuffer = await generateCommissionPdf({
      invoiceNumber,
      issueDate: record.completed_at ?? new Date(),
      orderInvoiceNumber,
      orderId: record.order_id,
      providerName,
      providerAbn,
      gross,
      commissionRate: Number(commissionRate),
      commission,
      gstOnCommission,
      totalCommissionCharge,
      net,
    });

    const blobPath = `commission-invoices/${payoutRecordId}/${invoiceNumber}.pdf`;
    await uploadToBlob(blobPath, pdfBuffer, 'application/pdf');

    await this.prisma.companyPayoutRecord.update({
      where: { id: payoutRecordId },
      data: { commission_invoice_blob_path: blobPath, commission_invoice_number: invoiceNumber },
    });

    return { blob_path: blobPath, invoice_number: invoiceNumber };
  }
}

// ─── generateCommissionPdf ────────────────────────────────────────────────────

interface CommissionPdfData {
  invoiceNumber: string;
  issueDate: Date;
  orderInvoiceNumber: string;
  orderId: string;
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
    const col1 = 50, col2 = 320;

    // Header
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#0f172a').text('Waveful Digital Platforms', col1, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#64748b')
      .text('Platform Commission Invoice', col1, 78)
      .text('ABN: 00 000 000 000  ·  admin@onys.online', col1, 91);

    // Invoice meta (top right)
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a')
      .text('Invoice Number', col2, 50)
      .text('Issue Date', col2, 66)
      .text('Order Reference', col2, 82);
    doc.fontSize(10).font('Helvetica').fillColor('#0f172a')
      .text(data.invoiceNumber, col2 + 100, 50, { align: 'right', width: 150 })
      .text(fmtDate(data.issueDate), col2 + 100, 66, { align: 'right', width: 150 })
      .text(data.orderInvoiceNumber, col2 + 100, 82, { align: 'right', width: 150 });

    // Divider
    doc.moveTo(50, 112).lineTo(545, 112).strokeColor('#e2e8f0').stroke();

    // Billed To
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748b').text('BILLED TO', col1, 124);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text(data.providerName, col1, 138);
    if (data.providerAbn) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(`ABN: ${data.providerAbn}`, col1, 154);
    }

    // Description table header
    const tableY = 195;
    doc.rect(50, tableY, 495, 22).fill('#f8fafc');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b')
      .text('DESCRIPTION', 58, tableY + 7)
      .text('AMOUNT', 490, tableY + 7, { align: 'right', width: 50 });

    // Rows
    const rows: Array<[string, number]> = [
      [`Platform commission on invoice ${data.orderInvoiceNumber} (${data.commissionRate}% of ${fmt(data.gross)})`, data.commission],
      ['GST on commission (10%)', data.gstOnCommission],
    ];
    let rowY = tableY + 30;
    for (const [label, amount] of rows) {
      doc.fontSize(10).font('Helvetica').fillColor('#0f172a')
        .text(label, 58, rowY, { width: 380 })
        .text(fmt(amount), 490, rowY, { align: 'right', width: 50 });
      rowY += 20;
      doc.moveTo(50, rowY + 2).lineTo(545, rowY + 2).strokeColor('#f1f5f9').stroke();
      rowY += 10;
    }

    // Totals
    rowY += 8;
    doc.moveTo(320, rowY).lineTo(545, rowY).strokeColor('#e2e8f0').stroke();
    rowY += 8;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a')
      .text('Total Commission Charge', 320, rowY)
      .text(fmt(data.totalCommissionCharge), 490, rowY, { align: 'right', width: 50 });

    rowY += 30;
    doc.rect(50, rowY, 495, 38).fill('#f0fdf4');
    doc.fontSize(10).font('Helvetica').fillColor('#166534')
      .text('Net Payout to You', 58, rowY + 12)
      .fontSize(13).font('Helvetica-Bold')
      .text(fmt(data.net), 490, rowY + 10, { align: 'right', width: 50 });

    // Footer
    // NOTE: This commission-invoice PDF path is legacy — under the
    // current platform model (subscription-only, zero commission on
    // engagements) it should not be invoked for new engagements. The
    // disclaimer below is kept honest in case the path is still
    // reachable for legacy data.
    doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
      .text('Issued by Waveful Digital Platforms for legacy platform-fee accounting only. The current TalvexIT platform is subscription-only with zero commission on engagements and does not act as a billing or collection agent. GST applies to platform-fee components where the issuer is GST-registered.', 50, 720, { width: 495 })
      .text('Questions? Contact admin@onys.online', 50, 740, { width: 495 });

    doc.end();
  });
}
