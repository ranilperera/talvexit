import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../utils/tokens.js';

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
  req.user = { userId: payload.userId, accountType: payload.accountType };
}
