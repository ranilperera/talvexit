import { z } from 'zod';
import { DOMAIN_KEYS } from '../enums.js';

// ─── generateScopeSchema ──────────────────────────────────────────────────────
// Customer requirement submission

export const generateScopeSchema = z.object({
  requirement_text: z
    .string()
    .min(30, 'Please describe your requirement in at least 30 characters')
    .max(3000, 'Requirement text must be under 3000 characters')
    .trim(),
  context: z
    .object({
      os: z.string().max(200).optional(),
      tools: z.string().max(500).optional(),
      environment: z.string().max(500).optional(),
      constraints: z.string().max(500).optional(),
    })
    .optional(),
  domain_hint: z.enum(DOMAIN_KEYS).optional(),
});

// ─── acceptScopeSchema ────────────────────────────────────────────────────────
// Customer accepts scope (with optional edits)

export const acceptScopeSchema = z.object({
  scope: z.object({
    title: z.string().min(10).max(120),
    domain: z.string(),
    objective: z.string().min(50),
    in_scope: z.array(z.string().min(10)).min(1),
    out_of_scope: z.array(z.string().min(5)).min(1),
    assumptions: z.array(z.string().min(5)).min(1),
    prerequisites: z.array(z.string().min(5)),
    deliverables: z.array(z.string().min(10)).min(1),
    currency: z.string().default('AUD'),
    price: z.number().positive().min(50),
    hours_min: z.number().int().min(1).max(160),
    hours_max: z.number().int().min(1).max(160),
    milestone_count: z.number().int().min(1).max(5).default(1),
    milestones: z.array(z.unknown()).optional(),
  }),
});

// ─── regenerateSectionSchema ──────────────────────────────────────────────────
// Partial section regeneration request

export const regenerateSectionSchema = z.object({
  section: z.enum([
    'in_scope',
    'out_of_scope',
    'assumptions',
    'prerequisites',
    'deliverables',
    'price',
    'hours',
    'title',
    'objective',
  ]),
  feedback: z
    .string()
    .max(500, 'Feedback must be under 500 characters')
    .optional(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type GenerateScopeInput = z.infer<typeof generateScopeSchema>;
export type AcceptScopeInput = z.infer<typeof acceptScopeSchema>;
export type RegenerateSectionInput = z.infer<typeof regenerateSectionSchema>;
