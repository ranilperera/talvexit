import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { sseManagerPushMock } = vi.hoisted(() => ({
  sseManagerPushMock: vi.fn(),
}));

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../utils/sse-manager.js', () => ({
  sseManager: {
    push: sseManagerPushMock,
  },
}));

import { ChatService } from '../chat.service.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    order: {
      findUnique: vi.fn(),
    },
    companyMember: {
      findUnique: vi.fn(),
    },
    orderChatMessage: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(async () => ({})),
    },
    $transaction: vi.fn(),
  };
}

function makeQueue() {
  return { add: vi.fn(async () => ({})) };
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order1',
    customer_id: 'cust1',
    company_id: 'co1',
    executing_member_id: 'member1',
    company_order_status: 'IN_PROGRESS',
    company: { primary_admin_id: 'admin1' },
    ...overrides,
  };
}

// ─── sendMessage tests ─────────────────────────────────────────────────────────

describe('ChatService.sendMessage()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: ChatService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new ChatService(prisma as never, queue as never);
    sseManagerPushMock.mockReturnValue(undefined);
  });

  it('CHT-01: customer sends message to executing member -> SENT, SSE to member, email queued', async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder());
    prisma.orderChatMessage.create.mockResolvedValue({
      id: 'msg1',
      order_id: 'order1',
      sender_id: 'cust1',
      body: 'Hello',
      status: 'SENT',
      created_at: new Date(),
      updated_at: new Date(),
    });
    // User lookups for SSE notification
    prisma.user.findUnique
      .mockResolvedValueOnce({ full_name: 'Customer Name' })  // sender
      .mockResolvedValueOnce({ email: 'member@test.com' });    // recipient (member1)

    const result = await svc.sendMessage('order1', 'cust1', { body: 'Hello' });

    expect(prisma.orderChatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          order_id: 'order1',
          sender_id: 'cust1',
          body: 'Hello',
          status: 'SENT',
        }),
      }),
    );
    // SSE to executing member
    expect(sseManagerPushMock).toHaveBeenCalledWith(
      'member1',
      expect.objectContaining({ type: 'chat_message', order_id: 'order1' }),
    );
    // Email to member
    expect(queue.add).toHaveBeenCalledWith(
      'new-chat-message',
      expect.objectContaining({ type: 'new-chat-message', to: 'member@test.com' }),
    );
    expect(result).toMatchObject({ id: 'msg1', status: 'SENT' });
  });

  it('CHT-02: executing member sends message -> SSE to customer', async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder());
    prisma.orderChatMessage.create.mockResolvedValue({
      id: 'msg2',
      order_id: 'order1',
      sender_id: 'member1',
      body: 'Reply here',
      status: 'SENT',
      created_at: new Date(),
      updated_at: new Date(),
    });
    prisma.user.findUnique
      .mockResolvedValueOnce({ full_name: 'Member Name' }) // sender
      .mockResolvedValueOnce({ email: 'cust@test.com' });  // recipient (cust1)

    await svc.sendMessage('order1', 'member1', { body: 'Reply here' });

    // SSE to customer
    expect(sseManagerPushMock).toHaveBeenCalledWith(
      'cust1',
      expect.objectContaining({ type: 'chat_message' }),
    );
  });

  it('CHT-03: order in BOOKED status (not chattable) -> throws CHAT_NOT_AVAILABLE 422', async () => {
    prisma.order.findUnique.mockResolvedValue(
      baseOrder({ company_order_status: 'BOOKED' }),
    );

    await expect(
      svc.sendMessage('order1', 'cust1', { body: 'Can we chat?' }),
    ).rejects.toMatchObject({ code: 'CHAT_NOT_AVAILABLE', status: 422 });
  });

  it('CHT-04: unrelated user (not customer, not member, not company member) -> throws CHAT_NOT_AUTHORIZED 403', async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder());
    // Not customer (cust1), not executing_member (member1), not a company member
    prisma.companyMember.findUnique.mockResolvedValue(null);

    await expect(
      svc.sendMessage('order1', 'random_user', { body: 'Hello' }),
    ).rejects.toMatchObject({ code: 'CHAT_NOT_AUTHORIZED', status: 403 });
  });

  it('CHT-04b: inactive company member -> throws CHAT_NOT_AUTHORIZED 403', async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder());
    prisma.companyMember.findUnique.mockResolvedValue({ role: 'COMPANY_ADMIN', status: 'INACTIVE' });

    await expect(
      svc.sendMessage('order1', 'other_admin', { body: 'Hello' }),
    ).rejects.toMatchObject({ code: 'CHAT_NOT_AUTHORIZED', status: 403 });
  });

  it('CHT-04c: empty body -> throws INVALID_MESSAGE_BODY 422', async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder());

    await expect(
      svc.sendMessage('order1', 'cust1', { body: '   ' }),
    ).rejects.toMatchObject({ code: 'INVALID_MESSAGE_BODY', status: 422 });
  });
});

// ─── retractMessage tests ──────────────────────────────────────────────────────

describe('ChatService.retractMessage()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: ChatService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new ChatService(prisma as never, queue as never);
  });

  it('CHT-05: retract own message within 5 minutes -> body replaced with [Message retracted]', async () => {
    prisma.orderChatMessage.findUnique.mockResolvedValue({
      id: 'msg1',
      sender_id: 'cust1',
      created_at: new Date(), // just now — within window
      body: 'Original message text here',
    });
    prisma.orderChatMessage.update.mockResolvedValue({
      id: 'msg1',
      sender_id: 'cust1',
      body: '[Message retracted]',
    });

    const result = await svc.retractMessage('msg1', 'cust1');

    expect(prisma.orderChatMessage.update).toHaveBeenCalledWith({
      where: { id: 'msg1' },
      data: { body: '[Message retracted]' },
    });
    expect(result).toMatchObject({ body: '[Message retracted]' });
  });

  it('CHT-06: retract after 5 minutes -> throws RETRACT_WINDOW_CLOSED 403', async () => {
    const oldDate = new Date(Date.now() - 6 * 60 * 1000); // 6 minutes ago
    prisma.orderChatMessage.findUnique.mockResolvedValue({
      id: 'msg1',
      sender_id: 'cust1',
      created_at: oldDate,
      body: 'This was sent 6 min ago',
    });

    await expect(svc.retractMessage('msg1', 'cust1')).rejects.toMatchObject({
      code: 'RETRACT_WINDOW_CLOSED',
      status: 403,
    });

    expect(prisma.orderChatMessage.update).not.toHaveBeenCalled();
  });

  it('CHT-06b: retract someone else\'s message -> throws FORBIDDEN 403', async () => {
    prisma.orderChatMessage.findUnique.mockResolvedValue({
      id: 'msg1',
      sender_id: 'other_user',
      created_at: new Date(),
      body: 'Their message',
    });

    await expect(svc.retractMessage('msg1', 'cust1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  it('CHT-06c: message not found -> throws MESSAGE_NOT_FOUND 404', async () => {
    prisma.orderChatMessage.findUnique.mockResolvedValue(null);

    await expect(svc.retractMessage('no_such_msg', 'cust1')).rejects.toMatchObject({
      code: 'MESSAGE_NOT_FOUND',
      status: 404,
    });
  });
});

// ─── getMessages tests ─────────────────────────────────────────────────────────

describe('ChatService.getMessages()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: ChatService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new ChatService(prisma as never, queue as never);
  });

  it('CHT-07: customer fetches messages -> marks member messages READ, returns messages + unread_count', async () => {
    prisma.order.findUnique.mockResolvedValue({
      customer_id: 'cust1',
      company_id: 'co1',
      executing_member_id: 'member1',
    });

    const msgs = [
      { id: 'msg1', sender_id: 'member1', body: 'Hi', status: 'SENT', created_at: new Date(), sender: { id: 'member1', full_name: 'Member' } },
      { id: 'msg2', sender_id: 'member1', body: 'Update', status: 'SENT', created_at: new Date(), sender: { id: 'member1', full_name: 'Member' } },
      { id: 'msg3', sender_id: 'cust1', body: 'Thanks', status: 'SENT', created_at: new Date(), sender: { id: 'cust1', full_name: 'Customer' } },
    ];
    prisma.orderChatMessage.findMany.mockResolvedValue(msgs);
    prisma.orderChatMessage.count.mockResolvedValue(2); // 2 unread from member
    prisma.orderChatMessage.updateMany.mockResolvedValue({ count: 2 });

    const result = await svc.getMessages('order1', 'cust1', {});

    // Mark messages from others as READ
    expect(prisma.orderChatMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          order_id: 'order1',
          sender_id: { not: 'cust1' },
          status: { not: 'READ' },
        }),
        data: { status: 'READ' },
      }),
    );
    expect(result).toMatchObject({
      messages: msgs,
      next_cursor: null,
      unread_count: 2,
    });
  });

  it('CHT-07b: next_cursor set when more messages exist than limit', async () => {
    prisma.order.findUnique.mockResolvedValue({
      customer_id: 'cust1',
      company_id: 'co1',
      executing_member_id: 'member1',
    });

    // Return limit+1 messages to trigger pagination
    const msgs = Array.from({ length: 21 }, (_, i) => ({
      id: `msg${i + 1}`,
      sender_id: 'member1',
      body: `Message ${i + 1}`,
      status: 'SENT',
      created_at: new Date(),
      sender: { id: 'member1', full_name: 'Member' },
    }));
    prisma.orderChatMessage.findMany.mockResolvedValue(msgs);
    prisma.orderChatMessage.count.mockResolvedValue(0);
    prisma.orderChatMessage.updateMany.mockResolvedValue({ count: 0 });

    const result = await svc.getMessages('order1', 'cust1', { limit: 20 });

    // Should return 20 messages (not 21) and set next_cursor
    expect(result.messages).toHaveLength(20);
    expect(result.next_cursor).toBe('msg20');
  });

  it('CHT-07c: forbidden user -> throws FORBIDDEN 403', async () => {
    prisma.order.findUnique.mockResolvedValue({
      customer_id: 'cust1',
      company_id: 'co1',
      executing_member_id: 'member1',
    });
    // Not customer, not executing_member, not company member
    prisma.companyMember.findUnique.mockResolvedValue(null);
    // Not platform admin
    prisma.user.findUnique.mockResolvedValue({ account_type: 'CUSTOMER' });

    await expect(
      svc.getMessages('order1', 'random_user', {}),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});
