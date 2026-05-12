'use client';
import PublicPageShell, { theme as t } from '@/components/public/PublicPageShell';

const EFFECTIVE_DATE = '1 March 2026';

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
  ['#description', '2. Platform description'],
  ['#accounts', '3. Accounts and registration'],
  ['#verification', '4. Verification requirements'],
  ['#buyer-terms', '5. Enterprise buyer terms'],
  ['#contractor-terms', '6. Contractor and company terms'],
  ['#payments', '7. Payments, escrow, and fees'],
  ['#ip', '8. Intellectual property'],
  ['#prohibited', '9. Prohibited conduct'],
  ['#disputes', '10. Dispute resolution'],
  ['#disclaimers', '11. Disclaimers'],
  ['#liability', '12. Limitation of liability'],
  ['#indemnification', '13. Indemnification'],
  ['#termination', '14. Termination'],
  ['#governing-law', '15. Governing law'],
  ['#changes', '16. Changes to terms'],
  ['#contact', '17. Contact'],
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
            Effective date: {EFFECTIVE_DATE} · Last updated: {EFFECTIVE_DATE}
          </p>
          <p className="text-sm mt-4" style={{ color: t.bodyColor }}>
            These Terms of Service ("Terms") govern your access to and use of the talvex.com.au platform operated by talvex.com.au Pty Ltd ("talvex.com.au", "Company", "we", "us"). By registering an account or using the platform, you agree to these Terms. If you do not agree, do not use the platform.
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

        <Section id="acceptance" title="1. Acceptance of terms">
          <p>By creating an account, you confirm that you are at least 18 years of age, have legal capacity to enter into binding contracts, and agree to these Terms and our Privacy Policy. If you are registering on behalf of a business, you represent that you have authority to bind that business.</p>
        </Section>

        <Section id="description" title="2. Platform description">
          <p>talvex.com.au is a marketplace platform that connects enterprise buyers ("Buyers") with verified IT engineers ("Contractors") and IT consulting companies ("Companies"). The platform provides tools for scoping requirements, submitting proposals, managing purchase orders, processing escrow payments, and generating invoices.</p>
          <p>talvex.com.au is not a party to engagements between Buyers and Contractors or Companies. We provide the infrastructure — the parties to any engagement are solely responsible for its terms, deliverables, and outcome.</p>
        </Section>

        <Section id="accounts" title="3. Accounts and registration">
          <p>You must provide accurate, current, and complete information during registration. You are responsible for maintaining the security of your account credentials. You must notify us immediately at <a href="mailto:security@talvex.com.au" style={{ color: t.accentBg }}>security@talvex.com.au</a> if you suspect unauthorised access.</p>
          <p>You may not share your account credentials with any other person. Each individual or entity must have their own account.</p>
          <p>We reserve the right to suspend or terminate accounts that provide false information, violate these Terms, or engage in fraudulent activity.</p>
        </Section>

        <Section id="verification" title="4. Verification requirements">
          <p><strong style={{ color: t.headlineColor }}>Contractors:</strong> Individual contractors must complete video KYC identity verification and upload valid professional credentials and insurance certificates before their profiles are published. Verification status may be revoked if documentation expires or proves invalid.</p>
          <p><strong style={{ color: t.headlineColor }}>Companies:</strong> IT companies must provide company registration documents, insurance certificates, and at least one verified administrator. Company verification is reviewed by our team and may take up to 2 business days.</p>
          <p>Providing false, expired, or misleading verification documents is grounds for immediate account termination and may be referred to relevant authorities.</p>
        </Section>

        <Section id="buyer-terms" title="5. Enterprise buyer terms">
          <p>Buyers may post requirements, review proposals, and engage verified Contractors or Companies through the platform. By accepting a proposal, the Buyer enters into a direct engagement with the Contractor or Company subject to the agreed scope, milestones, and pricing.</p>
          <p>Buyers are responsible for providing accurate requirement descriptions, timely feedback on deliverables, and prompt milestone approval or rejection. Funds held in escrow will be released automatically after the buyer's review period expires unless a dispute is raised.</p>
          <p>The review period for each milestone is 5 business days from delivery submission unless otherwise agreed in the engagement scope.</p>
        </Section>

        <Section id="contractor-terms" title="6. Contractor and company terms">
          <p>Contractors and Companies agree to provide services as described in accepted proposals, to the professional standard expected of their stated credentials and specialisations.</p>
          <p>Contractors and Companies must maintain valid insurance for the duration of any active engagement. If insurance lapses, the account is suspended until renewed documentation is uploaded.</p>
          <p>Contractors and Companies must not solicit direct payment from Buyers outside the platform for any engagement initiated through talvex.com.au for a period of 24 months from first contact on the platform.</p>
          <p>All intellectual property created during an engagement belongs to the Buyer unless explicitly stated otherwise in the engagement scope.</p>
        </Section>

        <Section id="payments" title="7. Payments, escrow, and fees">
          <p><strong style={{ color: t.headlineColor }}>Escrow:</strong> When a Buyer accepts a proposal and funds a milestone, the funds are held in escrow via Stripe and released to the Contractor or Company only upon Buyer acceptance of the deliverables, or automatically after the 5-business-day review period.</p>
          <p><strong style={{ color: t.headlineColor }}>Platform fees:</strong> talvex.com.au charges a commission on Contractor and Company earnings per the fee schedule published at <a href="/pricing" style={{ color: t.accentBg }}>/pricing</a>. Fee rates apply per unique client relationship and decrease with cumulative earnings. Fees are non-refundable once earned.</p>
          <p><strong style={{ color: t.headlineColor }}>Refunds:</strong> Buyers may raise a dispute within the 5-business-day review period. Refunds are only issued following our dispute resolution process. Buyer fees are non-refundable.</p>
          <p><strong style={{ color: t.headlineColor }}>Taxes:</strong> Each party is responsible for their own tax obligations. The platform generates invoices that include relevant tax information, but tax compliance remains the responsibility of each user.</p>
        </Section>

        <Section id="ip" title="8. Intellectual property">
          <p>All content, software, and infrastructure of the talvex.com.au platform is owned by or licensed to talvex.com.au Pty Ltd and protected by intellectual property law. You may not copy, modify, reverse-engineer, or create derivative works of the platform.</p>
          <p>By submitting content to the platform (profiles, listings, messages), you grant talvex.com.au a non-exclusive, royalty-free licence to use, store, display, and transmit that content solely for the purpose of operating the platform.</p>
        </Section>

        <Section id="prohibited" title="9. Prohibited conduct">
          <p>You may not use the platform to:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Post false, misleading, or fraudulent information</li>
            <li>Impersonate another person or entity</li>
            <li>Circumvent escrow by arranging off-platform payments for platform-originated engagements</li>
            <li>Upload malware, viruses, or harmful code</li>
            <li>Harass, threaten, or abuse other users</li>
            <li>Scrape or systematically extract platform data</li>
            <li>Violate any applicable law or regulation</li>
            <li>Launder money or facilitate financial crime</li>
          </ul>
          <p>Violations may result in immediate account termination, fund withholding, and referral to law enforcement.</p>
        </Section>

        <Section id="disputes" title="10. Dispute resolution">
          <p>If a Buyer and Contractor or Company cannot resolve a dispute directly, either party may raise a formal dispute through the platform within 10 business days of the milestone review deadline.</p>
          <p>talvex.com.au will review the dispute, may request evidence from both parties, and will issue a decision within 10 business days. Our decision regarding escrow funds is final and binding.</p>
          <p>Disputes involving allegations of fraud, illegal activity, or professional misconduct may be escalated to relevant authorities.</p>
        </Section>

        <Section id="disclaimers" title="11. Disclaimers">
          <p>The platform is provided "as is" and "as available" without warranties of any kind. talvex.com.au does not warrant that the platform will be uninterrupted, error-free, or free from harmful components.</p>
          <p>talvex.com.au is not responsible for the quality, fitness for purpose, or outcome of any engagement between users. Verification of credentials is provided in good faith and does not constitute an endorsement or guarantee of any user's performance.</p>
        </Section>

        <Section id="liability" title="12. Limitation of liability">
          <p>To the maximum extent permitted by Australian law, talvex.com.au's aggregate liability for any claim arising out of or related to these Terms or your use of the platform shall not exceed the total fees paid by you to talvex.com.au in the 12 months preceding the claim.</p>
          <p>talvex.com.au shall not be liable for indirect, incidental, consequential, special, or exemplary damages, including lost profits or data, even if advised of the possibility of such damages.</p>
          <p>Nothing in these Terms limits liability for death or personal injury caused by negligence, fraud, or fraudulent misrepresentation, or any liability that cannot be excluded under Australian consumer law.</p>
        </Section>

        <Section id="indemnification" title="13. Indemnification">
          <p>You agree to indemnify and hold harmless talvex.com.au, its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including reasonable legal fees) arising from your use of the platform, your engagement with other users, or your violation of these Terms.</p>
        </Section>

        <Section id="termination" title="14. Termination">
          <p>You may close your account at any time by contacting <a href="mailto:support@talvex.com.au" style={{ color: t.accentBg }}>support@talvex.com.au</a>. Account closure does not affect obligations under active engagements or outstanding financial matters.</p>
          <p>We may suspend or terminate your account immediately if you breach these Terms, provide false information, or if we determine your use poses a risk to other users or the platform. We will provide notice where reasonably practicable.</p>
          <p>Provisions of these Terms that by their nature should survive termination (payment obligations, IP rights, indemnification, dispute resolution) will do so.</p>
        </Section>

        <Section id="governing-law" title="15. Governing law">
          <p>These Terms are governed by the laws of New South Wales, Australia. Each party irrevocably submits to the non-exclusive jurisdiction of the courts of New South Wales. Nothing limits the right of either party to seek injunctive relief in any court of competent jurisdiction.</p>
          <p>For users in the EEA, nothing in these Terms limits rights under applicable EU consumer protection law.</p>
        </Section>

        <Section id="changes" title="16. Changes to terms">
          <p>We may update these Terms from time to time. We will notify registered users via email at least 14 days before material changes take effect. Continued use of the platform after that date constitutes acceptance of the updated Terms.</p>
        </Section>

        <Section id="contact" title="17. Contact">
          <p>
            For questions about these Terms: <a href="mailto:legal@talvex.com.au" style={{ color: t.accentBg }}>legal@talvex.com.au</a>
          </p>
          <p>talvex.com.au Pty Ltd · Australia</p>
        </Section>
      </div>
    </PublicPageShell>
  );
}
