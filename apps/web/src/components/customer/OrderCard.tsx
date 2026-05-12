'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

type Color = 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue';

const STATUS_CONFIG: Record<string, { label: string; color: Color; dot: boolean }> = {
  PENDING_PAYMENT:   { label: 'Pending Payment',   color: 'amber',  dot: true  },
  PENDING_ACCEPTANCE:{ label: 'Pending Acceptance', color: 'amber',  dot: true  },
  IN_PROGRESS:       { label: 'In Progress',        color: 'teal',   dot: true  },
  PENDING_REVIEW:    { label: 'Pending Review',     color: 'blue',   dot: true  },
  COMPLETED:         { label: 'Completed',          color: 'green',  dot: false },
  DISPUTED:          { label: 'Disputed',           color: 'red',    dot: true  },
  CANCELLED:         { label: 'Cancelled',          color: 'slate',  dot: false },
  REVISION_REQUESTED:{ label: 'Revision Requested', color: 'amber',  dot: true  },
};

export interface OrderSummary {
  id: string;
  status: string;
  created_at: string;
  price_aud?: number | null;
  task?: { title?: string; domain?: string } | null;
  contractor_user?: { full_name?: string } | null;
  sla_deadline?: string | null;
  customer_rating?: { id: string } | null;
}

function SlaBar({ deadline }: { deadline: string }) {
  const now = Date.now();
  const end = new Date(deadline).getTime();
  const remainingMs = end - now;
  const remainingHours = Math.floor(remainingMs / 3_600_000);
  const overdue = remainingMs < 0;

  // Assume 72h review window for bar calculation
  const windowMs = 72 * 3_600_000;
  const progress = overdue ? 100 : Math.max(0, Math.min(100, (1 - remainingMs / windowMs) * 100));

  const barColor = overdue
    ? 'bg-red-500'
    : progress > 80
    ? 'bg-red-500'
    : progress > 50
    ? 'bg-amber-400'
    : 'bg-teal-500';

  return (
    <div className="mt-3">
      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', barColor)} style={{ width: `${progress}%` }} />
      </div>
      <p className={clsx('text-xs mt-1', overdue ? 'text-red-400' : 'text-slate-500')}>
        {overdue ? '⚠ Overdue' : `${remainingHours}h remaining`}
      </p>
    </div>
  );
}

export function OrderCard({ order, showRateCta = false }: { order: OrderSummary; showRateCta?: boolean }) {
  const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: 'slate' as Color, dot: false };
  const title = order.task?.title ?? 'Untitled Task';
  const domain = order.task?.domain ?? '';
  const contractorName = order.contractor_user?.full_name ?? 'Expert TBA';
  const price = order.price_aud != null ? `AUD ${Number(order.price_aud).toLocaleString('en-AU', { minimumFractionDigits: 2 })}` : null;
  const hasRating = !!order.customer_rating;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3 hover:border-slate-700 transition-colors">
      {/* Row 1: title + status */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display font-semibold text-slate-100 line-clamp-1 text-sm leading-snug flex-1">
          {title}
        </h3>
        <Badge color={cfg.color} dot={cfg.dot} className="shrink-0">
          {cfg.label}
        </Badge>
      </div>

      {/* Row 2: domain + contractor + price */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {domain && (
            <Badge color="slate" className="shrink-0 text-xs">
              {domain.replace(/_/g, ' ')}
            </Badge>
          )}
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
              {contractorName[0]}
            </div>
            <span className="text-xs text-slate-400 truncate">{contractorName}</span>
          </div>
        </div>
        {price && <span className="text-sm font-semibold text-teal-400 shrink-0">{price}</span>}
      </div>

      {/* SLA bar */}
      {order.sla_deadline && ['IN_PROGRESS', 'PENDING_REVIEW'].includes(order.status) && (
        <SlaBar deadline={order.sla_deadline} />
      )}

      {/* Completed: rating cta */}
      {showRateCta && order.status === 'COMPLETED' && !hasRating && (
        <div className="text-xs text-amber-400 font-medium">Rate this order</div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        <span className="text-xs text-slate-500">
          {format(new Date(order.created_at), 'd MMM yyyy')}
        </span>
        <Button asChild size="sm" variant="secondary">
          <Link href={`/customer/orders/${order.id}`}>View Order →</Link>
        </Button>
      </div>
    </div>
  );
}
