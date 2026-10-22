## 1. Da li su AI instrukcije ispravne?

**Da — struktura ispravna.** Sve instrukcije postoje, hijarhija jasna, prioriteti definisani.

Oblast koja je relevantna za ovaj task (pitanje, nema editovanja):

| Fajl                                                                                 | Uloga ovde                                                           |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                                                               | env, komande, poznati bugovi, seed podaci                            |
| [.agents/instructions/app-instructions.md](.agents/instructions/app-instructions.md) | 3 invarijante, "za pitanja učitaj isto ali ne edituj" (linija 41-42) |
| [prisma/instructions.md](prisma/instructions.md)                                     | **§Seed credentials (linija 27-31)** — direktno relevantno           |
| [knowledge-base/roles-and-tenancy.md](knowledge-base/roles-and-tenancy.md)           | uloge, tenant model, permission matrica                              |
| [knowledge-base/README.md](knowledge-base/README.md)                                 | index — koja fajl za koje pitanje                                    |

Skillovi (`glazeflow-tenant-guard` itd.) **nisam učitao** — task je read-only pitanje o korisnicima, ne promena tenant/pricing/role koda. Po `app-instructions.md:44-47` skill se učitava samo kad runtime aktivira match.

### Kako ih koristiti

- `AGENTS.md` se učitava automatski (`CLAUDE.md` → `@AGENTS.md`)
- Ostalo: napiši task normalnim rečima → agent sam bira fajlove
- Forsiraj: _"pročitaj knowledge-base/roles-and-tenancy.md i prisma/instructions.md"_
- Za promene: skill po domenu (`/glazeflow-tenant-guard` za tenant/catalog/orders)
- Pitanje bez editovanja: instrukcije se učitaju, ali nema `npm run build`

### Pronađene greške u instrukcijama (4)

1. **[AGENTS.md](AGENTS.md) §Environment: "acme.localhost:3000 (storefront)"** — **pogrešno.** `acme` = slug _main_ kompanije, ne tenant. `http://acme.localhost:3000/` → **404** (provereno). Ispravan tenant host = `bob.localhost:3000` (200).
2. **[prisma/instructions.md:5](prisma/instructions.md)** — "`Company` is the tenant root" — protivreči invarijanti #1 iz `app-instructions.md` ("tenants are `CustomerOrg` rows, never `Company` rows"). Treba "`Company` is the single main company; tenants are `CustomerOrg`".
3. **[prisma/instructions.md:11-12](prisma/instructions.md)** — lista enumova ne sadrži `CompanyRole`, `CustomerOrgRole`, `PaymentStatus`. Za task o ulogama to je relevantan propust.
4. **[AGENTS.md](AGENTS.md) §Critical Issues #1** — navodi `dashboard/page.tsx:7`, stvarno je `:9` (`knowledge-base/roles-and-tenancy.md:78`). Sitno, ali AGENTS.md tvrdi da je source-of-truth.

Bonus zamka: `DATABASE_URL="file:./dev.db"` se razrešava **relativno na `prisma/`** → `prisma/dev.db` (385 KB, živa baza). U root-u postoji prazan `dev.db` (0 bajta) — zamka za `sqlite3 dev.db`.

---

## 2. Task: korisnici i login creds

Sve verifikovano na pravoj bazi: `bcrypt.compare` protiv `prisma/dev.db` **i** stvarni HTTP login na `localhost:3000` (CSRF → callback → `/api/auth/session`).

### Main kompanija (Acme Staklo & PVC Sistemi) — `/dashboard`

| Uloga                | Email               | Lozinka                 | Role                                                   |
| -------------------- | ------------------- | ----------------------- | ------------------------------------------------------ |
| **Admin**            | `admin@acme.test`   | `Gzf!Dobav#2026Kr4pN8`  | platform `COMPANY_ADMIN`, company `COMPANY_ADMIN`      |
| **Korisnik (staff)** | `sales@acme.test`   | `Gzf!Prodaj#2026Bn3wD7` | platform `COMPANY_STAFF`, company `COMPANY_SALES`      |
| **Korisnik (staff)** | `manager@acme.test` | `Gzf!Proizv#2026Tv8sM3` | platform `COMPANY_STAFF`, company `COMPANY_PRODUCTION` |

URL: `http://localhost:3000/login` → `/dashboard`

### Tenant kompanija (Prozori i vrata Boba, slug `bob`) — storefront

| Uloga               | Email                   | Lozinka                 | Role                                                   |
| ------------------- | ----------------------- | ----------------------- | ------------------------------------------------------ |
| **Tenant admin**    | `bob@customers.test`    | `Gzf!Kupac#2026Hd6qP9`  | platform `CUSTOMER`, `customerOrgRole: TENANT_ADMIN`   |
| **Tenant korisnik** | `worker@customers.test` | `Gzf!Radnik#2026Yc2rL5` | platform `CUSTOMER`, `customerOrgRole: TENANT_MANAGER` |

URL: **`http://bob.localhost:3000/login`** → `/bob/my-orders`
(ne `acme.localhost` — vidi grešku #1 gore)

### Platform admin (bonus)

| Uloga       | Email                      | Lozinka               | Role                             |
| ----------- | -------------------------- | --------------------- | -------------------------------- |
| Super admin | `superadmin@glazeflow.app` | `Gzf!Plat#2026Qx7mR2` | `SUPER_ADMIN`, `companyId: null` |

URL: `http://localhost:3000/admin`

### Bitne razlike između tenant admina i tenant korisnika

Jedina razlika u kodu: `/finance` — `TENANT_ADMIN` vidi, `TENANT_MANAGER` ne (`src/app/(storefront)/[companySlug]/finance/page.tsx:20`). Sve ostalo je identično. `TENANT_MANAGER` **nije** read-only.

### Postoje još 2 korisnika — password nepoznati

| Email                        | Org                 | Role             | Password                              |
| ---------------------------- | ------------------- | ---------------- | ------------------------------------- |
| `mistermilinkovic@gmail.com` | MisterWeb (`mrweb`) | `TENANT_ADMIN`   | ❌ nije seed lozinka (bcrypt cost 12) |
| `radnikmaster@gmail.com`     | MisterWeb (`mrweb`) | `TENANT_MANAGER` | ❌ nije seed lozinka                  |

Ovo nisu seed korisnici — kreirani su kroz `POST /api/register` (register UI je zatvoren). Ne mogu da im dam lozinku jer je hash neproverljiv bez reset-a. Mogu da im postavim novu lozinku ako ti treba — reci.

Ostali tenanti u bazi bez korisnika: `master` (MasterComp), `test1` (test123).

**Napomena bezbednosti:** lozinke gore su iz `prisma/seed.ts` (`SEED_PASSWORDS`) — svaki nalog ima svoju jaku lozinku koja zadovoljava produkcionu politiku (`src/lib/password-policy.ts`). lokalni dev only, nikad u produkciju (`prisma/instructions.md:29-31`). Puna tabela: `docs/security-hardening.md`.
