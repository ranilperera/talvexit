export type ThemeKey =
  | 'obsidian'
  | 'corporate-light'
  | 'executive-navy'
  | 'arctic-minimal'
  | 'enterprise-slate';

export interface HomepageTheme {
  key: ThemeKey;
  name: string;

  // Page backgrounds
  pageBg: string;
  heroGlow: string;

  // Navigation
  navBg: string;
  navBgScrolled: string;
  navBorder: string;
  navLinkColor: string;
  navLinkHover: string;

  // Logo
  logoVariant: 'dark' | 'light';

  // Typography
  headlineColor: string;
  headlineAccent: string;
  bodyColor: string;
  mutedColor: string;
  eyebrowColor: string;

  // Accent
  accentBg: string;
  accentText: string;
  accentHover: string;

  // Buttons
  primaryBg: string;
  primaryText: string;
  primaryHover: string;
  secondaryBg: string;
  secondaryText: string;
  secondaryBorder: string;

  // Cards
  cardBg: string;
  cardBorder: string;
  cardHoverBorder: string;

  // Trust chips
  chipBg: string;
  chipText: string;
  chipBorder: string;

  // Section backgrounds
  section1Bg: string;
  section2Bg: string;
  section3Bg: string;
  sectionBorder: string;

  // Stats
  statNumColor: string;
  statLabelColor: string;

  // Footer
  footerBg: string;
  footerBorder: string;
  footerText: string;

  // Optional top accent stripe
  heroTopAccent?: string;

  // Wordmark font
  wordmarkStyle: 'syne' | 'outfit-light' | 'dm-sans';

  // Auth shell (login / register)
  authOuterBg: string;   // full-screen wrapper background
  authLeftBg: string;    // left brand panel
  authRightBg: string;   // right form panel
  authCardBorder: string; // card outer border
}

export const THEMES: Record<ThemeKey, HomepageTheme> = {
  // ── 1. OBSIDIAN ──────────────────────────────────────────────────────────
  obsidian: {
    key: 'obsidian',
    name: 'Obsidian',
    pageBg: '#0F1117',
    heroGlow: 'rgba(0,194,168,0.12)',
    navBg: 'transparent',
    navBgScrolled: 'rgba(15,17,23,0.95)',
    navBorder: '#1E2435',
    navLinkColor: '#8A9BB5',
    navLinkHover: '#ffffff',
    logoVariant: 'dark',
    headlineColor: '#FFFFFF',
    headlineAccent: '#00C2A8',
    bodyColor: '#B8C4D5',
    mutedColor: '#5A6E8C',
    eyebrowColor: '#00C2A8',
    accentBg: '#00C2A8',
    accentText: '#0F1117',
    accentHover: '#1DDBBF',
    primaryBg: '#00C2A8',
    primaryText: '#0F1117',
    primaryHover: '#1DDBBF',
    secondaryBg: 'transparent',
    secondaryText: '#FFFFFF',
    secondaryBorder: '#2A3347',
    cardBg: '#161B27',
    cardBorder: '#1E2435',
    cardHoverBorder: 'rgba(0,194,168,0.3)',
    chipBg: 'rgba(0,194,168,0.12)',
    chipText: '#00C2A8',
    chipBorder: 'rgba(0,194,168,0.25)',
    section1Bg: '#161B27',
    section2Bg: '#0F1117',
    section3Bg: '#12161F',
    sectionBorder: '#1E2435',
    statNumColor: '#FFFFFF',
    statLabelColor: '#5A6E8C',
    footerBg: '#0B0E14',
    footerBorder: '#1E2435',
    footerText: '#5A6E8C',
    wordmarkStyle: 'syne',
    authOuterBg: '#080B12',
    authLeftBg: '#0F1117',
    authRightBg: '#0F1420',
    authCardBorder: '#1E2435',
  },

  // ── 2. CORPORATE LIGHT ───────────────────────────────────────────────────
  'corporate-light': {
    key: 'corporate-light',
    name: 'Corporate Light',
    pageBg: '#F0F4F8',
    heroGlow: 'rgba(0,164,148,0.07)',
    navBg: '#FFFFFF',
    navBgScrolled: 'rgba(255,255,255,0.97)',
    navBorder: '#DDE3EC',
    navLinkColor: '#516078',
    navLinkHover: '#0F1E2E',
    logoVariant: 'light',
    headlineColor: '#0F1E2E',
    headlineAccent: '#0097A7',
    bodyColor: '#485E73',
    mutedColor: '#8FA3B8',
    eyebrowColor: '#007A8C',
    accentBg: '#00A4A0',
    accentText: '#FFFFFF',
    accentHover: '#00BDB9',
    primaryBg: '#00A4A0',
    primaryText: '#FFFFFF',
    primaryHover: '#00BDB9',
    secondaryBg: 'transparent',
    secondaryText: '#0F1E2E',
    secondaryBorder: '#C5D0DC',
    cardBg: '#FFFFFF',
    cardBorder: '#DDE3EC',
    cardHoverBorder: '#00A4A0',
    chipBg: '#E2F4F3',
    chipText: '#00696B',
    chipBorder: '#9DD8D6',
    section1Bg: '#FFFFFF',
    section2Bg: '#F0F4F8',
    section3Bg: '#EBF0F6',
    sectionBorder: '#DDE3EC',
    statNumColor: '#0F1E2E',
    statLabelColor: '#8FA3B8',
    footerBg: '#0F1E2E',
    footerBorder: '#1C2E40',
    footerText: '#607080',
    heroTopAccent: '#00A4A0',
    wordmarkStyle: 'syne',
    authOuterBg: '#E8EDF4',
    authLeftBg: '#0F1E2E',
    authRightBg: '#FFFFFF',
    authCardBorder: '#DDE3EC',
  },

  // ── 3. EXECUTIVE NAVY ────────────────────────────────────────────────────
  'executive-navy': {
    key: 'executive-navy',
    name: 'Executive Navy',
    pageBg: '#0D1F3C',
    heroGlow: 'rgba(201,168,76,0.08)',
    navBg: '#0A1628',
    navBgScrolled: '#0A1628',
    navBorder: '#1E3A5F',
    navLinkColor: '#7EA8C9',
    navLinkHover: '#FFFFFF',
    logoVariant: 'dark',
    headlineColor: '#FFFFFF',
    headlineAccent: '#C9A84C',
    bodyColor: '#7EA8C9',
    mutedColor: '#4A6E8C',
    eyebrowColor: '#C9A84C',
    accentBg: '#C9A84C',
    accentText: '#0A1628',
    accentHover: '#DFC06A',
    primaryBg: '#C9A84C',
    primaryText: '#0A1628',
    primaryHover: '#DFC06A',
    secondaryBg: 'transparent',
    secondaryText: '#7EA8C9',
    secondaryBorder: '#1E3A5F',
    cardBg: '#0E2040',
    cardBorder: '#1E3A5F',
    cardHoverBorder: 'rgba(201,168,76,0.4)',
    chipBg: 'rgba(201,168,76,0.1)',
    chipText: '#C9A84C',
    chipBorder: 'rgba(201,168,76,0.25)',
    section1Bg: '#0A1628',
    section2Bg: '#0D1F3C',
    section3Bg: '#0A1628',
    sectionBorder: '#1E3A5F',
    statNumColor: '#FFFFFF',
    statLabelColor: '#4A6E8C',
    footerBg: '#060E1A',
    footerBorder: '#0A1628',
    footerText: '#4A6E8C',
    heroTopAccent: '#C9A84C',
    wordmarkStyle: 'syne',
    authOuterBg: '#060E1A',
    authLeftBg: '#0A1628',
    authRightBg: '#0D1F3C',
    authCardBorder: '#1E3A5F',
  },

  // ── 4. ARCTIC MINIMAL ────────────────────────────────────────────────────
  'arctic-minimal': {
    key: 'arctic-minimal',
    name: 'Arctic Minimal',
    pageBg: '#FFFFFF',
    heroGlow: 'transparent',
    navBg: '#FFFFFF',
    navBgScrolled: '#FFFFFF',
    navBorder: '#F1F5F9',
    navLinkColor: '#9CA3AF',
    navLinkHover: '#111827',
    logoVariant: 'light',
    headlineColor: '#111827',
    headlineAccent: '#00C2A8',
    bodyColor: '#6B7280',
    mutedColor: '#D1D5DB',
    eyebrowColor: '#00C2A8',
    accentBg: '#111827',
    accentText: '#FFFFFF',
    accentHover: '#374151',
    primaryBg: '#111827',
    primaryText: '#FFFFFF',
    primaryHover: '#374151',
    secondaryBg: '#FFFFFF',
    secondaryText: '#111827',
    secondaryBorder: '#E5E7EB',
    cardBg: '#FFFFFF',
    cardBorder: '#F3F4F6',
    cardHoverBorder: '#00C2A8',
    chipBg: '#F0FDF4',
    chipText: '#166534',
    chipBorder: '#BBF7D0',
    section1Bg: '#F9FAFB',
    section2Bg: '#FFFFFF',
    section3Bg: '#F9FAFB',
    sectionBorder: '#F3F4F6',
    statNumColor: '#111827',
    statLabelColor: '#9CA3AF',
    footerBg: '#111827',
    footerBorder: '#1F2937',
    footerText: '#6B7280',
    heroTopAccent: '#00C2A8',
    wordmarkStyle: 'outfit-light',
    authOuterBg: '#F9FAFB',
    authLeftBg: '#111827',
    authRightBg: '#FFFFFF',
    authCardBorder: '#E5E7EB',
  },

  // ── 5. ENTERPRISE SLATE ──────────────────────────────────────────────────
  'enterprise-slate': {
    key: 'enterprise-slate',
    name: 'Enterprise Slate',
    pageBg: '#0F172A',
    heroGlow: 'rgba(56,189,248,0.08)',
    navBg: '#1E293B',
    navBgScrolled: '#1E293B',
    navBorder: '#334155',
    navLinkColor: '#94A3B8',
    navLinkHover: '#F1F5F9',
    logoVariant: 'dark',
    headlineColor: '#F1F5F9',
    headlineAccent: '#38BDF8',
    bodyColor: '#94A3B8',
    mutedColor: '#475569',
    eyebrowColor: '#38BDF8',
    accentBg: '#38BDF8',
    accentText: '#0C1320',
    accentHover: '#7DD3FC',
    primaryBg: '#38BDF8',
    primaryText: '#0C1320',
    primaryHover: '#7DD3FC',
    secondaryBg: 'transparent',
    secondaryText: '#94A3B8',
    secondaryBorder: '#334155',
    cardBg: '#1E293B',
    cardBorder: '#334155',
    cardHoverBorder: 'rgba(56,189,248,0.4)',
    chipBg: 'rgba(56,189,248,0.1)',
    chipText: '#38BDF8',
    chipBorder: 'rgba(56,189,248,0.25)',
    section1Bg: '#1E293B',
    section2Bg: '#0F172A',
    section3Bg: '#1E293B',
    sectionBorder: '#334155',
    statNumColor: '#F1F5F9',
    statLabelColor: '#475569',
    footerBg: '#020617',
    footerBorder: '#0F172A',
    footerText: '#475569',
    heroTopAccent: '#38BDF8',
    wordmarkStyle: 'syne',
    authOuterBg: '#020617',
    authLeftBg: '#0F172A',
    authRightBg: '#1E293B',
    authCardBorder: '#334155',
  },
};

export function getActiveTheme(): HomepageTheme {
  const key = (process.env.NEXT_PUBLIC_HOMEPAGE_THEME ?? 'corporate-light') as ThemeKey;
  return THEMES[key] ?? THEMES['corporate-light'];
}
