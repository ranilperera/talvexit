import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Lazy-load the secret as a Uint8Array. The middleware module is loaded once
// per cold start; reusing the encoded key avoids re-allocating per request.
// JWT_ACCESS_SECRET must match the value the API signs tokens with.
const SECRET_RAW = process.env.JWT_ACCESS_SECRET;
const SECRET = SECRET_RAW ? new TextEncoder().encode(SECRET_RAW) : null;

if (!SECRET && process.env.NODE_ENV === 'production') {
  // Surface this loudly in container logs — without the secret, the
  // middleware can't verify JWTs and falls through to the legacy cookie
  // check, which is spoofable. Make sure ops sees it.
  console.error(
    '[middleware] JWT_ACCESS_SECRET is not set. JWT signature verification ' +
    'is DISABLED — middleware role checks become spoofable. Set JWT_ACCESS_SECRET ' +
    'on the web container to the same value as the API.',
  );
}

const PROTECTED_PREFIXES: Array<{
  prefix: string;
  roles: string[];
}> = [
  {
    prefix: '/customer',
    roles: ['CUSTOMER', 'PLATFORM_ADMIN'],
  },
  {
    prefix: '/contractor',
    roles: ['INDIVIDUAL_CONTRACTOR', 'ORGANISATION_ADMIN', 'ORG_MEMBER', 'PLATFORM_ADMIN'],
  },
  {
    prefix: '/company',
    roles: ['COMPANY_ADMIN', 'COMPANY_MEMBER', 'PLATFORM_ADMIN'],
  },
  {
    prefix: '/admin',
    roles: ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'],
  },
];

const ROLE_HOME: Record<string, string> = {
  CUSTOMER:               '/customer/dashboard',
  INDIVIDUAL_CONTRACTOR:  '/contractor/dashboard',
  ORGANISATION_ADMIN:     '/contractor/dashboard',
  ORG_MEMBER:             '/contractor/dashboard',
  COMPANY_ADMIN:          '/company/dashboard',
  COMPANY_MEMBER:         '/company/dashboard',
  PLATFORM_ADMIN:         '/admin/dashboard',
  SUPPORT_ADMIN:          '/admin/dashboard',
  COMPLIANCE_ADMIN:       '/admin/dashboard',
};

// Public pages under otherwise-protected prefixes
const PUBLIC_PATHS = [
  '/company/join',
  '/admin/login',
  '/admin/change-password',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow explicitly public paths without any auth check
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const match = PROTECTED_PREFIXES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'),
  );

  // Not a protected route — allow through
  if (!match) return NextResponse.next();

  const token = request.cookies.get('onys_token')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', encodeURIComponent(pathname + request.nextUrl.search));
    return NextResponse.redirect(loginUrl);
  }

  // Verify the JWT signature and read account_type from the *verified*
  // payload — never trust the unsigned `onys_account_type` cookie that the
  // browser can edit. If verification fails (expired, tampered, wrong
  // secret), redirect to login so the user can re-authenticate.
  let accountType: string | undefined;
  if (SECRET) {
    try {
      const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] });
      const at = payload['account_type'];
      if (typeof at === 'string') accountType = at;
    } catch {
      // Token invalid — clear cookies and bounce to login.
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', encodeURIComponent(pathname + request.nextUrl.search));
      const res = NextResponse.redirect(loginUrl);
      res.cookies.delete('onys_token');
      res.cookies.delete('onys_account_type');
      return res;
    }
  } else {
    // Fallback for dev environments where JWT_ACCESS_SECRET isn't wired up.
    // The cookie value is spoofable, but we already logged a startup warning
    // and the API will still reject unauthorised requests by signature.
    accountType = request.cookies.get('onys_account_type')?.value;
  }

  if (accountType && !match.roles.includes(accountType)) {
    // Redirect to their correct area instead of generic /unauthorized
    const home = ROLE_HOME[accountType];
    if (home) {
      return NextResponse.redirect(new URL(home, request.url));
    }
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/customer/:path*',
    '/contractor/:path*',
    '/company/:path*',
    '/admin/:path*',
  ],
};
