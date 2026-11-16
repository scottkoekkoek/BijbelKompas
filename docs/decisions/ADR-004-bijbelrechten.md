# ADR-004 — Bijbelvertalingen en rechten

Status: Sprint 1 deels; bron Statenvertaling: zie ADR-005.

- `bible_translations.rights_status`: `public_domain`, `licensed`, `reference_only`, `test_fixture`.
- De database weigert tekst op te slaan voor `reference_only` en weigert offline/AI-rechten daarop.
- HSV en NBV21 staan erin als `reference_only` met link `https://www.debijbel.nl`
  (exacte link per passage nog te verifiëren in Sprint 2).
- Tekst is alleen zichtbaar voor ingelogde gebruikers, alleen als de vertaling `enabled` is en
  een eventuele licentie niet verlopen is.
- Open: kies voor de Statenvertaling een digitale bron die expliciet publiek domein is; moderne
  spellingsedities van uitgevers kunnen beschermd zijn.
