import 'dotenv/config';
import { startInsuranceExpiryScheduler } from './jobs/insurance-expiry.scheduler.js';
import { startOrderSlaScheduler } from './jobs/order-sla.scheduler.js';
import { startSubscriptionUsageResetScheduler } from './jobs/subscription-usage-reset.scheduler.js';
import { startServiceInvoiceOverdueScheduler } from './jobs/service-invoice-overdue.scheduler.js';
import './jobs/ai-scoping.worker.js';
import './jobs/credential-purge.job.js';
import './jobs/email.worker.js';
import { graphEmailService } from './services/graph-email.service.js';

console.log('[workers] starting...');

// ─── Verify Graph API token on startup ────────────────────────────────────────

async function testEmailConnection() {
  try {
    if (process.env.NODE_ENV !== 'production') {
      // Acquire a token to confirm credentials are valid (no email sent)
      await graphEmailService.getAccessToken();
      console.log('[startup] Graph email: connected ✓');
    } else {
      console.log('[startup] Graph email: configured ✓');
    }
  } catch (err) {
    console.error('[startup] Graph email connection failed:', err);
    console.error(
      'Check: AZURE_EMAIL_TENANT_ID, AZURE_EMAIL_CLIENT_ID, AZURE_EMAIL_CLIENT_SECRET',
    );
    // Don't exit — workers still function without email
  }
}

await testEmailConnection();
await startInsuranceExpiryScheduler();
await startOrderSlaScheduler();
await startSubscriptionUsageResetScheduler();
await startServiceInvoiceOverdueScheduler();

console.log('[workers] all schedulers registered');
