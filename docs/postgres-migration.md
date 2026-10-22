# SQLite → PostgreSQL

> **Status: not started.** Development runs on SQLite; the product documentation
> names PostgreSQL (Neon or Supabase) as the production target
> (`docs/Business Logic.md:347`).
>
> This document is the pre-flight check. It is what to read **before** touching
> `datasource` in `prisma/schema.prisma`, or any `Decimal` handling, or the
> deployment target.

## Current state

|                | Today                                             | Target           |
| -------------- | ------------------------------------------------- | ---------------- |
| Provider       | `sqlite` (`prisma/schema.prisma:7`)               | `postgresql`     |
| `DATABASE_URL` | `file:./dev.db` (`.env`)                          | `postgresql://…` |
| File           | `prisma/dev.db` (385 KB)                          | managed Postgres |
| Prisma         | 6.19.3                                            | same             |
| Local Postgres | Supabase CLI stack available on `127.0.0.1:54322` | —                |

**Watch the path.** `DATABASE_URL="file:./dev.db"` is resolved **relative to
`prisma/`**, so the live database is `prisma/dev.db`. A zero-byte `dev.db` also
sits in the repository root — running `sqlite3 dev.db` from the root opens the
wrong (empty) file.

**The local Supabase stack is running but empty.** The Postgres instance on
port 54322 has 11 schemas (`auth`, `storage`, `realtime`, …) and **zero tables
in `public`**. The app does not use it. See `docs/agents-when-load.md` for the
MCP setup.

## What the schema contains

23 models, 13 enums. The constructs that behave differently on Postgres:

| Construct            | Count | Behaviour difference                                                                                                                                                         |
| -------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Decimal` fields     | 28    | SQLite stores them as `DECIMAL`; Postgres maps to `numeric(65,30)`. Both return a Prisma `Decimal` object — the serialization rule is unchanged.                             |
| `Json` fields        | 9     | Postgres has a real `jsonb` type. SQLite stores JSON as text. Prisma's `Json` type is the same on both, so the application code is unaffected.                               |
| `@default(cuid())`   | 23    | Client-side generated in both. No change.                                                                                                                                    |
| Enums                | 13    | **Native Postgres enums.** SQLite has no enum type — Prisma emulates them with a `TEXT` column and a CHECK constraint. This is the largest structural difference.            |
| `onDelete` relations | 27    | Supported on both, but Postgres enforces referential integrity on every write. SQLite only does so when `PRAGMA foreign_keys=ON` — which Prisma does **not** set by default. |

### The enum difference is the one that will bite

On SQLite the `OrderStatus` column is `TEXT` with a CHECK constraint. On
Postgres it becomes a native `enum` type. Three consequences:

1. **Adding a value is a schema migration** (`ALTER TYPE ... ADD VALUE`), not
   just a CHECK constraint rewrite.
2. **Renaming or removing a value needs `ALTER TYPE ... RENAME VALUE` or a
   type swap.** The enum is used in `OrderStatus`, `OrderStatusHistory`,
   `OrderStatusTransition`, `NotificationEvent` and more.
3. **A row that holds a value the enum does not have will fail to load.** Any
   test data or manual SQL edit that wrote a raw string outside the enum breaks
   on the first query after migration.

### The foreign-key difference is the other one

SQLite does **not** enforce foreign keys by default. `prisma/dev.db` can
therefore contain rows that reference a deleted catalog item or a deleted
company — and nothing complains. On Postgres, the same data will cause
**insert and update failures** the moment those relations are touched.

**This is the single biggest risk in the migration.** Before pointing the app
at Postgres, audit the existing data for orphans:

```sql
-- Run against a copy of the SQLite database, or on Postgres after import.
-- OrderItem -> catalog
SELECT o.id FROM "OrderItem" o
LEFT JOIN "PvcProfile" p ON o."profileId" = p.id
WHERE o."profileId" IS NOT NULL AND p.id IS NULL;

SELECT o.id FROM "OrderItem" o
LEFT JOIN "ProductTemplate" t ON o."templateId" = t.id
WHERE o."templateId" IS NOT NULL AND t.id IS NULL;

-- OrderItemGlassPane -> GlassType
SELECT g.id FROM "OrderItemGlassPane" g
LEFT JOIN "GlassType" t ON g."glassTypeId" = t.id
WHERE t.id IS NULL;

-- OrderItemHardware -> HardwareItem
SELECT h.id FROM "OrderItemHardware" h
LEFT JOIN "HardwareItem" t ON h."hardwareId" = t.id
WHERE t.id IS NULL;

-- OrderItemProcessing -> ProcessingOption
SELECT p.id FROM "OrderItemProcessing" p
LEFT JOIN "ProcessingOption" t ON p."processingOptionId" = t.id
WHERE t.id IS NULL;

-- Order -> owners
SELECT o.id FROM "Order" o
LEFT JOIN "Company" c ON o."companyId" = c.id
WHERE c.id IS NULL;

SELECT o.id FROM "Order" o
LEFT JOIN "CustomerOrg" t ON o."customerOrgId" = t.id
WHERE t.id IS NULL;
```

Also check for users pointing at a missing company or tenant, and for order
items whose parent order is gone:

```sql
SELECT u.id FROM "User" u
LEFT JOIN "Company" c ON u."companyId" = c.id
WHERE u."companyId" IS NOT NULL AND c.id IS NULL;

SELECT u.id FROM "User" u
LEFT JOIN "CustomerOrg" t ON u."customerOrgId" = t.id
WHERE u."customerOrgId" IS NOT NULL AND t.id IS NULL;

SELECT i.id FROM "OrderItem" i
LEFT JOIN "Order" o ON i."orderId" = o.id
WHERE o.id IS NULL;
```

**Do this against the production export, not against `prisma/dev.db`.** The dev
database was written without FK enforcement, so it may already contain orphans
that never surfaced.

## What does **not** change

- **The `Decimal` serialization rule.** `Decimal` is a Prisma type on both
  providers. `.toString()` at the Server→Client boundary is still required.
  See `AGENTS.md` § "Decimal Serialization Rule".
- **Every query in the codebase.** There is no raw SQL in `src/` — no
  `$queryRaw`, no `$executeRaw`, no `contains`/`startsWith`/`mode` filters.
  Those are the constructs where SQLite and Postgres diverge most (case
  sensitivity, `LIKE`, JSON operators). None are used, so the query layer
  ports unchanged.
- **Every Prisma call.** No `String[]` or other Postgres-only list fields are
  used; the list-ish data is stored in `Json` columns, which Prisma abstracts.
- **The enum values used in TypeScript.** `src/lib/status-transitions.ts:33-37`
  declares its own string union `CompanyRole` / `UserRole`. It does not import
  the Prisma enum, so it is unaffected.

## Migration procedure

1. **Snapshot first.** `cp prisma/dev.db prisma/dev.db.backup` — or, for
   production, take a managed snapshot. Nothing below is reversible without
   one.
2. **Audit the data** with the orphan queries above. Clean up any rows that
   Postgres will reject.
3. **Switch the provider.** In `prisma/schema.prisma:6-9`:

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

4. **Point `DATABASE_URL` at Postgres.** In `.env` for local, in the host's
   secret store for production. Never commit a connection string.
5. **Regenerate the client and push the schema:**

   ```bash
   npx prisma generate
   npx prisma db push
   ```

   `db push` recreates the tables from the schema — it does **not** import data.
   For data, use `prisma migrate` with a proper baseline instead.

6. **Import the data.** A `sqlite3` export to SQL, then load into Postgres.
   Watch the `Decimal` columns — SQLite's `DECIMAL` affinity stores them as
   text or real depending on how they were written, and Postgres's `numeric`
   will reject a malformed literal.
7. **Re-seed and verify.** `npm run db:seed` and check the logins:

   ```bash
   npm run db:push && npm run db:seed
   npm run dev
   ```

   Then log in as `admin@acme.test` / `Gzf!Dobav#2026Kr4pN8` and as
   `bob@customers.test` / `Gzf!Kupac#2026Hd6qP9`, and open a tenant storefront
   at `http://bob.localhost:3000`. The full credential list is in
   `docs/security-hardening.md`.

8. **Watch for FK errors in the first week.** They appear as insert failures on
   relations that SQLite silently accepted.

## Supabase specifics

If the target is Supabase:

- **The public schema is exposed.** This is the one thing that is not like a
  plain Postgres server. Supabase's default privileges grant `anon` and
  `authenticated` full DML (`arwdDxtm`) on every new table in `public`, and the
  anon key is public. With row level security off, that key reads and writes
  every row through PostgREST — outside NextAuth and outside every check in
  `src/`. Verified on the local stack on 2026-10-22 by querying
  `pg_default_acl`. Run `prisma/postgres-supabase.sql` right after the schema
  lands: it revokes those grants and turns row level security on for every
  table. See the proof below.
- **`postgres` has `rolbypassrls = true`.** Policies written for the default
  role do not constrain the application. The lockdown file therefore enables
  RLS without `FORCE`, so the application (the table owner) keeps its own
  checks while the public surface is closed. For per-tenant isolation enforced
  by the database, use `prisma/postgres-rls.sql` with a dedicated
  `NOBYPASSRLS` role.
- **Do not reuse the public schema for app tables without saying so.** The
  local stack already has `auth`, `storage`, `realtime`, `graphql` schemas. Put
  the app in `public` (the Prisma default) or in a dedicated schema.
- **Prisma's connection pooling.** Use the Supavisor pooler
  (`postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/dbname`)
  for the application, and the direct connection for migrations. Prisma needs
  `?pgbouncer=true` on the pooled URL.
- **Supabase's own auth is not used.** GlazeFlow authenticates with NextAuth
  credentials (`src/lib/auth.ts`) and stores users in its own `User` model.
  Do not enable Supabase Auth — it would create a second identity source.
- **The MCP server** at `http://127.0.0.1:54321/mcp` talks to the local stack.
  `apply_migration` writes to whichever project it is pointed at — check
  `get_project_url` before running anything against it.
- **Backups.** Supabase PITR is on free tier. Confirm it covers the window
  before the migration.

### The local stack, step by step

The local stack already runs (Supabase API on `127.0.0.1:54321`, Postgres on
`127.0.0.1:54322`, `public` empty). The application does not use it yet.

```bash
# 1. a scratch database, so the app's public schema stays untouched
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "CREATE DATABASE glazeflow"

# 2. the Postgres DDL for the current schema
cp prisma/schema.prisma /tmp/schema_pg.prisma
sed -i '' 's/provider = "sqlite"/provider = "postgresql"/' /tmp/schema_pg.prisma
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/glazeflow" \
  npx prisma migrate diff --from-empty --to-schema-datamodel /tmp/schema_pg.prisma --script \
  > /tmp/init.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/glazeflow" -f /tmp/init.sql

# 3. close the public surface
psql "postgresql://postgres:postgres@127.0.0.1:54322/glazeflow" \
  -f prisma/postgres-supabase.sql

# 4. point the app at it
#    .env:  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/glazeflow"
#    prisma/schema.prisma: provider = "postgresql"
npx prisma generate
npm run db:seed
npm run dev
```

Step 4 is the only one that changes the application. The switch back is the
same three lines in reverse: `provider = "sqlite"`, `DATABASE_URL="file:./dev.db"`,
`npx prisma generate`.

For a **hosted** Supabase project, the same SQL runs against the project
database. Use the pooled URL for the application
(`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true`)
and the direct URL for migrations (`DIRECT_URL`). The anon and service role
keys are not used by this application — it authenticates with NextAuth and
talks to the database with the database credentials only.

### Proof of the lockdown (run on the local stack, 2026-10-22)

| Step                                                       | Result                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| Schema applied to Postgres                                 | 24 tables, 13 native enums, 10 `jsonb` columns, 28 `numeric` columns |
| `grant select on public."Company" to anon`, read as `anon` | **1 row** — the exposure                                             |
| `prisma/postgres-supabase.sql` applied, read as `anon`     | `ERROR: permission denied for table Company`                         |
| Grant restored, read as `anon`                             | **0 rows** — row level security denies it                            |
| Read as `postgres` (the application role)                  | 1 row — the application still works                                  |
| Tables without row level security                          | none                                                                 |

## Rollback

The switch is a config change, so rollback is: restore the old `DATABASE_URL`,
restore `provider = "sqlite"`, run `npx prisma generate`, and restore
`prisma/dev.db` from the snapshot. The data written to Postgres during the
failed window is lost unless it was exported — which is the reason for the
snapshot in step 1.

## Checklist

- [ ] Snapshot taken and verified restorable
- [ ] Orphan queries run against the **production** export, not the dev file
- [ ] `provider` switched to `postgresql`
- [ ] `DATABASE_URL` set from the environment, not committed
- [ ] `npx prisma generate` and `npx prisma db push` run clean
- [ ] Data imported and `Decimal` columns verified
- [ ] `npm run db:seed` passes
- [ ] All six seed logins work, including one tenant storefront
- [ ] `npm run build` passes
- [ ] FK errors monitored for the first week
- [ ] Supabase pooler URL uses `?pgbouncer=true` and port 6543
