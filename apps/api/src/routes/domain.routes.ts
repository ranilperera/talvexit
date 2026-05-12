import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/admin-guards.js';

function handleError(reply: import('fastify').FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  return reply.status(e.status ?? 500).send({
    success: false,
    error: { code: e.code ?? 'INTERNAL_ERROR', message: e.message ?? 'An unexpected error occurred' },
  });
}

export async function domainRoutes(
  app: FastifyInstance,
  opts: { prisma: PrismaClient },
) {
  const { prisma } = opts;

  // ─── PUBLIC: list all active domains ────────────────────────────────────────

  app.get('/domains', async (_req, reply) => {
    try {
      const domains = await prisma.iTDomain.findMany({
        where: { is_active: true },
        orderBy: { sort_order: 'asc' },
        select: {
          id: true,
          key: true,
          label: true,
          short_label: true,
          icon: true,
          description: true,
          sort_order: true,
          insurance_tier: true,
        },
      });
      return reply.send({ success: true, data: domains });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── ADMIN: list all domains (incl inactive) ─────────────────────────────────

  app.get(
    '/admin/domains',
    { preHandler: [authenticate, requireAdmin] },
    async (_req, reply) => {
      try {
        const domains = await prisma.iTDomain.findMany({
          orderBy: { sort_order: 'asc' },
        });
        return reply.send({ success: true, data: domains });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: create domain ────────────────────────────────────────────────────

  app.post(
    '/admin/domains',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const body = req.body as {
        key?: string;
        label?: string;
        short_label?: string;
        icon?: string;
        description?: string;
        sort_order?: number;
        insurance_tier?: string;
      };

      if (!body.key || !body.label) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'key and label are required.' },
        });
      }

      const key = body.key.trim().toUpperCase().replace(/\s+/g, '_');
      const validTiers = ['STANDARD', 'ELEVATED', 'HIGH_RISK'];
      const insurance_tier = validTiers.includes(body.insurance_tier ?? '') ? body.insurance_tier! : 'STANDARD';

      try {
        const domain = await prisma.iTDomain.create({
          data: {
            key,
            label: body.label.trim(),
            short_label: body.short_label?.trim() ?? null,
            icon: body.icon?.trim() ?? null,
            description: body.description?.trim() ?? null,
            sort_order: body.sort_order ?? 99,
            insurance_tier,
          },
        });
        return reply.status(201).send({ success: true, data: domain });
      } catch (err) {
        const e = err as { code?: string };
        if (e.code === 'P2002') {
          return reply.status(409).send({
            success: false,
            error: { code: 'KEY_EXISTS', message: `Domain key "${key}" already exists.` },
          });
        }
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: update domain ────────────────────────────────────────────────────

  app.patch(
    '/admin/domains/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as {
        label?: string;
        short_label?: string;
        icon?: string;
        description?: string;
        sort_order?: number;
        is_active?: boolean;
        insurance_tier?: string;
      };

      const validTiers = ['STANDARD', 'ELEVATED', 'HIGH_RISK'];

      try {
        const domain = await prisma.iTDomain.update({
          where: { id },
          data: {
            ...(body.label !== undefined ? { label: body.label.trim() } : {}),
            ...(body.short_label !== undefined ? { short_label: body.short_label.trim() || null } : {}),
            ...(body.icon !== undefined ? { icon: body.icon.trim() || null } : {}),
            ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
            ...(body.sort_order !== undefined ? { sort_order: body.sort_order } : {}),
            ...(typeof body.is_active === 'boolean' ? { is_active: body.is_active } : {}),
            ...(body.insurance_tier !== undefined && validTiers.includes(body.insurance_tier)
              ? { insurance_tier: body.insurance_tier }
              : {}),
          },
        });
        return reply.send({ success: true, data: domain });
      } catch (err) {
        const e = err as { code?: string };
        if (e.code === 'P2025') {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Domain not found.' },
          });
        }
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: delete domain ────────────────────────────────────────────────────

  app.delete(
    '/admin/domains/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        await prisma.iTDomain.delete({ where: { id } });
        return reply.status(204).send();
      } catch (err) {
        const e = err as { code?: string };
        if (e.code === 'P2025') {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Domain not found.' },
          });
        }
        return handleError(reply, err);
      }
    },
  );
}
