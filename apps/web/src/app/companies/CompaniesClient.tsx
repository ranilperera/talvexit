'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import PublicPageShell, { theme as t } from '@/components/public/PublicPageShell';
import {
  Search, MapPin, Users, CheckCircle2, Filter, ChevronRight, Building2,
  Wallet, Shield, FileSignature, BadgeCheck, Briefcase, Globe, ChevronDown,
  Sparkles, Zap, TrendingUp,
} from 'lucide-react';

const SERVICE_TYPES = [
  'All', 'Managed IT', 'Cloud Services', 'Network Infrastructure', 'Cybersecurity',
  'DevOps & CI/CD', 'Data & Analytics', 'Digital Transformation', 'IT Consulting',
];

const REGIONS = ['All', 'Australia', 'Southeast Asia', 'South Asia', 'Europe', 'Americas'];

interface PublicCompany {
  id: string;
  name: string;
  tagline: string;
  location: string;
  services: string[];
  team_size: string;
  rating_avg: number;
  rating_count: number;
  verified: boolean;
  insured: boolean;
  founded_year: number;
}

const PLACEHOLDER: PublicCompany[] = [
  {
    id: 'c1', name: 'Nexus IT Solutions',
    tagline: 'Enterprise cloud migration and managed services across APAC',
    location: 'Sydney, AU', services: ['Managed IT', 'Cloud Services'],
    team_size: '50–100', rating_avg: 4.8, rating_count: 28,
    verified: true, insured: true, founded_year: 2018,
  },
  {
    id: 'c2', name: 'SecureNet Asia',
    tagline: 'Cybersecurity specialists for financial services and government',
    location: 'Singapore, SG', services: ['Cybersecurity', 'Network Infrastructure'],
    team_size: '20–50', rating_avg: 4.9, rating_count: 14,
    verified: true, insured: true, founded_year: 2016,
  },
  {
    id: 'c3', name: 'CloudPillar Group',
    tagline: 'AWS Premier Partner — multi-cloud architecture and DevOps',
    location: 'Melbourne, AU', services: ['Cloud Services', 'DevOps & CI/CD'],
    team_size: '100–250', rating_avg: 4.7, rating_count: 42,
    verified: true, insured: true, founded_year: 2014,
  },
  {
    id: 'c4', name: 'DataBridge Consulting',
    tagline: 'Data warehouse, analytics, and BI for enterprise clients',
    location: 'Bengaluru, IN', services: ['Data & Analytics', 'Cloud Services'],
    team_size: '50–100', rating_avg: 4.6, rating_count: 19,
    verified: true, insured: true, founded_year: 2019,
  },
  {
    id: 'c5', name: 'Meridian Digital',
    tagline: 'Digital transformation and IT strategy advisory',
    location: 'London, UK', services: ['Digital Transformation', 'IT Consulting'],
    team_size: '10–20', rating_avg: 4.9, rating_count: 11,
    verified: true, insured: true, founded_year: 2020,
  },
  {
    id: 'c6', name: 'Apex Network Systems',
    tagline: 'Cisco Gold Partner — WAN, LAN, SD-WAN, wireless',
    location: 'Brisbane, AU', services: ['Network Infrastructure', 'Managed IT'],
    team_size: '20–50', rating_avg: 4.8, rating_count: 33,
    verified: true, insured: false, founded_year: 2011,
  },
];

// ─── Benefits tailored for consulting firms ──────────────────────────────────

interface Benefit {
  icon: React.ElementType;
  title: string;
  body: string;
}

const COMPANY_BENEFITS: Benefit[] = [
  {
    icon: Wallet,
    title: 'Zero commission on engagements',
    body: 'Subscription is the only platform fee. On a $50k engagement, a 17% commission elsewhere costs you $8,500. On TalvexIT it costs you nothing — your subscription pays for itself many times over each month.',
  },
  {
    icon: Users,
    title: 'Multi-member team management',
    body: 'Add unlimited senior consultants, assign roles (admin, executing member), and route engagements to the right person. Members log work, raise change requests, and update deliverables — the company invoices and gets paid.',
  },
  {
    icon: TrendingUp,
    title: 'Central billing across the firm',
    body: 'Invoices go out under your company\'s legal entity, ABN, and bank rail — not the individual consultant\'s. Customers pay one invoice for the engagement; you allocate internally. Tax-compliant Tax Invoices generated automatically.',
  },
  {
    icon: Shield,
    title: 'Procurement-ready buyers',
    body: 'Customers register with verified ABN, business address, billing contact, and (above $1k ex-GST) a customer ABN on every Tax Invoice. Real procurement teams, not anonymous freelance buyers — they speak your language and pay on commercial terms.',
  },
  {
    icon: FileSignature,
    title: 'Bring your own legal terms',
    body: 'Each proposal carries an editable Legal Terms & Conditions block. Drop in your firm\'s MSA boilerplate, adapt per engagement, or use the platform default. Whatever you author becomes the binding agreement on customer approval — no separate paper contract round trip.',
  },
  {
    icon: Briefcase,
    title: 'Built-in PO + invoicing workflow',
    body: 'Proposals → numbered Purchase Orders → milestone or single Tax Invoices → payment evidence reconciliation → audit log. The full enterprise procurement flow, ready out of the box. No CRM-to-billing integration project required.',
  },
];

// ─── How it works for a consulting firm ─────────────────────────────────────

interface Step {
  num: string;
  icon: React.ElementType;
  title: string;
  body: string;
}

const COMPANY_STEPS: Step[] = [
  {
    num: '01',
    icon: BadgeCheck,
    title: 'Register &amp; verify your firm',
    body: 'Primary admin signs up, completes KYC + ABN verification (live ABR lookup), uploads PI insurance + business registration + Board Resolution authorising you to bind the entity. Compliance review typically under 24 hours.',
  },
  {
    num: '02',
    icon: Users,
    title: 'Add your senior consultants',
    body: 'Invite team members by email. Each completes their own KYC and joins under your company. Assign roles — Company Admin (can sign), Company Member (executes engagements). Capacity-gated by your subscription tier.',
  },
  {
    num: '03',
    icon: FileSignature,
    title: 'Win &amp; structure work',
    body: 'Customers send you orders directly or via marketplace browse. Your admin drafts a proposal with scope, timeline, your commercial terms, and your legal T&Cs. On approval the platform issues a numbered PO — both sides bound, audit-trailed.',
  },
  {
    num: '04',
    icon: Wallet,
    title: 'Deliver, invoice, get paid',
    body: 'Assigned member delivers; admin raises a Tax Invoice; the customer pays your firm direct via your nominated rail (Stripe link, AU bank, SWIFT, etc.). Money lands in your company account, not the platform\'s.',
  },
];

// ─── Trust signals (firm-specific) ───────────────────────────────────────────

const TRUST_BADGES = [
  { label: 'ABN verified', body: 'Live ABR lookup' },
  { label: 'PI insurance', body: 'Firm-level cover required' },
  { label: 'Board Resolution', body: 'Signed authority on file' },
  { label: 'Provider Agreement', body: 'Bound by primary admin' },
  { label: 'KYC for members', body: 'Every consultant verified' },
];

// ─── FAQs targeted at consulting firms ──────────────────────────────────────

const FAQS = [
  {
    q: 'How does TalvexIT compare to listing on a freelance marketplace?',
    a: 'Freelance marketplaces are built around individual hourly engagements, anonymous buyers, and 15–20% per-engagement commissions. TalvexIT is built around firm-to-firm contracts: enterprise procurement workflow (proposal → PO → milestone invoice → payment evidence), real ABN-verified buyers, multi-member teams, and zero commission on engagements. Different commercial model, different audience.',
  },
  {
    q: 'How are member roles structured?',
    a: 'Two roles inside a company: Company Admin (can draft & send proposals, raise invoices, manage members, sign on behalf of the firm) and Company Member (executes engagements, logs work, uploads deliverables). One person is the Primary Admin — the legal signatory bound by the Provider Agreement. Add and remove members at any time.',
  },
  {
    q: 'How do payments work for the firm?',
    a: 'Customers pay your company directly using the rail your firm nominates — your AU bank account, Stripe Connect, SWIFT, or any other. The customer uploads payment evidence; your admin confirms receipt against the invoice. The platform never holds funds and never sits between you and the money.',
  },
  {
    q: 'What about GST and Australian compliance?',
    a: 'Every Tax Invoice carries the right GST treatment automatically — domestic 10%, GST-free export (s38-190) for overseas customers, or reverse-charge prompts for cross-border. Customer ABN appears on every invoice over $1,000 ex-GST. No-ABN withholding (47%) is computed at payout. Your tax return uses our exported invoice register.',
  },
  {
    q: 'Can we white-label the platform?',
    a: 'White-label and custom-domain features are available on Company tier and above (see Pricing). Your customers see the engagement on a TalvexIT-or-your-domain workflow with your firm\'s branding on POs and invoices. The platform\'s billing-agent disclosure is preserved on every PO for compliance.',
  },
  {
    q: 'What\'s the typical onboarding time?',
    a: 'Plan on 1–3 business days from sign-up to going live. KYC + ABN verify same day; insurance + Board Resolution upload typically same day; compliance review of those documents under 24 hours; first member invitations and profile go live as soon as approved. Most firms post their first engagement within a week.',
  },
];

// ─── Components ──────────────────────────────────────────────────────────────

function CompanyCard({ c }: { c: PublicCompany }) {
  return (
    <Link
      href={`/companies/${c.id}`}
      style={{
        display: 'block',
        background: t.cardBg,
        border: `1px solid ${t.cardBorder}`,
        borderRadius: '1rem',
        padding: '1.5rem',
        textDecoration: 'none',
        transition: 'border-color 0.2s',
      }}
      className="hp-card group"
    >
      <div className="flex items-start gap-4 mb-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: t.chipBg, border: `1px solid ${t.chipBorder}` }}
        >
          <Building2 size={20} style={{ color: t.accentBg }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold text-base font-display truncate" style={{ color: t.headlineColor }}>
              {c.name}
            </h3>
            {c.verified && <CheckCircle2 size={14} style={{ color: t.accentBg, flexShrink: 0 }} />}
          </div>
          <p className="text-sm line-clamp-2" style={{ color: t.bodyColor }}>{c.tagline}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4 text-xs" style={{ color: t.mutedColor }}>
        <span className="flex items-center gap-1"><MapPin size={11} />{c.location}</span>
        <span className="flex items-center gap-1"><Users size={11} />{c.team_size} staff</span>
        <span>Est. {c.founded_year}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {c.services.map((s) => (
          <span
            key={s}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: t.chipBg, color: t.chipText, border: `1px solid ${t.chipBorder}` }}
          >
            {s}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold" style={{ color: t.headlineColor }}>
            ★ {c.rating_avg.toFixed(1)}
          </span>
          <span className="text-xs" style={{ color: t.mutedColor }}>({c.rating_count} reviews)</span>
        </div>
        <div className="flex items-center gap-2">
          {c.insured && <span className="text-xs" style={{ color: t.mutedColor }}>Insured</span>}
          <ChevronRight size={14} style={{ color: t.mutedColor }} />
        </div>
      </div>
    </Link>
  );
}

function PrimaryCTA({ children, large = false }: { children?: React.ReactNode; large?: boolean }) {
  return (
    <Link
      href="/register?role=company"
      className="hp-primary inline-flex items-center gap-2 font-semibold rounded-xl transition-all duration-200"
      style={{
        background: t.primaryBg,
        color: t.primaryText,
        textDecoration: 'none',
        padding: large ? '0.875rem 1.75rem' : '0.625rem 1.25rem',
        fontSize: large ? '0.95rem' : '0.85rem',
      }}
    >
      {children ?? 'Register your firm'}
      <ChevronRight size={large ? 18 : 15} />
    </Link>
  );
}

function SecondaryCTA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 font-medium rounded-xl px-5 py-2.5 text-sm transition-all duration-200"
      style={{
        background: t.cardBg,
        color: t.headlineColor,
        border: `1px solid ${t.cardBorder}`,
        textDecoration: 'none',
      }}
    >
      {children}
    </Link>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
        style={{ color: t.headlineColor, background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <span className="text-sm font-semibold">{q}</span>
        <ChevronDown
          size={16}
          style={{
            color: t.mutedColor,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            flexShrink: 0,
          }}
        />
      </button>
      {open && (
        <div className="px-5 pb-4">
          <p className="text-sm leading-relaxed" style={{ color: t.bodyColor }}>{a}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function CompaniesClient() {
  const [search, setSearch] = useState('');
  const [service, setService] = useState('All');
  const [region, setRegion] = useState('All');
  const [companies, setCompanies] = useState<PublicCompany[]>(PLACEHOLDER);

  useEffect(() => {
    let filtered = PLACEHOLDER;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (c) => c.name.toLowerCase().includes(q) || c.tagline.toLowerCase().includes(q),
      );
    }
    if (service !== 'All') {
      filtered = filtered.filter((c) => c.services.includes(service));
    }
    if (region !== 'All') {
      const regionMap: Record<string, string[]> = {
        'Australia': ['AU'],
        'Southeast Asia': ['SG', 'MY', 'PH', 'TH'],
        'South Asia': ['IN'],
        'Europe': ['UK', 'DE', 'FR'],
        'Americas': ['US', 'CA'],
      };
      const codes = regionMap[region] ?? [];
      filtered = filtered.filter((c) => codes.some((code) => c.location.includes(code)));
    }
    setCompanies(filtered);
  }, [search, service, region]);

  return (
    <PublicPageShell>
      {/* ─── Hero ───────────────────────────────────────────────────────────── */}
      <section
        className="pt-20 pb-16 px-6"
        style={{ background: t.section1Bg, borderBottom: `1px solid ${t.sectionBorder}` }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: t.eyebrowColor }}>
            For IT consulting firms
          </p>
          <h1 className="font-display font-bold text-4xl md:text-5xl lg:text-6xl mb-5" style={{ color: t.headlineColor, letterSpacing: '-0.02em' }}>
            Win enterprise contracts. Keep your margin.
          </h1>
          <p className="text-lg md:text-xl mb-8 max-w-2xl mx-auto" style={{ color: t.bodyColor, lineHeight: 1.5 }}>
            TalvexIT is the subscription-only marketplace built for senior IT consulting firms. <strong style={{ color: t.headlineColor }}>Zero commission</strong> on engagements. Central billing across all your members. Procurement-ready Australian buyers on fixed-scope contracts.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
            <PrimaryCTA large>Register your firm — free to start</PrimaryCTA>
            <SecondaryCTA href="#firms">
              <Search size={14} />
              Browse listed firms
            </SecondaryCTA>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs" style={{ color: t.mutedColor }}>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} style={{ color: t.accentBg }} /> Verification in 1–3 days</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} style={{ color: t.accentBg }} /> Multi-member teams</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} style={{ color: t.accentBg }} /> No commission, ever</span>
          </div>
        </div>
      </section>

      {/* ─── Why TalvexIT for firms — benefit grid ──────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
              Why senior IT firms choose us
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4" style={{ color: t.headlineColor, letterSpacing: '-0.01em' }}>
              Built for firms with margin to defend.
            </h2>
            <p className="text-base max-w-2xl mx-auto" style={{ color: t.bodyColor }}>
              Generic platforms commoditise your team and skim 15–20% off every engagement. TalvexIT is purpose-built for consulting firms running senior IT engagements on a fair, predictable commercial model.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {COMPANY_BENEFITS.map((b) => (
              <div
                key={b.title}
                className="p-6 rounded-2xl"
                style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${t.accentBg}18`, color: t.accentBg }}
                >
                  <b.icon size={20} />
                </div>
                <h3 className="font-display font-semibold text-lg mb-2" style={{ color: t.headlineColor }}>{b.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: t.bodyColor }}>{b.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <PrimaryCTA>Register your firm</PrimaryCTA>
          </div>
        </div>
      </section>

      {/* ─── How it works ──────────────────────────────────────────────────── */}
      <section
        className="py-20 px-6"
        style={{ background: t.section1Bg, borderTop: `1px solid ${t.sectionBorder}`, borderBottom: `1px solid ${t.sectionBorder}` }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
              How it works for your firm
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4" style={{ color: t.headlineColor, letterSpacing: '-0.01em' }}>
              From sign-up to first invoice in days.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {COMPANY_STEPS.map((s) => (
              <div
                key={s.num}
                className="p-6 rounded-2xl relative"
                style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
              >
                <div
                  className="text-5xl font-display font-bold mb-3 leading-none"
                  style={{ color: `${t.accentBg}33` }}
                >
                  {s.num}
                </div>
                <s.icon size={20} style={{ color: t.accentBg, marginBottom: '0.75rem' }} />
                <h3
                  className="font-display font-semibold text-base mb-2"
                  style={{ color: t.headlineColor }}
                  dangerouslySetInnerHTML={{ __html: s.title }}
                />
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: t.bodyColor }}
                  dangerouslySetInnerHTML={{ __html: s.body }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Trust signals ─────────────────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-display font-bold text-2xl md:text-3xl mb-3" style={{ color: t.headlineColor }}>
              Verification firms and buyers can both trust.
            </h2>
            <p className="text-base max-w-xl mx-auto" style={{ color: t.bodyColor }}>
              Every firm goes through the same firm-level checks. Customers know it. They engage senior consulting firms on commercial terms because the verification is real.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {TRUST_BADGES.map((badge) => (
              <div
                key={badge.label}
                className="text-center p-4 rounded-xl"
                style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
              >
                <div className="flex items-center justify-center mb-2" style={{ color: t.accentBg }}>
                  <BadgeCheck size={20} />
                </div>
                <p className="text-sm font-semibold mb-1" style={{ color: t.headlineColor }}>{badge.label}</p>
                <p className="text-xs" style={{ color: t.mutedColor }}>{badge.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Existing firms — directory ─────────────────────────────────────── */}
      <section
        id="firms"
        className="py-20 px-6"
        style={{ background: t.section1Bg, borderTop: `1px solid ${t.sectionBorder}`, borderBottom: `1px solid ${t.sectionBorder}` }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
              Pre-launch preview · Sample firms
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4" style={{ color: t.headlineColor, letterSpacing: '-0.01em' }}>
              The kind of consulting firms you&apos;ll find here.
            </h2>
            <p className="text-base max-w-xl mx-auto" style={{ color: t.bodyColor }}>
              Illustrative firm profiles showing the size, service mix, and verification standard we onboard. Real firms populate this directory as compliance reviews complete.
            </p>
          </div>

          {/* Disclosure banner — replaced once the public companies API is
              wired and this grid renders real onboarded firms. */}
          <div
            className="max-w-2xl mx-auto mb-8 px-4 py-3 rounded-xl flex items-start gap-3"
            style={{ background: t.chipBg, border: `1px dashed ${t.chipBorder}` }}
          >
            <span
              className="inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5"
              style={{ background: t.accentBg, color: t.accentText, letterSpacing: '0.08em' }}
            >
              Preview
            </span>
            <p className="text-xs leading-relaxed" style={{ color: t.bodyColor }}>
              These are <strong style={{ color: t.headlineColor }}>illustrative example firms</strong>, not yet-onboarded members. The directory becomes live as firms complete verification — register your firm now to be among the first listed.
            </p>
          </div>

          {/* Search bar */}
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl max-w-2xl mx-auto mb-8"
            style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
          >
            <Search size={16} style={{ color: t.mutedColor, flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search firms by name or service..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: t.headlineColor }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2 text-sm" style={{ color: t.mutedColor }}>
              <Filter size={14} />
              Service type:
            </div>
            <div className="flex flex-wrap gap-2">
              {SERVICE_TYPES.map((s) => (
                <button
                  key={s}
                  onClick={() => setService(s)}
                  className="text-xs px-3 py-1.5 rounded-full transition-all"
                  style={{
                    background: service === s ? t.accentBg : t.chipBg,
                    color: service === s ? t.accentText : t.chipText,
                    border: `1px solid ${service === s ? t.accentBg : t.chipBorder}`,
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-8">
            <div className="flex items-center gap-2 text-sm" style={{ color: t.mutedColor }}>
              <MapPin size={14} />
              Region:
            </div>
            <div className="flex flex-wrap gap-2">
              {REGIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRegion(r)}
                  className="text-xs px-3 py-1.5 rounded-full transition-all"
                  style={{
                    background: region === r ? t.accentBg : t.secondaryBg,
                    color: region === r ? t.accentText : t.bodyColor,
                    border: `1px solid ${region === r ? t.accentBg : t.cardBorder}`,
                    cursor: 'pointer',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <p className="text-sm mb-6" style={{ color: t.mutedColor }}>
            {companies.length} compan{companies.length !== 1 ? 'ies' : 'y'} found
          </p>

          {companies.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {companies.map((c) => (
                <CompanyCard key={c.id} c={c} />
              ))}
            </div>
          ) : (
            <div
              className="text-center py-20 rounded-2xl"
              style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
            >
              <p className="text-lg font-semibold mb-2" style={{ color: t.headlineColor }}>No firms found</p>
              <p className="text-sm mb-6" style={{ color: t.mutedColor }}>Try adjusting your filters</p>
              <button
                onClick={() => { setSearch(''); setService('All'); setRegion('All'); }}
                className="text-sm px-4 py-2 rounded-lg"
                style={{ background: t.accentBg, color: t.accentText, cursor: 'pointer', border: 'none' }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ─── Pricing teaser ────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
              Simple, predictable pricing
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4" style={{ color: t.headlineColor, letterSpacing: '-0.01em' }}>
              The maths beats commission almost immediately.
            </h2>
            <p className="text-base max-w-xl mx-auto" style={{ color: t.bodyColor }}>
              On a $50,000 engagement, a 17% commission elsewhere is $8,500 gone. On TalvexIT it&apos;s the same flat monthly subscription — paid back many times over from a single engagement.
            </p>
          </div>

          <div
            className="rounded-2xl p-8 md:p-10 text-center"
            style={{ background: t.section1Bg, border: `1px solid ${t.accentBg}40` }}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: t.mutedColor }}>Subscription cost</p>
                <p className="font-display font-bold text-2xl" style={{ color: t.headlineColor }}>From A$0/month</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: t.mutedColor }}>Commission on engagements</p>
                <p className="font-display font-bold text-2xl" style={{ color: t.accentBg }}>0%</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: t.mutedColor }}>Your firm keeps</p>
                <p className="font-display font-bold text-2xl" style={{ color: t.headlineColor }}>100%</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <PrimaryCTA large>Start free — register your firm</PrimaryCTA>
              <SecondaryCTA href="/pricing">
                <Zap size={14} />
                See plan tiers
              </SecondaryCTA>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────────────── */}
      <section
        className="py-20 px-6"
        style={{ background: t.section1Bg, borderTop: `1px solid ${t.sectionBorder}`, borderBottom: `1px solid ${t.sectionBorder}` }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
              Common questions
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4" style={{ color: t.headlineColor, letterSpacing: '-0.01em' }}>
              Questions firms ask before joining.
            </h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((f) => (
              <FAQItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── Cross-link to /contractors ────────────────────────────────────── */}
      <section className="py-12 px-6">
        <div
          className="max-w-3xl mx-auto p-6 rounded-2xl flex items-start gap-4"
          style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${t.accentBg}18`, color: t.accentBg }}
          >
            <Sparkles size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold mb-1" style={{ color: t.headlineColor }}>
              Solo consultant, not a firm?
            </p>
            <p className="text-xs leading-relaxed mb-3" style={{ color: t.bodyColor }}>
              The same zero-commission model is available for individual senior consultants — different onboarding, different plan structure, all the same direct-payment workflow.
            </p>
            <Link
              href="/contractors"
              className="text-xs font-semibold inline-flex items-center gap-1.5"
              style={{ color: t.accentBg, textDecoration: 'none' }}
            >
              See solo consultant plans
              <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div
          className="max-w-4xl mx-auto p-10 md:p-14 rounded-3xl text-center"
          style={{ background: t.section1Bg, border: `1px solid ${t.accentBg}40` }}
        >
          <Globe size={36} style={{ color: t.accentBg, marginBottom: '1rem', display: 'inline-block' }} />
          <h2 className="font-display font-bold text-3xl md:text-4xl mb-4" style={{ color: t.headlineColor, letterSpacing: '-0.01em' }}>
            Stop giving away commission on every contract.
          </h2>
          <p className="text-base md:text-lg mb-8 max-w-xl mx-auto" style={{ color: t.bodyColor }}>
            Subscription pays for itself in your first engagement. Free tier lets you register your firm, add members, and accept your first contract — your customer pays you direct, no platform skim.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <PrimaryCTA large>Register your firm</PrimaryCTA>
            <SecondaryCTA href="/how-it-works">
              How it works
            </SecondaryCTA>
          </div>
          <p className="text-xs mt-6" style={{ color: t.mutedColor }}>
            Already have an account? <Link href="/login" style={{ color: t.accentBg, textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </section>
    </PublicPageShell>
  );
}
