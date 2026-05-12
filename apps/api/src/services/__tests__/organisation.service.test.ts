import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Organisation, OrgMember, OrgInsuranceCertificate } from '@prisma/client';
import { OrganisationService } from '../organisation.service.js';
import { createOrganisationSchema } from '@onys/shared';

// ─── Fake factories ───────────────────────────────────────────────────────────

function fakeOrg(overrides: Partial<Organisation> = {}): Organisation {
  return {
    id: 'org_1',
    entity_name: 'Acme IT Pty Ltd',
    registration_number: null,
    country: 'AU',
    abn: '12345678901',
    address: '123 Main St, Sydney NSW 2000',
    contact_email: 'admin@acme.com',
    logo_blob_path: null,
    verification_status: 'INCOMPLETE',
    verified_at: null,
    verified_by: null,
    rejection_reason: null,
    stripe_account_id: null,
    stripe_account_enabled: false,
    insurance_tier_met: false,
    agreement_accepted_at: null,
    agreement_version: null,
    agreement_ip_address: null,
    agreement_user_agent: null,
    suspended_at: null,
    suspension_reason: null,
    admin_user_id: 'user_admin',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Organisation;
}

function fakeMember(overrides: Partial<OrgMember> = {}): OrgMember {
  return {
    id: 'member_1',
    org_id: 'org_1',
    user_id: 'user_admin',
    role: 'ORG_ADMIN',
    status: 'VERIFIED',
    invited_email: 'admin@acme.com',
    invitation_token_hash: null,
    invitation_expires_at: null,
    invitation_accepted_at: new Date(),
    invited_by_user_id: null,
    identity_status: 'APPROVED',
    kyc_status: 'APPROVED',
    active_order_count: 0,
    joined_at: new Date(),
    removed_at: null,
    removal_reason: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as OrgMember;
}

function fakeCert(
  type: 'PI' | 'PL',
  overrides: Partial<OrgInsuranceCertificate> = {},
): OrgInsuranceCertificate {
  const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  return {
    id: `cert_${type}`,
    org_id: 'org_1',
    insurer_name: 'NRMA Insurance',
    policy_number: `POL-${type}-001`,
    insurance_type: type,
    coverage_amount_aud: 1000000 as unknown as OrgInsuranceCertificate['coverage_amount_aud'],
    policy_start_date: new Date(),
    policy_expiry_date: future,
    worldwide_coverage: true,
    tier: 'STANDARD' as OrgInsuranceCertificate['tier'],
    certificate_blob_path: `/certs/${type}.pdf`,
    status: 'VERIFIED',
    reviewed_by: 'admin_1',
    reviewed_at: new Date(),
    rejection_reason: null,
    verified_at: new Date(),
    expired_at: null,
    expiry_reminder_sent: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as OrgInsuranceCertificate;
}

// ─── Mock factories ───────────────────────────────────────────────────────────

function makePrisma() {
  return {
    user: {
      findUniqueOrThrow: vi.fn(),
    },
    organisation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    orgMember: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    orgDocument: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    orgInsuranceCertificate: {
      findMany: vi.fn(),
    },
    orgLegalAcceptance: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

function makeQueue() {
  return { add: vi.fn() };
}

const META = { ip: '127.0.0.1', userAgent: 'test-agent' };

// ─── O-01 through O-05: createOrganisation ────────────────────────────────────

describe('OrganisationService.createOrganisation()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: OrganisationService;

  beforeEach(() => {
    prisma = makePrisma();
    queue = makeQueue();
    svc = new OrganisationService(prisma as never, queue as never);
  });

  it('O-01: valid creation by ORGANISATION_ADMIN — org created, creator auto-added as ORG_ADMIN VERIFIED', async () => {
    const org = fakeOrg();
    const member = fakeMember();

    prisma.user.findUniqueOrThrow.mockResolvedValue({
      account_type: 'ORGANIZATION_ADMIN',
      email: 'admin@acme.com',
      full_name: 'Alice Admin',
    });
    prisma.organisation.findFirst.mockResolvedValue(null); // no existing org

    // $transaction executes the callback synchronously with a tx object
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        organisation: { create: vi.fn().mockResolvedValue(org) },
        orgMember: { create: vi.fn().mockResolvedValue(member) },
      };
      return fn(tx);
    });

    prisma.auditLog.create.mockResolvedValue({});

    const result = await svc.createOrganisation('user_admin', {
      entity_name: 'Acme IT Pty Ltd',
      country: 'AU',
      abn: '12345678901',
      contact_email: 'admin@acme.com',
    }, META);

    expect(result.id).toBe('org_1');
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action_type: 'ORGANISATION_CREATED' }) }),
    );
  });

  it('O-02: INDIVIDUAL_CONTRACTOR account → throws WRONG_ACCOUNT_TYPE 403', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      account_type: 'INDIVIDUAL_CONTRACTOR',
      email: 'contractor@example.com',
      full_name: 'Bob Builder',
    });

    await expect(
      svc.createOrganisation('user_contractor', {
        entity_name: 'Bob Corp',
        country: 'AU',
        abn: '12345678901',
        contact_email: 'contractor@example.com',
      }, META),
    ).rejects.toMatchObject({ code: 'WRONG_ACCOUNT_TYPE', status: 403 });
  });

  it('O-03: admin already has an organisation → throws ORGANISATION_EXISTS 409', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      account_type: 'ORGANIZATION_ADMIN',
      email: 'admin@acme.com',
      full_name: 'Alice Admin',
    });
    prisma.organisation.findFirst.mockResolvedValue(fakeOrg()); // already exists

    await expect(
      svc.createOrganisation('user_admin', {
        entity_name: 'Acme IT Pty Ltd',
        country: 'AU',
        abn: '12345678901',
        contact_email: 'admin@acme.com',
      }, META),
    ).rejects.toMatchObject({ code: 'ORGANISATION_EXISTS', status: 409 });
  });

  it('O-04: AU country without ABN → Zod schema rejects', () => {
    const result = createOrganisationSchema.safeParse({
      entity_name: 'Acme IT Pty Ltd',
      country: 'AU',
      contact_email: 'admin@acme.com',
      // no abn
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('abn');
    }
  });

  it('O-05: non-AU country without ABN → Zod schema allows', () => {
    const result = createOrganisationSchema.safeParse({
      entity_name: 'UK Corp Ltd',
      country: 'GB',
      contact_email: 'admin@ukcorp.com',
    });
    expect(result.success).toBe(true);
  });
});

// ─── O-06 through O-08: acceptAgreement ──────────────────────────────────────

describe('OrganisationService.acceptAgreement()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: OrganisationService;

  beforeEach(() => {
    prisma = makePrisma();
    queue = makeQueue();
    svc = new OrganisationService(prisma as never, queue as never);
  });

  it('O-06: first acceptance → OrgLegalAcceptance created, org.agreement_accepted_at set, audit written', async () => {
    const org = fakeOrg();
    const updatedOrg = fakeOrg({ agreement_accepted_at: new Date(), agreement_version: '2026-03-01' });

    prisma.organisation.findFirst.mockResolvedValue(org);
    prisma.orgLegalAcceptance.findUnique.mockResolvedValue(null); // not yet accepted
    prisma.orgLegalAcceptance.create.mockResolvedValue({});
    prisma.organisation.update.mockResolvedValue(updatedOrg);
    prisma.auditLog.create.mockResolvedValue({});

    const result = await svc.acceptAgreement(
      'user_admin',
      { agreement_version: '2026-03-01', accepted: true },
      META,
    );

    expect(result.agreement_accepted_at).not.toBeNull();
    expect(prisma.orgLegalAcceptance.create).toHaveBeenCalledOnce();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action_type: 'ORG_AGREEMENT_ACCEPTED' }) }),
    );
  });

  it('O-07: same version accepted twice → throws AGREEMENT_ALREADY_ACCEPTED 409', async () => {
    prisma.organisation.findFirst.mockResolvedValue(fakeOrg());
    prisma.orgLegalAcceptance.findUnique.mockResolvedValue({ id: 'accept_1' }); // already exists

    await expect(
      svc.acceptAgreement('user_admin', { agreement_version: '2026-03-01', accepted: true }, META),
    ).rejects.toMatchObject({ code: 'AGREEMENT_ALREADY_ACCEPTED', status: 409 });
  });

  it('O-08: different version → allowed (new acceptance record created)', async () => {
    const org = fakeOrg({ agreement_accepted_at: new Date(), agreement_version: '2025-01-01' });
    const updatedOrg = fakeOrg({ agreement_accepted_at: new Date(), agreement_version: '2026-03-01' });

    prisma.organisation.findFirst.mockResolvedValue(org);
    prisma.orgLegalAcceptance.findUnique.mockResolvedValue(null); // v2026 not yet accepted
    prisma.orgLegalAcceptance.create.mockResolvedValue({});
    prisma.organisation.update.mockResolvedValue(updatedOrg);
    prisma.auditLog.create.mockResolvedValue({});

    const result = await svc.acceptAgreement(
      'user_admin',
      { agreement_version: '2026-03-01', accepted: true },
      META,
    );

    expect(result.agreement_version).toBe('2026-03-01');
    expect(prisma.orgLegalAcceptance.create).toHaveBeenCalledOnce();
  });
});

// ─── O-09 through O-12: inviteMember ─────────────────────────────────────────

describe('OrganisationService.inviteMember()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: OrganisationService;

  beforeEach(() => {
    prisma = makePrisma();
    queue = makeQueue();
    svc = new OrganisationService(prisma as never, queue as never);
  });

  it('O-09: valid invite → OrgMember INVITED, email queued, token hash stored', async () => {
    const org = fakeOrg({ agreement_accepted_at: new Date() });
    const newMember = fakeMember({ status: 'INVITED', invitation_token_hash: 'some_hash' });

    prisma.organisation.findFirst.mockResolvedValue(org);
    prisma.orgMember.findUnique.mockResolvedValue(null); // no duplicate
    prisma.orgMember.create.mockResolvedValue(newMember);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ full_name: 'Alice Admin' });
    queue.add.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});

    const result = await svc.inviteMember(
      'user_admin',
      { email: 'newmember@acme.com', role: 'ORG_MEMBER' },
      META,
    );

    expect(result.status).toBe('INVITED');
    expect(result.invitation_token_hash).toBeTruthy();
    expect(queue.add).toHaveBeenCalledWith('org-member-invitation', expect.objectContaining({
      type: 'org-member-invitation',
      to: 'newmember@acme.com',
    }));
  });

  it('O-10: invite before agreement accepted → throws AGREEMENT_REQUIRED 422', async () => {
    prisma.organisation.findFirst.mockResolvedValue(fakeOrg({ agreement_accepted_at: null }));

    await expect(
      svc.inviteMember('user_admin', { email: 'new@acme.com', role: 'ORG_MEMBER' }, META),
    ).rejects.toMatchObject({ code: 'AGREEMENT_REQUIRED', status: 422 });
  });

  it('O-11: duplicate invite to same email → throws MEMBER_ALREADY_EXISTS 409', async () => {
    prisma.organisation.findFirst.mockResolvedValue(fakeOrg({ agreement_accepted_at: new Date() }));
    prisma.orgMember.findUnique.mockResolvedValue(fakeMember({ status: 'INVITED' }));

    await expect(
      svc.inviteMember('user_admin', { email: 'admin@acme.com', role: 'ORG_MEMBER' }, META),
    ).rejects.toMatchObject({ code: 'MEMBER_ALREADY_EXISTS', status: 409 });
  });

  it('O-12: invite to existing VERIFIED member → throws MEMBER_ALREADY_EXISTS 409', async () => {
    prisma.organisation.findFirst.mockResolvedValue(fakeOrg({ agreement_accepted_at: new Date() }));
    prisma.orgMember.findUnique.mockResolvedValue(fakeMember({ status: 'VERIFIED' }));

    await expect(
      svc.inviteMember('user_admin', { email: 'admin@acme.com', role: 'ORG_MEMBER' }, META),
    ).rejects.toMatchObject({ code: 'MEMBER_ALREADY_EXISTS', status: 409 });
  });
});

// ─── O-13 through O-17: acceptInvitation ─────────────────────────────────────

describe('OrganisationService.acceptInvitation()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: OrganisationService;

  const RAW_TOKEN = 'a'.repeat(64);
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    prisma = makePrisma();
    queue = makeQueue();
    svc = new OrganisationService(prisma as never, queue as never);
  });

  it('O-13: valid token → member status PENDING, token cleared, joined_at set', async () => {
    const invitedMember = fakeMember({
      status: 'INVITED',
      user_id: null,
      invitation_token_hash: 'will_be_hashed_by_service',
      invitation_expires_at: future,
    });
    const updatedMember = fakeMember({ status: 'PENDING', invitation_token_hash: null, joined_at: new Date() });

    // findFirst is used to look up by token hash — return the invited member
    prisma.orgMember.findFirst
      .mockResolvedValueOnce(invitedMember) // token lookup
      .mockResolvedValueOnce(null);         // already-member check

    prisma.user.findUniqueOrThrow.mockResolvedValue({ account_type: 'ORGANIZATION_ADMIN' });
    prisma.orgMember.update.mockResolvedValue(updatedMember);
    prisma.auditLog.create.mockResolvedValue({});

    const result = await svc.acceptInvitation(RAW_TOKEN, 'user_new');

    expect(result.status).toBe('PENDING');
    expect(result.invitation_token_hash).toBeNull();
    expect(result.joined_at).not.toBeNull();
  });

  it('O-14: expired invitation → throws INVITATION_EXPIRED 400', async () => {
    const past = new Date(Date.now() - 1000);
    prisma.orgMember.findFirst.mockResolvedValue(
      fakeMember({ status: 'INVITED', invitation_expires_at: past }),
    );

    await expect(svc.acceptInvitation(RAW_TOKEN, 'user_new')).rejects.toMatchObject({
      code: 'INVITATION_EXPIRED',
      status: 400,
    });
  });

  it('O-15: token not found → throws INVALID_TOKEN 400', async () => {
    prisma.orgMember.findFirst.mockResolvedValue(null);

    await expect(svc.acceptInvitation(RAW_TOKEN, 'user_new')).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
      status: 400,
    });
  });

  it('O-16: already-used invitation (status PENDING) → throws INVITATION_ALREADY_USED 409', async () => {
    prisma.orgMember.findFirst.mockResolvedValue(
      fakeMember({ status: 'PENDING', invitation_expires_at: future }),
    );

    await expect(svc.acceptInvitation(RAW_TOKEN, 'user_new')).rejects.toMatchObject({
      code: 'INVITATION_ALREADY_USED',
      status: 409,
    });
  });

  it('O-17: user already in this org → throws ALREADY_A_MEMBER 409', async () => {
    const invitedMember = fakeMember({
      status: 'INVITED',
      user_id: null,
      invitation_expires_at: future,
    });

    prisma.orgMember.findFirst
      .mockResolvedValueOnce(invitedMember) // token lookup
      .mockResolvedValueOnce(fakeMember()); // already-member check

    prisma.user.findUniqueOrThrow.mockResolvedValue({ account_type: 'ORGANIZATION_ADMIN' });

    await expect(svc.acceptInvitation(RAW_TOKEN, 'user_admin')).rejects.toMatchObject({
      code: 'ALREADY_A_MEMBER',
      status: 409,
    });
  });
});

// ─── O-18 through O-20: removeMember ─────────────────────────────────────────

describe('OrganisationService.removeMember()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: OrganisationService;

  beforeEach(() => {
    prisma = makePrisma();
    queue = makeQueue();
    svc = new OrganisationService(prisma as never, queue as never);
  });

  it('O-18: valid removal → status REMOVED, removal email queued', async () => {
    const org = fakeOrg();
    const targetMember = fakeMember({
      id: 'member_2',
      user_id: 'user_target',
      invited_email: 'target@acme.com',
      active_order_count: 0,
    });

    prisma.organisation.findFirst.mockResolvedValue(org);
    prisma.orgMember.findFirst.mockResolvedValue(targetMember);
    prisma.orgMember.update.mockResolvedValue({ ...targetMember, status: 'REMOVED' });
    prisma.auditLog.create.mockResolvedValue({});
    queue.add.mockResolvedValue({});

    await svc.removeMember('user_admin', 'member_2', 'No longer needed');

    expect(prisma.orgMember.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'REMOVED' }),
    }));
    expect(queue.add).toHaveBeenCalledWith('org-membership-removed', expect.objectContaining({
      type: 'org-membership-removed',
      to: 'target@acme.com',
    }));
  });

  it('O-19: member has active orders → throws MEMBER_HAS_ACTIVE_ORDERS 422', async () => {
    prisma.organisation.findFirst.mockResolvedValue(fakeOrg());
    prisma.orgMember.findFirst.mockResolvedValue(fakeMember({
      id: 'member_2',
      user_id: 'user_target',
      active_order_count: 3,
    }));

    await expect(svc.removeMember('user_admin', 'member_2')).rejects.toMatchObject({
      code: 'MEMBER_HAS_ACTIVE_ORDERS',
      status: 422,
    });
  });

  it('O-20: admin tries to remove themselves → throws CANNOT_REMOVE_SELF 422', async () => {
    prisma.organisation.findFirst.mockResolvedValue(fakeOrg());
    prisma.orgMember.findFirst.mockResolvedValue(fakeMember({
      user_id: 'user_admin', // same as the caller
    }));

    await expect(svc.removeMember('user_admin', 'member_1')).rejects.toMatchObject({
      code: 'CANNOT_REMOVE_SELF',
      status: 422,
    });
  });
});

// ─── O-21 through O-25: verifyMemberEligibility ──────────────────────────────

describe('OrganisationService.verifyMemberEligibility()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: OrganisationService;

  beforeEach(() => {
    prisma = makePrisma();
    queue = makeQueue();
    svc = new OrganisationService(prisma as never, queue as never);
  });

  it('O-21: all checks pass → eligible: true', async () => {
    prisma.orgMember.findUnique.mockResolvedValue(fakeMember({
      status: 'VERIFIED',
      identity_status: 'APPROVED',
      kyc_status: 'APPROVED',
    }));
    prisma.orgInsuranceCertificate.findMany.mockResolvedValue([
      fakeCert('PI'),
      fakeCert('PL'),
    ]);

    const result = await svc.verifyMemberEligibility('member_1');

    expect(result.eligible).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('O-22: member status PENDING → eligible: false, Membership Active check fails', async () => {
    prisma.orgMember.findUnique.mockResolvedValue(fakeMember({
      status: 'PENDING',
      identity_status: 'APPROVED',
      kyc_status: 'APPROVED',
    }));
    prisma.orgInsuranceCertificate.findMany.mockResolvedValue([fakeCert('PI'), fakeCert('PL')]);

    const result = await svc.verifyMemberEligibility('member_1');

    expect(result.eligible).toBe(false);
    const membershipCheck = result.checks.find((c) => c.name === 'Membership Active');
    expect(membershipCheck?.passed).toBe(false);
  });

  it('O-23: KYC not approved → eligible: false, KYC check fails', async () => {
    prisma.orgMember.findUnique.mockResolvedValue(fakeMember({
      status: 'VERIFIED',
      identity_status: 'APPROVED',
      kyc_status: 'NOT_STARTED',
    }));
    prisma.orgInsuranceCertificate.findMany.mockResolvedValue([fakeCert('PI'), fakeCert('PL')]);

    const result = await svc.verifyMemberEligibility('member_1');

    expect(result.eligible).toBe(false);
    const kycCheck = result.checks.find((c) => c.name === 'KYC Approved');
    expect(kycCheck?.passed).toBe(false);
  });

  it('O-24: org insurance not verified → eligible: false, Organisation Insurance check fails', async () => {
    prisma.orgMember.findUnique.mockResolvedValue(fakeMember({
      status: 'VERIFIED',
      identity_status: 'APPROVED',
      kyc_status: 'APPROVED',
    }));
    // Only PI cert — missing PL
    prisma.orgInsuranceCertificate.findMany.mockResolvedValue([fakeCert('PI')]);

    const result = await svc.verifyMemberEligibility('member_1');

    expect(result.eligible).toBe(false);
    const insuranceCheck = result.checks.find((c) => c.name === 'Organisation Insurance');
    expect(insuranceCheck?.passed).toBe(false);
  });

  it('O-25: multiple checks failing → eligible: false, all failing checks listed', async () => {
    prisma.orgMember.findUnique.mockResolvedValue(fakeMember({
      status: 'PENDING',
      identity_status: 'NOT_STARTED',
      kyc_status: 'NOT_STARTED',
    }));
    prisma.orgInsuranceCertificate.findMany.mockResolvedValue([]); // no certs

    const result = await svc.verifyMemberEligibility('member_1');

    expect(result.eligible).toBe(false);
    const failingChecks = result.checks.filter((c) => !c.passed);
    expect(failingChecks.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── O-26 through O-28: updateMember ─────────────────────────────────────────

describe('OrganisationService.updateMember()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: OrganisationService;

  beforeEach(() => {
    prisma = makePrisma();
    queue = makeQueue();
    svc = new OrganisationService(prisma as never, queue as never);
  });

  it('O-26: admin demotes themselves to ORG_MEMBER → throws CANNOT_DEMOTE_SELF 422', async () => {
    prisma.organisation.findFirst.mockResolvedValue(fakeOrg());
    prisma.orgMember.findFirst.mockResolvedValue(fakeMember({
      user_id: 'user_admin',
      role: 'ORG_ADMIN',
    }));

    await expect(
      svc.updateMember('user_admin', 'member_1', { role: 'ORG_MEMBER' }),
    ).rejects.toMatchObject({ code: 'CANNOT_DEMOTE_SELF', status: 422 });
  });

  it('O-27: setting member INACTIVE with active orders → throws MEMBER_HAS_ACTIVE_ORDERS 422', async () => {
    prisma.organisation.findFirst.mockResolvedValue(fakeOrg());
    prisma.orgMember.findFirst.mockResolvedValue(fakeMember({
      user_id: 'user_target',
      active_order_count: 2,
    }));

    await expect(
      svc.updateMember('user_admin', 'member_1', { status: 'INACTIVE' }),
    ).rejects.toMatchObject({ code: 'MEMBER_HAS_ACTIVE_ORDERS', status: 422 });
  });

  it('O-28: valid role change → member updated, audit written', async () => {
    const target = fakeMember({ id: 'member_2', user_id: 'user_target', role: 'ORG_MEMBER' });
    const updated = { ...target, role: 'ORG_ADMIN' };

    prisma.organisation.findFirst.mockResolvedValue(fakeOrg());
    prisma.orgMember.findFirst.mockResolvedValue(target);
    prisma.orgMember.update.mockResolvedValue(updated);
    prisma.auditLog.create.mockResolvedValue({});

    const result = await svc.updateMember('user_admin', 'member_2', { role: 'ORG_ADMIN' });

    expect(result.role).toBe('ORG_ADMIN');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action_type: 'ORG_MEMBER_UPDATED' }) }),
    );
  });
});
