'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import {
  Search, Filter, X, Lock, UserPlus, LogIn,
  Shield, Network, Database, Cloud, Terminal, Monitor, ShieldCheck,
  RefreshCcw, HardDrive, Layers, MailCheck, Server, Cpu, Settings,
  ShieldCheck as VerifiedBadge,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import customerApi from '@/lib/customer-api';
import { useDomains, useDomainMap, getDomainLabel, type ITDomain } from '@/hooks/useDomains';
import { PublicNav } from '@/components/shared/PublicNav';
import { PublicFooter } from '@/components/shared/PublicFooter';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

// ─── Types ───────────────────────────────────────────────────────────────────

type Currency = 'AUD' | 'USD' | 'GBP' | 'EUR' | 'NZD' | 'SGD' | 'CAD';
type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'popular';

interface Task {
  id: string;
  title: string;
  domain: string;
  objective: string;
  price: number;
  currency: Currency;
  hours_min: number;
  hours_max: number;
  milestone_count: number;
  // contractor block on the API is intentionally NOT used by this page —
  // we hide all provider identity until the visitor signs in.
}

interface TaskListResponse {
  tasks: Task[];
  total: number;
  next_cursor: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FX_RATES: Record<Currency, number> = {
  AUD: 1.00, USD: 0.65, GBP: 0.52, EUR: 0.60,
  NZD: 1.08, SGD: 0.88, CAD: 0.88,
};

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  AUD: 'A$', USD: '$', GBP: '£', EUR: '€',
  NZD: 'NZ$', SGD: 'S$', CAD: 'C$',
};

function convertPrice(priceAUD: number, toCurrency: Currency): number {
  return Math.round(priceAUD * FX_RATES[toCurrency]);
}

const DOMAIN_ICON_MAP: Record<string, React.ElementType> = {
  FIREWALL:       Shield,
  NETWORKING:     Network,
  DATABASE:       Database,
  CLOUD_AZURE:    Cloud,
  LINUX:          Terminal,
  WINDOWS_ADMIN:  Monitor,
  CYBERSECURITY:  ShieldCheck,
  DEVOPS:         RefreshCcw,
  STORAGE:        HardDrive,
  VIRTUALIZATION: Layers,
  OFFICE_365:     MailCheck,
  BACKUP:         Server,
  AI_INTEGRATION: Cpu,
  SYSTEM_ADMIN:   Settings,
};

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest',     label: 'Newest' },
  { value: 'price_asc',  label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'popular',    label: 'Most Popular' },
];

// ─── Auth Prompt Modal ───────────────────────────────────────────────────────

function AuthPromptModal({
  open,
  onClose,
  taskTitle,
  taskId,
  action,
}: {
  open: boolean;
  onClose: () => void;
  taskTitle: string;
  taskId: string;
  action: 'view' | 'book';
}) {
  const router = useRouter();
  if (!open) return null;

  // After login/register, bring the user back to the catalog detail page so
  // they can complete the action that prompted the modal.
  const returnUrl = encodeURIComponent(action === 'book' ? `/tasks/${taskId}?action=book` : `/tasks/${taskId}`);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between p-5 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center shrink-0">
                <Lock size={18} className="text-teal-400" />
              </div>
              <h2 className="font-semibold text-base text-slate-100">
                {action === 'book' ? 'Sign in to book this service' : 'Sign in to view details'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-5">
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl mb-5">
              <p className="text-xs text-slate-500 mb-0.5">Service</p>
              <p className="text-sm font-medium text-slate-200 line-clamp-2">{taskTitle}</p>
            </div>

            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              {action === 'book'
                ? 'Free to register. You will only be charged after the work is delivered and you accept the deliverables.'
                : 'Create a free account or sign in to view full service details, provider information, and book this engagement.'}
            </p>

            <div className="space-y-3">
              <button
                onClick={() => router.push(`/register?redirect=${returnUrl}`)}
                className="w-full h-12 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus size={16} />
                Create free account
              </button>
              <button
                onClick={() => router.push(`/login?redirect=${returnUrl}`)}
                className="w-full h-12 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-2"
              >
                <LogIn size={16} />
                Sign in to existing account
              </button>
              <p className="text-center text-xs text-slate-600">Free to join · No credit card required</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Public Task Card (no provider identity) ─────────────────────────────────

function PublicTaskCard({
  task,
  currency,
  domainMap,
  onPromptAuth,
}: {
  task: Task;
  currency: Currency;
  domainMap: Record<string, ITDomain>;
  onPromptAuth: (taskId: string, taskTitle: string, action: 'view' | 'book') => void;
}) {
  const DomainIcon = DOMAIN_ICON_MAP[task.domain] ?? Settings;
  const price = convertPrice(task.price, currency);
  const symbol = CURRENCY_SYMBOLS[currency];
  const domainLabel = getDomainLabel(task.domain, domainMap);

  return (
    <div className="group flex flex-col rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-600 hover:shadow-card-lg transition-all duration-200">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700">
            <DomainIcon size={12} className="text-teal-400 shrink-0" />
            <span className="text-[11px] font-medium text-slate-300 truncate">{domainLabel}</span>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-400 px-2 py-1 bg-teal-500/10 border border-teal-500/30 rounded-md">
            <VerifiedBadge size={10} />
            Verified expert
          </span>
        </div>
        <h3 className="font-display font-semibold text-slate-100 text-[15px] leading-snug line-clamp-2 group-hover:text-teal-300 transition-colors">
          {task.title}
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-2">
          <span>{task.hours_min}–{task.hours_max} hrs</span>
          <span className="text-slate-700">·</span>
          <span>{task.milestone_count === 1 ? 'Single delivery' : `${task.milestone_count} milestones`}</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-3 flex-1">
        <p className="text-sm text-slate-400 line-clamp-3 leading-relaxed">{task.objective}</p>
      </div>

      {/* Footer — provider identity hidden, just price + auth-walled CTAs */}
      <div className="px-5 pt-4 pb-4 mt-3 border-t border-slate-800 space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Fixed price</p>
          <p className="font-display font-bold text-slate-100 text-2xl leading-none">
            {symbol}{price.toLocaleString()}
            {currency !== 'AUD' && (
              <span className="text-[10px] font-medium text-slate-500 ml-1">{currency}</span>
            )}
          </p>
          <p className="text-[10px] text-slate-600 mt-1">+ GST where applicable</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => onPromptAuth(task.id, task.title, 'view')}
          >
            View Details
          </Button>
          <Button
            size="sm"
            className="w-full"
            onClick={() => onPromptAuth(task.id, task.title, 'book')}
          >
            Book Now
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaskCardSkeleton() {
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
      <Skeleton height={24} className="w-32" />
      <div className="space-y-2">
        <Skeleton height={20} />
        <Skeleton height={20} className="w-3/4" />
      </div>
      <Skeleton height={60} />
      <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
        <Skeleton height={32} className="w-24" />
        <Skeleton height={32} className="w-20" />
      </div>
    </div>
  );
}

// ─── Main content (inside Suspense) ──────────────────────────────────────────

function ServicesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filters — initialised from URL, kept in URL for shareable links
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [domain, setDomain] = useState(searchParams.get('domain') ?? '');
  const [priceMin, setPriceMin] = useState(searchParams.get('price_min') ?? '');
  const [priceMax, setPriceMax] = useState(searchParams.get('price_max') ?? '');
  const [sort, setSort] = useState<SortOption>((searchParams.get('sort') as SortOption) ?? 'newest');
  const [hoursMax, setHoursMax] = useState(160);
  const [currency, setCurrency] = useState<Currency>('AUD');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  // Auth prompt modal state
  const [authPrompt, setAuthPrompt] = useState<{ taskId: string; taskTitle: string; action: 'view' | 'book' } | null>(null);

  // Load domains for the filter sidebar
  const { data: dbDomains = [] } = useDomains();
  const domainMap = useDomainMap();

  // Push filters into the URL (keeps the browser back button useful)
  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (domain) p.set('domain', domain);
    if (priceMin) p.set('price_min', priceMin);
    if (priceMax) p.set('price_max', priceMax);
    if (sort && sort !== 'newest') p.set('sort', sort);
    const qs = p.toString();
    router.replace(qs ? `/services?${qs}` : '/services', { scroll: false });
    setCursor(null); // reset paging when filters change
  }, [q, domain, priceMin, priceMax, sort, router]);

  // Fetch tasks. Public endpoint; the request interceptor only attaches a
  // token if one exists, so anonymous visitors get a clean 200.
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['public-services', q, domain, priceMin, priceMax, sort, cursor, hoursMax],
    queryFn: async (): Promise<TaskListResponse> => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (domain) p.set('domain', domain);
      if (priceMin) p.set('price_min', priceMin);
      if (priceMax) p.set('price_max', priceMax);
      if (hoursMax < 160) p.set('hours_max', String(hoursMax));
      if (sort) p.set('sort', sort);
      if (cursor) p.set('cursor', cursor);
      p.set('limit', '20');
      const res = await customerApi.get<{ success: boolean; data: TaskListResponse }>(
        `/api/v1/tasks?${p.toString()}`,
      );
      return res.data.data;
    },
    staleTime: 30_000,
  });

  const allTasks = data?.tasks ?? [];
  const total = data?.total ?? 0;
  const hasMore = data?.next_cursor != null;

  function clearFilters() {
    setQ('');
    setDomain('');
    setPriceMin('');
    setPriceMax('');
    setSort('newest');
    setHoursMax(160);
  }

  function promptAuth(taskId: string, taskTitle: string, action: 'view' | 'book') {
    setAuthPrompt({ taskId, taskTitle, action });
  }

  // Sidebar (rendered into both desktop and mobile drawer)
  const sidebar = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-sm text-slate-200">Filter Services</h2>
        <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-teal-500 transition-colors">
          Clear all
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search services…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full pl-8 pr-3 py-2 text-sm bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 rounded-lg focus:border-teal-500 focus:outline-none transition-colors"
        />
        {q && (
          <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Domain */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-slate-500">Domain</p>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {dbDomains.map((d) => {
            const Icon = DOMAIN_ICON_MAP[d.key] ?? Settings;
            const isActive = domain === d.key;
            return (
              <label key={d.key} className="flex items-center gap-2.5 cursor-pointer group py-1">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => setDomain(isActive ? '' : d.key)}
                  className="accent-teal-500 rounded"
                />
                <Icon size={12} className={clsx('shrink-0', isActive ? 'text-teal-400' : 'text-slate-400')} />
                <span className={clsx(
                  'text-xs flex-1 transition-colors',
                  isActive ? 'text-teal-400' : 'text-slate-400 group-hover:text-slate-200',
                )}>
                  {d.short_label ?? d.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Budget */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-slate-500">Budget (AUD)</p>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Min"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            min={0}
            className="w-full px-3 py-2 text-sm rounded-lg border bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none"
          />
          <input
            type="number"
            placeholder="Max"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            min={0}
            className="w-full px-3 py-2 text-sm rounded-lg border bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Currency */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-slate-500">Display Currency</p>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          className="w-full px-3 py-2 text-sm rounded-lg border bg-slate-800 border-slate-700 text-slate-200 focus:border-teal-500 focus:outline-none"
        >
          {(['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'SGD', 'CAD'] as Currency[]).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <p className="text-[10px] text-slate-600 mt-1.5">Prices shown in selected currency</p>
      </div>

      {/* Max hours */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Max Hours</p>
          <span className="text-xs text-slate-400">{hoursMax === 160 ? 'Any' : `${hoursMax}h`}</span>
        </div>
        <input
          type="range"
          min={1}
          max={160}
          value={hoursMax}
          onChange={(e) => setHoursMax(Number(e.target.value))}
          className="w-full accent-teal-500"
        />
        <div className="flex justify-between text-[10px] mt-1 text-slate-600">
          <span>1h</span>
          <span>160h</span>
        </div>
      </div>

      {/* Sort */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-slate-500">Sort By</p>
        <div className="space-y-1">
          {SORT_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer text-xs py-1">
              <input
                type="radio"
                name="sort"
                value={opt.value}
                checked={sort === opt.value}
                onChange={() => setSort(opt.value)}
                className="accent-teal-500"
              />
              <span className="text-slate-400">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <PublicNav />

      {/* Marketing strip — sets context that this is public browsing */}
      <div className="border-b border-slate-800 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <p className="text-slate-400">
            <span className="font-semibold text-slate-200">Browse Services</span>
            <span className="mx-2 text-slate-700">·</span>
            Verified senior IT specialists. Sign in to see provider details and book.
          </p>
          <p className="text-slate-500">
            Already a member?{' '}
            <button onClick={() => router.push('/login')} className="text-teal-400 hover:text-teal-300 font-medium">
              Sign in →
            </button>
          </p>
        </div>
      </div>

      <div className="flex max-w-7xl mx-auto w-full flex-1">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:block w-[280px] shrink-0 sticky top-0 h-screen overflow-y-auto p-6 border-r border-slate-800">
          {sidebar}
        </aside>

        {/* Mobile filters drawer */}
        {mobileFiltersOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="absolute inset-0 bg-slate-950/80" onClick={() => setMobileFiltersOpen(false)} />
            <div className="relative w-80 h-full overflow-y-auto p-6 border-r bg-slate-900 border-slate-800">
              <div className="flex items-center justify-between mb-6">
                <span className="font-display font-semibold text-slate-200">Filters</span>
                <button onClick={() => setMobileFiltersOpen(false)}>
                  <X size={18} className="text-slate-400" />
                </button>
              </div>
              {sidebar}
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 p-6">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-slate-400">
              {isLoading ? 'Loading…' : (
                <>
                  <span className="text-slate-200 font-medium">{total.toLocaleString()}</span> services available
                </>
              )}
            </p>
            <button
              onClick={() => setMobileFiltersOpen(true)}
              className="lg:hidden flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-800 transition-colors"
            >
              <Filter size={14} /> Filters
            </button>
          </div>

          {isLoading ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => <TaskCardSkeleton key={i} />)}
            </div>
          ) : allTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="h-16 w-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4">
                <Search size={28} className="text-slate-600" />
              </div>
              <h3 className="font-display font-semibold text-slate-300 text-lg mb-2">No services match your filters</h3>
              <p className="text-sm text-slate-500 mb-6">Try removing some filters or browse all domains</p>
              <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {allTasks.map((task) => (
                  <PublicTaskCard
                    key={task.id}
                    task={task}
                    currency={currency}
                    domainMap={domainMap}
                    onPromptAuth={promptAuth}
                  />
                ))}
              </div>

              {/* Load more */}
              <div className="mt-10 flex flex-col items-center gap-3">
                <p className="text-xs text-slate-500">
                  Showing <span className="text-slate-300">{allTasks.length}</span> of{' '}
                  <span className="text-slate-300">{total}</span> services
                </p>
                {hasMore && (
                  <Button
                    variant="secondary"
                    loading={isFetching}
                    onClick={() => { if (data?.next_cursor) setCursor(data.next_cursor); }}
                  >
                    Load more
                  </Button>
                )}
              </div>
            </>
          )}

          {/* Sign-up encouragement footer band */}
          <div className="mt-16 p-6 rounded-2xl bg-gradient-to-r from-teal-500/10 via-slate-900 to-slate-900 border border-teal-500/20 text-center">
            <h3 className="font-display font-bold text-xl text-slate-100 mb-2">
              Ready to engage a verified expert?
            </h3>
            <p className="text-sm text-slate-400 mb-4 max-w-md mx-auto">
              Create a free account to see provider profiles, book services and track delivery in one place.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => router.push('/register')}>
                Create free account
              </Button>
              <Button variant="secondary" onClick={() => router.push('/customer/scope')}>
                Or describe what you need with AI
              </Button>
            </div>
          </div>
        </main>
      </div>

      <PublicFooter />

      <AuthPromptModal
        open={authPrompt !== null}
        onClose={() => setAuthPrompt(null)}
        taskId={authPrompt?.taskId ?? ''}
        taskTitle={authPrompt?.taskTitle ?? ''}
        action={authPrompt?.action ?? 'view'}
      />
    </div>
  );
}

// ─── Page export (Suspense wrapper required for useSearchParams) ────────────

export default function ServicesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-sm text-slate-400">Loading services…</div>
      </div>
    }>
      <ServicesContent />
    </Suspense>
  );
}
