# Auth Gaps

Verified holes in the current authorization code. Every entry was checked against
the file at the commit this was written on. These are facts about the code, not
criticism of the design.

When a change touches any of these areas, re-verify — a fix may have landed
since this file was written.

## Why the middleware does not save you

`src/middleware.ts:28` returns `NextResponse.next()` for every path starting
with `/api`. The middleware never guards API routes. It only:

- redirects unauthenticated users away from `/dashboard` and `/admin`
- restricts `/admin` to `platformRole === 'SUPER_ADMIN'`
- restricts `/dashboard` to `SUPER_ADMIN`, `COMPANY_ADMIN`, `COMPANY_STAFF`
- rewrites tenant subdomains to the storefront and blocks `/dashboard` and
  `/admin` there

Every API route is therefore its own only auth boundary. A route with a weak
check is directly exploitable.

## The gaps

### 1. Unauthenticated pricing endpoint

**`src/app/api/pricing/quote/route.ts:4-13`**

No `getSession()`, no role check. Any caller can POST a body and get pricing
computed. It runs `calcItemPricing(body.item)` on attacker-supplied values.

Impact: information disclosure of the pricing formula's behaviour, and free
compute. It does not persist anything and does not read the database, so it
cannot leak catalog data — but it is a public endpoint that should be
authenticated or removed.

### 2. `GET /api/orders` returns every order when the session lacks an org id

**`src/app/api/orders/route.ts:11-16`**

```ts
const where =
  user.platformRole === 'CUSTOMER'
    ? { customerOrgId: user.customerOrgId }
    : ...
const orders = await prisma.order.findMany({ where, ... });
```

A `CUSTOMER` whose `customerOrgId` is null yields `{ customerOrgId: undefined }`.
Prisma drops an `undefined` key, so the filter becomes empty and `findMany`
returns **all orders in the database**, with items and the customer org
included. The same applies to a company user with no `companyId`.

The POST path guards this correctly at `src/app/api/orders/route.ts:33-38`. The
GET path does not.

### 3. Order items can reference another company's catalog

**`src/app/api/orders/route.ts:88-126`**

Every catalog lookup in the order-creation path is by bare id:

```ts
await prisma.pvcProfile.findUnique({ where: { id: item.profileId } });
await prisma.glassType.findUnique({ where: { id: pane.glassTypeId } });
await prisma.hardwareItem.findUnique({ where: { id: h.hardwareId } });
await prisma.processingOption.findUnique({ where: { id: pid } });
await prisma.productTemplate.findUnique({ where: { id: item.templateId } });
```

No `companyId` filter, no `isActive` filter. A tenant can order a product that
belongs to a different company, and can order a product the main company has
deactivated. The prices used come from that other row, and they are snapshotted
into the order.

### 4. `companyRole` and `platformRole` are conflated

**`src/app/api/orders/[id]/status/route.ts:13`**
**`src/app/(company)/dashboard/orders/page.tsx:32`**

```ts
const userRole = user.companyRole || user.platformRole;
```

`src/lib/status-transitions.ts:74-80` then treats `userRole === 'COMPANY_ADMIN'`
as omnipotent. Because `companyRole` is checked first, a user with
`platformRole: COMPANY_STAFF` and `companyRole: COMPANY_ADMIN` is treated as a
full administrator and skips the approval chain for backward moves and
cancellations.

The two enums answer different questions — see `roles-explanation.md`. Merging
them into one string is the defect.

### 5. Cross-tenant transition approval

**`src/app/api/orders/transitions/[id]/route.ts:13-18` and `:34`**

The gate:

```ts
if (
  !['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(user.platformRole) &&
  user.companyRole !== 'COMPANY_ADMIN'
)
  return 403;
```

The tenant check:

```ts
if (transition.order.companyId !== user.companyId && user.platformRole !== 'SUPER_ADMIN') {
  return 403;
}
```

A tenant user's `companyId` is the **main** company, and `order.companyId` is
also the main company. So the check passes for any tenant's order. The gate
lets through a tenant user holding `companyRole: 'COMPANY_ADMIN'` — which
`PATCH /api/companies/[id]/users/[userId]` allows to be set
(`src/app/api/companies/[id]/users/[userId]/route.ts:63`).

Result: a tenant member can approve status transitions on other tenants'
orders.

The correct comparison for a tenant is `order.customerOrgId === user.customerOrgId`.

### 6. `assertSameCompany` has zero call sites

**`src/lib/rbac.ts:16`**

The helper exists and is documented in the instructions, but nothing calls it.
Tenant isolation is done by hand in each handler, which is why gaps 2, 3, and 5
exist.

### 7. Uncaught `requireRole` throws return 500, not 401/403

There are 14 `requireRole` call sites. Only two wrap it:

- `src/app/api/tenants/route.ts:11,49`
- `src/app/api/register/route.ts:11`

The other 12 let `UnauthorizedError` / `ForbiddenError` escape the handler.
Next.js turns that into a 500 with a stack trace, and the client gets an
internal error instead of a 401 or a 403.

Affected: `api/catalog`, `api/companies` (×3), `api/companies/[id]`,
`api/companies/[id]/users` (×2), `api/companies/[id]/users/[userId]` (×2),
`api/admin/stats`, `api/admin/companies/[id]/stats`.

### 8. `platformRole` is client-supplied on user creation

**`src/app/api/companies/[id]/users/route.ts:59`**

```ts
const {
  email,
  name,
  password,
  companyRole,
  customerOrgRole,
  platformRole = 'COMPANY_ADMIN',
} = body;
```

The body value is written straight to the `User` row
(`src/app/api/companies/[id]/users/route.ts:86`). A `SUPER_ADMIN` can mint
another `SUPER_ADMIN` — or a `CUSTOMER` with a `companyRole`, which is the
setup gap 5 needs.

The route is SUPER_ADMIN-gated, so this is an admin-driven escalation surface
rather than an open one, but the field should be derived from the context
(main company vs tenant), never from the request.

### 9. `GET /api/tenants` omits the main-company check

**`src/app/api/tenants/route.ts:11`**

POST asserts `company.isMainCompany` at line 82 and returns 403 for a
non-main company. GET has no such assertion, so a `COMPANY_ADMIN` of a
non-main company receives that company's tenant list. Low impact today, since
only the main company has tenants, but the asymmetry is a bug.

### 10. The session cookie is not `Secure` in production

**`src/lib/auth.ts:27`**

```ts
secure: false,
```

Hardcoded. The cookie also sets a `Domain` attribute outside localhost
(`src/lib/auth.ts:12-15`) so the session is shared across tenant subdomains in
production — correct, but it means the cookie is sent over plaintext HTTP as
well as HTTPS.

### 11. `NotificationRule` is never enforced

**`prisma/schema.prisma:600-612`**

`notify()` in `src/lib/notifications.ts` sends based on the `email` boolean in
its argument. The `NotificationRule` table — event, target role, channel,
frequency, active flag — has no code reading it. Notification routing is
hardcoded per call site.

This is a functional gap rather than a security hole, listed here because the
model implies a behaviour that does not exist.

## Related non-security gaps worth knowing

| Gap                                                                        | Location                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `OrderItem.status` never leaves `PENDING`                                  | no write path sets `ACCEPTED` / `REJECTED`                  |
| `ProductTemplate` dimension bounds unenforced                              | `src/lib/tenant.ts:125-128` ships them; nothing checks them |
| `Company.defaultMarkupPercent` and `minOrderValue` unused                  | schema only                                                 |
| `savedConfigurations` model is unused by the UI                            | no page or route references it                              |
| `NotificationFrequency.DAILY_DIGEST` never applied                         | no digest job exists                                        |
| `Order.assigneeId` never set                                               | no code assigns an order to a staff member                  |
| `OrderAttachment` upload has no route                                      | no file-upload endpoint exists                              |
| `staff` filter in `api/orders/route.ts:212` ignores `customerOrgId`        | main-company staff are notified; tenant staff are not       |
| `savedConfigurations` and `assigneeId` appear in the schema but have no UI | confirmed by grep across `src/`                             |

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
