'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { format } from 'date-fns';
import {
  Plus,
  ArrowRight,
  Inbox,
  Send as SendIcon,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import { namespacedPath } from '@/lib/namespace';
import { getUser } from '@/lib/customer-auth';

// ─── Types ───────────────────────────────────────────────────────────────────

type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  total_cents: number;
  currency: string;
  due_date: string | null;
  paid_at: string | null;
  sent_at: string | null;
  created_at: string;
  from_user?: { id: string; full_name: string; email: string } | null;
  from_company?: { id: string; company_name: string } | null;
  to_user?: { id: string; full_name: string; email: string } | null;
  to_company?: { id: string; company_name: string } | null;
  payment_evidence?: {
    id: string;
    status: 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';
    payment_method: string;
    amount_cents: number;
    currency: string;
  }[];
}

const STATUS_COLOR: Record<
  InvoiceStatus,
  'green' | 'amber' | 'red' | 'slate' | 'teal'
> = {
  DRAFT: 'slate',
  OPEN: 'amber',
  PAID: 'green',
  VOID: 'slate',
  UNCOLLECTIBLE: 'red',
};

function fmtMoney(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function isOverdue(inv: InvoiceRow): boolean {
  if (inv.status !== 'OPEN' || !inv.due_date) return false;
  return new Date(inv.due_date) < new Date();
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  // The page is mounted at /invoices, /contractor/invoices, and
  // /company/invoices via re-exports. Use the current pathname's prefix so
  // row clicks + "New invoice" stay inside whichever chrome the user
  // entered through. Namespace logic centralised in lib/namespace.ts so
  // adding a new chrome doesn't require editing every shared page.
  const pathname = usePathname() ?? '';
  const basePath = namespacedPath(pathname, 'invoices');

  // Customer accounts can only ever RECEIVE invoices — they never issue them.
  // Hide the "Sent" tab and the "New invoice" CTA for customers, skip the
  // sent fetch entirely (the API returns an empty list anyway, but skipping
  // also dodges a needless network call on every page load).
  const [accountType, setAccountType] = useState<string | null>(null);
  useEffect(() => {
    setAccountType(getUser()?.account_type ?? null);
  }, []);
  const isCustomer = accountType === 'CUSTOMER';

  const [tab, setTab] = useState<'sent' | 'received'>('received');
  const [sent, setSent] = useState<InvoiceRow[]>([]);
  const [received, setReceived] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (custOnly: boolean) => {
    try {
      if (custOnly) {
        // Customer-only path: fetch received only.
        const r = await customerApi.get<{ success: boolean; data: InvoiceRow[] }>(
          '/api/v1/service-invoices/received',
        );
        setSent([]);
        setReceived(r.data.data);
      } else {
        const [s, r] = await Promise.all([
          customerApi.get<{ success: boolean; data: InvoiceRow[] }>(
            '/api/v1/service-invoices/sent',
          ),
          customerApi.get<{ success: boolean; data: InvoiceRow[] }>(
            '/api/v1/service-invoices/received',
          ),
        ]);
        setSent(s.data.data);
        setReceived(r.data.data);
        // Pick the tab that has data; default to received if both empty
        if (s.data.data.length > 0 && r.data.data.length === 0) setTab('sent');
      }
    } catch {
      toast.error('Failed to load invoices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accountType === null) return; // still resolving
    void fetchAll(isCustomer);
  }, [fetchAll, accountType, isCustomer]);

  const data = tab === 'sent' ? sent : received;

  const overdueCount = useMemo(
    () => received.filter((r) => isOverdue(r)).length,
    [received],
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">
            Invoices
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isCustomer
              ? 'Invoices issued to you by service providers. Each invoice is paid directly to the provider per the instructions on the invoice — the platform tracks the engagement and stores your payment confirmations for audit.'
              : 'Direct invoices between service providers and clients. Payments are made off-platform — the platform tracks evidence and confirmations.'}
          </p>
        </div>
        {/* Customers never issue invoices — hide the "New invoice" CTA. */}
        {!isCustomer && (
          <Button asChild variant="primary" size="md">
            <Link href={`${basePath}/create`}>
              <Plus size={14} />
              New invoice
            </Link>
          </Button>
        )}
      </div>

      {overdueCount > 0 && tab === 'received' && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-amber-300">
            You have {overdueCount} overdue invoice{overdueCount === 1 ? '' : 's'}.
            Pay or submit evidence to keep your account in good standing.
          </div>
        </div>
      )}

      {/* Tabs — Customers only see "Received" since they don't issue invoices. */}
      {!isCustomer && (
        <div className="inline-flex items-center gap-1 rounded-xl bg-slate-900 border border-slate-800 p-1">
          <TabButton
            active={tab === 'received'}
            onClick={() => setTab('received')}
            icon={Inbox}
            label="Received"
            count={received.length}
          />
          <TabButton
            active={tab === 'sent'}
            onClick={() => setTab('sent')}
            icon={SendIcon}
            label="Sent"
            count={sent.length}
          />
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        {loading ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">Loading…</p>
        ) : data.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">
            {tab === 'sent'
              ? "You haven't sent any invoices yet."
              : "You haven't received any invoices yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3 font-semibold">Invoice</th>
                  <th className="px-5 py-3 font-semibold">
                    {tab === 'sent' ? 'To' : 'From'}
                  </th>
                  <th className="px-5 py-3 font-semibold text-right">Amount</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Due / Paid</th>
                </tr>
              </thead>
              <tbody>
                {data.map((inv) => {
                  const overdue = isOverdue(inv);
                  const counterparty =
                    tab === 'sent'
                      ? inv.to_company
                        ? inv.to_company.company_name
                        : inv.to_user?.full_name ?? '—'
                      : inv.from_company
                        ? inv.from_company.company_name
                        : inv.from_user?.full_name ?? '—';
                  const counterpartyEmail =
                    tab === 'sent' ? inv.to_user?.email : inv.from_user?.email;

                  // Most recent evidence (if any)
                  const latestEvidence = inv.payment_evidence?.[0];

                  return (
                    <tr
                      key={inv.id}
                      className="border-b border-slate-800/40 last:border-b-0 hover:bg-slate-800/30 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`${basePath}/${inv.id}`}
                          className="block no-underline"
                        >
                          <div className="font-mono text-xs text-slate-300">
                            {inv.invoice_number}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Created {format(new Date(inv.created_at), 'd MMM yyyy')}
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`${basePath}/${inv.id}`}
                          className="block no-underline"
                        >
                          <div className="text-slate-200">{counterparty}</div>
                          {counterpartyEmail && (
                            <div className="text-[11px] text-slate-500">
                              {counterpartyEmail}
                            </div>
                          )}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`${basePath}/${inv.id}`}
                          className="block no-underline tabular-nums text-slate-200"
                        >
                          {fmtMoney(inv.total_cents, inv.currency)}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`${basePath}/${inv.id}`}
                          className="inline-flex items-center gap-1.5 no-underline"
                        >
                          <Badge color={STATUS_COLOR[inv.status]}>
                            {inv.status}
                          </Badge>
                          {overdue && <Badge color="red">Overdue</Badge>}
                          {latestEvidence?.status === 'SUBMITTED' && (
                            <Badge color="amber">Evidence pending</Badge>
                          )}
                          {latestEvidence?.status === 'REJECTED' && (
                            <Badge color="red">Evidence rejected</Badge>
                          )}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`${basePath}/${inv.id}`}
                          className="block no-underline text-xs"
                        >
                          {inv.status === 'PAID' && inv.paid_at ? (
                            <span className="text-slate-300">
                              Paid {format(new Date(inv.paid_at), 'd MMM yyyy')}
                            </span>
                          ) : inv.due_date ? (
                            <span
                              className={
                                overdue ? 'text-red-400' : 'text-slate-400'
                              }
                            >
                              Due {format(new Date(inv.due_date), 'd MMM yyyy')}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-600">
        Looking for subscription billing?{' '}
        <Link href="/billing" className="text-teal-400 hover:text-teal-300 underline">
          Go to billing dashboard
        </Link>
        <ArrowRight size={11} className="inline ml-1" />
      </p>
    </div>
  );
}

// ─── Tab button ─────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-slate-800 text-slate-100'
          : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      <Icon size={14} />
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
          active ? 'bg-teal-500 text-slate-950' : 'bg-slate-700 text-slate-400'
        }`}
      >
        {count}
      </span>
    </button>
  );
}
