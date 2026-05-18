'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft, Mail, Phone, Clock, Send, AlertTriangle, CheckCircle2,
  StickyNote, Trash2, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import adminApi from '@/lib/api';

type Status = 'NEW' | 'IN_PROGRESS' | 'RESPONDED' | 'CLOSED' | 'SPAM';

interface ResponseRow {
  id: string;
  subject: string;
  body: string;
  sent_at: string;
  sent_by: { id: string; full_name: string; email: string };
}

interface NoteRow {
  id: string;
  body: string;
  created_at: string;
  author: { id: string; full_name: string; email: string };
}

interface EnquiryDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  enquiry_type: string;
  message: string;
  ip_address: string | null;
  user_agent: string | null;
  status: Status;
  admin_notes: string | null; // legacy; not edited from this UI
  responded_at: string | null;
  responded_by: { id: string; full_name: string } | null;
  created_at: string;
  updated_at: string;
  responses: ResponseRow[];
  notes: NoteRow[];
}

const STATUSES: Status[] = ['NEW', 'IN_PROGRESS', 'RESPONDED', 'CLOSED', 'SPAM'];

const STATUS_STYLE: Record<Status, { label: string; bg: string; text: string; border: string }> = {
  NEW:         { label: 'New',         bg: 'bg-teal-500/15',    text: 'text-teal-300',    border: 'border-teal-500/30' },
  IN_PROGRESS: { label: 'In progress', bg: 'bg-blue-500/15',    text: 'text-blue-300',    border: 'border-blue-500/30' },
  RESPONDED:   { label: 'Responded',   bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  CLOSED:      { label: 'Closed',      bg: 'bg-slate-700/50',   text: 'text-slate-400',   border: 'border-slate-600' },
  SPAM:        { label: 'Spam',        bg: 'bg-red-500/15',     text: 'text-red-300',     border: 'border-red-500/30' },
};

export default function ContactEnquiryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-contact-enquiry', id],
    queryFn: async () => {
      const res = await adminApi.get<{ success: boolean; data: EnquiryDetail }>(
        `/api/v1/admin/contact-enquiries/${id}`,
      );
      return res.data.data;
    },
  });

  const [status, setStatus] = useState<Status>('NEW');
  const [savingStatus, setSavingStatus] = useState(false);

  // Notes thread composer
  const [noteDraft, setNoteDraft] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Reply composer
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!data) return;
    setStatus(data.status);
    if (!subject && data.enquiry_type) {
      setSubject(`Re: ${data.enquiry_type}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  async function saveStatus(newStatus: Status) {
    if (!data || newStatus === data.status) return;
    setSavingStatus(true);
    try {
      await adminApi.patch(`/api/v1/admin/contact-enquiries/${id}`, { status: newStatus });
      toast.success(`Status set to ${STATUS_STYLE[newStatus].label}`);
      await queryClient.invalidateQueries({ queryKey: ['admin-contact-enquiry', id] });
      await queryClient.invalidateQueries({ queryKey: ['admin-contact-enquiries'] });
    } catch {
      toast.error('Could not update status. Try again.');
      // Revert local state to last-known server value
      if (data) setStatus(data.status);
    } finally {
      setSavingStatus(false);
    }
  }

  async function addNote() {
    const trimmed = noteDraft.trim();
    if (trimmed.length < 1) {
      toast.error('Add some text before saving.');
      return;
    }
    setAddingNote(true);
    try {
      await adminApi.post(`/api/v1/admin/contact-enquiries/${id}/notes`, { body: trimmed });
      setNoteDraft('');
      toast.success('Note added to thread');
      await queryClient.invalidateQueries({ queryKey: ['admin-contact-enquiry', id] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Could not save note. Try again.');
    } finally {
      setAddingNote(false);
    }
  }

  async function deleteNote(noteId: string) {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    try {
      await adminApi.delete(`/api/v1/admin/contact-enquiries/${id}/notes/${noteId}`);
      toast.success('Note removed');
      await queryClient.invalidateQueries({ queryKey: ['admin-contact-enquiry', id] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Could not delete note.');
    }
  }

  async function sendReply() {
    if (!data) return;
    if (subject.trim().length < 3 || bodyText.trim().length < 10) {
      toast.error('Subject and body are required (subject ≥ 3 chars, body ≥ 10).');
      return;
    }
    setSending(true);
    try {
      await adminApi.post(`/api/v1/admin/contact-enquiries/${id}/responses`, {
        subject: subject.trim(),
        body: bodyText.trim(),
      });
      toast.success(`Reply sent to ${data.email}`);
      setSubject(`Re: ${data.enquiry_type}`);
      setBodyText('');
      await queryClient.invalidateQueries({ queryKey: ['admin-contact-enquiry', id] });
      await queryClient.invalidateQueries({ queryKey: ['admin-contact-enquiries'] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Could not send reply. Try again.');
    } finally {
      setSending(false);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="h-96 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <AlertTriangle size={32} className="text-amber-400 mx-auto mb-3" />
        <p className="text-sm text-slate-400">Enquiry not found.</p>
        <button
          type="button"
          onClick={() => router.push('/admin/contact-enquiries')}
          className="mt-4 text-sm text-teal-400 hover:underline"
        >
          ← Back to list
        </button>
      </div>
    );
  }

  const s = STATUS_STYLE[data.status];

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {/* Back */}
      <Link
        href="/admin/contact-enquiries"
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-4"
      >
        <ArrowLeft size={12} /> Back to enquiries
      </Link>

      {/* Header card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-slate-100">{data.name}</h1>
              <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.bg} ${s.text} ${s.border}`}>
                {s.label}
              </span>
            </div>
            <p className="text-xs text-slate-500">{data.enquiry_type}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-slate-400">
          <a href={`mailto:${data.email}`} className="inline-flex items-center gap-1.5 text-slate-300 hover:text-teal-300 no-underline">
            <Mail size={12} /> {data.email}
          </a>
          {data.phone && (
            <a href={`tel:${data.phone}`} className="inline-flex items-center gap-1.5 text-slate-300 hover:text-teal-300 no-underline">
              <Phone size={12} /> {data.phone}
            </a>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Clock size={12} /> {new Date(data.created_at).toLocaleString('en-AU')}
          </span>
          {data.responded_by && (
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 size={12} /> Responded by {data.responded_by.full_name}
            </span>
          )}
        </div>
      </div>

      {/* Original message */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Message</h2>
        <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{data.message}</div>
        {(data.ip_address || data.user_agent) && (
          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 space-y-0.5">
            {data.ip_address && <div>IP: <span className="font-mono">{data.ip_address}</span></div>}
            {data.user_agent && <div className="truncate">UA: <span className="font-mono">{data.user_agent}</span></div>}
          </div>
        )}
      </div>

      {/* Response history */}
      {data.responses.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Replies sent ({data.responses.length})
          </h2>
          <div className="space-y-4">
            {data.responses.map((r) => (
              <div key={r.id} className="border border-slate-800 rounded-lg p-4 bg-slate-950/40">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <div className="text-sm font-medium text-slate-200 truncate">{r.subject}</div>
                  <div className="text-[11px] text-slate-500 shrink-0">
                    {new Date(r.sent_at).toLocaleString('en-AU')} · {r.sent_by.full_name}
                  </div>
                </div>
                <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{r.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status — auto-saves on change */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Triage</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Status {savingStatus && <span className="text-slate-500">· saving…</span>}
            </label>
            <select
              value={status}
              onChange={(e) => {
                const v = e.target.value as Status;
                setStatus(v);
                void saveStatus(v);
              }}
              disabled={savingStatus}
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-teal-500 disabled:opacity-50"
            >
              {STATUSES.map((st) => <option key={st} value={st}>{STATUS_STYLE[st].label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Internal notes thread (admin-only — not emailed) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
          <StickyNote size={12} /> Internal notes ({data.notes.length})
          <span className="ml-2 font-normal normal-case text-[10px] text-slate-600">
            Visible to admins only · not sent to enquirer
          </span>
        </h2>

        {/* Composer */}
        <div className="space-y-2 mb-4">
          <textarea
            rows={3}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a note for the team — actions taken, context, follow-up reminders…"
            maxLength={5000}
            className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 outline-none resize-y focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-600">{noteDraft.length} / 5000</span>
            <button
              type="button"
              onClick={() => { void addNote(); }}
              disabled={addingNote || noteDraft.trim().length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-500/15 text-teal-300 border border-teal-500/30 hover:bg-teal-500/25 disabled:opacity-50"
            >
              <Plus size={12} /> {addingNote ? 'Adding…' : 'Add note'}
            </button>
          </div>
        </div>

        {/* Legacy single-field admin_notes — show as a banner if present so
            anything written before the threaded model isn't invisible. */}
        {data.admin_notes && data.admin_notes.trim().length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-200/90">
            <strong className="text-amber-300">Legacy note (single field):</strong>
            <div className="mt-1 whitespace-pre-wrap text-amber-100/80">{data.admin_notes}</div>
          </div>
        )}

        {/* Thread */}
        {data.notes.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No notes yet. Add one above to start a thread.</p>
        ) : (
          <div className="space-y-3">
            {data.notes.map((n) => (
              <div key={n.id} className="border border-slate-800 rounded-lg p-3 bg-slate-950/40 group">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="text-[11px] text-slate-500">
                    <span className="text-slate-300 font-medium">{n.author.full_name}</span>
                    <span className="mx-1.5">·</span>
                    {new Date(n.created_at).toLocaleString('en-AU')}
                  </div>
                  <button
                    type="button"
                    onClick={() => { void deleteNote(n.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                    title="Delete note"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{n.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply composer */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Reply to {data.email}
        </h2>
        <div className="space-y-3">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            maxLength={200}
            className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
          />
          <textarea
            rows={8}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            placeholder={`Hi ${data.name.split(' ')[0]},\n\nThanks for reaching out…`}
            maxLength={10000}
            className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 outline-none resize-y focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
          />
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>The reply is sent via the platform email service and recorded against this enquiry.</span>
            <span>{bodyText.length} / 10000</span>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={() => { void sendReply(); }}
            disabled={sending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-50"
          >
            <Send size={14} /> {sending ? 'Sending…' : 'Send reply'}
          </button>
        </div>
      </div>
    </div>
  );
}
