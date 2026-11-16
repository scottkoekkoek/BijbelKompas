# ADR-005 — Bron van de Statenvertaling

Status: voorgesteld in Sprint 2, nog goed te keuren door Scott vóór het inladen in productie.

## Besluit

- **Tekst:** Statenvertaling, editie 1888. Een tekst van 1637/1888 is ruim buiten elke
  auteursrechttermijn en dus publiek domein.
- **Digitale bron:** [Isidore-Guild/statenvertaling](https://github.com/Isidore-Guild/statenvertaling),
  bestand `STV.xml` (OSIS). De transcriptie zelf staat onder **CC0 1.0** (bestand `LICENSE` in
  die repository); de module-instellingen noemen `DistributionLicense=Public Domain`.
- **Vastgepind:** commit `d39d8ee01ca51f27e3e9c50291a96fc32f49b4d2`,
  sha256 `4879d8cfa83c20c62c8a85a1a469c1e298e5c6eb40921563fba8ec105f3c03c1`. Het import-script
  weigert een bestand dat afwijkt.
- **Alleen de verstekst.** Voetnoten (kanttekeningen), Strong-nummers en hoofdstukkoppen nemen we
  niet over. De koppen zijn volgens de README overgenomen uit de SWORD-module en horen niet bij de
  tekst van 1888.
- **Rechten in de database:** `rights_status = public_domain`, `offline_allowed = true`,
  `ai_processing_allowed = false` (AI is pas later aan de orde en vraagt dan een eigen besluit).
  Bronvermelding staat in `attribution` en verschijnt onder elk hoofdstuk.

## Overwogen

- **CrossWire SWORD-module DutSVV** (label "Public Domain"): zelfde tekstfamilie, maar de
  download is vanuit onze bouwomgeving niet bereikbaar en het formaat (gecomprimeerde SWORD-module)
  is lastiger te controleren. De gekozen OSIS-bron is volgens haar README een herbouw daarvan.
- **eBible.org:** heeft geen Statenvertaling.
- **HSV/NBV21:** blijven `reference_only` (afspraak 2): alleen een link, nooit tekst.

## Versnummering (afspraak 5, BK-015)

- `bible_verses` bevat 31.102 canonieke verzen in de gangbare (KJV-achtige) nummering. Alleen
  aantallen, geen tekst.
- De bron gebruikt die nummering in de `osisID`'s en zet de eigen nummering van de Statenvertaling
  ertussen als `[05:24]`. Wij bewaren de **eigen nummering** als `segment_key` (zo lees je het), en
  koppelen elk vers via `verse_mappings` aan het canonieke vers:
  - `exact`: één op één (ook als het nummer verschilt, zoals Exodus 5:24 = canoniek 6:1);
  - `partial`: een canoniek vers bevat meer Statenvertaling-verzen (Psalm-opschriften) of een
    vers loopt over een grens heen (Psalm 13:6).
- Resultaat: 31.174 verzen, 143 gedeeltelijke koppelingen.
- Eén bekende typefout in de bron wordt in het script expliciet hersteld: bij Psalm 84 staat
  `[086:7]` waar `[084:7]` bedoeld is. Het script faalt als die fout er niet meer staat.

## Controles bij het inladen

66 boeken, aantal hoofdstukken gelijk aan de canon, nummering per boek zonder gaten en oplopend,
geen lege verzen, alle 31.102 canonieke verzen gedekt. Inladen gebeurt in één transactie en is
herhaalbaar (er wordt niets verwijderd). In productie alleen via de handmatige workflow
"Statenvertaling inladen (productie)".
