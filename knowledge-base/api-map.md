# API Map

Every route handler in `src/app/api/`. Auth column names the gate as written in
code — read the file before trusting this table, and read `auth-gaps.md` for the
holes.

> **The middleware does not guard any of these routes.**
> `src/middleware.ts:28-30` returns `NextResponse.next()` for every path that
> starts with `/api` or `/_next`. The middleware is a navigation helper for the
> tenant-subdomain rewrite and the `/dashboard` / `/admin` redirect — it is
> **not** an authorization layer.
>
> Consequence: the Auth column below is the **only** boundary for each route.
> A route with no `requireRole` and no manual session check is genuinely open,
> which is exactly the case of `api/pricing/quote` (see `auth-gaps.md` #1).

## Platform and tenancy

| Route                                        | Methods   | Auth                                                                   | Does                                                                                                                                     |
| -------------------------------------------- | --------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `api/auth/[...nextauth]/route.ts`            | GET, POST | NextAuth credentials                                                   | Verifies email + bcrypt hash, issues JWT                                                                                                 |
| `api/tenants/route.ts`                       | GET       | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])`                         | Lists `CustomerOrg` for the main company, with order and member counts                                                                   |
| `api/tenants/route.ts`                       | POST      | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])` + `isMainCompany` check | Creates a `PriceList` and a `CustomerOrg` (tenant). Validates the slug format and uniqueness                                             |
| `api/companies/route.ts`                     | GET       | `requireRole(['SUPER_ADMIN'])`                                         | Lists `Company` rows with user and order counts                                                                                          |
| `api/companies/route.ts`                     | POST      | **hard 403**                                                           | Blocked — "Creating companies is not allowed"                                                                                            |
| `api/companies/[id]/route.ts`                | GET       | `requireRole(['SUPER_ADMIN'])`                                         | One company by id                                                                                                                        |
| `api/companies/[id]/users/route.ts`          | GET       | `requireRole(['SUPER_ADMIN'])`                                         | Users by `companyId` **or** `customerOrgId`                                                                                              |
| `api/companies/[id]/users/route.ts`          | POST      | `requireRole(['SUPER_ADMIN'])`                                         | Creates a user. `platformRole` comes from the request body — see `auth-gaps.md` #8                                                       |
| `api/companies/[id]/users/[userId]/route.ts` | DELETE    | `requireRole(['SUPER_ADMIN'])`                                         | Deletes a user                                                                                                                           |
| `api/companies/[id]/users/[userId]/route.ts` | PATCH     | `requireRole(['SUPER_ADMIN'])`                                         | Updates name, phone, `companyRole`, `customerOrgRole`, `isActive`                                                                        |
| `api/register/route.ts`                      | POST      | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])`                         | Creates a tenant user. Validates `customerOrgRole` is `TENANT_ADMIN` or `TENANT_MANAGER`; asserts the org belongs to the admin's company |
| `api/admin/stats/route.ts`                   | GET       | `requireRole(['SUPER_ADMIN'])`                                         | Platform-wide counts, order breakdown by status, role distribution, recent activity                                                      |
| `api/admin/companies/[id]/stats/route.ts`    | GET       | `requireRole(['SUPER_ADMIN'])`                                         | Per-company **or** per-tenant stats, including revenue via raw SQL                                                                       |

Note: `/register` requires an existing admin, so the public registration UI at
`src/app/(auth)/register/page.tsx:5` shows "Registracija zatvorena" and no form.
Users are created by admins.

## Catalog

| Route                  | Methods | Auth                                                                             | Does                                                                                              |
| ---------------------- | ------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `api/catalog/route.ts` | GET     | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN','COMPANY_STAFF'])` + `isMainCompany` | Lists the main company's glass, profiles, hardware, templates, processing. Filters by `companyId` |
| `api/catalog/route.ts` | POST    | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])` + `isMainCompany`                 | Creates one catalog item                                                                          |

`COMPANY_STAFF` can read the catalog but not write it. The UI does not hide the
"Dodaj stavku" button for staff — the API rejects with 403.

## Orders

| Route                                  | Methods   | Auth                                                                   | Does                                                                                                             |
| -------------------------------------- | --------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `api/orders/route.ts`                  | GET       | `getSession()` only                                                    | Lists orders scoped by role                                                                                      |
| `api/orders/route.ts`                  | POST      | `platformRole === 'CUSTOMER'`                                          | Creates an order. Derives `companyId` from the session's tenant, prices server-side, notifies main-company staff |
| `api/orders/[id]/status/route.ts`      | PATCH     | `getSession()` + manual role list + `getTransitionRule`                | Changes status, or creates a pending transition request when approval is required                                |
| `api/orders/transitions/[id]/route.ts` | PATCH     | `getSession()` + `platformRole` or `companyRole` check                 | Approves or rejects a pending transition, inside a `$transaction`                                                |
| `api/orders/[id]/payment/route.ts`     | PATCH     | `getSession()` + `['SUPER_ADMIN','COMPANY_ADMIN']` + `companyId` match | Sets `paymentStatus`                                                                                             |
| `api/orders/[id]/messages/route.ts`    | GET, POST | `getSession()` + `canAccessOrder()`                                    | Reads or writes order messages                                                                                   |
| `api/pricing/quote/route.ts`           | POST      | **none**                                                               | Runs the pricing engine on a client-supplied body — see `auth-gaps.md` #1                                        |

`GET /api/orders` scoping (`src/app/api/orders/route.ts:11-16`):

```ts
platformRole === 'CUSTOMER'  → { customerOrgId: user.customerOrgId }
platformRole === 'SUPER_ADMIN' → {}            // all orders
otherwise                    → { companyId: user.companyId }
```

The `undefined`-in-`where` hazard is documented in `auth-gaps.md` #2.

## Notifications and real-time

| Route                                  | Methods | Auth                                              | Does                                                                |
| -------------------------------------- | ------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| `api/notifications/route.ts`           | GET     | `getSession()`                                    | The user's own notifications                                        |
| `api/notifications/route.ts`           | PATCH   | `getSession()`                                    | Marks notifications read                                            |
| `api/notifications/[id]/read/route.ts` | POST    | `getSession()` + `notification.userId === userId` | Marks one read                                                      |
| `api/notifications/read-all/route.ts`  | POST    | `getSession()`                                    | Marks all the user's read                                           |
| `api/notifications/stream/route.ts`    | GET     | `getSession()`                                    | SSE connection, registered per `userId` in the in-memory client map |

## Conventions to follow when adding a route

Established by the existing handlers:

1. `getSession()` first, then `session.user as any` to reach the custom claims.
2. `requireRole([...])` for the role gate; wrap it in `try/catch` and call
   `toHttpError(err)` — this is what `/api/tenants` (×2) and `/api/register` do
   and what the other 10 call sites fail to do.
3. Derive `companyId` and `customerOrgId` from the session. Never trust the
   request body.
4. Validate and normalize the body before touching Prisma.
5. Scope every Prisma read and write.
6. Update the database first, then publish the real-time event.
7. Return explicit HTTP errors with a JSON `{ error }` body.

The `requireRole` + `toHttpError` pattern, correctly applied:

```ts
let session;
try {
  session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
} catch (err) {
  return toHttpError(err);
}
```
