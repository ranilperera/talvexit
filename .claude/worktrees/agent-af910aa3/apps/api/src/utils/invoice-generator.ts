import PDFDocument from 'pdfkit';

// ─── InvoiceData ──────────────────────────────────────────────────────────────

export interface InvoiceData {
  invoice_number:   string;
  order_id:         string;
  issued_date:      Date;
  // Customer
  customer_name:    string;
  customer_email:   string;
  // Contractor
  contractor_name:  string;
  contractor_email: string;
  contractor_abn?:  string;
  // Service
  task_title:       string;
  domain:           string;
  scope_summary:    string[];
  completed_at:     Date;
  // Pricing — always AUD
  price_aud:        number;
  tax_amount_aud:   number;
  total_amount_aud: number;
  // Payout (contractor copy)
  commission_rate?: number;
  net_payout_aud?:  number;
  // Platform
  platform_name:    string;
  platform_abn:     string;
  platform_address: string;
}

// ─── generateInvoicePdf ───────────────────────────────────────────────────────

export async function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 60, right: 60 },
    });

    const buffers: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const PAGE_WIDTH = 595.28;
    const CONTENT_WIDTH = PAGE_WIDTH - 120;
    const COL2_X = 350;

    // ─── HEADER ───────────────────────────────────────────────────────────────

    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .fillColor('#1a1a2e')
      .text(data.platform_name, 60, 50);

    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#666666')
      .text(data.platform_address, 60, 78)
      .text(`ABN: ${data.platform_abn}`, 60, 90);

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
      .text(`Date: ${data.issued_date.toLocaleDateString('en-AU')}`, COL2_X, 102, {
        align: 'right',
        width: PAGE_WIDTH - COL2_X - 60,
      });

    doc.moveTo(60, 125).lineTo(PAGE_WIDTH - 60, 125).strokeColor('#e0e0e0').lineWidth(1).stroke();

    // ─── BILL TO / FROM ───────────────────────────────────────────────────────

    let y = 145;

    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#999999')
      .text('BILL TO', 60, y)
      .text('SERVICE PROVIDED BY', COL2_X, y);

    y += 16;

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#1a1a2e')
      .text(data.customer_name, 60, y)
      .text(data.contractor_name, COL2_X, y);

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#444444')
      .text(data.customer_email, 60, y + 14)
      .text(data.contractor_email, COL2_X, y + 14);

    if (data.contractor_abn) {
      doc.text(`ABN: ${data.contractor_abn}`, COL2_X, y + 28);
    }

    y += 60;

    // ─── SERVICE DETAILS ──────────────────────────────────────────────────────

    doc.moveTo(60, y).lineTo(PAGE_WIDTH - 60, y).strokeColor('#e0e0e0').stroke();

    y += 20;

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a1a2e').text('Services Rendered', 60, y);

    y += 20;

    doc.rect(60, y, CONTENT_WIDTH, 28).fillColor('#f5f5f5').fill();

    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#666666')
      .text('DESCRIPTION', 68, y + 8)
      .text('DOMAIN', 340, y + 8)
      .text('AMOUNT (AUD)', 440, y + 8, { width: 95, align: 'right' });

    y += 28;

    doc.rect(60, y, CONTENT_WIDTH, 50).fillColor('#ffffff').fill();

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#1a1a2e')
      .text(data.task_title, 68, y + 8, { width: 260 });

    doc.fontSize(8).font('Helvetica').fillColor('#666666').text(data.domain, 340, y + 8);

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#1a1a2e')
      .text(`$${data.price_aud.toFixed(2)}`, 440, y + 14, { width: 95, align: 'right' });

    y += 50;

    if (data.scope_summary.length > 0) {
      doc.fontSize(8).font('Helvetica').fillColor('#666666');

      data.scope_summary.slice(0, 4).forEach((item, i) => {
        doc.text(`• ${item}`, 68, y + i * 13, { width: 390 });
      });
      y += Math.min(data.scope_summary.length, 4) * 13 + 10;
    }

    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#999999')
      .text(`Service completed: ${data.completed_at.toLocaleDateString('en-AU')}`, 68, y);

    y += 30;

    // ─── TOTALS ───────────────────────────────────────────────────────────────

    doc.moveTo(60, y).lineTo(PAGE_WIDTH - 60, y).strokeColor('#e0e0e0').stroke();

    y += 16;

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#444444')
      .text('Subtotal (ex. GST)', 300, y, { width: 145, align: 'right' })
      .text(`$${data.price_aud.toFixed(2)}`, 450, y, { width: 85, align: 'right' });

    y += 18;

    doc
      .text('GST (10%)', 300, y, { width: 145, align: 'right' })
      .text(`$${data.tax_amount_aud.toFixed(2)}`, 450, y, { width: 85, align: 'right' });

    y += 18;

    doc.rect(295, y - 4, 245, 26).fillColor('#1a1a2e').fill();

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#ffffff')
      .text('TOTAL (AUD)', 300, y + 2, { width: 145, align: 'right' })
      .text(`$${data.total_amount_aud.toFixed(2)}`, 450, y + 2, { width: 85, align: 'right' });

    y += 40;

    // ─── ORDER REFERENCE ──────────────────────────────────────────────────────

    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#999999')
      .text(`Order reference: ${data.order_id}`, 60, y);

    // ─── FOOTER ───────────────────────────────────────────────────────────────

    doc.moveTo(60, 760).lineTo(PAGE_WIDTH - 60, 760).strokeColor('#e0e0e0').stroke();

    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor('#aaaaaa')
      .text(
        `This invoice was generated by ${data.platform_name}. ` +
          `Payment was processed via Stripe and held in escrow until ` +
          `service delivery was confirmed. ` +
          `GST registered under ABN ${data.platform_abn}.`,
        60,
        770,
        { width: CONTENT_WIDTH, align: 'center' },
      );

    doc.end();
  });
}

// ─── generateInvoiceNumber ────────────────────────────────────────────────────

export function generateInvoiceNumber(orderId: string): string {
  const year = new Date().getFullYear();
  const suffix = orderId.slice(-6).toUpperCase();
  return `INV-${year}-${suffix}`;
}
