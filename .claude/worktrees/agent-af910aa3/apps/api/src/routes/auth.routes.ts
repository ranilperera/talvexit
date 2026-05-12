import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
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
import { authenticate } from '../middleware/authenticate.js';

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
  opts: { authService: AuthService },
) {
  const { authService } = opts;

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

  app.post('/auth/login', async (req, reply) => {
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

  app.get('/auth/verify-email/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    try {
      await authService.verifyEmail(token);
      return reply.redirect('http://localhost:3000/login?verified=true');
    } catch {
      return reply.redirect('http://localhost:3000/login?error=invalid_token');
    }
  });

  // ─── FORGOT PASSWORD ───────────────────────────────────────────────────────

  app.post('/auth/forgot-password', async (req, reply) => {
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

  app.post('/auth/reset-password/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
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
}
