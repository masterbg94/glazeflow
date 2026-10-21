# Order Lifecycle

## Statuses

Schema enum `OrderStatus` (`prisma/schema.prisma:67-76`):

```
NEW · QUOTE_AMENDMENT · CONFIRMED · IN_PRODUCTION · READY · DELIVERED · CLOSED · CANCELLED
```

The pipeline order used for forward/backward comparison is
`src/lib/status-transitions.ts:3-12`. `CANCELLED` sits outside the pipeline.

> `docs/instructions.md:40` states the correct name. The schema enum is
> `QUOTE_AMENDMENT`. Same for the event `NotificationEvent.QUOTE_AMENDED`.

`Order.paymentStatus` (`UNPAID` · `INVOICED` · `PAID`) is a separate axis.
`/finance` counts orders that are `DELIVERED` or `CLOSED` and not `PAID`.

## Who can move what

`getTransitionRule(userRole, fromStatus, toStatus, platformRole)` in
`src/lib/status-transitions.ts:78-154` is the single decision function.

| Actor                             | Forward | Backward | Cancel                | Approval needed |
| --------------------------------- | ------- | -------- | --------------------- | --------------- |
| `SUPER_ADMIN`                     | yes     | yes      | yes                   | no              |
| `companyRole: COMPANY_ADMIN`      | yes     | yes      | yes                   | no              |
| `companyRole: COMPANY_PRODUCTION` | yes     | request  | request               | `COMPANY_ADMIN` |
| `companyRole: COMPANY_SALES`      | yes     | request  | request               | `COMPANY_ADMIN` |
| `platformRole: COMPANY_STAFF`     | yes     | request  | request               | `COMPANY_ADMIN` |
| `platformRole: CUSTOMER`          | no      | no       | own order while `NEW` | no              |

"Forward" means a later index in `STATUS_ORDER`. "Backward" means an earlier one.

### The approval chain

When a rule has `requiresApproval: true`, the API does **not** change the order
status. It creates an `OrderStatusTransition` row:

```
OrderStatusTransition
  orderId, requestedBy, fromStatus, toStatus, reason
  status = PENDING
```

`src/app/api/orders/[id]/status/route.ts:56-90` writes this row and notifies
approvers. Approvers are main-company users whose `companyRole` is in
`rule.approverRoles` (`src/app/api/orders/[id]/status/route.ts:80`).

An approver acts on `PATCH /api/orders/transitions/[id]` with
`action: 'approve' | 'reject'`. Approve runs inside a `$transaction` that
updates both the transition row and the order status
(`src/app/api/orders/transitions/[id]/route.ts:38-60`).

`src/lib/status-transitions.ts:69-76` resolves approver roles. For a tenant
user it returns `['COMPANY_ADMIN']`; for main-company staff the same. The
lookup in the API filters `companyId: order.companyId`, which is the main
company — correct for main-company staff, but see `auth-gaps.md` #5 for the
tenant-`companyRole` hole.

### Order status history

`OrderStatusHistory` records every status change with `fromStatus`, `toStatus`,
`changedBy`, `note`, `createdAt`. It is written on the direct-change path and on
the approval path. The order detail page renders it as a timeline.

## Order creation

`POST /api/orders` (`src/app/api/orders/route.ts:25`).

Flow:

1. `getSession()`; `platformRole` must be `CUSTOMER` (403 otherwise). **Only
   tenants create orders** — main-company staff cannot order on a tenant's behalf.
2. `customerOrgId` must be present in the session (401 otherwise).
3. `companyId` is derived from `customerOrg.companyId`, **never** read from the
   request body (`src/app/api/orders/route.ts:43-57`).
4. Load the tenant's `PriceList.discountPercent` and active
   `CustomerPriceOverride[]`.
5. For each submitted item, look up catalog rows and price them with the
   per-tenant override applied.
6. `calcTotals` computes subtotal → discount → tax → total.
7. Create the order with `status: NEW`, `paymentStatus: UNPAID`, the computed
   totals, nested items, panes, hardware, processing, and a first
   `OrderStatusHistory` row.
8. Notify every main-company user with `platformRole` in
   `['COMPANY_ADMIN', 'COMPANY_STAFF']` and `companyId` = the main company
   (`src/app/api/orders/route.ts:212-225`). Email is sent too.

### Order number

`GF-<year>-<6 random digits>` (`src/app/api/orders/route.ts:149`). Random, not
sequential — do not assume ordering by number.

### Known creation gaps

- Catalog lookups are not filtered by `companyId` and not filtered by
  `isActive` (`src/app/api/orders/route.ts:88-126`). A tenant can order another
  company's product or a deactivated one.
- `ProductTemplate` min/max dimensions are never enforced, even though the
  template carries them and the storefront ships them to the client.
- No validation of `items` shape, quantities, or dimension sanity. Negative or
  absurd values are not rejected.

## Order items

`OrderItem` (`prisma/schema.prisma:419-452`):

| Field                        | Meaning                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `productKind`                | `GLASS_ONLY` · `RAW_PROFILE` · `FINISHED_WINDOW` · `FINISHED_DOOR` · `HARDWARE` |
| `templateId`                 | `ProductTemplate` — supplies `complexityMultiplier`                             |
| `widthMm` / `heightMm`       | For glass, window, door                                                         |
| `lengthM`                    | For raw profile                                                                 |
| `quantity`                   | Integer multiplier, default 1                                                   |
| `profileId` / `profileColor` | PVC profile and its colour                                                      |
| `glazingLayers`              | `SINGLE` · `DOUBLE` · `TRIPLE`                                                  |
| `airGapMm`                   | Default 16                                                                      |
| `gasFill`                    | Default `'air'`                                                                 |
| `unitPrice` / `lineTotal`    | **Snapshot** at order time                                                      |
| `status`                     | `PENDING` · `ACCEPTED` · `REJECTED`                                             |

Nested children: `OrderItemGlassPane`, `OrderItemHardware`, `OrderItemProcessing`.

### The price snapshot

`unitPrice` and `lineTotal` are written onto the item at creation and are never
recomputed. Later catalog price changes do not affect existing orders. Changing
a price after submission is meant to go through the `QUOTE_AMENDMENT` status,
not a silent re-price. `docs/Business Logic.md` §3.4 states this as a critical
business rule.

`OrderItem.status` (`PENDING` / `ACCEPTED` / `REJECTED`) is separate from the
order status and is not written by the order-creation path — it stays
`PENDING` until something else sets it. No code path currently sets it to
`ACCEPTED` or `REJECTED`.

## Communications

| Table             | Purpose                                                                               |
| ----------------- | ------------------------------------------------------------------------------------- |
| `OrderMessage`    | Thread between the tenant and the main company on one order                           |
| `OrderAttachment` | Drawing, photo, purchase order, or other file, optionally attached to a specific item |
| `Notification`    | Per-user notification with an `event` enum, tied to an order                          |

`OrderMessage` access is checked by `canAccessOrder()` at
`src/app/api/orders/[id]/messages/route.ts:70-80`.

## Notifications and real-time

`src/lib/notifications.ts` `notify()` does three things:

1. Writes a `Notification` row.
2. Publishes a `notification` event to that user's SSE clients.
3. Optionally sends email via `src/lib/email.ts` (Resend, with a dev fallback).

`src/lib/realtime.ts` holds an in-memory `Map<userId, Set<SseClient>>`. The
transport is SSE at `GET /api/notifications/stream`.

Event names are typed in `src/lib/events.ts` — exactly three server events:

| Event          | Payload                                                 |
| -------------- | ------------------------------------------------------- |
| `notification` | The created notification                                |
| `message:add`  | The new message plus its author                         |
| `order:update` | Order id, status, order number, notes, shipping address |

Use `publishToUsers(userIds, event, payload)` from `src/lib/realtime.ts:64`.
Extend the unions and the type guards in `src/lib/events.ts` together — the
client's `isClientRealtimeEvent` guard whitelists event names literally.

### Ordering of side effects

The established pattern in route handlers is: **update the database first, then
publish the event**. See `src/app/api/orders/[id]/status/route.ts` and
`src/app/api/orders/[id]/messages/route.ts`.

### Notification events

`NotificationEvent`: `ORDER_CREATED` · `ORDER_CONFIRMED` · `ORDER_STATUS_CHANGED`
· `QUOTE_AMENDED` · `ORDER_MESSAGE` · `ORDER_READY` · `STAFF_ASSIGNED`.

`NotificationRule` (`prisma/schema.prisma:600-612`) lets the main company route
an event to a `CompanyRole` over a `NotificationChannel`
(`IN_APP` · `EMAIL` · `BOTH`) with a frequency
(`IMMEDIATE` · `DAILY_DIGEST`).
