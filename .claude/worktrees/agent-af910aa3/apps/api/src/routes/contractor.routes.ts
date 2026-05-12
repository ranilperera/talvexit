import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  step7Schema,
} from '@onys/shared';
import type { ContractorProfileService } from '../services/contractor-profile.service.js';
import { getOnboardingStatus } from '../services/contractor-state-machine.service.js';
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

function requireContractor(req: FastifyRequest, reply: FastifyReply): FastifyReply | void {
  if (req.user?.accountType !== 'INDIVIDUAL_CONTRACTOR') {
    return reply.status(403).send({
      success: false,
      error: { code: 'WRONG_ACCOUNT_TYPE', message: 'Contractor account required' },
    });
  }
}

// ─── Step schema map ──────────────────────────────────────────────────────────

const STEP_SCHEMAS: Record<number, typeof step1Schema | typeof step2Schema | typeof step3Schema | typeof step4Schema | typeof step5Schema | typeof step7Schema> = {
  1: step1Schema,
  2: step2Schema,
  3: step3Schema,
  4: step4Schema,
  5: step5Schema,
  7: step7Schema,
};

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function contractorRoutes(
  app: FastifyInstance,
  opts: { contractorService: ContractorProfileService },
) {
  const { contractorService } = opts;
  const preHandler = [authenticate, requireContractor];

  // ─── GET /contractor/profile ──────────────────────────────────────────────

  app.get('/contractor/profile', { preHandler }, async (req, reply) => {
    try {
      const result = await contractorService.getProfile(req.user!.userId);
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PATCH /contractor/profile/step/:step ─────────────────────────────────

  app.patch('/contractor/profile/step/:step', { preHandler }, async (req, reply) => {
    const { step: stepParam } = req.params as { step: string };
    const step = parseInt(stepParam, 10);

    const schema = STEP_SCHEMAS[step];
    if (!schema) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_STEP', message: `Step ${step} is not a valid onboarding step` },
      });
    }

    const parsed = schema.safeParse(req.body);
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
      const updated = await contractorService.updateStep(
        req.user!.userId,
        step,
        parsed.data,
        extractMeta(req),
      );
      const onboarding_status = getOnboardingStatus(updated);
      return reply.status(200).send({
        success: true,
        data: { profile: updated, onboarding_status },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /contractor/profile/submit ──────────────────────────────────────

  app.post('/contractor/profile/submit', { preHandler }, async (req, reply) => {
    try {
      const profile = await contractorService.submitForReview(req.user!.userId);
      return reply.status(200).send({
        success: true,
        data: { profile, message: 'Profile submitted for review.' },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /contractor/profile/identity-upload ─────────────────────────────

  app.post('/contractor/profile/identity-upload', { preHandler }, async (req, reply) => {
    const body = req.body as { document_type?: unknown; blob_path?: unknown };
    if (typeof body.document_type !== 'string' || typeof body.blob_path !== 'string') {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'document_type and blob_path are required strings',
        },
      });
    }
    try {
      const profile = await contractorService.uploadIdentityDocument(
        req.user!.userId,
        body.document_type,
        body.blob_path,
      );
      return reply.status(200).send({ success: true, data: profile });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /contractor/profile/onboarding-status ────────────────────────────

  app.get('/contractor/profile/onboarding-status', { preHandler }, async (req, reply) => {
    try {
      const { onboarding_status } = await contractorService.getProfile(req.user!.userId);
      return reply.status(200).send({ success: true, data: onboarding_status });
    } catch (err) {
      return handleError(reply, err);
    }
  });
}
