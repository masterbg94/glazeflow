---
name: glazeflow-onboard
description: Orient in the GlazeFlow codebase. Use for read-only questions about how the app works, where a feature lives, what a role can do, how tenancy works, or how the order flow and pricing fit together. Triggers on "how does this app work", "explain the roles", "where is X handled", "what can a tenant do", "how does ordering work".
---

# GlazeFlow orientation

Read-only. Answer from the code, and say which file backs the answer.

## Orientation in 60 seconds

GlazeFlow is a B2B ordering platform for glass, PVC profiles, windows, doors,
hardware, and processing.

- One **main company** owns the whole catalog and all prices.
  `Company.isMainCompany = true`, exactly one row.
- **Tenants** are the main company's customers — `CustomerOrg` rows, never
  `Company` rows. Each has a `slug` that becomes a subdomain.
- A tenant employee configures a product in the order wizard, sees a live quote,
  and submits. The order lands in the main company's dashboard. The main
  company advances it through production. The tenant sees status and messages.

## Where things live

| Area | Path |
| --- | --- |
| Route groups | `src/app/(platform)/admin` · `(company)/dashboard` · `(storefront)/[companySlug]` · `(auth)` |
| API routes | `src/app/api/**` |
| Server logic | `src/lib/` — `auth` · `rbac` · `tenant` · `pricing-engine` · `status-transitions` · `notifications` · `realtime` · `events` |
| Data model | `prisma/schema.prisma` + `prisma/seed.ts` |
| Real-time transport | SSE via `src/lib/realtime.ts`, event types in `src/lib/events.ts` |
| Host routing | `src/middleware.ts` |

## The knowledge base

`knowledge-base/` — load only the file the question needs:

| Question | File |
| --- | --- |
| Roles, permissions, tenancy | `roles-and-tenancy.md` |
| Statuses, transitions, approval | `order-lifecycle.md` |
| Price formulas, per-tenant pricing | `pricing-rules.md` |
| Every route and its auth | `api-map.md` |
| Models, relations, invariants | `data-model.md` |
| Known security holes | `auth-gaps.md` |
| Why two role fields | `roles-explanation.md` |

`docs/` holds the product history in Serbian: `Business Logic.md` is the
original vision, `BUSINESS_LOGIC_FIX.md` is the migration plan that was
executed, `roles.md` and `how-app-works-with-roles.md` describe the product for
humans.

**When docs and code disagree, the code wins.** Say which one is right and
when the doc was last corrected.

## The five answers that come up most

**Who can order?** Only `platformRole: CUSTOMER` — a tenant employee.
Main-company staff cannot place an order.

**Who owns the catalog?** The main company, always. `POST /api/companies` is
hard-blocked with 403 (`src/app/api/companies/route.ts:35`). Tenants are created
through `POST /api/tenants`, which creates a `CustomerOrg` plus a `PriceList`.

**Can a tenant order anything they want?** Today, yes — every active catalog
item. There is no per-tenant product assignment. `CustomerPriceOverride`
changes price, never visibility. This is the largest gap between the intended
business model and the code.

**Who can change an order status?** See the table in
`order-lifecycle.md`. Staff move forward freely; backward moves and
cancellations need a `COMPANY_ADMIN` approval, except for `SUPER_ADMIN` and
`companyRole: COMPANY_ADMIN`, who act directly. A tenant can only cancel its
own order while it is `NEW`.

**Is the price the tenant sees final?** No. The live quote shows unit and line
price only — no tax, no tenant discount. The server recomputes authoritatively
at order creation. The tenant sees the real total at submit time.

## The three traps

1. **`companyRole || platformRole`.** Merging the two enums into one string
   makes a `COMPANY_STAFF` user with `companyRole: COMPANY_ADMIN` omnipotent.
   Found at `src/app/api/orders/[id]/status/route.ts:13` and
   `src/app/(company)/dashboard/orders/page.tsx:32`.
2. **`companyId` for tenant scope.** A tenant user's `companyId` is the main
   company, and `order.companyId` is also the main company. Comparing them
   passes for every tenant's order. Use `customerOrgId`.
3. **`where` with `undefined`.** `{ customerOrgId: undefined }` — Prisma drops
   the key and the filter matches everything. Live in `GET /api/orders`.

## Known gaps worth stating when relevant

| Gap | File |
| --- | --- |
| Per-tenant catalog assignment does not exist | schema, `src/lib/tenant.ts:44` |
| `customerOrgRole` enforced in one place only | `finance/page.tsx:20` |
| `PRODUCTION_WORKER` role does not exist in the schema | `prisma/schema.prisma` |
| `assertSameCompany` has zero call sites | `src/lib/rbac.ts:16` |
| 10 of 13 `requireRole` calls are uncaught → 500 not 401/403 | `src/app/api/**` |
| `POST /api/pricing/quote` is unauthenticated | `src/app/api/pricing/quote/route.ts:4` |
| `GET /api/orders` leaks all orders without an org id | `src/app/api/orders/route.ts:11` |
| Order items can reference another company's catalog | `src/app/api/orders/route.ts:88` |
| `NotificationRule` table is never read | `prisma/schema.prisma:600` |
| `NotificationFrequency.DAILY_DIGEST` never applied | no digest job |
| `Order.assigneeId` never set | no write path |
| `OrderItem.status` never leaves `PENDING` | no write path |
| `OrderAttachment` has no upload route | no endpoint |
| `savedConfigurations` unused by the UI | grep confirms no references |
| `ProductTemplate` dimension bounds unenforced | `src/lib/tenant.ts:125` |
| `HARDWARE` kind prices at zero | `src/lib/pricing-engine.ts` |
| `npm run lint` is broken — `next lint` removed in Next 16 | `package.json:16` |

## How to answer

1. Lead with the direct answer.
2. Give the file and line that backs it.
3. If the answer differs from the docs, say so and which is correct.
4. If a question implies a feature that does not exist, say it does not exist
   rather than describing what it would do.
5. Do not edit files. This skill is read-only by design.

## Useful commands

```bash
npm run dev          # dev server
npm run db:push      # apply schema to the dev database
npm run db:seed      # re-seed (idempotent)
npm run build        # typecheck + build
npm run db:studio    # browse the database
```

Seed logins, all password `Password123!`:

| Account | Role |
| --- | --- |
| `superadmin@glazeflow.app` | `SUPER_ADMIN` — `/admin` |
| `admin@acme.test` | main company admin — `/dashboard` |
| `manager@acme.test` | staff, `COMPANY_PRODUCTION` |
| `sales@acme.test` | staff, `COMPANY_SALES` |
| `bob@customers.test` | tenant admin, tenant `bob` |
| `worker@customers.test` | tenant manager, tenant `bob` |

Storefront dev host: `bob.localhost:3000` (the tenant slug, not the company
slug). Main company: `localhost:3000`.
