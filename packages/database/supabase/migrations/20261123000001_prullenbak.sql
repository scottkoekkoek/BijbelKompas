-- Ronde 3 §3: drafts can be thrown away and brought back (prullenbak). Only adds.
-- * Only a draft (status 'concept') can be in the trash; the database refuses a finished one.
-- * Throwing away is a mark (deleted_at), never a delete: text, versions, links, collections and
--   questions all stay, so restoring brings back exactly what was there.
-- * A note in the trash is left out of lists, search, recent notes, passage panels, the timeline
--   and AI sources. Opening it directly still works (to restore it).
-- * Archiving stays a separate action.

alter table public.notes add column deleted_at timestamptz;
alter table public.notes add constraint notes_only_drafts_in_trash check (deleted_at is null or status = 'concept');
create index notes_owner_trash_idx on public.notes (owner_id, deleted_at) where deleted_at is not null;

/** Throws a draft away (p_trashed true) or brings it back. Only the owner; never a finished note. */
create or replace function public.set_note_trashed(p_note_id uuid, p_trashed boolean)
returns public.notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n public.notes;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into n from public.notes where id = p_note_id and owner_id = uid for update;
  if n.id is null then raise exception 'note not found' using errcode = '42501'; end if;
  if p_trashed and n.status <> 'concept' then
    raise exception 'only drafts can be thrown away' using errcode = '22023';
  end if;
  update public.notes
     set deleted_at = case when p_trashed then coalesce(deleted_at, now()) else null end,
         -- a change, so other devices pick it up through the normal sync cursor
         updated_at = now()
   where id = n.id
  returning * into n;
  return n;
end;
$$;
revoke all on function public.set_note_trashed(uuid, boolean) from public, anon;
grant execute on function public.set_note_trashed(uuid, boolean) to authenticated;

-- The read functions that already leave out archived notes now leave out the trash too. Their
-- bodies are taken from the database and only this condition is added, so nothing else about
-- them changes (owner filters, grants and signatures stay as they are). The database test
-- "prullenbak" checks every one of them.
do $$
declare
  f record;
  def text;
begin
  for f in
    select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public'
      and p.proname in ('notes_for_chapter', 'search_notes', 'passage_notes', 'timeline_notes', 'ai_candidates', 'ai_fragments')
  loop
    def := pg_get_functiondef(f.oid);
    def := replace(def, 'n.archived_at is not null', 'n.archived_at is not null and n.deleted_at is null');
    def := replace(def, 'n.archived_at is null', 'n.archived_at is null and n.deleted_at is null');
    def := replace(def, 'o.archived_at is null', 'o.archived_at is null and o.deleted_at is null');
    if position('deleted_at' in def) = 0 then
      raise exception 'prullenbak: % has no archive filter to extend', f.proname;
    end if;
    execute def;
  end loop;
end;
$$;
