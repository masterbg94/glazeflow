# Security hardening — 2026-10-21

Record of the hardening pass that followed the authorization audit. Every item
below is implemented in the code; the file:line references point at the check
that enforces it.

## What the audit found

The write path was already locked: all 25 route files under `src/app/api/**`
gate on a session, and no route trusts a `companyId` or a `customerOrgId` from
the request body. What was missing was everything around the write path —
brute force protection, browser hardening, a trail that proves who changed
what, and a password policy.

## P0 — closed

### 1. Rate limiting

`src/lib/rate-limit.ts` — fixed-window limiter, per client address.

| Surface                               | Limit        | Window |
| ------------------------------------- | ------------ | ------ |
| `/api/auth/*` (every sign-in attempt) | 30 requests  | 5 min  |
| `/api/pricing/quote`                  | 60 requests  | 1 min  |
| every other mutating `/api` call      | 120 requests | 1 min  |

Applied in `src/middleware.ts:guardApiRequest`, so it covers every route
without a per-route edit.

Login has a second, stricter limit inside the credentials provider
(`src/lib/auth.ts`): 8 failed attempts per account and 30 per address inside a
15 minute window. A locked account stays locked for the rest of the window even
if the password is correct. Both counters are cleared on a successful sign-in.

Limiter state lives in the process memory, so the limit is per instance. Behind
more than one instance the effective limit multiplies by the instance count —
replace the module body with a shared store (Redis, Upstash) without touching
the call sites.

### 2. Security headers

`next.config.ts` sends, on every response:

- `Content-Security-Policy` — `default-src 'self'`, no objects, no framing,
  `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. The
  script policy keeps `'unsafe-inline'` because the App Router inlines the
  server-component payload; a nonce-based policy is the next step.
- `Strict-Transport-Security` — production only.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy: same-origin`, `X-DNS-Prefetch-Control: off`,
  `X-Permitted-Cross-Domain-Policies: none`.

### 3. Cross-origin writes rejected

The session cookie is sent to every subdomain of the root domain in production,
so a page on a tenant subdomain could otherwise drive the main company's
session. `SameSite=Lax` blocks a cross-site POST, but a sibling subdomain is
same-site.

`src/middleware.ts:originAllowed` now requires the `Origin` header of every
mutating request to match the host the request was sent to, and rejects
`Sec-Fetch-Site: cross-site`. A request without an `Origin` header is allowed —
that is a non-browser client, and it cannot be tricked into sending a forged
origin. NextAuth's own callback routes keep their built-in CSRF token.

## P1 — closed

### 4. Audit trail

New model `AuditLog` in `prisma/schema.prisma`: action, entity, entityId,
actorId, actorEmail, actorRole, ip, metadata, createdAt. The actor id is a
loose string, not a relation, so deleting a user never deletes the record of
what that user did.

`src/lib/audit.ts` writes one row per state change through
`auditFromSession`. Every mutating route now writes one:

| Route                                                              | Action                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------- |
| `POST /api/orders`                                                 | `order.create`                                           |
| `PATCH /api/orders/[id]/status`                                    | `order.status.change`, `order.status.change.requested`   |
| `PATCH /api/orders/[id]/items/[itemId]`                            | `orderitem.status.change`                                |
| `POST /api/orders/[id]/messages`                                   | `order.message.create`                                   |
| `PATCH /api/orders/[id]/payment`                                   | `order.payment.change`                                   |
| `PATCH /api/orders/transitions/[id]`                               | `order.transition.approve`, `order.transition.reject`    |
| `POST/PATCH/DELETE /api/catalog`                                   | `catalog.create`, `catalog.update`, `catalog.deactivate` |
| `POST/PATCH/DELETE /api/price-lists`                               | `pricelist.*`                                            |
| `POST/PATCH/DELETE /api/price-overrides`                           | `priceoverride.*`                                        |
| `POST/PATCH/DELETE /api/tenants`, `PATCH/DELETE /api/tenants/[id]` | `tenant.*`                                               |
| `POST /api/companies/[id]/users`                                   | `user.create`                                            |
| `PATCH/DELETE /api/companies/[id]/users/[userId]`                  | `user.update`, `user.delete`                             |
| `POST /api/register`                                               | `user.create`                                            |
| sign-in                                                            | `auth.login.success`, `auth.login.failed`                |

Read the trail with `GET /api/admin/audit` (`SUPER_ADMIN` only), filtered by
`entity`, `entityId`, `actorId`, or `action`.

### 5. Database-level protection

- **SQLite (today):** foreign keys are off by default, so a deleted user or
  catalog row used to leave orders pointing at nothing.
  `src/lib/prisma.ts` turns the pragma on at start-up
  (`PRAGMA foreign_keys = ON`).
- **PostgreSQL (production target):** two files.
  `prisma/postgres-supabase.sql` is the mandatory one on Supabase: Supabase
  grants `anon` and `authenticated` full DML on every new table in `public`,
  and the anon key is public, so without a lockdown the anon key can read and
  write every table through PostgREST — outside NextAuth and outside the
  application code. The file revokes those grants and turns row level
  security on for every table, without `FORCE`, so the application (the table
  owner) keeps working with its own checks.
  `prisma/postgres-rls.sql` is the stronger, opt-in version: per-tenant
  policies, a `glazeflow_app` role with `NOBYPASSRLS`, and the
  `SET LOCAL app.tenant_id` context each transaction must set. It needs the
  application to set that context, so it is not a drop-in.
  Both are applied during the SQLite → PostgreSQL move, described in
  `docs/postgres-migration.md`.

One behavior change comes with the pragma: deleting a user who owns orders or
messages is now refused with 409. Deactivate the account instead.

### 6. Password policy

`src/lib/password-policy.ts`: at least 12 characters, at most 72 (bcrypt
ignores anything past 72 bytes), one lowercase letter, one uppercase letter,
one digit, one symbol, not a common password, and not built from the account's
own name or email address. The check runs on every path that creates a
password — `POST /api/register` and `POST /api/companies/[id]/users`.

bcrypt cost is 12 everywhere, including the seed.

### 7. Session lifetime

`src/lib/auth.ts`: the JWT now lives at most 8 hours and is refreshed at most
every 30 minutes, so an abandoned browser does not keep a valid token. The
session cookie carries the same 8 hour maximum.

## P2 — closed

- **Image proxy:** `images.remotePatterns` is empty. The optimizer fetched any
  URL a caller named; the app serves no remote images.
- **Quote endpoint:** `/api/pricing/quote` has its own rate limit and every
  number in the body is bounded (quantity, dimensions, prices, list lengths),
  so one request cannot ask for unbounded arithmetic.
- **Email enumeration:** user creation answers with one message for every
  rejection, so the endpoint cannot be used to learn which addresses are
  registered.

## Development credentials

Local seed accounts only. Never reuse them in production.

| Email                      | Password                | Role                                         |
| -------------------------- | ----------------------- | -------------------------------------------- |
| `superadmin@glazeflow.app` | `Gzf!Plat#2026Qx7mR2`   | `SUPER_ADMIN`                                |
| `admin@acme.test`          | `Gzf!Dobav#2026Kr4pN8`  | `COMPANY_ADMIN` / `COMPANY_ADMIN`            |
| `manager@acme.test`        | `Gzf!Proizv#2026Tv8sM3` | `COMPANY_STAFF` / `COMPANY_PRODUCTION`       |
| `sales@acme.test`          | `Gzf!Prodaj#2026Bn3wD7` | `COMPANY_STAFF` / `COMPANY_SALES`            |
| `bob@customers.test`       | `Gzf!Kupac#2026Hd6qP9`  | `CUSTOMER` / `TENANT_ADMIN` (tenant `bob`)   |
| `worker@customers.test`    | `Gzf!Radnik#2026Yc2rL5` | `CUSTOMER` / `TENANT_MANAGER` (tenant `bob`) |

They live in `prisma/seed.ts` under `SEED_PASSWORDS`. The seed rewrites the
password hash on every run, so `npm run db:seed` rotates the local database
too.

Two accounts in the local database are not seed accounts and keep their own
passwords: `mistermilinkovic@gmail.com` and `radnikmaster@gmail.com`.

## Verified at runtime

Checked against the dev server after the change (2026-10-21):

| Check                                                                                  | Result                                                                                   |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/orders` without a session                                                    | 401                                                                                      |
| `POST /api/orders` with `Origin: http://evil.localhost:3000`                           | 403                                                                                      |
| `POST /api/orders` with `Origin: http://bob.localhost:3000` (sibling tenant subdomain) | 403                                                                                      |
| `POST /api/orders` with `Sec-Fetch-Site: cross-site`                                   | 403                                                                                      |
| `POST /api/orders` same origin, no session                                             | 401                                                                                      |
| Security headers on a page response                                                    | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` present |
| Sign-in with the new seed password                                                     | works, session `expires` 8 hours out                                                     |
| 9 wrong passwords for one account, then the correct one                                | rejected — the account is locked for the window                                          |
| Repeated sign-in attempts from one address                                             | 429 with `Retry-After`                                                                   |
| Tenant order list                                                                      | 10 orders, one `customerOrgId`                                                           |
| `PATCH /api/orders/[id]/payment`                                                       | 200, one `order.payment.change` row written                                              |
| `GET /api/admin/audit` as `SUPER_ADMIN`                                                | the trail, newest first                                                                  |
| Deleting a user who owns an order                                                      | 409, account must be deactivated instead                                                 |

The browser UI was not clicked through — the checks above are HTTP level. The
page loads no external font, script, or image, so the content security policy
blocks nothing the app uses.

## Production

- `NEXTAUTH_SECRET` must be generated fresh for the deployment
  (`openssl rand -base64 32`). The local value in `.env` is a development
  secret and `.env` is not committed.
- Do not run the seed against a production database. The seed passwords are
  public in this repository.
- The rate limiter keeps its counters in the process, so a multi-instance
  deployment multiplies the limit by the number of instances.
- The PostgreSQL policies need a connection role without `BYPASSRLS`, or they
  are documentation rather than protection. See
  `docs/explain/move-2-production.md` section 7.

## Still open

1. **Two-factor authentication.** No second factor on any account.
2. **Self-service password change.** There is no route for a user to change
   their own password; an administrator creates the account and the password.
   Without it, a rotated password has to travel through an administrator.
3. **Rate limiter state is per instance.** Fine for one server, wrong for
   several.
4. **Audit log has no user interface.** It is read through
   `GET /api/admin/audit`; there is no page in the admin panel yet.
5. **Row level security is not applied.** The PostgreSQL policies are written
   but the application still runs on SQLite.
6. **No CSP nonce.** `'unsafe-inline'` stays in the script policy until the
   App Router supports a per-request nonce here.
7. **No dependency audit.** The versions in `package.json` were not checked
   against the advisory database in this pass.
