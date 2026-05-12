'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ChevronRight, Gavel, CheckCircle2 } from 'lucide-react';
import customerApi from '@/lib/customer-api';

interface ArbitrationItem {
  id: string;
  grounds: string;
  status: string;
  created_at: string;
  recommendation_submitted: boolean;
  order_id: string;
  order_title: string;
}

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  OPEN:         { label: 'Open',         bg: 'bg-red-500/15',    text: 'text-red-400' },
  ASSIGNED:     { label: 'Assigned',     bg: 'bg-amber-500/15',  text: 'text-amber-400' },
  UNDER_REVIEW: { label: 'Under review', bg: 'bg-blue-500/15',   text: 'text-blue-400' },
  DETERMINED:   { label: 'Determined',   bg: 'bg-teal-500/15',   text: 'text-teal-400' },
  CLOSED:       { label: 'Closed',       bg: 'bg-slate-700/50',  text: 'text-slate-400' },
};

export default function ArbitrationListPage() {
  const [items, setItems] = useState<ArbitrationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customerApi
      .get<{ success: boolean; data: { disputes: ArbitrationItem[] } }>('/api/v1/arbitration/my')
      .then((r) => setItems(r.data.data.disputes))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-100">Arbitration assignments</h1>
        <p className="text-sm text-slate-400 mt-1">Disputes you have been appointed to review as an independent arbitrator.</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-14 text-center">
          <Gavel size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No arbitration assignments.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((d) => {
            const s = STATUS_STYLE[d.status] ?? { label: d.status, bg: 'bg-slate-700/50', text: 'text-slate-400' };
            return (
              <Link
                key={d.id}
                href={`/contractor/arbitration/${d.id}`}
                className="block bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors no-underline group"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-100 truncate">{d.order_title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{d.grounds.replace(/_/g, ' ')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.recommendation_submitted && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-teal-400">
                        <CheckCircle2 size={11} /> Submitted
                      </span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}>
                      {s.label}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Appointed {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}</span>
                  <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
