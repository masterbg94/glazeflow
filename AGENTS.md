<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# GlazeFlow MVP — Agent Instructions

## Instruction loading order

Use instructions in this order for every task:

1. Load this root `AGENTS.md` first. It contains repository-wide rules, known
   runtime issues, commands, and environment details.
2. Load `.agents/instructions/app-instructions.md` for every GlazeFlow task. It
   contains the application mission, source-of-truth rules, security constraints,
   and general verification requirements.
3. Before editing files, load the nearest scoped `instructions.md`:
   - `src/app/instructions.md` when touching `src/app/**`
   - `src/lib/instructions.md` when touching `src/lib/**`
   - `prisma/instructions.md` when touching `prisma/**`
   - `docs/instructions.md` when touching `docs/**`
4. Load the matching `knowledge-base/*.md` file for the area in play. The index
   is `knowledge-base/README.md`; it maps each kind of question to a file. Load
   only what the task needs — do not preload the whole base. If the change
   touches the database provider, `Decimal` handling, or the deployment
   target, also load `docs/postgres-migration.md`.
5. If one change spans multiple scopes, load every matching scoped file before
   editing. More specific scoped rules supplement root rules; they do not replace
   them.
6. Read the relevant source files and existing product docs after instructions
   load. Code and `prisma/schema.prisma` decide implemented behavior when docs
   disagree.

Do not treat `.agents/skills/**` as GlazeFlow application instructions. Those files
define optional agent skills, such as communication style, and are loaded only when
the agent runtime activates the matching skill. The GlazeFlow-specific skills are
listed in `knowledge-base/README.md` — load the one whose description matches the
task (`glazeflow-tenant-guard`, `glazeflow-role-check`, `glazeflow-pricing-change`,
`glazeflow-schema-change`, `glazeflow-order-flow`, `glazeflow-onboard`).

## Critical Issues (from terminal log)

### 1. Prisma `companyId` null errors

**Location**: `src/app/(company)/dashboard/page.tsx:9`, `src/app/(company)/dashboard/orders/page.tsx:10`
**Cause**: SUPER_ADMIN user (seed `prisma/seed.ts:9-18`) has no `companyId`. Session returns `companyId: null`. Prisma queries fail with `Argument companyId must not be null`.
**Fix**: Guard queries — redirect if `!companyId`, or scope to platform admin view. Example:

```ts
const companyId = (session?.user as any).companyId;
if (!companyId) redirect('/admin'); // or return empty state
```

### 2. Decimal objects not serializable to Client Components

**Error**: `Only plain objects can be passed to Client Components from Server Components. Decimal objects are not supported.`
**Affected fields** (from schema): `Order.subtotal`, `taxAmount`, `discountAmount`, `total`; `OrderItem.lengthM`, `unitPrice`, `lineTotal`; catalog pricing fields.
**Fix**: Serialize Decimal → string/number before passing to client components. Pattern in `src/app/(company)/dashboard/orders/[id]/page.tsx:103-104`:

```ts
{
  item.unitPrice.toString();
} // Decimal → string
{
  order.total.toString();
}
{
  order.currency;
}
```

Apply this pattern everywhere Prisma Decimal fields cross Server→Client boundary.

### 3. Cross-origin dev origin blocked

**Error**: `Blocked cross-origin request to Next.js dev resource from "192.168.10.95"`
**Fix**: Add to `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.10.95'],
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
};
```

### 4. Slow notification stream (14–56s)

**Endpoint**: `/api/notifications/stream` — likely SSE long-polling holding connection. Investigate `src/app/api/notifications/stream/route.ts` for timeout/heartbeat issues.

---

## Commands

| Task                             | Command                |
| -------------------------------- | ---------------------- |
| Dev server                       | `npm run dev`          |
| Build (includes prisma generate) | `npm run build`        |
| DB push (schema → sqlite)        | `npm run db:push`      |
| Seed DB                          | `npm run db:seed`      |
| Prisma Studio                    | `npm run db:studio`    |
| Format check                     | `npm run format:check` |
| Format write                     | `npm run format`       |
| Type check                       | `npm run typecheck`    |
| Unit tests                       | `npm run test`         |

`npm run lint` now runs `tsc --noEmit` — `next lint` was removed in Next.js 16,
so the script was rewritten rather than left broken. `npm run typecheck` is the
same check under a clearer name.

There is a Vitest suite covering the three pure modules: `pricing-engine`,
`status-transitions`, and `validation`. Run it with `npm run test`.
Verification is `npm run test` plus `npm run build` plus a manual check of the
changed path.

---

## Architecture Notes

- **Next.js 16** (App Router, Server Components default; `next lint` removed — use build + prettier)
- **NextAuth v4** (Credentials provider, JWT strategy)
- **Prisma** + SQLite (dev), PostgreSQL (prod likely)
- **Business model (post-fix, see `docs/BUSINESS_LOGIC_FIX.md`)**: exactly ONE main company
  (`Company.isMainCompany = true`) owns catalog and prices. Tenants are `CustomerOrg`
  rows with `slug` (subdomain), `priceListId`, and `CustomerPriceOverride[]`.
  Never create a second `Company` row. Tenant creation goes through `/api/tenants`
  (SUPER_ADMIN / main COMPANY_ADMIN), never `/api/companies` POST (blocked).
- **Roles**: main company — `platformRole` `COMPANY_ADMIN` / `COMPANY_STAFF`, with
  `companyRole` `COMPANY_ADMIN` / `COMPANY_SALES` / `COMPANY_PRODUCTION`. There is
  **no `PRODUCTION_WORKER`** value in the schema. Tenant users: `platformRole=CUSTOMER`
  - `customerOrgRole` = `TENANT_ADMIN` (sees `/finance`) or `TENANT_MANAGER`.
    `customerOrgRole` is enforced in exactly one place today — the finance page.
- **Tenant subdomains**: middleware rewrites `X.ROOT` → `/X/...` (tenant storefront).
  `/dashboard` and `/admin` are blocked on tenant subdomains.
- **Route groups**: `(company)` = main company dashboard, `(storefront)` = tenant portal, `(auth)` = login (register UI is closed), `(platform)` = super-admin
- **Legacy flag**: `Company.isProducer` is superseded by `isMainCompany` but is still
  read at `src/app/(company)/dashboard/layout.tsx:15-27` to decide the sidebar catalog
  link. The seed sets both, so it works by accident. Prefer `isMainCompany`.

## Security gaps to know before editing auth

Full list with file:line in `knowledge-base/auth-gaps.md`. All sixteen gaps
recorded there are fixed; the file records what each one was and where the check
lives now, so a change does not undo one.

The rules a new change must keep:

- Every route handler gates on a session. `getSessionUser()` from
  `src/lib/rbac.ts` returns the typed user or null.
- `requireRole` throws; wrap it in `try/catch` and map with `toHttpError`.
- Tenant scope compares `order.customerOrgId === user.customerOrgId`. A tenant
  user's `companyId` is the main company, so a `companyId` comparison passes
  for every tenant's order.
- The two role dimensions stay apart. `platformRole` is the access level,
  `companyRole` is the job. `effectiveUserRole()` in
  `src/lib/status-transitions.ts` resolves them without merging.
- Catalog lookups filter by `companyId` **and** `isActive`.
- The `order:update` real-time payload is an explicit pick of five fields.
  Never publish the full Prisma row — `internalNotes` is supplier-only.
- A user role field must match the entity that owns the user: a `companyRole`
  on a tenant user is a 400.

## Security hardening (2026-10-21)

The authorization audit was followed by a hardening pass. Full record:
`docs/security-hardening.md`.

| Area                                                                          | Where it lives                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Rate limit on sign-in and on every mutating `/api` call                       | `src/lib/rate-limit.ts`, `src/middleware.ts:guardApiRequest` |
| Sign-in lockout — 8 failures per account, 30 per address, 15 min              | `src/lib/auth.ts`                                            |
| Security headers (CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`) | `next.config.ts`                                             |
| Origin check on mutating requests                                             | `src/middleware.ts:originAllowed`                            |
| Audit trail, one row per state change                                         | `AuditLog` model, `src/lib/audit.ts`, `GET /api/admin/audit` |
| Password policy (12–72 chars, mixed case, digit, symbol) and bcrypt cost 12   | `src/lib/password-policy.ts`                                 |
| Session lifetime 8 h, refreshed every 30 min                                  | `src/lib/auth.ts`                                            |
| SQLite foreign keys on                                                        | `src/lib/prisma.ts`                                          |
| PostgreSQL row level security (prepared, applied at cutover)                  | `prisma/postgres-rls.sql`                                    |

Rules a new change must keep:

- A new mutating route writes an audit row with `auditFromSession`. A change
  that is not audited cannot be proved.
- A new password path uses `checkPasswordPolicy()` and `hashPassword()` from
  `src/lib/password-policy.ts`. Never call `bcrypt.hash` directly.
- The middleware already rate limits and origin-checks `/api`; a route does
  not repeat that.
- Seed credentials are listed in `prisma/seed.ts` (`SEED_PASSWORDS`) and in
  `docs/security-hardening.md`. Local only.

---

## Session / Auth Patterns

- `getSession()` from `src/lib/auth.ts` returns the server session.
  `getSessionUser()` from `src/lib/rbac.ts` returns the typed user or null.
- A session lives at most 8 hours and is refreshed at most every 30 minutes.
- The session user is fully typed via `src/types/next-auth.d.ts`: `id`,
  `platformRole`, `companyRole`, `companyId`, `companySlug`, `customerOrgId`,
  `customerOrgSlug`, `customerOrgRole`. **Do not cast** — `session.user as any`
  is no longer needed anywhere.
- SUPER_ADMIN has `companyId: null` — handle explicitly in `(company)` routes
- Order creation NEVER trusts client `companyId`; it is derived from session `customerOrgId`
- `requireRole` throws; map with `toHttpError` from `src/lib/rbac.ts` in route handlers
- Never merge `companyRole` and `platformRole` into one variable — check the
  dimension the rule belongs to (`knowledge-base/roles-and-tenancy.md`)

---

## Decimal Serialization Rule

**Never pass Prisma Decimal directly to Client Components**. Convert at Server Component boundary:

```ts
// In Server Component (RSC)
const orders = await prisma.order.findMany({...});
const serialized = orders.map(o => ({
  ...o,
  subtotal: o.subtotal.toString(),
  taxAmount: o.taxAmount.toString(),
  discountAmount: o.discountAmount.toString(),
  total: o.total.toString(),
  items: o.items.map(i => ({
    ...i,
    lengthM: i.lengthM?.toString(),
    unitPrice: i.unitPrice.toString(),
    lineTotal: i.lineTotal.toString(),
  })),
}));
// Pass `serialized` to Client Component
```

---

## Testing / Verification

No test suite configured. Verify manually:

1. `npm run db:push && npm run db:seed`
2. `npm run dev`
3. Login as `admin@acme.test` / `Gzf!Dobav#2026Kr4pN8` → dashboard loads (companyId present)
4. Login as `superadmin@glazeflow.app` / `Gzf!Plat#2026Qx7mR2` → should redirect or show admin view (companyId null)
5. Login as `bob@customers.test` / `Gzf!Kupac#2026Hd6qP9` at `http://bob.localhost:3000` → tenant storefront loads
6. Check `/dashboard/orders/[id]` — Decimal fields render as strings, no console errors

Full seed credential table: `docs/roles.md` § 6.

---

## Environment

- `.env` contains `DATABASE_URL="file:./dev.db"`, `NEXTAUTH_SECRET`
- **The live dev database is `prisma/dev.db`.** `file:./dev.db` resolves
  relative to `prisma/`, not the repo root. A zero-byte `dev.db` also sits in
  the root — `sqlite3 dev.db` from the root opens the wrong, empty file.
- Dev runs on `localhost:3000`. Tenant storefronts are at
  `http://<tenant-slug>.localhost:3000` — the slug comes from `CustomerOrg.slug`
  (seed tenant: `bob`, so `http://bob.localhost:3000`).
  **`http://acme.localhost:3000` does not work** — `acme` is the main company's
  slug, not a tenant, and that host returns 404.
- Add new dev origins to `next.config.ts` → `allowedDevOrigins`

## Database: SQLite today, PostgreSQL in production

The schema runs on **SQLite** in development (`prisma/schema.prisma:7`). The
product documentation names PostgreSQL (Neon or Supabase) as the production
target. The move is **not started**.

Before touching `datasource`, `Decimal` handling, or the deployment target,
read **`docs/postgres-migration.md`**. The short version: Prisma enums become
native Postgres enums, and **SQLite does not enforce foreign keys by default**
(`PRAGMA foreign_keys` is `0` on the dev database), so existing data can contain
orphans that Postgres will reject on the first write.

## MCP servers

Two servers are configured in `.mcp.json` (and mirrored in `.vscode/.mcp.json`):

| Server          | Transport | Endpoint                                                     |
| --------------- | --------- | ------------------------------------------------------------ |
| `supabase`      | HTTP      | `http://127.0.0.1:54321/mcp` — the local Supabase stack      |
| `next-devtools` | stdio     | `npx -y next-devtools-mcp@latest` — Vercel's official server |

**`next-devtools`** talks to the running dev server. `nextjs_index` discovers
the server and its tools; `nextjs_call` invokes them. `get_errors` returns
config and session errors; `get_routes` maps the App Router; `get_logs` returns
the dev log path. `get_request_insights` needs
`experimental.requestInsights = true` in `next.config.ts` plus a dev restart —
it is **off by default**, and the flag exists in Next 16.3.3
(`node_modules/next/dist/server/config-schema.js`).

**`supabase`** points at the **local** stack, not a hosted project. Verify with
`get_project_url` before running `apply_migration` — it writes to whatever it
is pointed at. The local Postgres has **zero tables in `public`**; the app runs
on SQLite, so these tools see a different database than the application does.
The stack is managed with the Supabase CLI (`supabase start`, `supabase stop`,
`supabase status`); `supabase/config.toml` does not exist yet, so
`supabase init` has never been run in this repo.
