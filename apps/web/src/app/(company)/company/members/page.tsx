'use client';

import { useState, useEffect, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { UserPlus } from 'lucide-react';
import customerApi from '@/lib/customer-api';
import { getUser } from '@/lib/customer-auth';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { InviteModal } from './InviteModal';
import { PageContainer } from '@/components/layout/PageContainer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  user_id: string;
  full_name: string;
  email: string;
  role: 'COMPANY_ADMIN' | 'SENIOR_CONSULTANT' | 'CONSULTANT' | 'JUNIOR_CONSULTANT';
  job_title: string | null;
  domains: string[];
  completed_orders_count: number;
  joined_at: string;
  status: 'ACTIVE' | 'REMOVED';
  is_primary_admin: boolean;
}

interface Invitation {
  id: string;
  invited_email: string;
  role: string;
  job_title: string | null;
  invited_by_name: string;
  created_at: string;
  expires_at: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
}

type Role = Member['role'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function roleBadge(role: Role) {
  switch (role) {
    case 'COMPANY_ADMIN':
      return <Badge color="teal">Admin</Badge>;
    case 'SENIOR_CONSULTANT':
      return <Badge color="blue">Senior</Badge>;
    case 'CONSULTANT':
      return <Badge color="slate">Consultant</Badge>;
    case 'JUNIOR_CONSULTANT':
      return <Badge color="slate">Junior</Badge>;
  }
}

function inviteStatusBadge(status: Invitation['status']) {
  switch (status) {
    case 'PENDING':
      return <Badge color="amber" dot>Pending</Badge>;
    case 'ACCEPTED':
      return <Badge color="teal">Accepted</Badge>;
    case 'EXPIRED':
      return <Badge color="slate">Expired</Badge>;
    case 'REVOKED':
      return <Badge color="red">Revoked</Badge>;
  }
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'COMPANY_ADMIN',      label: 'Admin' },
  { value: 'SENIOR_CONSULTANT',  label: 'Senior Consultant' },
  { value: 'CONSULTANT',         label: 'Consultant' },
  { value: 'JUNIOR_CONSULTANT',  label: 'Junior Consultant' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoleModal({
  member,
  onClose,
  onSuccess,
}: {
  member: Member;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [role, setRole] = useState<Role>(member.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleUpdate() {
    setLoading(true);
    setError('');
    try {
      await customerApi.patch(`/api/v1/companies/me/members/${member.user_id}/role`, { role });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to update role.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Change Role for ${member.full_name}`} size="sm">
      <div className="space-y-4">
        <div className="space-y-2">
          {ROLE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all
                border-slate-700 hover:border-slate-600 has-[:checked]:border-teal-500/50 has-[:checked]:bg-teal-500/5"
            >
              <input
                type="radio"
                name="role"
                value={opt.value}
                checked={role === opt.value}
                onChange={() => setRole(opt.value)}
                className="accent-teal-500"
              />
              <span className="text-sm text-slate-200">{opt.label}</span>
            </label>
          ))}
        </div>

        {role === 'COMPANY_ADMIN' && role !== member.role && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-xs text-amber-400">
            This member will have full company management access.
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={loading} onClick={handleUpdate}>
            Update Role
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RemoveModal({
  member,
  onClose,
  onSuccess,
}: {
  member: Member;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRemove() {
    setLoading(true);
    setError('');
    try {
      await customerApi.delete(`/api/v1/companies/me/members/${member.user_id}`, {
        data: reason.trim() ? { reason: reason.trim() } : undefined,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to remove member.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Remove ${member.full_name} from team`} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          This member will lose access to all company orders and resources.
        </p>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400 tracking-wide">
            Reason (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Enter a reason…"
            className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600
              bg-slate-800 border border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20
              outline-none resize-none transition-all duration-150"
          />
        </div>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={loading} onClick={handleRemove}>
            Remove Member
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MembersPage() {
  return (
    <Suspense>
      <MembersPageInner />
    </Suspense>
  );
}

function MembersPageInner() {
  const queryClient = useQueryClient();
  const currentUser = getUser();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Sync tab with URL ?tab= param
  const urlTab = searchParams.get('tab') === 'invitations' ? 'invitations' : 'active';
  const [tab, setTab] = useState<'active' | 'invitations'>(urlTab);

  useEffect(() => {
    setTab(urlTab);
  }, [urlTab]);

  function handleTabChange(key: 'active' | 'invitations') {
    setTab(key);
    const params = new URLSearchParams(searchParams.toString());
    if (key === 'invitations') {
      params.set('tab', 'invitations');
    } else {
      params.delete('tab');
    }
    router.replace(`/company/members${params.toString() ? `?${params.toString()}` : ''}`);
  }

  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleModal, setRoleModal] = useState<Member | null>(null);
  const [removeModal, setRemoveModal] = useState<Member | null>(null);

  // Data fetches
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['company-members'],
    queryFn: async () => {
      const res = await customerApi.get<{ data: { members: Member[]; total_count: number } }>(
        '/api/v1/companies/me/members',
      );
      return res.data.data;
    },
  });

  const { data: invitationsData, isLoading: invitationsLoading } = useQuery({
    queryKey: ['company-invitations'],
    queryFn: async () => {
      const res = await customerApi.get<{ data: { invitations: Invitation[] } }>(
        '/api/v1/companies/me/invitations',
      );
      return res.data.data;
    },
  });

  const members = membersData?.members ?? [];
  const invitations = invitationsData?.invitations ?? [];
  const activeMembers = members.filter((m) => m.status === 'ACTIVE');

  // Determine current user's role to conditionally show actions
  const myMember = members.find((m) => m.user_id === currentUser?.id);
  const isAdmin = myMember?.role === 'COMPANY_ADMIN';

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ['company-members'] });
    void queryClient.invalidateQueries({ queryKey: ['company-invitations'] });
  }

  async function handleRevoke(id: string) {
    try {
      await customerApi.post(`/api/v1/companies/me/invitations/${id}/revoke`);
      void queryClient.invalidateQueries({ queryKey: ['company-invitations'] });
    } catch {
      // toast handled by axios interceptor
    }
  }

  async function handleResend(id: string) {
    try {
      await customerApi.post(`/api/v1/companies/me/invitations/${id}/resend`);
    } catch {
      // toast handled by axios interceptor
    }
  }

  return (
    <PageContainer className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="font-display font-bold text-2xl text-slate-100">Team Members</h1>
          <span className="text-sm text-slate-500">
            ({activeMembers.length} active)
          </span>
        </div>
        <Button variant="primary" onClick={() => setInviteOpen(true)}>
          <UserPlus size={16} />
          Invite Member
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
        {(
          [
            { key: 'active', label: 'Active' },
            { key: 'invitations', label: 'Invitations' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? 'bg-teal-500/10 text-teal-400 border border-teal-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── ACTIVE MEMBERS TAB ── */}
      {tab === 'active' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[2fr_1fr_1.5fr_1fr_1fr_auto] gap-4 px-5 py-3 bg-slate-800/40 text-xs text-slate-500 uppercase tracking-wide">
            <span>Member</span>
            <span>Role</span>
            <span>Domains</span>
            <span>Orders</span>
            <span>Joined</span>
            {isAdmin && <span>Actions</span>}
          </div>

          {/* Rows */}
          {membersLoading ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">Loading…</div>
          ) : activeMembers.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">No active members.</div>
          ) : (
            activeMembers.map((member) => {
              const isMe = member.user_id === currentUser?.id;
              const isAdmin_ = member.role === 'COMPANY_ADMIN';
              const shownDomains = member.domains.slice(0, 2);
              const extraDomains = member.domains.length - 2;

              return (
                <div
                  key={member.user_id}
                  className="grid grid-cols-[2fr_1fr_1.5fr_1fr_1fr_auto] gap-4 items-center
                    px-5 py-4 border-t border-slate-800 hover:bg-slate-800/20 transition-colors"
                >
                  {/* Member */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                        isAdmin_
                          ? 'bg-teal-500/20 text-teal-400'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {initials(member.full_name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-slate-200 truncate">
                          {member.full_name}
                        </span>
                        {isMe && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                            You
                          </span>
                        )}
                      </div>
                      {member.job_title && (
                        <p className="text-xs text-slate-500 truncate">{member.job_title}</p>
                      )}
                      {member.is_primary_admin && (
                        <p className="text-xs text-amber-400">Primary Admin</p>
                      )}
                    </div>
                  </div>

                  {/* Role */}
                  <div>{roleBadge(member.role)}</div>

                  {/* Domains */}
                  <div className="flex flex-wrap gap-1">
                    {shownDomains.map((d) => (
                      <span
                        key={d}
                        className="bg-slate-800 text-slate-400 rounded px-2 py-0.5 text-xs"
                      >
                        {d}
                      </span>
                    ))}
                    {extraDomains > 0 && (
                      <span className="text-xs text-slate-600">+{extraDomains} more</span>
                    )}
                    {member.domains.length === 0 && (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </div>

                  {/* Orders */}
                  <div className="text-sm text-slate-300">
                    {member.completed_orders_count} completed
                  </div>

                  {/* Joined */}
                  <div className="text-sm text-slate-400">
                    {format(new Date(member.joined_at), 'd MMM yyyy')}
                  </div>

                  {/* Actions */}
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      {!member.is_primary_admin && !isMe && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRoleModal(member)}
                          >
                            Change Role
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300"
                            onClick={() => setRemoveModal(member)}
                          >
                            Remove
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── INVITATIONS TAB ── */}
      {tab === 'invitations' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[2fr_1fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 bg-slate-800/40 text-xs text-slate-500 uppercase tracking-wide">
            <span>Email</span>
            <span>Role</span>
            <span>Sent By</span>
            <span>Sent</span>
            <span>Expires</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {/* Rows */}
          {invitationsLoading ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">Loading…</div>
          ) : invitations.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">No invitations sent yet.</div>
          ) : (
            invitations.map((inv) => {
              const isPending = inv.status === 'PENDING';
              return (
                <div
                  key={inv.id}
                  className={`grid grid-cols-[2fr_1fr_1.5fr_1fr_1fr_1fr_auto] gap-4 items-center
                    px-5 py-4 border-t border-slate-800 transition-colors ${
                      isPending ? 'hover:bg-slate-800/20' : 'opacity-50'
                    }`}
                >
                  <span className="text-sm text-slate-200 truncate">{inv.invited_email}</span>
                  <span className="text-xs text-slate-400">{inv.role.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-slate-400">{inv.invited_by_name}</span>
                  <span className="text-xs text-slate-400">
                    {format(new Date(inv.created_at), 'd MMM yyyy')}
                  </span>
                  <span className="text-xs text-slate-400">
                    {format(new Date(inv.expires_at), 'd MMM yyyy')}
                  </span>
                  <div>{inviteStatusBadge(inv.status)}</div>
                  <div className="flex items-center gap-1">
                    {isPending && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => handleRevoke(inv.id)}
                        >
                          Revoke
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResend(inv.id)}
                        >
                          Resend
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Modals ── */}
      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSuccess={invalidateAll}
      />

      {roleModal !== null && (
        <RoleModal
          member={roleModal}
          onClose={() => setRoleModal(null)}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ['company-members'] });
          }}
        />
      )}

      {removeModal !== null && (
        <RemoveModal
          member={removeModal}
          onClose={() => setRemoveModal(null)}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ['company-members'] });
          }}
        />
      )}
    </PageContainer>
  );
}
