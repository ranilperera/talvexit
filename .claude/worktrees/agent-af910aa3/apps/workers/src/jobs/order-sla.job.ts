import type { Queue } from 'bullmq';
import { prisma } from '../lib/prisma.js';

// ─── Email payload type ────────────────────────────────────────────────────────

type OrderSlaEmailPayload =
  | { type: 'order-accept-deadline-missed'; to: string; order_id: string; message: string }
  | { type: 'admin-review-overdue'; order_id: string; customer_name: string; overdue_since: string | undefined };

// ─── checkOrderSlas ───────────────────────────────────────────────────────────

export async function checkOrderSlas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emailQueue: Queue<any>,
): Promise<void> {
  const now = new Date();

  // ── CHECK 1 — SCOPED orders past accept deadline (48h) ───────────────────────

  const overdueScoped = await prisma.order.findMany({
    where: {
      status: 'SCOPED',
      accept_deadline_at: { lt: now },
    },
    include: {
      customer: { select: { email: true, full_name: true } },
      contractor_user: { select: { email: true, full_name: true } },
    },
  });

  for (const order of overdueScoped) {
    await emailQueue.add('order-accept-overdue', {
      type: 'order-accept-deadline-missed',
      to: order.customer.email,
      order_id: order.id,
      message: 'Your order is awaiting acceptance. It will be cancelled soon.',
    } satisfies OrderSlaEmailPayload);

    await prisma.auditLog.create({
      data: {
        action_type: 'ORDER_SLA_BREACH',
        entity_type: 'Order',
        entity_id: order.id,
        metadata: {
          sla_type: 'ACCEPT_DEADLINE',
          breached_at: now.toISOString(),
        },
      },
    });
  }

  // ── CHECK 2 — PENDING_REVIEW orders past review deadline (72h) ───────────────

  const overdueReview = await prisma.order.findMany({
    where: {
      status: 'PENDING_REVIEW',
      review_deadline_at: { lt: now },
    },
    include: {
      customer: { select: { email: true, full_name: true } },
      contractor_user: { select: { email: true, full_name: true } },
    },
  });

  for (const order of overdueReview) {
    await emailQueue.add('review-overdue-admin', {
      type: 'admin-review-overdue',
      order_id: order.id,
      customer_name: order.customer.full_name,
      overdue_since: order.review_deadline_at?.toISOString(),
    } satisfies OrderSlaEmailPayload);

    await prisma.auditLog.create({
      data: {
        action_type: 'ORDER_SLA_BREACH',
        entity_type: 'Order',
        entity_id: order.id,
        metadata: { sla_type: 'REVIEW_DEADLINE', breached_at: now.toISOString() },
      },
    });
  }

  // ── CHECK 3 — PENDING change requests past expiry (48h) ──────────────────────

  const expiredCRs = await prisma.changeRequest.findMany({
    where: {
      status: 'PENDING',
      expires_at: { lt: now },
    },
  });

  for (const cr of expiredCRs) {
    await prisma.changeRequest.update({
      where: { id: cr.id },
      data: { status: 'EXPIRED' },
    });
  }

  // ── CHECK 4 — PENDING SMRs past expiry (5 days) ───────────────────────────────

  const expiredSmrs = await prisma.scopeModificationRequest.findMany({
    where: {
      status: 'PENDING',
      expires_at: { lt: now },
    },
  });

  for (const smr of expiredSmrs) {
    await prisma.scopeModificationRequest.update({
      where: { id: smr.id },
      data: { status: 'EXPIRED' },
    });
  }

  console.log(
    `[order-sla] ${overdueScoped.length} overdue accepts, ` +
      `${overdueReview.length} overdue reviews, ` +
      `${expiredCRs.length} expired CRs, ` +
      `${expiredSmrs.length} expired SMRs`,
  );
}
