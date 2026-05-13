// Shared ATO-compliant invoice PDF template.
//
// Used by both:
//   - apps/api/src/services/service-invoice-pdf.service.ts (B2B direct)
//   - apps/api/src/services/tender-contract-payment.service.ts (tender)
//
// The two callers map their own data into the InvoiceRenderInput shape
// below; this module owns the layout, the title-conditional logic, GST
// treatment text, payment instructions block, and the PAID/OVERDUE badge.
//
// Compliance notes — keep these in mind when editing:
//   • The title is "TAX INVOICE" only when the issuer is GST-registered.
//     Non-GST suppliers and overseas suppliers must say "INVOICE".
//   • When GST is not 10%, the reason must be stated (ATO Ruling
//     GSTR 2013/1). Free-form string passed in via `gst_treatment_reason`.
//   • For invoices > $1,000 AUD, the recipient must have a name + ABN
//     OR a name + address. We always render whatever's available.
//   • Payment instructions belong on the invoice itself — a customer
//     forwarding the PDF to AP shouldn't have to chase bank details
//     separately.

import PDFDocument from 'pdfkit';

export interface InvoiceLineItem {
  description: string;
  detail?: string;        // optional smaller secondary line under the main text
  quantity: number;
  unit_amount_cents: number;
}

export interface InvoicePaymentInstructionLine {
  label: string;
  value: string;
}

export interface InvoiceRenderInput {
  // ── Document meta ─────────────────────────────────────────────────────
  invoice_number: string;
  status: 'SENT' | 'AWAITING_PAYMENT' | 'PAYMENT_REPORTED' | 'PAID' | 'VOID' | string;
  issued_date: Date;
  due_date: Date | null;
  paid_date: Date | null;
  service_period_start: Date | null;
  service_period_end: Date | null;
  customer_po_number: string | null;

  // ── Issuer (supplier) ─────────────────────────────────────────────────
  issuer_name: string;            // legal entity name preferred
  issuer_trading_name: string | null;
  issuer_email: string | null;
  issuer_phone: string | null;
  issuer_abn: string | null;
  issuer_acn: string | null;
  issuer_gst_registered: boolean;
  issuer_address_lines: string[]; // pre-computed list — empty strings filtered

  // ── Recipient (customer) ──────────────────────────────────────────────
  recipient_name: string;
  recipient_email: string | null;
  recipient_abn: string | null;
  recipient_address_lines: string[];

  // ── Engagement reference ──────────────────────────────────────────────
  // Free-form key/value rows shown in a small "ENGAGEMENT" block below
  // the customer reference, e.g. tender ID, contract ID, project name.
  engagement_refs: Array<{ label: string; value: string }>;

  // ── Items + totals ────────────────────────────────────────────────────
  line_items: InvoiceLineItem[];
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  // Mandatory text describing the GST treatment. Examples:
  //   "GST 10% applied"
  //   "Supplier not registered for GST"
  //   "GST-free export of services (s38-190 GST Act)"
  //   "Reverse-charge applies — recipient liable for GST"
  gst_treatment_reason: string;

  // ── Payment instructions ──────────────────────────────────────────────
  payment_instructions: InvoicePaymentInstructionLine[];
  payment_reference: string;       // what the customer should put on their transfer
  payment_terms: string | null;    // e.g. "Net 14"

  // ── Misc ──────────────────────────────────────────────────────────────
  notes: string | null;
  footer_text: string | null;       // platform attribution / disclaimer
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT = 60;
const RIGHT = PAGE_WIDTH - 60;
const CONTENT_WIDTH = RIGHT - LEFT;

function fmtMoney(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateLong(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function buildInvoicePdf(data: InvoiceRenderInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: LEFT, right: 60 },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const isPaid = data.paid_date !== null && data.status === 'PAID';
    const isOverdue =
      !isPaid &&
      data.due_date !== null &&
      data.due_date < new Date();
    const titleText = data.issuer_gst_registered ? 'TAX INVOICE' : 'INVOICE';

    // ── HEADER ────────────────────────────────────────────────────────────
    // Left column: supplier identity. Right column: invoice meta + status.

    let lY = 50;
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .fillColor('#0f172a')
      .text(data.issuer_name, LEFT, lY, { width: 280 });
    lY += 26;

    if (data.issuer_trading_name && data.issuer_trading_name !== data.issuer_name) {
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#64748b')
        .text(`Trading as: ${data.issuer_trading_name}`, LEFT, lY, { width: 280 });
      lY += 12;
    }

    doc.fontSize(8).font('Helvetica').fillColor('#64748b');
    if (data.issuer_abn) {
      doc.text(`ABN ${data.issuer_abn}`, LEFT, lY, { width: 280 });
      lY += 11;
    }
    if (data.issuer_acn) {
      doc.text(`ACN ${data.issuer_acn}`, LEFT, lY, { width: 280 });
      lY += 11;
    }
    if (!data.issuer_abn && !data.issuer_gst_registered) {
      // Overseas / no-ABN supplier — explicit so the customer's AP team
      // knows this isn't a Tax Invoice and doesn't claim GST credits.
      doc.text('No ABN — overseas supplier', LEFT, lY, { width: 280 });
      lY += 11;
    }
    for (const line of data.issuer_address_lines) {
      if (line.trim()) {
        doc.text(line, LEFT, lY, { width: 280 });
        lY += 11;
      }
    }
    if (data.issuer_email) {
      doc.text(data.issuer_email, LEFT, lY, { width: 280 });
      lY += 11;
    }
    if (data.issuer_phone) {
      doc.text(data.issuer_phone, LEFT, lY, { width: 280 });
      lY += 11;
    }

    // Right column — title + meta
    let rY = 50;
    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .fillColor('#0f172a')
      .text(titleText, 350, rY, { align: 'right', width: RIGHT - 350 });
    rY += 30;

    const metaRows: Array<{ label: string; value: string }> = [
      { label: 'Invoice #', value: data.invoice_number },
      { label: 'Issued',    value: fmtDate(data.issued_date) },
    ];
    if (data.due_date) metaRows.push({ label: 'Due', value: fmtDate(data.due_date) });
    if (data.payment_terms) metaRows.push({ label: 'Terms', value: data.payment_terms });
    metaRows.push({ label: 'Currency', value: data.currency });

    doc.fontSize(9).font('Helvetica').fillColor('#475569');
    for (const r of metaRows) {
      doc.text(`${r.label}: ${r.value}`, 350, rY, {
        align: 'right',
        width: RIGHT - 350,
      });
      rY += 12;
    }

    // Status badge — PAID, OVERDUE, or skip when neither
    if (isPaid) {
      rY += 4;
      doc
        .roundedRect(450, rY, RIGHT - 450, 22, 4)
        .fillColor('#16a34a')
        .fill();
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#ffffff')
        .text(`PAID ${fmtDate(data.paid_date)}`, 450, rY + 6, {
          align: 'center',
          width: RIGHT - 450,
        });
      rY += 26;
    } else if (isOverdue) {
      rY += 4;
      doc
        .roundedRect(450, rY, RIGHT - 450, 22, 4)
        .fillColor('#dc2626')
        .fill();
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#ffffff')
        .text('OVERDUE', 450, rY + 6, {
          align: 'center',
          width: RIGHT - 450,
        });
      rY += 26;
    }

    let y = Math.max(lY, rY) + 12;

    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#e2e8f0').lineWidth(1).stroke();
    y += 18;

    // ── BILL TO + REFERENCES (two columns) ─────────────────────────────────
    const COL_GAP = 30;
    const COL_W = (CONTENT_WIDTH - COL_GAP) / 2;

    // Left column header
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#94a3b8')
      .text('BILL TO', LEFT, y);

    // Right column header
    if (data.customer_po_number || data.engagement_refs.length > 0) {
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#94a3b8')
        .text('REFERENCE', LEFT + COL_W + COL_GAP, y);
    }
    y += 14;

    // Left column body
    let lcY = y;
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#0f172a')
      .text(data.recipient_name, LEFT, lcY, { width: COL_W });
    lcY += 14;
    doc.fontSize(9).font('Helvetica').fillColor('#475569');
    if (data.recipient_abn) {
      doc.text(`ABN ${data.recipient_abn}`, LEFT, lcY, { width: COL_W });
      lcY += 12;
    }
    for (const line of data.recipient_address_lines) {
      if (line.trim()) {
        doc.text(line, LEFT, lcY, { width: COL_W });
        lcY += 12;
      }
    }
    if (data.recipient_email) {
      doc.text(data.recipient_email, LEFT, lcY, { width: COL_W });
      lcY += 12;
    }

    // Right column body — customer PO + engagement refs
    let rcY = y;
    const refX = LEFT + COL_W + COL_GAP;
    doc.fontSize(9).font('Helvetica').fillColor('#475569');
    if (data.customer_po_number) {
      doc.font('Helvetica-Bold').fillColor('#0f172a').text('Your PO: ', refX, rcY, { continued: true });
      doc.font('Helvetica').fillColor('#475569').text(data.customer_po_number);
      rcY += 14;
    }
    if (data.service_period_start || data.service_period_end) {
      const periodText =
        data.service_period_start && data.service_period_end
          ? `${fmtDate(data.service_period_start)} – ${fmtDate(data.service_period_end)}`
          : fmtDate(data.service_period_start ?? data.service_period_end);
      doc.font('Helvetica-Bold').fillColor('#0f172a').text('Period: ', refX, rcY, { continued: true });
      doc.font('Helvetica').fillColor('#475569').text(periodText);
      rcY += 14;
    }
    for (const ref of data.engagement_refs) {
      doc.font('Helvetica-Bold').fillColor('#0f172a').text(`${ref.label}: `, refX, rcY, { continued: true });
      doc.font('Helvetica').fillColor('#475569').text(ref.value);
      rcY += 14;
    }

    y = Math.max(lcY, rcY) + 12;

    // ── LINE ITEMS TABLE ───────────────────────────────────────────────────
    doc.rect(LEFT, y, CONTENT_WIDTH, 22).fillColor('#f1f5f9').fill();
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#475569')
      .text('DESCRIPTION', LEFT + 8, y + 7, { width: 270 })
      .text('QTY', LEFT + 290, y + 7, { width: 30, align: 'right' })
      .text('RATE', LEFT + 330, y + 7, { width: 70, align: 'right' })
      .text('AMOUNT', LEFT + 410, y + 7, { width: 65, align: 'right' });
    y += 22;

    for (const item of data.line_items) {
      const rowHeight = item.detail ? 32 : 22;
      const amount = Math.round(item.unit_amount_cents * item.quantity);
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#0f172a')
        .text(item.description, LEFT + 8, y + 6, { width: 270 });
      if (item.detail) {
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#64748b')
          .text(item.detail, LEFT + 8, y + 19, { width: 270 });
      }
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#0f172a')
        .text(String(item.quantity), LEFT + 290, y + 6, { width: 30, align: 'right' })
        .text(fmtMoney(item.unit_amount_cents, data.currency), LEFT + 330, y + 6, { width: 70, align: 'right' })
        .text(fmtMoney(amount, data.currency), LEFT + 410, y + 6, { width: 65, align: 'right' });
      y += rowHeight;
    }

    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#e2e8f0').stroke();
    y += 12;

    // ── TOTALS BLOCK ──────────────────────────────────────────────────────
    const TOTAL_LABEL_X = 320;
    const TOTAL_VAL_X = 460;

    doc.fontSize(10).font('Helvetica').fillColor('#475569')
      .text('Subtotal (ex GST)', TOTAL_LABEL_X, y, { width: 130, align: 'right' })
      .text(fmtMoney(data.subtotal_cents, data.currency), TOTAL_VAL_X, y, { width: 75, align: 'right' });
    y += 16;

    if (data.tax_cents > 0) {
      doc
        .text('GST 10%', TOTAL_LABEL_X, y, { width: 130, align: 'right' })
        .text(fmtMoney(data.tax_cents, data.currency), TOTAL_VAL_X, y, { width: 75, align: 'right' });
      y += 16;
    } else {
      doc
        .fontSize(9)
        .font('Helvetica-Oblique')
        .fillColor('#64748b')
        .text(data.gst_treatment_reason, TOTAL_LABEL_X, y, {
          width: TOTAL_VAL_X + 75 - TOTAL_LABEL_X,
          align: 'right',
        });
      y += 14;
    }

    doc.rect(TOTAL_LABEL_X, y, TOTAL_VAL_X + 75 - TOTAL_LABEL_X, 28).fillColor('#0f172a').fill();
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#ffffff')
      .text(`TOTAL (${data.currency})`, TOTAL_LABEL_X + 4, y + 9, { width: 130, align: 'right' })
      .text(fmtMoney(data.total_cents, data.currency), TOTAL_VAL_X, y + 9, { width: 75 - 4, align: 'right' });
    y += 36;

    // GST treatment note when GST IS charged — still helpful to render the
    // reason ("GST 10% applied") so the document is self-documenting.
    if (data.tax_cents > 0 && data.gst_treatment_reason && data.gst_treatment_reason !== 'GST 10% applied') {
      doc.fontSize(9).font('Helvetica-Oblique').fillColor('#64748b')
        .text(data.gst_treatment_reason, LEFT, y, { width: CONTENT_WIDTH, align: 'right' });
      y += 14;
    }

    // ── PAYMENT INSTRUCTIONS ──────────────────────────────────────────────
    if (data.payment_instructions.length > 0 && !isPaid) {
      y += 8;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#94a3b8')
        .text('PAYMENT INSTRUCTIONS', LEFT, y);
      y += 14;

      doc.fontSize(9).font('Helvetica').fillColor('#0f172a');
      for (const line of data.payment_instructions) {
        doc.font('Helvetica-Bold').fillColor('#475569').text(line.label, LEFT, y, {
          width: 130, continued: false,
        });
        doc.font('Helvetica').fillColor('#0f172a').text(line.value, LEFT + 140, y, {
          width: CONTENT_WIDTH - 140,
        });
        y += 13;
      }

      // Payment reference — highlighted so the customer doesn't miss it
      y += 4;
      doc.rect(LEFT, y, CONTENT_WIDTH, 26).fillColor('#fef3c7').fill();
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#78350f')
        .text('Payment reference', LEFT + 10, y + 8, { width: 130 });
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a')
        .text(data.payment_reference, LEFT + 140, y + 8, { width: CONTENT_WIDTH - 150 });
      y += 32;
    }

    // ── NOTES ─────────────────────────────────────────────────────────────
    if (data.notes) {
      y += 4;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#94a3b8').text('NOTES', LEFT, y);
      y += 12;
      doc.fontSize(9).font('Helvetica').fillColor('#475569')
        .text(data.notes, LEFT, y, { width: CONTENT_WIDTH });
      y += doc.heightOfString(data.notes, { width: CONTENT_WIDTH }) + 8;
    }

    // ── FOOTER ────────────────────────────────────────────────────────────
    const footerText = data.footer_text ??
      'TalvexIT (operated by Waveful Digital Platforms) is a technology platform. ' +
      'Payments are made directly between clients and service providers. ' +
      'TalvexIT is not a party to this transaction.';

    doc.moveTo(LEFT, PAGE_HEIGHT - 80).lineTo(RIGHT, PAGE_HEIGHT - 80)
      .strokeColor('#e2e8f0').stroke();
    doc.fontSize(7).font('Helvetica').fillColor('#94a3b8')
      .text(footerText, LEFT, PAGE_HEIGHT - 70, { width: CONTENT_WIDTH, align: 'center' });

    // Service-period footer — also referenced in the right-hand column,
    // but ATO accrual auditors expect it to be in the body when present.
    if (data.service_period_start || data.service_period_end) {
      doc.fontSize(7).font('Helvetica-Oblique').fillColor('#94a3b8')
        .text(
          `Service period: ${fmtDateLong(data.service_period_start)} – ${fmtDateLong(data.service_period_end)}`,
          LEFT,
          PAGE_HEIGHT - 50,
          { width: CONTENT_WIDTH, align: 'center' },
        );
    }

    doc.end();
  });
}

// ─── Tax decision (single source of truth lives in @onys/shared/tax) ─────────
// AU_GST_RATE, decideGstTreatment() and computeGstTreatmentReason() are all
// defined in packages/shared/src/tax/. Re-exported from here so existing
// imports continue to resolve. Client previews import the same functions
// from @onys/shared directly. There is no other place the GST rate or the
// charge decision is encoded.

export {
  AU_GST_RATE,
  decideGstTreatment,
  computeGstTreatmentReason,
} from '@onys/shared';
export type { GstDecisionInput, GstDecision } from '@onys/shared';

// Build address lines from the standard billing_* fields used across User
// and ConsultingCompany. Empty strings filtered by the renderer.
export function addressLines(entity: {
  billing_address_1?: string | null;
  billing_address_2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_postcode?: string | null;
  billing_country?: string | null;
}): string[] {
  const cityLine = [entity.billing_city, entity.billing_state, entity.billing_postcode]
    .filter(Boolean)
    .join(' ');
  return [
    entity.billing_address_1 ?? '',
    entity.billing_address_2 ?? '',
    cityLine,
    entity.billing_country ?? '',
  ].filter((l) => l.trim() !== '');
}

// Build a payment_instructions list from the payment_methods JSON we already
// store on User (and now plumb into the tender-contract flow).
export function buildPaymentInstructions(
  methods: Record<string, unknown> | null,
): InvoicePaymentInstructionLine[] {
  if (!methods) return [];
  const out: InvoicePaymentInstructionLine[] = [];

  const bankAu = methods['bank_au'] as
    | { enabled?: boolean; bsb?: string; account_number?: string; account_name?: string; bank_name?: string }
    | undefined;
  if (bankAu?.enabled) {
    if (bankAu.bank_name) out.push({ label: 'Bank (AU)', value: bankAu.bank_name });
    if (bankAu.bsb) out.push({ label: 'BSB', value: bankAu.bsb });
    if (bankAu.account_number) out.push({ label: 'Account #', value: bankAu.account_number });
    if (bankAu.account_name) out.push({ label: 'Account name', value: bankAu.account_name });
  }

  const swift = methods['bank_swift'] as
    | { enabled?: boolean; bank_name?: string; swift_code?: string; iban?: string; account_number?: string; account_name?: string; bank_address?: string }
    | undefined;
  if (swift?.enabled) {
    if (swift.bank_name) out.push({ label: 'Bank (SWIFT)', value: swift.bank_name });
    if (swift.swift_code) out.push({ label: 'SWIFT/BIC', value: swift.swift_code });
    if (swift.iban) out.push({ label: 'IBAN', value: swift.iban });
    if (swift.account_number) out.push({ label: 'Account #', value: swift.account_number });
    if (swift.account_name) out.push({ label: 'Account name', value: swift.account_name });
  }

  const payid = methods['payid'] as { enabled?: boolean; email?: string } | undefined;
  if (payid?.enabled && payid.email) {
    out.push({ label: 'PayID', value: payid.email });
  }

  const paypal = methods['paypal'] as { enabled?: boolean; email?: string } | undefined;
  if (paypal?.enabled && paypal.email) {
    out.push({ label: 'PayPal', value: paypal.email });
  }

  const wise = methods['wise'] as { enabled?: boolean; email?: string; currency?: string } | undefined;
  if (wise?.enabled && wise.email) {
    out.push({ label: wise.currency ? `Wise (${wise.currency})` : 'Wise', value: wise.email });
  }

  const other = methods['other'] as { enabled?: boolean; description?: string } | undefined;
  if (other?.enabled && other.description) {
    out.push({ label: 'Other', value: other.description });
  }

  return out;
}
