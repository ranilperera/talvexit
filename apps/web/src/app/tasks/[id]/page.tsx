'use client';

import { Suspense, useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import {
  Star, ChevronRight, Shield, Clock, Package, ShieldCheck,
  Network, Database, Cloud, Terminal, Monitor, RefreshCcw,
  HardDrive, Layers, MailCheck, Server, Cpu, Settings,
  Flag, MessageSquare, Send, ChevronDown, ChevronUp, Plus, Lock,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import customerApi from '@/lib/customer-api';
import { useDomainMap, getDomainLabel } from '@/hooks/useDomains';
// Catalogue preview defaults to AU customer + AU GST-registered supplier;
// final invoice uses real values at engagement time.
import { decideGstTreatment } from '@onys/shared';
import { isLoggedIn, getUser } from '@/lib/customer-auth';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import AuthPromptModal from '@/components/public/AuthPromptModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type Currency = 'AUD' | 'USD' | 'GBP' | 'EUR' | 'NZD' | 'SGD' | 'CAD';

interface Milestone {
  sequence: number;
  name: string;
  description: string;
  percentage_of_total: number;
}

interface ContractorDetail {
  id: string;
  full_name: string;
  bio: string | null;
  rating_avg: number | null;
  rating_count: number;
  orders_completed: number;
  is_verified: boolean;
  insurance_verified: boolean;
  domains: string[];
  abn: string | null;
  member_since: string;
  payment_methods?: PaymentMethodsPublicView;
}

// Masked supplier-payment-methods view returned by the task detail API.
// Mirrors the shape produced by apps/api/src/utils/payment-method-mask.ts.
interface PaymentMethodsPublicView {
  stripe?: { enabled?: boolean; payment_link_url?: string };
  bank_au?: { enabled?: boolean; bsb_masked?: string };
  bank_swift?: { enabled?: boolean; swift_code?: string };
  paypal?: { enabled?: boolean; email_masked?: string; payment_link_url?: string };
  wise?: { enabled?: boolean; email_masked?: string; payment_link_url?: string };
  other?: { enabled?: boolean; description?: string; payment_link_url?: string };
}

interface TaskDetail {
  id: string;
  title: string;
  domain: string;
  objective: string;
  in_scope: string[];
  out_of_scope: string[];
  assumptions: string[];
  prerequisites: string[];
  deliverables: string[];
  price: number;
  currency: Currency;
  hours_min: number;
  hours_max: number;
  milestone_count: number;
  milestones: Milestone[];
  contractor: ContractorDetail | null;
  created_at: string;
}

// ─── Thread types ──────────────────────────────────────────────────────────────

interface ThreadSender {
  id: string;
  full_name: string;
  account_type: string;
}

interface ThreadMessage {
  id: string;
  body: string;
  created_at: string;
  sender: ThreadSender;
}

interface TaskThread {
  id: string;
  type: 'QUESTION' | 'SCOPE_CHANGE';
  subject: string;
  status: 'OPEN' | 'CLOSED';
  created_at: string;
  updated_at: string;
  customer: ThreadSender;
  task: { id: string; title: string; domain: string };
  messages: ThreadMessage[];
  _count: { messages: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FX_RATES: Record<Currency, number> = {
  AUD: 1.00, USD: 0.65, GBP: 0.52, EUR: 0.60,
  NZD: 1.08, SGD: 0.88, CAD: 0.88,
};
const CURRENCY_SYMBOLS: Record<Currency, string> = {
  AUD: 'A$', USD: '$', GBP: '£', EUR: '€',
  NZD: 'NZ$', SGD: 'S$', CAD: 'C$',
};

function convertPrice(priceAUD: number, to: Currency): number {
  return Math.round(priceAUD * FX_RATES[to]);
}

const DOMAIN_ICONS: Record<string, React.ElementType> = {
  FIREWALL: Shield, NETWORKING: Network, DATABASE: Database,
  CLOUD_AZURE: Cloud, LINUX: Terminal, WINDOWS_ADMIN: Monitor,
  CYBERSECURITY: ShieldCheck, DEVOPS: RefreshCcw, STORAGE: HardDrive,
  VIRTUALIZATION: Layers, OFFICE_365: MailCheck, BACKUP: Server,
  AI_INTEGRATION: Cpu, SYSTEM_ADMIN: Settings,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Initials({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center shrink-0 text-teal-400 font-bold"
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

function StarRating({ rating, count }: { rating: number; count: number }) {
  return (
    <span className="flex items-center gap-1 text-sm">
      <Star size={13} className="text-amber-400 fill-amber-400" />
      <span className="text-amber-400 font-medium">{rating.toFixed(1)}</span>
      <span className="text-slate-500">({count})</span>
    </span>
  );
}

// ─── Scope section config ─────────────────────────────────────────────────────

interface ScopeSectionConfig {
  key: string;
  label: string;
  iconBg: string;
  iconColor: string;
  dotBg: string;
  iconPath: React.ReactNode;
}

const SCOPE_SECTIONS: ScopeSectionConfig[] = [
  {
    key: 'in_scope',
    label: 'In Scope',
    iconBg: 'bg-teal-500/15',
    iconColor: 'text-teal-400',
    dotBg: 'bg-teal-500/40',
    iconPath: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  {
    key: 'out_of_scope',
    label: 'Out of Scope',
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-400',
    dotBg: 'bg-red-500/40',
    iconPath: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  {
    key: 'assumptions',
    label: 'Assumptions',
    iconBg: 'bg-blue-500/15',
    iconColor: 'text-blue-400',
    dotBg: 'bg-blue-500/40',
    iconPath: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  {
    key: 'prerequisites',
    label: 'Prerequisites (Customer Provides)',
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-400',
    dotBg: 'bg-amber-500/40',
    iconPath: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    key: 'deliverables',
    label: 'Deliverables',
    iconBg: 'bg-purple-500/15',
    iconColor: 'text-purple-400',
    dotBg: 'bg-purple-500/40',
    iconPath: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </svg>
    ),
  },
];

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'scope' | 'milestones' | 'expert';

function TabBar({
  active, onChange, hasMilestones,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  hasMilestones: boolean;
}) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview',   label: 'Overview' },
    { id: 'scope',      label: 'Scope' },
    ...(hasMilestones ? [{ id: 'milestones' as Tab, label: 'Milestones' }] : []),
    { id: 'expert',     label: 'About Expert' },
  ];

  return (
    <div className="flex border-b border-slate-800 -mx-1">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={clsx(
            'px-4 py-3 text-sm font-medium transition-colors relative',
            active === id
              ? 'text-teal-400'
              : 'text-slate-500 hover:text-slate-300',
          )}
        >
          {label}
          {active === id && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500 rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ task }: { task: TaskDetail }) {
  return (
    <div className="space-y-3 py-2">

      {/* Objective — full-width prose card */}
      {task.objective && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">
            Objective
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">{task.objective}</p>
        </div>
      )}

      {/* Est. hours — stat pills */}
      {(task.hours_min || task.hours_max) && (
        <div className="flex gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex-1 text-center">
            <p className="text-xs text-slate-600 mb-1">Est. min hours</p>
            <p className="text-lg font-bold text-slate-200">{task.hours_min ?? '—'}h</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex-1 text-center">
            <p className="text-xs text-slate-600 mb-1">Est. max hours</p>
            <p className="text-lg font-bold text-slate-200">{task.hours_max ?? '—'}h</p>
          </div>
        </div>
      )}

      {/* Dynamic scope sections */}
      {SCOPE_SECTIONS.map((section) => {
        const scopeData = task as unknown as Record<string, string[]>;
        const items: string[] = scopeData[section.key] ?? [];
        if (!items.length) return null;
        return (
          <div key={section.key} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            {/* Header row */}
            <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-950 border-b border-slate-800">
              <div className={clsx('w-7 h-7 rounded-lg shrink-0 flex items-center justify-center', section.iconBg)}>
                <span className={section.iconColor}>{section.iconPath}</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-200 flex-1">{section.label}</h3>
              <span className="text-xs text-slate-600">
                {items.length} item{items.length !== 1 ? 's' : ''}
              </span>
            </div>
            {/* Items */}
            <ul className="px-5 py-4 space-y-2.5">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className={clsx('mt-1.5 w-2 h-2 rounded-full shrink-0', section.dotBg)} />
                  <p className="text-sm text-slate-400 leading-relaxed flex-1">{item}</p>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ─── Scope Tab (document style) ───────────────────────────────────────────────

function ScopeTab({ task }: { task: TaskDetail }) {
  const domainMap = useDomainMap();
  const sections = [
    { title: '1. Objective', content: task.objective },
    { title: '2. In Scope', items: task.in_scope },
    { title: '3. Out of Scope', items: task.out_of_scope },
    { title: '4. Assumptions', items: task.assumptions },
    ...(task.prerequisites.length > 0 ? [{ title: '5. Prerequisites', items: task.prerequisites }] : []),
    { title: `${task.prerequisites.length > 0 ? '6' : '5'}. Deliverables`, items: task.deliverables },
  ];
  return (
    <div className="rounded-xl bg-slate-800/30 border border-slate-700/50 p-6 space-y-6">
      <div className="border-b border-slate-700 pb-4">
        <h3 className="font-display font-bold text-slate-100 text-lg">{task.title}</h3>
        <p className="text-xs text-slate-500 mt-1">
          {getDomainLabel(task.domain, domainMap)} · {task.hours_min}–{task.hours_max} hours
        </p>
      </div>
      {sections.map(({ title, content, items }) => (
        <div key={title}>
          <h4 className="font-semibold text-slate-200 text-sm mb-2">{title}</h4>
          {content && <p className="text-sm text-slate-300 leading-relaxed">{content}</p>}
          {items && (
            <ul className="list-disc list-inside space-y-1">
              {items.map((item, i) => (
                <li key={i} className="text-sm text-slate-300">{item}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Milestones Tab ───────────────────────────────────────────────────────────

function MilestonesTab({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="space-y-4">
      {milestones.map((m, i) => (
        <div key={m.sequence} className="flex gap-4">
          {/* Step indicator */}
          <div className="flex flex-col items-center">
            <div className="h-8 w-8 rounded-full bg-teal-500/15 border border-teal-500/40 flex items-center justify-center shrink-0">
              <span className="text-teal-400 text-xs font-bold">{m.sequence}</span>
            </div>
            {i < milestones.length - 1 && (
              <div className="flex-1 w-0.5 bg-slate-700 mt-2 mb-0 min-h-[24px]" />
            )}
          </div>
          {/* Content */}
          <div className="pb-6 flex-1">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-display font-semibold text-slate-200 text-sm">{m.name}</h4>
              <Badge color="teal">{m.percentage_of_total}%</Badge>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">{m.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── About Expert Tab ─────────────────────────────────────────────────────────

function ExpertTab({ contractor }: { contractor: ContractorDetail | null }) {
  const domainMap = useDomainMap();
  if (!contractor) return <p className="text-sm text-slate-500">No contractor profile available.</p>;
  return (
    <div className="space-y-5">
      {contractor.bio && (
        <div>
          <h4 className="font-semibold text-slate-200 text-sm mb-2">Bio</h4>
          <p className="text-sm text-slate-300 leading-relaxed">{contractor.bio}</p>
        </div>
      )}

      <div>
        <h4 className="font-semibold text-slate-200 text-sm mb-2">Expertise</h4>
        <div className="flex flex-wrap gap-2">
          {contractor.domains.map((d) => (
            <Badge key={d} color="slate">{getDomainLabel(d, domainMap)}</Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {contractor.insurance_verified && (
          <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-3">
            <p className="text-xs font-semibold text-green-400 flex items-center gap-1.5">
              <ShieldCheck size={12} /> Insured
            </p>
            <p className="text-xs text-slate-500 mt-0.5">$1M PI + PL</p>
          </div>
        )}
        {contractor.abn && (
          <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-3">
            <p className="text-xs font-semibold text-slate-400">ABN</p>
            <p className="text-xs text-slate-300 mt-0.5">{contractor.abn}</p>
          </div>
        )}
        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-3">
          <p className="text-xs font-semibold text-slate-400">Member since</p>
          <p className="text-xs text-slate-300 mt-0.5">
            {new Date(contractor.member_since).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-3">
          <p className="text-xs font-semibold text-slate-400">Orders completed</p>
          <p className="text-xs text-slate-300 mt-0.5">{contractor.orders_completed}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Thread message bubble ─────────────────────────────────────────────────────

function MessageBubble({ msg, currentUserId }: { msg: ThreadMessage; currentUserId: string }) {
  const isMe = msg.sender.id === currentUserId;
  return (
    <div className={clsx('flex gap-2.5', isMe ? 'flex-row-reverse' : 'flex-row')}>
      <div className="w-7 h-7 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center shrink-0 text-[10px] font-bold text-teal-400">
        {msg.sender.full_name[0]?.toUpperCase()}
      </div>
      <div className={clsx('max-w-[80%] space-y-1', isMe ? 'items-end' : 'items-start', 'flex flex-col')}>
        <div className={clsx(
          'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
          isMe
            ? 'bg-teal-500/20 text-teal-100 rounded-tr-sm'
            : 'bg-slate-800 text-slate-200 rounded-tl-sm',
        )}>
          {msg.body}
        </div>
        <p className="text-[10px] text-slate-600 px-1">
          {msg.sender.full_name} · {new Date(msg.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

// ─── Thread view (inside modal) ────────────────────────────────────────────────

function ThreadView({
  thread,
  currentUserId,
  onBack,
}: {
  thread: TaskThread;
  currentUserId: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reply, setReply] = useState('');

  const { data: fullThread, isLoading } = useQuery<TaskThread>({
    queryKey: ['thread', thread.id],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: TaskThread }>(`/api/v1/threads/${thread.id}`)
        .then((r) => r.data.data),
    staleTime: 0,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      customerApi.post(`/api/v1/threads/${thread.id}/messages`, { body }),
    onSuccess: () => {
      setReply('');
      void qc.invalidateQueries({ queryKey: ['thread', thread.id] });
      void qc.invalidateQueries({ queryKey: ['myThreads'] });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [fullThread?.messages.length]);

  const messages = fullThread?.messages ?? thread.messages;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-slate-800 mb-4">
        <button onClick={onBack} className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors">
          <ChevronDown size={16} className="rotate-90" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">{thread.subject}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            <Badge color={thread.type === 'SCOPE_CHANGE' ? 'amber' : 'teal'} className="text-[10px]">
              {thread.type === 'SCOPE_CHANGE' ? 'Scope change' : 'Question'}
            </Badge>
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 min-h-[200px] max-h-[320px] pr-1">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} height={48} />)}
          </div>
        ) : messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} currentUserId={currentUserId} />
        ))}
      </div>

      {/* Reply box */}
      {thread.status === 'OPEN' && (
        <div className="flex gap-2 mt-4 pt-4 border-t border-slate-800">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && reply.trim()) {
                e.preventDefault();
                sendMutation.mutate(reply.trim());
              }
            }}
            rows={2}
            placeholder="Type a reply… (Ctrl+Enter to send)"
            className="flex-1 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all resize-none"
          />
          <button
            onClick={() => { if (reply.trim()) sendMutation.mutate(reply.trim()); }}
            disabled={!reply.trim() || sendMutation.isPending}
            className="self-end p-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-950"
          >
            <Send size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Booking Panel ────────────────────────────────────────────────────────────

function BookingPanel({ task }: { task: TaskDetail }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const [currency, setCurrency] = useState<Currency>(task.currency);
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');

  // Messaging modal state
  const [msgOpen, setMsgOpen] = useState(false);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [activeThread, setActiveThread] = useState<TaskThread | null>(null);
  // New thread form state
  const [newType, setNewType] = useState<'QUESTION' | 'SCOPE_CHANGE'>('QUESTION');
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');

  const loggedIn = isLoggedIn();
  const user = getUser();
  const isContractor = user?.account_type === 'INDIVIDUAL_CONTRACTOR' || user?.account_type === 'ORGANISATION_ADMIN';

  // Auto-open messages if redirected back after login with ?open=messages
  useEffect(() => {
    if (searchParams.get('open') === 'messages' && loggedIn) {
      setActiveThread(null);
      setMsgOpen(true);
      window.history.replaceState({}, '', `/tasks/${task.id}`);
    }
  }, [searchParams, loggedIn, task.id]);

  const displayPrice = convertPrice(task.price, currency);
  const sym = CURRENCY_SYMBOLS[currency];
  // Browse-time preview: customer is unknown so default both sides to AU
  // and assume the supplier is GST-registered (the typical published
  // listing). The final invoice uses the actual customer's billing
  // country at engagement time.
  const _gstDecision = decideGstTreatment({
    issuer_country: 'AU',
    issuer_gst_registered: true,
    recipient_country: 'AU',
    amount_ex_gst_cents: Math.round(displayPrice * 100),
  });
  const gst = Math.round(_gstDecision.gst_amount_cents / 100);

  // Load the current user's threads for this task (only when logged in + modal open)
  const { data: threadsData, isLoading: threadsLoading } = useQuery<{ threads: TaskThread[] }>({
    queryKey: ['myThreads', task.id],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { threads: TaskThread[] } }>('/api/v1/threads/mine')
        .then((r) => r.data.data),
    enabled: loggedIn && msgOpen,
    staleTime: 30_000,
    select: (data) => ({ threads: data.threads.filter((t) => t.task.id === task.id) }),
  });

  const threads = threadsData?.threads ?? [];

  const createMutation = useMutation({
    mutationFn: (body: { type: string; subject: string; message: string }) =>
      customerApi
        .post<{ success: boolean; data: TaskThread }>(`/api/v1/tasks/${task.id}/threads`, body)
        .then((r) => r.data.data),
    onSuccess: (thread) => {
      void qc.invalidateQueries({ queryKey: ['myThreads', task.id] });
      setActiveThread(thread);
      setNewSubject('');
      setNewMessage('');
    },
  });

  async function handleBook() {
    if (!loggedIn) { router.push(`/login?redirect=/tasks/${task.id}`); return; }
    if (isContractor) return;
    setBookingError('');
    setBooking(true);
    try {
      const res = await customerApi.post<{ success: boolean; data: { id: string } }>(
        '/api/v1/orders',
        { task_id: task.id, currency },
      );
      router.push(`/customer/orders/${res.data.data.id}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setBookingError(e.response?.data?.error?.message ?? 'Failed to create order. Please try again.');
      setBooking(false);
    }
  }

  function openMessaging() {
    if (!loggedIn) { setAuthPromptOpen(true); return; }
    setActiveThread(null);
    setMsgOpen(true);
  }

  return (
    <div id="book" className="sticky top-20 space-y-4">
      <Card variant="elevated" className="overflow-hidden">
        <CardBody className="space-y-5">
          {/* Currency selector */}
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            className="w-full px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-400 focus:border-teal-500 focus:outline-none"
          >
            {(['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'SGD', 'CAD'] as Currency[]).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Price */}
          <div>
            <p className="font-display font-bold text-teal-400 text-3xl">
              {sym}{displayPrice.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-1">+ GST ({sym}{gst.toLocaleString()})</p>
            <p className="text-sm text-slate-300 mt-0.5 font-medium">
              Total: {sym}{(displayPrice + gst).toLocaleString()}
            </p>
          </div>

          {/* Time estimate */}
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Clock size={13} className="text-slate-500 shrink-0" />
            {task.hours_min}–{task.hours_max} hours estimated
          </div>

          {/* Delivery */}
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Package size={13} className="text-slate-500 shrink-0" />
            {task.milestone_count === 1 ? 'Single delivery' : `${task.milestone_count} milestone deliveries`}
          </div>

          {bookingError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {bookingError}
            </p>
          )}

          {/* Book button */}
          {isContractor ? (
            <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-center">
              Contractors cannot book tasks
            </div>
          ) : (
            <Button fullWidth size="lg" loading={booking} onClick={() => { void handleBook(); }}>
              {loggedIn ? 'Book This Task' : 'Sign in to Book'}
            </Button>
          )}

          <Button variant="secondary" fullWidth size="sm" onClick={openMessaging}>
            <MessageSquare size={13} className="mr-1.5" />
            Ask a question or scope change
            {!loggedIn && <Lock size={11} className="text-slate-500 ml-auto" />}
          </Button>

          {/* Accepted payment methods — pulled from the supplier's payment_methods.
              The platform doesn't process funds; payment goes directly to the
              supplier on whichever rail they accept. */}
          <AcceptedPaymentMethods methods={task.contractor?.payment_methods} />

          {/* Trust strip */}
          <div className="space-y-2 pt-1 border-t border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Shield size={11} className="text-teal-500 shrink-0" />
              Direct payment to supplier
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock size={11} className="text-teal-500 shrink-0" />
              Fixed-scope delivery
            </div>
            {task.contractor?.is_verified && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Star size={11} className="text-teal-500 shrink-0" />
                KYC-verified expert
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <button className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors mx-auto">
        <Flag size={11} /> Report this listing
      </button>

      {/* ── Messaging modal ──────────────────────────────────────────────── */}
      <Modal
        open={msgOpen}
        onClose={() => { setMsgOpen(false); setActiveThread(null); }}
        title={activeThread ? activeThread.subject : 'Messages'}
        size="lg"
      >
        {activeThread ? (
          <ThreadView
            thread={activeThread}
            currentUserId={user?.id ?? ''}
            onBack={() => setActiveThread(null)}
          />
        ) : (
          <div className="space-y-5">
            {/* Existing threads */}
            {threadsLoading ? (
              <div className="space-y-2">
                <Skeleton height={56} />
                <Skeleton height={56} />
              </div>
            ) : threads.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Your conversations</p>
                {threads.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveThread(t)}
                    className="w-full text-left rounded-xl bg-slate-800/60 border border-slate-700 hover:border-slate-600 p-3.5 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge color={t.type === 'SCOPE_CHANGE' ? 'amber' : 'teal'} className="text-[10px]">
                            {t.type === 'SCOPE_CHANGE' ? 'Scope change' : 'Question'}
                          </Badge>
                          {t.status === 'CLOSED' && <Badge color="slate" className="text-[10px]">Closed</Badge>}
                        </div>
                        <p className="text-sm font-medium text-slate-200 truncate">{t.subject}</p>
                        {t.messages[0] && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{t.messages[0].body}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-600">
                          {t._count.messages} msg{t._count.messages !== 1 ? 's' : ''}
                        </span>
                        <ChevronUp size={14} className="text-slate-600 group-hover:text-slate-400 -rotate-90" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* New thread form */}
            <div className={clsx('space-y-4', threads.length > 0 && 'pt-4 border-t border-slate-800')}>
              <div className="flex items-center gap-2">
                <Plus size={14} className="text-slate-500" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {threads.length > 0 ? 'Start a new conversation' : 'Ask a question or request scope change'}
                </p>
              </div>

              {/* Type */}
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'QUESTION',     label: 'General question' },
                  { value: 'SCOPE_CHANGE', label: 'Scope change request' },
                ] as const).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setNewType(value)}
                    className={clsx(
                      'px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors text-left',
                      newType === value
                        ? 'bg-teal-500/15 border-teal-500/50 text-teal-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 tracking-wide">Subject</label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder={newType === 'QUESTION' ? 'e.g. Clarification on deliverables' : 'e.g. Add DR planning for 3 sites'}
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all"
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 tracking-wide">Message</label>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={4}
                  placeholder={
                    newType === 'QUESTION'
                      ? 'e.g. Does this include documentation? Can you support hybrid cloud environments?'
                      : 'e.g. We need to also include disaster recovery planning for 3 sites...'
                  }
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all resize-none"
                />
              </div>

              {createMutation.isError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  Failed to send. Please try again.
                </p>
              )}

              <Button
                fullWidth
                loading={createMutation.isPending}
                disabled={!newSubject.trim() || newMessage.trim().length < 10}
                onClick={() => {
                  createMutation.mutate({ type: newType, subject: newSubject, message: newMessage });
                }}
              >
                Send message
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Auth prompt modal — shown when not logged in ─────────────────── */}
      <AuthPromptModal
        open={authPromptOpen}
        onClose={() => setAuthPromptOpen(false)}
        taskId={task.id}
        taskTitle={task.title}
        reason="messages"
      />
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TaskDetailSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8 grid lg:grid-cols-[1fr_320px] gap-8">
      <div className="space-y-6">
        <div className="flex gap-2"><Skeleton height={22} width={90} rounded="rounded-full" /><Skeleton height={22} width={110} rounded="rounded-full" /></div>
        <Skeleton height={36} width="80%" />
        <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900">
          <Skeleton height={44} width={44} rounded="rounded-full" />
          <div className="space-y-2 flex-1"><Skeleton height={14} width="40%" /><Skeleton height={12} width="60%" /></div>
        </div>
        <div className="space-y-3">
          <SkeletonText lines={4} />
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4 h-fit">
        <Skeleton height={40} width="60%" />
        <Skeleton height={14} width="40%" />
        <Skeleton height={44} width="100%" rounded="rounded-xl" />
      </div>
    </div>
  );
}

// ─── Main detail content ──────────────────────────────────────────────────────

function TaskDetailContent() {
  const { id } = useParams<{ id: string }>();
  const domainMap = useDomainMap();
  const [tab, setTab] = useState<Tab>('overview');

  const { data: task, isLoading, isError } = useQuery<TaskDetail>({
    queryKey: ['task', id],
    queryFn: async () => {
      const res = await customerApi.get<{ success: boolean; data: TaskDetail }>(
        `/api/v1/tasks/${id}`,
      );
      return res.data.data;
    },
    enabled: !!id,
    staleTime: 60_000,
  });

  const DomainIcon = task ? (DOMAIN_ICONS[task.domain] ?? Settings) : Settings;
  const domainLabel = task ? getDomainLabel(task.domain, domainMap) : '';

  if (isLoading) return <TaskDetailSkeleton />;

  if (isError || !task) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <h2 className="font-display font-bold text-slate-200 text-2xl mb-2">Task not found</h2>
        <p className="text-slate-400 mb-6">This task may have been archived or doesn&apos;t exist.</p>
        <Button asChild variant="secondary">
          <Link href="/tasks">Browse all tasks</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-6">
        <Link href="/tasks" className="hover:text-slate-300 transition-colors no-underline">Tasks</Link>
        <ChevronRight size={12} />
        <span>{domainLabel}</span>
        <ChevronRight size={12} />
        <span className="text-slate-400 truncate max-w-[200px]">{task.title}</span>
      </nav>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
        {/* Left column */}
        <div className="space-y-6 min-w-0">
          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge color="teal">
              <DomainIcon size={11} />
              {domainLabel}
            </Badge>
            {task.contractor?.is_verified && (
              <Badge color="green" dot>Verified Expert</Badge>
            )}
            {task.contractor?.insurance_verified && (
              <Badge color="slate">
                <Shield size={10} /> Insured
              </Badge>
            )}
          </div>

          {/* Title */}
          <h1 className="font-display font-bold text-slate-50 text-2xl sm:text-3xl leading-tight">
            {task.title}
          </h1>

          {/* Contractor card */}
          {task.contractor && (
            <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
              <Initials name={task.contractor.full_name} size={44} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-200">{task.contractor.full_name}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {task.contractor.rating_avg !== null && (
                    <StarRating rating={task.contractor.rating_avg} count={task.contractor.rating_count} />
                  )}
                  <span className="text-xs text-slate-500">{task.contractor.orders_completed} completed orders</span>
                  <div className="flex gap-1">
                    {task.contractor.domains.slice(0, 3).map((d) => (
                      <Badge key={d} color="slate" className="text-[10px] px-1.5 py-0">{getDomainLabel(d, domainMap)}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <TabBar
            active={tab}
            onChange={setTab}
            hasMilestones={task.milestone_count > 1}
          />

          {/* Tab content */}
          <div className="mt-1">
            {tab === 'overview'    && <OverviewTab task={task} />}
            {tab === 'scope'       && <ScopeTab task={task} />}
            {tab === 'milestones'  && task.milestones.length > 0 && <MilestonesTab milestones={task.milestones} />}
            {tab === 'expert'      && <ExpertTab contractor={task.contractor} />}
          </div>
        </div>

        {/* Right column — booking panel */}
        <BookingPanel task={task} />
      </div>
    </div>
  );
}

// ─── AcceptedPaymentMethods ──────────────────────────────────────────────────
// Renders chips for each method the supplier has enabled in their
// `payment_methods` JSON. Returns null when nothing is enabled (or when the
// supplier hasn't configured methods yet) so the panel stays compact.

function AcceptedPaymentMethods({
  methods,
}: {
  methods?: PaymentMethodsPublicView | undefined;
}) {
  if (!methods) return null;

  // Method label only — no account numbers, BSB, SWIFT codes, or emails on the
  // public booking page. Full instructions appear after booking on the
  // customer payment page.
  const items: { key: string; label: string }[] = [];
  if (methods.stripe?.enabled)     items.push({ key: 'stripe',     label: 'Stripe' });
  if (methods.bank_au?.enabled)    items.push({ key: 'bank_au',    label: 'AU bank account' });
  if (methods.bank_swift?.enabled) items.push({ key: 'bank_swift', label: 'SWIFT' });
  if (methods.paypal?.enabled)     items.push({ key: 'paypal',     label: 'PayPal' });
  if (methods.wise?.enabled)       items.push({ key: 'wise',       label: 'Wise' });
  if (methods.other?.enabled)      items.push({ key: 'other',      label: 'Other' });

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
        Accepted payment methods
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map(({ key, label }) => (
          <span
            key={key}
            className="inline-flex items-center px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700 text-xs text-slate-200"
          >
            {label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-600 leading-relaxed">
        Full payment instructions appear after booking. The platform does not
        process or hold funds.
      </p>
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function TaskDetailPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <AppHeader />
      <div className="flex-1">
        <Suspense fallback={<TaskDetailSkeleton />}>
          <TaskDetailContent />
        </Suspense>
      </div>
      <AppFooter />
    </div>
  );
}
