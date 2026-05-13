import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createServiceInvoiceSchema,
  updateDraftServiceInvoiceSchema,
  submitEvidenceSchema,
  verifyEvidenceSchema,
  updatePaymentMethodsSchema,
} from '@onys/shared';
import type { ServiceInvoiceService } from '../services/service-invoice.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { uploadToBlob } from '../utils/blob-storage.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function serviceInvoiceRoutes(
  app: FastifyInstance,
  opts: { serviceInvoiceService: ServiceInvoiceService },
) {
  const { serviceInvoiceService } = opts;

  // Allow binary uploads on the evidence endpoint
  const binaryParser = (
    _req: FastifyRequest,
    body: Buffer,
    done: (err: null, body: Buffer) => void,
  ) => done(null, body);
  for (const ct of [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ]) {
    app.addContentTypeParser(ct, { parseAs: 'buffer' }, binaryParser);
  }

  // ─── PROVIDER: create invoice ──────────────────────────────────────────

  app.post(
    '/service-invoices',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const parsed = createServiceInvoiceSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);
      try {
        const inv = await serviceInvoiceService.createInvoice(
          req.user!.userId,
          parsed.data,
        );
        return reply.status(201).send({ success: true, data: inv });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PROVIDER: update draft ────────────────────────────────────────────

  app.put(
    '/service-invoices/:id',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = updateDraftServiceInvoiceSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);
      try {
        const inv = await serviceInvoiceService.updateDraft(
          id,
          req.user!.userId,
          parsed.data,
        );
        return reply.status(200).send({ success: true, data: inv });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PROVIDER: send invoice ────────────────────────────────────────────

  app.post(
    '/service-invoices/:id/send',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const inv = await serviceInvoiceService.sendInvoice(id, req.user!.userId);
        return reply.status(200).send({ success: true, data: inv });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PROVIDER: list sent ───────────────────────────────────────────────

  app.get(
    '/service-invoices/sent',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        const invoices = await serviceInvoiceService.getInvoicesAsSender(
          req.user!.userId,
        );
        return reply.status(200).send({ success: true, data: invoices });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PROVIDER: recent clients (typeahead source) ───────────────────────

  app.get(
    '/service-invoices/recent-clients',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        const clients = await serviceInvoiceService.getRecentClients(
          req.user!.userId,
        );
        return reply.status(200).send({ success: true, data: clients });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── CLIENT: list received ─────────────────────────────────────────────

  app.get(
    '/service-invoices/received',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        const invoices = await serviceInvoiceService.getInvoicesAsRecipient(
          req.user!.userId,
        );
        return reply.status(200).send({ success: true, data: invoices });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ANY (party): get invoice detail ───────────────────────────────────

  app.get(
    '/service-invoices/:id',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const inv = await serviceInvoiceService.getInvoiceForUser(
          id,
          req.user!.userId,
        );
        return reply.status(200).send({ success: true, data: inv });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ANY (party): stream the invoice PDF ──────────────────────────────
  // Streams the PDF through the API rather than returning a SAS URL.
  // Auth is checked by service.getInvoicePdfBlobPath() (party-of-the-
  // engagement guard) so every download stays gated by JWT cookie/header.

  app.get(
    '/service-invoices/:id/pdf',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { dl } = req.query as { dl?: string };
      try {
        const { blob_path, invoice_number } = await serviceInvoiceService.getInvoicePdfBlobPath(
          id,
          req.user!.userId,
        );
        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentType, contentLength } = await downloadBlobStream(blob_path);
        const fileName = `${invoice_number ?? 'service-invoice'}.pdf`;
        const disposition = dl === '1' ? 'attachment' : 'inline';
        reply.header('Content-Type', contentType ?? 'application/pdf');
        if (contentLength) reply.header('Content-Length', contentLength);
        reply.header('Content-Disposition', `${disposition}; filename="${fileName}"`);
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('Cache-Control', 'private, no-store');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── CLIENT: upload evidence file (binary) ─────────────────────────────
  // Two-step pattern: client uploads file → gets blob path → posts JSON
  // submit-evidence with the blob path. Same approach as compliance docs.

  app.post(
    '/service-invoices/:id/evidence/upload',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const fileName = req.headers['x-file-name'];
      if (typeof fileName !== 'string' || !fileName) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'X-File-Name header required.' },
        });
      }
      const rawCT = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
      const allowed = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ];
      if (!allowed.includes(rawCT)) {
        return reply.status(415).send({
          success: false,
          error: { code: 'INVALID_FILE_TYPE', message: 'PDF, JPG, PNG, WEBP only.' },
        });
      }
      const buffer = req.body as Buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'NO_FILE', message: 'Body must be file binary data.' },
        });
      }
      if (buffer.length > 10 * 1024 * 1024) {
        return reply.status(413).send({
          success: false,
          error: { code: 'FILE_TOO_LARGE', message: 'File must be under 10 MB.' },
        });
      }

      // Verify caller is allowed to view the invoice (and isn't the sender)
      try {
        const inv = await serviceInvoiceService.getInvoiceForUser(
          id,
          req.user!.userId,
        );
        if (inv.from_user_id === req.user!.userId) {
          return reply.status(403).send({
            success: false,
            error: {
              code: 'CANNOT_SUBMIT_OWN',
              message: 'Provider cannot submit evidence on their own invoice.',
            },
          });
        }
      } catch (err) {
        return handleError(reply, err);
      }

      const safe = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
      const blobPath = `service-invoice-evidence/${id}/${req.user!.userId}/${Date.now()}-${safe}`;
      try {
        await uploadToBlob(blobPath, buffer, rawCT);
      } catch (err) {
        return handleError(reply, err);
      }
      return reply.status(200).send({
        success: true,
        data: { evidence_file_url: blobPath, evidence_file_name: safe },
      });
    },
  );

  // ─── CLIENT: submit evidence (JSON) ────────────────────────────────────

  app.post(
    '/service-invoices/:id/evidence',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = submitEvidenceSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);
      try {
        const ev = await serviceInvoiceService.submitPaymentEvidence(
          id,
          req.user!.userId,
          parsed.data,
        );
        return reply.status(201).send({ success: true, data: ev });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ANY (party): stream evidence file ─────────────────────────────────
  // CRITICAL: payment-evidence files are typically bank statements with
  // full account numbers visible — streaming through the API instead of
  // handing out a SAS URL keeps these documents out of intermediate
  // caches, server logs, and browser histories. Every access writes an
  // audit row (PAYMENT_EVIDENCE_VIEWED).

  app.get(
    '/service-invoices/:id/evidence/:evidenceId/download',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id, evidenceId } = req.params as {
        id: string;
        evidenceId: string;
      };
      const { dl } = req.query as { dl?: string };
      try {
        const { blob_path, file_name } = await serviceInvoiceService.getEvidenceFileBlobPath(
          id,
          evidenceId,
          req.user!.userId,
        );
        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentType, contentLength } = await downloadBlobStream(blob_path);
        const fileName = file_name ?? blob_path.split('/').pop() ?? 'payment-evidence';

        // PDF/image inline (auditor needs to view); anything else forced
        // to attachment to avoid the browser rendering unknown user-
        // uploaded content as first-party.
        const SAFE_INLINE_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        const resolvedType = contentType ?? 'application/octet-stream';
        const wantInline = dl !== '1' && SAFE_INLINE_MIME.includes(resolvedType);
        const disposition = wantInline ? 'inline' : 'attachment';

        reply.header('Content-Type', resolvedType);
        if (contentLength) reply.header('Content-Length', contentLength);
        reply.header('Content-Disposition', `${disposition}; filename="${fileName}"`);
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('Cache-Control', 'private, no-store');

        // Audit log every payment-evidence view. Bank statements etc.
        // are sensitive enough that "who looked, when, from where" is
        // part of the compliance posture.
        const { writeAudit } = await import('../utils/audit.js');
        const { prisma } = await import('../lib/prisma.js');
        await writeAudit(prisma, {
          actorId: req.user!.userId,
          actionType: 'PAYMENT_EVIDENCE_VIEWED',
          entityType: 'ServiceInvoicePaymentEvidence',
          entityId: evidenceId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? 'unknown',
          metadata: { service_invoice_id: id, disposition },
        });

        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PROVIDER: verify evidence ─────────────────────────────────────────

  app.post(
    '/service-invoices/:id/verify-evidence/:evidenceId',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { evidenceId } = req.params as { id: string; evidenceId: string };
      const parsed = verifyEvidenceSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);
      try {
        const ev = await serviceInvoiceService.verifyPaymentEvidence(
          evidenceId,
          req.user!.userId,
          parsed.data,
        );
        return reply.status(200).send({ success: true, data: ev });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PROVIDER: payment methods config ──────────────────────────────────

  app.get(
    '/providers/me/payment-methods',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        const methods = await serviceInvoiceService.getMyPaymentMethods(
          req.user!.userId,
        );
        return reply.status(200).send({ success: true, data: methods });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.put(
    '/providers/me/payment-methods',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const parsed = updatePaymentMethodsSchema.safeParse(req.body);
      if (!parsed.success) return validationError(reply, parsed.error.issues);
      try {
        const methods = await serviceInvoiceService.updatePaymentMethods(
          req.user!.userId,
          parsed.data,
        );
        return reply.status(200).send({ success: true, data: methods });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PUBLIC-AUTH: provider's accepted methods (masked) ─────────────────

  app.get(
    '/providers/:id/payment-methods',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const view = await serviceInvoiceService.getPublicPaymentMethods(id);
        return reply.status(200).send({ success: true, data: view });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PROVIDER / CLIENT (auth): create Stripe Checkout link ─────────────
  // Either party can request a payment URL; the link works regardless of
  // who clicks it.

  app.post(
    '/service-invoices/:id/payment-link',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const result = await serviceInvoiceService.createStripePaymentLink(
          id,
          req.user!.userId,
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PUBLIC (no auth): magic-link invoice view ─────────────────────────

  app.get('/public/invoices/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    try {
      const data = await serviceInvoiceService.getInvoiceByPublicToken(token);
      return reply.status(200).send({ success: true, data });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PUBLIC (no auth): pay via Stripe from magic-link page ─────────────

  app.post('/public/invoices/:token/pay-stripe', async (req, reply) => {
    const { token } = req.params as { token: string };
    try {
      const result = await serviceInvoiceService.createPublicStripePayment(token);
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });
}
