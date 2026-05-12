import { Prisma } from '@prisma/client';
import type { PrismaClient, ScopeModificationRequest } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { CreateSmrInput, RespondSmrInput } from '@onys/shared';
import { convertToAUD } from '../utils/currency.js';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';
import { getFrontendUrl } from '../utils/urls.js';

// Order model is a placeholder until M07 — access extended fields via this type
interface OrderWithContractor {
  id: string;
  customer_id: string;
  status: string;
  contractor_user_id?: string | null;
  scope_snapshot?: Prisma.JsonObject | null;
}

type SmrEmailPayload =
  | {
      type: 'smr-received';
      to: string;
      order_id: string;
      round_number: number;
      element_type: string;
      reason: string;
      respond_url: string;
    }
  | {
      type: 'smr-responded';
      to: string;
      response: string;
      order_id: string;
      round_number: number;
    };

const MODIFIABLE_STATUSES = ['ACCEPTED', 'IN_PROGRESS'] as const;
const SMR_EXPIRY_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export class ScopeModificationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<SmrEmailPayload>,
  ) {}

  // ─── METHOD 1: createSmr ──────────────────────────────────────────────────

  async createSmr(
    orderId: string,
    requestingUserId: string,
    data: CreateSmrInput,
    meta: { ip: string; userAgent: string },
  ): Promise<ScopeModificationRequest> {
    // 1. Find order
    const order = await this.findOrderOrThrow(orderId);

    // 2. Verify requesting user is customer or assigned contractor
    const isCustomer = order.customer_id === requestingUserId;
    const isContractor = order.contractor_user_id === requestingUserId;
    if (!isCustomer && !isContractor) throw new AppError('FORBIDDEN', 403);

    // 3. Check order status allows modification
    if (!(MODIFIABLE_STATUSES as readonly string[]).includes(order.status)) {
      throw new AppError(
        'ORDER_NOT_MODIFIABLE',
        422,
        `Scope modifications not allowed when order is ${order.status}`,
      );
    }

    // 4. Fetch all existing SMRs for this order
    const existingSmrs = await this.prisma.scopeModificationRequest.findMany({
      where: { order_id: orderId },
      orderBy: { round_number: 'asc' },
    });

    // 5. Check round limit (max 2 completed rounds)
    const completedRounds = existingSmrs.filter((s) => s.status === 'RESPONDED').length;
    if (completedRounds >= 2) {
      throw new AppError(
        'MODIFICATION_ROUNDS_EXHAUSTED',
        422,
        'Maximum 2 modification rounds per order. No further scope changes permitted.',
      );
    }

    // 6. Check no pending SMR already exists
    const pendingSmr = existingSmrs.find((s) => s.status === 'PENDING');
    if (pendingSmr) {
      throw new AppError(
        'SMR_ALREADY_PENDING',
        409,
        'A modification request is already pending a response.',
      );
    }

    // 7. Determine round number
    const round_number = completedRounds + 1;

    // 8. Round 2 eligibility — only after round 1 ACCEPT_WITH_REVISION
    if (round_number === 2) {
      const round1 = existingSmrs.find((s) => s.round_number === 1);
      if (!round1 || round1.response !== 'ACCEPT_WITH_REVISION') {
        throw new AppError(
          'ROUND_2_NOT_ELIGIBLE',
          422,
          'Round 2 modification only available after round 1 ACCEPT_WITH_REVISION response.',
        );
      }
    }

    // 9. Create SMR
    const smr = await this.prisma.scopeModificationRequest.create({
      data: {
        order_id: orderId,
        round_number,
        requested_by_user_id: requestingUserId,
        element_type: data.element_type,
        original_value: data.original_value as Prisma.InputJsonObject,
        requested_value: data.requested_value as Prisma.InputJsonObject,
        reason: data.reason,
        status: 'PENDING',
        expires_at: new Date(Date.now() + SMR_EXPIRY_MS),
      },
    });

    // 10. Queue notification email to the other party
    const notifyUserId = isCustomer ? order.contractor_user_id : order.customer_id;
    if (notifyUserId) {
      const notifyUser = await this.prisma.user.findUnique({
        where: { id: notifyUserId },
        select: { email: true },
      });
      if (notifyUser) {
        await this.emailQueue.add('smr-received', {
          type: 'smr-received',
          to: notifyUser.email,
          order_id: orderId,
          round_number,
          element_type: data.element_type,
          reason: data.reason,
          respond_url: `${getFrontendUrl()}/orders/${orderId}/scope`,
        });
      }
    }

    // 11. Audit
    await writeAudit(this.prisma, {
      actorId: requestingUserId,
      actionType: 'SMR_CREATED',
      entityType: 'ScopeModificationRequest',
      entityId: smr.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        order_id: orderId,
        round_number,
        element_type: data.element_type,
        requested_by: requestingUserId,
      },
    });

    return smr;
  }

  // ─── METHOD 2: listSmrs ───────────────────────────────────────────────────

  async listSmrs(
    orderId: string,
    requestingUserId: string,
  ): Promise<ScopeModificationRequest[]> {
    // 1. Find order and verify requesting user is a party
    const order = await this.findOrderOrThrow(orderId);
    const isCustomer = order.customer_id === requestingUserId;
    const isContractor = order.contractor_user_id === requestingUserId;
    if (!isCustomer && !isContractor) throw new AppError('FORBIDDEN', 403);

    // 2. Return all SMRs ordered by round_number asc, created_at asc
    return this.prisma.scopeModificationRequest.findMany({
      where: { order_id: orderId },
      orderBy: [{ round_number: 'asc' }, { created_at: 'asc' }],
      include: {
        requested_by_user: { select: { id: true, full_name: true } },
        responded_by_user: { select: { id: true, full_name: true } },
      },
    }) as unknown as Promise<ScopeModificationRequest[]>;
  }

  // ─── METHOD 3: respondToSmr ───────────────────────────────────────────────

  async respondToSmr(
    orderId: string,
    smrId: string,
    respondingUserId: string,
    data: RespondSmrInput,
  ): Promise<ScopeModificationRequest> {
    // 1. Find SMR and verify it belongs to this order
    const smr = await this.prisma.scopeModificationRequest.findUnique({
      where: { id: smrId },
    });
    if (!smr || smr.order_id !== orderId) throw new AppError('SMR_NOT_FOUND', 404);

    // 2. Verify SMR is still PENDING
    if (smr.status !== 'PENDING') throw new AppError('SMR_ALREADY_RESPONDED', 409);

    // 3. Check expiry
    if (smr.expires_at && smr.expires_at < new Date()) {
      throw new AppError('SMR_EXPIRED', 422);
    }

    // 4. Cannot respond to your own request
    if (smr.requested_by_user_id === respondingUserId) {
      throw new AppError(
        'CANNOT_RESPOND_OWN_SMR',
        403,
        'Cannot respond to your own modification request.',
      );
    }

    // 5. Verify responding user is a party to the order
    const order = await this.findOrderOrThrow(orderId);
    const isCustomer = order.customer_id === respondingUserId;
    const isContractor = order.contractor_user_id === respondingUserId;
    if (!isCustomer && !isContractor) throw new AppError('FORBIDDEN', 403);

    // 7. Convert revised_price to AUD if provided
    let revisedPriceAud: number | undefined;
    if (data.revised_price !== undefined && data.revised_currency !== undefined) {
      revisedPriceAud = convertToAUD(data.revised_price, data.revised_currency);
    }

    const now = new Date();

    // 8. Update SMR
    const updated = await this.prisma.scopeModificationRequest.update({
      where: { id: smrId },
      data: {
        status: 'RESPONDED',
        responded_by_user_id: respondingUserId,
        response: data.response,
        ...(data.response_notes !== undefined && { response_notes: data.response_notes }),
        ...(data.revised_scope !== undefined && {
          revised_scope: data.revised_scope as Prisma.InputJsonObject,
        }),
        ...(data.revised_price !== undefined && {
          revised_price: new Prisma.Decimal(data.revised_price),
        }),
        ...(revisedPriceAud !== undefined && {
          revised_price_aud: new Prisma.Decimal(revisedPriceAud),
        }),
        responded_at: now,
      },
    });

    // 9. If ACCEPT or ACCEPT_WITH_REVISION — apply revised values to the order
    if (data.response === 'ACCEPT' || data.response === 'ACCEPT_WITH_REVISION') {
      try {
        const orderUpdate: Record<string, unknown> = {};
        if (data.revised_scope !== undefined) {
          orderUpdate['scope_snapshot'] = data.revised_scope;
        }
        if (data.revised_price !== undefined) {
          orderUpdate['price'] = new Prisma.Decimal(data.revised_price);
        }
        if (revisedPriceAud !== undefined) {
          orderUpdate['price_aud'] = new Prisma.Decimal(revisedPriceAud);
        }
        if (Object.keys(orderUpdate).length > 0) {
          await (this.prisma.order as unknown as { update: (args: unknown) => Promise<unknown> }).update({
            where: { id: orderId },
            data: orderUpdate,
          });
        }
      } catch {
        // Order model fields not yet available in M06 — silently skip
      }
    }

    // 10. Queue notification email to requesting party
    const requester = await this.prisma.user.findUnique({
      where: { id: smr.requested_by_user_id },
      select: { email: true },
    });
    if (requester) {
      await this.emailQueue.add('smr-responded', {
        type: 'smr-responded',
        to: requester.email,
        response: data.response,
        order_id: orderId,
        round_number: smr.round_number,
      });
    }

    // 11. Audit
    await writeAudit(this.prisma, {
      actorId: respondingUserId,
      actionType: 'SMR_RESPONDED',
      entityType: 'ScopeModificationRequest',
      entityId: smrId,
      metadata: {
        response: data.response,
        order_id: orderId,
        round_number: smr.round_number,
      },
    });

    return updated;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async findOrderOrThrow(orderId: string): Promise<OrderWithContractor> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });
      if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
      return order as unknown as OrderWithContractor;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('ORDER_NOT_FOUND', 404);
    }
  }
}
