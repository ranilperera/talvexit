import type { Metadata } from 'next';
import { Syne, DM_Sans, Outfit } from 'next/font/google';
import './globals.css';
import Providers from './providers';
import { SITE_NAME, SITE_URL, SITE_LOCALE, siteUrl } from '@/lib/site';
import {
  OrganizationJsonLd,
  WebSiteJsonLd,
  SoftwareApplicationJsonLd,
} from '@/components/seo/JsonLd';

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
  weight: ['200', '300', '400'],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: `${SITE_NAME} — Senior IT. Delivered.`,
    template: `%s · ${SITE_NAME}`,
  },

  description:
    'TalvexIT is the senior IT expertise marketplace. Engage KYC-verified ' +
    'L2/L3 IT consultants and consulting firms on fixed-scope contracts. ' +
    'Formal proposals, auto-generated Purchase Orders, and direct customer-' +
    'to-supplier invoicing — outcomes only, no contractor-management overhead.',

  keywords: [
    'IT marketplace',
    'senior IT consultants',
    'L2 L3 engineers',
    'IT consulting Australia',
    'enterprise IT procurement',
    'KYC verified experts',
    'fixed-scope IT engagements',
    'cloud engineers',
    'DevOps consultants',
    'network engineers',
    'cybersecurity consultants',
    'purchase order IT services',
    'GST-compliant IT invoicing',
    'verified IT professionals',
  ],

  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: 'Waveful Digital Platforms',

  alternates: { canonical: SITE_URL },

  openGraph: {
    type: 'website',
    locale: SITE_LOCALE,
    alternateLocale: ['en_US', 'en_GB', 'en_SG'],
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Senior IT. Delivered.`,
    description:
      'Senior IT expertise marketplace. Verified consultants. Fixed-scope contracts. Direct customer-to-supplier invoicing.',
    images: [{ url: siteUrl('/og-image.png'), width: 1200, height: 630, alt: `${SITE_NAME} — Senior IT. Delivered.` }],
  },

  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — Senior IT. Delivered.`,
    description: 'Engage verified L2/L3 IT consultants on fixed-scope contracts. PO + invoicing workflow built in.',
    images: [siteUrl('/og-image.png')],
    creator: '@talvexit',
  },

  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
  },

  applicationName: SITE_NAME,
  category: 'Technology',

  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },

  // Search-console verification tokens. Set via env so they don't sit in
  // source — and so we can swap them per environment (staging vs prod
  // verification can differ). Empty in dev, populated in prod env.
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : {}),
    ...(process.env.BING_SITE_VERIFICATION
      ? { other: { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } }
      : {}),
  },
};

// Inline script to set data-theme before first paint — prevents flash of wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem('onys_theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}else{document.documentElement.setAttribute('data-theme',window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" suppressHydrationWarning className={`${syne.variable} ${dmSans.variable} ${outfit.variable}`}>
      {/* eslint-disable-next-line @next/next/no-before-interactive-script-component */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* JSON-LD: rendered on every page so brand, search, and platform-
            describing structured data is consistent across the whole site. */}
        <OrganizationJsonLd />
        <WebSiteJsonLd />
        <SoftwareApplicationJsonLd />
      </head>
      <body className="antialiased bg-slate-950 text-slate-300">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
