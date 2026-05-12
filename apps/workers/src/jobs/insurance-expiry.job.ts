import type { Queue } from 'bullmq';
import { prisma } from '../lib/prisma.js';

// ─── Email payload type ────────────────────────────────────────────────────────

type EmailJobPayload =
  | { type: 'insurance-expiry-warning'; to: string; days_until_expiry: number; insurance_type: string }
  | { type: 'insurance-expired'; to: string; insurance_type: string }
  | { type: 'contractor-suspended-no-insurance'; to: string };

// ─── Bitmask constants (which reminder thresholds have been sent) ─────────────
//  bit 0 = 60-day reminder sent
//  bit 1 = 30-day reminder sent
//  bit 2 = 7-day reminder sent
//  bit 3 = expired notice processed

const BIT_60D = 1;   // 0b0001
const BIT_30D = 2;   // 0b0010
const BIT_7D  = 4;   // 0b0100
const BIT_EXP = 8;   // 0b1000

// ─── checkInsuranceExpiry ─────────────────────────────────────────────────────

export async function checkInsuranceExpiry(emailQueue: Queue<EmailJobPayload>): Promise<void> {
  const now = new Date();

  // Fetch all VERIFIED certificates with contractor user email
  const certs = await prisma.insuranceCertificate.findMany({
    where: { status: 'VERIFIED' },
    include: {
      contractor: {
        include: { user: { select: { email: true } } },
      },
    },
  });

  for (const cert of certs) {
    const expiryDate = new Date(cert.policy_expiry_date);
    const msUntilExpiry = expiryDate.getTime() - now.getTime();
    const daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));
    const contractorEmail = cert.contractor?.user.email;
    if (!contractorEmail) continue;
    const mask = cert.expiry_reminder_sent;

    // ── Already expired ────────────────────────────────────────────────────────

    if (daysUntilExpiry < 0) {
      // Only process once (bit 3 not yet set)
      if ((mask & BIT_EXP) === 0) {
        // Mark cert as EXPIRED
        await prisma.insuranceCertificate.update({
          where: { id: cert.id },
          data: {
            status: 'EXPIRED',
            expired_at: now,
            expiry_reminder_sent: mask | BIT_EXP,
          },
        });

        // Notify contractor
        await emailQueue.add('insurance-expired', {
          type: 'insurance-expired',
          to: contractorEmail,
          insurance_type: cert.insurance_type,
        });

        // Check if contractor still has any VERIFIED cert of this type
        const remaining = await prisma.insuranceCertificate.findFirst({
          where: {
            contractor_id: cert.contractor_id,
            insurance_type: cert.insurance_type,
            status: 'VERIFIED',
          },
        });

        if (!remaining) {
          // Auto-suspend contractor — no active coverage of this type
          await prisma.contractorProfile.update({
            where: { id: cert.contractor_id! },
            data: {
              status: 'SUSPENDED',
              suspended_at: now,
              suspension_reason: `Insurance certificate expired: ${cert.insurance_type ?? 'unknown'}`,
              insurance_tier_met: false,
            },
          });

          await emailQueue.add('contractor-suspended-no-insurance', {
            type: 'contractor-suspended-no-insurance',
            to: contractorEmail,
          });
        }
      }
      continue;
    }

    // ── 7-day threshold ────────────────────────────────────────────────────────

    if (daysUntilExpiry <= 7 && (mask & BIT_7D) === 0) {
      await prisma.insuranceCertificate.update({
        where: { id: cert.id },
        data: { expiry_reminder_sent: mask | BIT_7D },
      });
      await emailQueue.add('insurance-expiry-warning', {
        type: 'insurance-expiry-warning',
        to: contractorEmail,
        days_until_expiry: daysUntilExpiry,
        insurance_type: cert.insurance_type,
      });
      continue;
    }

    // ── 30-day threshold ───────────────────────────────────────────────────────

    if (daysUntilExpiry <= 30 && (mask & BIT_30D) === 0) {
      await prisma.insuranceCertificate.update({
        where: { id: cert.id },
        data: { expiry_reminder_sent: mask | BIT_30D },
      });
      await emailQueue.add('insurance-expiry-warning', {
        type: 'insurance-expiry-warning',
        to: contractorEmail,
        days_until_expiry: daysUntilExpiry,
        insurance_type: cert.insurance_type,
      });
      continue;
    }

    // ── 60-day threshold ───────────────────────────────────────────────────────

    if (daysUntilExpiry <= 60 && (mask & BIT_60D) === 0) {
      await prisma.insuranceCertificate.update({
        where: { id: cert.id },
        data: { expiry_reminder_sent: mask | BIT_60D },
      });
      await emailQueue.add('insurance-expiry-warning', {
        type: 'insurance-expiry-warning',
        to: contractorEmail,
        days_until_expiry: daysUntilExpiry,
        insurance_type: cert.insurance_type,
      });
    }
  }
}
