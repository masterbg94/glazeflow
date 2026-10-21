---
name: glazeflow-order-flow
description: Work on the order pipeline in GlazeFlow. Use when changing order creation, status transitions, the approval chain, order messages, notifications, real-time SSE events, the order wizard, the Kanban board, or any order-related API. Also use when a change touches OrderStatus, OrderStatusTransition, NotificationEvent, or the events module.
---

# Order flow

## The pipeline

```
NEW → QUOTE_AMENDMENT → CONFIRMED → IN_PRODUCTION → READY → DELIVERED → CLOSED
                                                                    ↘ CANCELLED
```

`OrderStatus` in `prisma/schema.prisma:67-76`. The comparable order lives in
`src/lib/status-transitions.ts:3-12`; `CANCELLED` sits outside it.

The enum name is `QUOTE_AMENDMENT` — the schema is authoritative. Older docs
said `QUOTE_REVISION` and have been corrected.

`paymentStatus` (`UNPAID` · `INVOICED` · `PAID`) is a separate axis. `/finance`
counts `DELIVERED` or `CLOSED` orders that are not `PAID`.

## The order creation path

`POST /api/orders` (`src/app/api/orders/route.ts:25`).

1. `platformRole` must be `CUSTOMER`. **Only tenants create orders** — main
   company staff cannot order on a tenant's behalf.
2. `customerOrgId` must be in the session.
3. `companyId` is derived from `customerOrg.companyId` — never from the body.
4. The tenant's `PriceList` discount and `CustomerPriceOverride[]` are loaded.
5. Catalog rows are looked up and priced with the override applied.
6. `calcTotals` produces subtotal, discount, tax, total.
7. The order is created with `status: NEW`, `paymentStatus: UNPAID`, the totals,
   nested items, panes, hardware, processing, and a first history row.
8. Main-company staff with `platformRole` in `['COMPANY_ADMIN', 'COMPANY_STAFF']`
   are notified — with email.

The order number is `GF-<year>-<6 random digits>`
(`src/app/api/orders/route.ts:149`). Random, not sequential. Do not sort by it.

### Known holes in this path

- Catalog lookups are **not** scoped by `companyId` and **not** filtered by
  `isActive` (`src/app/api/orders/route.ts:88-126`). A tenant can order another
  company's product, or a retired one.
- `ProductTemplate` dimension bounds are not enforced.
- No validation of item shape, quantity, or dimension sanity.

If you touch this path, scope the lookups:

```ts
const profile = await prisma.pvcProfile.findFirst({
  where: { id: item.profileId, companyId, isActive: true },
});
```

## Status transitions

`getTransitionRule(userRole, fromStatus, toStatus, platformRole)`
(`src/lib/status-transitions.ts:78-154`) is the single decision function. It
returns `{ allowed, requiresApproval, approverRoles }`.

| Actor | Forward | Backward | Cancel | Approval |
| --- | --- | --- | --- | --- |
| `SUPER_ADMIN` | yes | yes | yes | no |
| `companyRole: COMPANY_ADMIN` | yes | yes | yes | no |
| `companyRole: COMPANY_PRODUCTION` / `COMPANY_SALES` | yes | request | request | `COMPANY_ADMIN` |
| `platformRole: COMPANY_STAFF` | yes | request | request | `COMPANY_ADMIN` |
| `platformRole: CUSTOMER` | no | no | own order while `NEW` | no |

### The approval chain

When `requiresApproval` is true the status does **not** change. The API writes
an `OrderStatusTransition` row:

```
orderId, requestedBy, fromStatus, toStatus, reason, status = PENDING
```

`src/app/api/orders/[id]/status/route.ts:56-90` writes it and notifies
approvers — main-company users whose `companyRole` is in `rule.approverRoles`.

An approver calls `PATCH /api/orders/transitions/[id]` with
`action: 'approve' | 'reject'`. Approve runs in a `$transaction` that updates
both the transition row and the order status
(`src/app/api/orders/transitions/[id]/route.ts:38-60`).

Approvers are found by `companyRole`, so `COMPANY_SALES` and `COMPANY_PRODUCTION`
both qualify when the rule lists them.

### The role trap in this path

`src/app/api/orders/[id]/status/route.ts:13` computes
`userRole = user.companyRole || user.platformRole`, and
`status-transitions.ts:74-80` treats `COMPANY_ADMIN` as omnipotent. A
`COMPANY_STAFF` user with `companyRole: COMPANY_ADMIN` skips approval. The
approver lookup at `route.ts:80` filters `companyId` — correct for main-company
staff, but for a tenant user `companyId` is the main company, so a tenant
holding `companyRole: COMPANY_ADMIN` can approve any tenant's order
(`knowledge-base/auth-gaps.md` #5).

Tenant scoping must compare `order.customerOrgId === user.customerOrgId`.

## Real-time events

Three server event types, defined in `src/lib/events.ts`:

| Event | Payload |
| --- | --- |
| `notification` | The created notification |
| `message:add` | The message plus its author |
| `order:update` | Order id, status, order number, notes, shipping address |

Publish with `publishToUsers(userIds, event, payload)`
(`src/lib/realtime.ts:64`). The transport is SSE at
`GET /api/notifications/stream`, with an in-memory
`Map<userId, Set<SseClient>>` in `src/lib/realtime.ts:20-22`.

### Extending an event

Change the union **and** the guard together. The client's
`isClientRealtimeEvent` whitelists event names literally
(`src/lib/events.ts:110-118`) — a new event name that is not added there is
silently dropped on the client.

```ts
// src/lib/events.ts
export interface ClientOrderUpdateEvent { event: 'order:update'; payload: {...} }
export type ClientRealtimeEvent = ... | ClientOrderUpdateEvent;
// and add the name to the array in isClientRealtimeEvent
```

Also convert `Date` values to strings at the client boundary — the server types
carry `Date`, the client types carry `string`.

### Order of side effects

**Update the database first, then publish the event.** The established pattern
in `src/app/api/orders/[id]/status/route.ts` and
`src/app/api/orders/[id]/messages/route.ts`. Publishing first can deliver an
event for a write that then fails.

## Notifications

`notify()` in `src/lib/notifications.ts` does three things: writes a
`Notification` row, publishes the `notification` event, and optionally sends
email via `src/lib/email.ts` (Resend, with a dev fallback).

`NotificationEvent`: `ORDER_CREATED` · `ORDER_CONFIRMED` · `ORDER_STATUS_CHANGED`
· `QUOTE_AMENDED` · `ORDER_MESSAGE` · `ORDER_READY` · `STAFF_ASSIGNED`.

`NotificationRule` (`prisma/schema.prisma:600-612`) models event → target role →
channel → frequency, but **no code reads it**. Notification routing is hardcoded
per call site. Do not assume the rule table is live.

## The order wizard

`src/components/order-wizard/OrderWizard.tsx` — client component, eight steps:
kind → dimensions → template → profile → glass → hardware → processing →
review.

| Kind | Dimensions | Profile | Glass |
| --- | --- | --- | --- |
| `FINISHED_WINDOW` | w × h mm | yes | yes |
| `FINISHED_DOOR` | w × h mm | yes | yes |
| `GLASS_ONLY` | w × h mm | no | yes |
| `RAW_PROFILE` | length m | yes | no |

`HARDWARE` is in the `Kind` type but is not offered
(`OrderWizard.tsx:268`) and has no pricing branch.

Hardware and processing options are filtered by `applicableKinds`
(`OrderWizard.tsx:73-80`).

The live quote in `PriceSummary.tsx` shows unit and line price only — no tax, no
tenant discount. The server total is authoritative and will differ.

## The Kanban board

`src/components/dashboard/OrderKanban.tsx` — client component, columns are the
order statuses. Allowed next statuses are computed client-side from the
session's roles (`OrderKanban.tsx:201-207`) and re-validated server-side at
`src/app/api/orders/[id]/status/route.ts:43-52`.

A status change that needs approval shows as a request, not an applied change.

## Checklist before finishing

- [ ] The status change goes through `getTransitionRule`, not a bespoke check.
- [ ] An approval-requiring move creates a transition request; it does not
      change the status.
- [ ] Tenant scope compares `customerOrgId`.
- [ ] The database write happens before the event publish.
- [ ] Any new event name is added to the union **and** the type guard.
- [ ] `Date` values are stringified at the client boundary.
- [ ] Prisma `Decimal` fields are stringified before reaching a client component.
- [ ] The client-side allowed-status list and the server rule still agree.

## Verify

```bash
npm run build
```

Then walk the pipeline: place an order as a tenant, move it forward as staff,
attempt a backward move as staff (expect a request, not an applied change),
approve it as an admin, and confirm the tenant sees the new status.
