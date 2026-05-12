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

const ORDER_STATUS_VALUES = [
  // Legacy escrow workflow statuses
  'PENDING_APPROVAL',
  'SCOPED',
  'ACCEPTED',
  'PAYMENT_HELD',
  'REVISION_REQUESTED',
  'COMPLETED',
  'DISPUTED',
  'CANCELLED',
  // Unified company workflow statuses
  'BOOKED',
  'PROPOSAL_DRAFT',
  'PROPOSAL_SENT',
  'PROPOSAL_CHANGES_REQUESTED',
  'PO_GENERATED',
  'IN_PROGRESS',
  'PENDING_REVIEW',
  'DELIVERABLES_ACCEPTED',
  'INVOICE_SENT',
  'PAYMENT_RECEIVED',
  'PAYOUT_PENDING',
  'PAYOUT_PROCESSING',
] as const;

export const listOrdersSchema = z.object({
  // Accepts a single status ("IN_PROGRESS") or comma-separated list ("SCOPED,ACCEPTED,PAYMENT_HELD")
  status: z
    .preprocess(
      (val) =>
        typeof val === 'string' && val.includes(',')
          ? val.split(',').map((s) => s.trim())
          : val,
      z
        .union([
          z.enum(ORDER_STATUS_VALUES),
          z.array(z.enum(ORDER_STATUS_VALUES)),
        ])
        .optional(),
    )
    .optional(),
  role: z.enum(['as_customer', 'as_expert']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── createWorkLogSchema ──────────────────────────────────────────────────────

export const createWorkLogSchema = z
  .object({
    // Accept either hours_worked or hours (frontend convenience alias)
    hours_worked: z.number().min(0.25).max(24).optional(),
    hours: z.number().min(0.25).max(24).optional(),
    description: z.string().min(20, 'Description must be at least 20 characters').max(2000).trim(),
    started_at: z.string().datetime(),
  })
  .transform((data) => ({
    hours_worked: data.hours_worked ?? data.hours ?? 1,
    description: data.description,
    started_at: data.started_at,
  }))
  .refine((data) => data.hours_worked >= 0.25, {
    message: 'Minimum 0.25 hours (15 minutes)',
    path: ['hours_worked'],
  });

// ─── addDeliverableSchema ─────────────────────────────────────────────────────

export const addDeliverableSchema = z
  .object({
    description: z.string().min(30, 'Description must be at least 30 characters').max(1000),
    blob_path: z.string().min(1).optional(),
    file_name: z.string().min(1).max(255).optional(),
    filename: z.string().min(1).max(255).optional(), // frontend alias
    file_size_bytes: z.number().int().positive().optional(),
    mime_type: z.string().max(100).optional(),
  })
  .transform((data) => ({
    description: data.description,
    blob_path: data.blob_path,
    file_name: data.file_name ?? data.filename,
    file_size_bytes: data.file_size_bytes,
    mime_type: data.mime_type,
  }));

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

export const createChangeRequestSchema = z
  .object({
    // Canonical fields
    description: z.string().min(30).max(2000).trim().optional(),
    unforeseen_finding: z.string().min(20).max(2000).trim().optional(),
    additional_hours: z.number().int().min(1).max(160).optional(),
    additional_cost: z.number().min(0).optional(),
    // Frontend aliases (legacy/convenience field names)
    finding: z.string().min(20).max(2000).trim().optional(),
    extra_hours: z.number().int().min(1).max(160).optional(),
    extra_cost_aud: z.number().min(0).optional(),
  })
  .transform((data) => ({
    description: data.description ?? data.finding ?? '',
    unforeseen_finding: data.unforeseen_finding ?? data.finding ?? '',
    additional_hours: data.additional_hours ?? data.extra_hours ?? 1,
    additional_cost: data.additional_cost ?? data.extra_cost_aud ?? 0,
  }))
  .refine((d) => d.description.length >= 20, {
    message: 'Description must be at least 20 characters',
    path: ['description'],
  })
  .refine((d) => d.unforeseen_finding.length >= 20, {
    message: 'Finding must be at least 20 characters',
    path: ['unforeseen_finding'],
  });

// ─── decideChangeRequestSchema ────────────────────────────────────────────────

export const decideChangeRequestSchema = z.object({
  decision: z.enum(['APPROVE', 'DECLINE']),
  decision_notes: z.string().max(1000).optional(),
});

// ─── disputeDeterminationSchema ───────────────────────────────────────────────
// Accepts both the legacy executive shape (pre-cutover orders, where the
// platform held funds and the determination triggered Stripe transfer/refund)
// and the Phase 3 advisory shape (post-cutover, no fund movement — only a
// recommendation + optional refund advice). The service layer validates the
// right fields are present based on the order's cutover status.

const recommendedActionEnum = z.enum([
  'NONE',
  'WARNING',
  'TEMP_SUSPEND',
  'INDEFINITE_SUSPEND',
  'BAN',
]);

export const disputeDeterminationSchema = z
  .object({
    // Always required — explanation shown to both parties
    written_reasons: z
      .string()
      .min(100, 'Determination requires at least 100 characters')
      .max(10000)
      .trim(),

    // Legacy executive fields (pre-cutover only)
    outcome: z
      .enum(['FULL_PAYMENT', 'PARTIAL_PAYMENT', 'FULL_REFUND', 'REMEDY_REQUIRED'])
      .optional(),
    payment_amount_aud: z.number().positive().optional(),
    payment_action_status: z.string().optional(),

    // Advisory fields (post-cutover)
    recommended_action: z.string().trim().max(2000).optional(),
    recommended_supplier_action: recommendedActionEnum.optional(),
    recommended_customer_action: recommendedActionEnum.optional(),
    recommended_refund_amount_aud: z.number().nonnegative().optional(),
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
