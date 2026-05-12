'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FileText, ChevronRight, Clock, Users } from 'lucide-react';
import customerApi from '@/lib/customer-api';
import { RefreshButton } from '@/components/shared/RefreshButton';

interface TenderSummary {
  id: string;
  title: string;
  domain: string;
  selection_mode: 'DIRECT' | 'AUTO_MATCH';
  status: 'OPEN' | 'CLOSED' | 'AWARDED' | 'CANCELLED' | 'EXPIRED';
  invited_count: number;
  proposal_count: number;
  submission_deadline: string;
  created_at: string;
}

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string; border: string }> = {
  OPEN:      { label: 'Open',      bg: 'bg-teal-500/15',   text: 'text-teal-400',   border: 'border-teal-500/30' },
  CLOSED:    { label: 'Closed',    bg: 'bg-slate-700/50',  text: 'text-slate-400',  border: 'border-slate-600' },
  AWARDED:   { label: 'Awarded',   bg: 'bg-blue-500/15',   text: 'text-blue-400',   border: 'border-blue-500/30' },
  CANCELLED: { label: 'Cancelled', bg: 'bg-red-500/15',    text: 'text-red-400',    border: 'border-red-500/30' },
  EXPIRED:   { label: 'Expired',   bg: 'bg-amber-500/15',  text: 'text-amber-400',  border: 'border-amber-500/30' },
};

function TenderCard({ tender }: { tender: TenderSummary }) {
  const router = useRouter();
  const s = STATUS_STYLE[tender.status] ?? STATUS_STYLE.OPEN;
  const deadline = new Date(tender.submission_deadline);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);

  return (
    <button
      onClick={() => router.push(`/customer/tenders/${tender.id}`)}
      className="w-full text-left rounded-2xl border border-slate-800 bg-slate-900 p-5 hover:border-slate-700 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100 truncate">{tender.title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{tender.domain.replace(/_/g, ' ')}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.bg} ${s.text} ${s.border}`}>
          {s.label}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Users size={11} />
            {tender.invited_count} invited · {tender.proposal_count} proposals
          </span>
          {tender.status === 'OPEN' && (
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {daysLeft > 0 ? `${daysLeft}d left` : 'Deadline passed'}
            </span>
          )}
        </div>
        <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
      </div>
    </button>
  );
}

export default function TendersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['customer-tenders'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { tenders: TenderSummary[] } }>('/api/v1/tenders')
        .then((r) => r.data.data.tenders),
  });

  const tenders = data ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-slate-100 text-2xl">My Tenders</h1>
          <p className="text-sm text-slate-400 mt-1">Track proposals from providers for your projects.</p>
        </div>
        <RefreshButton
          loading={isLoading}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['customer-tenders'] })}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl h-20 animate-pulse" />
          ))}
        </div>
      ) : tenders.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-14 text-center">
          <FileText size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No tenders yet.</p>
          <p className="text-xs text-slate-600 mt-1">
            Use <a href="/customer/scope" className="text-teal-400 hover:underline">AI Scope</a> to generate a project scope and invite providers to propose.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                  <th className="pb-3 pr-4 font-medium">Title</th>
                  <th className="pb-3 pr-4 font-medium">Domain</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium text-right">Invited</th>
                  <th className="pb-3 pr-4 font-medium text-right">Proposals</th>
                  <th className="pb-3 pr-4 font-medium">Deadline</th>
                  <th className="pb-3 pr-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {tenders.map((t) => {
                  const s = STATUS_STYLE[t.status] ?? STATUS_STYLE.OPEN;
                  const deadline = new Date(t.submission_deadline);
                  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => router.push(`/customer/tenders/${t.id}`)}
                      className="border-b border-slate-800/60 hover:bg-slate-900/60 cursor-pointer transition-colors"
                    >
                      <td className="py-4 pr-4">
                        <span className="font-medium text-slate-200 line-clamp-1 block max-w-[320px]">{t.title}</span>
                        <span className="text-xs text-slate-600">
                          {t.selection_mode === 'AUTO_MATCH' ? 'Auto-match' : 'Direct invite'}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-slate-400">{t.domain.replace(/_/g, ' ')}</td>
                      <td className="py-4 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.bg} ${s.text} ${s.border}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-right text-slate-300">
                        <span className="inline-flex items-center gap-1 justify-end">
                          <Users size={11} className="text-slate-500" />
                          {t.invited_count}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-right text-slate-300">{t.proposal_count}</td>
                      <td className="py-4 pr-4 text-slate-400">
                        {t.status === 'OPEN' ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock size={11} className="text-slate-500" />
                            {daysLeft > 0 ? `${daysLeft}d left` : 'Passed'}
                          </span>
                        ) : (
                          deadline.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                        )}
                      </td>
                      <td className="py-4 pr-2 text-right">
                        <ChevronRight size={14} className="text-slate-600 inline-block" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {tenders.map((t) => <TenderCard key={t.id} tender={t} />)}
          </div>
        </>
      )}
    </div>
  );
}
