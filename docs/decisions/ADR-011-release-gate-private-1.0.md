# ADR-011 — Release-gate Private 1.0

Status: gebouwd in Sprint 10 (BK-058; AT-04, AT-14, AT-18, AT-19, AT-20).

## Wat er gecontroleerd wordt

- **Vier schermformaten (BK-058).** De browsertests draaien op:
  - desktop;
  - telefoon (Pixel 7);
  - tablet rechtop (Galaxy Tab S4, 712 px breed, telefoonindeling met navigatie onderin);
  - tablet liggend (1138 px breed, met zijbalk).

  Op de twee tabletformaten draaien de tests van de lezer, de notities, de toegankelijkheid en
  deze sprint. Wat per schermgrootte gelijk is, wordt niet vier keer getest.
- **Indeling.** Welke indeling geldt, hangt af van de breedte (onder 768 px: navigatie onderin),
  niet van het apparaattype. Geen hoofdscherm scrolt zijwaarts.
- **Alleen met het toetsenbord (AT-19).**
  - Een test opent de lezer, selecteert een vers, markeert het met kleur en aantekening en
    verwijdert de markering weer. Daarbij wordt alleen Tab, Enter en de pijltjestoetsen gebruikt.
  - Bij elke stap wordt gecontroleerd dat de focus zichtbaar is.
  - axe (WCAG 2.2 AA) controleert alle hoofdschermen, ook in donker thema.
- **Revisie 8 van 20 terugzetten (AT-04).** Dat geeft revisie 21. Revisies 1 tot en met 20 blijven
  onveranderd. Dit is getest in de database.
- **Notitie van 20.000 woorden (AT-18).**
  - De notitie wordt opgeslagen, komt na herladen volledig terug en wordt gevonden met zoeken.
  - Getest in de browser en in de database.
  - Zoekresultaten zijn begrensd tot 50 per soort, zodat een woord dat overal voorkomt de pagina
    niet vastzet.
- **Volle opslag op het apparaat (AT-14).**
  - Online: de server bewaart de tekst, en de editor meldt duidelijk dat de opslag van het
    apparaat vol is.
  - Offline: de editor toont "Niet opgeslagen." en nooit "Lokaal opgeslagen". De tekst blijft
    staan, en zodra er weer verbinding is, wordt hij alsnog bewaard.
- **Vertaling zonder offline recht (AT-20).**
  - Deze tekst wordt nergens bewaard: niet in IndexedDB en niet in de cache van de service worker.
    Die cache bevat alleen de offline-pagina en de bouwbestanden.
  - Zonder internet krijg je "Niet op dit apparaat".
  - De API stuurt `cache-control: no-store` mee.

## Beveiligingsupdates

- Next.js gaat van 16.4.3 naar 16.4.6. Die versie repareert onder andere een cachelek bij
  `use cache`.
- fflate gaat naar 0.8.3. Die versie repareert een mogelijke oneindige lus bij het uitpakken; dat
  wordt gebruikt bij "Export terugzetten".
- `pnpm audit --prod` vindt nu geen bekende kwetsbaarheden meer.

## Wat nog openstaat voor Private 1.0

- **AI en semantisch zoeken** (BK-036, BK-037, BK-039 t/m BK-046). Daarvoor moet de eigenaar eerst
  een aanbieder, een budget en toestemming kiezen.
- **Handmatige controle met een echte schermlezer** (VoiceOver of TalkBack). De
  geautomatiseerde tests vervangen die niet.
- **Acceptatie door de eigenaar** in de testomgeving (Definition of Done).
