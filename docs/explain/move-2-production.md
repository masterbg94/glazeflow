## Blocker first

App run on **SQLite** (`prisma/schema.prisma:7` — `provider = "sqlite"`). Vercel serverless FS = ephemeral, read-only except `/tmp`. SQLite file die on every deploy, and Prisma on Vercel = Postgres only.

**So: SQLite → Postgres (Supabase) is mandatory, not optional.** Plan already exists: [docs/postgres-migration.md](docs/postgres-migration.md).

---

## 1. Supabase — create project

1. [supabase.com/dashboard](https://supabase.com/dashboard) → New project. Name, strong DB password, region near user.
2. **Connection → URI**. Get 2 strings:

```
# runtime (pooled, transaction mode)
postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres

# migrations (session mode / dedicated)
postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres
```

> Password with `@ : / ? #` → percent-encode. Supabase dashboard copy button does it.
> Port 5432 pooler = session mode, use for `migrate deploy`. Port 6543 = transaction mode, use for app runtime + `?pgbouncer=true`.

3. Optional but recommended: Dashboard → SQL Editor, create app role (skip if want fast path):

```sql
CREATE ROLE prisma LOGIN PASSWORD 'STRONG';
GRANT ALL PRIVILEGES ON DATABASE postgres TO prisma;
GRANT USAGE, CREATE ON SCHEMA public TO prisma;
```

> Supabase **Auth** stay OFF. GlazeFlow authenticate via NextAuth credentials ([src/lib/auth.ts](src/lib/auth.ts)), own `User` model. Two identity sources = mess.

---

## 2. Prisma — 3 file edits

**a) [prisma/schema.prisma:5-9](prisma/schema.prisma)** — swap provider, add directUrl:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

**b) generator block** — add `binaryTargets` so engine match Vercel runtime:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native"]
}
```

**c) `.env`** (local, and same values as Vercel env):

```bash
DATABASE_URL="postgresql://postgres.<REF>:<PASS>@aws-0-<REGION>.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require"
DIRECT_URL="postgresql://postgres.<REF>:<PASS>@aws-0-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require"
```

> `?pgbouncer=true` mandatory on 6543 — Supavisor transaction mode no prepared statements, else `ERROR: prepared statement "s0" already exists`.
> `directUrl` = dedicated conn for `migrate deploy`. Never migrate through pooler.

**No other schema change needed.** Checked: no `String[]`, no `Bytes`, no `@db.` native types, no `$queryRaw` in `src/`. 13 enums → native PG enums, Prisma generates `CREATE TYPE` in migration. 28 `Decimal` fields → `numeric(65,30)`, **serialization rule unchanged** ([AGENTS.md](AGENTS.md) § Decimal Serialization Rule — still `.toString()` at Server→Client boundary).

---

## 3. Migrate + seed

```bash
npx prisma generate
npx prisma migrate dev --name init_postgres
```

> `migrate dev` need shadow DB. Shadow DB on Supabase: Dashboard → Database → create `prisma_shadow_db` (owner `postgres`). Point `shadowDatabaseUrl` in schema if error.
>
> **Alternative, no shadow DB needed:** `npx prisma db push` (creates tables, no migration history). Fine for MVP, but no version history later — prefer `migrate dev` if shadow DB create work.

Seed prod (script has no `prisma.seed` key in package.json, so `npx prisma db seed` fails — run directly):

```bash
npx tsx prisma/seed.ts
```

> Prod data from SQLite `prisma/dev.db`? Migrate with `prisma migrate diff --from-url "file:./dev.db" --to-url "$DIRECT_URL" --script > migrate.sql`, run SQL in Supabase SQL Editor. Watch `Decimal` columns — SQLite stores as text, PG `numeric` reject malformed literal. MVP only? Just seed fresh, skip import.

**Orphan check first.** SQLite no FK enforcement → orphans exist → PG reject on write. Run queries from [docs/postgres-migration.md](docs/postgres-migration.md) § "foreign-key difference" against export before switch.

---

## 4. Vercel — deploy

1. Push repo to GitHub (`origin` = `github.com/masterbg94/glazeflow.git`) — already connected, so: [vercel.com/new](https://vercel.com/new) → import repo.
2. Project settings:
   - Framework Preset: **Next.js** (auto)
   - Build Command: `prisma generate && next build` — already `npm run build` = `prisma generate && next build` ([package.json](package.json))
   - Install Command: `npm install` (default). `postinstall: prisma generate || true` already set
   - Node: 22 (Next 16 need ≥ 20.9)
3. **Environment variables** (Settings → Environment Variables, tick **Production** + **Preview**):

```
DATABASE_URL        = postgresql://...:6543/postgres?pgbouncer=true&sslmode=require
DIRECT_URL          = postgresql://...:5432/postgres?sslmode=require
NEXTAUTH_SECRET     = <openssl rand -base64 32>
NEXTAUTH_URL        = https://glazeflow.app
NEXT_PUBLIC_ROOT_DOMAIN = glazeflow.app
RESEND_API_KEY      = <resend key>
EMAIL_FROM          = Strazi Glas <noreply@yourdomain.com>
```

> `NEXT_PUBLIC_ROOT_DOMAIN` = apex, **no port, no https://**. [src/middleware.ts:6](src/middleware.ts) split it to `ROOT_HOST`; apex = main company, `bob.glazeflow.app` = tenant storefront.
> `NEXTAUTH_URL` no trailing slash.
> `NEXTAUTH_SECRET` ≠ local one. Regenerate: `openssl rand -base64 32`.
> Cookie domain auto = `.glazeflow.app` in prod ([src/lib/auth.ts:13-15](src/lib/auth.ts)) → one login session shared across tenant subdomains. Good.
> `NEXT_PUBLIC_*` inlined at **build** → change need redeploy, not just restart.

4. **Domain** (Settings → Domains): add `glazeflow.app` + `*.glazeflow.app`.
   - Wildcard cert via DNS-01 → need DNS write access. Easiest: point nameservers to Vercel. Else delegate `_acme-challenge` NS → `ns1.vercel-dns.com` / `ns2.vercel-dns.com` + wildcard CNAME `*.glazeflow.app` → `cname.vercel-dns-0.com`.
   - Wildcard OK on Hobby (50 domains/project limit).
   - Cloudflare orange cloud = broken cert. DNS-only.
   - NS switch propagate 24–48h.
5. Deploy. Vercel run build → app up at `https://glazeflow.app`.

---

## 5. Migration in prod — run separately, NOT in build command

Concurrent builds race on same migration lock. Run before/after deploy, outside build:

```bash
# from local, against prod DIRECT_URL
npx prisma migrate deploy
```

> Or GitHub Action before Vercel deploy. NOT in Vercel Build Command (builds run parallel → `ERROR: deadlock detected` / partial migration).

---

## 6. Verify

| Check | Command |
|---|---|
| Build | `npm run build` |
| Types | `npm run typecheck` |
| Tests | `npm run test` |
| Login main | `admin@acme.test` / `Password123!` → `https://glazeflow.app/dashboard` |
| Login super | `superadmin@glazeflow.app` / `Password123!` → `/admin` (companyId null — handle explicitly) |
| Login tenant | `bob@customers.test` / `Password123!` → `https://bob.glazeflow.app` |
| Decimal | open `/dashboard/orders/[id]` — no "Decimal objects are not supported" console error |

Tenant storefront must sit on `*.glazeflow.app` — `bob.glazeflow.app`, not preview URL.

---

## Gotchas

- SQLite `dev.db` in repo root = wrong empty file. Live one = `prisma/dev.db`.
- Supabase free tier: project pause after 1 week inactivity. Restart in dashboard. Prod = Pro plan.
- Prisma connects as `postgres`/bypassrls → Supabase RLS **not** enforce. Do not write RLS policies expecting them to apply. App do own tenant scoping (`customerOrgId`).
- `allowedDevOrigins` in [next.config.ts](next.config.ts) = dev only, prod ignore.
- `agriculture`... sorry: `emails` via Resend need verified domain in Resend dashboard, else `EMAIL_FROM` reject.
- `prisma migrate dev` on prod DB = destructive. Prod only `migrate deploy`.

---

Want me execute step 2 + 3 in repo (schema edit, `prisma.seed` key, shadow-DB wiring) and prep commit? Say go.

Sources:
- [Supabase — Prisma guide](https://supabase.com/docs/guides/database/prisma)
- [Supabase — Prisma troubleshooting](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting)
- [Prisma — PgBouncer (v6)](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/databases-connections/pgbouncer)
- [Prisma — Connecting to Postgres](https://www.prisma.io/docs/postgres/database/connecting-to-your-database)
- [Vercel — Adding a custom domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- [Vercel — Wildcard domain without Vercel nameservers](https://vercel.com/kb/guide/wildcard-domain-without-vercel-nameservers)
- [Vercel — Multi-tenant reference](https://vercel.com/docs/platforms/multi-tenant-platforms/reference)