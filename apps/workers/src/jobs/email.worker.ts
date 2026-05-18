import { Worker } from 'bullmq';
import { sendEmail } from '../services/graph-email.service.js';
import { redisConnection as connection } from '../lib/redis.js';

// ─── Job types ────────────────────────────────────────────────────────────────

type EmailJobPayload =
  | { type: 'verify-email'; to: string; verify_url: string; userId?: string }
  | { type: 'reset-password'; to: string; reset_url: string; userId?: string }
  // ── KYC lifecycle (existing API service queues these — used to be silently
  // dropped by the worker because the union didn't include them).
  | { type: 'kyc-session-scheduled'; to: string; scheduledAt: string; roomName: string }
  | { type: 'kyc-session-rescheduled'; to: string; scheduledAt: string; roomName: string }
  | { type: 'kyc-session-cancelled'; to: string; reason?: string }
  | { type: 'kyc-approved'; to: string }
  | { type: 'kyc-rejected'; to: string; notes?: string }
  // ── KYC reschedule-request (added with the contractor reschedule flow)
  | {
      type: 'kyc-reschedule-requested';
      to: string;
      contractor_name: string;
      contractor_email: string;
      original_at: string;
      proposed_at: string;
      comment: string | null;
      review_url: string;
    }
  | {
      type: 'kyc-reschedule-decision';
      to: string;
      decision: 'APPROVED' | 'REJECTED';
      proposed_at: string;
      effective_at: string | null;
      admin_notes: string | null;
      kyc_url: string;
    }
  | { type: 'payout-initiated'; to: string; order_id: string; net_amount_aud: number; commission_rate: number; estimated_arrival: string }
  | { type: 'org-member-invitation'; to: string; accept_url: string; org_name: string; invited_by: string }
  | { type: 'org-membership-removed'; to: string; org_name: string }
  | { type: 'company-member-invitation'; to: string; company_name: string; inviter_name: string; role: string; job_title?: string | null; invite_url: string; expires_at: string }
  | { type: 'member-joined-notification'; to: string; company_name: string; member_name: string; role: string; dashboard_url: string }
  | { type: 'login-otp'; to: string; full_name: string; otp_code: string; ip_address: string }
  | { type: 'payment-method-approved'; to: string; full_name: string; method_type: string; nickname: string | null }
  | { type: 'payment-method-rejected'; to: string; full_name: string; method_type: string; nickname: string | null; reason: string }
  | { type: 'tender-invitation'; to: string; provider_name: string; tender_title: string; tender_url: string; deadline: string }
  | {
      type: 'tender-deadline-extended';
      to: string;
      provider_name: string;
      tender_title: string;
      tender_url: string;
      previous_deadline: string;
      new_deadline: string;
      reason: string | null;
    }
  // Tender-contract invoice paid — customer copy + supplier receipt
  | {
      type: 'tc-invoice-paid-customer-receipt';
      to: string;
      invoice_number: string;
      milestone_name: string | null;
      total_aud: number;
      currency: string;
      paid_at: string;
      download_url: string;
    }
  | {
      type: 'tc-invoice-paid-supplier-receipt';
      to: string;
      invoice_number: string;
      customer_name: string;
      milestone_name: string | null;
      total_aud: number;
      currency: string;
      paid_at: string;
      download_url: string;
    }
  | { type: 'tender-proposal-received'; to: string; customer_name: string; tender_title: string; tender_url: string }
  | { type: 'tender-proposal-awarded'; to: string; provider_name: string; tender_title: string; tender_url: string }
  | { type: 'tender-proposal-rejected'; to: string; provider_name: string; tender_title: string }
  | { type: 'dispute-filed-admin-alert'; to: string; order_id: string; grounds: string; raised_by_name: string; raised_by_role: string; order_title: string; admin_url: string }
  | { type: 'dispute-filed-notice'; to: string; order_id: string; grounds: string; submission_window_ends: string; submit_url: string }
  | { type: 'dispute-admin-assigned'; to: string; admin_name: string; order_id: string }
  | { type: 'arbitrator-appointed'; to: string; dispute_id: string; order_id: string; grounds: string; appointment_notes?: string; arbitrator_url: string }
  | { type: 'dispute-determination-issued'; to: string; outcome: string; written_reasons: string; order_id: string }
  // ── Service-invoice (B2B direct) ─────────────────────────────────────────
  | {
      type: 'service-invoice-sent';
      to: string;
      invoice_id: string;
      invoice_number: string;
      provider_name: string;
      total_cents: number;
      currency: string;
      due_date: string | null;
      internal_url: string;
      public_url: string | null;
    }
  | {
      type: 'service-invoice-evidence-submitted';
      to: string;
      provider_name: string;
      invoice_id: string;
      invoice_number: string;
      amount_cents: number;
      currency: string;
      payment_method: string;
    }
  | {
      type: 'service-invoice-evidence-approved';
      to: string;
      full_name: string;
      invoice_id: string;
      invoice_number: string;
    }
  | {
      type: 'service-invoice-evidence-rejected';
      to: string;
      full_name: string;
      invoice_id: string;
      invoice_number: string;
      rejection_reason: string | null;
    }
  | {
      type: 'service-invoice-overdue';
      to: string;
      invoice_id: string;
      invoice_number: string;
      provider_name: string;
      total_cents: number;
      currency: string;
      due_date: string | null;
      days_overdue: number | null;
    }
  | {
      type: 'service-invoice-paid';
      to: string;
      full_name: string;
      invoice_id: string;
      invoice_number: string;
      amount_cents: number;
      currency: string;
    }
  // ── Subscription billing (platform → subscriber) ────────────────────────
  | {
      type: 'subscription-payment-receipt';
      to: string;
      full_name: string;
      amount_aud: number;
      invoice_number: string;
      hosted_invoice_url: string | null;
    }
  | {
      type: 'subscription-payment-failed';
      to: string;
      full_name: string;
      amount_aud: number;
      invoice_number: string;
      hosted_invoice_url: string | null;
    }
  // ── Order lifecycle (centralised in api/services/order-notifications.ts) ──
  | {
      type: 'new-order-received';
      to: string;
      order_id: string;
      customer_name: string;
      task_title: string;
      order_url: string;
    }
  | {
      type: 'company-order-needs-assignment';
      to: string;
      order_id: string;
      company_name: string;
      task_title: string;
      customer_name: string;
      assign_url: string;
    }
  | {
      type: 'order-accepted';
      to: string;
      order_id: string;
      task_title: string;
      order_url: string;
    }
  | {
      type: 'order-submitted';
      to: string;
      order_id: string;
      task_title: string;
      order_url: string;
    }
  | {
      type: 'order-revision-requested';
      to: string;
      order_id: string;
      task_title: string;
      customer_name: string;
      reason: string;
      order_url: string;
    }
  | {
      type: 'order-completed';
      to: string;
      order_id: string;
      task_title: string;
      order_url: string;
    }
  | {
      type: 'order-cancelled';
      to: string;
      order_id: string;
      task_title: string;
      reason: string;
      cancelled_by: 'customer' | 'contractor' | 'admin';
      order_url: string;
    }
  // ── Contact form (public /contact page) ────────────────────────────────
  | {
      type: 'contact-enquiry-admin';
      to: string;
      enquiry_id: string;
      name: string;
      email: string;
      phone: string | null;
      enquiry_type: string;
      message: string;
      ip_address: string;
      admin_url: string;
    }
  | {
      type: 'contact-enquiry-ack';
      to: string;
      name: string;
      enquiry_type: string;
      message: string;
    }
  | {
      type: 'contact-enquiry-response';
      to: string;
      name: string;
      subject: string;
      body: string;
      admin_name: string;
    };

// ─── Email builders ───────────────────────────────────────────────────────────

function buildVerifyEmail(to: string, verify_url: string) {
  return {
    to:      { email: to },
    subject: 'Verify your talvexIT account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0d9488">Welcome to talvexIT!</h2>
        <p>Click the button below to verify your email address.</p>
        <a href="${verify_url}"
           style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">
          Verify Email
        </a>
        <p style="color:#666;font-size:13px;margin-top:24px">
          This link expires in 24 hours. If you didn't create an account, ignore this email.
        </p>
        <p style="color:#999;font-size:11px">Or copy: ${verify_url}</p>
      </div>
    `,
  };
}

function buildResetPassword(to: string, reset_url: string) {
  return {
    to:      { email: to },
    subject: 'Reset your talvexIT password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0d9488">Reset your password</h2>
        <p>Click the button below to set a new password.</p>
        <a href="${reset_url}"
           style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">
          Reset Password
        </a>
        <p style="color:#666;font-size:13px;margin-top:24px">
          This link expires in 1 hour. If you didn't request a reset, ignore this email.
        </p>
        <p style="color:#999;font-size:11px">Or copy: ${reset_url}</p>
      </div>
    `,
  };
}

function buildOrgInvitation(to: string, accept_url: string, org_name: string, invited_by: string) {
  return {
    to:      { email: to },
    subject: `You've been invited to join ${org_name} on talvexIT`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0d9488">You've been invited!</h2>
        <p><strong>${invited_by}</strong> invited you to join <strong>${org_name}</strong> on talvexIT.</p>
        <a href="${accept_url}"
           style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">
          Accept Invitation
        </a>
        <p style="color:#666;font-size:13px;margin-top:24px">This invitation expires in 7 days.</p>
      </div>
    `,
  };
}

function buildOrgMemberRemoved(to: string, org_name: string) {
  return {
    to:      { email: to },
    subject: `Your membership in ${org_name} has been removed`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0d9488">Membership removed</h2>
        <p>You have been removed from <strong>${org_name}</strong> on talvexIT.</p>
        <p style="color:#666">If this was unexpected, contact your organisation administrator.</p>
      </div>
    `,
  };
}

function buildCompanyInvitation(
  to: string,
  company_name: string,
  inviter_name: string,
  role: string,
  invite_url: string,
  expires_at: string,
) {
  const roleLabel = role.replace(/_/g, ' ');
  const expiry = new Date(expires_at).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  return {
    to:      { email: to },
    subject: `You've been invited to join ${company_name} on talvexIT`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0d9488">You've been invited!</h2>
        <p><strong>${inviter_name}</strong> has invited you to join <strong>${company_name}</strong> as <strong>${roleLabel}</strong>.</p>
        <a href="${invite_url}"
           style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">
          Accept Invitation
        </a>
        <p style="color:#666;font-size:13px;margin-top:24px">This invitation expires on ${expiry}.</p>
      </div>
    `,
  };
}

function buildMemberJoinedNotification(
  to: string,
  company_name: string,
  member_name: string,
  role: string,
  dashboard_url: string,
) {
  const roleLabel = role.replace(/_/g, ' ');
  return {
    to:      { email: to },
    subject: `${member_name} has joined ${company_name}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0d9488">New team member!</h2>
        <p><strong>${member_name}</strong> has joined <strong>${company_name}</strong> as <strong>${roleLabel}</strong>.</p>
        <a href="${dashboard_url}"
           style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">
          View Team
        </a>
      </div>
    `,
  };
}

function buildPayoutInitiated(
  to: string,
  order_id: string,
  net_amount_aud: number,
  commission_rate: number,
  estimated_arrival: string,
) {
  return {
    to:      { email: to },
    subject: 'Your payout has been initiated — talvexIT',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0d9488">Payout initiated!</h2>
        <p>Your payout for order <code>${order_id}</code> has been processed.</p>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:8px;color:#666">Net amount</td><td style="padding:8px;font-weight:bold">$${net_amount_aud.toFixed(2)} AUD</td></tr>
          <tr><td style="padding:8px;color:#666">Commission</td><td style="padding:8px">${commission_rate}%</td></tr>
          <tr><td style="padding:8px;color:#666">Estimated arrival</td><td style="padding:8px">${estimated_arrival}</td></tr>
        </table>
      </div>
    `,
  };
}

function buildLoginOtp(to: string, full_name: string, otp_code: string, ip_address: string) {
  const firstName = full_name.split(' ')[0] ?? 'there';
  const display = `${otp_code.slice(0, 3)} ${otp_code.slice(3)}`;
  return {
    to:      { email: to, name: full_name },
    subject: 'Your talvexIT login code',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0F1117;color:#B8C4D5;padding:40px 20px;border-radius:16px;border:1px solid #2A3347">
        <h2 style="color:#EEF1F6;margin:0 0 4px">Login verification code</h2>
        <p style="color:#8A9BB5;font-size:14px;margin:0 0 28px">Hi ${firstName}, use the code below to complete your sign-in.</p>
        <div style="background:#161B27;border:2px solid #00C2A8;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
          <div style="font-size:40px;font-weight:700;letter-spacing:10px;color:#00C2A8;font-family:monospace">${display}</div>
          <div style="font-size:13px;color:#5A6E8C;margin-top:8px">Expires in 10 minutes · Do not share this code</div>
        </div>
        <div style="background:#1E2435;border:1px solid #2A3347;border-radius:8px;padding:16px;font-size:13px;color:#8A9BB5">
          <strong style="color:#EEF1F6">Security notice:</strong> This login was requested from IP <strong style="color:#EEF1F6">${ip_address}</strong>. If you did not attempt to log in, please change your password immediately.
        </div>
        <p style="font-size:12px;color:#3D4F6B;margin-top:24px;text-align:center">talvexIT · Never share this code with anyone.</p>
      </div>
    `,
  };
}

function buildPaymentMethodApproved(to: string, full_name: string, method_type: string, nickname: string | null) {
  const firstName = full_name.split(' ')[0] ?? 'there';
  const label = nickname ?? method_type.replace(/_/g, ' ');
  return {
    to: { email: to, name: full_name },
    subject: 'Payment method approved — talvexIT',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0F1117;color:#B8C4D5;padding:40px 20px;border-radius:16px;border:1px solid #2A3347">
        <h2 style="color:#00C2A8;margin:0 0 8px">Payment method approved ✓</h2>
        <p style="color:#8A9BB5;font-size:14px;margin:0 0 20px">Hi ${firstName}, your payment method has been verified.</p>
        <div style="background:#161B27;border:1px solid #00C2A8;border-radius:12px;padding:16px;margin-bottom:20px">
          <p style="margin:0;color:#EEF1F6;font-weight:600">${label}</p>
          <p style="margin:4px 0 0;color:#5A6E8C;font-size:13px">Status: <span style="color:#00C2A8">Verified</span></p>
        </div>
        <p style="color:#8A9BB5;font-size:13px">You can now receive payouts to this payment method.</p>
        <p style="font-size:12px;color:#3D4F6B;margin-top:24px;text-align:center">talvexIT</p>
      </div>
    `,
  };
}

function buildPaymentMethodRejected(to: string, full_name: string, method_type: string, nickname: string | null, reason: string) {
  const firstName = full_name.split(' ')[0] ?? 'there';
  const label = nickname ?? method_type.replace(/_/g, ' ');
  return {
    to: { email: to, name: full_name },
    subject: 'Payment method requires attention — talvexIT',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0F1117;color:#B8C4D5;padding:40px 20px;border-radius:16px;border:1px solid #2A3347">
        <h2 style="color:#F87171;margin:0 0 8px">Payment method rejected</h2>
        <p style="color:#8A9BB5;font-size:14px;margin:0 0 20px">Hi ${firstName}, your payment method could not be verified.</p>
        <div style="background:#161B27;border:1px solid #F87171;border-radius:12px;padding:16px;margin-bottom:20px">
          <p style="margin:0;color:#EEF1F6;font-weight:600">${label}</p>
          <p style="margin:4px 0 0;color:#5A6E8C;font-size:13px">Status: <span style="color:#F87171">Rejected</span></p>
        </div>
        <div style="background:#1E0F0F;border:1px solid #7F1D1D;border-radius:8px;padding:14px;margin-bottom:20px">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#FCA5A5;text-transform:uppercase;letter-spacing:.05em">Reason</p>
          <p style="margin:0;color:#FCA5A5;font-size:14px">${reason}</p>
        </div>
        <p style="color:#8A9BB5;font-size:13px">Please log in to your account, remove this payment method, and add a new one with the correct documents.</p>
        <p style="font-size:12px;color:#3D4F6B;margin-top:24px;text-align:center">talvexIT</p>
      </div>
    `,
  };
}

// ─── Worker ───────────────────────────────────────────────────────────────────


function buildTenderInvitation(to: string, provider_name: string, tender_title: string, tender_url: string, deadline: string) {
  const firstName = provider_name.split(' ')[0] ?? 'there';
  const deadlineFormatted = new Date(deadline).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    to: { email: to, name: provider_name },
    subject: `New tender invitation: ${tender_title} — talvexIT`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0F1117;color:#B8C4D5;padding:40px 20px;border-radius:16px;border:1px solid #2A3347">
        <h2 style="color:#00C2A8;margin:0 0 8px">You've been invited to submit a proposal</h2>
        <p style="color:#8A9BB5;font-size:14px;margin:0 0 20px">Hi ${firstName}, a customer has selected you as a potential provider for a new project.</p>
        <div style="background:#161B27;border:1px solid #2A3347;border-radius:12px;padding:16px;margin-bottom:20px">
          <p style="margin:0;color:#EEF1F6;font-weight:600;font-size:16px">${tender_title}</p>
          <p style="margin:8px 0 0;color:#5A6E8C;font-size:13px">Submission deadline: <strong style="color:#F59E0B">${deadlineFormatted}</strong></p>
        </div>
        <a href="${tender_url}" style="display:inline-block;padding:12px 24px;background:#00C2A8;color:#0F1117;border-radius:6px;text-decoration:none;font-weight:bold">View &amp; Submit Proposal</a>
        <p style="font-size:12px;color:#3D4F6B;margin-top:24px;text-align:center">talvexIT · You can decline this invitation from within the platform.</p>
      </div>
    `,
  };
}

function fmtMoneyAU(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildTcInvoicePaidCustomerCopy(p: {
  to: string;
  invoice_number: string;
  milestone_name: string | null;
  total_aud: number;
  currency: string;
  paid_at: string;
  download_url: string;
}) {
  const paidOn = new Date(p.paid_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    to: { email: p.to },
    subject: `Receipt: invoice ${p.invoice_number} marked PAID`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#0d9488">Payment received — thank you</h2>
        <p>Your supplier has confirmed receipt of your payment. The attached invoice is now marked PAID. Keep this email for your records.</p>
        <table style="border-collapse:collapse;margin:16px 0;width:100%">
          <tr>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;width:40%">Invoice</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb"><strong>${escape(p.invoice_number)}</strong></td>
          </tr>
          ${p.milestone_name ? `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280">Milestone</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${escape(p.milestone_name)}</td></tr>` : ''}
          <tr>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280">Amount</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb"><strong>${escape(fmtMoneyAU(p.total_aud, p.currency))}</strong></td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280">Paid on</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb">${escape(paidOn)}</td>
          </tr>
        </table>
        <p>
          <a href="${p.download_url}"
             style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">
            Download paid invoice (PDF)
          </a>
        </p>
        <p style="color:#666;font-size:12px;margin-top:24px">Forward this PDF to your accounts payable team for their records.</p>
      </div>`,
  };
}

function buildTcInvoicePaidSupplierReceipt(p: {
  to: string;
  invoice_number: string;
  customer_name: string;
  milestone_name: string | null;
  total_aud: number;
  currency: string;
  paid_at: string;
  download_url: string;
}) {
  const paidOn = new Date(p.paid_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    to: { email: p.to },
    subject: `Payment confirmed: ${escape(p.invoice_number)} — ${escape(fmtMoneyAU(p.total_aud, p.currency))}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#0d9488">Payment confirmed</h2>
        <p>You confirmed receipt of payment from <strong>${escape(p.customer_name)}</strong>. The invoice is now marked PAID and a receipt copy has been emailed to the customer.</p>
        <table style="border-collapse:collapse;margin:16px 0;width:100%">
          <tr>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;width:40%">Invoice</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb"><strong>${escape(p.invoice_number)}</strong></td>
          </tr>
          ${p.milestone_name ? `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280">Milestone</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${escape(p.milestone_name)}</td></tr>` : ''}
          <tr>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280">Customer</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb">${escape(p.customer_name)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280">Amount</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb"><strong>${escape(fmtMoneyAU(p.total_aud, p.currency))}</strong></td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280">Confirmed on</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb">${escape(paidOn)}</td>
          </tr>
        </table>
        <p>
          <a href="${p.download_url}"
             style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">
            Download paid invoice (PDF)
          </a>
        </p>
        <p style="color:#666;font-size:12px;margin-top:24px">This is your accounting receipt for the payment received.</p>
      </div>`,
  };
}

function buildTenderDeadlineExtended(p: {
  to: string;
  provider_name: string;
  tender_title: string;
  tender_url: string;
  previous_deadline: string;
  new_deadline: string;
  reason: string | null;
}) {
  const firstName = p.provider_name.split(' ')[0] ?? 'there';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Australia/Sydney',
      timeZoneName: 'short',
    });
  return {
    to: { email: p.to, name: p.provider_name },
    subject: `Deadline extended: ${p.tender_title} — talvexIT`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0F1117;color:#B8C4D5;padding:40px 20px;border-radius:16px;border:1px solid #2A3347">
        <h2 style="color:#00C2A8;margin:0 0 8px">Tender deadline has been extended</h2>
        <p style="color:#8A9BB5;font-size:14px;margin:0 0 20px">Hi ${firstName}, the customer has extended the submission deadline for this tender. You now have more time to prepare your proposal.</p>
        <div style="background:#161B27;border:1px solid #2A3347;border-radius:12px;padding:16px;margin-bottom:20px">
          <p style="margin:0;color:#EEF1F6;font-weight:600;font-size:16px">${escape(p.tender_title)}</p>
          <p style="margin:12px 0 4px;color:#5A6E8C;font-size:13px">Previous deadline:
            <span style="color:#8A9BB5;text-decoration:line-through">${fmt(p.previous_deadline)}</span>
          </p>
          <p style="margin:0;color:#5A6E8C;font-size:13px">New deadline:
            <strong style="color:#F59E0B">${fmt(p.new_deadline)}</strong>
          </p>
        </div>
        ${p.reason ? `<div style="background:#161B27;border-left:3px solid #00C2A8;padding:12px 16px;margin-bottom:20px"><p style="margin:0 0 4px;color:#5A6E8C;font-size:12px">Reason from the customer:</p><p style="margin:0;color:#B8C4D5;font-size:14px;font-style:italic">${escape(p.reason)}</p></div>` : ''}
        <a href="${p.tender_url}" style="display:inline-block;padding:12px 24px;background:#00C2A8;color:#0F1117;border-radius:6px;text-decoration:none;font-weight:bold">Open tender</a>
        <p style="font-size:12px;color:#3D4F6B;margin-top:24px;text-align:center">talvexIT · You can revise an already-submitted proposal up until the new deadline.</p>
      </div>
    `,
  };
}

function buildTenderProposalReceived(to: string, customer_name: string, tender_title: string, tender_url: string) {
  const firstName = customer_name.split(' ')[0] ?? 'there';
  return {
    to: { email: to, name: customer_name },
    subject: `New proposal received for: ${tender_title} — talvexIT`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0F1117;color:#B8C4D5;padding:40px 20px;border-radius:16px;border:1px solid #2A3347">
        <h2 style="color:#00C2A8;margin:0 0 8px">A new proposal has been submitted</h2>
        <p style="color:#8A9BB5;font-size:14px;margin:0 0 20px">Hi ${firstName}, a provider has submitted a proposal for your tender.</p>
        <div style="background:#161B27;border:1px solid #2A3347;border-radius:12px;padding:16px;margin-bottom:20px">
          <p style="margin:0;color:#EEF1F6;font-weight:600">${tender_title}</p>
        </div>
        <a href="${tender_url}" style="display:inline-block;padding:12px 24px;background:#00C2A8;color:#0F1117;border-radius:6px;text-decoration:none;font-weight:bold">Review Proposals</a>
        <p style="font-size:12px;color:#3D4F6B;margin-top:24px;text-align:center">talvexIT</p>
      </div>
    `,
  };
}

function buildTenderProposalAwarded(to: string, provider_name: string, tender_title: string, tender_url: string) {
  const firstName = provider_name.split(' ')[0] ?? 'there';
  return {
    to: { email: to, name: provider_name },
    subject: `Congratulations — your proposal was accepted: ${tender_title}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0F1117;color:#B8C4D5;padding:40px 20px;border-radius:16px;border:1px solid #2A3347">
        <h2 style="color:#00C2A8;margin:0 0 8px">Your proposal was accepted! 🎉</h2>
        <p style="color:#8A9BB5;font-size:14px;margin:0 0 20px">Hi ${firstName}, the customer has selected your proposal for the following project.</p>
        <div style="background:#161B27;border:1px solid #00C2A8;border-radius:12px;padding:16px;margin-bottom:20px">
          <p style="margin:0;color:#EEF1F6;font-weight:600;font-size:16px">${tender_title}</p>
          <p style="margin:8px 0 0;color:#00C2A8;font-size:13px;font-weight:600">Status: Awarded</p>
        </div>
        <a href="${tender_url}" style="display:inline-block;padding:12px 24px;background:#00C2A8;color:#0F1117;border-radius:6px;text-decoration:none;font-weight:bold">View My Invitations</a>
        <p style="color:#8A9BB5;font-size:13px;margin-top:20px">The customer will be in touch shortly with next steps to get the project started.</p>
        <p style="font-size:12px;color:#3D4F6B;margin-top:24px;text-align:center">talvexIT</p>
      </div>
    `,
  };
}

function buildTenderProposalRejected(to: string, provider_name: string, tender_title: string) {
  const firstName = provider_name.split(' ')[0] ?? 'there';
  return {
    to: { email: to, name: provider_name },
    subject: `Tender outcome: ${tender_title} — talvexIT`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0F1117;color:#B8C4D5;padding:40px 20px;border-radius:16px;border:1px solid #2A3347">
        <h2 style="color:#EEF1F6;margin:0 0 8px">Tender outcome notification</h2>
        <p style="color:#8A9BB5;font-size:14px;margin:0 0 20px">Hi ${firstName}, thank you for submitting your proposal.</p>
        <div style="background:#161B27;border:1px solid #2A3347;border-radius:12px;padding:16px;margin-bottom:20px">
          <p style="margin:0;color:#EEF1F6;font-weight:600">${tender_title}</p>
          <p style="margin:8px 0 0;color:#5A6E8C;font-size:13px">The customer has selected another provider for this project.</p>
        </div>
        <p style="color:#8A9BB5;font-size:13px">We appreciate your time and encourage you to continue looking for new opportunities on talvexIT.</p>
        <p style="font-size:12px;color:#3D4F6B;margin-top:24px;text-align:center">talvexIT</p>
      </div>
    `,
  };
}

// ─── Dispute templates ────────────────────────────────────────────────────────

function disputeShell(title: string, intro: string, body: string, ctaUrl?: string, ctaLabel?: string) {
  const cta = ctaUrl && ctaLabel
    ? `<div style="text-align:center;margin:24px 0"><a href="${ctaUrl}" style="display:inline-block;padding:12px 28px;background:#EF4444;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${ctaLabel}</a></div>`
    : '';
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;background:#0F1117;color:#B8C4D5;padding:40px 20px;border-radius:16px;border:1px solid #2A3347">
      <h2 style="color:#EEF1F6;margin:0 0 8px">${title}</h2>
      <p style="color:#8A9BB5;font-size:14px;margin:0 0 20px">${intro}</p>
      <div style="background:#161B27;border:1px solid #2A3347;border-radius:12px;padding:16px;margin-bottom:8px">
        ${body}
      </div>
      ${cta}
      <p style="font-size:12px;color:#3D4F6B;margin-top:24px;text-align:center">talvexIT · Dispute resolution</p>
    </div>
  `;
}

function buildDisputeAdminAlert(p: { to: string; order_id: string; grounds: string; raised_by_name: string; raised_by_role: string; order_title: string; admin_url: string }) {
  return {
    to: { email: p.to },
    subject: `[URGENT] Dispute filed on order — ${p.order_title}`,
    html: disputeShell(
      'New dispute requires review',
      `${p.raised_by_name} (${p.raised_by_role}) has filed a dispute.`,
      `<p style="margin:0;color:#EEF1F6;font-weight:600">${p.order_title}</p>
       <p style="margin:8px 0 0;color:#8A9BB5;font-size:13px">Order ID: ${p.order_id}</p>
       <p style="margin:8px 0 0;color:#8A9BB5;font-size:13px">Grounds: <strong style="color:#EEF1F6">${p.grounds.replace(/_/g, ' ')}</strong></p>`,
      p.admin_url,
      'Review dispute',
    ),
  };
}

function buildDisputeFiledNotice(p: { to: string; order_id: string; grounds: string; submission_window_ends: string; submit_url: string }) {
  const deadline = new Date(p.submission_window_ends).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
  return {
    to: { email: p.to },
    subject: `A dispute has been filed on your order`,
    html: disputeShell(
      'Dispute filed on your order',
      `The other party has filed a dispute. You have until ${deadline} to add your evidence and response.`,
      `<p style="margin:0;color:#8A9BB5;font-size:13px">Order ID: ${p.order_id}</p>
       <p style="margin:8px 0 0;color:#8A9BB5;font-size:13px">Grounds: <strong style="color:#EEF1F6">${p.grounds.replace(/_/g, ' ')}</strong></p>
       <p style="margin:8px 0 0;color:#8A9BB5;font-size:13px">Submission window closes: <strong style="color:#EEF1F6">${deadline}</strong></p>`,
      p.submit_url,
      'Submit your response',
    ),
  };
}

function buildDisputeAdminAssigned(p: { to: string; admin_name: string; order_id: string }) {
  return {
    to: { email: p.to },
    subject: `Your dispute is being reviewed`,
    html: disputeShell(
      'A platform admin is reviewing your dispute',
      `${p.admin_name} from talvexIT will review the case.`,
      `<p style="margin:0;color:#8A9BB5;font-size:13px">Order ID: ${p.order_id}</p>
       <p style="margin:8px 0 0;color:#8A9BB5;font-size:13px">We will be in touch if additional information is needed.</p>`,
    ),
  };
}

function buildArbitratorAppointed(p: { to: string; dispute_id: string; order_id: string; grounds: string; appointment_notes?: string; arbitrator_url: string }) {
  return {
    to: { email: p.to },
    subject: `You've been appointed as arbitrator for a dispute`,
    html: disputeShell(
      'Arbitrator appointment',
      `talvexIT has appointed you as the independent arbitrator for a dispute. Please review the case and submit your recommendation.`,
      `<p style="margin:0;color:#8A9BB5;font-size:13px">Dispute ID: ${p.dispute_id}</p>
       <p style="margin:8px 0 0;color:#8A9BB5;font-size:13px">Order ID: ${p.order_id}</p>
       <p style="margin:8px 0 0;color:#8A9BB5;font-size:13px">Grounds: <strong style="color:#EEF1F6">${p.grounds.replace(/_/g, ' ')}</strong></p>
       ${p.appointment_notes ? `<p style="margin:8px 0 0;color:#8A9BB5;font-size:13px"><em>${p.appointment_notes}</em></p>` : ''}`,
      p.arbitrator_url,
      'Review dispute',
    ),
  };
}

function buildDisputeDetermination(p: { to: string; outcome: string; written_reasons: string; order_id: string }) {
  return {
    to: { email: p.to },
    subject: `Dispute resolved — ${p.outcome.replace(/_/g, ' ')}`,
    html: disputeShell(
      'Dispute determination issued',
      `talvexIT has reached a determination on your dispute.`,
      `<p style="margin:0;color:#8A9BB5;font-size:13px">Order ID: ${p.order_id}</p>
       <p style="margin:8px 0 0;color:#EEF1F6;font-weight:600">Outcome: ${p.outcome.replace(/_/g, ' ')}</p>
       <p style="margin:12px 0 0;color:#8A9BB5;font-size:13px;line-height:1.6"><strong style="color:#EEF1F6">Written reasons:</strong><br>${p.written_reasons.replace(/\n/g, '<br>')}</p>`,
    ),
  };
}

// ─── Service-invoice templates ───────────────────────────────────────────────

const PLATFORM_DISCLAIMER =
  'TalvexIT (operated by Waveful Digital Platforms) is a technology platform. Payments are made directly between clients and service providers. TalvexIT is not a party to this transaction.';

function fmtMoneyCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function siShell(title: string, intro: string, body: string, ctaUrl?: string, ctaText?: string) {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:auto;background:#0F1729;color:#EEF1F6;padding:32px 24px;border-radius:8px">
      <h2 style="color:#14b8a6;margin:0 0 16px">${title}</h2>
      <p style="margin:0 0 16px;color:#C5CDDB;line-height:1.6">${intro}</p>
      <div style="background:#172033;border:1px solid #1F2A44;border-radius:8px;padding:16px;margin:16px 0">
        ${body}
      </div>
      ${
        ctaUrl && ctaText
          ? `<a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;background:#14b8a6;color:#0F1729;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:8px">${ctaText}</a>`
          : ''
      }
      <p style="color:#5C6B85;font-size:11px;margin:24px 0 0;line-height:1.5">${PLATFORM_DISCLAIMER}</p>
    </div>
  `;
}

function buildServiceInvoiceSent(p: {
  to: string;
  invoice_number: string;
  provider_name: string;
  total_cents: number;
  currency: string;
  due_date: string | null;
  internal_url: string;
  public_url: string | null;
}) {
  const cta = p.public_url ?? p.internal_url;
  const due = p.due_date
    ? `<p style="margin:8px 0 0;color:#8A9BB5;font-size:13px">Due: <strong style="color:#EEF1F6">${new Date(p.due_date).toLocaleDateString('en-AU')}</strong></p>`
    : '';
  return {
    to: { email: p.to },
    subject: `Invoice ${p.invoice_number} from ${p.provider_name}`,
    html: siShell(
      'You have a new invoice',
      `<strong>${p.provider_name}</strong> has issued you a tax invoice. Click below to view it and pay.`,
      `<p style="margin:0;color:#8A9BB5;font-size:13px">Invoice #: <strong style="color:#EEF1F6">${p.invoice_number}</strong></p>
       <p style="margin:8px 0 0;color:#8A9BB5;font-size:13px">Amount: <strong style="color:#EEF1F6">${fmtMoneyCents(p.total_cents, p.currency)}</strong></p>
       ${due}`,
      cta,
      'View invoice',
    ),
  };
}

function buildServiceInvoiceEvidenceSubmitted(p: {
  to: string;
  provider_name: string;
  invoice_number: string;
  amount_cents: number;
  currency: string;
  payment_method: string;
  invoice_id: string;
}) {
  return {
    to: { email: p.to },
    subject: `Payment evidence submitted on ${p.invoice_number}`,
    html: siShell(
      'A client says they have paid',
      `Hi ${p.provider_name}, the client on invoice <strong>${p.invoice_number}</strong> has submitted evidence of payment. Please review and approve to mark the invoice as paid.`,
      `<p style="margin:0;color:#8A9BB5;font-size:13px">Method: <strong style="color:#EEF1F6">${p.payment_method.replace(/_/g, ' ')}</strong></p>
       <p style="margin:8px 0 0;color:#8A9BB5;font-size:13px">Amount: <strong style="color:#EEF1F6">${fmtMoneyCents(p.amount_cents, p.currency)}</strong></p>`,
      `${process.env.FRONTEND_URL ?? ''}/invoices/${p.invoice_id}`,
      'Review evidence',
    ),
  };
}

function buildServiceInvoiceEvidenceApproved(p: {
  to: string;
  full_name: string;
  invoice_number: string;
  invoice_id: string;
}) {
  return {
    to: { email: p.to },
    subject: `Payment confirmed for ${p.invoice_number}`,
    html: siShell(
      'Your payment has been confirmed',
      `Hi ${p.full_name}, the provider has confirmed receipt for invoice <strong>${p.invoice_number}</strong>. The invoice is now marked PAID.`,
      `<p style="margin:0;color:#8A9BB5;font-size:13px">Thank you — no further action required.</p>`,
      `${process.env.FRONTEND_URL ?? ''}/invoices/${p.invoice_id}`,
      'View invoice',
    ),
  };
}

function buildServiceInvoiceEvidenceRejected(p: {
  to: string;
  full_name: string;
  invoice_number: string;
  rejection_reason: string | null;
  invoice_id: string;
}) {
  const reason = p.rejection_reason
    ? `<p style="margin:8px 0 0;color:#8A9BB5;font-size:13px"><strong style="color:#EEF1F6">Reason:</strong><br>${p.rejection_reason.replace(/\n/g, '<br>')}</p>`
    : '';
  return {
    to: { email: p.to },
    subject: `Payment evidence rejected on ${p.invoice_number}`,
    html: siShell(
      'Your payment evidence was not accepted',
      `Hi ${p.full_name}, the provider on invoice <strong>${p.invoice_number}</strong> reviewed your evidence but couldn't confirm receipt. You can resubmit with additional details.`,
      `<p style="margin:0;color:#8A9BB5;font-size:13px">Open the invoice to upload an updated receipt or correct the reference.</p>${reason}`,
      `${process.env.FRONTEND_URL ?? ''}/invoices/${p.invoice_id}`,
      'Resubmit evidence',
    ),
  };
}

function buildServiceInvoiceOverdue(p: {
  to: string;
  invoice_number: string;
  provider_name: string;
  total_cents: number;
  currency: string;
  due_date: string | null;
  days_overdue: number | null;
  invoice_id: string;
}) {
  const overdue = p.days_overdue ?? 0;
  return {
    to: { email: p.to },
    subject: `Overdue: ${p.invoice_number} from ${p.provider_name}`,
    html: siShell(
      `Invoice ${p.invoice_number} is ${overdue} day${overdue === 1 ? '' : 's'} overdue`,
      `Friendly reminder: the invoice from <strong>${p.provider_name}</strong> is past its due date. Please settle it as soon as possible.`,
      `<p style="margin:0;color:#8A9BB5;font-size:13px">Amount: <strong style="color:#EEF1F6">${fmtMoneyCents(p.total_cents, p.currency)}</strong></p>
       ${p.due_date ? `<p style="margin:8px 0 0;color:#8A9BB5;font-size:13px">Was due: <strong style="color:#EEF1F6">${new Date(p.due_date).toLocaleDateString('en-AU')}</strong></p>` : ''}`,
      `${process.env.FRONTEND_URL ?? ''}/invoices/${p.invoice_id}`,
      'Pay now',
    ),
  };
}

function buildServiceInvoicePaid(p: {
  to: string;
  full_name: string;
  invoice_number: string;
  amount_cents: number;
  currency: string;
  invoice_id: string;
}) {
  return {
    to: { email: p.to },
    subject: `Invoice ${p.invoice_number} paid`,
    html: siShell(
      'You got paid',
      `Hi ${p.full_name}, Stripe confirmed receipt of payment for invoice <strong>${p.invoice_number}</strong>. Funds are settling to your Connect account.`,
      `<p style="margin:0;color:#8A9BB5;font-size:13px">Amount: <strong style="color:#EEF1F6">${fmtMoneyCents(p.amount_cents, p.currency)}</strong></p>`,
      `${process.env.FRONTEND_URL ?? ''}/invoices/${p.invoice_id}`,
      'View invoice',
    ),
  };
}

// ─── Subscription billing templates ──────────────────────────────────────────
// Different shell from service-invoice — these are platform-issued receipts
// for monthly / yearly subscription billing. No "platform is not a party"
// disclaimer because the platform IS a party here.

function subShell(title: string, intro: string, body: string, ctaUrl?: string, ctaText?: string) {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:auto;background:#0F1729;color:#EEF1F6;padding:32px 24px;border-radius:8px">
      <h2 style="color:#14b8a6;margin:0 0 16px">${title}</h2>
      <p style="margin:0 0 16px;color:#C5CDDB;line-height:1.6">${intro}</p>
      <div style="background:#172033;border:1px solid #1F2A44;border-radius:8px;padding:16px;margin:16px 0">
        ${body}
      </div>
      ${
        ctaUrl && ctaText
          ? `<a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;background:#14b8a6;color:#0F1729;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:8px">${ctaText}</a>`
          : ''
      }
      <p style="color:#5C6B85;font-size:11px;margin:24px 0 0;line-height:1.5">
        TalvexIT is operated by Waveful Digital Platforms. Manage your subscription, change plans, or cancel any time from your billing dashboard.
      </p>
    </div>
  `;
}

function buildSubscriptionPaymentReceipt(p: {
  to: string;
  full_name: string;
  amount_aud: number;
  invoice_number: string;
  hosted_invoice_url: string | null;
}) {
  const cta = p.hosted_invoice_url ?? `${process.env.FRONTEND_URL ?? ''}/billing`;
  return {
    to: { email: p.to },
    subject: `Payment received — ${p.invoice_number}`,
    html: subShell(
      'Thank you — payment received',
      `Hi ${p.full_name}, we&rsquo;ve successfully charged your card for your TalvexIT subscription.`,
      `<p style="margin:0;color:#8A9BB5;font-size:13px">Invoice #: <strong style="color:#EEF1F6">${p.invoice_number}</strong></p>
       <p style="margin:8px 0 0;color:#8A9BB5;font-size:13px">Amount: <strong style="color:#EEF1F6">AUD ${p.amount_aud.toFixed(2)}</strong></p>
       <p style="margin:12px 0 0;color:#8A9BB5;font-size:12px">Your subscription is active. A tax invoice is attached to your billing dashboard.</p>`,
      cta,
      p.hosted_invoice_url ? 'View Stripe receipt' : 'Open billing',
    ),
  };
}

function buildSubscriptionPaymentFailed(p: {
  to: string;
  full_name: string;
  amount_aud: number;
  invoice_number: string;
  hosted_invoice_url: string | null;
}) {
  const cta = p.hosted_invoice_url ?? `${process.env.FRONTEND_URL ?? ''}/billing`;
  return {
    to: { email: p.to },
    subject: `Payment failed — ${p.invoice_number}`,
    html: subShell(
      'We couldn&rsquo;t process your payment',
      `Hi ${p.full_name}, your most recent TalvexIT subscription payment did not go through. Stripe will automatically retry over the next few days, but updating your payment method now will avoid any service interruption.`,
      `<p style="margin:0;color:#8A9BB5;font-size:13px">Invoice #: <strong style="color:#EEF1F6">${p.invoice_number}</strong></p>
       <p style="margin:8px 0 0;color:#8A9BB5;font-size:13px">Amount due: <strong style="color:#EEF1F6">AUD ${p.amount_aud.toFixed(2)}</strong></p>
       <p style="margin:12px 0 0;color:#8A9BB5;font-size:12px">Common causes: card expired, insufficient funds, bank declined the charge. Open the billing portal to update your card.</p>`,
      cta,
      p.hosted_invoice_url ? 'Pay now via Stripe' : 'Update payment method',
    ),
  };
}

// ─── Order-lifecycle templates ───────────────────────────────────────────────
// One small builder each — kept minimal so the central registry in
// apps/api/src/services/order-notifications.ts owns the copy decisions.

function buildOrderEmail(p: {
  to: string;
  subject: string;
  heading: string;
  intro: string;
  details?: string;
  order_url: string;
  cta: string;
}) {
  return {
    to: { email: p.to },
    subject: p.subject,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#0d9488">${p.heading}</h2>
        <p>${p.intro}</p>
        ${p.details ?? ''}
        <a href="${p.order_url}"
           style="display:inline-block;margin-top:16px;padding:12px 24px;background:#0d9488;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          ${p.cta}
        </a>
        <p style="color:#999;font-size:11px;margin-top:24px">Or open: ${p.order_url}</p>
      </div>
    `,
  };
}

function buildNewOrderReceived(p: {
  to: string; order_id: string; customer_name: string; task_title: string; order_url: string;
}) {
  return buildOrderEmail({
    to: p.to,
    subject: `New order — ${p.task_title}`,
    heading: 'You have a new order',
    intro: `<strong>${p.customer_name}</strong> placed an order for <strong>${p.task_title}</strong>. Open the order to accept or reject before the deadline.`,
    order_url: p.order_url,
    cta: 'Open order',
  });
}

function buildCompanyOrderNeedsAssignment(p: {
  to: string; company_name: string; task_title: string; customer_name: string; assign_url: string;
}) {
  return buildOrderEmail({
    to: p.to,
    subject: `New order for ${p.company_name} — assign a member`,
    heading: 'New order needs a team-member assignment',
    intro: `<strong>${p.customer_name}</strong> placed an order for <strong>${p.task_title}</strong>. Assign a team member to start work.`,
    order_url: p.assign_url,
    cta: 'Assign member',
  });
}

function buildOrderAccepted(p: { to: string; task_title: string; order_url: string }) {
  return buildOrderEmail({
    to: p.to,
    subject: `Order accepted — ${p.task_title}`,
    heading: 'Your order was accepted',
    intro: `Your supplier has accepted <strong>${p.task_title}</strong>. Make payment via the order page to start the work.`,
    order_url: p.order_url,
    cta: 'View order',
  });
}

function buildOrderSubmitted(p: { to: string; task_title: string; order_url: string }) {
  return buildOrderEmail({
    to: p.to,
    subject: `Work submitted — ${p.task_title}`,
    heading: 'Deliverables submitted for review',
    intro: `Your supplier has submitted deliverables for <strong>${p.task_title}</strong>. Review and approve, or request revisions.`,
    order_url: p.order_url,
    cta: 'Review now',
  });
}

function buildOrderRevisionRequested(p: {
  to: string; task_title: string; customer_name: string; reason: string; order_url: string;
}) {
  return buildOrderEmail({
    to: p.to,
    subject: `Revisions requested — ${p.task_title}`,
    heading: 'Revisions requested',
    intro: `<strong>${p.customer_name}</strong> requested revisions on <strong>${p.task_title}</strong>.`,
    details: `<blockquote style="border-left:3px solid #0d9488;margin:16px 0;padding:8px 14px;color:#444;background:#f7f7f7">${escape(p.reason)}</blockquote>`,
    order_url: p.order_url,
    cta: 'Address revisions',
  });
}

function buildOrderCompleted(p: { to: string; task_title: string; order_url: string }) {
  return buildOrderEmail({
    to: p.to,
    subject: `Order completed — ${p.task_title}`,
    heading: 'Order complete',
    intro: `<strong>${p.task_title}</strong> has been marked complete by your customer. Thanks for the work.`,
    order_url: p.order_url,
    cta: 'View order',
  });
}

function buildOrderCancelled(p: {
  to: string; task_title: string; reason: string; cancelled_by: string; order_url: string;
}) {
  return buildOrderEmail({
    to: p.to,
    subject: `Order cancelled — ${p.task_title}`,
    heading: 'Order cancelled',
    intro: `<strong>${p.task_title}</strong> was cancelled by the ${p.cancelled_by}.`,
    details: p.reason
      ? `<blockquote style="border-left:3px solid #dc2626;margin:16px 0;padding:8px 14px;color:#444;background:#f7f7f7">${escape(p.reason)}</blockquote>`
      : '',
    order_url: p.order_url,
    cta: 'View order',
  });
}

// ─── KYC lifecycle builders ─────────────────────────────────────────────────

function formatKycDate(iso: string): string {
  // Render in AEST/AEDT — most contractors are AU-based. The API records
  // the exact UTC instant; the email shows what the contractor will see.
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Australia/Sydney',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

function buildKycSessionScheduled(p: { to: string; scheduledAt: string; roomName: string }) {
  return {
    to: { email: p.to },
    subject: 'Your KYC video session is scheduled',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#0d9488">KYC video session scheduled</h2>
        <p>An admin has scheduled your identity verification call.</p>
        <p style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:6px;padding:12px 16px;margin:16px 0">
          <strong>${escape(formatKycDate(p.scheduledAt))}</strong>
        </p>
        <p>You'll join the call from your account, share your government ID, and confirm your business details. Plan for about 10 minutes.</p>
        <p>If this time doesn't work, you can propose a new one from your KYC page — the admin will review and confirm.</p>
        <p>
          <a href="${process.env.FRONTEND_URL ?? ''}/contractor/kyc"
             style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">
            Open KYC page
          </a>
        </p>
        <p style="color:#666;font-size:12px;margin-top:24px">Room: ${escape(p.roomName)}</p>
      </div>`,
  };
}

function buildKycSessionRescheduled(p: { to: string; scheduledAt: string; roomName: string }) {
  return {
    to: { email: p.to },
    subject: 'Your KYC video session has been rescheduled',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#0d9488">KYC session rescheduled</h2>
        <p>Your identity verification call has been moved to:</p>
        <p style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:6px;padding:12px 16px;margin:16px 0">
          <strong>${escape(formatKycDate(p.scheduledAt))}</strong>
        </p>
        <p>
          <a href="${process.env.FRONTEND_URL ?? ''}/contractor/kyc"
             style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">
            Open KYC page
          </a>
        </p>
        <p style="color:#666;font-size:12px;margin-top:24px">Room: ${escape(p.roomName)}</p>
      </div>`,
  };
}

function buildKycSessionCancelled(p: { to: string; reason?: string }) {
  return {
    to: { email: p.to },
    subject: 'Your KYC video session was cancelled',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#dc2626">KYC session cancelled</h2>
        <p>Your scheduled identity verification call has been cancelled.</p>
        ${p.reason ? `<blockquote style="border-left:3px solid #dc2626;margin:16px 0;padding:8px 14px;color:#444;background:#f7f7f7">${escape(p.reason)}</blockquote>` : ''}
        <p>An admin will reach out to schedule a new time, or you can wait for a new invite via email.</p>
      </div>`,
  };
}

function buildKycApproved(p: { to: string }) {
  return {
    to: { email: p.to },
    subject: 'Your KYC has been approved',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#0d9488">Identity verified — welcome aboard</h2>
        <p>Your KYC review is complete. Your account is now fully verified and you can accept work on the platform.</p>
        <p>
          <a href="${process.env.FRONTEND_URL ?? ''}/contractor/dashboard"
             style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">
            Go to dashboard
          </a>
        </p>
      </div>`,
  };
}

function buildKycRejected(p: { to: string; notes?: string }) {
  return {
    to: { email: p.to },
    subject: 'Your KYC verification was not approved',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#dc2626">KYC not approved</h2>
        <p>After reviewing your verification call, your application was not approved at this time.</p>
        ${p.notes ? `<blockquote style="border-left:3px solid #dc2626;margin:16px 0;padding:8px 14px;color:#444;background:#f7f7f7">${escape(p.notes)}</blockquote>` : ''}
        <p>If you believe this was made in error, please reply to this email or contact support.</p>
      </div>`,
  };
}

function buildKycRescheduleRequested(p: {
  to: string;
  contractor_name: string;
  contractor_email: string;
  original_at: string;
  proposed_at: string;
  comment: string | null;
  review_url: string;
}) {
  return {
    to: { email: p.to },
    subject: `Reschedule request — ${p.contractor_name}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto">
        <h2 style="color:#0d9488">KYC reschedule request</h2>
        <p><strong>${escape(p.contractor_name)}</strong> (${escape(p.contractor_email)}) has requested a new time for their KYC session.</p>
        <table style="border-collapse:collapse;margin:16px 0;width:100%">
          <tr>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;width:40%">Originally scheduled</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb">${escape(formatKycDate(p.original_at))}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280">Proposed new time</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb"><strong>${escape(formatKycDate(p.proposed_at))}</strong></td>
          </tr>
        </table>
        ${p.comment ? `<p style="color:#6b7280;font-size:13px;margin-bottom:4px">Contractor's note:</p><blockquote style="border-left:3px solid #0d9488;margin:0 0 16px;padding:8px 14px;color:#444;background:#f0fdfa">${escape(p.comment)}</blockquote>` : ''}
        <p>
          <a href="${p.review_url}"
             style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">
            Review request
          </a>
        </p>
      </div>`,
  };
}

function buildKycRescheduleDecision(p: {
  to: string;
  decision: 'APPROVED' | 'REJECTED';
  proposed_at: string;
  effective_at: string | null;
  admin_notes: string | null;
  kyc_url: string;
}) {
  const approved = p.decision === 'APPROVED';
  return {
    to: { email: p.to },
    subject: approved
      ? 'Your KYC reschedule was approved'
      : 'Your KYC reschedule request was declined',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:${approved ? '#0d9488' : '#dc2626'}">
          ${approved ? 'Reschedule approved' : 'Reschedule declined'}
        </h2>
        ${
          approved && p.effective_at
            ? `<p>Your KYC session has been moved to:</p>
               <p style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:6px;padding:12px 16px;margin:16px 0">
                 <strong>${escape(formatKycDate(p.effective_at))}</strong>
               </p>`
            : `<p>The admin couldn't accommodate your proposed time of <strong>${escape(formatKycDate(p.proposed_at))}</strong>. The original session time still stands.</p>`
        }
        ${p.admin_notes ? `<blockquote style="border-left:3px solid ${approved ? '#0d9488' : '#dc2626'};margin:16px 0;padding:8px 14px;color:#444;background:#f7f7f7">${escape(p.admin_notes)}</blockquote>` : ''}
        <p>
          <a href="${p.kyc_url}"
             style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">
            Open KYC page
          </a>
        </p>
      </div>`,
  };
}

// ── Contact form builders ─────────────────────────────────────────────────

function buildContactEnquiryAdmin(p: {
  to: string;
  enquiry_id: string;
  name: string;
  email: string;
  phone: string | null;
  enquiry_type: string;
  message: string;
  ip_address: string;
  admin_url: string;
}) {
  // Plain inline HTML — Outlook/Gmail strip <style> blocks. Body kept
  // information-dense; the visual style matches the rest of the platform's
  // transactional emails (teal accent, off-white card).
  return {
    to: { email: p.to },
    subject: `New contact enquiry — ${p.enquiry_type}`,
    replyTo: { email: p.email, name: p.name },
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto">
        <h2 style="color:#0d9488">New contact enquiry</h2>
        <p>A new message has been submitted via the public contact form.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <tr><td style="padding:8px 12px;background:#f8fafc;font-weight:600;width:140px">From</td><td style="padding:8px 12px">${escape(p.name)} &lt;${escape(p.email)}&gt;</td></tr>
          ${p.phone ? `<tr><td style="padding:8px 12px;background:#f8fafc;font-weight:600">Phone</td><td style="padding:8px 12px">${escape(p.phone)}</td></tr>` : ''}
          <tr><td style="padding:8px 12px;background:#f8fafc;font-weight:600">Enquiry type</td><td style="padding:8px 12px">${escape(p.enquiry_type)}</td></tr>
          <tr><td style="padding:8px 12px;background:#f8fafc;font-weight:600">IP address</td><td style="padding:8px 12px;color:#475569">${escape(p.ip_address)}</td></tr>
        </table>
        <div style="background:#f8fafc;border-left:3px solid #0d9488;padding:12px 16px;border-radius:4px;white-space:pre-wrap;color:#334155">${escape(p.message)}</div>
        <p style="margin-top:24px">
          <a href="${p.admin_url}"
             style="display:inline-block;padding:10px 20px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px">
            Open in admin
          </a>
        </p>
        <p style="color:#94a3b8;font-size:11px;margin-top:32px">
          Reply directly to this email or use the admin panel. Replies via email go to
          ${escape(p.name)} &lt;${escape(p.email)}&gt; — replies via the admin panel are also recorded in the enquiry thread.
        </p>
      </div>
    `,
  };
}

function buildContactEnquiryAck(p: { to: string; name: string; enquiry_type: string; message: string }) {
  return {
    to: { email: p.to, name: p.name },
    subject: 'We received your enquiry — TalvexIT',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0d9488">Thanks ${escape(p.name)} — we got it</h2>
        <p>This is to confirm we received your enquiry. Our team typically responds within one business day.</p>
        <p style="margin:16px 0 6px;color:#475569;font-size:13px"><strong>Your message</strong> (${escape(p.enquiry_type)}):</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px 16px;border-radius:6px;white-space:pre-wrap;color:#334155;font-size:13px">${escape(p.message)}</div>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">
          No reply required to this email. We will respond from the same address.
        </p>
        <p style="color:#94a3b8;font-size:11px">TalvexIT · Operated by Waveful Digital Platforms · ABN 49 602 081 005</p>
      </div>
    `,
  };
}

function buildContactEnquiryResponse(p: { to: string; name: string; subject: string; body: string; admin_name: string }) {
  return {
    to: { email: p.to, name: p.name },
    subject: p.subject,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;color:#334155;font-size:14px;line-height:1.6">
        <p>Hi ${escape(p.name)},</p>
        <div style="white-space:pre-wrap">${escape(p.body)}</div>
        <p style="margin-top:24px">${escape(p.admin_name)}<br><span style="color:#94a3b8;font-size:12px">TalvexIT team</span></p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:11px">
          This is a reply to a message you sent through the TalvexIT contact form. Reply directly to this email if you have follow-up questions — your reply will reach our team.
        </p>
      </div>
    `,
  };
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const emailWorker = new Worker<EmailJobPayload>(
  'email',
  async (job) => {
    const data = job.data;
    console.log(`[email] Processing job type="${data.type}" to="${'to' in data ? data.to : '?'}"`);

    switch (data.type) {
      case 'verify-email':
        await sendEmail(buildVerifyEmail(data.to, data.verify_url));
        break;
      case 'reset-password':
        await sendEmail(buildResetPassword(data.to, data.reset_url));
        break;
      case 'org-member-invitation':
        await sendEmail(buildOrgInvitation(data.to, data.accept_url, data.org_name, data.invited_by));
        break;
      case 'org-membership-removed':
        await sendEmail(buildOrgMemberRemoved(data.to, data.org_name));
        break;
      case 'payout-initiated':
        await sendEmail(buildPayoutInitiated(data.to, data.order_id, data.net_amount_aud, data.commission_rate, data.estimated_arrival));
        break;
      case 'company-member-invitation':
        await sendEmail(buildCompanyInvitation(data.to, data.company_name, data.inviter_name, data.role, data.invite_url, data.expires_at));
        break;
      case 'member-joined-notification':
        await sendEmail(buildMemberJoinedNotification(data.to, data.company_name, data.member_name, data.role, data.dashboard_url));
        break;
      case 'login-otp':
        await sendEmail(buildLoginOtp(data.to, data.full_name, data.otp_code, data.ip_address));
        break;
      case 'payment-method-approved':
        await sendEmail(buildPaymentMethodApproved(data.to, data.full_name, data.method_type, data.nickname));
        break;
      case 'payment-method-rejected':
        await sendEmail(buildPaymentMethodRejected(data.to, data.full_name, data.method_type, data.nickname, data.reason));
        break;
      case 'tender-invitation':
        await sendEmail(buildTenderInvitation(data.to, data.provider_name, data.tender_title, data.tender_url, data.deadline));
        break;
      case 'tender-deadline-extended':
        await sendEmail(buildTenderDeadlineExtended(data));
        break;
      case 'tc-invoice-paid-customer-receipt':
        await sendEmail(buildTcInvoicePaidCustomerCopy(data));
        break;
      case 'tc-invoice-paid-supplier-receipt':
        await sendEmail(buildTcInvoicePaidSupplierReceipt(data));
        break;
      case 'tender-proposal-received':
        await sendEmail(buildTenderProposalReceived(data.to, data.customer_name, data.tender_title, data.tender_url));
        break;
      case 'tender-proposal-awarded':
        await sendEmail(buildTenderProposalAwarded(data.to, data.provider_name, data.tender_title, data.tender_url));
        break;
      case 'tender-proposal-rejected':
        await sendEmail(buildTenderProposalRejected(data.to, data.provider_name, data.tender_title));
        break;
      case 'dispute-filed-admin-alert':
        await sendEmail(buildDisputeAdminAlert(data));
        break;
      case 'dispute-filed-notice':
        await sendEmail(buildDisputeFiledNotice(data));
        break;
      case 'dispute-admin-assigned':
        await sendEmail(buildDisputeAdminAssigned(data));
        break;
      case 'arbitrator-appointed':
        await sendEmail(buildArbitratorAppointed(data));
        break;
      case 'dispute-determination-issued':
        await sendEmail(buildDisputeDetermination(data));
        break;
      case 'service-invoice-sent':
        await sendEmail(buildServiceInvoiceSent(data));
        break;
      case 'service-invoice-evidence-submitted':
        await sendEmail(buildServiceInvoiceEvidenceSubmitted(data));
        break;
      case 'service-invoice-evidence-approved':
        await sendEmail(buildServiceInvoiceEvidenceApproved(data));
        break;
      case 'service-invoice-evidence-rejected':
        await sendEmail(buildServiceInvoiceEvidenceRejected(data));
        break;
      case 'service-invoice-overdue':
        await sendEmail(buildServiceInvoiceOverdue(data));
        break;
      case 'service-invoice-paid':
        await sendEmail(buildServiceInvoicePaid(data));
        break;
      case 'subscription-payment-receipt':
        await sendEmail(buildSubscriptionPaymentReceipt(data));
        break;
      case 'subscription-payment-failed':
        await sendEmail(buildSubscriptionPaymentFailed(data));
        break;
      // ── Order lifecycle ─────────────────────────────────────────────────
      case 'new-order-received':
        await sendEmail(buildNewOrderReceived(data));
        break;
      case 'company-order-needs-assignment':
        await sendEmail(buildCompanyOrderNeedsAssignment(data));
        break;
      case 'order-accepted':
        await sendEmail(buildOrderAccepted(data));
        break;
      case 'order-submitted':
        await sendEmail(buildOrderSubmitted(data));
        break;
      case 'order-revision-requested':
        await sendEmail(buildOrderRevisionRequested(data));
        break;
      case 'order-completed':
        await sendEmail(buildOrderCompleted(data));
        break;
      case 'order-cancelled':
        await sendEmail(buildOrderCancelled(data));
        break;
      // ── KYC lifecycle ───────────────────────────────────────────────────
      case 'kyc-session-scheduled':
        await sendEmail(buildKycSessionScheduled(data));
        break;
      case 'kyc-session-rescheduled':
        await sendEmail(buildKycSessionRescheduled(data));
        break;
      case 'kyc-session-cancelled':
        await sendEmail(buildKycSessionCancelled(data));
        break;
      case 'kyc-approved':
        await sendEmail(buildKycApproved(data));
        break;
      case 'kyc-rejected':
        await sendEmail(buildKycRejected(data));
        break;
      case 'kyc-reschedule-requested':
        await sendEmail(buildKycRescheduleRequested(data));
        break;
      case 'kyc-reschedule-decision':
        await sendEmail(buildKycRescheduleDecision(data));
        break;
      // ── Contact form ────────────────────────────────────────────────────
      case 'contact-enquiry-admin':
        await sendEmail(buildContactEnquiryAdmin(data));
        break;
      case 'contact-enquiry-ack':
        await sendEmail(buildContactEnquiryAck(data));
        break;
      case 'contact-enquiry-response':
        await sendEmail(buildContactEnquiryResponse(data));
        break;
      default:
        console.warn(`[email] Unknown job type: ${(data as { type: string }).type}`);
        return;
    }
  },
  { connection, concurrency: 5 },
);

emailWorker.on('failed', (job, err) => {
  console.error(`[email] Job failed: type=${job?.data?.type}`, err.message);
});

emailWorker.on('completed', (job) => {
  console.log(`[email] Job done: id=${job.id} type=${job.data.type}`);
});

console.log('[email] worker started on queue "email"');
