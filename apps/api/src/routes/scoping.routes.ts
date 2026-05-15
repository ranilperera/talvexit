import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  generateScopeSchema,
  acceptScopeSchema,
  manualScopeSchema,
  regenerateSectionSchema,
} from '@onys/shared';
import { Prisma } from '@prisma/client';
import type { ScopingService } from '../services/scoping.service.js';
import type { SubscriptionGuards } from '../middleware/subscription-limits.js';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/authenticate.js';
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

// ─── Guard ────────────────────────────────────────────────────────────────────

async function requireCustomer(req: FastifyRequest, reply: FastifyReply) {
  if (req.user?.accountType !== 'CUSTOMER') {
    await reply.status(403).send({
      success: false,
      error: {
        code: 'CUSTOMER_ONLY',
        message: 'Only customers can use the AI scoping engine',
      },
    });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function scopingRoutes(
  app: FastifyInstance,
  opts: { scopingService: ScopingService; subscriptionGuards: SubscriptionGuards },
) {
  const { scopingService, subscriptionGuards } = opts;

  // Binary body parsers for attachment uploads. tender.routes.ts registers
  // the same set globally on the Fastify instance, so we only need to add
  // any types not already covered there. addContentTypeParser is idempotent-
  // unsafe — it throws on duplicate registration — so we guard with
  // try/catch to stay re-register-safe in dev hot-reload.
  const binaryParser = (_req: FastifyRequest, body: Buffer, done: (err: null, body: Buffer) => void) => done(null, body);
  for (const ct of ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ]) {
    try { app.addContentTypeParser(ct, { parseAs: 'buffer' }, binaryParser); } catch { /* already registered */ }
  }

  // ─── POST /scoping/generate ────────────────────────────────────────────────

  app.post(
    '/scoping/generate',
    {
      preHandler: [
        authenticate,
        requireCustomer,
        // Customer Quota 4 — uses the customer-facing 'ai_scopes' label
        // which maps to the same counter column (current_ai_request_count).
        subscriptionGuards.requireLimit('ai_scopes'),
      ],
    },
    async (req, reply) => {
      const parsed = generateScopeSchema.safeParse(req.body);
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
        const start = Date.now();
        const result = await scopingService.queueScopingJob(
          req.user!.userId,
          parsed.data,
          extractMeta(req),
        );
        const elapsed = Date.now() - start;

        if (elapsed > 150) {
          console.warn(`[scoping] queueScopingJob slow: ${elapsed}ms`);
        }

        return reply.status(202).send({
          success: true,
          data: {
            job_id: result.job_id,
            status: 'PENDING',
            poll_url: `/api/v1/scoping/${result.job_id}/status`,
            message: 'Scope generation queued. Poll the status endpoint.',
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /scoping/:job_id/status ───────────────────────────────────────────

  app.get(
    '/scoping/:job_id/status',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { job_id } = req.params as { job_id: string };

      try {
        const result = await scopingService.getJobStatus(job_id, req.user!.userId);

        if (result.status === 'PENDING' || result.status === 'PROCESSING') {
          void reply.header('Retry-After', '3');
        }

        return reply.status(200).send({
          success: true,
          data: {
            job_id,
            ...result,
            ...(result.status === 'COMPLETE'
              ? {
                  next_steps: {
                    review: 'Review the generated scope below.',
                    edit: 'You can edit any field before accepting.',
                    regenerate_section:
                      'Use /regenerate-section to redo a specific section.',
                    accept: `POST /api/v1/scoping/${job_id}/accept to confirm.`,
                  },
                }
              : {}),
            ...(result.status === 'FAILED'
              ? { retry_hint: 'POST /api/v1/scoping/generate to try again.' }
              : {}),
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /scoping/:job_id/accept ──────────────────────────────────────────

  app.post(
    '/scoping/:job_id/accept',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { job_id } = req.params as { job_id: string };

      const parsed = acceptScopeSchema.safeParse(req.body);
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
        const result = await scopingService.acceptScope(
          job_id,
          req.user!.userId,
          parsed.data,
          extractMeta(req),
        );
        return reply.status(200).send({
          success: true,
          data: {
            ...result,
            order_hint: `POST /api/v1/orders with { "scoping_job_id": "${job_id}" } to place your order.`,
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /scoping/manual ──────────────────────────────────────────────────
  // Customer authors a tender scope directly, without using AI. No ai_scopes
  // quota is consumed here — the manual_tenders quota is gated at publish
  // time (see tender.routes.ts) so customers can draft + discard freely.

  app.post(
    '/scoping/manual',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const parsed = manualScopeSchema.safeParse(req.body);
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
        const result = await scopingService.createManualScope(
          req.user!.userId,
          parsed.data,
          extractMeta(req),
        );
        return reply.status(201).send({
          success: true,
          data: {
            ...result,
            message: 'Manual scope created. Proceed to provider selection.',
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /scoping/:job_id/attachments ─────────────────────────────────────
  // Customer uploads a supporting document for the manual scope (only —
  // AI scopes don't currently accept attachments through this path).
  // Files are stored in blob storage under scope-attachments/<job_id>/...
  // and the metadata is appended to accepted_scope.attachments[] so it
  // travels with scope_snapshot into the eventual TenderRequest.

  app.post(
    '/scoping/:job_id/attachments',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { job_id } = req.params as { job_id: string };

      const fileName = req.headers['x-file-name'];
      if (typeof fileName !== 'string' || !fileName) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'X-File-Name header is required.' } });
      }

      const rawContentType = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
      const extMimeMap: Record<string, string> = {
        pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
      const ALLOWED_MIME = Object.values(extMimeMap);
      const detected = ALLOWED_MIME.includes(rawContentType) ? rawContentType : (extMimeMap[ext] ?? rawContentType);
      if (!ALLOWED_MIME.includes(detected)) {
        return reply.status(415).send({ success: false, error: { code: 'INVALID_FILE_TYPE', message: 'Only PDF, images, Word, and Excel files are allowed.' } });
      }

      const buffer = req.body as Buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'Request body must be file binary data.' } });
      }
      if (buffer.length > 20 * 1024 * 1024) {
        return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'File must be under 20 MB.' } });
      }
      // Magic-byte check — Content-Type header is attacker-controlled, but
      // the bytes are not. Reject HTML/SVG masquerading as PDF.
      if (!verifyFileSignature(buffer, detected)) {
        return reply.status(415).send({ success: false, error: { code: 'CONTENT_TYPE_MISMATCH', message: 'File content does not match its declared type.' } });
      }

      // Ownership check + load current scope.
      const pending = await prisma.pendingScope.findUnique({
        where: { id: job_id },
        select: { id: true, customer_id: true, accepted_scope: true, tender_request: { select: { id: true } } },
      });
      if (!pending) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Scope not found.' } });
      if (pending.customer_id !== req.user!.userId) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not your scope.' } });
      }
      // Don't allow attachment edits once the tender is published — the
      // scope_snapshot must be immutable from suppliers' perspective.
      if (pending.tender_request) {
        return reply.status(409).send({ success: false, error: { code: 'SCOPE_LOCKED', message: 'Tender already published; attachments cannot be modified.' } });
      }

      const safeFilename = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
      const blobPath = `scope-attachments/${job_id}/${Date.now()}-${safeFilename}`;

      try {
        const { uploadToBlob } = await import('../utils/blob-storage.js');
        await uploadToBlob(blobPath, buffer, detected);
      } catch (err) {
        return handleError(reply, err);
      }

      const attachment = {
        id: crypto.randomUUID(),
        file_name: safeFilename,
        file_size: buffer.length,
        mime_type: detected,
        blob_path: blobPath,
        uploaded_at: new Date().toISOString(),
      };

      // accepted_scope is the JSON column suppliers read. Append the new
      // attachment to its .attachments[] array, creating the array on first
      // upload. Stored here (not in a dedicated column) so suppliers see it
      // automatically as part of scope_snapshot once the tender publishes.
      const scope = (pending.accepted_scope as Record<string, unknown>) ?? {};
      const existing = Array.isArray(scope.attachments) ? (scope.attachments as unknown[]) : [];
      const nextScope = { ...scope, attachments: [...existing, attachment] };
      await prisma.pendingScope.update({
        where: { id: job_id },
        data: { accepted_scope: nextScope as Prisma.InputJsonValue },
      });

      return reply.status(201).send({ success: true, data: attachment });
    },
  );

  // ─── GET /scoping/:job_id/attachments/:attId/download ─────────────────────
  // Streams the file through the API — no SAS URL exposure. Customer only.
  app.get(
    '/scoping/:job_id/attachments/:attId/download',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { job_id, attId } = req.params as { job_id: string; attId: string };
      const { dl } = req.query as { dl?: string };
      try {
        const pending = await prisma.pendingScope.findUnique({
          where: { id: job_id },
          select: { customer_id: true, accepted_scope: true },
        });
        if (!pending || pending.customer_id !== req.user!.userId) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found.' } });
        }
        const scope = (pending.accepted_scope as Record<string, unknown>) ?? {};
        const attachments = (Array.isArray(scope.attachments) ? scope.attachments : []) as Array<{
          id?: string; blob_path?: string; file_name?: string; mime_type?: string;
        }>;
        const att = attachments.find((a) => a.id === attId);
        if (!att?.blob_path) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Attachment not found.' } });
        }

        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentType, contentLength } = await downloadBlobStream(att.blob_path);
        const SAFE_INLINE_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        const resolvedType = contentType ?? att.mime_type ?? 'application/octet-stream';
        reply.header('Content-Type', resolvedType);
        if (contentLength) reply.header('Content-Length', contentLength);
        reply.header('X-Content-Type-Options', 'nosniff');
        const wantInline = dl !== '1' && SAFE_INLINE_MIME.includes(resolvedType);
        reply.header('Content-Disposition', `${wantInline ? 'inline' : 'attachment'}; filename="${att.file_name ?? 'document'}"`);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── DELETE /scoping/:job_id/attachments/:attId ────────────────────────────
  // Customer can remove an attachment before the tender is published.
  app.delete(
    '/scoping/:job_id/attachments/:attId',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { job_id, attId } = req.params as { job_id: string; attId: string };
      try {
        const pending = await prisma.pendingScope.findUnique({
          where: { id: job_id },
          select: { customer_id: true, accepted_scope: true, tender_request: { select: { id: true } } },
        });
        if (!pending || pending.customer_id !== req.user!.userId) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found.' } });
        }
        if (pending.tender_request) {
          return reply.status(409).send({ success: false, error: { code: 'SCOPE_LOCKED', message: 'Tender already published.' } });
        }
        const scope = (pending.accepted_scope as Record<string, unknown>) ?? {};
        const existing = (Array.isArray(scope.attachments) ? scope.attachments : []) as Array<{ id?: string }>;
        const nextScope = { ...scope, attachments: existing.filter((a) => a.id !== attId) };
        await prisma.pendingScope.update({
          where: { id: job_id },
          data: { accepted_scope: nextScope as Prisma.InputJsonValue },
        });
        return reply.status(200).send({ success: true, data: { message: 'Attachment removed.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /scoping/:job_id/regenerate-section ──────────────────────────────

  app.post(
    '/scoping/:job_id/regenerate-section',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { job_id } = req.params as { job_id: string };

      const parsed = regenerateSectionSchema.safeParse(req.body);
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
        const result = await scopingService.queueSectionRegen(
          job_id,
          req.user!.userId,
          parsed.data,
        );
        return reply.status(202).send({
          success: true,
          data: {
            ...result,
            poll_url: `/api/v1/scoping/${job_id}/status`,
            message: `"${parsed.data.section}" section is being regenerated. Poll status.`,
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
