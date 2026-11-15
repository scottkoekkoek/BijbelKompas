# ADR-000 — Afspraken na review van specificatie 1.0

Status: vastgesteld 15 november 2026 (Scott). Gaat voor op de specificatie waar ze botsen.

1. **Offline-conflicten**: geen samenvoegen per blok. Lokaal opslaan; bij conflict wordt een
   conflictkopie bewaard; nooit stil overschrijven. (Vervangt §14 blokmerge en ADR-006 spec.)
2. **Bijbeltekst**: starten met een rechtenvrije Statenvertaling (bron en licentie eerst
   vastleggen). HSV/NBV21 alleen als verwijzing + link naar externe site. Geen beschermde tekst.
3. **Revisies**: niet bij elke autosave; alleen bij afronden, handmatig opslaan of na een
   pauze in het schrijven.
4. **Gebruikers**: voorlopig één (Scott). Elke persoonlijke tabel heeft een eigenaar + RLS,
   zodat uitbreiden later kan. Geen deelfuncties bouwen.
5. **Vertalingen vergelijken**: canonieke versidentiteit blijft leidend; mapping van
   afwijkende versnummering begint eenvoudig (`exact`, afwijkingen gemarkeerd).
6. **Kosten**: zo lang mogelijk gratis (Supabase Free, Vercel Hobby, GitHub Actions). Eigen
   versleutelde back-up omdat het gratis plan geen back-ups biedt.
7. **Rolverdeling**: Claude bouwt, Scott controleert en keurt goed (via pull requests).

Extra besluiten tijdens Sprint 1:
- Inloggen met e-mail + wachtwoord (geen magic link: mailgrens gratis plan).
- Eén Supabase-project (gratis limiet bereikt): testomgeving = lokale Supabase-stack in CI.
