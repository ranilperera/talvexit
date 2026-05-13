import type { Metadata } from 'next';
import AboutClient from './AboutClient';
import { ArticleJsonLd, BreadcrumbListJsonLd } from '@/components/seo/JsonLd';
import { siteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'TalvexIT was built to solve a real procurement problem: enterprises need senior L2/L3 IT talent but can\'t vet freelancers fast enough or trust anonymous platforms. We built the infrastructure that enterprise procurement actually requires — verification, fixed-scope contracts, structured proposals, and direct customer-to-supplier invoicing.',
};

export default function AboutPage() {
  return (
    <>
      <BreadcrumbListJsonLd
        items={[
          { name: 'Home', url: siteUrl('/') },
          { name: 'About', url: siteUrl('/about') },
        ]}
      />
      <ArticleJsonLd
        headline="About TalvexIT — operated by Waveful Digital Platforms"
        description="TalvexIT is Australia's enterprise IT specialist marketplace, operated by Waveful Digital Platforms. Built for procurement teams that need senior, verified IT talent on fixed-scope contracts."
        url={siteUrl('/about')}
        dateModified={new Date().toISOString()}
      />
      <AboutClient />
    </>
  );
}
