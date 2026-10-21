# Role Model Knowledge Base

## Purpose

GlazeFlow serves a platform owner, a main company, main-company teams, and
tenant organizations. The role fields answer different questions:

- `platformRole`: what level of access the application grants.
- `companyRole`: what job or responsibility the person has inside the main
  company.
- `customerOrgRole`: what the person may do inside their tenant organization.

These are not three independent administrator levels. They are an access layer
plus two business-function layers.

## Current schema

`User.platformRole` uses:

- `SUPER_ADMIN`: platform owner; cross-company administration.
- `COMPANY_ADMIN`: main-company administration.
- `COMPANY_STAFF`: main-company employee access.
- `CUSTOMER`: tenant organization user.

`User.companyRole` is optional and uses:

- `COMPANY_ADMIN`: main-company owner/administrator.
- `COMPANY_SALES`: sales, customers, and quotes.
- `COMPANY_PRODUCTION`: production-related work and internal notes.

`User.customerOrgRole` is optional and uses:

- `TENANT_ADMIN`: tenant administrator — sees `/finance`.
- `TENANT_MANAGER`: tenant employee.

`companyId` identifies the main company. `customerOrgId` identifies the
tenant organization. See `prisma/schema.prisma` for authoritative enum and
relation names.

## Intended combinations

| `platformRole`  | `companyRole`        | `customerOrgRole` | Meaning                                |
| --------------- | -------------------- | ----------------- | -------------------------------------- |
| `SUPER_ADMIN`   | usually `null`       | `null`            | Platform owner, not a company employee |
| `COMPANY_ADMIN` | `COMPANY_ADMIN`      | `null`            | Full main-company administrator        |
| `COMPANY_STAFF` | `COMPANY_SALES`      | `null`            | Main-company sales employee            |
| `COMPANY_STAFF` | `COMPANY_PRODUCTION` | `null`            | Main-company production employee       |
| `CUSTOMER`      | usually `null`       | `TENANT_ADMIN`    | Tenant administrator                   |
| `CUSTOMER`      | usually `null`       | `TENANT_MANAGER`  | Tenant employee                        |

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

The business design in `docs/Business Logic.md` is aligned with this
multi-dimensional model: company admin has full control, while sales and
production are narrower staff functions. However, current authorization code
mostly checks `platformRole`.

`companyRole` is stored and displayed, but is not consistently enforced. Two
places merge it with `platformRole` into one string —
`src/app/api/orders/[id]/status/route.ts:13` and
`src/app/(company)/dashboard/orders/page.tsx:32` — and
`src/lib/status-transitions.ts:74-80` treats that merged value of
`COMPANY_ADMIN` as omnipotent. A `COMPANY_STAFF` user holding
`companyRole: COMPANY_ADMIN` therefore skips the approval chain.

`customerOrgRole` is enforced in exactly one place:
`src/app/(storefront)/[companySlug]/finance/page.tsx:20`. `TENANT_ADMIN` and
`TENANT_MANAGER` have identical power everywhere else.

There is **no** `PRODUCTION_WORKER` value in the `CompanyRole` enum. The
"worker" role described in `docs/BUSINESS_LOGIC_FIX.md` and `AGENTS.md` is
prose, not schema.

Therefore, do not claim that sales, production, or tenant-manager restrictions
are fully active. When changing role behavior, inspect `src/lib/rbac.ts`,
`src/middleware.ts`, `src/lib/status-transitions.ts`, and every affected API
route. A complete implementation must check the right dimension per rule, keep
tenant checks, and hide UI actions that the API rejects.

## Agent answer pattern

When asked why several roles exist, answer in this order:

1. `platformRole` is system access.
2. `companyRole` is the internal job function inside the main company.
3. `customerOrgRole` is the function inside the tenant organization.
4. Show the user's actual combination.
5. Explain what the current code enforces versus what the business design
   intends.
6. Mention any mismatch as an implementation gap, not as intended behavior.

For the full permission matrix and the tenant model, read
`roles-and-tenancy.md`. For the verified security holes, read `auth-gaps.md`.
