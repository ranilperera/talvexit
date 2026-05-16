'use client';

import PublicPageShell, { theme as t } from '@/components/public/PublicPageShell';

const EFFECTIVE_DATE      = '16 May 2026';
const LAST_UPDATED        = '16 May 2026';
const AGREEMENT_VERSION   = 'v1.0-2026';
const OPERATOR_LEGAL_NAME = 'Waveful Digital Platforms';
const OPERATOR_SHORT      = 'Waveful';
const OPERATOR_ABN        = '49 602 081 005';
const PLATFORM_BRAND      = 'TalvexIT';
const PLATFORM_DOMAIN     = 'talvexit.com';
const LEGAL_EMAIL         = 'legal@talvexit.com';

const clauses = [
  // ── 1 ──────────────────────────────────────────────────────────────────
  {
    number: '1',
    title: 'Platform terms and Customer status',
    body: [
      `${OPERATOR_LEGAL_NAME} ABN ${OPERATOR_ABN} ("${OPERATOR_SHORT}", "we", "us") operates ${PLATFORM_BRAND} at ${PLATFORM_DOMAIN} — an online marketplace and workflow platform that connects customers seeking IT services ("you", "your", the "Customer") with individual IT engineers and IT consulting companies ("Providers").`,
      'Under this Agreement:',
      '(a) you use the platform to scope your requirements, invite Providers, review proposals, accept a Provider, and manage the engagement workflow;',
      `(b) ${OPERATOR_SHORT} provides the technology platform, the AI-assisted and manual scope tools, the proposal and Purchase Order workflow, dispute mediation, and supporting compliance facilities;`,
      `(c) ${OPERATOR_SHORT} is NOT a party to any service contract between you and a Provider. ${OPERATOR_SHORT} is NOT a billing agent, not a collection agent, not a payment processor, and does not hold customer or provider funds at any stage.`,
      `When you accept a Provider proposal and sign the resulting Purchase Order, you form a direct service contract with that Provider on the agreed scope, schedule, milestones, and price. ${OPERATOR_SHORT} is not a party to that contract and has no rights or obligations under it.`,
    ],
  },

  // ── 2 ── SUBSCRIPTION ─────────────────────────────────────────────────
  {
    number: '2',
    title: 'Customer subscription · what your plan includes',
    body: [
      `Access to the platform is provided on a subscription basis. You select a tier (Free Starter, Business, Professional, or Enterprise) from those published at /pricing and pay the corresponding monthly or annual fee directly to ${OPERATOR_SHORT} through the platform billing system.`,
      'Your subscription tier determines your monthly quotas — for example the number of AI-generated scopes, manually-authored tenders, orders, and active concurrent contracts you may have. Soft limits are published per tier; quotas reset on your subscription anniversary date.',
      `${OPERATOR_SHORT}'s subscription fee is the only consideration payable to ${OPERATOR_SHORT} for use of the platform. ${OPERATOR_SHORT} does NOT take a commission, percentage cut, or per-engagement fee from amounts you pay to Providers.`,
      'Subscription fees are payable in advance, are non-refundable except where required by law (including failure of a consumer guarantee under the Australian Consumer Law — see clause 13), and remain payable for the current paid period if you cancel mid-period. Cancellation takes effect at the end of the current period.',
      'Subscription tiers, included quotas, feature flags, and prices may change with 30 days written notice. Continued use after the notice period constitutes acceptance.',
    ],
  },

  // ── 3 ── PROVIDER'S SERVICES — WAVEFUL IS NOT THE SUPPLIER ────────────
  {
    number: '3',
    title: 'Provider services — supplied by Providers, not by ' + OPERATOR_SHORT,
    body: [
      'Every engagement that begins on the platform results in a separate service contract between you and a Provider. The Provider is the supplier of the IT services described in your accepted proposal or Purchase Order. ' + OPERATOR_SHORT + ' is not a sub-contractor, agent, employee, or representative of the Provider, and the Provider is not a sub-contractor, agent, employee, or representative of ' + OPERATOR_SHORT + '.',
      OPERATOR_SHORT + ' makes no warranty, representation, or undertaking as to the quality, fitness for purpose, timeliness, professional standard, or commercial outcome of any service supplied by a Provider. Your contractual remedy for any defect, delay, professional negligence, intellectual property infringement, breach of confidence, data loss, security incident, or other failure in a Provider\'s services is against that Provider directly, under the contract you have with the Provider, and (where applicable) under the Australian Consumer Law (see clause 13).',
      OPERATOR_SHORT + '\'s verification of Provider credentials, identity, insurance, and ABN is performed in good faith using third-party data sources and is a risk-reduction measure for the marketplace. It is not a guarantee of any Provider\'s performance, financial standing, professional competence, or fitness for any particular engagement. You are responsible for satisfying yourself, before accepting a proposal, that the Provider is suitable for the engagement.',
      'To the maximum extent permitted by law, you release ' + OPERATOR_SHORT + ' from, and waive, any claim against ' + OPERATOR_SHORT + ' relating to: (a) the Provider\'s services; (b) any act, omission, or default of the Provider or its personnel, sub-contractors, or agents; or (c) the commercial outcome of any engagement. Nothing in this clause limits any right you have under the Australian Consumer Law that cannot be excluded.',
    ],
  },

  // ── 4 ── YOUR PAYMENT OBLIGATIONS ─────────────────────────────────────
  {
    number: '4',
    title: 'Paying Providers directly',
    body: [
      'You pay Providers directly using a payment rail the Provider has nominated — for example a Stripe payment link, Australian bank transfer, PayID, SWIFT, PayPal, Wise, or another rail the Provider supports. Payment funds flow directly from your account to the Provider\'s nominated account. They do not pass through ' + OPERATOR_SHORT + ' at any stage.',
      'You must pay each Provider invoice on or before the due date specified in the invoice or the Purchase Order, in the currency specified, and using the rail the Provider has nominated. Where you have agreed milestones, you must pay each milestone invoice on its due date even if other milestones are in dispute, unless the Purchase Order expressly provides otherwise.',
      'When you mark a milestone as accepted in the platform (or where you do not action it within the review period agreed in the engagement scope), the platform records workflow acceptance only. It does not itself move money. Your contractual obligation to pay the Provider arises from the Purchase Order; the platform record evidences the workflow event.',
      'You are responsible for keeping your billing-side identity information (legal entity name, billing address, ABN if applicable, GST registration status, billing email) current. Where the Provider issues a Tax Invoice using your platform-recorded billing details, that invoice is valid against you in accordance with its terms.',
      OPERATOR_SHORT + ' is not liable for any delay, error, fee, or loss caused by the payment rail you choose to use, by banking systems, by foreign-exchange conversion, or by your failure to follow the Provider\'s payment instructions.',
    ],
  },

  // ── 5 ── ABN WITHHOLDING (FROM THE CUSTOMER SIDE) ─────────────────────
  {
    number: '5',
    title: 'ABN withholding — engaging Providers without an ABN',
    body: [
      'Where an Australian-resident Customer engages a Provider that does not supply a valid ABN, the Taxation Administration Act 1953 (Cth) generally requires the Customer to withhold tax at the top marginal rate (currently 47%) from the amount the Customer pays the Provider, and to remit the withheld amount to the ATO.',
      'You are solely responsible for complying with this obligation. The platform may surface a withholding-warning notice on invoices and Purchase Orders to alert you, but the notice does not constitute tax advice. ' + OPERATOR_SHORT + ' does not collect, hold, remit, or report the withheld amount.',
      'To avoid the withholding entirely, engage a Provider that supplies a valid ABN that passes ATO validation, or obtain from the Provider an appropriate Supplier Statement or tax-treaty declaration where applicable to the Provider\'s circumstances.',
    ],
  },

  // ── 6 ── TAX INVOICES + GST INPUT CREDITS ─────────────────────────────
  {
    number: '6',
    title: 'Tax invoices and GST input credits',
    body: [
      'Where you are registered for GST in Australia and a Provider issues a Tax Invoice through the platform, you may claim a GST input tax credit on the invoice subject to the requirements of the A New Tax System (Goods and Services Tax) Act 1999 (Cth) (the "GST Act"), including the substantive requirements of section 29-70 (a valid Tax Invoice).',
      'The platform classifies each engagement (domestic, GST-free export under s38-190, reverse-charge under Division 84, etc.) based on the parties\' platform-recorded data, and pre-populates the PDF accordingly. You are responsible for satisfying yourself, before claiming an input credit, that the classification is correct for the particular supply and that the document meets the GST Act requirements applicable to your circumstances.',
      'Where the Provider is not registered for GST, the document the Provider issues is an Invoice (not a Tax Invoice), no GST is charged, and no input tax credit may be claimed.',
      OPERATOR_SHORT + ' is not your tax adviser and does not provide tax advice. Where you are uncertain about the correct GST treatment of a particular engagement or invoice, you should consult a registered tax agent.',
    ],
  },

  // ── 7 ── CUSTOMER REPS AND WARRANTIES ─────────────────────────────────
  {
    number: '7',
    title: 'Your representations and warranties',
    body: [
      'Each time you use the platform you represent and warrant that:',
      '(a) the registration, billing, ABN, GST registration, and tax-residency information you submit is accurate, current, and not misleading, and you will update it promptly if it changes;',
      '(b) if you register on behalf of a business or other legal entity, you have authority to bind that entity to this Agreement and to any engagement you accept;',
      '(c) the requirement descriptions, scopes, attachments, and other content you submit through the platform are accurate and lawful, and do not infringe any third-party intellectual property, contractual, confidentiality, or other rights;',
      '(d) you have the lawful right to engage a Provider for the services described, and the engagement does not breach any contract, fiduciary duty, or law that applies to you;',
      '(e) you will not use the platform to engage a Provider for services that are unlawful, that facilitate fraud, money-laundering, terrorism financing, sanctions evasion, anti-competitive conduct, modern slavery, or any other criminal or seriously unethical purpose;',
      '(f) you will not make any representation, warranty, or undertaking on behalf of ' + OPERATOR_SHORT + ' or hold yourself out as the agent, employee, or representative of ' + OPERATOR_SHORT + '; and',
      '(g) you will comply with all laws applicable to your use of the platform, including (without limitation) consumer-protection, privacy, anti-money-laundering, sanctions, anti-bribery, work-health-and-safety, anti-discrimination, modern-slavery, and tax laws.',
    ],
  },

  // ── 8 ── CONFIDENTIALITY (CUSTOMER SIDE) ──────────────────────────────
  {
    number: '8',
    title: 'Confidentiality — Provider information',
    body: [
      'You must keep confidential any non-public information you receive through the platform about a Provider, including the Provider\'s proprietary methodologies, tools, source code, pricing structures, sub-contracting arrangements, or commercial terms with other customers.',
      'You may use that information only for the purpose of evaluating the Provider\'s proposal and (if accepted) for managing the engagement, and must not disclose it to any third party — including competing Providers — except with the Provider\'s written consent or as required by law.',
      'Where a Provider supplies you with credentials to its systems or services (for example to demonstrate a deliverable), you must use those credentials only for the agreed purpose and must not retain them after the engagement ends.',
    ],
  },

  // ── 9 ── INTELLECTUAL PROPERTY ────────────────────────────────────────
  {
    number: '9',
    title: 'Intellectual property',
    body: [
      'Unless the engagement scope expressly says otherwise, intellectual property created by a Provider specifically for you in the course of an engagement is assigned to you on payment in full of the corresponding invoice. The Provider retains all rights in: (a) pre-existing materials, libraries, frameworks, methodologies, and tools used in delivering the engagement; and (b) general know-how and skills acquired during the engagement.',
      'You acknowledge that a Provider may grant you a non-exclusive licence (rather than an assignment) to use specific deliverables, where the engagement scope expressly so provides — for example deliverables built on top of a Provider-owned platform.',
      'You retain all rights in materials you provide to the Provider for use in the engagement. You grant the Provider, and (to the extent necessary to operate the platform) ' + OPERATOR_SHORT + ', a non-exclusive licence to use those materials for the purposes of the engagement and the platform respectively.',
      'All content, software, design, and infrastructure of the ' + PLATFORM_BRAND + ' platform itself is owned by or licensed to ' + OPERATOR_LEGAL_NAME + ' and is protected by Australian and international intellectual-property law. You may not copy, modify, reverse-engineer, scrape, or create derivative works of the platform except as permitted by these terms or by mandatory law.',
    ],
  },

  // ── 10 ── PRIVACY + DATA PROTECTION ────────────────────────────────────
  {
    number: '10',
    title: 'Privacy and data protection',
    body: [
      'Where, in the course of an engagement, you receive personal information of any individual (for example end-users of your systems, employees of your customers, or end-users of the Provider\'s deliverables), you must handle that personal information in accordance with the Privacy Act 1988 (Cth), the Australian Privacy Principles, the General Data Protection Regulation where applicable, and any other privacy or data-protection law relevant to the engagement.',
      'Information you submit through the platform is processed in accordance with our Privacy Policy. You confirm that you have authority to submit any personal information of third parties (for example colleagues, sub-contractors, end-users) that you submit through the platform, and that you have obtained any consents required under applicable law.',
      'You will notify ' + OPERATOR_SHORT + ' without undue delay (and in any event within 72 hours) of any actual or suspected security incident involving platform credentials issued to you, or involving content you have downloaded from the platform that contains personal or confidential information.',
    ],
  },

  // ── 11 ── DISPUTE MEDIATION ───────────────────────────────────────────
  {
    number: '11',
    title: 'Dispute mediation',
    body: [
      'Where you and a Provider cannot resolve a dispute about an engagement (scope, deliverables, payment, conduct) directly, either party may raise a formal dispute through the platform within ten business days of the milestone review deadline.',
      'A ' + OPERATOR_SHORT + ' compliance reviewer will assess submissions and evidence from both sides and issue a determination — for example full payment, full refund, partial split, or remediation required. The determination is binding between you and the Provider as a matter of contract and is enforced by the parties directly, because ' + OPERATOR_SHORT + ' does not hold the engagement funds (see clause 4).',
      'Where a dispute determination requires the Provider to refund or partially refund a payment, the refund is effected directly between the Provider and you, through the same payment rail used for the original payment. The platform records the action but does not execute the transfer. ' + OPERATOR_SHORT + ' has no funds to claw back and is not responsible for executing refunds.',
      'Disputes involving allegations of fraud, illegal activity, or serious professional misconduct may be escalated to relevant regulators or law-enforcement agencies.',
      'Nothing in this clause prevents either party from pursuing legal remedies in a court of competent jurisdiction. Where you are a "consumer" for the purposes of the Australian Consumer Law, your rights under that law against the Provider are unaffected (see clause 13).',
    ],
  },

  // ── 12 ── LIMITATION OF LIABILITY ─────────────────────────────────────
  {
    number: '12',
    title: 'Limitation of liability',
    body: [
      'Subject to clause 13 (Australian Consumer Law), ' + OPERATOR_SHORT + '\'s aggregate liability to you under or in connection with this Agreement — whether in contract, tort (including negligence), under statute, or otherwise — is capped at the total subscription fees you have actually paid to ' + OPERATOR_SHORT + ' in the 12 months immediately preceding the act, omission, or event giving rise to the claim. For Customers on the Free Starter tier, the cap is AUD 100.',
      'To the maximum extent permitted by law, ' + OPERATOR_SHORT + ' is not liable for:',
      '(a) any act, omission, default, breach, insolvency, or non-performance by any Provider or by any of a Provider\'s personnel, sub-contractors, or agents;',
      '(b) the quality, fitness for purpose, timeliness, completeness, or commercial outcome of any service supplied by any Provider;',
      '(c) any indirect, consequential, special, exemplary, or punitive loss — including loss of profit, loss of revenue, loss of business, loss of goodwill, loss of opportunity, or loss or corruption of data — whether or not we have been advised of the possibility of such loss;',
      '(d) any delay, error, loss, interruption, or outage caused by a third-party payment rail, banking system, telecommunications provider, cloud-service outage, or other circumstance beyond our reasonable control; or',
      '(e) any reliance you place on third-party data the platform surfaces (ABR lookups, public registers, AML/sanctions lists, currency rates, AI-generated scope drafts) — the data is provided as-is from its source, and AI-generated scopes are starting points for your review, not professional advice.',
      'Nothing in this clause excludes or limits any liability that cannot be excluded under the Australian Consumer Law or other applicable mandatory law (see clause 13).',
    ],
  },

  // ── 13 ── AUSTRALIAN CONSUMER LAW ─────────────────────────────────────
  {
    number: '13',
    title: 'Australian Consumer Law',
    body: [
      'Nothing in this Agreement excludes, restricts, or modifies any guarantee, condition, warranty, right, or remedy implied by the Australian Consumer Law (Schedule 2 of the Competition and Consumer Act 2010 (Cth), the "ACL") or by any other law that cannot be excluded.',
      'Where ' + OPERATOR_SHORT + ' supplies you with a service (for example, access to the platform under a paid subscription) and that service fails to meet a consumer guarantee under the ACL, you are entitled to the remedies provided by that law. Where permitted, ' + OPERATOR_SHORT + '\'s liability for failure to comply with a consumer guarantee in relation to services that are not of a kind ordinarily acquired for personal, domestic, or household use is limited, at our option, to:',
      '(a) the re-supply of the services; or',
      '(b) payment of the cost of having the services re-supplied.',
      'Where you are a "consumer" within the meaning of section 3 of the ACL in respect of services supplied to you by a Provider through the platform, the consumer guarantees in Part 3-2 Division 1 of the ACL apply to those services. Those guarantees are owed by the Provider as supplier of the services. The Provider is liable to you for breach of those guarantees in the usual way — ' + OPERATOR_SHORT + ' is not the supplier of the services and is not liable for the Provider\'s breach (see clause 3).',
    ],
  },

  // ── 14 ── YOUR INDEMNITY ──────────────────────────────────────────────
  {
    number: '14',
    title: 'Your indemnity to ' + OPERATOR_SHORT,
    body: [
      'You indemnify and hold harmless ' + OPERATOR_LEGAL_NAME + ', its related bodies corporate, and its officers, directors, employees, contractors, and agents against any claim, demand, action, proceeding, loss, damage, cost, or expense (including reasonable legal costs on a solicitor-and-own-client basis) arising out of or in connection with:',
      '(a) your breach of this Agreement, of the Privacy Policy, or of any law;',
      '(b) any inaccurate, misleading, infringing, or unlawful information or content you submit to the platform;',
      '(c) any engagement you enter into through the platform, including any dispute, claim, or chargeback between you and a Provider;',
      '(d) any third-party claim arising from your use of services supplied to you by a Provider; or',
      '(e) any breach by you of the representations and warranties in clause 7 or of the confidentiality and data-protection obligations in clauses 8 and 10.',
      'The indemnity does not apply to the extent the claim arises from ' + OPERATOR_SHORT + '\'s own negligence, wilful misconduct, or material breach of this Agreement.',
    ],
  },

  // ── 15 ── SUSPENSION + TERMINATION ────────────────────────────────────
  {
    number: '15',
    title: 'Suspension and termination',
    body: [
      OPERATOR_SHORT + ' may suspend your account immediately on reasonable grounds, including: (a) non-payment of subscription fees; (b) suspected fraud or material breach of this Agreement; (c) an order of a court or regulator; (d) Provider complaints under investigation; or (e) reasonable suspicion of any use prohibited by clause 7. Suspension does not relieve you of obligations under any in-flight engagement.',
      'You may cancel your subscription at any time from the account settings page or by contacting support. Cancellation takes effect at the end of the current paid period. Cancellation of your subscription does not terminate your obligations under any in-flight engagement with a Provider — those obligations continue between you and the Provider directly.',
      OPERATOR_SHORT + ' may terminate this Agreement immediately for: persistent or material breach by you; your insolvency, administration, or external receivership; your conviction of, or admission of, fraud or other dishonesty; or conduct by you that is harmful to other users, to ' + OPERATOR_SHORT + ', or to the integrity of the platform.',
      'Clauses imposing obligations of confidentiality, indemnity, intellectual-property assignment, limitation of liability, dispute mediation, governing law, and any clause that by its nature should survive termination, survive termination of this Agreement.',
    ],
  },

  // ── 16 ── GOVERNING LAW ───────────────────────────────────────────────
  {
    number: '16',
    title: 'Governing law and jurisdiction',
    body: [
      'This Agreement is governed by the laws of Victoria, Australia.',
      'Each party irrevocably submits to the non-exclusive jurisdiction of the courts of Victoria and the Federal Court of Australia. Nothing in this clause prevents either party from seeking urgent injunctive or other equitable relief from any court of competent jurisdiction.',
      'If any provision of this Agreement is found to be unenforceable, the remaining provisions continue in full force and effect.',
    ],
  },

  // ── 17 ── ELECTRONIC ACCEPTANCE ───────────────────────────────────────
  {
    number: '17',
    title: 'Electronic acceptance and variation',
    body: [
      'By checking the acceptance box in the ' + PLATFORM_BRAND + ' platform, by clicking "Accept" on any consent screen presented in the platform, or by otherwise using the platform after notice of this Agreement, you confirm that:',
      '(a) you have read and understood this Agreement;',
      '(b) you have the authority to enter into this Agreement on behalf of your business (if applicable); and',
      '(c) you accept all terms without modification.',
      OPERATOR_SHORT + ' may vary this Agreement by providing 30 days written notice via the email address on your account. Continued use of the platform after the notice period constitutes acceptance of the varied terms.',
      'Your acceptance is recorded with your IP address, user-agent, and timestamp. This record constitutes a valid electronic signature under the Electronic Transactions Act 1999 (Cth).',
    ],
  },

  // ── 18 ── GENERAL ─────────────────────────────────────────────────────
  {
    number: '18',
    title: 'General',
    body: [
      'Notices: notices to ' + OPERATOR_SHORT + ' must be sent to ' + LEGAL_EMAIL + '. Notices to you may be sent to the email address on your account and are taken to be received on the next business day after sending.',
      'Assignment: you may not assign, novate, or otherwise transfer your rights or obligations under this Agreement without ' + OPERATOR_SHORT + '\'s prior written consent. ' + OPERATOR_SHORT + ' may assign this Agreement to a related body corporate or to a successor in connection with a sale of the business or a corporate reorganisation.',
      'Entire agreement: this Agreement, together with the Privacy Policy, the Terms of Service, and the subscription tier you have selected, is the entire agreement between you and ' + OPERATOR_SHORT + ' about its subject matter and supersedes all prior representations and agreements.',
      'No partnership: nothing in this Agreement creates a partnership, joint venture, agency, employment, or fiduciary relationship between you and ' + OPERATOR_SHORT + '.',
      'Waiver: a failure or delay by ' + OPERATOR_SHORT + ' in exercising any right under this Agreement does not operate as a waiver of that right. A waiver of one breach is not a waiver of any other or subsequent breach.',
      'Severability: if any provision of this Agreement is found by a court of competent jurisdiction to be unenforceable, that provision is severed and the remainder continues in full force.',
    ],
  },
];

export default function CustomerAgreementClient() {
  return (
    <PublicPageShell>
      {/* Hero */}
      <section
        className="pt-24 pb-16 px-6 border-b"
        style={{ borderColor: t.sectionBorder }}
      >
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: t.accentText }}>
            Legal Document
          </p>
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-4" style={{ color: t.headlineColor }}>
            Customer Agreement
          </h1>
          <p className="text-base leading-relaxed mb-6" style={{ color: t.bodyColor }}>
            This Agreement governs the relationship between <strong style={{ color: t.headlineColor }}>{OPERATOR_LEGAL_NAME}</strong>
            {' '}and each customer (&quot;Customer&quot;) who uses the {PLATFORM_BRAND} platform to find and engage IT providers.
          </p>
          <div
            className="flex flex-wrap gap-4 text-sm rounded-2xl p-4 border"
            style={{ background: t.cardBg, borderColor: t.cardBorder, color: t.bodyColor }}
          >
            <span><strong style={{ color: t.headlineColor }}>Version:</strong> {AGREEMENT_VERSION}</span>
            <span><strong style={{ color: t.headlineColor }}>Effective:</strong> {EFFECTIVE_DATE}</span>
            <span><strong style={{ color: t.headlineColor }}>Last updated:</strong> {LAST_UPDATED}</span>
            <span><strong style={{ color: t.headlineColor }}>Issuer:</strong> {OPERATOR_LEGAL_NAME} (ABN {OPERATOR_ABN})</span>
            <span><strong style={{ color: t.headlineColor }}>Jurisdiction:</strong> Victoria, Australia</span>
          </div>
          <p className="text-xs mt-4" style={{ color: t.mutedColor }}>
            Key points: {OPERATOR_SHORT} operates the platform and is not the supplier of the IT services you engage Providers
            for (clause 3). You pay Providers directly using the rail they nominate (clause 4). The platform subscription is
            {' '}{OPERATOR_SHORT}&apos;s only revenue. Australian Consumer Law guarantees you have against Providers are
            preserved (clause 13).
          </p>
        </div>
      </section>

      {/* Clauses */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto space-y-10">
          {clauses.map((clause) => (
            <div key={clause.number} id={`clause-${clause.number}`}>
              <h2
                className="text-lg font-display font-bold mb-4 flex items-start gap-3"
                style={{ color: t.headlineColor }}
              >
                <span
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                  style={{ background: t.accentBg, color: t.accentText }}
                >
                  {clause.number}
                </span>
                {clause.title}
              </h2>
              <div className="space-y-3 pl-10">
                {clause.body.map((para, i) => (
                  <p key={i} className="text-sm leading-relaxed" style={{ color: t.bodyColor }}>
                    {para}
                  </p>
                ))}
              </div>
            </div>
          ))}

          {/* Acceptance box */}
          <div
            className="rounded-2xl p-6 border mt-12"
            style={{ background: t.cardBg, borderColor: t.cardBorder }}
          >
            <h3 className="font-display font-bold text-base mb-2" style={{ color: t.headlineColor }}>
              Electronic Acceptance
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: t.bodyColor }}>
              When you create your customer account or click &quot;Accept&quot; on the consent screen presented during onboarding,
              you are entering into a binding legal agreement with {OPERATOR_LEGAL_NAME} on the terms set out above.
              This constitutes an electronic signature under the{' '}
              <em>Electronic Transactions Act 1999</em> (Cth).
            </p>
            <p className="text-xs mt-3" style={{ color: t.mutedColor }}>
              If you do not agree to these terms, do not check the acceptance box and do not use the platform as a customer.
            </p>
          </div>

          {/* Footer note */}
          <div className="text-xs leading-relaxed pt-4 border-t" style={{ borderColor: t.sectionBorder, color: t.mutedColor }}>
            <p>
              <strong style={{ color: t.headlineColor }}>{OPERATOR_LEGAL_NAME}</strong> · ABN {OPERATOR_ABN} · Melbourne, VIC, Australia
            </p>
            <p className="mt-1">
              For legal enquiries: <span style={{ color: t.accentText }}>{LEGAL_EMAIL}</span>
            </p>
            <p className="mt-1">Customer Agreement {AGREEMENT_VERSION} · Effective {EFFECTIVE_DATE} · Last updated {LAST_UPDATED}</p>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}
