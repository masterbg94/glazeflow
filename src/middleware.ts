import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
const ROOT_HOST = ROOT.split(':')[0];

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

  // API + static: never rewrite
  if (path.startsWith('/_next') || path.startsWith('/api')) {
    return NextResponse.next();
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
