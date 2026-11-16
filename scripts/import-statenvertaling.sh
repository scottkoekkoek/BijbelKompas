#!/usr/bin/env bash
# Laadt de Statenvertaling (editie 1888, publiek domein) in de database. Zie ADR-005.
# - downloadt de vastgepinde bron en controleert de sha256;
# - zet hem om en controleert hem (66 boeken, nummering zonder gaten, 31.102 canonieke verzen);
# - laadt alles in één transactie. Herhaalbaar, verwijdert niets.
#
# Gebruik: SUPABASE_DB_URL=postgresql://... scripts/import-statenvertaling.sh
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL ontbreekt}"
SOURCE_URL="https://raw.githubusercontent.com/Isidore-Guild/statenvertaling/d39d8ee01ca51f27e3e9c50291a96fc32f49b4d2/STV.xml"
SOURCE_SHA256="4879d8cfa83c20c62c8a85a1a469c1e298e5c6eb40921563fba8ec105f3c03c1"

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf -- "${work:?}"' EXIT

echo "Bron downloaden..."
curl -fsSL --retry 3 -o "${work}/STV.xml" "${SOURCE_URL}"
echo "${SOURCE_SHA256}  ${work}/STV.xml" | sha256sum -c --quiet -
echo "Bron gecontroleerd (sha256 klopt)."

node "${root}/packages/database/scripts/import-statenvertaling.ts" "${work}/STV.xml" "${work}/sv.sql"

echo "Inladen (één transactie)..."
psql "${SUPABASE_DB_URL}" -q -1 -v ON_ERROR_STOP=1 -f "${work}/sv.sql"
echo "Klaar: Statenvertaling staat aan."
