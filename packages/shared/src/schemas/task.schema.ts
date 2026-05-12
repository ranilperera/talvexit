import { z } from 'zod';
import { DOMAIN_KEYS } from '../enums.js';

// ─── Shared sub-schemas ───────────────────────────────────────────────────────

const milestoneSchema = z.object({
  sequence: z.number().int().min(1).max(5),
  name: z.string().min(5).max(100).trim(),
  description: z.string().min(10).max(500).trim(),
  percentage_of_total: z.number().int().min(1).max(100),
});

export const currencySchema = z.enum(['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'SGD', 'CAD']);

const domainEnum = z.enum(DOMAIN_KEYS);

// ─── scopeSchema ──────────────────────────────────────────────────────────────
// Used for task creation and AI scoping output validation

export const scopeSchema = z
  .object({
    title: z.string().min(10).max(120).trim(),
    domain: domainEnum,
    objective: z.string().min(50).max(2000).trim(),
    in_scope: z.array(z.string().min(10).max(200).trim()).min(1).max(20),
    out_of_scope: z.array(z.string().min(5).max(200).trim()).min(1),
    assumptions: z.array(z.string().min(5).max(200).trim()).min(1),
    prerequisites: z.array(z.string().min(5).max(200).trim()),
    deliverables: z.array(z.string().min(10).max(200).trim()).min(1),
    currency: currencySchema.default('AUD'),
    price: z
      .number()
      .positive('Price must be greater than 0')
      .min(50, 'Minimum price is 50 in the selected currency'),
    hours_min: z.number().int().min(1).max(160),
    hours_max: z.number().int().min(1).max(160),
    milestone_count: z.number().int().min(1).max(5).default(1),
    milestones: z.array(milestoneSchema).optional(),
  })
  .refine((data) => data.hours_max >= data.hours_min, {
    message: 'hours_max must be greater than or equal to hours_min',
    path: ['hours_max'],
  })
  .refine(
    (data) => {
      if (data.milestone_count > 1) {
        return data.milestones && data.milestones.length === data.milestone_count;
      }
      return true;
    },
    {
      message:
        'milestones array must have exactly milestone_count entries when milestone_count > 1',
      path: ['milestones'],
    },
  )
  .refine(
    (data) => {
      if (!data.milestones || data.milestones.length === 0) return true;
      const total = data.milestones.reduce((sum, m) => sum + m.percentage_of_total, 0);
      return total === 100;
    },
    {
      message: 'Milestone percentages must sum to 100',
      path: ['milestones'],
    },
  );

// ─── updateTaskSchema ─────────────────────────────────────────────────────────
// All fields optional — cross-field refinements guard against impossible states
// only when both fields are present

export const updateTaskSchema = z
  .object({
    title: z.string().min(10).max(120).trim().optional(),
    domain: domainEnum.optional(),
    objective: z.string().min(50).max(2000).trim().optional(),
    in_scope: z.array(z.string().min(10).max(200).trim()).min(1).max(20).optional(),
    out_of_scope: z.array(z.string().min(5).max(200).trim()).min(1).optional(),
    assumptions: z.array(z.string().min(5).max(200).trim()).min(1).optional(),
    prerequisites: z.array(z.string().min(5).max(200).trim()).optional(),
    deliverables: z.array(z.string().min(10).max(200).trim()).min(1).optional(),
    currency: currencySchema.optional(),
    price: z.number().positive('Price must be greater than 0').min(50).optional(),
    hours_min: z.number().int().min(1).max(160).optional(),
    hours_max: z.number().int().min(1).max(160).optional(),
    milestone_count: z.number().int().min(1).max(5).optional(),
    milestones: z.array(milestoneSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.hours_max !== undefined && data.hours_min !== undefined) {
        return data.hours_max >= data.hours_min;
      }
      return true;
    },
    {
      message: 'hours_max must be greater than or equal to hours_min',
      path: ['hours_max'],
    },
  )
  .refine(
    (data) => {
      if (data.milestone_count !== undefined && data.milestone_count > 1) {
        return data.milestones && data.milestones.length === data.milestone_count;
      }
      return true;
    },
    {
      message:
        'milestones array must have exactly milestone_count entries when milestone_count > 1',
      path: ['milestones'],
    },
  )
  .refine(
    (data) => {
      if (!data.milestones || data.milestones.length === 0) return true;
      const total = data.milestones.reduce((sum, m) => sum + m.percentage_of_total, 0);
      return total === 100;
    },
    {
      message: 'Milestone percentages must sum to 100',
      path: ['milestones'],
    },
  );

// ─── taskSearchSchema ─────────────────────────────────────────────────────────

export const taskSearchSchema = z.object({
  q: z.string().max(200).optional(),
  domain: domainEnum.optional(),
  currency: currencySchema.optional(),
  price_min: z.coerce.number().positive().optional(),
  price_max: z.coerce.number().positive().optional(),
  hours_max: z.coerce.number().int().positive().optional(),
  verified_only: z.coerce.boolean().optional(),
  insurance_badge: z.coerce.boolean().optional(),
  sort: z
    .enum(['newest', 'price_asc', 'price_desc', 'rating', 'popular'])
    .optional()
    .default('newest'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ─── createSmrSchema ──────────────────────────────────────────────────────────

export const createSmrSchema = z.object({
  element_type: z.enum([
    'ACTIVITY',
    'ASSUMPTION',
    'DELIVERABLE',
    'PRICE',
    'HOURS',
    'MILESTONE',
  ]),
  original_value: z.unknown(),
  requested_value: z.unknown(),
  reason: z.string().min(20).max(2000).trim(),
});

// ─── respondSmrSchema ─────────────────────────────────────────────────────────

export const respondSmrSchema = z
  .object({
    response: z.enum(['ACCEPT', 'ACCEPT_WITH_REVISION', 'DECLINE']),
    response_notes: z.string().max(2000).optional(),
    revised_scope: z.record(z.unknown()).optional(),
    revised_price: z.number().positive().optional(),
    revised_currency: currencySchema.optional(),
  })
  .refine(
    (data) => {
      if (data.response === 'ACCEPT_WITH_REVISION') {
        return (
          (data.revised_scope !== undefined && Object.keys(data.revised_scope).length > 0) ||
          data.revised_price !== undefined
        );
      }
      return true;
    },
    {
      message: 'ACCEPT_WITH_REVISION requires revised_scope or revised_price',
      path: ['revised_scope'],
    },
  );

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScopeInput = z.infer<typeof scopeSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskSearchInput = z.infer<typeof taskSearchSchema>;
export type CreateSmrInput = z.infer<typeof createSmrSchema>;
export type RespondSmrInput = z.infer<typeof respondSmrSchema>;
