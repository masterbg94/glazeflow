# Role Model Knowledge Base

## Purpose

GlazeFlow has two role dimensions because it serves a platform owner, supplier
companies, supplier teams, and customer organizations. The dimensions answer
different questions:

- `platformRole`: what level of access the application grants.
- `companyRole`: what job or responsibility the person has inside a supplier company.

These are not two independent platform administrators. They are an access layer and
a business-function layer.

## Current schema

`User.platformRole` uses:

- `SUPER_ADMIN`: platform owner; cross-company administration.
- `COMPANY_ADMIN`: supplier-company administration.
- `COMPANY_STAFF`: supplier employee access.
- `CUSTOMER`: customer organization user.

`User.companyRole` is optional and uses:

- `COMPANY_ADMIN`: company owner/administrator.
- `COMPANY_SALES`: sales, customers, and quotes.
- `COMPANY_PRODUCTION`: production-related work and internal notes.

`companyId` identifies the supplier tenant. `customerOrgId` identifies the customer's
organization. See `prisma/schema.prisma` for authoritative enum and relation names.

## Intended combinations

| `platformRole`  | `companyRole`        | Meaning                                |
| --------------- | -------------------- | -------------------------------------- |
| `SUPER_ADMIN`   | usually `null`       | Platform owner, not a company employee |
| `COMPANY_ADMIN` | `COMPANY_ADMIN`      | Full supplier-company administrator    |
| `COMPANY_STAFF` | `COMPANY_SALES`      | Supplier sales employee                |
| `COMPANY_STAFF` | `COMPANY_PRODUCTION` | Supplier production employee           |
| `CUSTOMER`      | usually `null`       | Customer organization user             |

## Example from the admin table

```text
Uloga:          COMPANY_PRODUCTION
Platform uloga: COMPANY_ADMIN
```

This currently means: the person's business function is production, but the
application grants company-administrator access. The display is not a duplicate
value or rendering bug; it exposes two database fields.

The safer intended combination for a production employee is:

```text
platformRole: COMPANY_STAFF
companyRole:  COMPANY_PRODUCTION
```

## Important implementation status

The business design in `docs/Business Logic.md` is aligned with this two-dimensional
model: company admin has full control, while sales and production are narrower staff
functions. However, current authorization code mostly checks `platformRole`.
`companyRole` is stored and displayed but is not yet consistently enforced.

Therefore, do not claim that sales or production restrictions are fully active.
When changing role behavior, inspect `src/lib/rbac.ts`, middleware, and every affected
API route. A complete implementation must check both role dimensions where needed,
keep tenant checks, and hide UI actions that the API rejects.

## Agent answer pattern

When asked why two roles exist, answer in this order:

1. `platformRole` is system access.
2. `companyRole` is internal job function.
3. Show the user's actual combination.
4. Explain what the current code enforces versus what the business design intends.
5. Mention any mismatch as an implementation gap, not as intended behavior.
