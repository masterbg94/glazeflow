**Problem ne u loginu.** Login prolazi (200, cookie validan). 404 baca middleware pre render-a.

**Uzrok 1 — `acme.localhost` nije poznat host.** [src/middleware.ts:21](src/middleware.ts:21) — tenant subdomain mora imati tačku: `hostOnly.endsWith('.localhost')`. Host `acme` nema tačku → `isTenantSubdomain = false` → `isRoot = false` → [src/middleware.ts:39-40](src/middleware.ts:39) vraća `404 Not Found`. Login ruta prolazi jer ima `/login` early-return (middleware:31).

**Uzrok 2 — login šalje na pogrešnu rutu.** [src/app/(auth)/login/page.tsx:23-24](src/app/(auth)/login/page.tsx:23) `getCustomerRedirect()` izvlači slug iz hosta: `acme` → `/acme/my-orders`. Zato baš ta adresa.

**Uzrok 3 — `acme` nije tenant.** `acme` = `Company.slug` (glavna kompanija). Tenanti su `CustomerOrg` redovi. U `prisma/dev.db` CustomerOrg slug-ovi: `bob`, `master`, `test1`, `mrweb` — nema `acme`. [src/lib/tenant.ts:43](src/lib/tenant.ts:43) `getTenantBySlug('acme')` → `notFound()`. Zato i `http://localhost:3000/acme/my-orders` → 404.

**Uzrok 4 — `admin@acme.test` nije tenant korisnik.** `customerOrgId = null`. [my-orders/page.tsx:11](src/app/(storefront)/[companySlug]/my-orders/page.tsx:11) bi prikazao "Molimo prijavite se da biste videli narudžbine." Ta ruta je za kupce, ne za main-company staff.

Dokaz (dev server živ):
```
acme.localhost:3000/login          200
acme.localhost:3000/acme/my-orders  404   <- middleware
bob.localhost:3000/bob/my-orders    200
localhost:3000/acme/my-orders       404   <- getTenantBySlug
```

**Ispravne adrese:**
- `http://localhost:3000/login` → `admin@acme.test` / `Password123!` → `/dashboard`
- `http://bob.localhost:3000/login` → `bob@customers.test` / `Password123!` → `/bob/my-orders`

Nije menjano ništa. Poznata greška dokumentovana u [docs/explain/explain.md:27](docs/explain/explain.md:27) i [AGENTS.md:234](AGENTS.md:234).