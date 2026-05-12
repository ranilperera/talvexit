// Glossary — short answer-engine-friendly definitions of platform-specific
// and IT-procurement terms. Each entry becomes a /glossary/[slug] page with
// DefinedTerm JSON-LD. Add entries here as the catalogue grows.
//
// Definitions are deliberately one or two short sentences. AI assistants
// extract the first ~50 words as the answer; bury context further down.

export interface GlossaryTerm {
  slug: string;
  term: string;
  definition: string;
  body?: string; // optional longer explanation rendered below the answer
  related?: string[]; // slugs of related terms
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    slug: 'l2-l3-it-engineer',
    term: 'L2 / L3 IT engineer',
    definition:
      'An L2 (Level 2) IT engineer handles complex incidents and configuration changes that L1 service-desk staff escalate. An L3 engineer is a specialist who designs systems, leads major changes, and resolves incidents that L2 engineers escalate. TalvexIT lists only senior consultants at L2/L3 level — typically with 8+ years of hands-on experience.',
    related: ['fixed-scope-engagement', 'kyc-verified-expert'],
  },
  {
    slug: 'fixed-scope-engagement',
    term: 'Fixed-scope engagement',
    definition:
      'An IT services engagement where the scope, deliverables, and price are agreed up front, in writing, before any work begins. Distinct from time-and-materials engagements (no upper limit) and labour-hire arrangements (the customer directs the worker).',
    body:
      'Every TalvexIT engagement is fixed-scope. The scope is captured in a structured proposal with objectives, deliverables, in-scope and out-of-scope items, assumptions, and a milestone breakdown. Once accepted, a Purchase Order is auto-generated.',
    related: ['purchase-order', 'scope-modification'],
  },
  {
    slug: 'kyc-verified-expert',
    term: 'KYC-verified expert',
    definition:
      'A consultant or consulting firm whose identity has been verified through a live video Know-Your-Customer session, with their ABN (for Australian providers), insurance certificates, and contractor agreement reviewed by the platform team. The verified badge is shown on every public profile.',
    related: ['video-kyc', 'l2-l3-it-engineer'],
  },
  {
    slug: 'video-kyc',
    term: 'Video KYC',
    definition:
      'A 10-minute live video session in which a TalvexIT operations team member checks the consultant\'s government ID against a live face capture, confirms registered business details, and asks a few baseline competency questions. Required before a consultant can accept any engagement.',
    related: ['kyc-verified-expert'],
  },
  {
    slug: 'purchase-order',
    term: 'Purchase Order (PO)',
    definition:
      'A document issued by the customer to the consultant on engagement acceptance, containing a unique reference number, the customer\'s billing details, the consultant\'s ABN (where applicable), and the agreed scope and price. Auto-generated as a PDF by TalvexIT for every engagement.',
    related: ['fixed-scope-engagement', 'tax-invoice'],
  },
  {
    slug: 'tax-invoice',
    term: 'Tax invoice',
    definition:
      'An invoice issued by an Australian GST-registered supplier that meets the ATO requirements for the customer to claim a GST input tax credit. The supplier must be registered for GST, and the invoice must include the supplier\'s ABN, the GST amount, and the words "Tax Invoice".',
    body:
      'On TalvexIT, the supplier raises their own tax invoice — the platform pre-populates the PDF from the agreed scope and the supplier\'s registration details, but the supplier remains the issuing party. Tax classification and any cross-border withholding are between the customer and the supplier per their jurisdictions.',
    related: ['purchase-order', 'gst-registration'],
  },
  {
    slug: 'gst-registration',
    term: 'GST registration',
    definition:
      'Registration with the Australian Taxation Office to collect Goods and Services Tax. Mandatory for businesses with annual turnover of $75,000 AUD or more. Registered suppliers add 10% GST to taxable supplies and can claim GST credits on business purchases.',
    related: ['tax-invoice', 'abn'],
  },
  {
    slug: 'abn',
    term: 'ABN (Australian Business Number)',
    definition:
      'An 11-digit identifier issued by the Australian Business Register to every business operating in Australia. TalvexIT verifies every Australian supplier\'s ABN against the ABR and pulls the legal entity name and GST status directly from the verified record.',
    related: ['gst-registration', 'kyc-verified-expert'],
  },
  {
    slug: 'scope-modification',
    term: 'Scope modification (SMR)',
    definition:
      'A formal, in-writing change to a fixed-scope engagement — additional work, removed deliverables, timeline change, or price adjustment. Either party can raise an SMR; the other party reviews and accepts or counters before the change takes effect.',
    related: ['fixed-scope-engagement', 'purchase-order'],
  },
  {
    slug: 'dispute',
    term: 'Dispute (TalvexIT)',
    definition:
      'A formal request to a TalvexIT admin to resolve a disagreement on an engagement. Six grounds exist: deliverables not as scoped, work abandoned, access exceeded, customer withholding approval, scope misrepresentation, data breach. A 72-hour evidence window applies; an independent arbitrator may be appointed for complex cases.',
    related: ['scope-modification', 'fixed-scope-engagement'],
  },
];

export function findTermBySlug(slug: string): GlossaryTerm | undefined {
  return GLOSSARY.find((t) => t.slug === slug);
}
