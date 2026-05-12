import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Shield, FileText, Receipt, Globe } from 'lucide-react';
import { findDomainBySlug, IT_DOMAINS } from '@/lib/it-domains';
import { siteUrl } from '@/lib/site';
import { ServiceJsonLd, BreadcrumbListJsonLd } from '@/components/seo/JsonLd';
import { PublicNav } from '@/components/shared/PublicNav';
import { PublicFooter } from '@/components/shared/PublicFooter';

// Per-specialisation landing pages — one per IT domain (28 total). Static
// at build time via generateStaticParams. Each page emits Service +
// BreadcrumbList JSON-LD pointing back to the canonical URL, and shares
// internal links to /services (the catalogue), /how-it-works, and
// /register so search engines see a connected site graph.

export function generateStaticParams() {
  return IT_DOMAINS.map((d) => ({ slug: d.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const d = findDomainBySlug(params.slug);
  if (!d) return { title: 'Specialisation not found' };
  const url = siteUrl(`/services/${d.slug}`);
  return {
    title: `${d.label} consultants`,
    description: `${d.blurb} Engage verified senior ${d.label} consultants on fixed-scope contracts via TalvexIT — formal proposals, auto-generated Purchase Orders, and direct customer-to-supplier invoicing.`,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: `${d.label} consultants — TalvexIT`,
      description: d.blurb,
    },
  };
}

export default function SpecialisationPage({ params }: { params: { slug: string } }) {
  const d = findDomainBySlug(params.slug);
  if (!d) notFound();

  const url = siteUrl(`/services/${d.slug}`);

  // Pull a few related domains to encourage internal linking. Same-tier
  // siblings make the most sense — visitors browsing "Cloud Infrastructure"
  // probably also want "DevOps" and "Linux" in the same neighbourhood.
  const related = IT_DOMAINS
    .filter((other) => other.tier === d.tier && other.slug !== d.slug)
    .slice(0, 6);

  return (
    <>
      <BreadcrumbListJsonLd
        items={[
          { name: 'Home', url: siteUrl('/') },
          { name: 'Services', url: siteUrl('/services') },
          { name: d.label, url },
        ]}
      />
      <ServiceJsonLd
        serviceType={d.label}
        name={`${d.label} consulting`}
        description={d.blurb}
        url={url}
      />

      <div className="min-h-screen flex flex-col bg-slate-950">
        <PublicNav />

        <main className="flex-1">
          {/* Hero */}
          <section className="border-b border-slate-800 bg-slate-900/40">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3 text-teal-400">
                IT specialisation · Tier {d.tier}
              </p>
              <h1 className="font-display font-bold text-4xl md:text-5xl text-slate-100 mb-4 tracking-tight">
                {d.label} consultants — engaged on fixed-scope contracts.
              </h1>
              <p className="text-lg text-slate-400 max-w-3xl leading-relaxed">{d.blurb}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={`/customer/scope?domain=${d.key}`}
                  className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-sm px-6 py-3 rounded-xl no-underline transition-colors"
                >
                  Scope a {d.label.toLowerCase()} requirement
                  <ArrowRight size={14} />
                </Link>
                <Link
                  href={`/services?domain=${d.key}`}
                  className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm px-6 py-3 rounded-xl border border-slate-700 no-underline transition-colors"
                >
                  Browse {d.label.toLowerCase()} listings
                </Link>
              </div>
            </div>
          </section>

          {/* What you get on every engagement */}
          <section className="py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
              <h2 className="font-display font-bold text-2xl text-slate-100 mb-3">
                What every {d.label} engagement on TalvexIT looks like
              </h2>
              <p className="text-slate-400 mb-8 max-w-3xl leading-relaxed">
                Same workflow regardless of specialisation — verified consultant, fixed scope, formal Purchase Order, direct customer-to-supplier invoicing.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { icon: Shield, title: 'Verified senior consultant', desc: `KYC video, ABN check (Australian providers), insurance review, contractor agreement — before any ${d.label.toLowerCase()} work begins.` },
                  { icon: FileText, title: 'Fixed-scope proposal', desc: 'Refined deliverables, milestones, timeline, T&Cs, and price agreed up front. Lock the scope before any commitment.' },
                  { icon: Receipt, title: 'Direct invoicing', desc: 'The provider raises a tax invoice in their name and ABN; you pay them directly. The platform records the engagement but never holds funds.' },
                  { icon: Globe, title: 'Worldwide expertise', desc: 'Specialists across Australia, SE Asia, South Asia, Europe, and the Americas. Multi-currency quoting (AUD, USD, GBP, EUR, NZD, SGD, CAD).' },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                    <Icon size={18} className="text-teal-400 mb-3" />
                    <h3 className="font-semibold text-slate-100 mb-1">{title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Related specialisations */}
          {related.length > 0 && (
            <section className="border-t border-slate-800 bg-slate-900/40 py-16 px-4 sm:px-6 lg:px-8">
              <div className="max-w-5xl mx-auto">
                <h2 className="font-display font-bold text-2xl text-slate-100 mb-2">
                  Related specialisations
                </h2>
                <p className="text-sm text-slate-500 mb-6">Engagements often span more than one — engage one consultant, or stitch together a small team.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {related.map((r) => (
                    <Link
                      key={r.slug}
                      href={`/services/${r.slug}`}
                      className="rounded-xl border border-slate-800 bg-slate-900 hover:border-slate-600 p-4 no-underline group transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 size={12} className="text-teal-400 shrink-0" />
                        <p className="font-semibold text-sm text-slate-200 group-hover:text-teal-300 transition-colors">{r.label}</p>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{r.blurb}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* CTA band */}
          <section className="py-16 px-4 sm:px-6 lg:px-8 text-center border-t border-slate-800">
            <div className="max-w-2xl mx-auto">
              <h2 className="font-display font-bold text-2xl text-slate-100 mb-3">
                Ready to engage a {d.label.toLowerCase()} consultant?
              </h2>
              <p className="text-sm text-slate-400 mb-6">Two minutes from plain-English requirement to formal proposals from verified consultants.</p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/register?role=customer" className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-sm px-6 py-3 rounded-xl no-underline transition-colors">
                  Create a free customer account
                </Link>
                <Link href="/how-it-works" className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm px-6 py-3 rounded-xl border border-slate-700 no-underline transition-colors">
                  See how it works
                </Link>
              </div>
            </div>
          </section>
        </main>

        <PublicFooter />
      </div>
    </>
  );
}
