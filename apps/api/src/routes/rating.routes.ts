import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  submitRatingSchema,
  ratingResponseSchema,
  listRatingsSchema,
} from '@onys/shared';
import type { RatingService } from '../services/rating.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { RATING_WEIGHTS } from '../utils/rating-calculator.js';

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

function validationError(
  reply: FastifyReply,
  issues: { path: (string | number)[]; message: string }[],
) {
  return reply.status(400).send({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      fields: issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    },
  });
}

// ─── Actor guards ─────────────────────────────────────────────────────────────

async function requireCustomer(req: FastifyRequest, reply: FastifyReply) {
  if (req.user?.accountType !== 'CUSTOMER') {
    await reply.status(403).send({
      success: false,
      error: { code: 'CUSTOMER_ONLY', message: 'Only customers can perform this action' },
    });
  }
}

async function requireContractor(req: FastifyRequest, reply: FastifyReply) {
  const allowed = ['INDIVIDUAL_CONTRACTOR', 'ORGANIZATION_ADMIN', 'ORG_MEMBER'] as const;
  if (!req.user || !(allowed as readonly string[]).includes(req.user.accountType)) {
    await reply.status(403).send({
      success: false,
      error: { code: 'CONTRACTOR_ONLY', message: 'Only contractors can perform this action' },
    });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function ratingRoutes(
  app: FastifyInstance,
  opts: { ratingService: RatingService },
) {
  const { ratingService } = opts;

  // ─── POST /orders/:id/ratings ─────────────────────────────────────────────
  // Customer submits a rating for a completed order

  app.post(
    '/orders/:id/ratings',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { id: orderId } = req.params as { id: string };
      const parsed = submitRatingSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);

      try {
        const result = await ratingService.submitRating(
          orderId,
          req.user!.userId,
          parsed.data,
          extractMeta(req),
        );
        return reply.status(201).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /contractor/:id/ratings ──────────────────────────────────────────
  // Public: list visible ratings for a contractor

  app.get('/contractor/:id/ratings', async (req, reply) => {
    const { id: contractorProfileId } = req.params as { id: string };
    const parsed = listRatingsSchema.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error.issues);

    try {
      const result = await ratingService.getContractorRatings(contractorProfileId, parsed.data);
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /contractor/:id/rating-summary ───────────────────────────────────
  // Public: aggregate score + per-criterion averages for a contractor

  app.get('/contractor/:id/rating-summary', async (req, reply) => {
    const { id: contractorProfileId } = req.params as { id: string };

    try {
      const result = await ratingService.getRatingSummary(contractorProfileId);
      return reply.status(200).send({
        success: true,
        data: { ...result, weights: RATING_WEIGHTS },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /ratings/:id/response ───────────────────────────────────────────
  // Contractor responds to a rating (once, within 14 days)

  app.post(
    '/ratings/:id/response',
    { preHandler: [authenticate, requireContractor] },
    async (req, reply) => {
      const { id: ratingId } = req.params as { id: string };
      const parsed = ratingResponseSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);

      try {
        const result = await ratingService.submitRatingResponse(
          ratingId,
          req.user!.userId,
          parsed.data,
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
