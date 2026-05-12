'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import {
  ChevronDown,
  Menu,
  X,
  User,
  CreditCard,
  LogOut,
  Bot,
  Search,
  ClipboardList,
  FileText,
  FileCheck2,
  Scale,
  Receipt,
} from 'lucide-react';
import { getUser, clearToken } from '@/lib/customer-auth';
import customerApi from '@/lib/customer-api';
import type { StoredUser } from '@/lib/customer-auth';
import { ThemeIconToggle } from '@/components/shared/ThemeToggle';
import { NotificationBell } from '@/components/shared/NotificationBell';

const NAV_LINKS = [
  { href: '/tasks',              label: 'Tasks',         icon: Search },
  { href: '/customer/orders',    label: 'My Orders',     icon: ClipboardList },
  { href: '/customer/scope',     label: 'Scope with AI', icon: Bot },
  { href: '/customer/tenders',   label: 'My Tenders',    icon: FileText },
  { href: '/customer/contracts', label: 'Contracts',     icon: FileCheck2 },
  { href: '/customer/disputes',  label: 'Disputes',      icon: Scale },
];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleLogout() {
    try {
      const raw = localStorage.getItem('onys_refresh_token');
      if (raw) {
        await customerApi.post('/api/v1/auth/logout', { refresh_token: raw }).catch(() => {});
      }
    } finally {
      clearToken();
      router.push('/login');
    }
  }

  const firstName = user?.full_name?.split(' ')[0] ?? 'Account';
  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  return (
    <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-6">
        <Link
          href={user ? '/customer/dashboard' : '/'}
          className="flex items-center gap-1 no-underline shrink-0"
        >
          <span className="font-display font-bold text-lg text-slate-100 tracking-tight">
            talvex<span className="text-teal-400">IT</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 ml-4">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors no-underline',
                  active
                    ? 'bg-teal-500/10 text-teal-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
                )}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          <ThemeIconToggle />

          <NotificationBell />

          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-800 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-xs font-bold text-teal-400 shrink-0">
                  {initials}
                </div>
                <span className="hidden sm:block text-sm font-medium text-slate-300 max-w-[120px] truncate">
                  {firstName}
                </span>
                <ChevronDown
                  size={14}
                  className={clsx(
                    'text-slate-500 transition-transform duration-150',
                    dropdownOpen && 'rotate-180',
                  )}
                />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 z-50">
                  <div className="px-4 py-2.5 border-b border-slate-800">
                    <p className="text-sm font-medium text-slate-200 truncate">{user.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                  <Link
                    href="/customer/profile"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors no-underline"
                  >
                    <User size={15} />
                    My Account
                  </Link>
                  <Link
                    href="/billing"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors no-underline"
                  >
                    <CreditCard size={15} />
                    Billing & subscriptions
                  </Link>
                  <Link
                    href="/invoices"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors no-underline"
                  >
                    <Receipt size={15} />
                    Invoices
                  </Link>
                  {/* "Payment methods" link removed for customers — that page
                      is a supplier-side surface for exposing bank details to
                      receive payments. Customers pay each supplier directly
                      per the invoice they receive, so the page has no
                      meaning on the buy side. */}
                  <div className="border-t border-slate-800 mt-1 pt-1">
                    <button
                      onClick={() => { void handleLogout(); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-left"
                    >
                      <LogOut size={15} />
                      Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-slate-400 hover:text-slate-200 px-3 py-2 transition-colors no-underline"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="text-sm font-medium px-4 py-2 rounded-lg no-underline transition-all duration-200 bg-teal-500 text-slate-950 hover:bg-teal-400"
              >
                Get started
              </Link>
            </>
          )}

          <button
            className="md:hidden p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-950 px-4 py-4 space-y-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-colors no-underline',
                  active
                    ? 'bg-teal-500/10 text-teal-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
