# GlazeFlow Knowledge Base

Reference material for AI agents (and humans) working on this repository.
Everything here is verified against the code. Where an older document disagrees,
the code wins and the disagreement is called out explicitly.

## Loading order

1. `AGENTS.md` — repo rules, commands, known issues.
2. `.agents/instructions/app-instructions.md` — GlazeFlow-wide rules.
3. The nearest scoped `instructions.md` for the area being touched:
   `src/app/`, `src/lib/`, `prisma/`, `docs/`.
4. The knowledge-base file that matches the question, from the table below.
5. The implementation files themselves.

Do not load every knowledge-base file for every task. They are reference, not
context to preload.

## Which file answers what

| Question                                            | Read                            |
| --------------------------------------------------- | ------------------------------- |
| How do roles work? Who can see what?                | `roles-and-tenancy.md`          |
| What are the order statuses? Who can move them?     | `order-lifecycle.md`            |
| How is price computed? Whose price applies?         | `pricing-rules.md`              |
| What does each API route do and who may call it?    | `api-map.md`                    |
| What are the database models and invariants?        | `data-model.md`                 |
| What security holes exist right now?                | `auth-gaps.md`                  |
| What hardening is in place, and what is still open? | `../docs/security-hardening.md` |
| Why are there two role fields?                      | `roles-explanation.md`          |
| What is the app for, in business terms?             | `../docs/Business Logic.md`     |

## Skills

Task-shaped checklists live in `.claude/skills/`. Load the matching one when the
task description fits:

| Skill                      | Use when                                                        |
| -------------------------- | --------------------------------------------------------------- |
| `glazeflow-tenant-guard`   | Changing catalog visibility, tenant pricing, or order creation  |
| `glazeflow-role-check`     | Changing roles, permissions, status transitions, admin surfaces |
| `glazeflow-pricing-change` | Changing prices, price lists, overrides, or the pricing engine  |
| `glazeflow-schema-change`  | Changing `prisma/schema.prisma` or seed data                    |
| `glazeflow-order-flow`     | Changing orders, statuses, notifications, real-time events      |
| `glazeflow-onboard`        | Answering "how does this app work" read-only questions          |

## The three facts that matter most

1. **One main company.** `Company.isMainCompany = true`, exactly one row. It owns
   the whole catalog. Tenants are `CustomerOrg` rows, never `Company` rows.
2. **Price is server-authoritative.** The client quote is a preview. The server
   recomputes totals from the database at order creation.
3. **Every tenant currently sees the whole catalog.** There is no per-tenant
   product assignment. Per-tenant differences are price only. See
   `auth-gaps.md` and the "not implemented" section of `roles-and-tenancy.md`.
