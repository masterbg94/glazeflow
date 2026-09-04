# Product Knowledge Base Instructions

Use these documents to explain product behavior:

- `how-app-works-with-roles.md`: end-to-end Serbian product overview.
- `roles.md`: role capabilities and currently known authorization/UX gaps.
- `Business Logic.md`: pricing and architecture observations plus improvement plan.
- `improvements.md`: prioritized technical risks and proposed remediation.
- `../knowledge-base/roles-explanation.md`: canonical explanation of the two
  role dimensions and their current implementation status.

## Product flow

A customer opens a company storefront by slug, configures a glass, PVC, window, door,
or hardware item in the order wizard, sees a live quote, and submits delivery details.
Company users manage catalog and order operations in the dashboard. Platform
`SUPER_ADMIN` users manage companies and company users in the admin panel.

Typical order lifecycle is `NEW`, `QUOTE_REVISION`, `CONFIRMED`, `IN_PRODUCTION`,
`READY`, `DELIVERED`, `CLOSED`, or `CANCELLED`; verify enum names in
`prisma/schema.prisma` before writing code or user-facing text.

## Documentation discipline

Mark statements as implemented, intended, or known gap when uncertainty matters.
Do not claim that a documented feature works without checking its route, component,
and schema. Keep this file concise; put detailed role or pricing explanations in the
existing scoped documents.

For role questions, read `../knowledge-base/roles-explanation.md`, then verify
against `roles.md`, `Business Logic.md`, `prisma/schema.prisma`, and the relevant
authorization code.
