import bcrypt from 'bcryptjs';
import { getServerSession, NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './prisma';

// On localhost dev (including tenant subdomains like bob.localhost) the cookie
// must be host-only: Chromium rejects Set-Cookie with Domain=.localhost for
// subdomains of the public-suffix "localhost", so a Domain cookie would never be
// stored and the session would be dropped on every subdomain. A Domain attribute
// is only set in real deployments (NEXTAUTH_URL with a public host), so the
// session is shared across company subdomains in production.
const isLocalhost = (process.env.NEXTAUTH_URL || 'http://localhost:3000').includes('localhost');
const sessionCookieDomain = isLocalhost
  ? undefined
  : `.${(process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000').split(':')[0]}`;

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
  },
  pages: { signIn: '/login' },
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        ...(sessionCookieDomain ? { domain: sessionCookieDomain } : {}),
      },
    },
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: {
            company: { select: { slug: true } },
            customerOrg: { select: { id: true, slug: true } },
          },
        });
        if (!user || !user.passwordHash || !user.isActive) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          platformRole: user.platformRole,
          companyRole: user.companyRole,
          companyId: user.companyId,
          companySlug: user.company?.slug ?? null,
          customerOrgId: user.customerOrgId,
          customerOrgSlug: user.customerOrg?.slug ?? null,
          customerOrgRole: user.customerOrgRole,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.platformRole = user.platformRole;
        token.companyRole = user.companyRole;
        token.companyId = user.companyId;
        token.companySlug = user.companySlug;
        token.customerOrgId = user.customerOrgId;
        token.customerOrgSlug = user.customerOrgSlug;
        token.customerOrgRole = user.customerOrgRole;
        token.uid = user.id;
        return token;
      }
      // The JWT strategy serves the session from the token, so a role change or
      // a deactivation would otherwise stay invisible until the token expires.
      // Re-reading the user on every request is one indexed primary-key lookup.
      const current = await prisma.user.findUnique({
        where: { id: token.uid },
        select: {
          isActive: true,
          platformRole: true,
          companyRole: true,
          companyId: true,
          customerOrgId: true,
          customerOrgRole: true,
          company: { select: { slug: true } },
          customerOrg: { select: { slug: true } },
        },
      });
      // Throwing here makes NextAuth drop the session cookie and answer the
      // session request with an empty body, so `getSession()` returns null.
      // That is the only reliable way to invalidate a JWT session in v4.
      if (!current || !current.isActive) {
        throw new Error('Session invalidated');
      }
      token.platformRole = current.platformRole;
      token.companyRole = current.companyRole;
      token.companyId = current.companyId;
      token.companySlug = current.company?.slug ?? null;
      token.customerOrgId = current.customerOrgId;
      token.customerOrgSlug = current.customerOrg?.slug ?? null;
      token.customerOrgRole = current.customerOrgRole;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid;
        session.user.platformRole = token.platformRole;
        session.user.companyRole = token.companyRole;
        session.user.companyId = token.companyId;
        session.user.companySlug = token.companySlug;
        session.user.customerOrgId = token.customerOrgId;
        session.user.customerOrgSlug = token.customerOrgSlug;
        session.user.customerOrgRole = token.customerOrgRole;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export const getSession = () => getServerSession(authOptions);
