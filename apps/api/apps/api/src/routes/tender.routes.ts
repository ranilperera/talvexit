import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TenderService } from '../services/tender.service.js';
import { authenticate } from '../middleware/authenticate.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  const status = e.status ?? 500;
  const code = e.code ?? 'INTERNAL_ERROR';
  const message = e.message ?? 'An unexpected error occurred';
  return reply.status(status).send({ success: false, error: { code, message } });
}

async function requireCustomer(req: FastifyRequest, reply: FastifyReply) {
  if (req.user?.accountType !== 'CUSTOMER') {
    await reply.status(403).send({
      success: false,
      error: { code: 'CUSTOMER_ONLY', message: 'Only customers can perform this action.' },
    });
  }
}

async function requireProvider(req: FastifyRequest, reply: FastifyReply) {
  const allowed = [
    'INDIVIDUAL_CONTRACTOR',
    'ORGANIZATION_ADMIN',
    'ORG_MEMBER',
    'COMPANY_ADMIN',
    'COMPANY_MEMBER',
  ] as const;
  if (!req.user || !(allowed as readonly string[]).includes(req.user.accountType)) {
    await reply.status(403).send({
      success: false,
      error: { code: 'PROVIDER_ONLY', message: 'Only providers can perform this action.' },
    });
  }
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const eligibilityCriteriaSchema = z.object({
  domain: z.string().optional(),
  provider_types: z.array(z.enum(['individual', 'company', 'overseas'])).min(1),
  requires_kyc: z.boolean().optional(),
  requires_insurance: z.boolean().optional(),
  min_experience_years: z.number().int().min(0).optional(),
  required_certs: z.array(z.string()).optional(),
});

const publishDirectSchema = z.object({
  pending_scope_id: z.string().min(1),
  contractor_user_ids: z.array(z.string()).optional(),
  company_ids: z.array(z.string()).optional(),
  deadline_days: z.number().int().min(1).max(90).optional(),
  max_proposals: z.number().int().min(1).max(20).optional(),
});

const publishAutoMatchSchema = z.object({
  pending_scope_id: z.string().min(1),
  eligibility_criteria: eligibilityCriteriaSchema,
  deadline_days: z.number().int().min(1).max(90).optional(),
  max_proposals: z.number().int().min(1).max(20).optional(),
});

const proposalDraftSchema = z.object({
  cover_letter: z.string().max(5000).optional(),
  approach_notes: z.string().max(5000).optional(),
  proposed_price_aud: z.number().positive().optional(),
  proposed_hours: z.number().int().positive().optional(),
  timeline_days: z.number().int().min(1).optional(),
  certifications: z.array(z.string()).optional(),
  proposed_milestones: z.unknown().optional(),
});

const proposalSubmitSchema = z.object({
  cover_letter: z.string().min(20).max(5000),
  approach_notes: z.string().max(5000).optional(),
  proposed_price_aud: z.number().positive(),
  proposed_hours: z.number().int().positive().optional(),
  timeline_days: z.number().int().min(1),
  certifications: z.array(z.string()).optional(),
  proposed_milestones: z.unknown().optional(),
});

const declineSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function tenderRoutes(
  app: FastifyInstance,
  opts: { tenderService: TenderService },
) {
  const { tenderService } = opts;

  // ── Customer: search providers (Path A pre-step) ─────────────────────────

  app.get(
    '/tenders/providers/search',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { domain, q } = req.query as { domain?: string; q?: string };
      try {
        const result = await tenderService.searchProviders(domain, q);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: publish direct tender (Path A) ─────────────────────────────

  app.post(
    '/tenders/publish/direct',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const parsed = publishDirectSchema.safeParse(req.body);
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
        const tender = await tenderService.publishDirectTender(req.user!.userId, parsed.data);
        return reply.status(201).send({ success: true, data: { tender } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: publish auto-match tender (Path B) ─────────────────────────

  app.post(
    '/tenders/publish/auto-match',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const parsed = publishAutoMatchSchema.safeParse(req.body);
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
        const tender = await tenderService.publishAutoMatchTender(req.user!.userId, parsed.data);
        return reply.status(201).send({ success: true, data: { tender } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: list my tenders ────────────────────────────────────────────

  app.get(
    '/tenders',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { status } = req.query as { status?: string };
      try {
        const tenders = await tenderService.listTenders(req.user!.userId, status);
        return reply.status(200).send({ success: true, data: { tenders } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: get tender by ID ───────────────────────────────────────────

  app.get(
    '/tenders/:tenderId',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { tenderId } = req.params as { tenderId: string };
      try {
        const tender = await tenderService.getTenderById(tenderId, req.user!.userId);
        return reply.status(200).send({ success: true, data: { tender } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: cancel tender ──────────────────────────────────────────────

  app.post(
    '/tenders/:tenderId/cancel',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { tenderId } = req.params as { tenderId: string };
      try {
        const result = await tenderService.cancelTender(tenderId, req.user!.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: award a proposal ───────────────────────────────────────────

  app.post(
    '/tenders/:tenderId/award/:proposalId',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { tenderId, proposalId } = req.params as { tenderId: string; proposalId: string };
      try {
        const awardedProposal = await tenderService.awardProposal(tenderId, proposalId, req.user!.userId);
        return reply.status(200).send({ success: true, data: { awarded_proposal: awardedProposal } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: list my invitations ────────────────────────────────────────

  app.get(
    '/provider/invitations',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { company_id } = req.query as { company_id?: string };
      try {
        const invitations = await tenderService.listInvitations(req.user!.userId, company_id);
        return reply.status(200).send({ success: true, data: { invitations } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: get invitation detail ─────────────────────────────────────

  app.get(
    '/provider/invitations/:invitationId',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { invitationId } = req.params as { invitationId: string };
      const { company_id } = req.query as { company_id?: string };
      try {
        const inv = await tenderService.getInvitation(invitationId, req.user!.userId, company_id);
        return reply.status(200).send({ success: true, data: { invitation: inv } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: decline invitation ─────────────────────────────────────────

  app.post(
    '/provider/invitations/:invitationId/decline',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { invitationId } = req.params as { invitationId: string };
      const parsed = declineSchema.safeParse(req.body);
      const { company_id } = req.query as { company_id?: string };
      try {
        const result = await tenderService.declineInvitation(
          invitationId,
          req.user!.userId,
          parsed.success ? parsed.data.reason : undefined,
          company_id,
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: save proposal draft ────────────────────────────────────────

  app.put(
    '/provider/invitations/:invitationId/proposal',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { invitationId } = req.params as { invitationId: string };
      const parsed = proposalDraftSchema.safeParse(req.body);
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
      const { company_id, contractor_profile_id } = req.query as {
        company_id?: string;
        contractor_profile_id?: string;
      };
      try {
        const proposal = await tenderService.saveProposalDraft(
          invitationId,
          req.user!.userId,
          parsed.data,
          contractor_profile_id,
          company_id,
        );
        return reply.status(200).send({ success: true, data: { proposal } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: submit proposal ────────────────────────────────────────────

  app.post(
    '/provider/invitations/:invitationId/proposal/submit',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { invitationId } = req.params as { invitationId: string };
      const parsed = proposalSubmitSchema.safeParse(req.body);
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
      const { company_id, contractor_profile_id } = req.query as {
        company_id?: string;
        contractor_profile_id?: string;
      };
      try {
        const proposal = await tenderService.submitProposal(
          invitationId,
          req.user!.userId,
          parsed.data as never,
          contractor_profile_id,
          company_id,
        );
        return reply.status(201).send({ success: true, data: { proposal } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: withdraw proposal ──────────────────────────────────────────

  app.post(
    '/provider/proposals/:proposalId/withdraw',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { proposalId } = req.params as { proposalId: string };
      try {
        const result = await tenderService.withdrawProposal(proposalId, req.user!.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
