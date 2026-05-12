import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { AppError } from '../lib/errors.js';
import { writeAudit } from '../utils/audit.js';
import type { SubscriptionService } from './subscription.service.js';

type EmailJobPayload = { type: string; to?: string; [key: string]: unknown };

// ─── Activity log helpers ─────────────────────────────────────────────────────

interface ActivityEntry {
  at: string;
  actor_id: string | null;
  actor_name?: string;
  event: string;
  detail?: string;
}

function makeEntry(
  actorId: string | null,
  event: string,
  detail?: string,
): ActivityEntry {
  return {
    at: new Date().toISOString(),
    actor_id: actorId,
    event,
    ...(detail !== undefined ? { detail } : {}),
  };
}

async function appendActivity(
  prisma: PrismaClient,
  contractId: string,
  entry: ActivityEntry,
): Promise<void> {
  const contract = await prisma.tenderContract.findUnique({
    where: { id: contractId },
    select: { activity_log: true },
  });
  const log = (contract?.activity_log as unknown as ActivityEntry[]) ?? [];
  await prisma.tenderContract.update({
    where: { id: contractId },
    data: { activity_log: [...log, entry] as unknown as Prisma.InputJsonValue },
  });
}

// ─── TenderContractService ────────────────────────────────────────────────────

export class TenderContractService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
    private readonly subscriptions?: SubscriptionService,
  ) {}

  // ── CREATE from awarded tender ──────────────────────────────────────────────

  async createContract(tenderId: string, customerId: string) {
    // 1. Load tender — must be AWARDED and owned by this customer
    const tender = await this.prisma.tenderRequest.findUnique({
      where: { id: tenderId },
      include: {
        contract: { select: { id: true } },
        awarded_proposal: {
          include: {
            company: { select: { id: true, company_name: true, primary_admin_id: true } },
            contractor_profile: { select: { id: true, user_id: true } },
            submitted_by: { select: { id: true, full_name: true, email: true } },
          },
        },
      },
    });

    if (!tender) throw new AppError('TENDER_NOT_FOUND', 404);
    if (tender.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);
    if (tender.status !== 'AWARDED') {
      throw new AppError('TENDER_NOT_AWARDED', 422, 'Tender must be AWARDED before creating a contract.');
    }
    if (tender.contract) {
      throw new AppError('CONTRACT_ALREADY_EXISTS', 409, 'A contract already exists for this tender.');
    }
    if (!tender.awarded_proposal) {
      throw new AppError('NO_AWARDED_PROPOSAL', 422, 'No awarded proposal found.');
    }

    const proposal = tender.awarded_proposal;
    const scope = tender.scope_snapshot as Record<string, unknown>;

    // Check the supplier's active_contracts limit BEFORE creating the row.
    // For an individual contractor: their own personal subscription.
    // For a company proposal: getEffectiveSubscription resolves to the
    // company subscription when called with any active member's user_id.
    if (this.subscriptions) {
      const supplierUserId =
        proposal.contractor_profile?.user_id ??
        proposal.company?.primary_admin_id ??
        null;
      if (supplierUserId) {
        const check = await this.subscriptions.checkLimit(
          supplierUserId,
          'active_contracts',
        );
        if (!check.allowed) {
          throw new AppError(
            'SUPPLIER_AT_CONTRACT_CAPACITY',
            422,
            `The selected supplier is at their plan's active-contract capacity (${check.current} / ${check.limit ?? 0} on the ${check.plan_name ?? 'free'} plan). Pick another proposal or wait for them to complete an existing contract.`,
          );
        }
      }
    }

    // 2. Build milestones from proposal (if any)
    const proposalMilestones = (proposal.proposed_milestones as Array<{
      name: string; amount: number; due_date?: string; description?: string;
    }> | null) ?? [];

    const proposalDeliverables = (proposal.deliverables as Array<{
      title: string; description?: string;
    }> | null) ?? [];

    // 3. Create contract + milestones + deliverables atomically
    const contract = await this.prisma.$transaction(async (tx) => {
      const c = await tx.tenderContract.create({
        data: {
          tender_request_id: tenderId,
          proposal_id: proposal.id,
          customer_id: customerId,
          company_id: proposal.company_id ?? null,
          contractor_user_id: proposal.contractor_profile?.user_id ?? null,
          agreed_price_aud: proposal.proposed_price_aud,
          agreed_timeline_days: proposal.timeline_days,
          agreed_hours: proposal.proposed_hours ?? null,
          scope_snapshot: scope as Prisma.InputJsonValue,
          deliverables_snapshot: proposalDeliverables.length
            ? (proposalDeliverables as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          activity_log: [
            makeEntry(customerId, 'CONTRACT_CREATED', 'Contract created from awarded tender'),
          ] as unknown as Prisma.InputJsonValue,
        },
      });

      // Create milestone rows from proposal milestones
      if (proposalMilestones.length > 0) {
        await tx.tenderMilestone.createMany({
          data: proposalMilestones.map((m, i) => ({
            contract_id: c.id,
            sort_order: i,
            name: m.name,
            description: m.description ?? null,
            amount_aud: m.amount,
            due_date: m.due_date ? new Date(m.due_date) : null,
          })),
        });
      }

      // Create deliverable rows
      if (proposalDeliverables.length > 0) {
        await tx.tenderDeliverable.createMany({
          data: proposalDeliverables.map((d, i) => ({
            contract_id: c.id,
            sort_order: i,
            title: d.title,
            description: d.description ?? null,
          })),
        });
      }

      return c;
    });

    // 4. Audit
    void writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'TENDER_CONTRACT_CREATED',
      entityType: 'TenderContract',
      entityId: contract.id,
      metadata: { tender_id: tenderId, proposal_id: proposal.id, company_id: proposal.company_id },
    });

    // 5. Notify winning provider
    const recipientEmail = proposal.company?.primary_admin_id
      ? await this.prisma.user
          .findUnique({ where: { id: proposal.company.primary_admin_id }, select: { email: true } })
          .then((u) => u?.email)
      : proposal.submitted_by.email;

    if (recipientEmail) {
      void this.emailQueue
        .add('tender-contract-created', {
          type: 'tender-contract-created',
          to: recipientEmail,
          contract_id: contract.id,
          provider_name: proposal.company?.company_name ?? proposal.submitted_by.full_name,
          scope_title: String(scope.title ?? 'Your awarded tender'),
        })
        .catch(() => {});
    }

    return this.getContract(contract.id, customerId);
  }

  // ── GET contract (customer or provider) ────────────────────────────────────

  async getContract(contractId: string, requestingUserId: string, companyId?: string) {
    const c = await this.prisma.tenderContract.findUnique({
      where: { id: contractId },
      include: {
        tender: {
          select: { id: true, title: true, domain: true, status: true, scope_snapshot: true },
        },
        proposal: {
          select: {
            id: true,
            cover_letter: true,
            solution_details: true,
            approach_notes: true,
            proposed_price_aud: true,
            timeline_days: true,
            proposed_hours: true,
            proposed_milestones: true,
            deliverables: true,
            attachment_blob_paths: true,
            submitted_by: { select: { id: true, full_name: true, email: true } },
          },
        },
        customer: { select: { id: true, full_name: true, email: true } },
        company: { select: { id: true, company_name: true, logo_blob_path: true } },
        contractor: { select: { id: true, full_name: true, email: true } },
        milestones: { orderBy: { sort_order: 'asc' } },
        deliverables: { orderBy: { sort_order: 'asc' } },
      },
    });

    if (!c) throw new AppError('CONTRACT_NOT_FOUND', 404);

    // Access check: customer, company member, or contractor
    const isCustomer = c.customer_id === requestingUserId;
    const isCompany = companyId ? c.company_id === companyId : false;
    const isContractor = c.contractor_user_id === requestingUserId;
    if (!isCustomer && !isCompany && !isContractor) throw new AppError('FORBIDDEN', 403);

    return c;
  }

  // ── LIST contracts for customer ─────────────────────────────────────────────

  async listCustomerContracts(customerId: string) {
    return this.prisma.tenderContract.findMany({
      where: { customer_id: customerId },
      include: {
        company: { select: { id: true, company_name: true } },
        contractor: { select: { id: true, full_name: true } },
        milestones: { select: { id: true, status: true, amount_aud: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  // ── LIST contracts for company ──────────────────────────────────────────────

  async listCompanyContracts(companyId: string) {
    return this.prisma.tenderContract.findMany({
      where: { company_id: companyId },
      include: {
        customer: { select: { id: true, full_name: true } },
        milestones: { select: { id: true, status: true, amount_aud: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async listContractorContracts(userId: string) {
    return this.prisma.tenderContract.findMany({
      where: { contractor_user_id: userId },
      include: {
        customer: { select: { id: true, full_name: true } },
        milestones: { select: { id: true, status: true, amount_aud: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  // ── ACKNOWLEDGE (company accepts the contract) ──────────────────────────────

  async acknowledgeContract(contractId: string, userId: string, companyId?: string) {
    const c = await this.prisma.tenderContract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, company_id: true, contractor_user_id: true, customer_id: true },
    });
    if (!c) throw new AppError('CONTRACT_NOT_FOUND', 404);

    const isProvider = companyId ? c.company_id === companyId : c.contractor_user_id === userId;
    if (!isProvider) throw new AppError('FORBIDDEN', 403);
    if (c.status !== 'PENDING') throw new AppError('INVALID_STATE', 422, 'Contract is not in PENDING state.');

    await this.prisma.tenderContract.update({
      where: { id: contractId },
      data: { status: 'ACTIVE', accepted_at: new Date() },
    });

    await appendActivity(this.prisma, contractId, makeEntry(userId, 'CONTRACT_ACKNOWLEDGED', 'Provider acknowledged the contract — work can begin'));

    void writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'TENDER_CONTRACT_ACKNOWLEDGED',
      entityType: 'TenderContract',
      entityId: contractId,
      metadata: { company_id: companyId },
    });

    // Notify customer
    const customer = await this.prisma.user.findUnique({
      where: { id: c.customer_id },
      select: { email: true, full_name: true },
    });
    if (customer?.email) {
      void this.emailQueue
        .add('tender-contract-acknowledged', {
          type: 'tender-contract-acknowledged',
          to: customer.email,
          contract_id: contractId,
        })
        .catch(() => {});
    }
  }

  // ── START milestone (company marks as in-progress) ──────────────────────────

  async startMilestone(contractId: string, milestoneId: string, userId: string, companyId?: string) {
    const { c, ms } = await this.loadMilestoneForProvider(contractId, milestoneId, userId, companyId);

    if (!['ACTIVE', 'IN_PROGRESS'].includes(c.status)) {
      throw new AppError('INVALID_STATE', 422, 'Contract must be ACTIVE to start a milestone.');
    }
    if (ms.status !== 'PENDING') throw new AppError('INVALID_STATE', 422, 'Milestone is not PENDING.');

    await this.prisma.$transaction([
      this.prisma.tenderMilestone.update({
        where: { id: milestoneId },
        data: { status: 'IN_PROGRESS' },
      }),
      this.prisma.tenderContract.update({
        where: { id: contractId },
        data: { status: 'IN_PROGRESS' },
      }),
    ]);

    await appendActivity(this.prisma, contractId, makeEntry(userId, 'MILESTONE_STARTED', `Milestone "${ms.name}" started`));

    void writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'TENDER_MILESTONE_STARTED',
      entityType: 'TenderMilestone',
      entityId: milestoneId,
      metadata: { contract_id: contractId },
    });
  }

  // ── SUBMIT milestone (company says it's done) ───────────────────────────────

  async submitMilestone(
    contractId: string,
    milestoneId: string,
    userId: string,
    data: { completion_notes?: string | undefined; evidence_blob_paths?: string[] | undefined },
    companyId?: string,
  ) {
    const { c, ms } = await this.loadMilestoneForProvider(contractId, milestoneId, userId, companyId);

    if (!['ACTIVE', 'IN_PROGRESS'].includes(c.status)) {
      throw new AppError('INVALID_STATE', 422, 'Contract must be ACTIVE or IN_PROGRESS.');
    }
    if (!['PENDING', 'IN_PROGRESS'].includes(ms.status)) {
      throw new AppError('INVALID_STATE', 422, 'Milestone cannot be submitted in its current state.');
    }

    await this.prisma.tenderMilestone.update({
      where: { id: milestoneId },
      data: {
        status: 'SUBMITTED',
        submitted_at: new Date(),
        completion_notes: data.completion_notes ?? null,
        evidence_blob_paths: data.evidence_blob_paths ?? [],
      },
    });

    await appendActivity(this.prisma, contractId, makeEntry(userId, 'MILESTONE_SUBMITTED', `Milestone "${ms.name}" submitted for approval`));

    void writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'TENDER_MILESTONE_SUBMITTED',
      entityType: 'TenderMilestone',
      entityId: milestoneId,
      metadata: { contract_id: contractId },
    });

    // Notify customer
    const customer = await this.prisma.user.findUnique({
      where: { id: c.customer_id },
      select: { email: true },
    });
    if (customer?.email) {
      void this.emailQueue
        .add('tender-milestone-submitted', {
          type: 'tender-milestone-submitted',
          to: customer.email,
          contract_id: contractId,
          milestone_name: ms.name,
        })
        .catch(() => {});
    }
  }

  // ── APPROVE milestone (customer) ────────────────────────────────────────────

  async approveMilestone(contractId: string, milestoneId: string, customerId: string) {
    const c = await this.prisma.tenderContract.findUnique({
      where: { id: contractId },
      select: { id: true, customer_id: true, status: true, company_id: true, contractor_user_id: true },
    });
    if (!c) throw new AppError('CONTRACT_NOT_FOUND', 404);
    if (c.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);

    const ms = await this.prisma.tenderMilestone.findUnique({
      where: { id: milestoneId },
      select: { id: true, contract_id: true, status: true, name: true },
    });
    if (!ms || ms.contract_id !== contractId) throw new AppError('MILESTONE_NOT_FOUND', 404);
    if (ms.status !== 'SUBMITTED') throw new AppError('INVALID_STATE', 422, 'Milestone must be SUBMITTED before approval.');

    await this.prisma.tenderMilestone.update({
      where: { id: milestoneId },
      data: { status: 'APPROVED', approved_at: new Date(), approved_by_id: customerId },
    });

    // Check if all milestones are now approved → auto-complete contract
    const remaining = await this.prisma.tenderMilestone.count({
      where: { contract_id: contractId, status: { notIn: ['APPROVED', 'PAID'] } },
    });

    if (remaining === 0) {
      await this.prisma.tenderContract.update({
        where: { id: contractId },
        data: { status: 'COMPLETED', completed_at: new Date() },
      });
      await appendActivity(this.prisma, contractId, makeEntry(customerId, 'CONTRACT_COMPLETED', 'All milestones approved — contract completed'));
    }

    await appendActivity(this.prisma, contractId, makeEntry(customerId, 'MILESTONE_APPROVED', `Milestone "${ms.name}" approved by customer`));

    void writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'TENDER_MILESTONE_APPROVED',
      entityType: 'TenderMilestone',
      entityId: milestoneId,
      metadata: { contract_id: contractId },
    });

    // Notify provider
    const providerId = c.contractor_user_id ?? null;
    const providerNotifyId = c.company_id
      ? await this.prisma.consultingCompany
          .findUnique({ where: { id: c.company_id }, select: { primary_admin_id: true } })
          .then((co) => co?.primary_admin_id ?? null)
      : providerId;

    if (providerNotifyId) {
      const providerUser = await this.prisma.user.findUnique({
        where: { id: providerNotifyId },
        select: { email: true },
      });
      if (providerUser?.email) {
        void this.emailQueue
          .add('tender-milestone-approved', {
            type: 'tender-milestone-approved',
            to: providerUser.email,
            contract_id: contractId,
            milestone_name: ms.name,
          })
          .catch(() => {});
      }
    }
  }

  // ── REQUEST REVISION on milestone (customer sends back) ────────────────────

  async requestMilestoneRevision(
    contractId: string,
    milestoneId: string,
    customerId: string,
    reason: string,
  ) {
    const c = await this.prisma.tenderContract.findUnique({
      where: { id: contractId },
      select: { id: true, customer_id: true, company_id: true, contractor_user_id: true },
    });
    if (!c) throw new AppError('CONTRACT_NOT_FOUND', 404);
    if (c.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);

    const ms = await this.prisma.tenderMilestone.findUnique({
      where: { id: milestoneId },
      select: { id: true, contract_id: true, status: true, name: true },
    });
    if (!ms || ms.contract_id !== contractId) throw new AppError('MILESTONE_NOT_FOUND', 404);
    if (ms.status !== 'SUBMITTED') throw new AppError('INVALID_STATE', 422, 'Milestone must be SUBMITTED to request revision.');

    await this.prisma.tenderMilestone.update({
      where: { id: milestoneId },
      data: { status: 'IN_PROGRESS', submitted_at: null },
    });

    await appendActivity(this.prisma, contractId, makeEntry(customerId, 'MILESTONE_REVISION_REQUESTED', `Revision requested for "${ms.name}": ${reason}`));

    void writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'TENDER_MILESTONE_REVISION_REQUESTED',
      entityType: 'TenderMilestone',
      entityId: milestoneId,
      metadata: { contract_id: contractId, reason },
    });
  }

  // ── COMPLETE deliverable ────────────────────────────────────────────────────

  async completeDeliverable(
    contractId: string,
    deliverableId: string,
    userId: string,
    companyId?: string,
  ) {
    const c = await this.prisma.tenderContract.findUnique({
      where: { id: contractId },
      select: { id: true, company_id: true, contractor_user_id: true },
    });
    if (!c) throw new AppError('CONTRACT_NOT_FOUND', 404);

    const isProvider = companyId ? c.company_id === companyId : c.contractor_user_id === userId;
    if (!isProvider) throw new AppError('FORBIDDEN', 403);

    const d = await this.prisma.tenderDeliverable.findUnique({
      where: { id: deliverableId },
      select: { id: true, contract_id: true, title: true, completed: true },
    });
    if (!d || d.contract_id !== contractId) throw new AppError('DELIVERABLE_NOT_FOUND', 404);

    await this.prisma.tenderDeliverable.update({
      where: { id: deliverableId },
      data: { completed: !d.completed, completed_at: d.completed ? null : new Date(), completed_by_id: d.completed ? null : userId },
    });

    await appendActivity(
      this.prisma,
      contractId,
      makeEntry(userId, d.completed ? 'DELIVERABLE_UNMARKED' : 'DELIVERABLE_COMPLETED', `Deliverable "${d.title}" ${d.completed ? 'unmarked' : 'marked as complete'}`),
    );
  }

  // ── ADD NOTE (customer or provider) ────────────────────────────────────────

  async addNote(contractId: string, userId: string, note: string, companyId?: string) {
    const c = await this.prisma.tenderContract.findUnique({
      where: { id: contractId },
      select: { id: true, customer_id: true, company_id: true, contractor_user_id: true },
    });
    if (!c) throw new AppError('CONTRACT_NOT_FOUND', 404);

    const isParty =
      c.customer_id === userId ||
      (companyId ? c.company_id === companyId : false) ||
      c.contractor_user_id === userId;
    if (!isParty) throw new AppError('FORBIDDEN', 403);

    await appendActivity(this.prisma, contractId, makeEntry(userId, 'NOTE_ADDED', note));
  }

  // ── CANCEL contract ─────────────────────────────────────────────────────────

  async cancelContract(contractId: string, userId: string, reason: string, companyId?: string) {
    const c = await this.prisma.tenderContract.findUnique({
      where: { id: contractId },
      select: { id: true, customer_id: true, company_id: true, contractor_user_id: true, status: true },
    });
    if (!c) throw new AppError('CONTRACT_NOT_FOUND', 404);

    const isParty =
      c.customer_id === userId ||
      (companyId ? c.company_id === companyId : false) ||
      c.contractor_user_id === userId;
    if (!isParty) throw new AppError('FORBIDDEN', 403);

    if (['COMPLETED', 'CANCELLED'].includes(c.status)) {
      throw new AppError('INVALID_STATE', 422, 'Contract is already completed or cancelled.');
    }

    await this.prisma.tenderContract.update({
      where: { id: contractId },
      data: { status: 'CANCELLED', cancelled_at: new Date(), cancellation_reason: reason },
    });

    await appendActivity(this.prisma, contractId, makeEntry(userId, 'CONTRACT_CANCELLED', reason));

    void writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'TENDER_CONTRACT_CANCELLED',
      entityType: 'TenderContract',
      entityId: contractId,
      metadata: { reason },
    });
  }

  // ── UPLOAD evidence (binary, stored separately from save) ──────────────────

  async appendMilestoneEvidence(
    contractId: string,
    milestoneId: string,
    userId: string,
    blobPath: string,
    companyId?: string,
  ) {
    const { ms } = await this.loadMilestoneForProvider(contractId, milestoneId, userId, companyId);

    const existing = ms.evidence_blob_paths as string[];
    await this.prisma.tenderMilestone.update({
      where: { id: milestoneId },
      data: { evidence_blob_paths: [...existing, blobPath] },
    });

    await appendActivity(this.prisma, contractId, makeEntry(userId, 'EVIDENCE_UPLOADED', `Evidence file uploaded for milestone "${ms.name}"`));
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async loadMilestoneForProvider(
    contractId: string,
    milestoneId: string,
    userId: string,
    companyId?: string,
  ) {
    const c = await this.prisma.tenderContract.findUnique({
      where: { id: contractId },
      select: { id: true, customer_id: true, company_id: true, contractor_user_id: true, status: true },
    });
    if (!c) throw new AppError('CONTRACT_NOT_FOUND', 404);

    const isProvider = companyId ? c.company_id === companyId : c.contractor_user_id === userId;
    if (!isProvider) throw new AppError('FORBIDDEN', 403);

    const ms = await this.prisma.tenderMilestone.findUnique({
      where: { id: milestoneId },
      select: { id: true, contract_id: true, status: true, name: true, evidence_blob_paths: true },
    });
    if (!ms || ms.contract_id !== contractId) throw new AppError('MILESTONE_NOT_FOUND', 404);

    return { c, ms };
  }
}
