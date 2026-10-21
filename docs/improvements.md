# Technical Risks and Improvement Plan

> **Status: live plan, re-verified against the code on 2026-10-21.**
> Everything below was checked against the current source. Claims that used to be
> wrong have been removed, not reworded.
>
> For the verified security holes with `file:line`, read
> `knowledge-base/auth-gaps.md`. This file is the _plan_; that file is the
> _evidence_.
>
> There is no test suite in this repo. Verification is `npm run build` plus a
> manual check of the changed path.

---

## 1. Where the code actually stands

| Area               | State today                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**           | NextAuth v4 credentials + JWT. Session claims in `src/lib/auth.ts:66-92`. `requireRole` in `src/lib/rbac.ts:8` throws; only 3 of 13 call sites wrap it with `toHttpError`. 56 uses of `as any` in `src/`.                                                                               |
| **API validation** | No schema-validation library (`zod` is not a dependency). Hand-written checks exist where they matter: slug regex at `src/app/api/tenants/route.ts:60`, role whitelist at `src/app/api/register/route.ts:30`. Most routes validate nothing.                                             |
| **Order creation** | `prisma.order.create` at `src/app/api/orders/route.ts:151` writes the order, its items, panes, hardware, processing and status history in one **nested create**. No explicit `$transaction` — the nested create is atomic on its own, but the notification fan-out that follows is not. |
| **Real-time**      | Typed contracts in `src/lib/events.ts`, transport in `src/lib/realtime.ts`, persistence in `src/lib/notifications.ts`. SSE endpoint at `src/app/api/notifications/stream/route.ts` with a 25 s heartbeat. `publishToUsers` is called from 3 route handlers.                             |
| **Error handling** | No `error.tsx` or `global-error.tsx` anywhere in `src/app`. Route handlers return ad-hoc `{ error }` JSON with inconsistent status codes.                                                                                                                                               |
| **Testing**        | None. No `vitest`, no `playwright`, no test files.                                                                                                                                                                                                                                      |
| **CI**             | None. No `.github/workflows/`.                                                                                                                                                                                                                                                          |
| **Type safety**    | `as any` in 56 places, mostly `session.user as any`. No shared session type.                                                                                                                                                                                                            |

### Two claims that were previously wrong here — now corrected

- ~~`Order.orderNumber` needs a unique constraint.~~ **Already there** —
  `prisma/schema.prisma:368` declares `orderNumber String @unique`. What remains
  is that the number is random (`GF-<year>-<6 digits>`), so collisions are
  possible at scale and the sequence is not sortable. See item 3.2 below.
- ~~Fix the glass pane price calculation (`orders/route.ts:142`).~~ **There is no
  bug there.** The route sends `baseThicknessMm`, `thicknessMm` and
  `thicknessSurchargePercentPerMm` per pane
  (`src/app/api/orders/route.ts:93-105`), and `src/lib/pricing-engine.ts:39-41`
  computes `extra = max(0, thicknessMm - baseThicknessMm)` times the surcharge
  percentage. The math is correct.

---

## 2. Open security work

These are the highest-value items, and they are not "improvements" — they are
open holes. The full list with severities is in `knowledge-base/auth-gaps.md`.

| #   | Hole                                                                 | Where                                                   | Severity |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------- | -------- |
| 1   | Unauthenticated pricing endpoint                                     | `src/app/api/pricing/quote/route.ts:4`                  | High     |
| 2   | `GET /api/orders` returns every order when the session has no org id | `src/app/api/orders/route.ts:11-16`                     | High     |
| 3   | Order items can reference another company's catalog                  | `src/app/api/orders/route.ts:88-126`                    | High     |
| 4   | `companyRole` and `platformRole` conflated                           | `src/app/api/orders/[id]/status/route.ts:13`            | High     |
| 5   | Cross-tenant transition approval                                     | `src/app/api/orders/transitions/[id]/route.ts:13-18,34` | High     |
| 6   | `assertSameCompany` has zero call sites                              | `src/lib/rbac.ts:16`                                    | Medium   |
| 7   | Uncaught `requireRole` throws return 500                             | 10 of 13 call sites                                     | Medium   |
| 8   | `platformRole` is client-supplied on user creation                   | `src/app/api/companies/[id]/users/route.ts:59`          | Medium   |
| 9   | `GET /api/tenants` omits the main-company check                      | `src/app/api/tenants/route.ts:8-35`                     | Medium   |
| 10  | Session cookie is not `Secure` in production                         | `src/lib/auth.ts:27`                                    | Low      |

---

## 3. Structured plan

### Phase 1 — Foundation

1. **Close the 10 auth gaps.** Start with 1, 2, 3 and 5 — each one is a
   cross-tenant read or write. Fix 4 and 8 by never merging role dimensions and
   never accepting `platformRole` from a request body.
2. **Wrap the remaining `requireRole` calls** in `try/catch` + `toHttpError`,
   so a rejected role returns 401/403 instead of a 500 with a stack trace.
3. **Introduce a shared session type** so `session.user as any` becomes
   `session.user.companyRole` with real types. 56 occurrences today.
4. **Add request validation** with a small schema library at the route
   boundary, starting with `POST /api/orders` and `POST /api/pricing/quote`.
5. **Call `assertSameCompany`** in the order and catalog routes that compare a
   resource's owner against the session.
6. **Add `src/app/error.tsx` and `src/app/global-error.tsx`** so a server
   component throw renders a recoverable shell instead of a blank page.

### Phase 2 — Order pipeline

1. **Wrap the notification fan-out** after `prisma.order.create`
   (`src/app/api/orders/route.ts:212-224`) in a transaction, or accept partial
   notifications and retry.
2. **Replace the random order number** with a per-year sequence or a
   collision-resistant id. The unique constraint already exists; the generator
   is the weak part.
3. **Extract an order service** (`OrderService.create`, `OrderService.updateStatus`)
   so pricing, persistence and event publication live in one place instead of
   inside a 200-line route handler.
4. **Add `serializeOrder()` / `serializeOrderItem()`** helpers. The `.toString()`
   pattern for Prisma `Decimal` fields is currently copy-pasted at each
   Server→Client boundary; see `src/app/(company)/dashboard/orders/[id]/page.tsx:103-104,114`.
5. **Add audit logging** for status changes, messages and user creation. There
   is no audit trail today.

### Phase 3 — Client architecture

1. **Split `src/components/order-wizard/OrderWizard.tsx`** (689 lines) into
   step components. It currently holds all 8 wizard steps in one file.
2. **Replace `router.refresh()`** (2 call sites) with granular invalidation
   where it is worth the dependency.
3. **Add explicit loading / error / empty states** across the dashboard and
   storefront surfaces.

### Phase 4 — Quality and observability

1. **Set up Vitest** first, focused on `src/lib/pricing-engine.ts` and
   `src/lib/status-transitions.ts` — both are pure functions with real
   branching, which is exactly what unit tests are cheapest for.
2. **Then add Playwright** for the three critical paths: login, order creation
   with a live quote, and the status-approval chain.
3. **Add CI** — lint → typecheck → test → build. There is no `.github/workflows/`
   directory today.
4. **Enable `experimental.requestInsights`** in `next.config.ts` and read it
   through the `next-devtools` MCP server. See `docs/agents-when-load.md`.
5. **Add structured logging** with correlation ids, and a health-check endpoint.

---

## 4. Open decisions

These need a product or architecture call, not just code.

1. **Real-time granularity** — keep `router.refresh()` (simple, two call sites)
   or introduce a query cache (granular, new dependency)?
2. **State management** — a server-state library, or the current manual fetch
   plus `useState`? Only worth revisiting if the dashboard grows.
3. **Database target** — the schema is written for SQLite today but the product
   documentation names PostgreSQL. See `docs/postgres-migration.md`; this is the
   largest unstarted piece of work in the repo.
4. **Per-tenant catalog assignment** — the business wants it, the code does
   not have it. It needs a join table, a `getTenantCatalog` filter, a
   server-side check on order creation, and an admin UI. See
   `knowledge-base/roles-and-tenancy.md` § "What is not implemented".
