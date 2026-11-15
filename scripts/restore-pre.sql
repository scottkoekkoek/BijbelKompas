-- Run BEFORE schema.sql when restoring into a fresh Supabase project.
-- A fresh project grants every new table to anon/authenticated by default; pg_dump only
-- replays our explicit GRANTs, not our REVOKEs. Without this, a restored database would
-- give anonymous visitors table access that the original never had (found by the restore drill).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
