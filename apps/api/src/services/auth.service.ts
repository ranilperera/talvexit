import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  type RegisterInput,
  type LoginInput,
  AUTO_ACTIVATE_CUSTOMER_PLAN_SLUG,
  AUTO_ACTIVATE_SUPPLIER_PLAN_SLUG,
} from '@onys/shared';
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
import { encryptSecret, decryptSecret } from '../utils/secret-vault.js';
import { createOtpChallenge, verifyOtpChallenge, hashToken } from './email-otp.service.js';
import { emailUrls } from '../utils/urls.js';

type EmailJobPayload =
  | { type: 'verify-email'; to: string; verify_url: string; userId?: string }
  | { type: 'reset-password'; to: string; reset_url: string; userId?: string }
  | { type: 'login-otp'; to: string; full_name: string; otp_code: string; ip_address: string };

type RequestMeta = { ip: string; userAgent: string };

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
// Bcrypt cost: each +1 doubles hashing work. 13 ≈ 250ms on a modern x86 core,
// roughly the upper bound users tolerate during login.
const BCRYPT_COST = 13;

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
    const password_hash = await bcrypt.hash(data.password, BCRYPT_COST);

    // 3. Atomic transaction: User + profile + legal acceptances
    const user = await this.prisma.$transaction(async (tx) => {
      // Overseas contractors: non-AU tax residency + foreign entity flag for withholding
      const isOverseas = data.entity_type === 'OVERSEAS_INDIVIDUAL';
      const created = await tx.user.create({
        data: {
          email: data.email,
          password_hash,
          account_type: data.account_type,
          full_name: data.full_name,
          email_verified: false,
          failed_login_count: 0,
          ...(data.entity_type ? { entity_type: data.entity_type } : {}),
          ...(isOverseas ? { tax_residency_country: 'OVERSEAS', is_foreign_entity: true } : {}),
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

      // Auto-activate the appropriate free plan so the user's first
      // limit-gated action (publish task / place order / etc.) doesn't fail
      // on "no active subscription". Slugs come from the shared config
      // (subscription-config.ts) so renames stay consistent without code
      // changes here. PLATFORM/SUPPORT/COMPLIANCE_ADMIN and COMPANY_ADMIN
      // don't get one.
      const freePlanSlug =
        data.account_type === 'CUSTOMER'
          ? AUTO_ACTIVATE_CUSTOMER_PLAN_SLUG
          : data.account_type === 'INDIVIDUAL_CONTRACTOR' ||
              data.account_type === 'ORGANIZATION_ADMIN'
            ? AUTO_ACTIVATE_SUPPLIER_PLAN_SLUG
            : null;
      if (freePlanSlug) {
        const plan = await tx.subscriptionPlan
          .findUnique({ where: { slug: freePlanSlug }, select: { id: true } })
          .catch(() => null);
        if (plan) {
          // Set period_start = now and period_end = now + 1 month so the
          // anniversary-monthly rollover has a starting point. Postgres-side
          // arithmetic (INTERVAL '1 month') does the calendar-aware bump
          // including end-of-month clamping; here we approximate in JS by
          // adding 30 days as a conservative initial seed — the lazy
          // rollover in SubscriptionService.rolloverIfDue() will compute
          // the precise next anniversary on first quota check.
          const periodStart = new Date();
          const periodEnd = new Date(periodStart);
          periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
          await tx.subscription.create({
            data: {
              user_id: created.id,
              plan_id: plan.id,
              billing_interval: 'MONTHLY',
              status: 'ACTIVE',
              started_at: periodStart,
              period_start: periodStart,
              period_end: periodEnd,
            },
          });
        } else {
          console.warn(
            `[register] Free plan '${freePlanSlug}' not found — user ${created.id} created without subscription. Run seed:subscriptions.`,
          );
        }
      }

      return created;
    });

    // 4–5. Email verification token. Store sha256 hash, not plaintext —
    // a DB read shouldn't grant verify-as-anyone access.
    const verificationToken = generateEmailToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email_verification_token: sha256Hash(verificationToken),
        email_verification_expires: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      },
    });

    // 6. Queue verification email
    await this.emailQueue.add('verify-email', {
      type: 'verify-email',
      to: user.email,
      verify_url: emailUrls.verifyEmail(verificationToken),
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
    const user = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (!user) throw new AppError('INVALID_CREDENTIALS', 401);

    // 2. Account lock check (failed-login lockout)
    if (user.account_locked) {
      const lockExpired = user.locked_until && user.locked_until <= new Date();
      if (!lockExpired) throw new AppError('ACCOUNT_LOCKED', 403);
    }

    // 2b. Admin sanctions (Phase 3). Ban beats suspend; either blocks login.
    if (user.banned_at) {
      throw new AppError(
        'ACCOUNT_BANNED',
        403,
        user.banned_reason ?? 'Account banned by an administrator.',
      );
    }
    if (user.suspended_at) {
      throw new AppError(
        'ACCOUNT_SUSPENDED',
        403,
        user.suspended_reason ?? 'Account suspended by an administrator.',
      );
    }

    // 3. Password verify
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

    // 4. Reset fail counters on success
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failed_login_count: 0, account_locked: false, locked_until: null },
    });

    // 5. Email verified?
    if (!user.email_verified) throw new AppError('EMAIL_NOT_VERIFIED', 403);

    // 6. TEST_BYPASS_OTP — skip email OTP for automated tests
    if (process.env.TEST_BYPASS_OTP === 'true') {
      if (user.mfa_enabled) {
        const mfa_token = generateMfaToken(user.id);
        return { mfa_required: true as const, mfa_token };
      }
      const access_token = generateAccessToken({ userId: user.id, accountType: user.account_type });
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
      await this.prisma.user.update({ where: { id: user.id }, data: { last_login_at: new Date() } });
      await writeAudit(this.prisma, {
        actorId: user.id, actionType: 'USER_LOGGED_IN', entityType: 'User', entityId: user.id,
        ipAddress: meta.ip, userAgent: meta.userAgent, metadata: { otp_bypassed: true },
      });
      return {
        access_token, refresh_token: rawRefresh,
        must_change_password: user.must_change_password,
        user: { id: user.id, email: user.email, account_type: user.account_type, full_name: user.full_name },
      };
    }

    // 7. Create OTP challenge and send email
    const { challenge_token, otp_plaintext } = await createOtpChallenge(
      this.prisma, user.id, { ip: meta.ip, userAgent: meta.userAgent },
    );

    await this.emailQueue.add('login-otp', {
      type: 'login-otp',
      to: user.email,
      full_name: user.full_name,
      otp_code: otp_plaintext,
      ip_address: meta.ip,
    });

    await writeAudit(this.prisma, {
      actorId: user.id, actionType: 'LOGIN_OTP_SENT', entityType: 'User', entityId: user.id,
      ipAddress: meta.ip, userAgent: meta.userAgent, metadata: {},
    });

    return {
      otp_required: true as const,
      challenge_token,
      email_hint: this.maskEmail(user.email),
      expires_in: 600,
    };
  }

  // ─── MASK EMAIL ───────────────────────────────────────────────────────────────

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    const visible = (local ?? '').length > 2
      ? local![0] + '***' + local![local!.length - 1]
      : (local?.[0] ?? '') + '***';
    return `${visible}@${domain}`;
  }

  // ─── VERIFY OTP ───────────────────────────────────────────────────────────────

  async verifyOtp(challengeToken: string, otpCode: string, meta: RequestMeta) {
    const { user_id } = await verifyOtpChallenge(this.prisma, challengeToken, otpCode);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: user_id },
    });

    // If TOTP also enabled, require TOTP next
    if (user.mfa_enabled) {
      const mfa_token = generateMfaToken(user.id);
      return { mfa_required: true as const, mfa_token };
    }

    // Issue full tokens
    const access_token = generateAccessToken({ userId: user.id, accountType: user.account_type });
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

    await this.prisma.user.update({ where: { id: user.id }, data: { last_login_at: new Date() } });

    await writeAudit(this.prisma, {
      actorId: user.id, actionType: 'USER_LOGGED_IN', entityType: 'User', entityId: user.id,
      ipAddress: meta.ip, userAgent: meta.userAgent, metadata: { method: 'email_otp' },
    });

    return {
      access_token,
      refresh_token: rawRefresh,
      must_change_password: user.must_change_password,
      user: { id: user.id, email: user.email, account_type: user.account_type, full_name: user.full_name },
    };
  }

  // ─── RESEND OTP ───────────────────────────────────────────────────────────────

  async resendOtp(challengeToken: string, meta: RequestMeta) {
    const tokenHash = hashToken(challengeToken);
    const existing = await this.prisma.emailOtpChallenge.findUnique({
      where: { challenge_token_hash: tokenHash },
      select: { user_id: true, status: true },
    });
    if (!existing || existing.status === 'VERIFIED') {
      throw new AppError('CHALLENGE_INVALID', 410, 'Session expired. Please log in again.');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: existing.user_id },
      select: { id: true, email: true, full_name: true },
    });

    const { challenge_token: newToken, otp_plaintext } = await createOtpChallenge(
      this.prisma, user.id, { ip: meta.ip, userAgent: meta.userAgent },
    );

    await this.emailQueue.add('login-otp', {
      type: 'login-otp',
      to: user.email,
      full_name: user.full_name,
      otp_code: otp_plaintext,
      ip_address: meta.ip,
    });

    return {
      challenge_token: newToken,
      email_hint: this.maskEmail(user.email),
      expires_in: 600,
    };
  }

  // ─── CHANGE PASSWORD (authenticated — clears must_change_password) ────────────

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, password_hash: true },
    });

    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) throw new AppError('INVALID_CREDENTIALS', 401);

    const password_hash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password_hash, must_change_password: false },
    });

    // Revoke all refresh tokens → forces re-login with new password
    await this.prisma.refreshToken.deleteMany({ where: { user_id: userId } });

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: userId,
      metadata: {},
    });
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
    // Find by hashed token — plaintext is never stored, so a DB read
    // can't be replayed as a verify-as-anyone capability.
    // Don't include expiry in WHERE because NULL > timestamp evaluates
    // to NULL in Postgres, so users with a null expires (e.g. schema
    // migration gap) would never match.
    const tokenHash = sha256Hash(token);
    const user = await this.prisma.user.findFirst({
      where: { email_verification_token: tokenHash },
    });
    if (!user) throw new AppError('INVALID_TOKEN', 400);

    if (user.email_verified) {
      return user; // idempotent — treat as success
    }

    if (
      !user.email_verification_expires ||
      user.email_verification_expires <= new Date()
    ) {
      // Clear the stale token so it can't be replayed
      await this.prisma.user.update({
        where: { id: user.id },
        data: { email_verification_token: null, email_verification_expires: null },
      });
      throw new AppError('EXPIRED_TOKEN', 410);
    }

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

  // ─── RESEND VERIFICATION EMAIL ────────────────────────────────────────────────

  async resendVerificationEmail(userId?: string, email?: string): Promise<void> {
    let user: { id: string; email: string; email_verified: boolean } | null = null;

    if (userId) {
      user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, email_verified: true },
      });
    } else if (email) {
      user = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, email_verified: true },
      });
    }

    // Silent no-op — prevents email enumeration
    if (!user || user.email_verified) return;

    const verificationToken = generateEmailToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email_verification_token: sha256Hash(verificationToken),
        email_verification_expires: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      },
    });

    await this.emailQueue.add('verify-email', {
      type: 'verify-email',
      to: user.email,
      verify_url: emailUrls.verifyEmail(verificationToken),
      userId: user.id,
    });
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
      reset_url: emailUrls.resetPassword(rawToken),
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

    const password_hash = await bcrypt.hash(newPassword, BCRYPT_COST);

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

    // Store secret (AES-256-GCM at rest) + hashed backup codes.
    // Not yet enabled — pending verification.
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfa_secret: encryptSecret(secret.base32),
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
      secret: decryptSecret(user.mfa_secret),
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
      secret: decryptSecret(user.mfa_secret),
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

  // ─── GET ME ───────────────────────────────────────────────────────────────────

  async getMe(userId: string) {
    // Include every field the customer profile UI reads. Previously this
    // selected only auth-essential fields, which meant /auth/me would
    // refresh after a billing save but the response wouldn't carry the
    // updated billing values — so the UI looked like the save didn't stick.
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        full_name: true,
        email: true,
        account_type: true,
        email_verified: true,
        mfa_enabled: true,
        last_login_at: true,
        created_at: true,
        theme_preference: true,
        compliance_documents: true,
        // ── Billing identity ─────────────────────────────────────────
        legal_entity_name: true,
        legal_name: true,
        trading_name: true,
        billing_email: true,
        billing_phone: true,
        website: true,
        // ── Billing address ──────────────────────────────────────────
        billing_address_1: true,
        billing_address_2: true,
        billing_city: true,
        billing_state: true,
        billing_postcode: true,
        billing_country: true,
        // ── Tax & business registration ──────────────────────────────
        entity_type: true,
        abn: true,
        abn_verified: true,
        abn_verified_at: true,
        abn_verified_name: true,
        acn: true,
        gst_registered: true,
        gst_registered_verified: true,
        vat_number: true,
        tax_residency_country: true,
        is_foreign_entity: true,
        customer_terms_signed: true,
        business_registrations: true,
      },
    });
  }

  // ─── UPDATE ME ────────────────────────────────────────────────────────────────

  async updateMe(userId: string, data: { full_name: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { full_name: data.full_name },
      select: { id: true, full_name: true, email: true, account_type: true },
    });
  }

  // ─── UPDATE BILLING ───────────────────────────────────────────────────────────

  async updateBilling(
    userId: string,
    data: {
      legal_entity_name?: string;
      legal_name?: string;
      trading_name?: string;
      billing_email?: string;
      billing_phone?: string;
      website?: string;
      billing_address_1?: string;
      billing_address_2?: string;
      billing_city?: string;
      billing_state?: string;
      billing_postcode?: string;
      billing_country?: string;
      entity_type?: string;
      abn?: string;
      acn?: string;
      gst_registered?: boolean;
      anzsic_code?: string;
      vat_number?: string;
      tax_residency_country?: string;
      is_foreign_entity?: boolean;
      business_registrations?: unknown[];
      customer_terms_signed?: boolean;
    },
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.legal_entity_name !== undefined ? { legal_entity_name: data.legal_entity_name } : {}),
        ...(data.legal_name !== undefined ? { legal_name: data.legal_name } : {}),
        ...(data.trading_name !== undefined ? { trading_name: data.trading_name } : {}),
        ...(data.billing_email !== undefined ? { billing_email: data.billing_email } : {}),
        ...(data.billing_phone !== undefined ? { billing_phone: data.billing_phone } : {}),
        ...(data.website !== undefined ? { website: data.website } : {}),
        ...(data.billing_address_1 !== undefined ? { billing_address_1: data.billing_address_1 } : {}),
        ...(data.billing_address_2 !== undefined ? { billing_address_2: data.billing_address_2 } : {}),
        ...(data.billing_city !== undefined ? { billing_city: data.billing_city } : {}),
        ...(data.billing_state !== undefined ? { billing_state: data.billing_state } : {}),
        ...(data.billing_postcode !== undefined ? { billing_postcode: data.billing_postcode } : {}),
        ...(data.billing_country !== undefined ? { billing_country: data.billing_country } : {}),
        ...(data.entity_type !== undefined ? { entity_type: data.entity_type } : {}),
        ...(data.abn !== undefined ? { abn: data.abn } : {}),
        ...(data.acn !== undefined ? { acn: data.acn } : {}),
        ...(data.gst_registered !== undefined ? { gst_registered: data.gst_registered } : {}),
        ...(data.anzsic_code !== undefined ? { anzsic_code: data.anzsic_code } : {}),
        ...(data.vat_number !== undefined ? { vat_number: data.vat_number } : {}),
        ...(data.tax_residency_country !== undefined ? { tax_residency_country: data.tax_residency_country } : {}),
        ...(data.is_foreign_entity !== undefined ? { is_foreign_entity: data.is_foreign_entity } : {}),
        ...(data.business_registrations !== undefined ? { business_registrations: data.business_registrations as import('@prisma/client').Prisma.InputJsonValue } : {}),
        ...(data.customer_terms_signed !== undefined ? { customer_terms_signed: data.customer_terms_signed } : {}),
      },
    });
  }

  // ─── UPDATE THEME ─────────────────────────────────────────────────────────────

  async updateTheme(userId: string, theme: string): Promise<void> {
    if (!['dark', 'light', 'system'].includes(theme)) {
      throw new AppError('VALIDATION_ERROR', 400);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { theme_preference: theme },
    });
  }

  // ─── MFA DISABLE ──────────────────────────────────────────────────────────────

  async disableMfa(userId: string, totpCode: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mfa_secret: true, mfa_enabled: true },
    });

    if (!user.mfa_enabled || !user.mfa_secret) throw new AppError('MFA_NOT_ENABLED', 400);

    const valid = speakeasy.totp.verify({
      secret: decryptSecret(user.mfa_secret),
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
