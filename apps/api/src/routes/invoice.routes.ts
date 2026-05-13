import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import type { InvoiceService } from '../services/invoice.service.js';
import { prisma } from '../lib/prisma.js';
import { uploadToBlob } from '../utils/blob-storage.js';
import { writeAudit } from '../utils/audit.js';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const createInvoiceSchema = z.object({
  due_date_override: z.coerce.date().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  return reply.status(e.status ?? 500).send({
    success: false,
    error: { code: e.code ?? 'INTERNAL_ERROR', message: e.message ?? 'An unexpected error occurred' },
  });
}

// ─── Route options ────────────────────────────────────────────────────────────

interface InvoiceRouteOptions {
  invoiceService: InvoiceService;
}

// ─── invoiceRoutes ────────────────────────────────────────────────────────────

export async function invoiceRoutes(app: FastifyInstance, opts: InvoiceRouteOptions) {
  const { invoiceService } = opts;

  // ─── POST /orders/:id/company-invoice ────────────────────────────────────
  // Company admin creates an invoice for a DELIVERABLES_ACCEPTED order.

  app.post(
    '/orders/:id/company-invoice',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: orderId } = req.params as { id: string };
      const parsed = createInvoiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fields: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          },
        });
      }

      try {
        const invoiceData: { due_date_override?: Date } = {};
        if (parsed.data.due_date_override !== undefined) {
          invoiceData.due_date_override = parsed.data.due_date_override;
        }
        const result = await invoiceService.createInvoice(orderId, req.user.userId, invoiceData);
        return reply.status(201).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /orders/:id/company-invoice ─────────────────────────────────────
  // Returns the company invoice for an order. Accessible by customer, company
  // members, and platform admins.

  app.get(
    '/orders/:id/company-invoice',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: orderId } = req.params as { id: string };
      try {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: { customer_id: true, company_id: true, executing_member_id: true },
        });
        if (!order) {
          return reply.status(404).send({
            success: false,
            error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' },
          });
        }

        const userId = req.user.userId;
        const isCustomer = order.customer_id === userId;
        const isExecutingMember = order.executing_member_id === userId;
        let isCompanyMember = false;
        if (!isCustomer && !isExecutingMember && order.company_id) {
          const membership = await prisma.companyMember.findUnique({
            where: {
              company_id_user_id: { company_id: order.company_id, user_id: userId },
            },
            select: { status: true },
          });
          isCompanyMember = membership?.status === 'ACTIVE';
        }
        if (!isCustomer && !isExecutingMember && !isCompanyMember) {
          const actor = await prisma.user.findUnique({
            where: { id: userId },
            select: { account_type: true },
          });
          if (
            actor?.account_type !== 'PLATFORM_ADMIN' &&
            actor?.account_type !== 'COMPLIANCE_ADMIN'
          ) {
            return reply.status(403).send({
              success: false,
              error: { code: 'FORBIDDEN', message: 'You do not have access to this order.' },
            });
          }
        }

        const invoice = await prisma.companyInvoice.findUnique({
          where: { order_id: orderId },
        });
        if (!invoice) {
          return reply.status(404).send({
            success: false,
            error: { code: 'INVOICE_NOT_FOUND', message: 'No invoice exists for this order.' },
          });
        }
        return reply.status(200).send({ success: true, data: invoice });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /company-invoices/:id/document ──────────────────────────────────
  // Returns a 1-hour SAS URL for the company invoice PDF.

  app.get(
    '/company-invoices/:id/document',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: invoiceId } = req.params as { id: string };
      try {
        const invoice = await prisma.companyInvoice.findUnique({
          where: { id: invoiceId },
          select: {
            id: true,
            invoice_number: true,
            pdf_blob_path: true,
            order: {
              select: { customer_id: true, company_id: true, executing_member_id: true },
            },
          },
        });
        if (!invoice) {
          return reply.status(404).send({
            success: false,
            error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found.' },
          });
        }
        if (!invoice.pdf_blob_path) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NO_DOCUMENT', message: 'PDF not yet generated for this invoice.' },
          });
        }

        const userId = req.user.userId;
        const isCustomer = invoice.order.customer_id === userId;
        const isExecutingMember = invoice.order.executing_member_id === userId;
        let isCompanyMember = false;
        if (!isCustomer && !isExecutingMember && invoice.order.company_id) {
          const membership = await prisma.companyMember.findUnique({
            where: {
              company_id_user_id: { company_id: invoice.order.company_id, user_id: userId },
            },
            select: { status: true },
          });
          isCompanyMember = membership?.status === 'ACTIVE';
        }
        if (!isCustomer && !isExecutingMember && !isCompanyMember) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'You do not have access to this document.' },
          });
        }

        // Stream the invoice PDF through the API rather than returning a
        // SAS URL — keeps the Azure URL out of the browser and ensures
        // every download stays gated by the platform auth check.
        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentType, contentLength } = await downloadBlobStream(invoice.pdf_blob_path);
        const fileName = invoice.pdf_blob_path.split('/').pop() ?? `invoice-${invoice.invoice_number ?? 'document'}.pdf`;
        const { dl } = req.query as { dl?: string };
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

  // ─── POST /company-invoices/:id/payment/create ───────────────────────────
  // Customer creates a Stripe PaymentIntent to pay a company invoice.

  app.post(
    '/company-invoices/:id/payment/create',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: invoiceId } = req.params as { id: string };
      try {
        const result = await invoiceService.createInvoicePaymentIntent(invoiceId, req.user.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /platform/bank-account ───────────────────────────────────────────
  // Returns platform bank details for customer bank transfer payments.
  // Only returns details when bank_transfer_enabled is true in PlatformConfig.

  app.get(
    '/platform/bank-account',
    { preHandler: [authenticate] },
    async (_req, reply) => {
      try {
        const rows = await prisma.platformConfig.findMany({
          where: {
            key: {
              in: [
                'bank_transfer_enabled',
                'platform_bank_au',
                'platform_bank_swift',
                'platform_payid',
              ],
            },
          },
        });

        // PlatformConfig.value is Json — but may be stored as a JSON string scalar
        // if saved via a tool that serialised the object before storing.
        // parseJsonConfig handles both: returns parsed object if string, raw value otherwise.
        function parseJsonConfig(val: unknown): unknown {
          if (typeof val === 'string') {
            try { return JSON.parse(val); } catch { return val; }
          }
          return val;
        }

        const cfg: Record<string, unknown> = {};
        for (const row of rows) {
          cfg[row.key] = parseJsonConfig(row.value);
        }

        const rawEnabled = cfg['bank_transfer_enabled'];
        const enabled = rawEnabled === true || rawEnabled === 'true'
          || (typeof rawEnabled === 'object' && rawEnabled !== null && (rawEnabled as Record<string, unknown>)['enabled'] === true);
        if (!enabled) {
          return reply.status(200).send({ success: true, data: { enabled: false } });
        }

        return reply.status(200).send({
          success: true,
          data: {
            enabled: true,
            au_bank: cfg['platform_bank_au'] ?? null,
            swift: cfg['platform_bank_swift'] ?? null,
            payid: cfg['platform_payid'] ?? null,
          },
        });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /company-invoices/:id/bank-transfer ─────────────────────────────
  // Customer submits a bank transfer payment for an invoice.
  // Body: multipart — fields: method, payment_reference; file: receipt (optional)

  const binaryParser = (
    _req: import('fastify').FastifyRequest,
    body: Buffer,
    done: (err: null, body: Buffer) => void,
  ) => done(null, body);

  for (const ct of ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']) {
    app.addContentTypeParser(ct, { parseAs: 'buffer' }, binaryParser);
  }

  app.post(
    '/company-invoices/:id/bank-transfer',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: invoiceId } = req.params as { id: string };

      const body = req.body as {
        method?: string;
        payment_reference?: string;
      };

      const VALID_METHODS = ['PAYID_EMAIL', 'AU_BSB', 'SWIFT'];
      if (!body.method || !VALID_METHODS.includes(body.method)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'method must be PAYID_EMAIL, AU_BSB, or SWIFT.' },
        });
      }

      try {
        // Verify invoice exists and belongs to this customer
        const invoice = await prisma.companyInvoice.findUnique({
          where: { id: invoiceId },
          select: {
            id: true,
            order_id: true,
            status: true,
            total_aud: true,
            order: { select: { customer_id: true } },
          },
        });

        if (!invoice) {
          return reply.status(404).send({ success: false, error: { code: 'INVOICE_NOT_FOUND' } });
        }
        if (invoice.order.customer_id !== req.user.userId) {
          return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }
        if (!['SENT', 'OVERDUE'].includes(invoice.status)) {
          return reply.status(422).send({
            success: false,
            error: { code: 'INVOICE_NOT_PAYABLE', message: 'Invoice is not in a payable state.' },
          });
        }

        // Check for existing submission — only block if already CONFIRMED (invoice paid)
        const existing = await prisma.bankTransferPayment.findUnique({
          where: { invoice_id: invoiceId },
        });
        if (existing?.status === 'CONFIRMED') {
          return reply.status(409).send({
            success: false,
            error: { code: 'INVOICE_ALREADY_PAID', message: 'This invoice has already been confirmed as paid.' },
          });
        }

        // PENDING or REJECTED: allow resubmission (upsert)
        const record = existing
          ? await prisma.bankTransferPayment.update({
              where: { id: existing.id },
              data: {
                method: body.method,
                payment_reference: body.payment_reference ?? null,
                status: 'PENDING',
                submitted_at: new Date(),
                rejected_at: null,
                rejection_reason: null,
                receipt_blob_path: null,
              },
            })
          : await prisma.bankTransferPayment.create({
              data: {
                invoice_id: invoiceId,
                order_id: invoice.order_id,
                method: body.method,
                payment_reference: body.payment_reference ?? null,
                amount_aud: invoice.total_aud,
                status: 'PENDING',
              },
            });

        // Move order status to BANK_TRANSFER_PENDING so customer sees "Payment Under Review"
        await prisma.order.update({
          where: { id: invoice.order_id },
          data: { company_order_status: 'BANK_TRANSFER_PENDING' },
        });

        await writeAudit(prisma, {
          actorId: req.user.userId,
          actionType: 'BANK_TRANSFER_SUBMITTED',
          entityType: 'BankTransferPayment',
          entityId: record.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? 'unknown',
          metadata: { invoice_id: invoiceId, method: body.method },
        });

        return reply.status(201).send({ success: true, data: record });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /company-invoices/:id/bank-transfer/receipt ────────────────────
  // Upload a receipt file (binary body) for a bank transfer payment.

  app.post(
    '/company-invoices/:id/bank-transfer/receipt',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });

      const { id: invoiceId } = req.params as { id: string };
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
        return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'Request body must be file binary data.' } });
      }
      if (buffer.length > 10 * 1024 * 1024) {
        return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'File must be under 10 MB.' } });
      }

      try {
        // Verify ownership
        const transfer = await prisma.bankTransferPayment.findUnique({
          where: { invoice_id: invoiceId },
          select: {
            id: true,
            invoice: { select: { order: { select: { customer_id: true } } } },
          },
        });
        if (!transfer) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Submit the bank transfer details first.' } });
        }
        if (transfer.invoice.order.customer_id !== req.user.userId) {
          return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }

        const safeFilename = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
        const blobPath = `bank-transfer-receipts/${invoiceId}/${crypto.randomUUID()}-${safeFilename}`;
        await uploadToBlob(blobPath, buffer, ct);

        await prisma.bankTransferPayment.update({
          where: { id: transfer.id },
          data: { receipt_blob_path: blobPath },
        });

        return reply.status(200).send({ success: true, data: { receipt_blob_path: blobPath } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
