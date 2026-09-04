# GlazeFlow B2B Glass & PVC Ordering System

## Instruction loading order

Load repository instructions before researching or editing:

1. Root `AGENTS.md` — repository rules, known issues, commands, and environment.
2. `.agents/instructions/app-instructions.md` — GlazeFlow-wide mission and safety
   rules.
3. Nearest scoped `instructions.md` for each area involved:
   - `src/app/instructions.md` for `src/app/**`
   - `src/lib/instructions.md` for `src/lib/**`
   - `prisma/instructions.md` for `prisma/**`
   - `docs/instructions.md` for `docs/**`
4. For cross-cutting work, load every matching scoped file. Scoped instructions
   supplement, never replace, root instructions.
5. Then read implementation and product docs. Code and `prisma/schema.prisma`
   determine implemented behavior; docs describe intent and known gaps.

For question-only work, use same loading order for relevant areas, but remain
read-only. `.agents/skills/**` is excluded; those files are optional agent skills,
loaded only when runtime activates matching skill.

## Project Overview
Full-stack Next.js 14 app router application for B2B glass/PVC ordering. Multi-tenant SaaS with platform-level admin and company-level tenants.

## Directory Structure
- `src/app/` — Next.js app router pages and routes
  - `(auth)/` — Public auth routes (login, register)
  - `(storefront)/` — Customer-facing catalog and ordering
  - `(company)/dashboard/` — Company internal operations
  - `(platform)/admin/` — Platform-wide administration
  - `api/` — Route handlers (auth, catalog, companies, orders, notifications, pricing)
- `src/lib/` — Shared utilities and business logic
  - `prisma.ts` — Prisma client singleton with development logging
  - `auth.ts` — NextAuth.js configuration with credentials provider
  - `rbac.ts` — Role-based access control (SUPER_ADMIN | COMPANY_ADMIN | COMPANY_STAFF | CUSTOMER)
  - `tenant.ts` — Company lookup by slug, includes active glass/PVC/profiles/templates
  - `utils.ts` — `classNames()` helper, `formatCurrency()`
  - `email.ts` — Resend email sending with dev fallback
  - `pricing-engine.ts` — Pure pricing calculations (no DB calls)
- `prisma/` — Database schema and seeding
  - `schema.prisma` — Defines Company, User, GlassType, PvcProfile, HardwareItem, Order, OrderItem, etc.
  - `seed.ts` — Creates superadmin user and sample company Acme Glass

## Key Conventions

### Authentication (next-auth)
- Strategy: `jwt` stored in cookies
- Callbacks: `jwt` populates `platformRole`, `companyId`, `companySlug`, `customerOrgId`, `uid`
- `session` callback mirrors token claims to `session.user`
- Middleware (`src/middleware.ts`): Guards `/dashboard` and `/admin` paths; redirects unauthenticated; checks `platformRole` for admin vs company routes
- Token claims available: `token.platformRole`, `token.companyId`, `token.companySlug`, `token.customerOrgId`, `token.uid`

### Authorization (rbac.ts)
- `requireRole(allowed: Role[])` — Throws `UnauthorizedError` if not authenticated, `ForbiddenError` if role not in allowed list
- `assertSameCompany(sessionCompanyId, resourceCompanyId)` — Throws `ForbiddenError` if cross-tenant access
- Roles: `SUPER_ADMIN` (all), `COMPANY_ADMIN` (own company), `COMPANY_STAFF` (own company), `CUSTOMER` (limited)

### Pricing Engine (pricing-engine.ts)
- Pure functions, no DB/network calls — usable client-side and server-side
- Interfaces: `GlassPaneInput`, `HardwareInput`, `PricedItem`
- Functions: `areaSqm()`, `perimeterM()`, `glassPanePrice()`, `calcItemPricing()`, `calcTotals()`
- `calcItemPricing()` handles kinds: `GLASS_ONLY`, `RAW_PROFILE`, `FINISHED_WINDOW`, `FINISHED_DOOR`, `HARDWARE`
- `calcTotals()` computes subtotal, discount, tax, total

### Database (Prisma)
- SQLite in development, configurable for production
- Key models: `Company`, `User`, `GlassType`, `PvcProfile`, `HardwareItem`, `ProductTemplate`, `ProcessingOption`, `PriceList`, `Order`, `OrderItem`, `Notification`, `OrderMessage`
- `Company` has one-to-many: `users`, `customerOrgs`, `glassTypes`, `pvcProfiles`, `hardwareItems`, `productTemplates`, `processingOptions`, `priceLists`, `orders`
- `User` belongs to `Company` via `companyId`, optional `customerOrgId`
- Enums: `PlatformRole`, `ProductKind`, `GlazingLayers`, `OrderStatus`, `OrderItemStatus`, `NotificationEvent`

### API Routes (src/api/)
- `/api/auth/[...nextauth]` — NextAuth.js endpoint
- `/api/catalog` — Glass/PVC product data
- `/api/companies` — Company management
- `/api/orders` — Order CRUD with item management
- `/api/notifications` — Notification handling
- `/api/pricing` — Price quotes
- `/api/register` — User registration

### Frontend Patterns
- `app/layout.tsx` — Root layout wraps `NotificationProvider`
- Global styles in `src/app/globals.css`
- Tailwind CSS configured in `tailwind.config.ts`
- Components are Next.js Server Components by default; add `"use client"` for interactivity
- Navigation: `next/link` for client-side navigation
- Cart context (from user memory): `CartProvider`/`useCart` in `app/cart/CartContext.tsx`

## Development Setup
1. Install dependencies: `npm install`
2. Environment variables: Copy `.env` and set `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`
3. Run migrations: `npx prisma migrate dev`
4. Seed database: `npx prisma db seed`
5. Start dev server: `npm run dev`

## Key Files to Modify
- `src/middleware.ts` — Adjust auth guards and route prefixes
- `src/lib/auth.ts` — Add/remove OAuth providers
- `src/lib/pricing-engine.ts` — Extend pricing kinds/formulas
- `prisma/schema.prisma` — Add new models or change enums
- `src/app/(storefront)/[companySlug]/page.tsx` — Customer catalog UI
- `src/app/(company)/dashboard/page.tsx` — Company dashboard UI
- `src/app/(platform)/admin/page.tsx` — Platform admin UI

## Common Tasks
- **Add new glass type**: Modify `prisma/schema.prisma` → `prisma/seed.ts` → run `npx prisma migrate dev` → `npx prisma db seed`
- **New pricing kind**: Extend `calcItemPricing()` switch statement in `pricing-engine.ts`
- **New API endpoint**: Add route handler in `src/api/` → add TypeScript types → integrate with frontend
- **Role-based access**: Use `requireRole(['SUPER_ADMIN'])` or `requireRole(['COMPANY_ADMIN', 'COMPANY_STAFF'])` in server components/actions
- **Cross-tenant protection**: Call `assertSameCompany(session.user.companyId, resource.companyId)` before CRUD operations

## Deployment Notes
- Set `NODE_ENV=production` — Prisma logging reduces to `['error']`
- Ensure `NEXTAUTH_SECRET` is a strong random string
- Configure `NEXTAUTH_URL` to match production domain
- Set `DATABASE_URL` to production database (PostgreSQL recommended over SQLite)
- Environment variables prefix: `NEXT_PUBLIC_` variables are exposed to browser; keep secrets without prefix