import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { uploadCertificateSchema, reviewCertificateSchema } from '@onys/shared';
import type { InsuranceService } from '../services/insurance.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { uploadToBlob } from '../utils/blob-storage.js';
import { verifyFileSignature } from '../utils/file-signature.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractMeta(req: FastifyRequest) {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'] ?? 'unknown',
  };
}

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  const status = e.status ?? 500;
  const code = e.code ?? 'INTERNAL_ERROR';
  const message = e.message ?? 'An unexpected error occurred';
  return reply.status(status).send({ success: false, error: { code, message } });
}

async function requireContractor(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (req.user?.accountType !== 'INDIVIDUAL_CONTRACTOR') {
    await reply.status(403).send({
      success: false,
      error: { code: 'WRONG_ACCOUNT_TYPE', message: 'Contractor account required' },
    });
  }
}

const ADMIN_ROLES = ['PLATFORM_ADMIN', 'COMPLIANCE_ADMIN'];

async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user || !ADMIN_ROLES.includes(req.user.accountType)) {
    await reply.status(403).send({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function insuranceRoutes(
  app: FastifyInstance,
  opts: { insuranceService: InsuranceService },
) {
  const { insuranceService } = opts;
  const contractorGuard = [authenticate, requireContractor];
  const adminGuard = [authenticate, requireAdmin];

  // Register PDF body parser scoped to this plugin
  app.addContentTypeParser('application/pdf', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  // ─── POST /contractor/insurance/upload ────────────────────────────────────
  // Receives PDF binary, uploads to Azure server-side, returns blob_path.
  // No Azure CORS configuration needed — upload happens API→Azure.

  app.post('/contractor/insurance/upload', { preHandler: contractorGuard }, async (req, reply) => {
    const fileName = req.headers['x-file-name'];
    if (typeof fileName !== 'string' || !fileName.endsWith('.pdf')) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'X-File-Name header must be a .pdf filename' },
      });
    }
    const buffer = req.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request body must be PDF binary data' },
      });
    }
    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(400).send({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: 'File must be under 10MB' },
      });
    }
    // Magic-byte verification: enforce that the body actually starts with %PDF-,
    // not just that the X-File-Name ends in .pdf. Stops a renamed HTML/SVG payload
    // from being uploaded to a path the admin will later open in their browser.
    if (!verifyFileSignature(buffer, 'application/pdf')) {
      return reply.status(415).send({
        success: false,
        error: { code: 'CONTENT_TYPE_MISMATCH', message: 'File content is not a valid PDF.' },
      });
    }
    // Strip directory separators / null bytes from the supplied filename before
    // it becomes part of the blob path.
    const safeName = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    try {
      const blobPath = `insurance/${req.user!.userId}/${Date.now()}/${safeName}`;
      await uploadToBlob(blobPath, buffer, 'application/pdf');
      return reply.status(200).send({ success: true, data: { blob_path: blobPath } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /contractor/insurance ───────────────────────────────────────────

  app.post('/contractor/insurance', { preHandler: contractorGuard }, async (req, reply) => {
    const parsed = uploadCertificateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          fields: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
      });
    }
    try {
      const certificate = await insuranceService.uploadCertificate(
        req.user!.userId,
        parsed.data,
        extractMeta(req),
      );
      return reply.status(201).send({ success: true, data: certificate });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /contractor/insurance ─────────────────────────────────────────────

  app.get('/contractor/insurance', { preHandler: contractorGuard }, async (req, reply) => {
    try {
      const result = await insuranceService.getMyCertificates(req.user!.userId);
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /contractor/insurance/:certId ────────────────────────────────────

  app.get('/contractor/insurance/:certId', { preHandler: contractorGuard }, async (req, reply) => {
    const { certId } = req.params as { certId: string };
    try {
      const certificate = await insuranceService.getCertificateById(certId, req.user!.userId);
      return reply.status(200).send({ success: true, data: certificate });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /admin/insurance/pending ─────────────────────────────────────────

  app.get('/admin/insurance/pending', { preHandler: adminGuard }, async (_req, reply) => {
    try {
      const certificates = await insuranceService.getPendingCertificates();
      return reply.status(200).send({
        success: true,
        data: { certificates, count: certificates.length },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PATCH /admin/insurance/:certId/review ────────────────────────────────

  app.patch(
    '/admin/insurance/:certId/review',
    { preHandler: adminGuard },
    async (req, reply) => {
      const { certId } = req.params as { certId: string };
      const parsed = reviewCertificateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({
              field: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }
      try {
        const certificate = await insuranceService.adminReviewCertificate(
          certId,
          req.user!.userId,
          parsed.data,
        );
        return reply.status(200).send({
          success: true,
          data: { certificate, message: 'Certificate reviewed.' },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
