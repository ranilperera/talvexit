import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storeCredentialSchema, confirmRevokedSchema } from '@onys/shared';
import type { CredentialService } from '../services/credential.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { prisma } from '../lib/prisma.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractMeta(req: FastifyRequest) {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'] ?? '',
  };
}

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  const status = e.status ?? 500;
  const code = e.code ?? 'INTERNAL_ERROR';
  const message = e.message ?? 'An unexpected error occurred';
  return reply.status(status).send({ success: false, error: { code, message } });
}

function validationError(
  reply: FastifyReply,
  issues: { path: (string | number)[]; message: string }[],
) {
  return reply.status(400).send({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      fields: issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    },
  });
}

// ─── Actor guards ─────────────────────────────────────────────────────────────

async function requireCustomer(req: FastifyRequest, reply: FastifyReply) {
  if (req.user?.accountType !== 'CUSTOMER') {
    await reply.status(403).send({
      success: false,
      error: { code: 'CUSTOMER_ONLY', message: 'Only customers can perform this action' },
    });
  }
}

async function requireContractorOrOrgMember(req: FastifyRequest, reply: FastifyReply) {
  const allowed = ['INDIVIDUAL_CONTRACTOR', 'ORGANIZATION_ADMIN', 'ORG_MEMBER'] as const;
  if (!req.user || !(allowed as readonly string[]).includes(req.user.accountType)) {
    await reply.status(403).send({
      success: false,
      error: { code: 'CONTRACTOR_ONLY', message: 'Only contractors can perform this action' },
    });
  }
}

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const adminTypes = ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'] as const;
  if (!req.user || !(adminTypes as readonly string[]).includes(req.user.accountType)) {
    await reply.status(403).send({
      success: false,
      error: { code: 'ADMIN_ONLY', message: 'Admin access required' },
    });
  }
}

// ─── credentialRoutes ─────────────────────────────────────────────────────────

export async function credentialRoutes(
  app: FastifyInstance,
  opts: { credentialService: CredentialService },
) {
  const { credentialService } = opts;

  // ─── POST /orders/:id/credentials ────────────────────────────────────────
  // Store a credential (customer only)

  app.post(
    '/orders/:id/credentials',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = storeCredentialSchema.safeParse(req.body);
      if (!parsed.success) {
        return validationError(reply, parsed.error.issues);
      }
      try {
        const result = await credentialService.storeCredential(
          id,
          req.user!.userId,
          parsed.data,
          extractMeta(req),
        );
        return reply.status(201).send({
          success: true,
          data: {
            credential_id: result.credential_id,
            label: result.label,
            credential_type: result.credential_type,
            message: 'Credential stored securely. The contractor has been notified.',
            security_notice:
              'Do not share credential values via messages or email. Use the credential vault exclusively.',
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /orders/:id/credentials ─────────────────────────────────────────
  // List credentials for an order (customer or contractor, no values)

  app.get(
    '/orders/:id/credentials',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const credentials = await credentialService.listCredentials(id, req.user!.userId);
        return reply.status(200).send({
          success: true,
          data: {
            credentials,
            count: credentials.length,
            ...(credentials.length > 0 && {
              security_notice:
                'Credential values are only accessible to the assigned contractor during IN_PROGRESS state.',
            }),
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /orders/:id/credentials/:cred_id/value ───────────────────────────
  // Retrieve credential value (contractor only)

  app.get(
    '/orders/:id/credentials/:cred_id/value',
    { preHandler: [authenticate, requireContractorOrOrgMember] },
    async (req, reply) => {
      const { id, cred_id } = req.params as { id: string; cred_id: string };
      try {
        const result = await credentialService.retrieveCredentialValue(
          id,
          cred_id,
          req.user!.userId,
          extractMeta(req),
        );

        // Prevent credential values from being cached anywhere
        reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
        reply.header('Pragma', 'no-cache');
        reply.header('X-Content-Type-Options', 'nosniff');

        return reply.status(200).send({
          success: true,
          data: {
            value: result.value,
            label: result.label,
            credential_type: result.credential_type,
            security_notice:
              'This retrieval has been logged. Do not store this value outside secure systems.',
            retrieved_at: new Date().toISOString(),
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── DELETE /orders/:id/credentials/:cred_id ──────────────────────────────
  // Delete a credential (customer only)

  app.delete(
    '/orders/:id/credentials/:cred_id',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { id, cred_id } = req.params as { id: string; cred_id: string };
      try {
        const result = await credentialService.deleteCredential(
          id,
          cred_id,
          req.user!.userId,
          extractMeta(req),
        );
        return reply.status(200).send({
          success: true,
          data: {
            deleted: result.deleted,
            credential_id: result.credential_id,
            message: 'Credential permanently deleted from vault.',
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /orders/:id/credentials/confirm-revoked ─────────────────────────
  // Customer confirms they have revoked credentials on their own systems

  app.post(
    '/orders/:id/credentials/confirm-revoked',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = confirmRevokedSchema.safeParse(req.body);
      if (!parsed.success) {
        return validationError(reply, parsed.error.issues);
      }
      try {
        const result = await credentialService.confirmCredentialsRevoked(
          id,
          req.user!.userId,
          parsed.data,
          extractMeta(req),
        );
        return reply.status(200).send({
          success: true,
          data: {
            confirmed_at: result.confirmed_at,
            message: result.message,
            next_step: 'Your confirmation has been recorded. Order closure is now complete.',
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: GET /admin/orders/:id/credential-access-log ───────────────────
  // View full access audit log for all credentials on an order

  app.get(
    '/admin/orders/:id/credential-access-log',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const logs = await prisma.credentialAccessLog.findMany({
          where: { order_id: id },
          include: {
            credential: { select: { label: true, credential_type: true } },
          },
          orderBy: { created_at: 'asc' },
        });
        return reply.status(200).send({
          success: true,
          data: {
            logs,
            count: logs.length,
            order_id: id,
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
