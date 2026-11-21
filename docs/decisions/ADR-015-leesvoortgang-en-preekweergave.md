# ADR-015 — Leesvoortgang en preekweergave

Status: aangenomen (november 2026)
Context: opdracht "zes nieuwe functies", functie 4 (Leesweergave voor tijdens een preek) en functie 6 (Mijn leesvoortgang).

## Besluit: leesvoortgang per canoniek vers

- Nieuwe tabel `read_verses (owner_id, verse_id)` met RLS: alleen de eigenaar leest zijn eigen rijen. De app-rol mag niets schrijven; markeren en ongedaan maken gaan alleen via de functie `reading_mark` (security definer, met eigen owner-filter).
- Voortgang wordt per **canoniek vers** bewaard (zelfde tabel als `bible_verses`), niet per vertaling. Zo telt een hoofdstuk dat je in de SV las ook als gelezen in een andere vertaling. Een selectie wordt via de bestaande vertaling-naar-canon-koppeling omgezet; "heel hoofdstuk" gebruikt alle canonieke verzen van dat hoofdstuk.
- Primaire sleutel `(owner_id, verse_id)`: overlappende of herhaalde markeringen tellen elk vers één keer.
- Status per hoofdstuk: Ongelezen (0 verzen), Deels gelezen, Gelezen (alle canonieke verzen). Boekteller = aantal hoofdstukken met status Gelezen.
- Alleen uitdrukkelijk markeren wijzigt de voortgang. Openen, scrollen en "Verder lezen" (de bestaande leespositie) blijven gescheiden.
- "Naar eerstvolgende ongelezen vers" zoekt in canonieke volgorde (hoofdstuk, dan vers).

Beperking: waar een vertaling anders nummert dan de canon, kan de sprong naar het eerstvolgende vers één vers verschoven uitkomen. In de nu geladen vertalingen komt dit niet voor.

## Besluit: preekweergave is alleen lezen

- Route `/notes/{id}/preek`, alleen voor een **afgeronde** notitie van het type Preek; anders een uitleg met een link terug.
- De weergave leest de notitie en schrijft niets: geen opslaan, geen nieuwe versie, geen statuswijziging.
- De lettergrootte (A−/A+) wordt per apparaat in `localStorage` bewaard, de leesplek en het gekozen gedeelte per tabblad in `sessionStorage`.
- Bijbeltekst naast de preek alleen voor vertalingen met tekstrechten (bestaande regel, afspraak 2). Van HSV/NBV21 tonen we alleen de verwijzing en een externe link.
- "Open in Bijbel" gebruikt `passagePath` met `terug=/notes/{id}/preek`; de lezer biedt dan "Terug naar de preek". `isBackPath` staat alleen een notitie of de preekweergave daarvan toe (geen open redirect).
