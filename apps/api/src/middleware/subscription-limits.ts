import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SubscriptionService } from '../services/subscription.service.js';
import type { LimitType, FeatureFlag } from '@onys/shared';

export interface SubscriptionGuards {
  requireFeature: (
    flag: FeatureFlag,
  ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireLimit: (
    limitType: LimitType,
  ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

// User-facing labels for each LimitType. Must mirror the formatLimitType()
// switch in apps/web/src/components/shared/UpgradePromptModal.tsx — both
// places need to use the same wording so error messages and the upgrade
// prompt stay consistent.
function humaniseLimitType(type: LimitType): string {
  switch (type) {
    case 'active_tasks':      return 'active listing';
    case 'listing_items':     return 'catalogue item';
    case 'active_orders':     return 'active order';
    case 'orders':            return 'monthly order';
    case 'active_tenders':    return 'active tender';
    case 'active_contracts':  return 'active contract';
    case 'bids':              return 'monthly bid';
    case 'domain_categories': return 'domain category';
    case 'team_seats':        return 'team seat';
    case 'task_bookings':     return 'monthly task booking';
    case 'contracts':         return 'monthly contract';
    case 'ai_scopes':         return 'AI scope';
    case 'ai_requests':       return 'monthly AI request';
    default:                  return String(type).replace(/_/g, ' ');
  }
}

// Limits backed by an integer counter on Subscription that needs incrementing
// on each successful action. Other limit types (team_seats, active_tasks,
// listing_items, active_orders, active_tenders, active_contracts,
// domain_categories) compute current usage from live row counts so no counter
// increment applies.
const COUNTER_BACKED: Partial<
  Record<
    LimitType,
    'bids' | 'ai_requests' | 'orders' | 'task_bookings' | 'contracts'
  >
> = {
  // Supplier-side counter quotas
  bids: 'bids',
  orders: 'orders',
  // Customer-side counter quotas
  task_bookings: 'task_bookings',
  contracts: 'contracts',
  // ai_scopes is just a different label for the same ai_request counter —
  // the customer-facing key keeps error messages consistent.
  ai_scopes: 'ai_requests',
};

// Factory: closes over the SubscriptionService so each Fastify preHandler
// has access to the same singleton without going through req.server.
export function makeSubscriptionGuards(svc: SubscriptionService): SubscriptionGuards {
  return {
    requireFeature(flag: FeatureFlag) {
      return async function featureGuard(req: FastifyRequest, reply: FastifyReply) {
        if (!req.user) {
          await reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
          });
          return;
        }
        const result = await svc.checkFeature(req.user.userId, flag);
        if (!result.allowed) {
          await reply.status(403).send({
            success: false,
            error: {
              code: 'FEATURE_NOT_INCLUDED',
              message: result.plan_name
                ? `Your ${result.plan_name} plan does not include this feature. Upgrade to access it.`
                : 'An active subscription is required for this feature.',
              feature: flag,
              current_plan: result.plan_name,
            },
          });
          return;
        }
      };
    },

    requireLimit(limitType: LimitType) {
      return async function limitGuard(req: FastifyRequest, reply: FastifyReply) {
        if (!req.user) {
          await reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
          });
          return;
        }
        const result = await svc.checkLimit(req.user.userId, limitType);
        if (!result.allowed) {
          const friendly = humaniseLimitType(limitType);
          await reply.status(429).send({
            success: false,
            error: {
              code: 'SUBSCRIPTION_LIMIT_REACHED',
              message:
                result.reason === 'NO_ACTIVE_SUBSCRIPTION'
                  ? 'An active subscription is required for this action.'
                  : `You have reached your ${friendly} limit (${result.limit ?? 0}) on the ${
                      result.plan_name ?? 'free'
                    } plan. Upgrade to continue.`,
              limit_type: limitType,
              current: result.current,
              limit: result.limit,
              current_plan: result.plan_name,
            },
          });
          return;
        }

        // For counter-backed limits, commit the increment now.
        // Trade-off: failed downstream operations consume 1 quota slot, but the
        // alternative (post-success increment) needs invasive route handler
        // wiring. Acceptable for MVP — usage counters are reset monthly.
        const counterField = COUNTER_BACKED[limitType];
        if (counterField) {
          try {
            await svc.incrementUsage(req.user.userId, counterField);
          } catch (err) {
            // checkLimit just passed, so incrementUsage shouldn't fail.
            // Log and let the request continue rather than blocking on a race.
            console.error('[subscription-limits] increment failed:', err);
          }
        }
      };
    },
  };
}
