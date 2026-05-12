import type { PrismaClient, OrderChatMessage } from '@prisma/client';
import type { Queue } from 'bullmq';
import { AppError } from '../lib/errors.js';
import { sseManager } from '../utils/sse-manager.js';
import { getFrontendUrl } from '../utils/urls.js';
import type { NotificationService } from './notification.service.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

const CHATTABLE_STATUSES = [
  'IN_PROGRESS',
  'PENDING_REVIEW',
  'REVISION_REQUESTED',
  'DELIVERABLES_ACCEPTED',
] as const;

const MAX_BODY_LENGTH = 2000;
const RETRACT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ─── Internal types ────────────────────────────────────────────────────────────

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

type SenderRole = 'CUSTOMER' | 'COMPANY_ADMIN' | 'COMPANY_MEMBER';

// ─── ChatService ───────────────────────────────────────────────────────────────
// NOTE: The OrderChatMessage schema currently stores: id, order_id, sender_id,
// body, status (SENT | DELIVERED | READ), created_at, updated_at.
//
// Fields specified in the design (sender_role, attachment_paths,
// read_by_customer_at, read_by_company_at, retracted_at) require a schema
// migration before they can be persisted. Until then:
//   - sender_role is computed per-request and pushed over SSE only.
//   - attachment_paths are not persisted.
//   - Read tracking uses the single `status` field (READ = read by recipient).
//   - Message retraction replaces the body with '[Message retracted]'.

export class ChatService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
    private readonly notificationService?: NotificationService,
  ) {}

  // ─── METHOD 1: sendMessage ────────────────────────────────────────────────────
  // Sends a chat message on a company order and notifies the recipient via SSE
  // and email queue. Only the customer and assigned/admin company members may
  // send messages, and only while the order is actively in progress.

  /**
   * @param orderId - The order this message belongs to.
   * @param senderId - Authenticated user sending the message.
   * @param data - Message body (required, max 2000 chars) and optional attachment paths.
   * @returns The created OrderChatMessage.
   * @throws {AppError} ORDER_NOT_FOUND, NOT_A_COMPANY_ORDER, CHAT_NOT_AUTHORIZED,
   *                    CHAT_NOT_AVAILABLE, INVALID_MESSAGE_BODY.
   */
  async sendMessage(
    orderId: string,
    senderId: string,
    data: { body: string; attachment_paths?: string[] },
  ): Promise<OrderChatMessage & { sender: { id: string; full_name: string } }> {
    // 1. Load order with the fields needed for auth + routing
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        customer_id: true,
        company_id: true,
        executing_member_id: true,
        company_order_status: true,
        company: { select: { primary_admin_id: true } },
      },
    });

    if (!order) throw new AppError('ORDER_NOT_FOUND', 404, 'Order not found.');
    if (!order.company_id) {
      throw new AppError('NOT_A_COMPANY_ORDER', 422, 'Chat is only available on company orders.');
    }

    // 2. Verify sender is authorized to chat on this order
    const isCustomer = order.customer_id === senderId;
    const isExecutingMember = order.executing_member_id === senderId;

    let isCompanyAdmin = false;
    if (!isCustomer && !isExecutingMember) {
      const membership = await this.prisma.companyMember.findUnique({
        where: {
          company_id_user_id: { company_id: order.company_id, user_id: senderId },
        },
        select: { role: true, status: true },
      });
      isCompanyAdmin =
        membership?.status === 'ACTIVE' &&
        (membership.role === 'COMPANY_ADMIN' || membership.role === 'SENIOR_CONSULTANT');
    }

    if (!isCustomer && !isExecutingMember && !isCompanyAdmin) {
      throw new AppError(
        'CHAT_NOT_AUTHORIZED',
        403,
        'Only the customer and assigned company member can chat on this order.',
      );
    }

    // 3. Verify order is in a state where chat is permitted
    const chattable: readonly string[] = CHATTABLE_STATUSES;
    if (!chattable.includes(order.company_order_status ?? '')) {
      throw new AppError(
        'CHAT_NOT_AVAILABLE',
        422,
        `Chat is not available in ${order.company_order_status ?? 'current'} status. ` +
          'Chat becomes available once work begins.',
      );
    }

    // 4. Validate body length
    const trimmedBody = data.body.trim();
    if (!trimmedBody || trimmedBody.length > MAX_BODY_LENGTH) {
      throw new AppError(
        'INVALID_MESSAGE_BODY',
        422,
        `Message body must be between 1 and ${MAX_BODY_LENGTH} characters.`,
      );
    }

    // 5. Determine sender_role (computed — not persisted until schema migration)
    const senderRole: SenderRole = isCustomer
      ? 'CUSTOMER'
      : isCompanyAdmin
        ? 'COMPANY_ADMIN'
        : 'COMPANY_MEMBER';

    // 6. Create the message record (include sender so callers have full_name for chat UI)
    const message = await this.prisma.orderChatMessage.create({
      data: {
        order_id: orderId,
        sender_id: senderId,
        body: trimmedBody,
        status: 'SENT',
      },
      include: {
        sender: { select: { id: true, full_name: true } },
      },
    });

    // 7. Determine the recipient for real-time push + notification
    const recipientId = isCustomer
      ? (order.executing_member_id ?? order.company?.primary_admin_id ?? null)
      : order.customer_id;

    if (recipientId) {
      // 8. Push via SSE immediately (best-effort; no error if not connected)
      sseManager.push(recipientId, {
        type: 'chat_message',
        order_id: orderId,
        message: {
          id: message.id,
          body: message.body,
          sender_role: senderRole,
          created_at: message.created_at,
        },
      });

      // 9. Queue email notification (frontend should dedup with SSE delivery)
      const [sender, recipient] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: senderId },
          select: { full_name: true },
        }),
        this.prisma.user.findUnique({
          where: { id: recipientId },
          select: { email: true },
        }),
      ]);

      if (recipient?.email) {
        await this.emailQueue.add('new-chat-message', {
          type: 'new-chat-message',
          to: recipient.email,
          order_id: orderId,
          sender_name: sender?.full_name ?? 'Team member',
          body_preview: trimmedBody.slice(0, 80),
          action_url: isCustomer
            ? `${getFrontendUrl()}/contractor/orders/${orderId}#chat`
            : `${getFrontendUrl()}/orders/${orderId}#chat`,
        });
      }

      // 10. Write an in-app Notification row so the bell rings and the
      //     sidebar Messages badge increments. Without this, only SSE +
      //     email fired — recipients with the page closed had no way to
      //     know a message arrived.
      if (this.notificationService) {
        const senderName = sender?.full_name ?? 'Team member';
        const preview =
          trimmedBody.slice(0, 80) + (trimmedBody.length > 80 ? '…' : '');
        // Customers land on /customer/orders/:id; suppliers on the supplier
        // variant. linkUrl is interpreted client-side by the bell so we use
        // the customer path here and let the supplier override below if the
        // recipient is a company member.
        const linkUrl = isCustomer
          ? `/contractor/orders/${orderId}#chat`
          : `/customer/orders/${orderId}#chat`;
        await this.notificationService.notify({
          userId: recipientId,
          category: 'MESSAGE',
          title: `New message from ${senderName}`,
          body: preview,
          linkUrl,
          metadata: {
            order_id: orderId,
            message_id: message.id,
            sender_id: senderId,
          },
          // Email is already queued above via the legacy 'new-chat-message'
          // job — don't duplicate. notify() with no `email` arg only
          // creates the in-app row.
        });
      }
    }

    return message;
  }

  // ─── METHOD 2: getMessages ────────────────────────────────────────────────────
  // Returns paginated chat messages for an order (oldest-first for chat UX).
  // Also marks all messages from others as READ and returns the pre-mark
  // unread count so the caller can update badge counts.

  /**
   * @param orderId - The order whose chat to fetch.
   * @param requestingUserId - Authenticated user requesting the messages.
   * @param params - Cursor-based pagination options.
   * @returns Paginated messages, next cursor, and unread count at time of fetch.
   * @throws {AppError} ORDER_NOT_FOUND, FORBIDDEN.
   */
  async getMessages(
    orderId: string,
    requestingUserId: string,
    params: { cursor?: string; limit?: number },
  ) {
    // 1. Verify order exists and requester is authorized
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        customer_id: true,
        company_id: true,
        executing_member_id: true,
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404, 'Order not found.');

    const isCustomer = order.customer_id === requestingUserId;
    let isAuthorized = isCustomer || order.executing_member_id === requestingUserId;

    if (!isAuthorized && order.company_id) {
      const membership = await this.prisma.companyMember.findUnique({
        where: {
          company_id_user_id: { company_id: order.company_id, user_id: requestingUserId },
        },
        select: { status: true },
      });
      isAuthorized = membership?.status === 'ACTIVE';
    }

    if (!isAuthorized) {
      const actor = await this.prisma.user.findUnique({
        where: { id: requestingUserId },
        select: { account_type: true },
      });
      isAuthorized =
        actor?.account_type === 'PLATFORM_ADMIN' ||
        actor?.account_type === 'COMPLIANCE_ADMIN';
    }

    if (!isAuthorized) {
      throw new AppError('FORBIDDEN', 403, 'You do not have access to this order\'s chat.');
    }

    const limit = Math.min(params.limit ?? 20, 50);

    // 2. Fetch messages with sender name included (oldest-first for chat UX)
    const rows = await this.prisma.orderChatMessage.findMany({
      where: { order_id: orderId },
      take: limit + 1, // fetch one extra to detect next page
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { created_at: 'asc' },
      include: {
        sender: { select: { id: true, full_name: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const next_cursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    // 3. Count messages from others not yet READ (snapshot before marking)
    const unread_count = await this.prisma.orderChatMessage.count({
      where: {
        order_id: orderId,
        sender_id: { not: requestingUserId },
        status: { not: 'READ' },
      },
    });

    // 4. Mark all unread messages from others as READ
    await this.prisma.orderChatMessage.updateMany({
      where: {
        order_id: orderId,
        sender_id: { not: requestingUserId },
        status: { not: 'READ' },
      },
      data: { status: 'READ' },
    });

    return { messages: page, next_cursor, unread_count };
  }

  // ─── METHOD 2b: getUnreadCount ────────────────────────────────────────────────
  // Returns just the unread count for an order without marking anything as read.
  // Used to drive UI badges on the chat tab.

  async getUnreadCount(orderId: string, requestingUserId: string): Promise<number> {
    // Verify the requester is a party to the order (same access rule as getMessages).
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customer_id: true, executing_member_id: true, company_id: true },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);

    const isCustomer = order.customer_id === requestingUserId;
    const isExecutingMember = order.executing_member_id === requestingUserId;
    let isCompanyMember = false;
    if (!isCustomer && !isExecutingMember && order.company_id) {
      const member = await this.prisma.companyMember.findFirst({
        where: { company_id: order.company_id, user_id: requestingUserId, status: 'ACTIVE' },
        select: { id: true },
      });
      isCompanyMember = !!member;
    }
    if (!isCustomer && !isExecutingMember && !isCompanyMember) {
      throw new AppError('FORBIDDEN', 403);
    }

    return this.prisma.orderChatMessage.count({
      where: {
        order_id: orderId,
        sender_id: { not: requestingUserId },
        status: { not: 'READ' },
      },
    });
  }

  // ─── METHOD 3: retractMessage ─────────────────────────────────────────────────
  // Allows a sender to retract their own message within a 5-minute window.
  // Until the schema adds a dedicated `retracted_at` field, retraction is
  // implemented as a body replacement so the record is preserved for audit.

  /**
   * @param messageId - The message to retract.
   * @param senderId - Must be the original sender.
   * @returns The updated message with body replaced by a retraction notice.
   * @throws {AppError} MESSAGE_NOT_FOUND, FORBIDDEN, RETRACT_WINDOW_CLOSED.
   */
  async retractMessage(messageId: string, senderId: string): Promise<OrderChatMessage> {
    // 1. Find message and verify ownership
    const message = await this.prisma.orderChatMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        sender_id: true,
        created_at: true,
        body: true,
      },
    });

    if (!message) throw new AppError('MESSAGE_NOT_FOUND', 404, 'Message not found.');
    if (message.sender_id !== senderId) {
      throw new AppError('FORBIDDEN', 403, 'You can only retract your own messages.');
    }

    // 2. Enforce 5-minute retraction window
    const elapsed = Date.now() - message.created_at.getTime();
    if (elapsed > RETRACT_WINDOW_MS) {
      throw new AppError(
        'RETRACT_WINDOW_CLOSED',
        403,
        'Messages can only be retracted within 5 minutes of sending.',
      );
    }

    // 3. Replace body with retraction notice (schema migration will add retracted_at)
    return this.prisma.orderChatMessage.update({
      where: { id: messageId },
      data: { body: '[Message retracted]' },
    });
  }
}
