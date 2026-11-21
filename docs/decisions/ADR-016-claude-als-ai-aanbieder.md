# ADR-016 — Claude als AI-aanbieder

Status: gebouwd (BK-039, BK-042, BK-043; AT-10, AT-11, AT-17). Staat **uit** tot de eigenaar het
aanzet. Vervolg op ADR-012 en ADR-013.

## Besluit

De eigenaar koos Claude (Anthropic) als AI-aanbieder. Die zit achter dezelfde adapter als de
testaanbieder (`lib/ai/claude.ts`). Alles uit ADR-012 en ADR-013 blijft gelden: AI aan/uit, het
budget dat vóór de aanroep wordt gereserveerd, de bronnencontrole in app en database, en
voorstellen die nooit een notitie veranderen.

## Aanzetten (alleen de eigenaar)

1. Account op console.anthropic.com, met een **maandlimiet** bij Anthropic zelf (de harde rem uit
   ADR-012, bijvoorbeeld $10).
2. In Vercel als geheime variabelen: `ANTHROPIC_API_KEY` (de sleutel) en `AI_PROVIDER=claude`.
   Optioneel `AI_MODEL` (zie hieronder).
3. In de app: Instellingen → AI-hulp aan.

Zonder sleutel of met een onbekend model is er geen aanbieder en wordt er niets verstuurd.

## Model en kosten

- Standaard `claude-opus-5-5` (beste Nederlands en zorgvuldig citeren). Mag ook
  `claude-sonnet-5-5` (half zo duur) of `claude-haiku-5-5` (veel goedkoper, minder sterk).
- Kosten worden uit het werkelijke tokengebruik berekend, met de dollarprijzen 1-op-1 als euro.
  Dat schat iets te hoog, en dat is de veilige kant voor het budget.
- Een vraag aan je notities kost op Opus ongeveer €0,05. De reservering vooraf is ruimer (ongeveer
  €0,10) en wordt na afloop vervangen door de werkelijke kosten.
- Bij een weigering door Anthropic schakelt de API zelf over op een ander model
  (`fallbacks: "default"`); Haiku heeft dat niet. Een weigering wordt een "onzeker" antwoord zonder
  bronnen.

## Wat er verstuurd wordt

- Vragen: de vraag en hoogstens 12 passende alinea's van elk hoogstens 1.500 tekens (ADR-013).
- Verbanden: de tekst van de afgeronde notitie (hoogstens 40.000 tekens, de rest valt weg) en
  hoogstens 40 kandidaten (titel en gedeelde Bijbelverwijzing).
- Geen HSV/NBV21-tekst: die staat niet in de app.

## Veiligheid van de instructie (AT-17)

- Notitietekst staat tussen tags en geldt als gegevens, nooit als opdracht.
- `<`, `>` en `&` worden vóór verzending omgezet, zodat tekst de tag niet kan sluiten. Citaten worden
  daarna teruggezet, zodat de letterlijke bronnencontrole blijft werken.
- Het antwoord komt als gestructureerde JSON (structured outputs). Verbanden naar onbekende notities
  of naar de notitie zelf vallen weg.

## Nog te doen

- Privacyvoorwaarden en bewaartermijn van Anthropic door de eigenaar laten nalezen (ADR-register 002).
- Uitleg bij verzen (Statenvertaling) en preekopzet als voorstel: volgende PR's.
- Semantisch zoeken vraagt een aparte embeddings-aanbieder; Claude heeft geen embeddings.
