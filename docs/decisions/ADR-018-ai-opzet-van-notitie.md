# ADR-018 — AI-opzet en samenvatting van een notitie

Status: gebouwd. Werkt alleen als AI aan staat en er een aanbieder is (ADR-016).

## Besluit

- Onder een **afgeronde** notitie staat het paneel **"Opzet en samenvatting"** met de knop
  "Opzet maken". De AI maakt een voorstel: kerngedachte, samenvatting (2–4 zinnen), hoofdpunten
  met subpunten en de toepassing, **alleen uit wat in de notitie staat**.
- **De notitie verandert nooit** (CLAUDE.md: never mutate notes with AI). De eigenaar kiest zelf:
  - "Kopieer opzet" (platte tekst);
  - "Als nieuwe notitie opslaan": maakt via de gewone route een **nieuwe** notitie
    "Opzet: <titel>", van hetzelfde soort, met een regel dat de opzet met AI is gemaakt.
- Alleen na afronden (baseline: optionele AI ná afronden).

## Hoe het werkt

- Volgorde zoals elke AI-taak (ADR-012): AI aan → notitie afgerond → budget reserveren →
  aanbieder → opslaan → werkelijke kosten.
- Sleutel = notitie + content hash: dezelfde tekst wordt nooit twee keer betaald. Na een wijziging
  krijgt de bewaarde opzet het label "Verouderd" en kan er een nieuwe gemaakt worden.
- Opslag in `ai_outlines` (owner_id + RLS, alleen lezen; schrijven alleen via `ai_add_outline`,
  dat de punten opschoont: hoogstens 12 punten met 8 subpunten).
- Afgeleide gegevens: niet in de export, net als ADR-013.
- Bij een weigering van de aanbieder wordt een vaste melding bewaard, zodat er niet steeds opnieuw
  betaald wordt.
