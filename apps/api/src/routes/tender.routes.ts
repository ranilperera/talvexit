import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TenderService } from '../services/tender.service.js';
import type { OrderService } from '../services/order.service.js';
import type { SubscriptionService } from '../services/subscription.service.js';
import type { SubscriptionGuards } from '../middleware/subscription-limits.js';
import { authenticate } from '../middleware/authenticate.js';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { writeAudit } from '../utils/audit.js';
import { decideGstTreatment } from '@onys/shared';

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
  deadline_days: z.number().int().min(1).max(365).optional(),
  deadline_iso: z.string().datetime({ offset: true }).optional(),
  max_proposals: z.number().int().min(1).max(20).optional(),
});

const publishAutoMatchSchema = z.object({
  pending_scope_id: z.string().min(1),
  eligibility_criteria: eligibilityCriteriaSchema,
  deadline_days: z.number().int().min(1).max(365).optional(),
  deadline_iso: z.string().datetime({ offset: true }).optional(),
  max_proposals: z.number().int().min(1).max(20).optional(),
});

const deliverableItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
});

const milestoneItemSchema = z.object({
  name: z.string().min(1).max(200),
  amount: z.number().positive(),
  due_date: z.string().optional(),
  description: z.string().max(500).optional(),
});

const proposalDraftSchema = z.object({
  cover_letter: z.string().max(5000).optional(),
  solution_details: z.string().max(10000).optional(),
  approach_notes: z.string().max(5000).optional(),
  proposed_price_aud: z.number().positive().optional(),
  proposed_hours: z.number().int().positive().optional(),
  timeline_days: z.number().int().min(1).optional(),
  certifications: z.array(z.string()).optional(),
  deliverables: z.array(deliverableItemSchema).optional(),
  proposed_milestones: z.array(milestoneItemSchema).optional(),
  attachment_blob_paths: z.array(z.string()).optional(),
  terms_and_conditions: z.string().max(10000).optional(),
});

const proposalSubmitSchema = z.object({
  cover_letter: z.string().min(20).max(5000),
  solution_details: z.string().max(10000).optional(),
  approach_notes: z.string().max(5000).optional(),
  proposed_price_aud: z.number().positive(),
  proposed_hours: z.number().int().positive().optional(),
  timeline_days: z.number().int().min(1),
  certifications: z.array(z.string()).optional(),
  deliverables: z.array(deliverableItemSchema).optional(),
  proposed_milestones: z.array(milestoneItemSchema).optional(),
  attachment_blob_paths: z.array(z.string()).optional(),
  terms_and_conditions: z.string().max(10000).optional(),
});

const declineSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function tenderRoutes(
  app: FastifyInstance,
  opts: {
    tenderService: TenderService;
    orderService: OrderService;
    subscriptionGuards: SubscriptionGuards;
    subscriptionService: SubscriptionService;
  },
) {
  const { tenderService, subscriptionGuards, subscriptionService } = opts;

  // Manually-authored scopes have ai_scope = null on PendingScope. The
  // publish handlers below look this up and charge the manual_tenders
  // quota instead of (or in addition to) the active_tenders cap.
  async function isManualScope(pendingScopeId: string): Promise<boolean> {
    const row = await prisma.pendingScope.findUnique({
      where: { id: pendingScopeId },
      select: { ai_scope: true },
    });
    return row !== null && row.ai_scope === null;
  }

  // Binary body parsers for proposal file attachments
  const binaryParser = (_req: FastifyRequest, body: Buffer, done: (err: null, body: Buffer) => void) => done(null, body);
  for (const ct of ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/octet-stream',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) {
    app.addContentTypeParser(ct, { parseAs: 'buffer' }, binaryParser);
  }

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
    {
      preHandler: [
        authenticate,
        requireCustomer,
        // Customer Quota 6 — computed live from the count of currently-open
        // tenders the customer owns. Not a counter; no monthly reset.
        subscriptionGuards.requireLimit('active_tenders'),
      ],
    },
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
        // Manual-tender quota gate. active_tenders (concurrent cap) is
        // already enforced by the preHandler above; manual_tenders is the
        // monthly counter that only fires when the scope was authored
        // manually (ai_scope IS NULL).
        if (await isManualScope(parsed.data.pending_scope_id)) {
          await subscriptionService.incrementUsage(req.user!.userId, 'manual_tenders');
        }
        const tender = await tenderService.publishDirectTender(req.user!.userId, parsed.data as never);
        return reply.status(201).send({ success: true, data: { tender } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: publish auto-match tender (Path B) ─────────────────────────

  app.post(
    '/tenders/publish/auto-match',
    {
      preHandler: [
        authenticate,
        requireCustomer,
        // Customer Quota 6 — computed live from the count of currently-open
        // tenders the customer owns. Not a counter; no monthly reset.
        subscriptionGuards.requireLimit('active_tenders'),
      ],
    },
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
        // Manual-tender quota gate (see publish/direct handler above).
        if (await isManualScope(parsed.data.pending_scope_id)) {
          await subscriptionService.incrementUsage(req.user!.userId, 'manual_tenders');
        }
        const tender = await tenderService.publishAutoMatchTender(req.user!.userId, parsed.data as never);
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

  // ── Customer: extend tender deadline ─────────────────────────────────────
  // Body: { new_deadline: ISO string, reason?: string }. Reason is included
  // in the notification email sent to every active invitee.

  app.post(
    '/tenders/:tenderId/extend',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { tenderId } = req.params as { tenderId: string };
      const body = req.body as { new_deadline?: unknown; reason?: unknown };

      const newDeadlineRaw = typeof body.new_deadline === 'string' ? body.new_deadline : null;
      if (!newDeadlineRaw || isNaN(Date.parse(newDeadlineRaw))) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'new_deadline must be a valid ISO datetime.',
          },
        });
      }
      const reasonRaw = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (reasonRaw.length > 1000) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Reason must be 1000 characters or fewer.',
          },
        });
      }

      try {
        const result = await tenderService.extendDeadline({
          tenderId,
          customerId: req.user!.userId,
          newDeadline: new Date(newDeadlineRaw),
          reason: reasonRaw === '' ? null : reasonRaw,
        });
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

  // ── Customer: download proposal attachment ───────────────────────────────────
  // Streams a single attachment from a submitted proposal.
  // Only the tender owner can download, and only after the submission deadline.

  app.get(
    '/tenders/:tenderId/proposals/:proposalId/attachments/download',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { tenderId, proposalId } = req.params as { tenderId: string; proposalId: string };
      const { path: blobPath, dl } = req.query as { path?: string; dl?: string };

      if (!blobPath) {
        return reply.status(400).send({ success: false, error: { code: 'MISSING_PATH', message: 'path query param required.' } });
      }

      try {
        const tender = await prisma.tenderRequest.findUnique({
          where: { id: tenderId },
          select: { customer_id: true, submission_deadline: true },
        });
        if (!tender) return reply.status(404).send({ success: false, error: { code: 'TENDER_NOT_FOUND', message: 'Tender not found.' } });
        if (tender.customer_id !== req.user!.userId) return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
        if (tender.submission_deadline > new Date()) {
          return reply.status(403).send({ success: false, error: { code: 'PROPOSALS_SEALED', message: 'Proposals are sealed until submission deadline.' } });
        }

        const proposal = await prisma.tenderProposal.findUnique({
          where: { id: proposalId },
          select: { tender_request_id: true, attachment_blob_paths: true },
        });
        if (!proposal || proposal.tender_request_id !== tenderId) {
          return reply.status(404).send({ success: false, error: { code: 'PROPOSAL_NOT_FOUND', message: 'Proposal not found.' } });
        }
        if (!(proposal.attachment_blob_paths as string[]).includes(blobPath)) {
          return reply.status(404).send({ success: false, error: { code: 'ATTACHMENT_NOT_FOUND', message: 'Attachment not found.' } });
        }

        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentType, contentLength } = await downloadBlobStream(blobPath);

        const fileName = blobPath.split('/').pop()?.replace(/^\d+-/, '') ?? 'attachment';
        reply.header('Content-Type', contentType ?? 'application/octet-stream');
        if (contentLength) reply.header('Content-Length', contentLength);
        const disposition = dl === '1' ? 'attachment' : 'inline';
        reply.header('Content-Disposition', `${disposition}; filename="${fileName}"`);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
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
          parsed.data as never,
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
    {
      preHandler: [
        authenticate,
        requireProvider,
        // active_tenders caps concurrent live submissions; bids caps total
        // submissions per period. active_tenders runs first so a Free supplier
        // (cap = 0) gets a clean error before we even touch the counter.
        subscriptionGuards.requireLimit('active_tenders'),
        subscriptionGuards.requireLimit('bids'),
      ],
    },
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

  // ── Provider: upload attachment to proposal ──────────────────────────────

  app.post(
    '/provider/invitations/:invitationId/proposal/upload',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { invitationId } = req.params as { invitationId: string };
      const { company_id } = req.query as { company_id?: string };

      const fileName = req.headers['x-file-name'];
      if (typeof fileName !== 'string' || !fileName) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'X-File-Name header is required.' } });
      }

      const rawContentType = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
      const extMimeMap: Record<string, string> = {
        pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
      const ALLOWED_MIME = [
        'application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream',
      ];
      const detectedMime = ALLOWED_MIME.includes(rawContentType) ? rawContentType : (extMimeMap[ext] ?? rawContentType);
      const storedMime = detectedMime === 'application/octet-stream' ? (extMimeMap[ext] ?? detectedMime) : detectedMime;
      if (!Object.values(extMimeMap).includes(storedMime)) {
        return reply.status(415).send({ success: false, error: { code: 'INVALID_FILE_TYPE', message: 'Only PDF, images, Word, and Excel files are allowed.' } });
      }

      const buffer = req.body as Buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'Request body must be file binary data.' } });
      }
      if (buffer.length > 20 * 1024 * 1024) {
        return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'File must be under 20 MB.' } });
      }

      // Verify invitation ownership
      const inv = await prisma.tenderInvitation.findUnique({
        where: { id: invitationId },
        select: { id: true, invitee_user_id: true, invitee_company_id: true, proposal: { select: { id: true, attachment_blob_paths: true } } },
      });
      if (!inv) return reply.status(404).send({ success: false, error: { code: 'INVITATION_NOT_FOUND', message: 'Invitation not found.' } });

      const isOwner = company_id ? inv.invitee_company_id === company_id : inv.invitee_user_id === req.user!.userId;
      if (!isOwner) return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden.' } });

      const safeFilename = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
      const blobPath = `proposal-attachments/${invitationId}/${Date.now()}-${safeFilename}`;

      try {
        const { uploadToBlob } = await import('../utils/blob-storage.js');
        await uploadToBlob(blobPath, buffer, storedMime);
      } catch (err) {
        return handleError(reply, err);
      }

      // Append to proposal's attachment_blob_paths (or store for later when draft is saved)
      if (inv.proposal) {
        const existing = (inv.proposal.attachment_blob_paths as string[]) ?? [];
        await prisma.tenderProposal.update({
          where: { id: inv.proposal.id },
          data: { attachment_blob_paths: [...existing, blobPath] },
        });
      }

      return reply.status(200).send({
        success: true,
        data: {
          blob_path: blobPath,
          file_name: safeFilename,
          file_size: buffer.length,
          mime_type: storedMime,
        },
      });
    },
  );

  // ── Customer: create PO from awarded tender ──────────────────────────────

  app.post(
    '/tenders/:tenderId/create-order',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { tenderId } = req.params as { tenderId: string };
      const customerId = req.user!.userId;

      try {
        // 1. Load tender — must be AWARDED and owned by this customer.
        // Customer's billing_country is fetched here so decideGstTreatment
        // (below) can flag cross-border supply correctly.
        const tender = await prisma.tenderRequest.findUnique({
          where: { id: tenderId },
          select: {
            id: true,
            customer_id: true,
            status: true,
            pending_scope_id: true,
            awarded_proposal_id: true,
            scope_snapshot: true,
            customer: { select: { billing_country: true } },
          },
        });
        if (!tender) {
          return reply.status(404).send({ success: false, error: { code: 'TENDER_NOT_FOUND', message: 'Tender not found.' } });
        }
        if (tender.customer_id !== customerId) {
          return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
        }
        if (tender.status !== 'AWARDED') {
          return reply.status(422).send({ success: false, error: { code: 'TENDER_NOT_AWARDED', message: 'Tender must be AWARDED before creating a PO.' } });
        }
        if (!tender.awarded_proposal_id) {
          return reply.status(422).send({ success: false, error: { code: 'NO_AWARDED_PROPOSAL', message: 'No awarded proposal found.' } });
        }

        // 2. Check no order already exists for this scope
        const existingOrder = await prisma.order.findFirst({
          where: { scoping_job_id: tender.pending_scope_id },
          select: { id: true },
        });
        if (existingOrder) {
          return reply.status(409).send({ success: false, error: { code: 'ORDER_ALREADY_EXISTS', message: 'An order has already been created for this tender.', order_id: existingOrder.id } });
        }

        // 3. Load the awarded proposal — this has the agreed price and
        // winning provider. Pull supplier's GST + country so the GST
        // decision below has every input it needs.
        const proposal = await prisma.tenderProposal.findUnique({
          where: { id: tender.awarded_proposal_id },
          include: {
            submitted_by: { select: { id: true, full_name: true, email: true } },
            company: {
              select: {
                id: true, company_name: true, primary_admin_id: true,
                gst_registered: true, billing_country: true,
              },
            },
            contractor_profile: {
              select: {
                id: true, user_id: true,
                user: { select: { gst_registered: true, billing_country: true } },
              },
            },
          },
        });
        if (!proposal) {
          return reply.status(404).send({ success: false, error: { code: 'PROPOSAL_NOT_FOUND', message: 'Awarded proposal not found.' } });
        }

        // 4. Build scope snapshot — use AI scope but override price with proposal's agreed price
        const baseScope = tender.scope_snapshot as Record<string, unknown>;
        const agreedPriceAud = Number(proposal.proposed_price_aud ?? baseScope.price ?? 0);
        const scopeSnapshot: Record<string, unknown> = {
          ...baseScope,
          price: agreedPriceAud,
          price_aud: agreedPriceAud,
          currency: 'AUD',
          // Capture supplier's proposed timeline
          ...(proposal.timeline_days ? { timeline_days: proposal.timeline_days } : {}),
          ...(proposal.proposed_hours ? { hours_agreed: proposal.proposed_hours } : {}),
        };

        // 5. Calculate tax via the shared decision helper. Single source
        // of truth — the same function the invoice flows call. Cross-
        // border supply (overseas supplier or overseas customer) and
        // unregistered AU suppliers get GST=0 with the right reason text.
        const supplierGstRegistered = proposal.company
          ? proposal.company.gst_registered
          : (proposal.contractor_profile?.user?.gst_registered ?? false);
        const supplierCountry = proposal.company
          ? (proposal.company.billing_country ?? null)
          : (proposal.contractor_profile?.user?.billing_country ?? null);
        const customerCountry = tender.customer.billing_country ?? null;
        const gstDecision = decideGstTreatment({
          issuer_country: supplierCountry,
          issuer_gst_registered: supplierGstRegistered,
          recipient_country: customerCountry,
          amount_ex_gst_cents: Math.round(agreedPriceAud * 100),
        });
        const taxAud = gstDecision.gst_amount_cents / 100;
        const totalAud = Math.round((agreedPriceAud + taxAud) * 100) / 100;

        const now = new Date();

        // 6. Create the Order — starts at SCOPED (scope already agreed via tender process)
        const order = await prisma.order.create({
          data: {
            origin: 'AI_SCOPED',
            scoping_job_id: tender.pending_scope_id,
            customer_id: customerId,
            // Winner: either company or individual contractor
            company_id: proposal.company_id ?? null,
            contractor_profile_id: proposal.contractor_profile?.id ?? null,
            contractor_user_id: proposal.contractor_profile?.user_id ?? null,
            scope_snapshot: scopeSnapshot as Prisma.InputJsonValue,
            scope_version: 1,
            currency: 'AUD',
            price: new Prisma.Decimal(agreedPriceAud),
            price_aud: new Prisma.Decimal(agreedPriceAud),
            tax_amount_aud: new Prisma.Decimal(taxAud),
            total_amount_aud: new Prisma.Decimal(totalAud),
            // Scope was agreed via tender — skip PENDING_APPROVAL, go straight to SCOPED
            status: 'SCOPED',
            scoped_at: now,
            accept_deadline_at: new Date(now.getTime() + 48 * 60 * 60 * 1000),
            company_order_status: 'BOOKED',
            status_history: [
              { from: null, to: 'SCOPED', at: now.toISOString(), actor_id: customerId, reason: 'Created from awarded tender' },
            ] as Prisma.InputJsonValue,
          },
        });

        // 7. Audit
        void writeAudit(prisma, {
          actorId: customerId,
          actionType: 'ORDER_CREATED',
          entityType: 'Order',
          entityId: order.id,
          metadata: { origin: 'AI_SCOPED', tender_id: tenderId, proposal_id: proposal.id, company_id: proposal.company_id },
        });

        // 8. Notify the winning company's primary admin
        if (proposal.company?.primary_admin_id) {
          const adminUser = await prisma.user.findUnique({
            where: { id: proposal.company.primary_admin_id },
            select: { email: true },
          });
          if (adminUser) {
            void tenderService.notifyOrderCreated({
              to: adminUser.email,
              companyName: proposal.company.company_name,
              orderId: order.id,
              scopeTitle: String(baseScope.title ?? 'Your awarded tender'),
            }).catch(() => {});
          }
        }

        return reply.status(201).send({ success: true, data: { order_id: order.id, order } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
