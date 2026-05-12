import type { ContractorProfile, PrismaClient } from '@prisma/client';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';

// ─── Transition Map ───────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  INCOMPLETE: ['PENDING'],
  PENDING: ['ACTIVE', 'INCOMPLETE'],
  ACTIVE: ['SUSPENDED'],
  SUSPENDED: ['ACTIVE', 'BANNED'],
  BANNED: [],
};

// ─── Guard Functions ──────────────────────────────────────────────────────────

function guardIncompleteToPending(profile: ContractorProfile): string | null {
  if (profile.onboarding_step < 7)
    return `Onboarding incomplete — currently on step ${profile.onboarding_step} of 7`;
  if (!profile.domains || (profile.domains as string[]).length === 0)
    return 'At least one domain required (step 3)';
  if (!profile.hourly_rate_aud)
    return 'Hourly rate required (step 4)';
  if (!profile.identity_document_blob_path)
    return 'Identity document upload required (step 5)';
  if (!profile.agreement_accepted_at)
    return 'Contractor Agreement acceptance required (step 7)';
  return null;
}

async function guardPendingToActive(
  profile: ContractorProfile,
  _prisma: PrismaClient,
): Promise<string | null> {
  // For individual contractors, only KYC and identity approval are required.
  // Insurance and Stripe Connect are optional enhancements, not activation blockers.

  // Check KYC approved (set by M04 KYC service)
  if (profile.kyc_status !== 'APPROVED') {
    return 'KYC verification not yet approved';
  }

  // Check identity approved
  if (profile.identity_status !== 'APPROVED') {
    return 'Identity verification not yet approved';
  }

  return null;
}

function guardActiveToSuspended(_profile: ContractorProfile): string | null {
  // Admin-only — always allowed
  return null;
}

// ─── canTransition ────────────────────────────────────────────────────────────
// NOTE: PENDING→ACTIVE is checked synchronously here (transition map only).
// The async insurance/KYC guard is enforced inside transitionProfile().

export function canTransition(
  profile: ContractorProfile,
  targetStatus: string,
): { allowed: boolean; reason?: string } {
  const allowed = ALLOWED_TRANSITIONS[profile.status] ?? [];
  if (!allowed.includes(targetStatus)) {
    return {
      allowed: false,
      reason: `Transition from ${profile.status} to ${targetStatus} is not permitted`,
    };
  }

  let guardResult: string | null = null;

  if (profile.status === 'INCOMPLETE' && targetStatus === 'PENDING') {
    guardResult = guardIncompleteToPending(profile);
  } else if (profile.status === 'ACTIVE' && targetStatus === 'SUSPENDED') {
    guardResult = guardActiveToSuspended(profile);
  }
  // PENDING→ACTIVE async guard is handled in transitionProfile()

  if (guardResult !== null) {
    return { allowed: false, reason: guardResult };
  }

  return { allowed: true };
}

// ─── transitionProfile ────────────────────────────────────────────────────────

export async function transitionProfile(
  prisma: PrismaClient,
  profileId: string,
  targetStatus: string,
  actorId: string,
  reason?: string,
): Promise<ContractorProfile> {
  const profile = await prisma.contractorProfile.findUniqueOrThrow({
    where: { id: profileId },
  });

  const check = canTransition(profile, targetStatus);
  if (!check.allowed) {
    throw new AppError('INVALID_TRANSITION', 422, check.reason);
  }

  // Run async guard for PENDING→ACTIVE
  if (profile.status === 'PENDING' && targetStatus === 'ACTIVE') {
    const guardResult = await guardPendingToActive(profile, prisma);
    if (guardResult !== null) {
      throw new AppError('INVALID_TRANSITION', 422, guardResult);
    }
  }

  const now = new Date();

  const extraData =
    targetStatus === 'ACTIVE'
      ? { activated_at: now }
      : targetStatus === 'SUSPENDED'
        ? {
            suspended_at: now,
            ...(reason !== undefined && { suspension_reason: reason }),
          }
        : targetStatus === 'BANNED'
          ? {
              banned_at: now,
              ...(reason !== undefined && { ban_reason: reason }),
            }
          : {};

  const updated = await prisma.contractorProfile.update({
    where: { id: profileId },
    data: {
      status: targetStatus as ContractorProfile['status'],
      ...extraData,
    },
  });

  await writeAudit(prisma, {
    actorId,
    actionType: 'CONTRACTOR_STATUS_CHANGED',
    entityType: 'ContractorProfile',
    entityId: profileId,
    metadata: {
      from: profile.status,
      to: targetStatus,
      ...(reason !== undefined && { reason }),
    },
  });

  return updated;
}

// ─── getOnboardingStatus ──────────────────────────────────────────────────────

export interface StepStatus {
  step: number;
  name: string;
  complete: boolean;
  blocking_reason: string | null;
}

export interface OnboardingStatus {
  current_step: number;
  steps: StepStatus[];
  ready_to_submit: boolean;
}

export function getOnboardingStatus(profile: ContractorProfile): OnboardingStatus {
  const steps: StepStatus[] = [
    {
      step: 1,
      name: 'Personal Info',
      complete: Boolean(profile.timezone),
      blocking_reason: profile.timezone ? null : 'Timezone is required',
    },
    {
      step: 2,
      name: 'Employment Declaration',
      complete: Boolean(profile.employment_type),
      blocking_reason: profile.employment_type ? null : 'Employment type is required',
    },
    {
      step: 3,
      name: 'Domains & Skills',
      complete: Boolean(profile.domains && (profile.domains as string[]).length > 0),
      blocking_reason:
        profile.domains && (profile.domains as string[]).length > 0
          ? null
          : 'At least one domain is required',
    },
    {
      step: 4,
      name: 'Rates & Availability',
      complete: Boolean(profile.hourly_rate_aud),
      blocking_reason: profile.hourly_rate_aud ? null : 'Hourly rate is required',
    },
    {
      step: 5,
      name: 'Identity Upload',
      complete: Boolean(profile.identity_document_blob_path),
      blocking_reason: profile.identity_document_blob_path
        ? null
        : 'Identity document upload is required',
    },
    {
      step: 7,
      name: 'Agreement Acceptance',
      complete: Boolean(profile.agreement_accepted_at),
      blocking_reason: profile.agreement_accepted_at
        ? null
        : 'Contractor Agreement acceptance is required',
    },
  ];

  const guardResult = guardIncompleteToPending(profile);

  return {
    current_step: profile.onboarding_step,
    steps,
    ready_to_submit: guardResult === null,
  };
}
