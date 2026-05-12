import { describe, it, expect, vi } from 'vitest';
import type { ContractorProfile } from '@prisma/client';
import { canTransition, getOnboardingStatus } from '../contractor-state-machine.service.js';
import { ContractorProfileService } from '../contractor-profile.service.js';
import { step2Schema, step3Schema } from '@onys/shared';

// ─── Fake profile factory ────────────────────────────────────────────────────

function fakeProfile(overrides: Partial<ContractorProfile> = {}): ContractorProfile {
  return {
    id: 'profile_1',
    user_id: 'user_1',
    status: 'INCOMPLETE',
    onboarding_step: 1,
    bio: null,
    linkedin_url: null,
    timezone: null,
    phone: null,
    employment_type: null,
    employer_name: null,
    has_employer_consent: null,
    employment_declared_at: null,
    domains: [],
    skills: [],
    hourly_rate_aud: null,
    availability_hours_per_week: null,
    available_from: null,
    identity_document_type: null,
    identity_document_blob_path: null,
    identity_status: 'NOT_STARTED',
    agreement_accepted_at: null,
    agreement_version: null,
    stripe_account_id: null,
    stripe_account_enabled: false,
    completed_orders_count: 0,
    kyc_status: 'NOT_STARTED',
    activated_at: null,
    suspended_at: null,
    suspension_reason: null,
    banned_at: null,
    ban_reason: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as ContractorProfile;
}

function readyProfile(): ContractorProfile {
  return fakeProfile({
    onboarding_step: 7,
    timezone: 'Australia/Sydney',
    employment_type: 'SOLE_TRADER',
    domains: ['FIREWALL'] as unknown as ContractorProfile['domains'],
    hourly_rate_aud: 100 as unknown as ContractorProfile['hourly_rate_aud'],
    identity_document_blob_path: '/docs/id.pdf',
    agreement_accepted_at: new Date(),
  });
}

// ─── Prisma mock factory ─────────────────────────────────────────────────────

function makePrisma() {
  return {
    contractorProfile: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    contractorAgreement: {
      create: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
}

function makeQueue() {
  return { add: vi.fn() };
}

const META = { ip: '127.0.0.1', userAgent: 'test-agent' };

// ─── CB-01 through CB-06: canTransition ──────────────────────────────────────

describe('ContractorStateMachine.canTransition()', () => {
  it('CB-01: INCOMPLETE → PENDING allowed when all guards pass', () => {
    const result = canTransition(readyProfile(), 'PENDING');
    expect(result.allowed).toBe(true);
  });

  it('CB-02: INCOMPLETE → PENDING blocked when onboarding_step < 7', () => {
    const profile = readyProfile();
    const result = canTransition({ ...profile, onboarding_step: 5 } as ContractorProfile, 'PENDING');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/step 5 of 7/);
  });

  it('CB-03: INCOMPLETE → PENDING blocked when employment_type is missing', () => {
    const profile = readyProfile();
    const result = canTransition({ ...profile, employment_type: null } as ContractorProfile, 'PENDING');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/employment/i);
  });

  it('CB-04: INCOMPLETE → ACTIVE is not a permitted transition', () => {
    const result = canTransition(readyProfile(), 'ACTIVE');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not permitted/);
  });

  it('CB-05: BANNED → ACTIVE is not permitted', () => {
    const profile = fakeProfile({ status: 'BANNED' as ContractorProfile['status'] });
    const result = canTransition(profile, 'ACTIVE');
    expect(result.allowed).toBe(false);
  });

  it('CB-06: ACTIVE → SUSPENDED is allowed', () => {
    const profile = fakeProfile({ status: 'ACTIVE' as ContractorProfile['status'] });
    const result = canTransition(profile, 'SUSPENDED');
    expect(result.allowed).toBe(true);
  });
});

// ─── CB-07 through CB-09: getOnboardingStatus ────────────────────────────────

describe('ContractorStateMachine.getOnboardingStatus()', () => {
  it('CB-07: ready_to_submit is true when all required fields are present', () => {
    const status = getOnboardingStatus(readyProfile());
    expect(status.ready_to_submit).toBe(true);
  });

  it('CB-08: ready_to_submit is false when hourly_rate_aud is missing', () => {
    const profile = readyProfile();
    const status = getOnboardingStatus({ ...profile, hourly_rate_aud: null } as ContractorProfile);
    expect(status.ready_to_submit).toBe(false);
    const step4 = status.steps.find((s) => s.step === 4);
    expect(step4?.complete).toBe(false);
    expect(step4?.blocking_reason).toBeTruthy();
  });

  it('CB-09: step 6 (Insurance) is always incomplete (M03 placeholder)', () => {
    const status = getOnboardingStatus(readyProfile());
    const step6 = status.steps.find((s) => s.step === 6);
    expect(step6?.complete).toBe(false);
    expect(step6?.blocking_reason).toBeTruthy();
  });
});

// ─── CB-10 through CB-13: ContractorProfileService.updateStep() ──────────────

describe('ContractorProfileService.updateStep()', () => {
  it('CB-10: step 1 saves timezone and advances onboarding_step', async () => {
    const prisma = makePrisma();
    const profile = fakeProfile();
    prisma.contractorProfile.findUnique.mockResolvedValue(profile);
    prisma.contractorProfile.update.mockResolvedValue({ ...profile, onboarding_step: 2, timezone: 'UTC' });
    prisma.auditLog.create.mockResolvedValue({});

    const svc = new ContractorProfileService(prisma as never, makeQueue() as never);
    const result = await svc.updateStep('user_1', 1, { timezone: 'UTC' }, META);

    expect(prisma.contractorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ timezone: 'UTC', onboarding_step: 2 }),
      }),
    );
    expect(result.onboarding_step).toBe(2);
  });

  it('CB-11: step counter never goes backwards (re-saving step 1 when on step 5)', async () => {
    const prisma = makePrisma();
    const profile = fakeProfile({ onboarding_step: 5 });
    prisma.contractorProfile.findUnique.mockResolvedValue(profile);
    prisma.contractorProfile.update.mockResolvedValue({ ...profile, onboarding_step: 5 });
    prisma.auditLog.create.mockResolvedValue({});

    const svc = new ContractorProfileService(prisma as never, makeQueue() as never);
    await svc.updateStep('user_1', 1, { timezone: 'UTC' }, META);

    expect(prisma.contractorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ onboarding_step: 5 }),
      }),
    );
  });

  it('CB-12: step2Schema rejects EMPLOYED_WITH_PERMISSION without employer_name', () => {
    const result = step2Schema.safeParse({
      employment_type: 'EMPLOYED_WITH_PERMISSION',
      has_employer_consent: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('employer_name');
    }
  });

  it('CB-13: step3Schema rejects empty domains array', () => {
    const result = step3Schema.safeParse({ domains: [], skills: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('domains');
    }
  });
});

// ─── CB-14 through CB-15: ContractorProfileService.submitForReview() ─────────

describe('ContractorProfileService.submitForReview()', () => {
  it('CB-14: transitions status to PENDING and queues email', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();
    const profile = readyProfile();

    // submitForReview calls findUnique (with user include)
    prisma.contractorProfile.findUnique.mockResolvedValue({
      ...profile,
      user: { email: 'contractor@example.com' },
    });
    // transitionProfile calls findUniqueOrThrow, then update
    prisma.contractorProfile.findUniqueOrThrow.mockResolvedValue(profile);
    prisma.contractorProfile.update.mockResolvedValue({
      ...profile,
      status: 'PENDING' as ContractorProfile['status'],
    });
    prisma.auditLog.create.mockResolvedValue({});

    const svc = new ContractorProfileService(prisma as never, queue as never);
    const result = await svc.submitForReview('user_1');

    expect(result.status).toBe('PENDING');
    expect(queue.add).toHaveBeenCalledWith(
      'onboarding-submitted',
      expect.objectContaining({ type: 'onboarding-submitted', to: 'contractor@example.com' }),
    );
  });

  it('CB-15: throws INVALID_TRANSITION when profile is not INCOMPLETE', async () => {
    const prisma = makePrisma();
    const profile = fakeProfile({ status: 'PENDING' as ContractorProfile['status'] });

    prisma.contractorProfile.findUnique.mockResolvedValue({
      ...profile,
      user: { email: 'contractor@example.com' },
    });
    // transitionProfile reads the profile — returns PENDING status
    prisma.contractorProfile.findUniqueOrThrow.mockResolvedValue(profile);

    const svc = new ContractorProfileService(prisma as never, makeQueue() as never);
    await expect(svc.submitForReview('user_1')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      status: 422,
    });
  });
});
