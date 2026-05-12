import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { VideoSessionService } from '../services/video-session.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/admin-guards.js';
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

const rescheduleSchema = z.object({
  scheduled_at: z.string().datetime(),
});

export async function videoRoutes(
  app: FastifyInstance,
  opts: { videoSessionService: VideoSessionService },
) {
  const { videoSessionService } = opts;

  // ─── POST /admin/sessions/kyc ─────────────────────────────────────────────

  app.post(
    '/admin/sessions/kyc',
    { preHandler: [authenticate, requireAdmin] },
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

  // ─── GET /contractor/kyc/status ──────────────────────────────────────────

  app.get(
    '/contractor/kyc/status',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        const profile = await prisma.contractorProfile.findUnique({
          where: { user_id: req.user!.userId },
          select: { id: true, status: true, kyc_status: true },
        });
        if (!profile) {
          return reply.status(404).send({
            success: false,
            error: { code: 'PROFILE_NOT_FOUND', message: 'Contractor profile not found' },
          });
        }

        const kycSession = await prisma.videoSession.findFirst({
          where: { contractor_profile_id: profile.id, session_type: 'VIDEO_KYC' },
          orderBy: { scheduled_at: 'desc' },
          select: {
            id: true,
            status: true,
            scheduled_at: true,
            ended_at: true,
            livekit_room_name: true,
            kyc_outcome: true,
            kyc_outcome_notes: true,
            kyc_reviewed_at: true,
            kyc_reviewed_by: true,
            reschedule_request_status: true,
            reschedule_proposed_at: true,
            reschedule_comment: true,
            reschedule_requested_at: true,
            reschedule_decided_at: true,
            reschedule_admin_notes: true,
          },
        });

        const KYC_STATUS_MAP: Record<string, 'PENDING' | 'SCHEDULED' | 'APPROVED' | 'REJECTED'> = {
          NOT_STARTED: 'PENDING',
          SCHEDULED: 'SCHEDULED',
          COMPLETED_PENDING_REVIEW: 'PENDING',
          APPROVED: 'APPROVED',
          REJECTED: 'REJECTED',
          REQUIRES_INFO: 'PENDING',
        };

        // If KYC is approved, onboarding is always complete regardless of profile.status
        const onboarding_complete = profile.status !== 'INCOMPLETE' || profile.kyc_status === 'APPROVED';

        return reply.status(200).send({
          success: true,
          data: {
            onboarding_complete,
            session_id: kycSession?.id ?? null,
            session_status: kycSession?.status ?? null,
            session_scheduled_at: kycSession?.scheduled_at?.toISOString() ?? null,
            session_completed_at: kycSession?.ended_at?.toISOString() ?? null,
            session_livekit_url: null,
            identity_verified: profile.kyc_status === 'APPROVED',
            verified_at: kycSession?.kyc_reviewed_at?.toISOString() ?? null,
            status: KYC_STATUS_MAP[profile.kyc_status] ?? 'PENDING',
            rejection_reason: kycSession?.kyc_outcome_notes ?? null,
            // Reschedule-request flow (added 2026-05-07). null when no request
            // has ever been made, or when the prior request was approved and
            // applied (in which case scheduled_at already reflects the change).
            reschedule_request_status: kycSession?.reschedule_request_status ?? null,
            reschedule_proposed_at: kycSession?.reschedule_proposed_at?.toISOString() ?? null,
            reschedule_comment: kycSession?.reschedule_comment ?? null,
            reschedule_requested_at: kycSession?.reschedule_requested_at?.toISOString() ?? null,
            reschedule_decided_at: kycSession?.reschedule_decided_at?.toISOString() ?? null,
            reschedule_admin_notes: kycSession?.reschedule_admin_notes ?? null,
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /sessions/:sessionId/status ─────────────────────────────────────

  app.get(
    '/sessions/:sessionId/status',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { sessionId } = req.params as { sessionId: string };
      try {
        const session = await prisma.videoSession.findUnique({
          where: { id: sessionId },
          select: {
            id: true,
            status: true,
            session_type: true,
            scheduled_at: true,
            started_at: true,
            ended_at: true,
            livekit_room_name: true,
            host_consent_at: true,
            participant_consent_at: true,
            recording_started_at: true,
            egress_id: true,
            kyc_outcome: true,
            kyc_outcome_notes: true,
            kyc_reviewed_at: true,
            host_user_id: true,
            participant_user_id: true,
            contractor_profile_id: true,
          },
        });
        if (!session) {
          return reply.status(404).send({
            success: false,
            error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
          });
        }
        const uid = req.user!.userId;
        const at = req.user!.accountType;
        const isAdmin = ['PLATFORM_ADMIN', 'COMPLIANCE_ADMIN'].includes(at);
        if (session.host_user_id !== uid && session.participant_user_id !== uid && !isAdmin) {
          return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        return reply.status(200).send({ success: true, data: { session } });
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
        const result = await videoSessionService.joinSession(sessionId, req.user!.userId, req.user!.accountType);
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
    { preHandler: [authenticate, requireAdmin] },
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
    { preHandler: [authenticate, requireAdmin] },
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

  // ─── POST /admin/sessions/:sessionId/reschedule ──────────────────────────

  app.post(
    '/admin/sessions/:sessionId/reschedule',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { sessionId } = req.params as { sessionId: string };
      const parsed = rescheduleSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'scheduled_at must be a valid ISO datetime',
          },
        });
      }
      try {
        const session = await videoSessionService.rescheduleSession(
          sessionId,
          req.user!.userId,
          new Date(parsed.data.scheduled_at),
        );
        return reply.status(200).send({ success: true, data: { session } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /admin/sessions/:sessionId/cancel ───────────────────────────────

  app.post(
    '/admin/sessions/:sessionId/cancel',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { sessionId } = req.params as { sessionId: string };
      const parsed = cancelSchema.safeParse(req.body);
      try {
        const session = await videoSessionService.adminCancelSession(
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

  // ─── POST /contractor/kyc/sessions/:sessionId/reschedule-request ─────────
  // Contractor proposes a new time for their KYC session and (optionally)
  // attaches a comment. Admins are emailed; the contractor sees a pending
  // banner on /contractor/kyc until the admin decides.

  app.post(
    '/contractor/kyc/sessions/:sessionId/reschedule-request',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { sessionId } = req.params as { sessionId: string };
      const body = req.body as { proposed_at?: unknown; comment?: unknown };

      const proposedAtRaw = typeof body.proposed_at === 'string' ? body.proposed_at : null;
      if (!proposedAtRaw || isNaN(Date.parse(proposedAtRaw))) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'proposed_at must be a valid ISO datetime.',
          },
        });
      }
      const commentRaw = typeof body.comment === 'string' ? body.comment.trim() : '';
      if (commentRaw.length > 1000) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Comment must be 1000 characters or fewer.',
          },
        });
      }

      try {
        const session = await videoSessionService.requestReschedule({
          sessionId,
          contractorUserId: req.user!.userId,
          proposedAt: new Date(proposedAtRaw),
          comment: commentRaw === '' ? null : commentRaw,
        });
        return reply.status(200).send({ success: true, data: { session } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /admin/sessions/:sessionId/reschedule-request/decision ─────────
  // Admin approves or rejects a contractor's reschedule request. On approve,
  // the session's scheduled_at moves to the proposed time and the contractor
  // gets the standard "rescheduled" email plus a decision email with notes.

  app.post(
    '/admin/sessions/:sessionId/reschedule-request/decision',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { sessionId } = req.params as { sessionId: string };
      const body = req.body as { decision?: unknown; admin_notes?: unknown };

      const decision = body.decision === 'APPROVED' || body.decision === 'REJECTED'
        ? body.decision
        : null;
      if (!decision) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'decision must be APPROVED or REJECTED.',
          },
        });
      }
      const adminNotesRaw = typeof body.admin_notes === 'string' ? body.admin_notes.trim() : '';
      if (adminNotesRaw.length > 1000) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'admin_notes must be 1000 characters or fewer.',
          },
        });
      }

      try {
        const session = await videoSessionService.decideRescheduleRequest({
          sessionId,
          adminUserId: req.user!.userId,
          decision,
          adminNotes: adminNotesRaw === '' ? null : adminNotesRaw,
        });
        return reply.status(200).send({ success: true, data: { session } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /admin/contractors/:profileId/activation-readiness ──────────────

  app.get(
    '/admin/contractors/:profileId/activation-readiness',
    { preHandler: [authenticate, requireAdmin] },
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
    { preHandler: [authenticate, requireAdmin] },
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
