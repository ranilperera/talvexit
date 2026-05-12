/**
 * reset-for-testing.ts — Wipe all transactional data and non-admin user accounts.
 *
 * Preserved:
 *   · User rows where account_type IN (PLATFORM_ADMIN, SUPPORT_ADMIN, COMPLIANCE_ADMIN)
 *   · PlatformConfig (platform settings)
 *   · _prisma_migrations (Prisma internals)
 *
 * Cleared:
 *   · Every other table — orders, tasks, companies, orgs, tenders, credentials, etc.
 *   · All non-admin User rows
 *
 * Usage (from apps/api):
 *   DATABASE_URL=... npx tsx src/scripts/reset-for-testing.ts
 *   DATABASE_URL=... FORCE_RESET=true npx tsx src/scripts/reset-for-testing.ts   # skip safety prompt
 *
 * How it works:
 *   Uses a single TRUNCATE ... CASCADE statement which:
 *     1. Handles all FK dependency ordering automatically
 *     2. Bypasses row-level DELETE triggers (including AuditLog's append-only guard)
 *   Then DELETEs non-admin User rows (safe because all FK children are already gone).
 */

import readline from 'node:readline';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Admin account types that are never deleted
const KEEP_TYPES = ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'];

// All tables to truncate (everything except User, PlatformConfig, ITDomain, _prisma_migrations)
// TRUNCATE ... CASCADE handles FK dependency ordering and cascades to any referenced tables.
const TRUNCATE_TABLES = [
  // ── Credentials ──────────────────────────────────────────────────────────────
  '"CredentialAccessLog"',
  '"OrderAccessCredential"',
  // ── Order children ───────────────────────────────────────────────────────────
  '"WorkLog"',
  '"OrderDeliverable"',
  '"OrderMessage"',
  '"OrderChatMessage"',
  '"ScopeModificationRequest"',
  '"MilestoneRelease"',
  '"ChangeRequest"',
  '"DisputeSubmission"',
  '"Dispute"',
  '"Rating"',
  '"BankTransferPayment"',
  '"CompanyInvoice"',
  '"PayoutRecord"',
  '"CompanyPayoutRecord"',
  '"CompanyOrderProposal"',
  '"PurchaseOrder"',
  '"Order"',
  // ── Tasks ────────────────────────────────────────────────────────────────────
  '"TaskMessage"',
  '"TaskThread"',
  '"TaskMilestone"',
  '"Task"',
  '"PendingScope"',
  // ── Video ────────────────────────────────────────────────────────────────────
  '"VideoSession"',
  // ── Contractor / Individual ───────────────────────────────────────────────────
  '"ContractorAgreement"',
  '"ContractorPayoutMethod"',
  '"InsuranceCertificate"',
  '"StripeConnectAccount"',
  '"ContractorProfile"',
  '"CustomerProfile"',
  // ── Consulting company ────────────────────────────────────────────────────────
  '"CompanyPayoutPreference"',
  '"CompanyPayoutAccount"',
  '"CompanyInvitation"',
  '"CompanyMember"',
  '"ConsultingCompany"',
  // ── Organisation ─────────────────────────────────────────────────────────────
  '"OrgDocument"',
  '"OrgLegalAcceptance"',
  '"OrgInsuranceCertificate"',
  '"OrgMember"',
  '"Organisation"',
  // ── Tender ───────────────────────────────────────────────────────────────────
  '"TenderContractPayoutRecord"',
  '"TenderContractBankTransfer"',
  '"TenderContractInvoice"',
  '"TenderDeliverable"',
  '"TenderMilestone"',
  '"TenderContract"',
  '"TenderProposal"',
  '"TenderInvitation"',
  '"TenderRequest"',
  // ── Compliance / Auth ─────────────────────────────────────────────────────────
  '"AmlCheck"',
  '"ProviderTaxDeclaration"',
  '"SupplierStatement"',
  '"StripeWebhookEvent"',
  '"DocumentSequence"',
  '"AuditLog"',
  '"EmailOtpChallenge"',
  '"LegalDocAcceptance"',
  '"RefreshToken"',
];

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error('DATABASE_URL environment variable is not set.');

  const pool = new Pool({ connectionString: DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    // ── Safety check ─────────────────────────────────────────────────────────
    const looksLikeProd =
      DATABASE_URL.includes('prod') ||
      DATABASE_URL.includes('live') ||
      process.env.NODE_ENV === 'production';

    if (looksLikeProd && process.env.FORCE_RESET !== 'true') {
      console.error('\n⚠️  DATABASE_URL looks like a production database.');
      console.error('   Set FORCE_RESET=true to proceed.\n');
      process.exit(1);
    }

    // ── Preview what will be preserved ───────────────────────────────────────
    const adminCount = await prisma.user.count({
      where: { account_type: { in: KEEP_TYPES as never[] } },
    });
    const userCount = await prisma.user.count();
    const nonAdminCount = userCount - adminCount;

    console.log('\n─── onys.online test reset ──────────────────────────────────');
    console.log(`  Database : ${DATABASE_URL.replace(/:\/\/[^@]+@/, '://<creds>@')}`);
    console.log(`  Will delete  : ${nonAdminCount} non-admin user(s) + ALL transactional data`);
    console.log(`  Will preserve: ${adminCount} admin account(s) + PlatformConfig`);
    console.log('─────────────────────────────────────────────────────────────\n');

    if (process.env.FORCE_RESET !== 'true') {
      const ok = await confirm('Proceed? [y/N] ');
      if (!ok) {
        console.log('Aborted.');
        return;
      }
    }

    // ── Truncate all transactional tables ────────────────────────────────────
    // Single statement: CASCADE handles FK ordering. TRUNCATE bypasses
    // row-level triggers including the AuditLog append-only guard.
    console.log('\nTruncating tables...');
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TRUNCATE_TABLES.join(', ')} CASCADE`,
    );
    console.log(`  ✓ ${TRUNCATE_TABLES.length} tables cleared`);

    // ── Delete non-admin users ────────────────────────────────────────────────
    // FK children are all gone now, so this DELETE is safe.
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM "User" WHERE account_type NOT IN (${KEEP_TYPES.map((t) => `'${t}'`).join(', ')})`,
    );
    console.log(`  ✓ ${deleted} non-admin user(s) deleted`);

    // ── Reset DocumentSequence so invoice/PO numbers restart ─────────────────
    // (Already truncated above — just a reminder that numbering restarts from 0)

    // ── Summary ──────────────────────────────────────────────────────────────
    const remaining = await prisma.user.findMany({
      where: { account_type: { in: KEEP_TYPES as never[] } },
      select: { email: true, account_type: true, full_name: true },
      orderBy: { created_at: 'asc' },
    });

    console.log('\n✅ Reset complete.\n');
    console.log('Preserved admin accounts:');
    for (const u of remaining) {
      console.log(`  · ${u.email}  (${u.account_type})  ${u.full_name}`);
    }
    console.log(
      '\nNote: refresh tokens were cleared — admins will need to log in again.',
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err: Error) => {
  console.error('\n❌ Reset failed:', err.message);
  process.exit(1);
});
