'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle } from 'lucide-react';

interface SlaTimerProps {
  deadline: Date;
  totalWindow?: number; // ms — used to compute bar fill; defaults to 7 days
  label?: string;
  showBar?: boolean;
}

function msToLabel(ms: number): string {
  if (ms <= 0) return 'OVERDUE';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function SlaTimer({
  deadline,
  totalWindow = 7 * 24 * 60 * 60 * 1000,
  label,
  showBar = false,
}: SlaTimerProps) {
  const [remaining, setRemaining] = useState(() => deadline.getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(deadline.getTime() - Date.now());
    }, 60_000);
    return () => clearInterval(id);
  }, [deadline]);

  const overdue = remaining <= 0;
  const critical = !overdue && remaining < 4 * 3_600_000;   // < 4h
  const warning  = !overdue && remaining < 24 * 3_600_000;  // < 24h

  const textColor = overdue   ? 'text-red-400' :
                    critical  ? 'text-red-400'  :
                    warning   ? 'text-amber-400' :
                                'text-slate-400';

  const barColor = overdue   ? 'bg-red-500' :
                   critical  ? 'bg-red-500'  :
                   warning   ? 'bg-amber-500' :
                               'bg-slate-600';

  const fillPct = overdue ? 0 : Math.min(100, Math.round((remaining / totalWindow) * 100));

  return (
    <div className="space-y-1">
      {label && (
        <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
      )}

      <div className={clsx('flex items-center gap-1.5 text-xs font-medium', textColor)}>
        {overdue && <AlertTriangle size={11} />}
        <span className={clsx(critical && !overdue && 'animate-pulse')}>
          {overdue ? 'OVERDUE' : msToLabel(remaining)}
        </span>
      </div>

      {showBar && (
        <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-1000', barColor, critical && !overdue && 'animate-pulse')}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
