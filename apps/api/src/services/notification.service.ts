import type { PrismaClient, NotificationCategory } from '@prisma/client';
import type { Queue } from 'bullmq';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationChannel = 'in_app' | 'email';

export interface NotificationPreferences {
  in_app?: Partial<Record<NotificationCategory, boolean>>;
  email?: Partial<Record<NotificationCategory, boolean>>;
}

export interface NotifyArgs {
  userId: string;
  category: NotificationCategory;
  title: string;
  body?: string;
  linkUrl?: string;
  metadata?: Record<string, unknown>;
  /** When provided, the email job is queued (subject to user preferences). */
  email?: {
    jobName: string;
    payload: Record<string, unknown>;
    priority?: number;
  };
  /** Bypass user prefs and force email regardless (for transactional/security). */
  forceEmail?: boolean;
  /** Bypass user prefs and skip in-app (e.g. when only email matters). */
  skipInApp?: boolean;
}

// Categories that ignore user preferences — always delivered.
// Disputes, payments and security are non-negotiable.
const TRANSACTIONAL_CATEGORIES = new Set<NotificationCategory>([
  'DISPUTE',
  'PAYMENT',
]);

// Default preferences when a user has none set.
const DEFAULT_PREFS: Required<NotificationPreferences> = {
  in_app: {
    ORDER: true, PAYMENT: true, DISPUTE: true, TENDER: true, ACCOUNT: true,
    MESSAGE: true, COMPLIANCE: true, ADMIN: true, MARKETING: true,
  },
  email: {
    ORDER: true, PAYMENT: true, DISPUTE: true, TENDER: true, ACCOUNT: true,
    MESSAGE: true, COMPLIANCE: true, ADMIN: true, MARKETING: false, // marketing off by default
  },
};

export class NotificationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue,
  ) {}

  // ─── Read user prefs ────────────────────────────────────────────────────────

  async getPreferences(userId: string): Promise<Required<NotificationPreferences>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notification_preferences: true },
    });
    const stored = (user?.notification_preferences as NotificationPreferences | null) ?? {};
    return {
      in_app: { ...DEFAULT_PREFS.in_app, ...(stored.in_app ?? {}) },
      email: { ...DEFAULT_PREFS.email, ...(stored.email ?? {}) },
    };
  }

  async updatePreferences(userId: string, patch: NotificationPreferences) {
    const current = await this.getPreferences(userId);
    const merged: NotificationPreferences = {
      in_app: { ...current.in_app, ...(patch.in_app ?? {}) },
      email: { ...current.email, ...(patch.email ?? {}) },
    };
    // Force-on the transactional categories — users cannot disable these.
    for (const c of TRANSACTIONAL_CATEGORIES) {
      merged.email![c] = true;
      merged.in_app![c] = true;
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { notification_preferences: merged as never },
    });
    return merged;
  }

  // ─── Core notify() ──────────────────────────────────────────────────────────

  async notify(args: NotifyArgs): Promise<void> {
    const isTransactional = TRANSACTIONAL_CATEGORIES.has(args.category);
    const prefs = isTransactional ? null : await this.getPreferences(args.userId);

    // 1. In-app notification — always created unless user opted out (transactional always created).
    const inAppEnabled = isTransactional
      ? true
      : (prefs!.in_app[args.category] ?? true);

    if (inAppEnabled && !args.skipInApp) {
      await this.prisma.notification
        .create({
          data: {
            user_id: args.userId,
            category: args.category,
            title: args.title,
            body: args.body ?? null,
            link_url: args.linkUrl ?? null,
            metadata: (args.metadata as never) ?? null,
          },
        })
        .catch((err: unknown) => {
          console.error('[notify] failed to create notification:', err);
        });
    }

    // 2. Email — subject to prefs unless transactional or forced.
    if (args.email) {
      const emailEnabled = isTransactional || args.forceEmail
        ? true
        : (prefs!.email[args.category] ?? true);
      if (emailEnabled) {
        await this.emailQueue.add(
          args.email.jobName,
          args.email.payload,
          args.email.priority ? { priority: args.email.priority } : {},
        );
      }
    }
  }

  // ─── List / count / mark read ───────────────────────────────────────────────

  async list(userId: string, opts: { unreadOnly?: boolean; category?: NotificationCategory; cursor?: string; limit?: number } = {}) {
    const limit = Math.min(opts.limit ?? 20, 50);
    const items = await this.prisma.notification.findMany({
      where: {
        user_id: userId,
        ...(opts.unreadOnly && { read_at: null }),
        ...(opts.category && { category: opts.category }),
        ...(opts.cursor && { id: { lt: opts.cursor } }),
      },
      orderBy: { created_at: 'desc' },
      take: limit + 1,
    });
    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    return {
      notifications: data,
      next_cursor: hasMore ? data[data.length - 1]?.id ?? null : null,
      has_more: hasMore,
    };
  }

  async unreadCount(
    userId: string,
    opts: { category?: NotificationCategory } = {},
  ): Promise<number> {
    return this.prisma.notification.count({
      where: {
        user_id: userId,
        read_at: null,
        ...(opts.category ? { category: opts.category } : {}),
      },
    });
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, user_id: userId, read_at: null },
      data: { read_at: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { user_id: userId, read_at: null },
      data: { read_at: new Date() },
    });
    return { count: result.count };
  }
}
