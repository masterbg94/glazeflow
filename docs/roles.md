Evo kompletnog pregleda rola, od najjače ka najslabijoj:

---

## 1. SUPER_ADMIN (najjača)

Vlasnik platforme. Nema `companyId` — nije vezan ni za jednu kompaniju.

**Može:**

- Kreirati/brisati kompanije (`/admin` panel, API `requireRole(['SUPER_ADMIN'])`)
- Dodavati/brisati/uređivati korisnike u bilo kojoj kompaniji
- Videti SVE narudžbine svih kompanija
- Pristupiti `/admin/*` ruta
- Čitati/komunicirati na bilo kojoj narudžbini

**Ne može:**

- Kreirati narudžbine (samo CUSTOMER može)
- Pristupiti dashboardu svoje kompanije nema `companyId`, redirect na `/admin`
- Videti katalog bilo koje kompanije (API vraća 403 za `SUPER_ADMIN` na `/api/catalog`)

**Problemi:** Dashboard page radi redirect na `/admin` jer nema `companyId`. Potential redirect loop.

---

## 2. COMPANY_ADMIN

Admin unutar svoje kompanije. Ima `companyId`.

**Može:**

- Čitati katalog svoje kompanije
- Kreirati nove stvari u katalogu (`POST /api/catalog` — samo `COMPANY_ADMIN`)
- Menjati status narudžbina (`PATCH /api/orders/[id]/status`)
- Videti sve narudžbine svoje kompanije
- Komunicirati na narudžbinama svoje kompanije
- Pristupiti `/dashboard/*` ruta

**Ne može:**

- Kreirati narudžbine (samo CUSTOMER)
- Upravljati drugim kompanijama
- Pristupiti `/admin` panelu
- Brisati/kreirati korisnike za svoju kompaniju (nema API za to — samo SUPER_ADMIN)

---

## 3. COMPANY_STAFF

Zaposleni u kompaniji. Ima `companyId`.

**Može:**

- Čitati katalog svoje kompanije
- Menjati status narudžbina (isti kao `COMPANY_ADMIN`)
- Videti narudžbine svoje kompanije
- Komunicirati na narudžbinama
- Pristupiti `/dashboard/*`

**Ne može:**

- Kreirati stvari u katalogu (API gleda samo `COMPANY_ADMIN`)
- Kreirati narudžbine (samo CUSTOMER)
- Upravljati kompanijama/korisnicima
- Pristupiti `/admin`

**Problemi:** UI ne razlikuje `COMPANY_ADMIN` i `COMPANY_STAFF` — Sidebar prikazuje iste linkove, "Add item" dugme se vidi svima, status dropdown se vidi svima. API hvata grešku, ali UX zbunjuje.

---

## 4. CUSTOMER (najslabija)

Kupac. Može imati `companyId` + `customerOrgId`.

**Može:**

- Kreirati narudžbine (`POST /api/orders` — jedini koji može)
- Videti SVOJE narudžbine na storefrontu (`/storefront/[slug]/my-orders`)
- Komunicirati na svojim narudžbinama
- Čitati notifikacije
- Registrovati se javno (`/register`)

**Ne može:**

- Videti katalog (API vraća 403)
- Menjati status narudžbina
- Pristupiti `/dashboard/*` ili `/admin`
- Videti tuđe narudžbine

**Problemi:** Narudžbine koriste `companyId` iz request body, ne iz session — moguće slati narudžbine bilo kojoj kompaniji. `assertSameCompany()` postoji ali se nigde ne poziva.

---

## Ključni propusti

1. **`CompanyRole` (SALES, PRODUCTION) se nigde ne proverava** — samo se čuva u bazi i prikazuje u UI
2. **`assertSameCompany()` nikad se ne poziva** — tenant isolation radi ručno
3. **Katalog UI ne krije "Add item" za COMPANY_STAFF** — API hvata 403 ali UX loš
4. **SUPER_ADMIN nema dashboard** — redirect loop između `/admin` i `/dashboard`
5. **CUSTOMER može slati narudžbine bilo kojoj kompaniji** — `companyId` dolazi iz body
