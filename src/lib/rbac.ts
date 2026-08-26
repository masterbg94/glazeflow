import { getSession } from "./auth";

export type Role = "SUPER_ADMIN" | "COMPANY_ADMIN" | "COMPANY_STAFF" | "CUSTOMER";

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

export async function requireRole(allowed: Role[]) {
  const session = await getSession();
  if (!session?.user) throw new UnauthorizedError("Not authenticated");
  const role = (session.user as any).platformRole as Role;
  if (!allowed.includes(role)) throw new ForbiddenError("Insufficient permissions");
  return session;
}

export function assertSameCompany(sessionCompanyId: string | null | undefined, resourceCompanyId: string) {
  if (!sessionCompanyId || sessionCompanyId !== resourceCompanyId) {
    throw new ForbiddenError("Cross-tenant access denied");
  }
}
