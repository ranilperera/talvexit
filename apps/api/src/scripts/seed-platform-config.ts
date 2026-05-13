/**
 * Seed PlatformConfig with PO template settings.
 * Run: npx tsx src/scripts/seed-platform-config.ts
 */

// Load .env BEFORE any prisma/pg imports
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv') as { config: (opts: { path: string }) => void };
dotenv.config({ path: resolve(__dir, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const CONFIG: Array<{ key: string; value: unknown; description: string }> = [
  // ── Platform identity ──────────────────────────────────────────────────────
  // Brand is TalvexIT, operated by Waveful Digital Platforms. Update
  // platform_abn here once the legal entity has its ABN issued — every
  // PO/invoice reads from this row, no code change needed.
  { key: 'platform_name', value: 'TalvexIT', description: 'Platform display name (brand)' },
  { key: 'platform_legal_name', value: 'Waveful Digital Platforms', description: 'Legal entity name (operator)' },
  { key: 'platform_abn', value: 'TBA', description: 'Platform ABN — replace with real ABN once issued' },
  { key: 'platform_acn', value: 'TBA', description: 'Platform ACN' },
  { key: 'platform_address', value: 'Melbourne, Victoria, Australia', description: 'Registered address' },
  { key: 'platform_support_email', value: 'support@onsys.com.au', description: 'Support contact email' },
  { key: 'platform_legal_email', value: 'legal@onsys.com.au', description: 'Legal contact email' },
  { key: 'platform_website', value: 'https://portal1.onsys.com.au', description: 'Platform website URL' },

  // ── Commission tiers (editable from /admin/config) ─────────────────────────
  // Subscription-only marketplace — 0% commission across the board. The
  // tiered shape is preserved so commission can be re-introduced later by
  // editing this row in /admin/config without code changes.
  {
    key: 'commission_tiers',
    value: [
      { min_orders: 0, rate: 0, label: 'SUBSCRIPTION_ONLY' },
    ],
    description: 'Platform commission tiers. Currently 0% — revenue comes from subscriptions only.',
  },

  // ── PO template settings ───────────────────────────────────────────────────
  { key: 'po_template_version', value: 'v2.0-2026', description: 'PO template version (shown on document)' },
  { key: 'po_header_accent_color', value: '#00C2A8', description: 'PO accent/brand colour (hex)' },
  { key: 'po_header_dark_color', value: '#0F1117', description: 'PO header dark colour (hex)' },
  { key: 'po_payment_terms_days', value: '14', description: 'Default payment terms in days' },
  { key: 'po_gst_rate', value: '0.10', description: 'GST rate (0.10 = 10%)' },

  // ── PO text content (editable without redeploy) ────────────────────────────
  {
    key: 'po_agent_notice',
    value:
      'This Purchase Order is issued through {{platform_legal_name}} (ABN: {{platform_abn}}) acting as non-exclusive billing and collection agent for the Supplier named below. {{platform_legal_name}} is not the principal supplier of services. Payment made under this PO constitutes acceptance of deliverables per the agreed proposal.',
    description: 'Agent notice shown at top of every PO. Supports {{platform_legal_name}}, {{platform_abn}}, {{platform_name}}.',
  },
  {
    key: 'po_terms',
    value: [
      'This Purchase Order constitutes a binding agreement between the Customer and the Supplier upon electronic approval.',
      '{{platform_legal_name}} (ABN: {{platform_abn}}) acts as non-exclusive billing and collection agent only. {{platform_legal_name}} is not the principal supplier of the services described herein.',
      'The Supplier warrants that services will be delivered in accordance with the approved proposal, on time and to a professional standard consistent with L2/L3 IT engineering standards.',
      'Payment is due within {{payment_terms_days}} days of the invoice date. Late payments may incur interest at 2% per month on the outstanding balance.',
      'Intellectual property created specifically and exclusively for the Customer under this PO vests in the Customer upon full payment, unless otherwise agreed in writing.',
      'Either party may raise a dispute within 7 days of deliverable submission. Disputes are resolved via the {{platform_name}} platform dispute resolution process prior to external legal proceedings.',
      'This agreement is governed by the laws of Victoria, Australia. Both parties submit to the non-exclusive jurisdiction of the courts of Victoria.',
      'Electronic acceptance of this Purchase Order is legally equivalent to a written signature under the Electronic Transactions Act 1999 (Cth).',
      'The Customer authorises {{platform_legal_name}} to issue an invoice on behalf of the Supplier upon acceptance of deliverables as described in this PO.',
    ],
    description: 'JSON array of T&C clauses. Each clause is numbered automatically.',
  },
  {
    key: 'po_approval_statement',
    value:
      'This electronic approval is recorded on the {{platform_name}} platform with a timestamp and IP address. By approving this Purchase Order, the Customer confirms agreement to all terms above and authorises {{platform_legal_name}} to collect payment and remit net proceeds to the Supplier.',
    description: 'Text shown in the approval record box.',
  },
  {
    key: 'po_footer_text',
    value:
      'Generated by {{platform_name}} · {{platform_legal_name}} (ABN: {{platform_abn}}) · {{platform_address}}\\nFor queries: {{platform_support_email}} · {{platform_legal_email}}',
    description: 'Footer text. Use \\n for line break.',
  },
  {
    key: 'po_gst_note',
    value:
      'Supplier is GST registered. This constitutes a Tax Invoice for GST purposes once payment is received and deliverables are accepted.',
    description: 'Shown below totals when supplier is GST registered.',
  },
];

async function main() {
  console.log('Seeding PlatformConfig...');
  for (const row of CONFIG) {
    await prisma.platformConfig.upsert({
      where: { key: row.key },
      create: { key: row.key, value: row.value as import('@prisma/client').Prisma.InputJsonValue, description: row.description },
      update: { value: row.value as import('@prisma/client').Prisma.InputJsonValue, description: row.description },
    });
    console.log(`  ✓  ${row.key}`);
  }
  console.log(`Done — ${CONFIG.length} keys upserted.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
