'use client';
import Link from 'next/link';
import PublicPageShell, { theme as t } from '@/components/public/PublicPageShell';
import { Shield, Globe2, FileText, Users, ArrowRight, CheckCircle2 } from 'lucide-react';

const STATS = [
  { num: '50+', label: 'Countries covered' },
  { num: 'L2/L3', label: 'Minimum engineer level' },
  { num: '100%', label: 'KYC-verified engineers' },
  { num: 'A$0', label: 'Cost to post a requirement' },
];

const VALUES = [
  {
    icon: Shield,
    title: 'Verified, not anonymous',
    description: 'Every engineer and company undergoes video identity verification, credential checks, and insurance validation before appearing on the platform. No anonymous profiles.',
  },
  {
    icon: FileText,
    title: 'Enterprise-grade process',
    description: 'Built around the procurement workflows enterprises already use — formal scoping, purchase orders, milestone-based escrow, tax-compliant invoicing, and a full audit trail.',
  },
  {
    icon: Globe2,
    title: 'Global, senior talent only',
    description: 'We focus exclusively on L2/L3 professionals — engineers with real enterprise experience in infrastructure, cloud, networking, security, and DevOps. Not entry-level. Not generalists.',
  },
  {
    icon: Users,
    title: 'Built for both sides',
    description: 'The platform serves enterprise buyers, individual contractors, and IT consulting companies equally. Every role has a structured, purpose-built workflow.',
  },
];

export default function AboutClient() {
  return (
    <PublicPageShell>
      {/* Page metadata lives in the parent server component (about/page.tsx)
          via the metadata export. SEOHead used next/head which is a no-op in
          the App Router. */}
      {/* Hero */}
      <section
        className="pt-16 pb-20 px-6"
        style={{ background: t.section1Bg, borderBottom: `1px solid ${t.sectionBorder}` }}
      >
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: t.eyebrowColor }}>
            About TalvexIT
          </p>
          <h1 className="font-display font-bold text-4xl md:text-5xl mb-8 leading-tight" style={{ color: t.headlineColor }}>
            We built the infrastructure<br />
            that enterprise IT procurement <span style={{ color: t.headlineAccent }}>actually requires.</span>
          </h1>
          <p className="text-lg mb-6 max-w-2xl" style={{ color: t.bodyColor }}>
            The problem was obvious: enterprises needed senior L2/L3 IT talent urgently but had no way to properly vet contractors, generate compliant purchase orders, or maintain an audit trail — without a full procurement department.
          </p>
          <p className="text-lg max-w-2xl" style={{ color: t.bodyColor }}>
            Generic freelance marketplaces offered none of this. Staffing agencies took weeks and charged retainers. We built TalvexIT to fill the gap — structured, verifiable, compliant IT procurement on demand.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-6" style={{ borderBottom: `1px solid ${t.sectionBorder}` }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map(({ num, label }) => (
              <div key={label} className="text-center">
                <p className="font-display font-bold text-4xl mb-2" style={{ color: t.statNumColor }}>{num}</p>
                <p className="text-sm" style={{ color: t.statLabelColor }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why L2/L3 */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
                Why L2/L3
              </p>
              <h2 className="font-display font-bold text-3xl mb-6" style={{ color: t.headlineColor }}>
                Senior engineers solve problems. Junior engineers create them.
              </h2>
              <p className="text-sm leading-relaxed mb-4" style={{ color: t.bodyColor }}>
                L2/L3 is an industry classification for engineers who can own a problem end-to-end — diagnosing root causes, architecting solutions, and delivering without supervision. These are the people enterprises actually need when something critical breaks or a major migration has to happen on schedule.
              </p>
              <p className="text-sm leading-relaxed" style={{ color: t.bodyColor }}>
                Our verification process checks actual credentials — certifications, work history, and technical proficiency — not just self-reported skills. Enterprises deserve to know what they're getting.
              </p>
            </div>
            <div className="space-y-4">
              {[
                'Minimum 5 years in enterprise IT environments',
                'Relevant professional certification required',
                'Video identity + credential verification',
                'Insurance or Professional Indemnity confirmed',
                'Rated and reviewed by real enterprise clients',
                'Account-level dispute resolution available',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 size={16} style={{ color: t.accentBg, flexShrink: 0, marginTop: 2 }} />
                  <p className="text-sm" style={{ color: t.bodyColor }}>{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section
        className="py-16 px-6"
        style={{ background: t.section1Bg, borderTop: `1px solid ${t.sectionBorder}` }}
      >
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display font-bold text-3xl text-center mb-10" style={{ color: t.headlineColor }}>
            What we stand for
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {VALUES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="p-6 rounded-xl"
                style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                  style={{ background: t.chipBg, border: `1px solid ${t.chipBorder}` }}
                >
                  <Icon size={18} style={{ color: t.accentBg }} />
                </div>
                <h3 className="font-semibold font-display mb-2" style={{ color: t.headlineColor }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: t.bodyColor }}>{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display font-bold text-3xl mb-4" style={{ color: t.headlineColor }}>
            Join the platform
          </h2>
          <p className="text-base mb-8" style={{ color: t.bodyColor }}>
            Whether you're an enterprise buyer, a senior engineer, or an IT consulting company — there's a place for you here.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="hp-primary inline-flex items-center justify-center gap-2 font-semibold px-8 py-4 rounded-xl text-base transition-all duration-200"
              style={{ background: t.primaryBg, color: t.primaryText, textDecoration: 'none' }}
            >
              Get Started
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 font-semibold px-8 py-4 rounded-xl text-base"
              style={{
                background: t.secondaryBg,
                color: t.secondaryText,
                border: `1px solid ${t.secondaryBorder}`,
                textDecoration: 'none',
              }}
            >
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}
