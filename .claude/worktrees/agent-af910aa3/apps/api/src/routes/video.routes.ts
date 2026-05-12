import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { VideoSessionService } from '../services/video-session.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { transitionProfile, canTransition } from '../services/contractor-state-machine.service.js';
import { prisma } from '../lib/prisma.js';

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  const status = e.status ?? 500;
  const code = e.code ?? 'INTERNAL_ERROR';
  const message = e.message ?? 'An unexpected error occurred';
  return reply.status(status).send({ success: false, error: { code, message } });
}

const scheduleKycSchema = z.object({
  contractor_user_id: z.string().min(1),
  scheduled_at: z.string().datetime(),
});

const kycOutcomeSchema = z.object({
  outcome: z.enum(['APPROVED', 'REJECTED', 'INCONCLUSIVE']),
  notes: z.string().max(2000).optional(),
});

const cancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function videoRoutes(
  app: FastifyInstance,
  opts: { videoSessionService: VideoSessionService },
) {
  const { videoSessionService } = opts;

  // ─── POST /admin/sessions/kyc ─────────────────────────────────────────────

  app.post(
    '/admin/sessions/kyc',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const parsed = scheduleKycSchema.safeParse(req.body);
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
        const session = await videoSessionService.scheduleKycSession({
          adminUserId: req.user!.userId,
          contractorUserId: parsed.data.contractor_user_id,
          scheduledAt: new Date(parsed.data.scheduled_at),
        });
        return reply.status(201).send({ success: true, data: { session } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /sessions/:sessionId/join ────────────────────────────────────────

  app.get(
    '/sessions/:sessionId/join',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { sessionId } = req.params as { sessionId: string };
      try {
        const result = await videoSessionService.joinSession(sessionId, req.user!.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /sessions/:sessionId/consent ───────────────────────────────────

  app.post(
    '/sessions/:sessionId/consent',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { sessionId } = req.params as { sessionId: string };
      try {
        const result = await videoSessionService.confirmConsent(sessionId, req.user!.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /admin/sessions/:sessionId/recording/start ─────────────────────

  app.post(
    '/admin/sessions/:sessionId/recording/start',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { sessionId } = req.params as { sessionId: string };
      try {
        const session = await videoSessionService.startRecording(sessionId, req.user!.userId);
        return reply.status(200).send({ success: true, data: { session } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /sessions/:sessionId/end ───────────────────────────────────────

  app.post(
    '/sessions/:sessionId/end',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { sessionId } = req.params as { sessionId: string };
      try {
        const session = await videoSessionService.endSession(sessionId, req.user!.userId);
        return reply.status(200).send({ success: true, data: { session } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /admin/sessions/:sessionId/kyc-outcome ─────────────────────────

  app.post(
    '/admin/sessions/:sessionId/kyc-outcome',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { sessionId } = req.params as { sessionId: string };
      const parsed = kycOutcomeSchema.safeParse(req.body);
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
        const result = await videoSessionService.recordKycOutcome({
          sessionId,
          adminUserId: req.user!.userId,
          outcome: parsed.data.outcome,
          ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
        });
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /sessions/:sessionId/cancel ────────────────────────────────────

  app.post(
    '/sessions/:sessionId/cancel',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { sessionId } = req.params as { sessionId: string };
      const parsed = cancelSchema.safeParse(req.body);
      try {
        const session = await videoSessionService.cancelSession(
          sessionId,
          req.user!.userId,
          parsed.success ? parsed.data.reason : undefined,
        );
        return reply.status(200).send({ success: true, data: { session } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /admin/contractors/:profileId/activation-readiness ──────────────

  app.get(
    '/admin/contractors/:profileId/activation-readiness',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { profileId } = req.params as { profileId: string };
      try {
        const profile = await prisma.contractorProfile.findUnique({
          where: { id: profileId },
        });
        if (!profile) {
          return reply.status(404).send({
            success: false,
            error: { code: 'CONTRACTOR_NOT_FOUND', message: 'Contractor profile not found' },
          });
        }
        const check = canTransition(profile, 'ACTIVE');
        return reply.status(200).send({
          success: true,
          data: {
            profile_id: profileId,
            current_status: profile.status,
            ready: check.allowed,
            blocking_reason: check.reason ?? null,
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /admin/contractors/:profileId/activate ──────────────────────────

  app.post(
    '/admin/contractors/:profileId/activate',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { profileId } = req.params as { profileId: string };
      try {
        const profile = await transitionProfile(
          prisma,
          profileId,
          'ACTIVE',
          req.user!.userId,
        );
        return reply.status(200).send({ success: true, data: { profile } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
