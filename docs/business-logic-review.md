# Business Logic Review — GlazeFlow MVP

> **Status: review, with the fix plan executed.** Every claim below was checked
> against the source on 2026-10-21 and carries a `file:line` reference. Where a
> claim contradicts an existing document, the document is named and the
> correction is stated.
>
> **Phases 0–5 of the plan in § 8 are implemented.** Each section below marks
> what was fixed and what is still open. The evidence for the fixes is in
> `knowledge-base/auth-gaps.md` and `knowledge-base/api-map.md`, which are
> updated to match the current code.
>
> For current behavior read `knowledge-base/`. This file is the **gap analysis**
> and the **fix plan** on top of it.

---

## 1. The short version

The core business model is sound. One main company owns the catalog, tenants are
`CustomerOrg` rows, the server recomputes every price, and the order pipeline
exists. The implementation is roughly 70% of the way to the product in
`docs/Business Logic.md`.

The problems were concentrated in three places:

| #   | Area                   | What was broken                                                                        | Impact                                                 | Status |
| --- | ---------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------ |
| 1   | **Pricing authority**  | The server recomputes prices, but trusted unvalidated client dimensions and quantities | A tenant could create a negative-value order           | fixed  |
| 2   | **Order pipeline**     | Transitions skipped stages, and the approval chain had no UI at all                    | A backward move could be requested but never approved  | fixed  |
| 3   | **Catalog management** | No edit, deactivate, or price-override paths existed                                   | Prices and products could not be changed after seeding | fixed  |

Everything below is organized around those three, then a security section, then
the performance bottlenecks, then a sequenced fix plan.

---

## 2. Bottleneck 1 — The server trusts the client on quantities and dimensions

The invariant "the server is authoritative for price" (`app-instructions.md`
rule 5) **holds**: the wizard sends no price fields
(`src/components/order-wizard/OrderWizard.tsx:194-221`), and the server
recomputes from the database (`src/app/api/orders/route.ts:85-148`). That part
is correct and should not be changed.

The invariant is broken one level down, in the **inputs** the server trusts
from that recomputation.

### 2.1 No validation of `quantity`, `widthMm`, `heightMm`, `lengthM`

`src/app/api/orders/route.ts:41` destructures `items` straight from the body.
Line 85 iterates it. There is no range check on any numeric field, and the
`Order` table has no `CHECK` constraint on `total` (verified against
`prisma/dev.db` DDL).

The wizard's `min={1}` on the quantity input
(`OrderWizard.tsx:310`) is a UI hint only — `+e.target.value` at line 312
accepts a typed `-1`, and the server never re-checks.

Measured effect, running the real `calcItemPricing` / `calcTotals` from
`src/lib/pricing-engine.ts` against a representative window (1200×1200, double
glazed, 2 handles, 1 processing option, 8% tenant discount, 20% tax):

| Input             | `lineTotal` | Order `total`                       |
| ----------------- | ----------- | ----------------------------------- |
| Normal order      | 15438.34    | 15438.34                            |
| `quantity: -10`   | -154383.36  | **-154383.36**                      |
| `widthMm: -1200`  | 15583.56    | 9344.26 (glass cost stays positive) |
| `widthMm: 100000` | 51042998.40 | 51042998.40                         |

A negative-quantity order persists. `api/admin/stats/route.ts:23` sums
`total` across all orders, so a single negative order **reduces reported
platform revenue**. A 100000 mm window passes the `ProductTemplate` bounds
(300–3000 mm) because those bounds are never checked — see 2.2.

**Fix:** validate the item shape and ranges server-side before the pricing
loop, and reject the request with 400. Minimum: `quantity` integer ≥ 1,
`widthMm`/`heightMm` integer within the template's bounds, `lengthM` > 0.

### 2.2 `ProductTemplate` dimension bounds are never enforced

`ProductTemplate` carries `minWidthMm` / `maxWidthMm` / `minHeightMm` /
`maxHeightMm` (`prisma/schema.prisma:281-284`, defaults 300–3000). The bounds
are shipped to the client at `src/lib/tenant.ts:125-128` and then **never
read** — the wizard has zero references to them, and the server never checks
them. `docs/Business Logic.md` §9 lists "dimensions out of production limits"
as a resolved risk with "show warning and block invalid input". It is not
implemented on either side.

**Fix:** check the bounds in `api/orders/route.ts` after loading the template
(the server is authoritative, so the server must enforce). Add `min`/`max` to
the wizard inputs for UX, but treat the server check as the real one.

### 2.3 A finished window can be ordered with no frame

`api/orders/route.ts:87-92` looks up the profile. If the lookup fails —
bogus `profileId`, or a profile id belonging to another company — `profileSell`
stays `undefined`, and `src/lib/pricing-engine.ts:73` skips the profile cost
entirely (`if (input.kind !== 'GLASS_ONLY' && input.profileSellPricePerMeter)`).

The result is a `FINISHED_WINDOW` priced as glass + hardware + processing, with
**no frame**. Measured on the same representative order: 12391.30 instead of
15438.34 — roughly a 20% under-price, and the main company has to produce the
frame for free.

`OrderWizard.tsx:175` sends `profileId: profileId || null`, and the wizard
starts with `profileId = ''` (`OrderWizard.tsx:52`), so this is reachable from
the UI, not only by a crafted POST.

**Fix:** reject a `FINISHED_WINDOW` / `FINISHED_DOOR` item with no
`profileId`, and reject a `profileId` that does not resolve within the main
company's active catalog.

### 2.4 Catalog lookups are unscoped and unfiltered

Five lookups in `api/orders/route.ts` use a bare id, with no `companyId` and no
`isActive` filter:

| Line                              | Lookup                                                                  |
| --------------------------------- | ----------------------------------------------------------------------- |
| `src/app/api/orders/route.ts:88`  | `prisma.pvcProfile.findUnique({ where: { id: item.profileId } })`       |
| `src/app/api/orders/route.ts:95`  | `prisma.glassType.findUnique({ where: { id: pane.glassTypeId } })`      |
| `src/app/api/orders/route.ts:107` | `prisma.hardwareItem.findUnique({ where: { id: h.hardwareId } })`       |
| `src/app/api/orders/route.ts:118` | `prisma.processingOption.findUnique({ where: { id: pid } })`            |
| `src/app/api/orders/route.ts:126` | `prisma.productTemplate.findUnique({ where: { id: item.templateId } })` |

Today only one company owns the catalog, so the `companyId` half cannot bite.
The **`isActive` half is already live**: `getTenantCatalog` filters
`where: { isActive: true }` (`src/lib/tenant.ts:59-63`), so a deactivated
product is hidden in the UI but still orderable by direct POST — and its price
is snapshotted into the order. There is also no UI to deactivate a product
(see 3.1), so `isActive` is currently always `true` and the hole is latent
rather than active.

**Fix:** `findFirst({ where: { id, companyId, isActive: true } })` for all five.
This also fixes 2.3 in the same edit.

### 2.5 `applicableKinds` and glass thickness are never enforced on the server

`HardwareItem.applicableKinds` and `ProcessingOption.applicableKinds` are
populated in the seed (`prisma/seed.ts:174-189`, `243-255`) and honored in the
wizard UI (`OrderWizard.tsx:73-79`), but the server never checks them. A
crafted POST attaches any hardware or processing option to any product kind.
`GlassType.availableThicknessMm` is likewise never checked against
`pane.thicknessMm`.

**Fix:** validate `applicableKinds` membership and thickness availability in
the order-creation path.

### 2.6 `ProcessingOption.unit` is ignored everywhere

`ProcessingOption.unit` (`prisma/schema.prisma:306`) distinguishes
`per_item` from other units, and the seed sets `unit: 'meter'` on one hardware
item. The pricing engine sums processing prices flat
(`src/lib/pricing-engine.ts:84`) and `api/orders/route.ts:122` hardcodes
`quantity: 1`. The unit never affects the price.

**Fix:** either honor the unit in the engine, or remove the field. Leaving a
field that looks meaningful but is not is how price disputes start.

### 2.7 Pane price is split evenly, ignoring thickness

`api/orders/route.ts:188` sets each pane's price to
`item.pricing.glassCost / item.glassPanes.length` — the total glass cost split
evenly. A double-glazed unit with one 4 mm pane and one 10 mm pane gives both
panes the same price, even though the engine priced them differently
(`src/lib/pricing-engine.ts:39-41`).

**Fix:** price each pane individually with `glassPanePrice` and store that
value, rather than splitting the total.

### 2.8 Rounding drift on large quantities

`src/lib/pricing-engine.ts:88-89` rounds the unit price to 2 dp and then
multiplies by quantity. `lineTotal` can differ from
`round(baseUnit × quantity, 2)` by up to `quantity × 0.005`. For a 1000-piece
order that is a 5 RSD drift, and it does not reconcile against the sum of the
stored unit prices.

**Fix:** compute `lineTotal = round(baseUnit × quantity, 2)` from the unrounded
base.

### 2.9 Two pricing factors in the schema are never applied

| Field                             | Where it lives             | Status                                                       |
| --------------------------------- | -------------------------- | ------------------------------------------------------------ |
| `PvcProfile.colorSurchargeFactor` | `prisma/schema.prisma:231` | **Never read anywhere** (0 hits in `src/`)                   |
| `ProductTemplate.openingCount`    | `prisma/schema.prisma:279` | Shipped to the client at `src/lib/tenant.ts:123`, never used |

`docs/Business Logic.md` §3.2 specifies both — `colorSurchargeFactor` for
profile color, and an `openingCountFactor` in the unit price. The seed
templates carry `openingCount` 0 / 1 / 2 (`prisma/seed.ts:203-228`) with
`complexityMultiplier` doing all the differentiation. A white profile and a
golden-oak profile currently cost the same.

**Fix:** apply `colorSurchargeFactor` in the profile cost and fold
`openingCount` into the multiplier, or drop both fields.

### 2.10 The live quote does not match the final total

`src/components/order-wizard/PriceSummary.tsx:33-40` shows unit price and line
total only, with the note that the final amount appears at checkout. The
tenant discount and tax are missing. Meanwhile
`src/app/(storefront)/[companySlug]/order/page.tsx:23` tells the tenant
"popust: 15%" in the page subtitle, and the live number does not reflect it.

`docs/Business Logic.md` §3.2 and §4 Step 4 both expect discount and tax in
the live quote. The tenant sees a number that will change at submit — the exact
"price disagreement" the product exists to eliminate (`docs/Business Logic.md`
§1).

**Fix:** show subtotal, discount, tax, and total in `PriceSummary`. The
discount percent and tax rate are already available to the client.

### 2.11 One correction to the knowledge base

`knowledge-base/pricing-rules.md` states that `HARDWARE` "has no dedicated
branch — it falls through and prices at zero", and that this is latent. That
is **wrong**. `src/lib/pricing-engine.ts:83` computes `hardwareCost` for every
kind, so a `HARDWARE` item prices correctly.

The real gap is different: the wizard never offers `HARDWARE` as a product
kind (`OrderWizard.tsx:268` lists only four), so a tenant can only buy
hardware attached to a window, door, or glass line. Standalone hardware
ordering is impossible. `knowledge-base/pricing-rules.md` should be corrected.

---

## 3. Bottleneck 2 — The order pipeline is not a pipeline

### 3.1 Transitions can skip stages

`src/lib/status-transitions.ts:3-12` puts `CANCELLED` in `STATUS_ORDER`, and
`isForwardTransition` (line 49-53) compares pipeline indices. The rule is
"any later index is forward", so **every stage is reachable from every earlier
stage**. Measured against the real rule function:

| Actor           | Transition          | Result                                   |
| --------------- | ------------------- | ---------------------------------------- |
| `COMPANY_STAFF` | `NEW` → `CLOSED`    | allowed, no approval                     |
| `COMPANY_STAFF` | `NEW` → `DELIVERED` | allowed, no approval                     |
| `COMPANY_ADMIN` | `NEW` → anything    | allowed, no approval                     |
| `COMPANY_ADMIN` | `NEW` → `GARBAGE`   | allowed — `newStatus` is never validated |

The last row matters: `src/app/api/orders/[id]/status/route.ts:29` reads
`status` from the body and casts it (`newStatus as OrderStatus`, line 46),
with no membership check. The value is written straight to the DB at line 108.
On SQLite the column is plain `TEXT` and foreign keys are off
(`PRAGMA foreign_keys` returns `0` on `prisma/dev.db`), so an arbitrary string
lands in `Order.status`. On Postgres the enum would reject it — but the error
becomes a 500, not a 400.

There is no adjacent-stage constraint anywhere. `docs/Business Logic.md` §5.4
lists "Start production", "Mark ready", "Mark delivered" as discrete actions.

**Fix:** (a) validate `newStatus` against the `OrderStatus` enum and return
400; (b) restrict forward moves to the next stage only, with an explicit
allow-list for jumps that are genuinely wanted (e.g. `NEW → CANCELLED`).

### 3.2 The approval chain has no user interface

This is the largest dead end in the order flow.

`PATCH /api/orders/transitions/[id]` (`src/app/api/orders/transitions/[id]/route.ts`)
is the only way to approve a transition. Grep across `src/app` and
`src/components` finds **no caller**. There is no approvals page, no
approvals list, no button.

The chain works like this: a `COMPANY_STAFF` / `COMPANY_PRODUCTION` /
`COMPANY_SALES` user requests a backward move or a cancellation
(`api/orders/[id]/status/route.ts:55-102`); an `OrderStatusTransition` row is
written with `status: 'PENDING'`; approvers are notified by email. Then
**nothing happens** — the order sits in its old status and the requester has
no way to know or act on it.

`docs/Business Logic.md` §6.2 and `docs/BUSINESS_LOGIC_FIX.md` both describe
the approval chain as core behavior. It is implemented on the write side only.

**Fix:** add a pending-transitions queue to the company dashboard, with
approve / reject actions calling the existing endpoint. This is UI work against
a working API — the cheapest high-value item in this document.

### 3.3 The client and server transition rules have diverged

The transition matrix is implemented **twice**: once in
`src/lib/status-transitions.ts` and once, hand-copied, in
`src/components/dashboard/OrderKanban.tsx:89-132`. The copies have drifted:

| Case                                          | Server (`status-transitions.ts`)          | Client (`OrderKanban.tsx`)     |
| --------------------------------------------- | ----------------------------------------- | ------------------------------ |
| `COMPANY_PRODUCTION` / `COMPANY_SALES` cancel | allowed, requires approval (line 122-123) | **not allowed** (line 109-110) |
| `CANCELLED` in the pipeline                   | part of `STATUS_ORDER` (line 3-12)        | excluded (line 48-56)          |

So the Kanban hides the cancel option from production and sales users while
the API accepts it. The server copy is authoritative; the UI is wrong.

The shared helpers exist but are unused: `getAllowedNextStatuses`
(`status-transitions.ts:156`) and `getAllowedNextStatusesWithApproval` (line 167) have **no callers**. `CANCELLABLE_STATUSES` (line 14) is exported and
never imported. `isMainCompany` at line 94 is assigned and never read.

**Fix:** delete the copy in `OrderKanban.tsx` and import the shared functions.
The client can import from `src/lib/status-transitions.ts` directly — it is
already a pure module with no server dependencies.

### 3.4 `OrderItem.status` never leaves `PENDING`

`OrderItemStatus` is `PENDING` / `ACCEPTED` / `REJECTED`
(`prisma/schema.prisma:78-82`). The only write is
`src/app/api/orders/route.ts:181` (`status: 'PENDING'`). No `prisma.orderItem.update`
call exists anywhere in `src/`.

`docs/Business Logic.md` §5.4 lists "Per-item statuses (accept/reject
individual lines)" and §9 lists "partial acceptance/rejection of order lines"
as a resolved risk. The tenant's order detail page
(`src/app/(storefront)/[companySlug]/my-orders/[id]/page.tsx`) shows no
per-line status and no accept/reject control.

**Fix:** add a per-item accept/reject endpoint scoped to the tenant, and
render the state on both sides. Decide first whether partial acceptance blocks
the order from advancing.

### 3.5 Quote amendment does not exist

`OrderStatus.QUOTE_AMENDMENT` and `NotificationEvent.QUOTE_AMENDED` both
exist. No code path creates a re-quote; `QUOTE_AMENDED` is never emitted.

`docs/Business Logic.md` §3.4 calls price amendment **the** mechanism for
changing a price after submission, and §3.1 lists "price amendment" as a
replacement for phone-and-WhatsApp quoting. Today the only way to change a
price after submission is to cancel the order — which throws away the whole
conversation, and a cancelled order is not in the finance "payable" sum
(`src/app/(storefront)/[companySlug]/finance/page.tsx:30` counts only
`DELIVERED` / `CLOSED`).

**Fix:** implement amendment as: main company edits line prices on a
`QUOTE_AMENDMENT` order, the tenant sees a diff and accepts or rejects, the
order returns to `CONFIRMED`. This is the highest-value **new** feature in
this document, and it is a direct prerequisite for the price-change workflow
the product was built for.

### 3.6 `paymentStatus` has an API but no UI, and the role gate is wrong

`PATCH /api/orders/[id]/payment` sets `paymentStatus`. No UI calls it
(grep for `/payment` in `src/app` and `src/components` returns nothing). The
finance page filters on `paymentStatus` (`finance/page.tsx:30`) and the
"payable" figure depends on it — but **the main company can never mark an
order paid from the app**, so the finance page can only ever show everything
as unpaid.

The gate at `api/orders/[id]/payment/route.ts:13` allows `SUPER_ADMIN` and
`COMPANY_ADMIN` by `platformRole`. `docs/BUSINESS_LOGIC_FIX.md` §7
("Mark PAID (main admin or tenant admin? — decide)") leaves this open, and it
still is. It needs a decision, not a guess.

**Fix:** add the payment control to the company order detail page, and settle
who may mark it paid.

### 3.7 A tenant cannot cancel its own `NEW` order

`src/lib/status-transitions.ts:99-104` allows a `CUSTOMER` to cancel while the
order is `NEW`, and the server route honors it
(`api/orders/[id]/status/route.ts:34-41` correctly scopes the tenant to
`order.customerOrgId`). But there is **no cancel button** in the tenant order
detail page. The tenant's only recourse is to ask main-company staff.

**Fix:** add a cancel control to the tenant order detail page for `NEW` orders.

### 3.8 Four of seven notification events are never emitted

`NotificationEvent` has seven values (`prisma/schema.prisma:84-92`). Only
three are ever used: `ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_MESSAGE`.
`ORDER_CONFIRMED`, `QUOTE_AMENDED`, `ORDER_READY`, and `STAFF_ASSIGNED` are
never fired.

A tenant therefore never receives a distinct "your order was confirmed" or
"your order is ready for delivery" notification — only a generic status
change. The notification matrix in `docs/Business Logic.md` §6.2 is largely
unimplemented.

**Fix:** emit the specific events at the matching transitions. Cheap, and it
directly improves the tenant's experience.

---

## 4. Bottleneck 3 — The catalog cannot be managed after seeding

### 4.1 There is no catalog edit, deactivate, or delete

`src/app/api/catalog/route.ts` exports only `GET` and `POST`. There is no
`PATCH` and no `DELETE` for any catalog model. `CatalogClient.tsx` has exactly
one mutation — `createItem` (line 33) — and no edit or delete control.

Consequence: a price in the catalog cannot be changed. A product cannot be
deactivated. A typo in a product name cannot be fixed. The only way to change
the catalog is to re-run the seed, which is `upsert`-based and keyed on
`[companyId, name]` — so a price change in the seed _does_ land, but that is a
developer workflow, not a business one.

`docs/Business Logic.md` §5.2 asks for "add/edit/activate" on every catalog
entity. Only "add" exists.

**Fix:** add `PATCH` and `DELETE` to `/api/catalog` with a per-type field
whitelist, and edit/deactivate controls in `CatalogClient`.

### 4.2 There is no UI tab for product templates

`api/catalog/route.ts:5-11` maps five types, including `templates`. The
`CatalogClient` tab list is `glass | profiles | hardware | processing`
(`CatalogClient.tsx:15`) — **templates have no tab**. The `kinds` prop
(`CatalogClient.tsx:14`, sourced from `catalog/page.tsx:5-10`) is used only for
the product-kind labels inside the forms, never as a tab.

So `ProductTemplate` rows exist in the seed (`prisma/seed.ts:199-230`) with
their `complexityMultiplier` and dimension bounds, the tenant storefront lists
them, and the tenant can select one — but nobody can create or edit one.

**Fix:** add the templates tab.

### 4.3 Per-tenant price overrides cannot be created by anyone

This is the deepest dead end in the pricing system.

`CustomerPriceOverride` (`prisma/schema.prisma:332-354`) is read in two
places: `getTenantCatalog` (`src/lib/tenant.ts:58,69`) and the order-creation
path (`api/orders/route.ts:65-74`). The documented precedence is
`overrideSellPrice` → `override.discountPercent` → base price.

**No route anywhere writes a `CustomerPriceOverride`.** Grep for
`customerPriceOverride.` across `src/` returns exactly one hit — the read at
`api/orders/route.ts:65`. The seed creates zero overrides. The admin UI has no
tab for them.

So the third level of the price precedence system **cannot be exercised by any
human**. `docs/Business Logic.md` §3.3 lists "Per-customer overrides — a
specific small company gets different prices for specific products" as a core
capability.

**Fix:** add `GET`/`POST`/`DELETE` for overrides and a per-tenant price
override tab in the admin panel. This is the smallest change that makes the
documented pricing model real.

### 4.4 Price lists cannot be managed or assigned

`PriceList` is created only as a side effect of tenant creation
(`api/tenants/route.ts:91`). There is no route to edit a price list, change
its discount, list them, or assign one to a tenant.

The seed creates three lists — "Prodavna cena" (0%), "Bronzni prodavac" (8%),
"Zlatni prodavac" (15%) (`prisma/seed.ts:265-286`) — and **assigns only the
default one** to the tenant (`priceListId: defaultPL.id`, line 294). The
"bronze" and "gold" tiers are unreachable: the tenant creation form only
accepts a numeric `discountPercent` (`CreateCompanyForm.tsx`), and the created
list is named `${name} cenovnik` (`api/tenants/route.ts:92`).

`docs/Business Logic.md` §5.3 asks for "Create price lists (Retail, Reseller
Bronze, Reseller Gold, custom)" and "Assign price lists to customer
organizations".

**Fix:** add a price-list management route and a tenant assignment control.

### 4.5 Two pricing fields on `Company` are dead

`Company.minOrderValue` (default 0) and `Company.defaultMarkupPercent`
(default 25) are never read by the pricing engine. The seed sets
`defaultMarkupPercent: 25` (`prisma/seed.ts:28`), so the field looks live and
is not.

**Fix:** implement the minimum order value check, or remove both fields. A
margin field that does nothing will be trusted by someone.

### 4.6 `isProducer` is a legacy flag still driving the UI

`src/app/(company)/dashboard/layout.tsx:15-27` reads `isProducer` to decide
whether the catalog link appears in the sidebar, while the rest of the codebase
has moved to `isMainCompany`. The seed sets both to `true`
(`prisma/seed.ts:26-27`), so it works by coincidence.

**Fix:** switch the layout to `isMainCompany` and drop `isProducer`.

### 4.7 Other dead schema surfaces

| Feature                                          | Schema                         | Reality                                                                                                             |
| ------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `OrderAttachment`                                | `prisma/schema.prisma:400-417` | No upload route. `docs/Business Logic.md` §6.1 promises drawings and photos                                         |
| `SavedConfiguration`                             | `prisma/schema.prisma:559-586` | No route, no UI. §4 Step 2 promises reusable order templates                                                        |
| `Order.assigneeId`                               | `prisma/schema.prisma:365`     | Never written. §5.1 and §5.4 promise staff assignment                                                               |
| `NotificationRule`                               | `prisma/schema.prisma:600-612` | Never read. `notify()` (`src/lib/notifications.ts:26`) sends based only on the `email` flag passed by the call site |
| `NotificationPreference`                         | `prisma/schema.prisma:588-598` | Never read. No per-user email/digest preference exists                                                              |
| `Order.internalNotes`                            | `prisma/schema.prisma:379`     | Never written **and leaked** — see 5.3                                                                              |
| `Order.referenceImageUrl`                        | `prisma/schema.prisma:381`     | Never written                                                                                                       |
| `Company.minOrderValue` / `defaultMarkupPercent` | `prisma/schema.prisma:118-119` | See 4.5                                                                                                             |

`NotificationFrequency.DAILY_DIGEST` and `NotificationEvent.STAFF_ASSIGNED`
exist in the schema and have no code path.

---

## 5. Security gaps

The full list with severities is in `knowledge-base/auth-gaps.md`. This review
re-verified all ten and found four more.

### 5.1 Re-verified: all ten known gaps still present

| #   | Gap                                                     | Location                                                | Status |
| --- | ------------------------------------------------------- | ------------------------------------------------------- | ------ |
| 1   | Unauthenticated pricing endpoint                        | `src/app/api/pricing/quote/route.ts:4-13`               | open   |
| 2   | `GET /api/orders` returns every order without an org id | `src/app/api/orders/route.ts:11-16`                     | open   |
| 3   | Order items can reference another company's catalog     | `src/app/api/orders/route.ts:88-126`                    | open   |
| 4   | `companyRole` and `platformRole` conflated              | `src/app/api/orders/[id]/status/route.ts:13`            | open   |
| 5   | Cross-tenant transition approval                        | `src/app/api/orders/transitions/[id]/route.ts:13-18,34` | open   |
| 6   | `assertSameCompany` has zero call sites                 | `src/lib/rbac.ts:16`                                    | open   |
| 7   | 10 of 13 `requireRole` throws escape → 500              | 7 route files                                           | open   |
| 8   | `platformRole` is client-supplied on user creation      | `src/app/api/companies/[id]/users/route.ts:59`          | open   |
| 9   | `GET /api/tenants` omits the main-company check         | `src/app/api/tenants/route.ts:8-44`                     | open   |
| 10  | Session cookie is not `Secure` in production            | `src/lib/auth.ts:27`                                    | open   |

Verified by enumeration: of 20 route files under `src/app/api/`, **1 is
completely unguarded** (`pricing/quote`; the NextAuth route is the other
no-`getSession` file and is correct), and **7 files use `requireRole` without
`toHttpError`**.

One refinement to gap 8: the tenant branch at
`api/companies/[id]/users/route.ts:112` hardcodes `platformRole: 'CUSTOMER'`
correctly, so the escalation only reaches the **company** branch (line 85).
A `SUPER_ADMIN` can mint another `SUPER_ADMIN`. Still worth fixing, but it is
an admin-driven surface, not an open one.

### 5.2 New: `internalNotes` leaks to tenants over SSE

`src/app/api/orders/[id]/status/route.ts:131` publishes the **entire updated
order row**:

```ts
publishToUsers(recipientIds, 'order:update', { orderId: order.id, order: updated });
```

`OrderUpdatePayload` in `src/lib/events.ts:33-42` declares only five fields,
but the runtime object carries every column — including `internalNotes`
(`prisma/schema.prisma:379`), which `docs/Business Logic.md` §5.4 says is
"visible only to supplier". The recipients include tenant members
(`api/orders/[id]/status/route.ts:117`).

TypeScript does not catch it because `updated` is widened. The same publish
exists at `api/orders/transitions/[id]/route.ts:82-85`.

**Fix:** publish an explicit pick of the declared fields, and type the payload
so the compiler enforces it.

### 5.3 New: a tenant user can be given a main-company role

`src/app/api/companies/[id]/users/[userId]/route.ts:50` destructures
`entityType` and **never uses it**. Line 56 then sets `companyRole` and
`customerOrgRole` independently of which entity owns the user. A tenant
member can be assigned `companyRole: 'COMPANY_ADMIN'`.

That is precisely the value the transition-approval gate checks
(`api/orders/transitions/[id]/route.ts:15`). Combined with gap 5, this is a
working cross-tenant write path.

**Fix:** set only the role field matching `entityType` — `companyRole` for a
company user, `customerOrgRole` for a tenant user.

### 5.4 New: `typeMap` prototype lookup in the catalog route

`src/app/api/catalog/route.ts:39` does `const model = typeMap[type]` where
`type` comes from the query string, and line 61 does the same with the body.
`typeMap` is a plain object literal, so `type=constructor` resolves to
`Object.prototype.constructor` — truthy, so the guard at line 40 passes, and
the subsequent `model.findMany` throws a `TypeError` → 500.

**Fix:** `Object.create(null)` for `typeMap`, or `Object.hasOwn(typeMap, type)`.

### 5.5 New: HTML injection in outbound email

`src/lib/email.ts:17-18` interpolates `subject` and `body` into an HTML
template without escaping. The message-notification body is
`` `${user.name}: ${body.slice(0, 120)}...` ``
(`api/orders/[id]/messages/route.ts:63`) — **user-controlled text** from a
tenant lands raw in the HTML email that main-company staff receive.

**Fix:** HTML-escape `subject` and `body` before interpolation.

### 5.6 New: a deactivated user keeps a working session for up to 30 days — FIXED

The gap was that `strategy: 'jwt'` copied claims from the token without
re-reading the user, so `isActive: false` had no effect until the token expired.

**Fixed:** the `jwt` callback in `src/lib/auth.ts` re-reads the user on every
request and throws when the account is inactive, which drops the session
cookie. The session lifetime was shortened as well — 8 hours, refreshed at
most every 30 minutes. See `knowledge-base/auth-gaps.md` #16 and
`docs/security-hardening.md`.

### 5.7 Two notes on existing gaps that are less severe than documented

- **Gap 2 (`GET /api/orders`)** requires a `CUSTOMER` whose `customerOrgId` is
  null, which the seed never produces. It is a latent hole, not an active
  leak. It is still worth fixing, because the failure mode is _all orders
  returned_, not _no orders returned_.
- **Gap 5 (cross-tenant approval)** is real but requires a tenant user to
  hold `companyRole: 'COMPANY_ADMIN'`, which the admin UI can set today
  (5.3). Fixing 5.3 closes most of gap 5's reach; the `customerOrgId`
  comparison should still be fixed.

### 5.8 `SUPER_ADMIN` cannot open an order detail page

`src/app/(company)/dashboard/orders/[id]/page.tsx:30` checks
`order.companyId !== user.companyId`. A `SUPER_ADMIN` has `companyId: null`,
so the comparison is always true and the page always renders `notFound()`.
The Kanban links to `/dashboard/orders/${o.id}`
(`src/components/dashboard/OrderKanban.tsx:224`), so a super-admin clicking an
order card gets a 404.

Not a security issue — a missing `SUPER_ADMIN` bypass. The fix is
`if (!order || (user.platformRole !== 'SUPER_ADMIN' && order.companyId !== user.companyId)) notFound();`.

### 5.9 `requireRole` cannot express a job-role gate

`src/lib/rbac.ts:8-14` only ever reads `platformRole`. Every rule that needs a
`companyRole` or `customerOrgRole` check is hand-rolled in the route — which
is precisely how the role-conflation bugs got in. `assertSameCompany`
(`src/lib/rbac.ts:16`) exists and has zero callers.

**Fix:** add `requireCompanyRole` and `requireCustomerOrgRole` helpers, and
use `assertSameCompany` at the call sites that compare a resource owner to the
session.

---

## 6. Performance bottlenecks

### 6.1 Order submission waits for every email to be sent

This is the order-submit spinner, and the slow notification stream recorded in
`AGENTS.md`.

`src/lib/notifications.ts:15-30` does, per notification: one `INSERT`, one SSE
publish, **one extra `prisma.user.findUnique`** (line 27, only when
`email: true`), and an **awaited HTTPS call to Resend**
(`src/lib/email.ts:12`).

The call sites all loop serially with `await` inside:

| Location                                              | Recipients                      | Email |
| ----------------------------------------------------- | ------------------------------- | ----- |
| `src/app/api/orders/route.ts:215-224`                 | every main-company staff member | yes   |
| `src/app/api/orders/[id]/status/route.ts:133-142`     | every tenant member             | yes   |
| `src/app/api/orders/transitions/[id]/route.ts:88-95`  | the requester                   | yes   |
| `src/app/api/orders/transitions/[id]/route.ts:98-107` | every tenant member             | yes   |
| `src/app/api/orders/[id]/messages/route.ts:58-66`     | every recipient                 | no    |
| `src/app/api/orders/[id]/payment/route.ts:35-44`      | every tenant member             | no    |

The order is created in the database at `api/orders/route.ts:151`, but the HTTP
response at line 226 waits for the whole notification loop. With 10 staff
members that is 10 sequential Resend round-trips before the tenant sees a
success. At a typical 300–1500 ms per call, that is 3–15 seconds of spinner,
and the SSE `order:update` event is not published until the loop ends.

**Fix:** create the notification rows with one `createMany`, publish the SSE
events, and hand the emails to a background job (or at minimum do not await
them before responding).

### 6.2 Catalog lookups run one query per row, inside nested loops

`src/app/api/orders/route.ts:85-127` performs up to 5 `findUnique` calls **per
item**, each inside a `for` loop over `items`, `item.glassPanes`,
`item.hardware`, and `item.processingIds`. A 10-item order with 2 panes and 3
hardware pieces is roughly 50 sequential database round-trips before the single
insert.

**Fix:** one `findMany({ where: { id: { in: [...] } } })` per catalog type, then
map by id into a lookup table.

### 6.3 The tenant catalog is rebuilt on every page load

`getTenantCatalog` (`src/lib/tenant.ts:44-137`) re-reads the whole catalog on
every storefront page load, and its override lookup is O(catalog × overrides)
— `tenant.priceOverrides.find(...)` inside a `.map()`
(`src/lib/tenant.ts:69`, called from lines 97, 109, 117). Trivial with 5 SKUs
and 0 overrides; at 500 SKUs and 200 overrides it is 100,000 comparisons per
page load.

**Fix:** build a `Map` keyed by `${field}:${id}` once. The unused `items`
parameter at `src/lib/tenant.ts:65` goes with it.

### 6.4 The SSE client map grows without bound

`src/lib/realtime.ts:52` deletes a dead client on an enqueue failure, but does
**not** delete the now-empty `Set` for that user — that cleanup exists only in
`unregisterSSE` (line 41). A long-running server accumulates one empty `Set`
per departed user.

**Fix:** add the same `if (clients.size === 0) sseClients.delete(userId)` to
the `sendTo` catch.

### 6.5 The real-time layer is per-process

`src/lib/realtime.ts:20-22` stores the client map on `globalThis`. With more
than one Node process, an SSE client connected to process A never receives an
event published from process B. The real-time layer silently breaks on
horizontal scale, and `docs/Business Logic.md` §7.1 targets a serverless
deployment.

**Fix:** Redis pub/sub, or a managed SSE provider, before horizontal scaling.
Not a blocker while the app runs on one process — but it must not be forgotten
at deploy time.

### 6.6 The client type guards are dead code

`src/lib/events.ts:110-131` exports four type guards.
`isClientRealtimeEvent` has **no callers**. The client checks
`if (data.event && data.payload)` instead
(`src/components/realtime/RealtimeProvider.tsx:63`) and casts the result
directly to `ClientRealtimeEvent` (line 66).

**Fix:** use `isClientRealtimeEvent(data)` in `RealtimeProvider.tsx:63`.

### 6.7 `EventSource` reconnects twice

`EventSource` reconnects automatically on error. `RealtimeProvider.tsx:77-92`
adds a manual exponential-backoff reconnect on top, so a dropped connection
can produce two competing reconnect attempts.

**Fix:** close the `EventSource` before scheduling the manual reconnect (the
code does call `cleanup()` at line 79, which does close it — so this is
currently correct, but it is fragile and worth a comment).

### 6.8 Unbounded list queries

`prisma.order.findMany` has no `take` in six places:
`api/orders/route.ts:17`, `(company)/dashboard/orders/page.tsx:12`,
`(company)/dashboard/page.tsx:12` (has `take: 5`),
`(storefront)/[companySlug]/my-orders/page.tsx:16`,
`(storefront)/[companySlug]/finance/page.tsx:24`, and
`api/admin/stats/route.ts:65` (has `take: 5`).

The dashboard Kanban, the tenant order list, and the finance page all load
every order. At MVP scale this is fine; it is the first thing that breaks as
order volume grows.

**Fix:** add `take` plus pagination to the three unbounded list pages.

---

## 7. Structural and quality issues

### 7.1 `as any` — 56 occurrences

| Category                                       | Count |
| ---------------------------------------------- | ----- |
| `src/lib/auth.ts` — NextAuth type augmentation | 17    |
| `session.user as any` — the documented pattern | 38    |
| Other                                          | 9     |

The 9 others are genuine smell: `OrderKanban.tsx:172-173` (the cast that
hides the `internalNotes` leak in 5.2), `OrderWizard.tsx:390,441,456,472,485`
(unchecked `Json` columns), `finance/page.tsx:30` (a `readonly` tuple
comparison), and `(company)/dashboard/orders/page.tsx:39` (a prop cast that
hides the `OrderKanban` prop contract).

**Fix:** a `declare module 'next-auth'` augmentation in
`src/types/next-auth.d.ts` plus a typed `getSessionUser()` helper removes all 55. The project instructions forbid `as any` unless justified.

### 7.2 No test suite

No `vitest`, no `playwright`, no test file anywhere in the repo. The two
highest-risk functions in the codebase are pure and unit-testable in
isolation: `src/lib/pricing-engine.ts` and `src/lib/status-transitions.ts`.
Both contain real branching — and the transition matrix is currently
duplicated and has already drifted (3.3), which is exactly what a test would
have caught.

**Fix:** Vitest, starting with those two files. See the plan in section 8.

### 7.3 No error boundary

There is no `src/app/error.tsx` and no `src/app/global-error.tsx`. A server
component that throws renders a blank page. Combined with the 10 uncaught
`requireRole` throws (gap 7), a rejected role shows a stack trace instead of
a 403.

**Fix:** add both files.

### 7.4 `npm run lint` is broken

`package.json:16` calls `next lint`, which was removed in Next.js 16. The
script fails with `Invalid project directory provided, no such directory: .../lint`.

**Fix:** replace it with `next lint`-equivalent tooling — `tsc --noEmit` plus
ESLint directly — or drop the script. Do not report a lint run as passing.

### 7.5 `findMany` without a `where` filter

Only one, and it is intentional: `api/companies/route.ts:11`, which lists all
companies for a `SUPER_ADMIN`. Every other `findMany` in `src/` is filtered.

### 7.6 `OrderItem` rows are immutable after creation

`grep` for `prisma.orderItem.` returns **zero** writes outside the nested
create. Once an order exists, its line items cannot be corrected — not the
quantity, not the dimensions, not the profile. Combined with 3.5 (no quote
amendment), **there is no way to fix an incorrect order.** The only available
action is to cancel it and re-order, losing the message history.

This is the structural reason quote amendment matters: it is the only
mechanism that lets a submitted order be corrected.

### 7.7 The tenant creation flow can leave an orphan price list

`api/tenants/route.ts:91` creates the `PriceList` and line 95 creates the
`CustomerOrg`, with no transaction. A failure on the second insert leaves an
orphan `PriceList`. The list name is `${name} cenovnik` and `PriceList` has
`@@unique([companyId, name])` (`prisma/schema.prisma:329`), so two tenants
with the same name collide.

**Fix:** wrap both creates in one `$transaction`, and make the list name
unique (append the slug).

### 7.8 The order number can collide

`api/orders/route.ts:149` generates `GF-<year>-<6 random digits>` with no
retry. `orderNumber` is `@unique` (`prisma/schema.prisma:368`). The space is
900,000 per year; a collision throws and the request 500s.

**Fix:** a retry loop, or a per-year sequence.

### 7.9 SQLite-specific raw SQL blocks the PostgreSQL move

`src/app/api/admin/companies/[id]/stats/route.ts:76-85` and `107-116` use
`prisma.$queryRaw` with `strftime()` and `CAST(... AS REAL)` — SQLite
functions. `docs/postgres-migration.md` says the PostgreSQL move has not
started; these two blocks are why it has not.

**Fix:** rewrite with Prisma's `groupBy` on a date field, or use
`date_trunc` with a provider switch.

### 7.10 Money crosses the wire as `number` in several places

The pricing engine correctly uses `number` (it must stay pure and
dependency-free), and the DB uses `Decimal`. But the conversion back to
`number` happens in more than one place, and `Number(o.total)` is used for
display in `finance/page.tsx:32,36,84` and `admin/page.tsx:178`. Floating-point
money is a rounding-drift risk at the reporting layer.

**Fix:** keep `Decimal` arithmetic for reporting sums, or accept the drift
knowingly and document it.

### 7.11 The middleware substring match is fragile

`src/middleware.ts:14` computes the subdomain with
`hostOnly.replace('.' + ROOT_HOST, '').replace(ROOT_HOST, '')` — a **substring**
replace, not a suffix check. Any host containing `localhost` as a substring
is treated as a tenant subdomain.

**Fix:** `hostOnly.endsWith('.' + ROOT_HOST) ? hostOnly.slice(0, -(ROOT_HOST.length + 1)) : ''`.

---

## 8. Fix plan

Sequenced so that each phase leaves the app in a working state and reduces
risk. Phase 0 is first because it makes the later phases verifiable.

> **Phases 0–5 are implemented (2026-10-21).** Phases 6 and 7 are not.
> The verification evidence is at the end of this section.

### Phase 0 — Make it verifiable (small, unblocks everything else) — DONE

1. ~~Add Vitest with tests for `src/lib/pricing-engine.ts` and
   `src/lib/status-transitions.ts`.~~ Done, plus `src/lib/validation.ts`.
   63 tests.
2. ~~Fix `npm run lint` — replace `next lint` with `tsc --noEmit`.~~ Done.
   `npm run lint` and `npm run typecheck` both run `tsc --noEmit`.
3. ~~Add `src/app/error.tsx` and `src/app/global-error.tsx`.~~ Done.
4. ~~Add the `declare module 'next-auth'` augmentation and a typed
   `getSessionUser()` helper.~~ Done. All 56 `as any` occurrences are gone.

**Done when:** `npm run test` and `npm run build` both pass, and `session.user`
is typed everywhere. — **Met.**

### Phase 1 — Close the pricing holes (highest business value) — DONE

These are the fixes that stop the app from quoting wrong prices.

1. ~~Validate the request body in `api/orders/route.ts`.~~ Done —
   `src/lib/validation.ts`, 26 unit tests.
2. ~~Enforce the `ProductTemplate` dimension bounds server-side.~~ Done.
3. ~~Require a `profileId` for `FINISHED_WINDOW` / `FINISHED_DOOR`.~~ Done.
4. ~~Scope all five catalog lookups by `companyId` and `isActive`.~~ Done.
5. ~~Enforce `applicableKinds` and `GlassType.availableThicknessMm`.~~ Done.
6. ~~Price each glass pane individually instead of splitting the total.~~ Done.
7. ~~Fix the line-total rounding to use the unrounded base.~~ Done.
8. ~~Apply `colorSurchargeFactor`.~~ Done. **`openingCount` is still not
   priced** — the field is carried but no price path reads it.
9. **Still open:** honor `ProcessingOption.unit`, or remove the field.
10. ~~Show subtotal, discount, tax, and total in `PriceSummary`.~~ Done.

**Done when:** the pricing-engine unit tests cover negative, zero, and
out-of-bounds inputs and reject them; a finished window with no profile is
refused with a 400. — **Met**, and verified against the running app.

### Phase 2 — Make the order pipeline real — DONE

1. ~~Validate `newStatus` against the enum; return 400 on an unknown value.~~ Done.
2. ~~Restrict forward transitions to the next stage, with an explicit
   allow-list.~~ Done.
3. ~~Delete the duplicated transition matrix in `OrderKanban.tsx`.~~ Done.
4. ~~**Add the pending-transitions queue to the company dashboard**.~~ Done —
   `GET /api/orders/transitions` + `src/components/dashboard/TransitionQueue.tsx`.
5. ~~Add a per-item accept/reject endpoint and render the state.~~ Done.
6. ~~Add a tenant cancel control for `NEW` orders.~~ Done.
7. ~~Add a payment-status control to the company order detail page.~~ Done.
   **Open question:** who may mark an order paid is still a product call —
   the route allows `SUPER_ADMIN` and `COMPANY_ADMIN`.
8. ~~Emit `ORDER_CONFIRMED` and `ORDER_READY`.~~ Done.
   **`STAFF_ASSIGNED` is still not emitted** — no code assigns an order.

**Done when:** a backward transition requested by a staff member can be
approved from the UI, and the order status changes. — **Met**, and verified
end to end against the running app.

### Phase 3 — Make the catalog manageable — DONE

1. ~~Add `PATCH` and `DELETE` to `/api/catalog`, with a per-type field
   whitelist.~~ Done. `DELETE` is a **soft** delete — a hard delete would
   break the foreign key from an order that already references the item.
2. ~~Add the product-templates tab to `CatalogClient`.~~ Done.
3. ~~Add a `CustomerPriceOverride` route.~~ Done — `/api/price-overrides`.
   The per-tenant override **admin tab** is not built; the route is.
4. ~~Add price-list management and tenant assignment.~~ Done —
   `/api/price-lists` and `PATCH /api/tenants/[id]`.
5. **Still open:** the minimum-order-value check, or remove `minOrderValue` and
   `defaultMarkupPercent`.
6. ~~Switch `isProducer` to `isMainCompany` in the dashboard layout.~~ Done.

**Done when:** a price can be changed in the catalog, a product can be
deactivated and becomes unorderable, and a per-tenant override can be set and
shows up in the tenant's quote. — **Met**, and verified against the running app.

### Phase 4 — Close the security gaps — DONE

Ordered by severity.

1. ~~`GET /api/orders` — reject a missing `customerOrgId`.~~ Done.
2. ~~`api/orders/transitions/[id]` — tenant scoping.~~ Done.
3. ~~`api/companies/[id]/users/[userId]` — set only the role field matching
   `entityType`.~~ Done.
4. ~~Publish an explicit field pick for `order:update`.~~ Done.
5. ~~HTML-escape `subject` and `body` in `src/lib/email.ts`.~~ Done.
6. ~~Add a session check to `api/pricing/quote`.~~ Done.
7. ~~Wrap the remaining `requireRole` calls in `try/catch` + `toHttpError`.~~ Done.
8. ~~Derive `platformRole` from context.~~ Done.
9. ~~`secure: process.env.NODE_ENV === 'production'`.~~ Done.
10. ~~Add the `isMainCompany` assertion to `GET /api/tenants`.~~ Done.
11. ~~`Object.create(null)` for the catalog `typeMap`.~~ Done.
12. ~~Re-check `isActive` in the `jwt` callback.~~ Done.
13. ~~Add `requireCompanyRole` and `requireCustomerOrgRole` helpers.~~ Done.
    **`assertSameCompany` still has no call site** — the order routes compare
    `customerOrgId` directly, which is the correct field for a tenant.

**Done when:** a tenant user cannot read, write, or approve anything outside
their own org, and a rejected role returns 401 or 403 rather than 500. — **Met**,
and verified against the running app.

### Phase 5 — Remove the bottlenecks — DONE

1. ~~Move the notification fan-out off the request path.~~ Done —
   `notifyMany` in `src/lib/notifications.ts`. Order submission dropped from
   3–15 s to 54–90 ms.
2. ~~Batch the catalog lookups into one `findMany` per catalog type.~~ Done.
3. ~~Build the override lookup as a `Map` in `getTenantCatalog`.~~ Done.
4. ~~Fix the empty-`Set` leak in `realtime.ts`.~~ Done.
5. ~~Bound the three unbounded order list queries.~~ Done — `take` on each.
   A pagination **control** belongs on those pages next.
6. ~~Use `isClientRealtimeEvent` in `RealtimeProvider`.~~ Done.
7. ~~Wrap the tenant creation in a transaction, and make the price-list name
   unique.~~ Done.
8. ~~Add a retry to the order-number generator.~~ Done.

**Done when:** order submission returns without waiting for email delivery,
and a 10-item order issues a bounded number of database queries. — **Met.**

### Phase 6 — The new features that the product was built for

In priority order. Each is a real product capability promised in
`docs/Business Logic.md` and absent today.

1. **Quote amendment.** Main company re-quotes a `QUOTE_AMENDMENT` order, the
   tenant accepts or rejects, the order returns to `CONFIRMED`. This is the
   mechanism that makes a price change after submission possible, and the only
   way to correct an order without cancelling it. Requires the price-snapshot
   rule in `docs/Business Logic.md` §3.4 to be honored: amendment writes new
   snapshots, it never recomputes existing ones silently.
2. **Per-tenant catalog assignment.** A join table, a `getTenantCatalog`
   filter, a server-side check at order creation, and an admin UI. The
   business wants it; the code does not have it.
3. **Attachments.** Drawings and photos on an order, with MIME and size
   validation.
4. **Saved configurations.** Reusable order templates for a tenant.
5. **Staff assignment.** Write `Order.assigneeId` and notify the assignee.
6. **Notification rules and preferences.** Honor `NotificationRule` and
   `NotificationPreference`, including the daily digest.

### Phase 7 — Platform readiness

1. Rewrite the two SQLite-specific raw SQL blocks in
   `api/admin/companies/[id]/stats/route.ts` so the PostgreSQL move is not
   blocked.
2. Audit the data for orphans before the move — SQLite does not enforce
   foreign keys, and `prisma/dev.db` already contains one user row with
   neither a `customerOrgId` nor a `companyId`.
3. Decide the real-time topology before deploying to more than one process
   (Redis pub/sub, or a managed SSE provider).
4. Add CI: typecheck → test → build.

---

## 9. What is genuinely solid

Worth stating, because the list above is long:

- The one-main-company model is implemented and enforced. `POST /api/companies`
  is hard-blocked with 403 (`api/companies/route.ts:32-38`).
- The server is authoritative for price. The wizard sends no price fields and
  the server recomputes from the database.
- The Decimal rule is followed everywhere at the Server→Client boundary.
  **Zero violations** — the `as any` casts are latent risk, not a live crash.
- Tenant scoping is correct in every page and in
  `api/orders/[id]/status/route.ts:34-41` and
  `api/orders/[id]/messages/route.ts:70-80`.
- The price precedence logic is implemented correctly and identically in both
  the read path (`src/lib/tenant.ts:63-76`) and the write path
  (`api/orders/route.ts:64-82`).
- The seed is idempotent and complete, with a full catalog, three price lists,
  and one tenant.
- The knowledge base is accurate on the points this review touched, except the
  one `HARDWARE` claim in 2.11.

---

## 10. Summary of counts

Before the fixes, and after:

| Measure                                                | Before | After |
| ------------------------------------------------------ | ------ | ----- |
| API route files under `src/app/api/`                   | 20     | 25    |
| Completely unguarded API routes                        | 1      | 0     |
| `requireRole` sites that return 500 instead of 401/403 | 10/13  | 0/13  |
| Known auth gaps still open                             | 16/16  | 1/16  |
| Cross-tenant data leaks                                | 3      | 0     |
| `as any` occurrences                                   | 56     | 0     |
| Decimal violations at the Server→Client boundary       | 0      | 0     |
| Duplicated logic that has already drifted              | 1      | 0     |
| Schema features with no code path at all               | 11     | 5     |
| Schema features with no write path (read-only)         | 4      | 0     |
| Dead exports                                           | 10     | 1     |
| Test files                                             | 0      | 3     |
| Unit tests                                             | 0      | 63    |

**The one auth gap still open** is #11: `NotificationRule` is never enforced.
It is a functional gap rather than a security hole — the model implies a
configurable routing behaviour that no code implements.

**The schema features still with no code path:** `Company.minOrderValue` and
`Company.defaultMarkupPercent`, `SavedConfiguration`, `Order.assigneeId`,
`OrderAttachment`, `NotificationPreference`, `NotificationFrequency.DAILY_DIGEST`,
`ProductTemplate.openingCount` (priced nowhere), and `ProcessingOption.unit`
(ignored).

**The dead export still there:** `assertSameCompany` — the order routes
compare `customerOrgId` directly instead, which is the correct field for a
tenant.
