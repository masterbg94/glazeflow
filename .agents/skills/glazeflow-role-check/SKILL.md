---
name: glazeflow-role-check
description: Check role and permission changes in GlazeFlow. Use when changing platformRole, companyRole, customerOrgRole, the transition rules, admin or dashboard surfaces, user creation, or any UI that hides actions by role. Also use when a change touches requireRole, middleware guards, or status approval.
---

# Role check

GlazeFlow has three role dimensions. They are not interchangeable, and the
current code conflates two of them — that is the defect this skill exists to
prevent repeating.

## The three dimensions

| Field | Values | Question |
| --- | --- | --- |
| `platformRole` | `SUPER_ADMIN` · `COMPANY_ADMIN` · `COMPANY_STAFF` · `CUSTOMER` | What access does the app grant? |
| `companyRole` | `COMPANY_ADMIN` · `COMPANY_SALES` · `COMPANY_PRODUCTION` | What job inside the main company? |
| `customerOrgRole` | `TENANT_ADMIN` · `TENANT_MANAGER` | What inside the tenant? |

`platformRole` is the access layer. `companyRole` and `customerOrgRole` are
business-function layers. A production employee is `platformRole: COMPANY_STAFF`
with `companyRole: COMPANY_PRODUCTION` — never `platformRole: COMPANY_ADMIN`.

## The trap

Two API routes and one page do this:

```ts
const userRole = user.companyRole || user.platformRole;
```

- `src/app/api/orders/[id]/status/route.ts:13`
- `src/app/(company)/dashboard/orders/page.tsx:32`
- `src/app/api/orders/transitions/[id]/route.ts:13-18` uses a related pattern

`src/lib/status-transitions.ts:74-80` treats `userRole === 'COMPANY_ADMIN'` as
omnipotent. Because `companyRole` is checked first, a `COMPANY_STAFF` user
holding `companyRole: COMPANY_ADMIN` skips the approval chain entirely.

**Do not merge the enums.** Check the dimension the rule belongs to:

```ts
// main-company staff rules → use companyRole
if (user.companyRole === 'COMPANY_ADMIN') { ... }

// tenant rules → use customerOrgRole
if (user.customerOrgRole === 'TENANT_ADMIN') { ... }

// platform access → use platformRole
if (user.platformRole === 'SUPER_ADMIN') { ... }
```

## What each role actually does today

`companyRole` is **not** consistently enforced. Verified state:

| `companyRole` | Enforced where |
| --- | --- |
| `COMPANY_ADMIN` | Omnipotent in the transition rules (`status-transitions.ts:74-80`) — and that omnipotence leaks to `COMPANY_STAFF` users because of the conflation above |
| `COMPANY_PRODUCTION` | Forward free, backward and cancel need approval (`status-transitions.ts:121-132`) |
| `COMPANY_SALES` | Identical to `COMPANY_PRODUCTION` (`status-transitions.ts:134-149`) — no distinct rule exists |

`customerOrgRole` is consulted in **exactly one** authorization decision:

```ts
// src/app/(storefront)/[companySlug]/finance/page.tsx:20
if (user.customerOrgRole !== 'TENANT_ADMIN' || user.customerOrgId !== tenant.id) {
  redirect('/my-orders');
}
```

`TENANT_MANAGER` is not view-only. Anywhere else, the two tenant roles are
identical. If a task says "managers can only view", that is a feature, not a
bug fix.

There is **no** `PRODUCTION_WORKER` value in the `CompanyRole` enum. The
"worker" role in `docs/BUSINESS_LOGIC_FIX.md` and `AGENTS.md:130` is prose, not
schema. `COMPANY_STAFF` + `companyRole: COMPANY_PRODUCTION` is the closest
existing thing.

## Enforcement layers

| Layer | Trust |
| --- | --- |
| `requireRole([...])` in `src/lib/rbac.ts:8` | Real — server-side |
| Page-level `redirect()` / `notFound()` | Real — server-side |
| `src/middleware.ts` | Navigation only — `/api/*` bypasses it entirely |
| Hidden buttons, disabled menu items | UX only — never a boundary |

**Every API route is its own only auth boundary.** `src/middleware.ts:28` returns
`next()` for every `/api` path.

## Always wrap requireRole

`requireRole` throws. Uncaught, it becomes a 500 with a stack trace instead of a
401 or 403. Twelve of the fourteen call sites get this wrong
(`knowledge-base/auth-gaps.md` #7).

```ts
let session;
try {
  session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
} catch (err) {
  return toHttpError(err);
}
```

`toHttpError` is at `src/lib/rbac.ts:26`. Use it in every new route.

## Status transitions

`getTransitionRule(userRole, fromStatus, toStatus, platformRole)` in
`src/lib/status-transitions.ts:78-154` is the single decision point. It returns
`{ allowed, requiresApproval, approverRoles }`.

When `requiresApproval` is true, the API must **not** change the status. It
creates an `OrderStatusTransition` row with `status = PENDING` and notifies
approvers. The approver acts through
`PATCH /api/orders/transitions/[id]` with `action: 'approve' | 'reject'`.

If a change adds a role, add its rule here, not in the route handler.

The client also computes allowed statuses (`getAllowedNextStatuses`,
`OrderKanban.tsx:201-207`) for the dropdown. The server re-validates. Keep both
in sync — or better, let the server drive it.

## User creation

`POST /api/companies/[id]/users/route.ts` takes `platformRole` from the request
body and writes it straight to the user (`auth-gaps.md` #8). It should be
derived: creating a user under a `companyId` means a main-company user;
creating one under a `customerOrgId` means a tenant user.

`PATCH /api/companies/[id]/users/[userId]` lets an admin set `companyRole` on a
tenant user (`route.ts:63`). That is the setup for the cross-tenant approval
hole (`auth-gaps.md` #5). Guard it.

## UI gating

Hiding a button is not a permission. The catalog page shows "Dodaj stavku" to
`COMPANY_STAFF`, who then gets a 403 from the API. When adding a role-gated
action, gate the button **and** the API, and make the two match.

`/admin` and `/admin/companies/[id]` are client components with no page-level
session check. The middleware and the API are their only gates.

## Checklist before finishing

- [ ] The change checks the correct role dimension, and no `||` merges two
      enums into one string.
- [ ] New `requireRole` call sites are wrapped with `toHttpError`.
- [ ] Every role-gated UI action is also gated server-side, and the two agree.
- [ ] New roles are added to `status-transitions.ts` and to the enum, in the
      same change.
- [ ] Tenant rules use `customerOrgRole`; main-company rules use `companyRole`;
      platform rules use `platformRole`.
- [ ] No doc claims a role restriction that the code does not enforce.

## Verify

```bash
npm run build
```

Then log in as each affected role and confirm the action is available to the
right ones and rejected for the rest — by the API response, not by the UI.
