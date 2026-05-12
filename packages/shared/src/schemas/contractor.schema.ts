import { z } from 'zod';
import { DOMAIN_KEYS } from '../enums.js';

// ─── Step 1 — Personal Info ───────────────────────────────────────────────────

export const step1Schema = z.object({
  legal_name: z.string().min(3, 'Legal name must be at least 3 characters').max(200).optional(),
  bio: z.string().max(1000).optional(),
  linkedin_url: z.string().url().optional().or(z.literal('')),
  timezone: z.string().min(1, 'Timezone is required'),
  phone: z
    .string()
    .regex(/^\+?[0-9\s\-]{8,20}$/)
    .optional(),
});
export type Step1Input = z.infer<typeof step1Schema>;

// ─── Step 2 — Employment Declaration ─────────────────────────────────────────

export const step2Schema = z
  .object({
    employment_type: z.enum([
      'SOLE_TRADER',
      'EMPLOYED_WITH_PERMISSION',
      'EMPLOYED_NO_RESTRICTION',
      'BUSINESS_ENTITY',
    ]),
    employer_name: z.string().min(2).max(200).optional(),
    has_employer_consent: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (
        data.employment_type === 'EMPLOYED_WITH_PERMISSION' ||
        data.employment_type === 'EMPLOYED_NO_RESTRICTION'
      ) {
        return data.employer_name !== undefined && data.employer_name.length > 0;
      }
      return true;
    },
    {
      message: 'Employer name required for employed contractors',
      path: ['employer_name'],
    },
  )
  .refine(
    (data) => {
      if (data.employment_type === 'EMPLOYED_WITH_PERMISSION') {
        return data.has_employer_consent === true;
      }
      return true;
    },
    {
      message: 'Employer consent must be confirmed',
      path: ['has_employer_consent'],
    },
  );
export type Step2Input = z.infer<typeof step2Schema>;

// ─── Step 3 — Domains & Skills ────────────────────────────────────────────────

export const step3Schema = z.object({
  domains: z
    .array(z.enum(DOMAIN_KEYS))
    .min(1, 'Select at least one domain')
    .max(8, 'Maximum 8 domains'),
  skills: z.array(z.string().min(2).max(50)).max(20),
});
export type Step3Input = z.infer<typeof step3Schema>;

// ─── Step 4 — Rates & Availability ───────────────────────────────────────────

export const step4Schema = z.object({
  hourly_rate_aud: z.number().min(50).max(500),
  availability_hours_per_week: z.number().int().min(1).max(60),
  available_from: z.string().datetime().optional(),
});
export type Step4Input = z.infer<typeof step4Schema>;

// ─── Step 5 — Identity Upload ─────────────────────────────────────────────────

export const step5Schema = z.object({
  identity_document_type: z.enum(['PASSPORT', 'DRIVERS_LICENCE', 'NATIONAL_ID']),
  identity_document_blob_path: z.string().min(1),
});
export type Step5Input = z.infer<typeof step5Schema>;

// ─── Step 7 — Agreement Acceptance ───────────────────────────────────────────

export const step7Schema = z.object({
  agreement_version: z.string().min(1),
  agreement_accepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Contractor Agreement' }),
  }),
});
export type Step7Input = z.infer<typeof step7Schema>;
