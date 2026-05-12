import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import type { ChatService } from '../services/chat.service.js';
import { sseManager } from '../utils/sse-manager.js';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const sendMessageSchema = z.object({
  body: z.string().min(1).max(2000),
  attachment_paths: z.array(z.string()).optional(),
});

const getMessagesSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  return reply.status(e.status ?? 500).send({
    success: false,
    error: { code: e.code ?? 'INTERNAL_ERROR', message: e.message ?? 'An unexpected error occurred' },
  });
}

// ─── Route options ────────────────────────────────────────────────────────────

interface ChatRouteOptions {
  chatService: ChatService;
}

// ─── chatRoutes ───────────────────────────────────────────────────────────────

export async function chatRoutes(app: FastifyInstance, opts: ChatRouteOptions) {
  const { chatService } = opts;

  // ─── GET /sse ─────────────────────────────────────────────────────────────
  // Establishes a persistent SSE connection for real-time chat notifications.
  // One connection per user; a new connection replaces any previous one.

  app.get('/sse', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const res = reply.raw as ServerResponse;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    sseManager.register(req.user.userId, res);

    // Keep the connection open — Fastify must not finalise the reply
    await new Promise<void>((resolve) => {
      res.on('close', resolve);
    });

    return reply;
  });

  // ─── POST /orders/:id/chat ────────────────────────────────────────────────
  // Sends a chat message on a company order.

  app.post(
    '/orders/:id/chat',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: orderId } = req.params as { id: string };
      const parsed = sendMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          },
        });
      }

      try {
        const msgData: { body: string; attachment_paths?: string[] } = { body: parsed.data.body };
        if (parsed.data.attachment_paths !== undefined) {
          msgData.attachment_paths = parsed.data.attachment_paths;
        }
        const result = await chatService.sendMessage(orderId, req.user.userId, msgData);
        return reply.status(201).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /orders/:id/chat ─────────────────────────────────────────────────
  // Returns paginated chat messages for a company order (oldest-first).
  // Also marks all unread messages from others as READ.

  app.get(
    '/orders/:id/chat',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: orderId } = req.params as { id: string };
      const parsed = getMessagesSchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query params' },
        });
      }

      try {
        const pageParams: { cursor?: string; limit?: number } = { limit: parsed.data.limit ?? 50 };
        if (parsed.data.cursor !== undefined) pageParams.cursor = parsed.data.cursor;
        const result = await chatService.getMessages(orderId, req.user.userId, pageParams);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /orders/:id/chat/unread-count ────────────────────────────────────
  // Lightweight endpoint to drive UI badges. Does NOT mark anything as read.

  app.get(
    '/orders/:id/chat/unread-count',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
      const { id: orderId } = req.params as { id: string };
      try {
        const unread_count = await chatService.getUnreadCount(orderId, req.user.userId);
        return reply.status(200).send({ success: true, data: { unread_count } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── DELETE /orders/:id/chat/:messageId ───────────────────────────────────
  // Retracts a chat message within the 5-minute window. Only the sender can
  // retract their own messages.

  app.delete(
    '/orders/:id/chat/:messageId',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { messageId } = req.params as { id: string; messageId: string };
      try {
        const result = await chatService.retractMessage(messageId, req.user.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
