# Security fixes — what was found and what changed

The full record is `docs/security-hardening.md`. This file is the short version.

## Audit result (before the fixes)

The write path was already locked: all 25 route files under `src/app/api/**`
gate on a session, tenant data is scoped by `customerOrgId`, prices are
recomputed server-side, and no route trusts a `companyId` from the request
body. No outsider could write, delete, or change a record.

What was missing sat around that write path.

## Fixed

| #   | Problem                                   | Fix                                                                                                                                                       |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No rate limit on login                    | `src/lib/rate-limit.ts` + `src/middleware.ts`, 8 failures per account, 30 per address, 15 min window; 429 on 60 sign-in attempts or 300 writes per minute |
| 2   | No security headers                       | `next.config.ts` — CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`                                                       |
| 3   | No CSRF/Origin check on writes            | `src/middleware.ts:originAllowed` — the `Origin` header must match the request host                                                                       |
| 4   | No audit log                              | `AuditLog` model, `src/lib/audit.ts`, one row per state change, readable at `GET /api/admin/audit`                                                        |
| 5   | No database-level protection              | SQLite foreign keys turned on in `src/lib/prisma.ts`; PostgreSQL RLS policies in `prisma/postgres-rls.sql`                                                |
| 6   | Weak password policy                      | `src/lib/password-policy.ts` — 12–72 characters, mixed case, digit, symbol, not a common password, not the account name; bcrypt cost 12                   |
| 7   | Session lived 30 days                     | 8 hour maximum, refreshed at most every 30 minutes                                                                                                        |
| 8   | Image proxy accepted any host             | `images.remotePatterns` is empty                                                                                                                          |
| 9   | Quote endpoint unbounded                  | own rate limit, every number in the body bounded                                                                                                          |
| 10  | User creation revealed which emails exist | one message for every rejection                                                                                                                           |

## Credentials

Seed accounts now have their own strong passwords. The table is in
`docs/security-hardening.md`. `npm run db:seed` rewrites them in the local
database as well.

## Still open

Two-factor authentication, self-service password change, shared rate limiter
state for multiple instances, an audit log user interface, applied row level
security, CSP nonces, and a dependency audit.
