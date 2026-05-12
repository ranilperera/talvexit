import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  scopeSchema,
  updateTaskSchema,
  taskSearchSchema,
  createSmrSchema,
  respondSmrSchema,
} from '@onys/shared';
import type { TaskService } from '../services/task.service.js';
import type { ScopeModificationService } from '../services/scope-modification.service.js';
import type { SubscriptionGuards } from '../middleware/subscription-limits.js';
import { authenticate } from '../middleware/authenticate.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractMeta(req: FastifyRequest) {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'] ?? 'unknown',
  };
}

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  const status = e.status ?? 500;
  const code = e.code ?? 'INTERNAL_ERROR';
  const message = e.message ?? 'An unexpected error occurred';
  return reply.status(status).send({ success: false, error: { code, message } });
}

function validationError(reply: FastifyReply, issues: { path: (string | number)[]; message: string }[]) {
  return reply.status(400).send({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      fields: issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    },
  });
}

const archiveBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function taskRoutes(
  app: FastifyInstance,
  opts: {
    taskService: TaskService;
    smrService: ScopeModificationService;
    subscriptionGuards: SubscriptionGuards;
  },
) {
  const { taskService, smrService, subscriptionGuards } = opts;

  // ─── GET /tasks/my ──────────────────────────────────────────────────────────
  // IMPORTANT: registered before /tasks/:id to prevent 'my' matching as an id

  app.get('/tasks/my', { preHandler: [authenticate] }, async (req, reply) => {
    try {
      const tasks = await taskService.getMyTasks(req.user!.userId);
      return reply.status(200).send({ success: true, data: { tasks } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /tasks ─────────────────────────────────────────────────────────────

  app.get('/tasks', async (req, reply) => {
    const parsed = taskSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      return validationError(reply, parsed.error.issues);
    }
    try {
      const result = await taskService.searchTasks(parsed.data);
      void reply.header('Cache-Control', 'public, max-age=30');
      return reply.status(200).send({
        success: true,
        data: { tasks: result.tasks, next_cursor: result.next_cursor, total_count: result.total },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /tasks/:id ─────────────────────────────────────────────────────────

  app.get('/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const task = await taskService.getTaskById(id);
      return reply.status(200).send({ success: true, data: task });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /tasks ─────────────────────────────────────────────────────────────

  app.post('/tasks', { preHandler: [authenticate, subscriptionGuards.requireLimit('listing_items')] }, async (req, reply) => {
    const parsed = scopeSchema.safeParse(req.body);
    if (!parsed.success) {
      return validationError(reply, parsed.error.issues);
    }
    try {
      const task = await taskService.createTask(
        parsed.data,
        req.user!.userId,
        req.user!.accountType,
      );
      return reply.status(201).send({ success: true, data: task });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PATCH /tasks/:id ────────────────────────────────────────────────────────

  app.patch('/tasks/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return validationError(reply, parsed.error.issues);
    }
    try {
      const task = await taskService.updateTask(id, parsed.data, req.user!.userId);
      return reply.status(200).send({ success: true, data: task });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /tasks/:id/publish ─────────────────────────────────────────────────

  app.post(
    '/tasks/:id/publish',
    { preHandler: [authenticate, subscriptionGuards.requireLimit('active_tasks')] },
    async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const task = await taskService.publishTask(id, req.user!.userId);
      return reply.status(200).send({
        success: true,
        data: { task, message: 'Task published to catalog.' },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /tasks/:id/unpublish ───────────────────────────────────────────────
  // Flips PUBLISHED → DRAFT. Hides the listing from the public /services
  // catalog (which filters status='PUBLISHED' server-side) without
  // archiving it. Owner can re-publish via /tasks/:id/publish later.

  app.post('/tasks/:id/unpublish', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const task = await taskService.unpublishTask(id, req.user!.userId);
      return reply.status(200).send({
        success: true,
        data: { task, message: 'Task reverted to draft — no longer visible in the public catalog.' },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /tasks/:id/archive ─────────────────────────────────────────────────

  app.post('/tasks/:id/archive', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const bodyParsed = archiveBodySchema.safeParse(req.body ?? {});
    try {
      const task = await taskService.archiveTask(
        id,
        req.user!.userId,
        bodyParsed.success ? bodyParsed.data.reason : undefined,
      );
      return reply.status(200).send({
        success: true,
        data: { task, message: 'Task archived.' },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /orders/:id/scope-modifications ────────────────────────────────────

  app.post('/orders/:id/scope-modifications', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = createSmrSchema.safeParse(req.body);
    if (!parsed.success) {
      return validationError(reply, parsed.error.issues);
    }
    try {
      const smr = await smrService.createSmr(id, req.user!.userId, parsed.data, extractMeta(req));
      return reply.status(201).send({ success: true, data: smr });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /orders/:id/scope-modifications ─────────────────────────────────────

  app.get('/orders/:id/scope-modifications', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const smrs = await smrService.listSmrs(id, req.user!.userId);
      return reply.status(200).send({
        success: true,
        data: { smrs, count: smrs.length },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /orders/:id/scope-modifications/:smr_id/respond ───────────────────

  app.post(
    '/orders/:id/scope-modifications/:smr_id/respond',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id, smr_id } = req.params as { id: string; smr_id: string };
      const parsed = respondSmrSchema.safeParse(req.body);
      if (!parsed.success) {
        return validationError(reply, parsed.error.issues);
      }
      try {
        const smr = await smrService.respondToSmr(id, smr_id, req.user!.userId, parsed.data);
        return reply.status(200).send({ success: true, data: smr });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
