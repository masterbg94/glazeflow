---
name: glazeflow-pricing-change
description: Change pricing safely in GlazeFlow. Use when editing pricing-engine.ts, PriceList, CustomerPriceOverride, catalog prices, tax, discount, markup, or the live quote in the order wizard. Also use when a change affects what a tenant sees as a price.
---

# Pricing change

## The rule

**The server is authoritative. The client quote is a preview.**

`src/lib/pricing-engine.ts` is pure — no database, no session, no side effects.
It runs in the browser for the live quote and on the server at order creation.
The server recomputes from the database at `POST /api/orders`
(`src/app/api/orders/route.ts:88-148`). Client-supplied prices are never
persisted.

Never move a price into a client component's trust boundary. Never accept a
price from the request body.

## The formulas

```
areaSqm(w, h)    = (w / 1000) * (h / 1000)
perimeterM(w, h) = (2 * (w + h)) / 1000

glassPanePrice = area * sellPricePerSqm * (1 + extraMm * surcharge% / 100)
  where extraMm = max(0, thicknessMm - baseThicknessMm)

baseUnit  = (profile + glass + hardware + processing) * complexityMultiplier
unitPrice = round(baseUnit, 2)
lineTotal = round(unitPrice * quantity, 2)

subtotal      = round(sum(lineTotals), 2)
afterDiscount = round(subtotal * (1 - discountPercent / 100), 2)
discountAmount = round(subtotal - afterDiscount, 2)
taxAmount      = round(afterDiscount * taxRatePercent / 100, 2)
total          = round(afterDiscount + taxAmount, 2)
```

Order of operations is fixed: **subtotal → discount → tax → total**. Tax applies
to the discounted amount, never to the subtotal.

Per-kind behaviour:

| Kind | Glass | Profile |
| --- | --- | --- |
| `GLASS_ONLY` | area × pane prices | — |
| `FINISHED_WINDOW` / `FINISHED_DOOR` | area × pane prices | perimeter × price/m |
| `RAW_PROFILE` | — | lengthM × price/m |
| `HARDWARE` | no branch — prices at zero | — |

## Per-tenant precedence

Applied per catalog item, in this order:

```
1. CustomerPriceOverride.overrideSellPrice   (absolute)
2. CustomerPriceOverride.discountPercent      (percentage off base)
3. Base sell price
```

Then the tenant's `PriceList.discountPercent` applies to the **subtotal**.

The logic exists twice and must stay in sync:

- `src/lib/tenant.ts:63-76` — read path, storefront
- `src/app/api/orders/route.ts:64-80` — write path, order creation

If you change one, change the other in the same commit. A divergence means the
quote a tenant sees differs from what they are charged.

## Cost prices are main-company only

`costPrice`, `costPricePerSqm`, `costPricePerMeter` never reach a tenant-facing
serializer. `getTenantCatalog` omits them; the order path never selects them.

If you add a field to a catalog model, decide explicitly whether it is
tenant-visible. Default to **not visible**.

## The Decimal rule

Prisma `Decimal` is not serializable into Client Components. Convert at the
Server Component boundary:

```ts
subtotal: o.subtotal.toString(),
taxAmount: o.taxAmount.toString(),
discountAmount: o.discountAmount.toString(),
total: o.total.toString(),
// items: lengthM, unitPrice, lineTotal
```

Reference: `src/app/(company)/dashboard/orders/[id]/page.tsx:103-104`.

The pricing engine itself uses plain `number`. Do not introduce `Decimal` into
it — it must stay pure and dependency-free.

## The snapshot

`OrderItem.unitPrice` and `OrderItem.lineTotal` are written at creation and
never recomputed. Later catalog price changes do not affect existing orders.
Changing a price after submission goes through the `QUOTE_AMENDMENT` status, not
a silent re-price. This is a critical business rule
(`docs/Business Logic.md` §3.4).

## Known gaps — do not assume these work

| Gap | Where |
| --- | --- |
| `HARDWARE` kind prices at zero | no branch in `calcItemPricing` |
| Template min/max dimensions never enforced | bounds exist on `ProductTemplate` and are shipped to the client; nothing checks them |
| Live quote shows no tax and no tenant discount | `src/components/order-wizard/PriceSummary.tsx:39` — the copy says the total appears at checkout |
| `Company.defaultMarkupPercent` and `Company.minOrderValue` are unused | schema only — do not wire pricing to them without deciding how |
| `ProductTemplate` has no price of its own | it only carries `complexityMultiplier` |

## Checklist before finishing

- [ ] The engine stays pure — no Prisma, no session, no side effects.
- [ ] The read path and the write path apply the same precedence.
- [ ] `costPrice` is not in any tenant-facing payload.
- [ ] Totals order is subtotal → discount → tax → total.
- [ ] Every `Decimal` crossing into a client component is stringified.
- [ ] Existing orders are unaffected — the snapshot is preserved.
- [ ] The live quote and the server total are compared, and the difference is
      understood (tax and discount are expected to differ today).

## Verify

```bash
npm run build
```

Then place a real order as a tenant and compare the stored `total` against a
hand calculation of the same items. A mismatch in the discount or tax is the
usual symptom of a precedence divergence between the two paths.
