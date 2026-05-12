import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
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
import { PaymentService } from './services/payment.service.js';
import { CredentialService } from './services/credential.service.js';
import { RatingService } from './services/rating.service.js';
import { DisputeService } from './services/dispute.service.js';
import { AdminContractorService } from './services/admin-contractor.service.js';
import { AmlService } from './services/aml.service.js';
import { authRoutes } from './routes/auth.routes.js';
import { contractorRoutes } from './routes/contractor.routes.js';
import { insuranceRoutes } from './routes/insurance.routes.js';
import { videoRoutes } from './routes/video.routes.js';
import { organisationRoutes } from './routes/organisation.routes.js';
import { taskRoutes } from './routes/task.routes.js';
import { orderRoutes } from './routes/order.routes.js';
import { scopingRoutes } from './routes/scoping.routes.js';
import { paymentRoutes } from './routes/payment.routes.js';
import { credentialRoutes } from './routes/credential.routes.js';
import { ratingRoutes } from './routes/rating.routes.js';
import { disputeRoutes } from './routes/dispute.routes.js';
import { adminRoutes } from './routes/admin.routes.js';

const emailQueue = new Queue('email', {
  connection: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
});
const authService = new AuthService(prisma, emailQueue);
const contractorService = new ContractorProfileService(prisma, emailQueue as never);
const insuranceService = new InsuranceService(prisma, emailQueue as never);
const videoSessionService = new VideoSessionService(prisma, emailQueue as never);
const orgService = new OrganisationService(prisma, emailQueue as never);
const taskService = new TaskService(prisma);
const smrService = new ScopeModificationService(prisma, emailQueue as never);
const orderService = new OrderService(prisma, emailQueue as never);
const scopingService = new ScopingService(prisma);
const paymentService = new PaymentService(prisma, emailQueue as never);
const credentialService = new CredentialService(prisma, emailQueue as never);
const ratingService = new RatingService(prisma, emailQueue as never);
const disputeService = new DisputeService(prisma, emailQueue as never);
const adminContractorService = new AdminContractorService(prisma, emailQueue as never);
const amlService = new AmlService(prisma);

export function buildApp() {
  const app = Fastify({ logger: true });

  // Security headers
  app.register(helmet);

  // CORS — allow only the web app origin
  app.register(cors, {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : ['http://localhost:3000'],
    credentials: true,
  });

  // Global rate limit: 100 req / 15 min
  app.register(rateLimit, { max: 100, timeWindow: '15 minutes' });

  // Health check
  app.get('/api/v1/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Auth routes — scoped with tighter rate limit: 20 req / 15 min
  app.register(
    async (scope) => {
      scope.addHook('onRoute', (routeOptions) => {
        routeOptions.config = {
          ...routeOptions.config,
          rateLimit: { max: 20, timeWindow: '15 minutes' },
        };
      });
      scope.register(authRoutes, { authService });
    },
    { prefix: '/api/v1' },
  );

  // Contractor routes
  app.register(contractorRoutes, { prefix: '/api/v1', contractorService });

  // Insurance routes
  app.register(insuranceRoutes, { prefix: '/api/v1', insuranceService });

  // Video KYC routes (M04)
  app.register(videoRoutes, { prefix: '/api/v1', videoSessionService });

  // Organisation routes (M05)
  app.register(organisationRoutes, { prefix: '/api/v1', orgService });

  // Task catalog + SMR routes (M06)
  app.register(taskRoutes, { prefix: '/api/v1', taskService, smrService });

  // Order lifecycle routes (M07)
  app.register(orderRoutes, { prefix: '/api/v1', orderService });

  // AI Scoping routes (M08)
  app.register(scopingRoutes, { prefix: '/api/v1', scopingService });

  // Payment, Connect & Webhook routes (M09)
  app.register(paymentRoutes, { prefix: '/api/v1', paymentService, prisma, emailQueue: emailQueue as never });

  // Credential Vault routes (M10)
  app.register(credentialRoutes, { prefix: '/api/v1', credentialService });

  // Ratings & Dispute Resolution routes (M11)
  app.register(ratingRoutes, { prefix: '/api/v1', ratingService });
  app.register(disputeRoutes, { prefix: '/api/v1', disputeService });

  // Admin & Compliance routes (M12)
  app.register(adminRoutes, {
    prefix: '/api/v1/admin',
    adminContractorService,
    amlService,
    insuranceService,
    prisma,
  });

  return app;
}
