import { z } from 'zod';

// ─── Individual criterion score ───────────────────────────────────────────────

const scoreField = z
  .number()
  .int('Score must be a whole number')
  .min(1, 'Score must be at least 1')
  .max(5, 'Score must be at most 5');

// ─── submitRatingSchema ───────────────────────────────────────────────────────

export const submitRatingSchema = z.object({
  technical_quality: scoreField,
  communication: scoreField,
  timeliness: scoreField,
  documentation_quality: scoreField,
  professionalism: scoreField,
  review_text: z
    .string()
    .max(1000, 'Review must be under 1000 characters')
    .trim()
    .optional(),
  tags: z
    .array(
      z.enum([
        'CLEAR_SCOPE',
        'FAST_DELIVERY',
        'GREAT_DOCS',
        'RESPONSIVE',
        'WENT_ABOVE_SCOPE',
        'LATE_DELIVERY',
        'POOR_DOCS',
        'SCOPE_CREEP',
        'UNRESPONSIVE',
      ]),
    )
    .max(5)
    .default([]),
});

// ─── ratingResponseSchema ─────────────────────────────────────────────────────

export const ratingResponseSchema = z.object({
  response_text: z
    .string()
    .min(10, 'Response must be at least 10 characters')
    .max(500, 'Response must be under 500 characters')
    .trim(),
});

// ─── fileDisputeSchema ────────────────────────────────────────────────────────

export const fileDisputeSchema = z.object({
  grounds: z.enum([
    'DELIVERABLES_NOT_AS_SCOPED',
    'WORK_ABANDONED',
    'ACCESS_EXCEEDED',
    'CUSTOMER_WITHHOLDING_APPROVAL',
    'SCOPE_MISREPRESENTATION',
    'DATA_BREACH',
  ]),
  description: z
    .string()
    .min(50, 'Please describe the dispute in at least 50 characters')
    .max(5000)
    .trim(),
  evidence_blob_paths: z.array(z.string()).max(10).default([]),
});

// ─── addSubmissionSchema ──────────────────────────────────────────────────────

export const addSubmissionSchema = z.object({
  description: z
    .string()
    .min(20, 'Description must be at least 20 characters')
    .max(2000)
    .trim(),
  file_blob_paths: z.array(z.string()).max(10).default([]),
});

// ─── assignDisputeSchema ──────────────────────────────────────────────────────

export const assignDisputeSchema = z.object({
  admin_user_id: z.string().cuid(),
});

// ─── appointArbitratorSchema ──────────────────────────────────────────────────

export const appointArbitratorSchema = z.object({
  arbitrator_contractor_id: z.string().cuid(),
  appointment_notes: z.string().max(1000).optional(),
});

// ─── determinationSchema ──────────────────────────────────────────────────────

export const determinationSchema = z
  .object({
    outcome: z.enum(['FULL_PAYMENT', 'PARTIAL_PAYMENT', 'FULL_REFUND', 'REMEDY_REQUIRED']),
    payment_amount_aud: z.number().positive().optional(),
    written_reasons: z
      .string()
      .min(100, 'Written reasons must be at least 100 characters')
      .max(10000)
      .trim(),
  })
  .refine(
    (data) => {
      if (data.outcome === 'PARTIAL_PAYMENT') {
        return data.payment_amount_aud !== undefined;
      }
      return true;
    },
    {
      message: 'payment_amount_aud required for PARTIAL_PAYMENT outcome',
      path: ['payment_amount_aud'],
    },
  );

// ─── listRatingsSchema ────────────────────────────────────────────────────────

export const listRatingsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubmitRatingInput = z.infer<typeof submitRatingSchema>;
export type RatingResponseInput = z.infer<typeof ratingResponseSchema>;
export type FileDisputeInput = z.infer<typeof fileDisputeSchema>;
export type AddSubmissionInput = z.infer<typeof addSubmissionSchema>;
export type AssignDisputeInput = z.infer<typeof assignDisputeSchema>;
export type AppointArbitratorInput = z.infer<typeof appointArbitratorSchema>;
export type DeterminationInput = z.infer<typeof determinationSchema>;
export type ListRatingsInput = z.infer<typeof listRatingsSchema>;
