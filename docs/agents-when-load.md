# Kada se koja instrukcija učitava

## Uvek prvo

**`AGENTS.md`** — prvi fajl za svaki zadatak. Sadrži: poznate bugove (Prisma
`companyId` null, Decimal serijalizacija, cross-origin, spor notification
stream), komande, arhitekturu, auth pattern, Decimal pravilo, listu security
propusta, i link ka knowledge base-u.

**`.agents/instructions/app-instructions.md`** — uvek, za svaki GlazeFlow
zadatak. Misija app-a, source-of-truth pravila, tri invarijante (jedna glavna
kompanija, server je autoritet za cenu, tenant scope je po `customerOrgId`),
sigurnosna pravila, verifikacija.

## Scoped instrukcije — samo kad diraš taj folder

| Fajl                      | Učitava se kad      |
| ------------------------- | ------------------- |
| `src/app/instructions.md` | menjaš `src/app/**` |
| `src/lib/instructions.md` | menjaš `src/lib/**` |
| `prisma/instructions.md`  | menjaš `prisma/**`  |
| `docs/instructions.md`    | menjaš `docs/**`    |

Promena kroz više scope-ova — učitaj sve odgovarajuće scoped fajlove pre
editovanja. Scoped pravila **dopunjuju** root pravila, ne zamenjuju ih.

## Knowledge base — učitaj samo fajl koji ti treba

`knowledge-base/README.md` je index. Mapira pitanje → fajl:

| Pitanje                        | Fajl                   |
| ------------------------------ | ---------------------- |
| Uloge, dozvole, tenancija      | `roles-and-tenancy.md` |
| Statusi, tranzicije, odobrenja | `order-lifecycle.md`   |
| Cene, cena po tenantu          | `pricing-rules.md`     |
| Svaki API route i njegov auth  | `api-map.md`           |
| Modeli, invarijante, migracije | `data-model.md`        |
| Security procepi               | `auth-gaps.md`         |
| Zašto više dimenzija uloga     | `roles-explanation.md` |

Ne učitavaj ceo knowledge base. Učitaj jedan fajl koji odgovara zadatku.

## Skills — aktiviraju se po opisu zadatka

`.agents/skills/**` **nije** app instrukcija. Skill se učitava kad runtime
aktivija njegov skill, tj. kad opis zadatka odgovara `description` u frontmatter-u.

| Skill                      | Za šta                                                                    |
| -------------------------- | ------------------------------------------------------------------------- |
| `glazeflow-tenant-guard`   | tenant izolacija, vidljivost kataloga, kreiranje narudžbine, cene tenanta |
| `glazeflow-role-check`     | uloge, dozvole, tranzicije statusa, admin površine                        |
| `glazeflow-pricing-change` | cene, price list, override, pricing engine                                |
| `glazeflow-schema-change`  | `prisma/schema.prisma`, seed, novi model/enum                             |
| `glazeflow-order-flow`     | narudžbine, statusi, notifikacije, real-time eventi                       |
| `glazeflow-onboard`        | read-only pitanja: "kako radi app", "gde je X", "šta može tenant"         |

Ostale skills u `.agents/skills/` su caveman plugin (stil komunikacije, token
optimizacija) i nisu specifični za GlazeFlow.

## Konflikti

Kod i `prisma/schema.prisma` određuju ponašanje. `knowledge-base/` je verifikovan
protiv koda. `docs/` je namera i istorija.

Kad se raziđu: kod je tačan. Ako dokument greši, ispravi dokument i reci koja
je verzija tačna.

## Čemu ne treba verovati bez provere

- `PRODUCTION_WORKER` — ne postoji u `CompanyRole` enumu
- `QUOTE_REVISION` — enum je `QUOTE_AMENDMENT`
- "svaki tenant vidi svoj katalog" — per-tenant dodele ne postoje, svi vide ceo
- `npm run lint` — pokvaren, `next lint` je uklonjen u Next.js 16
- `acme.localhost:3000` — to nije tenant. Poddomen tenanta je `CustomerOrg.slug`
  (seed: `bob`, pa `bob.localhost:3000`). `acme` je slug glavne kompanije i
  taj host vraća 404
- "kreiranje kompanije" na `/admin` — ne postoji. Forma pravi **tenanta**
  (`CustomerOrg`). `POST /api/companies` je blokiran sa 403
- `dev.db` u korenu repozitorijuma — prazna je. Prava baza je `prisma/dev.db`

## Baza podataka

Danas SQLite (`prisma/schema.prisma:7`), produkcija je predviđena kao
PostgreSQL. **Prelazak nije započet.** Ako promena dodiruje `datasource`,
`Decimal` obradu ili deployment target, učitaj `docs/postgres-migration.md`
pre nego što pišeš kod.

Ključna razlika: SQLite **ne enforcing-uje strane ključeve** po defaultu
(`PRAGMA foreign_keys` je `0` na dev bazi), pa postojeći podaci mogu imati
"osince" koje Postgres odbija pri prvom upisu.

## MCP serveri

`.mcp.json` (i `.vscode/.mcp.json`) definišu dva servera:

| Server          | Endpoint                          | Za šta                                   |
| --------------- | --------------------------------- | ---------------------------------------- |
| `supabase`      | `http://127.0.0.1:54321/mcp`      | lokalni Supabase stack                   |
| `next-devtools` | `npx -y next-devtools-mcp@latest` | Vercel-ov devtools za running dev server |

`nextjs_index` otkriva server i njegove alate, `nextjs_call` ih poziva.
`get_request_insights` zahteva `experimental.requestInsights = true` u
`next.config.ts` + restart dev servera — podrazumevano je **isključeno**.

Supabase MCP gleda **lokalni** stack, ne hosted projekat. Proveri
`get_project_url` pre `apply_migration`. Lokalni Postgres ima **0 tabela** u
`public` šemi — app radi na SQLite, pa ovi alati vide drugu bazu od aplikacije.
