'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import {
  Search, Star, Filter, X,
  Shield, Network, Database, Cloud, Terminal, Monitor, ShieldCheck,
  RefreshCcw, HardDrive, Layers, MailCheck, Server, Cpu, Settings,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import customerApi from '@/lib/customer-api';
import { useDomains, useDomainMap, getDomainLabel } from '@/hooks/useDomains';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

// ─── Types ───────────────────────────────────────────────────────────────────

type Currency = 'AUD' | 'USD' | 'GBP' | 'EUR' | 'NZD' | 'SGD' | 'CAD';
type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'popular';
type Domain = string;

interface TaskContractor {
  id: string;
  full_name: string;
  rating_avg: number | null;
  orders_completed: number;
  is_verified: boolean;
}

interface Task {
  id: string;
  title: string;
  domain: Domain;
  objective: string;
  price: number;
  currency: Currency;
  hours_min: number;
  hours_max: number;
  milestone_count: number;
  contractor: TaskContractor | null;
  created_at: string;
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

// Icon mapping — labels come from DB; icons are React components so stay in code
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
  { value: 'rating',     label: 'Highest Rated' },
  { value: 'popular',    label: 'Most Popular' },
];

// ─── Initials avatar ──────────────────────────────────────────────────────────

function Initials({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center shrink-0 text-teal-400 font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, currency, domainMap }: { task: Task; currency: Currency; domainMap: Record<string, { label: string; short_label: string | null; icon: string | null; description: string | null; key: string; id: string; sort_order: number; insurance_tier: string }> }) {
  const DomainIcon = DOMAIN_ICON_MAP[task.domain] ?? Settings;
  const domainLabel = getDomainLabel(task.domain, domainMap);
  const displayPrice = convertPrice(task.price, currency);
  const sym = CURRENCY_SYMBOLS[currency];

  return (
    <div className="group flex flex-col rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-600 hover:shadow-card-lg transition-all duration-200">
      {/* Clickable body → task detail */}
      <Link href={`/tasks/${task.id}`} className="flex flex-col flex-1 no-underline">
        {/* Top badges */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <Badge color="teal">{domainLabel}</Badge>
          {task.contractor?.is_verified && (
            <Badge color="green" dot>Verified Expert</Badge>
          )}
        </div>

        {/* Content */}
        <div className="px-5 flex-1 space-y-3">
          <h3 className="font-display font-semibold text-slate-100 text-[15px] leading-snug line-clamp-2 group-hover:text-teal-300 transition-colors">
            {task.title}
          </h3>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <DomainIcon size={11} />
            <span>{domainLabel}</span>
            <span className="text-slate-700">·</span>
            <span>{task.hours_min}–{task.hours_max} hrs</span>
          </div>

          <p className="text-sm text-slate-400 line-clamp-3 leading-relaxed">{task.objective}</p>
        </div>

        {/* Price + contractor */}
        <div className="px-5 pt-4 pb-3 mt-3 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display font-bold text-teal-400 text-xl">
                {sym}{displayPrice.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500">
                {task.milestone_count === 1 ? 'Single delivery' : `${task.milestone_count} milestones`}
              </p>
            </div>
            {task.contractor && (
              <div className="flex items-center gap-2 min-w-0">
                <Initials name={task.contractor.full_name} size={28} />
                <div className="min-w-0">
                  <p className="text-xs text-slate-300 truncate max-w-[100px]">{task.contractor.full_name}</p>
                  {task.contractor.rating_avg !== null && (
                    <p className="text-[10px] text-amber-400 flex items-center gap-0.5">
                      <Star size={9} fill="currentColor" />
                      {task.contractor.rating_avg.toFixed(1)}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Link>

      {/* Action row */}
      <div className="px-5 pb-5 flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" asChild>
          <Link href={`/tasks/${task.id}`}>View Details</Link>
        </Button>
        <Button variant="primary" size="sm" className="flex-1" asChild>
          <Link href={`/tasks/${task.id}#book`}>Book Now</Link>
        </Button>
      </div>
    </div>
  );
}

// ─── Task Card Skeleton ───────────────────────────────────────────────────────

function TaskCardSkeleton() {
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
      <div className="flex gap-2">
        <Skeleton height={22} width={80} rounded="rounded-full" />
        <Skeleton height={22} width={100} rounded="rounded-full" />
      </div>
      <Skeleton height={18} width="85%" />
      <Skeleton height={14} width="40%" />
      <div className="space-y-1.5">
        <Skeleton height={13} width="100%" />
        <Skeleton height={13} width="70%" />
      </div>
      <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
        <Skeleton height={24} width={80} />
        <div className="flex gap-2 items-center">
          <Skeleton height={28} width={28} rounded="rounded-full" />
          <Skeleton height={14} width={60} />
        </div>
      </div>
      <Skeleton height={32} width="100%" rounded="rounded-lg" />
    </div>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
        checked ? 'bg-teal-500' : 'bg-slate-700',
      )}
    >
      <span
        className={clsx(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}

// ─── Main content (inside Suspense) ──────────────────────────────────────────

function TasksContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const domainMap = useDomainMap();
  const { data: dbDomains = [] } = useDomains();

  // Read URL params
  const getParam = (key: string, fallback = '') => searchParams.get(key) ?? fallback;

  const [q, setQ] = useState(getParam('q'));
  const [domain, setDomain] = useState<Domain | ''>(getParam('domain'));
  const [priceMin, setPriceMin] = useState(getParam('price_min'));
  const [priceMax, setPriceMax] = useState(getParam('price_max'));
  const [hoursMax, setHoursMax] = useState(Number(getParam('hours_max', '160')));
  const [currency, setCurrency] = useState<Currency>((getParam('currency', 'AUD')) as Currency);
  const [verifiedOnly, setVerifiedOnly] = useState(getParam('verified_only') === 'true');
  const [sort, setSort] = useState<SortOption>((getParam('sort', 'newest')) as SortOption);
  const [cursor, setCursor] = useState<string | null>(null);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (domain) p.set('domain', domain);
    if (priceMin) p.set('price_min', priceMin);
    if (priceMax) p.set('price_max', priceMax);
    if (hoursMax < 160) p.set('hours_max', String(hoursMax));
    if (currency !== 'AUD') p.set('currency', currency);
    if (verifiedOnly) p.set('verified_only', 'true');
    if (sort !== 'newest') p.set('sort', sort);
    if (cursor) p.set('cursor', cursor);
    return p;
  }, [q, domain, priceMin, priceMax, hoursMax, currency, verifiedOnly, sort, cursor]);

  const updateUrl = useCallback(() => {
    const p = buildParams();
    router.push(`/tasks?${p.toString()}`, { scroll: false });
  }, [buildParams, router]);

  // Debounced URL update on filter change (except currency which is display-only)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCursor(null);
      updateUrl();
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, domain, priceMin, priceMax, hoursMax, verifiedOnly, sort]);

  // Fetch
  const { data, isLoading, isFetching } = useQuery<TaskListResponse>({
    queryKey: ['tasks', q, domain, priceMin, priceMax, hoursMax, verifiedOnly, sort, cursor],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (domain) p.set('domain', domain);
      if (priceMin) p.set('price_min', priceMin);
      if (priceMax) p.set('price_max', priceMax);
      if (hoursMax < 160) p.set('hours_max', String(hoursMax));
      if (verifiedOnly) p.set('verified_only', 'true');
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

  // Accumulate tasks for "load more"
  useEffect(() => {
    if (!data) return;
    if (!cursor) {
      setAllTasks(data.tasks);
    } else {
      setAllTasks((prev) => [...prev, ...data.tasks]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function clearFilters() {
    setQ(''); setDomain(''); setPriceMin(''); setPriceMax('');
    setHoursMax(160); setVerifiedOnly(false); setSort('newest');
    setCursor(null);
  }

  const total = data?.total ?? 0;
  const hasMore = data?.next_cursor != null;

  // ── Sidebar JSX ─────────────────────────────────────────────────────────
  // Tailwind slate-* classes auto-invert via CSS vars / data-theme — one set covers both modes.
  const sidebarInputCls = clsx(
    'w-full px-3 py-2 text-sm rounded-lg border bg-slate-800 border-slate-700',
    'text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none transition-colors',
  );
  const sidebarLabelCls = 'text-slate-400';
  const sidebarLabelActiveCls = 'text-teal-400';
  const sidebarLabelHoverCls = 'group-hover:text-slate-200';
  const sidebarHeadingCls = 'text-slate-200';
  const sidebarSectionLabelCls = 'text-slate-500';
  const sidebarTinyCls = 'text-slate-600';

  const sidebar = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className={clsx('font-display font-semibold text-sm', sidebarHeadingCls)}>Filter Tasks</h2>
        <button
          onClick={clearFilters}
          className="text-xs text-slate-500 hover:text-teal-500 transition-colors"
        >
          Clear all
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search tasks…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={clsx(sidebarInputCls, 'pl-8 pr-3')}
        />
        {q && (
          <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Domain */}
      <div>
        <p className={clsx('text-xs font-semibold uppercase tracking-wider mb-2', sidebarSectionLabelCls)}>Domain</p>
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
                <span className={clsx('text-xs flex-1 transition-colors', isActive ? sidebarLabelActiveCls : clsx(sidebarLabelCls, sidebarLabelHoverCls))}>
                  {d.short_label ?? d.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Price Range */}
      <div>
        <p className={clsx('text-xs font-semibold uppercase tracking-wider mb-2', sidebarSectionLabelCls)}>Budget (AUD)</p>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Min"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            min={0}
            className={sidebarInputCls}
          />
          <input
            type="number"
            placeholder="Max"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            min={0}
            className={sidebarInputCls}
          />
        </div>
        <div className="mt-3">
          <label className={clsx('text-xs uppercase tracking-wider', sidebarSectionLabelCls)}>Display currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            className={clsx(sidebarInputCls, 'mt-1.5')}
          >
            {(['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'SGD', 'CAD'] as Currency[]).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <p className={clsx('mt-1 text-[10px]', sidebarTinyCls)}>Prices shown in selected currency</p>
        </div>
      </div>

      {/* Max Hours */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className={clsx('text-xs font-semibold uppercase tracking-wider', sidebarSectionLabelCls)}>Max Hours</p>
          <span className="text-xs text-teal-500">{hoursMax === 160 ? 'Any' : `≤ ${hoursMax}h`}</span>
        </div>
        <input
          type="range"
          min={1}
          max={160}
          value={hoursMax}
          onChange={(e) => setHoursMax(Number(e.target.value))}
          className="w-full accent-teal-500"
        />
        <div className={clsx('flex justify-between text-[10px] mt-1', sidebarTinyCls)}>
          <span>1h</span><span>160h</span>
        </div>
      </div>

      {/* Verified Only */}
      <div className="flex items-center justify-between">
        <div>
          <p className={clsx('text-xs font-semibold', sidebarLabelCls)}>Verified experts only</p>
          <p className={clsx('text-[10px] mt-0.5', sidebarTinyCls)}>ID &amp; insurance checked</p>
        </div>
        <ToggleSwitch checked={verifiedOnly} onChange={setVerifiedOnly} />
      </div>

      {/* Sort */}
      <div>
        <p className={clsx('text-xs font-semibold uppercase tracking-wider mb-2', sidebarSectionLabelCls)}>Sort by</p>
        <div className="space-y-1">
          {SORT_OPTIONS.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2.5 cursor-pointer group py-0.5">
              <input
                type="radio"
                name="sort"
                value={value}
                checked={sort === value}
                onChange={() => setSort(value)}
                className="accent-teal-500"
              />
              <span className={clsx('text-xs transition-colors', sort === value ? 'text-teal-500 font-medium' : clsx(sidebarLabelCls, sidebarLabelHoverCls))}>
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <AppHeader />

      <div className="flex max-w-7xl mx-auto w-full flex-1">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:block w-[280px] shrink-0 sticky top-16 h-[calc(100vh-64px)] overflow-y-auto p-6 border-r border-slate-800">
          {sidebar}
        </aside>

        {/* Mobile filters drawer */}
        {mobileFiltersOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="absolute inset-0 bg-slate-950/80" onClick={() => setMobileFiltersOpen(false)} />
            <div className="relative w-80 h-full overflow-y-auto p-6 border-r bg-slate-900 border-slate-800">
              <div className="flex items-center justify-between mb-6">
                <span className={clsx('font-display font-semibold', sidebarHeadingCls)}>Filters</span>
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
          {/* Result count + mobile filter toggle */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-slate-400">
              {isLoading ? 'Loading…' : (
                <>
                  <span className="text-slate-200 font-medium">{total.toLocaleString()}</span> tasks available
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

          {/* Grid */}
          {isLoading ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => <TaskCardSkeleton key={i} />)}
            </div>
          ) : allTasks.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="h-16 w-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4">
                <Search size={28} className="text-slate-600" />
              </div>
              <h3 className="font-display font-semibold text-slate-300 text-lg mb-2">No tasks match your filters</h3>
              <p className="text-sm text-slate-500 mb-6">Try removing some filters or browse all domains</p>
              <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {allTasks.map((task) => (
                  <TaskCard key={task.id} task={task} currency={currency} domainMap={domainMap} />
                ))}
              </div>

              {/* Load more */}
              <div className="mt-10 flex flex-col items-center gap-3">
                <p className="text-xs text-slate-500">
                  Showing <span className="text-slate-300">{allTasks.length}</span> of{' '}
                  <span className="text-slate-300">{total}</span> tasks
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
        </main>
      </div>
      <AppFooter />
    </div>
  );
}

// ─── Page export (Suspense wrapper required for useSearchParams) ──────────────

export default function TasksPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-sm text-slate-400">Loading tasks…</div>
      </div>
    }>
      <TasksContent />
    </Suspense>
  );
}
