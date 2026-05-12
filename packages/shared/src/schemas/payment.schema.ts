import { z } from 'zod';

// ─── createPaymentIntentSchema ────────────────────────────────────────────────

export const createPaymentIntentSchema = z.object({
  currency: z
    .enum(['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'SGD', 'CAD'])
    .optional(),
});

// ─── approveMilestoneSchema ───────────────────────────────────────────────────

export const approveMilestoneSchema = z.object({
  milestone_sequence: z.number().int().min(1).max(5),
});

// ─── initiateConnectSchema ────────────────────────────────────────────────────

export const initiateConnectSchema = z.object({
  country:     z.string().length(2).default('AU'),
  return_url:  z.string().url(),
  refresh_url: z.string().url(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;
export type ApproveMilestoneInput    = z.infer<typeof approveMilestoneSchema>;
export type InitiateConnectInput     = z.infer<typeof initiateConnectSchema>;
