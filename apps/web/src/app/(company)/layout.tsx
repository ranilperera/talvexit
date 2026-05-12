import type { Metadata } from 'next';
import CompanyLayoutShell from './CompanyLayoutShell';

// Private (authenticated) surface — never indexed. robots.ts disallows the
// path for crawlers, this metadata adds the belt-and-braces noindex meta tag
// that browsers and search engines also respect.
export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return <CompanyLayoutShell>{children}</CompanyLayoutShell>;
}
