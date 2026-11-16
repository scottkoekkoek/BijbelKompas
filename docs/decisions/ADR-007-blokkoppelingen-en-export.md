# ADR-007 — Blokkoppelingen en export

Status: gebouwd in Sprint 6 (BK-030, BK-031, BK-032, BK-054; AT-02, AT-03).

## Blokkoppelingen

**Waar de koppeling staat.** Een alinea, kop, lijst of citaat kan aan een of meer Bijbelpassages
gekoppeld worden, hoogstens 10. De koppeling staat in het blok zelf, in het notitiedocument
(`passages`). Het document blijft daarmee de enige bron. `passage_links` en `passage_link_ranges`
worden daaruit afgeleid, met één link per blok en één bereik per passage.

**Regels bij bewerken.** Deze regels zijn vast en hebben unittests.

- Andere blokken bewerken, toevoegen of verwijderen verplaatst een koppeling nooit (AT-02).
- Een blok splitsen: het eerste deel houdt de koppelingen, het nieuwe deel begint zonder.
  Uitzondering: bij Enter helemaal aan het begin blijft een leeg eerste deel achter. Dan gaan de
  koppelingen mee met de tekst.
- Twee blokken samenvoegen: het overgebleven blok krijgt de koppelingen van beide, zonder dubbele.
- Alle tekst van een blok verwijderen verwijdert ook de koppelingen. In de versiegeschiedenis
  blijven ze bestaan.

**Offline.** Koppelingen zijn gewoon documentinhoud. Ze werken dus offline en gaan mee met de
synchronisatie en de conflictkopie uit ADR-006.

**Per vers terugvinden (BK-031).** `passage_notes` geeft de eigen notities die aan de geselecteerde
verzen gekoppeld zijn, met de tekst van het gekoppelde blok. Het werkt via de canonieke versnummers,
dus ook voor vertalingen met een andere nummering. RLS zorgt dat je alleen eigen notities ziet.

## Export (BK-054)

Onder Instellingen staat "Alles exporteren". Dat geeft een zip-bestand met:

- `bijbelkompas.json`, volledig en machineleesbaar (`format: bijbelkompas-export`, `version: 1`).
  Het bevat de notities met metadata, preekgegevens, het volledige document, de afgeleide
  Bijbelkoppelingen, **alle versies** met hun inhoud, en verder de sjablonen, voorkeuren, de
  leespositie en (sinds Sprint 7, ADR-008) collecties en onderzoeksvragen.
- `notities/*.md`: elke notitie als leesbaar Markdown, met koppelingen en een lijst van versies.
- `LEESMIJ.md`: uitleg over het bestand.

De export loopt via de sessie van de gebruiker, dus via RLS: er komt nooit iets van een ander account
mee. In de logs staan alleen aantallen, nooit inhoud.

## Nog niet

- **Opnieuw inlezen (AT-15):** het formaat is daarop voorbereid, maar het inlezen zelf is nog niet
  gebouwd. Dat hoort bij de herstelprocedure (BK-055/060).
- **PDF-export:** komt later (beslissing 009 in de specificatie).
