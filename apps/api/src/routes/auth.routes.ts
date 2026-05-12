import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyFileSignature } from '../utils/file-signature.js';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  totpCodeSchema,
  mfaValidateSchema,
} from '@onys/shared';
import type { AuthService } from '../services/auth.service.js';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { lookupAbn } from '../services/abr.service.js';
import { writeAudit } from '../utils/audit.js';

// Fields on User that are populated from the ABR. Once abn_verified=true,
// only the ABR re-fetch (triggered by changing the ABN) may rewrite them.
// PLATFORM_ADMIN and COMPLIANCE_ADMIN can still override these values via
// the admin endpoints — this lock applies only to the user-facing PATCH
// /auth/me/billing route.
const USER_ABR_DERIVED_FIELDS = [
  'legal_name',
  'legal_entity_name',
  'gst_registered',
  'entity_type',
  'acn',
] as const;
type UserAbrDerivedField = (typeof USER_ABR_DERIVED_FIELDS)[number];

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


export async function authRoutes(
  app: FastifyInstance,
  opts: { authService: AuthService; prisma: PrismaClient },
) {
  const { authService, prisma } = opts;

  // Binary body parsers for compliance document uploads (PDF, JPG, PNG)
  const binaryParser = (_req: import('fastify').FastifyRequest, body: Buffer, done: (err: null, body: Buffer) => void) => done(null, body);
  for (const ct of ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']) {
    app.addContentTypeParser(ct, { parseAs: 'buffer' }, binaryParser);
  }

  // ─── REGISTER ──────────────────────────────────────────────────────────────

  app.post('/auth/register', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
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
      const result = await authService.register(parsed.data, extractMeta(req));
      return reply.status(201).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── LOGIN ─────────────────────────────────────────────────────────────────
  // Per-IP credential-stuffing throttle — 10 attempts per 15 min. This sits on
  // top of the per-user failed-login lockout in auth.service (10 fails → 15 min
  // user lock); together they cover both spray-across-many-users and
  // brute-force-one-user attack shapes.

  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
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
      const result = await authService.login(parsed.data, extractMeta(req));
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── VERIFY OTP ────────────────────────────────────────────────────────────

  app.post('/auth/verify-otp', async (req, reply) => {
    const body = req.body as { challenge_token?: string; otp_code?: string };
    if (!body.challenge_token || !body.otp_code) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'challenge_token and otp_code are required.' },
      });
    }
    if (!/^\d{6}$/.test(body.otp_code.trim())) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_OTP_FORMAT', message: 'OTP must be exactly 6 digits.' },
      });
    }
    try {
      const result = await authService.verifyOtp(body.challenge_token, body.otp_code.trim(), extractMeta(req));
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      const e = err as { status?: number; code?: string; message?: string; attempts_remaining?: number };
      const status = e.status ?? 500;
      const error: Record<string, unknown> = {
        code: e.code ?? 'INTERNAL_ERROR',
        message: e.message ?? 'An unexpected error occurred',
      };
      if (e.attempts_remaining !== undefined) error.attempts_remaining = e.attempts_remaining;
      return reply.status(status).send({ success: false, error });
    }
  });

  // ─── RESEND OTP ────────────────────────────────────────────────────────────
  // Tighter cap than the auth-scope default. Service-layer OTP rate-limit (3
  // per 15 min per user) still applies on top — this guards the unauthenticated
  // surface against challenge-token spraying.

  app.post('/auth/resend-otp', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const body = req.body as { challenge_token?: string };
    if (!body.challenge_token) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'challenge_token is required.' },
      });
    }
    try {
      const result = await authService.resendOtp(body.challenge_token, extractMeta(req));
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── REFRESH TOKEN ─────────────────────────────────────────────────────────

  app.post('/auth/refresh', async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed' },
      });
    }
    try {
      const result = await authService.refreshToken(
        parsed.data.refresh_token,
        extractMeta(req),
      );
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── LOGOUT ────────────────────────────────────────────────────────────────

  app.post(
    '/auth/logout',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const parsed = refreshSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'refresh_token required' },
        });
      }
      await authService.logout(parsed.data.refresh_token);
      return reply.status(204).send();
    },
  );

  // ─── VERIFY EMAIL ──────────────────────────────────────────────────────────
  // Token is taken from the request body, not the URL path, so it doesn't
  // appear in HTTP access logs, browser history, or the Referer header.
  // The legacy GET-with-token route is kept temporarily to avoid breaking
  // emails already in flight, but logs a warning so we can remove it later.

  app.post('/auth/verify-email', async (req, reply) => {
    const body = req.body as { token?: unknown };
    const token = typeof body.token === 'string' ? body.token : '';
    if (!token || token === 'undefined' || token === 'null') {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid verification token.' } });
    }
    try {
      const user = await authService.verifyEmail(token);
      return reply.status(200).send({ success: true, data: { message: 'Email verified.', email: user.email } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // Legacy: GET /auth/verify-email/:token. Kept for ~24h while in-flight emails
  // drain. Frontend pages now POST to the route above.
  app.get('/auth/verify-email/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    req.log.warn({ msg: 'legacy verify-email GET hit', token_prefix: token.slice(0, 8) });
    if (!token || token === 'undefined' || token === 'null') {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid verification token.' } });
    }
    try {
      const user = await authService.verifyEmail(token);
      return reply.status(200).send({ success: true, data: { message: 'Email verified.', email: user.email } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── RESEND VERIFICATION EMAIL ────────────────────────────────────────────

  app.post('/auth/resend-verification', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    // Optional auth — if the user has a valid access token, use their userId.
    // Otherwise fall back to email in the request body.
    let userId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const payload = verifyAccessToken(authHeader.slice(7));
      if (payload) userId = payload.userId;
    }

    const body = req.body as { email?: string };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;

    if (!userId && !email) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'Provide email or authenticate.' },
      });
    }

    // Always 200 — prevents enumeration of verified/unregistered addresses
    try {
      await authService.resendVerificationEmail(userId, email);
    } catch { /* silent */ }

    return reply.status(200).send({
      success: true,
      data: { message: 'If that email is unverified, a new link has been sent.' },
    });
  });

  // ─── FORGOT PASSWORD ───────────────────────────────────────────────────────
  // Tighter rate limit than the auth-scope default — forgot-password is a
  // prime target for email enumeration and reset-link spam.

  app.post('/auth/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    // Always respond 200 regardless of validation or service result
    if (parsed.success) {
      try {
        await authService.forgotPassword(parsed.data.email);
      } catch {
        // Silently swallow — never expose whether the email exists
      }
    }
    return reply.status(200).send({
      success: true,
      data: { message: 'If that email exists, a reset link has been sent.' },
    });
  });

  // ─── RESET PASSWORD ────────────────────────────────────────────────────────
  // Token in body, not URL path — same reasoning as verify-email above.

  app.post('/auth/reset-password', async (req, reply) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
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
      await authService.resetPassword(parsed.data.token, parsed.data.password);
      return reply.status(200).send({
        success: true,
        data: { message: 'Password updated. Please log in again.' },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // Legacy: token in URL path. Kept briefly for in-flight reset emails;
  // the frontend now POSTs to the route above.
  app.post('/auth/reset-password/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    req.log.warn({ msg: 'legacy reset-password POST hit', token_prefix: token.slice(0, 8) });
    const parsed = resetPasswordSchema.omit({ token: true }).safeParse(req.body);
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
      await authService.resetPassword(token, parsed.data.password);
      return reply.status(200).send({
        success: true,
        data: { message: 'Password updated. Please log in again.' },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── MFA SETUP ─────────────────────────────────────────────────────────────

  app.post('/auth/mfa/setup', { preHandler: [authenticate] }, async (req, reply) => {
    try {
      const result = await authService.setupMfa(req.user!.userId);
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── MFA VERIFY SETUP ──────────────────────────────────────────────────────

  app.post('/auth/mfa/verify', { preHandler: [authenticate] }, async (req, reply) => {
    const parsed = totpCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'totp_code must be 6 digits' },
      });
    }
    try {
      await authService.verifyMfaSetup(req.user!.userId, parsed.data.totp_code);
      return reply.status(200).send({ success: true, data: { message: 'MFA enabled' } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── MFA VALIDATE (login step 2) ───────────────────────────────────────────

  app.post('/auth/mfa/validate', async (req, reply) => {
    const parsed = mfaValidateSchema.safeParse(req.body);
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
      const result = await authService.validateMfa(
        parsed.data.mfa_token,
        parsed.data.totp_code,
        extractMeta(req),
      );
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── CHANGE PASSWORD (authenticated, clears must_change_password) ─────────

  app.patch('/auth/change-password', { preHandler: [authenticate] }, async (req, reply) => {
    const body = req.body as { current_password?: string; new_password?: string };
    if (!body.current_password || !body.new_password || body.new_password.length < 12) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'current_password and new_password (min 12 chars) are required.',
        },
      });
    }
    try {
      await authService.changePassword(
        req.user!.userId,
        body.current_password,
        body.new_password,
      );
      return reply.status(200).send({ success: true, data: { message: 'Password changed.' } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── MFA DISABLE ───────────────────────────────────────────────────────────

  app.post('/auth/mfa/disable', { preHandler: [authenticate] }, async (req, reply) => {
    const parsed = totpCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'totp_code must be 6 digits' },
      });
    }
    try {
      await authService.disableMfa(req.user!.userId, parsed.data.totp_code);
      return reply.status(200).send({ success: true, data: { message: 'MFA disabled' } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /auth/me ──────────────────────────────────────────────────────────

  app.get('/auth/me', { preHandler: [authenticate] }, async (req, reply) => {
    try {
      const user = await authService.getMe(req.user!.userId);
      return reply.status(200).send({ success: true, data: user });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PATCH /auth/me ────────────────────────────────────────────────────────

  app.patch('/auth/me', { preHandler: [authenticate] }, async (req, reply) => {
    const body = req.body as { full_name?: string };
    if (!body.full_name || body.full_name.trim().length < 2) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'full_name must be at least 2 characters.' },
      });
    }
    try {
      const updated = await authService.updateMe(req.user!.userId, { full_name: body.full_name.trim() });
      return reply.status(200).send({ success: true, data: updated });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PATCH /auth/me/billing ───────────────────────────────────────────────

  app.patch('/auth/me/billing', { preHandler: [authenticate] }, async (req, reply) => {
    const body = req.body as {
      legal_entity_name?: unknown;
      trading_name?: unknown;
      billing_email?: unknown;
      billing_phone?: unknown;
      website?: unknown;
      billing_address_1?: unknown;
      billing_address_2?: unknown;
      billing_city?: unknown;
      billing_state?: unknown;
      billing_postcode?: unknown;
      billing_country?: unknown;
      entity_type?: unknown;
      abn?: unknown;
      acn?: unknown;
      gst_registered?: unknown;
      anzsic_code?: unknown;
      vat_number?: unknown;
      tax_residency_country?: unknown;
      is_foreign_entity?: unknown;
      business_registrations?: unknown;
      customer_terms_signed?: unknown;
      // legacy
      legal_name?: unknown;
    };

    const str = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim() || undefined : undefined);
    const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

    const legalEntityName = str(body.legal_entity_name);
    const legalName = str(body.legal_name);
    const tradingName = str(body.trading_name);
    const billingEmailRaw = str(body.billing_email);
    const billingEmail = billingEmailRaw !== undefined ? billingEmailRaw.toLowerCase() : undefined;
    const billingPhone = str(body.billing_phone);
    const website = str(body.website);
    const billingAddress1 = str(body.billing_address_1);
    const billingAddress2 = str(body.billing_address_2);
    const billingCity = str(body.billing_city);
    const billingState = str(body.billing_state);
    const billingPostcode = str(body.billing_postcode);
    const billingCountry = str(body.billing_country);
    const entityType = str(body.entity_type);
    const abnRaw = str(body.abn);
    const abnClean = abnRaw !== undefined ? abnRaw.replace(/\s/g, '') : undefined;
    const acnRaw = str(body.acn);
    const acnClean = acnRaw !== undefined ? acnRaw.replace(/\s/g, '') : undefined;
    const gstRegistered = bool(body.gst_registered);
    const anzsicCode = str(body.anzsic_code);
    const vatNumber = str(body.vat_number);
    const taxResidencyCountry = str(body.tax_residency_country);
    const isForeignEntity = bool(body.is_foreign_entity);
    const customerTermsSigned = bool(body.customer_terms_signed);

    // Load current state — needed for the ABN-change detection, the derived-
    // field lock, and the AU-customer ABN-required check.
    const current = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.userId },
      select: {
        account_type: true,
        abn: true,
        abn_verified: true,
        billing_country: true,
        tax_residency_country: true,
      },
    });
    const isPrivilegedAdmin = ['PLATFORM_ADMIN', 'COMPLIANCE_ADMIN'].includes(req.user!.accountType);

    // Build the patch we'll apply, starting with the user-supplied values.
    type BillingPatch = Parameters<typeof authService.updateBilling>[1];
    const patch: BillingPatch = {
      ...(legalEntityName !== undefined ? { legal_entity_name: legalEntityName } : {}),
      ...(legalName !== undefined ? { legal_name: legalName } : {}),
      ...(tradingName !== undefined ? { trading_name: tradingName } : {}),
      ...(billingEmail !== undefined ? { billing_email: billingEmail } : {}),
      ...(billingPhone !== undefined ? { billing_phone: billingPhone } : {}),
      ...(website !== undefined ? { website } : {}),
      ...(billingAddress1 !== undefined ? { billing_address_1: billingAddress1 } : {}),
      ...(billingAddress2 !== undefined ? { billing_address_2: billingAddress2 } : {}),
      ...(billingCity !== undefined ? { billing_city: billingCity } : {}),
      ...(billingState !== undefined ? { billing_state: billingState } : {}),
      ...(billingPostcode !== undefined ? { billing_postcode: billingPostcode } : {}),
      ...(billingCountry !== undefined ? { billing_country: billingCountry } : {}),
      ...(entityType !== undefined ? { entity_type: entityType } : {}),
      ...(abnClean !== undefined ? { abn: abnClean } : {}),
      ...(acnClean !== undefined ? { acn: acnClean } : {}),
      ...(gstRegistered !== undefined ? { gst_registered: gstRegistered } : {}),
      ...(anzsicCode !== undefined ? { anzsic_code: anzsicCode } : {}),
      ...(vatNumber !== undefined ? { vat_number: vatNumber } : {}),
      ...(taxResidencyCountry !== undefined ? { tax_residency_country: taxResidencyCountry } : {}),
      ...(isForeignEntity !== undefined ? { is_foreign_entity: isForeignEntity } : {}),
      ...(Array.isArray(body.business_registrations) ? { business_registrations: body.business_registrations } : {}),
      ...(customerTermsSigned !== undefined ? { customer_terms_signed: customerTermsSigned } : {}),
    };

    // ABN handling — three paths:
    //   (a) ABN supplied AND different from stored → re-verify, overwrite derived
    //       fields from ABR, refuse user-supplied values for the derived fields
    //   (b) ABN supplied AND same as stored → no re-fetch; lock derived fields
    //   (c) ABN not supplied → lock derived fields if currently verified
    const abnChanged = abnClean !== undefined && abnClean !== (current.abn ?? '');
    if (abnChanged) {
      try {
        const result = await lookupAbn(abnClean!);
        // Overwrite derived fields with ABR truth, regardless of what the
        // client posted. This is the auto-fetch the spec calls for.
        patch.abn = result.abn;
        if (result.entity_name) {
          patch.legal_name = result.entity_name;
          patch.legal_entity_name = result.entity_name;
        }
        patch.gst_registered = result.gst_registered;
        if (result.entity_type_name) patch.entity_type = result.entity_type_name;
        if (result.acn) patch.acn = result.acn;

        // Apply the verification stamps directly on the patch via a sidecar
        // write (the existing updateBilling helper doesn't expose them).
        await prisma.user.update({
          where: { id: req.user!.userId },
          data: {
            abn_verified: true,
            abn_verified_at: new Date(),
            abn_verified_name: result.entity_name,
            gst_registered_verified: true,
          },
        });
        await writeAudit(prisma, {
          actorId: req.user!.userId,
          actionType: 'ABN_VERIFIED',
          entityType: 'User',
          entityId: req.user!.userId,
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
      // ABN unchanged + currently verified + not admin → derived fields locked.
      const attempted: UserAbrDerivedField[] = [];
      const incomingByField: Record<UserAbrDerivedField, unknown> = {
        legal_name: legalName,
        legal_entity_name: legalEntityName,
        gst_registered: gstRegistered,
        entity_type: entityType,
        acn: acnClean,
      };
      for (const f of USER_ABR_DERIVED_FIELDS) {
        if (incomingByField[f] !== undefined) attempted.push(f);
      }
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
      // Admin override — log it so the override is traceable.
      const attempted: UserAbrDerivedField[] = [];
      const incomingByField: Record<UserAbrDerivedField, unknown> = {
        legal_name: legalName,
        legal_entity_name: legalEntityName,
        gst_registered: gstRegistered,
        entity_type: entityType,
        acn: acnClean,
      };
      for (const f of USER_ABR_DERIVED_FIELDS) {
        if (incomingByField[f] !== undefined) attempted.push(f);
      }
      if (attempted.length > 0) {
        await writeAudit(prisma, {
          actorId: req.user!.userId,
          actionType: 'ABR_OVERRIDE',
          entityType: 'User',
          entityId: req.user!.userId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? 'unknown',
          metadata: { fields: attempted },
        });
      }
    }

    // AU-customer ABN requirement. The constraint is "any customer in
    // Australia must have an ABN" — applied at save time so existing
    // customers without an ABN are prompted on their next billing edit
    // rather than being locked out entirely.
    // ABN is required only when the customer is being billed in Australia.
    // Previously this OR'd billing_country with tax_residency_country, which
    // produced false positives during partial section saves: a user with
    // legacy default tax_residency='AU' couldn't change billing_country to
    // a non-AU value because the OR still resolved to "AU" via the stored
    // tax residency, and the API demanded an ABN they shouldn't need.
    //
    // The relevant signal for an ABN is where invoices are addressed —
    // i.e. billing country. Tax residency in AU but billing elsewhere is
    // unusual and doesn't trigger the ABN requirement.
    const finalCountry = billingCountry ?? current.billing_country ?? null;
    const finalAbn = abnClean ?? current.abn ?? null;
    if (
      current.account_type === 'CUSTOMER' &&
      finalCountry === 'AU' &&
      (!finalAbn || finalAbn === '')
    ) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'ABN_REQUIRED_AU_CUSTOMER',
          message: 'Australian customers must provide a valid, verified ABN before saving billing details.',
          fields: ['abn'],
        },
      });
    }

    try {
      await authService.updateBilling(req.user!.userId, patch);
      return reply.status(200).send({ success: true, data: { message: 'Billing details updated.' } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /auth/me/abn-verify ─────────────────────────────────────────────
  // Verifies the supplied ABN against the ABR, writes the normalised payload
  // back to the User row, and locks the derived fields (legal_name, GST flag,
  // entity_type, acn) until the ABN is changed again. Audited.

  app.post('/auth/me/abn-verify', { preHandler: [authenticate] }, async (req, reply) => {
    const body = req.body as { abn?: unknown };
    const abnRaw = typeof body.abn === 'string' ? body.abn : '';
    if (!abnRaw) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_ABN', message: 'abn is required in request body.' } });
    }
    const abn = abnRaw.replace(/\s/g, '');

    try {
      const result = await lookupAbn(abn);

      const updated = await prisma.user.update({
        where: { id: req.user!.userId },
        data: {
          abn: result.abn,
          abn_verified: true,
          abn_verified_at: new Date(),
          abn_verified_name: result.entity_name,
          legal_name: result.entity_name,
          legal_entity_name: result.entity_name,
          gst_registered: result.gst_registered,
          gst_registered_verified: true,
          entity_type: result.entity_type_name,
          ...(result.acn ? { acn: result.acn } : {}),
        },
        select: {
          abn: true, abn_verified: true, abn_verified_at: true, abn_verified_name: true,
          legal_name: true, legal_entity_name: true, gst_registered: true,
          entity_type: true, acn: true,
        },
      });

      await writeAudit(prisma, {
        actorId: req.user!.userId,
        actionType: 'ABN_VERIFIED',
        entityType: 'User',
        entityId: req.user!.userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? 'unknown',
        metadata: {
          abn: result.abn,
          entity_name: result.entity_name,
          entity_type_code: result.entity_type_code,
          gst_registered: result.gst_registered,
        },
      });

      return reply.status(200).send({
        success: true,
        data: {
          ...updated,
          // Mirror the ABR result for the UI to render badges
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

  // Legacy GET for in-flight clients that still call the old endpoint. Wraps
  // the new service so behaviour stays consistent. Logs a warning so the
  // route can be removed once nothing hits it.
  app.get('/auth/me/verify-abn', { preHandler: [authenticate] }, async (req, reply) => {
    req.log.warn({ msg: 'legacy GET /auth/me/verify-abn hit — use POST /auth/me/abn-verify' });
    const query = req.query as { abn?: string };
    const abn = (query.abn ?? '').replace(/\s/g, '');
    if (!abn) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_ABN', message: 'abn query param required.' } });
    }
    try {
      const result = await lookupAbn(abn);
      await prisma.user.update({
        where: { id: req.user!.userId },
        data: {
          abn: result.abn,
          abn_verified: true,
          abn_verified_at: new Date(),
          abn_verified_name: result.entity_name,
          legal_name: result.entity_name,
          legal_entity_name: result.entity_name,
          gst_registered: result.gst_registered,
          gst_registered_verified: true,
          entity_type: result.entity_type_name,
          ...(result.acn ? { acn: result.acn } : {}),
        },
      });
      return reply.status(200).send({
        success: true,
        data: {
          abn: result.abn,
          verified: true,
          entity_name: result.entity_name,
          entity_type: result.entity_type_name,
          gst_active: result.gst_registered,
          state: result.address_state,
          postcode: result.address_postcode,
        },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── POST /auth/me/documents ──────────────────────────────────────────────
  // Raw binary upload (same pattern as /contractor/insurance/upload).
  // Client sends file bytes as body with Content-Type and X-File-Name headers.

  app.post('/auth/me/documents', { preHandler: [authenticate] }, async (req, reply) => {
    const query = req.query as { doc_type?: string };
    const ALLOWED_TYPES = ['BUSINESS_REGISTRATION', 'BOARD_RESOLUTION', 'TAX_CERTIFICATE', 'TAX_DOCUMENT', 'OTHER'];
    if (!query.doc_type || !ALLOWED_TYPES.includes(query.doc_type)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_DOC_TYPE', message: 'doc_type query param required: BUSINESS_REGISTRATION | BOARD_RESOLUTION | TAX_CERTIFICATE | TAX_DOCUMENT | OTHER.' } });
    }

    const fileName = req.headers['x-file-name'];
    if (typeof fileName !== 'string' || !fileName) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'X-File-Name header is required.' } });
    }

    const rawContentType = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
    // Fall back to extension-based detection when browser sends application/octet-stream or nothing
    const extMimeMap: Record<string, string> = {
      pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    };
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const contentType = ALLOWED_MIME.includes(rawContentType)
      ? rawContentType
      : (extMimeMap[ext] ?? rawContentType);
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
    // Magic-byte verification: a malicious uploader can claim Content-Type:
    // application/pdf and post HTML/SVG bytes. Reject the upload if the
    // actual file signature doesn't match the claimed MIME.
    if (!verifyFileSignature(buffer, contentType)) {
      return reply.status(415).send({ success: false, error: { code: 'CONTENT_TYPE_MISMATCH', message: 'File content does not match its declared type.' } });
    }

    const safeFilename = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    const blobPath = `compliance-docs/${req.user!.userId}/${query.doc_type}/${Date.now()}-${safeFilename}`;

    try {
      const { uploadToBlob } = await import('../utils/blob-storage.js');
      await uploadToBlob(blobPath, buffer, contentType);
    } catch (err) {
      return handleError(reply, err);
    }

    try {
      // prisma is injected via opts — no req.server lookup needed
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user!.userId },
        select: { compliance_documents: true },
      });
      const existing = (user.compliance_documents as unknown[]) ?? [];
      const filtered = (existing as { type?: string }[]).filter((d) => d.type !== query.doc_type);
      const newDoc = {
        id: crypto.randomUUID(),
        type: query.doc_type,
        file_name: safeFilename,
        file_size: buffer.length,
        mime_type: contentType,
        blob_path: blobPath,
        uploaded_at: new Date().toISOString(),
        verified: false,
        verified_at: null,
      };
      await prisma.user.update({
        where: { id: req.user!.userId },
        data: { compliance_documents: [...filtered, newDoc] },
      });
      return reply.status(200).send({ success: true, data: newDoc });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /auth/me/documents/:docId/download ───────────────────────────────
  // Stream blob through API — no SAS URL exposed to browser.

  app.get('/auth/me/documents/:docId/download', { preHandler: [authenticate] }, async (req, reply) => {
    const { docId } = req.params as { docId: string };
    const { dl } = req.query as { dl?: string };
    try {
      // prisma is injected via opts — no req.server lookup needed
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user!.userId },
        select: { compliance_documents: true },
      });
      const docs = (user.compliance_documents as { id?: string; blob_path?: string; file_name?: string; mime_type?: string }[]) ?? [];
      const doc = docs.find((d) => d.id === docId);
      if (!doc?.blob_path) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found.' } });
      }
      const { downloadBlobStream } = await import('../utils/blob-storage.js');
      const { stream, contentType, contentLength } = await downloadBlobStream(doc.blob_path);
      // Force attachment download to prevent the browser from rendering
      // user-uploaded content inline (HTML/SVG would otherwise execute as
      // first-party script in our origin). PDFs and images can still be
      // viewed inline only when explicitly opted in via ?inline=1, and we
      // pin the Content-Type to a safe set in that case.
      const SAFE_INLINE_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      const resolvedType = contentType ?? doc.mime_type ?? 'application/octet-stream';
      reply.header('Content-Type', resolvedType);
      if (contentLength) reply.header('Content-Length', contentLength);
      reply.header('X-Content-Type-Options', 'nosniff');
      const wantInline = dl !== '1' && SAFE_INLINE_MIME.includes(resolvedType);
      const disposition = wantInline ? 'inline' : 'attachment';
      reply.header('Content-Disposition', `${disposition}; filename="${doc.file_name ?? 'document'}"`);
      reply.header('Cache-Control', 'private, max-age=300');
      return reply.send(stream);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── DELETE /auth/me/documents/:docId ─────────────────────────────────────

  app.delete('/auth/me/documents/:docId', { preHandler: [authenticate] }, async (req, reply) => {
    const { docId } = req.params as { docId: string };
    try {
      // prisma is injected via opts — no req.server lookup needed
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user!.userId },
        select: { compliance_documents: true },
      });
      const docs = (user.compliance_documents as { id?: string }[]) ?? [];
      await prisma.user.update({
        where: { id: req.user!.userId },
        data: { compliance_documents: docs.filter((d) => d.id !== docId) },
      });
      return reply.status(200).send({ success: true, data: { message: 'Document removed.' } });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── PATCH /auth/me/theme ──────────────────────────────────────────────────

  app.patch('/auth/me/theme', { preHandler: [authenticate] }, async (req, reply) => {
    const body = req.body as { theme?: string };
    if (!body.theme || !['dark', 'light', 'system'].includes(body.theme)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'theme must be dark, light, or system.' },
      });
    }
    try {
      await authService.updateTheme(req.user!.userId, body.theme);
      return reply.status(200).send({ success: true, data: { theme: body.theme } });
    } catch (err) {
      return handleError(reply, err);
    }
  });
}
