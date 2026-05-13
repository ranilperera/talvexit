'use client';

import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { getActiveTheme } from '@/lib/homepage-themes';

const t = getActiveTheme();

const NAV = [
  {
    heading: 'Platform',
    links: [
      ['Browse services', '/services'],
      ['Find experts', '/contractors'],
      ['IT companies', '/companies'],
      ['How it works', '/how-it-works'],
    ],
  },
  {
    heading: 'For experts',
    links: [
      ['Join as engineer', '/register?role=contractor'],
      ['Register company', '/register?role=company'],
      ['KYC process', '/how-it-works#kyc'],
      ['Payment FAQ', '/faq#payments'],
    ],
  },
  {
    heading: 'Company',
    links: [
      ['About Talvex', '/about'],
      ['Privacy policy', '/privacy'],
      ['Terms of service', '/terms'],
      ['Contact us', '/contact'],
    ],
  },
] as const;

export function PublicFooter() {
  return (
    <footer className="border-t" style={{ background: t.footerBg, borderColor: t.footerBorder }}>
      <div className="max-w-[1100px] mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-8 h-8 flex items-center justify-center rounded-[7px] flex-shrink-0"
              style={{ background: t.primaryBg }}
            >
              <svg viewBox="0 0 18 18" fill="none" className="w-[16px] h-[16px]">
                <path d="M3 4h12M3 9h8M3 14h10" stroke={t.primaryText} strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-[16px] font-display font-bold text-slate-100 tracking-tight">
              talvex<span style={{ color: t.primaryBg }}>IT</span>
            </span>
          </div>
          <p className="text-[13px] leading-relaxed mb-3" style={{ color: t.footerText }}>
            Senior IT expertise marketplace.<br />
            Verified experts. <br />Enterprise procurement.<br />
            Built-in PO <br /> Invoicing &amp; compliance.
          </p>
        </div>
        {NAV.map(({ heading, links }) => (
          <div key={heading}>
            <h4 className="text-[11px] font-medium uppercase tracking-widest mb-3" style={{ color: '#607080' }}>
              {heading}
            </h4>
            {links.map(([label, href]) => (
              <Link
                key={label}
                href={href}
                className="block text-[13px] py-1 no-underline transition-colors hp-footer-link"
                style={{ color: t.footerText }}
              >
                {label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div
        className="border-t px-6 py-4 max-w-[1100px] mx-auto flex items-center justify-between text-[12px]"
        style={{ borderColor: t.footerBorder, color: `${t.footerText}80` }}
      >
        <span>
          © {new Date().getFullYear()} TalvexIT. All rights reserved.
          <p className="text-[11px]" style={{ color: `${t.footerText}80` }}>
            Operated by {BRAND.legalName}. ABN 49 602 081 005 · GST registered in Australia.
          </p>
        </span>
        <span>Verified IT Experts. Enterprise procurement.</span>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `.hp-footer-link:hover { color: #cbd5e1 !important; }` }} />
    </footer>
  );
}
