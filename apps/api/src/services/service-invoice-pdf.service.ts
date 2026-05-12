import type { PrismaClient, ServiceInvoice } from '@prisma/client';
import { uploadToBlob } from '../utils/blob-storage.js';
import {
  buildInvoicePdf,
  computeGstTreatmentReason,
  addressLines,
  buildPaymentInstructions,
  type InvoiceLineItem,
} from '../utils/invoice-template.js';

// Service-invoice PDF generation. Used by the B2B service-invoice flow
// (where a supplier issues an ad-hoc invoice to a customer outside of a
// tender contract). The PDF layout is shared with the tender-contract
// invoice via apps/api/src/utils/invoice-template.ts — this service is
// the data adapter.

export async function generateAndStoreServiceInvoicePdf(
  invoiceId: string,
  prisma: PrismaClient,
): Promise<ServiceInvoice> {
  const invoice = await prisma.serviceInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      from_user: {
        select: {
          full_name: true,
          legal_entity_name: true,
          trading_name: true,
          email: true,
          billing_phone: true,
          abn: true,
          acn: true,
          gst_registered: true,
          billing_address_1: true,
          billing_address_2: true,
          billing_city: true,
          billing_state: true,
          billing_postcode: true,
          billing_country: true,
          payment_methods: true,
        },
      },
      from_company: {
        select: {
          company_name: true,
          legal_company_name: true,
          billing_email: true,
          billing_phone: true,
          abn: true,
          acn: true,
          gst_registered: true,
          billing_address_1: true,
          billing_address_2: true,
          billing_city: true,
          billing_state: true,
          billing_postcode: true,
          billing_country: true,
        },
      },
      to_user: {
        select: {
          full_name: true,
          legal_entity_name: true,
          email: true,
          abn: true,
          billing_address_1: true,
          billing_address_2: true,
          billing_city: true,
          billing_state: true,
          billing_postcode: true,
          billing_country: true,
        },
      },
      to_company: {
        select: {
          company_name: true,
          legal_company_name: true,
          billing_email: true,
          abn: true,
          billing_address_1: true,
          billing_address_2: true,
          billing_city: true,
          billing_state: true,
          billing_postcode: true,
          billing_country: true,
        },
      },
    },
  });

  // Issuer = company if specified, else individual user
  const issuerEntity = invoice.from_company ?? invoice.from_user;
  const issuerName = invoice.from_company
    ? invoice.from_company.legal_company_name ?? invoice.from_company.company_name
    : invoice.from_user.legal_entity_name ?? invoice.from_user.full_name;
  const issuerTradingName = invoice.from_company
    ? invoice.from_company.company_name === issuerName
      ? null
      : invoice.from_company.company_name
    : invoice.from_user.trading_name ?? null;
  const issuerEmail = invoice.from_company
    ? invoice.from_company.billing_email ?? null
    : invoice.from_user.email;
  const issuerAbn = (invoice.supplier_abn || issuerEntity?.abn) ?? null;
  const issuerAcn = issuerEntity?.acn ?? null;
  const issuerPhone = issuerEntity?.billing_phone ?? null;
  const issuerCountry = issuerEntity?.billing_country ?? null;

  // Recipient = company if specified, else user
  const recipientEntity = invoice.to_company ?? invoice.to_user;
  if (!recipientEntity) {
    throw new Error('Service invoice has no recipient');
  }
  const recipientName = invoice.to_company
    ? invoice.to_company.legal_company_name ?? invoice.to_company.company_name
    : (invoice.to_user?.legal_entity_name ?? invoice.to_user?.full_name) ?? '';
  const recipientEmail = invoice.to_company
    ? invoice.to_company.billing_email ?? null
    : invoice.to_user?.email ?? null;
  const recipientAbn = recipientEntity.abn ?? null;
  const recipientCountry = recipientEntity.billing_country ?? null;

  // Compute GST treatment text. Service invoices store tax_cents and the
  // supplier's GST-registered flag — we derive the rest.
  const gstTreatmentReason =
    invoice.tax_description ??
    computeGstTreatmentReason({
      issuer_country: issuerCountry,
      issuer_gst_registered: invoice.supplier_gst_registered,
      recipient_country: recipientCountry,
      // Service invoices don't record a cross-border flag; infer it.
      is_cross_border: issuerCountry !== recipientCountry &&
                       (issuerCountry !== null || recipientCountry !== null),
      gst_charged: invoice.tax_cents > 0,
    });

  // Payment instructions from issuer's payment_methods JSON
  const methods =
    (invoice.from_user.payment_methods as Record<string, unknown> | null) ?? null;
  const instructions = buildPaymentInstructions(methods);

  const pdfBuffer = await buildInvoicePdf({
    invoice_number: invoice.invoice_number,
    status: invoice.status,
    issued_date: invoice.created_at,
    due_date: invoice.due_date,
    paid_date: invoice.paid_at,
    service_period_start: null,
    service_period_end: null,
    customer_po_number: null,

    issuer_name: issuerName,
    issuer_trading_name: issuerTradingName,
    issuer_email: issuerEmail,
    issuer_phone: issuerPhone,
    issuer_abn: issuerAbn,
    issuer_acn: issuerAcn,
    issuer_gst_registered: invoice.supplier_gst_registered,
    issuer_address_lines: addressLines(issuerEntity),

    recipient_name: recipientName,
    recipient_email: recipientEmail,
    recipient_abn: recipientAbn,
    recipient_address_lines: addressLines(recipientEntity),

    engagement_refs: [],

    line_items: (invoice.line_items as unknown as InvoiceLineItem[]) ?? [],
    currency: invoice.currency,
    subtotal_cents: invoice.subtotal_cents,
    tax_cents: invoice.tax_cents,
    total_cents: invoice.total_cents,
    gst_treatment_reason: gstTreatmentReason,

    payment_instructions: instructions,
    payment_reference: invoice.invoice_number,
    payment_terms: invoice.due_date
      ? `Net ${Math.max(1, Math.round((invoice.due_date.getTime() - invoice.created_at.getTime()) / 86_400_000))}`
      : null,

    notes: invoice.notes,
    footer_text: null,
  });

  const blobPath = `service-invoices/${invoice.from_user_id}/${invoice.id}/${invoice.invoice_number}.pdf`;
  await uploadToBlob(blobPath, pdfBuffer, 'application/pdf');

  return prisma.serviceInvoice.update({
    where: { id: invoice.id },
    data: { pdf_storage_url: blobPath, pdf_generated_at: new Date() },
  });
}
