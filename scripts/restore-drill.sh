#!/usr/bin/env bash
# BK-007 / AT-16: restores a backup into a brand-new, throw-away local Supabase stack and verifies it.
#
#   scripts/restore-drill.sh <plain backup directory>
#
# Never touches production: it only reads the backup files and writes to a temporary local stack.
# Uses the default local ports, so stop any other local stack first (pnpm db:stop).
set -euo pipefail

BACKUP="$(cd "${1:?gebruik: restore-drill.sh <back-up-map>}" && pwd)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUPABASE="${ROOT}/packages/database/node_modules/.bin/supabase"
DRILL="$(mktemp -d)"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

cleanup() { (cd "${DRILL}" && "${SUPABASE}" stop --no-backup >/dev/null 2>&1) || true; rm -rf "${DRILL}"; }
trap cleanup EXIT

echo "1/4 Schone database starten (zonder migraties)…"
cd "${DRILL}"
"${SUPABASE}" init >/dev/null
sed -i 's/^project_id = .*/project_id = "restore-drill"/' supabase/config.toml
"${SUPABASE}" start -x realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit >/dev/null

echo "2/4 Back-up terugzetten…"
# roles.sql from a hosted project can hold role settings (e.g. log_min_messages) that only
# Supabase's own superuser may set. Those are platform settings, not our data: skip them
# with a warning. Any OTHER error in roles.sql still stops the drill.
roles_log="$(mktemp)"
psql "${DB_URL}" -q -f "${BACKUP}/roles.sql" 2>"${roles_log}" >/dev/null || true
if grep "ERROR" "${roles_log}" | grep -vq "permission denied for parameter"; then
  cat "${roles_log}" >&2; echo "Fout in roles.sql" >&2; exit 1
fi
grep "permission denied for parameter" "${roles_log}" | sed 's/^.*ERROR:/  overgeslagen (platforminstelling):/' || true

psql "${DB_URL}" -q -v ON_ERROR_STOP=1 --single-transaction \
  -f "${ROOT}/scripts/restore-pre.sql" \
  -f "${BACKUP}/schema.sql" \
  -c "set session_replication_role = replica" \
  -f "${BACKUP}/data.sql" >/dev/null

echo "3/4 Controleren…"
fail=0
check() { if [[ "$2" == "$3" ]]; then echo "  ok   $1"; else echo "  FOUT $1: verwacht $3, gevonden $2"; fail=1; fi; }

expected_users=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('auth.users',0))" "${BACKUP}/counts.json")
check "aantal gebruikers" "$(psql "${DB_URL}" -At -c 'select count(*) from auth.users')" "${expected_users}"
check "profiel per gebruiker" "$(psql "${DB_URL}" -At -c 'select count(*) from auth.users u left join public.profiles p on p.user_id = u.id where p.user_id is null')" "0"
check "voorkeuren per gebruiker" "$(psql "${DB_URL}" -At -c 'select count(*) from public.profiles p left join public.user_preferences up using (user_id) where up.user_id is null')" "0"
check "66 Bijbelboeken" "$(psql "${DB_URL}" -At -c 'select count(*) from public.bible_books')" "66"
check "RLS aan op alle tabellen" "$(psql "${DB_URL}" -At -c "select count(*) from pg_tables where schemaname = 'public' and not rowsecurity")" "0"
check "geen rechten voor anonieme bezoekers" "$(psql "${DB_URL}" -At -c "select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'")" "0"

# every public table must hold exactly as many rows as at backup time
for t in $(python3 -c "import json,sys;[print(k) for k in json.load(open(sys.argv[1])) if k.startswith('public.')]" "${BACKUP}/counts.json"); do
  exp=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))[sys.argv[2]])" "${BACKUP}/counts.json" "$t")
  check "rijen in ${t}" "$(psql "${DB_URL}" -At -c "select count(*) from ${t}")" "${exp}"
done

echo "4/4 Opruimen…"
if [[ ${fail} -ne 0 ]]; then echo "HERSTELPROEF MISLUKT"; exit 1; fi
echo "HERSTELPROEF GESLAAGD"
