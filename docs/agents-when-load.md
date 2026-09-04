## Kada se koja instrukcija učitava

`AGENTS.md` — uvek prvo, za svaki zadatak. Sadrži: poznate bugove (Prisma companyId null, Decimal serijalizacija, cross-origin, spor notification stream), komande, arhitekturu, auth pattern, pravilo za Decimal.

`app-instructions.md` — uvek, za svaki GlazeFlow zadatak. Misija app, source-of-truth pravila, security, verifikacija.

### Scoped instrukcije — samo kad diraš taj folder:
`instructions.md` — kad menjaš `src/app/**`
`instructions.md` — kad menjaš `src/lib/**`
`instructions.md` — kad menjaš `prisma/**`
`instructions.md` — kad menjaš `docs/**`

`roles-explanation.md` — samo za pitanja o ulogama (platformRole, companyRole).
Promena kroz više scope-ova — učitaj sve odgovarajuće scoped fajlove pre editovanja.
Kod i `schema.prisma` — konačna istina kad docs i kod ne slažu.
Šta se NE učitava automatski
`.agents/skills/**` — nisu app instrukcije. Aktiviraju se samo kad skill eksplicitno pozvan (npr. caveman mode sad).
CLAUDE.md — samo pointer na AGENTS.md (@AGENTS.md).