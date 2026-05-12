import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { RegisterInput, LoginInput } from '@onys/shared';
import {
  generateAccessToken,
  generateMfaToken,
  generateRefreshToken,
  generateEmailToken,
  sha256Hash,
  verifyMfaToken,
} from '../utils/tokens.js';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';

type EmailJobPayload = {
  type: 'verify-email' | 'reset-password';
  to: string;
  token: string;
  userId?: string;
};

type RequestMeta = { ip: string; userAgent: string };

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── REGISTER ────────────────────────────────────────────────────────────────

  async register(data: RegisterInput, meta: RequestMeta) {
    // 1. Email uniqueness check
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (existing) throw new AppError('EMAIL_EXISTS', 409);

    // 2. Hash password
    const password_hash = await bcrypt.hash(data.password, 12);

    // 3. Atomic transaction: User + profile + legal acceptances
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          password_hash,
          account_type: data.account_type,
          full_name: data.full_name,
          email_verified: false,
          failed_login_count: 0,
        },
      });

      if (data.account_type === 'INDIVIDUAL_CONTRACTOR') {
        await tx.contractorProfile.create({
          data: { user_id: created.id, status: 'INCOMPLETE', onboarding_step: 1 },
        });
      } else if (data.account_type === 'CUSTOMER') {
        await tx.customerProfile.create({
          data: { user_id: created.id, country: 'AU' },
        });
      }

      await tx.legalDocAcceptance.createMany({
        data: [
          {
            user_id: created.id,
            document_type: 'TERMS_OF_SERVICE',
            version: '2026-03-01',
            ip_address: meta.ip,
            user_agent: meta.userAgent,
          },
          {
            user_id: created.id,
            document_type: 'PRIVACY_POLICY',
            version: '2026-03-01',
            ip_address: meta.ip,
            user_agent: meta.userAgent,
          },
        ],
      });

      return created;
    });

    // 4–5. Email verification token
    const verificationToken = generateEmailToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email_verification_token: verificationToken,
        email_verification_expires: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      },
    });

    // 6. Queue verification email
    await this.emailQueue.add('verify-email', {
      type: 'verify-email',
      to: user.email,
      token: verificationToken,
      userId: user.id,
    });

    // 7–8. Issue tokens
    const access_token = generateAccessToken({
      userId: user.id,
      accountType: user.account_type,
    });
    const rawRefresh = generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        user_id: user.id,
        token_hash: sha256Hash(rawRefresh),
        expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      },
    });

    // 9. Audit
    await writeAudit(this.prisma, {
      actorId: user.id,
      actionType: 'USER_REGISTERED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { account_type: user.account_type },
    });

    // 10. Return
    return {
      access_token,
      refresh_token: rawRefresh,
      user: {
        id: user.id,
        email: user.email,
        account_type: user.account_type,
        full_name: user.full_name,
      },
    };
  }

  // ─── LOGIN ────────────────────────────────────────────────────────────────────

  async login(data: LoginInput, meta: RequestMeta) {
    // 1. Find user
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (!user) throw new AppError('INVALID_CREDENTIALS', 401);

    // 3. Account lock check
    if (user.account_locked) {
      const lockExpired = user.locked_until && user.locked_until <= new Date();
      if (!lockExpired) throw new AppError('ACCOUNT_LOCKED', 403);
    }

    // 4. Password verify
    const passwordOk = await bcrypt.compare(data.password, user.password_hash);
    if (!passwordOk) {
      const newCount = user.failed_login_count + 1;
      const shouldLock = newCount >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failed_login_count: newCount,
          ...(shouldLock && {
            account_locked: true,
            locked_until: new Date(Date.now() + LOCKOUT_DURATION_MS),
          }),
        },
      });
      throw new AppError('INVALID_CREDENTIALS', 401);
    }

    // 5. Reset fail counters on success
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failed_login_count: 0,
        account_locked: false,
        locked_until: null,
        last_login_at: new Date(),
      },
    });

    // 6. Email verified?
    if (!user.email_verified) throw new AppError('EMAIL_NOT_VERIFIED', 403);

    // 7. MFA gate
    if (user.mfa_enabled) {
      const mfa_token = generateMfaToken(user.id);
      return { mfa_required: true as const, mfa_token };
    }

    // 8. Issue tokens
    const access_token = generateAccessToken({
      userId: user.id,
      accountType: user.account_type,
    });
    const rawRefresh = generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        user_id: user.id,
        token_hash: sha256Hash(rawRefresh),
        expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      },
    });

    await writeAudit(this.prisma, {
      actorId: user.id,
      actionType: 'USER_LOGGED_IN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: {},
    });

    return {
      access_token,
      refresh_token: rawRefresh,
      user: {
        id: user.id,
        email: user.email,
        account_type: user.account_type,
        full_name: user.full_name,
      },
    };
  }

  // ─── REFRESH TOKEN ────────────────────────────────────────────────────────────

  async refreshToken(rawToken: string, meta: RequestMeta) {
    const hash = sha256Hash(rawToken);

    // 1. Find token record
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token_hash: hash },
    });
    if (!stored) throw new AppError('TOKEN_EXPIRED', 401);

    // 3. Reuse detection (already used once)
    if (stored.used_at !== null) {
      await this.prisma.refreshToken.deleteMany({
        where: { user_id: stored.user_id },
      });
      await writeAudit(this.prisma, {
        actorId: stored.user_id,
        actionType: 'TOKEN_REUSE',
        entityType: 'User',
        entityId: stored.user_id,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: {},
      });
      throw new AppError('TOKEN_REUSE', 401);
    }

    // 4. Revoked?
    if (stored.revoked_at !== null) throw new AppError('TOKEN_EXPIRED', 401);

    // 5. Expired?
    if (stored.expires_at < new Date()) throw new AppError('TOKEN_EXPIRED', 401);

    // 6. Mark as used
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { used_at: new Date() },
    });

    // 7–8. Issue new token pair
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: stored.user_id },
      select: { id: true, account_type: true },
    });

    const access_token = generateAccessToken({
      userId: user.id,
      accountType: user.account_type,
    });
    const rawRefresh = generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        user_id: user.id,
        token_hash: sha256Hash(rawRefresh),
        expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      },
    });

    return { access_token, refresh_token: rawRefresh };
  }

  // ─── LOGOUT ───────────────────────────────────────────────────────────────────

  async logout(rawToken: string): Promise<void> {
    const hash = sha256Hash(rawToken);
    await this.prisma.refreshToken
      .update({
        where: { token_hash: hash },
        data: { revoked_at: new Date() },
      })
      .catch(() => {
        // Token not found — silently succeed
      });
  }

  // ─── VERIFY EMAIL ─────────────────────────────────────────────────────────────

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        email_verification_token: token,
        email_verification_expires: { gt: new Date() },
      },
    });
    if (!user) throw new AppError('INVALID_TOKEN', 400);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email_verified: true,
        email_verified_at: new Date(),
        email_verification_token: null,
        email_verification_expires: null,
      },
    });

    await writeAudit(this.prisma, {
      actorId: user.id,
      actionType: 'EMAIL_VERIFIED',
      entityType: 'User',
      entityId: user.id,
      metadata: {},
    });

    return user;
  }

  // ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    // Intentionally silent if not found — prevents email enumeration
    if (!user) return;

    const rawToken = generateEmailToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_reset_token: sha256Hash(rawToken),
        password_reset_expires: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    await this.emailQueue.add('reset-password', {
      type: 'reset-password',
      to: user.email,
      token: rawToken,
      userId: user.id,
    });
  }

  // ─── RESET PASSWORD ───────────────────────────────────────────────────────────

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const hash = sha256Hash(token);
    const user = await this.prisma.user.findFirst({
      where: {
        password_reset_token: hash,
        password_reset_expires: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!user) throw new AppError('INVALID_TOKEN', 400);

    const password_hash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash,
        password_reset_token: null,
        password_reset_expires: null,
        failed_login_count: 0,
        account_locked: false,
        locked_until: null,
      },
    });

    // Force re-login on all devices
    await this.prisma.refreshToken.deleteMany({
      where: { user_id: user.id },
    });

    await writeAudit(this.prisma, {
      actorId: user.id,
      actionType: 'PASSWORD_RESET',
      entityType: 'User',
      entityId: user.id,
      metadata: {},
    });
  }

  // ─── MFA SETUP ────────────────────────────────────────────────────────────────

  async setupMfa(userId: string): Promise<{ qr_code_url: string; backup_codes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, mfa_enabled: true },
    });

    if (user.mfa_enabled) throw new AppError('MFA_ALREADY_ENABLED', 409);

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `onys.online (${user.email})`,
      issuer: 'onys.online',
      length: 20,
    });

    // Generate 8 one-time backup codes (16 hex chars each)
    const rawBackupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(8).toString('hex'),
    );
    const hashedBackupCodes = rawBackupCodes.map((c) => sha256Hash(c));

    // Store secret + hashed backup codes (not yet enabled — pending verification)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfa_secret: secret.base32,
        mfa_backup_codes: hashedBackupCodes,
      },
    });

    const qr_code_url = await QRCode.toDataURL(secret.otpauth_url ?? '');

    return { qr_code_url, backup_codes: rawBackupCodes };
  }

  // ─── MFA VERIFY SETUP ─────────────────────────────────────────────────────────

  async verifyMfaSetup(userId: string, totpCode: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mfa_secret: true, mfa_enabled: true },
    });

    if (user.mfa_enabled) throw new AppError('MFA_ALREADY_ENABLED', 409);
    if (!user.mfa_secret) throw new AppError('MFA_NOT_SETUP', 400);

    const valid = speakeasy.totp.verify({
      secret: user.mfa_secret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!valid) throw new AppError('INVALID_TOTP', 400);

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfa_enabled: true },
    });

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'MFA_ENABLED',
      entityType: 'User',
      entityId: userId,
      metadata: {},
    });
  }

  // ─── MFA VALIDATE (login step 2) ──────────────────────────────────────────────

  async validateMfa(
    mfaToken: string,
    totpCode: string,
    meta: RequestMeta,
  ): Promise<{ access_token: string; refresh_token: string; user: { id: string; email: string; account_type: string; full_name: string } }> {
    const payload = verifyMfaToken(mfaToken);
    if (!payload) throw new AppError('INVALID_TOKEN', 401);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        account_type: true,
        full_name: true,
        mfa_secret: true,
        mfa_enabled: true,
        mfa_backup_codes: true,
      },
    });

    if (!user.mfa_enabled || !user.mfa_secret) throw new AppError('MFA_NOT_SETUP', 400);

    // Check TOTP first
    const totpValid = speakeasy.totp.verify({
      secret: user.mfa_secret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!totpValid) {
      // Check backup codes
      const codeHash = sha256Hash(totpCode);
      const backupIndex = (user.mfa_backup_codes as string[]).indexOf(codeHash);
      if (backupIndex === -1) throw new AppError('INVALID_TOTP', 401);

      // Consume the backup code
      const updatedCodes = [...(user.mfa_backup_codes as string[])];
      updatedCodes.splice(backupIndex, 1);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { mfa_backup_codes: updatedCodes },
      });
    }

    // Issue full token pair
    const access_token = generateAccessToken({
      userId: user.id,
      accountType: user.account_type,
    });
    const rawRefresh = generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        user_id: user.id,
        token_hash: sha256Hash(rawRefresh),
        expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      },
    });

    await writeAudit(this.prisma, {
      actorId: user.id,
      actionType: 'USER_LOGGED_IN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { mfa: true },
    });

    return {
      access_token,
      refresh_token: rawRefresh,
      user: {
        id: user.id,
        email: user.email,
        account_type: user.account_type,
        full_name: user.full_name,
      },
    };
  }

  // ─── MFA DISABLE ──────────────────────────────────────────────────────────────

  async disableMfa(userId: string, totpCode: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mfa_secret: true, mfa_enabled: true },
    });

    if (!user.mfa_enabled || !user.mfa_secret) throw new AppError('MFA_NOT_ENABLED', 400);

    const valid = speakeasy.totp.verify({
      secret: user.mfa_secret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!valid) throw new AppError('INVALID_TOTP', 400);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfa_enabled: false,
        mfa_secret: null,
        mfa_backup_codes: [],
      },
    });

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'MFA_DISABLED',
      entityType: 'User',
      entityId: userId,
      metadata: {},
    });
  }
}
