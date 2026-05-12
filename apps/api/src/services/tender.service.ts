import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import { AppError } from '../lib/errors.js';
import { writeAudit } from '../utils/audit.js';
import { buildEmailUrl } from '../utils/urls.js';
import { TenderMatchingService } from './tender-matching.service.js';
import type { EligibilityCriteria } from './tender-matching.service.js';

// ─── Email payload ─────────────────────────────────────────────────────────────

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

// ─── Input shapes ──────────────────────────────────────────────────────────────

export interface PublishDirectTenderInput {
  pending_scope_id: string;
  /** User IDs of individual contractors to invite */
  contractor_user_ids?: string[];
  /** ConsultingCompany IDs to invite */
  company_ids?: string[];
  deadline_days?: number;
  /** ISO datetime — takes precedence over deadline_days when provided */
  deadline_iso?: string;
  max_proposals?: number;
}

export interface PublishAutoMatchTenderInput {
  pending_scope_id: string;
  eligibility_criteria: EligibilityCriteria;
  deadline_days?: number;
  /** ISO datetime — takes precedence over deadline_days when provided */
  deadline_iso?: string;
  max_proposals?: number;
}

export interface SaveProposalDraftInput {
  cover_letter?: string;
  solution_details?: string;
  approach_notes?: string;
  proposed_price_aud?: number;
  proposed_hours?: number;
  timeline_days?: number;
  certifications?: string[];
  deliverables?: unknown;
  proposed_milestones?: unknown;
  attachment_blob_paths?: string[];
  terms_and_conditions?: string;
}

export interface SubmitProposalInput extends SaveProposalDraftInput {
  cover_letter: string;
  proposed_price_aud: number;
  timeline_days: number;
}

// ─── TenderService ─────────────────────────────────────────────────────────────

export class TenderService {
  private readonly matcher = new TenderMatchingService();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── PUBLISH: Path A — Direct selection ────────────────────────────────────

  async publishDirectTender(
    customerId: string,
    input: PublishDirectTenderInput,
  ) {
    const { pending_scope_id, contractor_user_ids = [], company_ids = [] } = input;

    if (contractor_user_ids.length === 0 && company_ids.length === 0) {
      throw new AppError('NO_PROVIDERS_SELECTED', 400, 'At least one provider must be selected.');
    }

    const scope = await this.prisma.pendingScope.findUnique({
      where: { id: pending_scope_id },
      select: {
        id: true,
        customer_id: true,
        ai_scope: true,
        accepted_scope: true,
        status: true,
        tender_request: { select: { id: true } },
      },
    });
    if (!scope) throw new AppError('SCOPE_NOT_FOUND', 404);
    if (scope.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);
    if (scope.tender_request) throw new AppError('TENDER_ALREADY_EXISTS', 409);

    const scopeData = (scope.accepted_scope ?? scope.ai_scope) as Record<string, unknown>;
    if (!scopeData) throw new AppError('SCOPE_NOT_READY', 422, 'Scope must be generated before publishing a tender.');

    const submissionDeadline = input.deadline_iso
      ? new Date(input.deadline_iso)
      : new Date(Date.now() + (input.deadline_days ?? 7) * 86_400_000);
    const deadlineDays = Math.ceil((submissionDeadline.getTime() - Date.now()) / 86_400_000);

    const tender = await this.prisma.$transaction(async (tx) => {
      const tr = await tx.tenderRequest.create({
        data: {
          pending_scope_id,
          customer_id: customerId,
          selection_mode: 'DIRECT',
          title: (scopeData.title as string) ?? 'Untitled',
          domain: (scopeData.domain as string) ?? '',
          scope_snapshot: scopeData as import('@prisma/client').Prisma.InputJsonValue,
          max_proposals: input.max_proposals ?? 5,
          deadline_days: deadlineDays,
          submission_deadline: submissionDeadline,
        },
      });

      // Create invitations for individual contractors
      const contractorInvites = contractor_user_ids.map((uid) => ({
        tender_request_id: tr.id,
        invitee_user_id: uid,
      }));
      // Create invitations for companies
      const companyInvites = company_ids.map((cid) => ({
        tender_request_id: tr.id,
        invitee_company_id: cid,
      }));

      await tx.tenderInvitation.createMany({
        data: [...contractorInvites, ...companyInvites],
        skipDuplicates: true,
      });

      const totalInvited = contractor_user_ids.length + company_ids.length;
      await tx.tenderRequest.update({
        where: { id: tr.id },
        data: {
          invited_count: totalInvited,
          invitations: { updateMany: { where: {}, data: { notified_at: new Date() } } },
        },
      });

      return tr;
    });

    // Queue invitation emails — fire and forget
    await this.sendInvitationEmails(tender.id, scopeData.title as string, submissionDeadline);

    void writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'TENDER_PUBLISHED',
      entityType: 'TenderRequest',
      entityId: tender.id,
      metadata: { selection_mode: 'DIRECT', contractor_count: contractor_user_ids.length, company_count: company_ids.length },
    });

    return this.getTenderById(tender.id, customerId);
  }

  // ─── PUBLISH: Path B — Auto-match ──────────────────────────────────────────

  async publishAutoMatchTender(
    customerId: string,
    input: PublishAutoMatchTenderInput,
  ) {
    const { pending_scope_id, eligibility_criteria } = input;

    const scope = await this.prisma.pendingScope.findUnique({
      where: { id: pending_scope_id },
      select: {
        id: true,
        customer_id: true,
        ai_scope: true,
        accepted_scope: true,
        status: true,
        tender_request: { select: { id: true } },
      },
    });
    if (!scope) throw new AppError('SCOPE_NOT_FOUND', 404);
    if (scope.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);
    if (scope.tender_request) throw new AppError('TENDER_ALREADY_EXISTS', 409);

    const scopeData = (scope.accepted_scope ?? scope.ai_scope) as Record<string, unknown>;
    if (!scopeData) throw new AppError('SCOPE_NOT_READY', 422, 'Scope must be generated before publishing a tender.');

    const maxProposals = input.max_proposals ?? 5;
    const submissionDeadline = input.deadline_iso
      ? new Date(input.deadline_iso)
      : new Date(Date.now() + (input.deadline_days ?? 7) * 86_400_000);
    const deadlineDays = Math.ceil((submissionDeadline.getTime() - Date.now()) / 86_400_000);

    // Run the matching engine
    const matches = await this.matcher.matchProviders(eligibility_criteria, this.prisma, maxProposals);

    if (matches.total_count === 0) {
      throw new AppError('NO_MATCHING_PROVIDERS', 422, 'No active providers match the given eligibility criteria.');
    }

    const tender = await this.prisma.$transaction(async (tx) => {
      const tr = await tx.tenderRequest.create({
        data: {
          pending_scope_id,
          customer_id: customerId,
          selection_mode: 'AUTO_MATCH',
          title: (scopeData.title as string) ?? 'Untitled',
          domain: (scopeData.domain as string) ?? '',
          scope_snapshot: scopeData as import('@prisma/client').Prisma.InputJsonValue,
          eligibility_criteria: eligibility_criteria as never,
          max_proposals: maxProposals,
          deadline_days: deadlineDays,
          submission_deadline: submissionDeadline,
        },
      });

      const contractorInvites = matches.individual_contractors.map((c) => ({
        tender_request_id: tr.id,
        invitee_user_id: c.user_id,
        notified_at: new Date(),
      }));
      const companyInvites = matches.companies.map((c) => ({
        tender_request_id: tr.id,
        invitee_company_id: c.company_id,
        notified_at: new Date(),
      }));

      await tx.tenderInvitation.createMany({
        data: [...contractorInvites, ...companyInvites],
        skipDuplicates: true,
      });

      const totalInvited = matches.total_count;
      await tx.tenderRequest.update({
        where: { id: tr.id },
        data: { invited_count: totalInvited },
      });

      return tr;
    });

    await this.sendInvitationEmails(tender.id, scopeData.title as string, submissionDeadline);

    void writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'TENDER_PUBLISHED',
      entityType: 'TenderRequest',
      entityId: tender.id,
      metadata: { selection_mode: 'AUTO_MATCH', matched_count: matches.total_count },
    });

    return this.getTenderById(tender.id, customerId);
  }

  // ─── GET tender (customer view) ─────────────────────────────────────────────

  async getTenderById(tenderId: string, requestingUserId: string) {
    const tender = await this.prisma.tenderRequest.findUnique({
      where: { id: tenderId },
      include: {
        invitations: {
          include: {
            invitee_user: { select: { id: true, full_name: true } },
            invitee_company: { select: { id: true, company_name: true } },
            proposal: true,
          },
        },
        proposals: {
          where: { status: { in: ['SUBMITTED', 'SHORTLISTED', 'AWARDED', 'REJECTED'] } },
          include: {
            submitted_by: { select: { id: true, full_name: true } },
            contractor_profile: { select: { id: true, domains: true, overall_rating: true } },
            company: { select: { id: true, company_name: true, overall_rating: true } },
          },
          orderBy: { submitted_at: 'desc' },
          // terms_and_conditions is included via the model default select
        },
        // tender_request_id is @unique on TenderContract — at most one
        // contract per tender. Surfaced so the tender detail page can
        // switch the "Create contract" CTA to "View contract" once the
        // engagement has moved on.
        contract: { select: { id: true, status: true } },
      },
    });
    if (!tender) throw new AppError('TENDER_NOT_FOUND', 404);
    if (tender.customer_id !== requestingUserId) throw new AppError('FORBIDDEN', 403);

    // Sealed-bid compliance: hide proposal content until submission deadline passes.
    // Return only id/status/submitted_at so the customer can see the count but not the details.
    const deadlinePassed = tender.submission_deadline <= new Date();
    if (!deadlinePassed) {
      return {
        ...tender,
        proposals_sealed: true,
        proposals: tender.proposals.map((p) => ({
          id: p.id,
          status: p.status,
          submitted_at: p.submitted_at,
          // All content fields stripped until deadline passes
          cover_letter: null,
          solution_details: null,
          approach_notes: null,
          proposed_price_aud: null,
          proposed_hours: null,
          timeline_days: null,
          certifications: [],
          deliverables: null,
          proposed_milestones: null,
          attachment_blob_paths: null,
          terms_and_conditions: null,
          submitted_by: null,
          contractor_profile: null,
          company: null,
        })),
      };
    }

    return { ...tender, proposals_sealed: false };
  }

  // ─── LIST tenders for customer ──────────────────────────────────────────────

  async listTenders(customerId: string, status?: string) {
    return this.prisma.tenderRequest.findMany({
      where: {
        customer_id: customerId,
        ...(status ? { status: status as never } : {}),
      },
      select: {
        id: true,
        title: true,
        domain: true,
        selection_mode: true,
        status: true,
        invited_count: true,
        proposal_count: true,
        submission_deadline: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── EXTEND tender deadline ─────────────────────────────────────────────────
  // Pushes the submission_deadline forward and emails every active invitee with
  // the new deadline and the customer's reason (if given). Constraints:
  //   - caller must be the tender's customer
  //   - tender must still be OPEN
  //   - new deadline must be strictly later than the current one (only extend,
  //     never shorten — shortening would unfairly disadvantage providers who
  //     are still drafting)
  //   - new deadline must be in the future (a "past" deadline isn't a deadline)
  //
  // We also bump deadline_days for parity with the rest of the model — it's
  // a denormalised "days from creation" snapshot that some downstream views
  // read instead of computing from submission_deadline.

  async extendDeadline(params: {
    tenderId: string;
    customerId: string;
    newDeadline: Date;
    reason: string | null;
  }) {
    const tender = await this.prisma.tenderRequest.findUnique({
      where: { id: params.tenderId },
      select: {
        id: true,
        customer_id: true,
        status: true,
        title: true,
        submission_deadline: true,
        created_at: true,
      },
    });
    if (!tender) throw new AppError('TENDER_NOT_FOUND', 404);
    if (tender.customer_id !== params.customerId) throw new AppError('FORBIDDEN', 403);
    if (tender.status !== 'OPEN') {
      throw new AppError(
        'INVALID_STATE',
        422,
        `Only OPEN tenders can be extended (current: ${tender.status}).`,
      );
    }
    if (params.newDeadline <= new Date()) {
      throw new AppError(
        'DEADLINE_IN_PAST',
        422,
        'New deadline must be in the future.',
      );
    }
    if (params.newDeadline <= tender.submission_deadline) {
      throw new AppError(
        'DEADLINE_NOT_LATER',
        422,
        'New deadline must be later than the current deadline. Tender deadlines can only be extended, not shortened.',
      );
    }

    // Recompute deadline_days from creation → new deadline (for callers that
    // read this snapshot). Round up so the UI never undersells the window.
    const daysFromCreation = Math.max(
      1,
      Math.ceil((params.newDeadline.getTime() - tender.created_at.getTime()) / 86_400_000),
    );

    await this.prisma.tenderRequest.update({
      where: { id: params.tenderId },
      data: {
        submission_deadline: params.newDeadline,
        deadline_days: daysFromCreation,
      },
    });

    // Email every invitee whose invitation is still actionable. Withdrawn /
    // declined invitees don't need the extension notice — they've already
    // opted out.
    await this.sendDeadlineExtendedEmails({
      tenderId: params.tenderId,
      tenderTitle: tender.title,
      previousDeadline: tender.submission_deadline,
      newDeadline: params.newDeadline,
      reason: params.reason,
    });

    void writeAudit(this.prisma, {
      actorId: params.customerId,
      actionType: 'TENDER_DEADLINE_EXTENDED',
      entityType: 'TenderRequest',
      entityId: params.tenderId,
      metadata: {
        previous_deadline: tender.submission_deadline.toISOString(),
        new_deadline: params.newDeadline.toISOString(),
        ...(params.reason !== null && { reason: params.reason }),
      },
    });

    return {
      id: params.tenderId,
      submission_deadline: params.newDeadline.toISOString(),
      deadline_days: daysFromCreation,
    };
  }

  // ─── CANCEL tender ──────────────────────────────────────────────────────────

  async cancelTender(tenderId: string, customerId: string) {
    const tender = await this.prisma.tenderRequest.findUnique({
      where: { id: tenderId },
      select: { id: true, customer_id: true, status: true, title: true },
    });
    if (!tender) throw new AppError('TENDER_NOT_FOUND', 404);
    if (tender.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);
    if (!['OPEN', 'CLOSED'].includes(tender.status)) {
      throw new AppError('INVALID_STATE', 422, 'Only OPEN or CLOSED tenders can be cancelled.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tenderRequest.update({
        where: { id: tenderId },
        data: { status: 'CANCELLED', closed_at: new Date() },
      });
      // Reject all open proposals
      await tx.tenderProposal.updateMany({
        where: { tender_request_id: tenderId, status: { in: ['DRAFT', 'SUBMITTED', 'SHORTLISTED'] } },
        data: { status: 'REJECTED', rejected_at: new Date(), rejection_reason: 'Tender cancelled' },
      });
    });

    void writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'TENDER_CANCELLED',
      entityType: 'TenderRequest',
      entityId: tenderId,
      metadata: {},
    });

    return { id: tenderId, status: 'CANCELLED' };
  }

  // ─── PROVIDER: list invitations ─────────────────────────────────────────────

  async listInvitations(providerUserId: string, companyId?: string) {
    const invitations = await this.prisma.tenderInvitation.findMany({
      where: {
        // Match by company OR by individual user — whichever is relevant
        ...(companyId
          ? { invitee_company_id: companyId }
          : { invitee_user_id: providerUserId }),
        // Show all statuses so awarded/closed tenders remain visible
      },
      include: {
        tender: {
          select: {
            id: true,
            status: true,
            title: true,
            domain: true,
            scope_snapshot: true,
            submission_deadline: true,
            max_proposals: true,
            proposal_count: true,
            created_at: true,
          },
        },
        proposal: { select: { id: true, status: true, proposed_price_aud: true, submitted_at: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    return invitations;
  }

  // ─── PROVIDER: view invitation + mark as viewed ─────────────────────────────

  async getInvitation(invitationId: string, providerUserId: string, companyId?: string) {
    const inv = await this.prisma.tenderInvitation.findUnique({
      where: { id: invitationId },
      include: {
        tender: true,
        proposal: true,
      },
    });
    if (!inv) throw new AppError('INVITATION_NOT_FOUND', 404);

    const isOwner = companyId
      ? inv.invitee_company_id === companyId
      : inv.invitee_user_id === providerUserId;
    if (!isOwner) throw new AppError('FORBIDDEN', 403);

    // Mark as viewed on first access
    if (inv.status === 'PENDING') {
      await this.prisma.tenderInvitation.update({
        where: { id: invitationId },
        data: { status: 'VIEWED', viewed_at: new Date() },
      });
    }
    return inv;
  }

  // ─── PROVIDER: decline invitation ──────────────────────────────────────────

  async declineInvitation(invitationId: string, providerUserId: string, reason?: string, companyId?: string) {
    const inv = await this.prisma.tenderInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, invitee_user_id: true, invitee_company_id: true, status: true, tender_request_id: true },
    });
    if (!inv) throw new AppError('INVITATION_NOT_FOUND', 404);

    const isOwner = companyId
      ? inv.invitee_company_id === companyId
      : inv.invitee_user_id === providerUserId;
    if (!isOwner) throw new AppError('FORBIDDEN', 403);

    if (['DECLINED', 'SUBMITTED'].includes(inv.status)) {
      throw new AppError('INVALID_STATE', 422, 'Cannot decline a submitted or already declined invitation.');
    }

    await this.prisma.tenderInvitation.update({
      where: { id: invitationId },
      data: { status: 'DECLINED', declined_at: new Date(), decline_reason: reason ?? null },
    });

    return { id: invitationId, status: 'DECLINED' };
  }

  // ─── PROVIDER: save proposal draft ─────────────────────────────────────────

  async saveProposalDraft(
    invitationId: string,
    providerUserId: string,
    data: SaveProposalDraftInput,
    contractorProfileId?: string,
    companyId?: string,
  ) {
    const inv = await this.prisma.tenderInvitation.findUnique({
      where: { id: invitationId },
      include: { tender: { select: { id: true, status: true, submission_deadline: true } }, proposal: true },
    });
    if (!inv) throw new AppError('INVITATION_NOT_FOUND', 404);

    const isOwner = companyId
      ? inv.invitee_company_id === companyId
      : inv.invitee_user_id === providerUserId;
    if (!isOwner) throw new AppError('FORBIDDEN', 403);

    if (inv.tender.status !== 'OPEN') throw new AppError('TENDER_CLOSED', 422, 'Tender is no longer accepting proposals.');
    if (new Date() > inv.tender.submission_deadline) throw new AppError('DEADLINE_PASSED', 422, 'Submission deadline has passed.');
    if (inv.status === 'DECLINED') throw new AppError('INVITATION_DECLINED', 422, 'You declined this invitation.');

    if (inv.proposal) {
      if (!['DRAFT'].includes(inv.proposal.status)) {
        throw new AppError('PROPOSAL_ALREADY_SUBMITTED', 409);
      }
      // Update existing draft
      return this.prisma.tenderProposal.update({
        where: { id: inv.proposal.id },
        data: {
          ...(data.cover_letter !== undefined && { cover_letter: data.cover_letter }),
          ...(data.solution_details !== undefined && { solution_details: data.solution_details }),
          ...(data.approach_notes !== undefined && { approach_notes: data.approach_notes }),
          ...(data.proposed_price_aud !== undefined && { proposed_price_aud: data.proposed_price_aud }),
          ...(data.proposed_hours !== undefined && { proposed_hours: data.proposed_hours }),
          ...(data.timeline_days !== undefined && { timeline_days: data.timeline_days }),
          ...(data.certifications !== undefined && { certifications: data.certifications }),
          ...(data.deliverables !== undefined && { deliverables: data.deliverables as never }),
          ...(data.proposed_milestones !== undefined && { proposed_milestones: data.proposed_milestones as never }),
          ...(data.attachment_blob_paths !== undefined && { attachment_blob_paths: data.attachment_blob_paths }),
          ...(data.terms_and_conditions !== undefined && { terms_and_conditions: data.terms_and_conditions }),
        },
      });
    }

    // Create new draft
    const proposal = await this.prisma.tenderProposal.create({
      data: {
        tender_request_id: inv.tender_request_id,
        invitation_id: invitationId,
        submitted_by_user_id: providerUserId,
        contractor_profile_id: contractorProfileId ?? null,
        company_id: companyId ?? null,
        cover_letter: data.cover_letter ?? '',
        solution_details: data.solution_details ?? null,
        approach_notes: data.approach_notes ?? null,
        proposed_price_aud: data.proposed_price_aud ?? 0,
        proposed_hours: data.proposed_hours ?? null,
        timeline_days: data.timeline_days ?? 1,
        certifications: data.certifications ?? [],
        ...(data.deliverables !== undefined && { deliverables: data.deliverables as never }),
        ...(data.proposed_milestones !== undefined && { proposed_milestones: data.proposed_milestones as never }),
        attachment_blob_paths: data.attachment_blob_paths ?? [],
        terms_and_conditions: data.terms_and_conditions ?? null,
      },
    });

    return proposal;
  }

  // ─── PROVIDER: submit proposal ──────────────────────────────────────────────

  async submitProposal(
    invitationId: string,
    providerUserId: string,
    data: SubmitProposalInput,
    contractorProfileId?: string,
    companyId?: string,
  ) {
    const inv = await this.prisma.tenderInvitation.findUnique({
      where: { id: invitationId },
      include: {
        tender: { select: { id: true, status: true, submission_deadline: true, max_proposals: true, proposal_count: true, customer_id: true, title: true } },
        proposal: true,
      },
    });
    if (!inv) throw new AppError('INVITATION_NOT_FOUND', 404);

    const isOwner = companyId
      ? inv.invitee_company_id === companyId
      : inv.invitee_user_id === providerUserId;
    if (!isOwner) throw new AppError('FORBIDDEN', 403);

    if (inv.tender.status !== 'OPEN') throw new AppError('TENDER_CLOSED', 422);
    if (new Date() > inv.tender.submission_deadline) throw new AppError('DEADLINE_PASSED', 422);
    if (inv.status === 'DECLINED') throw new AppError('INVITATION_DECLINED', 422);

    if (inv.tender.proposal_count >= inv.tender.max_proposals) {
      throw new AppError('MAX_PROPOSALS_REACHED', 422, 'Maximum number of proposals reached for this tender.');
    }

    if (inv.proposal && inv.proposal.status !== 'DRAFT') {
      throw new AppError('PROPOSAL_ALREADY_SUBMITTED', 409);
    }

    const now = new Date();

    const proposal = await this.prisma.$transaction(async (tx) => {
      let p;
      if (inv.proposal) {
        p = await tx.tenderProposal.update({
          where: { id: inv.proposal.id },
          data: {
            cover_letter: data.cover_letter,
            solution_details: data.solution_details ?? null,
            approach_notes: data.approach_notes ?? null,
            proposed_price_aud: data.proposed_price_aud,
            proposed_hours: data.proposed_hours ?? null,
            timeline_days: data.timeline_days,
            certifications: data.certifications ?? [],
            ...(data.deliverables !== undefined && { deliverables: data.deliverables as never }),
            ...(data.proposed_milestones !== undefined && { proposed_milestones: data.proposed_milestones as never }),
            ...(data.attachment_blob_paths !== undefined && { attachment_blob_paths: data.attachment_blob_paths }),
            ...(data.terms_and_conditions !== undefined && { terms_and_conditions: data.terms_and_conditions }),
            status: 'SUBMITTED',
            submitted_at: now,
          },
        });
      } else {
        p = await tx.tenderProposal.create({
          data: {
            tender_request_id: inv.tender_request_id,
            invitation_id: invitationId,
            submitted_by_user_id: providerUserId,
            contractor_profile_id: contractorProfileId ?? null,
            company_id: companyId ?? null,
            cover_letter: data.cover_letter,
            solution_details: data.solution_details ?? null,
            approach_notes: data.approach_notes ?? null,
            proposed_price_aud: data.proposed_price_aud,
            proposed_hours: data.proposed_hours ?? null,
            timeline_days: data.timeline_days,
            certifications: data.certifications ?? [],
            ...(data.deliverables !== undefined && { deliverables: data.deliverables as never }),
            ...(data.proposed_milestones !== undefined && { proposed_milestones: data.proposed_milestones as never }),
            attachment_blob_paths: data.attachment_blob_paths ?? [],
            terms_and_conditions: data.terms_and_conditions ?? null,
            status: 'SUBMITTED',
            submitted_at: now,
          },
        });
      }

      await tx.tenderInvitation.update({
        where: { id: invitationId },
        data: { status: 'SUBMITTED' },
      });

      await tx.tenderRequest.update({
        where: { id: inv.tender_request_id },
        data: { proposal_count: { increment: 1 } },
      });

      return p;
    });

    // Notify customer a new proposal arrived
    const customer = await this.prisma.user.findUnique({
      where: { id: inv.tender.customer_id },
      select: { email: true, full_name: true },
    });
    if (customer) {
      void this.emailQueue.add('tender-proposal-received', {
        type: 'tender-proposal-received',
        to: customer.email,
        customer_name: customer.full_name,
        tender_title: inv.tender.title,
        tender_url: buildEmailUrl(`/customer/tenders/${inv.tender_request_id}`),
      }).catch(() => {});
    }

    void writeAudit(this.prisma, {
      actorId: providerUserId,
      actionType: 'TENDER_PROPOSAL_SUBMITTED',
      entityType: 'TenderProposal',
      entityId: proposal.id,
      metadata: { tender_request_id: inv.tender_request_id },
    });

    return proposal;
  }

  // ─── PROVIDER: withdraw proposal ───────────────────────────────────────────

  async withdrawProposal(proposalId: string, providerUserId: string) {
    const proposal = await this.prisma.tenderProposal.findUnique({
      where: { id: proposalId },
      select: {
        id: true,
        submitted_by_user_id: true,
        status: true,
        tender_request_id: true,
      },
    });
    if (!proposal) throw new AppError('PROPOSAL_NOT_FOUND', 404);
    if (proposal.submitted_by_user_id !== providerUserId) throw new AppError('FORBIDDEN', 403);
    if (!['SUBMITTED', 'SHORTLISTED'].includes(proposal.status)) {
      throw new AppError('INVALID_STATE', 422, 'Only SUBMITTED or SHORTLISTED proposals can be withdrawn.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tenderProposal.update({
        where: { id: proposalId },
        data: { status: 'WITHDRAWN', withdrawn_at: new Date() },
      });
      await tx.tenderRequest.update({
        where: { id: proposal.tender_request_id },
        data: { proposal_count: { decrement: 1 } },
      });
      // Reopen the invitation so they could re-submit if desired
      await tx.tenderInvitation.update({
        where: { invitation_id: proposalId } as never,
        data: { status: 'VIEWED' },
      }).catch(() => {}); // best-effort
    });

    return { id: proposalId, status: 'WITHDRAWN' };
  }

  // ─── CUSTOMER: award proposal ───────────────────────────────────────────────
  // This method closes the tender, marks all other proposals rejected, and
  // returns the awarded TenderProposal for use in the order bridge (Phase 9).

  async awardProposal(tenderId: string, proposalId: string, customerId: string) {
    const tender = await this.prisma.tenderRequest.findUnique({
      where: { id: tenderId },
      select: { id: true, customer_id: true, status: true, title: true },
    });
    if (!tender) throw new AppError('TENDER_NOT_FOUND', 404);
    if (tender.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);
    if (!['OPEN', 'CLOSED'].includes(tender.status)) {
      throw new AppError('INVALID_STATE', 422, 'Only OPEN or CLOSED tenders can be awarded.');
    }

    const proposal = await this.prisma.tenderProposal.findUnique({
      where: { id: proposalId },
      include: {
        submitted_by: { select: { id: true, email: true, full_name: true } },
        company: { select: { id: true, company_name: true, primary_admin_id: true } },
        contractor_profile: { select: { id: true, user_id: true } },
      },
    });
    if (!proposal) throw new AppError('PROPOSAL_NOT_FOUND', 404);
    if (proposal.tender_request_id !== tenderId) throw new AppError('PROPOSAL_NOT_FOUND', 404);
    if (!['SUBMITTED', 'SHORTLISTED'].includes(proposal.status)) {
      throw new AppError('INVALID_STATE', 422, 'Can only award a SUBMITTED or SHORTLISTED proposal.');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Mark this proposal as awarded
      await tx.tenderProposal.update({
        where: { id: proposalId },
        data: { status: 'AWARDED', awarded_at: now },
      });

      // Reject all other active proposals
      await tx.tenderProposal.updateMany({
        where: {
          tender_request_id: tenderId,
          id: { not: proposalId },
          status: { in: ['SUBMITTED', 'SHORTLISTED'] },
        },
        data: { status: 'REJECTED', rejected_at: now, rejection_reason: 'Another proposal was selected.' },
      });

      // Mark the winning invitation as AWARDED
      await tx.tenderInvitation.updateMany({
        where: { tender_request_id: tenderId, proposal: { id: proposalId } },
        data: { status: 'AWARDED' },
      });

      // Close the tender
      await tx.tenderRequest.update({
        where: { id: tenderId },
        data: { status: 'AWARDED', awarded_proposal_id: proposalId, closed_at: now },
      });
    });

    // Email the winner
    void this.emailQueue.add('tender-proposal-awarded', {
      type: 'tender-proposal-awarded',
      to: proposal.submitted_by.email,
      provider_name: proposal.submitted_by.full_name,
      tender_title: tender.title,
      tender_url: buildEmailUrl(`/provider/invitations`),
    }).catch(() => {});

    // Email rejected providers
    const rejected = await this.prisma.tenderProposal.findMany({
      where: { tender_request_id: tenderId, status: 'REJECTED', id: { not: proposalId } },
      include: { submitted_by: { select: { email: true, full_name: true } } },
    });
    for (const rej of rejected) {
      void this.emailQueue.add('tender-proposal-rejected', {
        type: 'tender-proposal-rejected',
        to: rej.submitted_by.email,
        provider_name: rej.submitted_by.full_name,
        tender_title: tender.title,
      }).catch(() => {});
    }

    void writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'TENDER_AWARDED',
      entityType: 'TenderRequest',
      entityId: tenderId,
      metadata: { awarded_proposal_id: proposalId },
    });

    // Return the enriched awarded proposal for the order bridge
    return this.prisma.tenderProposal.findUniqueOrThrow({
      where: { id: proposalId },
      include: {
        submitted_by: { select: { id: true, full_name: true, email: true } },
        contractor_profile: { select: { id: true, user_id: true } },
        company: { select: { id: true, company_name: true, primary_admin_id: true } },
        tender: { select: { id: true, scope_snapshot: true, customer_id: true } },
      },
    });
  }

  // ─── CUSTOMER: search providers (Path A) ───────────────────────────────────

  async searchProviders(domain?: string, query?: string) {
    return this.matcher.searchProviders(domain, query, this.prisma);
  }

  // ─── Notify winning company that a PO has been created ─────────────────────

  async notifyOrderCreated(params: {
    to: string;
    companyName: string;
    orderId: string;
    scopeTitle: string;
  }): Promise<void> {
    await this.emailQueue.add('tender-order-created', {
      type: 'tender-order-created',
      to: params.to,
      company_name: params.companyName,
      order_id: params.orderId,
      scope_title: params.scopeTitle,
      order_url: buildEmailUrl(`/company/orders/${params.orderId}`),
    });
  }

  // ─── Private: send invitation emails ───────────────────────────────────────

  private async sendInvitationEmails(
    tenderId: string,
    tenderTitle: string,
    deadline: Date,
  ) {
    const invitations = await this.prisma.tenderInvitation.findMany({
      where: { tender_request_id: tenderId },
      include: {
        invitee_user: { select: { email: true, full_name: true } },
        invitee_company: {
          select: {
            company_name: true,
            primary_admin: { select: { email: true, full_name: true } },
          },
        },
      },
    });

    for (const inv of invitations) {
      const recipient = inv.invitee_user
        ? { email: inv.invitee_user.email, name: inv.invitee_user.full_name }
        : inv.invitee_company
          ? { email: inv.invitee_company.primary_admin.email, name: inv.invitee_company.primary_admin.full_name }
          : null;

      if (!recipient) continue;

      void this.emailQueue.add('tender-invitation', {
        type: 'tender-invitation',
        to: recipient.email,
        provider_name: recipient.name,
        tender_title: tenderTitle,
        tender_url: buildEmailUrl(`/provider/invitations/${inv.id}`),
        deadline: deadline.toISOString(),
      }).catch(() => {});
    }
  }

  // Mirror of sendInvitationEmails for the deadline-extension flow. We skip
  // invitees who already declined / withdrew — they've opted out and don't
  // need the extension notice. Awarded/closed paths are also skipped because
  // we only allow extension while status=OPEN.
  private async sendDeadlineExtendedEmails(params: {
    tenderId: string;
    tenderTitle: string;
    previousDeadline: Date;
    newDeadline: Date;
    reason: string | null;
  }) {
    // Skip DECLINED — the invitee opted out, no point sending extension news.
    // PENDING / VIEWED / SUBMITTED are still actionable (a SUBMITTED proposal
    // can be revised before the new deadline).
    const ACTIONABLE_INVITATIONS = ['PENDING', 'VIEWED', 'SUBMITTED'] as const;
    const invitations = await this.prisma.tenderInvitation.findMany({
      where: {
        tender_request_id: params.tenderId,
        status: { in: ACTIONABLE_INVITATIONS as never },
      },
      include: {
        invitee_user: { select: { email: true, full_name: true } },
        invitee_company: {
          select: {
            company_name: true,
            primary_admin: { select: { email: true, full_name: true } },
          },
        },
      },
    });

    for (const inv of invitations) {
      const recipient = inv.invitee_user
        ? { email: inv.invitee_user.email, name: inv.invitee_user.full_name }
        : inv.invitee_company
          ? { email: inv.invitee_company.primary_admin.email, name: inv.invitee_company.primary_admin.full_name }
          : null;

      if (!recipient) continue;

      void this.emailQueue.add('tender-deadline-extended', {
        type: 'tender-deadline-extended',
        to: recipient.email,
        provider_name: recipient.name,
        tender_title: params.tenderTitle,
        tender_url: buildEmailUrl(`/provider/invitations/${inv.id}`),
        previous_deadline: params.previousDeadline.toISOString(),
        new_deadline: params.newDeadline.toISOString(),
        reason: params.reason,
      }).catch(() => {});
    }
  }
}
