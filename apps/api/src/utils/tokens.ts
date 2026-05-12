import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { AccountType } from '@onys/shared';

// Hard-fail in production if either secret is missing or left at the dev default.
// Dev/test still get a placeholder so the test runner doesn't need real env vars,
// but a misconfigured prod boot must crash, not silently sign with a known value.
const DEV_ACCESS_DEFAULT = 'dev_access_secret_change_me';
const DEV_MFA_DEFAULT = 'dev_mfa_secret_change_me';

function requireSecret(envName: string, devDefault: string): string {
  const value = process.env[envName];
  if (process.env.NODE_ENV === 'production') {
    if (!value || value === devDefault || value.length < 32) {
      throw new Error(
        `[startup] ${envName} must be set to a strong (>=32 char) secret in production.`,
      );
    }
    return value;
  }
  return value ?? devDefault;
}

const ACCESS_SECRET = requireSecret('JWT_ACCESS_SECRET', DEV_ACCESS_DEFAULT);
const MFA_SECRET = requireSecret('JWT_MFA_SECRET', DEV_MFA_DEFAULT);

const JWT_ALG: jwt.Algorithm = 'HS256';

export function generateAccessToken(payload: {
  userId: string;
  accountType: AccountType;
}): string {
  return jwt.sign(
    { sub: payload.userId, account_type: payload.accountType, type: 'access' },
    ACCESS_SECRET,
    { expiresIn: '12h', algorithm: JWT_ALG },
  );
}

export function generateMfaToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'mfa' }, MFA_SECRET, {
    expiresIn: '5m',
    algorithm: JWT_ALG,
  });
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
    const decoded = jwt.verify(token, MFA_SECRET, {
      algorithms: [JWT_ALG],
    }) as jwt.JwtPayload;
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
    const decoded = jwt.verify(token, ACCESS_SECRET, {
      algorithms: [JWT_ALG],
    }) as jwt.JwtPayload;
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
