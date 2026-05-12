import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import type {
  FileDisputeInput,
  AddSubmissionInput,
  AssignDisputeInput,
  AppointArbitratorInput,
  DeterminationInput,
} from '@onys/shared';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';
import { transitionOrder } from './order-state-machine.service.js';
import { calculatePayout } from '../utils/commission.js';
import { createTransfer, refundPaymentIntent } from './stripe.service.js';

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

type RequestMeta = { ip: string; userAgent: string };

export class DisputeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── fileDispute ──────────────────────────────────────────────────────────

  async fileDispute(orderId: string, raisingUserId: string, data: FileDisputeInput, meta: RequestMeta) {
    // 1. Find order
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { id: true, full_name: true, email: true } },
        contractor_user: { select: { id: true, full_name: true, email: true } },
        dispute: { select: { id: true } },
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);

    // 2. Verify requesting user is party
    const isCustomer = order.customer_id === raisingUserId;
    const isContractor = order.contractor_user_id === raisingUserId;
    if (!isCustomer && !isContractor) throw new AppError('FORBIDDEN', 403);

    // 3. Check order status
    const disputableStatuses = ['IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED'];
    if (!disputableStatuses.includes(order.status)) {
      throw new AppError(
        'DISPUTE_NOT_ALLOWED',
        422,
        `Cannot file dispute on order in ${order.status} status. Disputes can be filed during: ${disputableStatuses.join(', ')}`,
      );
    }

    // 4. Check no existing dispute
    if (order.dispute) {
      throw new AppError('DISPUTE_EXISTS', 409, 'A dispute already exists for this order.');
    }

    const now = new Date();
    const submissionWindowEnds = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    // 5. Transaction: transition order + create dispute
    const [updatedOrder, dispute] = await this.prisma.$transaction(async (tx) => {
      const transitioned = await transitionOrder(
        tx as unknown as PrismaClient,
        orderId,
        'DISPUTED',
        raisingUserId,
      );

      const created = await tx.dispute.create({
        data: {
          order_id: orderId,
          raised_by_user_id: raisingUserId,
          grounds: data.grounds,
          description: data.description,
          evidence_blob_paths: data.evidence_blob_paths,
          status: 'OPEN',
          submission_window_ends_at: submissionWindowEnds,
        },
      });

      return [transitioned, created] as const;
    });

    // 6. Audit
    void writeAudit(this.prisma, {
      actorId: raisingUserId,
      actionType: 'DISPUTE_FILED',
      entityType: 'Order',
      entityId: orderId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        grounds: data.grounds,
        raised_by: raisingUserId,
        evidence_count: data.evidence_blob_paths.length,
      },
    });

    // 7. Admin alert (priority 1 = highest)
    const raisingUser = isCustomer ? order.customer : order.contractor_user;
    const scopeSnapshot = order.scope_snapshot as Record<string, unknown>;
    void this.emailQueue.add(
      'dispute-admin-alert',
      {
        type: 'dispute-filed-admin-alert',
        order_id: orderId,
        grounds: data.grounds,
        raised_by_name: raisingUser?.full_name,
        raised_by_role: isCustomer ? 'customer' : 'contractor',
        order_title: scopeSnapshot.title,
        admin_url: `${process.env.FRONTEND_URL}/admin/disputes/${dispute.id}`,
      },
      { priority: 1 },
    );

    // 8. Notify other party (priority 1)
    const otherEmail = isCustomer ? order.contractor_user?.email : order.customer?.email;
    if (otherEmail) {
      void this.emailQueue.add(
        'dispute-other-party-notice',
        {
          type: 'dispute-filed-notice',
          to: otherEmail,
          order_id: orderId,
          grounds: data.grounds,
          submission_window_ends: dispute.submission_window_ends_at,
          submit_url: `${process.env.FRONTEND_URL}/disputes/${dispute.id}/submit`,
        },
        { priority: 1 },
      );
    }

    return { order: updatedOrder, dispute };
  }

  // ─── addDisputeSubmission ─────────────────────────────────────────────────

  async addDisputeSubmission(disputeId: string, submittingUserId: string, data: AddSubmissionInput) {
    // 1. Find dispute
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        order: { select: { customer_id: true, contractor_user_id: true } },
      },
    });
    if (!dispute) throw new AppError('DISPUTE_NOT_FOUND', 404);

    // 2. Verify user is a party
    const isCustomer = dispute.order.customer_id === submittingUserId;
    const isContractor = dispute.order.contractor_user_id === submittingUserId;
    if (!isCustomer && !isContractor) throw new AppError('FORBIDDEN', 403);

    // 3. Check submission window
    if (new Date() > dispute.submission_window_ends_at!) {
      throw new AppError(
        'SUBMISSION_WINDOW_CLOSED',
        422,
        `The 72-hour evidence submission window closed on ${dispute.submission_window_ends_at!.toLocaleDateString('en-AU')}. Contact admin if you have additional evidence to submit.`,
      );
    }

    // 4. Check dispute is not yet determined
    if (['DETERMINED', 'CLOSED'].includes(dispute.status)) {
      throw new AppError('DISPUTE_ALREADY_DETERMINED', 422);
    }

    // 5. Create submission
    const submission = await this.prisma.disputeSubmission.create({
      data: {
        dispute_id: disputeId,
        submitted_by_user_id: submittingUserId,
        description: data.description,
        file_blob_paths: data.file_blob_paths,
      },
    });

    // 6. Audit
    void writeAudit(this.prisma, {
      actorId: submittingUserId,
      actionType: 'DISPUTE_SUBMISSION_ADDED',
      entityType: 'Dispute',
      entityId: disputeId,
      metadata: {
        submitted_by: submittingUserId,
        file_count: data.file_blob_paths.length,
      },
    });

    return submission;
  }

  // ─── getDisputeById ───────────────────────────────────────────────────────

  async getDisputeById(disputeId: string, requestingUserId: string) {
    // 1. Find dispute with full includes
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            scope_snapshot: true,
            customer_id: true,
            contractor_user_id: true,
            price_aud: true,
            total_amount_aud: true,
            stripe_payment_intent_id: true,
          },
        },
        raised_by_user: { select: { id: true, full_name: true } },
        assigned_admin: { select: { id: true, full_name: true } },
        arbitrator_profile: {
          include: {
            user: { select: { id: true, full_name: true } },
          },
        },
        determined_by: { select: { id: true, full_name: true } },
        submissions: {
          include: {
            submitted_by_user: { select: { id: true, full_name: true } },
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!dispute) throw new AppError('DISPUTE_NOT_FOUND', 404);

    // 2. Verify access
    const isParty =
      dispute.order.customer_id === requestingUserId ||
      dispute.order.contractor_user_id === requestingUserId;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: requestingUserId },
      select: { account_type: true },
    });
    const isAdmin = ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'].includes(user.account_type);

    if (!isParty && !isAdmin) throw new AppError('FORBIDDEN', 403);

    // 3. Append helper fields
    const now = new Date();
    const submission_window_open = dispute.submission_window_ends_at
      ? now < dispute.submission_window_ends_at
      : false;
    const hours_until_window_closes = dispute.submission_window_ends_at
      ? Math.max(
          0,
          Math.round(
            ((dispute.submission_window_ends_at.getTime() - now.getTime()) / (1000 * 60 * 60)) * 10,
          ) / 10,
        )
      : 0;

    return { ...dispute, submission_window_open, hours_until_window_closes };
  }

  // ─── assignDisputeAdmin ───────────────────────────────────────────────────

  async assignDisputeAdmin(disputeId: string, adminUserId: string, data: AssignDisputeInput) {
    // 1. Find dispute
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      select: { id: true, status: true, assigned_admin_id: true, order_id: true },
    });
    if (!dispute) throw new AppError('DISPUTE_NOT_FOUND', 404);
    if (dispute.assigned_admin_id) {
      throw new AppError('DISPUTE_ALREADY_ASSIGNED', 409);
    }

    // 2. Verify target user is a PLATFORM_ADMIN
    const admin = await this.prisma.user.findUnique({
      where: { id: data.admin_user_id },
      select: { account_type: true, full_name: true, email: true },
    });
    if (!admin || admin.account_type !== 'PLATFORM_ADMIN') {
      throw new AppError('NOT_AN_ADMIN', 422);
    }

    const now = new Date();
    const updated = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        assigned_admin_id: data.admin_user_id,
        assigned_at: now,
        status: 'ASSIGNED',
      },
    });

    // 4. Audit
    void writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'DISPUTE_ADMIN_ASSIGNED',
      entityType: 'Dispute',
      entityId: disputeId,
      metadata: { assigned_admin: data.admin_user_id, assigned_by: adminUserId },
    });

    // 5. Notify both parties
    const order = await this.prisma.order.findUnique({
      where: { id: dispute.order_id },
      select: {
        customer: { select: { email: true } },
        contractor_user: { select: { email: true } },
      },
    });

    for (const email of [
      order?.customer?.email,
      order?.contractor_user?.email,
    ]) {
      if (email) {
        void this.emailQueue.add('dispute-admin-assigned', {
          type: 'dispute-admin-assigned',
          to: email,
          admin_name: admin.full_name,
          order_id: dispute.order_id,
        });
      }
    }

    return updated;
  }

  // ─── appointArbitrator ────────────────────────────────────────────────────

  async appointArbitrator(disputeId: string, adminUserId: string, data: AppointArbitratorInput) {
    // 1. Find dispute
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      select: { id: true, status: true, order_id: true, grounds: true },
    });
    if (!dispute) throw new AppError('DISPUTE_NOT_FOUND', 404);
    if (!['OPEN', 'ASSIGNED'].includes(dispute.status)) {
      throw new AppError('INVALID_DISPUTE_STATUS', 422, `Dispute must be OPEN or ASSIGNED, not ${dispute.status}`);
    }

    // 2. Find arbitrator contractor profile
    const arbitratorProfile = await this.prisma.contractorProfile.findUnique({
      where: { id: data.arbitrator_contractor_id },
      include: { user: { select: { email: true, full_name: true, id: true } } },
    });
    if (!arbitratorProfile) throw new AppError('ARBITRATOR_NOT_FOUND', 404);
    if (arbitratorProfile.status !== 'ACTIVE') {
      throw new AppError('ARBITRATOR_NOT_ACTIVE', 422);
    }

    // 3. Verify arbitrator is not a party
    const order = await this.prisma.order.findUnique({
      where: { id: dispute.order_id },
      select: { customer_id: true, contractor_user_id: true },
    });
    if (
      order?.contractor_user_id === arbitratorProfile.user_id ||
      order?.customer_id === arbitratorProfile.user_id
    ) {
      throw new AppError(
        'ARBITRATOR_IS_PARTY',
        422,
        'Arbitrator cannot be a party to the disputed order',
      );
    }

    // 4. Update dispute
    const updated = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        arbitrator_profile_id: data.arbitrator_contractor_id,
        status: 'UNDER_REVIEW',
        ...(data.appointment_notes !== undefined && {
          arbitrator_notes: data.appointment_notes,
        }),
      },
    });

    // 5. Audit
    void writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'ARBITRATOR_APPOINTED',
      entityType: 'Dispute',
      entityId: disputeId,
      metadata: { arbitrator_id: data.arbitrator_contractor_id },
    });

    // 6. Notify arbitrator
    if (arbitratorProfile.user.email) {
      void this.emailQueue.add('arbitrator-appointed', {
        type: 'arbitrator-appointed',
        to: arbitratorProfile.user.email,
        dispute_id: disputeId,
        order_id: dispute.order_id,
        grounds: dispute.grounds,
        ...(data.appointment_notes !== undefined && {
          appointment_notes: data.appointment_notes,
        }),
        arbitrator_url: `${process.env.FRONTEND_URL}/arbitration/${disputeId}`,
      });
    }

    return updated;
  }

  // ─── issueDetermination ───────────────────────────────────────────────────

  async issueDetermination(disputeId: string, adminUserId: string, data: DeterminationInput) {
    // 1. Find dispute with full order info
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      select: { id: true, status: true, order_id: true },
    });
    if (!dispute) throw new AppError('DISPUTE_NOT_FOUND', 404);
    if (dispute.status === 'DETERMINED' || dispute.status === 'CLOSED') {
      throw new AppError('DISPUTE_ALREADY_DETERMINED', 409);
    }

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: dispute.order_id },
      include: {
        customer: { select: { email: true, full_name: true } },
        contractor_user: { select: { email: true, full_name: true } },
        contractor_profile: {
          select: {
            completed_orders_count: true,
            stripe_connect_account: { select: { stripe_account_id: true } },
          },
        },
      },
    });

    // 2. Validate partial payment amount
    if (data.outcome === 'PARTIAL_PAYMENT') {
      if (data.payment_amount_aud! > Number(order.price_aud)) {
        throw new AppError('AMOUNT_EXCEEDS_ORDER', 422, 'Partial payment cannot exceed the order price');
      }
    }

    const now = new Date();

    // 3. Record determination
    await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        outcome: data.outcome,
        ...(data.payment_amount_aud !== undefined && {
          payment_amount_aud: data.payment_amount_aud,
        }),
        written_reasons: data.written_reasons,
        determined_at: now,
        determined_by_id: adminUserId,
        status: 'DETERMINED',
      },
    });

    // 4. Execute payment action
    let payment_result: Record<string, unknown>;

    const connectAccount = order.contractor_profile?.stripe_connect_account;
    const completedOrders = order.contractor_profile?.completed_orders_count ?? 0;

    if (data.outcome === 'FULL_PAYMENT') {
      const payout = calculatePayout(Number(order.price_aud), completedOrders);
      if (!connectAccount) {
        payment_result = { action: 'TRANSFER_SKIPPED', reason: 'No Stripe connect account' };
      } else {
        const transfer = await createTransfer({
          netAmountAud: payout.net_amount_aud,
          destination: connectAccount.stripe_account_id,
          orderId: order.id,
          payoutRecordId: `dispute-determination-${disputeId}`,
        });
        payment_result = {
          action: 'TRANSFER_CREATED',
          transfer_id: transfer.id,
          net_amount_aud: payout.net_amount_aud,
        };
      }
    } else if (data.outcome === 'FULL_REFUND') {
      const refund = await refundPaymentIntent({
        paymentIntentId: order.stripe_payment_intent_id!,
        reason: 'requested_by_customer',
      });
      payment_result = {
        action: 'REFUND_CREATED',
        refund_id: refund.id,
        amount_aud: Number(order.total_amount_aud),
      };
    } else if (data.outcome === 'PARTIAL_PAYMENT') {
      const partialGross = data.payment_amount_aud!;
      const payout = calculatePayout(partialGross, completedOrders);
      const refundAmount = Number(order.total_amount_aud) - partialGross;

      if (!connectAccount) {
        payment_result = { action: 'TRANSFER_SKIPPED', reason: 'No Stripe connect account' };
      } else {
        const transfer = await createTransfer({
          netAmountAud: payout.net_amount_aud,
          destination: connectAccount.stripe_account_id,
          orderId: order.id,
          payoutRecordId: `dispute-partial-${disputeId}`,
        });
        const refund = await refundPaymentIntent({
          paymentIntentId: order.stripe_payment_intent_id!,
          amountAud: refundAmount,
          reason: 'requested_by_customer',
        });
        payment_result = {
          action: 'PARTIAL_SPLIT',
          transfer_id: transfer.id,
          refund_id: refund.id,
          contractor_net_aud: payout.net_amount_aud,
          customer_refund_aud: refundAmount,
        };
      }
    } else {
      // REMEDY_REQUIRED — no payment action
      payment_result = {
        action: 'NONE_REMEDY_REQUIRED',
        note: 'No payment action taken. Contractor must provide remedy.',
      };
    }

    // 5. Close dispute (unless REMEDY_REQUIRED — keep as DETERMINED)
    const finalStatus = data.outcome === 'REMEDY_REQUIRED' ? 'DETERMINED' : 'CLOSED';
    const updatedDispute = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: { payment_action_status: 'COMPLETED', status: finalStatus },
    });

    // 6. Transition order to COMPLETED (unless REMEDY_REQUIRED)
    if (data.outcome !== 'REMEDY_REQUIRED') {
      await transitionOrder(this.prisma, dispute.order_id, 'COMPLETED', adminUserId, {
        skipGuards: true,
      });
    }

    // 7. Audit
    void writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'DISPUTE_DETERMINED',
      entityType: 'Dispute',
      entityId: disputeId,
      metadata: {
        outcome: data.outcome,
        payment_result,
        determined_by: adminUserId,
      },
    });

    // 8. Notify both parties
    for (const party of [
      order.customer?.email,
      order.contractor_user?.email,
    ]) {
      if (party) {
        void this.emailQueue.add('dispute-determination-issued', {
          type: 'dispute-determination-issued',
          to: party,
          outcome: data.outcome,
          written_reasons: data.written_reasons,
          order_id: dispute.order_id,
        });
      }
    }

    return { dispute: updatedDispute, payment_result };
  }

  // ─── listDisputes ─────────────────────────────────────────────────────────
  // Admin-only listing with optional status filter.

  async listDisputes(status?: string, cursor?: string, limit = 20) {
    const disputes = await this.prisma.dispute.findMany({
      where: {
        ...(status && { status: status as never }),
        ...(cursor && { id: { lt: cursor } }),
      },
      orderBy: { created_at: 'desc' },
      take: limit + 1,
      include: {
        order: {
          select: {
            id: true,
            status: true,
            customer: { select: { full_name: true, email: true } },
            contractor_user: { select: { full_name: true, email: true } },
          },
        },
        raised_by_user: { select: { full_name: true } },
      },
    });

    const hasMore = disputes.length > limit;
    const items = hasMore ? disputes.slice(0, limit) : disputes;
    const next_cursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    return { disputes: items, next_cursor, has_more: hasMore };
  }
}
