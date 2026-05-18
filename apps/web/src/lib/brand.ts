// Brand:        TalvexIT (proper-cased word — always render this exactly).
// Web domain:   talvexit.com (primary live site; we also own talvexit.com.au).
// Email domain: talvexit.com.au (Australian business convention).
//
// DNS is case-insensitive, but lowercase is the convention for domains in
// links and printed copy. Use BRAND.* in the UI rather than hard-coding so
// a rebrand is a one-line edit.
const ENV_SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
const ENV_LEGAL_EMAIL = process.env.NEXT_PUBLIC_LEGAL_EMAIL;
const ENV_COMPLIANCE_EMAIL = process.env.NEXT_PUBLIC_COMPLIANCE_EMAIL;

export const BRAND = {
  name:        'TalvexIT',
  tagline:     'Senior IT. Delivered.',
  fullTagline: 'Senior IT expertise marketplace.',
  legalName:   'Waveful Digital Platforms',
  tradingAs:   'TalvexIT',
  domain:      'talvexit.com',
  email: {
    support:    ENV_SUPPORT_EMAIL    ?? 'support@talvexit.com.au',
    legal:      ENV_LEGAL_EMAIL      ?? 'legal@talvexit.com.au',
    compliance: ENV_COMPLIANCE_EMAIL ?? 'compliance@talvexit.com.au',
  },
  social: {
    linkedin: 'https://linkedin.com/company/talvexit',
    twitter:  'https://twitter.com/talvexit',
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
