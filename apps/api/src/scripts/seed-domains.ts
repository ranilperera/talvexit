/**
 * Seed the ITDomain catalog (28 categories across 7 tiers).
 * Run: pnpm --filter @onys/api exec tsx src/scripts/seed-domains.ts
 *
 * Note on `key`: ITDomain.key is a free-form String — it does NOT have to
 * match a value in the Prisma `Domain` enum. The Domain enum still controls
 * Task.domain / ContractorProfile.domains. New keys here that aren't in the
 * Domain enum (e.g. IDENTITY_ACCESS, GRC, IT_ARCHITECTURE) work for the
 * catalog/browsing UI but cannot be assigned to Task.domain until the enum
 * is extended in schema.prisma.
 */

// Load .env BEFORE any prisma/pg imports
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv') as { config: (opts: { path: string }) => void };
dotenv.config({ path: resolve(__dir, '../../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DOMAINS = [
  // ─── TIER 1 — CORE INFRASTRUCTURE (1–6) ──────────────────────────────────
  {
    key: 'FIREWALL',
    label: 'Firewall & Network Security',
    short_label: 'Firewall',
    icon: '🔥',
    description:
      'Enterprise firewall configuration, rule management, perimeter security, and network policy enforcement.',
    sort_order: 1,
    is_active: true,
    insurance_tier: 'HIGH_RISK',
  },
  {
    key: 'NETWORKING',
    label: 'Networking & Infrastructure',
    short_label: 'Networking',
    icon: '🌐',
    description:
      'LAN/WAN design, switches, routers, SD-WAN, BGP/OSPF routing, VPN, and network troubleshooting.',
    sort_order: 2,
    is_active: true,
    insurance_tier: 'ELEVATED',
  },
  {
    key: 'DATABASE',
    label: 'Database Administration',
    short_label: 'Database',
    icon: '🗄️',
    description:
      'SQL Server, PostgreSQL, Oracle, MySQL — DBA, performance tuning, migration, replication, and HA.',
    sort_order: 3,
    is_active: true,
    insurance_tier: 'ELEVATED',
  },
  {
    key: 'CLOUD_INFRASTRUCTURE',
    label: 'Cloud Infrastructure',
    short_label: 'Cloud',
    icon: '☁️',
    description:
      'Azure, AWS, and GCP architecture, infrastructure provisioning, managed services, and cloud operations.',
    sort_order: 4,
    is_active: true,
    insurance_tier: 'HIGH_RISK',
  },
  {
    key: 'LINUX',
    label: 'Linux Systems',
    short_label: 'Linux',
    icon: '🐧',
    description:
      'Linux server administration, scripting, hardening, performance tuning, and enterprise Linux operations.',
    sort_order: 5,
    is_active: true,
    insurance_tier: 'STANDARD',
  },
  {
    key: 'WINDOWS_ADMIN',
    label: 'Windows Administration',
    short_label: 'Windows',
    icon: '🖥️',
    description:
      'Active Directory, Group Policy, Windows Server, DNS/DHCP, and enterprise desktop management.',
    sort_order: 6,
    is_active: true,
    insurance_tier: 'STANDARD',
  },

  // ─── TIER 2 — SECURITY & COMPLIANCE (7–9) ────────────────────────────────
  {
    key: 'CYBERSECURITY',
    label: 'Cybersecurity',
    short_label: 'Security',
    icon: '🔐',
    description:
      'Penetration testing, SIEM, incident response, vulnerability management, compliance, and risk assessment.',
    sort_order: 7,
    is_active: true,
    insurance_tier: 'HIGH_RISK',
  },
  {
    key: 'IDENTITY_ACCESS',
    label: 'Identity & Access Management',
    short_label: 'IAM',
    icon: '🪪',
    description:
      'IAM, Zero Trust architecture, Azure Entra ID, Okta, privileged access management (PAM), MFA, and SSO.',
    sort_order: 8,
    is_active: true,
    insurance_tier: 'HIGH_RISK',
  },
  {
    key: 'GRC',
    label: 'IT Governance, Risk & Compliance',
    short_label: 'GRC',
    icon: '📋',
    description:
      'ISO 27001, Essential Eight, SOC 2, PCI-DSS, NIST, ASD compliance assessments, audit prep, and policy writing.',
    sort_order: 9,
    is_active: true,
    insurance_tier: 'HIGH_RISK',
  },

  // ─── TIER 3 — ENGINEERING & AUTOMATION (10–13) ──────────────────────────
  {
    key: 'DEVOPS',
    label: 'DevOps & CI/CD',
    short_label: 'DevOps',
    icon: '⚙️',
    description:
      'Pipeline automation, containerisation, Kubernetes, Terraform, Ansible, and infrastructure as code.',
    sort_order: 10,
    is_active: true,
    insurance_tier: 'ELEVATED',
  },
  {
    key: 'AI_INTEGRATION',
    label: 'AI & Automation',
    short_label: 'AI',
    icon: '🤖',
    description:
      'AI/ML integration, process automation, Power Automate, scripting, and intelligent workflow design.',
    sort_order: 11,
    is_active: true,
    insurance_tier: 'HIGH_RISK',
  },
  {
    key: 'DATA_ENGINEERING',
    label: 'Data Engineering & Analytics',
    short_label: 'Data & BI',
    icon: '📊',
    description:
      'ETL pipelines, data warehousing, Power BI, Tableau, Snowflake, Azure Synapse, and data lake architecture.',
    sort_order: 12,
    is_active: true,
    insurance_tier: 'ELEVATED',
  },
  {
    key: 'LOW_CODE',
    label: 'Low-Code / No-Code Development',
    short_label: 'Low-Code',
    icon: '🧩',
    description:
      'Power Apps, Power Automate, ServiceNow development, Microsoft Power Platform, and citizen developer solutions.',
    sort_order: 13,
    is_active: true,
    insurance_tier: 'STANDARD',
  },

  // ─── TIER 4 — INFRASTRUCTURE MANAGEMENT (14–18) ─────────────────────────
  {
    key: 'STORAGE',
    label: 'Storage & SAN',
    short_label: 'Storage',
    icon: '💾',
    description:
      'SAN, NAS, object storage, capacity planning, data tiering, and enterprise storage administration.',
    sort_order: 14,
    is_active: true,
    insurance_tier: 'ELEVATED',
  },
  {
    key: 'VIRTUALISATION',
    label: 'Virtualisation',
    short_label: 'Virtual',
    icon: '🖧',
    description:
      'VMware vSphere, Hyper-V, Proxmox — VM provisioning, vMotion, consolidation, and virtualisation management.',
    sort_order: 15,
    is_active: true,
    insurance_tier: 'STANDARD',
  },
  {
    key: 'BACKUP_DR',
    label: 'Backup & Disaster Recovery',
    short_label: 'Backup & DR',
    icon: '🔄',
    description:
      'Veeam, Commvault, Backup Exec — RPO/RTO design, DR testing, replication, and backup strategy.',
    sort_order: 16,
    is_active: true,
    insurance_tier: 'ELEVATED',
  },
  {
    key: 'SYSTEM_ADMIN',
    label: 'System Administration',
    short_label: 'SysAdmin',
    icon: '🔧',
    description:
      'General IT operations, end-user support escalation, infrastructure management, and systems maintenance.',
    sort_order: 17,
    is_active: true,
    insurance_tier: 'ELEVATED',
  },
  {
    key: 'WIRELESS',
    label: 'Wireless & Wi-Fi Infrastructure',
    short_label: 'Wireless',
    icon: '📡',
    description:
      'Enterprise wireless design, Cisco/Aruba/Ruckus deployment, Wi-Fi 6/6E, site surveys, and wireless security.',
    sort_order: 18,
    is_active: true,
    insurance_tier: 'ELEVATED',
  },

  // ─── TIER 5 — PRODUCTIVITY & COMMUNICATION (19–21) ──────────────────────
  {
    key: 'OFFICE_365',
    label: 'Microsoft 365',
    short_label: 'M365',
    icon: '📧',
    description:
      'Exchange Online, Teams, SharePoint, Intune, and Microsoft 365 tenant administration and migration.',
    sort_order: 19,
    is_active: true,
    insurance_tier: 'STANDARD',
  },
  {
    key: 'UNIFIED_COMMS',
    label: 'Unified Communications & VoIP',
    short_label: 'UC & VoIP',
    icon: '☎️',
    description:
      'Microsoft Teams Phone, Cisco CUCM, SIP trunking, VoIP infrastructure, and enterprise communication platforms.',
    sort_order: 20,
    is_active: true,
    insurance_tier: 'ELEVATED',
  },
  {
    key: 'END_USER_COMPUTING',
    label: 'End User Computing & Support',
    short_label: 'EUC',
    icon: '🖨️',
    description:
      'L1/L2 desktop support, device management, Intune MDM, JAMF, image deployment, and ITSM operations.',
    sort_order: 21,
    is_active: true,
    insurance_tier: 'STANDARD',
  },

  // ─── TIER 6 — ENTERPRISE SYSTEMS (22–24) ────────────────────────────────
  {
    key: 'ITSM',
    label: 'IT Service Management',
    short_label: 'ITSM',
    icon: '🎫',
    description:
      'ServiceNow, Jira Service Management, ITIL process design, CMDB, change and incident management.',
    sort_order: 22,
    is_active: true,
    insurance_tier: 'STANDARD',
  },
  {
    key: 'ERP_ENTERPRISE_APPS',
    label: 'ERP & Enterprise Applications',
    short_label: 'ERP',
    icon: '🔌',
    description:
      'SAP, Oracle ERP, Microsoft Dynamics 365, Salesforce administration, and enterprise application integration.',
    sort_order: 23,
    is_active: true,
    insurance_tier: 'ELEVATED',
  },
  {
    key: 'MDM',
    label: 'Mobile Device Management',
    short_label: 'MDM',
    icon: '📱',
    description:
      'Intune, JAMF Pro, VMware Workspace ONE, mobile app management (MAM), and enterprise BYOD policy.',
    sort_order: 24,
    is_active: true,
    insurance_tier: 'STANDARD',
  },

  // ─── TIER 7 — ARCHITECTURE & DEVELOPMENT (25–28) ────────────────────────
  {
    key: 'IT_ARCHITECTURE',
    label: 'IT Architecture & Solution Design',
    short_label: 'Architecture',
    icon: '🏗️',
    description:
      'Enterprise architecture (TOGAF), solution design, infrastructure blueprints, and technology roadmaps.',
    sort_order: 25,
    is_active: true,
    insurance_tier: 'ELEVATED',
  },
  {
    key: 'IT_PROJECT_MGMT',
    label: 'IT Project Management',
    short_label: 'IT PM',
    icon: '📌',
    description:
      'IT project delivery, PMO setup, PRINCE2/PMP, agile scrum master, and technology programme management.',
    sort_order: 26,
    is_active: true,
    insurance_tier: 'STANDARD',
  },
  {
    key: 'ENTERPRISE_APP_DEV',
    label: 'Enterprise Application Development',
    short_label: 'Enterprise Dev',
    icon: '💻',
    description:
      'Custom line-of-business application development, legacy modernisation, API design, and enterprise software engineering.',
    sort_order: 27,
    is_active: true,
    insurance_tier: 'ELEVATED',
  },
  {
    key: 'INTEGRATION_MIDDLEWARE',
    label: 'Integration & Middleware',
    short_label: 'Integration',
    icon: '🔗',
    description:
      'MuleSoft, Azure Integration Services, BizTalk, REST/SOAP APIs, ESB, and enterprise system integration.',
    sort_order: 28,
    is_active: true,
    insurance_tier: 'ELEVATED',
  },
];

async function main() {
  console.log(`Seeding ${DOMAINS.length} IT domains…`);
  let created = 0;
  let updated = 0;

  for (const domain of DOMAINS) {
    const existing = await prisma.iTDomain.findUnique({
      where: { key: domain.key },
    });
    if (existing) {
      await prisma.iTDomain.update({ where: { key: domain.key }, data: domain });
      updated++;
    } else {
      await prisma.iTDomain.create({ data: domain });
      created++;
    }
  }

  console.log(`Done. Created: ${created}, Updated: ${updated}`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
