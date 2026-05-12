'use client';

import Link from 'next/link';
import { getActiveTheme } from '@/lib/homepage-themes';
import { PublicNav } from '@/components/shared/PublicNav';
import { PublicFooter } from '@/components/shared/PublicFooter';
import { useDomains } from '@/hooks/useDomains';

const t = getActiveTheme();

// Derived helpers — avoid repeating rgba calculations inline
const isLight = t.key === 'corporate-light' || t.key === 'arctic-minimal';

// ── Hero ──────────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section style={{ background: t.pageBg }} className="py-20 px-6">
      <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          {/* Eyebrow badge */}
          <div
            className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-5"
            style={{ color: t.chipText, background: t.chipBg, border: `1px solid ${t.chipBorder}` }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.primaryBg }} />
            Subscription-only · Zero commission on engagements
          </div>

          <h1
            className="text-[42px] font-medium leading-[1.1] tracking-[-0.04em] mb-4"
            style={{ color: t.headlineColor }}
          >
            Senior IT expertise.<br />
            <span style={{ color: t.headlineAccent }}>Without the platform skim.</span>
          </h1>

          <p className="text-base leading-relaxed mb-8 max-w-[460px]" style={{ color: t.bodyColor }}>
            TalvexIT is the marketplace for senior L2/L3 IT consultants and consulting firms. Customers pay suppliers <strong style={{ color: t.headlineColor }}>directly</strong> — no escrow, no 15–20% commission. Formal proposals, automated Purchase Orders, GST-compliant invoicing, and procurement-ready buyers — the enterprise workflow without the marketplace tax.
          </p>

          <div className="flex gap-3 mb-8 flex-wrap">
            <Link
              href="/register?role=customer"
              className="inline-flex items-center gap-2 text-[15px] font-medium px-6 py-3 rounded-xl no-underline transition-all duration-200 hp-cta-primary"
              style={{ background: t.primaryBg, color: t.primaryText }}
            >
              Find verified experts
            </Link>
            <Link
              href="/register?role=contractor"
              className="inline-flex items-center gap-2 text-[15px] font-medium px-6 py-3 rounded-xl no-underline border transition-all duration-200 hp-cta-secondary"
              style={{
                background: t.secondaryBg,
                color: t.secondaryText,
                borderColor: t.secondaryBorder,
              }}
            >
              Join — keep 100%
            </Link>
          </div>
          <style dangerouslySetInnerHTML={{ __html: `
            .hp-cta-primary:hover { background: ${t.primaryHover} !important; }
            .hp-cta-secondary:hover { border-color: ${t.primaryBg} !important; color: ${t.primaryBg} !important; }
          ` }} />

          <div className="flex gap-5 flex-wrap">
            {['0% commission, ever', 'KYC-verified experts only', 'Formal PO + GST tax invoices'].map((item) => (
              <div key={item} className="flex items-center gap-2 text-xs" style={{ color: t.mutedColor }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.primaryBg }} />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Platform preview card */}
        <div
          className="rounded-2xl p-5 border shadow-lg"
          style={{
            background: isLight ? '#FFFFFF' : t.cardBg,
            borderColor: t.cardBorder,
            boxShadow: isLight ? '0 4px 24px rgba(0,0,0,0.08)' : '0 4px 24px rgba(0,0,0,0.4)',
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#475569' }}>
            Platform interface preview
          </p>
          {/* Order header — mirrors what the customer sees on /customer/orders/[id]
              once a proposal has been approved and a numbered PO issued. */}
          <div className="rounded-xl p-3.5 mb-3 border" style={{ background: '#1E2435', borderColor: '#2A3347' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] font-medium text-slate-200">Azure migration · Finance Corp</span>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-lg"
                style={{ background: 'rgba(29,158,117,.2)', color: '#5DCAA5' }}
              >
                PO issued
              </span>
            </div>
            <p className="text-[11px]" style={{ color: '#94A3B8' }}>
              <span className="font-mono" style={{ color: t.primaryBg }}>PO-2026-000142</span> · $24,500 + GST · Net 14
            </p>
          </div>

          {/* Three-cell line totals — concrete numbers replace the prior
              abstract "PO / KYC / L3" labels. Mirrors invoice math. */}
          <div className="grid grid-cols-3 gap-2.5 mb-3">
            {[
              { v: '$24,500', l: 'Ex-GST' },
              { v: '$2,450',  l: 'GST 10%' },
              { v: '$26,950', l: 'Total AUD' },
            ].map(({ v, l }) => (
              <div key={l} className="rounded-xl p-2.5 text-center border" style={{ background: '#1E2435', borderColor: '#2A3347' }}>
                <p className="text-[13px] font-semibold" style={{ color: t.primaryBg }}>{v}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{l}</p>
              </div>
            ))}
          </div>

          {/* Workflow stepper — shows the proposal flow approvals. */}
          <div className="rounded-xl p-3 border" style={{ background: '#1E2435', borderColor: '#2A3347' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: '#475569' }}>
              Engagement timeline
            </p>
            {[
              { label: 'Proposal sent',     done: true,  detail: '29 Apr · v2' },
              { label: 'Customer approved', done: true,  detail: '01 May · ABN verified' },
              { label: 'PO issued',         done: true,  detail: '01 May · numbered, audit-trailed' },
              { label: 'Delivery in progress', done: false, detail: '12 days remaining' },
            ].map(({ label, done, detail }) => (
              <div key={label} className="flex items-center gap-2.5 py-1.5">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: done ? t.primaryBg : '#475569' }}
                />
                <span className={`text-xs flex-1 ${done ? '' : 'italic'}`} style={{ color: done ? '#cbd5e1' : '#64748b' }}>
                  {label}
                </span>
                <span className="text-[10px] text-slate-600">{detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Trust bar ─────────────────────────────────────────────────────────────────

function TrustBar() {
  return (
    <div
      className="border-y py-3 px-6"
      style={{ background: t.section3Bg, borderColor: t.sectionBorder }}
    >
      <div className="max-w-[1100px] mx-auto flex items-center justify-center gap-8 flex-wrap">
        {[
          // Lead with the strongest commercial differentiator. The next two
          // describe the commercial model concretely; verification and
          // procurement workflow follow as supporting trust signals.
          'Zero commission on engagements',
          'Direct customer-to-supplier payments',
          'Identity-verified suppliers',
          'Automated PO + GST tax invoicing',
          // "AML/CTF compliant payments" was removed earlier — the platform
          // isn't an AUSTRAC reporting entity and the AML screening pipeline
          // is currently a stub.
          'Global supplier network',
        ].map((item) => (
          <div key={item} className="flex items-center gap-2 text-[13px]" style={{ color: t.mutedColor }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.primaryBg} strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Why Talvex ────────────────────────────────────────────────────────────────

function WhyTalvex() {
  // The grid mixes commercial-model and quality differentiators. The first
  // card leads with the strongest claim ("0% commission") and the second
  // with the second-strongest ("direct payments"); the rest support with
  // verification, procurement workflow, custom legal terms, and reach.
  const features = [
    { title: 'Zero commission on engagements',   desc: 'Subscription is the only platform fee. Customer pays supplier directly via the supplier\'s nominated rail — no escrow, no 15–20% skim, no FX margin between you and your money.',                                          stroke: '#1D9E75', bg: '#E1F5EE', path: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6' },
    { title: 'Direct customer-to-supplier flow', desc: 'No platform-held funds. Customers pay via Stripe link, AU bank, SWIFT, PayPal, Wise, or any rail the supplier offers. Payment evidence + receipt confirmation reconciles the engagement.',                                  stroke: '#D85A30', bg: '#FAECE7', path: 'M3 12h18M3 6h18M3 18h18' },
    { title: 'KYC-verified senior experts',      desc: 'Every consultant and consulting firm completes identity verification, ABN check against the ABR, professional indemnity insurance, and a signed Provider Agreement. L2/L3 only.',                                            stroke: '#378ADD', bg: '#E6F1FB', path: 'M20 6 9 17 4 12' },
    { title: 'Enterprise procurement built in',  desc: 'Formal proposals → numbered Purchase Orders → tax-compliant invoices → audit-trailed payment evidence. The full enterprise workflow with no paperwork or CRM-to-billing project.',                                          stroke: '#BA7517', bg: '#FAEEDA', path: 'M2 7h20v14H2zM16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2' },
    { title: 'Bring your own legal terms',       desc: 'Each proposal carries an editable Legal Terms & Conditions block — drop in your firm\'s MSA boilerplate or use the platform default. Whatever you author becomes the binding agreement on customer approval.',             stroke: '#534AB7', bg: '#EEEDFE', path: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6' },
    { title: 'Global reach, Australian compliance', desc: 'Experts across Australia, Southeast Asia, South Asia, Europe, and the Americas. AU GST decisions handled automatically — domestic 10%, GST-free export (s38-190), reverse-charge prompts for cross-border supply.',     stroke: '#1D9E75', bg: '#E1F5EE', path: 'M12 2a10 10 0 100 20A10 10 0 0012 2zM2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20' },
  ];

  return (
    <section className="py-16 px-6" style={{ background: t.section1Bg, borderTop: `1px solid ${t.sectionBorder}` }}>
      <div className="max-w-[1100px] mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-[28px] font-medium tracking-tight mb-2" style={{ color: t.headlineColor }}>
            Why TalvexIT?
          </h2>
          <p className="text-[15px] max-w-[560px] mx-auto leading-relaxed" style={{ color: t.bodyColor }}>
            Enterprise IT procurement made effortless — plus the engagement lifecycle that follows: scoped contracts, delivery management, and GST-compliant invoicing on one platform. Not a generic freelancer marketplace.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(({ title, desc, stroke, bg, path }) => (
            <div
              key={title}
              className="rounded-xl p-5 border transition-all duration-200 hp-feature-card"
              style={{ background: t.cardBg, borderColor: t.cardBorder }}
            >
              <div
                className="w-9 h-9 rounded-[8px] flex items-center justify-center mb-3 flex-shrink-0"
                style={{ background: bg }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2">
                  <path d={path} />
                </svg>
              </div>
              <h3 className="text-[15px] font-medium mb-1.5" style={{ color: t.headlineColor }}>{title}</h3>
              <p className="text-[13px] leading-relaxed" style={{ color: t.bodyColor }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `.hp-feature-card:hover { border-color: ${t.cardHoverBorder} !important; }` }} />
    </section>
  );
}

// ── Subscription vs commission band ───────────────────────────────────────────
// Slim version of the side-by-side from /pricing. Sits between WhyTalvex
// (claims) and HowItWorks (process) so the differentiator gets visual real
// estate, not just a bullet. The maths is concrete and routes to /pricing
// for the deeper breakdown.

function SubscriptionVsCommission() {
  return (
    <section
      className="py-16 px-6"
      style={{
        background: t.pageBg,
        borderTop: `1px solid ${t.sectionBorder}`,
        borderBottom: `1px solid ${t.sectionBorder}`,
      }}
    >
      <div className="max-w-[1100px] mx-auto">
        <div className="text-center mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: t.eyebrowColor }}>
            The maths
          </p>
          <h2 className="text-[28px] font-medium tracking-tight mb-2" style={{ color: t.headlineColor }}>
            Subscription beats commission almost immediately.
          </h2>
          <p className="text-[15px] max-w-[620px] mx-auto leading-relaxed" style={{ color: t.bodyColor }}>
            On platforms charging 15–20% per engagement, your effective fee scales with your success. On TalvexIT it&apos;s flat — and zero on the engagement itself.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Commission-based */}
          <div
            className="rounded-2xl p-6 md:p-7 border"
            style={{ background: t.cardBg, borderColor: t.cardBorder }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: t.mutedColor }}>
              Commission-based marketplace
            </p>
            <p className="text-[17px] font-semibold mb-3" style={{ color: t.headlineColor }}>
              Bill $5,000 — they take $850.
            </p>
            <ul className="space-y-2 text-[13px]" style={{ color: t.bodyColor }}>
              <li className="flex items-start gap-2"><span style={{ color: '#EF4444', fontWeight: 700 }}>✕</span><span>17% commission per engagement = $850 every $5,000</span></li>
              <li className="flex items-start gap-2"><span style={{ color: '#EF4444', fontWeight: 700 }}>✕</span><span>Effective fee scales with your hard-earned revenue</span></li>
              <li className="flex items-start gap-2"><span style={{ color: '#EF4444', fontWeight: 700 }}>✕</span><span>Platform sits between you and your client&apos;s money</span></li>
              <li className="flex items-start gap-2"><span style={{ color: '#EF4444', fontWeight: 700 }}>✕</span><span>FX margin on overseas payouts</span></li>
            </ul>
          </div>

          {/* TalvexIT */}
          <div
            className="rounded-2xl p-6 md:p-7"
            style={{
              background: t.cardBg,
              border: `2px solid ${t.primaryBg}80`,
              boxShadow: `0 0 24px ${t.primaryBg}25`,
            }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: t.primaryBg }}>
              TalvexIT
            </p>
            <p className="text-[17px] font-semibold mb-3" style={{ color: t.headlineColor }}>
              Bill $5,000 — keep $5,000.
            </p>
            <ul className="space-y-2 text-[13px]" style={{ color: t.bodyColor }}>
              <li className="flex items-start gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.primaryBg} strokeWidth="2.5" style={{ marginTop: '0.2rem', flexShrink: 0 }}><path d="M20 6 9 17 4 12" /></svg>
                <span>0% commission. Subscription pays for itself in a single mid-size engagement</span>
              </li>
              <li className="flex items-start gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.primaryBg} strokeWidth="2.5" style={{ marginTop: '0.2rem', flexShrink: 0 }}><path d="M20 6 9 17 4 12" /></svg>
                <span>Effective fee actually <em>shrinks</em> as your engagements grow</span>
              </li>
              <li className="flex items-start gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.primaryBg} strokeWidth="2.5" style={{ marginTop: '0.2rem', flexShrink: 0 }}><path d="M20 6 9 17 4 12" /></svg>
                <span>Customer pays you direct on your nominated rail — no escrow, no skim</span>
              </li>
              <li className="flex items-start gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.primaryBg} strokeWidth="2.5" style={{ marginTop: '0.2rem', flexShrink: 0 }}><path d="M20 6 9 17 4 12" /></svg>
                <span>No FX margin — your customer&apos;s currency is your currency</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="text-center mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register?role=contractor"
            className="inline-flex items-center gap-2 text-[14px] font-medium px-6 py-3 rounded-xl no-underline transition-all duration-200 hp-cta-primary"
            style={{ background: t.primaryBg, color: t.primaryText }}
          >
            Start free as a supplier
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 text-[14px] font-medium px-5 py-3 rounded-xl no-underline border transition-all duration-200 hp-cta-secondary"
            style={{ background: t.secondaryBg, color: t.secondaryText, borderColor: t.secondaryBorder }}
          >
            See pricing details
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Platform-facts band ───────────────────────────────────────────────────────
// Numbers we can defend without fabrication. Each cell maps to a real
// platform fact: subscription tiers in the DB, payment rails listed in
// /how-it-works copy, currencies supported by the convertToAUD helper,
// the 12 tax-scenario test combinations, and the 0%/100% commercial pair.

function PlatformFacts() {
  const facts = [
    { v: '0%',  l: 'Commission on engagements' },
    { v: '100%', l: 'Of payment goes to supplier' },
    { v: '6+',  l: 'Payment rails supported' },
    { v: '7',   l: 'Billing currencies' },
    { v: '12',  l: 'GST scenarios covered' },
    { v: '8',   l: 'Subscription tiers' },
  ];
  return (
    <section
      className="py-12 px-6"
      style={{ background: t.section3Bg, borderTop: `1px solid ${t.sectionBorder}`, borderBottom: `1px solid ${t.sectionBorder}` }}
    >
      <div className="max-w-[1100px] mx-auto">
        <p className="text-center text-[11px] font-semibold uppercase tracking-widest mb-6" style={{ color: t.eyebrowColor }}>
          By the numbers
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {facts.map((f) => (
            <div
              key={f.l}
              className="text-center rounded-xl p-4"
              style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
            >
              <p className="text-[28px] font-medium leading-none mb-1.5" style={{ color: t.primaryBg }}>
                {f.v}
              </p>
              <p className="text-[11px] leading-snug" style={{ color: t.bodyColor }}>{f.l}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-[11px] mt-5" style={{ color: t.mutedColor }}>
          Stripe payment links · AU bank · SWIFT · PayID · PayPal · Wise · custom rails — supplier&apos;s choice.
        </p>
      </div>
    </section>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────

function HowItWorks() {
  // Each step describes the customer view (`d`) and the supplier view
  // (`s`) so the section talks to both audiences without doubling its
  // length. The supplier line is shown smaller and tagged "supplier"
  // so the customer reads naturally and the supplier sees their thread.
  const steps = [
    {
      n: '1', t: 'Scope',
      d: 'Describe your IT challenge. AI helps generate a clear technical brief.',
      s: 'Receive a structured brief with deliverables, exclusions and a price range.',
    },
    {
      n: '2', t: 'Proposal',
      d: 'Verified experts submit formal proposals with fixed price & timeline.',
      s: 'Draft scope, timeline, payment terms and your own legal T&Cs.',
    },
    {
      n: '3', t: 'Purchase Order',
      d: 'Approve and a formal PO is auto-generated. GST-compliant, audit-ready.',
      s: 'Numbered PO issued — both sides bound, audit-trailed.',
    },
    {
      n: '4', t: 'Delivery',
      d: 'Work is delivered. Messaging, file uploads, full audit trail throughout.',
      s: 'Log work, upload deliverables, raise change requests if scope shifts.',
    },
    {
      n: '5', t: 'Invoice & Pay',
      d: 'Deliverables accepted. Tax invoice generated. Customer pays direct.',
      s: 'Raise the invoice, receive payment to your nominated rail. Zero skim.',
    },
  ];

  return (
    <section
      className="py-16 px-6"
      style={{ background: t.section2Bg, borderTop: `1px solid ${t.sectionBorder}`, borderBottom: `1px solid ${t.sectionBorder}` }}
    >
      <div className="max-w-[1100px] mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-[28px] font-medium tracking-tight mb-2" style={{ color: t.headlineColor }}>
            How it works
          </h2>
          <p className="text-[15px] max-w-[480px] mx-auto" style={{ color: t.bodyColor }}>
            From initial scope to final invoice — the entire engagement on one platform, from both sides.
          </p>
        </div>
        {/* items-stretch on the grid + flex-col on each cell + mt-auto on
            the supplier chip pushes all chips to the bottom of their
            column, so they line up horizontally regardless of how long
            the customer-facing description above them runs. */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-4 items-stretch relative">
          <div className="hidden md:block absolute top-5 left-[10%] right-[10%] h-px" style={{ background: t.sectionBorder }} />
          {steps.map(({ n, t: title, d, s }) => (
            <div key={n} className="text-center relative flex flex-col">
              <div
                className="w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center text-sm font-medium relative z-10"
                style={{ background: t.primaryBg, color: t.primaryText }}
              >
                {n}
              </div>
              <p className="text-[13px] font-medium mb-1.5" style={{ color: t.headlineColor }}>{title}</p>
              <p className="text-[12px] leading-relaxed mb-3" style={{ color: t.bodyColor }}>{d}</p>
              {/* Chip stacks vertically: SUPPLIER pill on top (centered),
                  body text below. flex-col + items-center centers the
                  pill within the chip; the body text below is text-left
                  for readability with multi-line wrapping. mt-auto pins
                  the chip to the bottom of the column. */}
              <div
                className="flex flex-col items-center gap-1.5 text-[11px] leading-snug rounded-md px-2.5 py-2.5 mt-auto"
                style={{
                  background: t.chipBg,
                  border: `1px solid ${t.chipBorder}`,
                  color: t.chipText,
                }}
              >
                <span
                  className="inline-block font-semibold uppercase tracking-wider text-[9px] px-2 py-0.5 rounded"
                  style={{ color: t.primaryBg, background: `${t.primaryBg}18` }}
                >
                  Supplier
                </span>
                <span className="text-center break-words leading-relaxed">{s}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Service areas ─────────────────────────────────────────────────────────────

// Fallback shown only while the domains query is in flight, or if the API is
// unreachable — keeps the homepage from flashing an empty grid. Each entry
// includes an emoji so the card layout still looks intentional in fallback.
const FALLBACK_SERVICES = [
  { t: 'Cloud & Infrastructure',   s: 'AWS · Azure · GCP · Hybrid',           icon: '☁️' },
  { t: 'Network Engineering',      s: 'L2/L3 Routing · SD-WAN · BGP',         icon: '🌐' },
  { t: 'Cybersecurity',            s: 'SIEM · Pentesting · Compliance',       icon: '🔐' },
  { t: 'Databases',                s: 'Oracle · SQL Server · PostgreSQL',     icon: '🗄️' },
  { t: 'DevOps & CI/CD',           s: 'Kubernetes · Terraform · GitOps',      icon: '⚙️' },
  { t: 'Linux & Windows Server',   s: 'RHEL · Ubuntu · Server 2022',          icon: '🐧' },
  { t: 'Scripting & Automation',   s: 'PowerShell · Python · Bash',           icon: '🤖' },
  { t: 'Virtualisation',           s: 'VMware · Hyper-V · Proxmox',           icon: '🖧' },
];

// Per-card accent colour palette — rotates across cards so the grid has
// visual variety without looking chaotic. Tuned to read well in both
// dark and light modes.
const ACCENT_PALETTE = [
  { ring: 'rgba(20,184,166,0.30)',  glow: 'rgba(20,184,166,0.10)',  fg: '#2DD4BF' }, // teal
  { ring: 'rgba(59,130,246,0.30)',  glow: 'rgba(59,130,246,0.10)',  fg: '#60A5FA' }, // blue
  { ring: 'rgba(168,85,247,0.30)',  glow: 'rgba(168,85,247,0.10)',  fg: '#C084FC' }, // purple
  { ring: 'rgba(244,114,182,0.30)', glow: 'rgba(244,114,182,0.10)', fg: '#F472B6' }, // pink
  { ring: 'rgba(245,158,11,0.30)',  glow: 'rgba(245,158,11,0.10)',  fg: '#FBBF24' }, // amber
  { ring: 'rgba(34,197,94,0.30)',   glow: 'rgba(34,197,94,0.10)',   fg: '#4ADE80' }, // green
  { ring: 'rgba(239,68,68,0.30)',   glow: 'rgba(239,68,68,0.10)',   fg: '#F87171' }, // red
  { ring: 'rgba(99,102,241,0.30)',  glow: 'rgba(99,102,241,0.10)',  fg: '#818CF8' }, // indigo
];

function ServiceAreas() {
  // Source of truth: GET /api/v1/domains (driven by the ITDomain table).
  // Same hook the rest of the app uses, so admins get to manage every list
  // (homepage included) from /admin/domains.
  const { data: domains } = useDomains();

  const services = (domains && domains.length > 0)
    ? domains.map((d) => ({
        key: d.key,
        t: d.label,
        s: d.description ?? d.short_label ?? '',
        icon: d.icon ?? '🔧',
      }))
    : FALLBACK_SERVICES.map((s) => ({ key: s.t.toUpperCase().replace(/[^A-Z]/g, '_'), ...s }));

  return (
    <section className="py-20 px-6 relative overflow-hidden" style={{ background: t.section1Bg }}>
      {/* Decorative gradient orb — barely visible, adds depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-[0.04] blur-3xl"
        style={{ background: t.primaryBg }}
      />

      <div className="max-w-[1100px] mx-auto relative">
        {/* Eyebrow + heading */}
        <div className="text-center mb-12">
          <div
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full mb-4"
            style={{ color: t.chipText, background: t.chipBg, border: `1px solid ${t.chipBorder}` }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.primaryBg }} />
            L2/L3 expertise only
          </div>
          <h2 className="font-display font-bold text-[32px] md:text-[38px] tracking-tight mb-3 leading-tight" style={{ color: t.headlineColor }}>
            Every engineer is senior-level.
          </h2>
          <p className="text-[15px] max-w-[520px] mx-auto leading-relaxed" style={{ color: t.bodyColor }}>
            No juniors. No generalists. Every expert operates at L2 or L3 — deep technical specialists with proven delivery records and verified credentials.
          </p>
        </div>

        {/* Stats banner */}
        <div
          className="grid grid-cols-3 gap-4 mb-10 max-w-2xl mx-auto rounded-2xl px-4 py-5"
          style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
        >
          {[
            { v: '28+', l: 'specialisations' },
            { v: '100%', l: 'KYC verified' },
            { v: 'L2 / L3', l: 'minimum level' },
          ].map(({ v, l }) => (
            <div key={l} className="text-center">
              <p className="font-display font-bold text-[20px] md:text-[22px]" style={{ color: t.headlineAccent }}>{v}</p>
              <p className="text-[11px] uppercase tracking-wider mt-0.5" style={{ color: t.mutedColor }}>{l}</p>
            </div>
          ))}
        </div>

        {/* Domain grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {services.map(({ key, t: title, s, icon }, i) => {
            const accent = ACCENT_PALETTE[i % ACCENT_PALETTE.length]!;
            return (
              <div
                key={key}
                className="hp-service-card group relative p-5 rounded-2xl border transition-all duration-300 overflow-hidden"
                style={{ background: t.cardBg, borderColor: t.cardBorder }}
              >
                {/* Top accent stripe — fades in on hover */}
                <div
                  className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: `linear-gradient(90deg, transparent, ${accent.fg}, transparent)` }}
                />

                {/* Icon badge — renders the emoji from ITDomain.icon */}
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-3.5 text-[22px] leading-none transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                  style={{
                    background: accent.glow,
                    border: `1px solid ${accent.ring}`,
                  }}
                >
                  <span aria-hidden>{icon}</span>
                </div>

                {/* Title */}
                <p className="font-display font-semibold text-[14px] mb-1.5 leading-tight" style={{ color: t.headlineColor }}>
                  {title}
                </p>

                {/* Description */}
                <p className="text-[12px] leading-relaxed" style={{ color: t.bodyColor }}>
                  {s}
                </p>
              </div>
            );
          })}
        </div>

        {/* Bottom CTAs — primary browse-all + secondary contact fallback */}
        <div className="text-center mt-10 flex flex-col items-center gap-3">
          <Link
            href="/services"
            className="inline-flex items-center gap-2 text-[14px] font-medium px-6 py-3 rounded-xl no-underline transition-all duration-200 hp-cta-primary"
            style={{ background: t.primaryBg, color: t.primaryText }}
          >
            Browse all services
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <p className="text-[12px]" style={{ color: t.mutedColor }}>
            Don&apos;t see your specialisation?{' '}
            <Link href="/contact" style={{ color: t.headlineAccent, textDecoration: 'none' }} className="font-medium hover:underline">
              Tell us what you need
            </Link>
          </p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .hp-service-card:hover {
          border-color: ${t.cardHoverBorder} !important;
          transform: translateY(-3px);
          box-shadow: 0 12px 28px -12px rgba(0,0,0,0.25);
        }
      ` }} />
    </section>
  );
}

// ── Brief FAQ ─────────────────────────────────────────────────────────────────
// Three questions targeted at the most common objections. Deeper FAQs
// live on /pricing and /how-it-works — this is just the obstacle-clearing
// pass before DualCTA.

function HomeFAQ() {
  const faqs = [
    {
      q: 'Is there really no commission?',
      a: 'Yes — TalvexIT is subscription-only. Suppliers and customers pay a flat monthly fee for marketplace access, and the platform takes 0% of every engagement. Compare to platforms charging 15–20% per engagement and the maths usually works out heavily in TalvexIT\'s favour from the second engagement.',
    },
    {
      q: 'How do I pay the supplier?',
      a: 'Directly. Suppliers nominate the rails they accept (Stripe payment link, AU bank transfer, PayID, SWIFT, PayPal, Wise, or any custom rail). You pay them on that rail and upload the payment evidence; the supplier confirms receipt against the invoice. The platform never holds funds and never sits between you and the supplier.',
    },
    {
      q: 'Who verifies the suppliers?',
      a: 'Compliance review verifies every supplier — video KYC for identity, ABN validated live against the Australian Business Register, professional indemnity insurance certificate, and a signed Provider Agreement. Consulting firms additionally upload a Board Resolution authorising the primary admin to bind the entity. Sanctions screening for foreign suppliers.',
    },
  ];

  return (
    <section
      className="py-16 px-6"
      style={{ background: t.section1Bg, borderTop: `1px solid ${t.sectionBorder}` }}
    >
      <div className="max-w-[760px] mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-[28px] font-medium tracking-tight mb-2" style={{ color: t.headlineColor }}>
            Common questions
          </h2>
          <p className="text-[14px]" style={{ color: t.bodyColor }}>
            The three you&apos;ll have before signing up. The rest live on{' '}
            <Link href="/pricing#faq" style={{ color: t.primaryBg, textDecoration: 'none' }}>Pricing</Link>
            {' '}and{' '}
            <Link href="/how-it-works" style={{ color: t.primaryBg, textDecoration: 'none' }}>How it works</Link>.
          </p>
        </div>
        <div className="space-y-3">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-xl"
              style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
            >
              <summary
                className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer text-[14px] font-medium list-none"
                style={{ color: t.headlineColor }}
              >
                <span>{f.q}</span>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.mutedColor} strokeWidth="2"
                  className="transition-transform group-open:rotate-180 flex-shrink-0"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </summary>
              <div className="px-5 pb-4 text-[13px] leading-relaxed" style={{ color: t.bodyColor }}>
                {f.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Dual CTA ──────────────────────────────────────────────────────────────────

function DualCTA() {
  return (
    <div
      className="px-6 py-12"
      style={{ background: t.section2Bg, borderTop: `1px solid ${t.sectionBorder}`, borderBottom: `1px solid ${t.sectionBorder}` }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[1100px] mx-auto">
        {/* Enterprise CTA */}
        <div
          className="rounded-2xl p-7 border"
          style={{ background: t.cardBg, borderColor: t.cardBorder }}
        >
          <div
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full mb-4"
            style={{ color: t.chipText, background: t.chipBg, border: `1px solid ${t.chipBorder}` }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.primaryBg }} />
            For enterprises
          </div>
          <h3 className="text-xl font-medium mb-2" style={{ color: t.headlineColor }}>
            Engage senior IT experts on scoped contracts.
          </h3>
          <p className="text-sm leading-relaxed mb-5" style={{ color: t.bodyColor }}>
            Post a brief or use AI Scoping to turn plain English into a structured technical scope. Receive formal proposals from KYC-verified consultants and consulting firms, approve a Purchase Order, and pay them direct. Free starter tier — no credit card required.
          </p>
          <Link
            href="/register?role=customer"
            className="inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl no-underline transition-all duration-200 hp-cta-primary"
            style={{ background: t.primaryBg, color: t.primaryText }}
          >
            Start free as a client
          </Link>
        </div>

        {/* Expert CTA */}
        <div
          className="rounded-2xl p-7 border"
          style={{ background: t.cardBg, borderColor: t.cardBorder }}
        >
          <div
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full mb-4"
            style={{
              color: isLight ? '#1D4ED8' : '#93c5fd',
              background: isLight ? '#EFF6FF' : 'rgba(59,130,246,0.12)',
              border: `1px solid ${isLight ? '#BFDBFE' : 'rgba(59,130,246,0.25)'}`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: isLight ? '#3B82F6' : '#60A5FA' }}
            />
            For IT experts
          </div>
          <h3 className="text-xl font-medium mb-2" style={{ color: t.headlineColor }}>
            Keep 100% of every engagement.
          </h3>
          <p className="text-sm leading-relaxed mb-5" style={{ color: t.bodyColor }}>
            Subscription-only. Zero commission. Customers pay you direct on your nominated rail — Stripe link, AU bank, SWIFT, PayPal, Wise. Verified Australian buyers, fixed-scope contracts, your own legal terms on every proposal.
          </p>
          <Link
            href="/register?role=contractor"
            className="inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl no-underline border transition-all duration-200 hp-cta-secondary"
            style={{
              background: t.secondaryBg,
              color: t.secondaryText,
              borderColor: t.secondaryBorder,
            }}
          >
            Apply as a consultant or firm
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      {/* Page metadata is inherited from app/layout.tsx — the homepage is
          covered by the site-wide defaults (title, description, OG, Twitter,
          canonical). The previous SEOHead component was a no-op in the App
          Router so removing it lost no functional output. */}
      <div style={{ background: t.pageBg }}>
        <PublicNav />
        <HeroSection />
        <TrustBar />
        <WhyTalvex />
        <SubscriptionVsCommission />
        <HowItWorks />
        <PlatformFacts />
        <ServiceAreas />
        <HomeFAQ />
        <DualCTA />
        <PublicFooter />
      </div>
    </>
  );
}
