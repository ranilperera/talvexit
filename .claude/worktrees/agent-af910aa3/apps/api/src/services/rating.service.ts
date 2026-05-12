import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { SubmitRatingInput, RatingResponseInput, ListRatingsInput } from '@onys/shared';
import {
  calculateWeightedScore,
  recalculateAggregateRating,
  isRatingVisible,
  RATING_VISIBILITY_THRESHOLD,
} from '../utils/rating-calculator.js';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

type RequestMeta = { ip: string; userAgent: string };

export class RatingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── submitRating ─────────────────────────────────────────────────────────

  async submitRating(
    orderId: string,
    customerId: string,
    data: SubmitRatingInput,
    meta: RequestMeta,
  ) {
    // 1. Find order
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        customer_id: true,
        contractor_profile_id: true,
        contractor_user: { select: { email: true, full_name: true } },
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);

    // 2. Verify customer
    if (order.customer_id !== customerId) {
      throw new AppError('FORBIDDEN', 403, 'Only the order customer can submit a rating');
    }

    // 3. Check order is COMPLETED
    if (order.status !== 'COMPLETED') {
      throw new AppError(
        'ORDER_NOT_COMPLETED',
        422,
        `Ratings can only be submitted for completed orders. Current status: ${order.status}`,
      );
    }

    // 4. Check no existing rating
    const existing = await this.prisma.rating.findUnique({ where: { order_id: orderId } });
    if (existing) {
      throw new AppError('RATING_ALREADY_SUBMITTED', 409, 'A rating has already been submitted for this order');
    }

    // 5. Calculate weighted score
    const overall_score = calculateWeightedScore({
      technical_quality: data.technical_quality,
      communication: data.communication,
      timeliness: data.timeliness,
      documentation_quality: data.documentation_quality,
      professionalism: data.professionalism,
    });

    // 6. Create rating + update contractor aggregate in a transaction
    const rating = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rating.create({
        data: {
          order_id: orderId,
          submitted_by_user_id: customerId,
          rated_contractor_id: order.contractor_profile_id!,
          technical_quality: data.technical_quality,
          communication: data.communication,
          timeliness: data.timeliness,
          documentation_quality: data.documentation_quality,
          professionalism: data.professionalism,
          overall_score,
          ...(data.review_text !== undefined && { review_text: data.review_text }),
          tags: data.tags,
          response_deadline_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          is_visible: true,
        },
      });

      const profile = await tx.contractorProfile.findUniqueOrThrow({
        where: { id: order.contractor_profile_id! },
        select: { overall_rating: true, rating_count: true },
      });

      const { new_overall, new_count } = recalculateAggregateRating(
        Number(profile.overall_rating ?? 0),
        profile.rating_count,
        overall_score,
      );

      await tx.contractorProfile.update({
        where: { id: order.contractor_profile_id! },
        data: { overall_rating: new_overall, rating_count: new_count },
      });

      return created;
    });

    // 7. Audit
    void writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'RATING_SUBMITTED',
      entityType: 'Order',
      entityId: orderId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        overall_score,
        rated_contractor_id: order.contractor_profile_id,
        submitted_by: customerId,
      },
    });

    // 8. Notify contractor
    if (order.contractor_user?.email) {
      void this.emailQueue.add('new-rating-received', {
        type: 'new-rating-received',
        to: order.contractor_user.email,
        order_id: orderId,
        overall_score,
        review_text: data.review_text,
        respond_url: `${process.env.FRONTEND_URL}/ratings/${rating.id}/respond`,
        response_deadline: rating.response_deadline_at,
      });
    }

    // 9. Return
    return rating;
  }

  // ─── getContractorRatings ─────────────────────────────────────────────────

  async getContractorRatings(contractorProfileId: string, params: ListRatingsInput) {
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { id: contractorProfileId },
      select: { id: true },
    });
    if (!profile) throw new AppError('CONTRACTOR_NOT_FOUND', 404);

    const where = {
      rated_contractor_id: contractorProfileId,
      is_visible: true,
      ...(params.cursor && { id: { lt: params.cursor } }),
    };

    const [ratings, total_count] = await Promise.all([
      this.prisma.rating.findMany({
        where,
        include: {
          submitted_by_user: { select: { id: true, full_name: true } },
        },
        orderBy: { created_at: 'desc' },
        take: params.limit + 1,
      }),
      this.prisma.rating.count({ where: { rated_contractor_id: contractorProfileId, is_visible: true } }),
    ]);

    const hasMore = ratings.length > params.limit;
    const items = hasMore ? ratings.slice(0, params.limit) : ratings;
    const next_cursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    return { ratings: items, next_cursor, total_count };
  }

  // ─── getRatingSummary ─────────────────────────────────────────────────────

  async getRatingSummary(contractorProfileId: string) {
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { id: contractorProfileId },
      select: {
        overall_rating: true,
        rating_count: true,
        completed_orders_count: true,
      },
    });
    if (!profile) throw new AppError('CONTRACTOR_NOT_FOUND', 404);

    const visible = isRatingVisible(profile.completed_orders_count);

    if (!visible) {
      return {
        is_visible: false,
        overall_score: null,
        rating_count: profile.rating_count,
        criterion_averages: null,
        visibility_message:
          `Rating will be shown after ${RATING_VISIBILITY_THRESHOLD} completed orders. ` +
          `This expert has ${profile.completed_orders_count} completed.`,
      };
    }

    const ratings = await this.prisma.rating.findMany({
      where: { rated_contractor_id: contractorProfileId, is_visible: true },
      select: {
        technical_quality: true,
        communication: true,
        timeliness: true,
        documentation_quality: true,
        professionalism: true,
      },
    });

    if (ratings.length === 0) {
      return {
        is_visible: true,
        overall_score: null,
        rating_count: 0,
        criterion_averages: null,
        visibility_message: 'No ratings yet',
      };
    }

    type RatingFields = (typeof ratings)[0];
    const avg = (field: keyof RatingFields) =>
      Math.round((ratings.reduce((sum, r) => sum + r[field], 0) / ratings.length) * 10) / 10;

    const criterion_averages = {
      technical_quality: avg('technical_quality'),
      communication: avg('communication'),
      timeliness: avg('timeliness'),
      documentation_quality: avg('documentation_quality'),
      professionalism: avg('professionalism'),
    };

    return {
      is_visible: true,
      overall_score: profile.overall_rating ? Number(profile.overall_rating) : null,
      rating_count: profile.rating_count,
      criterion_averages,
      visibility_message: `Based on ${profile.rating_count} completed orders`,
    };
  }

  // ─── submitRatingResponse ─────────────────────────────────────────────────

  async submitRatingResponse(
    ratingId: string,
    contractorUserId: string,
    data: RatingResponseInput,
  ) {
    // 1. Find rating
    const rating = await this.prisma.rating.findUnique({
      where: { id: ratingId },
      select: {
        id: true,
        rated_contractor_id: true,
        response_text: true,
        response_deadline_at: true,
        responded_at: true,
      },
    });
    if (!rating) throw new AppError('RATING_NOT_FOUND', 404);

    // 2. Verify the requesting user is the rated contractor
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { user_id: contractorUserId },
      select: { id: true },
    });
    if (!profile || profile.id !== rating.rated_contractor_id) {
      throw new AppError('FORBIDDEN', 403, 'Only the rated contractor can respond to a rating');
    }

    // 3. Check response window
    if (new Date() > rating.response_deadline_at) {
      throw new AppError(
        'RESPONSE_WINDOW_CLOSED',
        403,
        `Response window closed on ${rating.response_deadline_at.toLocaleDateString('en-AU')}. Responses must be submitted within 14 days.`,
      );
    }

    // 4. Check no existing response
    if (rating.response_text) {
      throw new AppError(
        'RESPONSE_ALREADY_SUBMITTED',
        409,
        'A response has already been submitted for this rating. Only one response is permitted.',
      );
    }

    // 5. Update
    const updated = await this.prisma.rating.update({
      where: { id: ratingId },
      data: { response_text: data.response_text, responded_at: new Date() },
    });

    // 6. Audit
    void writeAudit(this.prisma, {
      actorId: contractorUserId,
      actionType: 'RATING_RESPONSE_SUBMITTED',
      entityType: 'Rating',
      entityId: ratingId,
      metadata: { responded_by: contractorUserId },
    });

    return updated;
  }

  // ─── adminHideRating ──────────────────────────────────────────────────────

  async adminHideRating(ratingId: string, adminId: string, reason: string, meta: RequestMeta) {
    const rating = await this.prisma.rating.findUnique({
      where: { id: ratingId },
      select: { id: true, is_visible: true, rated_contractor_id: true },
    });
    if (!rating) throw new AppError('RATING_NOT_FOUND', 404);
    if (!rating.is_visible) throw new AppError('ALREADY_HIDDEN', 409, 'Rating is already hidden');

    const updated = await this.prisma.$transaction(async (tx) => {
      const hidden = await tx.rating.update({
        where: { id: ratingId },
        data: { is_visible: false, hidden_reason: reason },
      });

      // Recompute aggregate from remaining visible ratings
      const remaining = await tx.rating.findMany({
        where: { rated_contractor_id: rating.rated_contractor_id, is_visible: true },
        select: { overall_score: true },
      });

      if (remaining.length === 0) {
        await tx.contractorProfile.update({
          where: { id: rating.rated_contractor_id },
          data: { overall_rating: null, rating_count: 0 },
        });
      } else {
        const sum = remaining.reduce((acc, r) => acc + Number(r.overall_score), 0);
        const new_overall = Math.round((sum / remaining.length) * 10) / 10;
        await tx.contractorProfile.update({
          where: { id: rating.rated_contractor_id },
          data: { overall_rating: new_overall, rating_count: remaining.length },
        });
      }

      return hidden;
    });

    void writeAudit(this.prisma, {
      actorId: adminId,
      actionType: 'RATING_HIDDEN',
      entityType: 'Rating',
      entityId: ratingId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason },
    });

    return updated;
  }
}
