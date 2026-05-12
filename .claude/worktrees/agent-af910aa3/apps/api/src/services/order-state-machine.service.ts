import type { Order, PrismaClient } from '@prisma/client';
import { Prisma, OrderStatus } from '@prisma/client';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';
import { isCurrentlyValid } from './insurance-tier.service.js';

// ─── Transition Map ───────────────────────────────────────────────────────────
// No code outside this service may write Order.status directly.

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING_APPROVAL:   ['SCOPED', 'CANCELLED'],
  SCOPED:             ['ACCEPTED', 'CANCELLED'],
  ACCEPTED:           ['PAYMENT_HELD', 'CANCELLED'],
  PAYMENT_HELD:       ['IN_PROGRESS'],
  IN_PROGRESS:        ['PENDING_REVIEW', 'DISPUTED'],
  PENDING_REVIEW:     ['COMPLETED', 'REVISION_REQUESTED', 'DISPUTED'],
  REVISION_REQUESTED: ['PENDING_REVIEW', 'DISPUTED'],
  COMPLETED:          [],
  DISPUTED:           ['COMPLETED'],
  CANCELLED:          [],
};

// ─── SLA Durations ────────────────────────────────────────────────────────────

const SLA = {
  CUSTOMER_ACCEPT_MS: 48 * 60 * 60 * 1000, // 48 hours
  REVIEW_WINDOW_MS:   72 * 60 * 60 * 1000, // 72 hours
};

// ─── Guard Functions ──────────────────────────────────────────────────────────

async function guardToPaymentHeld(
  order: Order,
  prisma: PrismaClient,
): Promise<AppError | null> {
  if (!order.contractor_profile_id) {
    return new AppError('NO_CONTRACTOR_ASSIGNED', 422, 'No contractor is assigned to this order');
  }

  const profile = await prisma.contractorProfile.findUnique({
    where: { id: order.contractor_profile_id },
    include: { insurance_certificates: true },
  });

  if (!profile) {
    return new AppError('CONTRACTOR_NOT_FOUND', 422, 'Contractor profile not found');
  }

  const insuranceValid = isCurrentlyValid(profile.insurance_certificates);
  if (!insuranceValid) {
    return new AppError(
      'INSURANCE_EXPIRED',
      402,
      'Contractor insurance has expired. Payment cannot proceed until insurance is renewed.',
    );
  }

  return null;
}

function guardToInProgress(order: Order): AppError | null {
  if (!order.stripe_payment_intent_id) {
    return new AppError('PAYMENT_NOT_RECEIVED', 402, 'Payment must be received before work can begin');
  }
  return null;
}

async function guardToSubmit(order: Order, prisma: PrismaClient): Promise<AppError | null> {
  const deliverableCount = await prisma.orderDeliverable.count({
    where: { order_id: order.id },
  });
  if (deliverableCount === 0) {
    return new AppError(
      'NO_DELIVERABLES',
      422,
      'At least one deliverable file must be uploaded before submitting for review',
    );
  }
  return null;
}

// ─── transitionOrder ──────────────────────────────────────────────────────────

export async function transitionOrder(
  prisma: PrismaClient,
  orderId: string,
  targetStatus: string,
  actorId: string,
  options?: {
    reason?: string;
    skipGuards?: boolean; // admin override only
  },
): Promise<Order> {
  // 1. Fetch current order
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('ORDER_NOT_FOUND', 404);

  // 2. Check transition map
  const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(targetStatus)) {
    throw new AppError(
      'INVALID_TRANSITION',
      422,
      `Cannot transition from ${order.status} to ${targetStatus}. ` +
        `Valid transitions: ${allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)'}`,
    );
  }

  // 3. Run guards (unless admin skipGuards)
  if (!options?.skipGuards) {
    let guardResult: AppError | null = null;

    if (targetStatus === 'PAYMENT_HELD') {
      guardResult = await guardToPaymentHeld(order, prisma);
    } else if (targetStatus === 'IN_PROGRESS') {
      guardResult = guardToInProgress(order);
    } else if (targetStatus === 'PENDING_REVIEW') {
      guardResult = await guardToSubmit(order, prisma);
    }

    if (guardResult) throw guardResult;
  }

  // 4. Build update data
  const now = new Date();
  const updateData: Prisma.OrderUpdateInput = { status: targetStatus as OrderStatus };

  switch (targetStatus) {
    case 'SCOPED':
      updateData.scoped_at = now;
      updateData.accept_deadline_at = new Date(now.getTime() + SLA.CUSTOMER_ACCEPT_MS);
      break;
    case 'ACCEPTED':
      updateData.accepted_at = now;
      break;
    case 'PAYMENT_HELD':
      updateData.payment_held_at = now;
      break;
    case 'IN_PROGRESS':
      updateData.work_started_at = now;
      break;
    case 'PENDING_REVIEW':
      updateData.submitted_at = now;
      updateData.review_deadline_at = new Date(now.getTime() + SLA.REVIEW_WINDOW_MS);
      break;
    case 'COMPLETED':
      updateData.completed_at = now;
      break;
    case 'CANCELLED':
      updateData.cancelled_at = now;
      updateData.cancellation_reason = options?.reason ?? null;
      break;
    case 'DISPUTED':
      updateData.disputed_at = now;
      break;
  }

  // 5. Append to status_history JSON array
  const currentHistory = Array.isArray(order.status_history) ? order.status_history : [];
  updateData.status_history = [
    ...currentHistory,
    {
      from: order.status,
      to: targetStatus,
      at: now.toISOString(),
      actor_id: actorId,
      reason: options?.reason ?? null,
    },
  ] as Prisma.InputJsonValue;

  // 6. Update order
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: updateData,
  });

  // 7. Write audit log
  void writeAudit(prisma, {
    actorId,
    actionType: 'ORDER_STATE_TRANSITION',
    entityType: 'Order',
    entityId: orderId,
    metadata: {
      from: order.status,
      to: targetStatus,
      reason: options?.reason ?? null,
    },
  });

  // 8. Return updated order
  return updated;
}

// ─── canTransition ────────────────────────────────────────────────────────────

export function canTransition(currentStatus: string, targetStatus: string): boolean {
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
  return allowed.includes(targetStatus);
}

// ─── getOrderSlaStatus ────────────────────────────────────────────────────────

export function getOrderSlaStatus(order: Order): {
  is_overdue: boolean;
  overdue_field: string | null;
  deadline: Date | null;
  hours_remaining: number | null;
} {
  const now = new Date();

  if (order.status === 'SCOPED' && order.accept_deadline_at) {
    const hours = (order.accept_deadline_at.getTime() - now.getTime()) / (1000 * 60 * 60);
    return {
      is_overdue: now > order.accept_deadline_at,
      overdue_field: 'accept_deadline_at',
      deadline: order.accept_deadline_at,
      hours_remaining: Math.max(0, Math.round(hours * 10) / 10),
    };
  }

  if (order.status === 'PENDING_REVIEW' && order.review_deadline_at) {
    const hours = (order.review_deadline_at.getTime() - now.getTime()) / (1000 * 60 * 60);
    return {
      is_overdue: now > order.review_deadline_at,
      overdue_field: 'review_deadline_at',
      deadline: order.review_deadline_at,
      hours_remaining: Math.max(0, Math.round(hours * 10) / 10),
    };
  }

  if (order.status === 'IN_PROGRESS' && order.work_started_at) {
    const scope = order.scope_snapshot as Record<string, unknown>;
    const hoursMax = typeof scope?.hours_max === 'number' ? scope.hours_max : 8;
    const slaMs = hoursMax * 1.5 * 60 * 60 * 1000;
    const deadline = new Date(order.work_started_at.getTime() + slaMs);
    const hours = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
    return {
      is_overdue: now > deadline,
      overdue_field: 'work_sla',
      deadline,
      hours_remaining: Math.max(0, Math.round(hours * 10) / 10),
    };
  }

  return { is_overdue: false, overdue_field: null, deadline: null, hours_remaining: null };
}
