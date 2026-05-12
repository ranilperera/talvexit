import 'dotenv/config';
import { buildApp } from './app.js';

// Catch unhandled rejections so the process doesn't silently die
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
});

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
