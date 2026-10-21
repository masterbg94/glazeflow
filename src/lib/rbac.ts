import type { CompanyRole, CustomerOrgRole, PlatformRole } from '@prisma/client';
import { getSession } from './auth';

export type Role = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'COMPANY_STAFF' | 'CUSTOMER';

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

/** The authenticated user with every custom claim resolved. */
export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  platformRole: PlatformRole;
  companyRole: CompanyRole | null;
  companyId: string | null;
  companySlug: string | null;
  customerOrgId: string | null;
  customerOrgSlug: string | null;
  customerOrgRole: CustomerOrgRole | null;
}

export async function requireRole(allowed: Role[]) {
  const session = await getSession();
  if (!session?.user) throw new UnauthorizedError('Not authenticated');
  const role = session.user.platformRole as Role;
  if (!allowed.includes(role)) throw new ForbiddenError('Insufficient permissions');
  return session;
}

/**
 * The authenticated user with every custom claim resolved, or null when there
 * is no session. Replaces the `session.user as any` pattern.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session?.user) return null;
  const user = session.user;
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    platformRole: user.platformRole,
    companyRole: user.companyRole,
    companyId: user.companyId,
    companySlug: user.companySlug,
    customerOrgId: user.customerOrgId,
    customerOrgSlug: user.customerOrgSlug,
    customerOrgRole: user.customerOrgRole,
  };
}

/**
 * Gate on the job role inside the main company. Kept separate from
 * `requireRole` on purpose: `platformRole` answers "what level of access does
 * the app grant", `companyRole` answers "what is the person's job". Merging
 * them into one string is what produced the role-conflation bug in
 * `api/orders/[id]/status/route.ts`.
 */
export async function requireCompanyRole(allowed: CompanyRole[]) {
  const session = await getSession();
  if (!session?.user) throw new UnauthorizedError('Not authenticated');
  const role = session.user.companyRole;
  if (!role || !allowed.includes(role)) {
    throw new ForbiddenError('Insufficient company role');
  }
  return session;
}

/** Gate on the role inside the tenant. */
export async function requireCustomerOrgRole(allowed: CustomerOrgRole[]) {
  const session = await getSession();
  if (!session?.user) throw new UnauthorizedError('Not authenticated');
  const role = session.user.customerOrgRole;
  if (!role || !allowed.includes(role)) {
    throw new ForbiddenError('Insufficient customer org role');
  }
  return session;
}

export function assertSameCompany(
  sessionCompanyId: string | null | undefined,
  resourceCompanyId: string
) {
  if (!sessionCompanyId || sessionCompanyId !== resourceCompanyId) {
    throw new ForbiddenError('Cross-tenant access denied');
  }
}

/**
 * Scope a resource to the tenant of the caller. A tenant user's `companyId`
 * points at the main company, so comparing `companyId` never isolates a
 * tenant — the only correct comparison is `customerOrgId`.
 */
export function assertSameTenant(
  sessionCustomerOrgId: string | null | undefined,
  resourceCustomerOrgId: string | null | undefined
) {
  if (!sessionCustomerOrgId || sessionCustomerOrgId !== resourceCustomerOrgId) {
    throw new ForbiddenError('Cross-tenant access denied');
  }
}

/** Map auth errors to HTTP responses in route handlers. */
export function toHttpError(err: unknown): Response {
  if (err instanceof UnauthorizedError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  throw err;
}

/**
 * Run `fn` with the session, mapping an auth rejection to 401/403 instead of
 * letting the throw escape as a 500. Every route that gates on a role should
 * use this rather than calling `requireRole` directly.
 */
export async function withSession<T>(
  fn: (session: Awaited<ReturnType<typeof getSession>>) => Promise<T>
): Promise<T | Response> {
  try {
    return await fn(await getSession());
  } catch (err) {
    return toHttpError(err);
  }
}
