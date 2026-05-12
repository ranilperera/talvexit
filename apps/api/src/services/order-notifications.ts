// ─── Order notifications registry ───────────────────────────────────────────
// Single source of truth for order lifecycle alerts. Every order event has one
// entry here that defines:
//   - in-app notification (title, body, link)
//   - email job name + payload
//   - which party receives it (customer / contractor / both)
//
// To add a new order event: add a function below + call it from the relevant
// route or service. Keep all copy here so admins/PMs can review the full set
// of contractor-facing notifications in one place.

import type { NotificationService } from './notification.service.js';
import type { PrismaClient } from '@prisma/client';
import { emailUrls } from '../utils/urls.js';

interface OrderPartyContext {
  orderId: string;
  taskTitle: string;
  customerName: string;
  contractorEmail: string | null;
  contractorUserId: string | null;
  customerEmail: string | null;
  customerUserId: string;
}

/**
 * Resolves the parties on an order in one query so callers don't repeat
 * the same shape over and over. Prefer this helper to building OrderPartyContext
 * by hand.
 */
export async function loadOrderParties(
  prisma: PrismaClient,
  orderId: string,
): Promise<OrderPartyContext | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customer_id: true,
      contractor_user_id: true,
      scope_snapshot: true,
      task: { select: { title: true } },
      customer: { select: { email: true, full_name: true } },
      contractor_user: { select: { email: true } },
    },
  });
  if (!order) return null;
  const snapshot = order.scope_snapshot as { title?: string } | null;
  return {
    orderId: order.id,
    taskTitle: order.task?.title ?? snapshot?.title ?? 'Order',
    customerName: order.customer?.full_name ?? 'Customer',
    contractorEmail: order.contractor_user?.email ?? null,
    contractorUserId: order.contractor_user_id,
    customerEmail: order.customer?.email ?? null,
    customerUserId: order.customer_id,
  };
}

// ─── Events ─────────────────────────────────────────────────────────────────

/** Customer just placed an order; the contractor needs to accept it. */
export async function notifyOrderCreated(
  notify: NotificationService,
  ctx: OrderPartyContext,
): Promise<void> {
  if (!ctx.contractorUserId) return; // company-routed orders alert the admin separately
  await notify.notify({
    userId: ctx.contractorUserId,
    category: 'ORDER',
    title: 'New order — action required',
    body: `${ctx.customerName} placed an order for "${ctx.taskTitle}". Accept or reject within the deadline.`,
    linkUrl: contractorLink(ctx.orderId),
    metadata: { order_id: ctx.orderId, event: 'order.created' },
    ...(ctx.contractorEmail && {
      email: {
        jobName: 'new-order-received',
        payload: {
          type: 'new-order-received',
          to: ctx.contractorEmail,
          order_id: ctx.orderId,
          customer_name: ctx.customerName,
          task_title: ctx.taskTitle,
          order_url: emailUrls.contractorOrder(ctx.orderId),
        },
      },
    }),
  });
}

/** Contractor accepted an order; tell the customer. */
export async function notifyOrderAccepted(
  notify: NotificationService,
  ctx: OrderPartyContext,
): Promise<void> {
  await notify.notify({
    userId: ctx.customerUserId,
    category: 'ORDER',
    title: 'Order accepted',
    body: `Your order "${ctx.taskTitle}" has been accepted. You can now make payment to start work.`,
    linkUrl: customerLink(ctx.orderId),
    metadata: { order_id: ctx.orderId, event: 'order.accepted' },
    ...(ctx.customerEmail && {
      email: {
        jobName: 'order-accepted',
        payload: {
          type: 'order-accepted',
          to: ctx.customerEmail,
          order_id: ctx.orderId,
          task_title: ctx.taskTitle,
          order_url: emailUrls.customerOrder(ctx.orderId),
        },
      },
    }),
  });
}

/** Contractor submitted work for review; tell the customer. */
export async function notifyOrderSubmitted(
  notify: NotificationService,
  ctx: OrderPartyContext,
): Promise<void> {
  await notify.notify({
    userId: ctx.customerUserId,
    category: 'ORDER',
    title: 'Work submitted for your review',
    body: `Deliverables for "${ctx.taskTitle}" are ready. Review and approve, or request revisions.`,
    linkUrl: customerLink(ctx.orderId),
    metadata: { order_id: ctx.orderId, event: 'order.submitted' },
    ...(ctx.customerEmail && {
      email: {
        jobName: 'order-submitted',
        payload: {
          type: 'order-submitted',
          to: ctx.customerEmail,
          order_id: ctx.orderId,
          task_title: ctx.taskTitle,
          order_url: emailUrls.customerOrder(ctx.orderId),
        },
      },
    }),
  });
}

/** Customer requested revisions; tell the contractor. */
export async function notifyOrderRevisionRequested(
  notify: NotificationService,
  ctx: OrderPartyContext,
  reason: string,
): Promise<void> {
  if (!ctx.contractorUserId) return;
  await notify.notify({
    userId: ctx.contractorUserId,
    category: 'ORDER',
    title: 'Revisions requested',
    body: `${ctx.customerName} requested revisions on "${ctx.taskTitle}".`,
    linkUrl: contractorLink(ctx.orderId),
    metadata: { order_id: ctx.orderId, event: 'order.revision_requested', reason },
    ...(ctx.contractorEmail && {
      email: {
        jobName: 'order-revision-requested',
        payload: {
          type: 'order-revision-requested',
          to: ctx.contractorEmail,
          order_id: ctx.orderId,
          task_title: ctx.taskTitle,
          customer_name: ctx.customerName,
          reason,
          order_url: emailUrls.contractorOrder(ctx.orderId),
        },
      },
    }),
  });
}

/** Customer marked work complete; tell the contractor. */
export async function notifyOrderCompleted(
  notify: NotificationService,
  ctx: OrderPartyContext,
): Promise<void> {
  if (!ctx.contractorUserId) return;
  await notify.notify({
    userId: ctx.contractorUserId,
    category: 'ORDER',
    title: 'Order completed',
    body: `"${ctx.taskTitle}" has been marked complete by ${ctx.customerName}. Thanks for the work.`,
    linkUrl: contractorLink(ctx.orderId),
    metadata: { order_id: ctx.orderId, event: 'order.completed' },
    ...(ctx.contractorEmail && {
      email: {
        jobName: 'order-completed',
        payload: {
          type: 'order-completed',
          to: ctx.contractorEmail,
          order_id: ctx.orderId,
          task_title: ctx.taskTitle,
          order_url: emailUrls.contractorOrder(ctx.orderId),
        },
      },
    }),
  });
}

/** Order cancelled; notify both parties. */
export async function notifyOrderCancelled(
  notify: NotificationService,
  ctx: OrderPartyContext,
  reason: string,
  cancelledBy: 'customer' | 'contractor' | 'admin',
): Promise<void> {
  const recipients: Array<{ userId: string; email: string | null; you: 'customer' | 'contractor' }> = [
    { userId: ctx.customerUserId, email: ctx.customerEmail, you: 'customer' },
  ];
  if (ctx.contractorUserId) {
    recipients.push({ userId: ctx.contractorUserId, email: ctx.contractorEmail, you: 'contractor' });
  }
  for (const r of recipients) {
    if (r.you === cancelledBy) continue; // don't notify the actor about their own action
    await notify.notify({
      userId: r.userId,
      category: 'ORDER',
      title: 'Order cancelled',
      body: `"${ctx.taskTitle}" was cancelled${reason ? `: ${reason}` : ''}.`,
      linkUrl: r.you === 'customer' ? customerLink(ctx.orderId) : contractorLink(ctx.orderId),
      metadata: { order_id: ctx.orderId, event: 'order.cancelled', reason, cancelled_by: cancelledBy },
      ...(r.email && {
        email: {
          jobName: 'order-cancelled',
          payload: {
            type: 'order-cancelled',
            to: r.email,
            order_id: ctx.orderId,
            task_title: ctx.taskTitle,
            reason,
            cancelled_by: cancelledBy,
            order_url:
              r.you === 'customer'
                ? emailUrls.customerOrder(ctx.orderId)
                : emailUrls.contractorOrder(ctx.orderId),
          },
        },
      }),
    });
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function contractorLink(orderId: string): string {
  return `/contractor/orders/${orderId}`;
}

function customerLink(orderId: string): string {
  return `/customer/orders/${orderId}`;
}
