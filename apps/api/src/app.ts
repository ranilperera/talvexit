import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { Queue } from 'bullmq';
import { prisma } from './lib/prisma.js';
import { AuthService } from './services/auth.service.js';
import { ContractorProfileService } from './services/contractor-profile.service.js';
import { InsuranceService } from './services/insurance.service.js';
import { VideoSessionService } from './services/video-session.service.js';
import { OrganisationService } from './services/organisation.service.js';
import { TaskService } from './services/task.service.js';
import { ScopeModificationService } from './services/scope-modification.service.js';
import { OrderService } from './services/order.service.js';
import { ScopingService } from './services/scoping.service.js';
import { CredentialService } from './services/credential.service.js';
import { RatingService } from './services/rating.service.js';
import { DisputeService } from './services/dispute.service.js';
import { NotificationService } from './services/notification.service.js';
import { AdminContractorService } from './services/admin-contractor.service.js';
import { AmlService } from './services/aml.service.js';
import { CompanyService } from './services/company.service.js';
import { CompanyPayoutService } from './services/company-payout.service.js';
import { InvoiceService } from './services/invoice.service.js';
import { TenderContractPaymentService } from './services/tender-contract-payment.service.js';
import { ProposalService } from './services/proposal.service.js';
import { ChatService } from './services/chat.service.js';
import { TaskThreadService } from './services/task-thread.service.js';
import { authRoutes } from './routes/auth.routes.js';
import { contractorRoutes } from './routes/contractor.routes.js';
import { insuranceRoutes } from './routes/insurance.routes.js';
import { videoRoutes } from './routes/video.routes.js';
import { organisationRoutes } from './routes/organisation.routes.js';
import { taskRoutes } from './routes/task.routes.js';
import { orderRoutes } from './routes/order.routes.js';
import { scopingRoutes } from './routes/scoping.routes.js';
import { credentialRoutes } from './routes/credential.routes.js';
import { ratingRoutes } from './routes/rating.routes.js';
import { disputeRoutes } from './routes/dispute.routes.js';
import { notificationRoutes } from './routes/notification.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { companyRoutes } from './routes/company.routes.js';
import { proposalRoutes } from './routes/proposal.routes.js';
import { invoiceRoutes } from './routes/invoice.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { threadRoutes } from './routes/thread.routes.js';
import { contactRoutes } from './routes/contact.routes.js';
import { TenderService } from './services/tender.service.js';
import { tenderRoutes } from './routes/tender.routes.js';
import { TenderContractService } from './services/tender-contract.service.js';
import { tenderContractRoutes } from './routes/tender-contract.routes.js';
import { domainRoutes } from './routes/domain.routes.js';
import { SubscriptionService } from './services/subscription.service.js';
import { subscriptionRoutes } from './routes/subscriptions.routes.js';
import { makeSubscriptionGuards } from './middleware/subscription-limits.js';
import { ServiceInvoiceService } from './services/service-invoice.service.js';
import { serviceInvoiceRoutes } from './routes/service-invoice.routes.js';
import { EngagementPaymentService } from './services/engagement-payment.service.js';
import { AccountSanctionsService } from './services/account-sanctions.service.js';
import { webhookRoutes } from './routes/webhook.routes.js';

// ─── Startup env validation ───────────────────────────────────────────────────

function validateEnv(): void {
  const required = [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_MFA_SECRET',
    'MFA_ENCRYPTION_KEY',
    'FRONTEND_URL',
    'CORS_ORIGIN',
    // ABR_GUID is required for ABN verification — every customer / contractor /
    // AU company runs through it. Without it, /auth/me/abn-verify returns
    // ABR_NOT_CONFIGURED and downstream billing edits fail closed.
    'ABR_GUID',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error('[startup] Missing required env vars:', missing.join(', '));
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
  if (process.env.NODE_ENV === 'production') {
    for (const key of ['FRONTEND_URL', 'API_PUBLIC_URL', 'WEB_URL', 'CORS_ORIGIN']) {
      const val = process.env[key];
      if (val?.includes('localhost')) {
        console.error(`[startup] ERROR: ${key} contains 'localhost' in production: ${val}`);
        process.exit(1);
      }
    }
    // Defence-in-depth: TEST_BYPASS_OTP skips the email-OTP step at login. It
    // exists only so automated tests don't have to hit MailHog. If this ever
    // makes it into a production env, login-step-2 silently disappears.
    if (process.env.TEST_BYPASS_OTP === 'true') {
      console.error('[startup] FATAL: TEST_BYPASS_OTP=true is forbidden in production.');
      process.exit(1);
    }
    console.log('[startup] FRONTEND_URL:', process.env.FRONTEND_URL);
  }
}

validateEnv();

function redisConnection() {
  const url = process.env.REDIS_URL;
  if (url) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port) || 6379,
      ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    };
  }
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  };
}

const emailQueue = new Queue('email', { connection: redisConnection() });
emailQueue.on('error', (err) => {
  console.error('[queue] Redis error (non-fatal):', err.message);
});
const authService = new AuthService(prisma, emailQueue);
const contractorService = new ContractorProfileService(prisma, emailQueue as never);
const insuranceService = new InsuranceService(prisma, emailQueue as never);
const videoSessionService = new VideoSessionService(prisma, emailQueue as never);
const orgService = new OrganisationService(prisma, emailQueue as never);
const taskService = new TaskService(prisma);
const smrService = new ScopeModificationService(prisma, emailQueue as never);
// NotificationService is instantiated early so order/dispute/etc. services can
// fire centralised lifecycle alerts via the order-notifications registry.
const notificationService = new NotificationService(prisma, emailQueue as never);
const orderService = new OrderService(prisma, emailQueue as never, notificationService);
const scopingService = new ScopingService(prisma);
const credentialService = new CredentialService(prisma, emailQueue as never);
const ratingService = new RatingService(prisma, emailQueue as never);
const disputeService = new DisputeService(prisma, emailQueue as never);
const adminContractorService = new AdminContractorService(prisma, emailQueue as never);
const amlService = new AmlService(prisma);
const companyService = new CompanyService(prisma, emailQueue as never);
const companyPayoutService = new CompanyPayoutService(prisma, emailQueue as never);
const invoiceService = new InvoiceService(prisma, emailQueue as never);
const proposalService = new ProposalService(prisma, emailQueue as never);
const chatService = new ChatService(prisma, emailQueue as never, notificationService);
const taskThreadService = new TaskThreadService(prisma, notificationService);
const tenderService = new TenderService(prisma, emailQueue as never);
const subscriptionService = new SubscriptionService(prisma);
export const subscriptionGuards = makeSubscriptionGuards(subscriptionService);
const tenderContractService = new TenderContractService(
  prisma,
  emailQueue as never,
  subscriptionService,
);
const tcPaymentService = new TenderContractPaymentService(prisma, emailQueue as never);
const serviceInvoiceService = new ServiceInvoiceService(
  prisma,
  emailQueue as never,
  subscriptionService,
);
const engagementPaymentService = new EngagementPaymentService(prisma, emailQueue as never);
const sanctionsService = new AccountSanctionsService(prisma);

// Hot-load commission tiers + direct-payment cutover from PlatformConfig.
import { loadCommissionTiers } from './utils/commission.js';
import { loadDirectPaymentCutover } from './utils/cutover.js';
void loadCommissionTiers(prisma);
void loadDirectPaymentCutover(prisma);

export function buildApp() {
  // trustProxy: required so req.ip reflects the real client (from X-Forwarded-For)
  // rather than the HAProxy peer IP. Without this, @fastify/rate-limit keys every
  // user under the proxy's IP and locks out the whole site after one bucket fills.
  // Set TRUSTED_PROXY to the HAProxy VM's IP/CIDR (e.g. "10.1.3.100"); falls back
  // to false in dev so localhost behaves normally.
  const trustProxy = process.env.TRUSTED_PROXY ?? false;
  const app = Fastify({ logger: true, trustProxy });

  app.register(helmet);
  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  // Reject the request entirely if CORS_ORIGIN is missing in production —
  // a permissive fallback is the wrong default for a credentialed endpoint.
  // Dev still gets the localhost convenience.
  // Strip trailing slashes — browsers send Origin without one, so
  // "http://localhost:3000/" in env would never match and every request
  // would 403. Defensive against a common operator footgun.
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)
    : process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:3000'];
  app.register(cors, { origin: corsOrigins, credentials: true });

  const isDev = process.env['NODE_ENV'] !== 'production';

  app.register(rateLimit, {
    max: isDev ? 10000 : 100,
    timeWindow: '15 minutes',
  });

  app.get('/api/v1/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.get('/api/v1/config/public', async (_req, reply) => {
    try {
      const rows = await prisma.platformConfig.findMany({ orderBy: { key: 'asc' } });
      const data: Record<string, unknown> = {};
      for (const row of rows) {
        data[row.key] = row.value;
      }
      return reply.status(200).send({ success: true, data });
    } catch {
      return reply.status(200).send({ success: true, data: {} });
    }
  });

  // Auth routes — tighter limit in prod (20 req / 15 min), relaxed in dev
  app.register(
    async (scope) => {
      scope.addHook('onRoute', (routeOptions) => {
        routeOptions.config = {
          ...routeOptions.config,
          rateLimit: { max: isDev ? 10000 : 20, timeWindow: '15 minutes' },
        };
      });
      scope.register(authRoutes, { authService, prisma });
    },
    { prefix: '/api/v1' },
  );

  app.register(contractorRoutes, { prefix: '/api/v1', contractorService, prisma, subscriptionService });
  app.register(insuranceRoutes, { prefix: '/api/v1', insuranceService });
  app.register(videoRoutes, { prefix: '/api/v1', videoSessionService });
  app.register(organisationRoutes, { prefix: '/api/v1', orgService });
  app.register(taskRoutes, { prefix: '/api/v1', taskService, smrService, subscriptionGuards });
  app.register(orderRoutes, {
    prefix: '/api/v1',
    orderService,
    engagementPaymentService,
    notificationService,
    subscriptionGuards,
    subscriptionService,
  });
  app.register(scopingRoutes, { prefix: '/api/v1', scopingService, subscriptionGuards });
  app.register(credentialRoutes, { prefix: '/api/v1', credentialService });
  app.register(ratingRoutes, { prefix: '/api/v1', ratingService });
  app.register(disputeRoutes, { prefix: '/api/v1', disputeService });
  app.register(notificationRoutes, { prefix: '/api/v1', notificationService });
  app.register(adminRoutes, {
    prefix: '/api/v1/admin',
    adminContractorService,
    amlService,
    insuranceService,
    prisma,
    payoutService: companyPayoutService,
    emailQueue: emailQueue as never,
    tcPaymentService,
    sanctionsService,
  });
  app.register(companyRoutes, {
    prefix: '/api/v1',
    companyService,
    payoutService: companyPayoutService,
    subscriptionGuards,
  });
  app.register(invoiceRoutes, { prefix: '/api/v1', invoiceService });
  app.register(proposalRoutes, { prefix: '/api/v1', proposalService });
  app.register(chatRoutes, { prefix: '/api/v1', chatService });
  app.register(threadRoutes, { prefix: '/api/v1', threadService: taskThreadService });
  app.register(tenderRoutes, { prefix: '/api/v1', tenderService, orderService, subscriptionGuards, subscriptionService });
  app.register(tenderContractRoutes, {
    prefix: '/api/v1',
    contractService: tenderContractService,
    paymentService: tcPaymentService,
    engagementPaymentService,
    subscriptionGuards,
  });
  app.register(contactRoutes, { prefix: '/api/v1', emailQueue: emailQueue as never });
  app.register(domainRoutes, { prefix: '/api/v1', prisma });
  app.register(subscriptionRoutes, { prefix: '/api/v1', subscriptionService });
  app.register(serviceInvoiceRoutes, { prefix: '/api/v1', serviceInvoiceService });
  // Stripe webhook receiver — encapsulated in its own plugin scope so it can
  // swap the JSON parser to keep the raw body for signature verification
  // without leaking that change to other routes. Mount path:
  // POST /api/v1/webhooks/stripe.
  app.register(webhookRoutes, { prefix: '/api/v1', prisma, emailQueue: emailQueue as never });

  return app;
}
