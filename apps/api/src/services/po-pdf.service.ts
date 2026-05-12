import type { PrismaClient } from '@prisma/client';
import { getPlatformConfig } from './platform-config.service.js';
import { generatePOHtml } from '../utils/po-template.js';
import type { POTemplateData } from '../utils/po-template.js';

// ─── generatePurchaseOrderPdf ─────────────────────────────────────────────────

export async function generatePurchaseOrderPdf(
  purchaseOrderId: string,
  prisma: PrismaClient,
): Promise<Buffer> {
  // ── Load PO with all required relations ──────────────────────────────────────
  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: purchaseOrderId },
    include: {
      order: {
        include: {
          customer: {
            select: {
              id: true,
              full_name: true,
              email: true,
              legal_name: true,
              entity_type: true,
              abn: true,
              billing_address_1: true,
              billing_city: true,
              billing_state: true,
              billing_postcode: true,
              billing_country: true,
            },
          },
          company: {
            include: {
              members: {
                where: { is_primary_admin: true },
                take: 1,
                include: {
                  user: { select: { full_name: true, email: true } },
                },
              },
            },
          },
          contractor_profile: {
            include: {
              user: {
                select: {
                  full_name: true,
                  email: true,
                  legal_name: true,
                  entity_type: true,
                  abn: true,
                  gst_registered: true,
                  billing_address_1: true,
                  billing_city: true,
                  billing_state: true,
                  billing_postcode: true,
                  billing_country: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const order = po.order;
  const customer = order.customer;
  const isCompany = !!order.company_id;

  // ── Load the approved proposal for scope + timeline + legal terms ────────
  // legal_terms (when supplier-authored) overrides the platform-config
  // po_terms array — the PO PDF prefers what the parties agreed on at
  // approval time over the global default.
  const proposal = await prisma.companyOrderProposal.findFirst({
    where: { order_id: po.order_id, status: 'APPROVED' },
    select: {
      scope_of_work: true,
      timeline_days: true,
      payment_terms: true,
      legal_terms: true,
    },
  });

  // ── Resolve supplier details ──────────────────────────────────────────────
  // Prefer billing_* fields over legacy address fields. Billing email
  // (if set) wins over the admin's personal account email so POs don't
  // expose private contact details.
  let supplier: POTemplateData['supplier'];
  if (isCompany && order.company) {
    const adminEmail = order.company.members[0]?.user?.email ?? '';
    supplier = {
      legal_name: order.company.legal_company_name ?? order.company.company_name,
      ...(order.company.legal_company_name ? { trading_name: order.company.company_name } : {}),
      entity_type: order.company.entity_type ?? 'Company',
      ...(order.company.abn ? { abn: order.company.abn } : {}),
      gst_registered: order.company.gst_registered,
      email: order.company.billing_email ?? adminEmail,
      ...(order.company.billing_phone ? { phone: order.company.billing_phone } : {}),
      ...(order.company.billing_address_1 ? { address_1: order.company.billing_address_1 } : {}),
      ...(order.company.billing_city ? { city: order.company.billing_city } : {}),
      ...(order.company.billing_state ?? order.company.state
        ? { state: order.company.billing_state ?? order.company.state ?? '' }
        : {}),
      ...(order.company.billing_postcode ?? order.company.postcode
        ? { postcode: order.company.billing_postcode ?? order.company.postcode ?? '' }
        : {}),
      country: order.company.billing_country ?? 'AU',
    };
  } else {
    const u = order.contractor_profile?.user;
    supplier = {
      legal_name: u?.legal_name ?? u?.full_name ?? 'Provider',
      ...(u?.entity_type ? { entity_type: u.entity_type } : { entity_type: 'Sole Trader' }),
      ...(u?.abn ? { abn: u.abn } : {}),
      gst_registered: u?.gst_registered ?? false,
      email: u?.email ?? '',
      ...(u?.billing_address_1 ? { address_1: u.billing_address_1 } : {}),
      ...(u?.billing_city ? { city: u.billing_city } : {}),
      ...(u?.billing_state ? { state: u.billing_state } : {}),
      ...(u?.billing_postcode ? { postcode: u.billing_postcode } : {}),
      country: u?.billing_country ?? 'AU',
    };
  }

  // ── Parse scope from proposal scope_of_work ───────────────────────────────
  type ScopeObj = {
    objective?: string;
    in_scope?: string[];
    out_of_scope?: string[];
    assumptions?: string[];
    prerequisites?: string[];
    deliverables?: string[];
  };

  let scope: ScopeObj = {};
  const rawScope = proposal?.scope_of_work;
  if (rawScope) {
    try {
      const parsed = JSON.parse(rawScope) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        scope = parsed as ScopeObj;
      } else {
        scope = { objective: rawScope };
      }
    } catch {
      scope = { objective: rawScope };
    }
  } else if (order.scope_snapshot) {
    // Fall back to task scope snapshot
    const snap = order.scope_snapshot as ScopeObj;
    scope = {
      ...(snap.objective !== undefined ? { objective: snap.objective } : {}),
      ...(snap.in_scope !== undefined ? { in_scope: snap.in_scope } : {}),
      ...(snap.out_of_scope !== undefined ? { out_of_scope: snap.out_of_scope } : {}),
      ...(snap.deliverables !== undefined ? { deliverables: snap.deliverables } : {}),
    };
  }

  // ── Load platform config ──────────────────────────────────────────────────
  const config = await getPlatformConfig(prisma);

  // ── Pricing ───────────────────────────────────────────────────────────────
  const gstRate = Number(config.po_gst_rate ?? '0.10');
  const serviceFee = Number(po.amount_aud ?? 0);
  const gstAmount = Number(po.tax_aud ?? 0);
  const total = Number(po.total_aud ?? 0);
  const payTermDays = config.po_payment_terms_days ?? '14';

  // ── Approval timestamp ────────────────────────────────────────────────────
  const approvedAt = po.approved_at ?? po.issued_at ?? new Date();
  const approvedAtStr =
    approvedAt.toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Australia/Melbourne',
    }) + ' AEST';

  // ── Build template data ───────────────────────────────────────────────────
  const templateData: POTemplateData = {
    config,
    po_number: po.po_number,
    proposal_ref: proposal ? `PROP-${po.order_id.slice(-8).toUpperCase()}` : '—',
    order_ref: `ORD-${order.id.slice(-8).toUpperCase()}`,
    generated_date: new Date().toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    template_version: config.po_template_version ?? 'v2.0',
    supplier,
    customer: {
      ...(customer.legal_name ? { legal_name: customer.legal_name } : {}),
      full_name: customer.full_name,
      email: customer.email,
      ...(customer.abn ? { abn: customer.abn } : {}),
      ...(customer.entity_type ? { entity_type: customer.entity_type } : {}),
      ...(customer.billing_address_1 ? { address_1: customer.billing_address_1 } : {}),
      ...(customer.billing_city ? { city: customer.billing_city } : {}),
      ...(customer.billing_state ? { state: customer.billing_state } : {}),
      ...(customer.billing_postcode ? { postcode: customer.billing_postcode } : {}),
      ...(customer.billing_country ? { country: customer.billing_country } : {}),
    },
    scope,
    timeline: {
      ...(proposal?.timeline_days ? { duration_days: proposal.timeline_days } : {}),
      payment_terms: proposal?.payment_terms ?? `Net ${payTermDays} days`,
    },
    pricing: {
      description: (scope.objective?.slice(0, 80) ?? po.scope_title ?? 'Professional IT Services').replace(/\n/g, ' '),
      service_fee_aud: serviceFee,
      gst_rate: gstRate,
      gst_amount_aud: gstAmount,
      total_aud: total,
      currency: 'AUD',
      is_tax_invoice: supplier.gst_registered,
    },
    ...(proposal?.legal_terms ? { legal_terms: proposal.legal_terms } : {}),
    approval: {
      approved_by: customer.full_name,
      approved_at: approvedAtStr,
      ip_address: po.approved_ip ?? '—',
      method: `Electronic — ${config.platform_name ?? 'TalvexIT'} Platform`,
    },
  };

  // ── Render HTML ───────────────────────────────────────────────────────────
  const html = generatePOHtml(templateData);

  // ── Convert to PDF via Puppeteer ──────────────────────────────────────────
  let browser;
  try {
    const puppeteer = await import('puppeteer');
    browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    // Give Google Fonts up to 1.5s to load; fall back to system fonts gracefully
    await new Promise((r) => setTimeout(r, 1500));
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser?.close();
  }
}
