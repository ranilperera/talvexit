// Email addresses default to the talvexIT brand but each can be overridden
// per-deployment via a NEXT_PUBLIC_ env var (which Next.js inlines at build
// time). Use the BRAND.email.* helpers in the UI rather than hard-coding the
// address in a string, so changing the contact in one place updates every
// surface.
const ENV_SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
const ENV_LEGAL_EMAIL = process.env.NEXT_PUBLIC_LEGAL_EMAIL;
const ENV_COMPLIANCE_EMAIL = process.env.NEXT_PUBLIC_COMPLIANCE_EMAIL;

export const BRAND = {
  name:        'TalvexIT',
  tagline:     'Senior IT. Delivered.',
  fullTagline: 'Senior IT expertise marketplace.',
  legalName:   'Waveful Digital Platforms',
  tradingAs:   'TalvexIT',
  domain:      'talvexIT.com',
  email: {
    support:    ENV_SUPPORT_EMAIL    ?? 'support@talvexIT.com.au',
    legal:      ENV_LEGAL_EMAIL      ?? 'legal@talvexIT.com.au',
    compliance: ENV_COMPLIANCE_EMAIL ?? 'compliance@talvexIT.com.au',
  },
  social: {
    linkedin: 'https://linkedin.com/company/talvexIT',
    twitter:  'https://twitter.com/talvexIT',
  },
  colors: {
    primary:     '#1D9E75',
    primaryDark: '#085041',
    dark:        '#0F1117',
    darkPanel:   '#0F1117',
  },
  features: [
    'KYC-verified suppliers only',
    'Formal PO on every engagement',
    'GST-compliant invoicing',
    // Was previously "AML/CTF compliant payments". Removed: the platform
    // doesn't operate as an AUSTRAC reporting entity (no funds held — direct
    // customer-to-supplier payment), and stub AML screening can't substantiate
    // the claim. Replaced with a statement about the actual payment model.
    'Direct customer-to-supplier payment',
  ],
} as const;
