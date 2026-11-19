# ADR-012 — AI-basis zonder AI-aanbieder

Status: gebouwd in Sprint 11 (BK-039, BK-040, BK-041, BK-044, BK-045; AT-10, AT-12, AT-17).

## Besluit

De hele AI-route is gebouwd: aan/uit, budget, taken, voorstellen en accepteren of afwijzen. Er is
alleen nog **geen echte AI-aanbieder**. Die kiest de eigenaar zelf. De eigenaar geeft ook zelf
toestemming dat notitietekst naar die aanbieder gaat (CLAUDE.md, spec §0). Tot dan wordt er niets
verstuurd.

## Hoe het werkt

- **Aanbieder via een adapter** (`lib/ai/provider.ts`).
  - De omgevingsvariabele `AI_PROVIDER` kiest de aanbieder. Staat die niet ingesteld, dan is er
    geen aanbieder: de knop "Verbanden laten zoeken" verschijnt niet, en de API weigert.
  - De enige implementatie is `fictief`. Die draait lokaal, kost niets en geeft altijd dezelfde
    uitkomst. Hij stelt alleen verbanden voor tussen eigen notities die naar dezelfde verzen
    verwijzen.
  - `fictief` werkt nooit in productie (`VERCEL_ENV=production`). Hij is er alleen voor de tests.
- **Volgorde bij "Verbanden laten zoeken"** (spec §13.3):
  1. Staat AI aan? Zo niet, dan wordt er niets gelezen voor AI.
  2. Is de notitie afgerond?
  3. Het budget wordt gereserveerd. Daarvoor wordt de aanbieder nog niet aangeroepen.
  4. De aanbieder wordt aangeroepen.
  5. De voorstellen worden opgeslagen.
  6. De werkelijke kosten worden vastgelegd.

  Dezelfde versie van een notitie opnieuw laten analyseren geeft dezelfde taak terug. Er wordt dus
  niet opnieuw betaald.
- **Budget €5 per kalendermaand** (Nederlandse tijd, BK-045, AT-12).
  - Nieuwe taken stoppen zodra het gebruik plus de schatting boven €4,50 komt.
  - Telt: de werkelijke kosten, of de reservering zolang die nog loopt.
  - Een databaseslot zorgt dat twee verzoeken tegelijk niet allebei onder de grens doorglippen.
  - Een mislukte taak telt met de geschatte kosten.
  - Gewoon schrijven en zoeken werkt altijd, ook als AI uit staat of het budget op is.
- **Voorstellen veranderen nooit een notitie** (BK-041, AT-10, AT-17).
  - Een voorstel krijgt een status: voorgesteld, geaccepteerd, uitgesteld of afgewezen.
  - Alleen een geaccepteerd verband is actief. Je ziet het bij beide notities onder "Verbanden".
  - Een verband dat al eens is voorgesteld, ook als je het hebt afgewezen, wordt niet opnieuw
    voorgesteld.
  - Wat de aanbieder ook terugstuurt: de database neemt alleen verbanden aan tussen notities van
    dezelfde eigenaar, met hoogstens 20 per keer. Al het andere valt weg.
  - Elk voorstel bewaart welke aanbieder en welk model het maakte, en bij welke versie van de
    notitie.
- **Beveiliging.** De tabellen `ai_jobs`, `ai_usage` en `ai_suggestions` hebben een `owner_id` en
  RLS. De app mag ze alleen lezen. Wijzigen kan alleen via databasefuncties die werken met de
  gegevens van de ingelogde gebruiker.

## Bekende beperking

`ai_finish` (werkelijke kosten vastleggen) is aan te roepen door de ingelogde gebruiker zelf. Die
zou zo zijn eigen budgetteller kunnen verlagen. Dat raakt alleen zijn eigen kosten, en het budget
is een rem op de eigen kosten, geen beveiliging tegen anderen. Een vaste limiet bij de aanbieder
blijft daarom nodig (spec §17).

## Nog te doen, na keuze van de eigenaar

- Een echte aanbieder kiezen en de API-sleutel als geheim in Vercel zetten. Daarbij: kosten,
  Nederlandse taal, privacy en bewaartermijn testen (ADR-register 002), en een
  verwerkersovereenkomst afsluiten.
- Een limiet bij de aanbieder zelf instellen.
- Semantisch zoeken met embeddings (BK-036, BK-037).
- Vragen stellen aan je notities, met controleerbare bronnen (BK-042, BK-043, AT-11).
- Verouderde voorstellen herkennen (BK-046).
- Automatisch analyseren na afronden.
