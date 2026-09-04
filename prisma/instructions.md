# `prisma` Instructions

## Data model

`Company` is the tenant root. It owns users, customer organizations, catalog items,
price lists, orders, notifications, and related records. Main catalog models are
`GlassType`, `PvcProfile`, `HardwareItem`, `ProductTemplate`, and
`ProcessingOption`. Orders contain `OrderItem` records plus glass panes, hardware,
processing, status history, attachments, and messages.

Important enums include `PlatformRole`, `ProductKind`, `OrderStatus`,
`OrderItemStatus`, `NotificationEvent`, and glazing-layer values. Read
`schema.prisma` before changing relations, optionality, or enum values.

## Migration rules

1. Make schema changes backward-compatible where possible.
2. Use Prisma migration tooling for committed schema changes.
3. Regenerate the client after schema edits.
4. Update `seed.ts` when new required fields or behavior need representative data.
5. Do not delete or rename production data fields without an explicit migration plan.

Development uses SQLite through `DATABASE_URL`; production should use a managed
database, preferably PostgreSQL. Prisma Decimal values must be converted to numbers
before passing them into client-side pricing components.

## Seed credentials

The development seed creates sample platform, company-admin, and customer accounts.
Treat seed passwords as local development-only credentials. Never reuse them in
production or place secrets in source control.
