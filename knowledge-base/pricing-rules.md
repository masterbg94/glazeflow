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

`HARDWARE` has no dedicated branch — it falls through and prices at zero. The
wizard never selects it (`src/components/order-wizard/OrderWizard.tsx:268`
offers only the other four), so the bug is latent.

### Line and item totals

```ts
baseUnit = (profileCost + glassCost + hardwareCost + processingCost) * complexityMultiplier;
unitPrice = round(baseUnit, 2);
lineTotal = round(unitPrice * quantity, 2);
// :86-89
```

`complexityMultiplier` comes from `ProductTemplate` (default 1.0). It applies to
the whole line, including hardware and processing.

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

- `src/lib/tenant.ts:63-76` (read path, storefront)
- `src/app/api/orders/route.ts:64-80` (write path, order creation)

```
1. CustomerPriceOverride.overrideSellPrice   (absolute price for this tenant)
2. CustomerPriceOverride.discountPercent      (percentage off the base price)
3. Base sell price
```

Then separately, the tenant's `PriceList.discountPercent` applies to the order
subtotal.

`costPrice` and `costPricePerSqm` are never exposed to tenants.
`getTenantCatalog` omits them, and the order-creation path never selects them.
Never add a cost field to a tenant-facing serializer.

## The live quote differs from the final total

The wizard's `PriceSummary` shows unit price and line total only. It does **not**
show the tenant discount or the tax, and the copy says the final total appears
at checkout (`src/components/order-wizard/PriceSummary.tsx:39-43`).

The server total therefore differs from what the tenant saw. This is by design
in the current UI, but it is a known gap: the tenant is surprised at submit time.
`docs/Business Logic.md` §4 Step 4 expects the live quote to include discount and
tax.

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

| Gap                                               | Location                                                                                       | Note                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `HARDWARE` kind prices at zero                    | `src/lib/pricing-engine.ts:63-89`                                                              | No branch; wizard never selects it                             |
| Template min/max dimensions unenforced            | `src/lib/pricing-engine.ts` has no check; `src/lib/tenant.ts:125-128` ships them to the client | The client could enforce, but does not                         |
| Live quote omits tax and discount                 | `src/components/order-wizard/PriceSummary.tsx:39`                                              | Server total is correct; tenant sees a lower number mid-wizard |
| `defaultMarkupPercent` and `minOrderValue` unused | `prisma/schema.prisma`                                                                         | Dead fields on `Company`                                       |
| `ProductTemplate` has no price of its own         | schema                                                                                         | Only a complexity multiplier                                   |
| Decimal handling at the server→client boundary    | see below                                                                                      | Must be stringified                                            |

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
