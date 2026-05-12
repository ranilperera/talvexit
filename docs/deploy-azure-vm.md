# Deploy talvex-v1 on an Azure VM

Step-by-step guide to clone, configure, build, and run the platform on a fresh
Azure VM. Assumes **Ubuntu 22.04 LTS**. Adjust paths for Windows Server / RHEL.

The database restore is **manual** — this guide skips `prisma migrate deploy`
on the assumption you'll restore a dump that already includes the migrations
table.

---

## 0. Prerequisites on the VM

```bash
ssh azureuser@<VM_PUBLIC_IP>

# System packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl build-essential git ca-certificates

# Node.js 20 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should print v20.x

# pnpm (the project's package manager)
sudo npm install -g pnpm@9
pnpm -v

# PostgreSQL 16 client tools (psql / pg_restore for the manual restore)
sudo apt install -y postgresql-client-16

# Redis 7 (required by BullMQ workers)
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping   # PONG

# PM2 for keeping API + Web + Workers alive
sudo npm install -g pm2
```

If you'll run Postgres locally on the VM (not external):
```bash
sudo apt install -y postgresql-16
sudo systemctl enable --now postgresql
```

## 1. Clone into a new folder

```bash
sudo mkdir -p /opt/talvex
sudo chown $USER:$USER /opt/talvex
cd /opt/talvex
git clone https://github.com/ranilperera/talvexit-v1.git app
cd app
git checkout main
```

## 2. Install dependencies

```bash
cd /opt/talvex/app
pnpm install --frozen-lockfile
```

## 3. Configure `.env`

Copy the example and fill in real values. Required fields are marked with ★.

```bash
cp .env.example .env
nano .env
```

Critical entries:
```bash
# DB (point at wherever you'll restore the dump)
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/onys_dev   # ★

# Redis (the local install above is fine)
REDIS_URL=redis://localhost:6379                             # ★

# JWT — generate with: openssl rand -hex 32
JWT_SECRET=<32+ random chars>                                # ★
JWT_REFRESH_SECRET=<different 32+ random chars>              # ★

# Public URLs the API and web app will use
FRONTEND_URL=https://app.yourdomain.com                      # ★
API_PUBLIC_URL=https://api.yourdomain.com
WEB_URL=https://app.yourdomain.com

# Stripe (test-mode keys for non-prod)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PORTAL_RETURN_URL=https://app.yourdomain.com/billing

# Azure Blob (file uploads — evidence, deliverables, invoice PDFs)
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=...
AZURE_STORAGE_CONTAINER=onys-files
AZURE_BLOB_INVOICES_CONTAINER=invoices

# SMTP (transactional email)
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...

# Optional brand-email overrides (otherwise default to talvexIT.com.au)
NEXT_PUBLIC_SUPPORT_EMAIL=
NEXT_PUBLIC_LEGAL_EMAIL=
NEXT_PUBLIC_COMPLIANCE_EMAIL=

# App
PORT=3001
NODE_ENV=production
```

The web app needs `NEXT_PUBLIC_API_URL` at **build time** (Next.js inlines
`NEXT_PUBLIC_*` during `next build` — runtime changes have no effect):

```bash
echo "NEXT_PUBLIC_API_URL=https://api.yourdomain.com" >> apps/web/.env.production
```

## 4. Restore the database manually

```bash
# Custom-format dump (fastest)
pg_restore -h <host> -U <user> -d onys_dev --clean --if-exists onys_dev_<date>.backup

# Or plain SQL
psql -h <host> -U <user> -d onys_dev -f onys_dev.sql
```

After restoring, verify the migration table is in sync so Prisma doesn't try
to re-run anything:
```bash
psql "$DATABASE_URL" -c 'SELECT migration_name FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 5;'
```

You should see entries from `apps/api/prisma/migrations/` — the most recent
should be `20260502120000_payment_evidence_history`.

## 5. Generate Prisma client + build

```bash
cd /opt/talvex/app

# Generate the typed Prisma client against your live DB
pnpm --filter @onys/api prisma:generate

# Typecheck both packages (catches env / config issues before runtime)
pnpm --filter @onys/api typecheck
pnpm --filter @onys/web typecheck

# Build everything
pnpm build
```

`pnpm build` runs `tsc` for the API and `next build` for the web app. Expect
2–4 minutes on a B2s.

## 6. Seed (optional — first deploy only)

If your restored DB already has subscription plans, **skip this**. Otherwise:
```bash
pnpm --filter @onys/api seed:subscriptions   # 8 plans (4 customer + 4 supplier)
pnpm --filter @onys/api seed:admin           # platform admin user
```

If any companies pre-date the auto-activation logic, also run:
```bash
pnpm --filter @onys/api backfill:company-subs
```

## 7. Run with PM2

Create `/opt/talvex/app/ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: 'talvex-api',
      cwd: '/opt/talvex/app/apps/api',
      script: 'node',
      args: 'dist/index.js',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '600M',
    },
    {
      name: 'talvex-workers',
      cwd: '/opt/talvex/app/apps/workers',
      script: 'node',
      args: 'dist/index.js',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '500M',
    },
    {
      name: 'talvex-web',
      cwd: '/opt/talvex/app/apps/web',
      script: 'pnpm',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: '3000' },
      max_memory_restart: '700M',
    },
  ],
};
```

Then:
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # follow the printed command to enable on boot
```

Verify:
```bash
pm2 status
pm2 logs talvex-api --lines 50
curl http://localhost:3001/api/v1/health   # {"status":"ok",...}
curl -I http://localhost:3000              # 200 from Next.js
```

## 8. Expose via Azure NSG / nginx

**Open ports in the Azure NSG** for the VM:
- `443` (web HTTPS) — public
- `80` (HTTPS redirect / Let's Encrypt) — public
- `3000`, `3001`, `5432`, `6379` — **keep closed** to the internet; internal only

**Reverse proxy** (nginx is the simplest):
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo tee /etc/nginx/sites-available/talvex >/dev/null <<'NGINX'
server {
  server_name app.yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
server {
  server_name api.yourdomain.com;
  client_max_body_size 25M;   # evidence uploads up to 10M; 25 leaves headroom
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
NGINX
sudo ln -s /etc/nginx/sites-available/talvex /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.yourdomain.com -d api.yourdomain.com
```

## 9. Stripe webhook (production)

In the Stripe dashboard, create a webhook endpoint pointing at:
```
https://api.yourdomain.com/api/v1/webhooks/stripe
```

Subscribe to:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.created`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `payment_intent.succeeded`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET` in `.env` and:
```bash
pm2 restart talvex-api
```

## 10. Sanity check

```bash
# API up?
curl https://api.yourdomain.com/api/v1/health

# Web serving?
curl -I https://app.yourdomain.com

# Stripe webhook reachable? (from a dev box, after `stripe login`)
stripe trigger checkout.session.completed
pm2 logs talvex-api --lines 20    # should show the event being processed

# Workers picking up jobs?
pm2 logs talvex-workers --lines 20
redis-cli LLEN bull:email:wait
```

---

## Subsequent deploys

```bash
cd /opt/talvex/app
git pull
pnpm install --frozen-lockfile
pnpm --filter @onys/api prisma:migrate:deploy   # only if new migrations
pnpm build
pm2 reload ecosystem.config.cjs                 # zero-downtime restart
```

## Rollback

```bash
cd /opt/talvex/app
git log --oneline -5
git checkout <previous-sha>
pnpm install --frozen-lockfile
pnpm build
pm2 reload ecosystem.config.cjs
# DB rollback is a separate concern — restore from your backup if needed
```

---

## Things that commonly bite on first deploy

- **`NEXT_PUBLIC_API_URL` must be set at build time, not runtime.** Next.js
  inlines it. If the web app's API calls go to the wrong host, that's why —
  rebuild the web app after fixing.
- **The Stripe webhook must reach the API directly** at path
  `/api/v1/webhooks/stripe`. nginx must forward the `Stripe-Signature` header
  (it does by default). Don't strip it.
- **`STRIPE_PORTAL_RETURN_URL`** must be a real URL Stripe can redirect to.
  Stripe rejects localhost-only URLs in live mode.
- **Azure Blob connection string** needs `AccountName=...;AccountKey=...`
  exactly — managed identity isn't wired up.
- **Line endings**: if you cloned on Windows and rsynced to the VM, run
  `sudo apt install dos2unix && find . -name "*.sh" -exec dos2unix {} \;` on
  any shell scripts. Not an issue for `.ts` / `.tsx`.
- **Webhook secrets are per-endpoint.** Test-mode and live-mode endpoints
  have different `whsec_...` values; copy the correct one from the dashboard
  for the endpoint you registered.
- **Prisma client mismatch.** If you redeploy and the API throws schema
  errors at runtime, you forgot `pnpm --filter @onys/api prisma:generate`
  after pulling.
