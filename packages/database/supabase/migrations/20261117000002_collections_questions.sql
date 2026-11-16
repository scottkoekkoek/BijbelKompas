-- Sprint 7: collections, research questions and the timeline (BK-047..BK-053, ADR-008).
--
-- * Every table has owner_id + RLS; the owner can only ever see and change their own rows.
-- * A note is never copied into a collection: collection_items only points at it, so the same
--   note can sit in several collections (BK-048).
-- * Like notes and templates, collections and questions are archived, never deleted. The app has
--   no DELETE right at all; unlinking goes through the three checked functions below.
-- * Collections form a tree (parent_id). A trigger refuses cycles and parents of another owner.
-- * Questions are closed only by the owner: there is no automatic status change anywhere (spec §9).
-- * Linked passages of a question store what the owner typed (translation numbering) and, derived
--   from it, the canonical verse range, so they can be found per verse like note links.
-- Nothing existing is changed or deleted.

-- collections ------------------------------------------------------------------------------------
create table public.collections (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  parent_id       uuid references public.collections (id) on delete set null,
  name            text not null check (char_length(btrim(name)) between 1 and 100),
  collection_type text not null default 'dossier'
                  check (collection_type in ('dossier', 'preekserie', 'thema', 'studie')),
  description     text not null default '' check (char_length(description) <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,
  check (parent_id is distinct from id)
);
create index collections_owner_idx on public.collections (owner_id, archived_at, name);
create index collections_parent_idx on public.collections (parent_id);

create table public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  note_id       uuid not null references public.notes (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  position      integer not null default 0 check (position >= 0),
  created_at    timestamptz not null default now(),
  primary key (collection_id, note_id)
);
create index collection_items_owner_note_idx on public.collection_items (owner_id, note_id);

-- owner and creation time never change; the parent must be the owner's and not form a cycle
create or replace function private.check_collection()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cur uuid := new.parent_id;
  depth integer := 0;
  parent_owner uuid;
begin
  if tg_op = 'UPDATE' then
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  if new.parent_id is not null then
    select owner_id into parent_owner from public.collections where id = new.parent_id;
    if parent_owner is distinct from new.owner_id then
      raise exception 'parent collection not found' using errcode = '22023';
    end if;
  end if;
  while cur is not null loop
    if cur = new.id then
      raise exception 'collections may not form a cycle' using errcode = '22023';
    end if;
    depth := depth + 1;
    if depth > 20 then
      raise exception 'collections are nested too deeply' using errcode = '22023';
    end if;
    select parent_id into cur from public.collections where id = cur;
  end loop;
  return new;
end;
$$;
create trigger collections_check
  before insert or update on public.collections
  for each row execute function private.check_collection();

-- an item belongs to the owner of both the collection and the note
create or replace function private.check_collection_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.owner_id := old.owner_id;
    new.collection_id := old.collection_id;
    new.note_id := old.note_id;
    new.created_at := old.created_at;
  end if;
  if not exists (select 1 from public.collections c where c.id = new.collection_id and c.owner_id = new.owner_id)
     or not exists (select 1 from public.notes n where n.id = new.note_id and n.owner_id = new.owner_id) then
    raise exception 'collection or note not found' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger collection_items_check
  before insert or update on public.collection_items
  for each row execute function private.check_collection_item();
revoke all on function private.check_collection(), private.check_collection_item() from public, anon, authenticated;

/** Puts the notes of a collection in the given order (notes not named keep their place after them). */
create or replace function public.reorder_collection(p_collection_id uuid, p_note_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  with wanted as (
    select note_id, row_number() over (order by coalesce(o.ord, 1000000 + i.position), i.position, i.created_at) - 1 as pos
    from public.collection_items i
    left join unnest(p_note_ids) with ordinality as o(id, ord) on o.id = i.note_id
    where i.collection_id = p_collection_id
  )
  update public.collection_items i set position = w.pos
  from wanted w
  where i.collection_id = p_collection_id and i.note_id = w.note_id and i.position is distinct from w.pos;
$$;
revoke all on function public.reorder_collection(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_collection(uuid, uuid[]) to authenticated;

-- research questions -----------------------------------------------------------------------------
create table public.questions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  status      text not null default 'open' check (status in ('open', 'in_onderzoek', 'beantwoord', 'gearchiveerd')),
  answer      text not null default '' check (char_length(answer) <= 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index questions_owner_idx on public.questions (owner_id, status, updated_at desc);

-- resolved_at follows the status the owner chose; owner and creation time never change
create or replace function private.touch_question()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  if new.status = 'beantwoord' then
    new.resolved_at := case when tg_op = 'UPDATE' and old.status = 'beantwoord' then old.resolved_at else now() end;
  elsif new.status <> 'gearchiveerd' then
    new.resolved_at := null;
  elsif tg_op = 'UPDATE' then
    new.resolved_at := old.resolved_at;
  else
    new.resolved_at := null;
  end if;
  return new;
end;
$$;
create trigger questions_touch
  before insert or update on public.questions
  for each row execute function private.touch_question();

create table public.question_notes (
  question_id uuid not null references public.questions (id) on delete cascade,
  note_id     uuid not null references public.notes (id) on delete cascade,
  owner_id    uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (question_id, note_id)
);
create index question_notes_owner_note_idx on public.question_notes (owner_id, note_id);

create or replace function private.check_question_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.questions q where q.id = new.question_id and q.owner_id = new.owner_id)
     or not exists (select 1 from public.notes n where n.id = new.note_id and n.owner_id = new.owner_id) then
    raise exception 'question or note not found' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger question_notes_check
  before insert or update on public.question_notes
  for each row execute function private.check_question_note();

create table public.question_passages (
  id            uuid primary key default gen_random_uuid(),
  question_id   uuid not null references public.questions (id) on delete cascade,
  owner_id      uuid not null references public.profiles (user_id) on delete cascade,
  label         text not null check (char_length(label) between 1 and 200),
  translation   text not null check (char_length(translation) between 1 and 20),
  book          text not null check (char_length(book) between 2 and 10),
  start_chapter integer not null check (start_chapter >= 1),
  start_verse   integer not null check (start_verse >= 0),
  end_chapter   integer not null check (end_chapter >= 1),
  end_verse     integer not null check (end_verse >= 0),
  start_order   integer not null,
  end_order     integer not null,
  created_at    timestamptz not null default now(),
  check (start_order <= end_order),
  unique (question_id, translation, book, start_chapter, start_verse, end_chapter, end_verse)
);
create index question_passages_owner_order_idx on public.question_passages (owner_id, start_order, end_order);
revoke all on function private.check_question_note(), private.touch_question() from public, anon, authenticated;

/**
 * Canonical verse range of a passage in a translation's own numbering (the same rules as save_note):
 * through that translation's text when it exists, otherwise the canonical numbering. Null if absent.
 */
create or replace function private.resolve_passage(
  p_translation text, p_book text, p_sc integer, p_sv integer, p_ec integer, p_ev integer,
  out s_order integer, out e_order integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  b_id uuid;
begin
  select b.id into b_id from public.bible_books b
    join public.bible_canons c on c.id = b.canon_id and c.code = 'PROT66'
    where b.book_code = p_book;
  if b_id is null then return; end if;
  select min(v.canonical_order), max(v.canonical_order) into s_order, e_order
  from public.translation_segments s
  join public.bible_translations t on t.id = s.translation_id and t.code = p_translation
  join public.verse_mappings m on m.segment_id = s.id
  join public.bible_verses v on v.id = m.canonical_verse_id
  where s.segment_key like p_book || '.%'
    and (split_part(s.segment_key, '.', 2)::integer, split_part(s.segment_key, '.', 3)::integer)
        between (p_sc, p_sv) and (p_ec, p_ev);
  if s_order is null then
    select min(canonical_order), max(canonical_order) into s_order, e_order
    from public.bible_verses
    where book_id = b_id and (chapter_number, verse_number) between (p_sc, p_sv) and (p_ec, p_ev);
  end if;
end;
$$;
revoke all on function private.resolve_passage(text, text, integer, integer, integer, integer) from public, anon, authenticated;

/** BK-050: links a passage to one of the owner's questions. Linking the same passage twice is a no-op. */
create or replace function public.add_question_passage(p_question_id uuid, p_passage jsonb)
returns public.question_passages
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r record;
  row public.question_passages;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.questions where id = p_question_id and owner_id = uid) then
    raise exception 'question not found' using errcode = '42501';
  end if;
  if jsonb_typeof(p_passage) <> 'object' then raise exception 'invalid passage' using errcode = '22023'; end if;
  if (select count(*) from public.question_passages where question_id = p_question_id) >= 50 then
    raise exception 'too many passages' using errcode = '22023';
  end if;
  select * into r from private.resolve_passage(
    p_passage->>'translation', p_passage->>'book',
    (p_passage->>'startChapter')::integer, (p_passage->>'startVerse')::integer,
    (p_passage->>'endChapter')::integer, (p_passage->>'endVerse')::integer);
  if r.s_order is null then
    raise exception 'reference does not exist' using errcode = '22023';
  end if;
  insert into public.question_passages
    (question_id, owner_id, label, translation, book, start_chapter, start_verse, end_chapter, end_verse, start_order, end_order)
  values (p_question_id, uid, left(p_passage->>'label', 200), p_passage->>'translation', p_passage->>'book',
          (p_passage->>'startChapter')::integer, (p_passage->>'startVerse')::integer,
          (p_passage->>'endChapter')::integer, (p_passage->>'endVerse')::integer, r.s_order, r.e_order)
  on conflict (question_id, translation, book, start_chapter, start_verse, end_chapter, end_verse) do nothing
  returning * into row;
  update public.questions set updated_at = now() where id = p_question_id;
  return row;
end;
$$;
revoke all on function public.add_question_passage(uuid, jsonb) from public, anon;
grant execute on function public.add_question_passage(uuid, jsonb) to authenticated;

/** BK-050: the owner's questions linked to a verse range (shown in the Bible reader). Definer, but
 * filtered on auth.uid() before anything is returned, like search_notes. */
create or replace function public.passage_questions(
  p_translation text, p_book text, p_chapter integer, p_start_verse integer, p_end_verse integer
) returns table (question_id uuid, title text, status text, label text)
language sql
stable
security definer
set search_path = ''
as $$
  with wanted as (
    select r.s_order s, r.e_order e
    from private.resolve_passage(p_translation, p_book, p_chapter, p_start_verse, p_chapter, p_end_verse) r
  )
  select distinct on (q.id) q.id, q.title, q.status, p.label
  from wanted w
  join public.question_passages p on p.start_order <= w.e and p.end_order >= w.s
  join public.questions q on q.id = p.question_id
  where q.owner_id = (select auth.uid()) and p.owner_id = (select auth.uid()) and q.status <> 'gearchiveerd'
  order by q.id, p.created_at
  limit 100;
$$;
revoke all on function public.passage_questions(text, text, integer, integer, integer) from public, anon;
grant execute on function public.passage_questions(text, text, integer, integer, integer) to authenticated;

-- timeline -----------------------------------------------------------------------------------------
/**
 * BK-052/053: the owner's notes in time order. Sorted on the event date (what the note is about);
 * created_at and updated_at are returned separately. A note without an event date sorts on the day
 * it was created, and says so (has_event_date = false). p_collection includes its subcollections.
 */
create or replace function public.timeline_notes(
  p_from date default null,
  p_to date default null,
  p_type text default null,
  p_status text default null,
  p_speaker text default null,
  p_book text default null,
  p_collection uuid default null,
  p_limit integer default 200
) returns table (
  note_id uuid, title text, note_type text, status text, event_date date, has_event_date boolean,
  created_at timestamptz, updated_at timestamptz, speaker text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive tree as (
    select c.id from public.collections c where c.id = p_collection
    union
    select c.id from public.collections c join tree t on c.parent_id = t.id
  )
  select n.id, n.title, n.note_type, n.status, coalesce(n.event_date, n.created_at::date), n.event_date is not null,
         n.created_at, n.updated_at, s.name
  from public.notes n
  left join public.sermon_details d on d.note_id = n.id
  left join public.speakers s on s.id = d.speaker_id
  where n.archived_at is null
    and (p_type is null or n.note_type = p_type)
    and (p_status is null or n.status = p_status)
    and (p_from is null or coalesce(n.event_date, n.created_at::date) >= p_from)
    and (p_to is null or coalesce(n.event_date, n.created_at::date) <= p_to)
    and (p_speaker is null or s.normalized_name = lower(btrim(p_speaker)))
    and (p_book is null or exists (
      select 1 from public.passage_links pl
      join public.passage_link_ranges r on r.passage_link_id = pl.id
      join public.bible_verses v on v.id = r.start_verse_id
      join public.bible_books b on b.id = v.book_id
      where pl.note_id = n.id and b.book_code = p_book))
    and (p_collection is null or exists (
      select 1 from public.collection_items i join tree t on t.id = i.collection_id where i.note_id = n.id))
  order by coalesce(n.event_date, n.created_at::date) desc, n.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;
revoke all on function public.timeline_notes(date, date, text, text, text, text, uuid, integer) from public, anon;
grant execute on function public.timeline_notes(date, date, text, text, text, text, uuid, integer) to authenticated;

-- unlinking (the only removals; each checks the owner) ---------------------------------------------
create or replace function public.remove_collection_item(p_collection_id uuid, p_note_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.collection_items
    where collection_id = p_collection_id and note_id = p_note_id and owner_id = (select auth.uid())
    returning 1
  )
  select exists (select 1 from gone);
$$;

create or replace function public.unlink_question_note(p_question_id uuid, p_note_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.question_notes
    where question_id = p_question_id and note_id = p_note_id and owner_id = (select auth.uid())
    returning 1
  )
  select exists (select 1 from gone);
$$;

create or replace function public.remove_question_passage(p_question_id uuid, p_passage_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.question_passages
    where id = p_passage_id and question_id = p_question_id and owner_id = (select auth.uid())
    returning 1
  )
  select exists (select 1 from gone);
$$;
revoke all on function public.remove_collection_item(uuid, uuid), public.unlink_question_note(uuid, uuid),
  public.remove_question_passage(uuid, uuid) from public, anon;
grant execute on function public.remove_collection_item(uuid, uuid), public.unlink_question_note(uuid, uuid),
  public.remove_question_passage(uuid, uuid) to authenticated;

-- privileges ---------------------------------------------------------------------------------------
revoke all on public.collections, public.collection_items, public.questions, public.question_notes,
  public.question_passages from anon, authenticated;
grant select on public.collections, public.collection_items, public.questions, public.question_notes,
  public.question_passages to authenticated;
grant insert (name, collection_type, description, parent_id) on public.collections to authenticated;
grant update (name, collection_type, description, parent_id, archived_at) on public.collections to authenticated;
grant insert (collection_id, note_id, position) on public.collection_items to authenticated;
grant update (position) on public.collection_items to authenticated;
grant insert (title, description, status, answer) on public.questions to authenticated;
grant update (title, description, status, answer) on public.questions to authenticated;
grant insert (question_id, note_id) on public.question_notes to authenticated;
-- question_passages: inserted only through add_question_passage (it resolves the verses)

alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.questions enable row level security;
alter table public.question_notes enable row level security;
alter table public.question_passages enable row level security;

create policy "collections: owner reads" on public.collections
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "collections: owner inserts" on public.collections
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "collections: owner updates" on public.collections
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "collection items: owner reads" on public.collection_items
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "collection items: owner inserts" on public.collection_items
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "collection items: owner updates" on public.collection_items
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "questions: owner reads" on public.questions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "questions: owner inserts" on public.questions
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "questions: owner updates" on public.questions
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "question notes: owner reads" on public.question_notes
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "question notes: owner inserts" on public.question_notes
  for insert to authenticated with check (owner_id = (select auth.uid()));

create policy "question passages: owner reads" on public.question_passages
  for select to authenticated using (owner_id = (select auth.uid()));
