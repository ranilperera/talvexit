// Front-end metadata for the 28 IT specialisations.
// Mirrors DOMAIN_KEYS in packages/shared/src/enums.ts.
//
// Used by the /services index page (Service JSON-LD) and the per-domain
// landing pages added in Phase 3. Keep in lock-step with DOMAIN_KEYS;
// the order here drives the visual order on /services.

export interface ITDomainMeta {
  key: string;       // Matches DOMAIN_KEYS — the canonical enum
  slug: string;      // URL slug used at /services/[slug]
  label: string;     // Human-friendly label
  blurb: string;     // One-sentence description for SEO snippets / AEO answers
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export const IT_DOMAINS: ITDomainMeta[] = [
  // Tier 1 — core infrastructure
  { key: 'FIREWALL', slug: 'firewall', label: 'Firewall & Perimeter Security', blurb: 'Design, deploy, audit and harden enterprise firewalls — Fortinet, Palo Alto, Cisco, Check Point, pfSense.', tier: 1 },
  { key: 'NETWORKING', slug: 'networking', label: 'Networking', blurb: 'Routing, switching, SD-WAN, BGP, MPLS, network segmentation and core-network refresh projects.', tier: 1 },
  { key: 'DATABASE', slug: 'database', label: 'Database Administration', blurb: 'SQL Server, Oracle, PostgreSQL, MySQL — performance tuning, HA/DR, upgrades, migrations and 24/7 ops.', tier: 1 },
  { key: 'CLOUD_INFRASTRUCTURE', slug: 'cloud-infrastructure', label: 'Cloud Infrastructure', blurb: 'Azure, AWS, GCP — landing zones, IaC, network topologies, cost engineering and platform migrations.', tier: 1 },
  { key: 'LINUX', slug: 'linux', label: 'Linux Administration', blurb: 'RHEL, Ubuntu, SUSE — hardening, patching, kernel tuning, SELinux, container hosts and bare-metal ops.', tier: 1 },
  { key: 'WINDOWS_ADMIN', slug: 'windows-admin', label: 'Windows Administration', blurb: 'Active Directory, Group Policy, Windows Server, file/print services, PKI and patch management.', tier: 1 },
  // Tier 2 — security & compliance
  { key: 'CYBERSECURITY', slug: 'cybersecurity', label: 'Cybersecurity', blurb: 'Penetration testing, SOC engineering, SIEM tuning, incident response, vulnerability management.', tier: 2 },
  { key: 'IDENTITY_ACCESS', slug: 'identity-access', label: 'Identity & Access Management', blurb: 'Entra ID, Okta, ADFS, SAML/OIDC federation, conditional access, privileged access management.', tier: 2 },
  { key: 'GRC', slug: 'grc', label: 'Governance, Risk & Compliance', blurb: 'ISO 27001, SOC 2, Essential Eight, ISM, PCI-DSS, APRA CPS 234 — readiness, audit and remediation.', tier: 2 },
  // Tier 3 — engineering & automation
  { key: 'DEVOPS', slug: 'devops', label: 'DevOps Engineering', blurb: 'CI/CD pipelines, Kubernetes, Terraform, Ansible, GitOps, observability and platform engineering.', tier: 3 },
  { key: 'AI_INTEGRATION', slug: 'ai-integration', label: 'AI Integration', blurb: 'LLM integration, RAG pipelines, vector databases, Copilot/ChatGPT enterprise rollouts and guardrails.', tier: 3 },
  { key: 'DATA_ENGINEERING', slug: 'data-engineering', label: 'Data Engineering', blurb: 'Data warehousing, ETL/ELT, Snowflake, Databricks, Fabric, lakehouse design and BI enablement.', tier: 3 },
  { key: 'LOW_CODE', slug: 'low-code', label: 'Low-Code & Workflow Automation', blurb: 'Power Platform, Logic Apps, n8n, Zapier — business-process automation with governance.', tier: 3 },
  // Tier 4 — infrastructure management
  { key: 'STORAGE', slug: 'storage', label: 'Enterprise Storage', blurb: 'SAN, NAS, object storage, replication, snapshots, deduplication and storage refresh projects.', tier: 4 },
  { key: 'VIRTUALISATION', slug: 'virtualisation', label: 'Virtualisation', blurb: 'VMware vSphere, Hyper-V, Nutanix, Proxmox — design, migration, optimisation and right-sizing.', tier: 4 },
  { key: 'BACKUP_DR', slug: 'backup-dr', label: 'Backup & Disaster Recovery', blurb: 'Veeam, Commvault, Rubrik — RPO/RTO design, immutable backups, ransomware recovery, DR testing.', tier: 4 },
  { key: 'SYSTEM_ADMIN', slug: 'system-admin', label: 'System Administration', blurb: 'Multi-platform sysadmin coverage — patching, monitoring, on-call rota and operational hygiene.', tier: 4 },
  { key: 'WIRELESS', slug: 'wireless', label: 'Wireless & Mobility', blurb: 'Enterprise Wi-Fi design, site surveys, controllers, NAC integration and tuning for high-density.', tier: 4 },
  // Tier 5 — productivity & communication
  { key: 'OFFICE_365', slug: 'office-365', label: 'Microsoft 365', blurb: 'Exchange Online, Teams, SharePoint, Intune, Defender for Office — tenant design and migrations.', tier: 5 },
  { key: 'UNIFIED_COMMS', slug: 'unified-comms', label: 'Unified Communications', blurb: 'Voice, telephony, contact centre, Microsoft Teams Phone, Zoom Phone, SBC and SIP integration.', tier: 5 },
  { key: 'END_USER_COMPUTING', slug: 'end-user-computing', label: 'End-User Computing', blurb: 'Windows 11 deployments, MDM/MAM, autopilot, Citrix, AVD, Workspace ONE and image lifecycle.', tier: 5 },
  // Tier 6 — enterprise systems
  { key: 'ITSM', slug: 'itsm', label: 'ITSM & Service Management', blurb: 'ServiceNow, Jira Service Management, Freshservice — ITIL aligned process design and tooling.', tier: 6 },
  { key: 'ERP_ENTERPRISE_APPS', slug: 'erp-enterprise-apps', label: 'ERP & Enterprise Applications', blurb: 'SAP, Oracle EBS/Fusion, Dynamics 365, NetSuite, Salesforce — implementation and integration.', tier: 6 },
  { key: 'MDM', slug: 'mdm', label: 'Master Data & MDM', blurb: 'Master data management, data governance, Informatica MDM, Reltio — data stewardship and quality.', tier: 6 },
  // Tier 7 — architecture & development
  { key: 'IT_ARCHITECTURE', slug: 'it-architecture', label: 'IT Architecture', blurb: 'Enterprise architecture, solution architecture, TOGAF, target-state design and architecture review.', tier: 7 },
  { key: 'IT_PROJECT_MGMT', slug: 'it-project-mgmt', label: 'IT Project & Program Management', blurb: 'PMP/Prince2/SAFe project leadership for infrastructure, security and platform programmes.', tier: 7 },
  { key: 'ENTERPRISE_APP_DEV', slug: 'enterprise-app-dev', label: 'Enterprise Application Development', blurb: 'Custom enterprise software — .NET, Java, Node.js, Python — for internal platforms and integration tiers.', tier: 7 },
  { key: 'INTEGRATION_MIDDLEWARE', slug: 'integration-middleware', label: 'Integration & Middleware', blurb: 'API gateways, ESB, MuleSoft, Boomi, Azure Integration Services, event-driven architecture.', tier: 7 },
];

export function findDomainBySlug(slug: string): ITDomainMeta | undefined {
  return IT_DOMAINS.find((d) => d.slug === slug);
}
