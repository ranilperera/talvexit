'use client';

import PublicPageShell, { theme as t } from '@/components/public/PublicPageShell';

const EFFECTIVE_DATE      = '1 March 2026';
const LAST_UPDATED        = '16 May 2026';
const AGREEMENT_VERSION   = 'v2.1-2026';
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
    title: 'Platform terms and Provider status',
    body: [
      `${OPERATOR_LEGAL_NAME} ABN ${OPERATOR_ABN} ("${OPERATOR_SHORT}", "we", "us") operates ${PLATFORM_BRAND} at ${PLATFORM_DOMAIN} — an online marketplace and workflow platform that connects IT service providers ("you", "your", the "Provider") with customers seeking IT services ("Customers").`,
      'Under this Agreement:',
      '(a) you supply your IT services to Customers in your own name, on your own ABN, and on your own commercial terms;',
      `(b) ${OPERATOR_SHORT} provides the technology platform, the matching tools, the proposal and Purchase Order workflow, dispute mediation, and supporting compliance facilities;`,
      `(c) ${OPERATOR_SHORT} is NOT a party to any service contract between you and a Customer. ${OPERATOR_SHORT} is NOT a billing agent, not a collection agent, not a payment processor, and does not hold customer or provider funds at any stage.`,
      `You acknowledge that all invoices you issue through the platform are issued by you in your own legal name and registration. ${OPERATOR_SHORT} pre-populates PDF templates from the engagement data you and the Customer agreed, but you remain the issuing party.`,
    ],
  },

  // ── 2 ──────────────────────────────────────────────────────────────────
  {
    number: '2',
    title: 'Subscription fees · zero commission on engagements',
    body: [
      'Access to the platform is provided on a subscription basis. You select a subscription tier from those published at /pricing and pay the corresponding monthly or annual fee directly to ' + OPERATOR_SHORT + ' through the platform billing system.',
      OPERATOR_SHORT + ' does NOT take a commission, a percentage cut, or any per-engagement fee from amounts paid by your Customers to you. The subscription is the only consideration payable to ' + OPERATOR_SHORT + ' for use of the platform.',
      'Subscription fees are payable in advance, are non-refundable except where required by law (including failure of a consumer guarantee under the Australian Consumer Law), and remain payable regardless of whether you receive payment from your Customers.',
      'Subscription tiers, included features, and prices may change with 30 days written notice. Continued use after the notice period constitutes acceptance.',
    ],
  },

  // ── 3 ── PROVIDER'S SERVICES — WAVEFUL IS NOT THE SUPPLIER ────────────
  {
    number: '3',
    title: 'Provider’s services — supplied by you, not by ' + OPERATOR_SHORT,
    body: [
      'Every engagement that begins on the platform results in a separate service contract between you and the Customer. You are the supplier of those IT services. ' + OPERATOR_SHORT + ' is not a sub-contractor, agent, employee, or representative of either party.',
      OPERATOR_SHORT + ' makes no warranty, representation, or undertaking as to the quality, fitness for purpose, timeliness, professional standard, or commercial outcome of any service you provide. The Customer’s contractual remedy for any defect, delay, professional negligence, intellectual property infringement, breach of confidence, data loss, security incident, or other failure in your services is against you directly under the contract between you and the Customer.',
      'To the maximum extent permitted by law, you release ' + OPERATOR_SHORT + ' from, and waive, any claim against ' + OPERATOR_SHORT + ' relating to: (a) your services; (b) any act, omission, or default of you or your personnel, sub-contractors, or agents; (c) any dispute, complaint, or claim by a Customer arising from your services; or (d) the commercial outcome of any engagement.',
      'You will not represent to any Customer or third party that ' + OPERATOR_SHORT + ' is responsible for, guarantees, endorses, or warrants the quality of your services. Where a Customer asks who is contractually responsible for the services, you must answer that you are the supplier and that the contract is directly with you.',
    ],
  },

  // ── 4 ──────────────────────────────────────────────────────────────────
  {
    number: '4',
    title: 'Payment direct from Customer to Provider',
    body: [
      'Customers pay you directly using a payment rail you nominate — for example Stripe payment link, Australian bank transfer, PayID, SWIFT, PayPal, Wise, or any other custom rail you support. Payment funds flow directly from the Customer to your nominated account; they do not pass through ' + OPERATOR_SHORT + ' at any stage.',
      'The platform supports the workflow around the payment — Customers may upload payment evidence (receipt, reference number) and you confirm receipt against your invoice through the platform interface. The platform records the transaction state but does not move money.',
      'You are responsible for keeping your nominated payment instructions accurate and for any banking, foreign-exchange, or processor fees levied on transfers to your account. ' + OPERATOR_SHORT + ' is not liable for delays, errors, or losses caused by your nominated rail, by banking systems, or by your failure to keep your payment instructions current.',
    ],
  },

  // ── 5 ── CUSTOMER NON-PAYMENT — PROVIDER'S COLLECTION RESPONSIBILITY ──
  {
    number: '5',
    title: 'Customer non-payment is your collection matter',
    body: [
      'Because the platform does not collect or remit funds for engagements, a Customer’s failure to pay an invoice in full or on time is a matter between you and that Customer. You are solely responsible for collection.',
      'In particular, you are responsible for: (a) any credit assessment of the Customer before commencing work; (b) issuing valid Tax Invoices with clear payment terms; (c) all collection action you choose to take, including demand letters, debt-collection agencies, mediation, and litigation; and (d) writing off any amount you are unable to recover.',
      'On request and at its discretion, ' + OPERATOR_SHORT + ' may provide a copy of the platform-recorded engagement evidence (Purchase Order, scope acceptance, milestone acceptance, payment-evidence records, message threads) to support your collection efforts. Those records evidence platform workflow state only and do not constitute an admission or judgment of Customer liability.',
      OPERATOR_SHORT + ' is not liable to you for any non-payment, partial payment, late payment, chargeback, refund, write-off, currency conversion shortfall, or other recovery loss by a Customer. The platform subscription fee remains payable to ' + OPERATOR_SHORT + ' regardless of whether you are paid by any Customer.',
    ],
  },

  // ── 6 ──────────────────────────────────────────────────────────────────
  {
    number: '6',
    title: 'Tax invoicing and GST',
    body: [
      'You issue all invoices to Customers in your own legal name and registration. Where you are registered for GST in Australia, the document you issue is a Tax Invoice within the meaning of the A New Tax System (Goods and Services Tax) Act 1999 (Cth). Where you are not GST-registered, the document is an Invoice (not a Tax Invoice) and no GST is charged.',
      'The platform classifies engagements (domestic, GST-free export under s38-190, reverse-charge eligible under Division 84, etc.) and pre-populates the PDF accordingly. You are responsible for verifying that the classification is correct for your particular supply before sending or relying on the PDF.',
      'GST collected from a Customer is collected by you, not by ' + OPERATOR_SHORT + '. You are responsible for remitting GST to the ATO through your own BAS process.',
      'You declare that the ABN, GST registration, and tax-residency information you provide to the platform is accurate, and you will update the platform promptly if any of these change.',
    ],
  },

  // ── 7 ──────────────────────────────────────────────────────────────────
  {
    number: '7',
    title: 'Withholding for Customers engaging Providers without an ABN',
    body: [
      'Where you do not provide a valid ABN, an Australian Customer is generally required by the Taxation Administration Act 1953 (Cth) to withhold tax at the top marginal rate (currently 47%) from the amount they pay you. This withholding is a matter directly between the Customer and the ATO; ' + OPERATOR_SHORT + ' does not collect, hold, or remit the withheld amount.',
      'The platform may surface a withholding-warning notice on invoices and PO PDFs to alert both parties to this obligation. The notice does not constitute tax advice. You and the Customer remain responsible for handling the withholding correctly under Australian law.',
      'To avoid the withholding entirely, supply a valid ABN that passes ATO validation, or supply an appropriate supplier statement or tax-treaty declaration where applicable.',
    ],
  },

  // ── 8 ── PROVIDER'S WARRANTIES ────────────────────────────────────────
  {
    number: '8',
    title: 'Your representations and warranties',
    body: [
      'Each time you offer or perform services through the platform, you represent and warrant that:',
      '(a) you have the right, capacity, and authority to provide the services and to enter into the engagement with the Customer;',
      '(b) you hold all licences, registrations, certifications, insurance, and accreditations required to supply the services lawfully in every jurisdiction relevant to the engagement;',
      '(c) the credentials, ABN, GST registration, insurance certificates, identification documents, and other information you submit to the platform are accurate, current, and not misleading, and you will update them promptly if they change;',
      '(d) the services will be provided with due care, skill, and professional competence appropriate to the credentials and specialisations published on your profile;',
      '(e) the services and any deliverables will not infringe any third party’s intellectual property, contractual, confidentiality, or other rights;',
      '(f) you will comply with all laws applicable to the services, including (without limitation) anti-money-laundering, sanctions, anti-bribery, work-health-and-safety, anti-discrimination, modern-slavery, privacy, and tax laws;',
      '(g) you will not make any representation, warranty, or undertaking on behalf of ' + OPERATOR_SHORT + ' or hold yourself out as the agent, employee, or representative of ' + OPERATOR_SHORT + '; and',
      '(h) the information you submit to the platform is not unlawful, defamatory, infringing, or otherwise objectionable.',
    ],
  },

  // ── 9 ── INSURANCE + CONTINUING VERIFICATION ──────────────────────────
  {
    number: '9',
    title: 'Insurance, identity verification, and continuing eligibility',
    body: [
      'Where your service category requires professional indemnity insurance, public liability insurance, or both (as configured per domain in the platform), you must upload current certificates of currency before engagements are accepted and maintain that insurance for the duration of every engagement and for the warranty period applicable under the engagement scope.',
      'Individual Providers must complete the video identity verification (KYC) process before their profile is visible to Customers. Company Providers must provide company registration documents and at least one verified administrator. Verification may take up to two business days.',
      'The platform periodically revalidates your ABN, insurance documentation, and KYC status. Where a check fails (for example cancelled ABN, expired insurance, lapsed KYC), your account is suspended until you provide updated documentation. Suspension does not relieve you of obligations under active engagements.',
      'Submitting false, expired, or misleading verification documents is grounds for immediate termination of this Agreement and may be referred to relevant regulators or law-enforcement agencies.',
    ],
  },

  // ── 10 ── CONFIDENTIALITY + DATA PROTECTION ───────────────────────────
  {
    number: '10',
    title: 'Confidentiality and data protection',
    body: [
      'You must keep confidential any non-public information you receive through the platform about a Customer, that Customer’s business, that Customer’s end clients, or that Customer’s systems. You may use that information only for the purpose of the engagement and must not disclose it to any third party except with the Customer’s written consent or as required by law.',
      'You must comply with the Privacy Act 1988 (Cth), the Australian Privacy Principles, the General Data Protection Regulation where applicable to personal data you handle, and any other privacy or data-protection law relevant to your engagement.',
      'You must comply with the platform’s Privacy Policy and any data-handling guidance published in the platform. Where the platform provides a credential-vault facility, you may use credentials shared through it only for the engagement and must not retain copies after the engagement ends.',
      'You will notify ' + OPERATOR_SHORT + ' and the affected Customer without undue delay (and in any event within 72 hours) of any actual or suspected security incident or data breach involving Customer data.',
    ],
  },

  // ── 11 ──────────────────────────────────────────────────────────────────
  {
    number: '11',
    title: 'Dispute mediation',
    body: [
      'Disputes between you and a Customer about an engagement (scope, deliverables, payment evidence, conduct) may be raised through the platform’s structured dispute-mediation process. A platform compliance reviewer will assess submissions and evidence from both sides and issue a determination — for example full payment, full refund, partial split, or remediation required.',
      'The determination is binding between you and the Customer as a matter of contract and is enforced by the parties directly, because ' + OPERATOR_SHORT + ' does not hold the engagement funds (see clauses 4 and 5).',
      'If a Customer initiates a chargeback through their bank or card provider, that chargeback proceeds entirely outside the platform and is a matter between you and the Customer’s issuing institution. ' + OPERATOR_SHORT + ' has no funds to claw back and is not liable for chargeback losses.',
      'Disputes involving allegations of fraud, illegal activity, or serious professional misconduct may be escalated to relevant regulators or law-enforcement agencies.',
      'Nothing in this clause prevents either party from pursuing legal remedies in a court of competent jurisdiction.',
    ],
  },

  // ── 12 ── LIMITATION OF LIABILITY ─────────────────────────────────────
  {
    number: '12',
    title: 'Limitation of liability',
    body: [
      'Subject to clause 14 (Australian Consumer Law), ' + OPERATOR_SHORT + '’s aggregate liability to you under or in connection with this Agreement — whether in contract, tort (including negligence), under statute, or otherwise — is capped at the total subscription fees you have actually paid to ' + OPERATOR_SHORT + ' in the 12 months immediately preceding the act, omission, or event giving rise to the claim. For Providers on a free subscription tier, the cap is AUD 100.',
      'To the maximum extent permitted by law, ' + OPERATOR_SHORT + ' is not liable for:',
      '(a) any act, omission, default, breach, insolvency, or non-payment by any Customer;',
      '(b) any act, omission, default, breach, or insolvency by any Provider or by any of your or another Provider’s personnel, sub-contractors, or agents;',
      '(c) any indirect, consequential, special, exemplary, or punitive loss — including loss of profit, loss of revenue, loss of business, loss of goodwill, loss of opportunity, or loss or corruption of data — whether or not we have been advised of the possibility of such loss;',
      '(d) any delay, error, loss, interruption, or outage caused by a third-party payment rail, banking system, telecommunications provider, cloud-service outage, or other circumstance beyond our reasonable control; or',
      '(e) any reliance you place on third-party data the platform surfaces (ABR lookups, public registers, AML/sanctions lists, currency rates) — the data is provided as-is from its source.',
      'Nothing in this clause excludes or limits any liability that cannot be excluded under the Australian Consumer Law or other applicable mandatory law (see clause 14).',
    ],
  },

  // ── 13 ── INDEMNITIES ─────────────────────────────────────────────────
  {
    number: '13',
    title: 'Your indemnity to ' + OPERATOR_SHORT,
    body: [
      'You indemnify and hold harmless ' + OPERATOR_LEGAL_NAME + ', its related bodies corporate, and its officers, directors, employees, contractors, and agents (the "Indemnified Parties") against any claim, demand, action, proceeding, loss, damage, cost, or expense (including reasonable legal costs on a solicitor-and-own-client basis) arising out of or in connection with:',
      '(a) your services or any defect, delay, infringement, breach of confidence, security incident, data loss, or other failure in your services;',
      '(b) any claim made by a Customer or any third party (including a Customer’s end-client) arising out of or relating to your services;',
      '(c) your breach of this Agreement, of the Privacy Policy, or of any law;',
      '(d) your negligent or wilful acts or omissions, or those of your personnel, sub-contractors, or agents; or',
      '(e) any breach by you of the representations and warranties in clause 8 or of the confidentiality and data-protection obligations in clause 10.',
      'The indemnity does not apply to the extent the claim arises from ' + OPERATOR_SHORT + '’s own negligence, wilful misconduct, or material breach of this Agreement.',
    ],
  },

  // ── 14 ── AUSTRALIAN CONSUMER LAW ─────────────────────────────────────
  {
    number: '14',
    title: 'Australian Consumer Law',
    body: [
      'Nothing in this Agreement excludes, restricts, or modifies any guarantee, condition, warranty, right, or remedy implied by the Australian Consumer Law (Schedule 2 of the Competition and Consumer Act 2010 (Cth)) or by any other law that cannot be excluded.',
      'Where a service we supply to you (for example access to the platform under a paid subscription) fails to meet a consumer guarantee under the Australian Consumer Law, you are entitled to the remedies provided by that law. Where permitted, our liability for failure to comply with a consumer guarantee in relation to services that are not of a kind ordinarily acquired for personal, domestic, or household use is limited, at our option, to:',
      '(a) the re-supply of the services; or',
      '(b) payment of the cost of having the services re-supplied.',
      OPERATOR_SHORT + ' is not the supplier of the IT services Customers obtain from you — those services are supplied by you directly. The Australian Consumer Law applies to a Customer’s claim against you in the usual way; that claim is between the Customer and you (see clause 3).',
    ],
  },

  // ── 15 ── SUSPENSION + TERMINATION ────────────────────────────────────
  {
    number: '15',
    title: 'Suspension and termination',
    body: [
      OPERATOR_SHORT + ' may suspend your account immediately on reasonable grounds, including: (a) lapsed insurance, ABN, or KYC; (b) suspected fraud or material breach of this Agreement; (c) an order of a court or regulator; (d) Customer complaints under investigation; or (e) non-payment of subscription fees. Suspension does not relieve you of obligations under any in-flight engagement.',
      'Either party may terminate this Agreement on 30 days’ written notice. You may terminate immediately if ' + OPERATOR_SHORT + ' materially breaches this Agreement and does not cure the breach within 30 days of written notice.',
      OPERATOR_SHORT + ' may terminate this Agreement immediately for: persistent or material breach by you; your insolvency, administration, or external receivership; your conviction of, or admission of, fraud, dishonesty, or professional misconduct; or conduct by you that is harmful to other users, to ' + OPERATOR_SHORT + ', or to the integrity of the platform.',
      'On termination, you must promptly: (a) complete or, with the Customer’s agreement, terminate any in-flight engagement; (b) return or destroy confidential Customer data; and (c) pay any outstanding subscription fees up to the effective date of termination.',
      'Clauses imposing obligations of confidentiality, indemnity, intellectual-property assignment, limitation of liability, dispute mediation, governing law, and any clause that by its nature should survive termination, survive termination of this Agreement.',
    ],
  },

  // ── 16 ──────────────────────────────────────────────────────────────────
  {
    number: '16',
    title: 'Governing law and jurisdiction',
    body: [
      'This Agreement is governed by the laws of Victoria, Australia.',
      'Each party irrevocably submits to the non-exclusive jurisdiction of the courts of Victoria and the Federal Court of Australia. Nothing in this clause prevents either party from seeking urgent injunctive or other equitable relief from any court of competent jurisdiction.',
      'If any provision of this Agreement is found to be unenforceable, the remaining provisions continue in full force and effect.',
    ],
  },

  // ── 17 ──────────────────────────────────────────────────────────────────
  {
    number: '17',
    title: 'Electronic acceptance and variation',
    body: [
      'By checking the acceptance box in the ' + PLATFORM_BRAND + ' platform, you confirm that:',
      '(a) you have read and understood this entire Agreement;',
      '(b) you have the authority to enter into this Agreement on behalf of your business (if applicable);',
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
      'Assignment: you may not assign, novate, or otherwise transfer your rights or obligations under this Agreement without ' + OPERATOR_SHORT + '’s prior written consent. ' + OPERATOR_SHORT + ' may assign this Agreement to a related body corporate or to a successor in connection with a sale of the business or a corporate reorganisation.',
      'Entire agreement: this Agreement, together with the Privacy Policy, the Terms of Service, and the subscription tier you have selected, is the entire agreement between you and ' + OPERATOR_SHORT + ' about its subject matter and supersedes all prior representations and agreements.',
      'No partnership: nothing in this Agreement creates a partnership, joint venture, agency, employment, or fiduciary relationship between you and ' + OPERATOR_SHORT + '.',
      'Waiver: a failure or delay by ' + OPERATOR_SHORT + ' in exercising any right under this Agreement does not operate as a waiver of that right. A waiver of a breach is not a waiver of any other or subsequent breach.',
      'Severability: if any provision of this Agreement is found by a court of competent jurisdiction to be unenforceable, that provision is severed and the remainder continues in full force.',
    ],
  },
];

export default function ProviderAgreementClient() {
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
            Provider Agreement
          </h1>
          <p className="text-base leading-relaxed mb-6" style={{ color: t.bodyColor }}>
            This Agreement governs the relationship between <strong style={{ color: t.headlineColor }}>{OPERATOR_LEGAL_NAME}</strong>
            {' '}and each individual contractor or IT company (&quot;Provider&quot;) who delivers services through the {PLATFORM_BRAND} platform.
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
            Key points: {OPERATOR_SHORT} is the platform operator, not the supplier of your services and not a payment processor.
            You supply services to Customers directly and on your own ABN. {OPERATOR_SHORT}&apos;s only revenue from you is the
            subscription fee. {OPERATOR_SHORT} is not liable for the services you provide or for non-payment by any Customer
            (see clauses 3, 5, and 12).
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
              When you check the &quot;I accept the Provider Agreement&quot; checkbox during onboarding or in your account settings,
              you are entering into a binding legal agreement with {OPERATOR_LEGAL_NAME} on the terms set out above.
              This constitutes an electronic signature under the{' '}
              <em>Electronic Transactions Act 1999</em> (Cth).
            </p>
            <p className="text-xs mt-3" style={{ color: t.mutedColor }}>
              If you do not agree to these terms, do not check the acceptance box and do not use the platform as a provider.
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
            <p className="mt-1">Provider Agreement {AGREEMENT_VERSION} · Effective {EFFECTIVE_DATE} · Last updated {LAST_UPDATED}</p>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}
