## **Kako radi GlazeFlow — pregled za kupce, admina i super admina**

Aplikacija je platforma za narudžbinu stakla, PVC profila i gotovih prozora/vrata. Podržava više kompanija (multi-tenant) — svaka kompanija ima sopstveni katalog, cene i korisnike.

---

### **1. KUPAC (CUSTOMER)**

Kupac se registruje na stranici `/register` (javno dostupna). Nakon registracije prijavljuje se i može:

- **Pregledati prodavnicu** — svaka kompanija ima sopstveni storefront na npr. `acme.localhost:3000`
- **Poručiti proizvod** — stranica `/order` otvara wizard sa 8 koraka:
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

Postoje dva načina:

**A. Kupac se sam registruje** — javna stranica `/register` (dostupna bez prijave). Kupac unosi ime, email, lozinku i bira kompaniju. Nakon registracije dobija nalog i može odmah da počne da poručuje.

**B. Super admin dodaje korisnika** — na stranici `/admin/companies/[id]` pritisće dugme **"Dodaj korisnika"** i unosi email, ime, lozinku i ulogu (Administrator, Prodaja ili Proizvodnja). Tako se kreira nalog koji se odmah javlja na storefrontu te kompanije.

---

### **Ključni podsvešci (iz analize koda)**

1. **Kupci ne mogu videti katalog** — API vraća 403 za CUSTOMER role. Samo mogu da poručuju (wizard im prikazuje proizvode ali ne i cene pre narudžbine).
2. **Samo CUSTOMER može da kreira narudžbinu** — admin i staff ne mogu da poruče umesto kupca.
3. **Cene se računaju uživo** — nema fiksnih cenovnika, sve se računa na osnovu dimenzija i opcija u realnom vremenu.
4. **Svaka kompanija ima sopstvenu valutu, porez i markup** — super admin postavlja ove parametre prilikom kreiranja kompanije.

