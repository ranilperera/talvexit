// ─── Order status utilities ───────────────────────────────────────────────────

type OrderForStatus = {
  status: string;
  company_order_status?: string | null;
  company_id?: string | null;
};

/**
 * Returns the effective display status for any order.
 * Prefers company_order_status when set (works for both company and individual contractor orders).
 */
export function getOrderDisplayStatus(order: OrderForStatus): string {
  if (order.company_order_status) {
    return order.company_order_status;
  }
  return order.status;
}

const STATUS_LABELS: Record<string, string> = {
  // Individual contractor statuses
  PENDING_APPROVAL:    'Pending',
  SCOPED:              'Awaiting Payment',
  ACCEPTED:            'Accepted',
  PAYMENT_HELD:        'Payment Held',
  IN_PROGRESS:         'In Progress',
  PENDING_REVIEW:      'Under Review',
  REVISION_REQUESTED:  'Revision Requested',
  COMPLETED:           'Completed',
  DISPUTED:            'Disputed',
  CANCELLED:           'Cancelled',
  // Company statuses
  BOOKED:                     'Booked',
  PROPOSAL_DRAFT:             'Proposal Draft',
  PROPOSAL_SENT:              'Proposal Ready',
  PROPOSAL_CHANGES_REQUESTED: 'Changes Sent',
  PO_GENERATED:               'PO Issued',
  DELIVERABLES_ACCEPTED:      'Work Approved',
  INVOICE_SENT:               'Invoice Ready',
  BANK_TRANSFER_PENDING:      'Payment Under Review',
  PAYMENT_RECEIVED:           'Payment Confirmed',
  PAYOUT_PENDING:             'Processing',
  PAYOUT_PROCESSING:          'Processing',
};

/** Human-readable label for any order status string. */
export function getStatusLabel(status: string): string {
  return (
    STATUS_LABELS[status] ??
    status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

type BadgeColor = 'teal' | 'amber' | 'red' | 'blue' | 'slate' | 'green';

/** Badge color for any order status. */
export function getStatusBadgeColor(status: string): BadgeColor {
  if (['COMPLETED', 'PAYMENT_RECEIVED', 'PAYOUT_PENDING', 'PAYOUT_PROCESSING', 'DELIVERABLES_ACCEPTED'].includes(status))
    return 'teal';
  if (status === 'BANK_TRANSFER_PENDING') return 'blue';
  if (['PROPOSAL_SENT', 'PENDING_REVIEW', 'INVOICE_SENT', 'PO_GENERATED', 'PENDING_APPROVAL'].includes(status))
    return 'amber';
  if (['DISPUTED', 'REVISION_REQUESTED', 'PROPOSAL_CHANGES_REQUESTED'].includes(status))
    return 'red';
  if (['IN_PROGRESS', 'ACCEPTED', 'PAYMENT_HELD', 'BOOKED', 'PROPOSAL_DRAFT'].includes(status))
    return 'blue';
  if (status === 'CANCELLED') return 'slate';
  return 'slate';
}

/** Which tab an order belongs to (client-side filtering). */
export function getOrderTab(order: OrderForStatus): 'proposals' | 'active' | 'completed' | 'disputed' | 'cancelled' {
  const s = getOrderDisplayStatus(order);
  if (s === 'DISPUTED') return 'disputed';
  if (s === 'CANCELLED') return 'cancelled';
  if (['COMPLETED', 'PAYMENT_RECEIVED', 'PAYOUT_PENDING', 'PAYOUT_PROCESSING', 'BANK_TRANSFER_PENDING'].includes(s)) return 'completed';
  if (['PROPOSAL_SENT', 'PROPOSAL_CHANGES_REQUESTED'].includes(s)) return 'proposals';
  return 'active';
}

/** True when the order needs a customer action (proposal review, invoice payment, deliverable approval). */
export function orderNeedsAction(order: OrderForStatus): boolean {
  const s = getOrderDisplayStatus(order);
  return ['PROPOSAL_SENT', 'PENDING_REVIEW', 'INVOICE_SENT'].includes(s);
}

// ─── Number / money utilities ─────────────────────────────────────────────────

/**
 * Safe number conversion — handles Prisma Decimal (string), number, null, undefined.
 * Returns 0 as fallback.
 */
export function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

/**
 * Formats a monetary value to 2 decimal places.
 * Safe for Prisma Decimal, string, number, undefined, null.
 */
export function formatMoney(value: unknown): string {
  return toNum(value).toFixed(2);
}
