'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Bell, Briefcase, CreditCard, ShieldAlert, Star, FileText, MessageSquare, Megaphone, ShieldCheck, Settings as SettingsIcon } from 'lucide-react';
import { clsx } from 'clsx';
import customerApi from '@/lib/customer-api';

type Category =
  | 'ORDER' | 'PAYMENT' | 'DISPUTE' | 'TENDER'
  | 'ACCOUNT' | 'MESSAGE' | 'COMPLIANCE' | 'ADMIN' | 'MARKETING';

interface ApiNotification {
  id: string;
  category: Category;
  title: string;
  body: string | null;
  link_url: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

const ICON_MAP: Record<Category, { Icon: React.ElementType; bg: string; fg: string }> = {
  ORDER:      { Icon: Briefcase,    bg: 'bg-slate-700/60', fg: 'text-slate-400' },
  PAYMENT:    { Icon: CreditCard,   bg: 'bg-blue-500/15',  fg: 'text-blue-400' },
  DISPUTE:    { Icon: ShieldAlert,  bg: 'bg-red-500/15',   fg: 'text-red-400' },
  TENDER:     { Icon: FileText,     bg: 'bg-purple-500/15',fg: 'text-purple-400' },
  ACCOUNT:    { Icon: SettingsIcon, bg: 'bg-slate-700/60', fg: 'text-slate-400' },
  MESSAGE:    { Icon: MessageSquare,bg: 'bg-teal-500/15',  fg: 'text-teal-400' },
  COMPLIANCE: { Icon: ShieldCheck,  bg: 'bg-amber-500/15', fg: 'text-amber-400' },
  ADMIN:      { Icon: Star,         bg: 'bg-amber-500/15', fg: 'text-amber-400' },
  MARKETING:  { Icon: Megaphone,    bg: 'bg-slate-700/60', fg: 'text-slate-400' },
};

// 20s strikes a balance between responsiveness for new orders and API load.
// If you raise it back, also raise the sidebar-badges refetchInterval to match.
const POLL_INTERVAL_MS = 20_000;

interface NotificationBellProps {
  /** Direction the popover panel opens. Use 'up' when the bell sits near the bottom of the screen (e.g. sidebar footer). */
  direction?: 'down' | 'up';
}

export function NotificationBell({ direction = 'down' }: NotificationBellProps = {}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(() => {
    customerApi
      .get<{ success: boolean; data: { unread: number } }>('/api/v1/notifications/count')
      .then((r) => setUnreadCount(r.data.data.unread))
      .catch(() => {});
  }, []);

  const fetchItems = useCallback(() => {
    setLoading(true);
    customerApi
      .get<{ success: boolean; data: { notifications: ApiNotification[] } }>('/api/v1/notifications?limit=15')
      .then((r) => setItems(r.data.data.notifications))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  // Initial + interval poll for unread count
  useEffect(() => {
    fetchCount();
    const t = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchCount]);

  // Fetch list when opening the panel
  useEffect(() => {
    if (open) fetchItems();
  }, [open, fetchItems]);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  async function markRead(id: string) {
    await customerApi.post(`/api/v1/notifications/${id}/read`).catch(() => {});
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    fetchCount();
  }

  async function markAllRead() {
    await customerApi.post('/api/v1/notifications/mark-all-read').catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-teal-500 text-[9px] font-bold text-slate-950">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute ${direction === 'up' ? 'left-0 bottom-full mb-2' : 'right-0 top-full mt-2'} w-96 max-w-[90vw] bg-slate-900 border border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <span className="text-sm font-semibold text-slate-100">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => { void markAllRead(); }}
                className="text-xs text-teal-400 hover:text-teal-300 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[28rem] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-500">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell size={20} className="text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No notifications yet</p>
              </div>
            ) : (
              items.map((n) => {
                const cfg = ICON_MAP[n.category];
                const Icon = cfg.Icon;
                const isRead = n.read_at !== null;
                const Inner = (
                  <div
                    className={clsx(
                      'flex items-start gap-3 px-4 py-3 border-b border-slate-800/50 transition-colors',
                      isRead ? 'opacity-60' : 'hover:bg-slate-800/40',
                    )}
                  >
                    <div className="shrink-0 mt-1.5">
                      {!isRead ? <div className="w-1.5 h-1.5 rounded-full bg-teal-400" /> : <div className="w-1.5 h-1.5" />}
                    </div>
                    <div className={clsx('p-1.5 rounded-lg shrink-0', cfg.bg)}>
                      <Icon size={12} className={cfg.fg} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-200 leading-snug">{n.title}</p>
                      {n.body && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-slate-600 mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
                return n.link_url ? (
                  <Link
                    key={n.id}
                    href={n.link_url}
                    onClick={() => { void markRead(n.id); setOpen(false); }}
                    className="block no-underline"
                  >
                    {Inner}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    onClick={() => { void markRead(n.id); }}
                    className="block w-full text-left"
                  >
                    {Inner}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
