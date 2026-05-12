/**
 * One-shot backfill: assign the supplier-free plan to every ConsultingCompany
 * that doesn't have a Subscription row yet. Safe to re-run — only creates a
 * row when the company has none.
 *
 * Why: companies registered before auto-activation was added would otherwise
 * hit "no active subscription" on the first limit-gated action. This script
 * closes that gap so every existing company starts on the same baseline as
 * newly-registered ones.
 *
 * Run: pnpm --filter @onys/api tsx src/scripts/backfill-company-subscriptions.ts
 */

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

async function main() {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { slug: 'supplier-free' },
    select: { id: true, name: true },
  });
  if (!plan) {
    console.error('[backfill] supplier-free plan not found. Run seed:subscriptions first.');
    process.exit(1);
  }

  const companies = await prisma.consultingCompany.findMany({
    select: { id: true, company_name: true },
  });

  let created = 0;
  let skipped = 0;
  for (const c of companies) {
    const existing = await prisma.subscription.findUnique({
      where: { company_id: c.id },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.subscription.create({
      data: {
        company_id: c.id,
        plan_id: plan.id,
        billing_interval: 'MONTHLY',
        status: 'ACTIVE',
        started_at: new Date(),
      },
    });
    created++;
    console.log(`[backfill] created ${plan.name} sub for company ${c.company_name} (${c.id})`);
  }

  console.log(
    `[backfill] done. created=${created}, skipped (already had sub)=${skipped}, total companies=${companies.length}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
