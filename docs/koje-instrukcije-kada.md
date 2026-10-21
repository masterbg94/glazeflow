# Strukturacija instrukcija za GlazeFlow MVP – detaljan pregled na srpskom

> **Napomena:** ovaj fajl je nastao pre nove AI strukture i delimično je zastareo.
> Trenutno stanje: `docs/agents-when-load.md` (redosled učitavanja),
> `docs/files-here.md` (šta je u kom fajlu), `knowledge-base/README.md` (index
> verifikovane reference). Ovaj fajl ostaje kao detaljan prikaz na srpskom.
> Ako se raziđe sa trenutnim stanjem — verovatno će — kod i `knowledge-base/` su
> tačni, ovaj fajl je zastareo.

Evo kako su svi dokumenti organizada i kada/gde se svaki koristi:

---

## 1. `AGENTS.md` — VRLOVA, Svrha i Kada se koristi

**Gde**: Root folder (`/glazeflow-mvp/AGENTS.md`)
**Kada**: **SVEG PUT** — prva datoteka koju učitava svaki agent

**Šta sadrži**:

- Critical Issues (4 poznata buga: Prisma companyId null, Decimal serializacija, cross-origin, spor notification stream)
- Komande (dev, build, db:push, db:seed, lint itd.)
- Arhitekture Notes (Next.js 16, NextAuth v4, Prisma + SQLite, business model: jedna glavna kompanija, role)
- Session/Auth Patterns (getSession, custom fields need `as any`, SUPER_ADMIN ima companyId: null)
- Decimal Serialization Rule (Nikoli ne prosleđivaj Decimal klijentu, conversi u string na server-company boundary)
- Testing/Verification manual steps
- Environment info

**Kako se koristi**: Uvek na početku svakog zadatka. Svi ostali dokumenti se "nadaju" nakon što se ova učita.

---

## 2. `docs/instructions.md` — Knowledge Base za produkt

**Gde**: `/glazeflow-mvp/docs/instructions.md`
**Kada**: Kad need detailne informacije o produktu, tokovima ili arhitekturi

**Šta sadrži** (po redosledu reference):

- `how-app-works-with-roles.md` — End-to-end Serbian pregled kako radi app za kupce, admine i super admine
- `roles.md` — Kompletni pregled rola od najjače (SUPER_ADMIN) ka najslabijoj (CUSTOMER), sa problematicama
- `Business Logic.md` — Cijena, model arhitekture plus plan za poboljšanje
- `improvements.md` — Kritični weak points i plan za izgradnju (5 faza od Foundation do Quality & Observability)
- `roles-how-and-where.md` — Role gde koji korisnik loguje i šta radi (tabela + flow jedne porudžbine)
- `knowledge-base/roles-explanation.md` — Canonical explanation two-dimensional role system

**Kako se koristi**: Kad tražiš detailne informacije o tome kako app radi, rolove, cene ili tok porudžbine. Reference se čuvaju u `@` formatu u promptima.

---

## 3. `prisma/instructions.md` — Podatkovni model i migracije

**Gde**: `/glazeflow-mvp/prisma/instructions.md`
**Kada**: Kad radis sa schema-om, migracijama ili seed-om

**Šta sadrži**:

- Data model: Company (glavna kompanija), CustomerOrg (tenants), User, Order, OrderItem, catalog models
- Migration rules: backward-compatible changes, Prisma tooling, regeneration klijenta, update seed.ts
- Development: SQLite kroz DATABASE_URL, produkcija PostgreSQL
- Decimal values: moraju se konvertovati u numbers pred passing u client-side komponente
- Seed credentials: development sample accounts, treat kao lokalne credentials

**Kako se koristi**: Kad menjas schema.prisma, krešš novu tabelu ili menjas enum vrednosti. Takođe se koristi za seed.ts editing.

---

## 4. `src/app/instructions.md` — rute i autorizacija

**Gde**: `/glazeflow-mvp/src/app/instructions.md`
**Kada**: Kad menjaš rute pod `(company)`, `(storefront)`, `(auth)`, `(platform)` groups

**Šta sadrži**:

- Routing map: `(auth)/login/register`, `(storefront)/[companySlug]`, `(company)/dashboard`, `(platform)/admin`
- Server/client boundary: Server komponente db pristup, klijent komponentiDOO serialized data
- Authorization expectations: `/admin/*` → SUPER_ADMIN only, `/dashboard/*` → COMPANY_ADMIN/STAFF
- API conventions: validate request bodies, normalize IDs, scope Prisma reads/writes, NEVER trust client-sent companyId

**Kako se koristi**: Kad dodavaš ili menjas handler-e, page komponente u src/app/. Svaka promena u src/app/** scope-ovom necessidade učitavanja ovog file-a.

---

## 5. `src/lib/instructions.md` — Moduli i auth safety

**Gde**: `/glazeflow-mvp/src/lib/instructions.md`
**Kada**: Kad radis sa auth-om, tenant-om, pricing-om ili real-time eventi

**Šta sadrži**:

- Module responsibilities: auth.ts, rbac.ts, tenant.ts, pricing-engine.ts, events.ts, realtime.ts, notifications.ts, prisma.ts, email.ts, utils.ts
- Pricing contract: calcItemPricing za GLASS_ONLY, RAW_PROFILE, FINISHED_WINDOW, FINISHED_DOOR, HARDWARE. Square meters, perimeter meters, quantities, fixed sell prices, complexity multiplier, round to 2 dp, calcTotals
- Auth and tenant safety: Session claims (uid, platformRole, companyId, companySlug, customerOrgId). SUPER_ADMIN nema companyId; company roles moraju access own tenant samo
- Real-time safety: ServerRealtimeEvent i ClientRealtimeEvent, Date → string na client boundary, extend event unions together

**Kako se koristi**: Kad menjas auth logic, tenant resolution, pricing engine, real-time/events system. Svaka promena u src/lib/** scope-ovom necesa ovaj file.

---

## 6. `knowledge-base/roles-explanation.md` — Canonical explanation uloga

**Gde**: `/glazeflow-mvp/knowledge-base/roles-explanation.md` (canonical source)
**Kada**: Kad pitanja o `platformRole` i `companyRole` — po `AGENTS.md:28`, file je `knowledge-base/roles-explanation.md`

**Šta sadrži**:

- Two-dimensional role system: `platformRole` + `companyRole`/`customerOrgRole`
- Svi valori platformRole: SUPER_ADMIN (companyId: null), COMPANY_ADMIN, COMPANY_STAFF, CUSTOMER (ima companyId → main company)
- Svi valori companyRole (samo za main company): COMPANY_ADMIN, COMPANY_PRODUCTION, COMPANY_SALES
- Svi valori customerOrgRole (samo za tenant users): TENANT_ADMIN, TENANT_MANAGER
- Key invariants: exactly one Company row, tenants su CustomerOrg rows, SUPER_ADMIN nema companyId
- Current known gaps: CompanyRole nikad nije proverava, assertSameCompany() nikad se poziva, itd.

**Kako se koristi**: Reference u `@docs/instructions.md` kao prva stopa za sva pitanja o ulogama. Takođe se cita iz AGENTS.md:28.

---

## 7. `docs/roles-how-and-where.md` — Role i gde rade

**Gde**: `/glazeflow-mvp/docs/roles-how-and-where.md`
**Kada**: Kada treba brzo pogledati ko gde šta radi — reference tabela

**Šta sadrži**:

- Roles table: SUPER_ADMIN, COMPANY_ADMIN, COMPANY_STAFF, CUSTOMER sa explanation
- Company structure: Jedna glavna Company, tenant organizacije su CustomerOrg rows sa slug (subdomain)
- Order flow (start→end): 6 koraka od storefront do finance view
- Where users log in & what they do: Tabela za 5 tipova korisnika
- Tenant subdomains block /dashboard and /admin
- Decimal Serialization reminder

**Kako se koristi**: Brza reference tabele i flow overview. Čak i kod code review-ova za proveru da li korisnik može da radi ono štoRadi.

---

## 8. `docs/roles.md` — Kompletni pregled rola (najjača → najslabija)

**Gde**: `/glazeflow-mvp/docs/roles.md`
**Kada**: Kada treba detaljno opis svakog role-a sa može/i ne može

**Šta sadrži**:

- SUPER_ADMIN: može sve osim kreirati porudžbine, nema companyId, redirect loop na dashboard
- COMPANY_ADMIN: ima companyId, katalog, statusi, svi orders kompanije
- COMPANY_STAFF: isto kao admin ali NE MOŽE katalog, UI problem (Add item vidi svi)
- CUSTOMER: jedini koji može kreirati porudžbine, samo svoje na storefront, ne vidi katalog
- Critical propusti: CompanyRole se proverava nigde, assertSameCompany() nikada se ne poziva, katalog UI ne krije "Add item" za STAFF, SUPER_ADMIN nema dashboard, CUSTOMER može slati porudžbine bilo kojoj kompaniji

**Kako se koristi**: Kod debugging-a autoraizacionih problema ili kod analize UX bugova.

---

## 9. `docs/how-app-works-with-roles.md` — Kako radi aplikacija (srpski)

**Gde**: `/glazeflow-mvp/docs/how-app-works-with-roles.md`
**Kada**: Kad objašnjavaš aplikaciju srpskom jezikom za stakeholders

**Šta sadrži** (po sekcijama):

1. **KUPAC**: Registruje se, pregledava storefront, order wizard 8 koraka,live cene, moje porudžbine, detalji
2. **ADMIN KOMPANIJE**: Kataloog i cene, svi orders Kanban, promeni status, komunikacija sa kupcima
3. **SUPER ADMIN**: `/admin` panel, kreira kompanije, svi users, sve porudžbine
4. **Kako admin menja cene, profile i opremu**: Tabovi za staklo, profile, oprema, sve postavke
5. **Kako dodati kupca**: Samo registracija ili super admin dodaje korisnika
6. **Ključni podsvešci**: Kupci ne vide katalog, samo CUSTOMER može kreirati, cene se računaju uživo, svakoj kompaniji je svojata valuta/porez/markup

**Kako se koristi**: Objasavanje poslovneloge/stakeholderima na srpskom.

---

## 10. `docs/business_logic_fix.md` — Fix za biznis logiku

**Gde**: `/glazeflow-mvp/docs/BUSINESS_LOGIC_FIX.md`
**Kada**: Kad treba razumevanje target arhitekture "jedna glavna kompanija, mnogi tenanti"

**Šta sadrži**:

- Confirmed business model: Exactly ONE main company owns catalog, tenants su CustomerOrg rows NEK second Company rows
- Roles: Main company i tenant role matrice
- Current Code vs Required: 10 problems + solutions
- Target Data Model: Schema promeni (isMainCompany → true, CustomerOrg.slug, CustomerOrgRole enum, User.customerOrgRole, Order.paymentStatus)
- Middleware: Subdomain routing logic
- Route Restructure: (storefront)/[companySlug] → resolve CustomerOrg by slug
- API Changes: `/api/companies` POST block, `/api/catalog` guard, `/api/orders` POST derivation
- Session: Add customerOrgSlug + customerOrgRole u JWT
- Seed: One Company, users, Tenants sa PriceList-ovima
- Tenant Finance: Za plaćanje sum where status=DELIVERED/CLOSED && paymentStatus≠PAID
- Migration Plan: 8 koraka obrnljivo, stepwise
- Verification Checklist: 9 acceptance kriterija

**Kako se koristi**: Kad razmišljaš o strukturi "jedna glavna + mnogi tenanti" i potreban je detaljan plan migracije.

---

## 11. `docs/improve-admin.md` — Plan za admin panel

**Gde**: `/glazeflow-mvp/docs/improve-admin.md`
**Kada**: Kad planiraš poboljšanje `/admin` panel za SUPER_ADMIN

**Šta sadrži**:

- Current state analysis (4 fajla)
- Proposed enhancements: `/api/admin/stats` endpoint, enhanced UI sa stat karticama, company detail enhancements
- Implementation order: 7 faza od API do UI
- Acceptance criteria: 8 poena provere
- Technical notes: Decimal serialization, no new dependencies, caching

**Kako se koristi**: Kad razvijaš SUPER_ADMIN panel ili statistike.

---

## 12. `docs/agents-when-load.md` — Kada se koje instrukcije učitava

**Gde**: `/glazeflow-mvp/docs/agents-when-load.md`
**Kada**: Kada raidš da razumeš redosled učitavanja

**Šta sadrži**:

- `AGENTS.md` — uvek prvo, poznati bugovi, komande, arhitektura
- `app-instructions.md` — za svaki GlazeFlow zadatak (misija app, source-of-truth pravila)
- Scoped instrukcije: `instructions.md` za `src/app/**`, `src/lib/**`, `prisma/**`, `docs/**`
- `knowledge-base/roles-explanation.md` — samo za pitanja o ulogama
- Šta se NE učitava automatski: `.agents/skills/**`

**Kako se koristi**: Kad planiraš koju datoteci primero, ili kada verifikuješ da li agent radi u pravom contextu.

---

## 13. `docs/files-here.md` — Šta se nalazi u svakom fajlu

**Gde**: `/glazeflow-mvp/docs/files-here.md`
**Kada**: Kad treba remindš šta u kojem docs fajlu

**Šta sadrži**: Krati opis svakog docs fajla u repozitoriju.

**Kako se koristi**: Reference za developer koji ulazi u novi repozitorijum.

---

## 14. `docs/prompt-shorten-logic.md` — Kratki prompt za razumevanje logike

**Gde**: `/glazeflow-mvp/docs/prompt-shorten-logic.md`
**Kada**: Kada need shortly prompt za objašnjenje logike za LLM

**Šta sadrži**: Krati opis glavne kompanije, superadmin logout, flow, catalog logic, creating user logic, roles u većim i manjim kompanijama.

**Kako se koristi**: Kada krešš shortly prompt za testing objašnjenja.

---

## 15. `docs/improvements.md` — Analiza weak points i plan za izgradnju

**Gde**: `/glazeflow-mvp/docs/improvements.md`
**Kada**: Kad analiziraš tehnološke weak points i planiraš restructuriranje

**Šta sadrži**:

- 5 critical architecture weak points: Real-time System, Auth, Type Safety, API Validation, Error Handling
- 5 faza improvement plan od Foundation do Quality & Observability
- 4 quick win fixes
- 4 tradeoff questions

**Kako se koristi**: Kad planiraš ekipu ili refaktorisanje.

---

## KONACNI REMINDER: Redosled učitavanja

1. **Uvek prvo**: `AGENTS.md` — contains critical bugs, commands, architecture
2. **Zatim** (za svakim zadatkom): `.agents/instructions/app-instructions.md` (sadrži mission app, source-of-truth pravila)
3. **Pre nego što diriš s ficherom**: Učitaj scoped `instructions.md`:
   - `src/app/instructions.md` kada menjaš `src/app/**`
   - `src/lib/instructions.md` kada menjaš `src/lib/**`
   - `prisma/instructions.md` kada menjaš `prisma/**`
   - `docs/instructions.md` kada menjaš `docs/**`
4. **Za pitanja o ulogama**: Also load `knowledge-base/roles-explanation.md`
5. **Ako promeni cross-spans**: Učitaj sve odgovarajuće scoped file-e

Sve dokumente se referenciraju preko `@` prefixa u promptima, a loading order guarantees proper context za svaku operaciju.
