'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Mail, Phone, Search, ChevronRight, Clock } from 'lucide-react';
import adminApi from '@/lib/api';
import { RefreshButton } from '@/components/shared/RefreshButton';

type Status = 'NEW' | 'IN_PROGRESS' | 'RESPONDED' | 'CLOSED' | 'SPAM';

interface EnquirySummary {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  enquiry_type: string;
  status: Status;
  created_at: string;
  responded_at: string | null;
  _count: { responses: number };
}

const STATUS_STYLE: Record<Status, { label: string; bg: string; text: string; border: string }> = {
  NEW:         { label: 'New',          bg: 'bg-teal-500/15',   text: 'text-teal-300',   border: 'border-teal-500/30' },
  IN_PROGRESS: { label: 'In progress',  bg: 'bg-blue-500/15',   text: 'text-blue-300',   border: 'border-blue-500/30' },
  RESPONDED:   { label: 'Responded',    bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  CLOSED:      { label: 'Closed',       bg: 'bg-slate-700/50',  text: 'text-slate-400',  border: 'border-slate-600' },
  SPAM:        { label: 'Spam',         bg: 'bg-red-500/15',    text: 'text-red-300',    border: 'border-red-500/30' },
};

const FILTERS: { key: Status | 'ALL'; label: string }[] = [
  { key: 'ALL',         label: 'All' },
  { key: 'NEW',         label: 'New' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'RESPONDED',   label: 'Responded' },
  { key: 'CLOSED',      label: 'Closed' },
  { key: 'SPAM',        label: 'Spam' },
];

export default function ContactEnquiriesListPage() {
  const [status, setStatus] = useState<Status | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-contact-enquiries', status, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status !== 'ALL') params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      const res = await adminApi.get<{ success: boolean; data: { enquiries: EnquirySummary[] } }>(
        `/api/v1/admin/contact-enquiries${params.toString() ? `?${params.toString()}` : ''}`,
      );
      return res.data.data.enquiries;
    },
  });

  const enquiries = data ?? [];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Contact Enquiries</h1>
          <p className="text-sm text-slate-400 mt-1">
            Submissions from the public <code className="text-xs px-1.5 py-0.5 rounded bg-slate-800">/contact</code> page.
            Reply directly from each enquiry — the response is emailed to the submitter and recorded against the thread.
          </p>
        </div>
        <RefreshButton loading={isLoading} onRefresh={() => { void refetch(); }} />
      </div>

      {/* Filters + search */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                status === f.key
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, type, or message contents…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : enquiries.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-14 text-center">
          <Mail size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No enquiries match.</p>
          <p className="text-xs text-slate-600 mt-1">
            {status !== 'ALL' || search ? 'Try clearing filters.' : 'New submissions will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {enquiries.map((e) => {
            const s = STATUS_STYLE[e.status];
            const ago = new Date(e.created_at);
            const hoursAgo = Math.round((Date.now() - ago.getTime()) / (1000 * 60 * 60));
            const ageLabel =
              hoursAgo < 1
                ? 'just now'
                : hoursAgo < 24
                  ? `${hoursAgo}h ago`
                  : `${Math.round(hoursAgo / 24)}d ago`;

            return (
              <Link
                key={e.id}
                href={`/admin/contact-enquiries/${e.id}`}
                className="block bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-colors no-underline"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm font-medium text-slate-100 truncate">{e.name}</span>
                      <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.bg} ${s.text} ${s.border}`}>
                        {s.label}
                      </span>
                      <span className="text-xs text-slate-500 truncate">{e.enquiry_type}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Mail size={11} /> {e.email}
                      </span>
                      {e.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={11} /> {e.phone}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} /> {ageLabel}
                      </span>
                      {e._count.responses > 0 && (
                        <span className="text-emerald-400">
                          {e._count.responses} {e._count.responses === 1 ? 'reply' : 'replies'} sent
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-600 shrink-0 mt-1" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
