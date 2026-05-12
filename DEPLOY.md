# onys.online — Azure VM Deployment Guide

---

## Release: 2026-04-11 — Tender Contracts, Admin Contractor Detail, Order Cancel Guard

### What's in this release

**Backend (API)**
- `POST/GET /api/v1/tender-contracts/*` — full tender contract lifecycle (award, milestones, invoices, payouts, bank transfers)
- `GET /api/v1/tender-contracts/:id/payment-methods` — admin payment method management
- Admin contractor detail: identity/selfie document SAS URL endpoint (`GET /admin/contractors/:id/identity-document-url`)
- Public contractor profile endpoints: `GET /contractors/:id/profile`, `/tasks`, `/reviews`
- Contractor identity document upload now writes to Azure Blob Storage (was fake-path)
- Tax document upload routed through `/auth/me/documents?doc_type=TAX_DOCUMENT`
- `no_abn_reason` now persisted to `ProviderTaxDeclaration.declaration_text`
- `cancelOrder` service: blocks cancellation after PO is issued on company orders
- Tender routes: tender invitation award, tender contract CRUD

**Frontend (Web)**
- Customer order page: `Cancel Order` hidden once `company_order_status = PO_GENERATED` or later
- Task detail page: removed "Escrow protected" trust badge, replaced with "Milestone-based payment" and "Fixed-scope delivery"; "View profile" link removed
- Admin contractor detail page: full profile rebuild — identity docs, tax declarations, insurance certs, KYC sessions, no-ABN reason, compliance docs with download
- Contractor layout: "Tender Invitations" and "Tender Contracts" nav links added
- Customer tender pages, customer contracts pages, contractor invitation/contract pages (new routes)
- Admin: domains management, bank accounts, bank transfers, tender payout pages

**Database migrations (4 new, applied automatically on deploy)**
| Migration | Change |
|-----------|--------|
| `20260410000000_tender_invitation_awarded_status` | Add `AWARDED` to `TenderInvitationStatus` enum |
| `20260410000001_tender_proposal_solution_fields` | Add `solution_details`, `deliverables`, `attachment_blob_paths` to `TenderProposal` |
| `20260410000002_tender_contract` | New tables: `TenderContract`, `TenderContractMilestone` + enums |
| `20260410000003_tender_contract_payments` | New tables: `TenderContractInvoice`, `TenderContractBankTransfer`, `TenderContractPayoutRecord` |

### Deploy steps

This is a **subsequent deploy** — use the standard deploy script:

```bash
ssh azureuser@portal1.onsys.com.au
cd /opt/onsys
./deploy.sh main
```

The `migrate` container will automatically apply all 4 new migrations before the API starts.

### Post-deploy verification checklist

```bash
# 1. Confirm migrations applied
docker logs onys_migrate --tail=20
# Expected: "4 migrations found" and "All migrations have been successfully applied"

# 2. Verify new tables exist
docker exec onys_postgres psql -U onsys -d onsys_prod \
  -c "\dt TenderContract* "

# 3. Confirm AWARDED enum value
docker exec onys_postgres psql -U onsys -d onsys_prod \
  -c "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'TenderInvitationStatus';"

# 4. API health
curl http://localhost:3001/api/v1/health

# 5. Smoke test: tender contracts endpoint (should return 401, not 404)
curl -s http://localhost:3001/api/v1/tender-contracts/test | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['error']['code'])"
# Expected: UNAUTHORIZED
```

---

## Architecture

```
Azure VM (portal1.onsys.com.au)
│
├── Docker containers (docker-compose.prod.yml)
│   ├── onys_postgres   PostgreSQL 16  :5432  (internal only)
│   ├── onys_redis      Redis 7        :6379  (internal only)
│   ├── onys_migrate    one-shot — runs prisma migrate deploy on each deploy
│   ├── onys_api        Fastify API    :3001
│   ├── onys_workers    BullMQ workers (no port — connects to redis/db)
│   └── onys_web        Next.js        :3000
│
├── Nginx (reverse proxy — sits in front of :3000 and :3001)
│   ├── app.onsys.com.au  → :3000
│   └── api.onsys.com.au  → :3001
│
└── /opt/onsys/
    ├── (repo clone)
    └── .env.prod          ← secrets, NOT in git
```

---

## Part 1 — First-time VM Setup

### 1.1 Install Docker

```bash
ssh azureuser@portal1.onsys.com.au

# Docker Engine (Ubuntu 22.04)
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) \
  signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# Allow your user to run docker without sudo
sudo usermod -aG docker "$USER"
newgrp docker

# Verify
docker --version
docker compose version
```

### 1.2 Clone the Repository

```bash
sudo mkdir -p /opt/onsys
sudo chown "$USER":"$USER" /opt/onsys
cd /opt/onsys

# SSH key must have read access to the repo
git clone git@github.com:YOUR_ORG/onsys-online.git .
# OR with HTTPS + token:
# git clone https://YOUR_TOKEN@github.com/YOUR_ORG/onsys-online.git .

git checkout main
```

### 1.3 Create .env.prod

```bash
# Copy the template from the repo
cp .env.prod.example /opt/onsys/.env.prod    # if you rename .env.prod to .env.prod.example
# OR just create it directly:
nano /opt/onsys/.env.prod
```

Fill in every `CHANGE_ME` value. Critical ones:

| Variable | How to get it |
|----------|---------------|
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` |
| `JWT_SECRET` | `openssl rand -hex 64` |
| `JWT_REFRESH_SECRET` | `openssl rand -hex 64` |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → your endpoint |
| `AZURE_*` | Azure Portal → your app registration |
| `LIVEKIT_API_KEY/SECRET` | LiveKit Cloud dashboard |
| `ANTHROPIC_API_KEY` | console.anthropic.com |

> **Important**: `DATABASE_URL` must match `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`.
> Default: `postgresql://onsys:YOUR_PASSWORD@postgres:5432/onsys_prod`

Required AI scoping variables (add to `.env.prod`):

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
REDIS_HOST=redis
REDIS_PORT=6379
AI_SCOPING_QUEUE_NAME=ai-scoping
# MOCK_AI=true   ← uncomment to disable live Claude calls (uses canned response)
```

> `REDIS_HOST=redis` — use the Docker service name, **not** `localhost`. Both the API and workers containers resolve Redis by this name inside the Docker network.

### 1.4 Make deploy.sh executable

```bash
chmod +x /opt/onsys/deploy.sh
```

---

## Part 2 — Database Backup (from local dev)

Run these on your **Windows development machine**.

### 2.1 Dump the local database

```bash
# Using pg_dump (PostgreSQL must be in PATH, or use the full path)
pg_dump -U postgres -h localhost -d onys_dev \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file=onys_dev_$(date +%Y%m%d).dump

# Verify the dump is non-empty
ls -lh onys_dev_*.dump
```

If your local Postgres password is prompted, it is `Me1b0urne` (from apps/api/.env).

If you use Docker locally for Postgres:
```bash
docker exec -t <your_local_postgres_container> \
  pg_dump -U postgres -d onys_dev \
  --format=custom --no-owner --no-privileges \
  > onys_dev_$(date +%Y%m%d).dump
```

### 2.2 Transfer dump to Azure VM

```bash
# Replace with your actual VM address
scp onys_dev_*.dump azureuser@portal1.onsys.com.au:/tmp/
```

---

## Part 3 — Database Restore (on Azure VM)

Run these on the **Azure VM** after copying the dump file.

### 3.1 Start only the postgres container first

```bash
cd /opt/onsys
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  up -d postgres

# Wait for it to be ready
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec postgres pg_isready -U onsys -d onsys_prod
```

### 3.2 Create the database (first time only)

```bash
# The postgres service auto-creates POSTGRES_DB on first start.
# Verify:
docker exec onys_postgres \
  psql -U onsys -c "\l"
```

If the database is missing, create it:
```bash
docker exec onys_postgres \
  psql -U onsys -c "CREATE DATABASE onsys_prod OWNER onsys;"
```

### 3.3 Restore the dump

```bash
# Restore from the custom-format dump
docker exec -i onys_postgres \
  pg_restore \
  --username=onsys \
  --dbname=onsys_prod \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  < /tmp/onys_dev_*.dump
```

If you see errors about sequences or views already existing — that is normal when using `--clean`. Check the final row count to confirm:

```bash
docker exec onys_postgres \
  psql -U onsys -d onsys_prod \
  -c "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20;"
```

### 3.4 Grant permissions (if needed)

```bash
docker exec onys_postgres \
  psql -U onsys -d onsys_prod \
  -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO onsys;
      GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO onsys;
      GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO onsys;"
```

### 3.5 Run Prisma migrations to apply any new schema changes

After restoring, let the migrate container bring the schema up to the current migration head:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  run --rm migrate
```

---

## Part 4 — Build and Start Everything

### 4.1 First deploy

```bash
cd /opt/onsys

# Build all images (takes 5–15 min first time)
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  build --no-cache api workers web

# Start all services (migrate runs automatically before api/workers)
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  up -d

# Watch startup logs
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f
```

### 4.2 Verify all containers are running

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Expected output:
```
NAME             STATUS
onys_postgres    running (healthy)
onys_redis       running (healthy)
onys_migrate     exited (0)         ← exit 0 = migrations OK
onys_api         running (healthy)
onys_workers     running
onys_web         running (healthy)
```

### 4.3 Test endpoints

```bash
# API health
curl http://localhost:3001/api/v1/health

# Web (should return HTML)
curl -I http://localhost:3000
```

---

## Part 5 — Subsequent Deploys

Use the deploy script for all future deployments:

```bash
cd /opt/onsys
./deploy.sh main
```

The script will:
1. Pull latest code from the specified branch
2. Rebuild images (`--no-cache`)
3. Start with `--force-recreate` (migrate runs automatically)
4. Health-check API and Web after 45s
5. Prune dangling images

To deploy a specific branch:
```bash
./deploy.sh release-2026-03-30
```

---

## Part 6 — Nginx Reverse Proxy (optional but recommended)

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx

sudo tee /etc/nginx/sites-available/onsys <<'EOF'
server {
    server_name app.onsys.com.au;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    server_name api.onsys.com.au;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20M;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/onsys /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL (Let's Encrypt)
sudo certbot --nginx -d app.onsys.com.au -d api.onsys.com.au
```

---

## Part 7 — Maintenance Commands

### View logs

```bash
# All services
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f

# Single service
docker logs onys_api --tail=100 -f
docker logs onys_workers --tail=100 -f
docker logs onys_web --tail=100 -f
docker logs onys_migrate --tail=50
```

### Restart a single service

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  restart api

# workers
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  restart workers
```

### Stop all services

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down
```

### Stop and wipe ALL data (destructive — removes volumes)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down -v
```

### Open a psql shell

```bash
docker exec -it onys_postgres psql -U onsys -d onsys_prod
```

### Run Prisma Studio (temporarily)

```bash
docker exec -it onys_api \
  sh -c "cd /app/apps/api && node_modules/.bin/prisma studio"
# Then forward port 5555 via SSH tunnel:
# ssh -L 5555:localhost:5555 azureuser@portal1.onsys.com.au
```

### Run the admin seed script

```bash
docker exec -it onys_api \
  sh -c "cd /app && node apps/api/dist/scripts/seed-admin.js"
```

### BullMQ queue inspection (via redis-cli)

```bash
docker exec -it onys_redis redis-cli
# Inside redis-cli:
KEYS bull:*
LLEN bull:email:wait
LLEN bull:email:failed
```

---

## Part 8 — Scheduled Database Backups

Add to crontab (`crontab -e`) on the Azure VM:

```cron
# Daily backup at 2am — keeps 7 days
0 2 * * * docker exec onys_postgres pg_dump \
  -U onsys onsys_prod \
  --format=custom --no-owner --no-privileges \
  > /opt/onsys/backups/onsys_prod_$(date +\%Y\%m\%d).dump \
  && find /opt/onsys/backups -name "*.dump" -mtime +7 -delete
```

Create the backups directory:
```bash
mkdir -p /opt/onsys/backups
```

---

## Part 9 — Troubleshooting

### migrate container exits non-zero

```bash
docker logs onys_migrate
```

Usually means the database is not yet reachable or a migration conflict exists.
Fix migration conflicts locally, push, then redeploy.

### API returns 500 / database connection errors

```bash
# Check DATABASE_URL in .env.prod matches POSTGRES_USER/PASSWORD/DB
docker exec onys_postgres \
  psql -U onsys -d onsys_prod -c "SELECT 1;"

# Check api env
docker exec onys_api printenv DATABASE_URL
```

### Port already in use

```bash
sudo ss -tlnp | grep ':3001\|:3000\|:5432\|:6379'
```

### Out of disk space

```bash
df -h
docker system df

# Remove unused images and stopped containers
docker system prune -f
```

### Rebuild a single service without downtime

```bash
# Build new image
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  build --no-cache api

# Recreate just that container
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  up -d --force-recreate api
```
