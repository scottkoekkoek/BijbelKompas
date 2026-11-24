-- Ronde 4 (ADR-020), V7 and A3: the reading position remembers the verse, and the "Nog uitwerken"
-- card on Home can be put aside for a few days. Additive only; the previous app keeps working.

-- 1. Reading position on verse level. Null = the start of the chapter (older rows, older app).
alter table public.reading_positions
  add column verse_number smallint check (verse_number is null or verse_number between 1 and 200);
grant update (verse_number) on public.reading_positions to authenticated;

-- 2. "Later" on the Nog-uitwerken card: hidden until this moment, per account.
alter table public.user_preferences add column drafts_snoozed_until timestamptz;
grant update (drafts_snoozed_until) on public.user_preferences to authenticated;
