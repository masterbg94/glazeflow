# GlazeFlow AI Agent Instructions

## Mission

GlazeFlow is a multi-tenant B2B ordering system for glass, PVC profiles, windows,
doors, hardware, and processing services. Preserve tenant isolation, role
permissions, authoritative server-side pricing, and existing Serbian UI copy.

## Source of truth

- Application code: `src/`
- Route handlers and pages: `src/app/`
- Shared server/client logic: `src/lib/`
- Database schema and seed data: `prisma/`
- Product and role documentation: `docs/`
- AI role knowledge base: `knowledge-base/`
- Runtime commands: `package.json`

Read the closest scoped `instructions.md` before editing files in that directory.
Treat code and Prisma schema as authoritative when documentation conflicts with them.
Treat `docs/` as product intent and known-issue context, not as proof that behavior
is implemented.

## Instruction loading order

For each task, an AI agent should:

1. Load repository-level `AGENTS.md`.
2. Load this file for GlazeFlow-wide rules.
3. Load every nearest scoped file matching files it will inspect or edit:
   `src/app/instructions.md`, `src/lib/instructions.md`,
   `prisma/instructions.md`, and/or `docs/instructions.md`.
4. Read relevant implementation files and docs only after those instructions.
5. Resolve conflicts by precedence: scoped instructions refine this file; code and
   `prisma/schema.prisma` determine implemented behavior; docs describe intent or
   known gaps.

If task only asks a question, load the same applicable instructions for the code
area being explained, but do not edit files. `.agents/skills/**` is excluded from
this application loading order; skill files load only when agent runtime activates
their skill.

## Non-negotiable rules

1. Keep every company-scoped query filtered by the authenticated user's company,
   except intentional `SUPER_ADMIN` platform operations.
2. Enforce authorization on the server with `requireRole`; do not rely on hidden
   buttons, middleware, or client checks.
3. Use `assertSameCompany` when checking access to an existing company resource.
4. Keep pricing logic in `src/lib/pricing-engine.ts`. Client quotes are previews;
   order creation must calculate authoritative totals on the server.
5. Use Prisma types and existing helpers. Do not add `as any` unless no typed
   alternative exists and the reason is documented.
6. Preserve Next.js App Router conventions: server components by default; add
   `"use client"` only for browser state, events, or providers.
7. Do not expose secrets or server-only environment variables to client code.
8. Keep changes narrow. Update related documentation when behavior changes.
9. Run the smallest relevant validation command after edits.

## Common verification

```bash
npm run format:check
npm run lint
npm run build
```

For schema changes, also run `npx prisma generate` and the appropriate database
migration or `npm run db:push`. Never use production data for local experiments.

## Known implementation risks

See `docs/roles.md`, `docs/Business Logic.md`, and
`knowledge-base/roles-explanation.md` before changing authorization,
real-time behavior, or order pricing. They document current gaps including weak
input validation, scattered real-time handling, unsafe company selection during
order creation, and UI/API permission mismatches.
