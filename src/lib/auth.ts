import bcrypt from 'bcryptjs';
import { getServerSession, NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './prisma';

// On localhost dev (including subdomains like acme.localhost) the cookie must be
// host-only: Chromium rejects Set-Cookie with Domain=.localhost for subdomains of
// the public-suffix "localhost", so a Domain cookie would never be stored and the
// session would be dropped on every subdomain. A Domain attribute is only set in
// real deployments (NEXTAUTH_URL with a public host), so the session is shared
// across company subdomains in production.
const isLocalhost = (process.env.NEXTAUTH_URL || 'http://localhost:3000').includes('localhost');
const sessionCookieDomain = isLocalhost ? undefined : `.${(process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000').split(':')[0]}`;

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
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
          include: { company: true, customerOrg: true },
        });
        if (!user || !user.passwordHash || !user.isActive) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          platformRole: user.platformRole,
          companyId: user.companyId,
          companySlug: user.company?.slug ?? null,
          customerOrgId: user.customerOrgId,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.platformRole = (user as any).platformRole;
        token.companyId = (user as any).companyId;
        token.companySlug = (user as any).companySlug;
        token.customerOrgId = (user as any).customerOrgId;
        token.uid = (user as any).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.uid;
        (session.user as any).platformRole = token.platformRole;
        (session.user as any).companyId = token.companyId;
        (session.user as any).companySlug = token.companySlug;
        (session.user as any).customerOrgId = token.customerOrgId;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export const getSession = () => getServerSession(authOptions);
