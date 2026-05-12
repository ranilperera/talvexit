'use client';

import { format } from 'date-fns';
import { BRAND } from '@/lib/brand';

// ─── Legal notices — edit here to update all invoice copies ───────────────────

const LEGAL_NOTICES = {
  paymentTerms: (days: number) =>
    `Payment is due within ${days} days of the invoice date. Late payments may incur interest at the rate prescribed under the Late Payment of Commercial Debts Act.`,

  taxInvoiceNote:
    'This document is a Tax Invoice for GST purposes under the A New Tax System (Goods and Services Tax) Act 1999 (Cth). Please retain for your records.',

  standardNote:
    'This document is an invoice issued by the platform billing agent on behalf of the service provider. GST is not applicable.',

  crossBorderNote:
    'This is a cross-border supply. GST may not apply pursuant to Division 38 of the GST Act. Customers outside Australia should check their local tax obligations.',

  withholdingNote: (rate: string) =>
    `Withholding tax of ${rate}% has been applied to this invoice in accordance with applicable tax legislation. The net amount payable reflects the withholding deduction.`,

  gstFreeNote:
    'This supply is GST-free under the A New Tax System (Goods and Services Tax) Act 1999 (Cth).',

  disputeClause:
    'Disputes regarding this invoice must be raised in writing within 14 days of the invoice date by contacting support via the platform.',

  platformAgent: (name: string) =>
    `${name} operates as a billing agent and technology platform facilitating the engagement. The underlying service is provided by the contracting party named above.`,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceData {
  id: string;
  invoice_number: string;
  invoice_type_label: string;
  is_tax_invoice: boolean;
  is_cross_border: boolean;
  gst_free: boolean;
  status: string;
  sent_at: string | null;
  paid_at: string | null;
  due_date: string | null;
  created_at: string;
  payment_terms_days: number;

  provider_legal_name: string | null;
  provider_abn: string | null;
  provider_gst_registered: boolean;

  customer_legal_name: string | null;
  customer_abn: string | null;

  billing_agent_name: string | null;

  subtotal_ex_gst_aud: string | null;
  gst_amount_aud: string | null;
  withholding_applied: boolean;
  withholding_amount_aud: string | null;
  withholding_rate: string | null;
  total_aud: string;
  amount_aud: string;
  tax_aud: string;

  pdf_blob_path?: string | null;

  // Order context (optional enrichment)
  order?: {
    task?: { title?: string | null } | null | undefined;
    scope_snapshot?: { title?: string; objective?: string } | null | undefined;
  } | null;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function aud(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return `AUD ${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  try { return format(new Date(value), 'd MMMM yyyy'); } catch { return '—'; }
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    DRAFT:    { label: 'Draft',   color: '#64748B' },
    SENT:     { label: 'Sent',    color: '#F59E0B' },
    PAID:     { label: 'Paid',    color: '#10B981' },
    OVERDUE:  { label: 'Overdue', color: '#EF4444' },
    VOID:     { label: 'Void',    color: '#94A3B8' },
  };
  const s = map[status] ?? { label: status, color: '#64748B' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: '#fff',
      background: s.color,
    }}>
      {s.label}
    </span>
  );
}

// ─── InvoiceDocument ──────────────────────────────────────────────────────────

export default function InvoiceDocument({ invoice }: { invoice: InvoiceData }) {
  const serviceTitle =
    invoice.order?.task?.title ??
    invoice.order?.scope_snapshot?.title ??
    'Professional Services';

  const subtotal = invoice.subtotal_ex_gst_aud ?? invoice.amount_aud;
  const gst = invoice.gst_amount_aud ?? invoice.tax_aud;
  const withholding = invoice.withholding_amount_aud;
  const total = invoice.total_aud;
  const wRate = invoice.withholding_rate
    ? (Number(invoice.withholding_rate) * 100).toFixed(1)
    : '0';

  return (
    <div
      id="invoice-document"
      style={{
        fontFamily: '"DM Sans", "Inter", system-ui, sans-serif',
        background: '#ffffff',
        color: '#0F172A',
        maxWidth: 760,
        margin: '0 auto',
        padding: '48px 48px 64px',
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', color: '#0F172A' }}>
            {BRAND.name}
          </div>
          <div style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>
            {invoice.billing_agent_name ?? BRAND.name}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em', color: '#0F172A' }}>
            {invoice.invoice_type_label}
          </div>
          <div style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>
            #{invoice.invoice_number}
          </div>
          <div style={{ marginTop: 8 }}>
            <StatusPill status={invoice.status} />
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ borderTop: '2px solid #0F172A', marginBottom: 32 }} />

      {/* ── Party grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 36 }}>
        {/* Provider */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 8 }}>
            Service Provider
          </div>
          <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 14 }}>
            {invoice.provider_legal_name ?? '—'}
          </div>
          {invoice.provider_abn && (
            <div style={{ color: '#475569', marginTop: 4 }}>
              ABN: {invoice.provider_abn}
            </div>
          )}
          {invoice.provider_gst_registered && (
            <div style={{ color: '#10B981', fontSize: 12, marginTop: 4, fontWeight: 500 }}>
              GST Registered
            </div>
          )}
        </div>

        {/* Customer */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 8 }}>
            Bill To
          </div>
          <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 14 }}>
            {invoice.customer_legal_name ?? '—'}
          </div>
          {invoice.customer_abn && (
            <div style={{ color: '#475569', marginTop: 4 }}>
              ABN: {invoice.customer_abn}
            </div>
          )}
        </div>
      </div>

      {/* ── Dates grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, background: '#F8FAFC', borderRadius: 10, padding: '16px 20px', marginBottom: 36 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 4 }}>
            Issue Date
          </div>
          <div style={{ fontWeight: 500, color: '#0F172A' }}>{fmtDate(invoice.sent_at ?? invoice.created_at)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 4 }}>
            Due Date
          </div>
          <div style={{ fontWeight: 500, color: invoice.due_date ? '#0F172A' : '#94A3B8' }}>
            {fmtDate(invoice.due_date)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 4 }}>
            Payment Terms
          </div>
          <div style={{ fontWeight: 500, color: '#0F172A' }}>Net {invoice.payment_terms_days} days</div>
        </div>
      </div>

      {/* ── Service line items ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 12 }}>
          Description of Services
        </div>
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', background: '#F1F5F9', padding: '10px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Service</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Amount</div>
          </div>
          {/* Service row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '14px 16px', borderTop: '1px solid #E2E8F0' }}>
            <div>
              <div style={{ fontWeight: 500, color: '#0F172A', fontSize: 14 }}>{serviceTitle}</div>
              {invoice.order?.scope_snapshot?.objective && (
                <div style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>
                  {invoice.order.scope_snapshot.objective}
                </div>
              )}
              {invoice.is_cross_border && (
                <div style={{ color: '#F59E0B', fontSize: 11, marginTop: 4, fontWeight: 500 }}>
                  Cross-border supply — GST export provisions may apply
                </div>
              )}
            </div>
            <div style={{ fontWeight: 500, color: '#0F172A', textAlign: 'right', whiteSpace: 'nowrap' }}>
              {aud(subtotal)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Totals ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
        <div style={{ width: 300 }}>
          {/* Subtotal */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E2E8F0' }}>
            <span style={{ color: '#475569' }}>
              {invoice.is_tax_invoice ? 'Subtotal (excl. GST)' : 'Subtotal'}
            </span>
            <span style={{ fontWeight: 500 }}>{aud(subtotal)}</span>
          </div>

          {/* GST */}
          {invoice.is_tax_invoice && !invoice.gst_free && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ color: '#475569' }}>GST (10%)</span>
              <span style={{ fontWeight: 500 }}>{aud(gst)}</span>
            </div>
          )}

          {/* GST-free badge */}
          {invoice.gst_free && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ color: '#475569' }}>GST</span>
              <span style={{ color: '#10B981', fontWeight: 500 }}>GST-Free</span>
            </div>
          )}

          {/* Withholding */}
          {invoice.withholding_applied && withholding && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ color: '#475569' }}>Withholding Tax ({wRate}%)</span>
              <span style={{ fontWeight: 500, color: '#EF4444' }}>−{aud(withholding)}</span>
            </div>
          )}

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 6px', marginTop: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Total Due</span>
            <span style={{ fontWeight: 800, fontSize: 17, color: '#0F172A' }}>{aud(total)}</span>
          </div>

          {invoice.paid_at && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span style={{ color: '#10B981', fontSize: 12 }}>Paid on {fmtDate(invoice.paid_at)}</span>
              <span style={{ color: '#10B981', fontWeight: 600, fontSize: 12 }}>✓ PAID</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Legal notices ── */}
      <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 4 }}>
          Legal Notices
        </div>

        {invoice.is_tax_invoice && !invoice.gst_free && (
          <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>
            {LEGAL_NOTICES.taxInvoiceNote}
          </p>
        )}

        {!invoice.is_tax_invoice && (
          <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>
            {LEGAL_NOTICES.standardNote}
          </p>
        )}

        {invoice.gst_free && (
          <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>
            {LEGAL_NOTICES.gstFreeNote}
          </p>
        )}

        {invoice.is_cross_border && (
          <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>
            {LEGAL_NOTICES.crossBorderNote}
          </p>
        )}

        {invoice.withholding_applied && (
          <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>
            {LEGAL_NOTICES.withholdingNote(wRate)}
          </p>
        )}

        <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>
          {LEGAL_NOTICES.paymentTerms(invoice.payment_terms_days)}
        </p>

        <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>
          {LEGAL_NOTICES.disputeClause}
        </p>

        <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>
          {LEGAL_NOTICES.platformAgent(invoice.billing_agent_name ?? BRAND.name)}
        </p>
      </div>
    </div>
  );
}
