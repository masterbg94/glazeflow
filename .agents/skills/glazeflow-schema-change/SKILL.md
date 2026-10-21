---
name: glazeflow-schema-change
description: Change the Prisma schema and seed data safely in GlazeFlow. Use when editing prisma/schema.prisma, adding or renaming a model, changing an enum, altering a relation, or updating prisma/seed.ts. Also use before any change that adds a per-tenant capability such as product assignment.
---

# Schema change

## Before editing

`prisma/schema.prisma` is the source of truth for the data model. Read it, plus
`knowledge-base/data-model.md`, before changing anything.

The invariants that other code depends on:

1. Exactly one `Company` with `isMainCompany = true`.
2. Tenants are `CustomerOrg` rows, never `Company` rows.
3. `Order.companyId` = the main company; `Order.customerOrgId` = the tenant.
4. `OrderItem.unitPrice` / `lineTotal` are snapshots — never recomputed.
5. `costPrice` never reaches a tenant-facing serializer.
6. Prisma `Decimal` values are stringified before crossing into a client
   component.
7. `CustomerOrg.slug` is unique and matches `^[a-z0-9-]+$`.

Breaking any of these is a behaviour change, not a refactor.

## The workflow

```bash
# 1. edit prisma/schema.prisma
npx prisma generate      # regenerate the client
npm run db:push          # apply to the SQLite dev database
npm run db:seed          # re-seed if required fields changed
npm run build            # typecheck the whole app against the new client
```

`prisma/migrations/` is gitignored and empty — this project uses `db:push`, not
committed migrations. Do not add a migrations directory unless the user asks
for a production migration story.

The seed is idempotent (`upsert` throughout), so re-running it is safe.

## Seed data

`prisma/seed.ts` creates:

| Account | Role | Company |
| --- | --- | --- |
| `superadmin@glazeflow.app` | `SUPER_ADMIN` | none (`companyId` null) |
| `admin@acme.test` | `COMPANY_ADMIN` / `COMPANY_ADMIN` | `acme` |
| `manager@acme.test` | `COMPANY_STAFF` / `COMPANY_PRODUCTION` | `acme` |
| `sales@acme.test` | `COMPANY_STAFF` / `COMPANY_SALES` | `acme` |
| `bob@customers.test` | `CUSTOMER` / `TENANT_ADMIN` | tenant `bob` |
| `worker@customers.test` | `CUSTOMER` / `TENANT_MANAGER` | tenant `bob` |

Password for all: `Password123!`. Development only — never in production, never
in source control beyond the seed file.

The main company is `acme` with `isMainCompany: true` and `isProducer: true`.

Update the seed when a schema change adds a required field, or when a new
capability needs representative data to be demonstrable.

## Enum changes

Enum values are referenced in many places. Before renaming or removing one, grep
the whole repo:

```bash
grep -rn "OrderStatus\|CompanyRole\|CustomerOrgRole" --include="*.ts" --include="*.tsx" src
grep -rn "OLD_ENUM_VALUE" --include="*.ts" --include="*.tsx" --include="*.md" .
```

Adding a value is safe. Removing or renaming one breaks the data in the existing
database — plan a migration and a backfill, and get explicit approval.

Known enum drift to be aware of:

- `CompanyRole` has **no** `PRODUCTION_WORKER`. The "worker" role in
  `docs/BUSINESS_LOGIC_FIX.md:22` and `AGENTS.md:130` is prose only.
- `OrderStatus` is `QUOTE_AMENDMENT`. The schema is authoritative; older docs
  said `QUOTE_REVISION` and have been corrected.

## SQLite constraints

Development uses SQLite. It has no native enum type, no native `Decimal`, and
no native `Json` — Prisma emulates all three. Consequences:

- Adding an enum value works; SQLite stores it as text.
- `Json` columns are stored as text. The codebase reads them with guards like
  `Array.isArray(h.applicableKinds) ? h.applicableKinds as string[] : null`
  (`src/lib/tenant.ts:116`). Follow that pattern when reading a Json column.
- `Decimal` is stored as a decimal string. Keep the `.toString()` boundary
  conversion.

Production should be PostgreSQL. Behaviour that differs between the two:
case-insensitive `LIKE`, strict typing, and concurrent write behaviour.

## Adding a per-tenant capability

If the change is "let the main company decide which products a tenant may
order", that is a real feature and touches four places. There is no half-built
mechanism to reuse.

1. **Schema** — a join table, for example `CustomerOrgProduct` with
   `customerOrgId`, an item id, and an item kind discriminator. A single table
   with nullable item-id columns is awkward; a discriminator column plus one id
   column keeps the constraint simple.
2. **Read path** — filter `getTenantCatalog` (`src/lib/tenant.ts:44-137`) by the
   assignment.
3. **Write path** — reject unassigned items in `POST /api/orders`. The
   storefront filter is a UX convenience, not a boundary.
4. **Admin UI** — manage the assignment from the main company's dashboard.

Decide the fallback first: a tenant with no assignments sees an empty catalog
or everything? An empty catalog is safer and clearer. Whichever you pick, write
it down — an ambiguous fallback becomes a silent leak.

## Checklist before finishing

- [ ] `npx prisma generate` ran and the client is in sync.
- [ ] `npm run db:push` applied cleanly, with no data loss on existing rows.
- [ ] The seed was updated if required fields changed.
- [ ] `npm run build` passes.
- [ ] Every invariant above still holds.
- [ ] Any new enum value is used in at least one place, or it is dead code.
- [ ] `knowledge-base/data-model.md` reflects the change.

## Verify

```bash
npm run db:push && npm run db:seed && npm run build
```

Then log in with a seeded account and confirm the data reads as expected. The
seed is the fastest way to prove a schema change did not break the app's basic
shape.
