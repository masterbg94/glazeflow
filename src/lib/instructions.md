# `src/lib` Instructions

## Module responsibilities

- `auth.ts`: NextAuth credentials provider, JWT claims, session mapping, cookie setup.
- `rbac.ts`: platform roles, authentication/permission errors, company assertions.
- `tenant.ts`: active company lookup and active catalog loading by slug.
- `pricing-engine.ts`: pure pricing functions with no database or network access.
- `events.ts`: typed server and client real-time event contracts and guards.
- `realtime.ts`: server-side event delivery.
- `notifications.ts`: notification persistence and publication.
- `prisma.ts`: Prisma client singleton.
- `email.ts`: Resend integration and development fallback.
- `utils.ts`: shared formatting and class-name helpers.

## Pricing contract

`calcItemPricing` supports `GLASS_ONLY`, `RAW_PROFILE`, `FINISHED_WINDOW`,
`FINISHED_DOOR`, and `HARDWARE`. Window/door/glass calculations use square meters;
profiles use perimeter meters or raw length; hardware and processing use quantities
or fixed sell prices. Apply the template complexity multiplier, round unit price and
line total to two decimals, then use `calcTotals` for discount, tax, and total.

Keep pricing deterministic and reusable on both client and server. Never add database
lookups, session reads, or side effects to the pricing engine.

## Auth and tenant safety

Session claims include `uid`, `platformRole`, `companyId`, `companySlug`, and
`customerOrgId`. Prefer typed session helpers. A `SUPER_ADMIN` is platform-scoped
and normally has no `companyId`; company roles must never access another tenant.
Use `requireRole` plus resource-level company ownership checks.

## Real-time safety

Use `ServerRealtimeEvent` and `ClientRealtimeEvent` rather than ad-hoc event names.
Convert `Date` values to strings at the client boundary. Extend event unions and
guards together. Avoid duplicate refreshes or silently swallowing stream errors.
