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
| `api/tenants/route.ts`                       | GET       | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])` + `isMainCompany` check | Lists `CustomerOrg` for the main company, with order and member counts                                                                   |
| `api/tenants/route.ts`                       | POST      | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])` + `isMainCompany` check | Creates a `PriceList` and a `CustomerOrg` (tenant) in one transaction. Validates the slug format and uniqueness                          |
| `api/tenants/[id]/route.ts`                  | PATCH     | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])` + company match         | Updates a tenant, including the **price-list assignment**                                                                                |
| `api/tenants/[id]/route.ts`                  | DELETE    | `requireRole(['SUPER_ADMIN'])`                                         | Deletes a tenant. Refuses when it has orders or members                                                                                  |
| `api/price-lists/route.ts`                   | GET, POST | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])`                         | Lists and creates the B2B discount tiers                                                                                                 |
| `api/price-lists/route.ts`                   | PATCH     | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])`                         | Renames a tier or changes its discount                                                                                                   |
| `api/price-lists/route.ts`                   | DELETE    | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])`                         | Deletes a tier. Refuses when a tenant points at it (409)                                                                                 |
| `api/price-overrides/route.ts`               | GET, POST | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])` + tenant match          | Lists and creates the per-tenant price overrides                                                                                         |
| `api/price-overrides/route.ts`               | PATCH     | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])`                         | Changes an override's price or discount                                                                                                  |
| `api/price-overrides/route.ts`               | DELETE    | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])`                         | Deletes an override                                                                                                                      |
| `api/companies/route.ts`                     | GET       | `requireRole(['SUPER_ADMIN'])`                                         | Lists `Company` rows with user and order counts                                                                                          |
| `api/companies/route.ts`                     | POST      | **hard 403**                                                           | Blocked — "Creating companies is not allowed"                                                                                            |
| `api/companies/[id]/route.ts`                | GET       | `requireRole(['SUPER_ADMIN'])`                                         | One company by id                                                                                                                        |
| `api/companies/[id]/users/route.ts`          | GET       | `requireRole(['SUPER_ADMIN'])`                                         | Users by `companyId` **or** `customerOrgId`                                                                                              |
| `api/companies/[id]/users/route.ts`          | POST      | `requireRole(['SUPER_ADMIN'])`                                         | Creates a user. `platformRole` is derived from the context, never the body                                                               |
| `api/companies/[id]/users/[userId]/route.ts` | DELETE    | `requireRole(['SUPER_ADMIN'])`                                         | Deletes a user                                                                                                                           |
| `api/companies/[id]/users/[userId]/route.ts` | PATCH     | `requireRole(['SUPER_ADMIN'])`                                         | Updates name, phone, `companyRole`, `customerOrgRole`, `isActive`. The role field must match the owning entity                           |
| `api/register/route.ts`                      | POST      | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])`                         | Creates a tenant user. Validates `customerOrgRole` is `TENANT_ADMIN` or `TENANT_MANAGER`; asserts the org belongs to the admin's company |
| `api/admin/stats/route.ts`                   | GET       | `requireRole(['SUPER_ADMIN'])`                                         | Platform-wide counts, order breakdown by status, role distribution, recent activity                                                      |
| `api/admin/companies/[id]/stats/route.ts`    | GET       | `requireRole(['SUPER_ADMIN'])`                                         | Per-company **or** per-tenant stats, including the monthly revenue trend                                                                 |

Note: `/register` requires an existing admin, so the public registration UI at
`src/app/(auth)/register/page.tsx:5` shows "Registracija zatvorena" and no form.
Users are created by admins.

## Catalog

| Route                  | Methods | Auth                                                                             | Does                                                                                                     |
| ---------------------- | ------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `api/catalog/route.ts` | GET     | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN','COMPANY_STAFF'])` + `isMainCompany` | Lists the main company's glass, profiles, hardware, templates, processing. Filters by `companyId`        |
| `api/catalog/route.ts` | POST    | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])` + `isMainCompany`                 | Creates one catalog item. Only whitelisted fields reach the database                                     |
| `api/catalog/route.ts` | PATCH   | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])` + `isMainCompany`                 | Edits one catalog item                                                                                   |
| `api/catalog/route.ts` | DELETE  | `requireRole(['SUPER_ADMIN','COMPANY_ADMIN'])` + `isMainCompany`                 | **Soft**-deletes: sets `isActive: false`. A hard delete would break the foreign key from existing orders |

`COMPANY_STAFF` can read the catalog but not write it. The UI does not hide the
"Dodaj stavku" button for staff — the API rejects with 403.

## Orders

| Route                                     | Methods   | Auth                                                                   | Does                                                                                                                                 |
| ----------------------------------------- | --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `api/orders/route.ts`                     | GET       | `getSession()` only                                                    | Lists orders scoped by role. A missing `customerOrgId` or `companyId` returns 401 rather than an unfiltered list                     |
| `api/orders/route.ts`                     | POST      | `platformRole === 'CUSTOMER'`                                          | Creates an order. Validates the body, derives `companyId` from the session's tenant, prices server-side, notifies main-company staff |
| `api/orders/[id]/status/route.ts`         | PATCH     | `getSession()` + `getTransitionRule`                                   | Changes status, or creates a pending transition request when approval is required. Rejects an unknown status with 400                |
| `api/orders/transitions/route.ts`         | GET       | `getSession()` + main-company staff check                              | Lists the pending transition requests — the data source for the approval queue                                                       |
| `api/orders/transitions/[id]/route.ts`    | PATCH     | `getSession()` + main-company admin check                              | Approves or rejects a pending transition, inside a `$transaction`                                                                    |
| `api/orders/[id]/items/[itemId]/route.ts` | PATCH     | `getSession()` + order ownership check                                 | Sets the per-line status to `ACCEPTED` / `REJECTED` / `PENDING`                                                                      |
| `api/orders/[id]/payment/route.ts`        | PATCH     | `getSession()` + `['SUPER_ADMIN','COMPANY_ADMIN']` + `companyId` match | Sets `paymentStatus`. Called from the company order detail page                                                                      |
| `api/orders/[id]/messages/route.ts`       | GET, POST | `getSession()` + `canAccessOrder()`                                    | Reads or writes order messages                                                                                                       |
| `api/pricing/quote/route.ts`              | POST      | `getSession()`                                                         | A live quote preview. The authoritative calculation happens in `POST /api/orders`                                                    |

There is still **no** route for attachments, saved configurations, or staff
assignment, and `NotificationRule` / `NotificationPreference` are still not
read. See `docs/business-logic-review.md` § 4.7.

`GET /api/orders` scoping:

```ts
platformRole === 'CUSTOMER'  → { customerOrgId: user.customerOrgId }  // 401 if absent
platformRole === 'SUPER_ADMIN' → {}            // all orders
otherwise                    → { companyId: user.companyId }          // 401 if absent
```

The `undefined`-in-`where` hazard is fixed; see `auth-gaps.md` #2.

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
