import type { AccountType } from '@onys/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { userId: string; accountType: AccountType };
  }
}
