import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { CompanyStatus, Domain } from '@prisma/client';
import {
  registerCompanySchema,
  inviteCompanyMemberSchema,
  acceptInvitationSchema,
  acceptInvitationExistingSchema,
  updateMemberRoleSchema,
  assignMemberSchema,
  updateCompanyProfileSchema,
} from '@onys/shared';
import type { CompanyService } from '../services/company.service.js';
import type { CompanyPayoutService, CompanyPayoutPreferenceInput } from '../services/company-payout.service.js';
import type { SubscriptionGuards } from '../middleware/subscription-limits.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/admin-guards.js';
import { prisma } from '../lib/prisma.js';
import { sha256Hash } from '../utils/tokens.js';
import { uploadToBlob } from '../utils/blob-storage.js';
import { lookupAbn } from '../services/abr.service.js';
import { writeAudit } from '../utils/audit.js';

// Fields on ConsultingCompany populated from the ABR. Locked once
// abn_verified=true unless the ABN itself is changed (or a privileged admin
// is performing the edit).
const COMPANY_ABR_DERIVED_FIELDS = [
  'legal_company_name',
  'gst_registered',
  'entity_type',
  'acn',
] as const;

// ─── Company role hierarchy ───────────────────────────────────────────────────

const ROLE_LEVEL: Record<string, number> = {
  COMPANY_ADMIN: 4,
  SENIOR_CONSULTANT: 3,
  CONSULTANT: 2,
  JUNIOR_CONSULTANT: 1,
};

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

// ─── Route registration ───────────────────────────────────────────────────────

export async function companyRoutes(
  app: FastifyInstance,
  opts: {
    companyService: CompanyService;
    payoutService: CompanyPayoutService;
    subscriptionGuards: SubscriptionGuards;
  },
) {
  const { companyService, payoutService, subscriptionGuards } = opts;

  // ─── Content-type parsers for binary uploads ──────────────────────────────
  const binaryParser = (_req: unknown, body: Buffer, done: (err: null, data: Buffer) => void) =>
    done(null, body);
  for (const ct of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) {
    app.addContentTypeParser(ct, { parseAs: 'buffer' }, binaryParser);
  }

  // ─── AUTHENTICATED: UPLOAD AUTHORITY DOCUMENT ────────────────────────────
  // POST /companies/me/authority-doc/upload
  // Requires login. Uploads to Azure Blob and saves blob_path on ConsultingCompany.
  app.post('/companies/me/authority-doc/upload', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

    const fileName = req.headers['x-file-name'];
    if (typeof fileName !== 'string' || fileName.trim() === '') {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'X-File-Name header is required' },
      });
    }
    const contentType = req.headers['content-type']?.split(';')[0] ?? '';
    const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED_TYPES.includes(contentType)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_FILE_TYPE', message: 'Only PDF, JPEG, PNG, or WEBP files are accepted' },
      });
    }
    const buffer = req.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request body must be file binary data' },
      });
    }
    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(400).send({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: 'File must be under 10MB' },
      });
    }
    try {
      const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
      const blobPath = `authority-docs/${req.user.userId}/${Date.now()}/${safeFileName}`;
      await uploadToBlob(blobPath, buffer, contentType);

      // Persist blob_path + authority_type on company
      const query = req.query as { authority_type?: string };
      const authorityType = query.authority_type ?? (req.headers['x-authority-type'] as string | undefined);
      const company = await prisma.consultingCompany.findUnique({
        where: { primary_admin_id: req.user.userId },
        select: { id: true },
      });
      if (company) {
        await prisma.consultingCompany.update({
          where: { id: company.id },
          data: {
            authorization_doc_blob_path: blobPath,
            ...(authorityType ? { authorization_type: authorityType } : {}),
          },
        });
      }

      return reply.status(200).send({ success: true, data: { blob_path: blobPath } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── AUTHENTICATED: SUBMIT FOR REVIEW ─────────────────────────────────────
  // POST /companies/me/submit-for-review
  // Moves company from DRAFT → PENDING_VERIFICATION.
  // Requires: domains set, authorization_doc_blob_path set, authorization_type set.
  app.post('/companies/me/submit-for-review', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    const company = await prisma.consultingCompany.findUnique({
      where: { primary_admin_id: req.user.userId },
      select: { id: true },
    });
    if (!company) {
      return reply.status(404).send({ success: false, error: { code: 'COMPANY_NOT_FOUND' } });
    }
    try {
      const updated = await companyService.submitForReview(company.id, req.user.userId, extractMeta(req));
      return reply.status(200).send({ success: true, data: { status: updated.status } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PUBLIC: REGISTER COMPANY ─────────────────────────────────────────────
  // POST /companies/register
  app.post('/companies/register', async (req, reply) => {
    const parsed = registerCompanySchema.safeParse(req.body);
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
      const result = await companyService.registerCompany(parsed.data, extractMeta(req));
      return reply.status(201).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PUBLIC: GET INVITATION INFO (preview before accepting) ──────────────
  // GET /company/join?token=...
  app.get('/company/join', async (req, reply) => {
    const { token } = req.query as { token?: string };
    if (!token) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'token query param required' },
      });
    }
    try {
      const token_hash = sha256Hash(token);
      const invitation = await prisma.companyInvitation.findUnique({
        where: { token_hash },
        include: {
          company: { select: { company_name: true, domains: true, logo_blob_path: true } },
          invited_by: { select: { full_name: true } },
        },
      });
      if (!invitation || invitation.expires_at < new Date() || invitation.status !== 'PENDING') {
        return reply.status(404).send({
          success: false,
          error: { code: 'INVITATION_NOT_FOUND', message: 'Invitation not found or expired' },
        });
      }
      // Check if invitee already has an onys account
      const existingUser = await prisma.user.findUnique({
        where: { email: invitation.invited_email },
        select: { id: true },
      });
      return reply.status(200).send({
        success: true,
        data: {
          invitation: {
            invited_email: invitation.invited_email,
            role: invitation.role,
            job_title: invitation.job_title ?? null,
            company_name: invitation.company.company_name,
            company_logo_blob_path: invitation.company.logo_blob_path ?? null,
            inviter_name: invitation.invited_by.full_name,
            expires_at: invitation.expires_at,
            invited_email_has_account: !!existingUser,
          },
        },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PUBLIC: ACCEPT INVITATION ────────────────────────────────────────────
  // POST /company/join
  // - New user:      body = { token, full_name, password, confirmed }
  // - Existing user: body = { token, existing: true }  (must be authenticated)
  app.post('/company/join', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const token = body['token'] as string | undefined;
    if (!token) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'token is required' },
      });
    }

    const isExistingUser = Boolean(body['existing']);
    if (isExistingUser) {
      // Existing-user path — must be authenticated
      const parsed = acceptInvitationExistingSchema.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Validation failed' },
        });
      }
      // Run authenticate inline (sets req.user on success, replies on failure)
      await authenticate(req, reply);
      if (!req.user) return; // authenticate already replied 401
      try {
        const result = await companyService.acceptInvitation(token, parsed.data, req.user.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    } else {
      // New-user path
      const parsed = acceptInvitationSchema.safeParse(body);
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
        const result = await companyService.acceptInvitation(token, parsed.data);
        return reply.status(201).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    }
  });

  // ─── AUTHENTICATED: CHECK EMAIL FOR INVITE ───────────────────────────────
  // POST /companies/check-email — returns { exists, already_member } without 4xx for normal cases
  app.post('/companies/check-email', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    const { email } = req.body as { email?: string };
    if (!email || typeof email !== 'string') {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'email required' } });
    }
    const membership = await prisma.companyMember.findFirst({
      where: { user_id: req.user.userId, status: 'ACTIVE' },
      select: { company_id: true },
    });
    if (!membership) {
      return reply.status(403).send({ success: false, error: { code: 'NOT_A_MEMBER' } });
    }
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        company_memberships: {
          where: { company_id: membership.company_id, status: 'ACTIVE' },
          select: { id: true },
        },
      },
    });
    return reply.status(200).send({
      success: true,
      data: {
        exists: !!user,
        already_member: !!user && user.company_memberships.length > 0,
      },
    });
  });

  // ─── AUTHENTICATED: GET COMPANY DASHBOARD ────────────────────────────────
  // GET /companies/me — works for both primary admin and regular members
  app.get('/companies/me', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    // Find company via primary admin first, then fall back to membership
    let companyId: string | null = null;
    const primaryAdminCompany = await prisma.consultingCompany.findFirst({
      where: { primary_admin_id: req.user.userId },
      select: { id: true },
    });
    if (primaryAdminCompany) {
      companyId = primaryAdminCompany.id;
    } else {
      const memberRecord = await prisma.companyMember.findFirst({
        where: { user_id: req.user.userId, status: 'ACTIVE' },
        select: { company_id: true },
      });
      if (memberRecord) companyId = memberRecord.company_id;
    }
    if (!companyId) {
      return reply.status(404).send({
        success: false,
        error: { code: 'COMPANY_NOT_FOUND', message: 'You are not associated with any company' },
      });
    }
    try {
      const company = await prisma.consultingCompany.findUnique({
        where: { id: companyId },
        select: { id: true, company_name: true, logo_blob_path: true, status: true },
      });
      if (!company) return reply.status(404).send({ success: false, error: { code: 'COMPANY_NOT_FOUND' } });
      const membershipRecord = await prisma.companyMember.findFirst({
        where: { user_id: req.user.userId, company_id: companyId },
        select: { role: true, job_title: true },
      });
      const role = membershipRecord?.role ?? 'COMPANY_ADMIN';
      const job_title = membershipRecord?.job_title ?? null;
      return reply.status(200).send({
        success: true,
        data: {
          company: {
            id: company.id,
            company_name: company.company_name,
            logo_blob_path: company.logo_blob_path,
            status: company.status,
          },
          membership: { role, job_title },
        },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── AUTHENTICATED: GET FULL COMPANY PROFILE ─────────────────────────────
  // GET /companies/me/profile — full profile data for the company profile settings page
  app.get('/companies/me/profile', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

    let companyId: string | null = null;
    const primaryAdminCompany = await prisma.consultingCompany.findFirst({
      where: { primary_admin_id: req.user.userId },
      select: { id: true },
    });
    if (primaryAdminCompany) {
      companyId = primaryAdminCompany.id;
    } else {
      const memberRecord = await prisma.companyMember.findFirst({
        where: { user_id: req.user.userId, status: 'ACTIVE' },
        select: { company_id: true },
      });
      if (memberRecord) companyId = memberRecord.company_id;
    }
    if (!companyId) {
      return reply.status(404).send({
        success: false,
        error: { code: 'COMPANY_NOT_FOUND', message: 'You are not associated with any company' },
      });
    }

    try {
      const company = await prisma.consultingCompany.findUnique({
        where: { id: companyId },
        include: {
          primary_admin: {
            select: { id: true, full_name: true, email: true },
          },
          stripe_connect_account: {
            select: { status: true, stripe_account_id: true },
          },
          payout_accounts: {
            orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
          },
          _count: {
            select: { members: true, tasks: true },
          },
        },
      });
      if (!company) {
        return reply.status(404).send({ success: false, error: { code: 'COMPANY_NOT_FOUND' } });
      }
      return reply.status(200).send({
        success: true,
        data: {
          ...company,
          overall_rating: company.overall_rating ? Number(company.overall_rating) : null,
        },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── AUTHENTICATED: UPDATE COMPANY PROFILE ───────────────────────────────
  // PATCH /companies/me
  app.patch('/companies/me', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    const parsed = updateCompanyProfileSchema.safeParse(req.body);
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
    const company = await prisma.consultingCompany.findFirst({
      where: { primary_admin_id: req.user.userId },
      select: { id: true },
    });
    if (!company) {
      return reply.status(403).send({
        success: false,
        error: { code: 'NOT_PRIMARY_ADMIN', message: 'Only the primary admin can update company details' },
      });
    }
    try {
      // Strip undefined; convert empty strings to null for nullable DB fields
      const ENUM_FIELDS = new Set(['company_size', 'state', 'billing_country', 'tax_residency_country', 'anzsic_code', 'vat_number', 'billing_email', 'billing_phone', 'billing_address_1', 'billing_address_2', 'billing_city', 'billing_state', 'billing_postcode', 'abn', 'acn', 'entity_type', 'trading_name', 'legal_company_name', 'website_url', 'phone', 'business_address', 'description']);
      const updateData = Object.fromEntries(
        Object.entries(parsed.data)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, v === '' && ENUM_FIELDS.has(k) ? null : v]),
      ) as Record<string, unknown>;
      if (parsed.data.domains) {
        updateData['domains'] = parsed.data.domains as Domain[];
      }

      // Auto-verify on ABN change + lock derived fields when ABN unchanged.
      // Same pattern as PATCH /auth/me/billing on the User side.
      const isPrivilegedAdmin = ['PLATFORM_ADMIN', 'COMPLIANCE_ADMIN'].includes(req.user.accountType);
      const current = await prisma.consultingCompany.findUniqueOrThrow({
        where: { id: company.id },
        select: { abn: true, abn_verified: true },
      });
      const incomingAbnRaw = updateData['abn'];
      const incomingAbn = typeof incomingAbnRaw === 'string'
        ? incomingAbnRaw.replace(/\s/g, '')
        : (incomingAbnRaw === null ? null : undefined);
      const abnChanged = incomingAbn !== undefined && incomingAbn !== (current.abn ?? null);

      if (abnChanged && incomingAbn) {
        try {
          const result = await lookupAbn(incomingAbn);
          updateData['abn'] = result.abn;
          if (result.entity_name) updateData['legal_company_name'] = result.entity_name;
          updateData['gst_registered'] = result.gst_registered;
          if (result.entity_type_name) updateData['entity_type'] = result.entity_type_name;
          if (result.acn) {
            updateData['acn'] = result.acn;
            updateData['acn_verified'] = true;
          }
          updateData['abn_verified'] = true;
          updateData['abn_verified_at'] = new Date();
          updateData['abn_verified_name'] = result.entity_name;
          updateData['gst_registered_confirmed_at'] = new Date();

          await writeAudit(prisma, {
            actorId: req.user.userId,
            actionType: 'ABN_VERIFIED',
            entityType: 'ConsultingCompany',
            entityId: company.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'] ?? 'unknown',
            metadata: {
              abn: result.abn,
              entity_name: result.entity_name,
              previous_abn: current.abn,
            },
          });
        } catch (err) {
          return handleError(reply, err);
        }
      } else if (current.abn_verified && !isPrivilegedAdmin) {
        // Reject any attempt to change derived fields when verified+unchanged.
        const attempted = COMPANY_ABR_DERIVED_FIELDS.filter((f) => updateData[f] !== undefined);
        if (attempted.length > 0) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'LOCKED_BY_ABR_VERIFICATION',
              message: `These fields are populated from the ABR and cannot be edited unless you change the ABN: ${attempted.join(', ')}.`,
              fields: attempted,
            },
          });
        }
      } else if (isPrivilegedAdmin && !abnChanged) {
        // Admin override — log it.
        const attempted = COMPANY_ABR_DERIVED_FIELDS.filter((f) => updateData[f] !== undefined);
        if (attempted.length > 0) {
          await writeAudit(prisma, {
            actorId: req.user.userId,
            actionType: 'ABR_OVERRIDE',
            entityType: 'ConsultingCompany',
            entityId: company.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'] ?? 'unknown',
            metadata: { fields: attempted as readonly string[] },
          });
        }
      }

      const updated = await prisma.consultingCompany.update({
        where: { id: company.id },
        data: updateData,
      });
      return reply.status(200).send({ success: true, data: updated });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── AUTHENTICATED: VERIFY COMPANY ABN ──────────────────────────────────
  // POST /companies/me/abn-verify — explicit verify endpoint for the
  // company profile UI. Only the primary admin may trigger.
  app.post('/companies/me/abn-verify', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    const body = req.body as { abn?: unknown };
    const abnRaw = typeof body.abn === 'string' ? body.abn : '';
    if (!abnRaw) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_ABN', message: 'abn is required.' } });
    }
    const abn = abnRaw.replace(/\s/g, '');

    const company = await prisma.consultingCompany.findFirst({
      where: { primary_admin_id: req.user.userId },
      select: { id: true },
    });
    if (!company) {
      return reply.status(403).send({
        success: false,
        error: { code: 'NOT_PRIMARY_ADMIN', message: 'Only the primary admin can verify the company ABN.' },
      });
    }

    try {
      const result = await lookupAbn(abn);
      const updated = await prisma.consultingCompany.update({
        where: { id: company.id },
        data: {
          abn: result.abn,
          abn_verified: true,
          abn_verified_at: new Date(),
          abn_verified_name: result.entity_name,
          ...(result.entity_name ? { legal_company_name: result.entity_name } : {}),
          gst_registered: result.gst_registered,
          gst_registered_confirmed_at: new Date(),
          ...(result.entity_type_name ? { entity_type: result.entity_type_name } : {}),
          ...(result.acn ? { acn: result.acn, acn_verified: true } : {}),
        },
        select: {
          id: true, abn: true, abn_verified: true, abn_verified_at: true, abn_verified_name: true,
          legal_company_name: true, gst_registered: true, entity_type: true, acn: true, acn_verified: true,
        },
      });

      await writeAudit(prisma, {
        actorId: req.user.userId,
        actionType: 'ABN_VERIFIED',
        entityType: 'ConsultingCompany',
        entityId: company.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? 'unknown',
        metadata: {
          abn: result.abn,
          entity_name: result.entity_name,
          gst_registered: result.gst_registered,
        },
      });

      return reply.status(200).send({
        success: true,
        data: {
          ...updated,
          abr: {
            entity_name: result.entity_name,
            entity_type_name: result.entity_type_name,
            entity_type_code: result.entity_type_code,
            gst_registered: result.gst_registered,
            gst_effective_from: result.gst_effective_from,
            address_state: result.address_state,
            address_postcode: result.address_postcode,
            trading_names: result.trading_names,
          },
        },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── AUTHENTICATED: LIST MEMBERS ─────────────────────────────────────────
  // GET /companies/me/members
  app.get('/companies/me/members', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    const membership = await prisma.companyMember.findFirst({
      where: { user_id: req.user.userId, status: 'ACTIVE' },
      select: { company_id: true },
    });
    if (!membership) {
      return reply.status(403).send({
        success: false,
        error: { code: 'NOT_A_MEMBER', message: 'You are not a member of any company' },
      });
    }
    try {
      const rows = await prisma.companyMember.findMany({
        where: { company_id: membership.company_id },
        include: {
          user: { select: { id: true, email: true, full_name: true } },
        },
        orderBy: { joined_at: 'asc' },
      });
      const members = rows.map((m) => ({
        user_id: m.user_id,
        full_name: m.user.full_name,
        email: m.user.email,
        role: m.role,
        job_title: m.job_title,
        domains: m.member_domains,
        completed_orders_count: m.orders_completed,
        joined_at: m.joined_at,
        status: m.status,
        is_primary_admin: m.is_primary_admin,
      }));
      return reply.status(200).send({
        success: true,
        data: { members, total_count: members.length },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── AUTHENTICATED: INVITE MEMBER ────────────────────────────────────────
  // POST /companies/me/invite
  app.post(
    '/companies/me/invite',
    { preHandler: [authenticate, subscriptionGuards.requireLimit('team_seats')] },
    async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    const parsed = inviteCompanyMemberSchema.safeParse(req.body);
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
    const membership = await prisma.companyMember.findFirst({
      where: { user_id: req.user.userId, status: 'ACTIVE' },
      select: { company_id: true },
    });
    if (!membership) {
      return reply.status(403).send({
        success: false,
        error: { code: 'NOT_A_MEMBER', message: 'You are not a member of any company' },
      });
    }
    try {
      const result = await companyService.inviteMember(
        membership.company_id,
        req.user.userId,
        parsed.data,
      );
      return reply.status(201).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── AUTHENTICATED: LIST INVITATIONS ─────────────────────────────────────
  // GET /companies/me/invitations
  app.get('/companies/me/invitations', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    const membership = await prisma.companyMember.findFirst({
      where: { user_id: req.user.userId, status: 'ACTIVE' },
      select: { company_id: true },
    });
    if (!membership) {
      return reply.status(403).send({
        success: false,
        error: { code: 'NOT_A_MEMBER', message: 'You are not a member of any company' },
      });
    }
    try {
      const rows = await prisma.companyInvitation.findMany({
        where: { company_id: membership.company_id },
        include: { invited_by: { select: { full_name: true } } },
        orderBy: { created_at: 'desc' },
        take: 50,
      });
      const invitations = rows.map((inv) => ({
        id: inv.id,
        invited_email: inv.invited_email,
        role: inv.role,
        job_title: inv.job_title,
        invited_by_name: inv.invited_by.full_name,
        created_at: inv.created_at,
        expires_at: inv.expires_at,
        status: inv.status,
      }));
      return reply.status(200).send({ success: true, data: { invitations } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── AUTHENTICATED: REVOKE INVITATION ────────────────────────────────────
  // POST /companies/me/invitations/:invitationId/revoke
  app.post(
    '/companies/me/invitations/:invitationId/revoke',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
      const { invitationId } = req.params as { invitationId: string };
      const membership = await prisma.companyMember.findFirst({
        where: { user_id: req.user.userId, status: 'ACTIVE', role: { in: ['COMPANY_ADMIN', 'SENIOR_CONSULTANT'] } },
        select: { company_id: true },
      });
      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: { code: 'INSUFFICIENT_COMPANY_ROLE', message: 'Only Company Admins can revoke invitations' },
        });
      }
      try {
        const invitation = await prisma.companyInvitation.findUnique({
          where: { id: invitationId },
          select: { id: true, company_id: true, status: true },
        });
        if (!invitation || invitation.company_id !== membership.company_id) {
          return reply.status(404).send({
            success: false,
            error: { code: 'INVITATION_NOT_FOUND', message: 'Invitation not found' },
          });
        }
        if (invitation.status !== 'PENDING') {
          return reply.status(422).send({
            success: false,
            error: { code: 'INVITATION_NOT_PENDING', message: 'Only pending invitations can be revoked' },
          });
        }
        await prisma.companyInvitation.update({
          where: { id: invitationId },
          data: { status: 'REVOKED' },
        });
        return reply.status(200).send({ success: true, data: { message: 'Invitation revoked.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── AUTHENTICATED: RESEND INVITATION ────────────────────────────────────
  // POST /companies/me/invitations/:invitationId/resend
  app.post(
    '/companies/me/invitations/:invitationId/resend',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
      const { invitationId } = req.params as { invitationId: string };
      const membership = await prisma.companyMember.findFirst({
        where: { user_id: req.user.userId, status: 'ACTIVE', role: { in: ['COMPANY_ADMIN', 'SENIOR_CONSULTANT'] } },
        select: { company_id: true },
      });
      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: { code: 'INSUFFICIENT_COMPANY_ROLE', message: 'Only Company Admins can resend invitations' },
        });
      }
      try {
        const invitation = await prisma.companyInvitation.findUnique({
          where: { id: invitationId },
          select: { id: true, company_id: true, status: true, expires_at: true },
        });
        if (!invitation || invitation.company_id !== membership.company_id) {
          return reply.status(404).send({
            success: false,
            error: { code: 'INVITATION_NOT_FOUND', message: 'Invitation not found' },
          });
        }
        if (invitation.status !== 'PENDING') {
          return reply.status(422).send({
            success: false,
            error: { code: 'INVITATION_NOT_PENDING', message: 'Only pending invitations can be resent' },
          });
        }
        // Extend expiry by 72h from now
        await prisma.companyInvitation.update({
          where: { id: invitationId },
          data: { expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000) },
        });
        return reply.status(200).send({ success: true, data: { message: 'Invitation resent.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── AUTHENTICATED: COMPANY ORDERS ───────────────────────────────────────
  // GET /companies/me/orders
  app.get('/companies/me/orders', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    const membership = await prisma.companyMember.findFirst({
      where: { user_id: req.user.userId, status: 'ACTIVE' },
      select: { company_id: true },
    });
    if (!membership) {
      return reply.status(403).send({
        success: false,
        error: { code: 'NOT_A_MEMBER', message: 'You are not a member of any company' },
      });
    }
    try {
      const query = req.query as { limit?: string; status?: string; filter?: string };
      const limit = Math.min(Number(query.limit ?? 20), 50);

      // `?filter=unassigned` — orders with no assigned executing member that
      // are still in a stage where assignment is meaningful. Excludes
      // terminal states (COMPLETED, CANCELLED, DISPUTED) so the sidebar
      // badge doesn't light up forever after every order is delivered.
      // The frontend orders page applies the same condition client-side
      // when the URL has ?filter=unassigned.
      const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'DISPUTED'] as const;
      const filterUnassigned = query.filter === 'unassigned';

      const where: import('@prisma/client').Prisma.OrderWhereInput = {
        company_id: membership.company_id,
        ...(query.status
          ? { status: query.status as import('@prisma/client').OrderStatus }
          : {}),
        ...(filterUnassigned
          ? {
              executing_member_id: null,
              status: { notIn: TERMINAL_STATUSES as never },
            }
          : {}),
      };

      const [orders, total_count] = await prisma.$transaction([
        prisma.order.findMany({
          where,
          include: {
            task: { select: { id: true, title: true, domain: true } },
            customer: { select: { id: true, full_name: true } },
            executing_member: { select: { id: true, full_name: true } },
          },
          orderBy: { created_at: 'desc' },
          take: limit,
        }),
        // total_count respects the filter too — the sidebar reads it as
        // "X unassigned orders" when filter=unassigned. Without this, the
        // badge always reflected the company's lifetime order count.
        prisma.order.count({ where }),
      ]);
      return reply.status(200).send({ success: true, data: { orders, total_count } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── AUTHENTICATED: COMPANY AUDIT LOG ────────────────────────────────────
  // GET /companies/me/audit
  app.get('/companies/me/audit', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    const membership = await prisma.companyMember.findFirst({
      where: { user_id: req.user.userId, status: 'ACTIVE' },
      select: { company_id: true },
    });
    if (!membership) {
      return reply.status(403).send({
        success: false,
        error: { code: 'NOT_A_MEMBER', message: 'You are not a member of any company' },
      });
    }
    try {
      const query = req.query as { limit?: string };
      const limit = Math.min(Number(query.limit ?? 10), 50);
      const entries = await prisma.auditLog.findMany({
        where: { entity_type: 'ConsultingCompany', entity_id: membership.company_id },
        orderBy: { timestamp: 'desc' },
        take: limit,
        select: { id: true, action_type: true, timestamp: true, metadata: true },
      });
      return reply.status(200).send({ success: true, data: { entries } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── AUTHENTICATED: UPDATE MEMBER ROLE ───────────────────────────────────
  // PATCH /companies/me/members/:userId/role
  app.patch(
    '/companies/me/members/:userId/role',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
      const { userId } = req.params as { userId: string };
      const parsed = updateMemberRoleSchema.safeParse(req.body);
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
      const requesterMembership = await prisma.companyMember.findFirst({
        where: { user_id: req.user.userId, status: 'ACTIVE', role: 'COMPANY_ADMIN' },
        select: { company_id: true },
      });
      if (!requesterMembership) {
        return reply.status(403).send({
          success: false,
          error: { code: 'INSUFFICIENT_COMPANY_ROLE', message: 'Only Company Admins can change member roles' },
        });
      }
      try {
        const updated = await prisma.companyMember.update({
          where: {
            company_id_user_id: {
              company_id: requesterMembership.company_id,
              user_id: userId,
            },
          },
          data: {
            role: parsed.data.role,
            ...(parsed.data.job_title !== undefined ? { job_title: parsed.data.job_title } : {}),
          },
        });
        return reply.status(200).send({ success: true, data: updated });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── AUTHENTICATED: REMOVE MEMBER ────────────────────────────────────────
  // DELETE /companies/me/members/:userId
  app.delete(
    '/companies/me/members/:userId',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
      const { userId } = req.params as { userId: string };
      const body = (req.body ?? {}) as { reason?: string };
      const requesterMembership = await prisma.companyMember.findFirst({
        where: { user_id: req.user.userId, status: 'ACTIVE', role: 'COMPANY_ADMIN' },
        select: { company_id: true },
      });
      if (!requesterMembership) {
        return reply.status(403).send({
          success: false,
          error: { code: 'INSUFFICIENT_COMPANY_ROLE', message: 'Only Company Admins can remove members' },
        });
      }
      try {
        await companyService.removeMember(
          requesterMembership.company_id,
          userId,
          req.user.userId,
          body.reason,
        );
        return reply.status(204).send();
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── AUTHENTICATED: ASSIGN MEMBER TO ORDER ───────────────────────────────
  // POST /orders/:id/assign-member
  app.post(
    '/orders/:id/assign-member',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
      const { id: orderId } = req.params as { id: string };
      const parsed = assignMemberSchema.safeParse(req.body);
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
        const result = await companyService.assignMemberToOrder(
          orderId,
          parsed.data.member_user_id,
          req.user.userId,
          parsed.data.assignment_note,
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PUBLIC: GET COMPANY PROFILE ──────────────────────────────────────────
  // GET /companies/:id
  app.get('/companies/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await companyService.getCompanyProfile(id);
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PLATFORM ADMIN: LIST COMPANIES ──────────────────────────────────────
  // GET /admin/companies
  app.get(
    '/admin/companies',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const query = req.query as { status?: string; cursor?: string; limit?: string };
      const limit = Math.min(Number(query.limit ?? 20), 50);
      try {
        const companies = await prisma.consultingCompany.findMany({
          where: query.status ? { status: query.status as CompanyStatus } : {},
          take: limit + 1,
          ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
          orderBy: { created_at: 'desc' },
          include: {
            primary_admin: { select: { id: true, email: true, full_name: true } },
            _count: { select: { members: true, tasks: true, orders: true } },
          },
        });
        const hasMore = companies.length > limit;
        const page = hasMore ? companies.slice(0, limit) : companies;
        return reply.status(200).send({
          success: true,
          data: {
            items: page,
            next_cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PLATFORM ADMIN: STREAM COMPANY AUTHORITY DOCUMENT ──────────────────
  // GET /admin/companies/:id/authority-document
  //
  // SECURITY: streams the blob through the API instead of returning an
  // Azure SAS URL. The previous SAS-URL endpoint exposed the storage
  // account, container layout, and original filename; once leaked the
  // URL was readable for an hour without re-authentication. With this
  // streaming endpoint every download goes through the JWT auth check
  // and writes an audit row, and Azure credentials never leave the
  // server.
  app.get(
    '/admin/companies/:id/authority-document',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { dl } = req.query as { dl?: string };
      try {
        const company = await prisma.consultingCompany.findUnique({
          where: { id },
          select: { id: true, company_name: true, authorization_doc_blob_path: true },
        });
        if (!company) {
          return reply.status(404).send({
            success: false,
            error: { code: 'COMPANY_NOT_FOUND', message: 'Company not found' },
          });
        }
        if (!company.authorization_doc_blob_path) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NO_DOCUMENT', message: 'No authority document uploaded' },
          });
        }

        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentType, contentLength } = await downloadBlobStream(
          company.authorization_doc_blob_path,
        );
        const fileName = company.authorization_doc_blob_path.split('/').pop() ?? 'authority-doc';

        // Authority docs are PDFs/images; inline by default so admins can
        // view in-tab. Pass ?dl=1 to force a download.
        const resolvedType = contentType ?? 'application/octet-stream';
        const disposition = dl === '1' ? 'attachment' : 'inline';
        reply.header('Content-Type', resolvedType);
        if (contentLength) reply.header('Content-Length', contentLength);
        reply.header('Content-Disposition', `${disposition}; filename="${fileName}"`);
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('Cache-Control', 'private, no-store');

        // Audit log every authority-doc view. Governance documents like
        // Board Resolutions are sensitive; tracking who looked, when,
        // and from where is part of the compliance posture.
        await writeAudit(prisma, {
          actorId: req.user!.userId,
          actionType: 'COMPANY_AUTHORITY_DOC_VIEWED',
          entityType: 'ConsultingCompany',
          entityId: company.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? 'unknown',
          metadata: { company_name: company.company_name, disposition },
        });

        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PLATFORM ADMIN: GET COMPANY DETAIL ──────────────────────────────────
  // GET /admin/companies/:id
  app.get(
    '/admin/companies/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const company = await prisma.consultingCompany.findUnique({
          where: { id },
          include: {
            primary_admin: { select: { id: true, full_name: true, email: true } },
            members: {
              include: { user: { select: { full_name: true, email: true } } },
              orderBy: { joined_at: 'asc' },
            },
            orders: {
              include: { task: { select: { title: true } } },
              orderBy: { created_at: 'desc' },
              take: 20,
            },
            payout_accounts: {
              orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
            },
            _count: { select: { members: true, orders: true } },
          },
        });
        if (!company) {
          return reply.status(404).send({
            success: false,
            error: { code: 'COMPANY_NOT_FOUND', message: 'Company not found' },
          });
        }
        return reply.status(200).send({ success: true, data: company });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PLATFORM ADMIN: VERIFY COMPANY ──────────────────────────────────────
  // PATCH /admin/companies/:id/verify
  // Body: { decision: 'APPROVE' | 'REJECT', reason?: string }
  app.patch(
    '/admin/companies/:id/verify',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { decision?: string; reason?: string };
      if (body.decision !== 'APPROVE' && body.decision !== 'REJECT') {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: '`decision` must be APPROVE or REJECT' },
        });
      }
      try {
        const company = await prisma.consultingCompany.findUnique({
          where: { id },
          select: { id: true, status: true },
        });
        if (!company) {
          return reply.status(404).send({
            success: false,
            error: { code: 'COMPANY_NOT_FOUND', message: 'Company not found' },
          });
        }
        if (company.status !== 'PENDING_VERIFICATION') {
          return reply.status(422).send({
            success: false,
            error: { code: 'INVALID_STATUS', message: `Company is already ${company.status}` },
          });
        }
        const updated = await prisma.consultingCompany.update({
          where: { id },
          data: {
            status: body.decision === 'APPROVE' ? 'ACTIVE' : 'BANNED',
            ...(body.decision === 'APPROVE' ? { authorization_verified_at: new Date() } : {}),
            ...(body.reason ? { suspension_reason: body.reason } : {}),
          },
        });
        return reply.status(200).send({ success: true, data: updated });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PLATFORM ADMIN: CHANGE COMPANY STATUS ───────────────────────────────
  // PATCH /admin/companies/:id/status
  app.patch(
    '/admin/companies/:id/status',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { status?: string; reason?: string };
      const ALLOWED: CompanyStatus[] = ['ACTIVE', 'SUSPENDED', 'BANNED'];
      if (!body.status || !ALLOWED.includes(body.status as CompanyStatus)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `status must be one of: ${ALLOWED.join(', ')}`,
          },
        });
      }
      try {
        const company = await prisma.consultingCompany.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!company) {
          return reply.status(404).send({
            success: false,
            error: { code: 'COMPANY_NOT_FOUND', message: 'Company not found' },
          });
        }
        const updated = await prisma.consultingCompany.update({
          where: { id },
          data: {
            status: body.status as CompanyStatus,
            ...(body.reason ? { suspension_reason: body.reason } : {}),
          },
        });
        return reply.status(200).send({ success: true, data: updated });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── ADMIN: DOCUMENT REQUESTS ────────────────────────────────────────────
  // POST /admin/companies/:id/document-requests   — create a request
  // GET  /admin/companies/:id/document-requests   — list requests
  // PATCH /admin/document-requests/:reqId/dismiss — dismiss a request

  app.post('/admin/companies/:id/document-requests', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { message?: string };
    if (!body.message?.trim()) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'message is required' } });
    }
    const company = await prisma.consultingCompany.findUnique({ where: { id }, select: { id: true } });
    if (!company) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    try {
      const request = await prisma.adminDocumentRequest.create({
        data: { company_id: id, requested_by_id: req.user!.userId, message: body.message.trim() },
      });
      return reply.status(201).send({ success: true, data: request });
    } catch (err) { return handleError(reply, err); }
  });

  app.get('/admin/companies/:id/document-requests', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const requests = await prisma.adminDocumentRequest.findMany({
        where: { company_id: id },
        orderBy: { created_at: 'desc' },
        include: { requested_by: { select: { full_name: true } } },
      });
      return reply.status(200).send({ success: true, data: requests });
    } catch (err) { return handleError(reply, err); }
  });

  app.patch('/admin/document-requests/:reqId/dismiss', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { reqId } = req.params as { reqId: string };
    try {
      const updated = await prisma.adminDocumentRequest.update({
        where: { id: reqId },
        data: { status: 'DISMISSED' },
      });
      return reply.status(200).send({ success: true, data: updated });
    } catch (err) { return handleError(reply, err); }
  });

  // ── GET /admin/document-requests/:reqId/documents/:docId ──────────────────
  // Streams a document uploaded by the company in response to a request.

  app.get('/admin/document-requests/:reqId/documents/:docId', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { reqId, docId } = req.params as { reqId: string; docId: string };
    const { dl } = req.query as { dl?: string };
    try {
      const docReq = await prisma.adminDocumentRequest.findUnique({
        where: { id: reqId },
        select: { documents: true },
      });
      if (!docReq) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });

      const docs = docReq.documents as { id: string; file_name: string; blob_path: string; mime_type: string; uploaded_at: string }[];
      const doc = docs.find((d) => d.id === docId);
      if (!doc) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found in this request.' } });

      const { downloadBlobStream } = await import('../utils/blob-storage.js');
      const { stream, contentType, contentLength } = await downloadBlobStream(doc.blob_path);
      reply.header('Content-Type', contentType ?? doc.mime_type ?? 'application/octet-stream');
      if (contentLength) reply.header('Content-Length', contentLength);
      reply.header('Content-Disposition', `${dl === '1' ? 'attachment' : 'inline'}; filename="${doc.file_name}"`);
      reply.header('Cache-Control', 'private, max-age=300');
      return reply.send(stream);
    } catch (err) { return handleError(reply, err); }
  });

  // ─── COMPANY: VIEW & RESPOND TO DOCUMENT REQUESTS ────────────────────────
  // GET  /companies/me/document-requests
  // POST /companies/me/document-requests/:reqId/documents  (binary upload)
  // POST /companies/me/document-requests/:reqId/fulfill

  app.get('/companies/me/document-requests', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    const company = await prisma.consultingCompany.findFirst({
      where: { primary_admin_id: req.user.userId },
      select: { id: true },
    });
    if (!company) return reply.status(404).send({ success: false, error: { code: 'COMPANY_NOT_FOUND' } });
    try {
      const requests = await prisma.adminDocumentRequest.findMany({
        where: { company_id: company.id },
        orderBy: { created_at: 'desc' },
      });
      return reply.status(200).send({ success: true, data: requests });
    } catch (err) { return handleError(reply, err); }
  });

  app.post('/companies/me/document-requests/:reqId/documents', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    const { reqId } = req.params as { reqId: string };
    const fileName = req.headers['x-file-name'];
    if (typeof fileName !== 'string' || !fileName) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'X-File-Name header required' } });
    }
    const buffer = req.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'File body required' } });
    }
    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'Max 10 MB' } });
    }
    // Verify request belongs to this company
    const company = await prisma.consultingCompany.findFirst({
      where: { primary_admin_id: req.user.userId },
      select: { id: true },
    });
    const docReq = await prisma.adminDocumentRequest.findFirst({
      where: { id: reqId, company_id: company?.id ?? '', status: 'PENDING' },
    });
    if (!docReq) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });

    const rawCt = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
    const extMap: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const contentType = ['application/pdf','image/jpeg','image/jpg','image/png'].includes(rawCt) ? rawCt : (extMap[ext] ?? 'application/octet-stream');
    const safeFilename = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    const blobPath = `doc-requests/${docReq.company_id}/${reqId}/${Date.now()}-${safeFilename}`;

    try {
      const { uploadToBlob } = await import('../utils/blob-storage.js');
      await uploadToBlob(blobPath, buffer, contentType);
      const existing = (docReq.documents as { id: string; file_name: string; blob_path: string; mime_type: string; uploaded_at: string }[]);
      const newDoc = { id: crypto.randomUUID(), file_name: safeFilename, blob_path: blobPath, mime_type: contentType, uploaded_at: new Date().toISOString() };
      await prisma.adminDocumentRequest.update({
        where: { id: reqId },
        data: { documents: [...existing, newDoc] },
      });
      return reply.status(200).send({ success: true, data: newDoc });
    } catch (err) { return handleError(reply, err); }
  });

  app.post('/companies/me/document-requests/:reqId/fulfill', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    const { reqId } = req.params as { reqId: string };
    const body = req.body as { response_note?: string };
    const company = await prisma.consultingCompany.findFirst({
      where: { primary_admin_id: req.user.userId },
      select: { id: true },
    });
    const docReq = await prisma.adminDocumentRequest.findFirst({
      where: { id: reqId, company_id: company?.id ?? '', status: 'PENDING' },
    });
    if (!docReq) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    const docs = docReq.documents as unknown[];
    if (docs.length === 0) {
      return reply.status(422).send({ success: false, error: { code: 'NO_DOCUMENTS', message: 'Upload at least one document before submitting.' } });
    }
    try {
      const updated = await prisma.adminDocumentRequest.update({
        where: { id: reqId },
        data: { status: 'FULFILLED', fulfilled_at: new Date(), ...(body.response_note ? { response_note: body.response_note } : {}) },
      });
      return reply.status(200).send({ success: true, data: updated });
    } catch (err) { return handleError(reply, err); }
  });

  // ─── AUTHENTICATED: GET PAYOUT PREFERENCE ────────────────────────────────
  // GET /companies/me/payout-preference
  // Returns the company's payout preference with sensitive fields masked.
  app.get('/companies/me/payout-preference', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

    const membership = await prisma.companyMember.findFirst({
      where: { user_id: req.user.userId, status: 'ACTIVE', role: 'COMPANY_ADMIN' },
      select: { company_id: true },
    });
    if (!membership) {
      return reply.status(403).send({
        success: false,
        error: { code: 'INSUFFICIENT_COMPANY_ROLE', message: 'Only Company Admins can view payout preferences.' },
      });
    }

    try {
      const preference = await prisma.companyPayoutPreference.findUnique({
        where: { company_id: membership.company_id },
      });
      if (!preference) {
        return reply.status(200).send({ success: true, data: null });
      }
      // Mask sensitive fields
      const masked = {
        id: preference.id,
        company_id: preference.company_id,
        method: preference.method,
        bank_name: preference.bank_name,
        account_name: preference.account_name,
        bsb: preference.bsb,
        account_number: preference.account_number
          ? `****${preference.account_number.slice(-4)}`
          : null,
        swift_code: preference.swift_code,
        iban: preference.iban ? `****${preference.iban.slice(-4)}` : null,
        bank_address: preference.bank_address,
        stripe_account_id: preference.stripe_account_id
          ? `acct_****${preference.stripe_account_id.slice(-4)}`
          : null,
        updated_at: preference.updated_at,
      };
      return reply.status(200).send({ success: true, data: masked });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── AUTHENTICATED: UPDATE PAYOUT PREFERENCE ─────────────────────────────
  // PATCH /companies/me/payout-preference
  app.patch('/companies/me/payout-preference', { preHandler: [authenticate] }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

    const membership = await prisma.companyMember.findFirst({
      where: { user_id: req.user.userId, status: 'ACTIVE', role: 'COMPANY_ADMIN' },
      select: { company_id: true },
    });
    if (!membership) {
      return reply.status(403).send({
        success: false,
        error: { code: 'INSUFFICIENT_COMPANY_ROLE', message: 'Only Company Admins can update payout preferences.' },
      });
    }

    const body = req.body as CompanyPayoutPreferenceInput;
    if (!body || !body.method) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'method is required.' },
      });
    }

    try {
      const result = await payoutService.updatePayoutPreference(
        membership.company_id,
        req.user.userId,
        body,
      );
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // Suppress unused warning — ROLE_LEVEL is available for future use
  void ROLE_LEVEL;

  // ─── GET /companies/public ────────────────────────────────────────────────
  // No auth required — public listing for browse page

  app.get('/companies/public', async (req, reply) => {
    try {
      const query = req.query as {
        service?: string;
        region?: string;
        search?: string;
        limit?: string;
        offset?: string;
      };
      const limit = Math.min(Number(query.limit ?? 24), 50);
      const offset = Number(query.offset ?? 0);

      const searchFilter = query.search
        ? {
            OR: [
              { company_name: { contains: query.search, mode: 'insensitive' as const } },
              { description: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {};

      const companies = await prisma.consultingCompany.findMany({
        where: { status: 'ACTIVE', ...searchFilter },
        select: {
          id: true,
          company_name: true,
          description: true,
          domains: true,
          state: true,
          overall_rating: true,
          rating_count: true,
          authorization_verified_at: true,
          created_at: true,
          _count: { select: { members: true } },
        },
        take: limit,
        skip: offset,
        orderBy: [{ overall_rating: 'desc' }, { rating_count: 'desc' }],
      });

      const data = companies.map((c) => ({
        id: c.id,
        name: c.company_name,
        description: c.description ?? '',
        domains: c.domains,
        state: c.state ?? '',
        rating_avg: c.overall_rating ? Number(c.overall_rating) : null,
        rating_count: c.rating_count,
        verified: c.authorization_verified_at !== null,
        member_count: c._count.members,
        founded_year: c.created_at.getFullYear(),
      }));

      return reply.status(200).send({ success: true, data });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── COMPANY PAYOUT ACCOUNTS ────────────────────────────────────────────────

  // Helper: require primary admin only
  async function requirePrimaryAdmin(userId: string): Promise<string | null> {
    const co = await prisma.consultingCompany.findFirst({
      where: { primary_admin_id: userId },
      select: { id: true },
    });
    return co?.id ?? null;
  }

  // POST /companies/me/payout-accounts
  app.post('/companies/me/payout-accounts', { preHandler: [authenticate] }, async (req, reply) => {
    const companyId = await requirePrimaryAdmin(req.user!.userId);
    if (!companyId) return reply.status(403).send({ success: false, error: { code: 'NOT_PRIMARY_ADMIN' } });

    const body = req.body as {
      method_type?: string;
      nickname?: string;
      currency?: string;
      bank_name?: string;
      account_holder_name?: string;
      bsb?: string;
      account_number?: string;
      paypal_email?: string;
      wise_email?: string;
      payoneer_email?: string;
      payid_email?: string;
      payid_name?: string;
      swift_bic?: string;
      iban?: string;
      bank_country?: string;
      bank_address?: string;
      correspondent_bank?: string;
      other_platform_name?: string;
      other_account_id?: string;
      other_instructions?: string;
    };

    if (!body.method_type) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'method_type is required' } });
    }

    const existingCount = await prisma.companyPayoutAccount.count({ where: { company_id: companyId } });

    const account = await prisma.companyPayoutAccount.create({
      data: {
        company_id: companyId,
        method_type: body.method_type,
        nickname: body.nickname ?? null,
        currency: body.currency ?? 'AUD',
        bank_name: body.bank_name ?? null,
        account_holder_name: body.account_holder_name ?? null,
        bsb: body.bsb ?? null,
        account_number: null,
        account_number_last4: body.account_number ? body.account_number.slice(-4) : null,
        paypal_email: body.paypal_email ?? null,
        wise_email: body.wise_email ?? null,
        payoneer_email: body.payoneer_email ?? null,
        payid_email: body.payid_email ?? null,
        payid_name: body.payid_name ?? null,
        swift_bic: body.swift_bic ?? null,
        iban: null,
        iban_last4: body.iban ? body.iban.slice(-4) : null,
        bank_country: body.bank_country ?? null,
        bank_address: body.bank_address ?? null,
        correspondent_bank: body.correspondent_bank ?? null,
        other_platform_name: body.other_platform_name ?? null,
        other_account_id: body.other_account_id ?? null,
        other_instructions: body.other_instructions ?? null,
        is_primary: existingCount === 0,
      },
    });

    return reply.status(201).send({ success: true, data: account });
  });

  // DELETE /companies/me/payout-accounts/:id
  app.delete('/companies/me/payout-accounts/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const companyId = await requirePrimaryAdmin(req.user!.userId);
    if (!companyId) return reply.status(403).send({ success: false, error: { code: 'NOT_PRIMARY_ADMIN' } });

    const { id } = req.params as { id: string };
    const account = await prisma.companyPayoutAccount.findFirst({ where: { id, company_id: companyId } });
    if (!account) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });

    await prisma.companyPayoutAccount.delete({ where: { id } });

    // If deleted was primary, promote oldest remaining
    if (account.is_primary) {
      const next = await prisma.companyPayoutAccount.findFirst({
        where: { company_id: companyId },
        orderBy: { created_at: 'asc' },
      });
      if (next) await prisma.companyPayoutAccount.update({ where: { id: next.id }, data: { is_primary: true } });
    }

    return reply.status(200).send({ success: true, data: { message: 'Account removed.' } });
  });

  // PATCH /companies/me/payout-accounts/:id/primary
  app.patch('/companies/me/payout-accounts/:id/primary', { preHandler: [authenticate] }, async (req, reply) => {
    const companyId = await requirePrimaryAdmin(req.user!.userId);
    if (!companyId) return reply.status(403).send({ success: false, error: { code: 'NOT_PRIMARY_ADMIN' } });

    const { id } = req.params as { id: string };
    const account = await prisma.companyPayoutAccount.findFirst({ where: { id, company_id: companyId } });
    if (!account) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });

    await prisma.$transaction([
      prisma.companyPayoutAccount.updateMany({ where: { company_id: companyId }, data: { is_primary: false } }),
      prisma.companyPayoutAccount.update({ where: { id }, data: { is_primary: true } }),
    ]);

    return reply.status(200).send({ success: true, data: { message: 'Primary account updated.' } });
  });

  // POST /companies/me/payout-accounts/:id/documents
  // Binary upload of an AML supporting document for a company payout account.

  app.post('/companies/me/payout-accounts/:id/documents', { preHandler: [authenticate] }, async (req, reply) => {
    const companyId = await requirePrimaryAdmin(req.user!.userId);
    if (!companyId) return reply.status(403).send({ success: false, error: { code: 'NOT_PRIMARY_ADMIN' } });

    const { id } = req.params as { id: string };
    const account = await prisma.companyPayoutAccount.findFirst({
      where: { id, company_id: companyId },
      select: { id: true, aml_documents: true },
    });
    if (!account) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });

    const fileName = req.headers['x-file-name'];
    if (typeof fileName !== 'string' || !fileName) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'X-File-Name header required.' } });
    }
    const rawCt = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
    const extMap: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const ALLOWED = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const ct = ALLOWED.includes(rawCt) ? rawCt : (extMap[ext] ?? rawCt);
    if (!ALLOWED.includes(ct)) {
      return reply.status(415).send({ success: false, error: { code: 'INVALID_FILE_TYPE', message: 'Only PDF, JPG, PNG allowed.' } });
    }
    const buffer = req.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'Body must be file binary.' } });
    }
    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'Max 10 MB.' } });
    }

    const safe = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    const blobPath = `company-payout-docs/${id}/${Date.now()}-${safe}`;
    const { uploadToBlob } = await import('../utils/blob-storage.js');
    await uploadToBlob(blobPath, buffer, ct);

    const existing = (account.aml_documents as unknown[]) ?? [];
    const { randomUUID } = await import('node:crypto');
    const newDoc = {
      id: randomUUID(),
      type: 'AML_PROOF',
      file_name: safe,
      file_size: buffer.length,
      mime_type: ct,
      blob_path: blobPath,
      uploaded_at: new Date().toISOString(),
      verified: false,
    };
    await prisma.companyPayoutAccount.update({
      where: { id },
      data: { aml_documents: [...existing, newDoc] as import('@prisma/client').Prisma.InputJsonValue[] },
    });
    return reply.status(200).send({ success: true, data: newDoc });
  });

  // ─── GET /companies/me/payout-history ─────────────────────────────────────
  // Returns completed payout records for the company, with commission invoice info.

  app.get('/companies/me/payout-history', { preHandler: [authenticate] }, async (req, reply) => {
    const userId = req.user!.userId;
    let companyId: string | null = null;
    const primaryAdminCompany = await prisma.consultingCompany.findFirst({
      where: { primary_admin_id: userId },
      select: { id: true },
    });
    if (primaryAdminCompany) {
      companyId = primaryAdminCompany.id;
    } else {
      const memberRecord = await prisma.companyMember.findFirst({
        where: { user_id: userId, status: 'ACTIVE' },
        select: { company_id: true },
      });
      if (memberRecord) companyId = memberRecord.company_id;
    }
    if (!companyId) {
      return reply.status(403).send({ success: false, error: { code: 'COMPANY_NOT_FOUND' } });
    }
    const company = { id: companyId };
    const records = await prisma.companyPayoutRecord.findMany({
      where: { company_id: company.id },
      orderBy: { created_at: 'desc' },
      take: 50,
      include: {
        order: { select: { id: true, company_invoice: { select: { invoice_number: true, total_aud: true } } } },
        processed_by: { select: { full_name: true } },
      },
    });
    return reply.status(200).send({ success: true, data: { records } });
  });

  // ─── GET /companies/me/payout-history/:id/commission-invoice ─────────────
  // Streams the commission invoice PDF for a payout record owned by this company.

  app.get('/companies/me/payout-history/:id/commission-invoice', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { dl } = req.query as { dl?: string };
    const userId = req.user!.userId;

    let companyId: string | null = null;
    const primaryAdminCompany = await prisma.consultingCompany.findFirst({
      where: { primary_admin_id: userId },
      select: { id: true },
    });
    if (primaryAdminCompany) {
      companyId = primaryAdminCompany.id;
    } else {
      const memberRecord = await prisma.companyMember.findFirst({
        where: { user_id: userId, status: 'ACTIVE' },
        select: { company_id: true },
      });
      if (memberRecord) companyId = memberRecord.company_id;
    }
    if (!companyId) return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
    const company = { id: companyId };

    const record = await prisma.companyPayoutRecord.findFirst({
      where: { id, company_id: company.id },
      select: { commission_invoice_blob_path: true, commission_invoice_number: true },
    });
    if (!record) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    if (!record.commission_invoice_blob_path) {
      return reply.status(404).send({ success: false, error: { code: 'INVOICE_NOT_GENERATED', message: 'Commission invoice not yet available.' } });
    }

    try {
      const { downloadBlobStream } = await import('../utils/blob-storage.js');
      const { stream, contentLength } = await downloadBlobStream(record.commission_invoice_blob_path);
      const name = record.commission_invoice_number ?? 'commission-invoice';
      reply.header('Content-Type', 'application/pdf');
      if (contentLength) reply.header('Content-Length', contentLength);
      reply.header('Content-Disposition', `${dl === '1' ? 'attachment' : 'inline'}; filename="${name}.pdf"`);
      reply.header('Cache-Control', 'private, max-age=300');
      return reply.send(stream);
    } catch (err) {
      const e = err as { status?: number; code?: string; message?: string };
      return reply.status(e.status ?? 500).send({ success: false, error: { code: e.code ?? 'INTERNAL_ERROR', message: e.message } });
    }
  });

  // ─── Company Insurance ────────────────────────────────────────────────────
  // Binary upload + CRUD for InsuranceCertificate records linked to a company.

  // GET /companies/me/insurance — list all certs for this company
  app.get('/companies/me/insurance', { preHandler: [authenticate] }, async (req, reply) => {
    const company = await prisma.consultingCompany.findFirst({
      where: { primary_admin_id: req.user!.userId },
      select: { id: true },
    });
    if (!company) return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });

    const certs = await prisma.insuranceCertificate.findMany({
      where: { company_id: company.id },
      orderBy: { created_at: 'desc' },
    });
    return reply.status(200).send({ success: true, data: { certificates: certs } });
  });

  // POST /companies/me/insurance/upload — raw binary upload → returns blob_path
  app.post('/companies/me/insurance/upload', { preHandler: [authenticate] }, async (req, reply) => {
    const fileName = req.headers['x-file-name'];
    if (typeof fileName !== 'string' || !fileName) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_HEADER', message: 'X-File-Name header required.' } });
    }
    const buffer = req.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'Body must be file binary data.' } });
    }
    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'File must be under 10 MB.' } });
    }
    const safe = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    const blobPath = `company-insurance/${req.user!.userId}/${Date.now()}/${safe}`;
    const { uploadToBlob } = await import('../utils/blob-storage.js');
    await uploadToBlob(blobPath, buffer, 'application/pdf');
    return reply.status(200).send({ success: true, data: { blob_path: blobPath, file_name: safe } });
  });

  // POST /companies/me/insurance — create certificate record
  app.post('/companies/me/insurance', { preHandler: [authenticate] }, async (req, reply) => {
    const company = await prisma.consultingCompany.findFirst({
      where: { primary_admin_id: req.user!.userId },
      select: { id: true },
    });
    if (!company) return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });

    const body = req.body as {
      insurer_name?: string;
      policy_number?: string;
      insurance_type?: string;
      coverage_amount_aud?: number;
      policy_start_date?: string;
      policy_expiry_date?: string;
      worldwide_coverage?: boolean;
      certificate_blob_path?: string;
    };

    const required = ['insurer_name', 'policy_number', 'insurance_type', 'coverage_amount_aud', 'policy_start_date', 'policy_expiry_date', 'certificate_blob_path'];
    for (const f of required) {
      if (!body[f as keyof typeof body]) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: `${f} is required.` } });
      }
    }

    const VALID_TYPES = ['PI', 'PL', 'CYBER'];
    if (!VALID_TYPES.includes(body.insurance_type!)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_TYPE', message: 'Invalid insurance_type. Must be PI, PL, or CYBER.' } });
    }

    const cert = await prisma.insuranceCertificate.create({
      data: {
        company_id: company.id,
        insurer_name: body.insurer_name!,
        policy_number: body.policy_number!,
        insurance_type: body.insurance_type! as import('@prisma/client').InsuranceType,
        coverage_amount_aud: body.coverage_amount_aud!,
        policy_start_date: new Date(body.policy_start_date!),
        policy_expiry_date: new Date(body.policy_expiry_date!),
        worldwide_coverage: body.worldwide_coverage ?? false,
        tier: 'STANDARD',
        certificate_blob_path: body.certificate_blob_path!,
        status: 'PENDING_REVIEW',
      },
    });

    return reply.status(201).send({ success: true, data: cert });
  });

  // GET /companies/me/insurance/:id/document — stream certificate PDF
  app.get('/companies/me/insurance/:id/document', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { dl } = req.query as { dl?: string };

    const company = await prisma.consultingCompany.findFirst({
      where: { primary_admin_id: req.user!.userId },
      select: { id: true },
    });
    if (!company) return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });

    const cert = await prisma.insuranceCertificate.findFirst({
      where: { id, company_id: company.id },
      select: { certificate_blob_path: true, policy_number: true },
    });
    if (!cert) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });

    const { downloadBlobStream } = await import('../utils/blob-storage.js');
    const { stream, contentType, contentLength } = await downloadBlobStream(cert.certificate_blob_path);
    reply.header('Content-Type', contentType ?? 'application/pdf');
    if (contentLength) reply.header('Content-Length', contentLength);
    reply.header('Content-Disposition', `${dl === '1' ? 'attachment' : 'inline'}; filename="insurance-${cert.policy_number}.pdf"`);
    reply.header('Cache-Control', 'private, max-age=300');
    return reply.send(stream);
  });

  // DELETE /companies/me/insurance/:id — remove a certificate
  app.delete('/companies/me/insurance/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const company = await prisma.consultingCompany.findFirst({
      where: { primary_admin_id: req.user!.userId },
      select: { id: true },
    });
    if (!company) return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });

    const cert = await prisma.insuranceCertificate.findFirst({
      where: { id, company_id: company.id },
    });
    if (!cert) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });

    // Only allow deletion of PENDING_REVIEW or REJECTED certs
    if (!['PENDING_REVIEW', 'REJECTED'].includes(cert.status)) {
      return reply.status(409).send({ success: false, error: { code: 'CANNOT_DELETE', message: 'Only pending or rejected certificates can be removed.' } });
    }

    await prisma.insuranceCertificate.delete({ where: { id } });
    return reply.status(200).send({ success: true, data: { message: 'Certificate removed.' } });
  });
}
