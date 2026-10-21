# Pricing Rules

## The one rule that matters

**The server is authoritative. The client quote is a preview.**

`src/lib/pricing-engine.ts` is a pure module — no database, no session, no side
effects. It runs in the browser for the live quote and on the server at order
creation. The server recomputes everything from the database at
`POST /api/orders` (`src/app/api/orders/route.ts:88-148`). Client-supplied
prices are never persisted.

`src/lib/instructions.md` states this as a non-negotiable rule. Keep it that way:
never move pricing into a client component's trust boundary.

## Formulas

All from `src/lib/pricing-engine.ts`.

### Geometry

```ts
areaSqm(widthMm, heightMm) = (widthMm / 1000) * (heightMm / 1000); // :30
perimeterM(widthMm, heightMm) = (2 * (widthMm + heightMm)) / 1000; // :34
```

### Glass pane

```ts
glassPanePrice(pane, area) =
  area * pane.sellPricePerSqm * (1 + (extraMm * pane.thicknessSurchargePercentPerMm) / 100);
// :38
```

`extraMm = max(0, thicknessMm - baseThicknessMm)`. Only thickness **above** the
type's base thickness is surcharged. `baseThicknessMm` comes from `GlassType`;
`thicknessSurchargePercentPerMm` defaults to 5.

### Item price by kind

`calcItemPricing` (`src/lib/pricing-engine.ts:44-101`):

| Kind              | Glass              | Profile             | Hardware | Processing |
| ----------------- | ------------------ | ------------------- | -------- | ---------- |
| `GLASS_ONLY`      | area × pane prices | —                   | summed   | summed     |
| `FINISHED_WINDOW` | area × pane prices | perimeter × price/m | summed   | summed     |
| `FINISHED_DOOR`   | area × pane prices | perimeter × price/m | summed   | summed     |
| `RAW_PROFILE`     | —                  | lengthM × price/m   | summed   | summed     |
| `HARDWARE`        | —                  | —                   | summed   | summed     |

`HARDWARE` has no dedicated geometry branch, but it is **not** priced at zero.
`src/lib/pricing-engine.ts:83` computes `hardwareCost` for every kind, so a
`HARDWARE` item prices correctly from its hardware line.

The real gap is different: the wizard never offers `HARDWARE` as a product
kind (`src/components/order-wizard/OrderWizard.tsx:268` offers only the other
four), so hardware can only be bought attached to a window, door, or glass
line. Standalone hardware ordering is impossible.

An earlier version of this file claimed `HARDWARE` "falls through and prices
at zero". That was wrong; corrected 2026-10-21. See
`docs/business-logic-review.md` § 2.11.

### Line and item totals

```ts
baseUnit = (profileCost + glassCost + hardwareCost + processingCost) * complexityMultiplier;
unitPrice = round(baseUnit, 2);
lineTotal = round(baseUnit * quantity, 2); // from the UNROUNDED base
```

`complexityMultiplier` comes from `ProductTemplate` (default 1.0). It applies to
the whole line, including hardware and processing.

The line total is derived from the **unrounded** base. Rounding the unit
first and then multiplying drifted by up to `quantity × 0.005` — a 5 RSD
difference on a 1000-piece order.

`profileCost` carries the colour surcharge:
`perimeter × profileSellPricePerMeter × colorSurchargeFactor`, where the
factor comes from `PvcProfile.colorSurchargeFactor` (a JSON map from colour
name to factor, e.g. `1.15`). A colour with no entry is charged at 1.0.

`ProductTemplate.openingCount` is **not** priced. It is carried on the model
and shipped to the client, but no price path reads it. The seeded
`complexityMultiplier` values (0.9 / 1.15 / 1.4) do all the differentiation.

### Order totals

```ts
subtotal = round(sum(lineTotals), 2);
afterDiscount = round(subtotal * (1 - discountPercent / 100), 2);
discountAmount = round(subtotal - afterDiscount, 2);
taxAmount = round(afterDiscount * (taxRatePercent / 100), 2);
total = round(afterDiscount + taxAmount, 2);
// :103-109
```

Order of operations is fixed: **subtotal → discount → tax → total**. Tax is
applied to the discounted amount, not the subtotal.

`discountPercent` comes from the tenant's `PriceList`. `taxRatePercent` comes
from the main company's `Company.taxRatePercent` (seed: 20).

## Per-tenant price precedence

Applied per catalog item. Same logic in two places — keep them in sync:

- `src/lib/tenant.ts` (read path, storefront)
- `src/app/api/orders/route.ts` (write path, order creation)

```
1. CustomerPriceOverride.overrideSellPrice   (absolute price for this tenant)
2. CustomerPriceOverride.discountPercent      (percentage off the base price)
3. Base sell price
```

Then separately, the tenant's `PriceList.discountPercent` applies to the order
subtotal.

**The two mechanisms compound.** A tenant with a 15% price-list discount and a
10% per-item override gets both: the item price is 10% below base, and the
subtotal is then 15% below that. This is consistent with `docs/Business Logic.md`
§3.3, which lists them as independent, but it is the most likely source of a
price dispute.

Overrides are managed through `/api/price-overrides` and price lists through
`/api/price-lists`.

`costPrice` and `costPricePerSqm` are never exposed to tenants.
`getTenantCatalog` omits them, and the order-creation path never selects them.
Never add a cost field to a tenant-facing serializer.

## The live quote matches the final total

`src/components/order-wizard/PriceSummary.tsx` shows the line total, the tenant
discount, the tax and the grand total. The discount percent and the tax rate
are passed in from the server, so the number the tenant sees mid-wizard is the
number the server computes at submit time.

The order of operations is the same on both sides: **subtotal → discount →
tax → total**, with the tax applied to the discounted amount.

## Input validation happens before pricing

`src/lib/validation.ts` validates the whole `POST /api/orders` body before any
price is calculated. The pricing engine is pure and trusts its caller, so
every numeric input that reaches it must be checked first.

Rejected with 400: a missing or non-numeric `quantity`, a quantity below 1 or
above 10000, dimensions below 1 mm or above 20000 mm, a negative raw-profile
length, a pane count that contradicts `glazingLayers`, a `FINISHED_WINDOW` or
`FINISHED_DOOR` without a `profileId`, an unknown product kind, and a pane
thickness the glass type does not offer.

The `ProductTemplate` min/max dimensions and the `applicableKinds` of hardware
and processing options are checked on the server as well — the wizard enforces
them for UX, but the server is the boundary that matters.

## Where prices live in the schema

| Model              | Cost field          | Sell field                         |
| ------------------ | ------------------- | ---------------------------------- |
| `GlassType`        | `costPricePerSqm`   | `sellPricePerSqm`                  |
| `PvcProfile`       | `costPricePerMeter` | `sellPricePerMeter`                |
| `HardwareItem`     | `costPrice`         | `sellPrice`                        |
| `ProcessingOption` | `costPrice`         | `sellPrice`                        |
| `ProductTemplate`  | —                   | — (carries `complexityMultiplier`) |

`PriceList` carries `discountPercent` and `isDefault`.
`CustomerPriceOverride` carries `overrideSellPrice` or `discountPercent` plus
nullable pointers to one specific catalog item.

`Company.defaultMarkupPercent` (default 25) and `Company.minOrderValue` exist on
the model but are **not used** by the pricing engine. Do not assume they affect
anything.

## Known pricing gaps

| Gap                                               | Location                                                                                       | Note                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| No standalone hardware ordering                   | `src/components/order-wizard/OrderWizard.tsx:268`                                              | `HARDWARE` prices correctly, but the wizard never offers the kind |
| Template min/max dimensions unenforced            | `src/lib/pricing-engine.ts` has no check; `src/lib/tenant.ts:125-128` ships them to the client | Neither side enforces them; the server should                     |
| No validation of quantity or dimensions           | `src/app/api/orders/route.ts:85-142`                                                           | Negative quantity produces a negative-value order                 |
| A finished unit can be ordered with no frame      | `src/app/api/orders/route.ts:87-92` + `src/lib/pricing-engine.ts:73`                           | Failed profile lookup silently drops the frame cost               |
| Live quote omits tax and discount                 | `src/components/order-wizard/PriceSummary.tsx:39`                                              | Server total is correct; tenant sees a lower number mid-wizard    |
| `defaultMarkupPercent` and `minOrderValue` unused | `prisma/schema.prisma`                                                                         | Dead fields on `Company`                                          |
| `colorSurchargeFactor` and `openingCount` unused  | `src/lib/pricing-engine.ts`                                                                    | Schema fields no price path reads                                 |
| `ProcessingOption.unit` ignored                   | `src/lib/pricing-engine.ts:84`                                                                 | Processing is summed flat                                         |
| `ProductTemplate` has no price of its own         | schema                                                                                         | Only a complexity multiplier                                      |
| Decimal handling at the server→client boundary    | see below                                                                                      | Must be stringified                                               |

## The Decimal rule

Prisma `Decimal` values are not serializable into Client Components. Convert at
the Server Component boundary:

```ts
subtotal: o.subtotal.toString(),
taxAmount: o.taxAmount.toString(),
discountAmount: o.discountAmount.toString(),
total: o.total.toString(),
// items: lengthM, unitPrice, lineTotal
```

Reference: `src/app/(company)/dashboard/orders/[id]/page.tsx:103-104`.

The pricing engine itself uses plain `number` — the conversion happens only when
a `Decimal` crosses into a client component. Do not introduce `Decimal` into the
pricing engine; it must stay pure and dependency-free.
