# Uloge — kompletan pregled (prema kodu)

> Stanje na `BL-fix-and-improve`. Za verziju proverenu automatski pogledaj
> `knowledge-base/roles-and-tenancy.md` i `knowledge-base/auth-gaps.md`.
> Ovaj fajl je sažetak; kad se raziđu, kod je tačan.

Model je prešao na **jednu glavnu kompaniju**. Raniji tekst ovog fajla je
opisivao stanje pre te migracije.

---

## 1. ULOGE — tri dimenzije

| Polje             | Vrednosti                                                      | Pitanje na koje odgovara           |
| ----------------- | -------------------------------------------------------------- | ---------------------------------- |
| `platformRole`    | `SUPER_ADMIN` · `COMPANY_ADMIN` · `COMPANY_STAFF` · `CUSTOMER` | Nivo pristupa koji aplikacija daje |
| `companyRole`     | `COMPANY_ADMIN` · `COMPANY_SALES` · `COMPANY_PRODUCTION`       | Posao osobe u glavnoj kompaniji    |
| `customerOrgRole` | `TENANT_ADMIN` · `TENANT_MANAGER`                              | Posao osobe u tenantu              |

Sva tri su opciona na `User` (`prisma/schema.prisma:141-169`).

**NEMA** `PRODUCTION_WORKER` vrednosti u enumu `CompanyRole`. Radnik iz
`docs/BUSINESS_LOGIC_FIX.md` nije implementiran.

---

## 2. SUPER_ADMIN (najjača)

Vlasnik platforme. `companyId` je `null` — nije vezan ni za jednu kompaniju.

**Može:**

- Pristupiti `/admin` panelu (`middleware.ts:48-50` + `requireRole` na svakom API-ju)
- Kreirati tenante preko `POST /api/tenants` — pravi `CustomerOrg` + `PriceList`
- Dodavati, brisati i deaktivirati korisnike u bilo kojoj kompaniji ili tenantu
- Videti sve narudžbine svih tenanata (`/api/orders` sa `platformRole === 'SUPER_ADMIN'` → `where = {}`)
- Videti statistiku platforme (`/api/admin/stats`)

**Ne može:**

- Kreirati narudžbine — samo `CUSTOMER` može
- Koristiti `/dashboard` — nema `companyId`, pa `src/app/(company)/dashboard/page.tsx:9` radi redirect na `/admin`

**Napomena:** `POST /api/companies` je blokiran sa 403 ("Creating companies is not
allowed"). Tenanti se ne kreiraju kao `Company` redovi.

---

## 3. COMPANY_ADMIN (glavna kompanija)

Admin unutar glavne kompanije. Ima `companyId` glavne kompanije.

**Može:**

- Čitati katalog (`GET /api/catalog`)
- Kreirati stavke kataloga (`POST /api/catalog` — samo `SUPER_ADMIN` i `COMPANY_ADMIN`)
- Kreirati tenante (`POST /api/tenants`)
- Videti sve narudžbine glavne kompanije (`/dashboard/orders`)
- Menjati status narudžbina u oba smera, bez traženja odobrenja
- Odobravati pending tranzicije (`PATCH /api/orders/transitions/[id]`)
- Pristupiti `/dashboard/*`

**Ne može:**

- Kreirati narudžbine
- Pristupiti `/admin` panelu
- Upravljati korisnicima — `/api/companies/[id]/users` je isključivo `SUPER_ADMIN`

---

## 4. COMPANY_STAFF (zaposleni u glavnoj kompaniji)

`platformRole: COMPANY_STAFF`, uz `companyRole: COMPANY_SALES` ili
`COMPANY_PRODUCTION`. Ima `companyId`.

**Može:**

- Čitati katalog (read-only — `POST /api/catalog` vraća 403)
- Videti narudžbine glavne kompanije
- Slati poruke na narudžbinama
- Pomerati status napred (npr. `NEW` → `CONFIRMED`) bez traženja odobrenja

**Ne može:**

- Kreirati stavke kataloga
- Menjati status unazad ili otkazivati bez odobrenja — to kreira `OrderStatusTransition` sa `status = PENDING`
- Kreirati narudžbine
- Pristupiti `/admin`

**Problem u kodu:** `src/app/api/orders/[id]/status/route.ts:13` računa
`userRole = user.companyRole || user.platformRole`. Ako `COMPANY_STAFF` korisnik
ima `companyRole: COMPANY_ADMIN`, `status-transitions.ts:89-91` ga tretira kao
potpunog administratora i zaobilazi approval. Isti obrazac je u
`src/app/(company)/dashboard/orders/page.tsx:32`.

**Problem u UX-u:** `COMPANY_STAFF` vidi dugme "Dodaj stavku" na
`/dashboard/catalog` i dobije 403. API hvata, ali UI zbunjuje.

---

## 5. CUSTOMER (korisnik tenanta)

`platformRole: CUSTOMER` + `customerOrgRole: TENANT_ADMIN` ili `TENANT_MANAGER`.
Ima **i** `companyId` (glavna kompanija) **i** `customerOrgId` (svoj tenant).

**Može:**

- Kreirati narudžbine (`POST /api/orders` — jedini koji može)
- Videti svoje narudžbine na storefrontu (`/[slug]/my-orders`)
- Slati poruke na svojim narudžbinama
- Čitati notifikacije
- Videti katalog sa svojim cenama (`getTenantCatalog`)
- `TENANT_ADMIN` dodatno: `/finance`

**Ne može:**

- Videti tuđe narudžbine
- Menjati status narudžbine (osim otkazivanja svoje dok je `NEW`)
- Pristupiti `/dashboard` ili `/admin`
- Videti kupovne cene (`costPrice`) — nikada se ne šalju tenantu

**Problem:** `TENANT_ADMIN` i `TENANT_MANAGER` danas imaju **identičnu moć**,
osim `/finance`. `customerOrgRole` se proverava na tačno jednom mestu:
`src/app/(storefront)/[companySlug]/finance/page.tsx:20`.

---

## 6. Gde se ko loguje

| Uloga            | Login URL                            | Krajnja destinacija                    |
| ---------------- | ------------------------------------ | -------------------------------------- |
| `SUPER_ADMIN`    | `http://localhost:3000/login`        | `/admin`                               |
| `COMPANY_ADMIN`  | `http://localhost:3000/login`        | `/dashboard`                           |
| `COMPANY_STAFF`  | `http://localhost:3000/login`        | `/dashboard/orders`                    |
| `TENANT_ADMIN`   | `http://<slug>.localhost:3000/login` | `/<slug>/my-orders`, `/<slug>/finance` |
| `TENANT_MANAGER` | `http://<slug>.localhost:3000/login` | `/<slug>/my-orders`                    |

**Poddomen tenanta = `CustomerOrg.slug`, ne slug glavne kompanije.** Seed
tenanta ima slug `bob`, pa je njegov storefront `http://bob.localhost:3000`.
`http://acme.localhost:3000` **ne radi** — `acme` je slug glavne kompanije,
pa taj host pada u `notFound()` iz `getTenantBySlug` (`src/lib/tenant.ts:32`).

`/dashboard` i `/admin` su blokirani na poddomenima tenanta — middleware
preusmerava na `/login` (`src/middleware.ts:34-37`).

### Seed nalozi (lokalni razvoj)

| Email                      | Lozinka        | Uloga                                        |
| -------------------------- | -------------- | -------------------------------------------- |
| `superadmin@glazeflow.app` | `Password123!` | `SUPER_ADMIN`                                |
| `admin@acme.test`          | `Password123!` | `COMPANY_ADMIN`                              |
| `sales@acme.test`          | `Password123!` | `COMPANY_STAFF` / `COMPANY_SALES`            |
| `manager@acme.test`        | `Password123!` | `COMPANY_STAFF` / `COMPANY_PRODUCTION`       |
| `bob@customers.test`       | `Password123!` | `CUSTOMER` / `TENANT_ADMIN` (tenant `bob`)   |
| `worker@customers.test`    | `Password123!` | `CUSTOMER` / `TENANT_MANAGER` (tenant `bob`) |

Lozinke su iz `prisma/seed.ts` — samo za lokalni razvoj, nikad u produkciju.

---

## 7. Decimal Serialization reminder

Svaki Prisma `Decimal` polje koje prelazi server → client granicu mora biti
konvertovano u string. Uzorak je u
`src/app/(company)/dashboard/orders/[id]/page.tsx:103-104,114`:

```ts
item.unitPrice.toString();
item.lineTotal.toString();
order.total.toString();
```

Primeni ovaj obrazac svuda gde `Decimal` prelazi u Client Component.

---

## 8. Ključni propusti (verifikovano u kodu)

Detaljno sa `file:line` referencama: `knowledge-base/auth-gaps.md`.

1. **`GET /api/orders` vraća SVE narudžbine** kad sesija nema `customerOrgId` — `{ customerOrgId: undefined }` u `where` se dropuje od strane Prisma (`src/app/api/orders/route.ts:11-16`).
2. **Stavke narudžbine mogu referencirati katalog druge kompanije** — lookup po id-u bez `companyId` i bez `isActive` filtera (`src/app/api/orders/route.ts:88-126`).
3. **`companyRole` i `platformRole` se spajaju** — `||` sprezanjem daje `COMPANY_STAFF` korisniku admin moći (`status/route.ts:13`).
4. **Odobrenje tranzicije prelazi granicu tenanta** — tenant korisnik sa `companyRole: 'COMPANY_ADMIN'` može odobriti tuđu narudžbinu, jer `user.companyId` kod tenanta pokazuje na glavnu kompaniju (`transitions/[id]/route.ts:13-18`, `:34`).
5. **`assertSameCompany()` se nikad ne poziva** — definisana je u `src/lib/rbac.ts:16`, nula poziva.
6. **10 od 13 `requireRole` poziva nije uhvaćeno** — rezultat je 500 sa stack trace-om umesto 401/403.
7. **`POST /api/pricing/quote` je potpuno neautentifikovan** (`pricing/quote/route.ts:4-13`).
8. **`platformRole` dolazi iz request body-a** pri kreiranju korisnika (`companies/[id]/users/route.ts:59`).
9. **Per-tenant dodela kataloga ne postoji** — svaki tenant vidi ceo katalog. `CustomerPriceOverride` menja samo cenu.
10. **`NotificationRule` tabela se nikad ne čita** — routing notifikacija je hardkodiran po call site-u.
