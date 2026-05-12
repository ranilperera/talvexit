import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createOrganisationSchema,
  updateOrganisationSchema,
  uploadOrgDocumentSchema,
  acceptAgreementSchema,
  inviteMemberSchema,
  updateMemberSchema,
} from '@onys/shared';
import type { OrganisationService } from '../services/organisation.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { prisma } from '../lib/prisma.js';

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

function requireOrgAdmin(req: FastifyRequest, reply: FastifyReply): FastifyReply | void {
  if (!req.user || req.user.accountType !== 'ORGANIZATION_ADMIN') {
    return reply.status(403).send({
      success: false,
      error: { code: 'FORBIDDEN', message: 'ORGANISATION_ADMIN account required' },
    });
  }
}

function requireAdmin(req: FastifyRequest, reply: FastifyReply): FastifyReply | void {
  const allowed = ['PLATFORM_ADMIN', 'COMPLIANCE_ADMIN'];
  if (!req.user || !allowed.includes(req.user.accountType)) {
    return reply.status(403).send({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
  }
}

const verifyDecisionSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  rejection_reason: z.string().min(10).optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function organisationRoutes(
  app: FastifyInstance,
  opts: { orgService: OrganisationService },
) {
  const { orgService } = opts;
  const orgAdminHandler = [authenticate, requireOrgAdmin];
  const adminHandler = [authenticate, requireAdmin];

  // ─── POST /organisations ────────────────────────────────────────────────────

  app.post('/organisations', { preHandler: orgAdminHandler }, async (req, reply) => {
    const parsed = createOrganisationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          fields: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
      });
    }
    try {
      const organisation = await orgService.createOrganisation(
        req.user!.userId,
        parsed.data,
        extractMeta(req),
      );
      return reply.status(201).send({ success: true, data: { organisation } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /organisations/me ──────────────────────────────────────────────────

  app.get('/organisations/me', { preHandler: orgAdminHandler }, async (req, reply) => {
    try {
      const organisation = await orgService.getMyOrganisation(req.user!.userId);
      return reply.status(200).send({ success: true, data: { organisation } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PATCH /organisations/me ────────────────────────────────────────────────

  app.patch('/organisations/me', { preHandler: orgAdminHandler }, async (req, reply) => {
    const parsed = updateOrganisationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          fields: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
      });
    }
    try {
      const organisation = await orgService.updateOrganisation(req.user!.userId, parsed.data);
      return reply.status(200).send({ success: true, data: { organisation } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /organisations/documents ─────────────────────────────────────────

  app.post('/organisations/documents', { preHandler: orgAdminHandler }, async (req, reply) => {
    const parsed = uploadOrgDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          fields: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
      });
    }
    try {
      const document = await orgService.uploadDocument(
        req.user!.userId,
        parsed.data,
        extractMeta(req),
      );
      return reply.status(201).send({ success: true, data: { document } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /organisations/agreement/accept ───────────────────────────────────

  app.post(
    '/organisations/agreement/accept',
    { preHandler: orgAdminHandler },
    async (req, reply) => {
      const parsed = acceptAgreementSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({
              field: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }
      try {
        const organisation = await orgService.acceptAgreement(
          req.user!.userId,
          parsed.data,
          extractMeta(req),
        );
        return reply.status(200).send({
          success: true,
          data: { organisation, message: 'Expert Organisation Agreement accepted.' },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /organisations/members/invite ────────────────────────────────────

  app.post(
    '/organisations/members/invite',
    { preHandler: orgAdminHandler },
    async (req, reply) => {
      const parsed = inviteMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({
              field: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }
      try {
        const member = await orgService.inviteMember(
          req.user!.userId,
          parsed.data,
          extractMeta(req),
        );
        return reply.status(201).send({
          success: true,
          data: { member, message: `Invitation sent to ${parsed.data.email}` },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /organisations/members/accept/:token ─────────────────────────────
  // Public route — checks for optional JWT, requires login to proceed

  app.post('/organisations/members/accept/:token', async (req, reply) => {
    const { token } = req.params as { token: string };

    // Extract user from Authorization header if present
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message:
            'Please log in or register first, then revisit the invitation link.',
        },
      });
    }

    const payload = verifyAccessToken(authHeader.slice(7));
    if (!payload) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message:
            'Please log in or register first, then revisit the invitation link.',
        },
      });
    }

    try {
      const member = await orgService.acceptInvitation(token, payload.userId);
      return reply.status(200).send({
        success: true,
        data: { member, message: 'You have joined the organisation.' },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /organisations/me/onboarding-status ────────────────────────────────

  app.get(
    '/organisations/me/onboarding-status',
    { preHandler: orgAdminHandler },
    async (req, reply) => {
      try {
        const status = await orgService.getOrgOnboardingStatus(req.user!.userId);
        return reply.status(200).send({ success: true, data: status });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /organisations/members ────────────────────────────────────────────

  app.get('/organisations/members', { preHandler: orgAdminHandler }, async (req, reply) => {
    try {
      const members = await orgService.getMembers(req.user!.userId);
      return reply.status(200).send({
        success: true,
        data: { members, count: members.length },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PATCH /organisations/members/:id ──────────────────────────────────────

  app.patch(
    '/organisations/members/:id',
    { preHandler: orgAdminHandler },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = updateMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({
              field: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }
      try {
        const member = await orgService.updateMember(req.user!.userId, id, parsed.data);
        return reply.status(200).send({ success: true, data: { member } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── DELETE /organisations/members/:id ─────────────────────────────────────

  app.delete(
    '/organisations/members/:id',
    { preHandler: orgAdminHandler },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { reason?: string } | undefined;
      try {
        await orgService.removeMember(
          req.user!.userId,
          id,
          body?.reason,
        );
        return reply.status(204).send();
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /organisations/members/:id/eligibility ────────────────────────────

  app.get(
    '/organisations/members/:id/eligibility',
    { preHandler: orgAdminHandler },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const eligibility = await orgService.verifyMemberEligibility(id);
        return reply.status(200).send({ success: true, data: { eligibility } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /admin/organisations ───────────────────────────────────────────────

  app.get('/admin/organisations', { preHandler: adminHandler }, async (req, reply) => {
    const { status } = req.query as { status?: string };
    try {
      const organisations = await prisma.organisation.findMany({
        where: status ? { verification_status: status as never } : {},
        include: {
          admin_user: { select: { id: true, full_name: true, email: true } },
          _count: { select: { members: true } },
        },
        orderBy: { created_at: 'asc' },
      });
      return reply.status(200).send({
        success: true,
        data: { organisations, count: organisations.length },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PATCH /admin/organisations/:orgId/verify ───────────────────────────────

  app.patch(
    '/admin/organisations/:orgId/verify',
    { preHandler: adminHandler },
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string };
      const parsed = verifyDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({
              field: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }

      const { decision, rejection_reason } = parsed.data;

      try {
        const org = await prisma.organisation.findUnique({ where: { id: orgId } });
        if (!org) {
          return reply.status(404).send({
            success: false,
            error: { code: 'ORGANISATION_NOT_FOUND', message: 'Organisation not found' },
          });
        }

        const now = new Date();
        const updated = await prisma.organisation.update({
          where: { id: orgId },
          data: {
            verification_status: decision,
            verified_at: decision === 'VERIFIED' ? now : null,
            verified_by: decision === 'VERIFIED' ? req.user!.userId : null,
            rejection_reason: decision === 'REJECTED' ? (rejection_reason ?? null) : null,
          },
        });

        // Queue email notification
        // (emailQueue not injected here — use the shared BullMQ instance via opts if needed)
        // For now: audit + return; email worker picks this up in Phase 3

        await prisma.auditLog.create({
          data: {
            actor_id: req.user!.userId,
            action_type: 'ORG_VERIFICATION_DECISION',
            entity_type: 'Organisation',
            entity_id: orgId,
            ip_address: req.ip,
            user_agent: req.headers['user-agent'] ?? null,
            metadata: { decision, admin_id: req.user!.userId },
          },
        });

        return reply.status(200).send({ success: true, data: { organisation: updated } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
