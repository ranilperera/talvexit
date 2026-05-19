import 'dotenv/config';
import { buildApp } from './app.js';
import { assertFrontendUrlConfigured } from './utils/urls.js';

// Catch unhandled rejections so the process doesn't silently die
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
});

// Fail-fast on a bad FRONTEND_URL. We send links built from this var in
// verification / reset / order emails; getting it wrong silently ships
// users broken or wrong-origin links. Validate at boot so the operator
// sees the error in the container start log, not in a user support ticket.
try {
  assertFrontendUrlConfigured();
} catch (err) {
  console.error('[FATAL] FRONTEND_URL misconfiguration:', (err as Error).message);
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST ?? '0.0.0.0';

const app = buildApp();

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`API server running on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
