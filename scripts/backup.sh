#!/usr/bin/env bash
# BK-007: logical backup of the Supabase database, encrypted with age.
#
#   SUPABASE_DB_URL       connection string (session pooler, percent-encoded)   [required]
#   BACKUP_AGE_RECIPIENT  age public key (age1...) of the owner                  [required unless NO_ENCRYPT=1]
#   OUT_DIR               where to write the result (default ./backups)
#   NO_ENCRYPT=1          leave the plain dump directory (used by the restore drill; never uploaded)
#
# Output: OUT_DIR/bijbelkompas-<UTC timestamp>.tar.gz.age (or a plain directory with NO_ENCRYPT=1)
# Follows Supabase's documented approach: roles, schema and data as separate SQL files.
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL ontbreekt}"
OUT_DIR="${OUT_DIR:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="bijbelkompas-${STAMP}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SB="pnpm --dir ${ROOT}/packages/database exec supabase"

mkdir -p "${OUT_DIR}"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
DIR="${WORK}/${NAME}"
mkdir -p "${DIR}"

echo "Back-up maken: rollen, schema en data…"
${SB} db dump --db-url "${SUPABASE_DB_URL}" --role-only -f "${DIR}/roles.sql"
${SB} db dump --db-url "${SUPABASE_DB_URL}" -f "${DIR}/schema.sql"
${SB} db dump --db-url "${SUPABASE_DB_URL}" --data-only --use-copy -f "${DIR}/data.sql"

# Exact row counts per table, so a restore can be verified (numbers only, no personal content).
psql "${SUPABASE_DB_URL}" -At -v ON_ERROR_STOP=1 -c "
  select coalesce(json_object_agg(t, n order by t), '{}'::json) from (
    select 'auth.users' as t, (select count(*) from auth.users) as n
    union all
    select format('%s.%s', table_schema, table_name),
           (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint
    from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
  ) s;" > "${DIR}/counts.json"
psql "${SUPABASE_DB_URL}" -At -v ON_ERROR_STOP=1 -c "
  select coalesce(json_agg(version order by version), '[]'::json)
  from supabase_migrations.schema_migrations;" > "${DIR}/migrations.json" || echo '[]' > "${DIR}/migrations.json"

for f in roles.sql schema.sql data.sql; do
  test -s "${DIR}/${f}" || { echo "Leeg bestand: ${f}" >&2; exit 1; }
done

if [[ "${NO_ENCRYPT:-0}" == "1" ]]; then
  cp -r "${DIR}" "${OUT_DIR}/"
  echo "Onversleutelde back-up (alleen voor herstelproef): ${OUT_DIR}/${NAME}"
else
  : "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT ontbreekt}"
  tar -C "${WORK}" -czf - "${NAME}" | age -r "${BACKUP_AGE_RECIPIENT}" -o "${OUT_DIR}/${NAME}.tar.gz.age"
  echo "Versleutelde back-up: ${OUT_DIR}/${NAME}.tar.gz.age ($(du -h "${OUT_DIR}/${NAME}.tar.gz.age" | cut -f1))"
fi
