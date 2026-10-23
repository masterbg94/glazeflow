# Data Model

Source of truth: `prisma/schema.prisma`. Database: SQLite in development
(`DATABASE_URL="file:./dev.db"`), PostgreSQL intended for production.

## Model graph

```
Company (isMainCompany = true)          the one main company
├── User            companyId            main-company staff
├── CustomerOrg     companyId            THE TENANTS
│   ├── User            customerOrgId    tenant employees
│   ├── Order           customerOrgId
│   ├── PriceList       priceListId
│   ├── CustomerPriceOverride[]
│   └── SavedConfiguration[]
├── GlassType / PvcProfile / HardwareItem / ProductTemplate / ProcessingOption
├── PriceList[]
├── Order            companyId
├── NotificationRule[]
└── CustomerPriceOverride[]

Order
├── OrderItem[]
│   ├── OrderItemGlassPane[]
│   ├── OrderItemHardware[]
│   └── OrderItemProcessing[]
├── OrderMessage[]
├── OrderAttachment[]
├── OrderStatusHistory[]
├── OrderStatusTransition[]
└── Notification[]
```

## Enums

| Enum                    | Values                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PlatformRole`          | `SUPER_ADMIN` · `COMPANY_ADMIN` · `COMPANY_STAFF` · `CUSTOMER`                                                                      |
| `CompanyRole`           | `COMPANY_ADMIN` · `COMPANY_SALES` · `COMPANY_PRODUCTION`                                                                            |
| `CustomerOrgRole`       | `TENANT_ADMIN` · `TENANT_MANAGER`                                                                                                   |
| `PaymentStatus`         | `UNPAID` · `INVOICED` · `PAID`                                                                                                      |
| `OrderAttachmentType`   | `DRAWING` · `PHOTO` · `PURCHASE_ORDER` · `OTHER`                                                                                    |
| `NotificationChannel`   | `IN_APP` · `EMAIL` · `BOTH`                                                                                                         |
| `NotificationFrequency` | `IMMEDIATE` · `DAILY_DIGEST`                                                                                                        |
| `ProductKind`           | `GLASS_ONLY` · `RAW_PROFILE` · `FINISHED_WINDOW` · `FINISHED_DOOR` · `HARDWARE`                                                     |
| `GlazingLayers`         | `SINGLE` · `DOUBLE` · `TRIPLE`                                                                                                      |
| `OrderStatus`           | `NEW` · `QUOTE_AMENDMENT` · `CONFIRMED` · `IN_PRODUCTION` · `READY` · `DELIVERED` · `CLOSED` · `CANCELLED`                          |
| `OrderItemStatus`       | `PENDING` · `ACCEPTED` · `REJECTED`                                                                                                 |
| `TransitionStatus`      | `PENDING` · `APPROVED` · `REJECTED` · `CANCELLED`                                                                                   |
| `NotificationEvent`     | `ORDER_CREATED` · `ORDER_CONFIRMED` · `ORDER_STATUS_CHANGED` · `QUOTE_AMENDED` · `ORDER_MESSAGE` · `ORDER_READY` · `STAFF_ASSIGNED` |

**There is no `PRODUCTION_WORKER` value in `CompanyRole`.** The "worker" role
described in `docs/BUSINESS_LOGIC_FIX.md` and `AGENTS.md:130` is not in the
schema.

## Model notes

### `Company` (`prisma/schema.prisma:95-138`)

| Field                  | Note                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`                 | Unique. The main company's slug is also the platform root domain                                                                                                                                                                             |
| `isMainCompany`        | The single-main-company invariant                                                                                                                                                                                                            |
| `isProducer`           | **Legacy.** Still read at `src/app/(company)/dashboard/layout.tsx:15-27` to decide the sidebar catalog link, but the codebase moved to `isMainCompany`. The seed sets both to `true`, so it happens to work — but nothing else depends on it |
| `currency`             | Default `RSD`                                                                                                                                                                                                                                |
| `taxRatePercent`       | Default 0; seed sets 20                                                                                                                                                                                                                      |
| `minOrderValue`        | **Unused** by the pricing engine                                                                                                                                                                                                             |
| `defaultMarkupPercent` | Default 25; **unused** by the pricing engine                                                                                                                                                                                                 |
| `measurementUnit`      | Default `mm`                                                                                                                                                                                                                                 |

### `User` (`prisma/schema.prisma:141-169`)

Three optional role fields, all nullable: `platformRole` (default `CUSTOMER`),
`companyRole`, `customerOrgRole`. `companyId` and `customerOrgId` are both
optional.

A tenant user has **both** `companyId` (pointing at the main company) and
`customerOrgId` (pointing at their tenant). This matters: any check comparing
`user.companyId` to `order.companyId` will pass for a tenant user on any
tenant's order. That is the root of `auth-gaps.md` #5.

### `CustomerOrg` (`prisma/schema.prisma:171-190`)

| Field                                        | Note                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `slug`                                       | Unique, nullable. Becomes the subdomain. Tenant creation requires it |
| `priceListId`                                | The tenant's tier discount                                           |
| `taxId`, `billingAddress`, `shippingAddress` | Optional                                                             |

**No product assignment field.** See `roles-and-tenancy.md` § "What is not
implemented".

### `CustomerPriceOverride` (`prisma/schema.prisma:332-354`)

Price only. Nullable pointers to one of `glassTypeId`, `profileId`,
`hardwareId`, `templateId`, plus `overrideSellPrice` and `discountPercent`.
Indexed on `[companyId, customerOrgId]`.

### `Order` (`prisma/schema.prisma:357-398`)

| Field                                              | Note                                                         |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `companyId`                                        | Always the main company                                      |
| `customerOrgId`                                    | The tenant that ordered                                      |
| `createdById`                                      | The tenant employee who placed it                            |
| `assigneeId`                                       | Optional main-company staff assignee                         |
| `orderNumber`                                      | Unique. Format `GF-<year>-<6 digits>`, random not sequential |
| `status`                                           | `OrderStatus`, default `NEW`                                 |
| `paymentStatus`                                    | `PaymentStatus`, default `UNPAID`                            |
| `subtotal`, `taxAmount`, `discountAmount`, `total` | `Decimal` — stringified at the client boundary               |
| `confirmedAt`, `closedAt`                          | Set on the matching status transition                        |

### `OrderItem` (`prisma/schema.prisma:419-452`)

`unitPrice` and `lineTotal` are the **price snapshot**. `status`
(`OrderItemStatus`) is separate from the order status and no code path currently
moves it off `PENDING`.

### `OrderStatusTransition` (`prisma/schema.prisma:505-523`)

The approval workflow row. `status` is `TransitionStatus`, default `PENDING`.
`requestedBy` and `approvedBy` are relations to `User`.

### `ProductTemplate` (`prisma/schema.prisma:272-293`)

Carries `openingCount`, `complexityMultiplier`, and the dimension bounds
`minWidthMm` / `maxWidthMm` / `minHeightMm` / `maxHeightMm` (defaults
300–3000). **The dimension bounds are never enforced anywhere.**

### `PriceList` (`prisma/schema.prisma:316-330`)

`discountPercent` and `isDefault`. Unique per `[companyId, name]`. A tenant
points at one via `CustomerOrg.priceListId`.

### `AuditLog` (`prisma/schema.prisma`, end of file)

One row per state change: `action`, `entity`, `entityId`, `actorId`,
`actorEmail`, `actorRole`, `ip`, `metadata` (JSON), `createdAt`. The actor id
is a loose string, not a relation, so deleting a user never deletes the record
of what that user did. Written by `src/lib/audit.ts` from every mutating
route; read through `GET /api/admin/audit`.

## Invariants to preserve

1. Exactly one `Company` with `isMainCompany = true`.
2. Tenants are `CustomerOrg` rows, never `Company` rows. `POST /api/companies`
   is blocked.
3. `Order.companyId` always equals the main company; `Order.customerOrgId` names
   the tenant.
4. `OrderItem.unitPrice` / `lineTotal` are snapshots — never recomputed after
   creation.
5. `costPrice` never reaches a tenant-facing serializer.
6. Every Prisma `Decimal` is stringified before crossing into a client
   component.
7. `CustomerOrg.slug` is unique and matches `^[a-z0-9-]+$`.

## Migration notes

- `prisma/migrations/` is gitignored and empty. The project uses
  `npm run db:push` (schema → SQLite) rather than committed migrations.
- `prisma/dev.db` is gitignored. Seed with `npm run db:seed`.
- After a schema change: `npx prisma generate`, then `npm run db:push`, then
  update `prisma/seed.ts` if the change affects required fields.
- `prisma/seed.ts` creates: the main company `acme`, users
  `superadmin@glazeflow.app` / `admin@acme.test` / `manager@acme.test` /
  `sales@acme.test` / `bob@customers.test` / `worker@customers.test`, all with
  its own strong password (see `docs/security-hardening.md`), the tenant "Prozori i vrata Boba" with slug `bob`,
  a full catalog, and three price lists.

The seed is idempotent — it uses `upsert` throughout, so re-running is safe.
