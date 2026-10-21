## **Kako radi GlazeFlow — pregled za kupce, admina i super admina**

Aplikacija je platforma za narudžbinu stakla, PVC profila i gotovih prozora/vrata.

**Model je "jedna glavna kompanija".** Glavna kompanija (`Company.isMainCompany = true`) poseduje ceo katalog i sve cene. Tenanti — male kompanije koje naručuju od nje — su `CustomerOrg` redovi sa slug-om koji postaje subdomen (`bob.localhost:3000`). Tenant **ne kreira** `Company` red.

> Detaljno i provereno: `knowledge-base/roles-and-tenancy.md` i
> `knowledge-base/auth-gaps.md`.

---

### **1. KUPAC (CUSTOMER)**

Kupac **ne može da se sam registruje** — `/register` UI je zatvoren ("Registracija zatvorena", `src/app/(auth)/register/page.tsx:5`), a `POST /api/register` traži `SUPER_ADMIN` ili `COMPANY_ADMIN`. Nalog pravi admin glavne kompanije.

Kupac prijavom dobija:

- **Prodavnicu tenanta** — na svom subdomenu, npr. `bob.localhost:3000`. Podaci se čitaju preko `getTenantBySlug` iz `src/lib/tenant.ts:24`
- **Poručiti proizvod** — stranica `/order` otvara wizard sa 8 koraka (POST na `/api/orders`):
  1. Šta treba? (gotov prozor, gotova vrata, samo staklo, ili sirovi PVC profil)
  2. Dimenzije u mm (širina, visina, količina) ili dužina profila u metrima
  3. Šablon proizvoda (npr. "Fiksni prozor", "Klizna terasna vrata")
  4. PVC profil — izbor brenda (REHAU, VEKA), broja komora, boja
  5. Staklo — tip stakla (jasno, kaljeno, Low-E, laminirano), broj sloja (1, 2 ili 3), debljina svakog sloja u mm
  6. Oprema — ručice, brave, pragovi (sa količinama)
  7. Opcije obrade — poliranje ivica, bušenje rupe, prilagođeni rez
  8. Pregled i slanje — adresa isporuke, datum, napomene, dugme "Pošalji narudžbinu"

- **Cene se računaju uživo** — desna strana prikazuje živu cenu koja se ažurira dok unosiš dimenzije i opcije
- **Moje narudžbine** — lista svih sopstvenih narudžbina sa statusom i ukupnim iznosom
- **Detalji narudžbine** — tabela sa stavkama, dimenzijama, cenama, vremenska linija statusa, i komentari

---

### **2. ADMIN KOMPANIJE (COMPANY_ADMIN)**

Admin kompanije upravlja katalogom i narudžbinama:

- **Katalog i cene** — stranica `/dashboard/catalog` omogućava dodavanje i uređivanje:
  - Tipova stakla (naziv, kategorija, debljine, cena po m²)
  - PVC profila (breand, sistem, broj komora, boje, cena po metru)
  - Opreme (naziv, kategorija, cena)
  - Šablona proizvoda (naziv, vrsta, koeficijent složenosti)
  - Opcija obrade (naziv, cena)
- **Narudžbine** — lista svih narudžbina sa mogućnošću kolor-kart (Kanban) pregleda po statusima: Nova → Izmena ponude → Potvrđena → U proizvodnji → Spremna → Isporučena → Zatvorena / Otkazana
- **Promena statusa** — admin može da kreira ponudu sa cenom, menja status narudžbine, dodaje komentare kupcu
- **Pregled poruka** — kupci mogu slati poruke na narudžbinu, admin odgovara

---

### **3. SUPER ADMIN (vlasnik platforme)**

Super admin ima pristup na `/admin` panel:

- **Kreiranje kompanija** — forme za novu kompaniju (naziv, slug, boje, valuta, porez, markup)
- **Pregled svih kompanija** — tabela sa brojem korisnika i narudžbina po kompaniji
- **Upravljanje korisnicima** — u detaljima kompanije može dodavati, brisati i menjati status korisnika (aktivan/neaktivan)
- **Vidi sve narudžbine** — bez ograničenja na kompaniju

---

### **4. Kako admin menja cene, profile i opremu**

Sve se radi na stranici **`/dashboard/catalog`**:

- Tabove: **Staklo** / **Profili** / **Oprema**
- Za svaki tip stakla: unosiš naziv, kategoriju, dostupne debljine, cenu po m² (kupovna i prodajna)
- Za profile: brend, naziv sistema, broj komora, dubina ugradnje, klase debline zida, boje, maksimalna debljina stakla, cena po metru
- Za opremu: naziv, kategorija, jedinična cena, jedinica mere (komad, metar)
- Za šablone: naziv, vrsta proizvoda (prozor/vrata/samo staklo/sirovi profil), broj otvora, koeficijent složenosti
- Za obradu: naziv opcije, kupovna i prodajna cena

Cene se zatim koriste u wizardu koji automatski račini **živu cenu** na osnovu dimenzija i opcija koje kupac izabere.

---

### **5. Kako dodati kupca**

**Samo admin glavne kompanije (ili super admin) pravi korisnike.** Samoregistracija ne postoji.

**A. Super admin dodaje korisnika** — na stranici `/admin/companies/[id]` pritisće dugme **"Dodaj korisnika"** i unosi email, ime, lozinku i ulogu. Za tenant korisnika se bira `TENANT_ADMIN` ili `TENANT_MANAGER`; za korisnika glavne kompanije `COMPANY_ADMIN` / `COMPANY_SALES` / `COMPANY_PRODUCTION`.

**B. Tenant se kreira odvojeno** — `POST /api/tenants` pravi `CustomerOrg` + `PriceList`. Samo main company admin i super admin mogu. `POST /api/companies` je blokiran sa 403.

---

### **Ključni podsvešci (iz analize koda)**

1. **Kupac vidi ceo katalog glavne kompanije.** `getTenantCatalog` (`src/lib/tenant.ts:44-137`) vraća sve aktivne stavke, sa cenama tenanta primenjenim. **Per-tenant dodela proizvoda ne postoji** — nema modela koji bi ograničio šta tenant sme da poruči. `CustomerPriceOverride` menja samo cenu, ne i vidljivost.
2. **Kupac vidi cene, ali ne kupovne cene.** `costPrice` se nikad ne šalje tenantu. `GET /api/catalog` je za main company (403 za `CUSTOMER`), ali wizard dobija katalog direktno iz `getTenantCatalog`.
3. **Samo CUSTOMER može da kreira narudžbinu** — admin i staff ne mogu da poruče umesto kupca.
4. **Cene se računaju uživo, ali ne potpuno.** Live prikaz u wizardu pokazuje samo jediničnu cenu i cenu stavke — **bez poreza i bez popusta tenanta**. Server računa konačno na `POST /api/orders`, pa se ukupan iznos razlikuje od onoga što je kupac video usput.
5. **Cena je server-authoritative.** `src/lib/pricing-engine.ts` je čist modul; server preračunava sve iz baze u trenutku slanja narudžbine. Cena iz request body-ja se nikad ne upisuje u bazu.
6. **Valuta, porez i markup su na glavnoj kompaniji** — `Company.currency`, `Company.taxRatePercent`. `defaultMarkupPercent` i `minOrderValue` postoje u šemi ali se **ne koriste** u pricing engine-u.
7. **`TENANT_MANAGER` danas ima istu moć kao `TENANT_ADMIN`**, osim što ne vidi `/finance`. Ograničenje postoji na tačno jednom mestu: `src/app/(storefront)/[companySlug]/finance/page.tsx:20`.
