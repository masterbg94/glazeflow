# Files here :
> explanation what is each file

## docs/agents-when-load.md
when some agents are loaded... created to know what and when is loaded when submit prompt.

## docs/Business Logic.md
busines logic initialy from zenmux (when started project created after a some time). 

## [docs/BUSINESS_LOGIC_FIX.md](./BUSINESS_LOGIC_FIX.md)
New file that explains how to fix logic about ordering. 
In moment of creating , tenant admins can manage catalogs that we don't need. Only Admin from main company and superadmin (me as developer) can create and manage catalogs that can be assigned to some tenants (companies that order from us as big company , and as producers).

## docs/how-app-works-with-roles.md
???

## docs/improve-admin.md
plan for admin panel improvement to create company and so , have branch `origin/improve-admin`

## docs/improvements.md
all improvements at one moment when building stable app - Need to be checked again is that fixed or not!

## docs/instructions.md


## docs/prompt-shorten-logic.md


## docs/roles.md



###
Evo šta se nalazi u svakom fajlu u `docs/`:

---

**agents-when-load.md** — Uputstva kada se koje instrukcije učitavaju. `AGENTS.md` uvek prvo (poznati bugovi, komande, arhitektura). `app-instructions.md` za svaki GlazeFlow zadatak. Scoped instrukcije (`src/app/**`, `src/lib/**`, `prisma/**`, `docs/**`) samo kad diraš taj folder. `roles-explanation.md` samo za pitanja o rolama. `.agents/skills/**` se NE učitava automatski — aktivira se eksplicitno.

---

**BUSINESS_LOGIC_FIX.md** — Glavni dokument za fix biznis logike. Problem: trenutno svaka kompanija ima svoj katalog, a treba: **jedna glavna firma (dobavljač) vlasništvo ima nad celim katalogom**, tenanti su `CustomerOrg` pod glavnom firmom, ne mogu menjati katalog — samo naručuju po dodeljenim cenama. Sadrži: plan migracije (obrnljiv, 4 koraka), verifikaciju, target arhitekturu, potrebne promene (schema, seed, auth, middleware, catalog API, storefront, order API, status transition logic, dashboard, admin panel, price list logic), fajlove za modifikaciju (12 fajlova), acceptance checklistu.

---

**how-app-works-with-roles.md** — Pregled kako radi aplikacija za kupce, admina i super admina na srpskom. Opisuje 4 uloge: KUPAC (CUSTOMER) — registruje se, pregleda storefront, poručuje kroz 8-korak wizard, vidi živu cenu, prati svoje narudžbine. ADMIN KOMPANIJE (COMPANY_ADMIN) — upravlja katalogom (staklo, profili, oprema, šabloni, obrada), vidi sve narudžbine u Kanban-u, menja statuse, odgovara na poruke. SUPER ADMIN — `/admin` panel, kreira kompanije, vidi sve, upravlja korisnicima. Takodje opisuje kako se dodaju kupci (samoregistracija ili super admin).

---

**improve-admin.md** — Plan za poboljšanje admin panela (`/admin`, SUPER_ADMIN only). Current state analiza (4 fajla). Predložena poboljšanja: 1) Novi API endpoint `GET /api/admin/stats` sa svim platform-wide podacima (totali, orders by status, users by role, companies detail sa catalog counts, recent activity), 2) Enhanced UI sa stat karticama, bar chartovima, expandable table row, activity feed, 3) Company detail page enhancements (order breakdown, revenue trend, top customers), 4) Future v2+ (real-time, export, drill-down, alerts, impersonation). Implementation order sa 7 faza, acceptance criteria.

---

**improvements.md** — Analiza major weak points i strukturiran improvement plan. 6 kritičnih oblasti: Real-time System (logic scattered 5+ fajlova), Auth (deprecated getToken + dual auth), Type Safety (session.user as any everywhere), API Validation (zero), Error Handling (inconsistent). 5 faza: Foundation (Week 1-2), Real-time Consolidation (Week 2-3), API Layer Hardening (Week 3-4), Client Architecture (Week 4-5), Quality & Observability (Week 5-6). Quick wins (4 stavke). Tradeoff questions (4 pitanja).

---

**instructions.md** — Product knowledge base instructions. Koji dokumente koristiti za explain product behavior: `how-app-works-with-roles.md`, `roles.md`, `Business Logic.md`, `improvements.md`, `../knowledge-base/roles-explanation.md`. Product flow opis. Documentation discipline: mark statements as implemented/intended/known gap, don't claim feature works without checking route/component/schema, keep concise.

---

**prompt-shorten-logic.md** — Tvoj kratki prompt za razumevanje app logike. Main company = vlasnik platforme, ti kao superadmin. Superadmin može: dodavati/administrirati main company admine, videti sve kompanije, dodavati manje kompanije (tenante) koje naručuju od vas. Flow: vi (main company) menjate katalog, manje firme naručuju, vi primate narudžbine i menjate statuse, klijent je obavešten. Multi-role u main company: production worker samo forward status, manager može backward ali sa admin approval, admin sve. Catalog logic: main company menja katalog, developer (ti) vidi catalog, dodaje/edituje companies. Creating user logic: ti dodaješ adming main app i kreiraš tenante sa userima. Superadmin role: full access za logove i error tracking. Roles u bigger company: hierarchy sa approval chain. Roles u smaller company: slično ali sa super admin/admin approval za step back.

---

**roles.md** — Kompletan pregled rola (najjača → najslabija): 1) SUPER_ADMIN — nema companyId, može sve osim kreirati narudžbine, dashboard redirect loop problem. 2) COMPANY_ADMIN — ima companyId, čita/kreira katalog, menja statuse, vidi sve narudžbine kompanije. 3) COMPANY_STAFF — isto kao admin ali NE MOŽE kreirati katalog (API gleda samo COMPANY_ADMIN), UI ne razlikuje (problem). 4) CUSTOMER — kreira narudžbine (jedini), vidi svoje na storefront, ne vidi katalog (403). Ključni propusti: CompanyRole se ne proverava, assertSameCompany() se ne poziva, katalog UI ne krije Add item za STAFF, SUPER_ADMIN nema dashboard, CUSTOMER može slati narudžbine bilo kojoj kompaniji.