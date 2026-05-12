'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, formatDistanceToNow, differenceInMinutes } from 'date-fns';
import { Send, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatSender {
  id: string;
  full_name: string;
}

interface ChatMessage {
  id: string;
  body: string;
  sender_id: string;
  sender: ChatSender;
  status: string;
  created_at: string;
}

interface ChatData {
  messages: ChatMessage[];
  next_cursor: string | null;
  unread_count: number;
}

interface SseEvent {
  type: string;
  order_id?: string;
  message?: ChatMessage;
}

interface ChatPanelProps {
  orderId: string;
  currentUserId: string;
  currentUserRole: string;
}

// ─── Skeleton bubbles ─────────────────────────────────────────────────────────

function SkeletonBubbles() {
  return (
    <div className="space-y-4 p-4">
      {[true, false, true].map((isRight, i) => (
        <div
          key={i}
          className={clsx('flex gap-2', isRight ? 'justify-end' : 'justify-start')}
        >
          <div
            className={clsx(
              'h-12 rounded-2xl animate-pulse bg-slate-800',
              isRight ? 'w-48' : 'w-64',
            )}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Countdown timer for retract window ───────────────────────────────────────

function RetractCountdown({ createdAt }: { createdAt: string }) {
  const [remaining, setRemaining] = useState<number>(() => {
    const elapsed = differenceInMinutes(new Date(), new Date(createdAt));
    return Math.max(0, 5 - elapsed);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = differenceInMinutes(new Date(), new Date(createdAt));
      const rem = Math.max(0, 5 - elapsed);
      setRemaining(rem);
      if (rem === 0) clearInterval(interval);
    }, 10_000);
    return () => clearInterval(interval);
  }, [createdAt]);

  if (remaining <= 0) return null;

  return (
    <span className="text-[10px] text-slate-600 ml-1">({remaining}m left to retract)</span>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isMine,
  retractingId,
  onRetract,
}: {
  msg: ChatMessage;
  isMine: boolean;
  retractingId: string | null;
  onRetract: (id: string) => void;
}) {
  const isRetracted = msg.status === 'RETRACTED';
  const createdDate = new Date(msg.created_at);
  const minutesAgo = differenceInMinutes(new Date(), createdDate);
  const canRetract = isMine && !isRetracted && minutesAgo < 5;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={clsx('flex gap-2 group', isMine ? 'justify-end' : 'justify-start')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!isMine && (
        <div className="w-7 h-7 rounded-full bg-teal-500/20 flex items-center justify-center text-xs font-bold text-teal-400 shrink-0 mt-1">
          {msg.sender?.full_name?.[0] ?? '?'}
        </div>
      )}

      <div className={clsx('max-w-[70%] space-y-1', isMine ? 'items-end' : 'items-start', 'flex flex-col')}>
        {/* Sender name */}
        <p className={clsx('text-[10px] font-medium', isMine ? 'text-right text-slate-500' : 'text-slate-500')}>
          {msg.sender?.full_name ?? 'Unknown'}
        </p>

        {/* Bubble */}
        <div
          className={clsx(
            'px-3 py-2 rounded-2xl text-sm',
            isMine
              ? 'bg-slate-700 text-slate-100 rounded-tr-sm'
              : 'bg-teal-500/20 border border-teal-500/30 text-slate-100 rounded-tl-sm',
            isRetracted && 'opacity-60',
          )}
        >
          {isRetracted ? (
            <span className="italic text-slate-500">[Message retracted]</span>
          ) : (
            <p className="whitespace-pre-wrap">{msg.body}</p>
          )}
        </div>

        {/* Meta row */}
        <div className={clsx('flex items-center gap-1.5', isMine ? 'flex-row-reverse' : 'flex-row')}>
          <time
            className="text-[10px] text-slate-600"
            title={format(createdDate, 'PPpp')}
          >
            {formatDistanceToNow(createdDate, { addSuffix: true })}
          </time>

          {canRetract && (
            <RetractCountdown createdAt={msg.created_at} />
          )}

          {/* Retract button — visible on hover for own messages within window */}
          {canRetract && hovered && (
            <button
              type="button"
              onClick={() => onRetract(msg.id)}
              disabled={retractingId === msg.id}
              className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              title="Retract message"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

export default function ChatPanel({ orderId, currentUserId, currentUserRole: _currentUserRole }: ChatPanelProps) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [retractingId, setRetractingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch messages
  const { data: chatData, isLoading } = useQuery({
    queryKey: ['order-chat', orderId],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: ChatData }>(`/api/v1/orders/${orderId}/chat?limit=50`)
        .then((r) => r.data.data),
    refetchInterval: 10_000,
  });

  // Sync fetched messages into local state
  useEffect(() => {
    if (chatData?.messages) {
      setMessages(chatData.messages);
    }
  }, [chatData]);

  // Auto-scroll helper
  const scrollToBottom = useCallback((force = false) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (force || distanceFromBottom < 200) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length, scrollToBottom]);

  // SSE connection
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    const es = new EventSource(`${apiUrl}/api/v1/sse`);

    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as SseEvent;
        if (parsed.type === 'chat_message' && parsed.order_id === orderId && parsed.message) {
          setMessages((prev) => {
            const alreadyExists = prev.some((m) => m.id === parsed.message!.id);
            if (alreadyExists) return prev;
            return [...prev, parsed.message!];
          });
          scrollToBottom();
        }
      } catch {
        // Ignore parse errors
      }
    };

    return () => es.close();
  }, [orderId, scrollToBottom]);

  // Send message mutation
  const { mutate: sendMessage, isPending: sending } = useMutation({
    mutationFn: (body: string) =>
      customerApi
        .post<{ success: boolean; data: ChatMessage }>(
          `/api/v1/orders/${orderId}/chat`,
          { body },
        )
        .then((r) => r.data.data),
    onSuccess: (msg) => {
      setMessages((prev) => {
        const alreadyExists = prev.some((m) => m.id === msg.id);
        if (alreadyExists) return prev;
        return [...prev, msg];
      });
      setNewMessage('');
      scrollToBottom(true);
      void queryClient.invalidateQueries({ queryKey: ['order-chat', orderId] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Failed to send message.');
    },
  });

  // Retract mutation
  const { mutate: retractMessage } = useMutation({
    mutationFn: (messageId: string) =>
      customerApi.delete(`/api/v1/orders/${orderId}/chat/${messageId}`),
    onMutate: (messageId) => setRetractingId(messageId),
    onSuccess: (_data, messageId) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status: 'RETRACTED' } : m)),
      );
      setRetractingId(null);
      toast.success('Message retracted.');
    },
    onError: (err: unknown) => {
      setRetractingId(null);
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Failed to retract message.');
    },
  });

  function handleSend() {
    const trimmed = newMessage.trim();
    if (!trimmed || sending) return;
    void sendMessage(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const charCount = newMessage.length;
  const charOverLimit = charCount > 1800;

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto max-h-96 space-y-3 p-1 pr-2"
      >
        {isLoading ? (
          <SkeletonBubbles />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-slate-500">No messages yet. Start the conversation.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isMine={msg.sender_id === currentUserId}
              retractingId={retractingId}
              onRetract={(id) => { void retractMessage(id); }}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose area */}
      <div className="mt-4 space-y-2">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder="Type a message… (Ctrl+Enter to send)"
            className={clsx(
              'w-full px-3 py-2.5 bg-slate-800 border rounded-xl text-slate-200 text-sm placeholder-slate-600 focus:ring-1 focus:outline-none transition-all resize-none',
              charOverLimit
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                : 'border-slate-700 focus:border-teal-500 focus:ring-teal-500/20',
            )}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className={clsx('text-xs', charOverLimit ? 'text-red-400 font-medium' : 'text-slate-600')}>
            {charCount > 0 ? `${charCount}/2000` : ''}
          </p>
          <Button
            size="sm"
            loading={sending}
            disabled={!newMessage.trim() || charOverLimit}
            onClick={handleSend}
          >
            <Send size={13} className="mr-1" />
            Send
          </Button>
        </div>

        {/* Security notice */}
        <p className="text-[10px] text-slate-600 text-center">
          💡 For sensitive credentials, use the Credential Vault tab — not chat.
        </p>
      </div>
    </div>
  );
}
