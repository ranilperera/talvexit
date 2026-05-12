import type { Metadata } from 'next';
import HowItWorksClient from './HowItWorksClient';
import { ArticleJsonLd } from '@/components/seo/JsonLd';
import { siteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'How It Works',
  description:
    'How TalvexIT connects enterprises with verified L2/L3 IT consultants on fixed-scope contracts. Formal proposals, auto-generated Purchase Orders, and direct customer-to-supplier invoicing — outcomes only, no contractor-management overhead.',
};

export default function HowItWorksPage() {
  return (
    <>
      <ArticleJsonLd
        headline="How TalvexIT works — engaging senior IT consultants on fixed-scope contracts"
        description="Step-by-step guide to TalvexIT's enterprise IT engagement workflow for customers, individual contractors, AU consulting companies, and overseas consulting companies."
        url={siteUrl('/how-it-works')}
        dateModified={new Date().toISOString()}
      />
      <HowItWorksClient />
    </>
  );
}
