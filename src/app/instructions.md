# `src/app` Instructions

## Routing map

- `(auth)/login` and `(auth)/register`: authentication and public registration.
- `(storefront)/[companySlug]`: tenant storefront, order wizard, and customer orders.
- `(company)/dashboard`: company administration, catalog, order operations, and messages.
- `(platform)/admin`: platform administration, companies, and company users.
- `api/`: Next.js route handlers for auth, catalog, companies, orders, pricing,
  notifications, and registration.

Route groups in parentheses do not change URL paths. A storefront company slug is
resolved through `src/lib/tenant.ts`; inactive or missing companies must remain 404.

## Server/client boundary

Pages are server components unless they render interactive components. Interactive
wizard, Kanban, notifications, and real-time providers are client components. Keep
database access and authorization in server components or route handlers; pass only
serialized, non-secret data to client components.

## Authorization expectations

- `/admin/*`: `SUPER_ADMIN` only.
- `/dashboard/*`: `COMPANY_ADMIN` and `COMPANY_STAFF`.
- Customer order pages require an authenticated customer and ownership checks.
- Mutation handlers must repeat authorization and tenant checks even when middleware
  already guards navigation.

## API conventions

Before adding or changing a handler, inspect neighboring handlers for response shape,
session lookup, error handling, and event publication. Validate request bodies,
normalize IDs, scope Prisma reads and writes, and return explicit HTTP errors.
Do not trust `companyId` supplied by a customer request when session context can
determine the company.

Order status changes, messages, notifications, and real-time events are coupled:
update the database first, then publish the corresponding event using existing event
types and notification helpers.
