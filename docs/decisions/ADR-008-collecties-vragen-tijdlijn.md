# ADR-008 — Collecties, onderzoeksvragen en tijdlijn

Status: gebouwd in Sprint 7 (BK-047 t/m BK-053).

## Collecties (BK-047, BK-048)

- Een collectie heeft een naam, een soort (dossier, preekserie, thema of Bijbelstudie), een
  beschrijving en eventueel een bovenliggende collectie. Zo ontstaat een boom.
- **Geen cycli.** Een trigger weigert een bovenliggende collectie die onder de collectie zelf ligt.
  Die bovenliggende collectie moet ook van dezelfde eigenaar zijn. De pagina biedt zulke keuzes niet
  eens aan. De boom is hoogstens 20 lagen diep.
- **Geen kopieën.** `collection_items` wijst alleen naar een notitie. Dezelfde notitie kan dus in
  meer collecties staan en bestaat maar één keer. De volgorde staat in `position`.
- In het datamodel van de specificatie heet dit `entity_id`. Wij gebruiken `note_id` met een echte
  foreign key, omdat er nu alleen notities in een collectie gaan. Komen er later andere soorten bij,
  dan krijgt dat een eigen kolom.
- **Thema's** zijn collecties van de soort "Thema". Er is dus geen aparte tabel voor thema's.
- **Archiveren in plaats van verwijderen.** Collecties en vragen worden gearchiveerd, net als
  notities en sjablonen. De app heeft nergens een DELETE-recht; de bestaande databasetest bewaakt
  dat. Een notitie uit een collectie halen of een koppeling bij een vraag weghalen loopt via drie
  functies die de eigenaar controleren (`remove_collection_item`, `unlink_question_note`,
  `remove_question_passage`). De notitie zelf blijft altijd bestaan.

## Onderzoeksvragen (BK-049, BK-050, BK-051)

- Een vraag heeft een titel, een toelichting, een status (open, in onderzoek, beantwoord,
  gearchiveerd), een eigen antwoord en de datums `created_at` en `resolved_at`.
- `resolved_at` volgt de status die de eigenaar kiest. Niets verandert de status vanzelf. Ook AI
  sluit later nooit een vraag (specificatie §9).
- Een vraag kan aan notities (`question_notes`) en aan Bijbelgedeelten (`question_passages`)
  gekoppeld worden. Bij een gedeelte bewaren we wat de gebruiker koos, in de nummering van de
  vertaling. Daarnaast bewaren we het canonieke versbereik, met dezelfde regels als bij de
  notitiekoppelingen. Zo vindt de Bijbellezer de vragen bij een hoofdstuk ("Vragen bij dit
  hoofdstuk").

## Tijdlijn (BK-052, BK-053)

- De tijdlijn sorteert op de gebeurtenisdatum, dus de datum waar de notitie over gaat. Een notitie
  zonder die datum staat op de dag waarop hij geschreven is, met de vermelding "Geen datum".
- "Geschreven op" en "bijgewerkt op" staan er apart onder, zodat ze nooit met de gebeurtenisdatum
  verward worden.
- Je kunt filteren op periode, soort, status, spreker, Bijbelboek en "thema of collectie". Een
  collectie telt samen met haar subcollecties.
- De functie `timeline_notes` draait als de gebruiker zelf (security invoker), dus RLS bepaalt wat
  zichtbaar is.

## Offline

- Op de collectiepagina kun je een collectie "offline beschikbaar houden". Dat geldt per apparaat.
- Het apparaat onthoudt welke collecties het vasthoudt. Bij elke synchronisatie vraagt het op welke
  notities erin staan, ook in de subcollecties. Die notities blijven dan op het apparaat, net als
  vastgezette en recente notities.
- Wordt een collectie gearchiveerd, dan valt ze uit deze lijst. Notities die nog niet verstuurd
  zijn, worden nooit opgeruimd.

## Export

De export (ADR-007) bevat nu ook collecties, collectie-items, vragen en hun koppelingen. Dit zijn
extra velden in `version: 1`. Een lezer die ze niet kent, kan ze negeren.

## Nog niet

- Een AI-voorstel voor een antwoord. Dat komt pas met de AI-hulp, en ook dan sluit AI een vraag
  nooit.
- Vragen bij een los geselecteerd vers in de lezer. De lezer toont ze nu per hoofdstuk.
