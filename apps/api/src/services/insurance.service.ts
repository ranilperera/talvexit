import type { InsuranceCertificate, PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { UploadCertificateInput, ReviewCertificateInput } from '@onys/shared';
import {
  getRequiredTier,
  validateCoverageMet,
} from './insurance-tier.service.js';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';

type EmailJobPayload =
  | { type: 'admin-insurance-review-needed'; contractor_name: string; cert_id: string; insurance_type: string }
  | { type: 'insurance-verified'; to: string; message: string }
  | { type: 'insurance-rejected'; to: string; rejection_reason: string };

export class InsuranceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── UPLOAD CERTIFICATE ───────────────────────────────────────────────────────

  async uploadCertificate(
    userId: string,
    data: UploadCertificateInput,
    meta: { ip: string; userAgent: string },
  ): Promise<InsuranceCertificate> {
    // 1. Find contractor profile
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { user_id: userId },
      include: { user: { select: { full_name: true } } },
    });
    if (!profile) throw new AppError('PROFILE_NOT_FOUND', 404);

    // 2. Supersede existing VERIFIED cert of same type
    const existingVerified = await this.prisma.insuranceCertificate.findFirst({
      where: { contractor_id: profile.id, insurance_type: data.insurance_type, status: 'VERIFIED' },
    });
    if (existingVerified) {
      await this.prisma.insuranceCertificate.update({
        where: { id: existingVerified.id },
        data: { status: 'SUPERSEDED', superseded_at: new Date() },
      });
    }

    // 3. Calculate tier from contractor's domains
    const requiredTier = getRequiredTier(profile.domains as string[]);

    // 4. Create certificate with PENDING_REVIEW
    const cert = await this.prisma.insuranceCertificate.create({
      data: {
        contractor_id: profile.id,
        insurer_name: data.insurer_name,
        policy_number: data.policy_number,
        insurance_type: data.insurance_type,
        coverage_amount_aud: data.coverage_amount_aud,
        policy_start_date: new Date(data.policy_start_date),
        policy_expiry_date: new Date(data.policy_expiry_date),
        worldwide_coverage: data.worldwide_coverage,
        tier: requiredTier as InsuranceCertificate['tier'],
        certificate_blob_path: data.certificate_blob_path,
        status: 'PENDING_REVIEW',
      },
    });

    // 5. Audit
    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'INSURANCE_CERTIFICATE_UPLOADED',
      entityType: 'InsuranceCertificate',
      entityId: cert.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { insurance_type: data.insurance_type, contractor_id: profile.id },
    });

    // 6. Queue admin notification
    await this.emailQueue.add('admin-insurance-review-needed', {
      type: 'admin-insurance-review-needed',
      contractor_name: profile.user.full_name,
      cert_id: cert.id,
      insurance_type: data.insurance_type,
    });

    return cert;
  }

  // ─── GET MY CERTIFICATES ──────────────────────────────────────────────────────

  async getMyCertificates(userId: string): Promise<{
    certificates: InsuranceCertificate[];
    required_tier: string;
    coverage_status: ReturnType<typeof validateCoverageMet>;
  }> {
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { user_id: userId },
    });
    if (!profile) throw new AppError('PROFILE_NOT_FOUND', 404);

    const certificates = await this.prisma.insuranceCertificate.findMany({
      where: { contractor_id: profile.id },
      orderBy: { created_at: 'desc' },
    });

    const required_tier = getRequiredTier(profile.domains as string[]);
    const coverage_status = validateCoverageMet(certificates, required_tier);

    return { certificates, required_tier, coverage_status };
  }

  // ─── ADMIN REVIEW CERTIFICATE ─────────────────────────────────────────────────

  async adminReviewCertificate(
    certId: string,
    adminUserId: string,
    data: ReviewCertificateInput,
  ): Promise<InsuranceCertificate> {
    // 1. Find cert with contractor and user
    const cert = await this.prisma.insuranceCertificate.findUnique({
      where: { id: certId },
      include: {
        contractor: {
          include: { user: { select: { email: true } } },
        },
      },
    });
    if (!cert) throw new AppError('CERTIFICATE_NOT_FOUND', 404);

    // 2. Must be PENDING_REVIEW
    if (cert.status !== 'PENDING_REVIEW') {
      throw new AppError('INVALID_CERT_STATUS', 422, 'Certificate is not pending review');
    }

    const now = new Date();

    // 3–4. Build update and apply
    const updateData =
      data.decision === 'VERIFIED'
        ? {
            status: 'VERIFIED' as const,
            verified_at: now,
            reviewed_by: adminUserId,
            reviewed_at: now,
            ...(data.admin_notes !== undefined && { admin_notes: data.admin_notes }),
          }
        : {
            status: 'REJECTED' as const,
            reviewed_by: adminUserId,
            reviewed_at: now,
            ...(data.rejection_reason !== undefined && { rejection_reason: data.rejection_reason }),
            ...(data.admin_notes !== undefined && { admin_notes: data.admin_notes }),
          };

    const updated = await this.prisma.insuranceCertificate.update({
      where: { id: certId },
      data: updateData,
    });

    // 5. Audit
    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'INSURANCE_CERTIFICATE_REVIEWED',
      entityType: 'InsuranceCertificate',
      entityId: certId,
      metadata: { decision: data.decision, admin_id: adminUserId },
    });

    if (!cert.contractor) throw new AppError('CERTIFICATE_NOT_FOUND', 404);
    const contractorEmail = cert.contractor.user.email;
    const contractorId = cert.contractor_id ?? '';
    const contractorDomains = cert.contractor.domains as string[];

    // 6. Post-verify: check full coverage and notify
    if (data.decision === 'VERIFIED') {
      const allCerts = await this.prisma.insuranceCertificate.findMany({
        where: { contractor_id: contractorId },
      });
      const coverageStatus = validateCoverageMet(allCerts, getRequiredTier(contractorDomains));

      if (coverageStatus.met) {
        await this.prisma.contractorProfile.update({
          where: { id: contractorId },
          data: { insurance_tier_met: true },
        });

        await this.emailQueue.add('insurance-verified', {
          type: 'insurance-verified',
          to: contractorEmail,
          message: 'Your insurance is verified. You can now complete KYC.',
        });
      }
    }

    // 7. Rejection email
    if (data.decision === 'REJECTED') {
      await this.emailQueue.add('insurance-rejected', {
        type: 'insurance-rejected',
        to: contractorEmail,
        rejection_reason: data.rejection_reason ?? 'No reason provided',
      });
    }

    return updated;
  }

  // ─── GET PENDING CERTIFICATES (admin) ────────────────────────────────────────

  async getPendingCertificates() {
    return this.prisma.insuranceCertificate.findMany({
      where: { status: 'PENDING_REVIEW' },
      include: {
        contractor: {
          include: { user: { select: { full_name: true, email: true } } },
        },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  // ─── GET CERTIFICATE BY ID ────────────────────────────────────────────────────

  async getCertificateById(certId: string, userId: string): Promise<InsuranceCertificate> {
    const cert = await this.prisma.insuranceCertificate.findUnique({
      where: { id: certId },
      include: { contractor: { select: { user_id: true } } },
    });
    if (!cert) throw new AppError('CERTIFICATE_NOT_FOUND', 404);
    if (!cert.contractor) throw new AppError('FORBIDDEN', 403);

    if (cert.contractor.user_id !== userId) {
      throw new AppError('FORBIDDEN', 403);
    }

    // Return without the include (base type)
    const { contractor: _contractor, ...certWithoutRelation } = cert as typeof cert & { contractor: unknown };
    return certWithoutRelation as InsuranceCertificate;
  }
}
