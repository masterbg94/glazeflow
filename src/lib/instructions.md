# `src/lib` Instructions

## Module responsibilities

- `auth.ts`: NextAuth credentials provider, JWT claims, session mapping, cookie setup.
- `rbac.ts`: platform roles, authentication/permission errors, company and tenant
  assertions, and the typed `getSessionUser()` helper.
- `tenant.ts`: active company lookup and active catalog loading by slug.
- `pricing-engine.ts`: pure pricing functions with no database or network access.
- `validation.ts`: request-body validation for the order pipeline. Pure, no I/O.
- `status-transitions.ts`: the transition matrix — the single source of truth,
  imported by both the server routes and the Kanban client.
- `events.ts`: typed server and client real-time event contracts and guards.
- `realtime.ts`: server-side event delivery.
- `notifications.ts`: notification persistence and publication.
- `prisma.ts`: Prisma client singleton.
- `email.ts`: Resend integration, HTML escaping, and development fallback.
- `utils.ts`: shared currency formatting.

## Pricing contract

`calcItemPricing` supports `GLASS_ONLY`, `RAW_PROFILE`, `FINISHED_WINDOW`,
`FINISHED_DOOR`, and `HARDWARE`. Window/door/glass calculations use square meters;
profiles use perimeter meters or raw length; hardware and processing use quantities
or fixed sell prices. Apply the template complexity multiplier, round unit price and
line total to two decimals, then use `calcTotals` for discount, tax, and total.

Derive the line total from the **unrounded** base. Rounding the unit first and
then multiplying drifts by up to `quantity × 0.005`.

Keep pricing deterministic and reusable on both client and server. Never add database
lookups, session reads, or side effects to the pricing engine.

The engine is pure and trusts its caller. Every numeric input must be validated
by `validation.ts` before it reaches `calcItemPricing` — a negative quantity
produces a negative-value order.

## Auth and tenant safety

Session claims include `uid`, `platformRole`, `companyId`, `companySlug`, and
`customerOrgId`. The session user is fully typed via `src/types/next-auth.d.ts` —
do not cast it. A `SUPER_ADMIN` is platform-scoped and normally has no
`companyId`; company roles must never access another tenant.

Keep the two role dimensions apart. `platformRole` is the access level,
`companyRole` is the job inside the main company. Merging them into one string
grants admin rights to a `COMPANY_STAFF` user holding
`companyRole: COMPANY_ADMIN`. Use `effectiveUserRole()` from
`status-transitions.ts` to resolve the actor's role.

Use `requireRole` plus resource-level ownership checks, and wrap `requireRole` in
`try/catch` with `toHttpError` so a rejected role returns 401 or 403 rather
than a 500.

Tenant scope compares `customerOrgId`, never `companyId` — a tenant user's
`companyId` is the main company, so that comparison passes for every tenant.

## Real-time safety

Use `ServerRealtimeEvent` and `ClientRealtimeEvent` rather than ad-hoc event names.
Convert `Date` values to strings at the client boundary. Extend event unions and
guards together. Avoid duplicate refreshes or silently swallowing stream errors.
