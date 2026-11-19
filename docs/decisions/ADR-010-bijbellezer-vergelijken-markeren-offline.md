# ADR-010 — Vergelijken, markeren en de Bijbel offline

Status: gebouwd in Sprint 9 (BK-011, BK-013, BK-014, AT-09).

## Twee vertalingen naast elkaar (BK-011, AT-09)

In de lezer staat onder de vertalingen een rij "Vergelijk met". Kies je een tweede vertaling, dan
zie je het hoofdstuk vers voor vers in twee kolommen (`?naast=CODE`). Op een telefoon staan de twee
teksten onder elkaar.

- **Koppeling via de canonieke verzen.** De verzen worden niet op nummer gekoppeld, maar via
  `verse_mappings`. De rijen volgen de nummering van de eerste vertaling.
  - Telt de tweede vertaling een vers anders, dan staat daar de tekst die over dezelfde verzen gaat.
  - Valt de versgrens anders, dan staat bij die rij "≈ andere versindeling". Dat is zo bij
    samengevoegde of gesplitste verzen, en bij elke koppeling die niet `exact` is.
  - Een stuk tekst dat meerdere rijen beslaat, staat er één keer. Daaronder staat "Zie hierboven".
- **Alleen vertalingen met tekstrechten.** HSV en NBV21 staan niet in de keuzelijst. De
  databasefunctie `compare_chapter` draait met de rechten van de gebruiker. Daardoor geeft hij
  nooit tekst die de rechten (RLS) niet toestaan, ook niet als de licentie verlopen is.
- Lokaal staat er een tweede fictieve testtekst (`TEST2`) met een andere versindeling, om dit te
  testen. In productie komt die er niet: de seed draait alleen lokaal.

## Markeringen (BK-013)

Selecteer verzen en kies "Markeren". Je kiest een kleur (geel, groen, blauw of roze) en kunt een
korte aantekening toevoegen (maximaal 500 tekens). Onder het hoofdstuk staat
"Markeringen in dit hoofdstuk", waar je een markering wijzigt of verwijdert.

- **Opgeslagen als canonieke verzen.** Een markering is daardoor in elke vertaling zichtbaar, op de
  verzen die daar hetzelfde gedeelte beslaan.
- **Hetzelfde gedeelte twee keer markeren** geeft geen tweede markering. De bestaande krijgt de
  nieuwe kleur.
- **Beveiliging:**
  - Tabel `highlights` heeft `owner_id` en RLS. De app mag alleen lezen en kleur of aantekening
    wijzigen.
  - Toevoegen, verwijderen en terugzetten gaan via databasefuncties die alleen met je eigen
    gegevens werken.
  - De app heeft geen DELETE-recht, net als in ADR-008.
- **Export en terugzetten.** Markeringen staan in de export (`highlights`) en komen terug met
  "Export terugzetten". Ook daar worden ze alleen toegevoegd: een gedeelte dat al gemarkeerd is,
  wordt overgeslagen.

## De Bijbel offline (BK-014)

Onder "Offline en synchronisatie" staat "Bijbel op dit apparaat". Een vertaling die offline mag,
bewaar je daar met één knop op dit apparaat en verwijder je er ook weer mee. Zonder internet opent
een Bijbelhoofdstuk daarna vanuit die kopie (`/offline?bijbel=SV/GEN/1`). De offline-pagina toont
ook een lijst met de bewaarde vertalingen.

- **Alleen als de rechten het toestaan.** Er wordt alleen tekst gegeven als de vertaling tekstrechten
  heeft en `offline_allowed` aan staat. In productie is dat nu alleen de Statenvertaling.
  - HSV en NBV21 krijgen altijd "mag niet" (afspraak 2).
  - Een vertaling met een verlopen licentie geeft geen tekst (RLS).
- **Opgeslagen in IndexedDB, niet in de cache van de service worker.**
  - De database van de browser gaat naar versie 2, met een nieuwe opslag `bible`. Bestaande
    notities blijven staan; dat is getest.
  - Is de app nog open in een oud tabblad, dan kan de nieuwe versie pas na herladen worden
    geopend. Nieuwe versies wachten daar niet meer op.
- **Rechten veranderd?** Bij elke synchronisatie controleert de app welke vertalingen nog offline
  mogen. Een vertaling die niet meer mag, wordt van het apparaat verwijderd.
- **Ophalen gaat per boek**, met voortgang ("boek 3 van 66"). Mislukt het halverwege, dan blijft
  staan wat al binnen was. Opnieuw bewaren begint schoon.
- **Uitloggen wist ook de bewaarde Bijbeltekst.**

## Bewust nog niet gedaan

- Markeren of een notitie maken in de offline lezer. Dat kan alleen online.
- Vergelijken in de offline lezer.
- Een markering die over twee hoofdstukken loopt, maken. Uit een export kan zo'n markering wel
  terugkomen, en de lezer toont hem.
