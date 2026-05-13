import PDFDocument from 'pdfkit';
import type { PrismaClient, Invoice } from '@prisma/client';
import { uploadToBlob } from '../utils/blob-storage.js';

interface LineItem {
  description: string;
  quantity: number;
  unit_amount: number; // cents
  amount: number; // cents
  period_start?: string | null;
  period_end?: string | null;
}

interface PdfRecipient {
  name: string;
  email?: string;
  abn?: string | null;
  address_lines: string[];
}

interface InvoicePdfData {
  invoice_number: string;
  issued_date: Date;
  due_date: Date | null;
  paid_date: Date | null;
  billing_period_start: Date | null;
  billing_period_end: Date | null;
  recipient: PdfRecipient;
  line_items: LineItem[];
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  // Issuer (Waveful Digital Platforms / TalvexIT)
  issuer_name: string;
  issuer_abn: string;
  issuer_address: string;
  issuer_gst_registered: boolean;
  notes?: string | null;
}

// ─── generateSubscriptionInvoicePdf ──────────────────────────────────────────

function buildPdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 60, right: 60 },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_WIDTH = 595.28;
    const CONTENT_WIDTH = PAGE_WIDTH - 120;
    const COL2_X = 350;

    const fmtMoney = (cents: number) =>
      `${data.currency} ${(cents / 100).toFixed(2)}`;
    const fmtDate = (d: Date | null) =>
      d ? d.toLocaleDateString('en-AU') : '—';

    // ─── HEADER ────────────────────────────────────────────────────────────────
    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .fillColor('#1a1a2e')
      .text(data.issuer_name, 60, 50);

    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#666666')
      .text(data.issuer_address, 60, 78)
      .text(`ABN: ${data.issuer_abn}`, 60, 90);

    doc
      .fontSize(28)
      .font('Helvetica-Bold')
      .fillColor('#1a1a2e')
      .text('TAX INVOICE', COL2_X, 50, {
        align: 'right',
        width: PAGE_WIDTH - COL2_X - 60,
      });

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#444444')
      .text(`Invoice #: ${data.invoice_number}`, COL2_X, 88, {
        align: 'right',
        width: PAGE_WIDTH - COL2_X - 60,
      })
      .text(`Issued: ${fmtDate(data.issued_date)}`, COL2_X, 102, {
        align: 'right',
        width: PAGE_WIDTH - COL2_X - 60,
      });

    if (data.due_date) {
      doc.text(`Due: ${fmtDate(data.due_date)}`, COL2_X, 116, {
        align: 'right',
        width: PAGE_WIDTH - COL2_X - 60,
      });
    }

    doc
      .moveTo(60, 140)
      .lineTo(PAGE_WIDTH - 60, 140)
      .strokeColor('#e0e0e0')
      .lineWidth(1)
      .stroke();

    // ─── BILL TO ───────────────────────────────────────────────────────────────
    let y = 160;

    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#999999')
      .text('BILLED TO', 60, y);
    y += 16;

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#1a1a2e')
      .text(data.recipient.name, 60, y);
    y += 14;

    doc.fontSize(9).font('Helvetica').fillColor('#444444');
    if (data.recipient.email) {
      doc.text(data.recipient.email, 60, y);
      y += 12;
    }
    if (data.recipient.abn) {
      doc.text(`ABN: ${data.recipient.abn}`, 60, y);
      y += 12;
    }
    for (const line of data.recipient.address_lines) {
      if (line.trim()) {
        doc.text(line, 60, y);
        y += 12;
      }
    }

    // ─── BILLING PERIOD ────────────────────────────────────────────────────────
    if (data.billing_period_start && data.billing_period_end) {
      y += 8;
      doc
        .fontSize(9)
        .font('Helvetica-Oblique')
        .fillColor('#666666')
        .text(
          `Billing period: ${fmtDate(data.billing_period_start)} — ${fmtDate(
            data.billing_period_end,
          )}`,
          60,
          y,
        );
      y += 18;
    } else {
      y += 16;
    }

    // ─── LINE ITEMS TABLE ──────────────────────────────────────────────────────
    doc
      .moveTo(60, y)
      .lineTo(PAGE_WIDTH - 60, y)
      .strokeColor('#e0e0e0')
      .stroke();
    y += 10;

    doc.rect(60, y, CONTENT_WIDTH, 24).fillColor('#f5f5f5').fill();

    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#666666')
      .text('DESCRIPTION', 68, y + 8, { width: 280 })
      .text('QTY', 350, y + 8, { width: 30, align: 'right' })
      .text('UNIT', 385, y + 8, { width: 70, align: 'right' })
      .text('AMOUNT', 460, y + 8, { width: 75, align: 'right' });
    y += 24;

    for (const item of data.line_items) {
      const periodLabel =
        item.period_start && item.period_end
          ? ` (${fmtDate(new Date(item.period_start))} → ${fmtDate(
              new Date(item.period_end),
            )})`
          : '';
      const desc = `${item.description}${periodLabel}`;

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#1a1a2e')
        .text(desc, 68, y + 6, { width: 280 })
        .text(String(item.quantity), 350, y + 6, { width: 30, align: 'right' })
        .text(fmtMoney(item.unit_amount), 385, y + 6, {
          width: 70,
          align: 'right',
        })
        .text(fmtMoney(item.amount), 460, y + 6, { width: 75, align: 'right' });
      y += 24;
    }

    // ─── TOTALS ────────────────────────────────────────────────────────────────
    doc
      .moveTo(60, y)
      .lineTo(PAGE_WIDTH - 60, y)
      .strokeColor('#e0e0e0')
      .stroke();
    y += 14;

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#444444')
      .text('Subtotal (ex. GST)', 300, y, { width: 145, align: 'right' })
      .text(fmtMoney(data.subtotal_cents), 450, y, {
        width: 85,
        align: 'right',
      });
    y += 16;

    if (data.tax_cents > 0) {
      doc
        .text('GST (10%)', 300, y, { width: 145, align: 'right' })
        .text(fmtMoney(data.tax_cents), 450, y, { width: 85, align: 'right' });
      y += 16;
    }

    doc.rect(295, y - 4, 245, 26).fillColor('#1a1a2e').fill();
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#ffffff')
      .text(`TOTAL (${data.currency})`, 300, y + 2, {
        width: 145,
        align: 'right',
      })
      .text(fmtMoney(data.total_cents), 450, y + 2, {
        width: 85,
        align: 'right',
      });
    y += 36;

    if (data.paid_date) {
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#16a34a')
        .text(`PAID ${fmtDate(data.paid_date)}`, 60, y);
    }

    // ─── NOTES ─────────────────────────────────────────────────────────────────
    if (data.notes) {
      y += 24;
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#666666')
        .text(data.notes, 60, y, { width: CONTENT_WIDTH });
    }

    // ─── FOOTER ────────────────────────────────────────────────────────────────
    doc
      .moveTo(60, 760)
      .lineTo(PAGE_WIDTH - 60, 760)
      .strokeColor('#e0e0e0')
      .stroke();

    const footerText = data.issuer_gst_registered
      ? `This is a tax invoice for GST purposes. ${data.issuer_name} — GST registered under ABN ${data.issuer_abn}.`
      : `${data.issuer_name} — ABN ${data.issuer_abn}.`;

    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor('#aaaaaa')
      .text(footerText, 60, 770, {
        width: CONTENT_WIDTH,
        align: 'center',
      });

    doc.end();
  });
}

// ─── generateAndStoreInvoicePdf ──────────────────────────────────────────────
// Generates the PDF, uploads it to Azure Blob, and persists the blob path
// onto the Invoice row. Idempotent — safe to call repeatedly.

export async function generateAndStoreInvoicePdf(
  invoiceId: string,
  prisma: PrismaClient,
): Promise<Invoice> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      subscription: { select: { user_id: true, company_id: true } },
      billed_to_user: {
        select: {
          full_name: true,
          email: true,
          abn: true,
          legal_entity_name: true,
          billing_address_1: true,
          billing_address_2: true,
          billing_city: true,
          billing_state: true,
          billing_postcode: true,
          billing_country: true,
        },
      },
      billed_to_company: {
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

  // Resolve recipient — prefer company, fall back to user
  let recipient: PdfRecipient;
  if (invoice.billed_to_company) {
    const c = invoice.billed_to_company;
    recipient = {
      name: c.legal_company_name ?? c.company_name,
      ...(c.billing_email && { email: c.billing_email }),
      abn: c.abn ?? null,
      address_lines: [
        c.billing_address_1 ?? '',
        c.billing_address_2 ?? '',
        [c.billing_city, c.billing_state, c.billing_postcode]
          .filter(Boolean)
          .join(' '),
        c.billing_country ?? '',
      ],
    };
  } else if (invoice.billed_to_user) {
    const u = invoice.billed_to_user;
    recipient = {
      name: u.legal_entity_name ?? u.full_name,
      ...(u.email && { email: u.email }),
      abn: u.abn ?? null,
      address_lines: [
        u.billing_address_1 ?? '',
        u.billing_address_2 ?? '',
        [u.billing_city, u.billing_state, u.billing_postcode]
          .filter(Boolean)
          .join(' '),
        u.billing_country ?? '',
      ],
    };
  } else {
    recipient = {
      name: 'Unknown',
      address_lines: [],
    };
  }

  const lineItems = (invoice.line_items as unknown as LineItem[]) ?? [];

  const pdfBuffer = await buildPdf({
    invoice_number: invoice.invoice_number,
    issued_date: invoice.created_at,
    due_date: invoice.due_date,
    paid_date: invoice.paid_at,
    billing_period_start: invoice.billing_period_start,
    billing_period_end: invoice.billing_period_end,
    recipient,
    line_items: lineItems,
    currency: invoice.currency,
    subtotal_cents: invoice.subtotal_cents,
    tax_cents: invoice.tax_cents,
    total_cents: invoice.total_cents,
    amount_paid_cents: invoice.amount_paid_cents,
    issuer_name: process.env.COMPANY_NAME ?? 'Waveful Digital Platforms',
    issuer_abn: process.env.COMPANY_ABN ?? '',
    issuer_address: process.env.COMPANY_ADDRESS ?? 'Australia',
    issuer_gst_registered:
      (process.env.COMPANY_GST_REGISTERED ?? 'true').toLowerCase() === 'true',
    notes: invoice.notes,
  });

  const blobPath = `subscription-invoices/${invoice.id}/${invoice.invoice_number}.pdf`;
  await uploadToBlob(blobPath, pdfBuffer, 'application/pdf');

  return prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      pdf_storage_url: blobPath,
      pdf_generated_at: new Date(),
    },
  });
}
