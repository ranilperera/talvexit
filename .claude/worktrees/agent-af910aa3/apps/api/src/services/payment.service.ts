import type { MilestoneRelease, PayoutRecord, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { InitiateConnectInput } from '@onys/shared';
import { AppError } from '../lib/errors.js';
import { writeAudit } from '../utils/audit.js';
import { calculatePayout } from '../utils/commission.js';
import { generateInvoicePdf, generateInvoiceNumber } from '../utils/invoice-generator.js';
import type { InvoiceData } from '../utils/invoice-generator.js';
import { uploadToBlob, generateSasUrl } from '../utils/blob-storage.js';
import { isCurrentlyValid } from './insurance-tier.service.js';
import {
  stripe,
  createPaymentIntent as stripeCreatePaymentIntent,
  createTransfer,
  createConnectAccount,
  createOnboardingLink,
} from './stripe.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

// ─── PaymentService ───────────────────────────────────────────────────────────

export class PaymentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── METHOD 1: createPaymentIntent ─────────────────────────────────────────

  async createPaymentIntent(
    orderId: string,
    customerId: string,
    meta: { ip: string; userAgent: string },
  ): Promise<{
    client_secret: string;
    payment_intent_id: string;
    amount_aud: number;
    tax_amount_aud: number;
    total_amount_aud: number;
    currency: 'aud';
  }> {
    // 1. Load order + verify ownership
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        contractor_profile: {
          include: {
            insurance_certificates: true,
            stripe_connect_account: true,
          },
        },
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);

    // 2. Status check
    if (order.status !== 'SCOPED' && order.status !== 'ACCEPTED') {
      throw new AppError(
        'ORDER_NOT_PAYABLE',
        422,
        `Cannot create payment for order in ${order.status} status`,
      );
    }

    // 3. Contractor Connect account check
    const connectAccount = order.contractor_profile?.stripe_connect_account;
    if (!connectAccount || connectAccount.status !== 'ENABLED') {
      throw new AppError(
        'CONTRACTOR_PAYOUTS_NOT_ENABLED',
        402,
        'This expert has not completed Stripe Connect setup. Payment cannot proceed until they enable payouts.',
      );
    }

    // 4. Insurance validity check
    const certs = order.contractor_profile?.insurance_certificates ?? [];
    if (!isCurrentlyValid(certs)) {
      throw new AppError(
        'INSURANCE_EXPIRED',
        402,
        'Contractor insurance has expired. Cannot process payment.',
      );
    }

    // 5. Idempotency — reuse existing PI if still actionable
    if (order.stripe_payment_intent_id) {
      const existing = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
      if (
        existing.status === 'requires_payment_method' ||
        existing.status === 'requires_confirmation'
      ) {
        return {
          client_secret: existing.client_secret!,
          payment_intent_id: existing.id,
          amount_aud: Number(order.price_aud),
          tax_amount_aud: Number(order.tax_amount_aud),
          total_amount_aud: Number(order.total_amount_aud),
          currency: 'aud',
        };
      }
    }

    // 6. Create Stripe PaymentIntent
    const pi = await stripeCreatePaymentIntent({
      amountAud: Number(order.total_amount_aud),
      orderId: order.id,
      customerId,
      contractorStripeAccountId: connectAccount.stripe_account_id,
      currency: 'aud',
    });

    // 7. Persist payment_intent_id on order
    await this.prisma.order.update({
      where: { id: orderId },
      data: { stripe_payment_intent_id: pi.id },
    });

    // 8. Audit
    await writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'PAYMENT_INTENT_CREATED',
      entityType: 'Order',
      entityId: orderId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        payment_intent_id: pi.id,
        amount_aud: Number(order.total_amount_aud),
      },
    });

    // 9. Return
    return {
      client_secret: pi.client_secret!,
      payment_intent_id: pi.id,
      amount_aud: Number(order.price_aud),
      tax_amount_aud: Number(order.tax_amount_aud),
      total_amount_aud: Number(order.total_amount_aud),
      currency: 'aud',
    };
  }

  // ─── METHOD 2: initiateContractorPayout ────────────────────────────────────

  async initiateContractorPayout(orderId: string): Promise<PayoutRecord> {
    // 1. Load order
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { id: true, full_name: true, email: true } },
        contractor_user: { select: { id: true, full_name: true, email: true } },
        contractor_profile: {
          include: {
            stripe_connect_account: true,
          },
        },
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.status !== 'COMPLETED') {
      throw new AppError('ORDER_NOT_COMPLETED', 422, 'Payout can only be initiated for COMPLETED orders');
    }

    // 2. Idempotency check
    const existing = await this.prisma.payoutRecord.findUnique({
      where: { order_id: orderId },
    });
    if (existing && (existing.status === 'INITIATED' || existing.status === 'COMPLETED')) {
      console.warn(`Payout already initiated for order ${orderId}`);
      return existing;
    }

    // 3. Calculate commission
    const completedCount = order.contractor_profile?.completed_orders_count ?? 0;
    const payout = calculatePayout(Number(order.price_aud), completedCount);

    // 4. Create PayoutRecord in PENDING
    const record = await this.prisma.payoutRecord.create({
      data: {
        order_id: orderId,
        contractor_profile_id: order.contractor_profile_id!,
        gross_amount_aud: payout.gross_amount_aud,
        commission_rate: payout.commission_rate,
        commission_amount_aud: payout.commission_amount_aud,
        net_amount_aud: payout.net_amount_aud,
        completed_orders_at_time: completedCount,
        status: 'PENDING',
      },
    });

    // 5. Create Stripe Transfer
    const connectAccount = order.contractor_profile?.stripe_connect_account;
    if (!connectAccount?.stripe_account_id) {
      throw new Error('Contractor has no Stripe Connect account');
    }
    const transfer = await createTransfer({
      netAmountAud: payout.net_amount_aud,
      destination: connectAccount.stripe_account_id,
      orderId,
      payoutRecordId: record.id,
      currency: 'aud',
    });

    // 6. Update PayoutRecord → INITIATED
    const now = new Date();
    const updatedRecord = await this.prisma.payoutRecord.update({
      where: { id: record.id },
      data: {
        stripe_transfer_id: transfer.id,
        stripe_transfer_status: transfer.object ?? 'pending',
        status: 'INITIATED',
        initiated_at: now,
      },
    });

    // 7. Update Order
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        payout_status: 'INITIATED',
        stripe_transfer_id: transfer.id,
      },
    });

    // 8. Generate and upload invoice PDF
    const invoiceData = this.buildInvoiceData(order, updatedRecord);
    const pdfBuffer = await generateInvoicePdf(invoiceData);
    const blobPath = `invoices/${orderId}.pdf`;
    await uploadToBlob(blobPath, pdfBuffer, 'application/pdf');

    await this.prisma.payoutRecord.update({
      where: { id: record.id },
      data: {
        invoice_blob_path: blobPath,
        invoice_generated_at: new Date(),
      },
    });
    await this.prisma.order.update({
      where: { id: orderId },
      data: { invoice_blob_path: blobPath },
    });

    // 9. Audit
    await writeAudit(this.prisma, {
      ...(order.contractor_user?.id && { actorId: order.contractor_user.id }),
      actionType: 'PAYOUT_INITIATED',
      entityType: 'Order',
      entityId: orderId,
      metadata: {
        transfer_id: transfer.id,
        net_amount_aud: payout.net_amount_aud,
        commission_rate: payout.commission_rate,
      },
    });

    // 10. Queue email to contractor
    if (order.contractor_user?.email) {
      await this.emailQueue.add('payout-initiated', {
        type: 'payout-initiated',
        to: order.contractor_user.email,
        order_id: orderId,
        net_amount_aud: payout.net_amount_aud,
        commission_rate: payout.commission_rate * 100,
        estimated_arrival: '1-2 business days',
      });
    }

    // Return final state
    const final = await this.prisma.payoutRecord.findUniqueOrThrow({
      where: { id: record.id },
    });
    return final;
  }

  // ─── HELPER: buildInvoiceData ───────────────────────────────────────────────

  private buildInvoiceData(
    order: {
      id: string;
      scope_snapshot: unknown;
      price_aud: Prisma.Decimal;
      tax_amount_aud: Prisma.Decimal;
      total_amount_aud: Prisma.Decimal;
      completed_at: Date | null;
      customer: { full_name: string; email: string };
      contractor_user: { full_name: string; email: string } | null;
      contractor_profile: ({ abn?: string | null } & Record<string, unknown>) | null;
    },
    record: PayoutRecord,
  ): InvoiceData {
    const scope = order.scope_snapshot as Record<string, unknown>;
    return {
      invoice_number: generateInvoiceNumber(order.id),
      order_id: order.id,
      issued_date: new Date(),
      customer_name: order.customer.full_name,
      customer_email: order.customer.email,
      contractor_name: order.contractor_user?.full_name ?? '',
      contractor_email: order.contractor_user?.email ?? '',
      ...(order.contractor_profile?.abn && { contractor_abn: order.contractor_profile.abn }),
      task_title: String(scope.title ?? ''),
      domain: String(scope.domain ?? ''),
      scope_summary: ((scope.in_scope as string[]) ?? []).slice(0, 4),
      completed_at: order.completed_at ?? new Date(),
      price_aud: Number(order.price_aud),
      tax_amount_aud: Number(order.tax_amount_aud),
      total_amount_aud: Number(order.total_amount_aud),
      commission_rate: Number(record.commission_rate),
      net_payout_aud: Number(record.net_amount_aud),
      platform_name: 'onys.online',
      platform_abn: process.env.PLATFORM_ABN ?? '00 000 000 000',
      platform_address: process.env.PLATFORM_ADDRESS ?? 'onys.online, Australia',
    };
  }

  // ─── METHOD 3: approveMilestone ─────────────────────────────────────────────

  async approveMilestone(
    orderId: string,
    milestoneSequence: number,
    customerId: string,
  ): Promise<MilestoneRelease> {
    // 1. Load order + verify ownership
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        milestone_releases: true,
        contractor_profile: {
          include: {
            stripe_connect_account: true,
          },
        },
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);

    // 2. Status check
    if (order.status !== 'IN_PROGRESS') {
      throw new AppError('ORDER_NOT_IN_PROGRESS', 422);
    }

    // 3. Find milestone in scope snapshot
    const scope = order.scope_snapshot as Record<string, unknown>;
    const milestones = (scope.milestones as Array<{ sequence: number; name: string; percentage_of_total: number }>) ?? [];
    const milestone = milestones.find((m) => m.sequence === milestoneSequence);
    if (!milestone) throw new AppError('MILESTONE_NOT_FOUND', 404);

    // 4. Check no existing release
    const existingRelease = order.milestone_releases.find(
      (r) => r.milestone_sequence === milestoneSequence,
    );
    if (existingRelease && existingRelease.status !== 'PENDING') {
      throw new AppError('MILESTONE_ALREADY_RELEASED', 409);
    }

    // 5. Calculate partial payout
    const completedCount = order.contractor_profile?.completed_orders_count ?? 0;
    const milestoneGross = Number(order.price_aud) * (milestone.percentage_of_total / 100);
    const payout = calculatePayout(milestoneGross, completedCount);

    // 6. Create MilestoneRelease in PENDING
    const now = new Date();
    const release = await this.prisma.milestoneRelease.create({
      data: {
        order_id: orderId,
        milestone_sequence: milestoneSequence,
        milestone_name: milestone.name,
        percentage_of_total: milestone.percentage_of_total,
        gross_amount_aud: payout.gross_amount_aud,
        net_amount_aud: payout.net_amount_aud,
        commission_amount_aud: payout.commission_amount_aud,
        approved_by_user_id: customerId,
        approved_at: now,
        status: 'PENDING',
      },
    });

    // 7. Create Stripe Transfer
    const connectAccount = order.contractor_profile?.stripe_connect_account;
    if (!connectAccount?.stripe_account_id) {
      throw new Error('Contractor has no Stripe Connect account');
    }
    const transfer = await createTransfer({
      netAmountAud: payout.net_amount_aud,
      destination: connectAccount.stripe_account_id,
      orderId,
      payoutRecordId: release.id,
      currency: 'aud',
    });

    // 8. Update MilestoneRelease → TRANSFERRED
    const updated = await this.prisma.milestoneRelease.update({
      where: { id: release.id },
      data: {
        stripe_transfer_id: transfer.id,
        status: 'TRANSFERRED',
        transferred_at: new Date(),
      },
    });

    // 9. Audit
    await writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'MILESTONE_APPROVED',
      entityType: 'Order',
      entityId: orderId,
      metadata: {
        milestone_sequence: milestoneSequence,
        net_amount_aud: payout.net_amount_aud,
      },
    });

    return updated;
  }

  // ─── METHOD 4: initiateConnectOnboarding ───────────────────────────────────

  async initiateConnectOnboarding(
    contractorUserId: string,
    data: InitiateConnectInput,
  ): Promise<{ onboarding_url: string; stripe_account_id: string }> {
    // 1. Find contractor profile
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { user_id: contractorUserId },
      include: {
        user: { select: { id: true, email: true } },
        stripe_connect_account: true,
      },
    });
    if (!profile) throw new AppError('NO_CONTRACTOR_PROFILE', 403);

    // 2. Check if account already exists
    const existing = profile.stripe_connect_account;
    if (existing) {
      if (existing.status === 'ENABLED') {
        throw new AppError(
          'CONNECT_ALREADY_ENABLED',
          409,
          'Stripe Connect is already enabled for your account.',
        );
      }
      // Re-issue onboarding link for existing account
      const link = await createOnboardingLink({
        accountId: existing.stripe_account_id,
        returnUrl: data.return_url,
        refreshUrl: data.refresh_url,
      });
      await this.prisma.stripeConnectAccount.update({
        where: { id: existing.id },
        data: {
          onboarding_url: link.url,
          onboarding_url_expires_at: new Date(link.expires_at * 1000),
        },
      });
      return { onboarding_url: link.url, stripe_account_id: existing.stripe_account_id };
    }

    // 3. Create new Stripe account
    const account = await createConnectAccount({
      email: profile.user.email,
      country: data.country,
    });

    // 4. Create StripeConnectAccount record
    const connectRecord = await this.prisma.stripeConnectAccount.create({
      data: {
        contractor_profile_id: profile.id,
        stripe_account_id: account.id,
        status: 'PENDING',
        country: data.country,
      },
    });

    // 5. Create onboarding link
    const link = await createOnboardingLink({
      accountId: account.id,
      returnUrl: data.return_url,
      refreshUrl: data.refresh_url,
    });
    await this.prisma.stripeConnectAccount.update({
      where: { id: connectRecord.id },
      data: {
        onboarding_url: link.url,
        onboarding_url_expires_at: new Date(link.expires_at * 1000),
      },
    });

    // 6. Audit
    await writeAudit(this.prisma, {
      actorId: contractorUserId,
      actionType: 'CONNECT_ONBOARDING_INITIATED',
      entityType: 'ContractorProfile',
      entityId: profile.id,
      metadata: { stripe_account_id: account.id },
    });

    // 7. Return
    return { onboarding_url: link.url, stripe_account_id: account.id };
  }

  // ─── METHOD 5: getConnectStatus ─────────────────────────────────────────────

  async getConnectStatus(contractorUserId: string): Promise<{
    status: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    requirements_due: string[];
    onboarding_url: string | null;
  }> {
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { user_id: contractorUserId },
      include: { stripe_connect_account: true },
    });
    if (!profile) throw new AppError('NO_CONTRACTOR_PROFILE', 403);

    const account = profile.stripe_connect_account;
    if (!account) {
      return {
        status: 'PENDING',
        charges_enabled: false,
        payouts_enabled: false,
        requirements_due: [],
        onboarding_url: null,
      };
    }

    return {
      status: account.status,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      requirements_due: account.requirements_due,
      onboarding_url: account.onboarding_url ?? null,
    };
  }

  // ─── METHOD 6: getPayoutHistory ─────────────────────────────────────────────

  async getPayoutHistory(contractorUserId: string): Promise<PayoutRecord[]> {
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { user_id: contractorUserId },
      select: { id: true },
    });
    if (!profile) throw new AppError('NO_CONTRACTOR_PROFILE', 403);

    return this.prisma.payoutRecord.findMany({
      where: { contractor_profile_id: profile.id },
      include: {
        order: {
          select: { id: true, scope_snapshot: true, completed_at: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── METHOD 7: getInvoiceSasUrl ─────────────────────────────────────────────

  async getInvoiceSasUrl(
    orderId: string,
    requestingUserId: string,
  ): Promise<{ url: string; expires_at: Date }> {
    // 1. Verify access
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        contractor_profile: { select: { user_id: true } },
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    const isCustomer = order.customer_id === requestingUserId;
    const isContractor = order.contractor_profile?.user_id === requestingUserId;
    if (!isCustomer && !isContractor) throw new AppError('FORBIDDEN', 403);

    // 2. Find PayoutRecord
    const record = await this.prisma.payoutRecord.findUnique({
      where: { order_id: orderId },
    });

    // 3. Check invoice is ready
    if (!record?.invoice_blob_path) {
      throw new AppError(
        'INVOICE_NOT_READY',
        404,
        'Invoice is not yet generated. It is created on order completion.',
      );
    }

    // 4. Generate 60-minute SAS URL
    const url = await generateSasUrl(record.invoice_blob_path, 60);
    const expires_at = new Date(Date.now() + 60 * 60 * 1000);

    return { url, expires_at };
  }
}
