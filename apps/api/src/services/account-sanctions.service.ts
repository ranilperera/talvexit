// ─── AccountSanctionsService ────────────────────────────────────────────────
// Subscription-only marketplace pivot — Phase 3.
//
// Admin-imposed sanctions on user accounts (customer or supplier). Independent
// of dispute determinations: a determination may *recommend* a sanction, but
// the admin must call this service explicitly to apply one. Suspending
// terminates active sessions and blocks sign-in until lifted; banning is a
// permanent variant (still reversible by another admin in a true emergency,
// but UX treats it as terminal).
//
// All actions write an AuditLog entry so the full sanction history is
// queryable per-user.

import type { PrismaClient } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { writeAudit } from '../utils/audit.js';

interface SanctionMeta {
  reason: string;
  /** Admin id taking the action — must be a PLATFORM_ADMIN / SUPPORT_ADMIN / COMPLIANCE_ADMIN */
  admin_id: string;
  ip?: string;
  user_agent?: string;
}

const REASON_MIN = 5;
const REASON_MAX = 1000;

export class AccountSanctionsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Suspend ────────────────────────────────────────────────────────────────

  async suspend(targetUserId: string, meta: SanctionMeta): Promise<void> {
    this.assertReason(meta.reason);
    if (targetUserId === meta.admin_id) {
      throw new AppError('CANNOT_SANCTION_SELF', 400);
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, suspended_at: true, banned_at: true, account_type: true },
    });
    if (!target) throw new AppError('USER_NOT_FOUND', 404);
    if (target.banned_at) {
      throw new AppError('USER_ALREADY_BANNED', 409, 'User is banned. Unban first to change to suspension.');
    }
    if (this.isAdminAccountType(target.account_type)) {
      throw new AppError('CANNOT_SANCTION_ADMIN', 403, 'Cannot sanction admin accounts via this endpoint.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          suspended_at: new Date(),
          suspended_reason: meta.reason,
          suspended_by_admin_id: meta.admin_id,
        },
      });
      // Revoke all refresh tokens → forces re-login; sign-in then fails the
      // sanction check until unsuspended.
      await tx.refreshToken.deleteMany({ where: { user_id: targetUserId } });
    });

    await writeAudit(this.prisma, {
      actorId: meta.admin_id,
      actionType: 'USER_SUSPENDED',
      entityType: 'User',
      entityId: targetUserId,
      ...(meta.ip ? { ipAddress: meta.ip } : {}),
      ...(meta.user_agent ? { userAgent: meta.user_agent } : {}),
      metadata: { reason: meta.reason },
    });
  }

  // ── Unsuspend ─────────────────────────────────────────────────────────────

  async unsuspend(targetUserId: string, meta: SanctionMeta): Promise<void> {
    this.assertReason(meta.reason);
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, suspended_at: true },
    });
    if (!target) throw new AppError('USER_NOT_FOUND', 404);
    if (!target.suspended_at) throw new AppError('NOT_SUSPENDED', 409);

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        suspended_at: null,
        suspended_reason: null,
        suspended_by_admin_id: null,
      },
    });

    await writeAudit(this.prisma, {
      actorId: meta.admin_id,
      actionType: 'USER_UNSUSPENDED',
      entityType: 'User',
      entityId: targetUserId,
      ...(meta.ip ? { ipAddress: meta.ip } : {}),
      ...(meta.user_agent ? { userAgent: meta.user_agent } : {}),
      metadata: { reason: meta.reason },
    });
  }

  // ── Ban ────────────────────────────────────────────────────────────────────

  async ban(targetUserId: string, meta: SanctionMeta): Promise<void> {
    this.assertReason(meta.reason);
    if (targetUserId === meta.admin_id) {
      throw new AppError('CANNOT_SANCTION_SELF', 400);
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, banned_at: true, account_type: true },
    });
    if (!target) throw new AppError('USER_NOT_FOUND', 404);
    if (target.banned_at) throw new AppError('USER_ALREADY_BANNED', 409);
    if (this.isAdminAccountType(target.account_type)) {
      throw new AppError('CANNOT_SANCTION_ADMIN', 403);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          banned_at: new Date(),
          banned_reason: meta.reason,
          banned_by_admin_id: meta.admin_id,
          // A banned user is implicitly suspended too — clear suspend fields
          // to avoid contradictory state.
          suspended_at: null,
          suspended_reason: null,
          suspended_by_admin_id: null,
        },
      });
      await tx.refreshToken.deleteMany({ where: { user_id: targetUserId } });
    });

    await writeAudit(this.prisma, {
      actorId: meta.admin_id,
      actionType: 'USER_BANNED',
      entityType: 'User',
      entityId: targetUserId,
      ...(meta.ip ? { ipAddress: meta.ip } : {}),
      ...(meta.user_agent ? { userAgent: meta.user_agent } : {}),
      metadata: { reason: meta.reason },
    });
  }

  // ── Unban ─────────────────────────────────────────────────────────────────

  async unban(targetUserId: string, meta: SanctionMeta): Promise<void> {
    this.assertReason(meta.reason);
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, banned_at: true },
    });
    if (!target) throw new AppError('USER_NOT_FOUND', 404);
    if (!target.banned_at) throw new AppError('NOT_BANNED', 409);

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        banned_at: null,
        banned_reason: null,
        banned_by_admin_id: null,
      },
    });

    await writeAudit(this.prisma, {
      actorId: meta.admin_id,
      actionType: 'USER_UNBANNED',
      entityType: 'User',
      entityId: targetUserId,
      ...(meta.ip ? { ipAddress: meta.ip } : {}),
      ...(meta.user_agent ? { userAgent: meta.user_agent } : {}),
      metadata: { reason: meta.reason },
    });
  }

  // ── State query (used by middleware + login) ─────────────────────────────

  /**
   * Returns the active sanction for a user, or null if none. Caller decides
   * whether to throw — middleware wants 403 with code, admin views want to
   * display the details.
   */
  async getActiveSanction(userId: string): Promise<
    | { kind: 'banned'; at: Date; reason: string | null }
    | { kind: 'suspended'; at: Date; reason: string | null }
    | null
  > {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        suspended_at: true,
        suspended_reason: true,
        banned_at: true,
        banned_reason: true,
      },
    });
    if (!u) return null;
    if (u.banned_at) return { kind: 'banned', at: u.banned_at, reason: u.banned_reason };
    if (u.suspended_at) return { kind: 'suspended', at: u.suspended_at, reason: u.suspended_reason };
    return null;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private assertReason(reason: string): void {
    const r = reason.trim();
    if (r.length < REASON_MIN) {
      throw new AppError('REASON_TOO_SHORT', 400, `Reason must be at least ${REASON_MIN} characters.`);
    }
    if (r.length > REASON_MAX) {
      throw new AppError('REASON_TOO_LONG', 400, `Reason must be at most ${REASON_MAX} characters.`);
    }
  }

  private isAdminAccountType(t: string): boolean {
    return t === 'PLATFORM_ADMIN' || t === 'SUPPORT_ADMIN' || t === 'COMPLIANCE_ADMIN';
  }
}
