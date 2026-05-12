'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

type Color = 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue';

const STATUS_CONFIG: Record<string, { label: string; color: Color; dot: boolean }> = {
  PENDING_ACCEPTANCE: { label: 'Pending Acceptance', color: 'amber', dot: true  },
  IN_PROGRESS:        { label: 'In Progress',        color: 'teal',  dot: true  },
  PENDING_REVIEW:     { label: 'Pending Review',     color: 'blue',  dot: true  },
  REVISION_REQUESTED: { label: 'Revision Requested', color: 'amber', dot: true  },
  COMPLETED:          { label: 'Completed',          color: 'green', dot: false },
  DISPUTED:           { label: 'Disputed',           color: 'red',   dot: true  },
};

// Platform is subscription-only — no commission on engagements.
const COMMISSION_RATE = 0;

export interface ContractorOrderSummary {
  id: string;
  status: string;
  created_at: string;
  price_aud?: number | null;
  task?: { title?: string; domain?: string } | null;
  customer?: { full_name?: string } | null;
  sla_deadline?: string | null;
}

export function ContractorOrderCard({ order }: { order: ContractorOrderSummary }) {
  const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: 'slate' as Color, dot: false };
  const title = order.task?.title ?? 'Untitled Task';
  const customerName = order.customer?.full_name ?? 'Customer';
  const gross = Number(order.price_aud ?? 0);
  const commission = gross * COMMISSION_RATE;
  const net = gross - commission;

  const slaDeadline = order.sla_deadline ? new Date(order.sla_deadline) : null;
  const remainingMs = slaDeadline ? slaDeadline.getTime() - Date.now() : null;
  const remainingHours = remainingMs != null ? Math.floor(remainingMs / 3_600_000) : null;
  const overdue = remainingMs != null && remainingMs < 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors">
      <div className="flex items-start gap-4">
        {/* Left: title + customer */}
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-slate-100 line-clamp-1 text-sm">
            {title}
          </h3>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
              {customerName[0]}
            </div>
            <span className="text-xs text-slate-400 truncate">{customerName}</span>
            {order.task?.domain && (
              <Badge color="slate" className="text-xs">{order.task.domain.replace(/_/g, ' ')}</Badge>
            )}
          </div>
          {/* SLA */}
          {slaDeadline && ['IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED'].includes(order.status) && (
            <div className="mt-2">
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden w-40">
                <div
                  className={clsx('h-full rounded-full', overdue ? 'bg-red-500' : remainingHours != null && remainingHours < 12 ? 'bg-amber-400' : 'bg-teal-500')}
                  style={{ width: overdue ? '100%' : `${Math.max(0, Math.min(100, 100 - ((remainingMs ?? 0) / (72 * 3_600_000)) * 100))}%` }}
                />
              </div>
              <p className={clsx('text-xs mt-0.5', overdue ? 'text-red-400' : 'text-slate-500')}>
                {overdue ? '⚠ Overdue' : `${remainingHours}h remaining`}
              </p>
            </div>
          )}
        </div>

        {/* Center: status */}
        <div className="shrink-0">
          <Badge color={cfg.color} dot={cfg.dot}>{cfg.label}</Badge>
        </div>

        {/* Right: amount + link */}
        <div className="shrink-0 text-right">
          {gross > 0 && (
            <div>
              <p className="text-sm font-bold text-teal-400">
                AUD {net.toFixed(2)}
              </p>
              {COMMISSION_RATE > 0 && (
                <p className="text-xs text-slate-500">
                  ({COMMISSION_RATE * 100}% commission applied)
                </p>
              )}
            </div>
          )}
          <div className="mt-2">
            <Button asChild size="sm" variant="secondary">
              <Link href={`/contractor/orders/${order.id}`}>Open Order →</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-500">
        {format(new Date(order.created_at), 'd MMM yyyy')}
      </div>
    </div>
  );
}
