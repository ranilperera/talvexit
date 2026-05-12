import { describe, it, expect, vi } from 'vitest';
import { AuthService } from '../auth.service.js';

// ─── Minimal Prisma mock factory ─────────────────────────────────────────────

function makePrisma() {
  return {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contractorProfile: { create: vi.fn() },
    customerProfile: { create: vi.fn() },
    legalDocAcceptance: { createMany: vi.fn() },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { create: vi.fn().mockResolvedValue(fakeUser()) },
        contractorProfile: { create: vi.fn() },
        customerProfile: { create: vi.fn() },
        legalDocAcceptance: { createMany: vi.fn() },
      }),
    ),
  };
}

function makeQueue() {
  return { add: vi.fn() };
}

function fakeUser(overrides = {}) {
  return {
    id: 'user_1',
    email: 'test@example.com',
    password_hash: '$2b$12$placeholder',
    account_type: 'CUSTOMER',
    full_name: 'Test User',
    email_verified: false,
    failed_login_count: 0,
    account_locked: false,
    locked_until: null,
    mfa_enabled: false,
    mfa_secret: null,
    mfa_backup_codes: [],
    last_login_at: null,
    ...overrides,
  };
}

const META = { ip: '127.0.0.1', userAgent: 'test-agent' };

// ─── A-01: Register Customer ──────────────────────────────────────────────────

describe('A-01: register — CUSTOMER', () => {
  it('creates user, queues email, returns tokens', async () => {
    const prisma = makePrisma();
    const queue = makeQueue();
    const createdUser = fakeUser();
    prisma.$transaction.mockResolvedValue(createdUser);
    prisma.user.update.mockResolvedValue(createdUser);
    prisma.refreshToken.create.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});

    const svc = new AuthService(prisma as never, queue as never);
    const result = await svc.register(
      {
        email: 'test@example.com',
        password: 'TestPass123!',
        account_type: 'CUSTOMER',
        full_name: 'Test User',
      },
      META,
    );

    expect(result.access_token).toBeTruthy();
    expect(result.refresh_token).toBeTruthy();
    expect(result.user.email).toBe('test@example.com');
    expect(queue.add).toHaveBeenCalledWith('verify-email', expect.objectContaining({ type: 'verify-email' }));
  });
});

// ─── A-02: Register duplicate → EMAIL_EXISTS ──────────────────────────────────

describe('A-02: register — duplicate email', () => {
  it('throws EMAIL_EXISTS 409', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    const svc = new AuthService(prisma as never, makeQueue() as never);
    await expect(
      svc.register(
        { email: 'dupe@example.com', password: 'TestPass123!', account_type: 'CUSTOMER', full_name: 'Dupe' },
        META,
      ),
    ).rejects.toMatchObject({ code: 'EMAIL_EXISTS', status: 409 });
  });
});

// ─── A-03: Login — wrong password → INVALID_CREDENTIALS ──────────────────────

describe('A-03: login — wrong password', () => {
  it('throws INVALID_CREDENTIALS 401 and increments fail count', async () => {
    const prisma = makePrisma();
    const user = fakeUser({ password_hash: '$2b$12$fakehash' });
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue(user);

    const svc = new AuthService(prisma as never, makeQueue() as never);
    await expect(svc.login({ email: user.email, password: 'WrongPass999!' }, META)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      status: 401,
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failed_login_count: 1 }) }),
    );
  });
});

// ─── A-04: Login — email not verified → EMAIL_NOT_VERIFIED ───────────────────

describe('A-04: login — email not verified', () => {
  it('throws EMAIL_NOT_VERIFIED 403', async () => {
    const prisma = makePrisma();
    // Use a real bcrypt hash for a known password
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('TestPass123!', 12);
    const user = fakeUser({ password_hash: hash, email_verified: false });
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue(user);

    const svc = new AuthService(prisma as never, makeQueue() as never);
    await expect(svc.login({ email: user.email, password: 'TestPass123!' }, META)).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
      status: 403,
    });
  });
});

// ─── A-05: Login — MFA enabled → mfa_required ────────────────────────────────

describe('A-05: login — MFA gate', () => {
  it('returns mfa_required + mfa_token when MFA is enabled', async () => {
    const prisma = makePrisma();
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('TestPass123!', 12);
    const user = fakeUser({ password_hash: hash, email_verified: true, mfa_enabled: true });
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue(user);

    const svc = new AuthService(prisma as never, makeQueue() as never);
    const result = await svc.login({ email: user.email, password: 'TestPass123!' }, META);
    expect(result).toMatchObject({ mfa_required: true });
    expect((result as { mfa_token: string }).mfa_token).toBeTruthy();
  });
});

// ─── A-06: Account lock ───────────────────────────────────────────────────────

describe('A-06: login — account locked', () => {
  it('throws ACCOUNT_LOCKED 403 when lock has not expired', async () => {
    const prisma = makePrisma();
    const user = fakeUser({
      account_locked: true,
      locked_until: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue(user);

    const svc = new AuthService(prisma as never, makeQueue() as never);
    await expect(svc.login({ email: user.email, password: 'TestPass123!' }, META)).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
      status: 403,
    });
  });
});

// ─── A-07: Refresh — valid token ─────────────────────────────────────────────

describe('A-07: refreshToken — valid rotation', () => {
  it('marks old token used and returns new pair', async () => {
    const prisma = makePrisma();
    const stored = {
      id: 'rt_1',
      user_id: 'user_1',
      used_at: null,
      revoked_at: null,
      expires_at: new Date(Date.now() + 60_000),
    };
    prisma.refreshToken.findUnique.mockResolvedValue(stored);
    prisma.refreshToken.update.mockResolvedValue({});
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user_1', account_type: 'CUSTOMER' });
    prisma.refreshToken.create.mockResolvedValue({});

    const svc = new AuthService(prisma as never, makeQueue() as never);
    const result = await svc.refreshToken('rawtoken123', META);
    expect(result.access_token).toBeTruthy();
    expect(result.refresh_token).toBeTruthy();
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ used_at: expect.any(Date) }) }),
    );
  });
});

// ─── A-08: Refresh — reused token → TOKEN_REUSE + all sessions revoked ────────

describe('A-08: refreshToken — reuse detection', () => {
  it('throws TOKEN_REUSE 401 and deletes all user sessions', async () => {
    const prisma = makePrisma();
    const stored = {
      id: 'rt_1',
      user_id: 'user_1',
      used_at: new Date(), // already used!
      revoked_at: null,
      expires_at: new Date(Date.now() + 60_000),
    };
    prisma.refreshToken.findUnique.mockResolvedValue(stored);
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });
    prisma.auditLog.create.mockResolvedValue({});

    const svc = new AuthService(prisma as never, makeQueue() as never);
    await expect(svc.refreshToken('reused_token', META)).rejects.toMatchObject({
      code: 'TOKEN_REUSE',
      status: 401,
    });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 'user_1' } }),
    );
  });
});

// ─── A-09: Forgot password — always silent ────────────────────────────────────

describe('A-09: forgotPassword — silent for unknown email', () => {
  it('resolves without error for unknown email', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    const svc = new AuthService(prisma as never, makeQueue() as never);
    await expect(svc.forgotPassword('unknown@example.com')).resolves.toBeUndefined();
  });
});

// ─── A-10: Verify email ───────────────────────────────────────────────────────

describe('A-10: verifyEmail', () => {
  it('marks email_verified and clears token fields', async () => {
    const prisma = makePrisma();
    const user = fakeUser({ email_verified: false });
    prisma.user.findFirst.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue({ ...user, email_verified: true });
    prisma.auditLog.create.mockResolvedValue({});

    const svc = new AuthService(prisma as never, makeQueue() as never);
    await svc.verifyEmail('valid_token');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email_verified: true, email_verification_token: null }),
      }),
    );
  });

  it('throws INVALID_TOKEN for unknown/expired token', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst.mockResolvedValue(null);
    const svc = new AuthService(prisma as never, makeQueue() as never);
    await expect(svc.verifyEmail('bad_token')).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
      status: 400,
    });
  });
});

// ─── A-11: MFA setup ─────────────────────────────────────────────────────────

describe('A-11: setupMfa', () => {
  it('returns qr_code_url and 8 backup_codes', async () => {
    const prisma = makePrisma();
    prisma.user.findUniqueOrThrow.mockResolvedValue(fakeUser({ mfa_enabled: false }));
    prisma.user.update.mockResolvedValue({});

    const svc = new AuthService(prisma as never, makeQueue() as never);
    const result = await svc.setupMfa('user_1');
    expect(result.qr_code_url).toMatch(/^data:image\/png;base64,/);
    expect(result.backup_codes).toHaveLength(8);
    expect(result.backup_codes[0]).toHaveLength(16);
  });

  it('throws MFA_ALREADY_ENABLED if MFA is active', async () => {
    const prisma = makePrisma();
    prisma.user.findUniqueOrThrow.mockResolvedValue(fakeUser({ mfa_enabled: true }));
    const svc = new AuthService(prisma as never, makeQueue() as never);
    await expect(svc.setupMfa('user_1')).rejects.toMatchObject({ code: 'MFA_ALREADY_ENABLED', status: 409 });
  });
});

// ─── A-12: MFA disable ───────────────────────────────────────────────────────

describe('A-12: disableMfa — not enabled', () => {
  it('throws MFA_NOT_ENABLED when MFA is off', async () => {
    const prisma = makePrisma();
    prisma.user.findUniqueOrThrow.mockResolvedValue(fakeUser({ mfa_enabled: false }));
    const svc = new AuthService(prisma as never, makeQueue() as never);
    await expect(svc.disableMfa('user_1', '123456')).rejects.toMatchObject({
      code: 'MFA_NOT_ENABLED',
      status: 400,
    });
  });
});
