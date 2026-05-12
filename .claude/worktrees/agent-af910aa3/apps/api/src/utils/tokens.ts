import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { AccountType } from '@onys/shared';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret_change_me';
const MFA_SECRET = process.env.JWT_MFA_SECRET ?? 'dev_mfa_secret_change_me';

export function generateAccessToken(payload: {
  userId: string;
  accountType: AccountType;
}): string {
  return jwt.sign(
    { sub: payload.userId, account_type: payload.accountType, type: 'access' },
    ACCESS_SECRET,
    { expiresIn: '15m' },
  );
}

export function generateMfaToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'mfa' }, MFA_SECRET, { expiresIn: '5m' });
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateEmailToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** SHA-256 hash of a token — used for DB lookup of opaque tokens. */
export function sha256Hash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyMfaToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, MFA_SECRET) as jwt.JwtPayload;
    if (typeof decoded.sub !== 'string' || decoded['type'] !== 'mfa') return null;
    return { userId: decoded.sub };
  } catch {
    return null;
  }
}

export function verifyAccessToken(
  token: string,
): { userId: string; accountType: AccountType } | null {
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload;
    if (
      typeof decoded.sub !== 'string' ||
      typeof decoded['account_type'] !== 'string'
    ) {
      return null;
    }
    return {
      userId: decoded.sub,
      accountType: decoded['account_type'] as AccountType,
    };
  } catch {
    return null;
  }
}
