'use client';

import PublicPageShell, { theme as t } from '@/components/public/PublicPageShell';

const EFFECTIVE_DATE = '1 March 2026';
const AGREEMENT_VERSION = 'v2.0-2026';

const clauses = [
  {
    number: '1',
    title: 'Platform Terms and Provider Status',
    body: [
      'Waveful Digital Platforms ABN 49 602 081 005 ("Waveful", "we", "us") operates TalvexIT, an online marketplace and workflow platform that connects IT service providers ("you", "your", the "Provider") with customers.',
      'Under this Agreement:',
      '(a) you supply your IT services to customers in your own name, on your own ABN, and on your own commercial terms;',
      '(b) Waveful provides the platform, the matching tools, the proposal and Purchase Order workflow, dispute mediation, and supporting compliance facilities;',
      '(c) Waveful is NOT a party to any service contract between you and a customer. Waveful is NOT a billing agent, not a collection agent, not a payment processor, and does not hold customer or supplier funds at any stage.',
      'You acknowledge that all invoices you issue through the platform are issued by you in your own legal name and registration. Waveful pre-populates PDF templates from the engagement data you and the customer agreed, but you remain the issuing party.',
    ],
  },
  {
    number: '2',
    title: 'Subscription Fees · Zero Commission on Engagements',
    body: [
      'Access to the platform is provided on a subscription basis. You select a subscription tier from those published at /pricing and pay the corresponding monthly or annual fee directly to Waveful through the platform billing system.',
      'Waveful does NOT take a commission, a percentage cut, or any per-engagement fee from amounts paid by your customers to you. The subscription is the only consideration payable to Waveful for use of the platform.',
      'Subscription tiers, included features, and prices may change with 30 days written notice. Continued use after the notice period constitutes acceptance.',
    ],
  },
  {
    number: '3',
    title: 'Payment Direct from Customer to Provider',
    body: [
      'Customers pay you directly using a payment rail you nominate — for example Stripe payment link, Australian bank transfer, PayID, SWIFT, PayPal, Wise, or any custom rail you support. Payment funds flow directly from the customer to your nominated account; they do not pass through Waveful at any stage.',
      'The platform supports the workflow around the payment — customers upload payment evidence (receipt, reference) and you confirm receipt against your invoice through the platform interface. The platform records the transaction state but does not move money.',
      'You are responsible for keeping your nominated payment instructions accurate and for any banking, foreign-exchange, or processor fees levied on transfers to your account. Waveful is not liable for delays, errors, or losses caused by your nominated rail or by banking systems.',
    ],
  },
  {
    number: '4',
    title: 'Tax Invoicing and GST',
    body: [
      'You issue all invoices to customers in your own legal name and registration. Where you are registered for GST in Australia, the document you issue is a Tax Invoice within the meaning of A New Tax System (Goods and Services Tax) Act 1999. Where you are not GST-registered, the document is an Invoice (not a Tax Invoice) and no GST is charged.',
      'The platform classifies engagements (domestic, GST-free export under s38-190, reverse-charge eligible under Division 84, etc.) and pre-populates the PDF accordingly. You are responsible for verifying that the classification is correct for your particular supply before sending or relying on the PDF.',
      'GST collected from a customer is collected by you, not by Waveful. You are responsible for remitting GST to the ATO through your own BAS process.',
      'You declare that the ABN, GST registration, and tax residency information you provide to the platform is accurate, and you will update the platform promptly if any of these change.',
    ],
  },
  {
    number: '5',
    title: 'Withholding for Customers Engaging Providers Without an ABN',
    body: [
      'Where you do not provide a valid ABN, an Australian customer is generally required by law to withhold tax at the top marginal rate (currently 47%) from the amount they pay you. This withholding is a matter directly between the customer and the ATO; Waveful does not collect, hold, or remit the withheld amount.',
      'The platform may surface a withholding-warning notice on invoices and PO PDFs to alert both parties to this obligation. The notice does not constitute tax advice. You and the customer remain responsible for handling the withholding correctly under Australian law.',
      'To avoid the withholding entirely, supply a valid ABN that passes ATO validation, or supply an appropriate supplier-statement or tax-treaty declaration where applicable.',
    ],
  },
  {
    number: '6',
    title: 'Disputes, Chargebacks, and Refunds',
    body: [
      'Disputes between you and a customer arising from an engagement (scope, deliverables, payment evidence) may be raised through the platform\'s structured dispute mediation process. A platform compliance reviewer will assess submissions from both sides and issue a determination — full payment, full refund, partial split, or remediation required. The determination is binding between you and the customer as a matter of this Agreement and the customer\'s acceptance terms.',
      'Because Waveful is not a payment processor and does not hold funds, any refund or partial payment required by a determination is effected directly between you and the customer through the same payment rail used for the original transaction. The platform records the action but does not execute the transfer.',
      'If a customer initiates a chargeback through their bank or card provider, that chargeback proceeds entirely outside the platform and is a matter between you and the customer\'s issuing institution. Waveful has no funds to claw back and is not liable for chargeback losses.',
      'You indemnify Waveful against third-party claims arising from your services.',
    ],
  },
  {
    number: '7',
    title: 'Governing Law and Jurisdiction',
    body: [
      'This Agreement is governed by the laws of New South Wales, Australia.',
      'The parties submit to the exclusive jurisdiction of the courts of New South Wales for resolution of any disputes arising under this Agreement.',
      'Nothing in this clause prevents either party from seeking urgent injunctive relief from any court of competent jurisdiction.',
      'If any provision of this Agreement is found to be unenforceable, the remaining provisions continue in full force.',
    ],
  },
  {
    number: '8',
    title: 'Electronic Acceptance and Variation',
    body: [
      'By checking the acceptance box in the talvex.com.au platform, you confirm that:',
      '(a) you have read and understood this entire Agreement;',
      '(b) you have the authority to enter into this Agreement on behalf of your business (if applicable);',
      '(c) you accept all terms without modification.',
      'Waveful may vary this Agreement by providing 30 days written notice via the email address on your account. Continued use of the platform after the notice period constitutes acceptance of the varied terms.',
      'Your acceptance is recorded with your IP address, user agent, and timestamp. This record constitutes a valid electronic signature under the Electronic Transactions Act 1999 (Cth).',
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
            This Agreement governs the relationship between <strong style={{ color: t.headlineColor }}>Waveful Digital Platforms</strong>{' '}
            and each individual contractor or IT company (&quot;Provider&quot;) who delivers services through the talvex.com.au platform.
          </p>
          <div
            className="flex flex-wrap gap-4 text-sm rounded-2xl p-4 border"
            style={{ background: t.cardBg, borderColor: t.cardBorder, color: t.bodyColor }}
          >
            <span><strong style={{ color: t.headlineColor }}>Version:</strong> {AGREEMENT_VERSION}</span>
            <span><strong style={{ color: t.headlineColor }}>Effective:</strong> {EFFECTIVE_DATE}</span>
            <span><strong style={{ color: t.headlineColor }}>Issuer:</strong> Waveful Digital Platforms (ABN 49 602 081 005)</span>
            <span><strong style={{ color: t.headlineColor }}>Jurisdiction:</strong> New South Wales, Australia</span>
          </div>
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
              you are entering into a binding legal agreement with Waveful Digital Platforms on the terms set out above.
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
              <strong style={{ color: t.headlineColor }}>Waveful Digital Platforms</strong> · ABN 49 602 081 005 · Sydney, NSW, Australia
            </p>
            <p className="mt-1">
              For legal enquiries: <span style={{ color: t.accentText }}>legal@talvex.com.au</span>
            </p>
            <p className="mt-1">Provider Agreement {AGREEMENT_VERSION} · Effective {EFFECTIVE_DATE}</p>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}
