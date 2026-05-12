import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { GLOSSARY, findTermBySlug } from '@/lib/glossary';
import { siteUrl } from '@/lib/site';
import {
  BreadcrumbListJsonLd,
  DefinedTermJsonLd,
} from '@/components/seo/JsonLd';
import { PublicNav } from '@/components/shared/PublicNav';
import { PublicFooter } from '@/components/shared/PublicFooter';

export function generateStaticParams() {
  return GLOSSARY.map((t) => ({ slug: t.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const t = findTermBySlug(params.slug);
  if (!t) return { title: 'Term not found' };
  return {
    title: t.term,
    description: t.definition,
    alternates: { canonical: siteUrl(`/glossary/${t.slug}`) },
  };
}

export default function GlossaryTermPage({ params }: { params: { slug: string } }) {
  const t = findTermBySlug(params.slug);
  if (!t) notFound();
  const url = siteUrl(`/glossary/${t.slug}`);

  return (
    <>
      <BreadcrumbListJsonLd
        items={[
          { name: 'Home', url: siteUrl('/') },
          { name: 'Glossary', url: siteUrl('/glossary') },
          { name: t.term, url },
        ]}
      />
      <DefinedTermJsonLd term={t.term} definition={t.definition} url={url} />

      <div className="min-h-screen flex flex-col bg-slate-950">
        <PublicNav />
        <main className="flex-1 py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <Link
              href="/glossary"
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-teal-300 mb-6 no-underline transition-colors"
            >
              <ArrowLeft size={14} /> Glossary
            </Link>
            <h1 className="font-display font-bold text-3xl md:text-4xl text-slate-100 mb-4 tracking-tight">
              {t.term}
            </h1>
            <p className="text-lg text-slate-300 leading-relaxed mb-6">{t.definition}</p>
            {t.body && (
              <div className="text-base text-slate-400 leading-relaxed mb-10 whitespace-pre-line">
                {t.body}
              </div>
            )}
            {t.related && t.related.length > 0 && (
              <div className="border-t border-slate-800 pt-6 mt-10">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Related terms</p>
                <ul className="space-y-2">
                  {t.related.map((slug) => {
                    const r = findTermBySlug(slug);
                    if (!r) return null;
                    return (
                      <li key={slug}>
                        <Link href={`/glossary/${slug}`} className="text-teal-400 hover:text-teal-300 no-underline">
                          {r.term}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </main>
        <PublicFooter />
      </div>
    </>
  );
}
