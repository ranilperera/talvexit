import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { ScopeInput, UpdateTaskInput, TaskSearchInput } from '@onys/shared';
import { convertToAUD } from '../utils/currency.js';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';

// ─── Row type returned from $queryRaw FTS query ───────────────────────────────
interface TaskFtsRow {
  id: string;
}

export class TaskService {
  constructor(private readonly prisma: PrismaClient) {}

  // ─── METHOD 1: createTask ──────────────────────────────────────────────────

  async createTask(data: ScopeInput, userId: string, accountType: string) {
    // 1. Resolve owner and verify eligibility
    let contractorProfileId: string | undefined;
    let orgId: string | undefined;

    if (accountType === 'INDIVIDUAL_CONTRACTOR') {
      const profile = await this.prisma.contractorProfile.findUnique({
        where: { user_id: userId },
        select: { id: true, status: true },
      });
      if (!profile) throw new AppError('CONTRACTOR_NOT_FOUND', 404);
      if (profile.status !== 'ACTIVE') throw new AppError('CONTRACTOR_NOT_ACTIVE', 403);
      contractorProfileId = profile.id;
    } else if (accountType === 'ORGANIZATION_ADMIN' || accountType === 'ORG_MEMBER') {
      const org = await this.prisma.organisation.findFirst({
        where: { admin_user_id: userId },
        select: { id: true, verification_status: true },
      });
      if (!org) throw new AppError('ORG_NOT_FOUND', 404);
      if (org.verification_status !== 'VERIFIED') throw new AppError('ORG_NOT_VERIFIED', 403);
      orgId = org.id;
    } else {
      throw new AppError('FORBIDDEN', 403);
    }

    // 2. Convert price to AUD
    const priceAud = convertToAUD(data.price, data.currency ?? 'AUD');

    // 3. Atomic transaction: Task + TaskMilestones
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          created_by_user_id: userId,
          contractor_profile_id: contractorProfileId ?? null,
          org_id: orgId ?? null,
          title: data.title,
          domain: data.domain,
          objective: data.objective,
          in_scope: data.in_scope,
          out_of_scope: data.out_of_scope,
          assumptions: data.assumptions,
          prerequisites: data.prerequisites ?? [],
          deliverables: data.deliverables,
          currency: data.currency ?? 'AUD',
          price: new Prisma.Decimal(data.price),
          price_aud: new Prisma.Decimal(priceAud),
          hours_min: data.hours_min,
          hours_max: data.hours_max,
          milestone_count: data.milestone_count ?? 1,
          status: 'DRAFT',
        },
      });

      if (data.milestones && data.milestones.length > 0) {
        await tx.taskMilestone.createMany({
          data: data.milestones.map((m) => ({
            task_id: created.id,
            sequence: m.sequence,
            name: m.name,
            description: m.description,
            percentage_of_total: m.percentage_of_total,
          })),
        });
      }

      return created;
    });

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'TASK_CREATED',
      entityType: 'Task',
      entityId: task.id,
      metadata: { title: task.title, domain: task.domain },
    });

    return task;
  }

  // ─── METHOD 2: updateTask ──────────────────────────────────────────────────

  async updateTask(taskId: string, data: UpdateTaskInput, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        created_by_user_id: true,
        status: true,
        active_order_count: true,
        currency: true,
        price: true,
      },
    });
    if (!task) throw new AppError('TASK_NOT_FOUND', 404);
    if (task.created_by_user_id !== userId) throw new AppError('FORBIDDEN', 403);
    if (task.status === 'ARCHIVED') throw new AppError('TASK_ARCHIVED', 409);
    if (task.active_order_count > 0) throw new AppError('TASK_HAS_ACTIVE_ORDERS', 409);

    // Recalculate price_aud if price or currency changed
    let priceAud: number | undefined;
    if (data.price !== undefined || data.currency !== undefined) {
      const newPrice = data.price ?? Number(task.price);
      const newCurrency = data.currency ?? task.currency;
      priceAud = convertToAUD(newPrice, newCurrency);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Delete and recreate milestones if provided
      if (data.milestones !== undefined) {
        await tx.taskMilestone.deleteMany({ where: { task_id: taskId } });
        if (data.milestones.length > 0) {
          await tx.taskMilestone.createMany({
            data: data.milestones.map((m) => ({
              task_id: taskId,
              sequence: m.sequence,
              name: m.name,
              description: m.description,
              percentage_of_total: m.percentage_of_total,
            })),
          });
        }
      }

      return tx.task.update({
        where: { id: taskId },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.domain !== undefined && { domain: data.domain }),
          ...(data.objective !== undefined && { objective: data.objective }),
          ...(data.in_scope !== undefined && { in_scope: data.in_scope }),
          ...(data.out_of_scope !== undefined && { out_of_scope: data.out_of_scope }),
          ...(data.assumptions !== undefined && { assumptions: data.assumptions }),
          ...(data.prerequisites !== undefined && { prerequisites: data.prerequisites }),
          ...(data.deliverables !== undefined && { deliverables: data.deliverables }),
          ...(data.currency !== undefined && { currency: data.currency }),
          ...(data.price !== undefined && { price: new Prisma.Decimal(data.price) }),
          ...(priceAud !== undefined && { price_aud: new Prisma.Decimal(priceAud) }),
          ...(data.hours_min !== undefined && { hours_min: data.hours_min }),
          ...(data.hours_max !== undefined && { hours_max: data.hours_max }),
          ...(data.milestone_count !== undefined && { milestone_count: data.milestone_count }),
          version: { increment: 1 },
        },
        include: { milestones: { orderBy: { sequence: 'asc' } } },
      });
    });

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'TASK_UPDATED',
      entityType: 'Task',
      entityId: taskId,
      metadata: { fields_changed: Object.keys(data), new_version: updated.version },
    });

    return updated;
  }

  // ─── METHOD 3: publishTask ─────────────────────────────────────────────────

  async publishTask(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { milestones: true },
    });
    if (!task) throw new AppError('TASK_NOT_FOUND', 404);
    if (task.created_by_user_id !== userId) throw new AppError('FORBIDDEN', 403);
    if (task.status !== 'DRAFT') throw new AppError('TASK_NOT_DRAFT', 409);

    // Full scope completeness validation
    if (!task.title || !task.domain || !task.objective)
      throw new AppError('TASK_INCOMPLETE_SCOPE', 422);
    if (!task.in_scope.length || !task.deliverables.length)
      throw new AppError('TASK_INCOMPLETE_SCOPE', 422);
    if (!task.out_of_scope.length || !task.assumptions.length)
      throw new AppError('TASK_INCOMPLETE_SCOPE', 422);
    if (task.milestone_count > 1 && task.milestones.length !== task.milestone_count)
      throw new AppError('TASK_MILESTONES_INCOMPLETE', 422);

    // Re-verify contractor still ACTIVE
    if (task.contractor_profile_id) {
      const profile = await this.prisma.contractorProfile.findUnique({
        where: { id: task.contractor_profile_id },
        select: { status: true },
      });
      if (!profile || profile.status !== 'ACTIVE')
        throw new AppError('CONTRACTOR_NOT_ACTIVE', 403);
    }

    const published = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'PUBLISHED', published_at: new Date() },
    });

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'TASK_PUBLISHED',
      entityType: 'Task',
      entityId: taskId,
      metadata: { title: task.title },
    });

    return published;
  }

  // ─── METHOD 4: archiveTask ─────────────────────────────────────────────────

  async archiveTask(taskId: string, userId: string, reason?: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        created_by_user_id: true,
        status: true,
        active_order_count: true,
      },
    });
    if (!task) throw new AppError('TASK_NOT_FOUND', 404);
    if (task.created_by_user_id !== userId) throw new AppError('FORBIDDEN', 403);
    if (task.status === 'ARCHIVED') throw new AppError('TASK_ALREADY_ARCHIVED', 409);
    if (task.active_order_count > 0) throw new AppError('TASK_HAS_ACTIVE_ORDERS', 409);

    const archived = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'ARCHIVED',
        archived_at: new Date(),
        ...(reason !== undefined && { archive_reason: reason }),
      },
    });

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'TASK_ARCHIVED',
      entityType: 'Task',
      entityId: taskId,
      metadata: { reason: reason ?? null },
    });

    return archived;
  }

  // ─── METHOD 5: searchTasks ─────────────────────────────────────────────────

  async searchTasks(params: TaskSearchInput) {
    const {
      q,
      domain,
      currency,
      price_min,
      price_max,
      hours_max,
      verified_only,
      insurance_badge,
      sort = 'newest',
      cursor,
      limit = 20,
    } = params;

    // If full-text query provided, use $queryRaw for tsvector search to get ranked IDs
    let ftsIds: string[] | undefined;
    if (q && q.trim().length > 0) {
      const rows = await this.prisma.$queryRaw<TaskFtsRow[]>`
        SELECT id
        FROM "Task"
        WHERE status = 'PUBLISHED'
          AND search_vector @@ plainto_tsquery('english', ${q})
        ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${q})) DESC
        LIMIT ${limit + 1}
      `;
      ftsIds = rows.map((r) => r.id);
      if (ftsIds.length === 0) {
        return { tasks: [], total: 0, next_cursor: null };
      }
    }

    // Convert price filters to AUD for cross-currency comparison
    const priceAudMin =
      price_min !== undefined
        ? new Prisma.Decimal(convertToAUD(price_min, currency ?? 'AUD'))
        : undefined;
    const priceAudMax =
      price_max !== undefined
        ? new Prisma.Decimal(convertToAUD(price_max, currency ?? 'AUD'))
        : undefined;

    // Build price_aud filter once
    let priceAudFilter: Prisma.DecimalFilter | undefined;
    if (priceAudMin !== undefined && priceAudMax !== undefined) {
      priceAudFilter = { gte: priceAudMin, lte: priceAudMax };
    } else if (priceAudMin !== undefined) {
      priceAudFilter = { gte: priceAudMin };
    } else if (priceAudMax !== undefined) {
      priceAudFilter = { lte: priceAudMax };
    }

    const where: Prisma.TaskWhereInput = {
      status: 'PUBLISHED',
      ...(ftsIds !== undefined && { id: { in: ftsIds } }),
      ...(domain !== undefined && { domain }),
      ...(priceAudFilter !== undefined && { price_aud: priceAudFilter }),
      ...(hours_max !== undefined && { hours_max: { lte: hours_max } }),
      ...(verified_only && {
        OR: [
          { contractor_profile: { status: 'ACTIVE', kyc_status: 'APPROVED' } },
          { organisation: { verification_status: 'VERIFIED' } },
        ],
      }),
      ...(insurance_badge && {
        OR: [
          { contractor_profile: { insurance_tier_met: true } },
          { organisation: { insurance_tier_met: true } },
        ],
      }),
    };

    // Cursor pagination
    const cursorClause: Prisma.TaskWhereUniqueInput | undefined = cursor
      ? { id: cursor }
      : undefined;

    const orderBy = buildOrderBy(sort);

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy,
        take: limit + 1,
        ...(cursorClause && { cursor: cursorClause, skip: 1 }),
        include: {
          milestones: { orderBy: { sequence: 'asc' } },
          contractor_profile: {
            select: { user_id: true, status: true, insurance_tier_met: true, kyc_status: true },
          },
          organisation: {
            select: { id: true, entity_name: true, verification_status: true, insurance_tier_met: true },
          },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    let next_cursor: string | null = null;
    if (tasks.length > limit) {
      tasks.pop();
      next_cursor = tasks[tasks.length - 1]?.id ?? null;
    }

    return { tasks, total, next_cursor };
  }

  // ─── METHOD 6: getTaskById ─────────────────────────────────────────────────

  async getTaskById(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        milestones: { orderBy: { sequence: 'asc' } },
        contractor_profile: {
          select: { user_id: true, status: true, insurance_tier_met: true, kyc_status: true },
        },
        organisation: {
          select: { id: true, entity_name: true, verification_status: true, insurance_tier_met: true },
        },
      },
    });
    if (!task) throw new AppError('TASK_NOT_FOUND', 404);
    if (task.status === 'ARCHIVED') throw new AppError('TASK_NOT_FOUND', 404);

    // Increment view_count (fire-and-forget, non-blocking)
    void this.prisma.task
      .update({ where: { id: taskId }, data: { view_count: { increment: 1 } } })
      .catch(() => {});

    return task;
  }

  // ─── METHOD 7: getMyTasks ─────────────────────────────────────────────────

  async getMyTasks(userId: string, status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
    const tasks = await this.prisma.task.findMany({
      where: {
        created_by_user_id: userId,
        ...(status !== undefined && { status }),
      },
      orderBy: { updated_at: 'desc' },
      include: {
        milestones: { orderBy: { sequence: 'asc' } },
      },
    });

    return tasks;
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildOrderBy(
  sort: 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'popular',
): Prisma.TaskOrderByWithRelationInput {
  switch (sort) {
    case 'price_asc':
      return { price_aud: 'asc' };
    case 'price_desc':
      return { price_aud: 'desc' };
    case 'popular':
      return { order_count: 'desc' };
    case 'rating':
      // No rating field yet — fall through to newest
    case 'newest':
    default:
      return { published_at: 'desc' };
  }
}
