import { getSession } from './auth';

export type Role = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'COMPANY_STAFF' | 'CUSTOMER';

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

export async function requireRole(allowed: Role[]) {
  const session = await getSession();
  if (!session?.user) throw new UnauthorizedError('Not authenticated');
  const role = (session.user as any).platformRole as Role;
  if (!allowed.includes(role)) throw new ForbiddenError('Insufficient permissions');
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
