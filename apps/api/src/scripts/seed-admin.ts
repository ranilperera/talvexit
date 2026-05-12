/**
 * seed-admin.ts — One-time script to create the first PLATFORM_ADMIN account.
 *
 * Usage:
 *   npx tsx src/scripts/seed-admin.ts
 *   ADMIN_EMAIL=ops@example.com ADMIN_NAME="Ops Admin" npx tsx src/scripts/seed-admin.ts
 *
 * The account is created with must_change_password=true.
 * The admin must change their password on first login.
 */

// Load .env BEFORE any prisma/pg imports
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv') as { config: (opts: { path: string }) => void };
dotenv.config({ path: resolve(__dir, '../../.env') });

import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@onys.local';
const FULL_NAME = process.env.ADMIN_NAME ?? 'Platform Admin';
const TEMP_PASSWORD = process.env.ADMIN_TEMP_PASSWORD ?? generateTempPassword();

function generateTempPassword(): string {
  // 16 chars: guaranteed uppercase, digit, special, rest random hex
  const base = crypto.randomBytes(8).toString('hex'); // 16 hex chars
  const suffix = '!A1'; // ensures complexity requirements
  return base + suffix;
}

async function main() {
  console.log('\nonys.online — PLATFORM_ADMIN seeder\n');

  // Check for existing admin
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.error(`✗ User with email ${EMAIL} already exists (id: ${existing.id}).`);
    console.error('  To reset: DELETE FROM "User" WHERE email = \'' + EMAIL + '\';');
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(TEMP_PASSWORD, 12);

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      password_hash,
      account_type: 'PLATFORM_ADMIN',
      full_name: FULL_NAME,
      email_verified: true,         // admins don't go through email verification
      email_verified_at: new Date(),
      must_change_password: true,   // force change on first login
      failed_login_count: 0,
    },
  });

  await prisma.auditLog.create({
    data: {
      actor_id: user.id,
      action_type: 'ADMIN_ACCOUNT_SEEDED',
      entity_type: 'User',
      entity_id: user.id,
      metadata: {
        seeded_by: 'seed-admin script',
        environment: process.env.NODE_ENV ?? 'development',
      },
    },
  });

  console.log('✓ PLATFORM_ADMIN account created\n');
  console.log('  ID:            ' + user.id);
  console.log('  Email:         ' + user.email);
  console.log('  Name:          ' + user.full_name);
  console.log('  Temp password: ' + TEMP_PASSWORD);
  console.log('\n  ⚠  Must change password on first login.');
  console.log('  Login at:      http://localhost:3000/admin/login\n');
}

main()
  .catch((e) => {
    console.error('✗ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
