# GlazeFlow AI Structure — Plan

Status: implemented. Date: 2026-10-21.

Goal: give an AI agent working on this repo enough structure to be precise about
tenant isolation, role permissions, pricing authority, and the order lifecycle
without guessing. Everything below is verified against the code at the commit
this was written on; where code and older docs disagree, code wins.

## 1. What the application is

GlazeFlow is a B2B ordering platform for glass, PVC profiles, finished windows and
doors, hardware, and processing services.

- One **main company** (producer/supplier) owns the entire catalog and all prices.
  `Company.isMainCompany = true`. Exactly one such row exists.
- **Tenants** are the main company's customers. They are `CustomerOrg` rows, never
  `Company` rows. Each has a `slug` that becomes a subdomain.
- A tenant employee logs in on the tenant subdomain, configures a product in the
  order wizard, sees a live quote, and submits. The order lands in the main
  company's dashboard; the main company advances it through production; the tenant
  sees status and messages.

The tenant-subdomain → storefront rewrite happens in `src/middleware.ts:32-43`.
The catalog the tenant sees comes from `getTenantCatalog` in `src/lib/tenant.ts:44`,
which returns **every active main-company catalog item** with the tenant's pricing
applied.

## 2. What does not exist yet

Two things the business described are **not implemented**. Do not write code or
docs as if they were.

### 2.1 Per-tenant catalog assignment

There is no model, field, or join table that restricts which products a tenant may
order. `CustomerOrg` (`prisma/schema.prisma:171-190`) carries only `priceListId`
and `CustomerPriceOverride[]`. `CustomerPriceOverride`
(`prisma/schema.prisma:332-354`) changes **price only** — never visibility or
permission. `getTenantCatalog` filters on `isActive`, which is a global admin flag,
not a per-tenant one.

To implement it, a join table is needed (for example `CustomerOrgProduct` with
`customerOrgId`, item id, item kind, optional quantity/price override), a
`getTenantCatalog` filter, and an admin UI to manage the assignment. Until that
exists, every tenant sees the whole catalog.

### 2.2 `customerOrgRole` is barely enforced

`TENANT_ADMIN` and `TENANT_MANAGER` are stored and used in exactly one
authorization decision: `src/app/(storefront)/[companySlug]/finance/page.tsx:20`
redirects non-`TENANT_ADMIN` users. Everywhere else the two roles have identical
power. `TENANT_MANAGER` is not "view-only" today.

## 3. The role model

Two independent dimensions, plus one tenant dimension.

| Field                  | Enum                                                        | Question it answers                              |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| `User.platformRole`    | `SUPER_ADMIN`, `COMPANY_ADMIN`, `COMPANY_STAFF`, `CUSTOMER` | What level of access the app grants              |
| `User.companyRole`     | `COMPANY_ADMIN`, `COMPANY_SALES`, `COMPANY_PRODUCTION`      | What job the person does inside the main company |
| `User.customerOrgRole` | `TENANT_ADMIN`, `TENANT_MANAGER`                            | What the person may do inside their tenant       |

Intended combinations, and what the code actually enforces:

| `platformRole`  | `companyRole`        | `customerOrgRole` | Enforced today                                       |
| --------------- | -------------------- | ----------------- | ---------------------------------------------------- |
| `SUPER_ADMIN`   | `null`               | `null`            | `/admin` only, no `companyId`                        |
| `COMPANY_ADMIN` | `COMPANY_ADMIN`      | `null`            | Full main-company access                             |
| `COMPANY_STAFF` | `COMPANY_PRODUCTION` | `null`            | Forward status free, backward needs approval         |
| `COMPANY_STAFF` | `COMPANY_SALES`      | `null`            | Same as above — `COMPANY_SALES` has no distinct rule |
| `CUSTOMER`      | `null`               | `TENANT_ADMIN`    | Order, track, finance                                |
| `CUSTOMER`      | `null`               | `TENANT_MANAGER`  | Order, track — finance blocked                       |

`companyRole` is **not** consistently enforced. `src/lib/status-transitions.ts:89-91`
treats a `userRole` of `COMPANY_ADMIN` as omnipotent, and two API routes compute
`userRole = user.companyRole || user.platformRole`
(`src/app/api/orders/[id]/status/route.ts:13`,
`src/app/(company)/dashboard/orders/page.tsx:32`). A `COMPANY_STAFF` user holding
`companyRole: COMPANY_ADMIN` therefore bypasses the approval flow.

The `CompanyRole` enum in the schema has **no** `PRODUCTION_WORKER` value. The
"worker" role described in `docs/BUSINESS_LOGIC_FIX.md` does not exist in code.
`PRODUCTION_WORKER` appears only in prose in `AGENTS.md:130` and
`docs/BUSINESS_LOGIC_FIX.md:22,110`.

## 4. Order lifecycle

Pipeline order (`src/lib/status-transitions.ts:3-12`):

```
NEW → QUOTE_AMENDMENT → CONFIRMED → IN_PRODUCTION → READY → DELIVERED → CLOSED
                                                                    ↘ CANCELLED
```

The enum in the schema is `QUOTE_AMENDMENT`. `docs/instructions.md:19` said
`QUOTE_REVISION` — corrected to `QUOTE_AMENDMENT`.

Who may move what:

| Actor                                  | Forward | Backward | Cancel                | Approval                 |
| -------------------------------------- | ------- | -------- | --------------------- | ------------------------ |
| `SUPER_ADMIN`                          | yes     | yes      | yes                   | none                     |
| `COMPANY_ADMIN`                        | yes     | yes      | yes                   | none                     |
| `COMPANY_PRODUCTION` / `COMPANY_SALES` | yes     | request  | request               | `COMPANY_ADMIN` approves |
| `COMPANY_STAFF`                        | yes     | request  | request               | `COMPANY_ADMIN` approves |
| `CUSTOMER` (tenant)                    | no      | no       | own order while `NEW` | none                     |

Backward moves and cancellations by staff create an `OrderStatusTransition` row
with `status = PENDING`; a `COMPANY_ADMIN` approves via
`PATCH /api/orders/transitions/[id]`.

## 5. Pricing authority

`src/lib/pricing-engine.ts` is pure — no DB, no session, no side effects. It runs
client-side for the live quote and server-side for the authoritative total.

Rules:

- Glass/window/door: area in m² = `(w/1000) × (h/1000)`.
- Glass pane price: `area × sellPricePerSqm × (1 + extraMm × surcharge%)`, where
  `extraMm` counts only thickness **above** `baseThicknessMm`.
- Finished window/door profile cost: perimeter in m = `2 × (w + h) / 1000`, times
  sell price per meter.
- Raw profile: `lengthM × sellPricePerMeter`.
- Hardware and processing: unit price × quantity, summed.
- `unitPrice = round((profile + glass + hardware + processing) × complexityMultiplier, 2)`.
- `lineTotal = unitPrice × quantity`.
- Totals: `subtotal` → `afterDiscount = subtotal × (1 − discount%)` →
  `tax = afterDiscount × taxRate%` → `total = afterDiscount + tax`.

Per-tenant price precedence (`src/lib/tenant.ts:63-76`, mirrored in
`src/app/api/orders/route.ts:64-80`):

1. `CustomerPriceOverride.overrideSellPrice` (absolute)
2. `CustomerPriceOverride.discountPercent` (relative)
3. Base sell price
4. Then the tenant's `PriceList.discountPercent` applies to the subtotal

`costPrice` is never exposed to tenants. `getTenantCatalog` omits it and
`src/app/api/orders/route.ts` never selects it.

Two known pricing gaps:

- The client live quote (`src/components/order-wizard/PriceSummary.tsx:39`) shows
  neither tax nor the tenant discount; the copy says the final amount appears at
  checkout. The server total is authoritative and will differ from what the
  tenant saw mid-wizard.
- `ProductKind.HARDWARE` has no branch in `calcItemPricing`, so a hardware-kind
  item prices at zero. The wizard never selects that kind
  (`src/components/order-wizard/OrderWizard.tsx:268` offers only the other four),
  so it is latent rather than live.
- `ProductTemplate.minWidthMm` / `maxWidthMm` / `minHeightMm` / `maxHeightMm` are
  shipped to the client (`src/lib/tenant.ts:125-128`) but enforced nowhere.

## 6. Known auth gaps

Verified, ordered by severity. Each is a real hole in the current code.

1. **`POST /api/pricing/quote` is fully unauthenticated.**
   `src/app/api/pricing/quote/route.ts:4-13` has no `getSession()` and no role
   check. It runs the pricing engine on attacker-supplied values.
2. **`GET /api/orders` leaks all orders when the session lacks an org id.**
   `src/app/api/orders/route.ts:11-16` builds `where` as
   `{ customerOrgId: user.customerOrgId }`. A `CUSTOMER` whose `customerOrgId` is
   null produces `{ customerOrgId: undefined }`; Prisma drops the key, and
   `findMany` returns **every order**. Same for a company user with no
   `companyId`.
3. **Order items can reference another company's catalog.**
   `src/app/api/orders/route.ts:88-126` looks up `pvcProfile`, `glassType`,
   `hardwareItem`, `processingOption`, and `productTemplate` by id with **no**
   `companyId` filter and **no** `isActive` filter. A tenant can order a product
   belonging to another company, and can order a deactivated product.
4. **`userRole = companyRole || platformRole` conflates two enums.**
   `src/app/api/orders/[id]/status/route.ts:13` and
   `src/app/(company)/dashboard/orders/page.tsx:32`. A `COMPANY_STAFF` user with
   `companyRole: COMPANY_ADMIN` is treated as omnipotent by
   `src/lib/status-transitions.ts:89-91` and skips the approval chain.
5. **Cross-tenant approval is possible.**
   `src/app/api/orders/transitions/[id]/route.ts:13-18` grants the gate on
   `companyRole === 'COMPANY_ADMIN'`, but the tenant check at line 34 compares
   against `user.companyId`, which for a tenant user is the **main** company id.
   A tenant member given `companyRole: 'COMPANY_ADMIN'` — which
   `PATCH /api/companies/[id]/users/[userId]` allows — can approve transitions on
   other tenants' orders.
6. **`assertSameCompany` is never called.** It is defined at
   `src/lib/rbac.ts:16` and has zero call sites.
7. **Unhandled `requireRole` throws produce 500, not 401/403.** Only
   `src/app/api/tenants/route.ts` (2 call sites) and
   `src/app/api/register/route.ts` wrap in `try/catch` + `toHttpError`. The
   other 10 of 13 `requireRole` calls throw uncaught, leaking a stack trace.
8. **`platformRole` is client-supplied on user creation.**
   `src/app/api/companies/[id]/users/route.ts:59` takes `platformRole` from the
   request body, defaulting to `COMPANY_ADMIN`. SUPER_ADMIN-gated, so it is an
   admin-driven escalation surface — a `SUPER_ADMIN` can be minted.
9. **`GET /api/tenants` omits the main-company check that POST has.**
   `src/app/api/tenants/route.ts:11` has no `isMainCompany` assertion; a
   `COMPANY_ADMIN` of a non-main company gets that company's tenant list.
10. **The session cookie is not `Secure` in production.**
    `src/lib/auth.ts:27` hardcodes `secure: false`.
11. **`/api/*` bypasses the middleware entirely** (`src/middleware.ts:28`). Every
    API route is its own only auth boundary, so gaps 1-9 are not mitigated
    upstream.

## 7. UI access control map

Server-side gates (real):

| Surface                  | Gate                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/**`              | middleware `SUPER_ADMIN` only (`src/middleware.ts:48-50`) + `requireRole` on every API                                                         |
| `/dashboard/**`          | `src/app/(company)/dashboard/layout.tsx:10` `redirect('/login')`                                                                               |
| `/[slug]/order`          | `redirect('/login')` without `customerOrgId`; redirect to own slug on cross-tenant (`src/app/(storefront)/[companySlug]/order/page.tsx:13-14`) |
| `/[slug]/my-orders/[id]` | `notFound()` when `order.customerOrgId !== user.customerOrgId`                                                                                 |
| `/[slug]/finance`        | `customerOrgRole !== 'TENANT_ADMIN'` → redirect                                                                                                |
| `/dashboard/orders/[id]` | `notFound()` when `order.companyId !== user.companyId`                                                                                         |

UI-only hiding (not a gate):

- Catalog link in `src/components/dashboard/Sidebar.tsx:16` — hidden unless
  `isProducer`. **Stale**: the codebase moved to `isMainCompany`; `isProducer` is
  still read at `src/app/(company)/dashboard/layout.tsx:15-27`, so the sidebar
  link depends on a flag nothing sets.
- "Dodaj stavku" button in
  `src/app/(company)/dashboard/catalog/CatalogClient.tsx:265` — visible to
  `COMPANY_STAFF`; the API rejects the write with 403.
- Finance link in `src/app/(storefront)/[companySlug]/layout.tsx:19` — redundant,
  the page itself gates.
- `/admin` and `/admin/companies/[id]` are client components with **no** page-level
  session check; the middleware and the API are the only gates.

## 8. The AI structure being built

### 8.1 Instruction files (rewired, not duplicated)

Loading order becomes explicit and single-sourced:

```
CLAUDE.md                      → pointer to AGENTS.md (unchanged)
AGENTS.md                      → repo rules, commands, known issues, architecture
.agents/instructions/app-instructions.md   → GlazeFlow-wide rules (authoritative)
.agents/instructions/project-instructions.md → REMOVED (stale: said Next.js 14,
                                said routes live in src/api/, described CartProvider
                                that does not exist)
src/app/instructions.md       → routes, server/client boundary, API conventions
src/lib/instructions.md        → module responsibilities, pricing contract
prisma/instructions.md        → data model, migration rules
docs/instructions.md           → product knowledge base index
```

The scoped `instructions.md` files stay where they are — they work, and an agent
that edits `src/app/**` already finds them.

### 8.2 New knowledge base

`knowledge-base/` becomes a structured set instead of one file:

| File                   | Answers                                          |
| ---------------------- | ------------------------------------------------ |
| `README.md`            | Index and loading order                          |
| `roles-and-tenancy.md` | Role model, tenant model, permission matrix      |
| `order-lifecycle.md`   | Statuses, transitions, approval chain            |
| `pricing-rules.md`     | Formulas, per-tenant price precedence, authority |
| `api-map.md`           | Every route, its auth, its gaps                  |
| `data-model.md`        | Models, relations, invariants                    |
| `auth-gaps.md`         | The 11 verified holes, with file:line            |
| `roles-explanation.md` | Kept, rewritten for consistency                  |

`docs/` keeps the human-facing product docs in Serbian, but gets the stale facts
corrected.

### 8.3 New skills (`.claude/skills/`)

| Skill                      | Triggers on                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `glazeflow-tenant-guard`   | Any change touching catalog visibility, tenant pricing, order creation, or cross-tenant access |
| `glazeflow-role-check`     | Any change touching roles, permissions, status transitions, or admin surfaces                  |
| `glazeflow-pricing-change` | Any change touching prices, pricing engine, price lists, or overrides                          |
| `glazeflow-schema-change`  | Any change to `prisma/schema.prisma` or seed data                                              |
| `glazeflow-order-flow`     | Any change to orders, statuses, notifications, or real-time events                             |
| `glazeflow-onboard`        | "How does this app work", "explain the roles", "where is X" — read-only orientation            |

Each skill is a short, action-shaped file: what to check, what to never do, and
how to verify. They load on demand, so they cost nothing until they are needed.

## 9. Documentation corrections made

### Round 1 — the original restructuring

| File                               | Correction                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `docs/instructions.md`             | `QUOTE_REVISION` → `QUOTE_AMENDMENT`                                                                                             |
| `AGENTS.md`                        | Removed `PRODUCTION_WORKER` claim; added `isProducer` staleness note; added the auth-gap list; added a pointer to the new skills |
| `docs/roles.md`                    | Rewrote against verified code — the old text predates the tenant model and misstates several gaps                                |
| `docs/how-app-works-with-roles.md` | Marked the storefront catalog as unfiltered; noted `/register` UI is closed                                                      |
| `docs/Business Logic.md`           | Left as the original product vision; a header now marks it as intent, not implementation                                         |
| `docs/files-here.md`               | Rewritten as an accurate index                                                                                                   |

### Round 2 — cleanup, 2026-10-21

The first round did not finish. Four files were left behind: one that declared
itself obsolete, one whose plan had been fully implemented, one that contained
**invented roles and statuses**, and one that duplicated `roles.md`. They have
now been removed, and the surviving files were re-verified against the code.

| File                               | Action                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/koje-instrukcije-kada.md`    | **Deleted.** Duplicated `docs/agents-when-load.md`; its own header already declared it partially obsolete.                                                                     |
| `docs/improve-admin.md`            | **Deleted.** The plan was fully implemented — `/api/admin/stats` and all 7 components in `src/components/admin/` exist.                                                        |
| `docs/prompt-shorten-logic.md`     | **Deleted.** A raw business brief that named a `production_line_worker` role, five non-existent order statuses, and an email address that is not in the database.              |
| `docs/roles-how-and-where.md`      | **Deleted.** Duplicated `docs/roles.md`; its three unique pieces (login URLs per role, the tenant-subdomain rule, the Decimal reminder) were moved into `docs/roles.md` § 6-7. |
| `docs/roles.md`                    | Fixed the `User` model reference (`118-140` → `141-169`); added § 6 "Gde se ko loguje" and § 7 "Decimal Serialization reminder".                                               |
| `docs/how-app-works-with-roles.md` | Corrected § 3: `/admin` creates **tenants**, not companies. Corrected § 5: noted that `POST /api/register` has no UI caller.                                                   |
| `docs/improvements.md`             | Rewritten. Removed two false claims (`orderNumber` was already `@unique`; the glass pane price calculation is not buggy) and added the current-state table.                    |
| `docs/files-here.md`               | Rebuilt with the real file list, a status column, and a table of the removed files.                                                                                            |
| `docs/BUSINESS_LOGIC_FIX.md`       | Added a status banner marking it as an executed migration, and struck the `PRODUCTION_WORKER` role.                                                                            |
| `knowledge-base/*.md`              | Fixed the `status-transitions.ts:74-80` reference → `:89-91` in 3 files (`roles-and-tenancy.md`, `auth-gaps.md`, `roles-explanation.md`).                                      |
| `docs/agents-when-load.md`         | Added the `docs/postgres-migration.md` entry and the `next-devtools` MCP note.                                                                                                 |
| `AGENTS.md`                        | Added an MCP section, the `experimental.requestInsights` note, and the SQLite/PostgreSQL pointer.                                                                              |
| `knowledge-base/api-map.md`        | Added the note that the middleware does not guard `/api` paths.                                                                                                                |

## 10. Verification

No test suite exists in this repo, so verification is manual plus build-level:

```bash
npm run format:check
npm run build
```

`npm run lint` is broken: `next lint` was removed in Next.js 16 and the script
still calls it (`package.json:16`). Every other script works.
