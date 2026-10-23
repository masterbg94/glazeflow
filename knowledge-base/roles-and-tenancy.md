# Roles and Tenancy

## The business in one paragraph

One main company (a producer of glass, PVC profiles, windows, doors, and
hardware) owns the platform and the entire catalog. Small companies register as
tenants and order from the main company. Each tenant gets its own subdomain, its
own price list, and its own set of employees. The main company's staff see every
incoming order in a pipeline and advance it through production.

## Tenant model

```
Company (exactly one, isMainCompany = true)   ← the main company
├── Users            main company staff
├── Catalog          GlassType, PvcProfile, HardwareItem, ProductTemplate, ProcessingOption
├── PriceList[]      "Bronzni prodavac" −8%, "Zlatni prodavac" −15%
├── CustomerOrg[]    THE TENANTS
│   ├── slug                → subdomain (tenant1.localhost:3000)
│   ├── priceListId         → tier discount applied to the subtotal
│   ├── CustomerPriceOverride[]  → per-item price for this tenant
│   └── Users               platformRole = CUSTOMER
└── Order[]           companyId = main, customerOrgId = tenant
```

Invariants:

- Exactly one `Company` row has `isMainCompany = true`. Creating a tenant never
  creates a `Company` row — `POST /api/companies` is hard-blocked with 403
  (`src/app/api/companies/route.ts:35`).
- Every `CustomerOrg.companyId` points at the main company.
- `CustomerOrg.slug` is unique and matches `^[a-z0-9-]+$`
  (`src/app/api/tenants/route.ts:60`).
- A tenant user's `companyId` points at the **main** company, and their
  `customerOrgId` points at their tenant. Both are set in the seed.

## Subdomain routing

`src/middleware.ts` decides the host:

| Host                                  | Behaviour                                                          |
| ------------------------------------- | ------------------------------------------------------------------ |
| `localhost:3000`, `www.<root>`        | Main company routes: `/dashboard`, `/admin`, `/login`              |
| `<slug>.<root>`                       | Rewritten to `/<slug>/...` (tenant storefront)                     |
| `<slug>.<root>/dashboard` or `/admin` | Redirected to root `/login` — tenants never see main-company areas |

The rewrite is blind (`src/middleware.ts:39-42`); the slug is validated in
`src/app/(storefront)/[companySlug]/layout.tsx:16` via `getTenantBySlug`, which
calls `notFound()` for a missing slug or one whose company is not the main
company.

Middleware does not query Prisma — it only rewrites. All real authorization
happens in server components and route handlers.

## Role dimensions

| Field             | Enum                                                           | Question it answers                               |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| `platformRole`    | `SUPER_ADMIN` · `COMPANY_ADMIN` · `COMPANY_STAFF` · `CUSTOMER` | What level of access does the app grant?          |
| `companyRole`     | `COMPANY_ADMIN` · `COMPANY_SALES` · `COMPANY_PRODUCTION`       | What is the person's job inside the main company? |
| `customerOrgRole` | `TENANT_ADMIN` · `TENANT_MANAGER`                              | What may the person do inside their tenant?       |

All three live on `User` (`prisma/schema.prisma:141-169`). `companyRole` and
`customerOrgRole` are both optional.

## Permission matrix

### Platform level

| Actor           | `/admin` | `/dashboard`                              | All orders      | Create tenant | Manage users | Edit catalog |
| --------------- | -------- | ----------------------------------------- | --------------- | ------------- | ------------ | ------------ |
| `SUPER_ADMIN`   | yes      | no (`companyId` null → redirect `/admin`) | yes             | yes           | yes          | yes          |
| `COMPANY_ADMIN` | no       | yes                                       | own company     | yes           | no           | yes          |
| `COMPANY_STAFF` | no       | yes                                       | own company     | no            | no           | read only    |
| `CUSTOMER`      | no       | no                                        | own tenant only | no            | no           | no           |

`SUPER_ADMIN` has no `companyId` by design. Any `(company)/dashboard` page that
needs one must handle the null case — see `src/app/(company)/dashboard/page.tsx:9`,
which redirects to `/admin`.

### Company role (inside the main company)

| `companyRole`        | Forward status | Backward status | Cancel  | Catalog      | Approvals         |
| -------------------- | -------------- | --------------- | ------- | ------------ | ----------------- |
| `COMPANY_ADMIN`      | yes            | yes             | yes     | read + write | —                 |
| `COMPANY_PRODUCTION` | yes            | request         | request | read         | receives requests |
| `COMPANY_SALES`      | yes            | request         | request | read         | receives requests |

`COMPANY_SALES` and `COMPANY_PRODUCTION` are currently identical in the
transition rules (`src/lib/status-transitions.ts:121-149`). There is **no**
`PRODUCTION_WORKER` value in the schema — the "worker" role in
`docs/BUSINESS_LOGIC_FIX.md` is not implemented.

### Tenant role (inside a tenant)

| `customerOrgRole` | Order | Track own orders | Messages | `/finance` | Catalog prices  |
| ----------------- | ----- | ---------------- | -------- | ---------- | --------------- |
| `TENANT_ADMIN`    | yes   | yes              | yes      | yes        | own prices only |
| `TENANT_MANAGER`  | yes   | yes              | yes      | no         | own prices only |

`TENANT_MANAGER` is **not** view-only in the current code. `customerOrgRole` is
consulted in exactly one authorization decision: the finance page
(`src/app/(storefront)/[companySlug]/finance/page.tsx:20`). Everywhere else the
two tenant roles have identical power.

## What is not implemented

### Per-tenant catalog assignment

There is no way to say "tenant Beta may order the REHAU Total70 profile but not
VEKA". The storefront catalog comes from `getTenantCatalog`
(`src/lib/tenant.ts:44-137`), which returns **every active** catalog item of the
main company, filtered only by the global `isActive` flag.

`CustomerPriceOverride` (`prisma/schema.prisma:332-354`) changes price, never
visibility. It has nullable `glassTypeId` / `profileId` / `hardwareId` /
`templateId` columns and `overrideSellPrice` / `discountPercent` values.

Implementing assignment needs a join table (for example `CustomerOrgProduct`
with `customerOrgId`, item id, item kind), a filter in `getTenantCatalog`, a
server-side check in `POST /api/orders` that rejects unassigned items, and an
admin UI to manage it. Until that exists, do not describe the feature as present.

### Password changes and a second factor

There is no route where a user changes their own password — an administrator
creates the account and the password (`POST /api/register`,
`POST /api/companies/[id]/users`). Both routes enforce the policy in
`src/lib/password-policy.ts` (12–72 characters, mixed case, digit, symbol) and
hash with bcrypt cost 12.

There is no second factor on any account.

### Per-tenant ordering limits

`SavedConfiguration` (`prisma/schema.prisma:559-586`) is per-tenant reusable
configurations, but there are no quantity caps, spend caps, or approval
thresholds for tenants.

## Where authorization actually happens

| Layer                                             | What it does                                                                   | Trust level                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------- |
| `src/middleware.ts`                               | Blocks `/dashboard` and `/admin` by `platformRole`; rewrites tenant subdomains | Navigation only — not a security boundary |
| `requireRole([...])` in `src/lib/rbac.ts:8`       | Server-side role gate for API routes                                           | Real                                      |
| `assertSameCompany(a, b)` in `src/lib/rbac.ts:16` | Cross-tenant assertion                                                         | **Never called — see `auth-gaps.md` #6**  |
| Page-level `redirect()` / `notFound()`            | Server Component guards                                                        | Real                                      |
| Client-side role checks, hidden buttons           | UX only                                                                        | Not a boundary                            |

`requireRole` throws `UnauthorizedError` (401) or `ForbiddenError` (403). Only
`src/app/api/tenants/route.ts` and `src/app/api/register/route.ts` catch those
and map them with `toHttpError`. Everywhere else the throw is uncaught and
becomes a 500 — see `auth-gaps.md` #7.

## The role-confusion trap — FIXED

The code used to compute:

```ts
const userRole = user.companyRole || user.platformRole;
```

and `src/lib/status-transitions.ts` treated `userRole === 'COMPANY_ADMIN'` as
omnipotent. Because `companyRole` was checked first, a user with
`platformRole: COMPANY_STAFF` and `companyRole: COMPANY_ADMIN` got admin powers
and skipped the approval chain.

Now `effectiveUserRole(platformRole, companyRole)` in
`src/lib/status-transitions.ts` resolves the role, and the transition rule
checks `userRole === 'COMPANY_ADMIN' && platformRole === 'COMPANY_ADMIN'`. The
two dimensions are never merged into one string. The Kanban client imports the
same functions, so the UI and the server agree.

`src/lib/rbac.ts` also gained `requireCompanyRole` and
`requireCustomerOrgRole` for gates that need a job role rather than an access
level.
