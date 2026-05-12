import { Queue } from 'bullmq';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { GenerateScopeInput, AcceptScopeInput, RegenerateSectionInput } from '@onys/shared';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';

// ─── Job data types (must match apps/workers/src/jobs/ai-scoping.worker.ts) ──

type FullScopeJobData = {
  type: 'full';
  pendingScopeId: string;
};

type SectionJobData = {
  type: 'section';
  pendingScopeId: string;
  section: string;
  feedback?: string;
};

type AiScopingJobData = FullScopeJobData | SectionJobData;

// ─── ScopingService ───────────────────────────────────────────────────────────

export class ScopingService {
  private readonly scopingQueue: Queue<AiScopingJobData>;

  constructor(private readonly prisma: PrismaClient) {
    this.scopingQueue = new Queue<AiScopingJobData>(
      process.env.AI_SCOPING_QUEUE_NAME ?? 'ai-scoping',
      {
        connection: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
        },
      },
    );
  }

  // ─── METHOD 1: queueScopingJob ─────────────────────────────────────────────

  async queueScopingJob(
    customerId: string,
    data: GenerateScopeInput,
    meta: { ip: string; userAgent: string },
  ): Promise<{ job_id: string; status: 'PENDING' }> {
    // 1. Verify account type is CUSTOMER
    const user = await this.prisma.user.findUnique({
      where: { id: customerId },
      select: { account_type: true },
    });
    if (!user || user.account_type !== 'CUSTOMER') {
      throw new AppError('WRONG_ACCOUNT_TYPE', 403);
    }

    // 2. Create PendingScope record
    const pendingScope = await this.prisma.pendingScope.create({
      data: {
        customer_id: customerId,
        requirement_text: data.requirement_text,
        context: (data.context ?? null) as Prisma.InputJsonValue,
        domain_hint: data.domain_hint ?? null,
        status: 'PENDING',
      },
    });

    // 3. Enqueue BullMQ job
    const bullJob = await this.scopingQueue.add(
      'generate-scope',
      { type: 'full', pendingScopeId: pendingScope.id },
      {
        removeOnComplete: { age: 7 * 24 * 60 * 60 },  // keep 7 days
        removeOnFail: { age: 30 * 24 * 60 * 60 },     // keep 30 days
      },
    );

    // 4. Store BullMQ job ID
    await this.prisma.pendingScope.update({
      where: { id: pendingScope.id },
      data: { bullmq_job_id: bullJob.id ?? null },
    });

    // 5. Audit
    await writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'SCOPE_JOB_QUEUED',
      entityType: 'PendingScope',
      entityId: pendingScope.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        domain_hint: data.domain_hint ?? null,
        customer_id: customerId,
      },
    });

    // 6. Return immediately — Claude call happens async in worker
    return { job_id: pendingScope.id, status: 'PENDING' };
  }

  // ─── METHOD 2: getJobStatus ────────────────────────────────────────────────

  async getJobStatus(jobId: string, customerId: string) {
    const pending = await this.prisma.pendingScope.findFirst({
      where: { id: jobId, customer_id: customerId },
    });
    if (!pending) throw new AppError('JOB_NOT_FOUND', 404);

    return {
      status: pending.status,
      scope: pending.ai_scope,
      error: pending.last_error,
      attempts: pending.attempts,
      has_customer_edits: pending.has_customer_edits,
      regen_log: pending.regen_log,
      created_at: pending.created_at,
      updated_at: pending.updated_at,
    };
  }

  // ─── METHOD 3: acceptScope ─────────────────────────────────────────────────

  async acceptScope(
    jobId: string,
    customerId: string,
    data: AcceptScopeInput,
    meta: { ip: string; userAgent: string },
  ): Promise<{
    job_id: string;
    message: string;
    has_customer_edits: boolean;
    edited_fields: string[];
  }> {
    // 1. Find record
    const pending = await this.prisma.pendingScope.findFirst({
      where: { id: jobId, customer_id: customerId },
    });
    if (!pending) throw new AppError('JOB_NOT_FOUND', 404);

    // 2. Check scope is ready
    if (pending.status !== 'COMPLETE') {
      throw new AppError('SCOPE_NOT_READY', 422);
    }

    // 3. Check not already accepted
    if (pending.accepted_at) {
      throw new AppError('SCOPE_ALREADY_ACCEPTED', 409);
    }

    // 4. Detect customer edits
    const aiScope = (pending.ai_scope ?? {}) as Record<string, unknown>;
    const editedFields: string[] = [];
    const fieldsToCompare = [
      'title', 'domain', 'objective', 'in_scope', 'out_of_scope',
      'assumptions', 'prerequisites', 'deliverables',
      'price', 'hours_min', 'hours_max', 'milestone_count',
    ];
    for (const field of fieldsToCompare) {
      const original = JSON.stringify(aiScope[field]);
      const submitted = JSON.stringify((data.scope as Record<string, unknown>)[field]);
      if (original !== submitted) editedFields.push(field);
    }
    const hasEdits = editedFields.length > 0;

    // 5. Store accepted scope
    await this.prisma.pendingScope.update({
      where: { id: jobId },
      data: {
        accepted_scope: data.scope as Prisma.InputJsonValue,
        has_customer_edits: hasEdits,
        edited_fields: editedFields,
        accepted_at: new Date(),
      },
    });

    // 6. Audit
    await writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'SCOPE_ACCEPTED',
      entityType: 'PendingScope',
      entityId: jobId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        has_customer_edits: hasEdits,
        edited_fields: editedFields,
        customer_id: customerId,
      },
    });

    // 7. Return
    return {
      job_id: jobId,
      message: hasEdits
        ? 'Scope accepted with your modifications. You can now place your order.'
        : 'AI-generated scope accepted. You can now place your order.',
      has_customer_edits: hasEdits,
      edited_fields: editedFields,
    };
  }

  // ─── METHOD 4: queueSectionRegen ──────────────────────────────────────────

  async queueSectionRegen(
    jobId: string,
    customerId: string,
    data: RegenerateSectionInput,
  ): Promise<{ job_id: string; status: 'PENDING'; section: string }> {
    // 1. Find record
    const pending = await this.prisma.pendingScope.findFirst({
      where: { id: jobId, customer_id: customerId },
    });
    if (!pending) throw new AppError('JOB_NOT_FOUND', 404);

    // 2. Must be COMPLETE to regen
    if (pending.status !== 'COMPLETE') {
      throw new AppError('SCOPE_NOT_READY', 422);
    }

    // 3. Cannot regen an already-accepted scope
    if (pending.accepted_at) {
      throw new AppError('SCOPE_ALREADY_ACCEPTED', 409);
    }

    // 4. Mark PROCESSING to block duplicate regens
    await this.prisma.pendingScope.update({
      where: { id: jobId },
      data: { status: 'PROCESSING' },
    });

    // 5. Enqueue section regen job
    await this.scopingQueue.add(
      'regen-section',
      {
        type: 'section',
        pendingScopeId: jobId,
        section: data.section,
        ...(data.feedback !== undefined && { feedback: data.feedback }),
      },
      {
        removeOnComplete: { age: 7 * 24 * 60 * 60 },
        removeOnFail: { age: 30 * 24 * 60 * 60 },
      },
    );

    // 6. Audit
    await writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'SCOPE_SECTION_REGEN',
      entityType: 'PendingScope',
      entityId: jobId,
      metadata: {
        section: data.section,
        feedback: data.feedback ?? null,
      },
    });

    // 7. Return
    return { job_id: jobId, status: 'PENDING', section: data.section };
  }
}
