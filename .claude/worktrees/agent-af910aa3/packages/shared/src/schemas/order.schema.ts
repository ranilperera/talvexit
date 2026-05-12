import { z } from 'zod';

// ─── createOrderSchema ────────────────────────────────────────────────────────
// Create order from catalog task or AI scoping

export const createOrderSchema = z
  .object({
    task_id: z.string().cuid().optional(),
    scoping_job_id: z.string().cuid().optional(),
    environment_details: z
      .object({
        os: z.string().max(100).optional(),
        network_size: z.string().max(100).optional(),
        existing_tools: z.string().max(500).optional(),
        access_method: z.string().max(200).optional(),
        special_notes: z.string().max(1000).optional(),
      })
      .optional(),
  })
  .refine((data) => data.task_id || data.scoping_job_id, {
    message: 'Either task_id or scoping_job_id is required',
    path: ['task_id'],
  })
  .refine((data) => !(data.task_id && data.scoping_job_id), {
    message: 'Provide either task_id or scoping_job_id, not both',
    path: ['task_id'],
  });

// ─── listOrdersSchema ─────────────────────────────────────────────────────────

export const listOrdersSchema = z.object({
  status: z
    .enum([
      'PENDING_APPROVAL',
      'SCOPED',
      'ACCEPTED',
      'PAYMENT_HELD',
      'IN_PROGRESS',
      'PENDING_REVIEW',
      'REVISION_REQUESTED',
      'COMPLETED',
      'DISPUTED',
      'CANCELLED',
    ])
    .optional(),
  role: z.enum(['as_customer', 'as_expert']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ─── createWorkLogSchema ──────────────────────────────────────────────────────

export const createWorkLogSchema = z.object({
  hours_worked: z
    .number()
    .min(0.25, 'Minimum 0.25 hours (15 minutes)')
    .max(24, 'Cannot log more than 24 hours at once'),
  description: z.string().min(20, 'Description must be at least 20 characters').max(2000).trim(),
  started_at: z.string().datetime(),
});

// ─── addDeliverableSchema ─────────────────────────────────────────────────────

export const addDeliverableSchema = z.object({
  blob_path: z.string().min(1),
  file_name: z.string().min(1).max(255),
  file_size_bytes: z.number().int().positive(),
  mime_type: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
});

// ─── requestRevisionSchema ────────────────────────────────────────────────────

export const requestRevisionSchema = z.object({
  reason: z
    .string()
    .min(20, 'Please provide a detailed reason for the revision')
    .max(2000)
    .trim(),
});

// ─── raiseDisputeSchema ───────────────────────────────────────────────────────

export const raiseDisputeSchema = z.object({
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
    .min(50, 'Please describe the dispute in detail')
    .max(5000)
    .trim(),
  evidence_blob_paths: z.array(z.string()).max(10).default([]),
});

// ─── createChangeRequestSchema ────────────────────────────────────────────────

export const createChangeRequestSchema = z.object({
  description: z.string().min(30).max(2000).trim(),
  unforeseen_finding: z.string().min(20).max(2000).trim(),
  additional_hours: z.number().int().min(1).max(160),
  additional_cost: z.number().positive(),
});

// ─── decideChangeRequestSchema ────────────────────────────────────────────────

export const decideChangeRequestSchema = z.object({
  decision: z.enum(['APPROVE', 'DECLINE']),
  decision_notes: z.string().max(1000).optional(),
});

// ─── disputeDeterminationSchema ───────────────────────────────────────────────

export const disputeDeterminationSchema = z
  .object({
    outcome: z.enum(['FULL_PAYMENT', 'PARTIAL_PAYMENT', 'FULL_REFUND', 'REMEDY_REQUIRED']),
    written_reasons: z
      .string()
      .min(100, 'Determination requires at least 100 characters')
      .max(10000)
      .trim(),
    payment_amount_aud: z.number().positive().optional(), // required for PARTIAL_PAYMENT
    payment_action_status: z.string().optional(),
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersInput = z.infer<typeof listOrdersSchema>;
export type CreateWorkLogInput = z.infer<typeof createWorkLogSchema>;
export type AddDeliverableInput = z.infer<typeof addDeliverableSchema>;
export type RequestRevisionInput = z.infer<typeof requestRevisionSchema>;
export type RaiseDisputeInput = z.infer<typeof raiseDisputeSchema>;
export type CreateChangeRequestInput = z.infer<typeof createChangeRequestSchema>;
export type DecideChangeRequestInput = z.infer<typeof decideChangeRequestSchema>;
export type DisputeDeterminationInput = z.infer<typeof disputeDeterminationSchema>;
