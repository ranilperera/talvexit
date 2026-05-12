'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles, Zap } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { plansRouteFor } from '@/lib/customer-auth';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubscriptionLimitDetail {
  limit_type?: string;
  current?: number;
  limit?: number | null;
  current_plan?: string | null;
  message?: string;
}

// Event name kept in sync with customerApi interceptor
export const SUBSCRIPTION_LIMIT_EVENT = 'onys:subscription-limit-reached';

declare global {
  interface WindowEventMap {
    'onys:subscription-limit-reached': CustomEvent<SubscriptionLimitDetail>;
  }
}

// ─── UpgradePromptModal ──────────────────────────────────────────────────────
// Drop this anywhere high in the tree (e.g. customer layout) and it will
// listen for the 'onys:subscription-limit-reached' event dispatched by the
// customer-api 429 interceptor — no per-page wiring required.

interface Props {
  /** Optional manual control; usually leave undefined and rely on the event */
  open?: boolean;
  onClose?: () => void;
  /** Optional override of the detail when used in controlled mode */
  detail?: SubscriptionLimitDetail;
}

export function UpgradePromptModal({ open, onClose, detail }: Props) {
  const router = useRouter();
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoDetail, setAutoDetail] = useState<SubscriptionLimitDetail>({});

  // Subscribe to the global event when used in uncontrolled mode
  useEffect(() => {
    if (open !== undefined) return; // controlled — skip listener
    const handler = (e: CustomEvent<SubscriptionLimitDetail>) => {
      setAutoDetail(e.detail ?? {});
      setAutoOpen(true);
    };
    window.addEventListener(SUBSCRIPTION_LIMIT_EVENT, handler);
    return () => window.removeEventListener(SUBSCRIPTION_LIMIT_EVENT, handler);
  }, [open]);

  const isOpen = open ?? autoOpen;
  const close = onClose ?? (() => setAutoOpen(false));
  const d = detail ?? autoDetail;

  const limitLabel = formatLimitType(d.limit_type);
  const noActiveSub = d.current_plan == null;

  return (
    <Modal open={isOpen} onClose={close} size="md" title="Upgrade required">
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-xl bg-teal-500/10 border border-teal-500/30 p-3">
            <Sparkles size={20} className="text-teal-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-slate-300 leading-relaxed">
              {noActiveSub ? (
                <>
                  This action requires an active subscription. Pick a plan to get
                  started.
                </>
              ) : (
                <>
                  You&apos;ve reached your <span className="font-semibold">{limitLabel}</span>{' '}
                  limit on the{' '}
                  <span className="font-semibold">{d.current_plan}</span> plan
                  {d.limit !== null && d.limit !== undefined ? (
                    <>
                      {' '}
                      (<span className="tabular-nums">{d.current ?? 0}</span> /{' '}
                      <span className="tabular-nums">{d.limit}</span>).
                    </>
                  ) : (
                    '.'
                  )}{' '}
                  Upgrade to continue.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-slate-800/40 border border-slate-700 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
            <Zap size={12} className="text-teal-400" />
            What you get on a higher tier
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-400">
            <li>• Higher monthly action limits</li>
            <li>• Priority listing and additional features</li>
            <li>• Cancel anytime — no long-term commitment</li>
          </ul>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="md" onClick={close}>
            Not now
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              close();
              router.push(plansRouteFor());
            }}
          >
            View plans
            <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function formatLimitType(type?: string): string {
  if (!type) return 'plan';
  switch (type) {
    // Supplier quotas (rebuild 2026-05-06)
    case 'active_tasks':       return 'active listing';
    case 'listing_items':      return 'catalogue item';
    case 'active_orders':      return 'active order';
    case 'orders':             return 'monthly order';
    case 'active_tenders':     return 'active tender';
    case 'active_contracts':   return 'active contract';
    case 'bids':               return 'monthly bid';
    case 'domain_categories':  return 'domain category';
    case 'team_seats':         return 'team seat';
    // Customer quotas
    case 'task_bookings':      return 'monthly task booking';
    case 'contracts':          return 'monthly contract';
    case 'ai_scopes':          return 'AI scope';
    case 'ai_requests':        return 'monthly AI request';
    default:
      return type.replace(/_/g, ' ');
  }
}
