import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { reportPaymentSchema, disputeEvidenceSchema } from '@onys/shared';
import { authenticate } from '../middleware/authenticate.js';
import { prisma } from '../lib/prisma.js';
import { downloadBlobStream } from '../utils/blob-storage.js';
import type { TenderContractService } from '../services/tender-contract.service.js';
import type { TenderContractPaymentService } from '../services/tender-contract-payment.service.js';
import type { EngagementPaymentService } from '../services/engagement-payment.service.js';
import type { SubscriptionGuards } from '../middleware/subscription-limits.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  return reply.status(e.status ?? 500).send({
    success: false,
    error: { code: e.code ?? 'INTERNAL_ERROR', message: e.message ?? 'An unexpected error occurred' },
  });
}

async function requireCustomer(req: FastifyRequest, reply: FastifyReply) {
  if (req.user?.accountType !== 'CUSTOMER') {
    await reply.status(403).send({ success: false, error: { code: 'CUSTOMER_ONLY', message: 'Customers only.' } });
  }
}

async function requireProvider(req: FastifyRequest, reply: FastifyReply) {
  const allowed = ['INDIVIDUAL_CONTRACTOR', 'ORGANIZATION_ADMIN', 'ORG_MEMBER', 'COMPANY_ADMIN', 'COMPANY_MEMBER'] as const;
  if (!req.user || !(allowed as readonly string[]).includes(req.user.accountType)) {
    await reply.status(403).send({ success: false, error: { code: 'PROVIDER_ONLY', message: 'Providers only.' } });
  }
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const submitMilestoneSchema = z.object({
  completion_notes: z.string().max(2000).optional(),
  evidence_blob_paths: z.array(z.string()).optional(),
});

const revisionSchema = z.object({
  reason: z.string().min(10).max(1000),
});

const cancelSchema = z.object({
  reason: z.string().min(5).max(500),
});

const noteSchema = z.object({
  note: z.string().min(1).max(2000),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function tenderContractRoutes(
  app: FastifyInstance,
  opts: {
    contractService: TenderContractService;
    paymentService: TenderContractPaymentService;
    engagementPaymentService: EngagementPaymentService;
    subscriptionGuards: SubscriptionGuards;
  },
) {
  const { contractService, paymentService, engagementPaymentService, subscriptionGuards } = opts;

  // Binary body parser for evidence uploads
  const binaryParser = (_req: FastifyRequest, body: Buffer, done: (err: null, body: Buffer) => void) => done(null, body);
  for (const ct of [
    'application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream',
  ]) {
    app.addContentTypeParser(ct, { parseAs: 'buffer' }, binaryParser);
  }

  // ── Customer: create contract from awarded tender ─────────────────────────
  // Customer Quota 5 — contracts per month. Counter, monthly reset.

  app.post(
    '/tender-contracts',
    {
      preHandler: [
        authenticate,
        requireCustomer,
        subscriptionGuards.requireLimit('contracts'),
      ],
    },
    async (req, reply) => {
      const body = req.body as { tender_id?: string };
      if (!body.tender_id) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tender_id is required.' } });
      }
      try {
        const contract = await contractService.createContract(body.tender_id, req.user!.userId);
        return reply.status(201).send({ success: true, data: { contract } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: list my contracts ───────────────────────────────────────────

  app.get(
    '/tender-contracts',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      try {
        const contracts = await contractService.listCustomerContracts(req.user!.userId);
        return reply.status(200).send({ success: true, data: { contracts } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: get contract detail ─────────────────────────────────────────

  app.get(
    '/tender-contracts/:contractId',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { contractId } = req.params as { contractId: string };
      const { company_id } = req.query as { company_id?: string };
      try {
        const contract = await contractService.getContract(contractId, req.user!.userId, company_id);
        return reply.status(200).send({ success: true, data: { contract } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: list my contracts (company OR individual contractor) ──────────

  app.get(
    '/provider/tender-contracts',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { company_id } = req.query as { company_id?: string };
      try {
        const contracts = company_id
          ? await contractService.listCompanyContracts(company_id)
          : await contractService.listContractorContracts(req.user!.userId);
        return reply.status(200).send({ success: true, data: { contracts } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: acknowledge contract ────────────────────────────────────────

  app.post(
    '/provider/tender-contracts/:contractId/acknowledge',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { contractId } = req.params as { contractId: string };
      const { company_id } = req.query as { company_id?: string };
      try {
        await contractService.acknowledgeContract(contractId, req.user!.userId, company_id);
        return reply.status(200).send({ success: true, data: { message: 'Contract acknowledged.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: start milestone ─────────────────────────────────────────────

  app.post(
    '/provider/tender-contracts/:contractId/milestones/:milestoneId/start',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { contractId, milestoneId } = req.params as { contractId: string; milestoneId: string };
      const { company_id } = req.query as { company_id?: string };
      try {
        await contractService.startMilestone(contractId, milestoneId, req.user!.userId, company_id);
        return reply.status(200).send({ success: true, data: { message: 'Milestone started.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: submit milestone for approval ───────────────────────────────

  app.post(
    '/provider/tender-contracts/:contractId/milestones/:milestoneId/submit',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { contractId, milestoneId } = req.params as { contractId: string; milestoneId: string };
      const parsed = submitMilestoneSchema.safeParse(req.body);
      const { company_id } = req.query as { company_id?: string };
      try {
        await contractService.submitMilestone(
          contractId,
          milestoneId,
          req.user!.userId,
          parsed.success ? parsed.data : {},
          company_id,
        );
        return reply.status(200).send({ success: true, data: { message: 'Milestone submitted for approval.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: upload milestone evidence ──────────────────────────────────

  app.post(
    '/provider/tender-contracts/:contractId/milestones/:milestoneId/evidence',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { contractId, milestoneId } = req.params as { contractId: string; milestoneId: string };
      const { company_id } = req.query as { company_id?: string };

      const fileName = req.headers['x-file-name'];
      if (typeof fileName !== 'string' || !fileName) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'X-File-Name header required.' } });
      }

      const buffer = req.body as Buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'Request body must be file data.' } });
      }
      if (buffer.length > 20 * 1024 * 1024) {
        return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'Max 20 MB.' } });
      }

      const safeFilename = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
      const blobPath = `tender-evidence/${contractId}/${milestoneId}/${Date.now()}-${safeFilename}`;
      const contentType = (req.headers['content-type'] ?? 'application/octet-stream').split(';')[0]!.trim();

      try {
        const { uploadToBlob } = await import('../utils/blob-storage.js');
        await uploadToBlob(blobPath, buffer, contentType);
        await contractService.appendMilestoneEvidence(contractId, milestoneId, req.user!.userId, blobPath, company_id);
        return reply.status(200).send({ success: true, data: { blob_path: blobPath, file_name: safeFilename } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: toggle deliverable complete ────────────────────────────────

  app.post(
    '/provider/tender-contracts/:contractId/deliverables/:deliverableId/toggle',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { contractId, deliverableId } = req.params as { contractId: string; deliverableId: string };
      const { company_id } = req.query as { company_id?: string };
      try {
        await contractService.completeDeliverable(contractId, deliverableId, req.user!.userId, company_id);
        return reply.status(200).send({ success: true, data: { message: 'Deliverable updated.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: approve milestone ───────────────────────────────────────────

  app.post(
    '/tender-contracts/:contractId/milestones/:milestoneId/approve',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { contractId, milestoneId } = req.params as { contractId: string; milestoneId: string };
      try {
        await contractService.approveMilestone(contractId, milestoneId, req.user!.userId);
        return reply.status(200).send({ success: true, data: { message: 'Milestone approved.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: request revision on milestone ───────────────────────────────

  app.post(
    '/tender-contracts/:contractId/milestones/:milestoneId/request-revision',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { contractId, milestoneId } = req.params as { contractId: string; milestoneId: string };
      const parsed = revisionSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'reason (min 10 chars) is required.' } });
      }
      try {
        await contractService.requestMilestoneRevision(contractId, milestoneId, req.user!.userId, parsed.data.reason);
        return reply.status(200).send({ success: true, data: { message: 'Revision requested.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Both: add note to activity log ────────────────────────────────────────

  app.post(
    '/tender-contracts/:contractId/notes',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { contractId } = req.params as { contractId: string };
      const { company_id } = req.query as { company_id?: string };
      const parsed = noteSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'note is required.' } });
      }
      try {
        await contractService.addNote(contractId, req.user!.userId, parsed.data.note, company_id);
        return reply.status(200).send({ success: true, data: { message: 'Note added.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Both: cancel contract ─────────────────────────────────────────────────

  app.post(
    '/tender-contracts/:contractId/cancel',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { contractId } = req.params as { contractId: string };
      const { company_id } = req.query as { company_id?: string };
      const parsed = cancelSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'reason (min 5 chars) is required.' } });
      }
      try {
        await contractService.cancelContract(contractId, req.user!.userId, parsed.data.reason, company_id);
        return reply.status(200).send({ success: true, data: { message: 'Contract cancelled.' } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Admin: get any contract by id ─────────────────────────────────────────

  app.get(
    '/admin/tender-contracts/:contractId',
    { preHandler: [authenticate] },
    async (req, reply) => {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user?.accountType ?? '')) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admins only.' } });
      }
      const { contractId } = req.params as { contractId: string };
      try {
        const contract = await prisma.tenderContract.findUnique({
          where: { id: contractId },
          include: {
            tender: { select: { id: true, title: true, domain: true } },
            proposal: { select: { id: true, proposed_price_aud: true } },
            customer: { select: { id: true, full_name: true, email: true } },
            company: { select: { id: true, company_name: true } },
            contractor: { select: { id: true, full_name: true, email: true } },
            milestones: { orderBy: { sort_order: 'asc' } },
            deliverables: { orderBy: { sort_order: 'asc' } },
          },
        });
        if (!contract) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Contract not found.' } });
        return reply.status(200).send({ success: true, data: { contract } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYMENT ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Provider: raise invoice for approved milestone ────────────────────────

  app.post(
    '/provider/tender-contracts/:contractId/milestones/:milestoneId/invoice',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { contractId, milestoneId } = req.params as { contractId: string; milestoneId: string };
      const { company_id } = req.query as { company_id?: string };

      // Optional metadata supplied at invoice-raise time. The supplier may
      // pass the customer's PO number and a service period (e.g. when the
      // milestone work spanned a date range distinct from the issue date).
      const body = (req.body ?? {}) as {
        customer_po_number?: unknown;
        service_period_start?: unknown;
        service_period_end?: unknown;
      };
      const customerPo = typeof body.customer_po_number === 'string' && body.customer_po_number.trim()
        ? body.customer_po_number.trim().slice(0, 100)
        : null;
      const periodStart = typeof body.service_period_start === 'string' && !isNaN(Date.parse(body.service_period_start))
        ? new Date(body.service_period_start)
        : null;
      const periodEnd = typeof body.service_period_end === 'string' && !isNaN(Date.parse(body.service_period_end))
        ? new Date(body.service_period_end)
        : null;
      if (periodStart && periodEnd && periodStart > periodEnd) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'service_period_start must be on or before service_period_end.' },
        });
      }

      try {
        const invoice = await paymentService.raiseInvoice(
          contractId,
          milestoneId,
          req.user!.userId,
          company_id,
          {
            customer_po_number: customerPo,
            service_period_start: periodStart,
            service_period_end: periodEnd,
          },
        );
        return reply.status(201).send({ success: true, data: { invoice } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: list invoices for a contract ────────────────────────────────

  app.get(
    '/provider/tender-contracts/:contractId/invoices',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { contractId } = req.params as { contractId: string };
      const { company_id } = req.query as { company_id?: string };
      try {
        const invoices = await paymentService.listContractInvoices(contractId, req.user!.userId, company_id);
        return reply.status(200).send({ success: true, data: { invoices } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: list all TC payouts ────────────────────────────────────────

  app.get(
    '/provider/tc-payouts',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { company_id } = req.query as { company_id?: string };
      try {
        const records = await paymentService.listProviderPayouts(req.user!.userId, company_id);
        return reply.status(200).send({ success: true, data: { records } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Provider: download TC commission invoice ─────────────────────────────

  app.get(
    '/provider/tc-payouts/:payoutId/commission-invoice',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { payoutId } = req.params as { payoutId: string };
      const { dl } = req.query as { dl?: string };
      const { company_id } = req.query as { company_id?: string };
      try {
        // Verify ownership before generating
        await paymentService.assertProviderOwnsPayout(payoutId, req.user!.userId, company_id);

        const { blob_path, invoice_number } = await paymentService.generateCommissionInvoice(payoutId);

        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentLength } = await downloadBlobStream(blob_path);
        reply.header('Content-Type', 'application/pdf');
        if (contentLength) reply.header('Content-Length', contentLength);
        const disposition = dl === '1' ? 'attachment' : 'inline';
        reply.header('Content-Disposition', `${disposition}; filename="${invoice_number}.pdf"`);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: list invoices for a contract ────────────────────────────────

  app.get(
    '/tender-contracts/:contractId/invoices',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { contractId } = req.params as { contractId: string };
      try {
        const invoices = await paymentService.listContractInvoices(contractId, req.user!.userId);
        return reply.status(200).send({ success: true, data: { invoices } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: get single invoice ──────────────────────────────────────────

  app.get(
    '/tender-contract-invoices/:invoiceId',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { invoiceId } = req.params as { invoiceId: string };
      const { company_id } = req.query as { company_id?: string };
      try {
        const invoice = await paymentService.getInvoice(invoiceId, req.user!.userId, company_id);
        return reply.status(200).send({ success: true, data: { invoice } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Download invoice PDF (customer + provider) ────────────────────────────
  // Streams the invoice PDF. ?dl=1 forces a browser download.

  app.get(
    '/tender-contract-invoices/:invoiceId/download',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { invoiceId } = req.params as { invoiceId: string };
      const { dl, company_id } = req.query as { dl?: string; company_id?: string };
      try {
        const invoice = await paymentService.getInvoice(invoiceId, req.user!.userId, company_id);
        if (!invoice.pdf_blob_path) {
          return reply.status(404).send({
            success: false,
            error: { code: 'PDF_NOT_READY', message: 'Invoice PDF is not yet available. Please try again in a moment.' },
          });
        }
        const { downloadBlobStream } = await import('../utils/blob-storage.js');
        const { stream, contentLength } = await downloadBlobStream(invoice.pdf_blob_path);
        reply.header('Content-Type', 'application/pdf');
        if (contentLength) reply.header('Content-Length', contentLength);
        const disposition = dl === '1' ? 'attachment' : 'inline';
        reply.header('Content-Disposition', `${disposition}; filename="${invoice.invoice_number}.pdf"`);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: create Stripe payment intent ────────────────────────────────

  app.post(
    '/tender-contract-invoices/:invoiceId/payment/create',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { invoiceId } = req.params as { invoiceId: string };
      try {
        const result = await paymentService.createStripePaymentIntent(invoiceId, req.user!.userId);
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: submit bank transfer ────────────────────────────────────────

  const bankTransferSchema = z.object({
    method: z.enum(['PAYID_EMAIL', 'AU_BSB', 'SWIFT']),
    payment_reference: z.string().max(200).optional(),
  });

  app.post(
    '/tender-contract-invoices/:invoiceId/bank-transfer',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { invoiceId } = req.params as { invoiceId: string };
      const parsed = bankTransferSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'method is required: PAYID_EMAIL | AU_BSB | SWIFT.' } });
      }
      try {
        const bt = await paymentService.submitBankTransfer(invoiceId, req.user!.userId, {
            method: parsed.data.method,
            ...(parsed.data.payment_reference !== undefined ? { payment_reference: parsed.data.payment_reference } : {}),
          });
        return reply.status(201).send({ success: true, data: { bank_transfer: bt } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ── Customer: upload bank transfer receipt (binary) ───────────────────────

  app.post(
    '/tender-contract-invoices/:invoiceId/bank-transfer/receipt',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { invoiceId } = req.params as { invoiceId: string };

      const fileName = req.headers['x-file-name'];
      if (typeof fileName !== 'string' || !fileName) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'X-File-Name header required.' } });
      }

      const buffer = req.body as Buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'Request body must be file data.' } });
      }
      if (buffer.length > 10 * 1024 * 1024) {
        return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'Max 10 MB.' } });
      }

      const safeFilename = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
      const contentType = (req.headers['content-type'] ?? 'application/octet-stream').split(';')[0]!.trim();
      const blobPath = `tc-receipts/${invoiceId}/${Date.now()}-${safeFilename}`;

      try {
        const { uploadToBlob } = await import('../utils/blob-storage.js');
        await uploadToBlob(blobPath, buffer, contentType);
        await paymentService.uploadBankTransferReceipt(invoiceId, req.user!.userId, blobPath);
        return reply.status(200).send({ success: true, data: { blob_path: blobPath } });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ────────────────────────────────────────────────────────────────────────
  // ─── Direct-payment endpoints (Phase 2) ─────────────────────────────────
  // For tender contract invoices created on/after the cutover. Pre-cutover
  // invoices keep using the legacy bank-transfer / Stripe flow above.
  // ────────────────────────────────────────────────────────────────────────

  // ─── GET /tender-contract-invoices/:invoiceId/payment-options ───────────
  app.get(
    '/tender-contract-invoices/:invoiceId/payment-options',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { invoiceId } = req.params as { invoiceId: string };
      try {
        const result = await engagementPaymentService.getInvoicePaymentOptions(
          invoiceId,
          req.user!.userId,
        );
        return reply.status(200).send({ success: true, data: result });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /tender-contract-invoices/:invoiceId/payment/report ───────────
  app.post(
    '/tender-contract-invoices/:invoiceId/payment/report',
    { preHandler: [authenticate, requireCustomer] },
    async (req, reply) => {
      const { invoiceId } = req.params as { invoiceId: string };
      try {
        const data = await req.file();
        if (!data) {
          const parsed = reportPaymentSchema.safeParse(req.body);
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
          const inv = await engagementPaymentService.reportInvoicePayment(
            invoiceId,
            req.user!.userId,
            parsed.data,
          );
          return reply.status(200).send({ success: true, data: inv });
        }

        const rawFields = (data.fields ?? {}) as Record<string, { value?: unknown }>;
        const fieldData = {
          payment_method: rawFields.payment_method?.value,
          payment_reference: rawFields.payment_reference?.value,
          payment_amount_aud: rawFields.payment_amount_aud?.value,
        };
        const parsed = reportPaymentSchema.safeParse(fieldData);
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

        const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        if (!ALLOWED_MIME.includes(data.mimetype)) {
          return reply.status(415).send({
            success: false,
            error: { code: 'INVALID_FILE_TYPE', message: 'Only PDF, JPG, PNG accepted.' },
          });
        }
        const buffer = await data.toBuffer();
        if (buffer.length > 10 * 1024 * 1024) {
          return reply.status(413).send({
            success: false,
            error: { code: 'FILE_TOO_LARGE', message: 'Evidence must be under 10 MB.' },
          });
        }

        const inv = await engagementPaymentService.reportInvoicePayment(
          invoiceId,
          req.user!.userId,
          {
            ...parsed.data,
            evidence_file: { buffer, file_name: data.filename, content_type: data.mimetype },
          },
        );
        return reply.status(200).send({ success: true, data: inv });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /tender-contract-invoices/:invoiceId/payment/confirm ──────────
  app.post(
    '/tender-contract-invoices/:invoiceId/payment/confirm',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { invoiceId } = req.params as { invoiceId: string };
      try {
        const inv = await engagementPaymentService.confirmInvoicePayment(invoiceId, req.user!.userId);
        return reply.status(200).send({ success: true, data: inv });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── POST /tender-contract-invoices/:invoiceId/payment/dispute ──────────
  app.post(
    '/tender-contract-invoices/:invoiceId/payment/dispute',
    { preHandler: [authenticate, requireProvider] },
    async (req, reply) => {
      const { invoiceId } = req.params as { invoiceId: string };
      const parsed = disputeEvidenceSchema.safeParse(req.body);
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
        const inv = await engagementPaymentService.disputeInvoiceEvidence(
          invoiceId,
          req.user!.userId,
          parsed.data.reason,
        );
        return reply.status(200).send({ success: true, data: inv });
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  // ─── GET /tender-contract-invoices/:invoiceId/payment/evidence ──────────
  app.get(
    '/tender-contract-invoices/:invoiceId/payment/evidence',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { invoiceId } = req.params as { invoiceId: string };
      const { dl } = req.query as { dl?: string };
      try {
        const inv = await prisma.tenderContractInvoice.findUnique({
          where: { id: invoiceId },
          select: {
            company_id: true,
            contractor_user_id: true,
            payment_evidence_blob_path: true,
            payment_evidence_file_name: true,
            contract: { select: { customer_id: true } },
          },
        });
        if (!inv) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });

        const userId = req.user!.userId;
        let isCompanyAdmin = false;
        if (inv.company_id) {
          const c = await prisma.consultingCompany.findUnique({
            where: { id: inv.company_id },
            select: { primary_admin_id: true },
          });
          isCompanyAdmin = c?.primary_admin_id === userId;
        }
        const allowed =
          inv.contract.customer_id === userId ||
          inv.contractor_user_id === userId ||
          isCompanyAdmin;
        if (!allowed) {
          return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }
        if (!inv.payment_evidence_blob_path) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NO_EVIDENCE', message: 'No evidence uploaded.' },
          });
        }
        const { stream, contentType, contentLength } = await downloadBlobStream(
          inv.payment_evidence_blob_path,
        );
        reply.header('Content-Type', contentType ?? 'application/octet-stream');
        if (contentLength) reply.header('Content-Length', contentLength);
        const disposition = dl === '1' ? 'attachment' : 'inline';
        reply.header(
          'Content-Disposition',
          `${disposition}; filename="${inv.payment_evidence_file_name ?? 'evidence'}"`,
        );
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(stream);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}
