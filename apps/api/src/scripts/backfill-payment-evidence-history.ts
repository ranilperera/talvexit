/**
 * One-shot backfill: rebuild Order.payment_evidence_history from existing
 * single-evidence columns + Azure blob list + audit log.
 *
 * Why this is needed:
 *   The pre-history schema only stored the LATEST evidence on the Order row.
 *   When a customer re-uploaded after a supplier dispute, the new file's
 *   blob path overwrote the old one, but the *original* blob remained in
 *   storage. This script discovers those orphans and reconstructs the full
 *   history.
 *
 * Strategy:
 *   1. For every Order with a non-null payment_evidence_blob_path and an
 *      empty payment_evidence_history array:
 *      a. List all blobs at `payment-evidence/order/{orderId}/`.
 *      b. Parse the upload timestamp from each blob's filename prefix.
 *      c. Pull the order's audit log and pair each ORDER_PAYMENT_REPORTED
 *         entry with the closest blob (by timestamp). Each pairing yields a
 *         history entry with the audit-recorded method/reference/amount.
 *      d. Walk the audit log forward; ORDER_PAYMENT_EVIDENCE_DISPUTED after
 *         a report flips that report to REJECTED with the dispute reason.
 *      e. The latest report's terminal status is derived from the order
 *         row: CONFIRMED if supplier_confirmed_paid_at is set; REJECTED if
 *         payment_dispute_reason is currently set; otherwise PENDING.
 *
 * Idempotent — only runs against orders with empty history. Re-running is
 * a no-op once history has been written.
 *
 * Run: pnpm --filter @onys/api backfill:payment-evidence-history
 */

import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv') as { config: (opts: { path: string }) => void };
dotenv.config({ path: resolve(__dir, '../../.env') });

import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { listBlobsByPrefix } from '../utils/blob-storage.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

interface HistoryEntry {
  id: string;
  blob_path: string | null;
  file_name: string | null;
  uploaded_at: string;
  payment_method: string;
  payment_reference: string | null;
  amount_aud: number;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  dispute_reason: string | null;
  decided_at: string | null;
}

// Filename pattern: `{epochMs}-{safe filename}`. Matches the upload code in
// engagement-payment.service.ts → uploadEvidence.
function parseTimestampFromBlob(blobPath: string): number | null {
  // Strip `payment-evidence/order/{orderId}/` prefix → just the filename
  const filename = blobPath.split('/').pop() ?? '';
  const m = /^(\d+)-/.exec(filename);
  return m ? Number(m[1]) : null;
}

function fileNameFromBlob(blobPath: string): string {
  const filename = blobPath.split('/').pop() ?? '';
  return filename.replace(/^\d+-/, '');
}

async function backfillOrder(orderId: string): Promise<{ added: number; skipped: boolean }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      payment_evidence_blob_path: true,
      payment_evidence_file_name: true,
      payment_evidence_history: true,
      supplier_confirmed_paid_at: true,
      payment_dispute_reason: true,
      payment_method: true,
      payment_reference: true,
      payment_amount_reported_aud: true,
    },
  });
  if (!order) return { added: 0, skipped: true };

  const existingHistory = Array.isArray(order.payment_evidence_history)
    ? order.payment_evidence_history
    : [];
  if (existingHistory.length > 0) return { added: 0, skipped: true };

  // 1. List every blob under this order's evidence prefix.
  const prefix = `payment-evidence/order/${orderId}/`;
  let blobs: string[] = [];
  try {
    blobs = await listBlobsByPrefix(prefix);
  } catch (err) {
    console.warn(`[backfill] blob list failed for ${orderId}:`, err);
  }

  // 2. Get audit log entries for this order. Each ORDER_PAYMENT_REPORTED is
  //    one historical upload; ORDER_PAYMENT_EVIDENCE_DISPUTED rejects the
  //    most recent report at that point.
  const auditEntries = await prisma.auditLog.findMany({
    where: {
      entity_type: 'Order',
      entity_id: orderId,
      action_type: { in: ['ORDER_PAYMENT_REPORTED', 'ORDER_PAYMENT_EVIDENCE_DISPUTED'] },
    },
    orderBy: { timestamp: 'asc' },
    select: { action_type: true, timestamp: true, metadata: true },
  });

  const reports = auditEntries.filter((e) => e.action_type === 'ORDER_PAYMENT_REPORTED');
  const disputes = auditEntries.filter(
    (e) => e.action_type === 'ORDER_PAYMENT_EVIDENCE_DISPUTED',
  );

  if (reports.length === 0 && order.payment_evidence_blob_path) {
    // Order has an evidence pointer but no audit trail. Build a single
    // entry off the row itself so it's at least visible in the UI.
    const entry: HistoryEntry = {
      id: `evd_${crypto.randomBytes(8).toString('hex')}`,
      blob_path: order.payment_evidence_blob_path,
      file_name: order.payment_evidence_file_name,
      uploaded_at: new Date().toISOString(),
      payment_method: order.payment_method ?? 'OTHER',
      payment_reference: order.payment_reference,
      amount_aud: order.payment_amount_reported_aud
        ? Number(order.payment_amount_reported_aud)
        : 0,
      status: order.supplier_confirmed_paid_at
        ? 'CONFIRMED'
        : order.payment_dispute_reason
          ? 'REJECTED'
          : 'PENDING',
      dispute_reason: order.payment_dispute_reason,
      decided_at: order.supplier_confirmed_paid_at?.toISOString() ?? null,
    };
    await prisma.order.update({
      where: { id: orderId },
      data: { payment_evidence_history: [entry] as unknown as Prisma.InputJsonValue },
    });
    return { added: 1, skipped: false };
  }

  // 3. Sort blobs by upload timestamp (parsed from filename).
  const blobsWithTs = blobs
    .map((b) => ({ path: b, ts: parseTimestampFromBlob(b) }))
    .filter((x): x is { path: string; ts: number } => x.ts !== null)
    .sort((a, b) => a.ts - b.ts);

  // 4. Pair each report with the blob whose timestamp is closest to (and
  //    not after) the report's audit timestamp + a 30s window.
  const usedBlobs = new Set<string>();
  const history: HistoryEntry[] = [];

  for (let i = 0; i < reports.length; i++) {
    const report = reports[i]!;
    const reportTime = report.timestamp.getTime();

    // Closest blob within ±60s, oldest-first preference, not-yet-used.
    let chosen: { path: string; ts: number } | null = null;
    let bestDiff = Infinity;
    for (const b of blobsWithTs) {
      if (usedBlobs.has(b.path)) continue;
      const diff = Math.abs(b.ts - reportTime);
      if (diff < bestDiff && diff <= 60_000) {
        bestDiff = diff;
        chosen = b;
      }
    }
    if (chosen) usedBlobs.add(chosen.path);

    const meta = (report.metadata as Record<string, unknown> | null) ?? {};
    const entry: HistoryEntry = {
      id: `evd_${crypto.randomBytes(8).toString('hex')}`,
      blob_path: chosen?.path ?? null,
      file_name: chosen ? fileNameFromBlob(chosen.path) : null,
      uploaded_at: report.timestamp.toISOString(),
      payment_method: typeof meta.method === 'string' ? meta.method : (order.payment_method ?? 'OTHER'),
      payment_reference: typeof meta.reference === 'string' ? meta.reference : null,
      amount_aud: typeof meta.amount_aud === 'number' ? meta.amount_aud : 0,
      status: 'PENDING',
      dispute_reason: null,
      decided_at: null,
    };

    // Did a dispute fire BEFORE the next report (or before "now" for the
    // last report)? If so this entry was REJECTED.
    const nextReportTime = reports[i + 1]?.timestamp.getTime() ?? Infinity;
    const matchingDispute = disputes.find((d) => {
      const dt = d.timestamp.getTime();
      return dt > reportTime && dt < nextReportTime;
    });
    if (matchingDispute) {
      const dmeta = (matchingDispute.metadata as Record<string, unknown> | null) ?? {};
      entry.status = 'REJECTED';
      entry.dispute_reason = typeof dmeta.reason === 'string' ? dmeta.reason : null;
      entry.decided_at = matchingDispute.timestamp.toISOString();
    }

    history.push(entry);
  }

  // 5. Resolve the latest entry's status from the live order row. (The
  //    audit log doesn't record CONFIRMED transitions reliably, but the
  //    Order columns do.)
  if (history.length > 0) {
    const last = history[history.length - 1]!;
    if (last.status === 'PENDING') {
      if (order.supplier_confirmed_paid_at) {
        last.status = 'CONFIRMED';
        last.decided_at = order.supplier_confirmed_paid_at.toISOString();
      } else if (order.payment_dispute_reason) {
        last.status = 'REJECTED';
        last.dispute_reason = order.payment_dispute_reason;
      }
    }
    // If the blob list call failed but the order row still points at a
    // current evidence file, attribute it to the latest report so the
    // download link still works in the UI. The earlier (rejected) blobs
    // may be unrecoverable when audit metadata is the only source.
    if (!last.blob_path && order.payment_evidence_blob_path) {
      last.blob_path = order.payment_evidence_blob_path;
      last.file_name = order.payment_evidence_file_name;
    }
  }

  // 6. Any blobs we couldn't pair to a report — record them as orphan
  //    REJECTED entries so they're still surfaced (better than losing them).
  for (const b of blobsWithTs) {
    if (usedBlobs.has(b.path)) continue;
    history.push({
      id: `evd_${crypto.randomBytes(8).toString('hex')}`,
      blob_path: b.path,
      file_name: fileNameFromBlob(b.path),
      uploaded_at: new Date(b.ts).toISOString(),
      payment_method: order.payment_method ?? 'OTHER',
      payment_reference: null,
      amount_aud: 0,
      status: 'REJECTED',
      dispute_reason: 'Recovered from blob storage during backfill — original audit context unavailable.',
      decided_at: null,
    });
  }

  // 7. Sort history chronologically before saving.
  history.sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));

  if (history.length === 0) return { added: 0, skipped: true };

  await prisma.order.update({
    where: { id: orderId },
    data: { payment_evidence_history: history as unknown as Prisma.InputJsonValue },
  });
  return { added: history.length, skipped: false };
}

async function main() {
  const candidates = await prisma.order.findMany({
    where: {
      OR: [
        { payment_evidence_blob_path: { not: null } },
        { customer_reported_paid_at: { not: null } },
      ],
    },
    select: { id: true, payment_evidence_history: true },
  });

  let totalEntries = 0;
  let updated = 0;
  let skipped = 0;
  for (const c of candidates) {
    const existing = Array.isArray(c.payment_evidence_history)
      ? c.payment_evidence_history.length
      : 0;
    if (existing > 0) {
      skipped++;
      continue;
    }
    const result = await backfillOrder(c.id);
    if (result.skipped) {
      skipped++;
    } else {
      updated++;
      totalEntries += result.added;
      console.log(`[backfill] order ${c.id} ← ${result.added} entries`);
    }
  }

  console.log(
    `[backfill] done. orders updated=${updated}, skipped=${skipped}, total history entries written=${totalEntries}, candidates=${candidates.length}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
