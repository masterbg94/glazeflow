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

## Audit trail

`AuditLog` records one row per state change: action, entity, entityId, actor,
ip, metadata. The actor id is a loose string, not a relation — deleting a user
must not delete the record of what that user did. Rows are written by
`src/lib/audit.ts` and read through `GET /api/admin/audit`. Do not add a
relation from `User` to `AuditLog`.

## Foreign keys

SQLite does not enforce foreign keys unless the pragma is on.
`src/lib/prisma.ts` turns it on at start-up, so a delete that would orphan a
row now fails. Deleting a user who owns orders or messages is refused with 409
— deactivate the account instead.

## Seed credentials

The development seed creates sample platform, company-admin, and customer accounts.
Each account has its own strong password, listed in `SEED_PASSWORDS` in
`prisma/seed.ts` and documented in `docs/security-hardening.md`. The seed
rewrites the password hash on every run, so it also rotates the local database.

Treat seed passwords as local development-only credentials. Never reuse them in
production or place secrets in source control.
