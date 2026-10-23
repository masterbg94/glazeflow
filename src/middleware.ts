import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
const ROOT_HOST = ROOT.split(':')[0];

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Requests per window, per client address, per route group. */
const LIMITS: Record<'auth' | 'quote' | 'write', { limit: number; windowMs: number }> = {
  /** Every credential attempt, successful or not. */
  auth: { limit: 60, windowMs: 5 * 60 * 1000 },
  /** The live quote preview — pure compute, no reason to call it often. */
  quote: { limit: 60, windowMs: 60 * 1000 },
  /**
   * Every other state-changing API call. The limit is per client address, so
   * it has to leave room for an office behind one NAT address.
   */
  write: { limit: 300, windowMs: 60 * 1000 },
};

/**
 * A cross-origin state change is rejected.
 *
 * The session cookie is sent to every subdomain of the root domain in
 * production, so a page on a tenant subdomain would otherwise be able to
 * drive the main company's session. `SameSite=Lax` blocks a cross-site POST,
 * but a sibling subdomain is same-site. Requiring the `Origin` header to match
 * the host the request was sent to closes that path.
 *
 * A missing `Origin` means the caller is not a browser (curl, a service, a
 * mobile app), and such a caller cannot be tricked into sending a forged
 * origin, so the request is allowed through.
 */
function originAllowed(req: NextRequest, path: string): boolean {
  // NextAuth protects its own callback routes with a CSRF token.
  if (path.startsWith('/api/auth')) return true;

  const origin = req.headers.get('origin');
  if (!origin) return true;

  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return originHost === (req.headers.get('host') || '');
}

/** Rate limit and origin check for the API surface. Returns a response to send, or null. */
function guardApiRequest(req: NextRequest, path: string): NextResponse | null {
  const ip = getClientIp(req.headers);
  const isMutating = MUTATING_METHODS.has(req.method);

  if (isMutating && !originAllowed(req, path)) {
    return NextResponse.json(
      { error: 'Cross-origin request rejected' },
      { status: 403, headers: { Vary: 'Origin' } }
    );
  }

  if (!isMutating) return null;

  let bucket: keyof typeof LIMITS = 'write';
  let limit = LIMITS.write;
  if (path.startsWith('/api/auth')) {
    bucket = 'auth';
    limit = LIMITS.auth;
  } else if (path.startsWith('/api/pricing/quote')) {
    bucket = 'quote';
    limit = LIMITS.quote;
  }

  const result = rateLimit(`api:${bucket}:${ip}`, limit.limit, limit.windowMs);
  if (!result.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(result.retryAfterSeconds) },
      }
    );
  }
  return null;
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = req.headers.get('host') || '';
  const path = url.pathname;

  const hostOnly = hostname.split(':')[0];
  const isRoot =
    hostOnly === ROOT_HOST ||
    hostOnly === `www.${ROOT_HOST}` ||
    hostOnly === 'localhost' ||
    hostOnly === '127.0.0.1';
  // A suffix check, not a substring replace. `replace` treated any host
  // containing the root host as a tenant subdomain.
  const isTenantSubdomain =
    !isRoot && hostOnly.endsWith(`.${ROOT_HOST}`) && hostOnly.length > ROOT_HOST.length + 1;
  const subdomain = isTenantSubdomain ? hostOnly.slice(0, -(ROOT_HOST.length + 1)) : '';

  // API + static: never rewrite. The API is guarded by the routes themselves,
  // plus the rate limit and origin check applied here.
  if (path.startsWith('/_next')) {
    return NextResponse.next();
  }
  if (path.startsWith('/api')) {
    return guardApiRequest(req, path) ?? NextResponse.next();
  }

  // Auth routes allowed everywhere (single login for root and tenants)
  if (path.startsWith('/login') || path.startsWith('/register') || path.startsWith('/(auth)')) {
    return NextResponse.next();
  }

  // An unknown host is not a tenant of this platform. The old substring
  // replace sent it to the storefront, which then 404'd on the slug. Answering
  // 404 here keeps the routing decision in one place.
  const isKnownHost = isRoot || isTenantSubdomain;
  if (!isKnownHost) {
    return new NextResponse('Not Found', { status: 404 });
  }

  if (isTenantSubdomain) {
    // Main-company areas are forbidden on tenant subdomains
    if (path.startsWith('/dashboard') || path.startsWith('/admin')) {
      const loginUrl = new URL('/login', `http://${ROOT}`);
      return NextResponse.redirect(loginUrl);
    }
    // Rewrite tenant subdomain to tenant storefront: /foo -> /<tenantSlug>/foo
    if (!path.startsWith(`/${subdomain}`)) {
      const rewritePath = path === '/' ? `/${subdomain}` : `/${subdomain}${path}`;
      return NextResponse.rewrite(new URL(rewritePath, req.url));
    }
  }

  if (path.startsWith('/dashboard') || path.startsWith('/admin')) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.redirect(new URL('/login', req.url));
    if (path.startsWith('/admin') && token.platformRole !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    if (
      path.startsWith('/dashboard') &&
      !['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_STAFF'].includes(token.platformRole as string)
    ) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)'],
};
