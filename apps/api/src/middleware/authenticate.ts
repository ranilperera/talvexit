import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../utils/tokens.js';
import { prisma } from '../lib/prisma.js';

// Endpoints a sanctioned user *may* still call so they can read why they're
// blocked and self-service their account hygiene. Anything not in this list
// returns 403 ACCOUNT_SUSPENDED / ACCOUNT_BANNED for sanctioned users.
const SANCTION_BYPASS_PATHS = new Set([
  '/api/v1/auth/me',
  '/api/v1/auth/logout',
  '/api/v1/auth/change-password',
]);

export async function authenticate(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    await reply.status(401).send({
      success: false,
      error: { code: 'MISSING_TOKEN', message: 'Authorization header required' },
    });
    return;
  }
  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    await reply.status(401).send({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Access token expired or invalid' },
    });
    return;
  }

  // Admin sanctions check (Phase 3). Sanctioned users keep tokens until they
  // expire naturally; we block here so they can't act on the platform until
  // an admin lifts the sanction. Bypass list permits reading own profile and
  // signing out cleanly.
  const pathOnly = (req.url ?? '').split('?')[0] ?? '';
  if (!SANCTION_BYPASS_PATHS.has(pathOnly)) {
    const u = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { banned_at: true, banned_reason: true, suspended_at: true, suspended_reason: true },
    });
    if (u?.banned_at) {
      await reply.status(403).send({
        success: false,
        error: {
          code: 'ACCOUNT_BANNED',
          message: u.banned_reason ?? 'Account banned by an administrator.',
        },
      });
      return;
    }
    if (u?.suspended_at) {
      await reply.status(403).send({
        success: false,
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: u.suspended_reason ?? 'Account suspended by an administrator.',
        },
      });
      return;
    }
  }

  req.user = { userId: payload.userId, accountType: payload.accountType };
}
