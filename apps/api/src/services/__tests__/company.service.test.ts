import { describe, it, expect, vi } from 'vitest';
import { CompanyService } from '../company.service.js';

// ─── Factories ────────────────────────────────────────────────────────────────

const META = { ip: '127.0.0.1', userAgent: 'test-agent' };

function fakeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    email: 'admin@acme.com',
    password_hash: '$2b$12$hash',
    account_type: 'COMPANY_ADMIN',
    full_name: 'Alice Admin',
    email_verified: false,
    failed_login_count: 0,
    ...overrides,
  };
}

function fakeCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: 'company_1',
    company_name: 'Acme IT Pty Ltd',
    abn: '51824753556',
    acn: null,
    status: 'DRAFT',
    primary_admin_id: 'user_1',
    authorization_type: null,
    authorization_doc_blob_path: null,
    domains: [],
    ...overrides,
  };
}

function fakeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member_1',
    company_id: 'company_1',
    user_id: 'user_1',
    role: 'COMPANY_ADMIN',
    is_primary_admin: true,
    status: 'ACTIVE',
    joined_at: new Date(),
    ...overrides,
  };
}

function fakeInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invite_1',
    company_id: 'company_1',
    invited_email: 'newbie@example.com',
    role: 'CONSULTANT',
    job_title: null,
    invited_by_id: 'user_1',
    token_hash: 'hashed_token',
    expires_at: new Date(Date.now() + 72 * 3_600_000),
    status: 'PENDING',
    accepted_at: null,
    accepted_by_user_id: null,
    created_at: new Date(),
    company: fakeCompany(),
    ...overrides,
  };
}

function fakeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order_1',
    company_id: 'company_1',
    executing_member_id: null,
    status: 'PAYMENT_HELD',
    task: { title: 'Firewall Setup' },
    ...overrides,
  };
}

// ─── Prisma mock factory ──────────────────────────────────────────────────────

function makePrisma() {
  const txUser = { create: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() };
  const txCompany = { create: vi.fn() };
  const txMember = { create: vi.fn() };
  const txInvitation = { update: vi.fn() };

  return {
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    consultingCompany: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    companyMember: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    companyInvitation: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ user: txUser, consultingCompany: txCompany, companyMember: txMember, companyInvitation: txInvitation }),
    ),
    _txUser: txUser,
    _txCompany: txCompany,
    _txMember: txMember,
    _txInvitation: txInvitation,
  };
}

function makeQueue() {
  return { add: vi.fn() };
}

// ─── registerCompany ──────────────────────────────────────────────────────────

describe('CompanyService.registerCompany()', () => {
  it('CO-01: valid registration creates User, ConsultingCompany, CompanyMember and queues 1 email', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    prisma.user.findUnique.mockResolvedValue(null);      // no existing user
    prisma.consultingCompany.findUnique.mockResolvedValue(null); // no existing ABN

    // $transaction returns the created user
    const createdUser = fakeUser();
    const createdCompany = fakeCompany();
    const createdMember = fakeMember();

    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn({
        user: { create: vi.fn().mockResolvedValue(createdUser) },
        consultingCompany: { create: vi.fn().mockResolvedValue(createdCompany) },
        companyMember: { create: vi.fn().mockResolvedValue(createdMember) },
      })),
    );

    prisma.user.update.mockResolvedValue(createdUser);
    prisma.auditLog.create.mockResolvedValue({});
    queue.add.mockResolvedValue({});

    const svc = new CompanyService(prisma as never, queue as never);
    const result = await svc.registerCompany(
      {
        full_name: 'Alice Admin',
        email: 'admin@acme.com',
        password: 'TestPass123!',
        company_name: 'Acme IT Pty Ltd',
        abn: '51824753556',
        job_title: 'Director',
        country: 'AU',
        agreed_to_terms: true,
      },
      META,
    );

    expect(result.company.status).toBe('DRAFT');
    expect(result.user.account_type).toBe('COMPANY_ADMIN');
    // One email: verification only (admin alert sent at submit-for-review)
    expect(queue.add).toHaveBeenCalledTimes(1);
    const types = queue.add.mock.calls.map((c: unknown[]) => (c[0] as string));
    expect(types).toContain('verify-email');
  });

  it('CO-02: email already registered → throws EMAIL_IN_USE 409', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();
    prisma.user.findUnique.mockResolvedValue(fakeUser());

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(
      svc.registerCompany(
        {
          full_name: 'Alice Admin',
          email: 'admin@acme.com',
          password: 'TestPass123!',
          company_name: 'Acme IT Pty Ltd',
          abn: '51824753556',
          job_title: 'Director',
          country: 'AU',
          agreed_to_terms: true,
        },
        META,
      ),
    ).rejects.toMatchObject({ code: 'EMAIL_IN_USE', status: 409 });
  });

  it('CO-03: ABN already registered → throws ABN_IN_USE 409', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.consultingCompany.findUnique.mockResolvedValue(fakeCompany());

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(
      svc.registerCompany(
        {
          full_name: 'Alice Admin',
          email: 'admin@acme.com',
          password: 'TestPass123!',
          company_name: 'Acme IT Pty Ltd',
          abn: '51824753556',
          job_title: 'Director',
          country: 'AU',
          agreed_to_terms: true,
        },
        META,
      ),
    ).rejects.toMatchObject({ code: 'ABN_IN_USE', status: 409 });
  });
});

// ─── inviteMember ─────────────────────────────────────────────────────────────

describe('CompanyService.inviteMember()', () => {
  const INVITE_DATA = {
    invited_email: 'newbie@example.com',
    role: 'CONSULTANT' as const,
    member_domains: [] as string[],
  };

  it('CO-05: COMPANY_ADMIN invites new email → invitation created + email queued', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    prisma.consultingCompany.findUnique.mockResolvedValue(fakeCompany({ status: 'ACTIVE' }));
    prisma.companyMember.findUnique.mockResolvedValue(fakeMember({ role: 'COMPANY_ADMIN' }));
    prisma.user.findUnique.mockResolvedValueOnce(null);  // invited user does not exist
    prisma.companyInvitation.findFirst.mockResolvedValue(null); // no pending invite
    prisma.user.findUniqueOrThrow.mockResolvedValue(fakeUser()); // inviter
    const createdInvite = fakeInvitation();
    prisma.companyInvitation.create.mockResolvedValue(createdInvite);
    prisma.auditLog.create.mockResolvedValue({});

    const svc = new CompanyService(prisma as never, queue as never);
    const result = await svc.inviteMember('company_1', 'user_1', INVITE_DATA);

    expect(result.invited_email).toBe('newbie@example.com');
    expect(queue.add).toHaveBeenCalledWith('company-member-invitation', expect.objectContaining({
      type: 'company-member-invitation',
      to: 'newbie@example.com',
    }));
    // invite_url should NOT contain &existing=true since user doesn't exist
    const call = queue.add.mock.calls[0][1] as Record<string, string>;
    expect(call.invite_url).not.toContain('existing=true');
  });

  it('CO-06: SENIOR_CONSULTANT can also invite → passes', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    prisma.consultingCompany.findUnique.mockResolvedValue(fakeCompany({ status: 'ACTIVE' }));
    prisma.companyMember.findUnique.mockResolvedValue(fakeMember({ role: 'SENIOR_CONSULTANT', is_primary_admin: false }));
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.companyInvitation.findFirst.mockResolvedValue(null);
    prisma.user.findUniqueOrThrow.mockResolvedValue(fakeUser());
    prisma.companyInvitation.create.mockResolvedValue(fakeInvitation());
    prisma.auditLog.create.mockResolvedValue({});

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(svc.inviteMember('company_1', 'user_1', INVITE_DATA)).resolves.toBeDefined();
  });

  it('CO-07: CONSULTANT tries to invite → throws INSUFFICIENT_COMPANY_ROLE 403', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    prisma.consultingCompany.findUnique.mockResolvedValue(fakeCompany({ status: 'ACTIVE' }));
    prisma.companyMember.findUnique.mockResolvedValue(fakeMember({ role: 'CONSULTANT', is_primary_admin: false }));

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(svc.inviteMember('company_1', 'user_1', INVITE_DATA))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_COMPANY_ROLE', status: 403 });
  });

  it('CO-08: email already a member → throws ALREADY_A_MEMBER 409', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    prisma.consultingCompany.findUnique.mockResolvedValue(fakeCompany({ status: 'ACTIVE' }));
    prisma.companyMember.findUnique.mockResolvedValue(fakeMember({ role: 'COMPANY_ADMIN' }));
    // invited user exists and is already an active member
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user_2',
      email: 'newbie@example.com',
      company_memberships: [{ id: 'member_2' }],
    });

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(svc.inviteMember('company_1', 'user_1', INVITE_DATA))
      .rejects.toMatchObject({ code: 'ALREADY_A_MEMBER', status: 409 });
  });

  it('CO-09: pending invitation already exists → throws INVITATION_ALREADY_PENDING 409', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    prisma.consultingCompany.findUnique.mockResolvedValue(fakeCompany({ status: 'ACTIVE' }));
    prisma.companyMember.findUnique.mockResolvedValue(fakeMember({ role: 'COMPANY_ADMIN' }));
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.companyInvitation.findFirst.mockResolvedValue(fakeInvitation()); // pending exists

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(svc.inviteMember('company_1', 'user_1', INVITE_DATA))
      .rejects.toMatchObject({ code: 'INVITATION_ALREADY_PENDING', status: 409 });
  });

  it('CO-10: company not ACTIVE → throws COMPANY_NOT_ACTIVE 422', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    prisma.consultingCompany.findUnique.mockResolvedValue(fakeCompany({ status: 'PENDING_VERIFICATION' }));

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(svc.inviteMember('company_1', 'user_1', INVITE_DATA))
      .rejects.toMatchObject({ code: 'COMPANY_NOT_ACTIVE', status: 422 });
  });
});

// ─── acceptInvitation ─────────────────────────────────────────────────────────

describe('CompanyService.acceptInvitation()', () => {
  const VALID_TOKEN = 'rawtoken123';

  function setupValidInvite(prisma: ReturnType<typeof makePrisma>, overrides: Record<string, unknown> = {}) {
    prisma.companyInvitation.findUnique.mockResolvedValue(fakeInvitation(overrides));
  }

  it('CO-11: new user accepts valid token → User created (COMPANY_MEMBER), membership created, admin notified', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    setupValidInvite(prisma);
    // No existing account for invited email
    prisma.user.findUnique
      .mockResolvedValueOnce(null)  // existingAccount check
      .mockResolvedValueOnce(fakeUser({ id: 'user_primary' })) // primary admin
      .mockResolvedValueOnce(fakeUser({ id: 'user_new', full_name: 'Newbie' })); // member

    const newUser = fakeUser({ id: 'user_new', account_type: 'COMPANY_MEMBER' });
    prisma.user.create.mockResolvedValue(newUser);

    const createdMembership = fakeMember({ user_id: 'user_new', is_primary_admin: false });
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn({
        companyMember: { create: vi.fn().mockResolvedValue(createdMembership) },
        companyInvitation: { update: vi.fn().mockResolvedValue({}) },
      })),
    );

    prisma.auditLog.create.mockResolvedValue({});
    queue.add.mockResolvedValue({});

    const svc = new CompanyService(prisma as never, queue as never);
    const result = await svc.acceptInvitation(VALID_TOKEN, {
      token: VALID_TOKEN,
      confirmed: true as const,
      full_name: 'Newbie',
      password: 'TestPass123!',
    });

    expect(result.membership.is_primary_admin).toBe(false);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ account_type: 'COMPANY_MEMBER', email_verified: true }) }),
    );
    expect(queue.add).toHaveBeenCalledWith('member-joined-notification', expect.objectContaining({ type: 'member-joined-notification' }));
  });

  it('CO-12: existing user accepts valid token → no new user created, membership created', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    setupValidInvite(prisma, { invited_email: 'existing@example.com' });

    const existingUser = fakeUser({ id: 'user_existing', email: 'existing@example.com' });
    prisma.user.findUniqueOrThrow.mockResolvedValue(existingUser);

    const createdMembership = fakeMember({ user_id: 'user_existing', is_primary_admin: false });
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn({
        companyMember: { create: vi.fn().mockResolvedValue(createdMembership) },
        companyInvitation: { update: vi.fn().mockResolvedValue({}) },
      })),
    );

    prisma.user.findUnique
      .mockResolvedValueOnce(fakeUser({ email: 'admin@acme.com' })) // primary admin lookup
      .mockResolvedValueOnce(existingUser); // member lookup for notification

    prisma.auditLog.create.mockResolvedValue({});
    queue.add.mockResolvedValue({});

    const svc = new CompanyService(prisma as never, queue as never);
    const result = await svc.acceptInvitation(VALID_TOKEN, { token: VALID_TOKEN }, 'user_existing');

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(result.membership).toBeDefined();
  });

  it('CO-13: existing user with mismatched email → throws EMAIL_MISMATCH 403', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    // invitation is for newbie@example.com
    setupValidInvite(prisma, { invited_email: 'newbie@example.com' });
    // but existing user has a different email
    prisma.user.findUniqueOrThrow.mockResolvedValue(fakeUser({ email: 'wrong@example.com' }));

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(svc.acceptInvitation(VALID_TOKEN, { token: VALID_TOKEN }, 'user_wrong'))
      .rejects.toMatchObject({ code: 'EMAIL_MISMATCH', status: 403 });
  });

  it('CO-14: expired invitation → throws INVITATION_EXPIRED 410', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    setupValidInvite(prisma, { expires_at: new Date(Date.now() - 1000) });

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(svc.acceptInvitation(VALID_TOKEN, { token: VALID_TOKEN, confirmed: true as const, full_name: 'New', password: 'Test123!' }))
      .rejects.toMatchObject({ code: 'INVITATION_EXPIRED', status: 410 });
  });

  it('CO-15: already accepted invitation → throws INVITATION_ALREADY_USED 409', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    setupValidInvite(prisma, { status: 'ACCEPTED' });

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(svc.acceptInvitation(VALID_TOKEN, { token: VALID_TOKEN, confirmed: true as const, full_name: 'New', password: 'Test123!' }))
      .rejects.toMatchObject({ code: 'INVITATION_ALREADY_USED', status: 409 });
  });

  it('CO-16: invalid token → throws INVITATION_NOT_FOUND 404', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    prisma.companyInvitation.findUnique.mockResolvedValue(null);

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(svc.acceptInvitation('bogus_token', { token: VALID_TOKEN, confirmed: true as const, full_name: 'New', password: 'Test123!' }))
      .rejects.toMatchObject({ code: 'INVITATION_NOT_FOUND', status: 404 });
  });
});

// ─── removeMember ─────────────────────────────────────────────────────────────

describe('CompanyService.removeMember()', () => {
  it('CO-17: admin removes non-primary member → status set to REMOVED, email queued', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    // requester is COMPANY_ADMIN
    prisma.companyMember.findUnique
      .mockResolvedValueOnce(fakeMember({ role: 'COMPANY_ADMIN' }))        // requester
      .mockResolvedValueOnce(fakeMember({ user_id: 'user_2', is_primary_admin: false, status: 'ACTIVE' })); // target

    prisma.companyMember.update.mockResolvedValue({});
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    prisma.auditLog.create.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue({ email: 'member@example.com' });
    prisma.consultingCompany.findUnique.mockResolvedValue({ company_name: 'Acme IT Pty Ltd' });
    queue.add.mockResolvedValue({});

    const svc = new CompanyService(prisma as never, queue as never);
    await svc.removeMember('company_1', 'user_2', 'user_1');

    expect(prisma.companyMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REMOVED' }) }),
    );
    expect(queue.add).toHaveBeenCalledWith('company-membership-removed', expect.objectContaining({ type: 'company-membership-removed' }));
  });

  it('CO-18: admin tries to remove primary admin → throws CANNOT_REMOVE_PRIMARY_ADMIN 422', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    prisma.companyMember.findUnique
      .mockResolvedValueOnce(fakeMember({ role: 'COMPANY_ADMIN' }))       // requester
      .mockResolvedValueOnce(fakeMember({ is_primary_admin: true, status: 'ACTIVE' })); // target IS primary

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(svc.removeMember('company_1', 'user_1', 'user_1'))
      .rejects.toMatchObject({ code: 'CANNOT_REMOVE_PRIMARY_ADMIN', status: 422 });
  });

  it('CO-19: non-admin tries to remove → throws INSUFFICIENT_COMPANY_ROLE 403', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    prisma.companyMember.findUnique.mockResolvedValueOnce(fakeMember({ role: 'CONSULTANT' }));

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(svc.removeMember('company_1', 'user_2', 'user_consultant'))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_COMPANY_ROLE', status: 403 });
  });
});

// ─── assignMemberToOrder ─────────────────────────────────────────────────────

describe('CompanyService.assignMemberToOrder()', () => {
  it('CO-20: admin assigns ACTIVE member to PAYMENT_HELD order → executing_member_id set, member notified', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    prisma.order.findUnique.mockResolvedValue(fakeOrder());
    // requester membership
    prisma.companyMember.findUnique
      .mockResolvedValueOnce(fakeMember({ role: 'COMPANY_ADMIN' }))   // requester
      .mockResolvedValueOnce(fakeMember({ user_id: 'user_2', status: 'ACTIVE' })); // target member

    const updatedOrder = fakeOrder({ executing_member_id: 'user_2' });
    prisma.order.update.mockResolvedValue(updatedOrder);
    prisma.auditLog.create.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue({ email: 'member@example.com', full_name: 'Bob Member' });
    prisma.consultingCompany.findUnique.mockResolvedValue({ company_name: 'Acme IT Pty Ltd' });
    queue.add.mockResolvedValue({});

    const svc = new CompanyService(prisma as never, queue as never);
    const result = await svc.assignMemberToOrder('order_1', 'user_2', 'user_1');

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { executing_member_id: 'user_2' } }),
    );
    expect(queue.add).toHaveBeenCalledWith('order-assigned-to-member', expect.objectContaining({ type: 'order-assigned-to-member' }));
    expect(result).toEqual(updatedOrder);
  });

  it('CO-21: order does not belong to a company → throws NOT_A_COMPANY_ORDER 422', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    prisma.order.findUnique.mockResolvedValue(fakeOrder({ company_id: null }));

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(svc.assignMemberToOrder('order_1', 'user_2', 'user_1'))
      .rejects.toMatchObject({ code: 'NOT_A_COMPANY_ORDER', status: 422 });
  });

  it('CO-22: assigning inactive member → throws MEMBER_NOT_ACTIVE 422', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();

    prisma.order.findUnique.mockResolvedValue(fakeOrder());
    prisma.companyMember.findUnique
      .mockResolvedValueOnce(fakeMember({ role: 'COMPANY_ADMIN' }))           // requester ok
      .mockResolvedValueOnce(fakeMember({ user_id: 'user_2', status: 'REMOVED' })); // target removed

    const svc = new CompanyService(prisma as never, queue as never);
    await expect(svc.assignMemberToOrder('order_1', 'user_2', 'user_1'))
      .rejects.toMatchObject({ code: 'MEMBER_NOT_ACTIVE', status: 422 });
  });
});

// ─── ABN validation ───────────────────────────────────────────────────────────
// Tests the ABN checksum algorithm inline (same logic as abnSchema in @onys/shared)
// Covers CO-04: invalid ABN is caught by Zod before reaching the service

function isValidAbn(raw: string): boolean {
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = raw.replace(/\s/g, '').split('').map(Number);
  if (digits.length !== 11) return false;
  const d = [...digits];
  d[0] -= 1;
  const sum = d.reduce((acc, digit, i) => acc + digit * weights[i]!, 0);
  return sum % 89 === 0;
}

describe('ABN validation algorithm', () => {
  it('CO-23: valid ABN 51824753556 → passes algorithm', () => {
    expect(isValidAbn('51824753556')).toBe(true);
  });

  it('CO-24: invalid ABN 12345678901 → fails algorithm', () => {
    expect(isValidAbn('12345678901')).toBe(false);
  });

  it('CO-25: ABN with spaces 51 824 753 556 → normalised and passes algorithm', () => {
    expect(isValidAbn('51 824 753 556')).toBe(true);
  });
});
