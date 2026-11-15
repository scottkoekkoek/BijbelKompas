# ADR-002 — Gescheiden omgevingen (BK-002)

Status: aanvaard (Sprint 1).

- **Lokaal en CI**: `supabase start` (Docker) met dezelfde migraties en alleen fictieve seed.
  Elke CI-run begint met een lege database. Testgebruikers bestaan alleen hier.
- **Productie**: Supabase-project `bijbelkompas-prod`. Alleen Vercel Production krijgt de
  productie-URL en publishable key. GitHub krijgt alleen `SUPABASE_DB_URL` voor back-up/herstelproef.
- **Previews**: geen productiesleutels. De e2e-setup weigert te draaien tegen iets anders dan localhost.
- De service-role / secret key wordt nergens in de web-app gebruikt.

Waarom geen aparte Supabase-testomgeving: de gratis limiet van twee projecten is bereikt.
