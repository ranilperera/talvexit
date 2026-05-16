'use client';

import { useState } from 'react';
import PublicPageShell, { theme as t } from '@/components/public/PublicPageShell';
import { ChevronDown } from 'lucide-react';

const OPERATOR_SHORT  = 'Waveful';
const PLATFORM_BRAND  = 'TalvexIT';
const SUPPORT_EMAIL   = 'support@talvexit.com';

interface QA {
  q: string;
  a: React.ReactNode;
}

interface Group {
  id: string;
  heading: string;
  intro?: string;
  items: QA[];
}

// ─── Content ────────────────────────────────────────────────────────────────
// Anchors used elsewhere on the site:
//   /faq#payments — linked from PublicFooter "For experts" column.
// Add an anchor here before linking it from another page.

const GROUPS: Group[] = [
  {
    id: 'payments',
    heading: 'Payments',
    intro:
      `${OPERATOR_SHORT} is not a payment processor — customers pay providers directly. The questions below cover how that works in practice.`,
    items: [
      {
        q: `Does ${OPERATOR_SHORT} hold my money in escrow?`,
        a: (
          <>
            No. {OPERATOR_SHORT} never holds customer or provider funds at any stage.
            Customers pay providers directly using a payment rail the provider has
            nominated — Stripe payment link, Australian bank transfer, PayID, SWIFT,
            PayPal, Wise, or any other rail the provider supports. The platform
            records the workflow state (invoice issued, payment evidence uploaded,
            receipt confirmed) but does not move money.
          </>
        ),
      },
      {
        q: 'How does the provider get paid?',
        a: (
          <>
            The provider issues a Tax Invoice (or Invoice, if not GST-registered)
            through the platform. The invoice carries the payment instructions for
            the rail the provider has nominated — for example a Stripe checkout
            link, an Australian BSB and account number, or a SWIFT wire reference.
            The customer pays the provider directly using those instructions, then
            uploads a payment evidence (receipt, reference number) to the platform.
            The provider confirms receipt against the invoice in the platform UI.
          </>
        ),
      },
      {
        q: `Does ${OPERATOR_SHORT} take a commission on engagements?`,
        a: (
          <>
            No. {OPERATOR_SHORT}&apos;s only revenue is the platform subscription
            fee — the monthly or annual amount you pay for your tier. We take
            zero commission, zero percentage cut, and no per-engagement fee from
            amounts customers pay to providers.
          </>
        ),
      },
      {
        q: 'What happens if a customer does not pay?',
        a: (
          <>
            Customer non-payment is a matter between the provider and the customer
            directly. Because {OPERATOR_SHORT} does not collect or hold engagement
            funds, we are not able to remit a payment that was never made. The
            provider is responsible for credit assessment, payment terms, demand
            letters, and any collection action. On request, the platform can
            export the engagement evidence (Purchase Order, scope acceptance,
            milestone acceptance, payment-evidence records, message threads) to
            support the provider&apos;s collection efforts. See clause 5 of the{' '}
            <a href="/provider-agreement" style={{ color: t.accentBg }}>Provider Agreement</a>.
          </>
        ),
      },
      {
        q: 'What if a customer initiates a chargeback?',
        a: (
          <>
            Chargebacks proceed entirely outside the platform — between the
            customer and the customer&apos;s bank or card provider. Because{' '}
            {OPERATOR_SHORT} does not hold funds, there is nothing for us to claw
            back. The provider is responsible for responding to the chargeback
            with their issuing bank. See clauses 4 and 11 of the{' '}
            <a href="/provider-agreement" style={{ color: t.accentBg }}>Provider Agreement</a>.
          </>
        ),
      },
      {
        q: 'How are refunds handled when a dispute determination requires one?',
        a: (
          <>
            The platform&apos;s dispute mediation issues a binding determination
            between the parties (full payment, full refund, partial split, or
            remediation). Because {OPERATOR_SHORT} does not hold the engagement
            funds, any refund or partial payment required by the determination
            is effected directly between the provider and the customer through
            the same payment rail used for the original transaction. The
            platform records the action; it does not execute the transfer.
          </>
        ),
      },
      {
        q: 'What about GST? Does the platform handle it?',
        a: (
          <>
            GST is collected by the provider (where the provider is GST-registered
            in Australia), not by {OPERATOR_SHORT}. The platform classifies each
            engagement (domestic, GST-free export under s38-190, reverse-charge
            under Division 84) and pre-populates the PDF accordingly. Providers
            are responsible for remitting GST to the ATO through their own BAS
            process. Customers should verify Tax Invoices meet the requirements
            of section 29-70 of the GST Act before claiming input tax credits.
          </>
        ),
      },
      {
        q: 'What if a provider does not have an ABN?',
        a: (
          <>
            Where an Australian customer engages a provider that does not supply
            a valid ABN, the customer is generally required by the{' '}
            <em>Taxation Administration Act 1953</em> (Cth) to withhold tax at
            the top marginal rate (currently 47%) from the amount they pay the
            provider, and remit that amount to the ATO. The platform surfaces
            a withholding-warning notice on invoices and Purchase Orders to
            alert both parties. {OPERATOR_SHORT} does not collect, hold, remit,
            or report withheld amounts — the obligation is directly between the
            customer and the ATO.
          </>
        ),
      },
    ],
  },

  // ── Subscription ──────────────────────────────────────────────────────
  {
    id: 'subscription',
    heading: 'Subscriptions',
    items: [
      {
        q: 'What do the customer subscription tiers include?',
        a: (
          <>
            Four tiers: Free Starter, Business, Professional, and Enterprise.
            Each tier comes with monthly quotas for AI-generated scopes,
            manually-authored tenders, orders, concurrent active engagements,
            and contracts. See{' '}
            <a href="/pricing" style={{ color: t.accentBg }}>/pricing</a> for
            the current numbers — the live pricing page is the source of truth.
          </>
        ),
      },
      {
        q: 'What do the provider subscription tiers include?',
        a: (
          <>
            Four tiers: Solo Free, Solo Pro, Company, and Global. Each tier
            comes with monthly quotas for active listings, total catalogue items,
            tender bids, orders, active contracts, domain categories, and team
            seats. The Solo Free tier is for trying the platform — Solo Pro and
            above add priority listing in customer search results. See{' '}
            <a href="/pricing" style={{ color: t.accentBg }}>/pricing</a>.
          </>
        ),
      },
      {
        q: 'When does my quota reset?',
        a: (
          <>
            Quotas reset on your subscription anniversary date — i.e. monthly,
            counted from your subscription start, not the calendar month. So if
            you subscribed on the 15th, your quota resets on the 15th of every
            following month.
          </>
        ),
      },
      {
        q: 'Can I cancel my subscription at any time?',
        a: (
          <>
            Yes. Cancellation takes effect at the end of the current paid period
            (you keep access until that date). Subscription fees are non-refundable
            except where required by law, including failure of a consumer guarantee
            under the Australian Consumer Law. Cancellation does not terminate
            your obligations under any active engagement.
          </>
        ),
      },
      {
        q: 'What happens to my data if I cancel?',
        a: (
          <>
            Your account is suspended at period end and your profile becomes
            unlisted. Data is retained per the retention schedule in the{' '}
            <a href="/privacy" style={{ color: t.accentBg }}>Privacy Policy</a>{' '}
            (account data: duration of account + 7 years; KYC video: 7 years;
            financial records: 7 years for ATO compliance; audit logs: 7 years,
            append-only). You can request a full data export before cancellation.
          </>
        ),
      },
    ],
  },

  // ── Engagements ───────────────────────────────────────────────────────
  {
    id: 'engagements',
    heading: 'Engagements',
    items: [
      {
        q: 'What is the difference between AI scopes and manual tenders?',
        a: (
          <>
            <strong>AI scope</strong>: you describe your requirement in plain
            English and the platform&apos;s AI drafts a structured scope
            (objective, in-scope, out-of-scope, deliverables, assumptions,
            milestones, hours estimate). Counts against your monthly{' '}
            <em>AI scopes</em> quota. <br /><br />
            <strong>Manual tender</strong>: you author the same scope structure
            yourself, without AI assistance. No AI quota burn, but counts
            against your monthly <em>manual tenders</em> quota at publish time.
            Both produce identical{' '}
            <code>scope_snapshot</code> JSON, so providers see no difference
            between AI-origin and manual-origin tenders.
          </>
        ),
      },
      {
        q: 'How are providers invited to a tender?',
        a: (
          <>
            Two paths: <strong>direct invite</strong> (you pick specific providers
            or companies from search), or <strong>auto-match</strong> (the
            platform&apos;s matching engine selects providers based on
            eligibility criteria — domain, provider type, KYC, insurance,
            experience years, required certifications). Each invitation is
            emailed to the provider with a deep link into the platform.
          </>
        ),
      },
      {
        q: 'How long do providers have to submit a proposal?',
        a: (
          <>
            Set at tender creation, default 7 days. The deadline can be extended
            (with all invited providers notified). Once the deadline passes, the
            tender closes to new proposals and you can review and award.
          </>
        ),
      },
      {
        q: 'What is the milestone review period?',
        a: (
          <>
            Default 5 business days from delivery submission, unless the
            engagement scope specifies a different period. If you do not action
            the milestone within the review period and no dispute is raised, the
            platform marks the milestone as accepted by inaction. Acceptance is
            a workflow event — your obligation to pay the provider arises from
            the Purchase Order, not from the workflow event.
          </>
        ),
      },
    ],
  },

  // ── KYC ───────────────────────────────────────────────────────────────
  {
    id: 'kyc',
    heading: 'KYC and verification',
    items: [
      {
        q: 'What verification do providers complete?',
        a: (
          <>
            <strong>Individual providers</strong>: government-issued ID upload
            plus a video KYC session. <strong>Company providers</strong>: company
            registration documents and at least one verified administrator. Both
            must upload current professional indemnity and public liability
            insurance certificates appropriate to their service category. The
            review takes up to two business days.
          </>
        ),
      },
      {
        q: 'Does the customer need to complete KYC?',
        a: (
          <>
            For most customer subscriptions, no — customers register, choose a
            plan, and start engaging providers. Customers based in Australia
            must supply a valid ABN before publishing their first tender (to
            satisfy the ABN-withholding regime). The platform validates the
            ABN against the Australian Business Register.
          </>
        ),
      },
      {
        q: 'What happens if my insurance expires?',
        a: (
          <>
            The platform periodically revalidates ABN status, insurance, and
            KYC. Where insurance lapses, the provider&apos;s account is
            automatically suspended until current documentation is uploaded.
            Suspension does not relieve the provider of obligations under any
            in-flight engagement.
          </>
        ),
      },
    ],
  },

  // ── Disputes ──────────────────────────────────────────────────────────
  {
    id: 'disputes',
    heading: 'Disputes',
    items: [
      {
        q: 'How does dispute mediation work?',
        a: (
          <>
            Either party can raise a formal dispute through the platform within
            10 business days of the milestone review deadline. A {OPERATOR_SHORT}{' '}
            compliance reviewer assesses submissions and evidence from both sides
            and issues a determination — full payment, full refund, partial split,
            or remediation required. The determination is binding between the
            parties as a matter of contract.
          </>
        ),
      },
      {
        q: 'Is the determination legally binding?',
        a: (
          <>
            It is binding between you and the other party as a contractual
            matter, because both parties accepted the dispute-mediation process
            at platform registration. Either party retains the right to pursue
            legal remedies in a court of competent jurisdiction. Consumer rights
            under the Australian Consumer Law are unaffected — see clause 13 of
            the{' '}
            <a href="/customer-agreement" style={{ color: t.accentBg }}>Customer Agreement</a>.
          </>
        ),
      },
      {
        q: `Does ${OPERATOR_SHORT} execute the refund?`,
        a: (
          <>
            No. {OPERATOR_SHORT} does not hold engagement funds, so refunds and
            partial payments are effected directly between the parties through
            the same rail used for the original payment. The platform records
            the action — the parties make the transfer.
          </>
        ),
      },
    ],
  },

  // ── Data and privacy ─────────────────────────────────────────────────
  {
    id: 'data',
    heading: 'Data and privacy',
    items: [
      {
        q: 'Where is my data stored?',
        a: (
          <>
            Primary storage is Microsoft Azure in the Australia East region.
            Some service providers (Stripe for subscription billing, LiveKit
            for KYC video) process data in the United States. We use Australian
            standard contractual clauses and GDPR-aligned safeguards for
            international transfers. Full detail in the{' '}
            <a href="/privacy" style={{ color: t.accentBg }}>Privacy Policy</a>.
          </>
        ),
      },
      {
        q: 'Does the platform use tracking or marketing cookies?',
        a: (
          <>
            No. We use only essential cookies and browser localStorage for
            authentication tokens and theme preferences. No third-party
            advertising or analytics cookies. No data shared with ad networks.
          </>
        ),
      },
      {
        q: 'How do I request a copy of my data?',
        a: (
          <>
            Email{' '}
            <a href={`mailto:privacy@talvexit.com`} style={{ color: t.accentBg }}>privacy@talvexit.com</a>
            . Under the Australian Privacy Act and the GDPR (where applicable)
            you have the right to access, correct, port, and (subject to legal
            retention obligations) erase your personal information. We respond
            within 30 days.
          </>
        ),
      },
      {
        q: 'How are downloads from the platform protected?',
        a: (
          <>
            All document downloads (KYC documents, authority documents,
            insurance certificates, invoices, purchase orders, payment evidence)
            stream through the API with sensitive views audited to the
            append-only AuditLog. Direct blob URLs are never exposed to
            browsers, so screenshots, browser-history exports, or Referer
            headers cannot leak a download link.
          </>
        ),
      },
    ],
  },
];

// ─── Components ──────────────────────────────────────────────────────────

function QAItem({ qa, defaultOpen }: { qa: QA; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: t.cardBorder, background: t.cardBg }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-3 text-left px-5 py-4 transition-colors hover:opacity-90"
        aria-expanded={open}
      >
        <span className="text-sm font-medium" style={{ color: t.headlineColor }}>
          {qa.q}
        </span>
        <ChevronDown
          size={16}
          className="shrink-0 mt-1 transition-transform"
          style={{
            color: t.mutedColor,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 text-sm leading-relaxed" style={{ color: t.bodyColor }}>
          {qa.a}
        </div>
      )}
    </div>
  );
}

export default function FaqClient() {
  return (
    <PublicPageShell>
      {/* Hero */}
      <section
        className="pt-24 pb-12 px-6 border-b"
        style={{ borderColor: t.sectionBorder }}
      >
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: t.accentText }}>
            Help Centre
          </p>
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-3" style={{ color: t.headlineColor }}>
            Frequently asked questions
          </h1>
          <p className="text-base leading-relaxed" style={{ color: t.bodyColor }}>
            Answers to the questions providers and customers ask most often about how the{' '}
            {PLATFORM_BRAND} platform works. For anything not covered here, email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: t.accentBg }}>{SUPPORT_EMAIL}</a>.
          </p>

          {/* Quick nav */}
          <nav className="mt-6 flex flex-wrap gap-2">
            {GROUPS.map((g) => (
              <a
                key={g.id}
                href={`#${g.id}`}
                className="text-xs px-3 py-1.5 rounded-full border transition-opacity hover:opacity-80 no-underline"
                style={{
                  borderColor: t.cardBorder,
                  background: t.cardBg,
                  color: t.bodyColor,
                }}
              >
                {g.heading}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* Groups */}
      <section className="py-12 px-6">
        <div className="max-w-3xl mx-auto space-y-14">
          {GROUPS.map((group) => (
            <div key={group.id} id={group.id} className="scroll-mt-24">
              <h2 className="font-display font-bold text-2xl mb-2" style={{ color: t.headlineColor }}>
                {group.heading}
              </h2>
              {group.intro && (
                <p className="text-sm mb-5" style={{ color: t.mutedColor }}>
                  {group.intro}
                </p>
              )}
              <div className="space-y-3">
                {group.items.map((qa, i) => (
                  <QAItem
                    key={i}
                    qa={qa}
                    // First Q in the Payments group is open by default — that's
                    // the most-linked-to anchor (/faq#payments).
                    defaultOpen={group.id === 'payments' && i === 0}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Still got a question */}
          <div
            className="rounded-2xl p-6 border text-center"
            style={{ background: t.cardBg, borderColor: t.cardBorder }}
          >
            <h3 className="font-display font-bold text-base mb-2" style={{ color: t.headlineColor }}>
              Still got a question?
            </h3>
            <p className="text-sm" style={{ color: t.bodyColor }}>
              Email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: t.accentBg }}>{SUPPORT_EMAIL}</a>{' '}
              and we will get back to you within one business day.
            </p>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}
