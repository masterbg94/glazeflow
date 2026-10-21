# Product Knowledge Base Instructions

Verified, code-backed reference lives in `../knowledge-base/`. This file is the
index for that base plus the human-facing product documents.

## Knowledge base (verified against the code)

| File                                     | Use for                                                              |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `../knowledge-base/README.md`            | Index and loading order — start here                                 |
| `../knowledge-base/roles-and-tenancy.md` | Role model, tenant model, permission matrix, what is not implemented |
| `../knowledge-base/order-lifecycle.md`   | Statuses, transition rules, approval chain, notifications, real-time |
| `../knowledge-base/pricing-rules.md`     | Formulas, per-tenant price precedence, Decimal rule                  |
| `../knowledge-base/api-map.md`           | Every route, its auth gate, its conventions                          |
| `../knowledge-base/data-model.md`        | Models, enums, relations, invariants, migration workflow             |
| `../knowledge-base/auth-gaps.md`         | Verified security holes with file:line                               |
| `../knowledge-base/roles-explanation.md` | Why there are two role dimensions                                    |

Prefer these over the Serbian product documents for any question about current
behavior. They are checked against the code; the `docs/` files are not always.

## Product documents (intent and history)

- `how-app-works-with-roles.md`: end-to-end Serbian product overview.
- `roles.md`: role capabilities and known authorization/UX gaps.
- `Business Logic.md`: the original product vision — intent, not implementation.
- `BUSINESS_LOGIC_FIX.md`: the executed migration to the one-main-company model.
- `improvements.md`: prioritized technical risks and proposed remediation.
- `ai-structure-plan.md`: how the AI skills, instructions, and knowledge base are
  organized, and why.

## How to work in this folder

- `agents-when-load.md`: the order in which instructions load, and what not to
  trust without checking. Read this before touching any scoped `instructions.md`.
- `files-here.md`: what each file in the repository contains.
- `postgres-migration.md`: the SQLite → PostgreSQL move. Read it before any
  change that touches `datasource`, `Decimal` handling, or the deployment
  target.

## Product flow

A tenant employee opens the storefront by tenant slug, configures a glass, PVC,
window, door, or hardware item in the order wizard, sees a live quote, and submits
delivery details. Main-company staff manage the catalog and advance orders
through production. Platform `SUPER_ADMIN` users manage tenants and users in the
admin panel.

Order lifecycle: `NEW`, `QUOTE_AMENDMENT`, `CONFIRMED`, `IN_PRODUCTION`, `READY`,
`DELIVERED`, `CLOSED`, `CANCELLED`. Verify enum names in `prisma/schema.prisma`
before writing code or user-facing text.

## Documentation discipline

Mark statements as implemented, intended, or known gap when uncertainty matters.
Do not claim that a documented feature works without checking its route, component,
and schema. Keep this file concise; put detailed explanations in the knowledge base.

For role questions, read `../knowledge-base/roles-and-tenancy.md`, then verify
against `prisma/schema.prisma` and the relevant authorization code.
