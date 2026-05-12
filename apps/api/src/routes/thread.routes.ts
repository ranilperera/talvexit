import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { TaskThreadService } from '../services/task-thread.service.js';
import { authenticate } from '../middleware/authenticate.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  const status = e.status ?? 500;
  const code = e.code ?? 'INTERNAL_ERROR';
  const message = e.message ?? 'An unexpected error occurred';
  return reply.status(status).send({ success: false, error: { code, message } });
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const createThreadSchema = z.object({
  type:    z.enum(['QUESTION', 'SCOPE_CHANGE']),
  subject: z.string().min(3, 'Subject must be at least 3 characters.').max(200),
  message: z.string().min(10, 'Message must be at least 10 characters.').max(4000),
});

const sendMessageSchema = z.object({
  body: z.string().min(1, 'Message cannot be empty.').max(4000),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function threadRoutes(
  app: FastifyInstance,
  opts: { threadService: TaskThreadService },
) {
  const { threadService } = opts;

  // ─── POST /tasks/:id/threads ────────────────────────────────────────────────
  // Customer starts a new discussion thread on a task.

  app.post('/tasks/:id/threads', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = createThreadSchema.safeParse(req.body);
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
      const thread = await threadService.createThread(
        id,
        req.user!.userId,
        parsed.data.type,
        parsed.data.subject,
        parsed.data.message,
      );
      return reply.status(201).send({ success: true, data: thread });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /tasks/:id/threads ─────────────────────────────────────────────────
  // Task owner (contractor / company member) sees all threads for a task.

  app.get('/tasks/:id/threads', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const threads = await threadService.getThreadsForTask(id, req.user!.userId);
      return reply.status(200).send({ success: true, data: { threads } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /threads/mine ──────────────────────────────────────────────────────
  // Customer's own threads across all tasks.
  // IMPORTANT: registered before /threads/:threadId to avoid 'mine' matching as id.

  app.get('/threads/mine', { preHandler: [authenticate] }, async (req, reply) => {
    try {
      const threads = await threadService.getMyThreads(req.user!.userId);
      return reply.status(200).send({ success: true, data: { threads } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /threads/:threadId ─────────────────────────────────────────────────
  // Full thread with all messages — accessible by customer or task owner.

  app.get('/threads/:threadId', { preHandler: [authenticate] }, async (req, reply) => {
    const { threadId } = req.params as { threadId: string };
    try {
      const thread = await threadService.getThread(threadId, req.user!.userId);
      return reply.status(200).send({ success: true, data: thread });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /threads/:threadId/messages ───────────────────────────────────────
  // Either party replies in a thread.

  app.post('/threads/:threadId/messages', { preHandler: [authenticate] }, async (req, reply) => {
    const { threadId } = req.params as { threadId: string };
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' },
      });
    }
    try {
      const message = await threadService.sendMessage(threadId, req.user!.userId, parsed.data.body);
      return reply.status(201).send({ success: true, data: message });
    } catch (err) {
      return handleError(reply, err);
    }
  });
}
