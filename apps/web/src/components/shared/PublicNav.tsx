'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getActiveTheme } from '@/lib/homepage-themes';

const t = getActiveTheme();
const isLight = t.key === 'corporate-light' || t.key === 'arctic-minimal';

// Three audience-specific entries + two universal ones. The previous
// 2-item split ("For enterprises" + "For experts") collapsed three real
// audiences (clients, individual consultants, consulting firms) and gave
// no top-nav path to the rebuilt /companies recruitment page. The current
// labels are parallel ("For X") so visitors self-select cleanly:
//   - "For clients"           → /services    (browse the task catalog)
//   - "For consultants"       → /contractors (individual-recruitment landing)
//   - "For consulting firms"  → /companies   (firm-recruitment landing)
//
// "Enterprises" was dropped — many customers aren't enterprises and the
// destination doesn't gate by company size. "Clients" is broader and
// describes the actual intent of the destination.
const NAV_LINKS: [string, string][] = [
  ['For clients',          '/services'],
  ['For consultants',      '/contractors'],
  ['For consulting firms', '/companies'],
  ['How it works',         '/how-it-works'],
  ['Pricing',              '/pricing'],
];

export function PublicNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes — without this the
  // drawer stays open after a navigation triggered from inside it.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open so background content
  // doesn't move behind the overlay on iOS Safari.
  useEffect(() => {
    if (mobileOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = original; };
    }
    return undefined;
  }, [mobileOpen]);

  const navStyle: React.CSSProperties = {
    background: t.navBgScrolled,
    borderBottom: `1px solid ${t.navBorder}`,
    boxShadow: isLight ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
  };

  return (
    <>
      {t.heroTopAccent && (
        <div style={{ height: 3, background: t.heroTopAccent }} />
      )}
      <nav className="sticky top-0 z-50 transition-all duration-300" style={navStyle}>
        <div className="max-w-[1100px] mx-auto px-6 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-1 no-underline shrink-0" onClick={() => setMobileOpen(false)}>
            <span className="font-display font-bold text-lg text-slate-100 tracking-tight">
              talvex<span className="text-teal-400">IT</span>
            </span>
          </Link>

          {/* Desktop nav — hidden below md (768px). Mobile users get the
              drawer-style menu opened by the hamburger button below.
              gap-5 + whitespace-nowrap accommodate the 5 labels at
              narrow desktops. */}
          <div className="hidden md:flex items-center gap-5 text-sm">
            {NAV_LINKS.map(([label, href]) => (
              <Link
                key={label}
                href={href}
                className="hp-nav-link transition-colors no-underline whitespace-nowrap"
                style={{ color: t.navLinkColor, textDecoration: 'none' }}
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {/* Sign in is hidden on the smallest screens — the drawer
                surfaces it instead so the action area stays uncluttered. */}
            <Link
              href="/login"
              className="hp-nav-link hidden sm:inline-flex text-sm px-3 py-2 transition-colors no-underline"
              style={{ color: t.navLinkColor }}
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="hp-primary text-sm font-medium px-4 py-2 rounded-lg no-underline transition-all duration-200"
              style={{ background: t.primaryBg, color: t.primaryText }}
            >
              Get started
            </Link>

            {/* Hamburger — visible only below md. Toggles the drawer. */}
            <button
              type="button"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              aria-controls="public-mobile-nav"
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg ml-1"
              style={{
                color: t.navLinkColor,
                background: 'transparent',
                border: `1px solid ${t.navBorder}`,
              }}
            >
              {mobileOpen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ── Mobile drawer ────────────────────────────────────────────────
            Slides down below the sticky nav when the hamburger is open.
            Renders only when open so closed-state markup stays minimal.
            The fixed-position overlay below catches outside clicks. */}
        {mobileOpen && (
          <div
            id="public-mobile-nav"
            className="md:hidden border-t"
            style={{ background: t.navBgScrolled, borderColor: t.navBorder }}
          >
            <div className="max-w-[1100px] mx-auto px-6 py-3 flex flex-col">
              {NAV_LINKS.map(([label, href]) => {
                const active = pathname === href;
                return (
                  <Link
                    key={label}
                    href={href}
                    className="block px-3 py-3 rounded-lg text-[15px] font-medium no-underline transition-colors"
                    style={{
                      color: active ? t.headlineColor : t.navLinkColor,
                      background: active ? t.chipBg : 'transparent',
                    }}
                    onClick={() => setMobileOpen(false)}
                  >
                    {label}
                  </Link>
                );
              })}

              {/* Sign in surfaces here too since it's hidden on the smallest
                  desktops to keep the topbar tight. */}
              <Link
                href="/login"
                className="block px-3 py-3 rounded-lg text-[15px] font-medium no-underline border-t mt-2 pt-4"
                style={{ color: t.navLinkColor, borderColor: t.navBorder }}
                onClick={() => setMobileOpen(false)}
              >
                Sign in
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Outside-click overlay. Sits below the sticky nav (z-40) and above
          page content (which has no explicit z by default). Clicking it
          closes the drawer. Only mounted when the drawer is open. */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.4)', top: '64px' }}
          aria-hidden
          onClick={() => setMobileOpen(false)}
        />
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .hp-nav-link:hover { color: ${t.navLinkHover} !important; }
        .hp-primary:hover { background: ${t.primaryHover} !important; transform: scale(1.02); }
      ` }} />
    </>
  );
}
