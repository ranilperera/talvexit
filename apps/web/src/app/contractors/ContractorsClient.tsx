'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import PublicPageShell, { theme as t } from '@/components/public/PublicPageShell';
import {
  Search, MapPin, Star, CheckCircle2, Filter, ChevronRight,
  Wallet, Shield, Globe, FileSignature, Zap, BadgeCheck,
  TrendingUp, Briefcase, Sparkles, ChevronDown,
} from 'lucide-react';

const SPECIALISATIONS = [
  'All', 'Cloud & AWS', 'Azure', 'GCP', 'Networking', 'Cybersecurity',
  'DevOps', 'Linux Systems', 'Windows Server', 'Database', 'Virtualisation',
];

const LOCATIONS = ['All', 'Australia', 'Singapore', 'India', 'Philippines', 'UK', 'USA'];

interface PublicContractor {
  id: string;
  full_name: string;
  headline: string;
  location: string;
  specialisations: string[];
  hourly_rate_aud: number;
  rating_avg: number;
  rating_count: number;
  kyc_verified: boolean;
  insurance_verified: boolean;
  availability: 'available' | 'limited' | 'unavailable';
}

// Placeholder cards for pre-launch display
const PLACEHOLDER: PublicContractor[] = [
  {
    id: 'p1', full_name: 'Alex Chen', headline: 'Senior Network Engineer · CCIE #52341',
    location: 'Sydney, AU', specialisations: ['Networking', 'Cybersecurity'],
    hourly_rate_aud: 185, rating_avg: 4.9, rating_count: 47,
    kyc_verified: true, insurance_verified: true, availability: 'available',
  },
  {
    id: 'p2', full_name: 'Priya Sharma', headline: 'AWS Solutions Architect · 8 years enterprise',
    location: 'Bangalore, IN', specialisations: ['Cloud & AWS', 'DevOps'],
    hourly_rate_aud: 120, rating_avg: 4.8, rating_count: 63,
    kyc_verified: true, insurance_verified: true, availability: 'available',
  },
  {
    id: 'p3', full_name: 'Marcus Weber', headline: 'Azure Infrastructure Lead · MCSE',
    location: 'London, UK', specialisations: ['Azure', 'Windows Server'],
    hourly_rate_aud: 160, rating_avg: 4.7, rating_count: 31,
    kyc_verified: true, insurance_verified: false, availability: 'limited',
  },
  {
    id: 'p4', full_name: 'Tan Wei Liang', headline: 'DevOps Engineer · Kubernetes specialist',
    location: 'Singapore, SG', specialisations: ['DevOps', 'GCP'],
    hourly_rate_aud: 140, rating_avg: 4.9, rating_count: 22,
    kyc_verified: true, insurance_verified: true, availability: 'available',
  },
  {
    id: 'p5', full_name: 'Sarah O\'Brien', headline: 'Linux Systems Engineer · Red Hat cert',
    location: 'Melbourne, AU', specialisations: ['Linux Systems', 'Virtualisation'],
    hourly_rate_aud: 155, rating_avg: 4.6, rating_count: 19,
    kyc_verified: true, insurance_verified: true, availability: 'available',
  },
  {
    id: 'p6', full_name: 'Rajesh Kumar', headline: 'Database Architect · Oracle & PostgreSQL',
    location: 'Hyderabad, IN', specialisations: ['Database', 'Cloud & AWS'],
    hourly_rate_aud: 110, rating_avg: 4.8, rating_count: 55,
    kyc_verified: true, insurance_verified: true, availability: 'limited',
  },
];

const AVAIL_COLOR: Record<string, string> = {
  available: '#22C55E',
  limited: '#F59E0B',
  unavailable: '#EF4444',
};
const AVAIL_LABEL: Record<string, string> = {
  available: 'Available now',
  limited: 'Limited availability',
  unavailable: 'Not available',
};

// ─── Benefit cards ────────────────────────────────────────────────────────────

interface Benefit {
  icon: React.ElementType;
  title: string;
  body: string;
}

const SUPPLIER_BENEFITS: Benefit[] = [
  {
    icon: Wallet,
    title: 'Keep 100% of your rate',
    body: 'TalvexIT charges a flat subscription — never a commission on your engagements. The fee your client pays is the fee you receive, full stop. No 10–20% platform skim, no hidden FX margins.',
  },
  {
    icon: TrendingUp,
    title: 'Direct customer-to-supplier payments',
    body: 'You set your payment rails — Stripe link, AU bank, SWIFT, PayPal, Wise, your own invoicing. The platform never holds funds or sits between you and your money. Customers pay you on your terms.',
  },
  {
    icon: Briefcase,
    title: 'Senior-only marketplace',
    body: 'No race-to-the-bottom price wars. Every engineer here is L2/L3 with verified credentials, professional indemnity insurance, and a signed contractor agreement. Customers come expecting senior rates — and pay them.',
  },
  {
    icon: FileSignature,
    title: 'Fixed-scope contracts',
    body: 'Every engagement runs through a structured proposal → Purchase Order → invoice flow. No timesheet haggling, no scope creep arguments. Both sides agree the deliverables and price up front; the platform records every change request.',
  },
  {
    icon: Shield,
    title: 'Verified enterprise clients',
    body: 'Customers register with a real ABN, business address, and billing contact. The platform validates ABNs against the Australian Business Register. You won\'t waste time chasing unverified anonymous buyers.',
  },
  {
    icon: BadgeCheck,
    title: 'Built-in Australian compliance',
    body: 'GST decisions, tax-invoice numbering, customer-ABN-required-above-$1k, no-ABN withholding, cross-border reverse-charge — all handled by the platform. Your invoices and POs are valid out of the box.',
  },
];

// ─── How it works for suppliers ───────────────────────────────────────────────

interface Step {
  num: string;
  icon: React.ElementType;
  title: string;
  body: string;
}

const SUPPLIER_STEPS: Step[] = [
  {
    num: '01',
    icon: BadgeCheck,
    title: 'Apply &amp; verify',
    body: 'Sign up, complete the 10-minute video KYC, upload your insurance and certifications. ABN is verified live against the ABR. Once approved, your profile goes live.',
  },
  {
    num: '02',
    icon: Sparkles,
    title: 'Publish your services',
    body: 'List the service tasks you offer with fixed prices and clear deliverables, or wait for customers to invite you onto an AI-scoped engagement. Your specialisations and ratings drive matching.',
  },
  {
    num: '03',
    icon: FileSignature,
    title: 'Propose &amp; sign',
    body: 'When a customer engages, draft a proposal with scope, timeline, payment terms, and your own legal terms. On approval the platform issues a numbered Purchase Order — both parties bound, audit-trailed.',
  },
  {
    num: '04',
    icon: Wallet,
    title: 'Deliver &amp; get paid',
    body: 'Submit deliverables through the platform, raise a tax invoice with one click. The customer pays you direct via your chosen rail. Payment lands in your account, not ours.',
  },
];

// ─── Trust signals ────────────────────────────────────────────────────────────

const TRUST_BADGES = [
  { label: 'Video KYC', body: 'Live identity verification' },
  { label: 'ABN verified', body: 'Live ABR lookup at registration' },
  { label: 'PI insurance', body: 'Professional indemnity required' },
  { label: 'Provider Agreement', body: 'Signed contractor terms' },
  { label: 'Sanctions screening', body: 'AML checks for foreign suppliers' },
];

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: 'How much does it cost to be on TalvexIT?',
    a: 'A flat monthly subscription based on the tier you choose — starting from a free tier that lets you list a limited number of services, scaling to professional tiers that unlock unlimited listings, AI-assisted scoping, priority placement, and lower-priority compliance review. We never take a commission on engagements. Your rate is yours.',
  },
  {
    q: 'When and how do I get paid?',
    a: 'Customers pay you directly via the rail you nominate — Stripe payment link, AU bank transfer, SWIFT, PayPal, Wise, or any other. The platform never holds your funds. After deliverables are accepted you raise a tax invoice in one click; the customer reports the payment with evidence and you confirm receipt. Net payment terms are whatever you put on the proposal.',
  },
  {
    q: 'What\'s the verification process like?',
    a: 'Approximately 10 minutes of your time spread over 1–2 days. You upload identity documents and complete a video KYC call (typically same-day), enter your ABN (validated live against the Australian Business Register), upload professional indemnity insurance, and sign the Provider Agreement. Compliance review usually takes under 24 hours.',
  },
  {
    q: 'Do I have to be in Australia?',
    a: 'No. We have engineers in Singapore, India, the Philippines, the UK, the US, and across Europe. Australian customers can engage you cross-border under the platform\'s GST-free export rules (s38-190). You handle tax in your home jurisdiction; we handle the AU side automatically.',
  },
  {
    q: 'Can I bring my own legal terms?',
    a: 'Yes. Each proposal you send carries its own legal terms section that you can edit before sending. Whatever you author becomes part of the binding service agreement once the customer approves and the Purchase Order is issued. The platform default is provided as a starting point — keep it, replace it, or import your own boilerplate.',
  },
  {
    q: 'What if there\'s a dispute?',
    a: 'The platform provides structured dispute mediation with a 72-hour response window. Either side can file with evidence. A platform compliance reviewer assesses both sides and issues a determination — full payment, full refund, partial split, or remediation required. Decisions are auditable and binding under the Provider Agreement.',
  },
];

// ─── Components ───────────────────────────────────────────────────────────────

function ContractorCard({ c }: { c: PublicContractor }) {
  return (
    <Link
      href={`/contractors/${c.id}`}
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
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-base font-display truncate" style={{ color: t.headlineColor }}>
              {c.full_name}
            </h3>
            {c.kyc_verified && (
              <CheckCircle2 size={14} style={{ color: t.accentBg, flexShrink: 0 }} />
            )}
          </div>
          <p className="text-sm truncate" style={{ color: t.bodyColor }}>{c.headline}</p>
        </div>
        <div
          className="text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap"
          style={{ background: `${AVAIL_COLOR[c.availability]}18`, color: AVAIL_COLOR[c.availability] }}
        >
          {AVAIL_LABEL[c.availability]}
        </div>
      </div>

      {/* Location + rate */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: t.mutedColor }}>
          <MapPin size={11} />
          {c.location}
        </div>
        <div className="text-sm font-bold" style={{ color: t.headlineColor }}>
          A${c.hourly_rate_aud}<span className="text-xs font-normal" style={{ color: t.mutedColor }}>/hr</span>
        </div>
      </div>

      {/* Specialisations */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {c.specialisations.map((s) => (
          <span
            key={s}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: t.chipBg, color: t.chipText, border: `1px solid ${t.chipBorder}` }}
          >
            {s}
          </span>
        ))}
      </div>

      {/* Rating + badges */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Star size={12} fill={t.accentBg} stroke="none" />
          <span className="text-sm font-semibold" style={{ color: t.headlineColor }}>{c.rating_avg.toFixed(1)}</span>
          <span className="text-xs" style={{ color: t.mutedColor }}>({c.rating_count} reviews)</span>
        </div>
        <div className="flex items-center gap-2">
          {c.insurance_verified && (
            <span className="text-xs" style={{ color: t.mutedColor }}>Insured</span>
          )}
          <ChevronRight size={14} style={{ color: t.mutedColor }} />
        </div>
      </div>
    </Link>
  );
}

function PrimaryCTA({ children, large = false }: { children?: React.ReactNode; large?: boolean }) {
  return (
    <Link
      href="/register"
      className="hp-primary inline-flex items-center gap-2 font-semibold rounded-xl transition-all duration-200"
      style={{
        background: t.primaryBg,
        color: t.primaryText,
        textDecoration: 'none',
        padding: large ? '0.875rem 1.75rem' : '0.625rem 1.25rem',
        fontSize: large ? '0.95rem' : '0.85rem',
      }}
    >
      {children ?? 'Apply to join'}
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ContractorsClient() {
  const [search, setSearch] = useState('');
  const [spec, setSpec] = useState('All');
  const [location, setLocation] = useState('All');
  const [contractors, setContractors] = useState<PublicContractor[]>(PLACEHOLDER);

  useEffect(() => {
    // Will fetch from /api/v1/contractors/public once backend is wired.
    // For now use placeholders.
    let filtered = PLACEHOLDER;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (c) => c.full_name.toLowerCase().includes(q) || c.headline.toLowerCase().includes(q),
      );
    }
    if (spec !== 'All') {
      filtered = filtered.filter((c) => c.specialisations.includes(spec));
    }
    if (location !== 'All') {
      filtered = filtered.filter((c) => c.location.includes(location));
    }
    setContractors(filtered);
  }, [search, spec, location]);

  return (
    <PublicPageShell>
      {/* ─── Hero ───────────────────────────────────────────────────────────── */}
      <section
        className="pt-20 pb-16 px-6"
        style={{ background: t.section1Bg, borderBottom: `1px solid ${t.sectionBorder}` }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: t.eyebrowColor }}>
            For senior IT consultants
          </p>
          <h1 className="font-display font-bold text-4xl md:text-5xl lg:text-6xl mb-5" style={{ color: t.headlineColor, letterSpacing: '-0.02em' }}>
            Earn more on engagements you actually want.
          </h1>
          <p className="text-lg md:text-xl mb-8 max-w-2xl mx-auto" style={{ color: t.bodyColor, lineHeight: 1.5 }}>
            TalvexIT is the subscription-only marketplace for senior L2/L3 IT specialists. <strong style={{ color: t.headlineColor }}>Zero commission.</strong> Direct customer payments. Verified Australian businesses on fixed-scope contracts.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
            <PrimaryCTA large>Apply to join — it&apos;s free to start</PrimaryCTA>
            <SecondaryCTA href="#engineers">
              <Search size={14} />
              Browse engineers
            </SecondaryCTA>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs" style={{ color: t.mutedColor }}>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} style={{ color: t.accentBg }} /> Verification in under 24 hours</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} style={{ color: t.accentBg }} /> Free tier available</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} style={{ color: t.accentBg }} /> No commission, ever</span>
          </div>
        </div>
      </section>

      {/* ─── Why TalvexIT — benefit grid ────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
              Why senior engineers choose us
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4" style={{ color: t.headlineColor, letterSpacing: '-0.01em' }}>
              Built for the way senior IT actually works.
            </h2>
            <p className="text-base max-w-2xl mx-auto" style={{ color: t.bodyColor }}>
              Generic freelance platforms commoditise your skills. TalvexIT is purpose-built for L2/L3 specialists who deserve enterprise rates, fixed scope, and direct payment relationships.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {SUPPLIER_BENEFITS.map((b) => (
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
            <PrimaryCTA>Apply to join</PrimaryCTA>
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
              How it works for you
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4" style={{ color: t.headlineColor, letterSpacing: '-0.01em' }}>
              From application to first invoice in days, not weeks.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {SUPPLIER_STEPS.map((s) => (
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
              Verification that builds trust on both sides.
            </h2>
            <p className="text-base max-w-xl mx-auto" style={{ color: t.bodyColor }}>
              Every engineer goes through the same checks. Customers know it. They&apos;re willing to pay senior rates because they trust who they&apos;re engaging.
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

      {/* ─── Existing engineers — directory ─────────────────────────────────── */}
      <section
        id="engineers"
        className="py-20 px-6"
        style={{ background: t.section1Bg, borderTop: `1px solid ${t.sectionBorder}`, borderBottom: `1px solid ${t.sectionBorder}` }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
              Pre-launch preview · Sample profiles
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-4" style={{ color: t.headlineColor, letterSpacing: '-0.01em' }}>
              The kind of senior IT specialists you&apos;ll find here.
            </h2>
            <p className="text-base max-w-xl mx-auto" style={{ color: t.bodyColor }}>
              Illustrative profiles showing the experience level, specialisations, and verification standard we onboard. Real profiles populate this directory as KYC reviews complete.
            </p>
          </div>

          {/* Disclosure banner — replaced once the public contractors API
              is wired and this grid renders real onboarded engineers. */}
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
              These are <strong style={{ color: t.headlineColor }}>illustrative example profiles</strong>, not yet-onboarded members. The directory becomes live as engineers complete verification — apply now to be among the first listed.
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
              placeholder="Search by name, skill, or technology..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: t.headlineColor }}
            />
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2 text-sm" style={{ color: t.mutedColor }}>
              <Filter size={14} />
              Specialisation:
            </div>
            <div className="flex flex-wrap gap-2">
              {SPECIALISATIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpec(s)}
                  className="text-xs px-3 py-1.5 rounded-full transition-all"
                  style={{
                    background: spec === s ? t.accentBg : t.chipBg,
                    color: spec === s ? t.accentText : t.chipText,
                    border: `1px solid ${spec === s ? t.accentBg : t.chipBorder}`,
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
              Location:
            </div>
            <div className="flex flex-wrap gap-2">
              {LOCATIONS.map((l) => (
                <button
                  key={l}
                  onClick={() => setLocation(l)}
                  className="text-xs px-3 py-1.5 rounded-full transition-all"
                  style={{
                    background: location === l ? t.accentBg : t.secondaryBg,
                    color: location === l ? t.accentText : t.bodyColor,
                    border: `1px solid ${location === l ? t.accentBg : t.cardBorder}`,
                    cursor: 'pointer',
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Results count */}
          <p className="text-sm mb-6" style={{ color: t.mutedColor }}>
            {contractors.length} engineer{contractors.length !== 1 ? 's' : ''} found
          </p>

          {/* Cards grid */}
          {contractors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {contractors.map((c) => (
                <ContractorCard key={c.id} c={c} />
              ))}
            </div>
          ) : (
            <div
              className="text-center py-20 rounded-2xl"
              style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
            >
              <p className="text-lg font-semibold mb-2" style={{ color: t.headlineColor }}>No engineers found</p>
              <p className="text-sm mb-6" style={{ color: t.mutedColor }}>Try adjusting your filters</p>
              <button
                onClick={() => { setSearch(''); setSpec('All'); setLocation('All'); }}
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
              A subscription. That&apos;s it.
            </h2>
            <p className="text-base max-w-xl mx-auto" style={{ color: t.bodyColor }}>
              Pay a flat monthly fee for access to the marketplace. Engagements are free. Compare it to a 15–20% commission elsewhere — the maths works out fast.
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
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: t.mutedColor }}>You keep</p>
                <p className="font-display font-bold text-2xl" style={{ color: t.headlineColor }}>100%</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <PrimaryCTA large>Start free — apply now</PrimaryCTA>
              <SecondaryCTA href="/pricing">
                <Zap size={14} />
                See plan details
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
              Questions engineers ask before joining.
            </h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((f) => (
              <FAQItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div
          className="max-w-4xl mx-auto p-10 md:p-16 rounded-3xl text-center"
          style={{ background: t.section1Bg, border: `1px solid ${t.accentBg}40` }}
        >
          <Globe size={36} style={{ color: t.accentBg, marginBottom: '1rem', display: 'inline-block' }} />
          <h2 className="font-display font-bold text-3xl md:text-4xl mb-4" style={{ color: t.headlineColor, letterSpacing: '-0.01em' }}>
            Ready to be your own platform?
          </h2>
          <p className="text-base md:text-lg mb-8 max-w-xl mx-auto" style={{ color: t.bodyColor }}>
            Verification takes under 10 minutes. The free tier lets you list services and accept your first engagement. No commission, ever — your work, your rate, your bank.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <PrimaryCTA large>Apply to join TalvexIT</PrimaryCTA>
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
