import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Queue } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/admin-guards.js';
import { writeAudit } from '../utils/audit.js';

// Payloads handled by apps/workers/src/jobs/email.worker.ts. Three job types:
//   - contact-enquiry-admin → notify CONTACT_ADMIN_EMAIL of a new submission
//   - contact-enquiry-ack   → acknowledge the submitter ("we got your message")
//   - contact-enquiry-response → admin's reply, sent to the submitter
type ContactJobPayload =
  | {
      type: 'contact-enquiry-admin';
      to: string;
      enquiry_id: string;
      name: string;
      email: string;
      phone: string | null;
      enquiry_type: string;
      message: string;
      ip_address: string;
      admin_url: string;
    }
  | {
      type: 'contact-enquiry-ack';
      to: string;
      name: string;
      enquiry_type: string;
      message: string;
    }
  | {
      type: 'contact-enquiry-response';
      to: string;
      name: string;
      subject: string;
      body: string;
      admin_name: string;
    };

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  const status = e.status ?? 500;
  const code = e.code ?? 'INTERNAL_ERROR';
  const message = e.message ?? 'An unexpected error occurred';
  return reply.status(status).send({ success: false, error: { code, message } });
}

const ALLOWED_ENQUIRY_TYPES = [
  'Enterprise / buyer enquiry',
  'Join as an engineer',
  'Register a company',
  'Partnership or integration',
  'Press or media',
  'Technical support',
  'Other',
];

const ALLOWED_STATUSES = ['NEW', 'IN_PROGRESS', 'RESPONDED', 'CLOSED', 'SPAM'] as const;
type EnquiryStatus = (typeof ALLOWED_STATUSES)[number];

// Light phone validation — accepts international formats, digits + common
// separators, 7-20 characters. Real validation is a hard problem; this
// catches typos without rejecting valid edge cases.
const PHONE_RE = /^[+()\-\s\d.]{7,20}$/;

function extractMeta(req: FastifyRequest) {
  return {
    ip: req.ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : 'unknown',
  };
}

function buildFrontendUrl(path: string): string {
  const base = (process.env.FRONTEND_URL ?? process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function contactRoutes(
  app: FastifyInstance,
  opts: { emailQueue: Queue<ContactJobPayload>; prisma: PrismaClient },
) {
  const { emailQueue, prisma } = opts;

  // ─── POST /contact — public submission ─────────────────────────────────────
  // Persists first, then fires the two email jobs. Either email failing does
  // NOT roll back the DB row — admin can still see the submission in the
  // admin UI even if delivery had a problem.

  app.post('/contact', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const body = req.body as {
      name?: unknown;
      email?: unknown;
      phone?: unknown;
      enquiry_type?: unknown;
      message?: unknown;
    };

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : '';
    const enquiry_type = typeof body.enquiry_type === 'string' ? body.enquiry_type.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!name || name.length < 2) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'name must be at least 2 characters' },
      });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Valid email address is required' },
      });
    }
    if (phoneRaw && !PHONE_RE.test(phoneRaw)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Phone number format looks invalid. Include country code if outside Australia.' },
      });
    }
    if (!ALLOWED_ENQUIRY_TYPES.includes(enquiry_type)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid enquiry_type' },
      });
    }
    if (!message || message.length < 10) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'message must be at least 10 characters' },
      });
    }
    if (message.length > 5000) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'message must not exceed 5000 characters' },
      });
    }

    const meta = extractMeta(req);
    const phone = phoneRaw || null;

    try {
      const enquiry = await prisma.contactEnquiry.create({
        data: {
          name, email, phone, enquiry_type, message,
          ip_address: meta.ip,
          user_agent: meta.userAgent,
          status: 'NEW',
        },
      });

      const adminEmail =
        process.env.CONTACT_ADMIN_EMAIL ??
        process.env.EMAIL_FROM ??
        'admin@wavefuldigital.com.au';

      // Fire-and-forget queue both jobs. If queueing throws we still log
      // the enquiry in the DB so admin can manually follow up.
      await Promise.allSettled([
        emailQueue.add('contact-enquiry-admin', {
          type: 'contact-enquiry-admin',
          to: adminEmail,
          enquiry_id: enquiry.id,
          name, email, phone, enquiry_type, message,
          ip_address: meta.ip,
          admin_url: buildFrontendUrl(`/admin/contact-enquiries/${enquiry.id}`),
        }),
        emailQueue.add('contact-enquiry-ack', {
          type: 'contact-enquiry-ack',
          to: email,
          name, enquiry_type, message,
        }),
      ]);

      return reply.status(200).send({
        success: true,
        data: {
          message: 'Your enquiry has been received. You will receive a copy by email shortly. We typically respond within 1 business day.',
          enquiry_id: enquiry.id,
        },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ─── GET /admin/contact-enquiries ──────────────────────────────────────────
  // Admin list with optional status filter and free-text search.

  app.get(
    '/admin/contact-enquiries',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const q = req.query as { status?: string; search?: string; limit?: string };
      const status = q.status && (ALLOWED_STATUSES as readonly string[]).includes(q.status)
        ? (q.status as EnquiryStatus)
        : undefined;
      const search = q.search?.trim().slice(0, 200);
      const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);

      try {
        const enquiries = await prisma.contactEnquiry.findMany({
          where: {
            ...(status ? { status } : {}),
            ...(search
              ? {
                  OR: [
                    { email:        { contains: search, mode: 'insensitive' } },
                    { name:         { contains: search, mode: 'insensitive' } },
                    { enquiry_type: { contains: search, mode: 'insensitive' } },
                    { message:      { contains: search, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          orderBy: { created_at: 'desc' },
          take: limit,
          select: {
            id: true, name: true, email: true, phone: true,
            enquiry_type: true, status: true, created_at: true,
            responded_at: true, responded_by_user_id: true,
            _count: { select: { responses: true } },
          },
        });
        return reply.status(200).send({ success: true, data: { enquiries } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /admin/contact-enquiries/:id ──────────────────────────────────────

  app.get(
    '/admin/contact-enquiries/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const enquiry = await prisma.contactEnquiry.findUnique({
          where: { id },
          include: {
            responses: {
              orderBy: { sent_at: 'asc' },
              include: {
                sent_by: { select: { id: true, full_name: true, email: true } },
              },
            },
            responded_by: { select: { id: true, full_name: true } },
          },
        });
        if (!enquiry) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Enquiry not found.' },
          });
        }
        return reply.status(200).send({ success: true, data: enquiry });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── PATCH /admin/contact-enquiries/:id ────────────────────────────────────
  // Update status and/or admin_notes. Does NOT send an email — for that use
  // the response endpoint below.

  app.patch(
    '/admin/contact-enquiries/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { status?: unknown; admin_notes?: unknown };

      const updates: Record<string, unknown> = {};
      if (typeof body.status === 'string') {
        if (!(ALLOWED_STATUSES as readonly string[]).includes(body.status)) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: `status must be one of ${ALLOWED_STATUSES.join(', ')}` },
          });
        }
        updates.status = body.status;
      }
      if (typeof body.admin_notes === 'string') {
        updates.admin_notes = body.admin_notes.slice(0, 5000);
      }
      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Provide status or admin_notes to update.' },
        });
      }

      try {
        const updated = await prisma.contactEnquiry.update({
          where: { id },
          data: updates,
          select: { id: true, status: true, admin_notes: true, updated_at: true },
        });
        void writeAudit(prisma, {
          actorId: req.user!.userId,
          actionType: 'CONTACT_ENQUIRY_UPDATED',
          entityType: 'ContactEnquiry',
          entityId: id,
          metadata: updates,
        });
        return reply.status(200).send({ success: true, data: updated });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /admin/contact-enquiries/:id/responses ──────────────────────────
  // Admin reply. Persists the response, queues the email to the submitter,
  // and bumps the enquiry status to RESPONDED.

  app.post(
    '/admin/contact-enquiries/:id/responses',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { subject?: unknown; body?: unknown };
      const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
      const responseBody = typeof body.body === 'string' ? body.body.trim() : '';

      if (!subject || subject.length < 3 || subject.length > 200) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'subject must be 3–200 characters' },
        });
      }
      if (!responseBody || responseBody.length < 10 || responseBody.length > 10000) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'body must be 10–10000 characters' },
        });
      }

      try {
        const enquiry = await prisma.contactEnquiry.findUnique({
          where: { id },
          select: { id: true, email: true, name: true },
        });
        if (!enquiry) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Enquiry not found.' },
          });
        }

        const admin = await prisma.user.findUniqueOrThrow({
          where: { id: req.user!.userId },
          select: { id: true, full_name: true },
        });

        const [response] = await prisma.$transaction([
          prisma.contactEnquiryResponse.create({
            data: {
              enquiry_id: id,
              sent_by_user_id: admin.id,
              subject,
              body: responseBody,
            },
          }),
          prisma.contactEnquiry.update({
            where: { id },
            data: {
              status: 'RESPONDED',
              responded_at: new Date(),
              responded_by_user_id: admin.id,
            },
          }),
        ]);

        await emailQueue.add('contact-enquiry-response', {
          type: 'contact-enquiry-response',
          to: enquiry.email,
          name: enquiry.name,
          subject,
          body: responseBody,
          admin_name: admin.full_name,
        });

        void writeAudit(prisma, {
          actorId: admin.id,
          actionType: 'CONTACT_ENQUIRY_RESPONDED',
          entityType: 'ContactEnquiry',
          entityId: id,
          metadata: { response_id: response.id, subject },
        });

        return reply.status(201).send({ success: true, data: { response_id: response.id } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
