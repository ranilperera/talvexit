'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    if (next.length < 12) {
      setError('New password must be at least 12 characters.');
      return;
    }

    setLoading(true);
    try {
      await api.patch('/api/v1/auth/change-password', {
        current_password: current,
        new_password: next,
      });
      router.push('/admin/dashboard');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  }

  const S = {
    page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', padding: 16, fontFamily: 'Inter, system-ui, sans-serif' } as const,
    wrap: { width: '100%', maxWidth: 380 } as const,
    alert: { display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 },
    alertText: { fontSize: 13, color: '#fbbf24', fontWeight: 500 },
    card: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' },
    cardTitle: { margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: 'white' },
    errorBox: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#fca5a5' },
    label: { display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 6 } as const,
    hint: { color: '#475569', marginLeft: 4 },
    input: { width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'white', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit', marginBottom: 16 },
    btn: { width: '100%', background: '#2563eb', border: 'none', borderRadius: 8, padding: '11px 16px', fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer', fontFamily: 'inherit' } as const,
  };

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontWeight: 800, fontSize: 14 }}>O</span>
          </div>
          <span style={{ color: 'white', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>
            onys<span style={{ color: '#60a5fa' }}>.</span>online
          </span>
        </div>

        {/* Security alert */}
        <div style={S.alert}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <p style={S.alertText}>You must set a new password before continuing.</p>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} style={S.card}>
          <h2 style={S.cardTitle}>Set new password</h2>

          {error && <div style={S.errorBox}>{error}</div>}

          <div>
            <label style={S.label}>Temporary password</label>
            <input type="password" required autoComplete="current-password"
              value={current} onChange={(e) => setCurrent(e.target.value)} style={S.input} />
          </div>

          <div>
            <label style={S.label}>
              New password
              <span style={S.hint}>(min 12 characters)</span>
            </label>
            <input type="password" required autoComplete="new-password"
              value={next} onChange={(e) => setNext(e.target.value)} style={S.input} />
          </div>

          <div>
            <label style={S.label}>Confirm new password</label>
            <input type="password" required autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} style={S.input} />
          </div>

          <button type="submit" disabled={loading}
            style={{ ...S.btn, opacity: loading ? 0.6 : 1 }}
            onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#1d4ed8'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#2563eb'; }}
          >
            {loading ? 'Saving…' : 'Set new password & continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
