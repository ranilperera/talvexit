'use client';
import PublicPageShell, { theme as t } from '@/components/public/PublicPageShell';

const EFFECTIVE_DATE = '1 March 2026';
const LAST_UPDATED   = '16 May 2026';
const CONTACT_EMAIL  = 'privacy@talvexit.com';
const SECURITY_EMAIL = 'security@talvexit.com';
const OPERATOR_LEGAL_NAME = 'Waveful Digital Platforms';
const OPERATOR_ABN = '49 602 081 005';
const PLATFORM_BRAND = 'TalvexIT';
const PLATFORM_DOMAIN = 'talvexit.com';

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
  ['#who-we-are', '1. Who we are'],
  ['#information-collected', '2. Information we collect'],
  ['#how-we-use', '3. How we use your information'],
  ['#legal-basis', '4. Legal basis for processing (GDPR)'],
  ['#disclosure', '5. Disclosure to third parties'],
  ['#international', '6. International transfers'],
  ['#retention', '7. Data retention'],
  ['#your-rights', '8. Your rights'],
  ['#cookies', '9. Cookies and tracking'],
  ['#security', '10. Security'],
  ['#children', '11. Children'],
  ['#changes', '12. Changes to this policy'],
  ['#contact', '13. Contact us'],
];

export default function PrivacyClient() {
  return (
    <PublicPageShell>
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
            Legal
          </p>
          <h1 className="font-display font-bold text-4xl mb-3" style={{ color: t.headlineColor }}>
            Privacy Policy
          </h1>
          <p className="text-sm" style={{ color: t.mutedColor }}>
            Effective date: {EFFECTIVE_DATE} · Last updated: {LAST_UPDATED}
          </p>
          <p className="text-sm mt-4" style={{ color: t.bodyColor }}>
            This Privacy Policy explains how {OPERATOR_LEGAL_NAME} (ABN {OPERATOR_ABN}) — referred to in this policy as &ldquo;{OPERATOR_LEGAL_NAME.split(' ')[0]}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo; — collects, uses, stores, and discloses personal information when you use the {PLATFORM_BRAND} platform at{' '}
            <span style={{ color: t.accentBg }}>{PLATFORM_DOMAIN}</span> and related services.
          </p>
          <p className="text-sm mt-3" style={{ color: t.bodyColor }}>
            We are bound by the <strong style={{ color: t.headlineColor }}>Australian Privacy Act 1988</strong> and the 13 Australian Privacy Principles (APPs). For users in the European Economic Area, UK, or Switzerland, this policy also covers our obligations under the <strong style={{ color: t.headlineColor }}>General Data Protection Regulation (GDPR)</strong>.
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

        {/* Sections */}
        <Section id="who-we-are" title="1. Who we are">
          <p>{OPERATOR_LEGAL_NAME} (ABN {OPERATOR_ABN}) is an Australian company that owns and operates the {PLATFORM_BRAND} platform — an online marketplace connecting customers with verified IT engineers and IT consulting companies.</p>
          <p>{OPERATOR_LEGAL_NAME} provides only the technology platform that enables customers and providers to find each other, agree on scope, and exchange documents and messages. Contracts for IT services are formed directly between the customer and the provider — {OPERATOR_LEGAL_NAME.split(' ')[0]} is not a party to those contracts and does not act as a billing or collection agent.</p>
          <p>For privacy enquiries, contact our Privacy Officer at <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: t.accentBg }}>{CONTACT_EMAIL}</a>.</p>
        </Section>

        <Section id="information-collected" title="2. Information we collect">
          <p><strong style={{ color: t.headlineColor }}>Account information:</strong> Name, email address, password (hashed), account type, and profile details provided during registration.</p>
          <p><strong style={{ color: t.headlineColor }}>Identity verification (KYC):</strong> For contractors and company administrators, we collect government-issued identity documents and conduct video identity sessions via LiveKit. Video recordings are stored in Azure Blob Storage and retained for 7 years for compliance purposes.</p>
          <p><strong style={{ color: t.headlineColor }}>Professional credentials:</strong> Certifications, employment history, and specialisations provided during onboarding.</p>
          <p><strong style={{ color: t.headlineColor }}>Insurance certificates:</strong> Public liability and professional indemnity insurance documents uploaded for contractor or company verification.</p>
          <p><strong style={{ color: t.headlineColor }}>Payment information:</strong> We do not store full card numbers. Payment processing is handled by Stripe. We store Stripe customer IDs, payout account references, and transaction records.</p>
          <p><strong style={{ color: t.headlineColor }}>Communications:</strong> Messages sent through the platform, dispute submissions, and support enquiries.</p>
          <p><strong style={{ color: t.headlineColor }}>Usage data:</strong> IP addresses, browser user-agent strings, session activity, and audit log entries generated during platform use.</p>
          <p><strong style={{ color: t.headlineColor }}>Credentials vault:</strong> For contractors who use our secure credential vault feature, encrypted credentials are stored in Azure Key Vault. We do not have access to stored credential values.</p>
        </Section>

        <Section id="how-we-use" title="3. How we use your information">
          <p>We use your personal information to:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Create and manage your account and profile</li>
            <li>Verify your identity and professional credentials</li>
            <li>Facilitate engagements between buyers and service providers</li>
            <li>Process payments and manage escrow</li>
            <li>Generate purchase orders and invoices</li>
            <li>Operate our dispute resolution process</li>
            <li>Send transactional emails (verification, OTP codes, payment confirmations)</li>
            <li>Maintain audit logs for legal and compliance purposes</li>
            <li>Detect and prevent fraud and unauthorised access</li>
            <li>Improve the platform and develop new features</li>
            <li>Comply with our legal obligations under Australian and international law</li>
          </ul>
          <p>We do not sell your personal information to third parties.</p>
        </Section>

        <Section id="legal-basis" title="4. Legal basis for processing (GDPR)">
          <p>For users in the EEA, UK, or Switzerland, we process personal data on the following legal bases:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong style={{ color: t.headlineColor }}>Contract performance:</strong> Processing necessary to provide you with platform services</li>
            <li><strong style={{ color: t.headlineColor }}>Legal obligation:</strong> KYC verification, AML checks, tax record retention</li>
            <li><strong style={{ color: t.headlineColor }}>Legitimate interests:</strong> Fraud prevention, platform security, audit logging</li>
            <li><strong style={{ color: t.headlineColor }}>Consent:</strong> Marketing communications (where applicable)</li>
          </ul>
        </Section>

        <Section id="disclosure" title="5. Disclosure to third parties">
          <p>We share information with the following third-party service providers who are contractually required to protect your data:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong style={{ color: t.headlineColor }}>Stripe:</strong> Payment processing and escrow (United States)</li>
            <li><strong style={{ color: t.headlineColor }}>Microsoft Azure:</strong> Cloud infrastructure, Blob Storage, and Key Vault (Australia East and secondary regions)</li>
            <li><strong style={{ color: t.headlineColor }}>LiveKit:</strong> Video KYC session infrastructure</li>
            <li><strong style={{ color: t.headlineColor }}>Microsoft Graph / Exchange Online:</strong> Transactional email delivery</li>
          </ul>
          <p>We may also disclose information where required by law, court order, or government request, or where necessary to protect the rights, property, or safety of {OPERATOR_LEGAL_NAME}, our users, or others.</p>
        </Section>

        <Section id="international" title="6. International transfers">
          <p>Your data is primarily stored on Microsoft Azure servers in Australia East. Some service providers (including Stripe and LiveKit) process data in the United States. Where personal data is transferred internationally, we ensure adequate protections are in place, including standard contractual clauses where applicable under the GDPR.</p>
        </Section>

        <Section id="retention" title="7. Data retention">
          <p>We retain personal data for as long as necessary to provide our services and comply with our legal obligations:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong style={{ color: t.headlineColor }}>Account data:</strong> Duration of account plus 7 years after closure</li>
            <li><strong style={{ color: t.headlineColor }}>KYC video recordings:</strong> 7 years from session date</li>
            <li><strong style={{ color: t.headlineColor }}>Financial records:</strong> 7 years (Australian tax law requirement)</li>
            <li><strong style={{ color: t.headlineColor }}>Audit logs:</strong> 7 years (append-only, cannot be deleted)</li>
            <li><strong style={{ color: t.headlineColor }}>Credential vault data:</strong> Deleted 48 hours after order completion or on account closure</li>
          </ul>
        </Section>

        <Section id="your-rights" title="8. Your rights">
          <p>Under the Australian Privacy Act and the GDPR (where applicable), you have the right to:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong style={{ color: t.headlineColor }}>Access:</strong> Request a copy of the personal information we hold about you</li>
            <li><strong style={{ color: t.headlineColor }}>Correction:</strong> Request correction of inaccurate information</li>
            <li><strong style={{ color: t.headlineColor }}>Erasure (GDPR):</strong> Request deletion of your data, subject to our legal retention obligations</li>
            <li><strong style={{ color: t.headlineColor }}>Portability (GDPR):</strong> Receive your data in a structured, machine-readable format</li>
            <li><strong style={{ color: t.headlineColor }}>Objection:</strong> Object to processing based on legitimate interests</li>
            <li><strong style={{ color: t.headlineColor }}>Withdraw consent:</strong> Where processing is based on consent</li>
          </ul>
          <p>To exercise your rights, email <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: t.accentBg }}>{CONTACT_EMAIL}</a>. We will respond within 30 days.</p>
          <p>Australian residents may also lodge a complaint with the <a href="https://www.oaic.gov.au" target="_blank" rel="noopener noreferrer" style={{ color: t.accentBg }}>Office of the Australian Information Commissioner (OAIC)</a>. EEA residents may lodge a complaint with their local data protection authority.</p>
        </Section>

        <Section id="cookies" title="9. Cookies and tracking">
          <p>We use only essential cookies and browser localStorage for authentication tokens and theme preferences. We do not use third-party advertising or analytics cookies. No user data is shared with advertising networks.</p>
        </Section>

        <Section id="security" title="10. Security">
          <p>We implement industry-standard security measures including:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>All data encrypted in transit via TLS 1.2+</li>
            <li>Passwords stored as bcrypt hashes (cost factor 12)</li>
            <li>Tokens stored as SHA-256 hashes</li>
            <li>Refresh token rotation with reuse detection</li>
            <li>Multi-factor authentication available for all accounts</li>
            <li>Azure Key Vault for sensitive credential storage</li>
            <li>Role-based access control throughout</li>
          </ul>
          <p>Despite these measures, no internet-based system is completely secure. If you believe your account has been compromised, contact <a href={`mailto:${SECURITY_EMAIL}`} style={{ color: t.accentBg }}>{SECURITY_EMAIL}</a> immediately.</p>
        </Section>

        <Section id="children" title="11. Children">
          <p>Our platform is not directed at children under 18. We do not knowingly collect personal information from anyone under 18. If you believe a minor has created an account, please contact us immediately.</p>
        </Section>

        <Section id="changes" title="12. Changes to this policy">
          <p>We may update this Privacy Policy from time to time. We will notify registered users of material changes via email at least 14 days before the changes take effect. Continued use of the platform after that date constitutes acceptance of the updated policy.</p>
        </Section>

        <Section id="contact" title="13. Contact us">
          <p>
            For privacy enquiries, data access requests, or complaints:<br />
            Email: <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: t.accentBg }}>{CONTACT_EMAIL}</a>
          </p>
          <p>{OPERATOR_LEGAL_NAME} (ABN {OPERATOR_ABN}) · Australia</p>
          <p className="text-xs" style={{ color: t.mutedColor }}>
            {OPERATOR_LEGAL_NAME} is the legal entity that owns and operates the {PLATFORM_BRAND} platform.
          </p>
        </Section>
      </div>
    </PublicPageShell>
  );
}
