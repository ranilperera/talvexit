import { describe, it, expect, vi } from 'vitest';
import type { InsuranceCertificate } from '@prisma/client';
import {
  getRequiredTier,
  validateCoverageMet,
} from '../insurance-tier.service.js';
import { InsuranceService } from '../insurance.service.js';
import { reviewCertificateSchema } from '@onys/shared';

// ─── Factories ────────────────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
const PAST   = new Date(Date.now() - 24 * 60 * 60 * 1000);

function fakeCert(overrides: Partial<InsuranceCertificate> = {}): InsuranceCertificate {
  return {
    id: 'cert_1',
    contractor_id: 'profile_1',
    insurer_name: 'Acme Insurance',
    policy_number: 'POL-001',
    insurance_type: 'PI',
    coverage_amount_aud: 500_000 as unknown as InsuranceCertificate['coverage_amount_aud'],
    policy_start_date: new Date('2026-01-01'),
    policy_expiry_date: FUTURE,
    worldwide_coverage: true,
    tier: 'STANDARD',
    certificate_blob_path: 'certs/pol-001.pdf',
    status: 'VERIFIED',
    reviewed_by: null,
    reviewed_at: null,
    rejection_reason: null,
    admin_notes: null,
    verified_at: null,
    expired_at: null,
    superseded_at: null,
    expiry_reminder_sent: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as InsuranceCertificate;
}

function fakeProfile(overrides = {}) {
  return {
    id: 'profile_1',
    user_id: 'user_1',
    status: 'ACTIVE',
    domains: ['LINUX'],
    insurance_tier_met: false,
    user: { full_name: 'John Expert' },
    ...overrides,
  };
}

function fakeCertWithContractor(overrides: Partial<InsuranceCertificate> = {}) {
  return {
    ...fakeCert(overrides),
    contractor_id: 'profile_1',
    contractor: {
      id: 'profile_1',
      domains: ['LINUX'],
      user: { email: 'john@contractor.com' },
    },
  };
}

function makePrisma() {
  return {
    contractorProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    insuranceCertificate: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
}

function makeQueue() {
  return { add: vi.fn() };
}

const META = { ip: '127.0.0.1', userAgent: 'test-agent' };

// ─── I-01 to I-06: getRequiredTier ───────────────────────────────────────────

describe('insuranceTierService.getRequiredTier()', () => {
  it('I-01: CYBERSECURITY domain → HIGH_RISK', () => {
    expect(getRequiredTier(['CYBERSECURITY'])).toBe('HIGH_RISK');
  });

  it('I-02: CLOUD_AZURE + NETWORKING → HIGH_RISK wins over ELEVATED', () => {
    expect(getRequiredTier(['CLOUD_AZURE', 'NETWORKING'])).toBe('HIGH_RISK');
  });

  it('I-03: DATABASE + DEVOPS only → ELEVATED', () => {
    expect(getRequiredTier(['DATABASE', 'DEVOPS'])).toBe('ELEVATED');
  });

  it('I-04: LINUX + WINDOWS_ADMIN only → STANDARD', () => {
    expect(getRequiredTier(['LINUX', 'WINDOWS_ADMIN'])).toBe('STANDARD');
  });

  it('I-05: Empty domains array → STANDARD', () => {
    expect(getRequiredTier([])).toBe('STANDARD');
  });

  it('I-06: All 14 domains → HIGH_RISK (any HIGH_RISK domain triggers it)', () => {
    const all = [
      'FIREWALL', 'NETWORKING', 'DATABASE', 'CLOUD_AZURE', 'LINUX',
      'WINDOWS_ADMIN', 'CYBERSECURITY', 'DEVOPS', 'STORAGE', 'VIRTUALIZATION',
      'OFFICE_365', 'BACKUP', 'AI_INTEGRATION', 'SYSTEM_ADMIN',
    ];
    expect(getRequiredTier(all)).toBe('HIGH_RISK');
  });
});

// ─── I-07 to I-15: validateCoverageMet ───────────────────────────────────────

describe('insuranceTierService.validateCoverageMet()', () => {
  it('I-07: STANDARD — PI $500K + PL $500K → met: true', () => {
    const certs = [
      fakeCert({ insurance_type: 'PI', coverage_amount_aud: 500_000 as unknown as InsuranceCertificate['coverage_amount_aud'] }),
      fakeCert({ id: 'cert_2', insurance_type: 'PL', coverage_amount_aud: 500_000 as unknown as InsuranceCertificate['coverage_amount_aud'] }),
    ];
    const result = validateCoverageMet(certs, 'STANDARD');
    expect(result.met).toBe(true);
    expect(result.gaps).toHaveLength(0);
  });

  it('I-08: STANDARD — PI $500K but no PL → met: false, gaps mentions PL', () => {
    const certs = [fakeCert({ insurance_type: 'PI' })];
    const result = validateCoverageMet(certs, 'STANDARD');
    expect(result.met).toBe(false);
    expect(result.gaps.some((g) => g.includes('Public Liability'))).toBe(true);
  });

  it('I-09: ELEVATED — PI $1M + PL $1M + CYBER → met: true', () => {
    const certs = [
      fakeCert({ insurance_type: 'PI', coverage_amount_aud: 1_000_000 as unknown as InsuranceCertificate['coverage_amount_aud'] }),
      fakeCert({ id: 'cert_2', insurance_type: 'PL', coverage_amount_aud: 1_000_000 as unknown as InsuranceCertificate['coverage_amount_aud'] }),
      fakeCert({ id: 'cert_3', insurance_type: 'CYBER' }),
    ];
    const result = validateCoverageMet(certs, 'ELEVATED');
    expect(result.met).toBe(true);
  });

  it('I-10: ELEVATED — PI $1M + PL $1M but no CYBER → gaps mentions Cyber', () => {
    const certs = [
      fakeCert({ insurance_type: 'PI', coverage_amount_aud: 1_000_000 as unknown as InsuranceCertificate['coverage_amount_aud'] }),
      fakeCert({ id: 'cert_2', insurance_type: 'PL', coverage_amount_aud: 1_000_000 as unknown as InsuranceCertificate['coverage_amount_aud'] }),
    ];
    const result = validateCoverageMet(certs, 'ELEVATED');
    expect(result.met).toBe(false);
    expect(result.gaps.some((g) => g.includes('Cyber'))).toBe(true);
  });

  it('I-11: ELEVATED — PI $500K (below min) + PL $1M + CYBER → gaps mentions PI', () => {
    const certs = [
      fakeCert({ insurance_type: 'PI', coverage_amount_aud: 500_000 as unknown as InsuranceCertificate['coverage_amount_aud'] }),
      fakeCert({ id: 'cert_2', insurance_type: 'PL', coverage_amount_aud: 1_000_000 as unknown as InsuranceCertificate['coverage_amount_aud'] }),
      fakeCert({ id: 'cert_3', insurance_type: 'CYBER' }),
    ];
    const result = validateCoverageMet(certs, 'ELEVATED');
    expect(result.met).toBe(false);
    expect(result.gaps.some((g) => g.includes('Professional Indemnity'))).toBe(true);
  });

  it('I-12: worldwide_coverage: false → not counted as valid', () => {
    const certs = [
      fakeCert({ insurance_type: 'PI', worldwide_coverage: false }),
      fakeCert({ id: 'cert_2', insurance_type: 'PL', worldwide_coverage: false }),
    ];
    const result = validateCoverageMet(certs, 'STANDARD');
    expect(result.met).toBe(false);
    expect(result.has_valid_pi).toBe(false);
    expect(result.has_valid_pl).toBe(false);
  });

  it('I-13: PENDING_REVIEW status → not counted even if coverage sufficient', () => {
    const certs = [
      fakeCert({ insurance_type: 'PI', status: 'PENDING_REVIEW' }),
      fakeCert({ id: 'cert_2', insurance_type: 'PL', status: 'PENDING_REVIEW' }),
    ];
    const result = validateCoverageMet(certs, 'STANDARD');
    expect(result.met).toBe(false);
  });

  it('I-14: policy_expiry_date in the past → not counted as valid', () => {
    const certs = [
      fakeCert({ insurance_type: 'PI', policy_expiry_date: PAST }),
      fakeCert({ id: 'cert_2', insurance_type: 'PL', policy_expiry_date: PAST }),
    ];
    const result = validateCoverageMet(certs, 'STANDARD');
    expect(result.met).toBe(false);
  });

  it('I-15: HIGH_RISK — PI $1M + PL $1M + CYBER → met: true', () => {
    const certs = [
      fakeCert({ insurance_type: 'PI', coverage_amount_aud: 1_000_000 as unknown as InsuranceCertificate['coverage_amount_aud'] }),
      fakeCert({ id: 'cert_2', insurance_type: 'PL', coverage_amount_aud: 1_000_000 as unknown as InsuranceCertificate['coverage_amount_aud'] }),
      fakeCert({ id: 'cert_3', insurance_type: 'CYBER' }),
    ];
    const result = validateCoverageMet(certs, 'HIGH_RISK');
    expect(result.met).toBe(true);
  });
});

// ─── I-16 to I-18: InsuranceService.uploadCertificate ────────────────────────

describe('InsuranceService.uploadCertificate()', () => {
  const validInput = {
    insurer_name: 'Acme Insurance',
    policy_number: 'POL-001',
    insurance_type: 'PI' as const,
    coverage_amount_aud: 500_000,
    policy_start_date: '2026-01-01T00:00:00.000Z',
    policy_expiry_date: FUTURE.toISOString(),
    worldwide_coverage: true as const,
    certificate_blob_path: 'certs/pol-001.pdf',
  };

  it('I-16: valid PI cert uploaded → PENDING_REVIEW, email queued', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();
    const service = new InsuranceService(prisma as never, queue as never);

    prisma.contractorProfile.findUnique.mockResolvedValue(fakeProfile());
    prisma.insuranceCertificate.findFirst.mockResolvedValue(null);
    const created = fakeCert({ status: 'PENDING_REVIEW' });
    prisma.insuranceCertificate.create.mockResolvedValue(created);
    prisma.auditLog.create.mockResolvedValue({});

    const result = await service.uploadCertificate('user_1', validInput, META);

    expect(result.status).toBe('PENDING_REVIEW');
    expect(prisma.insuranceCertificate.create).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledWith(
      'admin-insurance-review-needed',
      expect.objectContaining({ type: 'admin-insurance-review-needed' }),
    );
  });

  it('I-17: second PI cert → first PI marked SUPERSEDED, new one created', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();
    const service = new InsuranceService(prisma as never, queue as never);

    prisma.contractorProfile.findUnique.mockResolvedValue(fakeProfile());
    const existingVerified = fakeCert({ id: 'cert_old', status: 'VERIFIED' });
    prisma.insuranceCertificate.findFirst.mockResolvedValue(existingVerified);
    prisma.insuranceCertificate.update.mockResolvedValue({ ...existingVerified, status: 'SUPERSEDED' });
    const created = fakeCert({ id: 'cert_new', status: 'PENDING_REVIEW' });
    prisma.insuranceCertificate.create.mockResolvedValue(created);
    prisma.auditLog.create.mockResolvedValue({});

    await service.uploadCertificate('user_1', validInput, META);

    expect(prisma.insuranceCertificate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cert_old' },
        data: expect.objectContaining({ status: 'SUPERSEDED' }),
      }),
    );
    expect(prisma.insuranceCertificate.create).toHaveBeenCalledOnce();
  });

  it('I-18: contractor not found → throws PROFILE_NOT_FOUND 404', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();
    const service = new InsuranceService(prisma as never, queue as never);

    prisma.contractorProfile.findUnique.mockResolvedValue(null);

    await expect(service.uploadCertificate('user_1', validInput, META)).rejects.toMatchObject({
      code: 'PROFILE_NOT_FOUND',
      status: 404,
    });
  });
});

// ─── I-19 to I-23: InsuranceService.adminReviewCertificate ───────────────────

describe('InsuranceService.adminReviewCertificate()', () => {
  it('I-19: VERIFIED decision → cert updated, contractor email queued', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();
    const service = new InsuranceService(prisma as never, queue as never);

    const pendingCert = fakeCertWithContractor({ status: 'PENDING_REVIEW' });
    prisma.insuranceCertificate.findUnique.mockResolvedValue(pendingCert);
    const verifiedCert = fakeCert({ status: 'VERIFIED' });
    prisma.insuranceCertificate.update.mockResolvedValue(verifiedCert);
    prisma.auditLog.create.mockResolvedValue({});
    // Coverage not fully met — only one cert
    prisma.insuranceCertificate.findMany.mockResolvedValue([verifiedCert]);
    prisma.contractorProfile.update.mockResolvedValue({});

    const result = await service.adminReviewCertificate('cert_1', 'admin_1', {
      decision: 'VERIFIED',
    });

    expect(result.status).toBe('VERIFIED');
    expect(prisma.insuranceCertificate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'VERIFIED' }),
      }),
    );
  });

  it('I-20: REJECTED without rejection_reason → Zod rejects it', () => {
    const result = reviewCertificateSchema.safeParse({ decision: 'REJECTED' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('rejection_reason'))).toBe(true);
    }
  });

  it('I-21: REJECTED with reason → cert REJECTED, rejection email queued', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();
    const service = new InsuranceService(prisma as never, queue as never);

    const pendingCert = fakeCertWithContractor({ status: 'PENDING_REVIEW' });
    prisma.insuranceCertificate.findUnique.mockResolvedValue(pendingCert);
    const rejectedCert = fakeCert({ status: 'REJECTED' });
    prisma.insuranceCertificate.update.mockResolvedValue(rejectedCert);
    prisma.auditLog.create.mockResolvedValue({});

    const result = await service.adminReviewCertificate('cert_1', 'admin_1', {
      decision: 'REJECTED',
      rejection_reason: 'Policy number does not match the certificate document',
    });

    expect(result.status).toBe('REJECTED');
    expect(queue.add).toHaveBeenCalledWith(
      'insurance-rejected',
      expect.objectContaining({ type: 'insurance-rejected' }),
    );
  });

  it('I-22: certificate not in PENDING_REVIEW → throws INVALID_CERT_STATUS 422', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();
    const service = new InsuranceService(prisma as never, queue as never);

    prisma.insuranceCertificate.findUnique.mockResolvedValue(
      fakeCertWithContractor({ status: 'VERIFIED' }),
    );

    await expect(
      service.adminReviewCertificate('cert_1', 'admin_1', { decision: 'VERIFIED' }),
    ).rejects.toMatchObject({ code: 'INVALID_CERT_STATUS', status: 422 });
  });

  it('I-23: VERIFIED and coverage complete → insurance_tier_met set to true', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();
    const service = new InsuranceService(prisma as never, queue as never);

    // Cert being reviewed is a PI cert
    const pendingCert = fakeCertWithContractor({ status: 'PENDING_REVIEW', insurance_type: 'PI' });
    prisma.insuranceCertificate.findUnique.mockResolvedValue(pendingCert);
    const verifiedCert = fakeCert({ status: 'VERIFIED', insurance_type: 'PI' });
    prisma.insuranceCertificate.update.mockResolvedValue(verifiedCert);
    prisma.auditLog.create.mockResolvedValue({});

    // findMany returns a complete PI + PL set — coverage is now met for STANDARD tier
    prisma.insuranceCertificate.findMany.mockResolvedValue([
      fakeCert({ id: 'cert_pi', insurance_type: 'PI', status: 'VERIFIED', coverage_amount_aud: 500_000 as unknown as InsuranceCertificate['coverage_amount_aud'] }),
      fakeCert({ id: 'cert_pl', insurance_type: 'PL', status: 'VERIFIED', coverage_amount_aud: 500_000 as unknown as InsuranceCertificate['coverage_amount_aud'] }),
    ]);
    prisma.contractorProfile.update.mockResolvedValue({});

    await service.adminReviewCertificate('cert_1', 'admin_1', { decision: 'VERIFIED' });

    expect(prisma.contractorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ insurance_tier_met: true }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'insurance-verified',
      expect.objectContaining({ type: 'insurance-verified' }),
    );
  });
});
