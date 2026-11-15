# ADR-001 — Hosting op gratis plannen

Status: aanvaard (Sprint 1).

Besluit: Supabase Free (regio Frankfurt) voor database en Auth, Vercel Hobby voor de web-app,
GitHub Actions voor CI, back-up en herstelproef.

Gevolgen en risico's:
- Supabase Free pauzeert een project na 7 dagen zonder activiteit. Data blijft bewaard; hervatten
  via het dashboard (runbook `project-hervatten.md`). De back-up-workflow (2× per week) raakt de
  database regelmatig aan, maar dat is geen garantie.
- Geen downloadbare back-ups op Free → eigen `pg_dump`-back-up (ADR-003).
- Beperkte ingebouwde e-mail → wachtwoordlogin; mail alleen voor herstel.
- 500 MB database: ruim voor tekstnotities.
- Geen SLA. Overstap naar Supabase Pro kan later zonder codewijziging.

Bron: https://supabase.com/docs/guides/platform/free-plan-pausing
