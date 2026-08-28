import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = req.headers.get('host') || '';
  const path = url.pathname;

  const cleanHost = hostname.replace(`.${ROOT}`, '').replace(ROOT, '').split(':')[0];
  const rootHost = ROOT.split(':')[0];
  const isRoot = hostname === ROOT || hostname === `www.${ROOT}` || hostname === `localhost:${url.port}` || hostname === `127.0.0.1:${url.port}`;

  // Allow auth routes without subdomain rewriting
  if (path.startsWith('/login') || path.startsWith('/register') || path.startsWith('/(auth)')) {
    if (isRoot) return NextResponse.next();
    // For non-root hosts, still allow auth routes
    return NextResponse.next();
  }

  if (
    !isRoot &&
    cleanHost &&
    cleanHost !== rootHost &&
    !path.startsWith('/_next') &&
    !path.startsWith('/api') &&
    !path.startsWith('/login') &&
    !path.startsWith('/register') &&
    !path.startsWith(`/${cleanHost}`)
  ) {
    return NextResponse.rewrite(new URL(`/${cleanHost}${path}`, req.url));
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