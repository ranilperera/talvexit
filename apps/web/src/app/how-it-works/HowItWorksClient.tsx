'use client';
import Link from 'next/link';
import PublicPageShell, { theme as t } from '@/components/public/PublicPageShell';
import {
  FileText, Search, UserCheck, CreditCard, Shield,
  Building2, Users, ArrowRight, ChevronDown,
  Bot, FileSignature, MessageSquare, Star, Briefcase, Receipt,
  Globe, Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { FAQPageJsonLd, HowToJsonLd, BreadcrumbListJsonLd } from '@/components/seo/JsonLd';
import { siteUrl } from '@/lib/site';

// ── STEP COMPONENT ────────────────────────────────────────────────────────────

function Step({
  number, icon: Icon, title, description, last,
}: {
  number: number;
  icon: React.ElementType;
  title: string;
  description: string;
  last?: boolean;
}) {
  return (
    <div className="flex gap-6">
      <div className="flex flex-col items-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0"
          style={{ background: t.accentBg, color: t.accentText }}
        >
          {number}
        </div>
        {!last && <div className="flex-1 w-px mt-4" style={{ background: t.sectionBorder }} />}
      </div>
      <div className="pb-12">
        <div className="flex items-center gap-3 mb-2">
          <Icon size={18} style={{ color: t.accentBg }} />
          <h3 className="font-semibold font-display text-lg" style={{ color: t.headlineColor }}>{title}</h3>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: t.bodyColor }}>{description}</p>
      </div>
    </div>
  );
}

// ── FAQ ────────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: 'How is talvexIT different from a freelance marketplace?',
    a: 'We focus exclusively on senior IT — L2/L3 specialists across cybersecurity, Azure, networking, DevOps, databases, Linux, virtualisation and more. Every contractor passes a video KYC, has their ABN verified against the ABR, holds professional indemnity insurance, and signs a contractor agreement. You will never engage an anonymous freelancer here.',
  },
  {
    q: 'What is AI Scoping and how does it work?',
    a: 'On /customer/scope you describe your IT need in plain English (e.g. "automate daily SQL Server backups to Azure Blob with alerts and a tested restore procedure"). Our AI generates a structured technical brief — objective, deliverables, in/out-of-scope, assumptions, prerequisites, time estimate and a price range. You review every section, edit anything you disagree with, then choose how to proceed: place an open order, invite specific providers, or auto-match by eligibility criteria.',
  },
  {
    q: 'Do you hold funds in escrow?',
    a: 'No. The platform never holds engagement funds. Customers pay suppliers directly via whichever rail the supplier offers (Stripe payment link, AU bank transfer, SWIFT, PayPal, Wise, etc.). Customers upload payment evidence and suppliers confirm receipt. The platform records every transaction and provides dispute mediation, but takes no commission and processes no funds.',
  },
  {
    q: 'How are providers paid?',
    a: 'Providers configure the payment rails they accept (Stripe payment link, AU bank, SWIFT, PayPal, Wise, or any other) and customers send payment directly. After paying, the customer reports the payment with a reference and evidence file; the provider confirms receipt and work proceeds. The platform takes no commission — your engagement revenue is yours. Subscriptions are the only thing TalvexIT charges for.',
  },
  {
    q: 'How does the order tracking and chat work?',
    a: 'Everything happens in the browser — no apps to install. Each order has its own workspace with a status timeline (Booked → Proposal → PO Issued → In Progress → Review → Invoiced → Paid → Complete), in-thread chat between customer and provider, work-log entries, secure credential vault for shared passwords, deliverable uploads, scope-modification requests, and a complete activity log. Notifications fire on every meaningful state change.',
  },
  {
    q: 'What happens if there is a problem with the work?',
    a: 'Two routes. First, request changes — at the review step you can flag specific issues and the provider revises before final acceptance. Second, raise a formal dispute — at any time during in-progress / review / revision-requested states either party can file a dispute on six grounds (deliverables not as scoped, work abandoned, access exceeded, customer withholding approval, scope misrepresentation, data breach). A platform admin investigates, an independent arbitrator may be appointed, and both parties submit evidence within a 72-hour window. A written determination is issued (e.g. full payment, partial, full refund, or remedy required) and recorded in the immutable audit log. The platform does not hold or move funds, so compliance with the determination is the parties\' responsibility — non-compliance is reflected in account standing, public ratings, and ongoing platform access.',
  },
  {
    q: 'Can I engage an IT company instead of a sole contractor?',
    a: 'Yes. Companies onboard with ABN/ACN verification, insurance certificates and board resolution. They invite team members with role-based access — Company Admin, Senior Consultant, Consultant, Junior. The Senior Consultant prepares the proposal; the Company Admin reviews and assigns the work to a member; only the assigned member sees the operational detail. Invoices are raised by the company and customer payments go to the company directly — never to the individual member.',
  },
  {
    q: 'What currencies are supported?',
    a: 'Pricing is in AUD by default but the catalog and AI scope estimates can show in AUD, USD, GBP, EUR, NZD, SGD or CAD using live conversion. Customers and providers transact directly using whichever rail the provider supports (Stripe payment link, AU bank transfer, PayID, SWIFT, PayPal, Wise, etc.). Tax classification and any cross-border withholding are handled between the customer and the provider per their jurisdictions — the platform is not a billing agent or payment processor.',
  },
  {
    q: 'Is there a minimum engagement size?',
    a: 'No minimum. The same workflow handles a 2-hour assessment and a multi-month managed-services engagement. Larger projects can be split into milestones with separate proposals and invoices.',
  },
  {
    q: 'How long does provider verification take?',
    a: 'Video KYC: 10 minutes for the contractor. Document review by our team: typically within 1 business day. Insurance certificates are verified against the issuing insurer at upload time. Companies require an additional ABN/ACN/board-resolution review which usually completes within 1–2 business days.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${t.sectionBorder}` }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left"
        style={{ background: 'transparent', cursor: 'pointer', border: 'none' }}
      >
        <span className="font-semibold text-base pr-6" style={{ color: t.headlineColor }}>{q}</span>
        <ChevronDown
          size={18}
          style={{
            color: t.accentBg,
            flexShrink: 0,
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>
      {open && (
        <p className="pb-5 text-sm leading-relaxed" style={{ color: t.bodyColor }}>{a}</p>
      )}
    </div>
  );
}

// ── AUDIENCE TABS ────────────────────────────────────────────────────────────

const AUDIENCES = [
  {
    id: 'buyer',
    label: 'For Customers',
    icon: Building2,
    intro: 'From a vague IT need to a delivered, audit-ready outcome — without chasing freelancers, drafting scopes by hand, or rebuilding the paper trail for procurement and audit after the fact.',
    steps: [
      {
        icon: Bot,
        title: 'Describe in plain English. Let AI scope it.',
        description: 'No jargon required. Type your requirement (or paste your team\'s ticket) and our AI generates a structured technical brief — objective, deliverables, in/out of scope, assumptions, time estimate and a price band. Edit anything you disagree with, regenerate any section, and accept when you\'re ready.',
      },
      {
        icon: Users,
        title: 'Pick how to engage providers.',
        description: 'Three paths. Place an open order — let any qualified verified provider pick it up. Invite specific providers — hand-pick contractors or companies you trust. Set eligibility criteria — let the platform auto-match providers who hold the right certs, KYC status, insurance tier, and experience.',
      },
      {
        icon: FileText,
        title: 'Receive formal proposals.',
        description: 'Verified providers respond with a proposal — refined scope, milestone breakdown, timeline, price, T&Cs and team composition (for company providers). Compare side-by-side. Request changes if needed. No commitment until you approve.',
      },
      {
        icon: FileSignature,
        title: 'Approve. Purchase Order is auto-issued.',
        description: 'One click on approval. The platform generates a Purchase Order PDF with a unique reference number, your billing details, the provider\'s ABN, and the agreed scope. Sent to both parties. Work begins.',
      },
      {
        icon: MessageSquare,
        title: 'Track delivery from your browser.',
        description: 'Live order workspace — status timeline, in-thread chat, work logs, secure credential vault for any access you share, deliverable uploads, and scope-modification requests if anything needs to change. Notifications fire when reviewing is needed or work is submitted.',
      },
      {
        icon: Receipt,
        title: 'Accept deliverables. Pay the provider directly.',
        description: 'Review, request revisions, then accept. The provider raises their own tax invoice in their name and ABN — the platform pre-populates the PDF from the agreed scope so it\'s ready to send. You pay the provider directly via whichever rail they support (Stripe payment link, AU bank transfer, PayID, SWIFT, PayPal, Wise, etc.). Invoice PDF and your payment confirmation sit alongside the order workspace — audit-ready for finance and compliance.',
      },
      {
        icon: Star,
        title: 'Rate and retain.',
        description: 'Score the provider on five criteria, leave a review, and they\'ll appear on your trusted-providers shortlist for next time. Bidirectional ratings keep both sides accountable.',
      },
    ],
  },
  {
    id: 'engineer',
    label: 'For Contractors',
    icon: UserCheck,
    intro: 'Get found by enterprise customers who pay on time, want senior expertise, and trust the platform to handle invoicing, tax compliance and disputes.',
    steps: [
      {
        icon: UserCheck,
        title: 'Verify once — earn the badge.',
        description: 'Submit your ABN (auto-verified against the ABR), tax declaration, professional indemnity & public liability insurance certificates, and any specialist credentials. Then complete a 10-minute live video KYC. Approved profiles wear the "Verified Expert" badge, public to every customer.',
      },
      {
        icon: Briefcase,
        title: 'List catalog services or wait for tenders.',
        description: 'Create fixed-scope/fixed-price catalog tasks (e.g. "SQL Server health-check, 4 hours, $X") that customers can book directly. Or wait — when customers run AI Scope and choose your domains, tender invitations land in your inbox.',
      },
      {
        icon: FileText,
        title: 'Two ways to win work.',
        description: '(a) Direct booking: customer hits "Book Now" on your catalog task — instant order, no proposal needed. (b) Tender invitation: respond with a tailored proposal — scope, milestones, price, timeline, payment terms. Customer reviews and approves.',
      },
      {
        icon: MessageSquare,
        title: 'Deliver in the browser. No installs.',
        description: 'Every order is a workspace — chat with the customer, log hours, upload deliverables, store any shared credentials securely (auto-purged 48 h after completion), submit scope-modification requests if the work changes. Submit deliverables for review when ready.',
      },
      {
        icon: Receipt,
        title: 'Get paid post-delivery.',
        description: 'Customers pay you directly via whichever rail you offer — Stripe payment link, AU bank transfer, SWIFT, PayPal, Wise, or any other. The platform records the transaction and provides dispute mediation, but does not process or hold funds. Configure your payment instructions once on your profile and copy them into invoices automatically.',
      },
      {
        icon: CreditCard,
        title: 'Keep 100% of engagement revenue.',
        description: 'No commission, no platform fee on engagements. The only cost is your monthly or yearly subscription, which unlocks higher monthly limits and advanced features. Your earnings are yours.',
      },
      {
        icon: Star,
        title: 'Build a public reputation.',
        description: 'Bidirectional ratings on every completed order. Public reviews, completed-order count, response rate. Customers can save you to their trusted shortlist and book direct next time — repeat work with no platform middleman delay.',
      },
    ],
  },
  {
    id: 'company-au',
    label: 'AU IT Companies',
    icon: Users,
    intro: 'Run an Australian IT consultancy on the platform — bring your team, win enterprise tenders, and use the structured proposal, scoping, and invoicing workflow so you can focus on delivery instead of admin. Customers pay you directly; tax compliance stays with you, the platform stays out of the legal and payment chain.',
    steps: [
      {
        icon: Shield,
        title: 'Onboard your company.',
        description: 'Submit ABN (auto-verified against the ABR), ACN, GST registration status, ANZSIC code, insurance certificates and a board resolution authorising the platform agreement. Our team reviews — typically 1–2 business days. Once approved, your company profile goes live.',
      },
      {
        icon: Users,
        title: 'Build your team with roles.',
        description: 'Invite members by email with one of four roles — Company Admin (full control), Senior Consultant (creates tasks, manages orders, drafts proposals), Consultant (works assigned orders), Junior (limited assignments). Each member sees only what their role permits.',
      },
      {
        icon: Search,
        title: 'Receive tender invitations.',
        description: 'When a customer runs AI Scope and picks your domains — or invites you specifically — the tender lands in your team\'s inbox. Senior Consultants prepare the proposal: refined scope, deliverable list, milestone breakdown, T&Cs, price.',
      },
      {
        icon: FileSignature,
        title: 'Submit proposal → win the order.',
        description: 'Customer compares proposals from multiple companies. On acceptance, the Purchase Order is auto-generated referencing your company ABN, the customer\'s reference, and every line of the agreed scope. No paperwork, no email back-and-forth.',
      },
      {
        icon: Briefcase,
        title: 'Assign and deliver.',
        description: 'Company Admin assigns the order to a team member. The assignee gets a dedicated workspace — chat with customer, work logs, deliverable uploads, credential vault, scope-modification requests. Other team members see status; only the assignee operates.',
      },
      {
        icon: Receipt,
        title: 'Direct invoicing — no platform commission.',
        description: 'When the customer accepts the work, the company raises a GST-compliant tax invoice (10% GST when registered) and the customer pays the company directly via Stripe link, AU bank, SWIFT, or any rail you choose. The platform records every payment but takes no commission. Subscriptions are the only revenue we charge.',
      },
      {
        icon: Globe,
        title: 'Manage your bench.',
        description: 'Company dashboard shows active orders, members, ratings, completed engagements, and your subscription receipts for your BAS. Rate customers, save repeat clients, and grow your verified reputation across enterprise IT procurement teams.',
      },
    ],
  },
  {
    id: 'company-overseas',
    label: 'Overseas IT Companies',
    icon: Globe,
    intro: 'Bring your overseas IT consultancy to Australian and global enterprise customers — without registering for ABN/GST. Multi-currency catalogue, structured proposals, and direct customer-to-supplier invoicing — you remain the issuing party for every engagement, so tax handling stays in your jurisdiction.',
    steps: [
      {
        icon: Shield,
        title: 'Register as a foreign entity.',
        description: 'Pick your country of tax residency from the country list (220+ countries supported). Submit your local business registration number, VAT/tax ID where applicable, professional indemnity insurance, and a board resolution. No ABN or ACN required — overseas companies are flagged as foreign entities automatically.',
      },
      {
        icon: Users,
        title: 'Build your team with the same roles.',
        description: 'Same role-based access for your delivery team — Company Admin, Senior Consultant, Consultant, Junior. Members can be located anywhere. Time-zone friendly chat and async work logs.',
      },
      {
        icon: Search,
        title: 'Win enterprise IT work globally.',
        description: 'Be matched on capability, not geography. Customers can browse your verified profile, invite you specifically, or include you in eligibility-based auto-match. Currencies displayed in the customer\'s preferred currency (AUD, USD, GBP, EUR, NZD, SGD, CAD).',
      },
      {
        icon: FileSignature,
        title: 'Submit proposal → win the order.',
        description: 'Submit proposals just like an AU company. The Purchase Order is auto-generated with your overseas legal name, registration number, and the agreed scope. Customer\'s reference numbers attached. Audit-trail logged.',
      },
      {
        icon: Briefcase,
        title: 'Deliver from anywhere.',
        description: 'Order workspace runs entirely in the browser. Built-in chat, work logs, deliverable uploads, secure credential vault (auto-purged 48 h after completion). No on-site work required for most engagements.',
      },
      {
        icon: Receipt,
        title: 'You invoice. Customer pays you directly.',
        description: 'On customer acceptance, you raise an invoice in your own name and registration. The platform produces a populated PDF from the agreed scope and your registered details — but you remain the issuing party. The customer pays you directly via SWIFT, Stripe payment link, Wise, PayPal, or any other rail you support. Tax classification, withholding compliance, and any double-tax-agreement handling stay between you and the customer per your respective jurisdictions — the platform records the engagement and stores supporting documents, but is not a billing agent or payment processor.',
      },
      {
        icon: CreditCard,
        title: 'Multi-currency, no commission.',
        description: 'Quote and invoice in your customer\'s currency or your own. The catalogue and AI-scope estimates display in AUD, USD, GBP, EUR, NZD, SGD or CAD using live conversion. There is no platform commission on engagement revenue — TalvexIT charges only the supplier subscription, billed in AUD.',
      },
      {
        icon: Globe,
        title: 'Manage your bench.',
        description: 'Same dashboard as AU companies. Track orders, members, ratings, completed work, and your subscription history for accounting in your own jurisdiction. Build a verified global reputation in enterprise IT procurement.',
      },
    ],
  },
];

export default function HowItWorksClient() {
  const [activeAudience, setActiveAudience] = useState('buyer');
  const active = AUDIENCES.find((a) => a.id === activeAudience) ?? AUDIENCES[0]!;

  // Map FAQ + audience-track data into JSON-LD payloads. We render a HowTo
  // for each track so AI assistants and search engines can extract any of
  // the four flows directly. The FAQPage block uses the same FAQS array
  // shown in the UI, ensuring zero drift between visible content and the
  // structured data emitted to crawlers.
  const faqLd = FAQS.map((f) => ({ question: f.q, answer: f.a }));
  const breadcrumb = [
    { name: 'Home', url: siteUrl('/') },
    { name: 'How it works', url: siteUrl('/how-it-works') },
  ];

  return (
    <PublicPageShell>
      <BreadcrumbListJsonLd items={breadcrumb} />
      <FAQPageJsonLd items={faqLd} />
      {AUDIENCES.map((a) => (
        <HowToJsonLd
          key={a.id}
          name={a.label}
          description={a.intro}
          steps={a.steps.map((s) => ({ name: s.title, text: s.description }))}
        />
      ))}
      {/* Hero */}
      <section
        className="pt-16 pb-16 px-6 text-center"
        style={{ background: t.section1Bg, borderBottom: `1px solid ${t.sectionBorder}` }}
      >
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
            How talvexIT works
          </p>
          <h1 className="font-display font-bold text-4xl md:text-5xl mb-6" style={{ color: t.headlineColor }}>
            Plain English in. <span style={{ color: t.headlineAccent }}>Senior IT delivered.</span>
          </h1>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: t.bodyColor }}>
            Describe your IT need in your own words. Our AI structures the brief. Verified L2/L3 specialists deliver. Purchase Orders, GST-compliant tax invoices, audit trails, ratings — all built in. No installs, no escrow, no consultants in suits.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/customer/scope"
              className="hp-primary inline-flex items-center gap-2 font-semibold px-6 py-3 rounded-xl text-sm transition-all duration-200"
              style={{ background: t.primaryBg, color: t.primaryText, textDecoration: 'none' }}
            >
              Try AI Scoping
              <ArrowRight size={14} />
            </Link>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-2 font-semibold px-6 py-3 rounded-xl text-sm border transition-all duration-200"
              style={{ borderColor: t.cardBorder, color: t.headlineColor, textDecoration: 'none' }}
            >
              Browse the catalog
            </Link>
          </div>
        </div>
      </section>

      {/* Audience tabs */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Tab switcher */}
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-1 rounded-xl p-1 mb-8 max-w-3xl mx-auto"
            style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
          >
            {AUDIENCES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveAudience(id)}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap"
                style={{
                  background: activeAudience === id ? t.accentBg : 'transparent',
                  color: activeAudience === id ? t.accentText : t.mutedColor,
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Intro */}
          <p
            className="text-center text-base max-w-2xl mx-auto mb-12"
            style={{ color: t.bodyColor }}
          >
            {active.intro}
          </p>

          {/* Steps */}
          <div>
            {active.steps.map((step, i) => (
              <Step
                key={step.title}
                number={i + 1}
                icon={step.icon}
                title={step.title}
                description={step.description}
                last={i === active.steps.length - 1}
              />
            ))}
          </div>

          <div className="text-center mt-4">
            <Link
              href="/register"
              className="hp-primary inline-flex items-center gap-2 font-semibold px-8 py-4 rounded-xl text-base transition-all duration-200"
              style={{ background: t.primaryBg, color: t.primaryText, textDecoration: 'none' }}
            >
              Get Started
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Trust highlights */}
      <section
        className="py-16 px-6"
        style={{ background: t.section1Bg, borderTop: `1px solid ${t.sectionBorder}` }}
      >
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display font-bold text-3xl text-center mb-3" style={{ color: t.headlineColor }}>
            Built for enterprise IT procurement
          </h2>
          <p className="text-center max-w-2xl mx-auto mb-10 text-sm" style={{ color: t.bodyColor }}>
            Verified people, structured engagements, and a paper trail your finance and compliance teams will actually accept.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Shield,
                title: 'Verified by humans',
                description: 'Every contractor passes a live video KYC. ABN auto-verified against the ABR. Insurance certificates checked against the issuing insurer. Companies submit board resolutions and ANZSIC codes. No anonymous freelancers.',
              },
              {
                icon: Bot,
                title: 'AI-assisted scoping',
                description: 'Reduce scope creep by 80%. Describe in plain English, AI generates objective, deliverables, in/out of scope, assumptions and a price band. Edit before you accept. Lock the scope, set acceptance criteria, avoid the "but we never agreed to that" conversation.',
              },
              {
                icon: Receipt,
                title: 'Auto-populated tax invoices',
                description: 'Each provider raises invoices in their own name and ABN — the platform pre-populates an audit-ready PDF from the agreed scope and the provider\'s registration details. Provider details, customer details, GST line for AU-registered providers, and GST-free flagging for cross-border supply are rendered automatically. The provider remains the issuing party; tax classification responsibility sits with them.',
              },
              {
                icon: Briefcase,
                title: 'Order workspaces in the browser',
                description: 'Status timeline, in-thread chat, work logs, secure credential vault (auto-purged 48 h after completion), deliverable uploads, scope-modification requests. No apps to install, no Slack invites, no shared spreadsheets.',
              },
              {
                icon: Wallet,
                title: 'Direct payment, your rails',
                description: 'Customers pay providers directly via whichever rail the provider supports — Stripe payment link, AU bank, PayID, SWIFT, PayPal, Wise, or anything else they configure. The platform records the payment confirmation alongside the invoice PDF for audit. There is no platform commission on engagements; TalvexIT is funded by supplier subscriptions only.',
              },
              {
                icon: FileText,
                title: 'Disputes, ratings, audit trail',
                description: 'Six dispute grounds, 72-hour evidence window, optional independent arbitrator, written determinations recorded in the order\'s audit trail. Compliance is the parties\' responsibility, but non-compliance reflects in account standing, public ratings and ongoing platform access. Bidirectional ratings on every order. Every state change written to an immutable audit log.',
              },
            ].map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="p-6 rounded-xl"
                style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                  style={{ background: t.chipBg, border: `1px solid ${t.chipBorder}` }}
                >
                  <Icon size={18} style={{ color: t.accentBg }} />
                </div>
                <h3 className="font-semibold font-display mb-2" style={{ color: t.headlineColor }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: t.bodyColor }}>{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display font-bold text-3xl text-center mb-3" style={{ color: t.headlineColor }}>
            Frequently asked questions
          </h2>
          <p className="text-center max-w-xl mx-auto mb-10 text-sm" style={{ color: t.bodyColor }}>
            The short answers. For anything else, see <Link href="/contact" style={{ color: t.accentBg }}>contact us</Link>.
          </p>
          <div style={{ borderTop: `1px solid ${t.sectionBorder}` }}>
            {FAQS.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section
        className="py-16 px-6 text-center"
        style={{ background: t.section1Bg, borderTop: `1px solid ${t.sectionBorder}` }}
      >
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display font-bold text-3xl mb-4" style={{ color: t.headlineColor }}>
            Ready to scope your first IT engagement?
          </h2>
          <p className="text-base mb-8" style={{ color: t.bodyColor }}>
            Two minutes from plain English to a structured brief. Free to try, no credit card required.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/customer/scope"
              className="hp-primary inline-flex items-center gap-2 font-semibold px-8 py-4 rounded-xl text-base transition-all duration-200"
              style={{ background: t.primaryBg, color: t.primaryText, textDecoration: 'none' }}
            >
              Start AI Scoping
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 font-semibold px-8 py-4 rounded-xl text-base border transition-all duration-200"
              style={{ borderColor: t.cardBorder, color: t.headlineColor, textDecoration: 'none' }}
            >
              Join as a provider
            </Link>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}
