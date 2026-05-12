import 'dotenv/config';
import { startInsuranceExpiryScheduler } from './jobs/insurance-expiry.scheduler.js';
import { startOrderSlaScheduler } from './jobs/order-sla.scheduler.js';
import './jobs/ai-scoping.worker.js';
import './jobs/payout.job.js';
import './jobs/credential-purge.job.js';

console.log('[workers] starting...');

await startInsuranceExpiryScheduler();
await startOrderSlaScheduler();

console.log('[workers] all schedulers registered');
