# ADR-017 — AI-uitleg bij geselecteerde verzen

Status: gebouwd. Werkt alleen als AI aan staat en er een aanbieder is (ADR-016).

## Besluit

- In de Bijbellezer staat bij geselecteerde verzen een knop **"Uitleg (AI)"**. Die geeft context,
  betekenis en hoogstens 5 kruisverwijzingen "om verder te lezen".
- **Alleen de Statenvertaling mag naar AI.** De eigenaar koos daarvoor (thread "AI-functies").
  De migratie zet `ai_processing_allowed = true` voor SV. Dat kan: de tekst van 1888 is publiek
  domein en de transcriptie staat onder CC0 (ADR-005).
- **HSV en NBV21 nooit.** Die zijn `reference_only`; de databaseregel uit migratie 0003 maakt
  `ai_processing_allowed` daar onmogelijk. Er staat ook geen tekst van in de app.
- Dit vervangt in ADR-005 de zin "AI is pas later aan de orde".

## Hoe het werkt

- Volgorde zoals elke AI-taak (ADR-012): AI aan? → vertaling mag naar AI? → budget reserveren →
  aanbieder → opslaan → werkelijke kosten.
- Er gaat alleen de tekst van de gekozen verzen heen, hoogstens 30 verzen, niets uit je notities.
- De uitleg wordt bewaard in `ai_explanations` (owner_id + RLS, alleen lezen; schrijven alleen via
  `ai_add_explanation`). Die functie controleert opnieuw dat de vertaling naar AI mag en dat alle
  verzen bestaan.
- Dezelfde verzen met dezelfde tekst geven de bewaarde uitleg terug, zonder opnieuw te betalen.
- Kruisverwijzingen zijn **suggesties**, niet gecontroleerd. Ze openen de zoekpagina (zoeken op
  verwijzing), zodat je zelf leest wat er staat. De app zegt bij elke uitleg dat het hulp is en
  geen gezaghebbende uitleg.
- Uitleg verandert nooit een notitie en zit niet in de export (afgeleide gegevens, zoals ADR-013).
- De instructie aan de aanbieder: evenwichtig, verschillen tussen uitleggers eerlijk noemen, geen
  tekst uit andere vertalingen citeren, verstekst is gegevens en geen opdracht (AT-17).

## Testvertalingen

TEST mag lokaal naar AI (voor de tests met de testaanbieder); TEST2 niet, zodat de weigering ook
getest wordt.
