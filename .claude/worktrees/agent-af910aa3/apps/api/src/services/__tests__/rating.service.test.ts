import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { RatingService } from '../rating.service.js';

function makePrisma() {
  const tx = {
    rating: { create: vi.fn() },
    contractorProfile: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  };
  return {
    order: { findUnique: vi.fn() },
    rating: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    contractorProfile: { findUnique: vi.fn() },
    auditLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx)),
    _tx: tx,
  };
}

function makeQueue() {
  return { add: vi.fn(async () => ({})) };
}

const META = { ip: '127.0.0.1', userAgent: 'vitest' };

const BASE_INPUT = {
  technical_quality: 4,
  communication: 3,
  timeliness: 5,
  documentation_quality: 4,
  professionalism: 3,
  review_text: 'Great technical execution and clear handover docs.',
  tags: ['CLEAR_SCOPE'] as const,
};

describe('RatingService.submitRating()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: RatingService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new RatingService(prisma as never, queue as never);
  });

  it('RT-01: valid completed order -> creates rating, updates aggregate, queues email, deadline +14d', async () => {
    prisma.order.findUnique.mockResolvedValue({
      status: 'COMPLETED',
      customer_id: 'customer_1',
      contractor_profile_id: 'cp_1',
      contractor_user: { email: 'contractor@test.com', full_name: 'Cont' },
    });
    prisma.rating.findUnique.mockResolvedValue(null);
    prisma._tx.rating.create.mockResolvedValue({
      id: 'rating_1',
      response_deadline_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });
    prisma._tx.contractorProfile.findUniqueOrThrow.mockResolvedValue({
      overall_rating: new Prisma.Decimal(4.0),
      rating_count: 2,
    });
    prisma._tx.contractorProfile.update.mockResolvedValue({});

    const result = await svc.submitRating('order_1', 'customer_1', BASE_INPUT as never, META);

    expect(prisma._tx.rating.create).toHaveBeenCalledOnce();
    expect(prisma._tx.contractorProfile.update).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledWith(
      'new-rating-received',
      expect.objectContaining({ type: 'new-rating-received', order_id: 'order_1' }),
    );
    expect(result.id).toBe('rating_1');
    const createdDeadline = prisma._tx.rating.create.mock.calls[0][0].data.response_deadline_at as Date;
    const hours = (createdDeadline.getTime() - Date.now()) / (1000 * 60 * 60);
    expect(hours).toBeGreaterThan(24 * 13.9);
    expect(hours).toBeLessThan(24 * 14.1);
  });

  it('RT-02: overall score formula for {4,3,5,4,3} is 3.9', async () => {
    prisma.order.findUnique.mockResolvedValue({
      status: 'COMPLETED',
      customer_id: 'customer_1',
      contractor_profile_id: 'cp_1',
      contractor_user: { email: 'contractor@test.com', full_name: 'Cont' },
    });
    prisma.rating.findUnique.mockResolvedValue(null);
    prisma._tx.rating.create.mockResolvedValue({
      id: 'rating_1',
      response_deadline_at: new Date(),
    });
    prisma._tx.contractorProfile.findUniqueOrThrow.mockResolvedValue({
      overall_rating: null,
      rating_count: 0,
    });
    prisma._tx.contractorProfile.update.mockResolvedValue({});

    await svc.submitRating('order_1', 'customer_1', BASE_INPUT as never, META);

    expect(prisma._tx.rating.create.mock.calls[0][0].data.overall_score).toBe(3.9);
  });

  it('RT-03: non-completed order -> ORDER_NOT_COMPLETED 422', async () => {
    prisma.order.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      customer_id: 'customer_1',
      contractor_profile_id: 'cp_1',
      contractor_user: null,
    });

    await expect(
      svc.submitRating('order_1', 'customer_1', BASE_INPUT as never, META),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_COMPLETED', status: 422 });
  });

  it('RT-04: duplicate rating -> RATING_ALREADY_SUBMITTED 409', async () => {
    prisma.order.findUnique.mockResolvedValue({
      status: 'COMPLETED',
      customer_id: 'customer_1',
      contractor_profile_id: 'cp_1',
      contractor_user: null,
    });
    prisma.rating.findUnique.mockResolvedValue({ id: 'rating_existing' });

    await expect(
      svc.submitRating('order_1', 'customer_1', BASE_INPUT as never, META),
    ).rejects.toMatchObject({ code: 'RATING_ALREADY_SUBMITTED', status: 409 });
  });

  it('RT-05: non-customer submit -> FORBIDDEN 403', async () => {
    prisma.order.findUnique.mockResolvedValue({
      status: 'COMPLETED',
      customer_id: 'other_customer',
      contractor_profile_id: 'cp_1',
      contractor_user: null,
    });

    await expect(
      svc.submitRating('order_1', 'customer_1', BASE_INPUT as never, META),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('RT-06: first rating updates aggregate to new score and count 1', async () => {
    prisma.order.findUnique.mockResolvedValue({
      status: 'COMPLETED',
      customer_id: 'customer_1',
      contractor_profile_id: 'cp_1',
      contractor_user: null,
    });
    prisma.rating.findUnique.mockResolvedValue(null);
    prisma._tx.rating.create.mockResolvedValue({ id: 'rating_1', response_deadline_at: new Date() });
    prisma._tx.contractorProfile.findUniqueOrThrow.mockResolvedValue({ overall_rating: null, rating_count: 0 });
    prisma._tx.contractorProfile.update.mockResolvedValue({});

    await svc.submitRating('order_1', 'customer_1', BASE_INPUT as never, META);

    expect(prisma._tx.contractorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ overall_rating: 3.9, rating_count: 1 }) }),
    );
  });

  it('RT-07: third rating updates running average and count 3', async () => {
    prisma.order.findUnique.mockResolvedValue({
      status: 'COMPLETED',
      customer_id: 'customer_1',
      contractor_profile_id: 'cp_1',
      contractor_user: null,
    });
    prisma.rating.findUnique.mockResolvedValue(null);
    prisma._tx.rating.create.mockResolvedValue({ id: 'rating_1', response_deadline_at: new Date() });
    prisma._tx.contractorProfile.findUniqueOrThrow.mockResolvedValue({
      overall_rating: new Prisma.Decimal(4.5),
      rating_count: 2,
    });
    prisma._tx.contractorProfile.update.mockResolvedValue({});

    await svc.submitRating('order_1', 'customer_1', BASE_INPUT as never, META);

    // ((4.5*2)+3.9)/3 = 4.3
    expect(prisma._tx.contractorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ overall_rating: 4.3, rating_count: 3 }) }),
    );
  });
});

describe('RatingService.getRatingSummary()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: RatingService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new RatingService(prisma as never, queue as never);
  });

  it('RT-08: 2 completed orders -> not visible and threshold message', async () => {
    prisma.contractorProfile.findUnique.mockResolvedValue({
      overall_rating: null,
      rating_count: 0,
      completed_orders_count: 2,
    });

    const result = await svc.getRatingSummary('cp_1');
    expect(result.is_visible).toBe(false);
    expect(result.overall_score).toBeNull();
    expect(result.visibility_message).toContain('after 3 completed orders');
  });

  it('RT-09: 3 completed + ratings -> visible with criterion averages and overall', async () => {
    prisma.contractorProfile.findUnique.mockResolvedValue({
      overall_rating: new Prisma.Decimal(4.2),
      rating_count: 3,
      completed_orders_count: 3,
    });
    prisma.rating.findMany.mockResolvedValue([
      { technical_quality: 4, communication: 4, timeliness: 5, documentation_quality: 4, professionalism: 4 },
      { technical_quality: 5, communication: 4, timeliness: 4, documentation_quality: 4, professionalism: 4 },
      { technical_quality: 4, communication: 5, timeliness: 4, documentation_quality: 5, professionalism: 5 },
    ]);

    const result = await svc.getRatingSummary('cp_1');
    expect(result.is_visible).toBe(true);
    expect(result.overall_score).toBe(4.2);
    expect(result.criterion_averages).toBeTruthy();
  });

  it('RT-10: visible profile with no ratings -> overall null and "No ratings yet"', async () => {
    prisma.contractorProfile.findUnique.mockResolvedValue({
      overall_rating: null,
      rating_count: 0,
      completed_orders_count: 5,
    });
    prisma.rating.findMany.mockResolvedValue([]);

    const result = await svc.getRatingSummary('cp_1');
    expect(result.is_visible).toBe(true);
    expect(result.overall_score).toBeNull();
    expect(result.visibility_message).toBe('No ratings yet');
  });
});

describe('RatingService.submitRatingResponse()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let svc: RatingService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    queue = makeQueue();
    svc = new RatingService(prisma as never, queue as never);
  });

  it('RT-11: contractor responds within 14 days -> response saved', async () => {
    prisma.rating.findUnique.mockResolvedValue({
      id: 'rating_1',
      rated_contractor_id: 'cp_1',
      response_text: null,
      response_deadline_at: new Date(Date.now() + 60_000),
      responded_at: null,
    });
    prisma.contractorProfile.findUnique.mockResolvedValue({ id: 'cp_1' });
    prisma.rating.update.mockResolvedValue({ id: 'rating_1', response_text: 'Thanks', responded_at: new Date() });

    const result = await svc.submitRatingResponse('rating_1', 'user_1', { response_text: 'Thanks for the feedback.' });
    expect(result.response_text).toBe('Thanks');
  });

  it('RT-12: response after deadline -> RESPONSE_WINDOW_CLOSED 403', async () => {
    prisma.rating.findUnique.mockResolvedValue({
      id: 'rating_1',
      rated_contractor_id: 'cp_1',
      response_text: null,
      response_deadline_at: new Date(Date.now() - 60_000),
      responded_at: null,
    });
    prisma.contractorProfile.findUnique.mockResolvedValue({ id: 'cp_1' });

    await expect(
      svc.submitRatingResponse('rating_1', 'user_1', { response_text: 'Late response' }),
    ).rejects.toMatchObject({ code: 'RESPONSE_WINDOW_CLOSED', status: 403 });
  });

  it('RT-13: second response attempt -> RESPONSE_ALREADY_SUBMITTED 409', async () => {
    prisma.rating.findUnique.mockResolvedValue({
      id: 'rating_1',
      rated_contractor_id: 'cp_1',
      response_text: 'Existing response',
      response_deadline_at: new Date(Date.now() + 60_000),
      responded_at: new Date(),
    });
    prisma.contractorProfile.findUnique.mockResolvedValue({ id: 'cp_1' });

    await expect(
      svc.submitRatingResponse('rating_1', 'user_1', { response_text: 'Another response' }),
    ).rejects.toMatchObject({ code: 'RESPONSE_ALREADY_SUBMITTED', status: 409 });
  });

  it('RT-14: different contractor -> FORBIDDEN 403', async () => {
    prisma.rating.findUnique.mockResolvedValue({
      id: 'rating_1',
      rated_contractor_id: 'cp_1',
      response_text: null,
      response_deadline_at: new Date(Date.now() + 60_000),
      responded_at: null,
    });
    prisma.contractorProfile.findUnique.mockResolvedValue({ id: 'cp_other' });

    await expect(
      svc.submitRatingResponse('rating_1', 'user_1', { response_text: 'Nope' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});
