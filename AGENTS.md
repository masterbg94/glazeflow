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
   only what the task needs — do not preload the whole base.
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

**Location**: `src/app/(company)/dashboard/page.tsx:7`, `src/app/(company)/dashboard/orders/page.tsx:7`
**Cause**: SUPER_ADMIN user (seed line 10-18) has no `companyId`. Session returns `companyId: null`. Prisma queries fail with `Argument companyId must not be null`.
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

`npm run lint` is **broken** — `next lint` was removed in Next.js 16 and the
script still calls it (`package.json:16`). It fails with
`Invalid project directory provided, no such directory: .../lint`. Use
`npm run build` for type checking. Fix the script or drop it; do not report a
lint run as passing.

There is no test suite configured. Verification is `npm run build` plus a manual
check of the changed path.

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

Full list with file:line in `knowledge-base/auth-gaps.md`. The ones most likely to
be hit by a change:

- `POST /api/pricing/quote` has **no** session check at all.
- `GET /api/orders` builds `where` from a possibly-undefined id; Prisma drops the
  key and the query returns **every order**.
- Order creation looks up catalog rows by bare id — no `companyId`, no `isActive`
  filter.
- `userRole = user.companyRole || user.platformRole` merges two enums; a
  `COMPANY_STAFF` user holding `companyRole: COMPANY_ADMIN` bypasses approval.
- Tenant scope must compare `order.customerOrgId === user.customerOrgId`. A tenant
  user's `companyId` is the main company, so a `companyId` comparison passes for
  every tenant's order.
- `assertSameCompany()` exists in `src/lib/rbac.ts` but is never called.
- 12 of 14 `requireRole` call sites let the throw escape → 500 instead of 401/403.
  Always wrap with `toHttpError`.

---

## Session / Auth Patterns

- `getSession()` from `src/lib/auth.ts` returns server session
- User object extended with: `platformRole`, `companyRole`, `companyId`, `companySlug`, `customerOrgId`, `customerOrgSlug`, `customerOrgRole`, `id`
- **Always cast**: `const user = session?.user as any` before accessing custom fields
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
3. Login as `admin@acme.test` / `Password123!` → dashboard loads (companyId present)
4. Login as `superadmin@glazeflow.app` / `Password123!` → should redirect or show admin view (companyId null)
5. Check `/dashboard/orders/[id]` — Decimal fields render as strings, no console errors

---

## Environment

- `.env` contains `DATABASE_URL="file:./dev.db"`, `NEXTAUTH_SECRET`
- Dev runs on `localhost:3000` + `acme.localhost:3000` (storefront via middleware)
- Add new dev origins to `next.config.ts` → `allowedDevOrigins`
