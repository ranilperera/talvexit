'use client';

import { useEffect, useState } from 'react';
import { format, differenceInDays } from 'date-fns';
import { AlertTriangle, Clock, CalendarDays, RefreshCw, Shield } from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

interface ExpirySummary {
  contractor_profile_id: string;
  contractor_name: string;
  contractor_email: string;
  insurance_type: string;
  expiry_date: string;
  days_remaining: number;
  profile_status: string;
}

interface ExpiryDashboard {
  expiring_0_7_days: ExpirySummary[];
  expiring_8_30_days: ExpirySummary[];
  expiring_31_60_days: ExpirySummary[];
  total_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:     'bg-teal-500/20 text-teal-300 border-teal-500/30',
  PENDING:    'bg-amber-500/20 text-amber-300 border-amber-500/30',
  SUSPENDED:  'bg-red-500/20 text-red-400 border-red-500/30',
  INCOMPLETE: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

function urgencyConfig(bucket: '0-7' | '8-30' | '31-60') {
  if (bucket === '0-7')  return { icon: AlertTriangle, iconCls: 'text-red-400',    border: 'border-red-500/30',    bg: 'bg-red-500/5',    header: 'bg-red-500/10',    label: 'Expiring in 0–7 days',   badge: 'bg-red-500/20 text-red-300 border-red-500/30' };
  if (bucket === '8-30') return { icon: Clock,          iconCls: 'text-amber-400',  border: 'border-amber-500/30',  bg: 'bg-amber-500/5',  header: 'bg-amber-500/10',  label: 'Expiring in 8–30 days',  badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
  return                        { icon: CalendarDays,   iconCls: 'text-blue-400',   border: 'border-blue-500/30',   bg: 'bg-blue-500/5',   header: 'bg-blue-500/10',   label: 'Expiring in 31–60 days', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
}

function ExpirySection({ items, bucket }: { items: ExpirySummary[]; bucket: '0-7' | '8-30' | '31-60' }) {
  if (items.length === 0) return null;
  const cfg = urgencyConfig(bucket);
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border overflow-hidden ${cfg.border} ${cfg.bg}`}>
      {/* Section header */}
      <div className={`flex items-center gap-2 px-5 py-3 border-b ${cfg.border} ${cfg.header}`}>
        <Icon size={14} className={cfg.iconCls} />
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">
          {cfg.label}
        </p>
        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
          {items.length}
        </span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-slate-800/60">
        {items.map((item, i) => {
          const expiry = new Date(item.expiry_date);
          const daysLeft = differenceInDays(expiry, new Date());
          const statusCls = STATUS_COLORS[item.profile_status] ?? STATUS_COLORS.INCOMPLETE!;

          return (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-800/30 transition-colors">
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                {item.contractor_name?.[0]?.toUpperCase() ?? '?'}
              </div>

              {/* Identity */}
              <div className="flex-1 min-w-0">
                <Link
                  href={`/admin/contractors/${item.contractor_profile_id}`}
                  className="text-sm font-medium text-slate-200 hover:text-teal-300 transition-colors truncate block"
                >
                  {item.contractor_name || 'Unknown contractor'}
                </Link>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {item.contractor_email || 'No email'}
                </p>
              </div>

              {/* Insurance type */}
              <div className="hidden sm:block shrink-0">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-slate-700 bg-slate-800 text-slate-300">
                  {item.insurance_type}
                </span>
              </div>

              {/* Profile status */}
              <div className="hidden md:block shrink-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusCls}`}>
                  {item.profile_status}
                </span>
              </div>

              {/* Expiry */}
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-slate-200">
                  {format(expiry, 'dd MMM yyyy')}
                </p>
                <p className={`text-xs mt-0.5 ${daysLeft <= 0 ? 'text-red-400 font-semibold' : daysLeft <= 7 ? 'text-red-400' : daysLeft <= 30 ? 'text-amber-400' : 'text-slate-500'}`}>
                  {daysLeft <= 0 ? 'Expired' : `${daysLeft}d remaining`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function InsuranceExpiryPage() {
  const [data, setData] = useState<ExpiryDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function load() {
    setLoading(true);
    setError(false);
    api
      .get<{ success: boolean; data: ExpiryDashboard }>('/api/v1/admin/insurance/expiry-dashboard')
      .then((res) => setData(res.data.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100 flex items-center gap-2">
            <Shield size={22} className="text-amber-400" />
            Insurance Expiry Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Certificates expiring within the next 60 days.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      {!loading && data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Expiring 0–7 days',   count: data.expiring_0_7_days.length,   urgent: true,  warn: false },
            { label: 'Expiring 8–30 days',  count: data.expiring_8_30_days.length,  urgent: false, warn: true  },
            { label: 'Expiring 31–60 days', count: data.expiring_31_60_days.length, urgent: false, warn: false },
          ].map(({ label, count, urgent, warn }) => (
            <div
              key={label}
              className={`rounded-xl border p-5 ${
                urgent && count > 0
                  ? 'border-red-500/40 bg-red-500/10'
                  : warn && count > 0
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-slate-700 bg-slate-900/60'
              }`}
            >
              <p className="text-xs font-medium text-slate-400">{label}</p>
              <p className={`text-4xl font-bold mt-1 ${
                urgent && count > 0 ? 'text-red-400' : warn && count > 0 ? 'text-amber-400' : 'text-slate-200'
              }`}>
                {count}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => <div key={n} className="h-16 rounded-xl bg-slate-800/50 animate-pulse" />)}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-400">
          Failed to load expiry data. <button onClick={load} className="underline hover:text-red-300">Retry</button>
        </div>
      )}

      {/* Expiry sections */}
      {!loading && data && (
        <>
          <ExpirySection items={data.expiring_0_7_days}  bucket="0-7"   />
          <ExpirySection items={data.expiring_8_30_days} bucket="8-30"  />
          <ExpirySection items={data.expiring_31_60_days} bucket="31-60" />

          {data.total_count === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-500">
              No certificates expiring in the next 60 days.
            </div>
          )}
        </>
      )}
    </div>
  );
}
