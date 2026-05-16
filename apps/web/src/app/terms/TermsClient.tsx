'use client';
import PublicPageShell, { theme as t } from '@/components/public/PublicPageShell';

const EFFECTIVE_DATE = '1 March 2026';
const LAST_UPDATED   = '16 May 2026';
const VERSION        = 'v2.0';

const OPERATOR_LEGAL_NAME = 'Waveful Digital Platforms';
const OPERATOR_SHORT      = 'Waveful';
const OPERATOR_ABN        = '49 602 081 005';
const PLATFORM_BRAND      = 'TalvexIT';
const PLATFORM_DOMAIN     = 'talvexit.com';

const LEGAL_EMAIL    = 'legal@talvexit.com';
const SUPPORT_EMAIL  = 'support@talvexit.com';
const SECURITY_EMAIL = 'security@talvexit.com';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-12">
      <h2 className="font-display font-bold text-2xl mb-4" style={{ color: t.headlineColor }}>{title}</h2>
      <div className="space-y-4 text-sm leading-relaxed" style={{ color: t.bodyColor }}>
        {children}
      </div>
    </section>
  );
}

const TOC = [
  ['#acceptance', '1. Acceptance of terms'],
  ['#description', '2. About the platform'],
  ['#accounts', '3. Accounts and registration'],
  ['#verification', '4. Verification requirements'],
  ['#customer-terms', '5. Customer terms'],
  ['#provider-terms', '6. Provider terms'],
  ['#fees-payments', '7. Subscription fees, payments, and taxes'],
  ['#ip', '8. Intellectual property'],
  ['#prohibited', '9. Prohibited conduct'],
  ['#disputes', '10. Dispute resolution'],
  ['#consumer-law', '11. Australian Consumer Law'],
  ['#disclaimers', '12. Disclaimers'],
  ['#liability', '13. Limitation of liability'],
  ['#indemnification', '14. Indemnification'],
  ['#termination', '15. Termination'],
  ['#governing-law', '16. Governing law and jurisdiction'],
  ['#electronic', '17. Electronic acceptance'],
  ['#changes', '18. Changes to terms'],
  ['#contact', '19. Contact'],
];

export default function TermsClient() {
  return (
    <PublicPageShell>
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
            Legal
          </p>
          <h1 className="font-display font-bold text-4xl mb-3" style={{ color: t.headlineColor }}>
            Terms of Service
          </h1>
          <p className="text-sm" style={{ color: t.mutedColor }}>
            Version {VERSION} · Effective: {EFFECTIVE_DATE} · Last updated: {LAST_UPDATED}
          </p>
          <p className="text-sm mt-4" style={{ color: t.bodyColor }}>
            These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) govern your access to
            and use of the {PLATFORM_BRAND} platform (&ldquo;<strong>Platform</strong>&rdquo;)
            operated by {OPERATOR_LEGAL_NAME} (ABN {OPERATOR_ABN}) (&ldquo;<strong>{OPERATOR_SHORT}</strong>&rdquo;,
            &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). By registering an account or
            using the Platform you agree to these Terms and to our{' '}
            <a href="/privacy" style={{ color: t.accentBg }}>Privacy Policy</a>. If you do not
            agree, do not use the Platform.
          </p>
          <p className="text-sm mt-3" style={{ color: t.bodyColor }}>
            {OPERATOR_SHORT} operates as a software-as-a-service provider. We are not a
            party to any service contract formed between customers and providers, we are
            not a billing agent, not a collection agent, not a payment processor, and we
            do not hold customer or provider funds at any stage. The contractual and
            payment relationship for IT services is directly between the customer and the
            provider.
          </p>
        </div>

        {/* Table of contents */}
        <div
          className="rounded-xl p-6 mb-12"
          style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
        >
          <h3 className="font-semibold text-sm mb-4 font-display" style={{ color: t.headlineColor }}>
            Contents
          </h3>
          <ul className="space-y-2">
            {TOC.map(([href, label]) => (
              <li key={href}>
                <a href={href} className="text-sm transition-opacity hover:opacity-80" style={{ color: t.accentBg, textDecoration: 'none' }}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Sections ───────────────────────────────────────────────────── */}

        <Section id="acceptance" title="1. Acceptance of terms">
          <p>By creating an account, you confirm that you are at least 18 years of age,
            have legal capacity to enter into binding contracts under the law of your
            jurisdiction, and agree to these Terms, our{' '}
            <a href="/privacy" style={{ color: t.accentBg }}>Privacy Policy</a>, and (where
            you act as a provider) the{' '}
            <a href="/provider-agreement" style={{ color: t.accentBg }}>Provider Agreement</a>.</p>
          <p>If you register on behalf of a business or other legal entity, you represent
            that you have authority to bind that entity to these Terms.</p>
        </Section>

        <Section id="description" title="2. About the platform">
          <p>{PLATFORM_BRAND} is an online marketplace and workflow platform that connects
            customers seeking IT services (&ldquo;<strong>Customers</strong>&rdquo;) with
            individual IT engineers and IT consulting companies offering those services
            (collectively, &ldquo;<strong>Providers</strong>&rdquo;). The Platform provides
            tools for scoping requirements (including optional AI-assisted scope drafting),
            inviting providers, submitting and reviewing proposals, generating purchase
            orders and invoices, exchanging messages, and mediating disputes.</p>
          <p>The Platform supports the workflow around an engagement. It is not the
            engagement itself. Each service contract is formed directly between the
            Customer and the Provider on the terms they agree (scope, price, deliverables,
            milestones, governing law if different from these Terms). {OPERATOR_SHORT} is
            not a party to that contract and has no right or obligation under it.</p>
        </Section>

        <Section id="accounts" title="3. Accounts and registration">
          <p>You must provide accurate, current, and complete information during
            registration and keep it up to date. You are responsible for maintaining the
            confidentiality of your account credentials and for all activity under your
            account.</p>
          <p>You must notify us immediately at{' '}
            <a href={`mailto:${SECURITY_EMAIL}`} style={{ color: t.accentBg }}>{SECURITY_EMAIL}</a>{' '}
            if you suspect unauthorised access. We recommend enabling multi-factor
            authentication on every account.</p>
          <p>You may not share your account credentials. Each individual or entity must
            hold their own account. We may suspend or terminate accounts that provide
            false information, share credentials, or are used to violate these Terms.</p>
        </Section>

        <Section id="verification" title="4. Verification requirements">
          <p><strong style={{ color: t.headlineColor }}>Individual providers</strong>{' '}
            must complete video identity verification (KYC) and upload current professional
            credentials and insurance certificates before their profiles are made visible
            to Customers. Verification status may lapse where documents expire and is
            withdrawn where documents are found to be invalid.</p>
          <p><strong style={{ color: t.headlineColor }}>Company providers</strong>{' '}
            must provide company registration documents, current insurance certificates,
            and at least one verified administrator. Company verification is reviewed
            by our compliance team and may take up to two business days.</p>
          <p>Submitting false, expired, or misleading verification documents is grounds for
            immediate account termination and may be referred to relevant regulators or
            law-enforcement agencies.</p>
        </Section>

        <Section id="customer-terms" title="5. Customer terms">
          <p>Customers may post requirements, invite providers (directly or via auto-match),
            review proposals, and engage a provider through the Platform. By accepting a
            proposal and signing the resulting Purchase Order, the Customer forms a direct
            service contract with the Provider on the agreed scope, schedule, milestones,
            and price.</p>
          <p>Customers are responsible for providing accurate requirement descriptions,
            timely feedback on deliverables, and prompt acceptance or rejection of each
            milestone within the review period agreed in the engagement scope (default
            five business days from delivery submission).</p>
          <p>Where a milestone is not actioned within the review period and no dispute
            is raised, the Platform marks the milestone as accepted by inaction. This
            marks the workflow state only — it does not itself move money, because
            {' '}{OPERATOR_SHORT} does not hold customer funds. The Customer remains
            obliged to pay the Provider in accordance with the Purchase Order through
            the payment rail the Provider has nominated.</p>
          <p>The Platform may automatically generate Tax Invoices on behalf of GST-registered
            providers using the engagement data agreed by both parties. The Customer is
            responsible for verifying that the invoice corresponds to the agreed engagement
            before paying.</p>
        </Section>

        <Section id="provider-terms" title="6. Provider terms">
          <p>Providers agree to deliver services in accordance with each accepted proposal,
            to the professional standard expected of their stated credentials and
            specialisations, and in compliance with all applicable laws.</p>
          <p>Providers must maintain valid public liability and professional indemnity
            insurance (where appropriate to their service category) for the duration of
            any active engagement. The account is suspended where insurance documentation
            lapses, and is reinstated once current documentation is uploaded.</p>
          <p><strong style={{ color: t.headlineColor }}>No off-platform circumvention.</strong>{' '}
            Providers must not solicit, accept, or arrange direct payment from a Customer
            outside the Platform for any engagement that originated through the Platform,
            for a period of 24 months from first contact between the parties on the
            Platform. This protects the integrity of the marketplace; it does not extend
            to pre-existing relationships the Provider can demonstrate predate the
            Platform contact.</p>
          <p><strong style={{ color: t.headlineColor }}>Intellectual property default.</strong>{' '}
            Unless explicitly varied in the engagement scope, all intellectual property
            created by the Provider in the course of an engagement is assigned to the
            Customer on payment in full, with the Provider retaining the right to use
            general-purpose tools, methodologies, and pre-existing materials used in
            delivering the engagement.</p>
          <p>Providers acting as suppliers of services on the Platform are bound by the
            additional terms set out in the{' '}
            <a href="/provider-agreement" style={{ color: t.accentBg }}>Provider Agreement (v2.0)</a>{' '}
            which is incorporated into these Terms by reference for Provider accounts.</p>
        </Section>

        <Section id="fees-payments" title="7. Subscription fees, payments, and taxes">
          <p><strong style={{ color: t.headlineColor }}>Subscription is our only revenue.</strong>{' '}
            Access to the Platform is provided on a subscription basis. Subscribers select
            a tier from those published at{' '}
            <a href="/pricing" style={{ color: t.accentBg }}>/pricing</a> and pay the
            corresponding monthly or annual fee directly to {OPERATOR_SHORT} through the
            Platform billing system, which is processed by Stripe Payments Australia Pty
            Ltd. We do not take a commission, percentage cut, or per-engagement fee from
            amounts paid by a Customer to a Provider.</p>
          <p><strong style={{ color: t.headlineColor }}>Direct customer-to-provider payment.</strong>{' '}
            Customers pay Providers directly using a payment rail the Provider has
            nominated — for example a Stripe payment link, Australian bank transfer, PayID,
            SWIFT wire, PayPal, Wise, or other rail the Provider supports. Payment funds
            flow directly from the Customer&apos;s account to the Provider&apos;s nominated
            account. They do not pass through {OPERATOR_SHORT} at any stage. The Platform
            records the workflow state (invoice issued, payment evidence uploaded,
            receipt confirmed) but does not move money.</p>
          <p><strong style={{ color: t.headlineColor }}>Taxes and GST.</strong>{' '}
            Each party is responsible for its own tax obligations. Where a Provider is
            registered for GST in Australia, the document the Provider issues through the
            Platform is a Tax Invoice within the meaning of the{' '}
            <em>A New Tax System (Goods and Services Tax) Act 1999</em> (Cth). Where the
            Provider is not GST-registered, the document is an Invoice (not a Tax Invoice)
            and no GST is charged. The Platform classifies engagements (domestic, GST-free
            export under s38-190, reverse-charge under Division 84, etc.) and pre-populates
            the PDF accordingly; the Provider is responsible for verifying that the
            classification is correct for their particular supply.</p>
          <p><strong style={{ color: t.headlineColor }}>ABN withholding.</strong>{' '}
            Where a Provider does not supply a valid ABN, an Australian Customer may be
            required by the <em>Taxation Administration Act 1953</em> (Cth) to withhold tax
            at the top marginal rate (currently 47%) from the amount they pay the
            Provider. The Platform may surface a withholding-warning notice on invoices
            and Purchase Orders to alert both parties to this obligation. The notice does
            not constitute tax advice. The Customer and the Provider remain responsible
            for handling withholding correctly under Australian law.</p>
          <p><strong style={{ color: t.headlineColor }}>Refunds and refunds for failed services.</strong>{' '}
            Because {OPERATOR_SHORT} does not hold engagement funds, any refund or partial
            refund flowing from the dispute-resolution process at clause 10 is effected
            directly between the Customer and the Provider through the same payment rail
            used for the original payment. The Platform records the action but does not
            execute the transfer. Nothing in this clause limits a Customer&apos;s rights
            under the Australian Consumer Law — see clause 11.</p>
          <p><strong style={{ color: t.headlineColor }}>Subscription refunds.</strong>{' '}
            Platform subscription fees paid to {OPERATOR_SHORT} are non-refundable except
            where required by law, including failure of a consumer guarantee under the
            Australian Consumer Law. Subscribers may cancel at any time; cancellation
            takes effect at the end of the current paid period.</p>
        </Section>

        <Section id="ip" title="8. Intellectual property">
          <p>All content, software, design, and infrastructure of the {PLATFORM_BRAND}{' '}
            Platform is owned by or licensed to {OPERATOR_LEGAL_NAME} and is protected by
            Australian and international copyright, trade-mark, and other intellectual
            property law. You may not copy, modify, reverse-engineer, scrape, or create
            derivative works of the Platform except as permitted by these Terms or by
            mandatory law.</p>
          <p>By submitting content to the Platform (profiles, listings, proposals,
            messages, scope documents, attachments), you grant {OPERATOR_SHORT} a
            non-exclusive, royalty-free, worldwide licence to use, store, display,
            transmit, and back-up that content for the limited purpose of operating
            the Platform and providing the Services. This licence ends when the
            content is removed from the Platform, except where retention is required
            by law or by our audit-log retention obligations described in the Privacy
            Policy.</p>
          <p>Intellectual property created by Providers in the course of an engagement
            is dealt with under clause 6.</p>
        </Section>

        <Section id="prohibited" title="9. Prohibited conduct">
          <p>You may not use the Platform to:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Post false, misleading, or fraudulent information, including impersonating
              another person or entity;</li>
            <li>Solicit or arrange off-platform payment in breach of clause 6
              (anti-circumvention);</li>
            <li>Upload malware, viruses, spyware, ransomware, or any code intended to
              disrupt or compromise systems;</li>
            <li>Harass, threaten, or abuse other users, our staff, or our contractors;</li>
            <li>Scrape, crawl, or systematically extract Platform data outside of features
              explicitly provided for export;</li>
            <li>Engage in money laundering, terrorism financing, sanctions evasion, or any
              other financial crime;</li>
            <li>Use the Platform in breach of any export-control, sanctions, anti-bribery,
              consumer-protection, privacy, or tax law applicable to you; or</li>
            <li>Reverse-engineer, decompile, or attempt to derive source code of the
              Platform except as permitted by mandatory law.</li>
          </ul>
          <p>Suspected violations may result in immediate account suspension or
            termination, removal of content, withholding of access, and reporting to
            relevant regulators or law-enforcement agencies.</p>
        </Section>

        <Section id="disputes" title="10. Dispute resolution">
          <p>Where a Customer and Provider cannot resolve a dispute about an engagement
            directly, either party may raise a formal dispute through the Platform within
            ten business days of the milestone review deadline.</p>
          <p>A {OPERATOR_SHORT} compliance reviewer will assess submissions and evidence
            from both parties and issue a determination — for example, full payment, full
            refund, partial split, or remediation required. The determination is binding
            between the Customer and the Provider as a matter of contract and is enforced
            by the parties directly (because {OPERATOR_SHORT} does not hold the engagement
            funds, see clause 7).</p>
          <p>Disputes involving allegations of fraud, illegal activity, or serious
            professional misconduct may be escalated to relevant regulators or
            law-enforcement agencies.</p>
          <p>Nothing in this clause prevents either party from pursuing legal remedies in
            a court of competent jurisdiction. Where the dispute involves an Australian
            Customer who is a consumer for the purposes of the Australian Consumer Law,
            the consumer&apos;s rights under that law are unaffected.</p>
        </Section>

        <Section id="consumer-law" title="11. Australian Consumer Law">
          <p>Nothing in these Terms excludes, restricts, or modifies any guarantee,
            condition, warranty, right, or remedy implied by the Australian Consumer Law
            (Schedule 2 of the <em>Competition and Consumer Act 2010</em> (Cth)) or by
            any other law that cannot be excluded.</p>
          <p>Where a service we supply to you (for example access to the Platform under
            a paid subscription) fails to meet a consumer guarantee under the Australian
            Consumer Law, you are entitled to the remedies provided by that law. Where
            permitted, our liability for failure to comply with a consumer guarantee in
            relation to services that are not of a kind ordinarily acquired for personal,
            domestic, or household use is limited, at our option, to:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>the resupply of the services; or</li>
            <li>the payment of the cost of having the services resupplied.</li>
          </ul>
          <p>{OPERATOR_SHORT} is not the supplier of the IT services Customers obtain from
            Providers — those services are supplied by the Provider directly. The
            Australian Consumer Law applies to a Customer&apos;s claim against a Provider
            in the normal way; that claim is between the Customer and the Provider.</p>
        </Section>

        <Section id="disclaimers" title="12. Disclaimers">
          <p>Subject to clause 11, the Platform is provided &ldquo;as is&rdquo; and
            &ldquo;as available&rdquo; without warranties of any kind, whether express,
            implied, or statutory, except those that cannot be excluded.
            {' '}{OPERATOR_SHORT} does not warrant that the Platform will be uninterrupted,
            error-free, or free from harmful components.</p>
          <p>Verification of provider credentials, identity, insurance, and ABN is
            performed in good faith using third-party data sources and is intended as a
            risk-reduction measure. It is not a guarantee of any Provider&apos;s
            performance, financial standing, or fitness for any particular engagement.
            {' '}{OPERATOR_SHORT} is not responsible for the quality, fitness for purpose,
            or outcome of any engagement between users.</p>
        </Section>

        <Section id="liability" title="13. Limitation of liability">
          <p>Subject to clause 11, to the maximum extent permitted by law,
            {' '}{OPERATOR_SHORT}&apos;s aggregate liability to you for any claim arising
            out of or related to these Terms or your use of the Platform — whether in
            contract, tort (including negligence), under statute, or otherwise — is
            capped at the total subscription fees you have actually paid to{' '}
            {OPERATOR_SHORT} in the twelve months immediately preceding the act, omission,
            or event giving rise to the claim. For Users who have paid no subscription
            fees, the cap is AUD 100.</p>
          <p>To the maximum extent permitted by law, {OPERATOR_SHORT} is not liable for
            indirect, incidental, consequential, special, exemplary, or punitive damages,
            including but not limited to loss of profits, loss of revenue, loss of
            business, loss of goodwill, or loss of data, whether or not we have been
            advised of the possibility of such damages.</p>
          <p>Nothing in this clause excludes or limits liability for: death or personal
            injury caused by negligence; fraud or fraudulent misrepresentation; or any
            liability that cannot be excluded under the Australian Consumer Law or other
            applicable mandatory law.</p>
        </Section>

        <Section id="indemnification" title="14. Indemnification">
          <p>You agree to indemnify and hold harmless {OPERATOR_LEGAL_NAME}, its officers,
            directors, employees, contractors, and agents from and against any third-party
            claim, demand, loss, damage, cost, or expense (including reasonable legal
            costs on a solicitor-and-client basis) arising out of or in connection with:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>your use of the Platform in breach of these Terms;</li>
            <li>any engagement between you and another user, including any services
              supplied or received under that engagement;</li>
            <li>any content you submit through the Platform; or</li>
            <li>your breach of any law or of the rights of any third party.</li>
          </ul>
          <p>This indemnity does not apply to the extent the claim arises from
            {' '}{OPERATOR_SHORT}&apos;s own breach of these Terms, its negligence, or its
            wilful misconduct.</p>
        </Section>

        <Section id="termination" title="15. Termination">
          <p>You may close your account at any time from the account settings page or by
            contacting <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: t.accentBg }}>{SUPPORT_EMAIL}</a>.
            Closure does not affect obligations under active engagements or any
            outstanding financial matter between you and another user.</p>
          <p>We may suspend or terminate your account immediately where you materially
            breach these Terms, provide false information, fail required verification, or
            where we reasonably determine your use of the Platform poses a risk to other
            users, to the Platform, or to {OPERATOR_SHORT}. We will provide reasonable
            notice where it is practicable to do so.</p>
          <p>Provisions of these Terms which by their nature should survive termination
            — including payment obligations under existing engagements, intellectual
            property, dispute resolution, indemnities, limitations of liability, and the
            governing law clause — survive termination.</p>
        </Section>

        <Section id="governing-law" title="16. Governing law and jurisdiction">
          <p>These Terms are governed by the laws of Victoria, Australia. Each
            party irrevocably submits to the non-exclusive jurisdiction of the courts of
            Victoria and the Federal Court of Australia. Nothing in this clause
            prevents either party from seeking urgent injunctive or other equitable
            relief from any court of competent jurisdiction.</p>
          <p>For Users in the European Economic Area or the United Kingdom, nothing in
            these Terms limits rights under applicable EU/UK consumer-protection law.
            For Users in any other jurisdiction, nothing in these Terms limits rights
            under any mandatory consumer-protection law of that jurisdiction.</p>
        </Section>

        <Section id="electronic" title="17. Electronic acceptance">
          <p>By checking the acceptance box on the registration screen, by clicking
            &ldquo;Accept&rdquo; on any consent screen presented in the Platform, or by
            otherwise using the Platform after notice of these Terms, you accept these
            Terms electronically.</p>
          <p>Your acceptance is recorded together with your IP address, user-agent, and
            a timestamp, and constitutes a valid electronic signature under the
            <em> Electronic Transactions Act 1999</em> (Cth). You consent to receive
            communications from {OPERATOR_SHORT} (including notice of changes to these
            Terms) in electronic form via the email address on your account.</p>
        </Section>

        <Section id="changes" title="18. Changes to terms">
          <p>We may amend these Terms from time to time. We will notify registered users
            of material changes by email to the address on the account at least fourteen
            days before the changes take effect, unless an earlier date is required by
            law. Continued use of the Platform on or after the effective date of the
            amended Terms constitutes acceptance of the amendment.</p>
          <p>Non-material changes (typographical corrections, clarifications, changes
            to contact details) may be made at any time and take effect on publication.
            The version number and &ldquo;Last updated&rdquo; date at the top of this
            page reflect each amendment.</p>
        </Section>

        <Section id="contact" title="19. Contact">
          <p>For questions about these Terms or to give notice under them:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Legal: <a href={`mailto:${LEGAL_EMAIL}`} style={{ color: t.accentBg }}>{LEGAL_EMAIL}</a></li>
            <li>Account / billing support: <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: t.accentBg }}>{SUPPORT_EMAIL}</a></li>
            <li>Security incidents: <a href={`mailto:${SECURITY_EMAIL}`} style={{ color: t.accentBg }}>{SECURITY_EMAIL}</a></li>
          </ul>
          <p>{OPERATOR_LEGAL_NAME} (ABN {OPERATOR_ABN}) · Australia</p>
          <p className="text-xs" style={{ color: t.mutedColor }}>
            {OPERATOR_LEGAL_NAME} is the legal entity that owns and operates the{' '}
            {PLATFORM_BRAND} platform at {PLATFORM_DOMAIN}.
          </p>
        </Section>
      </div>
    </PublicPageShell>
  );
}
