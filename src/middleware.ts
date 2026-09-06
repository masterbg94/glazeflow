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
  const cleanHost = hostOnly.replace(`.${ROOT_HOST}`, '').replace(ROOT_HOST, '');
  const isRoot =
    hostOnly === ROOT_HOST ||
    hostOnly === `www.${ROOT_HOST}` ||
    hostOnly === 'localhost' ||
    hostOnly === '127.0.0.1';

  // Allow auth routes without subdomain rewriting
  if (path.startsWith('/login') || path.startsWith('/register') || path.startsWith('/(auth)')) {
    if (isRoot) return NextResponse.next();
    return NextResponse.next();
  }

  if (
    !isRoot &&
    cleanHost &&
    cleanHost !== ROOT_HOST &&
    !path.startsWith('/_next') &&
    !path.startsWith('/api') &&
    !path.startsWith('/login') &&
    !path.startsWith('/register') &&
    !path.startsWith('/dashboard') &&
    !path.startsWith('/admin') &&
    !path.startsWith(`/${cleanHost}`)
  ) {
    const rewritePath = path === '/' ? `/${cleanHost}` : `/${cleanHost}${path}`;
    return NextResponse.rewrite(new URL(rewritePath, req.url));
  }

  if (path.startsWith('/dashboard') || path.startsWith('/admin')) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.redirect(new URL('/login', req.url));
    if (path.startsWith('/admin') && token.platformRole !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    if (
      path.startsWith('/dashboard') &&
      !['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_STAFF', 'CUSTOMER'].includes(
        token.platformRole as string
      )
    ) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)'],
};
