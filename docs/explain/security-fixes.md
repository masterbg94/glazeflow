# Verdict

**Write path: locked.** No outsider can write/delete/change any record. Verified all 25 route files in `src/app/api/**` (24 gated + NextAuth handler).

**Whole app: NOT secure yet.** Write path clean; perimeter soft.

## What is already correct (verified, not assumed)

- **Every route gates on session.** 24/24 have `requireRole` or `getSessionUser`. `src/app/api/auth/[...nextauth]` is public by design.
- **Writes are admin-only:** catalog, price-lists, price-overrides, tenants → `SUPER_ADMIN`/`COMPANY_ADMIN` + main-company check + field whitelist ([catalog/route.ts:112-192](src/app/api/catalog/route.ts:112)). `companies`, user list, tenant delete → `SUPER_ADMIN` only.
- **Tenant writes scoped by `customerOrgId`:** order create ([orders/route.ts:48-94](src/app/api/orders/route.ts:48)), status, item accept, messages ([messages/route.ts:84-94](src/app/api/orders/[id]/messages/route.ts:84)).
- **Order prices recomputed server-side** from DB; client body never trusted for price, `companyId`, or catalog rows — catalog filtered by `companyId` + `isActive` ([orders/route.ts:127-165](src/app/api/orders/route.ts:127)).
- **No open registration** — `/api/register` needs admin, `platformRole` derived, not from body.
- **No mass assignment** — `pickFields` whitelist; `platformRole` never from request body.
- **No stray writes** — Prisma writes exist only under `src/app/api/**` plus `src/lib/notifications.ts`. Zero in server components.
- **Deactivated user = dead session** (JWT re-reads user every request, [auth.ts:84-102](src/lib/auth.ts:84)).
- **Cookie:** httpOnly, sameSite lax, `secure` in prod ([auth.ts:22-33](src/lib/auth.ts:22)).
- **Middleware blocks `/dashboard` + `/admin` on tenant subdomains**; `/api` deliberately not in middleware — each route is its own boundary (documented in [auth-gaps.md](knowledge-base/auth-gaps.md)).
- `internalNotes` not in SSE payload, not in tenant pages.

## Open risks, ranked

**P0 — fix before any public exposure**

1. **No rate limit on login.** [auth.ts:41-52](src/lib/auth.ts:41) calls `bcrypt.compare` unlimited times. Brute force + credential stuffing open. Seed password is `Password123!` for every account — change before exposing.
2. **No security headers.** [next.config.ts](next.config.ts) has none: no CSP, no HSTS, no `X-Frame-Options`, no `Referrer-Policy`. `/dashboard` is clickjackable.
3. **No CSRF/Origin check on mutating routes.** Grep for `origin`/`csrf` = zero hits in `src/`. In prod cookie is `Domain=.rootdomain` ([auth.ts:12-15](src/lib/auth.ts:12)) → cookie sent to *every* tenant subdomain. `SameSite=Lax` blocks cross-site POST, but a sibling tenant subdomain is same-site, so JS on a tenant-controlled page can drive main-company session writes. Reads stay blocked by SOP; writes do not.

**P1 — needed for your "nobody can change any record" requirement**

4. **No audit log.** Nothing records who changed an order, price, user, or tenant. Change is unprovable. Add `AuditLog` model + write in every mutating route.
5. **No DB-level protection.** SQLite today, app-level checks only. On Postgres prod ([docs/postgres-migration.md](docs/postgres-migration.md)) there is no RLS, no DB roles, no constraints — direct DB access = full write. SQLite does not enforce FKs, so orphan rows already possible.
6. **Weak password policy.** `/api/register` + user creation accept any string, no min length; bcrypt cost 10 there vs 12 in [companies/[id]/users/route.ts:91](src/app/api/companies/[id]/users/route.ts:91).
7. **Session lifetime.** JWT default 30 days, no idle timeout, no 2FA, no rotation.

**P2 — smaller**

8. `images.remotePatterns` hostname `**` proxies any https host → narrow it.
9. `/api/pricing/quote` session-only, no limit → free compute.
10. Email enumeration via "Email already registered".

## Verification limits

Static read of all routes, middleware, auth/rbac, and every DB-reading page. No runtime penetration test, no dependency audit, no DB-level check.

**Bottom line:** records safe from outsiders today, by app logic only. Harden P0 (and add P1 audit log + Postgres RLS plan) before real tenants touch it.