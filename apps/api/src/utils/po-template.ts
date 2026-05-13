import { interpolate, parseConfigArray } from '../services/platform-config.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface POTemplateData {
  config: Record<string, string>;

  po_number: string;
  proposal_ref: string;
  order_ref: string;
  generated_date: string;
  template_version: string;

  supplier: {
    legal_name: string;
    trading_name?: string;
    entity_type?: string;
    abn?: string;
    gst_registered: boolean;
    email: string;
    phone?: string;
    address_1?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };

  customer: {
    legal_name?: string;
    full_name: string;
    email: string;
    abn?: string;
    entity_type?: string;
    address_1?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };

  scope: {
    objective?: string;
    in_scope?: string[];
    out_of_scope?: string[];
    assumptions?: string[];
    prerequisites?: string[];
    deliverables?: string[];
  };

  timeline: {
    duration_days?: number;
    hours_min?: number;
    hours_max?: number;
    payment_terms: string;
  };

  pricing: {
    description: string;
    service_fee_aud: number;
    gst_rate: number;
    gst_amount_aud: number;
    total_aud: number;
    currency: string;
    is_tax_invoice: boolean;
  };

  /** Supplier-authored legal terms from the approved proposal. When set,
   *  rendered as a single multi-paragraph block in place of the numbered
   *  platform-config po_terms list. */
  legal_terms?: string | null;

  approval: {
    approved_by: string;
    approved_at: string;
    ip_address: string;
    method: string;
  };
}

// ─── HTML escape ──────────────────────────────────────────────────────────────

function esc(str: unknown): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Format AUD number ────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── Scope section config ─────────────────────────────────────────────────────

const SCOPE_SECTIONS = [
  {
    key: 'in_scope' as const,
    label: 'In Scope',
    color: '#00C2A8',
    bg: '#e6f9f7',
    icon: `<polyline points="20 6 9 17 4 12" stroke="#00C2A8" stroke-width="2.5" fill="none"/>`,
  },
  {
    key: 'out_of_scope' as const,
    label: 'Out of Scope',
    color: '#ef4444',
    bg: '#fef2f2',
    icon: `<circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="2" fill="none"/>
           <line x1="15" y1="9" x2="9" y2="15" stroke="#ef4444" stroke-width="2"/>
           <line x1="9" y1="9" x2="15" y2="15" stroke="#ef4444" stroke-width="2"/>`,
  },
  {
    key: 'assumptions' as const,
    label: 'Assumptions',
    color: '#3b82f6',
    bg: '#eff6ff',
    icon: `<circle cx="12" cy="12" r="10" stroke="#3b82f6" stroke-width="2" fill="none"/>
           <line x1="12" y1="8" x2="12" y2="12" stroke="#3b82f6" stroke-width="2"/>
           <line x1="12" y1="16" x2="12.01" y2="16" stroke="#3b82f6" stroke-width="3"/>`,
  },
  {
    key: 'prerequisites' as const,
    label: 'Prerequisites (Customer Provides)',
    color: '#d97706',
    bg: '#fffbeb',
    icon: `<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            stroke="#d97706" stroke-width="2" fill="none"/>
           <line x1="12" y1="9" x2="12" y2="13" stroke="#d97706" stroke-width="2"/>`,
  },
  {
    key: 'deliverables' as const,
    label: 'Deliverables',
    color: '#7c3aed',
    bg: '#f5f3ff',
    icon: `<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"
            stroke="#7c3aed" stroke-width="2" fill="none"/>
           <polyline points="13 2 13 9 20 9" stroke="#7c3aed" stroke-width="2" fill="none"/>`,
  },
] as const;

// ─── Render one scope section block ──────────────────────────────────────────

function renderScopeSection(
  section: (typeof SCOPE_SECTIONS)[number],
  items: string[],
): string {
  if (!items.length) return '';

  const itemsHtml = items
    .map(
      (item) => `
    <li style="display:flex;gap:8px;align-items:flex-start;margin-bottom:5px;">
      <span style="display:block;width:6px;height:6px;border-radius:50%;
        background:${section.color};flex-shrink:0;margin-top:5px;"></span>
      <span style="font-size:12px;color:#374151;line-height:1.6;">${esc(item)}</span>
    </li>`,
    )
    .join('');

  return `
  <div style="border:0.5px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:6px;">
    <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;
      background:${section.bg};border-bottom:0.5px solid #e2e8f0;">
      <div style="width:20px;height:20px;border-radius:5px;background:rgba(255,255,255,0.7);
        display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="12" height="12" viewBox="0 0 24 24">${section.icon}</svg>
      </div>
      <span style="font-size:11px;font-weight:700;color:#374151;">${section.label}</span>
      <span style="margin-left:auto;font-size:10px;color:#94a3b8;">
        ${items.length} item${items.length !== 1 ? 's' : ''}
      </span>
    </div>
    <div style="padding:10px 12px;">
      <ul style="list-style:none;margin:0;padding:0;">${itemsHtml}</ul>
    </div>
  </div>`;
}

// ─── generatePOHtml ───────────────────────────────────────────────────────────

export function generatePOHtml(data: POTemplateData): string {
  const cfg = data.config;

  const vars: Record<string, string> = {
    platform_name: cfg.platform_name ?? 'TalvexIT',
    platform_legal_name: cfg.platform_legal_name ?? 'Waveful Digital Platforms',
    platform_abn: cfg.platform_abn ?? 'TBA',
    platform_address: cfg.platform_address ?? '',
    platform_support_email: cfg.platform_support_email ?? 'support@onsys.com.au',
    platform_legal_email: cfg.platform_legal_email ?? 'legal@onsys.com.au',
    platform_website: cfg.platform_website ?? '',
    payment_terms_days: cfg.po_payment_terms_days ?? '14',
  };

  const accentColor = cfg.po_header_accent_color ?? '#00C2A8';
  const darkColor = cfg.po_header_dark_color ?? '#0F1117';

  const agentNotice = interpolate(cfg.po_agent_notice ?? '', vars);
  const legalTerms = parseConfigArray(cfg.po_terms).map((t) => interpolate(t, vars));
  const approvalStatement = interpolate(cfg.po_approval_statement ?? '', vars);
  const footerText = interpolate(cfg.po_footer_text ?? '', vars).replace(/\\n/g, '<br>');
  const gstNote = cfg.po_gst_note ?? '';

  // Prefer supplier-authored legal terms from the proposal when present —
  // they're what the parties agreed at approval time. Otherwise fall back
  // to the platform-config po_terms numbered list (default service
  // agreement). Supplier text is rendered as a single multi-paragraph
  // block (preserving line breaks); platform terms render numbered.
  const supplierLegalTerms = (data.legal_terms ?? '').trim();
  const termsHtml = supplierLegalTerms
    ? `<pre style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
         font-size:11px;color:#475569;line-height:1.55;white-space:pre-wrap;
         margin:0;">${esc(supplierLegalTerms)}</pre>`
    : legalTerms
        .map(
          (term, i) => `
    <div style="display:flex;gap:8px;font-size:11px;color:#475569;margin-bottom:5px;line-height:1.5;">
      <span style="font-weight:700;color:#0F1117;flex-shrink:0;min-width:18px;">${i + 1}.</span>
      <span>${esc(term)}</span>
    </div>`,
        )
        .join('');

  const scopeSectionsHtml = SCOPE_SECTIONS.map((s) =>
    renderScopeSection(s, (data.scope[s.key] ?? []).filter(Boolean)),
  ).join('');

  const refCells = [
    ['PO Number', data.po_number],
    ['Proposal Ref', data.proposal_ref],
    ['Order Ref', data.order_ref],
  ]
    .map(
      ([label, value]) => `
      <td style="width:33%;padding:8px;background:#f8fafc;border-radius:6px;">
        <div style="font-size:10px;color:#94a3b8;margin-bottom:2px;">${esc(label)}</div>
        <div style="font-size:12px;font-weight:600;color:#0F1117;font-family:monospace;">${esc(value)}</div>
      </td>
      <td style="width:8px;"></td>`,
    )
    .join('');

  const timelineCells = [
    ['Duration', data.timeline.duration_days ? `${data.timeline.duration_days} days` : '—'],
    [
      'Estimated Hours',
      data.timeline.hours_min != null
        ? `${data.timeline.hours_min}–${data.timeline.hours_max ?? data.timeline.hours_min} hrs`
        : '—',
    ],
    ['Payment Terms', data.timeline.payment_terms],
  ]
    .map(
      ([label, value]) => `
      <td style="width:33%;padding:8px;background:#f8fafc;border-radius:6px;">
        <div style="font-size:10px;color:#94a3b8;margin-bottom:2px;">${esc(label)}</div>
        <div style="font-size:12px;font-weight:600;color:#0F1117;">${esc(value)}</div>
      </td>
      <td style="width:8px;"></td>`,
    )
    .join('');

  const customerDisplay = esc(data.customer.legal_name ?? data.customer.full_name);
  const customerContact =
    data.customer.legal_name && data.customer.legal_name !== data.customer.full_name
      ? `Contact: ${esc(data.customer.full_name)}<br>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width">
  <title>${esc(data.po_number)} — Purchase Order</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      color: #111827;
      background: white;
      font-size: 13px;
      line-height: 1.5;
    }
    .page { max-width: 794px; margin: 0 auto; padding: 40px 48px; background: white; }
    @media print {
      .page { padding: 24px 32px; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <table style="width:100%;margin-bottom:16px;">
    <tr>
      <td style="vertical-align:top;">
        <div style="font-size:20px;font-weight:700;color:${darkColor};letter-spacing:-0.02em;">
          ${esc(vars.platform_name)}<span style="color:${accentColor};">.</span>
        </div>
        <div style="font-size:10px;color:#64748b;margin-top:2px;">
          ${esc(vars.platform_legal_name)} · ABN: ${esc(vars.platform_abn)}
        </div>
        <div style="font-size:10px;color:#94a3b8;">Platform operator — not a billing or payment agent</div>
      </td>
      <td style="text-align:right;vertical-align:top;">
        <div style="font-size:24px;font-weight:700;color:${darkColor};
          letter-spacing:0.04em;line-height:1.1;">PURCHASE ORDER</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;">${esc(data.po_number)}</div>
        <div style="font-size:11px;color:#64748b;">Date: ${esc(data.generated_date)}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Template ${esc(data.template_version)}</div>
      </td>
    </tr>
  </table>

  <!-- APPROVAL STAMP -->
  <div style="display:flex;align-items:center;justify-content:center;gap:8px;
    background:#e6f9f3;border:1.5px solid ${accentColor};border-radius:6px;
    padding:7px 16px;margin-bottom:14px;">
    <div style="width:8px;height:8px;border-radius:50%;background:${accentColor};"></div>
    <span style="font-size:11px;font-weight:700;color:#085041;letter-spacing:0.1em;">
      ELECTRONICALLY APPROVED
    </span>
  </div>

  <!-- AGENT NOTICE -->
  ${
    agentNotice.trim()
      ? `<div style="background:#f0fdf9;border:1px solid #9FE1CB;border-left:3px solid ${accentColor};
    border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:11px;
    color:#085041;line-height:1.6;">
    <strong>Agent Notice:</strong> ${esc(agentNotice)}
  </div>`
      : ''
  }

  <!-- PARTIES -->
  <table style="width:100%;margin-bottom:14px;border-collapse:collapse;">
    <tr>
      <td style="width:50%;vertical-align:top;padding:12px;border:0.5px solid #e2e8f0;
        border-radius:8px 0 0 8px;background:#fafafa;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;
          letter-spacing:0.1em;color:#94a3b8;margin-bottom:6px;">Supplier (Provider)</div>
        <div style="font-size:13px;font-weight:700;color:#0F1117;margin-bottom:4px;">
          ${esc(data.supplier.legal_name)}
        </div>
        <div style="font-size:11px;color:#64748b;line-height:1.8;">
          ${data.supplier.trading_name ? `Trading as: ${esc(data.supplier.trading_name)}<br>` : ''}
          ${data.supplier.entity_type ? `Entity: ${esc(data.supplier.entity_type)}<br>` : ''}
          ${data.supplier.abn ? `ABN: ${esc(data.supplier.abn)}<br>` : ''}
          GST Registered: ${data.supplier.gst_registered ? 'Yes' : 'No'}<br>
          Email: ${esc(data.supplier.email)}<br>
          ${data.supplier.phone ? `Phone: ${esc(data.supplier.phone)}<br>` : ''}
          ${data.supplier.address_1 ? `${esc(data.supplier.address_1)}<br>` : ''}
          ${data.supplier.city ? `${esc(data.supplier.city)}, ` : ''}${esc(data.supplier.state ?? '')} ${esc(data.supplier.postcode ?? '')} ${esc(data.supplier.country ?? '')}
        </div>
      </td>
      <td style="width:8px;"></td>
      <td style="width:50%;vertical-align:top;padding:12px;border:0.5px solid #e2e8f0;
        border-radius:0 8px 8px 0;background:#fafafa;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;
          letter-spacing:0.1em;color:#94a3b8;margin-bottom:6px;">Customer (Buyer)</div>
        <div style="font-size:13px;font-weight:700;color:#0F1117;margin-bottom:4px;">
          ${customerDisplay}
        </div>
        <div style="font-size:11px;color:#64748b;line-height:1.8;">
          ${customerContact}
          Email: ${esc(data.customer.email)}<br>
          ${data.customer.abn ? `ABN: ${esc(data.customer.abn)}<br>` : ''}
          ${data.customer.entity_type ? `Entity: ${esc(data.customer.entity_type)}<br>` : ''}
          ${data.customer.address_1 ? `${esc(data.customer.address_1)}<br>` : ''}
          ${data.customer.city ? `${esc(data.customer.city)}, ` : ''}${esc(data.customer.state ?? '')} ${esc(data.customer.postcode ?? '')} ${esc(data.customer.country ?? '')}
        </div>
      </td>
    </tr>
  </table>

  <!-- REFERENCE NUMBERS -->
  <div style="margin-bottom:14px;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;
      color:#94a3b8;padding-bottom:6px;border-bottom:0.5px solid #e2e8f0;margin-bottom:8px;">
      Reference Numbers
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tr>${refCells}</tr>
    </table>
  </div>

  <!-- SCOPE OF WORK -->
  <div style="margin-bottom:14px;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;
      color:#94a3b8;padding-bottom:6px;border-bottom:0.5px solid #e2e8f0;margin-bottom:8px;">
      Scope of Work
    </div>
    ${
      data.scope.objective
        ? `<div style="border:0.5px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:6px;">
        <div style="padding:8px 12px;background:#f8fafc;border-bottom:0.5px solid #e2e8f0;">
          <span style="font-size:11px;font-weight:700;color:#374151;">Objective</span>
        </div>
        <div style="padding:10px 12px;">
          <p style="font-size:12px;color:#374151;line-height:1.7;">${esc(data.scope.objective)}</p>
        </div>
      </div>`
        : ''
    }
    ${scopeSectionsHtml}
  </div>

  <!-- TIMELINE -->
  <div style="margin-bottom:14px;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;
      color:#94a3b8;padding-bottom:6px;border-bottom:0.5px solid #e2e8f0;margin-bottom:8px;">
      Timeline &amp; Effort
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tr>${timelineCells}</tr>
    </table>
  </div>

  <!-- PRICING TABLE -->
  <div style="margin-bottom:14px;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;
      color:#94a3b8;padding-bottom:6px;border-bottom:0.5px solid #e2e8f0;margin-bottom:8px;">
      Pricing &amp; Fees
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:${darkColor};color:white;">
          <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;
            letter-spacing:0.04em;border-radius:6px 0 0 0;">Description</th>
          <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;width:50px;">Qty</th>
          <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;width:60px;">Unit</th>
          <th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:600;width:120px;">Rate (ex. GST)</th>
          <th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:600;
            width:120px;border-radius:0 6px 0 0;">Amount (${esc(data.pricing.currency)})</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:0.5px solid #e2e8f0;">
          <td style="padding:10px;color:#374151;">
            ${esc(data.pricing.description)}
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Per approved proposal</div>
          </td>
          <td style="padding:10px;text-align:center;color:#374151;">1</td>
          <td style="padding:10px;text-align:center;color:#374151;">Fixed</td>
          <td style="padding:10px;text-align:right;color:#374151;">$${fmt(data.pricing.service_fee_aud)}</td>
          <td style="padding:10px;text-align:right;color:#374151;">$${fmt(data.pricing.service_fee_aud)}</td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:8px;margin-left:auto;width:260px;">
      <table style="width:100%;font-size:12px;">
        <tr>
          <td style="padding:4px 8px;color:#64748b;">Subtotal (ex. GST)</td>
          <td style="padding:4px 8px;text-align:right;color:#0F1117;">
            ${esc(data.pricing.currency)} $${fmt(data.pricing.service_fee_aud)}
          </td>
        </tr>
        <tr>
          <td style="padding:4px 8px;color:#64748b;">
            GST (${Math.round(data.pricing.gst_rate * 100)}%)
          </td>
          <td style="padding:4px 8px;text-align:right;color:#0F1117;">
            ${esc(data.pricing.currency)} $${fmt(data.pricing.gst_amount_aud)}
          </td>
        </tr>
        <tr style="background:${darkColor};">
          <td style="padding:7px 8px;color:white;font-weight:700;font-size:13px;border-radius:6px 0 0 6px;">
            TOTAL (${esc(data.pricing.currency)})
          </td>
          <td style="padding:7px 8px;text-align:right;color:white;font-weight:700;font-size:13px;border-radius:0 6px 6px 0;">
            $${fmt(data.pricing.total_aud)}
          </td>
        </tr>
      </table>
    </div>
    ${
      data.pricing.is_tax_invoice && gstNote
        ? `<p style="font-size:10px;color:#94a3b8;margin-top:8px;">* ${esc(gstNote)}</p>`
        : ''
    }
  </div>

  <!-- LEGAL TERMS -->
  <div style="background:#fafafa;border:0.5px solid #e2e8f0;border-radius:8px;
    padding:12px 14px;margin-bottom:12px;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;
      letter-spacing:0.1em;color:#94a3b8;margin-bottom:8px;">Terms &amp; Conditions</div>
    ${termsHtml}
  </div>

  <!-- APPROVAL RECORD -->
  <div style="border:0.5px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-bottom:12px;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;
      letter-spacing:0.1em;color:#94a3b8;margin-bottom:8px;">Approval Record</div>
    <table style="width:100%;font-size:11px;border-collapse:collapse;">
      <tr>
        <td style="padding:3px 0;color:#475569;width:50%;">
          Approved by: <strong style="color:#0F1117;">${esc(data.approval.approved_by)}</strong>
        </td>
        <td style="padding:3px 0;color:#475569;">
          Method: <strong style="color:#0F1117;">${esc(data.approval.method)}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:3px 0;color:#475569;">
          Date &amp; Time: <strong style="color:#0F1117;">${esc(data.approval.approved_at)}</strong>
        </td>
        <td style="padding:3px 0;color:#475569;">
          IP Address: <strong style="color:#0F1117;font-family:monospace;">${esc(data.approval.ip_address)}</strong>
        </td>
      </tr>
    </table>
    <div style="margin-top:10px;padding:8px 12px;background:#f0fdf9;border:1px solid #9FE1CB;
      border-radius:6px;font-size:10px;color:#085041;line-height:1.7;">
      ${esc(approvalStatement)}
    </div>
  </div>

  <!-- FOOTER -->
  <div style="border-top:0.5px solid #e2e8f0;padding-top:10px;font-size:10px;
    color:#94a3b8;line-height:1.7;text-align:center;">
    ${footerText}
  </div>

</div>
</body>
</html>`;
}
