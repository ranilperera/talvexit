'use client';

import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { getActiveTheme } from '@/lib/homepage-themes';

const t = getActiveTheme();
const isLight = t.key === 'corporate-light' || t.key === 'arctic-minimal';

// ── Logo ──────────────────────────────────────────────────────────────────────

export function TalvexLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sz = { sm: { mark: 24, font: 15 }, md: { mark: 30, font: 17 }, lg: { mark: 36, font: 20 } }[size];
  return (
    <Link href="/" className="flex items-center gap-2 no-underline">
      <div
        className="flex items-center justify-center flex-shrink-0 rounded-lg"
        style={{ width: sz.mark, height: sz.mark, background: t.primaryBg, borderRadius: 7 }}
      >
        <svg viewBox="0 0 18 18" fill="none" style={{ width: sz.mark * 0.56, height: sz.mark * 0.56 }}>
          <path d="M3 4h12M3 9h8M3 14h10" stroke={t.primaryText} strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <span className="font-display font-bold tracking-tight text-slate-100" style={{ fontSize: sz.font }}>
        talvex<span style={{ color: t.primaryBg }}>IT</span>
      </span>
    </Link>
  );
}

// ── Left brand panel ──────────────────────────────────────────────────────────

function AuthLeftPanel({
  headline,
  subtext,
  children,
}: {
  headline: string;
  subtext: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col justify-between p-10 min-h-[560px]"
      style={{ background: t.authLeftBg }}
    >
      <div>
        <TalvexLogo size="md" />

        <h2 className="text-[26px] font-medium leading-tight tracking-tight text-slate-100 mt-8 mb-3">
          {headline}
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">{subtext}</p>

        {children ?? (
          <div className="flex flex-col gap-2.5">
            {BRAND.features.map((f) => (
              <div
                key={f}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[9px] border"
                style={{ background: 'rgba(255,255,255,.04)', borderColor: 'rgba(255,255,255,.08)' }}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: t.primaryBg }}
                />
                <span className="text-[13px] text-slate-400">{f}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-700 mt-8">
        {BRAND.domain} · Operated by {BRAND.legalName}
      </p>
    </div>
  );
}

// ── AuthShell export ──────────────────────────────────────────────────────────

export default function AuthShell({
  leftHeadline,
  leftSubtext,
  leftContent,
  children,
}: {
  leftHeadline: string;
  leftSubtext: string;
  leftContent?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: t.authOuterBg }}
    >
      <div
        className="w-full max-w-[880px] grid grid-cols-1 lg:grid-cols-2 rounded-2xl overflow-hidden shadow-2xl"
        style={{
          border: `1px solid ${t.authCardBorder}`,
          boxShadow: isLight
            ? '0 8px 40px rgba(0,0,0,0.12)'
            : '0 8px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Left brand panel — hidden on mobile */}
        <div className="hidden lg:block">
          <AuthLeftPanel headline={leftHeadline} subtext={leftSubtext}>
            {leftContent}
          </AuthLeftPanel>
        </div>

        {/* Right — form area */}
        <div
          className="flex flex-col justify-center px-8 py-10 lg:px-10"
          style={{ background: t.authRightBg }}
        >
          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <TalvexLogo size="md" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
