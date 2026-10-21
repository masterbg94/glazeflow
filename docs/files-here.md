# Files here

> Šta je u svakom fajlu i kome služi.

## Struktura repozitorijuma

```
glazeflow-mvp/
├── AGENTS.md                    ← uvek prvi, pravila repozitorijuma
├── CLAUDE.md                    ← pointer na AGENTS.md (@AGENTS.md)
├── .agents/
│   ├── instructions/            ← app-wide instrukcije
│   └── skills/                  ← skills (većina je caveman plugin; glazeflow-* su naše)
├── .claude/skills/              ← symlinki na .agents/skills
├── knowledge-base/              ← verifikovana referenca (EN)
├── docs/                        ← produkatna dokumentacija (SR)
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
└── .vscode/.mcp.json            ← next-devtools MCP
```

## `docs/`

| Fajl                          | Sadržaj                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `ai-structure-plan.md`        | Kako je AI struktura organizovana — skills, instrukcije, knowledge base, i zašto |
| `agents-when-load.md`         | Kada se koja instrukcija učitava                                                 |
| `files-here.md`               | Ovaj fajl                                                                        |
| `instructions.md`             | Index produktovog knowledge base-a                                               |
| `Business Logic.md`           | Originalna produktna vizija (namera, ne implementacija)                          |
| `BUSINESS_LOGIC_FIX.md`       | Migracija na model "jedna glavna kompanija" — izvršena                           |
| `how-app-works-with-roles.md` | Pregled kako radi aplikacija, na srpskom                                         |
| `roles.md`                    | Pregled uloga i propusta, na srpskom, po kodu                                    |
| `roles-how-and-where.md`      | Ko se loguje gde i šta radi — tabela + tok narudžbine                            |
| `improve-admin.md`            | Plan unapređenja admin panela (`/admin`)                                         |
| `improvements.md`             | Prioritizovani tehnički rizici i plan (treba proveriti da li je još aktuelno)    |
| `prompt-shorten-logic.md`     | Originalni biznis brief — izvor, ne specifikacija                                |

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
