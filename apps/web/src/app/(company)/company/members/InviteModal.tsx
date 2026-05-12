'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import customerApi from '@/lib/customer-api';
import { useDomainOptions } from '@/hooks/useDomains';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Role = 'COMPANY_ADMIN' | 'SENIOR_CONSULTANT' | 'CONSULTANT' | 'JUNIOR_CONSULTANT';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'COMPANY_ADMIN', label: 'Company Admin — full company management access' },
  { value: 'SENIOR_CONSULTANT', label: 'Senior Consultant — can create tasks, manage orders' },
  { value: 'CONSULTANT', label: 'Consultant — can work assigned orders' },
  { value: 'JUNIOR_CONSULTANT', label: 'Junior Consultant — limited to assigned order work' },
];

const CAPABILITY_ROWS: { feature: string; admin: boolean; senior: boolean; consultant: boolean; junior: boolean }[] = [
  { feature: 'Create task listings', admin: true, senior: true, consultant: false, junior: false },
  { feature: 'Assign orders',        admin: true, senior: true, consultant: false, junior: false },
  { feature: 'Work orders',          admin: true, senior: true, consultant: true,  junior: true  },
  { feature: 'Invite members',       admin: true, senior: true, consultant: false, junior: false },
  { feature: 'Company settings',     admin: true, senior: false, consultant: false, junior: false },
];

function isHighlighted(col: 'admin' | 'senior' | 'consultant' | 'junior', role: Role | ''): boolean {
  if (role === 'COMPANY_ADMIN') return col === 'admin';
  if (role === 'SENIOR_CONSULTANT') return col === 'senior';
  if (role === 'CONSULTANT') return col === 'consultant';
  if (role === 'JUNIOR_CONSULTANT') return col === 'junior';
  return false;
}

export function InviteModal({ open, onClose, onSuccess }: Props) {
  const allDomains = useDomainOptions();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [jobTitle, setJobTitle] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [emailExists, setEmailExists] = useState<boolean | null>(null);
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingEmail, setCheckingEmail] = useState(false);

  function reset() {
    setEmail('');
    setRole('');
    setJobTitle('');
    setDomains([]);
    setEmailExists(null);
    setEmailError('');
    setLoading(false);
    setError('');
    setCheckingEmail(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleEmailBlur() {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    setEmailError('');
    setEmailExists(null);
    setCheckingEmail(true);
    try {
      const res = await customerApi.post<{ success: boolean; data: { exists: boolean; already_member: boolean } }>(
        '/api/v1/companies/check-email',
        { email: trimmed },
      );
      const { exists, already_member } = res.data.data;
      if (already_member) {
        setEmailError('This person is already a member of your company.');
      } else {
        setEmailExists(exists);
      }
    } catch {
      setEmailExists(false);
    } finally {
      setCheckingEmail(false);
    }
  }

  function toggleDomain(value: string) {
    setDomains((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value],
    );
  }

  async function handleSubmit() {
    if (!email.trim() || !role) return;
    setLoading(true);
    setError('');
    try {
      await customerApi.post('/api/v1/companies/me/invite', {
        invited_email: email.trim(),
        role,
        ...(jobTitle.trim() ? { job_title: jobTitle.trim() } : {}),
        member_domains: domains,
      });
      onSuccess();
      reset();
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
      const code = e.response?.data?.error?.code;
      const message = e.response?.data?.error?.message ?? 'Something went wrong. Please try again.';
      if (code === 'ALREADY_A_MEMBER') {
        setEmailError('This person is already a member of your company.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Invite a team member" size="xl">
      <div className="space-y-5">

        {/* Email */}
        <div className="space-y-1">
          <Input
            label="Email address"
            type="email"
            placeholder="colleague@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailExists(null);
              setEmailError('');
            }}
            onBlur={handleEmailBlur}
            error={emailError || undefined}
            disabled={loading}
          />
          {!emailError && !checkingEmail && emailExists === true && (
            <p className="text-xs text-teal-400">
              ✓ This person has an onys.online account.
            </p>
          )}
          {!emailError && !checkingEmail && emailExists === false && (
            <p className="text-xs text-slate-500">
              They&apos;ll create a new account when accepting.
            </p>
          )}
          {checkingEmail && (
            <p className="text-xs text-slate-500">Checking…</p>
          )}
        </div>

        {/* Role Select */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-role" className="text-xs font-medium text-slate-400 tracking-wide">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role | '')}
            disabled={loading}
            className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Select a role…</option>
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Role Capability Table */}
        {role !== '' && (
          <div className="bg-slate-800/40 rounded-xl p-4">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-slate-500 font-medium pb-2 pr-2">Feature</th>
                  {(
                    [
                      { col: 'admin' as const,      label: 'Admin' },
                      { col: 'senior' as const,     label: 'Senior' },
                      { col: 'consultant' as const, label: 'Consultant' },
                      { col: 'junior' as const,     label: 'Junior' },
                    ] as const
                  ).map(({ col, label }) => (
                    <th
                      key={col}
                      className={`text-center font-medium pb-2 px-2 ${
                        isHighlighted(col, role) ? 'text-amber-400' : 'text-slate-500'
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CAPABILITY_ROWS.map((row) => (
                  <tr key={row.feature} className="border-t border-slate-700/50">
                    <td className="py-1.5 pr-2 text-slate-400">{row.feature}</td>
                    {(
                      [
                        { col: 'admin' as const,      val: row.admin },
                        { col: 'senior' as const,     val: row.senior },
                        { col: 'consultant' as const, val: row.consultant },
                        { col: 'junior' as const,     val: row.junior },
                      ] as const
                    ).map(({ col, val }) => (
                      <td
                        key={col}
                        className={`py-1.5 px-2 text-center ${
                          val
                            ? isHighlighted(col, role)
                              ? 'text-amber-400'
                              : 'text-teal-400'
                            : 'text-slate-600'
                        }`}
                      >
                        {val ? '✓' : '✗'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Job Title */}
        <Input
          label="Job title (optional)"
          placeholder="e.g. Senior Network Engineer"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          disabled={loading}
        />

        {/* Domains */}
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-xs font-medium text-slate-400 tracking-wide">
              Service domains (optional)
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Which domains will this member work in?
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {allDomains.map((domain) => {
              const selected = domains.includes(domain.value);
              return (
                <button
                  key={domain.value}
                  type="button"
                  onClick={() => toggleDomain(domain.value)}
                  disabled={loading}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-all ${
                    selected
                      ? 'border-amber-500/60 bg-amber-500/5 text-slate-200'
                      : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                      selected ? 'bg-amber-400' : 'bg-slate-600'
                    }`}
                  />
                  {domain.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Submit */}
        <Button
          variant="primary"
          fullWidth
          loading={loading}
          disabled={!email.trim() || !role || !!emailError}
          onClick={handleSubmit}
        >
          Send Invitation
        </Button>
      </div>
    </Modal>
  );
}
