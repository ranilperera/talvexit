import { z } from 'zod';

// ─── Upload new certificate ────────────────────────────────────────────────────

export const uploadCertificateSchema = z
  .object({
    insurer_name: z.string().min(2).max(200),
    policy_number: z.string().min(2).max(100),
    insurance_type: z.enum(['PI', 'PL', 'CYBER']),
    coverage_amount_aud: z.number().min(1).max(100_000_000),
    policy_start_date: z.string().datetime(),
    policy_expiry_date: z.string().datetime(),
    worldwide_coverage: z.literal(true, {
      errorMap: () => ({ message: 'Certificate must have worldwide coverage' }),
    }),
    certificate_blob_path: z.string().min(1),
  })
  .refine(
    (data) => {
      const start = new Date(data.policy_start_date);
      const expiry = new Date(data.policy_expiry_date);
      return expiry > start;
    },
    { message: 'Expiry date must be after start date', path: ['policy_expiry_date'] },
  )
  .refine(
    (data) => {
      const expiry = new Date(data.policy_expiry_date);
      return expiry > new Date();
    },
    { message: 'Certificate is already expired', path: ['policy_expiry_date'] },
  );

export type UploadCertificateInput = z.infer<typeof uploadCertificateSchema>;

// ─── Admin review (approve or reject) ────────────────────────────────────────

export const reviewCertificateSchema = z
  .object({
    decision: z.enum(['VERIFIED', 'REJECTED']),
    rejection_reason: z.string().min(10).max(500).optional(),
    admin_notes: z.string().max(1000).optional(),
  })
  .refine(
    (data) => {
      if (data.decision === 'REJECTED') {
        return data.rejection_reason !== undefined && data.rejection_reason.length >= 10;
      }
      return true;
    },
    {
      message: 'Rejection reason required when rejecting a certificate',
      path: ['rejection_reason'],
    },
  );

export type ReviewCertificateInput = z.infer<typeof reviewCertificateSchema>;
