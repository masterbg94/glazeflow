# GlazeFlow AI Agent Instructions

## Mission

GlazeFlow is a multi-tenant B2B ordering system for glass, PVC profiles, windows,
doors, hardware, and processing services. One main company owns the platform and
the entire catalog; tenants (small companies) order from it. Preserve tenant
isolation, role permissions, authoritative server-side pricing, and existing
Serbian UI copy.

## Source of truth

- Application code: `src/`
- Route handlers and pages: `src/app/`
- Shared server/client logic: `src/lib/`
- Database schema and seed data: `prisma/`
- Verified reference material: `knowledge-base/`
- Product history and intent: `docs/`
- Runtime commands: `package.json`

Read the closest scoped `instructions.md` before editing files in that directory.
Treat code and `prisma/schema.prisma` as authoritative when documentation
conflicts with them. Treat `docs/` as product intent and history, not as proof
that behavior is implemented.

## Instruction loading order

For each task, an AI agent should:

1. Load repository-level `AGENTS.md`.
2. Load this file for GlazeFlow-wide rules.
3. Load every nearest scoped file matching the files it will inspect or edit:
   `src/app/instructions.md`, `src/lib/instructions.md`,
   `prisma/instructions.md`, and/or `docs/instructions.md`.
4. Read the implementation files and the matching `knowledge-base/` file.
5. Resolve conflicts by precedence: scoped instructions refine this file; code
   and `prisma/schema.prisma` determine implemented behavior;
   `knowledge-base/` describes verified current behavior; `docs/` describes
   intent or history.

If the task only asks a question, load the same applicable instructions for the
code area being explained, but do not edit files.

`.agents/skills/**` is excluded from this application loading order — skill files
load only when the agent runtime activates the matching skill. The GlazeFlow
skills are listed in `knowledge-base/README.md`; load the one whose description
matches the task.

## Security rules

1. Every password that reaches the database goes through
   `checkPasswordPolicy()` in `src/lib/password-policy.ts` and is hashed with
   `hashPassword()` (bcrypt cost 12). Never call `bcrypt.hash` directly.
2. Every state-changing route writes one audit row through `auditFromSession`
   in `src/lib/audit.ts`. A change that is not audited cannot be proved, so a
   new mutating route is incomplete without it.
3. The middleware applies a rate limit and an origin check to every mutating
   `/api` request (`src/middleware.ts`). New routes inherit both; do not
   re-implement them per route.
4. Sessions live at most 8 hours. Do not extend the lifetime without a reason
   written in `docs/security-hardening.md`.
5. `companyId`, `customerOrgId`, and `slug` come from the session, never from
   the body, and never from a client-supplied price.
6. Development credentials live in `prisma/seed.ts` (`SEED_PASSWORDS`) and are
   documented in `docs/security-hardening.md`. They are local only. Never put a
   production secret in a tracked file.

## The three invariants

1. **One main company.** `Company.isMainCompany = true`, exactly one row. It
   owns the whole catalog. Tenants are `CustomerOrg` rows, never `Company` rows.
2. **Price is server-authoritative.** The client quote is a preview. The server
   recomputes totals from the database at order creation.
3. **Tenant data is scoped by `customerOrgId`.** A tenant user's `companyId`
   points at the main company, so comparing `companyId` does not scope to the
   tenant. Use `customerOrgId` for tenant scope.

## Non-negotiable rules

1. Keep every company-scoped query filtered by the authenticated user's company,
   except intentional `SUPER_ADMIN` platform operations. Keep every
   tenant-scoped query filtered by `customerOrgId`.
2. Enforce authorization on the server with `requireRole`; do not rely on hidden
   buttons, middleware, or client checks. Middleware does not guard `/api` paths.
3. Wrap every `requireRole` call in `try/catch` and map the error with
   `toHttpError` from `src/lib/rbac.ts`, so a rejected role returns 401/403
   rather than a 500.
4. Derive `companyId`, `customerOrgId`, and `slug` from the session. Never trust
   them from a request body.
5. Keep pricing logic in `src/lib/pricing-engine.ts`. Client quotes are previews;
   order creation must calculate authoritative totals on the server. The engine
   stays pure — no database, no session, no side effects.
6. Use Prisma types and existing helpers. Do not add `as any` unless no typed
   alternative exists and the reason is documented. In particular, do not merge
   `companyRole` and `platformRole` into one string — that grants admin rights
   to staff.
7. Preserve Next.js App Router conventions: server components by default; add
   `"use client"` only for browser state, events, or providers.
8. Do not expose secrets or server-only environment variables to client code.
   Never expose `costPrice` to a tenant.
9. Keep changes narrow. Update the related `knowledge-base/` and `docs/` files
   when behavior changes.
10. Run the smallest relevant validation command after edits.

## Common verification

```bash
npm run format:check
npm run typecheck
npm run test
npm run build
```

`npm run lint` runs `tsc --noEmit` — `next lint` was removed in Next.js 16 and
the script was rewritten rather than left broken.

For schema changes, also run `npx prisma generate` and `npm run db:push`. Never
use production data for local experiments.

There is a Vitest suite covering the three pure modules — `pricing-engine`,
`status-transitions`, and `validation`. Run it with `npm run test`. A change to
one of those three must come with a test.

## Known implementation risks

Read `knowledge-base/auth-gaps.md` before changing authorization, tenancy, order
creation, or pricing. It records the verified holes that were found and fixed,
with file and line references for the check that now guards each one.

Two features described in the business docs do **not** exist in code: per-tenant
catalog assignment, and any `customerOrgRole` restriction beyond the finance
page. Do not write code or documentation as if they were present. See
`knowledge-base/roles-and-tenancy.md` § "What is not implemented".
