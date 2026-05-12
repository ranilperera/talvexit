'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { MessageSquare, Send, ChevronLeft, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import customerApi from '@/lib/customer-api';
import { getUser } from '@/lib/customer-auth';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, currentUserId }: { msg: ThreadMessage; currentUserId: string }) {
  const isMe = msg.sender.id === currentUserId;
  return (
    <div className={clsx('flex gap-2.5', isMe ? 'flex-row-reverse' : 'flex-row')}>
      <div className="w-7 h-7 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center shrink-0 text-[10px] font-bold text-teal-400">
        {msg.sender.full_name[0]?.toUpperCase()}
      </div>
      <div className={clsx('max-w-[75%] flex flex-col', isMe ? 'items-end' : 'items-start')}>
        <div className={clsx(
          'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
          isMe
            ? 'bg-teal-500/20 text-teal-100 rounded-tr-sm'
            : 'bg-slate-800 text-slate-200 rounded-tl-sm',
        )}>
          {msg.body}
        </div>
        <p className="text-[10px] text-slate-600 mt-1 px-1">
          {msg.sender.full_name} · {new Date(msg.created_at).toLocaleString('en-AU', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}

// ─── Thread detail pane ───────────────────────────────────────────────────────

function ThreadPane({
  threadId,
  currentUserId,
  onClose,
}: {
  threadId: string;
  currentUserId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reply, setReply] = useState('');

  const { data: thread, isLoading } = useQuery<TaskThread>({
    queryKey: ['thread', threadId],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: TaskThread }>(`/api/v1/threads/${threadId}`)
        .then((r) => r.data.data),
    refetchInterval: 15_000,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      customerApi.post(`/api/v1/threads/${threadId}/messages`, { body }),
    onSuccess: () => {
      setReply('');
      void qc.invalidateQueries({ queryKey: ['thread', threadId] });
      void qc.invalidateQueries({ queryKey: ['contractorThreads'] });
    },
    onError: () => toast.error('Failed to send message.'),
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread?.messages.length]);

  return (
    <div className="flex flex-col h-full">
      {/* Pane header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors md:hidden"
        >
          <ChevronLeft size={16} />
        </button>
        {isLoading ? (
          <Skeleton height={20} width={200} />
        ) : thread ? (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-slate-100 text-sm truncate">{thread.subject}</span>
              <Badge color={thread.type === 'SCOPE_CHANGE' ? 'amber' : 'teal'} className="text-[10px] shrink-0">
                {thread.type === 'SCOPE_CHANGE' ? 'Scope change' : 'Question'}
              </Badge>
              {thread.status === 'CLOSED' && <Badge color="slate" className="text-[10px] shrink-0">Closed</Badge>}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              From <span className="text-slate-400">{thread.customer.full_name}</span>
              {' · '}re: <span className="text-slate-400 truncate">{thread.task.title}</span>
            </p>
          </div>
        ) : null}
        <button
          onClick={() => { void qc.invalidateQueries({ queryKey: ['thread', threadId] }); }}
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-slate-800 transition-colors shrink-0"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} height={52} />)}
          </div>
        ) : thread?.messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} currentUserId={currentUserId} />
        ))}
      </div>

      {/* Reply box */}
      {thread?.status === 'OPEN' && (
        <div className="px-5 py-4 border-t border-slate-800 shrink-0">
          <div className="flex gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && reply.trim()) {
                  e.preventDefault();
                  sendMutation.mutate(reply.trim());
                }
              }}
              rows={3}
              placeholder="Type your reply… (Ctrl+Enter to send)"
              className="flex-1 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all resize-none"
            />
            <button
              onClick={() => { if (reply.trim()) sendMutation.mutate(reply.trim()); }}
              disabled={!reply.trim() || sendMutation.isPending}
              className="self-end p-3 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-950 shrink-0"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Thread list item ─────────────────────────────────────────────────────────

function ThreadItem({
  thread,
  isActive,
  onClick,
}: {
  thread: TaskThread;
  isActive: boolean;
  onClick: () => void;
}) {
  const lastMsg = thread.messages[0];
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-4 py-3.5 border-b border-slate-800/60 transition-colors',
        isActive ? 'bg-teal-500/5 border-l-2 border-l-teal-500' : 'hover:bg-slate-800/40',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0 mt-0.5">
          {thread.customer.full_name[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-sm font-medium text-slate-200 truncate">{thread.customer.full_name}</span>
            <span className="text-[10px] text-slate-600 shrink-0">{timeAgo(thread.updated_at)}</span>
          </div>
          <p className="text-xs text-slate-400 truncate">{thread.subject}</p>
          {lastMsg && (
            <p className="text-xs text-slate-600 truncate mt-0.5">{lastMsg.body}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5">
            <Badge color={thread.type === 'SCOPE_CHANGE' ? 'amber' : 'teal'} className="text-[10px]">
              {thread.type === 'SCOPE_CHANGE' ? 'Scope change' : 'Question'}
            </Badge>
            {thread.status === 'CLOSED' && <Badge color="slate" className="text-[10px]">Closed</Badge>}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContractorMessagesPage() {
  const user = getUser();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'QUESTION' | 'SCOPE_CHANGE'>('ALL');

  const { data: tasksData, isLoading: tasksLoading } = useQuery<{ tasks: { id: string; title: string; domain: string; status: string }[] }>({
    queryKey: ['contractorTasks'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { tasks: { id: string; title: string; domain: string; status: string }[] } }>('/api/v1/tasks/my')
        .then((r) => r.data.data),
  });

  const publishedTasks = (tasksData?.tasks ?? []).filter((t) => t.status === 'PUBLISHED');

  const { data: allThreadsData, isLoading: threadsLoading, refetch } = useQuery<TaskThread[]>({
    queryKey: ['contractorThreads', publishedTasks.map((t) => t.id).join(',')],
    queryFn: async () => {
      if (publishedTasks.length === 0) return [];
      const results = await Promise.all(
        publishedTasks.map(async (task) => {
          try {
            const res = await customerApi.get<{ success: boolean; data: { threads: TaskThread[] } }>(
              `/api/v1/tasks/${task.id}/threads`,
            );
            return res.data.data.threads;
          } catch {
            return [];
          }
        }),
      );
      return results.flat();
    },
    enabled: publishedTasks.length > 0,
    staleTime: 30_000,
  });

  const allThreads = allThreadsData ?? [];

  const filtered = allThreads.filter((t) => {
    if (filterType !== 'ALL' && t.type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.subject.toLowerCase().includes(q) ||
        t.customer.full_name.toLowerCase().includes(q) ||
        t.task.title.toLowerCase().includes(q)
      );
    }
    return true;
  }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const isLoading = tasksLoading || threadsLoading;

  return (
    <div className="h-screen flex flex-col">
      <div className="px-6 py-5 border-b border-slate-800 shrink-0">
        <h1 className="font-bold text-xl text-slate-100">Messages</h1>
        <p className="text-slate-400 text-sm mt-0.5">Pre-booking questions and scope change requests from customers</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Left: thread list ──────────────────────────────────────────── */}
        <div className={clsx(
          'w-full md:w-80 shrink-0 border-r border-slate-800 flex flex-col',
          activeThreadId ? 'hidden md:flex' : 'flex',
        )}>
          <div className="p-3 space-y-2 border-b border-slate-800">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="w-full pl-8 pr-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 focus:border-teal-500 outline-none transition-colors"
              />
            </div>
            <div className="flex gap-1">
              {(['ALL', 'QUESTION', 'SCOPE_CHANGE'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                    filterType === f
                      ? 'bg-teal-500/15 text-teal-400'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800',
                  )}
                >
                  {f === 'ALL' ? 'All' : f === 'QUESTION' ? 'Questions' : 'Scope changes'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} height={72} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                <MessageSquare size={28} className="text-slate-700 mb-3" />
                <p className="text-slate-500 text-sm">
                  {allThreads.length === 0
                    ? 'No messages yet. Customers will reach out here before booking.'
                    : 'No conversations match your filter.'}
                </p>
                {publishedTasks.length === 0 && (
                  <p className="text-xs text-slate-600 mt-2">Publish a task listing to start receiving messages.</p>
                )}
              </div>
            ) : filtered.map((t) => (
              <ThreadItem
                key={t.id}
                thread={t}
                isActive={activeThreadId === t.id}
                onClick={() => setActiveThreadId(t.id)}
              />
            ))}
          </div>

          <div className="p-3 border-t border-slate-800 shrink-0">
            <Button variant="secondary" size="sm" fullWidth onClick={() => { void refetch(); }}>
              <RefreshCw size={12} className="mr-1.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* ── Right: thread detail ───────────────────────────────────────── */}
        <div className={clsx(
          'flex-1 flex flex-col',
          !activeThreadId ? 'hidden md:flex' : 'flex',
        )}>
          {activeThreadId ? (
            <ThreadPane
              threadId={activeThreadId}
              currentUserId={user?.id ?? ''}
              onClose={() => setActiveThreadId(null)}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div className="h-14 w-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-4">
                <MessageSquare size={24} className="text-teal-500" />
              </div>
              <p className="text-slate-300 font-medium">Select a conversation</p>
              <p className="text-slate-600 text-sm mt-1">
                {filtered.length > 0 ? 'Choose a message from the list to view the conversation.' : 'No conversations yet.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
