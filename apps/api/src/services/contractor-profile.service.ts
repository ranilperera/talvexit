import type { ContractorProfile, PrismaClient, Domain as PrismaDomain } from '@prisma/client';
import type { Queue } from 'bullmq';
import type {
  Step1Input,
  Step2Input,
  Step3Input,
  Step4Input,
  Step5Input,
  Step7Input,
} from '@onys/shared';
import { transitionProfile, getOnboardingStatus } from './contractor-state-machine.service.js';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';
import { validateABN } from './compliance.service.js';

type StepInput = Step1Input | Step2Input | Step3Input | Step4Input | Step5Input | Step7Input;

type EmailJobPayload = {
  type: 'onboarding-submitted';
  to: string;
  userId: string;
};

type RequestMeta = { ip: string; userAgent: string };

export class ContractorProfileService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── GET PROFILE ──────────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    let profile = await this.prisma.contractorProfile.findUnique({
      where: { user_id: userId },
      include: {
        user: {
          select: {
            id: true, email: true, full_name: true,
            abn: true, abn_verified: true, abn_verified_name: true,
            entity_type: true, gst_registered: true,
            billing_address_1: true, billing_city: true, billing_state: true,
            billing_postcode: true, billing_country: true,
            compliance_documents: true,
            email_verified: true, created_at: true, last_login_at: true,
          },
        },
        agreements: true,
        insurance_certificates: {
          select: {
            id: true, insurance_type: true, insurer_name: true,
            policy_number: true, coverage_amount_aud: true,
            policy_start_date: true, policy_expiry_date: true,
            certificate_blob_path: true, status: true, tier: true,
            verified_at: true,
          },
        },
        stripe_connect_account: {
          select: {
            stripe_account_id: true, status: true,
            payouts_enabled: true, charges_enabled: true,
            country: true, default_currency: true, created_at: true,
          },
        },
      },
    });

    if (!profile) throw new AppError('PROFILE_NOT_FOUND', 404);

    // Auto-activate: if KYC is approved but status is not yet ACTIVE, promote immediately.
    // This handles contractors approved before the auto-activation fix was deployed.
    if (
      profile.kyc_status === 'APPROVED' &&
      profile.identity_status === 'APPROVED' &&
      profile.status !== 'ACTIVE' &&
      profile.status !== 'SUSPENDED' &&
      profile.status !== 'BANNED'
    ) {
      profile = await this.prisma.contractorProfile.update({
        where: { id: profile.id },
        data: { status: 'ACTIVE', activated_at: new Date() },
        include: {
          user: {
            select: {
              id: true, email: true, full_name: true,
              abn: true, abn_verified: true, abn_verified_name: true,
              entity_type: true, gst_registered: true,
              billing_address_1: true, billing_city: true, billing_state: true,
              billing_postcode: true, billing_country: true,
              compliance_documents: true,
              email_verified: true, created_at: true, last_login_at: true,
            },
          },
          agreements: true,
          insurance_certificates: {
            select: {
              id: true, insurance_type: true, insurer_name: true,
              policy_number: true, coverage_amount_aud: true,
              policy_start_date: true, policy_expiry_date: true,
              certificate_blob_path: true, status: true, tier: true,
              verified_at: true,
            },
          },
          stripe_connect_account: {
            select: {
              stripe_account_id: true, status: true,
              payouts_enabled: true, charges_enabled: true,
              country: true, default_currency: true, created_at: true,
            },
          },
        },
      });
      await writeAudit(this.prisma, {
        actorId: userId,
        actionType: 'CONTRACTOR_STATUS_CHANGED',
        entityType: 'ContractorProfile',
        entityId: profile.id,
        metadata: { from: 'auto-promote', to: 'ACTIVE', reason: 'KYC approved' },
      });
    }

    const onboarding_status = getOnboardingStatus(profile);

    return { profile, onboarding_status };
  }

  // ─── UPDATE STEP ──────────────────────────────────────────────────────────────

  async updateStep(
    userId: string,
    step: number,
    data: StepInput,
    meta: RequestMeta,
  ): Promise<ContractorProfile> {
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { user_id: userId },
    });
    if (!profile) throw new AppError('PROFILE_NOT_FOUND', 404);

    // Advance step counter (never go backwards)
    const next_step = Math.max(profile.onboarding_step, step + 1);

    let updateData: Record<string, unknown> = { onboarding_step: next_step };

    switch (step) {
      case 1: {
        const d = data as Step1Input;
        updateData = {
          ...updateData,
          timezone: d.timezone,
          ...(d.legal_name !== undefined && { legal_name: d.legal_name }),
          ...(d.bio !== undefined && { bio: d.bio }),
          ...(d.linkedin_url !== undefined && { linkedin_url: d.linkedin_url }),
          ...(d.phone !== undefined && { phone: d.phone }),
        };
        break;
      }

      case 2: {
        const d = data as Step2Input;
        updateData = {
          ...updateData,
          employment_type: d.employment_type,
          employment_declared_at: new Date(),
          ...(d.employer_name !== undefined && { employer_name: d.employer_name }),
          ...(d.has_employer_consent !== undefined && {
            has_employer_consent: d.has_employer_consent,
          }),
        };
        break;
      }

      case 3: {
        const d = data as Step3Input;
        updateData = {
          ...updateData,
          domains: d.domains as PrismaDomain[],
          skills: d.skills,
        };
        break;
      }

      case 4: {
        const d = data as Step4Input;
        updateData = {
          ...updateData,
          hourly_rate_aud: d.hourly_rate_aud,
          availability_hours_per_week: d.availability_hours_per_week,
          ...(d.available_from !== undefined && {
            available_from: new Date(d.available_from),
          }),
        };
        break;
      }

      case 5: {
        const d = data as Step5Input;
        updateData = {
          ...updateData,
          identity_document_type: d.identity_document_type,
          identity_document_blob_path: d.identity_document_blob_path,
          identity_status: 'PENDING',
        };
        break;
      }

      case 7: {
        const d = data as Step7Input;
        const now = new Date();
        await this.prisma.contractorAgreement.create({
          data: {
            contractor_id: profile.id,
            document_type: 'CONTRACTOR_AGREEMENT',
            version: d.agreement_version,
            accepted_at: now,
            ip_address: meta.ip,
            user_agent: meta.userAgent,
          },
        });
        updateData = {
          ...updateData,
          agreement_accepted_at: now,
          agreement_version: d.agreement_version,
        };
        break;
      }

      default:
        throw new AppError('INVALID_STEP', 400, `Step ${step} is not a valid onboarding step`);
    }

    const updated = await this.prisma.contractorProfile.update({
      where: { id: profile.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: updateData as any,
    });

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'ONBOARDING_STEP_COMPLETED',
      entityType: 'ContractorProfile',
      entityId: profile.id,
      metadata: { step, userId },
    });

    return updated;
  }

  // ─── SUBMIT FOR REVIEW ────────────────────────────────────────────────────────

  async submitForReview(userId: string): Promise<ContractorProfile> {
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { user_id: userId },
      include: { user: { select: { email: true } } },
    });
    if (!profile) throw new AppError('PROFILE_NOT_FOUND', 404);

    // All contractors on this platform are individuals — default employment_type if unset
    if (!profile.employment_type) {
      await this.prisma.contractorProfile.update({
        where: { id: profile.id },
        data: { employment_type: 'SOLE_TRADER' },
      });
    }

    const updated = await transitionProfile(
      this.prisma,
      profile.id,
      'PENDING',
      userId,
    );

    await this.emailQueue.add('onboarding-submitted', {
      type: 'onboarding-submitted',
      to: profile.user.email,
      userId,
    });

    return updated;
  }

  // ─── UPLOAD IDENTITY DOCUMENT ─────────────────────────────────────────────────

  async uploadIdentityDocument(
    userId: string,
    documentType: string,
    blobPath: string,
  ): Promise<ContractorProfile> {
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { user_id: userId },
    });
    if (!profile) throw new AppError('PROFILE_NOT_FOUND', 404);

    const updated = await this.prisma.contractorProfile.update({
      where: { id: profile.id },
      data: {
        identity_document_type: documentType,
        identity_document_blob_path: blobPath,
        identity_status: 'PENDING',
      },
    });

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'IDENTITY_DOCUMENT_UPLOADED',
      entityType: 'ContractorProfile',
      entityId: profile.id,
      metadata: { document_type: documentType, blob_path: blobPath },
    });

    return updated;
  }

  // ─── SAVE TAX DECLARATION ────────────────────────────────────────────────────

  async saveTaxDeclaration(
    userId: string,
    data: {
      abn?: string;
      no_abn_reason?: string;
      gst_registered: boolean;
      is_foreign_entity: boolean;
      provider_agreement_signed: boolean;
      provider_agreement_version: string;
    },
    meta?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    if (data.abn) {
      const cleanAbn = data.abn.replace(/\s/g, '');
      if (!validateABN(cleanAbn)) {
        throw new AppError('INVALID_ABN', 400, `ABN ${cleanAbn} failed validation. Please check the number.`);
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.abn ? { abn: data.abn.replace(/\s/g, '') } : {}),
        gst_registered: data.gst_registered,
        is_foreign_entity: data.is_foreign_entity,
        provider_agreement_signed: data.provider_agreement_signed,
      },
    });

    // Record a ProviderTaxDeclaration so compliance team can see no_abn_reason.
    // form_version now tracks the Provider Agreement version the contractor
    // accepted at this point in time, so the declaration row evidences which
    // binding text was in force at acceptance.
    if (data.no_abn_reason) {
      await this.prisma.providerTaxDeclaration.create({
        data: {
          user_id: userId,
          declaration_type: 'CONTRACTOR_ONBOARDING',
          declared_abn: data.abn ?? null,
          declared_gst_registered: data.gst_registered,
          declared_business_type: null,
          declared_tax_residency: data.is_foreign_entity ? 'OVERSEAS' : 'AU',
          declaration_text: data.no_abn_reason,
          signed_by_user_id: userId,
          ip_address: meta?.ip ?? null,
          user_agent: meta?.userAgent ?? null,
          form_version: data.provider_agreement_version,
        },
      });
    }

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'TAX_DECLARATION_SAVED',
      entityType: 'User',
      entityId: userId,
      // Records the binding version, IP, UA, timestamp — together with the
      // server-side validation in the route handler, this satisfies the
      // electronic-signature evidence requirements under the Electronic
      // Transactions Act 1999 (Cth).
      metadata: {
        has_abn: !!data.abn,
        no_abn_reason: data.no_abn_reason ?? null,
        gst_registered: data.gst_registered,
        is_foreign_entity: data.is_foreign_entity,
        provider_agreement_signed: data.provider_agreement_signed,
        provider_agreement_version: data.provider_agreement_version,
        ip_address: meta?.ip ?? null,
        user_agent: meta?.userAgent ?? null,
      },
    });
  }

  // ─── PUBLIC LISTING (no auth) ─────────────────────────────────────────────

  async listPublic(opts: {
    specialisation?: string;
    location?: string;
    search?: string;
    limit: number;
    offset: number;
  }) {
    const domainFilter = opts.specialisation
      ? { domains: { has: opts.specialisation as PrismaDomain } }
      : {};
    const searchFilter = opts.search
      ? {
          OR: [
            { user: { full_name: { contains: opts.search, mode: 'insensitive' as const } } },
            { bio: { contains: opts.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const profiles = await this.prisma.contractorProfile.findMany({
      where: { status: 'ACTIVE', ...domainFilter, ...searchFilter },
      select: {
        id: true,
        domains: true,
        skills: true,
        hourly_rate_aud: true,
        overall_rating: true,
        rating_count: true,
        insurance_tier_met: true,
        kyc_status: true,
        user: {
          select: { full_name: true },
        },
      },
      take: opts.limit,
      skip: opts.offset,
      orderBy: [{ overall_rating: 'desc' }, { rating_count: 'desc' }],
    });

    return profiles.map((p) => ({
      id: p.id,
      full_name: p.user.full_name,
      domains: p.domains,
      skills: p.skills,
      hourly_rate_aud: p.hourly_rate_aud ? Number(p.hourly_rate_aud) : null,
      rating_avg: p.overall_rating ? Number(p.overall_rating) : null,
      rating_count: p.rating_count,
      kyc_verified: p.kyc_status === 'APPROVED',
      insurance_verified: p.insurance_tier_met,
    }));
  }
}
