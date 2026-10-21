import type { CompanyRole, CustomerOrgRole, PlatformRole } from '@prisma/client';
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      platformRole: PlatformRole;
      companyRole: CompanyRole | null;
      companyId: string | null;
      companySlug: string | null;
      customerOrgId: string | null;
      customerOrgSlug: string | null;
      customerOrgRole: CustomerOrgRole | null;
    } & DefaultSession['user'];
  }

  interface User {
    platformRole: PlatformRole;
    companyRole: CompanyRole | null;
    companyId: string | null;
    companySlug: string | null;
    customerOrgId: string | null;
    customerOrgSlug: string | null;
    customerOrgRole: CustomerOrgRole | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid: string;
    platformRole: PlatformRole;
    companyRole: CompanyRole | null;
    companyId: string | null;
    companySlug: string | null;
    customerOrgId: string | null;
    customerOrgSlug: string | null;
    customerOrgRole: CustomerOrgRole | null;
  }
}

export {};
