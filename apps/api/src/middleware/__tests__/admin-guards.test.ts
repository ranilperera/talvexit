import { describe, it, expect, vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { requireAdmin, requirePermission, hasPermission } from '../admin-guards.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(accountType?: string): FastifyRequest {
  return {
    user: accountType ? { userId: 'user_1', accountType } : undefined,
  } as unknown as FastifyRequest;
}

function makeReply() {
  const send = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnValue({ send });
  return { status, send } as unknown as FastifyReply;
}

// ─── requireAdmin() ───────────────────────────────────────────────────────────

describe('requireAdmin()', () => {
  it('AG-01: PLATFORM_ADMIN → passes (done called)', () => {
    const done = vi.fn();
    requireAdmin(makeReq('PLATFORM_ADMIN'), makeReply(), done);
    expect(done).toHaveBeenCalledOnce();
  });

  it('AG-02: SUPPORT_ADMIN → passes', () => {
    const done = vi.fn();
    requireAdmin(makeReq('SUPPORT_ADMIN'), makeReply(), done);
    expect(done).toHaveBeenCalledOnce();
  });

  it('AG-03: COMPLIANCE_ADMIN → passes', () => {
    const done = vi.fn();
    requireAdmin(makeReq('COMPLIANCE_ADMIN'), makeReply(), done);
    expect(done).toHaveBeenCalledOnce();
  });

  it('AG-04: CUSTOMER account → 403 ADMIN_REQUIRED', () => {
    const done = vi.fn();
    const reply = makeReply();
    requireAdmin(makeReq('CUSTOMER'), reply, done);
    expect(done).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(403);
    const sent = (reply.status as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(sent.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'ADMIN_REQUIRED' }),
      }),
    );
  });

  it('AG-05: INDIVIDUAL_CONTRACTOR → 403 ADMIN_REQUIRED', () => {
    const done = vi.fn();
    const reply = makeReply();
    requireAdmin(makeReq('INDIVIDUAL_CONTRACTOR'), reply, done);
    expect(done).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('AG-06: No req.user (unauthenticated) → 403 ADMIN_REQUIRED', () => {
    const done = vi.fn();
    const reply = makeReply();
    requireAdmin(makeReq(), reply, done);
    expect(done).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(403);
  });
});

// ─── requirePermission() ──────────────────────────────────────────────────────

describe('requirePermission()', () => {
  it('AG-07: PLATFORM_ADMIN checking suspend_ban_contractors → passes', () => {
    const done = vi.fn();
    requirePermission('suspend_ban_contractors')(makeReq('PLATFORM_ADMIN'), makeReply(), done);
    expect(done).toHaveBeenCalledOnce();
  });

  it('AG-08: SUPPORT_ADMIN checking suspend_ban_contractors → 403 INSUFFICIENT_PERMISSIONS with required_roles', () => {
    const done = vi.fn();
    const reply = makeReply();
    requirePermission('suspend_ban_contractors')(makeReq('SUPPORT_ADMIN'), reply, done);
    expect(done).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(403);
    const sent = (reply.status as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    const body = (sent.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      success: boolean;
      error: { code: string; required_roles: string[] };
    };
    expect(body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(body.error.required_roles).toContain('PLATFORM_ADMIN');
    expect(body.error.required_roles).toContain('COMPLIANCE_ADMIN');
    expect(body.error.required_roles).not.toContain('SUPPORT_ADMIN');
  });

  it('AG-09: COMPLIANCE_ADMIN checking suspend_ban_contractors → passes', () => {
    const done = vi.fn();
    requirePermission('suspend_ban_contractors')(makeReq('COMPLIANCE_ADMIN'), makeReply(), done);
    expect(done).toHaveBeenCalledOnce();
  });

  it('AG-10: SUPPORT_ADMIN checking issue_dispute_determinations → passes', () => {
    const done = vi.fn();
    requirePermission('issue_dispute_determinations')(makeReq('SUPPORT_ADMIN'), makeReply(), done);
    expect(done).toHaveBeenCalledOnce();
  });

  it('AG-11: COMPLIANCE_ADMIN checking issue_dispute_determinations → 403', () => {
    const done = vi.fn();
    const reply = makeReply();
    requirePermission('issue_dispute_determinations')(makeReq('COMPLIANCE_ADMIN'), reply, done);
    expect(done).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('AG-12: All 3 admin roles can check view_all_orders → all pass', () => {
    for (const role of ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN']) {
      const done = vi.fn();
      requirePermission('view_all_orders')(makeReq(role), makeReply(), done);
      expect(done).toHaveBeenCalledOnce();
    }
  });

  it('AG-13: SUPPORT_ADMIN checking manage_platform_config → 403', () => {
    const done = vi.fn();
    const reply = makeReply();
    requirePermission('manage_platform_config')(makeReq('SUPPORT_ADMIN'), reply, done);
    expect(done).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('AG-14: COMPLIANCE_ADMIN checking manage_platform_config → 403', () => {
    const done = vi.fn();
    const reply = makeReply();
    requirePermission('manage_platform_config')(makeReq('COMPLIANCE_ADMIN'), reply, done);
    expect(done).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('AG-15: PLATFORM_ADMIN checking manage_platform_config → passes', () => {
    const done = vi.fn();
    requirePermission('manage_platform_config')(makeReq('PLATFORM_ADMIN'), makeReply(), done);
    expect(done).toHaveBeenCalledOnce();
  });
});

// ─── hasPermission() ──────────────────────────────────────────────────────────

describe('hasPermission()', () => {
  it('AG-16: hasPermission(PLATFORM_ADMIN, view_audit_logs) → true', () => {
    expect(hasPermission('PLATFORM_ADMIN', 'view_audit_logs')).toBe(true);
  });

  it('AG-17: hasPermission(SUPPORT_ADMIN, view_audit_logs) → false', () => {
    expect(hasPermission('SUPPORT_ADMIN', 'view_audit_logs')).toBe(false);
  });

  it('AG-18: hasPermission(UNKNOWN_ROLE, view_all_orders) → false', () => {
    expect(hasPermission('UNKNOWN_ROLE', 'view_all_orders')).toBe(false);
  });
});
