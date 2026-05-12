import type { PrismaClient, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';
import { transitionProfile } from './contractor-state-machine.service.js';

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

export class AdminContractorService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── listContractors ──────────────────────────────────────────────────────

  async listContractors(params: {
    status?: string;
    kyc_status?: string;
    insurance_status?: string;
    domain?: string;
    search?: string;
    cursor?: string;
    limit?: number;
  }) {
    const where: Prisma.ContractorProfileWhereInput = {};

    if (params.status) where.status = params.status as never;
    if (params.kyc_status) where.kyc_status = params.kyc_status as never;
    if (params.insurance_status) {
      if (params.insurance_status === 'MET') where.insurance_tier_met = true;
      else if (params.insurance_status === 'NOT_MET') where.insurance_tier_met = false;
    }
    if (params.domain) where.domains = { has: params.domain as never };
    if (params.search) {
      where.user = {
        OR: [
          { full_name: { contains: params.search, mode: 'insensitive' } },
          { email: { contains: params.search, mode: 'insensitive' } },
        ],
      };
    }
    if (params.cursor) where.id = { lt: params.cursor };

    const limit = params.limit ?? 20;

    const [contractors, total_count] = await Promise.all([
      this.prisma.contractorProfile.findMany({
        where,
        include: {
          user: { select: { id: true, full_name: true, email: true, created_at: true } },
          insurance_certificates: {
            where: { status: 'VERIFIED' },
            orderBy: { policy_expiry_date: 'asc' },
          },
          _count: { select: { orders: true } },
        },
        orderBy: { created_at: 'desc' },
        take: limit + 1,
      }),
      this.prisma.contractorProfile.count({ where }),
    ]);

    const hasMore = contractors.length > limit;
    const items = hasMore ? contractors.slice(0, limit) : contractors;
    const next_cursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    return { contractors: items, next_cursor, total_count };
  }

  // ─── getContractorAdminDetail ──────────────────────────────────────────────

  async getContractorAdminDetail(contractorProfileId: string) {
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { id: contractorProfileId },
      include: {
        user: {
          include: {
            tax_declarations: { orderBy: { signed_at: 'desc' }, take: 5 },
          },
        },
        insurance_certificates: { orderBy: { created_at: 'desc' } },
        stripe_connect_account: true,
        orders: {
          orderBy: { created_at: 'desc' },
          take: 20,
          include: {
            customer: { select: { id: true, full_name: true, email: true } },
            payout_record: { select: { status: true, net_amount_aud: true } },
          },
        },
        ratings: {
          orderBy: { created_at: 'desc' },
          take: 10,
          select: { overall_score: true, created_at: true, review_text: true },
        },
        payout_records: { orderBy: { created_at: 'desc' }, take: 10 },
        _count: { select: { orders: true, ratings: true } },
      },
    });

    if (!profile) throw new AppError('CONTRACTOR_NOT_FOUND', 404);

    const [aml_checks, video_sessions, audit_logs] = await Promise.all([
      this.prisma.amlCheck.findMany({
        where: { user_id: profile.user_id },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.videoSession.findMany({
        where: { contractor_profile_id: contractorProfileId },
        orderBy: { scheduled_at: 'desc' },
      }),
      this.prisma.auditLog.findMany({
        where: { entity_type: 'ContractorProfile', entity_id: contractorProfileId },
        orderBy: { timestamp: 'desc' },
        take: 50,
      }),
    ]);

    return { ...profile, aml_checks, video_sessions, audit_logs };
  }

  // ─── updateContractorStatus ───────────────────────────────────────────────

  async updateContractorStatus(
    contractorProfileId: string,
    adminUserId: string,
    data: { status: 'ACTIVE' | 'SUSPENDED' | 'BANNED'; reason?: string },
  ) {
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { id: contractorProfileId },
      include: { user: { select: { email: true } } },
    });
    if (!profile) throw new AppError('CONTRACTOR_NOT_FOUND', 404);

    if (['SUSPENDED', 'BANNED'].includes(data.status) && !data.reason) {
      throw new AppError(
        'REASON_REQUIRED',
        422,
        'A reason is required when suspending or banning a contractor',
      );
    }

    if (profile.status === data.status) {
      throw new AppError('STATUS_UNCHANGED', 409, `Contractor is already ${data.status}`);
    }

    const updated = await transitionProfile(
      this.prisma,
      contractorProfileId,
      data.status,
      adminUserId,
      data.reason,
    );

    void writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'ADMIN_CONTRACTOR_STATUS_CHANGE',
      entityType: 'ContractorProfile',
      entityId: contractorProfileId,
      metadata: {
        from: profile.status,
        to: data.status,
        ...(data.reason !== undefined && { reason: data.reason }),
        changed_by: adminUserId,
      },
    });

    if (profile.user?.email) {
      void this.emailQueue.add(`contractor-status-${data.status.toLowerCase()}`, {
        type: `contractor-status-${data.status.toLowerCase()}`,
        to: profile.user.email,
        reason: data.reason,
        status: data.status,
      });
    }

    return updated;
  }

  // ─── getInsuranceExpiryDashboard ──────────────────────────────────────────

  async getInsuranceExpiryDashboard() {
    const now = new Date();
    const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const expiringCerts = await this.prisma.insuranceCertificate.findMany({
      where: {
        status: 'VERIFIED',
        policy_expiry_date: { gte: now, lte: in60 },
      },
      include: {
        contractor: {
          include: {
            user: { select: { id: true, full_name: true, email: true } },
          },
        },
      },
      orderBy: { policy_expiry_date: 'asc' },
    });

    const buckets = {
      expiring_0_7_days: [] as object[],
      expiring_8_30_days: [] as object[],
      expiring_31_60_days: [] as object[],
    };

    for (const cert of expiringCerts) {
      const daysRemaining = Math.ceil(
        (cert.policy_expiry_date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      const summary = {
        contractor_profile_id: cert.contractor_id,
        contractor_name: cert.contractor?.user.full_name ?? null,
        contractor_email: cert.contractor?.user.email ?? null,
        insurance_type: cert.insurance_type,
        expiry_date: cert.policy_expiry_date,
        days_remaining: daysRemaining,
        profile_status: cert.contractor?.status ?? null,
      };

      if (daysRemaining <= 7) buckets.expiring_0_7_days.push(summary);
      else if (daysRemaining <= 30) buckets.expiring_8_30_days.push(summary);
      else buckets.expiring_31_60_days.push(summary);
    }

    return { ...buckets, total_count: expiringCerts.length };
  }
}
