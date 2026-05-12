'use client';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';

interface LogoProps {
  variant?: 'dark' | 'light' | 'auto';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  className?: string;
  wordmarkStyle?: 'syne' | 'outfit-light' | 'dm-sans';
}

const FONT_MAP = {
  syne: '"Syne", sans-serif',
  'outfit-light': 'var(--font-outfit, "Outfit", sans-serif)',
  'dm-sans': 'var(--font-dm-sans, "DM Sans", sans-serif)',
} as const;

export default function Logo({
  variant = 'auto',
  size = 'md',
  href = '/',
  className = '',
  wordmarkStyle = 'syne',
}: LogoProps) {
  const sizes = {
    sm: { mark: 24, font: 16, gap: 7 },
    md: { mark: 32, font: 21, gap: 9 },
    lg: { mark: 44, font: 28, gap: 12 },
  };
  const s = sizes[size];

  const wordmarkColor =
    variant === 'dark' ? '#FFFFFF' : variant === 'light' ? '#0F1117' : 'var(--text-primary, #FFFFFF)';

  const mark = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: s.gap, textDecoration: 'none' }}>
      <svg width={s.mark} height={s.mark} viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="34" height="34" rx="8" fill="#0F1117" />
        <circle cx="12" cy="12" r="3" fill="#00C2A8" />
        <circle cx="24" cy="12" r="3" fill="#00C2A8" opacity="0.5" />
        <circle cx="18" cy="24" r="3" fill="#00C2A8" opacity="0.8" />
        <line x1="12" y1="12" x2="24" y2="12" stroke="#00C2A8" strokeWidth="1" opacity="0.35" />
        <line x1="12" y1="12" x2="18" y2="24" stroke="#00C2A8" strokeWidth="1" opacity="0.35" />
        <line x1="24" y1="12" x2="18" y2="24" stroke="#00C2A8" strokeWidth="1" opacity="0.35" />
      </svg>
      <span
        style={{
          fontFamily: FONT_MAP[wordmarkStyle],
          fontWeight: wordmarkStyle === 'outfit-light' ? 200 : 700,
          fontSize: s.font,
          color: wordmarkColor,
          letterSpacing: wordmarkStyle === 'outfit-light' ? '0.06em' : '-0.02em',
          textTransform: wordmarkStyle === 'outfit-light' ? 'uppercase' : 'none',
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        {BRAND.name}
      </span>
    </span>
  );

  return href ? (
    <Link href={href} className={className} style={{ textDecoration: 'none' }}>
      {mark}
    </Link>
  ) : (
    <span className={className}>{mark}</span>
  );
}
