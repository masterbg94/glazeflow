<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# GlazeFlow MVP — Agent Instructions

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
**Fix**: Serialize Decimal → string/number before passing to client components. Pattern in `src/app/(company)/dashboard/orders/[id]/page.tsx:105-106`:
```ts
{item.unitPrice.toString()}  // Decimal → string
{order.total.toString()} {order.currency}
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

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Build (includes prisma generate) | `npm run build` |
| DB push (schema → sqlite) | `npm run db:push` |
| Seed DB | `npm run db:seed` |
| Prisma Studio | `npm run db:studio` |
| Lint | `npm run lint` |
| Format check | `npm run format:check` |
| Format write | `npm run format` |

---

## Architecture Notes

- **Next.js 15** (App Router, Server Components default)
- **NextAuth v4** (Credentials provider, JWT strategy)
- **Prisma** + SQLite (dev), PostgreSQL (prod likely)
- **Multi-tenant**: `Company` = tenant; users have `companyId` (staff) or `customerOrgId` (customers)
- **Route groups**: `(company)` = supplier dashboard, `(storefront)` = customer portal, `(auth)` = login/register, `(platform)` = super-admin

---

## Session / Auth Patterns

- `getSession()` from `src/lib/auth.ts` returns server session
- User object extended with: `platformRole`, `companyId`, `companySlug`, `customerOrgId`, `id`
- **Always cast**: `const user = session?.user as any` before accessing custom fields
- SUPER_ADMIN has `companyId: null` — handle explicitly in `(company)` routes

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