/**
 * Seed end-to-end test data:
 *   1 verified individual contractor (Free supplier plan)
 *   5 published sample Tasks across different domains
 *   1 customer on the Free customer plan
 *
 * Idempotent — if the test users already exist, prints credentials and exits.
 *
 * Run: pnpm --filter @onys/api seed:test-data
 */

// Load .env BEFORE any prisma/pg imports
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv') as { config: (opts: { path: string }) => void };
dotenv.config({ path: resolve(__dir, '../../.env') });

import bcrypt from 'bcrypt';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ─── Test credentials ───────────────────────────────────────────────────────

const CONTRACTOR_EMAIL = 'test.contractor@onys.local';
const CONTRACTOR_PASSWORD = 'TestPass123!';
const CONTRACTOR_NAME = 'Test Contractor';

const CUSTOMER_EMAIL = 'test.customer@onys.local';
const CUSTOMER_PASSWORD = 'TestPass123!';
const CUSTOMER_NAME = 'Test Customer';

// ─── Sample tasks ───────────────────────────────────────────────────────────

interface TaskSeed {
  title: string;
  domain:
    | 'CYBERSECURITY'
    | 'CLOUD_INFRASTRUCTURE'
    | 'DATABASE'
    | 'DEVOPS'
    | 'NETWORKING';
  objective: string;
  in_scope: string[];
  out_of_scope: string[];
  assumptions: string[];
  prerequisites: string[];
  deliverables: string[];
  hours: number;
  price_aud: number;
  milestone_count: number;
}

const SAMPLE_TASKS: TaskSeed[] = [
  {
    title: 'Penetration test of customer-facing SaaS application',
    domain: 'CYBERSECURITY',
    objective:
      'Perform a structured external penetration test of the customer-facing SaaS application, identify vulnerabilities aligned to OWASP Top 10, and deliver a remediation roadmap with risk-rated findings.',
    in_scope: [
      'External network scan of the production application surface',
      'OWASP Top 10 manual testing (auth, IDOR, XSS, SSRF, etc.)',
      'Authenticated testing as a low-privilege user',
      'Risk-rated written report (CVSS 3.1) with remediation guidance',
      'One round of retest after fixes',
    ],
    out_of_scope: [
      'Source code review',
      'Mobile application testing',
      'Internal network testing',
      'DDoS testing',
    ],
    assumptions: [
      'Customer provides a stable test environment that mirrors production',
      'Customer provides 2 test accounts with different privilege levels',
    ],
    prerequisites: [
      'Signed engagement letter and rules of engagement',
      'Customer security contact identified',
    ],
    deliverables: [
      'Penetration test report (PDF)',
      'Risk-rated findings spreadsheet',
      'Executive summary slide deck',
      'Retest confirmation memo',
    ],
    hours: 50,
    price_aud: 6500,
    milestone_count: 2,
  },
  {
    title: 'Azure landing zone assessment + migration plan',
    domain: 'CLOUD_INFRASTRUCTURE',
    objective:
      'Assess the customer\'s current on-premise infrastructure and produce an Azure landing zone design, migration sequencing, and cost estimate aligned to the Azure Cloud Adoption Framework.',
    in_scope: [
      'Discovery workshop and current-state inventory',
      'Azure landing zone design (subscriptions, hub-and-spoke, IAM)',
      'Migration wave plan with risk and dependency analysis',
      'Cost model (3-year TCO comparison)',
      'Executive presentation',
    ],
    out_of_scope: [
      'Actual migration execution',
      'Application refactoring',
      'Multi-cloud comparison',
    ],
    assumptions: [
      'Customer provides read-only access to existing infrastructure',
      'Workshop participants include IT, security, and finance',
    ],
    prerequisites: [
      'Existing infrastructure documentation',
      'Azure tenant with billing access',
    ],
    deliverables: [
      'Landing zone design document',
      'Migration wave plan',
      'TCO model spreadsheet',
      'Executive presentation deck',
    ],
    hours: 32,
    price_aud: 4200,
    milestone_count: 3,
  },
  {
    title: 'PostgreSQL performance tuning and slow-query review',
    domain: 'DATABASE',
    objective:
      'Diagnose performance issues on a production PostgreSQL 15 database, identify slow queries, recommend index and configuration changes, and validate improvements against agreed metrics.',
    in_scope: [
      'pg_stat_statements analysis',
      'Top 20 slow query review',
      'Index strategy recommendations',
      'postgresql.conf tuning recommendations',
      'Validation of changes in staging',
    ],
    out_of_scope: [
      'Schema redesign',
      'Application code changes',
      'Replication setup',
    ],
    assumptions: [
      'Customer has staging environment matching production',
      'Read-only DBA access provided',
    ],
    prerequisites: [
      'pg_stat_statements extension enabled',
      'Production query workload sample',
    ],
    deliverables: [
      'Performance report with ranked findings',
      'Recommended index/config changes (executable SQL)',
      'Before/after benchmark results',
    ],
    hours: 20,
    price_aud: 2400,
    milestone_count: 2,
  },
  {
    title: 'GitLab CI/CD pipeline setup for Node.js monorepo',
    domain: 'DEVOPS',
    objective:
      'Design and implement a GitLab CI/CD pipeline for a TypeScript monorepo with build, test, security scan, and multi-environment deployment stages.',
    in_scope: [
      'Pipeline design with parallel jobs',
      'Build + test + lint stages',
      'SAST and dependency scanning',
      'Container image build and push',
      'Deploy stages for staging and production with manual gate',
    ],
    out_of_scope: [
      'Application refactoring',
      'Cluster provisioning',
      'GitLab self-hosted setup',
    ],
    assumptions: [
      'Customer uses GitLab.com',
      'Container registry available',
      'Staging and production Kubernetes clusters exist',
    ],
    prerequisites: [
      'Maintainer access to the GitLab project',
      'Kubeconfig for both clusters',
    ],
    deliverables: [
      '.gitlab-ci.yml committed to the project',
      'Pipeline documentation',
      'Successful end-to-end deploy demonstration',
    ],
    hours: 16,
    price_aud: 1800,
    milestone_count: 2,
  },
  {
    title: 'Firewall rule audit and policy clean-up',
    domain: 'NETWORKING',
    objective:
      'Audit existing Palo Alto / Fortinet firewall rule sets, identify unused / overly permissive rules, document recommended consolidation, and apply approved changes.',
    in_scope: [
      'Rule-base export and analysis',
      'Identify unused rules (Hit count = 0 over 90 days)',
      'Identify overly permissive rules (Any/Any)',
      'Recommend consolidated policy with named groups',
      'Apply approved changes during agreed change window',
    ],
    out_of_scope: [
      'Hardware replacement',
      'New firewall feature deployment',
      'Penetration testing',
    ],
    assumptions: [
      'Customer provides read access to firewall management',
      'Change window of 4 hours available',
    ],
    prerequisites: [
      'Firewall rule export (XML or CSV)',
      'Hit-count data for last 90 days',
    ],
    deliverables: [
      'Audit report with categorised findings',
      'Recommended consolidated policy',
      'Change record for approved modifications',
    ],
    hours: 14,
    price_aud: 1400,
    milestone_count: 1,
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

async function ensureUser(opts: {
  email: string;
  password: string;
  full_name: string;
  account_type:
    | 'CUSTOMER'
    | 'INDIVIDUAL_CONTRACTOR'
    | 'ORGANIZATION_ADMIN'
    | 'COMPANY_ADMIN';
}): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.user.findUnique({
    where: { email: opts.email },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const password_hash = await bcrypt.hash(opts.password, 12);
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      password_hash,
      account_type: opts.account_type,
      full_name: opts.full_name,
      email_verified: true,
      email_verified_at: new Date(),
      failed_login_count: 0,
    },
  });
  return { id: user.id, created: true };
}

async function attachFreeSubscription(opts: {
  userId: string;
  planSlug: string;
}): Promise<void> {
  const existing = await prisma.subscription.findUnique({
    where: { user_id: opts.userId },
    select: { id: true },
  });
  if (existing) return;

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { slug: opts.planSlug },
    select: { id: true },
  });
  if (!plan) {
    throw new Error(
      `Plan '${opts.planSlug}' not found. Run pnpm --filter @onys/api seed:subscriptions first.`,
    );
  }
  await prisma.subscription.create({
    data: {
      user_id: opts.userId,
      plan_id: plan.id,
      billing_interval: 'MONTHLY',
      status: 'ACTIVE',
      started_at: new Date(),
    },
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nSeeding end-to-end test data\n');

  // 1. CONTRACTOR
  const contractor = await ensureUser({
    email: CONTRACTOR_EMAIL,
    password: CONTRACTOR_PASSWORD,
    full_name: CONTRACTOR_NAME,
    account_type: 'INDIVIDUAL_CONTRACTOR',
  });
  console.log(`${contractor.created ? '✓ created' : '↻ exists'} contractor: ${CONTRACTOR_EMAIL} (id ${contractor.id})`);

  // 2. CONTRACTOR PROFILE — ACTIVE + KYC approved + insurance met
  const contractorProfile = await prisma.contractorProfile.upsert({
    where: { user_id: contractor.id },
    create: {
      user_id: contractor.id,
      status: 'ACTIVE',
      kyc_status: 'APPROVED',
      identity_status: 'APPROVED',
      onboarding_step: 7,
      activated_at: new Date(),
      agreement_accepted_at: new Date(),
      agreement_version: '2026-03-01',
      domains: ['CYBERSECURITY', 'CLOUD_INFRASTRUCTURE', 'DATABASE', 'DEVOPS', 'NETWORKING'],
      insurance_tier_met: true,
      bio: 'Senior IT consultant with 12+ years experience across cybersecurity, cloud, and infrastructure.',
      timezone: 'Australia/Melbourne',
      legal_name: CONTRACTOR_NAME,
    },
    update: {
      status: 'ACTIVE',
      kyc_status: 'APPROVED',
      identity_status: 'APPROVED',
      domains: ['CYBERSECURITY', 'CLOUD_INFRASTRUCTURE', 'DATABASE', 'DEVOPS', 'NETWORKING'],
      insurance_tier_met: true,
    },
  });
  console.log(`✓ contractor profile: ACTIVE + KYC APPROVED + 5 domains`);

  // 3. CONTRACTOR SUBSCRIPTION — supplier-free
  await attachFreeSubscription({ userId: contractor.id, planSlug: 'supplier-free' });
  console.log(`✓ contractor subscription: supplier-free`);

  // 4. SAMPLE TASKS
  let createdTasks = 0;
  let skippedTasks = 0;
  for (const t of SAMPLE_TASKS) {
    const existing = await prisma.task.findFirst({
      where: { contractor_profile_id: contractorProfile.id, title: t.title },
      select: { id: true },
    });
    if (existing) {
      skippedTasks++;
      continue;
    }
    const milestones =
      t.milestone_count > 1
        ? Array.from({ length: t.milestone_count }, (_, i) => ({
            sequence: i + 1,
            name: `Milestone ${i + 1}`,
            description:
              i === 0
                ? 'Discovery, kick-off, baseline analysis.'
                : i === t.milestone_count - 1
                  ? 'Final report and handover.'
                  : `Mid-project deliverable (phase ${i + 1}).`,
            percentage_of_total: Math.round(100 / t.milestone_count),
          }))
        : [];

    await prisma.task.create({
      data: {
        contractor_profile_id: contractorProfile.id,
        created_by_user_id: contractor.id,
        title: t.title,
        domain: t.domain,
        objective: t.objective,
        in_scope: t.in_scope,
        out_of_scope: t.out_of_scope,
        assumptions: t.assumptions,
        prerequisites: t.prerequisites,
        deliverables: t.deliverables,
        currency: 'AUD',
        price: new Prisma.Decimal(t.price_aud),
        price_aud: new Prisma.Decimal(t.price_aud),
        hours_min: Math.floor(t.hours * 0.8),
        hours_max: Math.ceil(t.hours * 1.2),
        milestone_count: t.milestone_count,
        status: 'PUBLISHED',
        published_at: new Date(),
        version: 1,
        ...(milestones.length > 0
          ? {
              milestones: {
                create: milestones.map((m) => ({
                  sequence: m.sequence,
                  name: m.name,
                  description: m.description,
                  percentage_of_total: m.percentage_of_total,
                })),
              },
            }
          : {}),
      },
    });
    createdTasks++;
  }
  console.log(`${createdTasks ? '✓' : '↻'} tasks: ${createdTasks} created, ${skippedTasks} skipped`);

  // 5. CUSTOMER
  const customer = await ensureUser({
    email: CUSTOMER_EMAIL,
    password: CUSTOMER_PASSWORD,
    full_name: CUSTOMER_NAME,
    account_type: 'CUSTOMER',
  });
  console.log(`${customer.created ? '✓ created' : '↻ exists'} customer: ${CUSTOMER_EMAIL} (id ${customer.id})`);

  // 6. CUSTOMER PROFILE
  await prisma.customerProfile.upsert({
    where: { user_id: customer.id },
    create: { user_id: customer.id, country: 'AU' },
    update: {},
  });

  // 7. CUSTOMER SUBSCRIPTION — customer-starter
  await attachFreeSubscription({ userId: customer.id, planSlug: 'customer-starter' });
  console.log(`✓ customer subscription: customer-starter`);

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' Test credentials');
  console.log('──────────────────────────────────────────────────────────');
  console.log(`  Contractor:`);
  console.log(`    Email:    ${CONTRACTOR_EMAIL}`);
  console.log(`    Password: ${CONTRACTOR_PASSWORD}`);
  console.log(`    Plan:     SUPPLIER_FREE`);
  console.log(`    Profile:  ACTIVE (KYC APPROVED)`);
  console.log(`    Tasks:    5 published across 5 domains`);
  console.log('');
  console.log(`  Customer:`);
  console.log(`    Email:    ${CUSTOMER_EMAIL}`);
  console.log(`    Password: ${CUSTOMER_PASSWORD}`);
  console.log(`    Plan:     CUSTOMER_STARTER (1 order/month limit)`);
  console.log('──────────────────────────────────────────────────────────\n');

  console.log('Test flow:');
  console.log('  1. Login as customer at http://localhost:3000/login');
  console.log('  2. Browse tasks at http://localhost:3000/tasks');
  console.log('  3. Place an order on any task → succeeds (1st order)');
  console.log('  4. Try to place a 2nd order → 429 with UpgradePromptModal');
  console.log('  5. Visit /billing — see Orders meter at 1/1');
  console.log('');
  console.log('Audit:');
  console.log('  SELECT actor_id, metadata->>\'limit_type\' AS type,');
  console.log('         metadata->>\'new_count\' AS count, created_at');
  console.log('  FROM "AuditLog"');
  console.log('  WHERE action_type = \'SUBSCRIPTION_USAGE_INCREMENT\'');
  console.log('  ORDER BY created_at DESC LIMIT 10;');
  console.log('');
}

main()
  .catch((e) => {
    console.error('✗ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
