# GlazeFlow Business Logic Fix — One Supplier, Many Tenants

## Confirmed Business Model

- Exactly **ONE main company** (supplier/producer), e.g. `www.dubing.rs`.
  Only it owns catalog and prices.
- **Tenants** = small companies created by main company admin or superadmin.
  Each tenant gets subdomain: `tenant1.dubing.rs`.
  Tenants are `CustomerOrg` records under main company — NOT separate `Company` rows.
- Tenant can only ORDER. Zero influence on catalog/prices.
- No third parties. Flow only: many small firms → one big firm.

## Roles

### Main company (www.dubing.rs)
| Role | platformRole | companyRole | Powers |
|---|---|---|---|
| Superadmin (developer) | `SUPER_ADMIN` | — | Full access incl. logs, all companies, debugging |
| Admin | `COMPANY_ADMIN` | `COMPANY_ADMIN` | Everything incl. catalog/price lists/tenants |
| Manager | `COMPANY_STAFF` | `COMPANY_PRODUCTION` | Orders, statuses (backward needs admin approval), no catalog prices |
| Worker | `COMPANY_STAFF` | `PRODUCTION_WORKER` | Only order status forward |

### Tenant (tenant1.dubing.rs)
| Role | platformRole | customerOrgRole (new) | Powers |
|---|---|---|---|
| Tenant admin | `CUSTOMER` | `TENANT_ADMIN` | Order, track orders, see own prices, see totals + payable (orders in DELIVERED = due) |
| Tenant manager | `CUSTOMER` | `TENANT_MANAGER` | Order, track orders. No finance view |

Tenant NEVER edits catalog, prices, or anything on main company.

---

## Current Code vs Required

| # | Problem | File(s) |
|---|---|---|
| 1 | Admin panel creates new `Company` rows as "tenants" | `src/app/api/companies/route.ts`, `CreateCompanyForm.tsx` |
| 2 | Tenants need subdomain: `CustomerOrg` has no `slug` | `prisma/schema.prisma` |
| 3 | Middleware rewrites subdomains by main-company slug only; no tenant subdomain support | `src/middleware.ts` |
| 4 | Catalog CRUD allowed for any `isProducer` company — must be exactly one main company | `src/app/api/catalog/route.ts` |
| 5 | Storefront `[companySlug]` resolves Company (supplier). Must resolve tenant by CustomerOrg slug, serve main catalog with tenant pricing | `src/app/(storefront)/[companySlug]/*`, `src/lib/tenant.ts` |
| 6 | No tenant roles (TENANT_ADMIN/TENANT_MANAGER) | `prisma/schema.prisma` `CompanyRole` enum |
| 7 | No payment tracking: tenant admin needs "orders done = payable" | `Order` model needs `paymentStatus` |
| 8 | Tenant sees cost prices? Must see ONLY own sell prices (priceList/override applied), never costPrice | storefront serialization, `/api/orders` |
| 9 | Approval chain: tenant cannot change order status backward; only main company staff does. Tenants mostly read-only status + cancel own NEW order (optional) | `src/lib/status-transitions.ts` |
| 10 | `isProducer` flag per-company is wrong concept. Replace with single MAIN company invariant | `prisma/schema.prisma`, seed |

---

## Target Data Model

```
Company (exactly 1, isMainCompany=true)
├── Users: SUPER_ADMIN(null companyId? -> set companyId to main), COMPANY_ADMIN, manager, worker
├── Catalog: GlassType/PvcProfile/HardwareItem/ProductTemplate/ProcessingOption  (single source)
├── PriceList[]  (per-tenant price tier: discountPercent or markup)
├── CustomerOrg[] (TENANTS)
│   ├── slug (unique, for subdomain)  ← NEW
│   ├── priceListId (assigned at creation: tax % / margin %)
│   ├── CustomerPriceOverride[] (per-item custom price for this tenant)
│   └── Users (platformRole=CUSTOMER, customerOrgRole=TENANT_ADMIN|TENANT_MANAGER)
└── Order[] (companyId = main, customerOrgId = tenant, paymentStatus NEW)
```

Key invariant: **exactly one** `Company` row. Tenants never get `Company` rows.
Catalog rows all carry main `companyId`. Tenant pricing = base sell price
adjusted by tenant `PriceList.discountPercent` and `CustomerPriceOverride`.

---

## Schema Changes (`prisma/schema.prisma`)

```prisma
model Company {
  // replace isProducer with:
  isMainCompany Boolean @default(false)
  // ...rest unchanged
}

model CustomerOrg {
  // add:
  slug          String  @unique   // subdomain: tenant1.dubing.rs
  // priceListId already exists
}

enum CustomerOrgRole {
  TENANT_ADMIN
  TENANT_MANAGER
}

model User {
  // add:
  customerOrgRole CustomerOrgRole?
}

model Order {
  // add:
  paymentStatus PaymentStatus @default(UNPAID)
}

enum PaymentStatus {
  UNPAID
  INVOICED
  PAID
}
```

`CompanyRole`: keep `COMPANY_ADMIN`, `PRODUCTION_WORKER`, `COMPANY_PRODUCTION`
(manager). `COMPANY_SALES` unused — keep for compat or drop later.

---

## Middleware (`src/middleware.ts`)

- Root host (`www.dubing.rs`, `localhost:3000`): dashboard/admin/login as today.
- Subdomain `X.dubing.rs`:
  1. Look up `CustomerOrg.slug === X`.
  2. Rewrite to `/tenant/[slug]/...` storefront routes.
  3. Not found → 404 or redirect to root.
- `/dashboard`, `/admin` on subdomain → redirect to root-domain login (tenants must not see main dashboard).

Note: middleware cannot query Prisma in edge runtime by default —
resolve slug via cached map, KV, or move check into layout server component
(rewrite to `/tenant/${subdomain}` blindly, validate in page with `notFound()`).
Simplest: rewrite blindly, validate in `(storefront)/[tenantSlug]/layout.tsx`.

## Route Restructure

- `(storefront)/[companySlug]` → rename conceptually to `[tenantSlug]`;
  resolve `CustomerOrg` by slug, then load its main `Company` catalog.
- Tenant portal pages: order wizard, my-orders, order detail, plus new
  **tenant admin page** (finance: totals, unpaid sum where status=DELIVERED/CLOSED and paymentStatus≠PAID).
- Main dashboard stays `(company)/dashboard`. Catalog page guard:
  `isMainCompany` AND role in (SUPER_ADMIN, COMPANY_ADMIN).

## API Changes

### `/api/companies` (admin panel)
- POST must NO LONGER create `Company`. Rework to create `CustomerOrg` +
  slug + priceList + initial TENANT_ADMIN user. Keep SUPER_ADMIN-only guard.
- Actually better: new endpoint `/api/tenants` (CustomerOrg CRUD).
  `/api/companies` read-only for the single main company settings.

### `/api/catalog`
- Guard: session user's company must be `isMainCompany`, and role
  SUPER_ADMIN or COMPANY_ADMIN. Workers/managers read-only or no access.

### `/api/orders` POST
- Already restricts to CUSTOMER — keep.
- Force `companyId` = tenant's main company (derive from `customerOrg.companyId`,
  never trust client-sent companyId).
- Pricing must use tenant priceList + overrides ONLY; never expose costPrice.

### Status transitions (`src/lib/status-transitions.ts`)
- Main company: worker forward-only; manager forward free, backward/cancel
  needs COMPANY_ADMIN approval; admin/superadmin free. (Current code ≈ this, OK.)
- Tenant (platformRole CUSTOMER): NO status changes on main pipeline.
  Optionally allow cancelling own `NEW` order. All other transitions forbidden.
- Approvers lookup bug: when requester is CUSTOMER, approvers = main company
  users where `companyId = order.companyId` — current code uses
  `user.companyId` which for tenant user may be null/wrong. Fix.

## Session (`src/lib/auth.ts`)

Add `customerOrgSlug` + `customerOrgRole` to JWT/session for tenant users so
middleware/pages don't refetch.

## Seed (`prisma/seed.ts`)

- One Company `dubing` (isMainCompany=true), slug `dubing`.
- Users: superadmin (you), admin, manager, worker — all on dubing.
- Tenants: `CustomerOrg` rows with slugs `tenant1`, `tenant2`, each with own
  PriceList (e.g. discountPercent 0 / 10) + TENANT_ADMIN + TENANT_MANAGER users.
- Catalog rows only under dubing companyId.

## Tenant Finance (admin portal)

- List orders of own customerOrg.
- Show order total (their price), status.
- "Za plaćanje" = Σ totals where status ∈ {DELIVERED, CLOSED} && paymentStatus ≠ PAID.
- "Zarada" = tenant's own resale margin is out of scope for v1 (tenant resells
  offline); show purchase totals only unless tenant wants to log own sell price.

## Migration Plan (reversible, stepwise)

1. Schema: add `isMainCompany`, `CustomerOrg.slug`, `CustomerOrgRole`,
   `User.customerOrgRole`, `Order.paymentStatus`. `db:push`. (Additive, safe.)
2. Seed: create main company as `isMainCompany`, convert demo tenant to
   CustomerOrg with slug. Keep old rows until verified.
3. API: new `/api/tenants`, freeze `/api/companies` POST. Fix order POST
   company derivation. Fix approval approver lookup.
4. Storefront: switch `[companySlug]` to resolve CustomerOrg; serialize only
   sell prices.
5. Middleware: subdomain → tenant storefront rewrite; guard dashboard on
   subdomains.
6. Tenant admin finance page.
7. Catalog guard: `isMainCompany` + admin roles only.
8. Cleanup: remove `isProducer` references, drop unused Company rows after
   backup export.

Each step independently revertible; backup `dev.db` before steps 2 and 8.

## Verification Checklist

1. `www.dubing.rs` (localhost:3000): superadmin → /admin full stats; can create tenant + its admin.
2. Main admin: /dashboard/catalog CRUD works. Manager: sees catalog read-only or blocked. Worker: no catalog.
3. New tenant `tenant1` created with priceList margin 15% → `tenant1.dubing.rs` shows catalog with tenant prices (base sell −/+ rules), no cost prices anywhere in HTML/JSON.
4. Tenant manager places order → lands in main dashboard kanban as NEW, staff notified.
5. Worker moves NEW→CONFIRMED→IN_PRODUCTION only forward; attempt backward → request approval → admin approves → applied.
6. Tenant tries PATCH status backward → 403. (Optional: cancel own NEW allowed.)
7. Tenant admin finance: order DELIVERED, paymentStatus UNPAID → appears in "za plaćanje" sum. Mark PAID (main admin or tenant admin? — decide: main admin marks PAID after bank payment) → disappears from sum.
8. Exactly one Company row enforced: second `isMainCompany=true` insert rejected (app-level check in tenant/company creation).
9. Superadmin sees everything: all tenants, all orders, logs.
