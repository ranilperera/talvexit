# Reset Database for Testing

Wipes all transactional data and non-admin user accounts so you can start a fresh testing cycle.

**Preserved:** `PLATFORM_ADMIN`, `SUPPORT_ADMIN`, `COMPLIANCE_ADMIN` users, `PlatformConfig`, and `ITDomain`  
**Cleared:** everything else — orders, tasks, companies, orgs, tenders, credentials, users, audit log, etc.

---

## Option 1 — Run SQL directly in PostgreSQL

Connect to the database:

```bash
psql "postgresql://onsys_online:<password>@localhost:5432/telvax1"
```

Then run:

```sql
BEGIN;

-- Truncate all transactional tables in one shot.
-- CASCADE handles FK dependency ordering automatically.
-- TRUNCATE bypasses row-level DELETE triggers (incl. AuditLog append-only guard).
TRUNCATE TABLE
  "CredentialAccessLog",
  "OrderAccessCredential",
  "WorkLog",
  "OrderDeliverable",
  "OrderMessage",
  "OrderChatMessage",
  "ScopeModificationRequest",
  "MilestoneRelease",
  "ChangeRequest",
  "DisputeSubmission",
  "Dispute",
  "Rating",
  "BankTransferPayment",
  "CompanyInvoice",
  "PayoutRecord",
  "CompanyPayoutRecord",
  "CompanyOrderProposal",
  "PurchaseOrder",
  "Order",
  "TaskMessage",
  "TaskThread",
  "TaskMilestone",
  "Task",
  "PendingScope",
  "VideoSession",
  "ContractorAgreement",
  "ContractorPayoutMethod",
  "InsuranceCertificate",
  "StripeConnectAccount",
  "ContractorProfile",
  "CustomerProfile",
  "CompanyPayoutPreference",
  "CompanyPayoutAccount",
  "CompanyInvitation",
  "CompanyMember",
  "ConsultingCompany",
  "OrgDocument",
  "OrgLegalAcceptance",
  "OrgInsuranceCertificate",
  "OrgMember",
  "Organisation",
  "TenderContractPayoutRecord",
  "TenderContractBankTransfer",
  "TenderContractInvoice",
  "TenderDeliverable",
  "TenderMilestone",
  "TenderContract",
  "TenderProposal",
  "TenderInvitation",
  "TenderRequest",
  "AmlCheck",
  "ProviderTaxDeclaration",
  "SupplierStatement",
  "StripeWebhookEvent",
  "DocumentSequence",
  "AuditLog",
  "EmailOtpChallenge",
  "LegalDocAcceptance",
  "RefreshToken"
CASCADE;

-- Delete all non-admin users (FK children are already gone).
DELETE FROM "User"
WHERE account_type NOT IN ('PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN');

-- Confirm what was preserved.
SELECT email, account_type, full_name FROM "User" ORDER BY created_at;

COMMIT;
```

> **Tip:** To do a dry run, replace `COMMIT;` with `ROLLBACK;` — the SELECT will show preserved accounts but nothing will be saved.

---

## Option 2 — Run the TypeScript script (requires Docker)

From the VM, run inside the api container so node_modules are available:

```bash
cd /opt/onsys

docker compose -f docker-compose.prod.yml --env-file .env.prod \
  run --rm --no-deps --entrypoint sh api \
  -c "cd /app/apps/api && FORCE_RESET=true node_modules/.bin/tsx src/scripts/reset-for-testing.ts"
```

Or from `apps/api` locally if node_modules are installed:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/onys_dev pnpm reset:test
```

---

## After the reset

- All admin accounts are preserved but **refresh tokens are cleared** — admins must log in again.
- `DocumentSequence` is cleared — invoice and PO numbers restart from 1.
- `PlatformConfig` is untouched — platform settings remain.
- `ITDomain` is untouched — service domains remain.

> **Note:** If you ran an earlier version of the reset SQL that wiped `ITDomain`, re-seed the domains with the script below.

---

## Re-seed service domains (if ITDomain was wiped)

```sql
INSERT INTO "ITDomain" (key, label, short_label, icon, description, sort_order, insurance_tier)
VALUES
  ('FIREWALL',      'Firewall & Network Security',   'Firewall',    '🔥', 'Enterprise firewall configuration, rule management, and network perimeter security.',          1,  'HIGH_RISK'),
  ('NETWORKING',    'Networking & Infrastructure',   'Networking',  '🌐', 'LAN/WAN design, switches, routers, SD-WAN, and network troubleshooting.',                     2,  'ELEVATED'),
  ('DATABASE',      'Database Administration',       'Database',    '🗄️', 'SQL Server, PostgreSQL, Oracle, MySQL — DBA, tuning, migration, and HA.',                     3,  'ELEVATED'),
  ('CLOUD_AZURE',   'Cloud Infrastructure',          'Cloud',       '☁️', 'Azure, AWS, and GCP architecture, migration, and managed services.',                          4,  'HIGH_RISK'),
  ('LINUX',         'Linux Systems',                 'Linux',       '🐧', 'Linux server administration, scripting, hardening, and performance tuning.',                  5,  'STANDARD'),
  ('WINDOWS_ADMIN', 'Windows Administration',        'Windows',     '🖥️', 'Active Directory, Group Policy, Windows Server, and desktop management.',                    6,  'STANDARD'),
  ('CYBERSECURITY', 'Cybersecurity',                 'Security',    '🔒', 'Penetration testing, SIEM, incident response, compliance, and risk assessment.',              7,  'HIGH_RISK'),
  ('DEVOPS',        'DevOps & CI/CD',                'DevOps',      '⚙️', 'Pipeline automation, containerisation, Kubernetes, and infrastructure as code.',              8,  'ELEVATED'),
  ('STORAGE',       'Storage & SAN',                 'Storage',     '💾', 'SAN, NAS, object storage, capacity planning, and data tiering.',                             9,  'ELEVATED'),
  ('VIRTUALIZATION','Virtualisation',                'Virtual',     '📦', 'VMware vSphere, Hyper-V, Proxmox — VM provisioning, vMotion, and consolidation.',            10, 'STANDARD'),
  ('OFFICE_365',    'Microsoft 365',                 'M365',        '📧', 'Exchange Online, Teams, SharePoint, Intune, and tenant administration.',                     11, 'STANDARD'),
  ('BACKUP',        'Backup & Disaster Recovery',    'Backup & DR', '💿', 'Veeam, Commvault, Backup Exec — RPO/RTO design, DR testing, and replication.',              12, 'ELEVATED'),
  ('AI_INTEGRATION','AI & Automation',               'AI',          '🤖', 'AI/ML integration, process automation, Power Automate, and scripting.',                      13, 'HIGH_RISK'),
  ('SYSTEM_ADMIN',  'System Administration',         'SysAdmin',    '🛠️', 'General IT operations, end-user support escalation, and infrastructure management.',         14, 'ELEVATED')
ON CONFLICT (key) DO UPDATE SET
  label          = EXCLUDED.label,
  short_label    = EXCLUDED.short_label,
  icon           = EXCLUDED.icon,
  description    = EXCLUDED.description,
  sort_order     = EXCLUDED.sort_order,
  insurance_tier = EXCLUDED.insurance_tier;
```

Safe to re-run any time — inserts missing rows, updates existing ones.
