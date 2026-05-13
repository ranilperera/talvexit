'use client';

import PublicPageShell, { theme as t } from '@/components/public/PublicPageShell';

const EFFECTIVE_DATE = '1 March 2026';
const AGREEMENT_VERSION = 'v1.0-2026';

const clauses = [
  {
    number: '1',
    title: 'Appointment as Non-Exclusive Billing Agent',
    body: [
      'The Provider ("you", "your") appoints Waveful Digital Platforms ABN TBA ("Waveful", "we", "us") as your non-exclusive commercial and billing agent for the purposes of:',
      '(a) issuing tax invoices, invoices, and commercial invoices to customers on your behalf;',
      '(b) receiving payment from customers in satisfaction of your invoices;',
      '(c) deducting the Waveful Commission (as defined in clause 2); and',
      '(d) remitting net proceeds to you in accordance with clause 3.',
      'This appointment is NON-EXCLUSIVE. You remain free to provide services and issue invoices outside the platform. Waveful does not supply the underlying services. All services are supplied by you, the Provider. Waveful acts solely as billing and collection agent.',
    ],
  },
  {
    number: '2',
    title: 'Commission Schedule',
    body: [
      'In consideration for the platform services provided by Waveful, you agree to pay a commission on each completed order as follows:',
      '• First AUD $10,000 cumulative platform earnings: 20%',
      '• AUD $10,001 – $50,000 cumulative: 15%',
      '• AUD $50,001 – $100,000 cumulative: 10%',
      '• AUD $100,001 – $500,000 cumulative: 7%',
      '• Above AUD $500,000 cumulative: 5%',
      'Commission is calculated on the subtotal excluding GST. Waveful deducts commission before remitting net proceeds. Commission rates are subject to change with 30 days written notice.',
    ],
  },
  {
    number: '3',
    title: 'Payout Timing and Method',
    body: [
      'Waveful will remit net proceeds (invoice total less commission) to you within 3 business days of confirmed payment receipt from the customer, subject to:',
      '(a) no outstanding disputes on the order;',
      '(b) your bank account or Stripe Connect account being correctly configured;',
      '(c) no fraud or AML hold being in place.',
      'Payout methods supported: Australian bank transfer (BSB/Account), and Stripe Connect (international).',
      'Waveful is not liable for delays caused by banking systems, incorrect account details provided by the Provider, or regulatory holds.',
    ],
  },
  {
    number: '4',
    title: 'Tax Declarations and GST',
    body: [
      'You declare that:',
      '(a) all information provided about your ABN, GST registration, and tax residency is accurate and up to date;',
      '(b) you will notify Waveful immediately of any change to your ABN or GST registration status;',
      '(c) where you are GST registered, Waveful will issue Tax Invoices (as defined in A New Tax System (Goods and Services Tax) Act 1999) on your behalf, and GST collected is held and remitted by you or Waveful as agreed;',
      '(d) where you are not GST registered, Waveful will issue Invoices (not Tax Invoices) and no GST will be charged.',
      'Waveful will use reasonable efforts to correctly classify invoices in accordance with Australian tax law, but ultimate compliance responsibility for your tax obligations remains with you.',
    ],
  },
  {
    number: '5',
    title: 'Withholding Tax (No ABN)',
    body: [
      'If you do not provide a valid ABN, Waveful is required by Australian law to withhold tax at the top marginal rate (currently 47%) from payments to you. This withholding is remitted to the ATO on your behalf.',
      'To avoid withholding, you must provide a valid ABN that passes ATO validation. Waveful will not refund amounts already withheld and remitted to the ATO; you must seek recovery directly from the ATO.',
      'Withholding does not apply to foreign providers where a valid supplier statement or appropriate tax treaty declaration is on file.',
    ],
  },
  {
    number: '6',
    title: 'Chargebacks, Disputes, and Reversals',
    body: [
      'If a customer initiates a payment reversal (chargeback) through their bank or card provider, and the reversal is upheld, Waveful may:',
      '(a) reverse or reduce a pending payout by the disputed amount;',
      '(b) recover the disputed amount from a future payout; or',
      '(c) issue a formal demand if no future payouts are available.',
      'Platform disputes (raised through the talvex.com.au dispute resolution process) are resolved separately. If a platform dispute results in a partial or full refund, payouts will be adjusted accordingly.',
      'You indemnify Waveful against third-party claims arising from the services you supply.',
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
            <span><strong style={{ color: t.headlineColor }}>Issuer:</strong> Waveful Digital Platforms (ABN TBA)</span>
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
              <strong style={{ color: t.headlineColor }}>talvex.com.au Pty Ltd</strong> · ABN TBA · Sydney, NSW, Australia
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
