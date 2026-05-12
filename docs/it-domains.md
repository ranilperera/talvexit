# IT Domains — adding, renaming, removing

The IT-domain catalog (Cybersecurity, GRC, IT_PROJECT_MGMT, etc.) is
duplicated in **three** places that must stay in lock-step. This is the
runbook for changing it.

## The three sources of truth

| Source | What it controls | File |
|---|---|---|
| `DOMAIN_KEYS` (TypeScript const tuple) | Zod validation in `task` / `contractor` / `scoping` schemas; the `Domain` type used across the API and web app | [packages/shared/src/enums.ts](../packages/shared/src/enums.ts) |
| `enum Domain` (Prisma) | DB column types: `Task.domain`, `ContractorProfile.domains`, `ConsultingCompany.domains`, `Tender*.domain` | [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma) (search for `enum Domain`) |
| `ITDomain` rows (database) | The browseable catalog: labels, icons, descriptions, sort order, insurance tier. Drives `/admin/domains`, the `/pricing` and homepage cards, the contractor profile picker. | [apps/api/src/scripts/seed-domains.ts](../apps/api/src/scripts/seed-domains.ts) → DB |

The TypeScript const tuple and the Prisma enum must list **exactly the same
keys, in the same order, with the same spelling**. The seed script must
upsert one `ITDomain` row per key (also same spelling). Any drift between
these three is a real bug — Step 3 of contractor onboarding, task creation,
and scoping will fail with `Invalid enum value` errors.

## Why three sources

- **The Prisma enum** is what Postgres enforces — without it, columns can't
  be typed.
- **The TypeScript const tuple** is what Zod validates against — necessary
  because `@onys/shared` doesn't depend on the generated Prisma client.
- **The `ITDomain` table** carries the human metadata (label, icon,
  description, insurance tier, sort order) that an enum can't hold. It's
  also the only place you'd want non-developers (admins) to edit.

## Procedure: adding a new domain

For example, adding `OBSERVABILITY` (Datadog / Grafana / etc.):

### 1. Add to the TypeScript tuple

In [packages/shared/src/enums.ts](../packages/shared/src/enums.ts), insert
the new key into `DOMAIN_KEYS` in the appropriate tier block:

```ts
export const DOMAIN_KEYS = [
  // ...
  // Tier 3 — engineering & automation
  'DEVOPS',
  'OBSERVABILITY',   // ← new
  'AI_INTEGRATION',
  // ...
] as const;
```

### 2. Add to the Prisma enum

In [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma), find
`enum Domain` and add the value in the matching position:

```prisma
enum Domain {
  // ...
  DEVOPS
  OBSERVABILITY
  AI_INTEGRATION
  // ...
}
```

### 3. Add to the seed script

In [apps/api/src/scripts/seed-domains.ts](../apps/api/src/scripts/seed-domains.ts),
add a new entry to the `DOMAINS` array:

```ts
{
  key: 'OBSERVABILITY',
  label: 'Observability & Monitoring',
  short_label: 'Observability',
  icon: '📈',
  description: 'Datadog, New Relic, Grafana, Prometheus, distributed tracing, SLO design.',
  sort_order: 11,                    // adjust as needed
  is_active: true,
  insurance_tier: 'ELEVATED',         // STANDARD | ELEVATED | HIGH_RISK
},
```

### 4. Apply the changes

```bash
# Sync the Prisma enum into Postgres
pnpm --filter @onys/api exec prisma db push

# Regenerate the Prisma client
pnpm --filter @onys/api exec prisma generate

# Rebuild the shared package so other workspaces pick up the new tuple type
pnpm --filter @onys/shared build

# Seed the new ITDomain row (idempotent — upsert by key)
pnpm --filter @onys/api exec tsx src/scripts/seed-domains.ts

# Sanity check
pnpm typecheck
```

## Procedure: renaming a domain

Same three edits, but **also**:

- The Prisma enum rename will fail with a data-loss warning if any rows
  reference the old key. If your dev DB is clean, run with
  `pnpm prisma db push --accept-data-loss` (will need AI consent if invoked
  through Claude Code).
- For prod, you can't `db push --accept-data-loss` — you need a real
  migration that runs `ALTER TYPE "Domain" RENAME VALUE 'OLD' TO 'NEW'`
  before the rest of the schema changes hit. Write that migration by hand
  (Postgres supports value rename without data loss).
- The `ITDomain` row also needs the new key. Easiest is to delete the old
  row and re-run the seed:
  ```sql
  DELETE FROM "ITDomain" WHERE key = 'OLD_KEY';
  ```
  Then `pnpm --filter @onys/api exec tsx src/scripts/seed-domains.ts`.
- Searches for the old key string (`grep -r OLD_KEY apps packages`) — any
  hardcoded references in admin pages, fallback lists, etc. need updating.

## Procedure: removing a domain

Don't actually drop it from Postgres. The cleanest soft-remove:

1. Set `is_active: false` on the `ITDomain` row (the homepage and pickers
   already filter by `is_active`).
2. Leave the Prisma enum value in place forever — Postgres can't drop an
   enum value that any column has ever held without a backfill, and there's
   no benefit to dropping it.
3. Leave it in `DOMAIN_KEYS` too. The Zod validation will keep accepting it
   (good for old records).

If you genuinely want it gone (e.g., never used in prod, just a typo): run
the same `db push --accept-data-loss` pattern as a rename, but you also
need to scrub any references from the seed script, the const tuple, and
the Prisma enum.

## Common failures

### `Invalid enum value. Expected … received 'XYZ'`
The user picked a domain that exists in `ITDomain` but not in the Zod
schema's `DOMAIN_KEYS`. Either the rebuild step was skipped
(`pnpm --filter @onys/shared build`) or one of the three sources is out of
sync. Re-run the four commands in step 4 above.

### `Type 'Domain' has no enum value 'XYZ'` (TypeScript error)
Same root cause. The Prisma client wasn't regenerated, or the API package
is using a stale `.d.ts` cache. Run `pnpm prisma generate` and restart the
api dev server.

### `prisma db push` warns about data loss but you don't think you're losing anything
You're probably renaming or removing an enum value. If the dev DB is clean,
proceed with `--accept-data-loss`. If not, the warning is real — back up
or migrate first.

### Homepage / pricing page still shows the old icon set
The homepage reads from `GET /api/v1/domains` which is cached for 10
minutes by `useDomains()` in [apps/web/src/hooks/useDomains.ts](../apps/web/src/hooks/useDomains.ts).
Hard-refresh the browser (Ctrl+Shift+R) or wait out the cache.

## Why this isn't more DRY

A single source could drive all three, but Prisma's enum lives in a
`.prisma` file outside the TypeScript build, so true DRY needs codegen
(`prisma generate` → write a `.ts` file → re-import). The 3-edit pattern is
the practical minimum without standing up a codegen step. If domain churn
becomes frequent, that's the time to invest in codegen.
