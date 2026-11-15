# ADR-003 — Back-up en herstel (BK-007)

Status: aanvaard (Sprint 1). RPO ≈ 3–4 dagen, RTO ≈ 1 uur (handmatig).

- `scripts/backup.sh`: rollen, schema en data via `supabase db dump`, plus exacte rijtellingen.
  Versleuteld met `age` naar Scotts publieke sleutel. GitHub bewaart 90 dagen.
- De privésleutel staat alleen in Scotts wachtwoordmanager. Kwijt = back-ups onleesbaar.
- `scripts/restore-drill.sh`: zet een back-up terug in een verse lokale Supabase-stack en
  controleert gebruikers, profielen, rijtellingen, RLS en rechten. Draait bij elke CI-run (lokale
  data) en maandelijks tegen een verse dump van productie.
- Gevonden bij de eerste proef: een verse Supabase-database geeft nieuwe tabellen standaard aan
  `anon`; de dump herhaalt alleen GRANTs. `scripts/restore-pre.sql` voorkomt dat.
- Data-dump beperkt tot `public` en `auth` (migratiehistorie staat in `migrations.json`). Het `storage`-schema valt erbuiten:
  de app slaat (nog) geen bestanden op, en de tabelindeling van dat schema verschilt per
  Supabase-versie, waardoor terugzetten mislukte (`storage.bucket_lifecycle_states`). Opnieuw
  bekijken zodra de app bestanden gaat opslaan.
- Rolinstellingen die alleen Supabase zelf mag zetten (bijv. `log_min_messages`) worden bij
  terugzetten overgeslagen.
