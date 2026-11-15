# Runbook — Back-up terugzetten

Gebruik dit alleen na een echt verlies van data. Overleg eerst; terugzetten op productie is
destructief.

1. Download de laatste back-up: GitHub → Actions → "Back-up productie" → laatste run → artifact.
2. Ontsleutel met je privésleutel:
   `age -d -i sleutel.txt bijbelkompas-<datum>.tar.gz.age | tar -xzf -`
3. Proef eerst lokaal: `pnpm db:stop && scripts/restore-drill.sh bijbelkompas-<datum>`.
4. Terugzetten in een **nieuw, leeg** Supabase-project (nooit over bestaande data heen):
   ```bash
   psql "$NIEUWE_DB_URL" -f roles.sql   # meldingen "permission denied for parameter" mag je negeren
   psql "$NIEUWE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction \
     -f scripts/restore-pre.sql -f schema.sql \
     -c "set session_replication_role = replica" -f data.sql
   ```
5. Markeer de migraties als toegepast (versies staan in `migrations.json`):
   `supabase migration repair --db-url "$NIEUWE_DB_URL" --status applied <versie> …`
6. Zet in Vercel de URL en publishable key op het nieuwe project, deploy opnieuw, log in en controleer.
