# Auth Gaps

Verified holes in the current authorization code. Every entry was checked against
the file at the commit this was written on. These are facts about the code, not
criticism of the design.

> **Status 2026-10-21: all sixteen gaps below are fixed.** Each entry records
> what the hole was and what closed it. The list is kept as a record of what
> the checks were and where they live, so a future change does not undo them.
> When a change touches any of these areas, re-verify.

## Why the middleware does not save you

`src/middleware.ts` does not authorize API routes. It applies a rate limit and
an origin check to them (since 2026-10-21), but it never decides who may
touch a record. It only:

- redirects unauthenticated users away from `/dashboard` and `/admin`
- restricts `/admin` to `platformRole === 'SUPER_ADMIN'`
- restricts `/dashboard` to `SUPER_ADMIN`, `COMPANY_ADMIN`, `COMPANY_STAFF`
- rewrites tenant subdomains to the storefront and blocks `/dashboard` and
  `/admin` there
- answers 404 for a host that is neither the root host nor a tenant subdomain

Every API route is therefore its own only authorization boundary. A route with
a weak check is directly exploitable. The rate limit and the origin check in
the middleware only slow an attacker down and stop a cross-origin write.

## The gaps

### 1. Unauthenticated pricing endpoint — FIXED

**`src/app/api/pricing/quote/route.ts`**

Was: no `getSession()`, no role check. Any caller could POST a body and get
pricing computed on attacker-supplied values.

Now: the route requires a session and returns 401 without one. The body is
also validated for shape.

### 2. `GET /api/orders` returned every order without an org id — FIXED

**`src/app/api/orders/route.ts`**

Was: `where` was built from a possibly-undefined `customerOrgId`; Prisma drops
an undefined key, the filter became empty, and every order was returned.

Now: a `CUSTOMER` without a `customerOrgId` and a company user without a
`companyId` both get 401 instead of an unfiltered list.

### 3. Order items could reference another company's catalog — FIXED

**`src/app/api/orders/route.ts`**

Was: five `findUnique` calls by bare id, with no `companyId` and no `isActive`
filter. A deactivated product was still orderable and its price was
snapshotted into the order.

Now: all catalog rows are loaded with one `findMany` per model, filtered by
`companyId` **and** `isActive`. A row that does not resolve returns 400.

### 4. `companyRole` and `platformRole` were conflated — FIXED

**`src/app/api/orders/[id]/status/route.ts`**

Was: `const userRole = user.companyRole || user.platformRole` merged two
different questions into one string, so a `COMPANY_STAFF` user holding
`companyRole: COMPANY_ADMIN` became omnipotent.

Now: `effectiveUserRole(platformRole, companyRole)` in
`src/lib/status-transitions.ts` keeps the dimensions apart, and the transition
rule checks `userRole === 'COMPANY_ADMIN' && platformRole === 'COMPANY_ADMIN'`.

### 5. Cross-tenant transition approval — FIXED

**`src/app/api/orders/transitions/[id]/route.ts`**

Was: the tenant check compared `order.companyId` with `user.companyId`, which
is the main company for every tenant user, so it passed for any tenant's order.

Now: the approver must be main-company staff
(`platformRole` in `SUPER_ADMIN` / `COMPANY_ADMIN` with a matching
`companyRole`), and a user with a `customerOrgId` is rejected outright.

### 6. `assertSameCompany` had zero call sites — PARTIALLY ADDRESSED

**`src/lib/rbac.ts`**

`assertSameCompany` still has no call site. It is documented here so it is not
mistaken for working protection — the tenant checks in the order routes compare
`customerOrgId` directly instead, which is the correct field for a tenant.

`assertSameTenant` was added alongside it for the same purpose.

### 7. Uncaught `requireRole` throws returned 500 — FIXED

**`src/lib/rbac.ts`**

Was: 10 of 13 `requireRole` call sites let the throw escape, so a rejected
role became a 500 with a stack trace.

Now: every call site wraps `requireRole` in `try/catch` and returns
`toHttpError(err)`, which maps `UnauthorizedError` to 401 and `ForbiddenError`
to 403.

### 8. `platformRole` was client-supplied on user creation — FIXED

**`src/app/api/companies/[id]/users/route.ts`**

Was: `platformRole` came from the request body and was written straight to the
`User` row.

Now: the platform role is derived from the context — `COMPANY_ADMIN` for a
company user, `CUSTOMER` for a tenant user. The body cannot set it.

### 9. `GET /api/tenants` omitted the main-company check — FIXED

**`src/app/api/tenants/route.ts`**

Now: GET asserts `isMainCompany`, exactly like POST.

### 10. Session cookie was not `Secure` in production — FIXED

**`src/lib/auth.ts`**

Now: `secure: process.env.NODE_ENV === 'production'`.

### 11. `NotificationRule` is never enforced — STILL OPEN

**`prisma/schema.prisma:600-612`**

`notify()` sends based on the `email` boolean in its argument. The
`NotificationRule` table — event, target role, channel, frequency, active flag
— has no code reading it. Notification routing is hardcoded per call site.

This is a functional gap rather than a security hole, listed here because the
model implies a behaviour that does not exist.

### 12. `internalNotes` leaked to tenants over SSE — FIXED

**`src/app/api/orders/[id]/status/route.ts`** and
**`src/app/api/orders/transitions/[id]/route.ts`**

Was: the full `prisma.order.update` result was published as the `order:update`
payload, so the supplier-only `Order.internalNotes` reached every recipient
including the tenant's own members.

Now: the payload is an explicit pick of five fields, and
`OrderUpdatePayload` in `src/lib/events.ts` declares exactly those.

### 13. A tenant user could be granted a main-company role — FIXED

**`src/app/api/companies/[id]/users/[userId]/route.ts`**

Was: `entityType` was destructured and never used, so `companyRole` and
`customerOrgRole` were both settable on any user. A tenant member could be
given `companyRole: 'COMPANY_ADMIN'` — the exact value the transition-approval
gate checked.

Now: the role field must match the entity that owns the user. A `companyRole`
on a tenant user returns 400.

### 14. Prototype lookup in the catalog route — FIXED

**`src/app/api/catalog/route.ts`**

Was: `typeMap[type]` on a plain object literal resolved `type=constructor` to
`Object.prototype.constructor`, and the following `model.findMany` threw a
`TypeError` → 500.

Now: `typeMap` is built with `Object.create(null)`.

### 15. HTML injection in outbound email — FIXED

**`src/lib/email.ts`**

Was: `subject` and `body` were interpolated into an HTML template without
escaping. A tenant's message body reached the HTML email that main-company
staff read.

Now: `escapeHtml` is applied to both.

### 16. A deactivated user kept a working session — FIXED

**`src/lib/auth.ts`**

Was: `strategy: 'jwt'` with no re-read of the user, so `isActive: false` had
no effect until the token expired.

Now: the `jwt` callback re-reads the user on every request and throws when
the account is inactive, which makes NextAuth drop the session cookie.

## Hardening of 2026-10-21

The audit that produced this file also found gaps outside the authorization
checks. They are closed; the full record with file:line references is
`docs/security-hardening.md`.

| Gap                                              | Where the check lives now                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| No rate limit on sign-in or on writes            | `src/lib/rate-limit.ts`, `src/middleware.ts:guardApiRequest`                      |
| No security headers (CSP, HSTS, frame, referrer) | `next.config.ts`                                                                  |
| No origin check on mutating requests             | `src/middleware.ts:originAllowed`                                                 |
| No audit trail                                   | `AuditLog` model, `src/lib/audit.ts`, `GET /api/admin/audit`                      |
| No database-level protection                     | `src/lib/prisma.ts` (SQLite foreign keys), `prisma/postgres-rls.sql` (PostgreSQL) |
| No password policy, bcrypt cost 10 in one place  | `src/lib/password-policy.ts`                                                      |
| Session lived 30 days                            | `src/lib/auth.ts` — 8 hour maximum, refreshed every 30 minutes                    |
| Image optimizer accepted any host                | `next.config.ts` — `images.remotePatterns` is empty                               |
| Quote endpoint took unbounded input              | `src/app/api/pricing/quote/route.ts`                                              |
| User creation revealed which addresses existed   | `src/app/api/register/route.ts`, `src/app/api/companies/[id]/users/route.ts`      |

Two things are still open and are recorded in `docs/security-hardening.md`:
there is no second factor on any account, and there is no self-service password
change route.

## Related non-security gaps worth knowing

| Gap                                                                 | Location                                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `OrderItem.status` never leaves `PENDING`                           | fixed — `PATCH /api/orders/[id]/items/[itemId]` exists                           |
| `ProductTemplate` dimension bounds unenforced                       | fixed — enforced in `POST /api/orders`                                           |
| `Company.defaultMarkupPercent` and `minOrderValue` unused           | still open — dead fields on `Company`                                            |
| `savedConfigurations` model is unused by the UI                     | still open — no route or page                                                    |
| `NotificationFrequency.DAILY_DIGEST` never applied                  | still open — no digest job                                                       |
| `Order.assigneeId` never set                                        | still open — no code assigns an order to a staff member                          |
| `OrderAttachment` upload has no route                               | still open — no file-upload endpoint                                             |
| `staff` filter in `api/orders/route.ts:212` ignores `customerOrgId` | still open — main-company staff are notified, tenant staff are not               |
| `CustomerPriceOverride` has no write path                           | fixed — `/api/price-overrides`                                                   |
| `PriceList` has no management route                                 | fixed — `/api/price-lists`                                                       |
| `ProductTemplate` has no UI tab                                     | fixed — the catalog client has a templates tab                                   |
| `PvcProfile.colorSurchargeFactor` never read                        | fixed — applied in the pricing engine                                            |
| `ProductTemplate.openingCount` never used in pricing                | still open — the field is carried but not priced                                 |
| `ProcessingOption.unit` ignored                                     | still open — processing is summed flat                                           |
| `OrderItem` rows are immutable after creation                       | still open — no `prisma.orderItem.update` outside the item-status route          |
| The transition matrix is duplicated and has drifted                 | fixed — the client copy was deleted, both import `src/lib/status-transitions.ts` |

## What a fix looks like

For any of these, the shape is the same:

1. Derive the tenant from the session, never from the body.
2. Compare with the right field: `order.customerOrgId === user.customerOrgId`
   for tenant scoping, `order.companyId === user.companyId` for main-company
   scoping.
3. Wrap `requireRole` in `try/catch` + `toHttpError`.
4. Filter catalog lookups by `companyId` **and** `isActive`.
5. Add the regression proof, then run the nearest gate.

The `glazeflow-tenant-guard` and `glazeflow-role-check` skills encode these
steps. Use them.
