// JSON-LD components rendered into the document head via the root layout.
// One source of truth — the canonical site URL comes from `lib/site.ts`.
//
// Each component returns a script tag with `type="application/ld+json"`. We
// deliberately do NOT include aggregateRating until there's a real ratings
// pipeline; emitting hardcoded rating values is grounds for a Google manual
// action against the site.

import { SITE_NAME, SITE_URL, siteUrl } from '@/lib/site';
import { IT_DOMAINS } from '@/lib/it-domains';

function ldScript(schema: Record<string, unknown>) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// Organization — describes the entity behind the marketplace. Used by Google
// Knowledge Panel, AI assistants, and other crawlers to attribute the brand.
export function OrganizationJsonLd() {
  return ldScript({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    legalName: 'Onsys Pty Ltd',
    url: SITE_URL,
    logo: siteUrl('/icon.svg'),
    description:
      'TalvexIT is a senior IT expertise marketplace. Customers engage verified ' +
      'L2/L3 IT consultants and consulting firms for fixed-scope projects with ' +
      'formal proposals, auto-generated Purchase Orders, and direct customer-to-' +
      'supplier invoicing.',
    foundingLocation: { '@type': 'Country', name: 'Australia' },
    areaServed: { '@type': 'Place', name: 'Worldwide' },
    knowsAbout: [
      'IT Consulting',
      'Cloud Infrastructure (Azure, AWS, GCP)',
      'Cybersecurity',
      'Network Engineering',
      'DevOps Engineering',
      'Database Administration',
      'Linux Administration',
      'Virtualisation',
      'Identity & Access Management',
      'Enterprise IT Procurement',
    ],
    // Each IT specialisation surfaced as an offered Service. Links to the
    // per-domain landing page once Phase 3 ships those pages — until then,
    // the entries are still useful to AI assistants as a structured list of
    // capabilities even without dedicated URLs.
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'IT specialisations',
      itemListElement: IT_DOMAINS.map((d, i) => ({
        '@type': 'Offer',
        position: i + 1,
        itemOffered: {
          '@type': 'Service',
          name: d.label,
          description: d.blurb,
          serviceType: d.label,
          url: siteUrl(`/services/${d.slug}`),
        },
      })),
    },
    sameAs: [
      'https://www.linkedin.com/company/talvexit',
    ],
  });
}

// WebSite — emits the site name and an optional SearchAction so Google may
// render the search box directly in SERP results when the brand is queried.
export function WebSiteJsonLd() {
  return ldScript({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: 'en-AU',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/tasks?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  });
}

// FAQPage — emits one Question/Answer node per pair. Google AI Overviews,
// ChatGPT browse, Perplexity, and Claude all preferentially extract this.
// Pass an array of { question, answer } in document order.
export function FAQPageJsonLd({ items }: { items: Array<{ question: string; answer: string }> }) {
  return ldScript({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer },
    })),
  });
}

// HowTo — describes a step-by-step procedure. Each step gets a position and
// a description; supply optional name and totalTime where useful. We render
// one HowTo per audience track on /how-it-works.
export interface HowToStep {
  name: string;
  text: string;
}
export function HowToJsonLd({ name, description, steps }: {
  name: string;
  description: string;
  steps: HowToStep[];
}) {
  return ldScript({
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    inLanguage: 'en-AU',
    step: steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  });
}

// BreadcrumbList — pass an array of { name, url } in order from the root.
// The root entry should be the site itself; the last entry is the current
// page. Helps both standard SERP rich results and AEO context.
export function BreadcrumbListJsonLd({ items }: { items: Array<{ name: string; url: string }> }) {
  return ldScript({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  });
}

// Service — describes a single service offering (e.g. "Azure Cloud
// Infrastructure") with the marketplace as the provider. Used on the
// per-specialisation landing pages.
export function ServiceJsonLd({ serviceType, name, description, url }: {
  serviceType: string;
  name: string;
  description: string;
  url: string;
}) {
  return ldScript({
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType,
    name,
    description,
    url,
    areaServed: { '@type': 'Place', name: 'Worldwide' },
    provider: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    audience: { '@type': 'BusinessAudience', name: 'Enterprise IT procurement' },
  });
}

// ItemList — emits a flat list of items, one entry per Service. Used on the
// /services index page so search engines can crawl the full specialisation
// catalogue from one structured-data block.
export function ItemListJsonLd({ items }: { items: Array<{ name: string; url: string }> }) {
  return ldScript({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      url: item.url,
    })),
  });
}

// DefinedTerm — a single dictionary-style entry. AI assistants asked
// "what is X?" can extract this directly. Pair with a parent DefinedTermSet
// on the glossary index page.
export function DefinedTermJsonLd({ term, definition, url }: {
  term: string;
  definition: string;
  url: string;
}) {
  return ldScript({
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: term,
    description: definition,
    url,
    inDefinedTermSet: { '@type': 'DefinedTermSet', name: `${SITE_NAME} Glossary`, url: `${SITE_URL}/glossary` },
  });
}

// Article — emits an Article schema with author/publisher attribution.
// Used on guide / about / how-it-works pages so AI assistants can cite the
// content with proper authorship metadata.
export function ArticleJsonLd({ headline, description, url, datePublished, dateModified }: {
  headline: string;
  description: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
}) {
  return ldScript({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    url,
    inLanguage: 'en-AU',
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Onsys Pty Ltd',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: siteUrl('/icon.svg') },
    },
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    mainEntityOfPage: url,
  });
}

// SoftwareApplication — describes the platform itself as a B2B SaaS offering.
// `offers` reflects the actual subscription model: free to post a requirement,
// supplier subscriptions for the marketplace.
export function SoftwareApplicationJsonLd() {
  return ldScript({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    inLanguage: 'en-AU',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'AUD',
      description:
        'Free for customers to publish a requirement and receive proposals. ' +
        'Suppliers pay a monthly or annual subscription. There is no platform ' +
        'commission on engagements — customers pay suppliers directly.',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Onsys Pty Ltd',
      url: SITE_URL,
    },
  });
}
