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
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { user_id: userId },
      include: {
        user: { select: { id: true, email: true, full_name: true } },
        agreements: true,
      },
    });

    if (!profile) throw new AppError('PROFILE_NOT_FOUND', 404);

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
}
