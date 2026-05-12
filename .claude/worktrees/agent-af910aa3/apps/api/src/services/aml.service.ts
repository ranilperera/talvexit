import type { PrismaClient, Prisma } from '@prisma/client';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';

// ─── Stub: performScreening ───────────────────────────────────────────────────
// MVP stub — returns CLEAR for all screens.
// Structured to be replaced with a real provider API call.

async function performScreening(params: {
  full_name: string;
  dob?: Date | null;
  country: string;
}): Promise<{
  pep_match: boolean;
  sanctions_match: boolean;
  adverse_media_match: boolean;
  overall_result: 'CLEAR' | 'FLAGGED' | 'PENDING_REVIEW';
  reference: string;
  raw_response: object;
}> {
  // TODO Phase 6: Replace with ComplyAdvantage or ComplyLaunch API call
  // POST https://api.complyadvantage.com/searches
  // Headers: Authorization: Token {COMPLY_ADVANTAGE_API_KEY}

  console.log(`[aml] Stub screening for: ${params.full_name}`);

  return {
    pep_match: false,
    sanctions_match: false,
    adverse_media_match: false,
    overall_result: 'CLEAR',
    reference: `STUB-${Date.now()}`,
    raw_response: {
      provider: 'STUB',
      screened_at: new Date().toISOString(),
      name: params.full_name,
      note: 'MVP stub — replace with real provider in Phase 6',
    },
  };
}

// ─── AmlService ───────────────────────────────────────────────────────────────

export class AmlService {
  constructor(private readonly prisma: PrismaClient) {}

  // ─── triggerScreen ──────────────────────────────────────────────────────────

  async triggerScreen(
    targetUserId: string,
    adminUserId: string,
    meta: { ip: string; userAgent: string },
  ) {
    // 1. Find target user
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, full_name: true },
    });
    if (!user) throw new AppError('USER_NOT_FOUND', 404);

    // 2. Check for recent (non-FLAGGED) check within last 90 days
    const recentCheck = await this.prisma.amlCheck.findFirst({
      where: {
        user_id: targetUserId,
        created_at: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        overall_result: { not: 'FLAGGED' },
      },
      orderBy: { created_at: 'desc' },
    });
    if (recentCheck) {
      console.log(`[aml] Recent check exists for user ${targetUserId}`);
      return recentCheck;
    }

    // 3. Create AmlCheck record with PENDING_REVIEW status
    const check = await this.prisma.amlCheck.create({
      data: {
        user_id: targetUserId,
        triggered_by_id: adminUserId,
        full_name_screened: user.full_name,
        dob_screened: null,
        country_screened: 'AU',
        provider: 'MANUAL',
        overall_result: 'PENDING_REVIEW',
      },
    });

    // 4. Call provider (stub for MVP)
    const result = await performScreening({
      full_name: user.full_name,
      dob: null,
      country: 'AU',
    });

    // 5. Update check with result
    const updated = await this.prisma.amlCheck.update({
      where: { id: check.id },
      data: {
        pep_match: result.pep_match,
        sanctions_match: result.sanctions_match,
        adverse_media_match: result.adverse_media_match,
        raw_response: result.raw_response as Prisma.InputJsonValue,
        overall_result: result.overall_result,
        provider_reference: result.reference,
      },
    });

    // 6. If FLAGGED — auto-suspend contractor profile
    if (result.overall_result === 'FLAGGED') {
      const profile = await this.prisma.contractorProfile.findUnique({
        where: { user_id: targetUserId },
      });
      if (profile && profile.status === 'ACTIVE') {
        await this.prisma.contractorProfile.update({
          where: { id: profile.id },
          data: {
            status: 'SUSPENDED',
            suspension_reason: 'AML/PEP flag — pending compliance review',
          },
        });
      }

      void writeAudit(this.prisma, {
        actorId: adminUserId,
        actionType: 'AML_FLAG_AUTO_SUSPEND',
        entityType: 'User',
        entityId: targetUserId,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: {
          check_id: check.id,
          pep: result.pep_match,
          sanctions: result.sanctions_match,
        },
      });
    }

    // 7. Audit: AML_SCREEN_TRIGGERED
    void writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'AML_SCREEN_TRIGGERED',
      entityType: 'User',
      entityId: targetUserId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        check_id: check.id,
        result: result.overall_result,
        triggered_by: adminUserId,
      },
    });

    // 8. Return updated check
    return updated;
  }

  // ─── listAmlChecks ─────────────────────────────────────────────────────────

  async listAmlChecks(params: {
    result?: string;
    flagged_only?: boolean;
    cursor?: string;
    limit?: number;
  }) {
    const where: Prisma.AmlCheckWhereInput = {};

    if (params.result) where.overall_result = params.result;
    if (params.flagged_only) {
      where.OR = [
        { pep_match: true },
        { sanctions_match: true },
        { adverse_media_match: true },
      ];
    }
    if (params.cursor) where.id = { lt: params.cursor };

    const limit = params.limit ?? 20;

    const checks = await this.prisma.amlCheck.findMany({
      where,
      include: {
        user: { select: { id: true, full_name: true, email: true, account_type: true } },
        triggered_by: { select: { id: true, full_name: true } },
        reviewed_by: { select: { id: true, full_name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: limit + 1,
    });

    const hasMore = checks.length > limit;
    const result = hasMore ? checks.slice(0, -1) : checks;
    const next_cursor = hasMore ? (result[result.length - 1]?.id ?? null) : null;

    return { checks: result, next_cursor };
  }
}
