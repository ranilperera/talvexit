'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  ArrowRight,
  Shield,
  Wallet,
  FileText,
  Sparkles,
  ChevronDown,
  Zap,
  Globe,
  TrendingUp,
  Search,
  BadgeCheck,
} from 'lucide-react';
import axios from 'axios';
import PublicPageShell, { theme as t } from '@/components/public/PublicPageShell';
import { Button } from '@/components/ui/Button';
import { getUser } from '@/lib/customer-auth';

// ─── Types ───────────────────────────────────────────────────────────────────
// Mirrors the SubscriptionPlan columns in apps/api/prisma/schema.prisma —
// every field below corresponds to a real column returned by
// GET /api/v1/subscriptions/plans. The previous shape declared
// `max_active_projects` and `max_consultant_profiles` (don't exist) and
// omitted half the real columns (task_bookings, contracts, active_orders,
// active_tenders, active_contracts, orders_per_month, listing_items,
// domain_categories, plus 6 feature flags). That caused the rendered
// feature lists to miss most of what each plan actually unlocks.

export interface PublicPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  plan_type: string;
  monthly_price_aud: string | null;
  yearly_price_aud: string | null;
  trial_days: number;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  badge_text: string | null;
  cta_text: string | null;
  highlight_color: string | null;
  custom_features: string[];

  // ── Limits (null = unlimited; missing for the irrelevant audience) ──
  // Supplier-side
  max_active_tasks: number | null;
  allowed_listing_items: number | null;
  max_team_seats: number | null;
  max_bids_per_month: number | null;
  max_domain_categories: number | null;
  max_active_contracts: number | null;
  // Customer-side
  max_task_bookings_per_month: number | null;
  max_ai_requests_per_month: number | null;
  max_contracts_per_month: number | null;
  max_manual_tenders_per_month: number | null;
  // Shared
  max_orders_per_month: number | null;
  max_active_orders: number | null;
  max_active_tenders: number | null;

  // ── Feature flags ──────────────────────────────────────────────────
  allow_overseas_contractors: boolean;
  allow_project_mode: boolean;
  allow_api_access: boolean;
  allow_priority_listing: boolean;
  allow_advanced_analytics: boolean;
  allow_custom_sla: boolean;
  allow_whitelabel: boolean;
  allow_sso: boolean;
  allow_bulk_po: boolean;
  allow_compliance_docs: boolean;
  allow_dedicated_manager: boolean;
  allow_video_facility: boolean;
}

const publicApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? '',
  timeout: 15000,
});

// "How payment works" — replaces the prior copy that incorrectly described
// the platform as escrow-based / Stripe-only. TalvexIT is no-escrow,
// multi-rail, direct customer-to-supplier (per /how-it-works and the
// payment-rails picker in supplier billing). Subscription is the only
// platform-level money-flow.
const PAYMENT_DETAILS = [
  {
    icon: Wallet,
    title: 'Direct customer-to-supplier payments',
    description:
      'The platform never holds engagement funds. Customers pay suppliers directly via the rail the supplier offers — Stripe payment link, AU bank transfer, SWIFT, PayPal, Wise, or any custom rail. No escrow, no platform skim.',
  },
  {
    icon: FileText,
    title: 'Tax-compliant invoices &amp; POs',
    description:
      'Numbered Purchase Orders and tax invoices generate automatically with the right GST treatment for every supply — domestic 10%, GST-free export (s38-190), reverse-charge prompts for cross-border. Customer ABN required above $1,000 ex-GST.',
  },
  {
    icon: Shield,
    title: 'Audit trail &amp; dispute mediation',
    description:
      'Every transaction is recorded against the order with timestamps, IP, and user-agent. If a payment is disputed, the platform runs a structured 72-hour mediation process — both sides submit evidence, a compliance reviewer issues a binding determination.',
  },
];

// FAQs split by audience so each tab shows the questions relevant to it
// plus the shared/billing ones. Keeps the supplier from wading through
// "how do I post a brief" and the customer from worrying about commission
// rates that don't apply to them.

const FAQS_SHARED: { q: string; a: string }[] = [
  {
    q: 'Does TalvexIT take a commission on engagements?',
    a: 'No — never. Subscription is the only thing we charge for. Customers pay suppliers directly via the supplier\'s nominated rail (Stripe link, AU bank, SWIFT, PayPal, Wise, etc.) and the platform records but never holds funds. Compare to platforms taking 15–20% commission — the maths usually works out heavily in TalvexIT\'s favour from your second engagement.',
  },
  {
    q: 'Can I switch plans later?',
    a: 'Yes — change plans any time from your billing portal. Stripe prorates the difference automatically. Yearly plans switch at renewal unless you upgrade mid-cycle, in which case you pay the prorated upgrade today and renewal moves to the new plan.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Plans that include a trial show the trial length on the plan card. You won\'t be charged until the trial ends, and you can cancel any time during the trial. The free tier on each side has no trial — it\'s genuinely free, no card required.',
  },
  {
    q: 'How do I cancel?',
    a: 'Open the billing dashboard and click "Manage in portal" for Stripe\'s self-serve cancel, or use the in-app "Cancel subscription" button. Your subscription stays active until the end of the paid period — no clawback, no early-termination charge.',
  },
  {
    q: 'What happens if I exceed my plan limits?',
    a: 'You\'ll see an upgrade prompt when you try the action. Existing engagements continue uninterrupted — only the action that would push you over the limit is blocked. Limits reset on your renewal date.',
  },
  {
    q: 'Are subscription prices inclusive of GST?',
    a: 'Australian customers receive a tax invoice with 10% GST itemised. TalvexIT (operated by Waveful Digital Platforms) is the GST-registered entity for subscription billing — ABN appears on every invoice. International subscribers are billed GST-free as a non-resident export.',
  },
];

const FAQS_CUSTOMER: { q: string; a: string }[] = [
  {
    q: 'Do I need to subscribe to engage a supplier?',
    a: 'No. Customers can place orders on a free Starter plan — post a brief, engage suppliers, raise POs, complete contracts. Paid plans unlock higher limits (more concurrent engagements, AI scoping requests, bulk invoicing) and features like custom SLAs and dedicated account management for larger procurement teams.',
  },
  {
    q: 'What is AI Scoping and is it included?',
    a: 'AI Scoping turns a plain-English brief ("automate daily SQL backups to Azure Blob with alerts") into a structured technical scope with deliverables, assumptions, prerequisites, and a price range. Free tier includes a small monthly quota; paid tiers scale up. You always review and edit the AI output before publishing.',
  },
  {
    q: 'How do I pay suppliers?',
    a: 'You pay each supplier directly using the rail they offer — typically a Stripe payment link or an AU bank transfer with reference. The platform never sits in the middle. You upload payment evidence (receipt, transaction reference); the supplier confirms receipt. The order moves to PAYMENT_RECEIVED automatically.',
  },
];

const FAQS_SUPPLIER: { q: string; a: string }[] = [
  {
    q: 'Why pay a subscription instead of a commission like other platforms?',
    a: 'Predictable monthly cost vs. an opaque 15–20% per-engagement skim. On a $5,000 engagement, a 17% commission is $850 gone — that single engagement covers a paid subscription for ~6 months on most tiers. Senior IT consultants typically come out ahead on TalvexIT after their first or second engagement.',
  },
  {
    q: 'When do I get paid?',
    a: 'Whenever you and the customer have agreed in your proposal — Net 7, Net 14, 50/50 split, milestone-based, all supported. The customer pays you on your nominated rail when you raise the invoice; the platform doesn\'t add latency or hold funds. Most TalvexIT engagements settle inside the supplier\'s normal terms.',
  },
  {
    q: 'Can I bring my own legal terms to engagements?',
    a: 'Yes. Each proposal you send carries an editable Legal Terms & Conditions block — keep the platform default, paste your own boilerplate, or hybridise. Whatever you author becomes part of the binding service agreement once the customer approves and the PO is issued.',
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  initialPlans: PublicPlan[];
}

type Audience = 'CUSTOMER' | 'SUPPLIER';

// Map account_type → which pricing audience the user belongs to. Returns
// null for admins (no auto-filter — they can browse both) and for anonymous
// visitors.
function audienceFromAccountType(accountType: string | undefined): Audience | null {
  if (!accountType) return null;
  if (accountType === 'CUSTOMER') return 'CUSTOMER';
  if (
    accountType === 'INDIVIDUAL_CONTRACTOR' ||
    accountType === 'ORGANIZATION_ADMIN' ||
    accountType === 'COMPANY_ADMIN'
  )
    return 'SUPPLIER';
  return null; // PLATFORM_ADMIN / SUPPORT_ADMIN / COMPLIANCE_ADMIN
}

export default function PricingClient({ initialPlans }: Props) {
  const router = useRouter();
  const [plans, setPlans] = useState<PublicPlan[]>(initialPlans);
  const [audienceLock, setAudienceLock] = useState<Audience | null>(null);
  const [audience, setAudience] = useState<Audience>('CUSTOMER');
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // On mount: read the signed-in user (if any) and lock the audience tab to
  // their relevant tier. Anonymous visitors and admins see both tabs.
  useEffect(() => {
    const u = getUser();
    const lock = audienceFromAccountType(u?.account_type);
    if (lock) {
      setAudienceLock(lock);
      setAudience(lock);
    }
  }, []);

  // Keep plans fresh client-side too — covers the case where the server fetch
  // returned [] (e.g. build env) and the API later becomes reachable.
  const refreshPlans = useCallback(async () => {
    try {
      const res = await publicApi.get<{ success: boolean; data: PublicPlan[] }>(
        '/api/v1/subscriptions/plans',
      );
      if (res.data.success) setPlans(res.data.data);
    } catch {
      // No-op: keep server-rendered list
    }
  }, []);

  useEffect(() => {
    // Always refresh on mount — SSR uses revalidate: 3600 so it can be up to
    // an hour stale, missing recent admin changes (sync, edit, deactivate).
    void refreshPlans();
  }, [refreshPlans]);

  const filtered = useMemo(
    () =>
      plans.filter((p) =>
        audience === 'CUSTOMER'
          ? p.plan_type.startsWith('CUSTOMER_')
          : p.plan_type.startsWith('SUPPLIER_'),
      ),
    [plans, audience],
  );

  function handleSubscribe(plan: PublicPlan) {
    router.push(`/subscribe?plan_id=${plan.id}&interval=${billing}`);
  }

  // Audience-specific value strip rendered above the plan cards. Three
  // bullets each, written for the persona on that tab.
  const audienceValueProps =
    audience === 'CUSTOMER'
      ? [
          { icon: Search, label: 'Verified senior IT specialists', body: 'Every supplier is KYC-verified, ABN-checked, insured, and signed to the Provider Agreement.' },
          { icon: Sparkles, label: 'AI-scoped engagements', body: 'Turn a plain-English brief into a structured technical scope in minutes — review, edit, publish.' },
          { icon: FileText, label: 'Fixed-scope contracts', body: 'Proposals, POs, milestones, and invoices auto-generated. No timesheet haggling.' },
        ]
      : [
          { icon: TrendingUp, label: 'Zero commission on engagements', body: 'You keep 100% of what your client pays. Subscription is the only platform-level cost.' },
          { icon: Wallet, label: 'Direct payments, your rail', body: 'Stripe link, AU bank, SWIFT, PayPal, Wise, or your own — money lands in your account, not ours.' },
          { icon: BadgeCheck, label: 'Verified Australian buyers', body: 'Every customer\'s ABN is validated against the ABR. No anonymous freelance buyers.' },
        ];

  return (
    <PublicPageShell>
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section
        className="pt-20 pb-14 px-6 text-center"
        style={{
          background: t.section1Bg,
          borderBottom: `1px solid ${t.sectionBorder}`,
        }}
      >
        <div className="max-w-3xl mx-auto">
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: t.eyebrowColor }}
          >
            Subscription pricing · No commission
          </p>
          <h1
            className="font-display font-bold text-4xl md:text-5xl lg:text-6xl mb-5"
            style={{ color: t.headlineColor, letterSpacing: '-0.02em' }}
          >
            One subscription. <span style={{ color: t.headlineAccent }}>Zero commission.</span>
          </h1>
          <p className="text-lg md:text-xl mb-8 max-w-2xl mx-auto" style={{ color: t.bodyColor, lineHeight: 1.5 }}>
            Pay a flat monthly fee for marketplace access. Customers and suppliers transact <strong style={{ color: t.headlineColor }}>directly</strong> — TalvexIT never holds your funds and never takes a per-engagement skim.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
            <Link
              href="/register"
              className="hp-primary inline-flex items-center gap-2 font-semibold rounded-xl transition-all duration-200"
              style={{
                background: t.primaryBg,
                color: t.primaryText,
                textDecoration: 'none',
                padding: '0.875rem 1.75rem',
                fontSize: '0.95rem',
              }}
            >
              Start free — no card required
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-2 font-medium rounded-xl px-5 py-3 text-sm transition-all duration-200"
              style={{
                background: t.cardBg,
                color: t.headlineColor,
                border: `1px solid ${t.cardBorder}`,
                textDecoration: 'none',
              }}
            >
              How it works
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs" style={{ color: t.mutedColor }}>
            <span className="inline-flex items-center gap-1.5"><Check size={12} style={{ color: t.accentBg }} /> Free tier on both sides</span>
            <span className="inline-flex items-center gap-1.5"><Check size={12} style={{ color: t.accentBg }} /> Switch or cancel anytime</span>
            <span className="inline-flex items-center gap-1.5"><Check size={12} style={{ color: t.accentBg }} /> No commission, ever</span>
          </div>
        </div>
      </section>

      {/* ── Audience tabs ─────────────────────────────────────────────────────── */}
      <section className="pt-12 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Tabs are ALWAYS visible — even when the signed-in user has a
              natural audience (we still default to it). Hiding the other
              tab masked the supplier plans for logged-in customers and
              vice-versa, which broke the "evaluate both sides before
              committing" use case. */}
          <div className="flex justify-center">
            <div
              className="inline-flex items-center gap-1 rounded-full p-1"
              style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
            >
              <AudienceButton
                active={audience === 'CUSTOMER'}
                onClick={() => setAudience('CUSTOMER')}
                label="For Clients"
              />
              <AudienceButton
                active={audience === 'SUPPLIER'}
                onClick={() => setAudience('SUPPLIER')}
                label="For IT Specialists & Companies"
              />
            </div>
          </div>
          {audienceLock !== null && audience === audienceLock && (
            <p
              className="text-center text-xs mt-3"
              style={{ color: t.mutedColor }}
            >
              Showing plans for your account type ({audienceLock === 'CUSTOMER' ? 'client' : 'supplier'}). Switch the tab above to see the other side.
            </p>
          )}
          {audienceLock !== null && audience !== audienceLock && (
            <p
              className="text-center text-xs mt-3"
              style={{ color: t.mutedColor }}
            >
              You&apos;re signed in as a {audienceLock === 'CUSTOMER' ? 'client' : 'supplier'} — these {audience === 'CUSTOMER' ? 'client' : 'supplier'} plans aren&apos;t purchasable from your account. <Link href="/register" style={{ color: t.accentBg, textDecoration: 'none' }}>Open a separate account</Link> if you also operate as a {audience === 'CUSTOMER' ? 'client' : 'supplier'}.
            </p>
          )}

          {/* Monthly / yearly toggle */}
          <div className="mt-6 flex justify-center">
            <div
              className="inline-flex items-center gap-1 rounded-full p-1"
              style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
            >
              <BillingButton
                active={billing === 'monthly'}
                onClick={() => setBilling('monthly')}
                label="Monthly"
              />
              <BillingButton
                active={billing === 'yearly'}
                onClick={() => setBilling('yearly')}
                label="Yearly"
                {...(computeMaxYearlySavings(filtered) > 0 && {
                  badge: `Save up to ${computeMaxYearlySavings(filtered)}%`,
                })}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Audience value-prop strip ────────────────────────────────────────── */}
      <section className="pt-8 pb-2 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {audienceValueProps.map((vp) => (
              <div
                key={vp.label}
                className="flex items-start gap-3 p-4 rounded-xl"
                style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${t.accentBg}18`, color: t.accentBg }}
                >
                  <vp.icon size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold mb-0.5" style={{ color: t.headlineColor }}>{vp.label}</p>
                  <p className="text-xs leading-relaxed" style={{ color: t.bodyColor }}>{vp.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plan cards ───────────────────────────────────────────────────────── */}
      <section className="py-12 px-6">
        <div className="max-w-6xl mx-auto">
          {filtered.length === 0 ? (
            <div
              className="rounded-2xl p-12 text-center text-sm"
              style={{
                background: t.cardBg,
                border: `1px solid ${t.cardBorder}`,
                color: t.mutedColor,
              }}
            >
              No public plans available for this audience yet — check back soon.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  billing={billing}
                  onSubscribe={() => handleSubscribe(plan)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Subscription vs commission comparison ────────────────────────────── */}
      <section
        className="py-20 px-6"
        style={{
          background: t.section1Bg,
          borderTop: `1px solid ${t.sectionBorder}`,
          borderBottom: `1px solid ${t.sectionBorder}`,
        }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
              The maths
            </p>
            <h2
              className="font-display font-bold text-3xl md:text-4xl mb-4"
              style={{ color: t.headlineColor, letterSpacing: '-0.01em' }}
            >
              Subscription beats commission almost immediately.
            </h2>
            <p className="text-base max-w-2xl mx-auto" style={{ color: t.bodyColor }}>
              On platforms charging 15–20% per engagement, your effective fee scales with your success. On TalvexIT it&apos;s flat — and zero on the engagement itself.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div
              className="rounded-2xl p-6 md:p-8"
              style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: t.mutedColor }}>
                Commission-based marketplace
              </p>
              <p className="font-display font-bold text-lg mb-4" style={{ color: t.headlineColor }}>
                You bill $5,000 — they take $850.
              </p>
              <ul className="space-y-2.5 text-sm" style={{ color: t.bodyColor }}>
                <li className="flex items-start gap-2"><span style={{ color: '#EF4444' }}>✕</span><span>17% commission per engagement = $850 gone every $5,000</span></li>
                <li className="flex items-start gap-2"><span style={{ color: '#EF4444' }}>✕</span><span>Effective fee scales with your hard-earned revenue</span></li>
                <li className="flex items-start gap-2"><span style={{ color: '#EF4444' }}>✕</span><span>Platform sits between you and your client&apos;s money</span></li>
                <li className="flex items-start gap-2"><span style={{ color: '#EF4444' }}>✕</span><span>FX margin on overseas payouts</span></li>
              </ul>
            </div>
            <div
              className="rounded-2xl p-6 md:p-8"
              style={{ background: t.cardBg, border: `2px solid ${t.accentBg}80`, boxShadow: `0 0 30px ${t.accentBg}25` }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: t.accentBg }}>
                TalvexIT
              </p>
              <p className="font-display font-bold text-lg mb-4" style={{ color: t.headlineColor }}>
                You bill $5,000 — you keep $5,000.
              </p>
              <ul className="space-y-2.5 text-sm" style={{ color: t.bodyColor }}>
                <li className="flex items-start gap-2"><Check size={14} style={{ color: t.accentBg, marginTop: '0.25rem', flexShrink: 0 }} /><span>0% commission. Subscription pays for itself in a single mid-size engagement</span></li>
                <li className="flex items-start gap-2"><Check size={14} style={{ color: t.accentBg, marginTop: '0.25rem', flexShrink: 0 }} /><span>Effective fee actually <em>shrinks</em> as your engagements grow</span></li>
                <li className="flex items-start gap-2"><Check size={14} style={{ color: t.accentBg, marginTop: '0.25rem', flexShrink: 0 }} /><span>Customer pays you direct, on your nominated rail</span></li>
                <li className="flex items-start gap-2"><Check size={14} style={{ color: t.accentBg, marginTop: '0.25rem', flexShrink: 0 }} /><span>No FX margin — the customer&apos;s currency is your currency</span></li>
              </ul>
            </div>
          </div>

          <div className="text-center mt-10">
            <Link
              href="/register"
              className="hp-primary inline-flex items-center gap-2 font-semibold rounded-xl transition-all duration-200"
              style={{
                background: t.primaryBg,
                color: t.primaryText,
                textDecoration: 'none',
                padding: '0.75rem 1.5rem',
                fontSize: '0.9rem',
              }}
            >
              Start with the free tier
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── How payment works (rewritten — no escrow, multi-rail) ─────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
              How payment actually works
            </p>
            <h2
              className="font-display font-bold text-3xl md:text-4xl mb-4"
              style={{ color: t.headlineColor, letterSpacing: '-0.01em' }}
            >
              No escrow. No middleman. Just the rails you already use.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PAYMENT_DETAILS.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="p-6 rounded-2xl"
                style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{
                    background: `${t.accentBg}18`,
                    color: t.accentBg,
                  }}
                >
                  <Icon size={20} />
                </div>
                <h3
                  className="font-display font-semibold text-base mb-2"
                  style={{ color: t.headlineColor }}
                  dangerouslySetInnerHTML={{ __html: title }}
                />
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: t.bodyColor }}
                  dangerouslySetInnerHTML={{ __html: description }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ — shared + audience-specific ─────────────────────────────────── */}
      <section
        className="py-20 px-6"
        style={{
          background: t.section1Bg,
          borderTop: `1px solid ${t.sectionBorder}`,
        }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
              Common questions
            </p>
            <h2
              className="font-display font-bold text-3xl md:text-4xl"
              style={{ color: t.headlineColor, letterSpacing: '-0.01em' }}
            >
              {audience === 'CUSTOMER'
                ? 'Questions clients ask before subscribing.'
                : 'Questions consultants ask before joining.'}
            </h2>
          </div>

          {(() => {
            const list = [
              ...FAQS_SHARED,
              ...(audience === 'CUSTOMER' ? FAQS_CUSTOMER : FAQS_SUPPLIER),
            ];
            return (
              <div className="space-y-3">
                {list.map((f, i) => {
                  const open = openFaq === i;
                  return (
                    <div
                      key={f.q}
                      className="rounded-xl overflow-hidden"
                      style={{
                        background: t.cardBg,
                        border: `1px solid ${t.cardBorder}`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaq(open ? null : i)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                        style={{ color: t.headlineColor }}
                      >
                        <span className="font-semibold text-sm md:text-base">
                          {f.q}
                        </span>
                        <ChevronDown
                          size={16}
                          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                          style={{ color: t.mutedColor }}
                        />
                      </button>
                      {open && (
                        <div
                          className="px-5 pb-4 text-sm leading-relaxed"
                          style={{ color: t.bodyColor }}
                        >
                          {f.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div
          className="max-w-4xl mx-auto p-10 md:p-14 rounded-3xl text-center"
          style={{ background: t.section1Bg, border: `1px solid ${t.accentBg}40` }}
        >
          <Globe size={36} style={{ color: t.accentBg, marginBottom: '1rem', display: 'inline-block' }} />
          <h2
            className="font-display font-bold text-3xl md:text-4xl mb-4"
            style={{ color: t.headlineColor, letterSpacing: '-0.01em' }}
          >
            {audience === 'CUSTOMER'
              ? 'Get verified IT specialists on your next engagement.'
              : 'Stop giving away commission on every engagement.'}
          </h2>
          <p className="text-base md:text-lg mb-8 max-w-xl mx-auto" style={{ color: t.bodyColor }}>
            {audience === 'CUSTOMER'
              ? 'Free tier lets you post briefs, scope with AI, and engage suppliers. Upgrade only when you need more concurrent engagements or advanced features.'
              : 'Subscription pays for itself in your first or second engagement. Free tier lets you list services, accept your first job, and invoice the customer direct.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="hp-primary inline-flex items-center gap-2 font-semibold rounded-xl transition-all duration-200"
              style={{
                background: t.primaryBg,
                color: t.primaryText,
                textDecoration: 'none',
                padding: '0.875rem 1.75rem',
                fontSize: '0.95rem',
              }}
            >
              {audience === 'CUSTOMER' ? 'Create a free client account' : 'Apply to join — free tier'}
              <ArrowRight size={16} />
            </Link>
            <Link
              href={audience === 'CUSTOMER' ? '/services/cybersecurity' : '/contractors'}
              className="inline-flex items-center gap-2 font-medium rounded-xl px-5 py-3 text-sm transition-all duration-200"
              style={{
                background: t.cardBg,
                color: t.headlineColor,
                border: `1px solid ${t.cardBorder}`,
                textDecoration: 'none',
              }}
            >
              <Zap size={14} />
              {audience === 'CUSTOMER' ? 'Browse services' : 'See the platform'}
            </Link>
          </div>
          <p className="text-xs mt-6" style={{ color: t.mutedColor }}>
            Already have an account? <Link href="/login" style={{ color: t.accentBg, textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </section>
    </PublicPageShell>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function AudienceButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-2 rounded-full text-sm font-medium transition-colors"
      style={{
        background: active ? t.accentBg : 'transparent',
        color: active ? '#0f172a' : t.mutedColor,
      }}
    >
      {label}
    </button>
  );
}

function BillingButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-colors"
      style={{
        background: active ? t.accentBg : 'transparent',
        color: active ? '#0f172a' : t.mutedColor,
      }}
    >
      {label}
      {badge && (
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{
            background: active ? '#0f172a' : t.chipBg,
            color: active ? t.accentBg : t.accentBg,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function PlanCard({
  plan,
  billing,
  onSubscribe,
}: {
  plan: PublicPlan;
  billing: 'monthly' | 'yearly';
  onSubscribe: () => void;
}) {
  const price =
    billing === 'monthly' ? plan.monthly_price_aud : plan.yearly_price_aud;
  const priceNum = price ? Number(price) : null;
  const monthlyEquivalent =
    billing === 'yearly' && priceNum !== null ? priceNum / 12 : priceNum;
  // Free plans are always "available" — they bypass Stripe and activate
  // directly via the backend's free-plan handler. Paid plans require a
  // synced Stripe price ID before they can be subscribed to.
  const isFree = priceNum !== null && priceNum === 0;
  const hasStripePrice =
    billing === 'monthly'
      ? !!plan.stripe_price_id_monthly
      : !!plan.stripe_price_id_yearly;
  const hasPrice = isFree || hasStripePrice;
  const accent = plan.highlight_color ?? '#14b8a6';
  const isHighlighted = !!plan.badge_text;

  // Build the feature list audience-aware. Customer plans expose a
  // different set of quotas (task_bookings, ai_scopes, contracts) than
  // supplier plans (listings, bids, seats, domains). Sharing one
  // builder rendered irrelevant or always-null rows for the wrong
  // audience — e.g. "Unlimited active tasks" appeared on customer
  // plans where max_active_tasks is null because the column doesn't
  // apply to customers.
  const isCustomer = plan.plan_type.startsWith('CUSTOMER_');
  const isSupplier = plan.plan_type.startsWith('SUPPLIER_');
  const features: string[] = [];

  if (isCustomer) {
    pushLimit(features, 'task bookings / month',          plan.max_task_bookings_per_month);
    pushLimit(features, 'active orders at once',          plan.max_active_orders);
    pushLimit(features, 'orders / month',                 plan.max_orders_per_month);
    pushLimit(features, 'active tenders at once',         plan.max_active_tenders);
    pushLimit(features, 'contracts / month',              plan.max_contracts_per_month);
    pushLimit(features, 'AI scoping requests / month',    plan.max_ai_requests_per_month);
    pushLimit(features, 'manual tenders / month',         plan.max_manual_tenders_per_month);
  }

  if (isSupplier) {
    pushLimit(features, 'active task listings',           plan.max_active_tasks);
    pushLimit(features, 'total catalogue items',          plan.allowed_listing_items);
    pushLimit(features, 'team seats',                     plan.max_team_seats);
    pushLimit(features, 'domain categories',              plan.max_domain_categories);
    pushLimit(features, 'active orders at once',          plan.max_active_orders);
    pushLimit(features, 'orders / month',                 plan.max_orders_per_month);
    pushLimit(features, 'tender bids / month',            plan.max_bids_per_month);
    pushLimit(features, 'active tenders at once',         plan.max_active_tenders);
    pushLimit(features, 'active contracts at once',       plan.max_active_contracts);
  }

  // Feature flags — ordered from tangible (priority listing) to
  // enterprise (dedicated manager) so reading the list top-to-bottom
  // feels like climbing the tier.
  if (plan.allow_priority_listing)     features.push('Priority placement in search');
  if (plan.allow_project_mode)         features.push('Project mode (multi-task engagements)');
  if (plan.allow_advanced_analytics)   features.push('Advanced analytics dashboard');
  if (plan.allow_compliance_docs)      features.push('Compliance document vault');
  if (plan.allow_video_facility)       features.push('Video KYC + meeting facility');
  if (plan.allow_overseas_contractors) features.push('Overseas-contractor engagement');
  if (plan.allow_bulk_po)              features.push('Bulk Purchase Order generation');
  if (plan.allow_api_access)           features.push('REST API access');
  if (plan.allow_custom_sla)           features.push('Custom SLA on engagements');
  if (plan.allow_whitelabel)           features.push('White-label / custom domain');
  if (plan.allow_sso)                  features.push('SSO (SAML / OIDC)');
  if (plan.allow_dedicated_manager)    features.push('Dedicated account manager');

  // custom_features is the admin-extensible JSON list — keep last so
  // bespoke perks render under the structured list.
  for (const f of plan.custom_features) features.push(f);

  return (
    <div
      className="relative flex flex-col rounded-2xl p-7 transition-all"
      style={{
        background: t.cardBg,
        border: `${isHighlighted ? '2px' : '1px'} solid ${
          isHighlighted ? accent : t.cardBorder
        }`,
        boxShadow: isHighlighted ? `0 0 30px ${accent}30` : 'none',
      }}
    >
      {plan.badge_text && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
          style={{ background: accent, color: '#0f172a' }}
        >
          {plan.badge_text}
        </div>
      )}

      <div className="flex-1">
        <h3
          className="text-lg font-bold font-display"
          style={{ color: t.headlineColor }}
        >
          {plan.name}
        </h3>
        {plan.description && (
          <p className="mt-1 text-sm" style={{ color: t.bodyColor }}>
            {plan.description}
          </p>
        )}

        <div className="mt-6">
          {priceNum !== null ? (
            isFree ? (
              <>
                <span
                  className="text-4xl font-bold tabular-nums"
                  style={{ color: t.headlineColor }}
                >
                  Free
                </span>
                <span
                  className="ml-2 text-sm"
                  style={{ color: t.mutedColor }}
                >
                  no credit card required
                </span>
              </>
            ) : (
              <>
                <span
                  className="text-4xl font-bold tabular-nums"
                  style={{ color: t.headlineColor }}
                >
                  ${priceNum.toFixed(0)}
                </span>
                <span
                  className="ml-2 text-sm"
                  style={{ color: t.mutedColor }}
                >
                  AUD / {billing === 'monthly' ? 'month' : 'year'}
                </span>
                {billing === 'yearly' && monthlyEquivalent !== null && (
                  <p
                    className="mt-1 text-xs"
                    style={{ color: t.mutedColor }}
                  >
                    ${monthlyEquivalent.toFixed(2)} / month equivalent
                  </p>
                )}
              </>
            )
          ) : (
            <span className="text-base" style={{ color: t.mutedColor }}>
              No {billing} price configured
            </span>
          )}
          {plan.trial_days > 0 && hasPrice && (
            <p
              className="mt-1 text-xs flex items-center gap-1"
              style={{ color: accent }}
            >
              <Sparkles size={11} />
              {plan.trial_days}-day free trial
            </p>
          )}
        </div>

        <ul className="mt-6 space-y-2.5">
          {features.map((f, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm"
              style={{ color: t.bodyColor }}
            >
              <Check
                size={14}
                className="shrink-0 mt-0.5"
                style={{ color: accent }}
              />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-7">
        <Button
          variant={isHighlighted ? 'primary' : 'secondary'}
          size="lg"
          fullWidth
          disabled={!hasPrice}
          onClick={onSubscribe}
        >
          {hasPrice ? plan.cta_text || 'Subscribe' : 'Unavailable'}
          {hasPrice && <ArrowRight size={14} />}
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Push a quota line into the features list. Conventions:
//   value === null  → "Unlimited <label>" (no quota set; the column is null
//                     on the irrelevant audience — customer plans have
//                     null supplier columns and vice-versa — so we skip
//                     rather than render "Unlimited" for the wrong side)
//   value === 0     → skip entirely (the plan literally doesn't include
//                     this feature — e.g. Solo Free has 0 tender bids per
//                     month; rendering "0 tender bids" reads as broken)
//   value > 0       → "Up to <value> <label>" — handles singular and
//                     plural uniformly ("Up to 1 active order" reads
//                     fine without per-call pluralisation work)
//
// Labels are passed in lowercase by convention (preserving acronyms like
// "AI") so the helper can concatenate without case juggling.
function pushLimit(features: string[], label: string, value: number | null | undefined): void {
  if (value === undefined || value === null) return;
  if (value === 0) return;
  features.push(`Up to ${value} ${label}`);
}

function computeMaxYearlySavings(plans: PublicPlan[]): number {
  let max = 0;
  for (const p of plans) {
    if (!p.monthly_price_aud || !p.yearly_price_aud) continue;
    const monthly = Number(p.monthly_price_aud);
    const yearly = Number(p.yearly_price_aud);
    if (monthly <= 0 || yearly <= 0) continue;
    const annualCostMonthly = monthly * 12;
    if (annualCostMonthly <= yearly) continue;
    const savings = (annualCostMonthly - yearly) / annualCostMonthly;
    if (savings > max) max = savings;
  }
  return Math.round(max * 100);
}
