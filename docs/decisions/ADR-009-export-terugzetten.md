# ADR-009 — Export terugzetten en controle van productie

Status: gebouwd in Sprint 8 (AT-15, BK-055, BK-059, BK-060).

## Export terugzetten (AT-15)

Onder Instellingen staat nu "Export terugzetten". Je kiest het zip-bestand van "Alles exporteren"
(of `bijbelkompas.json`).

- **Alleen toevoegen.** Een notitie, collectie, vraag of sjabloon die al in het account staat (zelfde
  id), wordt overgeslagen en nooit gewijzigd. Twee keer terugzetten verandert de tweede keer dus
  niets. Je voorkeuren en leespositie blijven zoals ze zijn.
- **Alles wordt van de ingelogde gebruiker.** Wat er in het bestand staat over eigenaars, telt
  niet. Hoort een id al bij een ander account, dan krijgt het teruggezette item een nieuw id. Dat
  andere account wordt niet geraakt en er wordt niets over prijsgegeven.
- **Notities:**
  - Het document is leidend. Blokken en Bijbelkoppelingen worden opnieuw afgeleid, net als bij
    gewoon opslaan.
  - Titel, soort, status, gebeurtenisdatum, aanmaakdatum en preekgegevens komen terug.
  - "Bijgewerkt op" wordt het moment van terugzetten. Zo pikken andere apparaten de notitie gewoon
    op bij hun synchronisatie.
- **Versies:**
  - Alle versies komen terug, met hun nummer, reden, datum en inhoud.
  - Dat kan alleen bij een notitie die het terugzetten zelf net heeft aangemaakt: binnen een dag,
    en alleen ná de versies die er al zijn.
  - Bestaande versies blijven onveranderlijk. Een nieuwe poging slaat versies over die er al zijn.
- **Collecties en vragen:**
  - Collecties komen terug met hun boom, vragen met hun koppelingen.
  - Een koppeling naar een notitie die niet in de export zit, valt weg. Een Bijbelgedeelte dat hier
    niet bestaat, valt ook weg.
  - Bij een beantwoorde vraag wordt "beantwoord op" het moment van terugzetten.
- **In stukken.** De browser leest het zip-bestand zelf en stuurt elke notitie apart naar de server.
  Versies gaan in delen van hoogstens 2 MB. Zo blijft elk verzoek onder de limiet van Vercel. De
  server controleert elk deel opnieuw.
- **Fout halverwege:** wat al gelukt is, blijft staan. Opnieuw beginnen is veilig.
- **In de database:**
  - `import_note`, `import_revisions` en `import_extras` (security definer) controleren de eigenaar.
  - De kolom `notes.imported_at` markeert een notitie die door terugzetten is ontstaan.

## Back-ups (BK-055)

Bestond al sinds Sprint 1 (ADR-003). Er komt twee keer per week een versleutelde back-up, en elke
maand draait een herstelproef op een schone database. Die proef controleert rijtellingen, RLS en
rechten (AT-16). Daar is in deze sprint niets aan veranderd.

## Controle zonder privétekst (BK-059)

- `GET /api/v1/health` zegt alleen "ok" of "storing", of de database bereikbaar is, de tijd en de
  versie. Er staat niets persoonlijks in en je hoeft er niet voor ingelogd te zijn.
- De workflow "Controle productie" vraagt die pagina twee keer per dag op. Mislukt dat, dan mailt
  GitHub de eigenaar.
- Daarvoor is de repository-variabele `PRODUCTIE_URL` nodig. Zonder die variabele doet de controle
  niets en meldt hij dat.
- Logs bevatten alleen request-id's, routes, foutcodes en aantallen, nooit inhoud.

## Runbook (BK-060)

Zie `docs/runbooks/productie.md`.
