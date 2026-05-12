import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  step7Schema,
} from '@onys/shared';
import type { ContractorProfileService } from '../services/contractor-profile.service.js';
import { getOnboardingStatus } from '../services/contractor-state-machine.service.js';
import { authenticate } from '../middleware/authenticate.js';

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

// ─── Step schema map ──────────────────────────────────────────────────────────

const STEP_SCHEMAS: Record<number, typeof step1Schema | typeof step2Schema | typeof step3Schema | typeof step4Schema | typeof step5Schema | typeof step7Schema> = {
  1: step1Schema,
  2: step2Schema,
  3: step3Schema,
  4: step4Schema,
  5: step5Schema,
  7: step7Schema,
};

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function contractorRoutes(
  app: FastifyInstance,
  opts: {
    contractorService: ContractorProfileService;
    prisma: PrismaClient;
    subscriptionService: import('../services/subscription.service.js').SubscriptionService;
  },
) {
  const { contractorService, prisma, subscriptionService } = opts;
  const preHandler = [authenticate, requireContractor];

  // Binary body parsers for identity/selfie document uploads
  const binaryParser = (_req: FastifyRequest, body: Buffer, done: (err: null, body: Buffer) => void) => done(null, body);
  for (const ct of ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']) {
    app.addContentTypeParser(ct, { parseAs: 'buffer' }, binaryParser);
  }

  // ─── GET /contractor/profile ──────────────────────────────────────────────

  app.get('/contractor/profile', { preHandler }, async (req, reply) => {
    try {
      const result = await contractorService.getProfile(req.user!.userId);
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PATCH /contractor/profile/step/:step ─────────────────────────────────

  app.patch('/contractor/profile/step/:step', { preHandler }, async (req, reply) => {
    const { step: stepParam } = req.params as { step: string };
    const step = parseInt(stepParam, 10);

    const schema = STEP_SCHEMAS[step];
    if (!schema) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_STEP', message: `Step ${step} is not a valid onboarding step` },
      });
    }

    const parsed = schema.safeParse(req.body);
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

    // Step 3 = domain selection. Enforce the plan's max_domain_categories
    // before persisting — keeps the contractor inside their entitlement.
    if (step === 3) {
      const data = parsed.data as { domains?: string[] };
      const requested = data.domains?.length ?? 0;
      const check = await subscriptionService.checkLimit(
        req.user!.userId,
        'domain_categories',
      );
      if (check.limit !== null && requested > check.limit) {
        return reply.status(429).send({
          success: false,
          error: {
            code: 'DOMAIN_LIMIT_EXCEEDED',
            message: `Your ${check.plan_name ?? 'free'} plan allows ${check.limit} domain categories — you selected ${requested}. Upgrade to add more.`,
            limit: check.limit,
            requested,
            current_plan: check.plan_name,
          },
        });
      }
    }

    try {
      const updated = await contractorService.updateStep(
        req.user!.userId,
        step,
        parsed.data,
        extractMeta(req),
      );
      const onboarding_status = getOnboardingStatus(updated);
      return reply.status(200).send({
        success: true,
        data: { profile: updated, onboarding_status },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /contractor/profile/download ────────────────────────────────────

  app.get('/contractor/profile/download', { preHandler }, async (req, reply) => {
    const { blob_path, file_name } = req.query as { blob_path?: string; file_name?: string };
    if (!blob_path) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_PATH', message: 'blob_path query param required.' } });
    }

    // Verify the file belongs to this user before streaming

    const profile = await prisma.contractorProfile.findUnique({
      where: { user_id: req.user!.userId },
      select: {
        id: true,
        identity_document_blob_path: true,
        user: { select: { compliance_documents: true } },
        insurance_certificates: { select: { certificate_blob_path: true } },
        agreements: { select: { blob_path: true } },
      },
    });
    if (!profile) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
    }

    const complianceDocs = (profile.user.compliance_documents as { blob_path?: string }[]) ?? [];
    const allowedPaths = new Set<string>(
      [
        profile.identity_document_blob_path,
        ...complianceDocs.map((d) => d.blob_path),
        ...profile.insurance_certificates.map((c) => c.certificate_blob_path),
        ...profile.agreements.map((a) => a.blob_path),
      ].filter((p): p is string => p != null),
    );

    if (!allowedPaths.has(blob_path)) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'File not accessible.' } });
    }

    try {
      const { downloadBlobStream } = await import('../utils/blob-storage.js');
      const { stream, contentType, contentLength } = await downloadBlobStream(blob_path);
      const name = file_name ?? blob_path.split('/').pop() ?? 'download';
      if (contentType) reply.header('Content-Type', contentType);
      if (contentLength) reply.header('Content-Length', contentLength);
      reply.header('Content-Disposition', `attachment; filename="${name}"`);
      reply.header('Cache-Control', 'private, max-age=300');
      return reply.send(stream);
    } catch {
      return reply.status(404).send({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found.' } });
    }
  });

  // ─── POST /contractor/profile/submit ──────────────────────────────────────

  app.post('/contractor/profile/submit', { preHandler }, async (req, reply) => {
    try {
      const profile = await contractorService.submitForReview(req.user!.userId);
      return reply.status(200).send({
        success: true,
        data: { profile, message: 'Profile submitted for review.' },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /contractor/profile/identity-document-file ────────────────────
  // Receives binary file (PDF/JPG/PNG), uploads to Azure Blob, returns blob_path.
  // Query param ?folder=identity|selfie controls the storage prefix.

  app.post('/contractor/profile/identity-document-file', { preHandler }, async (req, reply) => {
    const { folder } = req.query as { folder?: string };
    const prefix = folder === 'selfie' ? 'selfie' : 'identity';

    const fileName = req.headers['x-file-name'];
    if (typeof fileName !== 'string' || !fileName) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'X-File-Name header is required.' },
      });
    }

    const rawCt = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const extMime: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
    const ALLOWED = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const contentType = ALLOWED.includes(rawCt) ? rawCt : (extMime[ext] ?? rawCt);
    if (!ALLOWED.includes(contentType)) {
      return reply.status(415).send({ success: false, error: { code: 'INVALID_FILE_TYPE', message: 'Only PDF, JPG, PNG allowed.' } });
    }

    const buffer = req.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'Request body must be file binary data.' } });
    }
    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'File must be under 10 MB.' } });
    }

    const safeFileName = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    const blobPath = `${prefix}/${Date.now()}/${safeFileName}`;

    try {
      const { uploadToBlob } = await import('../utils/blob-storage.js');
      await uploadToBlob(blobPath, buffer, contentType);
      return reply.status(200).send({ success: true, data: { blob_path: blobPath } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /contractor/profile/identity-upload ─────────────────────────────

  app.post('/contractor/profile/identity-upload', { preHandler }, async (req, reply) => {
    const body = req.body as { document_type?: unknown; blob_path?: unknown };
    if (typeof body.document_type !== 'string' || typeof body.blob_path !== 'string') {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'document_type and blob_path are required strings',
        },
      });
    }
    try {
      const profile = await contractorService.uploadIdentityDocument(
        req.user!.userId,
        body.document_type,
        body.blob_path,
      );
      return reply.status(200).send({ success: true, data: profile });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /contractor/profile/onboarding-status ────────────────────────────

  app.get('/contractor/profile/onboarding-status', { preHandler }, async (req, reply) => {
    try {
      const { onboarding_status } = await contractorService.getProfile(req.user!.userId);
      return reply.status(200).send({ success: true, data: onboarding_status });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PATCH /contractor/tax-declaration ───────────────────────────────────
  // Saves ABN, GST registration and provider agreement to the User record.

  app.patch('/contractor/tax-declaration', { preHandler }, async (req, reply) => {
    const body = req.body as {
      abn?: unknown;
      no_abn_reason?: unknown;
      gst_registered?: unknown;
      is_foreign_entity?: unknown;
      provider_agreement_signed?: unknown;
    };

    if (typeof body.gst_registered !== 'boolean') {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'gst_registered (boolean) is required.' },
      });
    }
    if (typeof body.is_foreign_entity !== 'boolean') {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'is_foreign_entity (boolean) is required.' },
      });
    }
    if (body.provider_agreement_signed !== true) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'You must accept the Provider Agreement to proceed.',
        },
      });
    }

    const noAbnReason = typeof body.no_abn_reason === 'string' && body.no_abn_reason.trim()
      ? body.no_abn_reason.trim()
      : undefined;

    try {
      await contractorService.saveTaxDeclaration(
        req.user!.userId,
        {
          ...(typeof body.abn === 'string' && body.abn.trim() ? { abn: body.abn.trim() } : {}),
          ...(noAbnReason ? { no_abn_reason: noAbnReason } : {}),
          gst_registered: body.gst_registered,
          is_foreign_entity: body.is_foreign_entity,
          provider_agreement_signed: true,
        },
        extractMeta(req),
      );
      return reply.status(200).send({ success: true, data: { message: 'Tax declaration saved.' } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /contractor/legal-name-request ─────────────────────────────────
  // Binary upload: body = file bytes, X-File-Name header, ?requested_name=...
  // Creates a PENDING request for admin review.
  // Only one PENDING request is allowed at a time — existing one is replaced.

  app.post('/contractor/legal-name-request', { preHandler }, async (req, reply) => {
    const query = req.query as { requested_name?: string };
    const requestedName = query.requested_name?.trim();
    if (!requestedName || requestedName.length < 2) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'requested_name query param is required (min 2 chars).' },
      });
    }

    const fileName = req.headers['x-file-name'];
    if (typeof fileName !== 'string' || !fileName) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'X-File-Name header is required.' } });
    }

    const rawContentType = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
    const extMimeMap: Record<string, string> = {
      pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    };
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const contentType = ALLOWED_MIME.includes(rawContentType) ? rawContentType : (extMimeMap[ext] ?? rawContentType);
    if (!ALLOWED_MIME.includes(contentType)) {
      return reply.status(415).send({ success: false, error: { code: 'INVALID_FILE_TYPE', message: 'Only PDF, JPG, PNG allowed.' } });
    }

    const buffer = req.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'Request body must be file binary data.' } });
    }
    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'File must be under 10 MB.' } });
    }

    const profile = await prisma.contractorProfile.findUnique({
      where: { user_id: req.user!.userId },
      select: { id: true },
    });
    if (!profile) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Contractor profile not found.' } });
    }

    const safeFilename = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    const blobPath = `legal-name-docs/${profile.id}/${Date.now()}-${safeFilename}`;

    try {
      const { uploadToBlob } = await import('../utils/blob-storage.js');
      await uploadToBlob(blobPath, buffer, contentType);
    } catch (err) {
      return handleError(reply, err);
    }

    // Cancel any existing PENDING request for this contractor
    await prisma.legalNameChangeRequest.updateMany({
      where: { contractor_id: profile.id, status: 'PENDING' },
      data: { status: 'SUPERSEDED' },
    });

    const request = await prisma.legalNameChangeRequest.create({
      data: {
        contractor_id: profile.id,
        requested_name: requestedName,
        document_blob_path: blobPath,
        document_file_name: safeFilename,
        status: 'PENDING',
      },
    });

    return reply.status(201).send({ success: true, data: request });
  });

  // ─── GET /contractor/legal-name-request/status ────────────────────────────

  app.get('/contractor/legal-name-request/status', { preHandler }, async (req, reply) => {
    const profile = await prisma.contractorProfile.findUnique({
      where: { user_id: req.user!.userId },
      select: {
        id: true,
        legal_name: true,
        legal_name_verified: true,
        user: { select: { full_name: true } },
      },
    });
    if (!profile) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    const latest = await prisma.legalNameChangeRequest.findFirst({
      where: { contractor_id: profile.id, status: { in: ['PENDING', 'APPROVED', 'REJECTED'] } },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        requested_name: true,
        status: true,
        rejection_reason: true,
        reviewed_at: true,
        created_at: true,
        document_file_name: true,
      },
    });

    return reply.status(200).send({
      success: true,
      data: {
        current_legal_name: profile.legal_name ?? profile.user.full_name,
        legal_name_verified: profile.legal_name_verified,
        latest_request: latest,
      },
    });
  });

  // ─── GET /contractor/payout-methods ──────────────────────────────────────

  app.get('/contractor/payout-methods', { preHandler }, async (req, reply) => {

    const profile = await prisma.contractorProfile.findUnique({
      where: { user_id: req.user!.userId },
      select: { id: true, legal_name: true, user: { select: { full_name: true } } },
    });
    if (!profile) return reply.status(404).send({ success: false, error: { code: 'PROFILE_NOT_FOUND' } });

    const methods = await prisma.contractorPayoutMethod.findMany({
      where: { contractor_profile_id: profile.id },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
    });
    // Fall back to user.full_name if legal_name has not been explicitly set yet
    const legal_name = profile.legal_name ?? profile.user.full_name ?? null;
    return reply.status(200).send({ success: true, data: { legal_name, methods } });
  });

  // ─── POST /contractor/payout-methods ─────────────────────────────────────

  app.post('/contractor/payout-methods', { preHandler }, async (req, reply) => {
    const body = req.body as {
      method_type?: string; nickname?: string; currency?: string;
      bank_name?: string; account_holder_name?: string; bsb?: string; account_number?: string;
      paypal_email?: string; payid_email?: string; payid_name?: string; stripe_account_id?: string;
      swift_bic?: string; iban?: string; bank_address?: string; bank_country?: string; correspondent_bank?: string;
      wise_email?: string; payoneer_email?: string;
      other_platform_name?: string; other_account_id?: string; other_instructions?: string;
    };

    const VALID_TYPES = ['AU_BANK', 'PAYID', 'PAYPAL', 'STRIPE_CONNECT', 'SWIFT', 'WISE', 'PAYONEER', 'OTHER'];
    if (!body.method_type || !VALID_TYPES.includes(body.method_type)) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Valid method_type is required.' } });
    }


    const profile = await prisma.contractorProfile.findUnique({
      where: { user_id: req.user!.userId },
      select: { id: true, legal_name: true },
    });
    if (!profile) return reply.status(404).send({ success: false, error: { code: 'PROFILE_NOT_FOUND' } });

    // AML name check for AU_BANK and SWIFT
    if (['AU_BANK', 'SWIFT'].includes(body.method_type) && body.account_holder_name && profile.legal_name) {
      const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
      if (normalize(body.account_holder_name) !== normalize(profile.legal_name)) {
        return reply.status(422).send({
          success: false,
          error: {
            code: 'NAME_MISMATCH',
            message: `Account holder name must match your legal name (${profile.legal_name}). AML regulations require this.`,
          },
        });
      }
    }

    const account_number_last4 = body.account_number ? body.account_number.slice(-4) : undefined;
    const iban_last4 = body.iban ? body.iban.slice(-4) : undefined;

    const method = await prisma.contractorPayoutMethod.create({
      data: {
        contractor_profile_id: profile.id,
        method_type:   body.method_type,
        nickname:      body.nickname ?? null,
        currency:      body.currency ?? 'AUD',
        bank_name:             body.bank_name ?? null,
        account_holder_name:   body.account_holder_name ?? null,
        bsb:                   body.bsb?.replace(/-/g, '') ?? null,
        account_number:        body.account_number ?? null,
        account_number_last4:  account_number_last4 ?? null,
        paypal_email:          body.paypal_email ?? null,
        payid_email:           body.payid_email ?? null,
        payid_name:            body.payid_name ?? null,
        stripe_account_id:     body.stripe_account_id ?? null,
        swift_bic:             body.swift_bic ?? null,
        iban:                  body.iban ?? null,
        iban_last4:            iban_last4 ?? null,
        bank_address:          body.bank_address ?? null,
        bank_country:          body.bank_country ?? null,
        correspondent_bank:    body.correspondent_bank ?? null,
        wise_email:            body.wise_email ?? null,
        payoneer_email:        body.payoneer_email ?? null,
        other_platform_name:   body.other_platform_name ?? null,
        other_account_id:      body.other_account_id ?? null,
        other_instructions:    body.other_instructions ?? null,
        verification_status:   'PENDING',
        aml_documents:         [],
      },
    });

    await (await import('../utils/audit.js')).writeAudit(prisma, {
      actorId: req.user!.userId,
      actionType: 'PAYOUT_METHOD_ADDED',
      entityType: 'ContractorPayoutMethod',
      entityId: method.id,
      metadata: { method_type: body.method_type, currency: body.currency },
    });

    return reply.status(201).send({ success: true, data: method });
  });

  // ─── PATCH /contractor/payout-methods/:id/primary ────────────────────────

  app.patch('/contractor/payout-methods/:id/primary', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const profile = await prisma.contractorProfile.findUnique({
      where: { user_id: req.user!.userId }, select: { id: true },
    });
    if (!profile) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });

    await prisma.$transaction([
      prisma.contractorPayoutMethod.updateMany({
        where: { contractor_profile_id: profile.id },
        data: { is_primary: false },
      }),
      prisma.contractorPayoutMethod.update({ where: { id }, data: { is_primary: true } }),
    ]);
    return reply.status(200).send({ success: true });
  });

  // ─── DELETE /contractor/payout-methods/:id ───────────────────────────────

  app.delete('/contractor/payout-methods/:id', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const profile = await prisma.contractorProfile.findUnique({
      where: { user_id: req.user!.userId }, select: { id: true },
    });
    if (!profile) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });

    await prisma.contractorPayoutMethod.deleteMany({
      where: { id, contractor_profile_id: profile.id },
    });
    return reply.status(200).send({ success: true });
  });

  // ─── POST /contractor/payout-methods/:id/documents ───────────────────────

  app.post('/contractor/payout-methods/:id/documents', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { doc_type = 'AML_PROOF' } = req.query as { doc_type?: string };


    const profile = await prisma.contractorProfile.findUnique({
      where: { user_id: req.user!.userId }, select: { id: true },
    });
    if (!profile) return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });

    const method = await prisma.contractorPayoutMethod.findFirst({
      where: { id, contractor_profile_id: profile.id },
      select: { id: true, aml_documents: true },
    });
    if (!method) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });

    const fileData = await req.file();
    if (!fileData) return reply.status(400).send({ success: false, error: { code: 'NO_FILE' } });

    const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!ALLOWED_MIME.includes(fileData.mimetype)) {
      fileData.file.resume();
      return reply.status(415).send({ success: false, error: { code: 'INVALID_FILE_TYPE', message: 'Only PDF, JPG, PNG allowed.' } });
    }

    const buffer = await fileData.toBuffer();
    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'File must be under 10 MB.' } });
    }

    const safeName = fileData.filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    const blobPath = `payout-methods/${id}/${Date.now()}-${safeName}`;

    const { uploadToBlob } = await import('../utils/blob-storage.js');
    await uploadToBlob(blobPath, buffer, fileData.mimetype);

    const existing = (method.aml_documents as unknown[]) ?? [];
    const { randomUUID } = await import('node:crypto');
    const newDoc = {
      id: randomUUID(),
      type: doc_type,
      file_name: fileData.filename,
      file_size: buffer.length,
      mime_type: fileData.mimetype,
      blob_path: blobPath,
      uploaded_at: new Date().toISOString(),
      verified: false,
    };

    await prisma.contractorPayoutMethod.update({
      where: { id },
      data: { aml_documents: [...existing, newDoc] as import('@prisma/client').Prisma.InputJsonValue[] },
    });
    return reply.status(200).send({ success: true, data: newDoc });
  });

  // ─── GET /contractor/payout-methods/document/download ────────────────────

  app.get('/contractor/payout-methods/document/download', { preHandler }, async (req, reply) => {
    const { blob_path, file_name } = req.query as { blob_path?: string; file_name?: string };
    if (!blob_path) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_PATH' } });
    }
    if (!blob_path.startsWith('payout-methods/')) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
    }

    // Verify the document belongs to this contractor

    const profile = await prisma.contractorProfile.findUnique({
      where: { user_id: req.user!.userId }, select: { id: true },
    });
    if (!profile) return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });

    const methodId = blob_path.split('/')[1];
    const method = await prisma.contractorPayoutMethod.findFirst({
      where: { id: methodId, contractor_profile_id: profile.id },
      select: { id: true },
    });
    if (!method) return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });

    try {
      const { downloadBlobStream } = await import('../utils/blob-storage.js');
      const { stream, contentType, contentLength } = await downloadBlobStream(blob_path);
      const name = file_name ?? blob_path.split('/').pop() ?? 'download';
      if (contentType) reply.header('Content-Type', contentType);
      if (contentLength) reply.header('Content-Length', contentLength);
      reply.header('Content-Disposition', `attachment; filename="${name}"`);
      reply.header('Cache-Control', 'private, max-age=300');
      return reply.send(stream);
    } catch {
      return reply.status(404).send({ success: false, error: { code: 'FILE_NOT_FOUND' } });
    }
  });

  // ─── GET /contractors/public ─────────────────────────────────────────────
  // No auth required — public listing for browse page

  app.get('/contractors/public', async (req, reply) => {
    try {
      const query = req.query as {
        specialisation?: string;
        location?: string;
        search?: string;
        limit?: string;
        offset?: string;
      };
      const limit = Math.min(Number(query.limit ?? 24), 50);
      const offset = Number(query.offset ?? 0);

      const profiles = await contractorService.listPublic({
        ...(query.specialisation !== undefined ? { specialisation: query.specialisation } : {}),
        ...(query.location !== undefined ? { location: query.location } : {}),
        ...(query.search !== undefined ? { search: query.search } : {}),
        limit,
        offset,
      });

      return reply.status(200).send({ success: true, data: profiles });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /contractors/:id/profile ────────────────────────────────────────
  // Public — customer-facing contractor profile card

  app.get('/contractors/:id/profile', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const profile = await prisma.contractorProfile.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          kyc_status: true,
          bio: true,
          skills: true,
          domains: true,
          overall_rating: true,
          rating_count: true,
          insurance_tier_met: true,
          completed_orders_count: true,
          // only safe display fields from user — no email, phone, address, legal_name
          user: { select: { full_name: true, created_at: true } },
          insurance_certificates: {
            where: { status: 'VERIFIED' },
            orderBy: { coverage_amount_aud: 'desc' },
            take: 1,
            select: { coverage_amount_aud: true },
          },
          ratings: {
            where: { is_visible: true },
            select: {
              technical_quality: true,
              communication: true,
              timeliness: true,
              documentation_quality: true,
              professionalism: true,
              overall_score: true,
            },
          },
        },
      });

      if (!profile || profile.status !== 'ACTIVE') {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Contractor not found.' } });
      }

      // Compute per-criterion averages
      const ratingCount = profile.ratings.length;
      const ratingVisible = ratingCount >= 1;
      const criteriaAvg = ratingCount > 0 ? {
        technical_quality:  +(profile.ratings.reduce((s, r) => s + r.technical_quality, 0) / ratingCount).toFixed(1),
        communication:      +(profile.ratings.reduce((s, r) => s + r.communication, 0) / ratingCount).toFixed(1),
        timeliness:         +(profile.ratings.reduce((s, r) => s + r.timeliness, 0) / ratingCount).toFixed(1),
        documentation:      +(profile.ratings.reduce((s, r) => s + r.documentation_quality, 0) / ratingCount).toFixed(1),
        professionalism:    +(profile.ratings.reduce((s, r) => s + r.professionalism, 0) / ratingCount).toFixed(1),
      } : null;

      // Insurance tier from highest verified cert coverage
      const topCert = profile.insurance_certificates[0];
      let insurance_tier: string | null = null;
      if (topCert) {
        const cov = Number(topCert.coverage_amount_aud ?? 0);
        insurance_tier = cov >= 5_000_000 ? 'PLATINUM' : cov >= 2_000_000 ? 'GOLD' : 'SILVER';
      }

      return reply.status(200).send({
        success: true,
        data: {
          id: profile.id,
          full_name: profile.user.full_name,
          bio: profile.bio ?? null,
          skills: profile.skills,
          domains: profile.domains,
          photo_url: null,
          is_verified: profile.status === 'ACTIVE' && profile.kyc_status === 'APPROVED',
          insurance_tier_met: profile.insurance_tier_met,
          insurance_tier,
          created_at: profile.user.created_at,
          orders_completed: profile.completed_orders_count,
          rating_avg: profile.overall_rating !== null ? Number(profile.overall_rating) : null,
          rating_count: profile.rating_count,
          rating_criteria_avg: criteriaAvg,
          rating_visible: ratingVisible,
        },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /contractors/:id/tasks ───────────────────────────────────────────
  // Public — published tasks for a contractor's profile page

  app.get('/contractors/:id/tasks', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const tasks = await prisma.task.findMany({
        where: { contractor_profile_id: id, status: 'PUBLISHED' },
        orderBy: { published_at: 'desc' },
        take: 30,
        select: {
          id: true,
          title: true,
          domain: true,
          objective: true,
          price: true,
          currency: true,
          hours_min: true,
          hours_max: true,
        },
      });

      return reply.status(200).send({ success: true, data: { tasks } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /contractors/:id/reviews ─────────────────────────────────────────
  // Public — paginated visible ratings for a contractor's profile page

  app.get('/contractors/:id/reviews', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { page } = req.query as { page?: string };
    const pageNum = Math.max(1, Number(page ?? 1));
    const PAGE_SIZE = 10;

    try {
      const [ratings, total] = await Promise.all([
        prisma.rating.findMany({
          where: { rated_contractor_id: id, is_visible: true },
          orderBy: { created_at: 'desc' },
          skip: (pageNum - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: {
            submitted_by_user: { select: { full_name: true } },
          },
        }),
        prisma.rating.count({ where: { rated_contractor_id: id, is_visible: true } }),
      ]);

      const reviews = ratings.map((r) => {
        // Anonymise: show first name + first letter of last name only
        const parts = (r.submitted_by_user.full_name ?? '').trim().split(' ');
        const anon = parts.length >= 2
          ? `${parts[0]} ${parts[parts.length - 1]![0]}.`
          : (parts[0] ?? 'Customer');

        return {
          id: r.id,
          customer_name_anon: anon,
          overall: Number(r.overall_score),
          criteria: {
            technical_quality: r.technical_quality,
            communication: r.communication,
            timeliness: r.timeliness,
            documentation: r.documentation_quality,
            professionalism: r.professionalism,
          },
          review_text: r.review_text ?? null,
          tags: r.tags,
          contractor_response: r.response_text ?? null,
          created_at: r.created_at,
        };
      });

      return reply.status(200).send({ success: true, data: { reviews, total } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /contractor/sidebar-badges ─────────────────────────────────────────
  // Single endpoint returning unread/pending counts for every menu item that
  // surfaces a badge. Cheap counts, polled by the contractor layout every 60s.
  // Works for any supplier-side account (individual contractor, org admin,
  // company admin) — auth-only, no role gate.
  app.get(
    '/contractor/sidebar-badges',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const userId = req.user!.userId;
      try {
        // Active orders awaiting contractor action — newly placed (SCOPED) or
        // requesting revisions. These need the contractor's attention.
        const activeOrdersAwaitingAction = await prisma.order.count({
          where: {
            contractor_user_id: userId,
            OR: [
              { status: 'SCOPED' },
              { company_order_status: 'REVISION_REQUESTED' },
            ],
          },
        });

        // Pending tender invitations the contractor hasn't responded to.
        const pendingTenderInvites = await prisma.tenderInvitation.count({
          where: {
            invitee_user_id: userId,
            status: { in: ['PENDING'] },
          },
        }).catch(() => 0);

        // Open disputes involving this user (raised by them or against them).
        const openDisputes = await prisma.dispute.count({
          where: {
            status: { in: ['OPEN', 'ASSIGNED', 'UNDER_REVIEW'] },
            order: {
              OR: [
                { contractor_user_id: userId },
                { customer_id: userId },
                { executing_member_id: userId },
              ],
            },
          },
        }).catch(() => 0);

        // Unread in-app notifications across all categories — used as a hint
        // on the bell icon in the sidebar (the bell does its own count too,
        // but bundling here saves a request).
        const unreadNotifications = await prisma.notification.count({
          where: { user_id: userId, read_at: null },
        });

        // Unread MESSAGE-category notifications — drives the Messages nav
        // badge so the supplier sees a dot/count when a customer responds
        // on a task thread or order chat.
        const unreadMessages = await prisma.notification.count({
          where: { user_id: userId, read_at: null, category: 'MESSAGE' },
        });

        return reply.status(200).send({
          success: true,
          data: {
            active_orders: activeOrdersAwaitingAction,
            tender_invitations: pendingTenderInvites,
            disputes: openDisputes,
            unread_notifications: unreadNotifications,
            messages: unreadMessages,
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
