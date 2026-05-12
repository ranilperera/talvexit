import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { NotificationCategory } from '@prisma/client';
import type { NotificationService } from '../services/notification.service.js';
import { authenticate } from '../middleware/authenticate.js';

const CATEGORIES: NotificationCategory[] = [
  'ORDER', 'PAYMENT', 'DISPUTE', 'TENDER', 'ACCOUNT', 'MESSAGE', 'COMPLIANCE', 'ADMIN', 'MARKETING',
];

const listSchema = z.object({
  unread_only: z.coerce.boolean().optional(),
  category: z.enum(['ORDER', 'PAYMENT', 'DISPUTE', 'TENDER', 'ACCOUNT', 'MESSAGE', 'COMPLIANCE', 'ADMIN', 'MARKETING']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const channelMapSchema = z.record(
  z.enum(['ORDER', 'PAYMENT', 'DISPUTE', 'TENDER', 'ACCOUNT', 'MESSAGE', 'COMPLIANCE', 'ADMIN', 'MARKETING']),
  z.boolean(),
);

const updatePrefsSchema = z.object({
  in_app: channelMapSchema.optional(),
  email: channelMapSchema.optional(),
});

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  return reply.status(e.status ?? 500).send({
    success: false,
    error: { code: e.code ?? 'INTERNAL_ERROR', message: e.message ?? 'An unexpected error occurred' },
  });
}

export async function notificationRoutes(
  app: FastifyInstance,
  opts: { notificationService: NotificationService },
) {
  const { notificationService: svc } = opts;

  // ─── GET /notifications ─────────────────────────────────────────────────────

  app.get('/notifications', { preHandler: [authenticate] }, async (req, reply) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' },
      });
    }
    try {
      const result = await svc.list(req.user!.userId, {
        ...(parsed.data.unread_only !== undefined ? { unreadOnly: parsed.data.unread_only } : {}),
        ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
        ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
        limit: parsed.data.limit,
      });
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /notifications/count ───────────────────────────────────────────────
  // Accepts an optional ?category= filter so sidebar widgets can fetch a
  // category-scoped unread count (e.g. the Messages nav badge polls
  // ?category=MESSAGE) without pulling the whole list.

  app.get('/notifications/count', { preHandler: [authenticate] }, async (req, reply) => {
    const q = req.query as { category?: string } | undefined;
    const category =
      q?.category && (CATEGORIES as readonly string[]).includes(q.category)
        ? (q.category as NotificationCategory)
        : undefined;
    try {
      const count = await svc.unreadCount(
        req.user!.userId,
        category ? { category } : {},
      );
      return reply.status(200).send({ success: true, data: { unread: count } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /notifications/:id/read ───────────────────────────────────────────

  app.post('/notifications/:id/read', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await svc.markRead(req.user!.userId, id);
      return reply.status(200).send({ success: true, data: { ok: true } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /notifications/mark-all-read ──────────────────────────────────────

  app.post('/notifications/mark-all-read', { preHandler: [authenticate] }, async (req, reply) => {
    try {
      const result = await svc.markAllRead(req.user!.userId);
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /me/notification-preferences ───────────────────────────────────────

  app.get('/me/notification-preferences', { preHandler: [authenticate] }, async (req, reply) => {
    try {
      const prefs = await svc.getPreferences(req.user!.userId);
      return reply.status(200).send({ success: true, data: { preferences: prefs, categories: CATEGORIES } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PATCH /me/notification-preferences ─────────────────────────────────────

  app.patch('/me/notification-preferences', { preHandler: [authenticate] }, async (req, reply) => {
    const parsed = updatePrefsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid preferences payload' },
      });
    }
    try {
      const patch: import('../services/notification.service.js').NotificationPreferences = {
        ...(parsed.data.in_app !== undefined ? { in_app: parsed.data.in_app } : {}),
        ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
      };
      const merged = await svc.updatePreferences(req.user!.userId, patch);
      return reply.status(200).send({ success: true, data: { preferences: merged } });
    } catch (err) {
      return handleError(reply, err);
    }
  });
}
