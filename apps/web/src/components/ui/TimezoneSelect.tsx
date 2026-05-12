'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Clock, X } from 'lucide-react';
import { clsx } from 'clsx';

// ─── Full IANA timezone list grouped by region ────────────────────────────────

const TIMEZONE_GROUPS: { region: string; zones: string[] }[] = [
  {
    region: 'Australia & Pacific',
    zones: [
      'Australia/Sydney',
      'Australia/Melbourne',
      'Australia/Brisbane',
      'Australia/Adelaide',
      'Australia/Perth',
      'Australia/Darwin',
      'Australia/Hobart',
      'Australia/Lord_Howe',
      'Pacific/Auckland',
      'Pacific/Chatham',
      'Pacific/Fiji',
      'Pacific/Guam',
      'Pacific/Honolulu',
      'Pacific/Noumea',
      'Pacific/Port_Moresby',
      'Pacific/Tahiti',
      'Pacific/Tongatapu',
    ],
  },
  {
    region: 'Asia',
    zones: [
      'Asia/Kolkata',
      'Asia/Singapore',
      'Asia/Kuala_Lumpur',
      'Asia/Bangkok',
      'Asia/Jakarta',
      'Asia/Shanghai',
      'Asia/Hong_Kong',
      'Asia/Tokyo',
      'Asia/Seoul',
      'Asia/Taipei',
      'Asia/Manila',
      'Asia/Ho_Chi_Minh',
      'Asia/Dhaka',
      'Asia/Kathmandu',
      'Asia/Colombo',
      'Asia/Karachi',
      'Asia/Tashkent',
      'Asia/Almaty',
      'Asia/Tbilisi',
      'Asia/Dubai',
      'Asia/Riyadh',
      'Asia/Baghdad',
      'Asia/Tehran',
      'Asia/Jerusalem',
      'Asia/Beirut',
      'Asia/Nicosia',
      'Asia/Yekaterinburg',
      'Asia/Novosibirsk',
      'Asia/Krasnoyarsk',
      'Asia/Irkutsk',
      'Asia/Yakutsk',
      'Asia/Vladivostok',
      'Asia/Magadan',
      'Asia/Kamchatka',
    ],
  },
  {
    region: 'Europe',
    zones: [
      'Europe/London',
      'Europe/Dublin',
      'Europe/Lisbon',
      'Europe/Madrid',
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Rome',
      'Europe/Amsterdam',
      'Europe/Brussels',
      'Europe/Vienna',
      'Europe/Zurich',
      'Europe/Stockholm',
      'Europe/Oslo',
      'Europe/Copenhagen',
      'Europe/Helsinki',
      'Europe/Warsaw',
      'Europe/Prague',
      'Europe/Budapest',
      'Europe/Bucharest',
      'Europe/Sofia',
      'Europe/Athens',
      'Europe/Istanbul',
      'Europe/Kiev',
      'Europe/Moscow',
      'Europe/Minsk',
      'Europe/Riga',
      'Europe/Tallinn',
      'Europe/Vilnius',
      'Europe/Kaliningrad',
      'Europe/Samara',
    ],
  },
  {
    region: 'Americas',
    zones: [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Phoenix',
      'America/Anchorage',
      'America/Toronto',
      'America/Vancouver',
      'America/Halifax',
      'America/St_Johns',
      'America/Mexico_City',
      'America/Monterrey',
      'America/Bogota',
      'America/Lima',
      'America/Caracas',
      'America/La_Paz',
      'America/Santiago',
      'America/Buenos_Aires',
      'America/Sao_Paulo',
      'America/Manaus',
      'America/Fortaleza',
      'America/Montevideo',
      'America/Asuncion',
      'America/Guayaquil',
    ],
  },
  {
    region: 'Africa & Middle East',
    zones: [
      'Africa/Cairo',
      'Africa/Johannesburg',
      'Africa/Lagos',
      'Africa/Nairobi',
      'Africa/Accra',
      'Africa/Casablanca',
      'Africa/Algiers',
      'Africa/Tunis',
      'Africa/Khartoum',
      'Africa/Addis_Ababa',
      'Africa/Dar_es_Salaam',
      'Africa/Kampala',
      'Africa/Harare',
      'Africa/Lusaka',
      'Africa/Abidjan',
      'Africa/Dakar',
      'Africa/Maputo',
    ],
  },
  {
    region: 'UTC / Other',
    zones: [
      'UTC',
      'Etc/GMT+12',
      'Etc/GMT+11',
      'Etc/GMT+10',
      'Etc/GMT+9',
      'Etc/GMT+8',
      'Etc/GMT+7',
      'Etc/GMT+6',
      'Etc/GMT+5',
      'Etc/GMT+4',
      'Etc/GMT+3',
      'Etc/GMT+2',
      'Etc/GMT+1',
      'Etc/GMT-1',
      'Etc/GMT-2',
      'Etc/GMT-3',
      'Etc/GMT-4',
      'Etc/GMT-5',
      'Etc/GMT-6',
      'Etc/GMT-7',
      'Etc/GMT-8',
      'Etc/GMT-9',
      'Etc/GMT-10',
      'Etc/GMT-11',
      'Etc/GMT-12',
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getUtcOffset(tz: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');
    return offsetPart?.value ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

function formatLabel(tz: string): string {
  return tz
    .replace(/^(Australia|Pacific|Asia|Europe|America|Africa|Atlantic|Indian|Etc)\//, '')
    .replace(/_/g, ' ');
}

// ─── TimezoneSelect ───────────────────────────────────────────────────────────

interface TimezoneSelectProps {
  value: string;
  onChange: (tz: string) => void;
  label?: string;
  required?: boolean;
  className?: string;
}

export function TimezoneSelect({
  value,
  onChange,
  label = 'Timezone',
  required,
  className,
}: TimezoneSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Focus search when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Build offset cache once
  const offsetCache = useMemo(() => {
    const cache: Record<string, string> = {};
    TIMEZONE_GROUPS.forEach(({ zones }) =>
      zones.forEach((tz) => { cache[tz] = getUtcOffset(tz); }),
    );
    return cache;
  }, []);

  // Filter groups by query
  const filtered = useMemo(() => {
    if (!query.trim()) return TIMEZONE_GROUPS;
    const q = query.toLowerCase();
    return TIMEZONE_GROUPS
      .map(({ region, zones }) => ({
        region,
        zones: zones.filter(
          (tz) =>
            tz.toLowerCase().includes(q) ||
            formatLabel(tz).toLowerCase().includes(q) ||
            (offsetCache[tz] ?? '').toLowerCase().includes(q) ||
            region.toLowerCase().includes(q),
        ),
      }))
      .filter(({ zones }) => zones.length > 0);
  }, [query, offsetCache]);

  const selectedLabel = value ? formatLabel(value) : '';
  const selectedOffset = value ? (offsetCache[value] ?? '') : '';

  return (
    <div className={clsx('space-y-1.5', className)} ref={containerRef}>
      {label && (
        <label className="text-xs font-medium text-slate-400 block">
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-xl border transition-colors text-left',
          open
            ? 'border-teal-500 bg-slate-800'
            : 'border-slate-700 bg-slate-800 hover:border-slate-600',
        )}
      >
        <Clock size={14} className="text-slate-500 shrink-0" />
        {value ? (
          <span className="flex-1 text-slate-100 truncate">
            {selectedLabel}
            <span className="ml-2 text-slate-500 text-xs">{selectedOffset}</span>
          </span>
        ) : (
          <span className="flex-1 text-slate-500">Select timezone…</span>
        )}
        <ChevronDown
          size={14}
          className={clsx('text-slate-500 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden"
          style={{ maxHeight: 360 }}
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-700/60">
            <Search size={13} className="text-slate-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city or region…"
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-600 outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-slate-500 hover:text-slate-300">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Options */}
          <div className="overflow-y-auto" style={{ maxHeight: 300 }}>
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No timezones found</p>
            ) : (
              filtered.map(({ region, zones }) => (
                <div key={region}>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    {region}
                  </p>
                  {zones.map((tz) => (
                    <button
                      key={tz}
                      type="button"
                      onClick={() => { onChange(tz); setOpen(false); setQuery(''); }}
                      className={clsx(
                        'w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors',
                        tz === value
                          ? 'bg-teal-500/15 text-teal-300'
                          : 'text-slate-300 hover:bg-slate-800',
                      )}
                    >
                      <span>{formatLabel(tz)}</span>
                      <span className="text-xs text-slate-500 font-mono ml-3 shrink-0">
                        {offsetCache[tz]}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
