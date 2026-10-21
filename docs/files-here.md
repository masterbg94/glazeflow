# Files here

> Šta je u svakom fajlu i kome služi.
>
> Re-verified against the repository on 2026-10-21.

## Struktura repozitorijuma

```
glazeflow-mvp/
├── AGENTS.md                    ← uvek prvi, pravila repozitorijuma
├── CLAUDE.md                    ← pointer na AGENTS.md (@AGENTS.md)
├── .agents/
│   ├── instructions/            ← app-wide instrukcije
│   └── skills/                  ← skills (većina je caveman plugin; glazeflow-* su naše)
├── .claude/skills/              ← symlinki na .agents/skills
├── .mcp.json                    ← MCP serveri (supabase, next-devtools)
├── knowledge-base/              ← verifikovana referenca (EN)
├── docs/                        ← produktna dokumentacija (SR)
├── prisma/                      ← schema, seed, dev.db
├── src/
│   ├── app/                     ← routes (App Router)
│   │   ├── (platform)/admin     ← SUPER_ADMIN panel
│   │   ├── (company)/dashboard  ← glavna kompanija
│   │   ├── (storefront)/[companySlug]  ← tenant portal
│   │   ├── (auth)/              ← login (register UI je zatvoren)
│   │   └── api/                 ← route handlers
│   ├── components/              ← client komponente
│   ├── lib/                     ← auth, rbac, tenant, pricing, events, realtime
│   └── middleware.ts            ← host routing + navigacioni guard
└── .vscode/.mcp.json            ← isti MCP serveri, za VS Code
```

## `docs/`

| Fajl                          | Sadržaj                                                                           | Status     |
| ----------------------------- | --------------------------------------------------------------------------------- | ---------- |
| `instructions.md`             | Index produktovog knowledge base-a + kako raditi u ovom folderu                   | aktuelan   |
| `agents-when-load.md`         | Redosled učitavanja instrukcija; šta je ne treba verovati bez provere             | aktuelan   |
| `files-here.md`               | Ovaj fajl                                                                         | aktuelan   |
| `roles.md`                    | Uloge po kodu: tri dimenzije, matrica dozvola, gde se ko loguje, ključni propusti | aktuelan   |
| `how-app-works-with-roles.md` | Pregled kako radi aplikacija, na srpskom                                          | aktuelan   |
| `improvements.md`             | Prioritizovani tehnički rizici i plan; sadašnje stanje provereno                  | aktuelan   |
| `postgres-migration.md`       | Prelazak sa SQLite na PostgreSQL — šta se menja i šta ne                          | aktuelan   |
| `ai-structure-plan.md`        | Kako je AI struktura organizovana — skills, instrukcije, knowledge base, i zašto  | istorijski |
| `Business Logic.md`           | Originalna produktna vizija — namera, **ne** implementacija                       | arhiva     |
| `BUSINESS_LOGIC_FIX.md`       | Migracija na model "jedna glavna kompanija" — izvršena                            | arhiva     |

### Arhivirani i obrisani dokumenti

Sledeći fajlovi su uklonjeni 2026-10-21 jer su bili duplikati, završeni planovi
ili su sadržali netačne tvrdnje:

| Uklonjen fajl              | Zašto                                                                 |
| -------------------------- | --------------------------------------------------------------------- |
| `koje-instrukcije-kada.md` | Duplikat `agents-when-load.md`; sam se deklariše kao zastareo         |
| `improve-admin.md`         | Plan admin panela — u potpunosti izvršen (`/api/admin/stats` postoji) |
| `prompt-shorten-logic.md`  | Sirovi biznis brief; sadržao je nepostojeće role i statuse            |
| `roles-how-and-where.md`   | Duplikat `roles.md`; jedinstveni delovi prebačeni u `roles.md` § 6-7  |
| `explained/`               | Chat log, nikad nije commitovan                                       |

## `knowledge-base/`

Verifikovano protiv koda. English. Učitava se po potrebi, ne sve odjednom.

| Fajl                   | Odgovara na                                                  |
| ---------------------- | ------------------------------------------------------------ |
| `README.md`            | Index i redosled učitavanja                                  |
| `roles-and-tenancy.md` | Uloge, tenancija, matrica dozvola, šta ne postoji            |
| `order-lifecycle.md`   | Statusi, tranzicije, approval chain, notifikacije, real-time |
| `pricing-rules.md`     | Formule, cena po tenantu, Decimal pravilo                    |
| `api-map.md`           | Svaki route, njegov auth guard, konvencije                   |
| `data-model.md`        | Modeli, enum-i, invarijante, workflow migracije              |
| `auth-gaps.md`         | Verifikovani security procepi sa `file:line`                 |
| `roles-explanation.md` | Zašto postoje više dimenzija uloga                           |

## Instructions

| Fajl                                       | Učitava se                       |
| ------------------------------------------ | -------------------------------- |
| `AGENTS.md`                                | Uvek, prvo                       |
| `.agents/instructions/app-instructions.md` | Uvek, za svaki GlazeFlow zadatak |
| `src/app/instructions.md`                  | Kad se dira `src/app/**`         |
| `src/lib/instructions.md`                  | Kad se dira `src/lib/**`         |
| `prisma/instructions.md`                   | Kad se dira `prisma/**`          |
| `docs/instructions.md`                     | Kad se dira `docs/**`            |

`.agents/skills/**` **nije** app instrukcija. Skills se aktiviraju po opisu
zadatka. Naše skills: `glazeflow-tenant-guard`, `glazeflow-role-check`,
`glazeflow-pricing-change`, `glazeflow-schema-change`, `glazeflow-order-flow`,
`glazeflow-onboard`.
