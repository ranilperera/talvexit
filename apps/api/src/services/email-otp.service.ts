import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '../lib/errors.js';

const OTP_EXPIRY_MS = 10 * 60 * 1000;       // 10 minutes
const OTP_RATE_LIMIT = 3;                     // max per window
const OTP_RATE_WINDOW_MS = 15 * 60 * 1000;   // 15 minutes
const OTP_MAX_ATTEMPTS = 5;

function generateOtp(): string {
  return String(crypto.randomInt(100_000, 999_999));
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function createOtpChallenge(
  prisma: PrismaClient,
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<{ challenge_token: string; otp_plaintext: string }> {
  // Rate limit: max 3 requests per 15 minutes per user
  const windowStart = new Date(Date.now() - OTP_RATE_WINDOW_MS);
  const recentCount = await prisma.emailOtpChallenge.count({
    where: { user_id: userId, created_at: { gte: windowStart } },
  });
  if (recentCount >= OTP_RATE_LIMIT) {
    const oldest = await prisma.emailOtpChallenge.findFirst({
      where: { user_id: userId, created_at: { gte: windowStart } },
      orderBy: { created_at: 'asc' },
    });
    const retryAfter = oldest
      ? Math.ceil((oldest.created_at.getTime() + OTP_RATE_WINDOW_MS - Date.now()) / 60_000)
      : 15;
    throw new AppError('OTP_RATE_LIMITED', 429, `Too many requests. Please wait ${retryAfter} minutes.`);
  }

  // Invalidate any existing PENDING challenges for this user
  await prisma.emailOtpChallenge.updateMany({
    where: { user_id: userId, status: 'PENDING' },
    data: { status: 'INVALIDATED' },
  });

  const otp = generateOtp();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const otpHash = await bcrypt.hash(otp, 10);

  await prisma.emailOtpChallenge.create({
    data: {
      user_id: userId,
      challenge_token_hash: hashToken(rawToken),
      otp_hash: otpHash,
      status: 'PENDING',
      expires_at: new Date(Date.now() + OTP_EXPIRY_MS),
      ip_address: meta.ip ?? null,
      user_agent: meta.userAgent ?? null,
    },
  });

  return { challenge_token: rawToken, otp_plaintext: otp };
}

export async function verifyOtpChallenge(
  prisma: PrismaClient,
  challengeToken: string,
  otpCode: string,
): Promise<{ user_id: string }> {
  const tokenHash = hashToken(challengeToken);
  const challenge = await prisma.emailOtpChallenge.findUnique({
    where: { challenge_token_hash: tokenHash },
  });

  if (!challenge) {
    throw new AppError('OTP_INVALID', 401, 'Invalid or expired verification code.');
  }
  if (challenge.status === 'VERIFIED') {
    throw new AppError('OTP_ALREADY_USED', 401, 'This code has already been used.');
  }
  if (challenge.status !== 'PENDING') {
    throw new AppError('OTP_INVALID', 401, 'This code is no longer valid. Please log in again.');
  }
  if (new Date() > challenge.expires_at) {
    await prisma.emailOtpChallenge.update({ where: { id: challenge.id }, data: { status: 'EXPIRED' } });
    throw new AppError('OTP_EXPIRED', 401, 'Verification code expired. Please log in again.');
  }
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.emailOtpChallenge.update({ where: { id: challenge.id }, data: { status: 'INVALIDATED' } });
    throw new AppError('OTP_MAX_ATTEMPTS', 401, 'Too many incorrect attempts. Please log in again.');
  }

  // Increment attempt counter before verifying
  await prisma.emailOtpChallenge.update({
    where: { id: challenge.id },
    data: { attempts: { increment: 1 } },
  });

  const isValid = await bcrypt.compare(otpCode.trim(), challenge.otp_hash);
  if (!isValid) {
    const remaining = OTP_MAX_ATTEMPTS - challenge.attempts - 1;
    if (remaining <= 0) {
      await prisma.emailOtpChallenge.update({ where: { id: challenge.id }, data: { status: 'INVALIDATED' } });
    }
    const err = new AppError(
      'OTP_INCORRECT',
      401,
      remaining > 0
        ? `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
        : 'Incorrect code. No attempts remaining. Please log in again.',
    );
    Object.assign(err, { attempts_remaining: remaining });
    throw err;
  }

  await prisma.emailOtpChallenge.update({
    where: { id: challenge.id },
    data: { status: 'VERIFIED', verified_at: new Date() },
  });

  return { user_id: challenge.user_id };
}

export async function cleanupExpiredChallenges(prisma: PrismaClient): Promise<number> {
  const result = await prisma.emailOtpChallenge.updateMany({
    where: { status: 'PENDING', expires_at: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}
