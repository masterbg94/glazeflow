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
  const subdomain = hostOnly.replace(`.${ROOT_HOST}`, '').replace(ROOT_HOST, '');
  const isRoot =
    hostOnly === ROOT_HOST ||
    hostOnly === `www.${ROOT_HOST}` ||
    hostOnly === 'localhost' ||
    hostOnly === '127.0.0.1';
  const isTenantSubdomain = !isRoot && !!subdomain && subdomain !== ROOT_HOST;

  // Auth routes allowed everywhere (single login for root and tenants)
  if (path.startsWith('/login') || path.startsWith('/register') || path.startsWith('/(auth)')) {
    return NextResponse.next();
  }

  // API + static: never rewrite
  if (path.startsWith('/_next') || path.startsWith('/api')) {
    return NextResponse.next();
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
