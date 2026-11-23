-- Ronde 3 §5: an AI summary saved WITH its source note, as a separate section. Only adds.
-- * The note's own document and its versions never change: the summary lives in its own table.
-- * It is a copy of one outline (ai_outlines), made when the owner chooses "Opslaan bij deze
--   notitie". Saving again replaces it deliberately; deleting removes only the summary.
-- * It records the note version (revision) and text (content hash) it was made from, so the app can
--   show that the note changed afterwards.
-- * Owner only: RLS for reading, and writing only through the two functions below.

create table public.note_summaries (
  note_id         uuid primary key references public.notes (id) on delete cascade,
  owner_id        uuid not null references public.profiles (user_id) on delete cascade,
  outline_id      uuid references public.ai_outlines (id) on delete set null,
  source_revision integer not null check (source_revision >= 0),
  content_hash    text not null,
  summary         text not null check (char_length(summary) between 1 and 2000),
  main_thought    text not null check (char_length(main_thought) between 1 and 500),
  points          jsonb not null default '[]' check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) <= 12),
  application     text not null default '' check (char_length(application) <= 2000),
  model_version   text not null,
  saved_at        timestamptz not null default now()
);
create index note_summaries_owner_idx on public.note_summaries (owner_id);
revoke all on public.note_summaries from anon, authenticated;
grant select on public.note_summaries to authenticated;
alter table public.note_summaries enable row level security;
create policy "note_summaries: owner reads" on public.note_summaries for select to authenticated
  using (owner_id = (select auth.uid()));

/** Saves (or deliberately replaces) the summary of one of the owner's notes from one of its outlines. */
create or replace function public.save_note_summary(p_note_id uuid, p_outline_id uuid)
returns public.note_summaries
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  o public.ai_outlines;
  s public.note_summaries;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into o from public.ai_outlines where id = p_outline_id and owner_id = uid and note_id = p_note_id;
  if o.id is null or not exists (select 1 from public.notes where id = p_note_id and owner_id = uid) then
    raise exception 'outline not found' using errcode = '42501';
  end if;
  insert into public.note_summaries (note_id, owner_id, outline_id, source_revision, content_hash, summary, main_thought, points, application, model_version)
  values (p_note_id, uid, o.id, o.source_revision, o.content_hash, o.summary, o.main_thought, o.points, o.application, o.model_version)
  on conflict (note_id) do update set
    outline_id = excluded.outline_id, source_revision = excluded.source_revision, content_hash = excluded.content_hash,
    summary = excluded.summary, main_thought = excluded.main_thought, points = excluded.points,
    application = excluded.application, model_version = excluded.model_version, saved_at = now()
  where public.note_summaries.owner_id = uid
  returning * into s;
  return s;
end;
$$;

/** Removes the saved summary of one of the owner's notes. The note itself is not touched. */
create or replace function public.delete_note_summary(p_note_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.note_summaries where note_id = p_note_id and owner_id = uid;
  return found;
end;
$$;

revoke all on function public.save_note_summary(uuid, uuid) from public, anon;
revoke all on function public.delete_note_summary(uuid) from public, anon;
grant execute on function public.save_note_summary(uuid, uuid) to authenticated;
grant execute on function public.delete_note_summary(uuid) to authenticated;
