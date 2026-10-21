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
