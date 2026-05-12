// next.config.ts is not supported in Next.js 14 — use .mjs
// TypeScript config support was added in Next.js 15.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));

// In dev: Fastify runs on 3001, Next.js on 3000.
// This proxy mirrors what nginx does in production (/api/v1/* → API server),
// so email verification links (localhost:3000/api/v1/auth/verify-email/...) resolve correctly.
const API_URL = process.env.API_URL ?? 'http://localhost:3001';

// Conservative Content Security Policy. Goals:
//   - block <object>/<embed> entirely (object-src 'none')
//   - lock down where forms can post (form-action 'self')
//   - prevent the app being framed (clickjacking) (frame-ancestors 'none')
//   - allow Stripe Elements (js.stripe.com script + iframe) and Azure
//     Blob image hosts (img-src https:)
//   - allow LiveKit WebRTC: connect-src must include wss: for the
//     LiveKit signalling socket and the egress media servers
//
// 'unsafe-inline' on script-src and style-src is unfortunately necessary
// for Next.js 14 because the runtime emits inline <script> chunks for
// hydration without nonces. Migrating to a nonce-based CSP is a Next.js 15
// + nonce-aware middleware refactor — tracked as a follow-up rather than
// blocking on this commit.
//
// In development the API runs on http://localhost:3001 (different origin
// to the Next.js dev server on :3000) and the LiveKit dev server is on
// ws://localhost:7880. Both schemes are http/ws, not https/wss, so the
// production policy would block every dev API call. We therefore emit a
// dev-only relaxed connect-src and skip upgrade-insecure-requests / HSTS
// when NODE_ENV !== 'production'.
const isProd = process.env.NODE_ENV === 'production';

const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:" + (isProd ? '' : ' http://localhost:* http://127.0.0.1:*'),
  "font-src 'self' data:",
  isProd
    ? "connect-src 'self' https: wss:"
    : "connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];
if (isProd) cspDirectives.push('upgrade-insecure-requests');
const csp = cspDirectives.join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // Defence-in-depth headers that don't depend on CSP support.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
  // HSTS only meaningful over HTTPS; emitting it on http://localhost confuses
  // dev tools and persists in browsers across sessions.
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@onys/shared'],

  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },

  async headers() {
    return [
      {
        // Apply security headers to every page response.
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${API_URL}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
