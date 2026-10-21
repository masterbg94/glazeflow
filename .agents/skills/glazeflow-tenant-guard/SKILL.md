---
name: glazeflow-tenant-guard
description: Guard tenant isolation in GlazeFlow. Use when changing catalog visibility, tenant pricing, order creation, order reads, tenant administration, subdomain routing, or any code that touches companyId / customerOrgId / slug. Also use when a change could let one tenant see or order another tenant's data or prices.
---

# Tenant guard

GlazeFlow has one main company and many tenants. Tenants are `CustomerOrg` rows
under the main company — never `Company` rows. A change that leaks across that
boundary is the worst possible defect in this codebase.

## The two ids

| Id | Owner | Correct scope comparison |
| --- | --- | --- |
| `companyId` | The main company | `order.companyId === user.companyId` for main-company scoping |
| `customerOrgId` | The tenant | `order.customerOrgId === user.customerOrgId` for tenant scoping |

A tenant user has **both**. `user.companyId` points at the main company, and
`order.companyId` also points at the main company. So a check written as
`order.companyId !== user.companyId` passes for **every tenant's order** when the
user is a tenant. This is the single most common way to break tenant isolation
here. See `knowledge-base/auth-gaps.md` #5.

## Before writing a query

Ask: whose data is this, and which id proves it?

```ts
// WRONG — passes for every tenant's order
if (order.companyId !== user.companyId) return 403;

// RIGHT — tenant scope
if (order.customerOrgId !== user.customerOrgId) return 403;

// RIGHT — main-company scope
if (order.companyId !== user.companyId) return 403;
```

`assertSameCompany(sessionCompanyId, resourceCompanyId)` exists at
`src/lib/rbac.ts:16` for the main-company case. It has zero call sites today —
using it is an improvement, not a dependency.

## Never trust the request body

The order-creation path gets it right and is the reference implementation:

```ts
// src/app/api/orders/route.ts:43-57
const customerOrg = await prisma.customerOrg.findUnique({
  where: { id: user.customerOrgId },
  include: { priceList: true },
});
const company = await prisma.company.findUnique({
  where: { id: customerOrg.companyId },
});
const companyId = company.id;
```

A `companyId`, `customerOrgId`, `slug`, or `priceListId` in a request body is
attacker-controlled. Derive it from the session, or look it up through a row
the session already proves ownership of.

## Never build a `where` with a possibly-undefined value

```ts
// WRONG — undefined drops the key, findMany returns EVERYTHING
where: { customerOrgId: user.customerOrgId }

// RIGHT
where: user.customerOrgId ? { customerOrgId: user.customerOrgId } : { id: '__none__' }
```

`knowledge-base/auth-gaps.md` #2 is exactly this bug, live in `GET /api/orders`.

## Scope every catalog lookup

Catalog rows are looked up by bare id in `POST /api/orders`
(`src/app/api/orders/route.ts:88-126`). That is wrong. A lookup must be scoped
to the company and to active items:

```ts
const profile = await prisma.pvcProfile.findFirst({
  where: { id: item.profileId, companyId, isActive: true },
});
```

Without `companyId` a tenant can order another company's product. Without
`isActive` a tenant can order a product the main company retired.

## Tenant creation

`POST /api/tenants` (`src/app/api/tenants/route.ts`):

- Creates a `PriceList` and a `CustomerOrg`. Never a `Company`.
- Validates the slug against `^[a-z0-9-]+$` and rejects duplicates.
- Asserts the target company has `isMainCompany = true`.
- `POST /api/companies` is hard-blocked with 403. Do not re-enable it.

The slug becomes a subdomain. Lowercase letters, digits, dashes only — it is
interpolated into a host.

## Subdomain routing

`src/middleware.ts` rewrites `<slug>.<root>` to `/<slug>/...` blindly. The slug
is validated in `src/app/(storefront)/[companySlug]/layout.tsx` via
`getTenantBySlug`, which calls `notFound()` for a missing slug or a slug whose
company is not the main company.

Middleware does not query Prisma. Never add a database lookup to the middleware
— it runs on the edge. Validate the tenant in the layout or the page.

`/dashboard` and `/admin` are blocked on tenant subdomains by a redirect to the
root login. That is a UX boundary, not a security one — the pages themselves
must also check the session.

## The catalog assignment feature does not exist

There is no per-tenant product assignment. `getTenantCatalog` returns every
active main-company catalog item to every tenant; `CustomerPriceOverride`
changes price only, never visibility.

If a task asks for "assign this product to tenant Beta", that is **new feature
work**: a join table, a `getTenantCatalog` filter, a server-side check in
`POST /api/orders`, and an admin UI. Say so rather than assuming a half-built
mechanism exists.

## Checklist before finishing

- [ ] Every Prisma read and write is scoped by `companyId` or `customerOrgId`,
      and the scope id came from the session.
- [ ] No `where` clause can contain `undefined`.
- [ ] Every catalog lookup filters `companyId` and `isActive`.
- [ ] The comparison for tenant data is `customerOrgId`, not `companyId`.
- [ ] Cost prices are not in any tenant-facing payload.
- [ ] A tenant hitting a main-company route gets a redirect or 403, not data.

## Verify

```bash
npm run build
```

Then check by hand: log in as a tenant user, call the changed endpoint, and
confirm the response contains only that tenant's data. Cross-tenant proof needs
two tenants — the seed has one (`bob`), so create a second via
`POST /api/tenants` before testing isolation.
