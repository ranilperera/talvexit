import type { Metadata } from 'next';
import Link from 'next/link';
import { GLOSSARY } from '@/lib/glossary';
import { siteUrl } from '@/lib/site';
import { BreadcrumbListJsonLd, ItemListJsonLd } from '@/components/seo/JsonLd';
import { PublicNav } from '@/components/shared/PublicNav';
import { PublicFooter } from '@/components/shared/PublicFooter';

export const metadata: Metadata = {
  title: 'Glossary',
  description:
    'Plain-English definitions of TalvexIT and IT-procurement terms — L2/L3 IT engineer, fixed-scope engagement, KYC verification, video KYC, Purchase Order, tax invoice, GST registration, ABN, scope modification, and dispute.',
  alternates: { canonical: siteUrl('/glossary') },
};

export default function GlossaryIndexPage() {
  const items = GLOSSARY.map((t) => ({ name: t.term, url: siteUrl(`/glossary/${t.slug}`) }));
  return (
    <>
      <BreadcrumbListJsonLd
        items={[
          { name: 'Home', url: siteUrl('/') },
          { name: 'Glossary', url: siteUrl('/glossary') },
        ]}
      />
      <ItemListJsonLd items={items} />

      <div className="min-h-screen flex flex-col bg-slate-950">
        <PublicNav />
        <main className="flex-1 py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3 text-teal-400">Reference</p>
            <h1 className="font-display font-bold text-4xl md:text-5xl text-slate-100 mb-4 tracking-tight">
              Glossary
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed mb-10 max-w-2xl">
              Plain-English definitions of the terms you&apos;ll see on TalvexIT — IT-procurement language, Australian tax terms, and the bespoke labels we use for our workflow.
            </p>
            <ul className="divide-y divide-slate-800">
              {GLOSSARY.map((t) => (
                <li key={t.slug} className="py-5">
                  <Link href={`/glossary/${t.slug}`} className="block group no-underline">
                    <h2 className="text-lg font-semibold text-slate-100 group-hover:text-teal-300 transition-colors mb-1">
                      {t.term}
                    </h2>
                    <p className="text-sm text-slate-400 leading-relaxed line-clamp-3">{t.definition}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </main>
        <PublicFooter />
      </div>
    </>
  );
}
