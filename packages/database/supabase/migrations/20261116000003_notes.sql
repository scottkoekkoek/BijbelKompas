-- 0007 notes (Sprint 3: BK-016, BK-018, BK-021, BK-022, BK-023, BK-024)
--
-- * The document JSON in note_documents is authoritative; note_blocks and passage links are
--   derived from it on every save (CLAUDE.md).
-- * Every personal table has owner_id + RLS. The app can only READ these tables; all writes go
--   through the functions below, so a save (document + blocks + links + optional revision) is
--   atomic and checked against the version it was based on (never silently overwrite).
-- * Revisions are immutable: no UPDATE/DELETE for anyone through the app, and a trigger refuses
--   changes even for direct database sessions. They are created only on: afronden, handmatig,
--   pauze, herstel (afspraak 3) - never on plain autosave.

create table public.notes (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (user_id) on delete cascade,
  title            text not null default '' check (char_length(title) <= 200),
  note_type        text not null default 'vrij'
                   check (note_type in ('preek', 'overdenking', 'bijbelstudie', 'gebed', 'vrij')),
  status           text not null default 'concept' check (status in ('concept', 'afgerond')),
  event_date       date,
  visibility       text not null default 'private' check (visibility = 'private'),
  document_version integer not null default 1 check (document_version >= 1),
  current_revision integer not null default 0 check (current_revision >= 0),
  completed_at     timestamptz,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index notes_owner_updated_idx on public.notes (owner_id, updated_at desc);

create table public.note_documents (
  note_id        uuid primary key references public.notes (id) on delete cascade,
  owner_id       uuid not null references public.profiles (user_id) on delete cascade,
  document_json  jsonb not null check (jsonb_typeof(document_json) = 'object'),
  schema_version integer not null default 1,
  content_hash   text not null,
  updated_at     timestamptz not null default now(),
  check (octet_length(document_json::text) <= 1000000)
);

create table public.note_revisions (
  id              uuid primary key default gen_random_uuid(),
  note_id         uuid not null references public.notes (id) on delete cascade,
  owner_id        uuid not null references public.profiles (user_id) on delete cascade,
  revision_number integer not null check (revision_number >= 1),
  reason          text not null check (reason in ('afronden', 'handmatig', 'pauze', 'herstel')),
  document_json   jsonb not null,
  metadata_json   jsonb not null,
  content_hash    text not null,
  created_by      uuid not null references public.profiles (user_id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (note_id, revision_number)
);

create table public.note_blocks (
  id           uuid primary key default gen_random_uuid(),
  note_id      uuid not null references public.notes (id) on delete cascade,
  owner_id     uuid not null references public.profiles (user_id) on delete cascade,
  block_id     uuid not null,
  block_type   text not null check (char_length(block_type) between 1 and 40),
  plain_text   text not null default '',
  position     integer not null check (position >= 0),
  content_hash text not null,
  updated_at   timestamptz not null default now(),
  unique (note_id, block_id)
);

create table public.passage_links (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (user_id) on delete cascade,
  note_id        uuid not null references public.notes (id) on delete cascade,
  block_id       uuid not null,
  reference_text text not null check (char_length(reference_text) between 1 and 200),
  origin         text not null default 'editor' check (origin in ('editor', 'lezer')),
  created_at     timestamptz not null default now(),
  unique (note_id, block_id)
);

create table public.passage_link_ranges (
  id              uuid primary key default gen_random_uuid(),
  passage_link_id uuid not null references public.passage_links (id) on delete cascade,
  owner_id        uuid not null references public.profiles (user_id) on delete cascade,
  start_verse_id  uuid not null references public.bible_verses (id),
  end_verse_id    uuid not null references public.bible_verses (id),
  start_order     integer not null,
  end_order       integer not null,
  range_order     smallint not null default 0,
  check (start_order <= end_order)
);
create index passage_link_ranges_owner_order_idx on public.passage_link_ranges (owner_id, start_order, end_order);

-- ranges must agree with the canonical verses they name
create or replace function private.check_link_range()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  s integer;
  e integer;
begin
  select canonical_order into s from public.bible_verses where id = new.start_verse_id;
  select canonical_order into e from public.bible_verses where id = new.end_verse_id;
  if s is distinct from new.start_order or e is distinct from new.end_order or s > e then
    raise exception 'invalid passage range' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger passage_link_ranges_check
  before insert or update on public.passage_link_ranges
  for each row execute function private.check_link_range();

-- revisions can never change
create or replace function private.refuse_revision_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'revisions are immutable' using errcode = 'insufficient_privilege';
end;
$$;
create trigger note_revisions_immutable
  before update or delete on public.note_revisions
  for each row
  when (pg_trigger_depth() = 0 and current_setting('bk.allow_revision_cascade', true) is distinct from 'on')
  execute function private.refuse_revision_change();

-- privileges: read-only tables for the app ----------------------------------
revoke all on public.notes, public.note_documents, public.note_revisions, public.note_blocks,
  public.passage_links, public.passage_link_ranges from anon, authenticated;
grant select on public.notes, public.note_documents, public.note_revisions, public.note_blocks,
  public.passage_links, public.passage_link_ranges to authenticated;

alter table public.notes enable row level security;
alter table public.note_documents enable row level security;
alter table public.note_revisions enable row level security;
alter table public.note_blocks enable row level security;
alter table public.passage_links enable row level security;
alter table public.passage_link_ranges enable row level security;

create policy "notes: owner reads" on public.notes
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "note documents: owner reads" on public.note_documents
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "note revisions: owner reads" on public.note_revisions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "note blocks: owner reads" on public.note_blocks
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "passage links: owner reads" on public.passage_links
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "passage ranges: owner reads" on public.passage_link_ranges
  for select to authenticated using (owner_id = (select auth.uid()));

-- write functions -------------------------------------------------------------
-- Errors use SQLSTATE codes the API maps: 'P0001' + message prefix is avoided; we use
--   42501 (not yours / not signed in), 22023 (invalid input), 40001 (version conflict).

create or replace function public.create_note(
  p_title text, p_note_type text, p_event_date date, p_document jsonb, p_content_hash text
) returns public.notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n public.notes;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.notes (owner_id, title, note_type, event_date)
  values (uid, coalesce(p_title, ''), coalesce(p_note_type, 'vrij'), p_event_date)
  returning * into n;
  insert into public.note_documents (note_id, owner_id, document_json, content_hash)
  values (n.id, uid, p_document, p_content_hash);
  return n;
end;
$$;

/**
 * Saves a note. p_blocks: [{block_id, block_type, plain_text, position, content_hash}]
 * p_links: [{block_id, reference_text, origin, translation, book, start_chapter, start_verse,
 *            end_chapter, end_verse}] in the translation's own numbering.
 * p_reason null = autosave (no revision). p_status 'afgerond' completes the note.
 */
create or replace function public.save_note(
  p_note_id uuid, p_base_version integer, p_title text, p_note_type text, p_event_date date,
  p_document jsonb, p_content_hash text, p_blocks jsonb, p_links jsonb,
  p_reason text default null, p_status text default null
) returns public.notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n public.notes;
  d public.note_documents;
  last_hash text;
  last_meta jsonb;
  meta jsonb;
  l jsonb;
  link_id uuid;
  t_id uuid;
  b_id uuid;
  s_order integer;
  e_order integer;
  s_id uuid;
  e_id uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into n from public.notes where id = p_note_id for update;
  if n.id is null or n.owner_id <> uid then raise exception 'note not found' using errcode = '42501'; end if;
  if p_reason is not null and p_reason not in ('afronden', 'handmatig', 'pauze', 'herstel') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('concept', 'afgerond') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  select * into d from public.note_documents where note_id = n.id;

  if p_base_version <> n.document_version then
    -- Idempotent retry: the same content was already stored by an earlier attempt.
    if d.content_hash = p_content_hash and n.title = coalesce(p_title, '') and n.note_type = p_note_type
       and n.event_date is not distinct from p_event_date and p_reason is null and p_status is null then
      return n;
    end if;
    raise exception 'version conflict: base %, current %', p_base_version, n.document_version
      using errcode = '40001';
  end if;

  update public.notes set
    title = coalesce(p_title, ''),
    note_type = p_note_type,
    event_date = p_event_date,
    status = coalesce(p_status, status),
    completed_at = case when p_status = 'afgerond' and status <> 'afgerond' then now()
                        when p_status = 'concept' then null else completed_at end,
    document_version = document_version + 1,
    updated_at = now()
  where id = n.id
  returning * into n;

  update public.note_documents
  set document_json = p_document, content_hash = p_content_hash, updated_at = now()
  where note_id = n.id;

  -- derived blocks
  delete from public.note_blocks where note_id = n.id;
  insert into public.note_blocks (note_id, owner_id, block_id, block_type, plain_text, position, content_hash)
  select n.id, uid, (b->>'block_id')::uuid, b->>'block_type', coalesce(b->>'plain_text', ''),
         (b->>'position')::integer, b->>'content_hash'
  from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) b;

  -- derived passage links (resolved to canonical verses)
  delete from public.passage_links where note_id = n.id;
  for l in select * from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) loop
    select id into t_id from public.bible_translations where code = l->>'translation';
    select b.id into b_id from public.bible_books b
      join public.bible_canons c on c.id = b.canon_id and c.code = 'PROT66'
      where b.book_code = l->>'book';
    if b_id is null then raise exception 'unknown book %', l->>'book' using errcode = '22023'; end if;

    -- through the translation's own numbering when its text exists, else canonical numbering
    select min(v.canonical_order), max(v.canonical_order) into s_order, e_order
    from public.translation_segments s
    join public.verse_mappings m on m.segment_id = s.id
    join public.bible_verses v on v.id = m.canonical_verse_id
    where s.translation_id = t_id
      and s.segment_key like (l->>'book') || '.%'
      and (split_part(s.segment_key, '.', 2)::integer, split_part(s.segment_key, '.', 3)::integer)
          between ((l->>'start_chapter')::integer, (l->>'start_verse')::integer)
              and ((l->>'end_chapter')::integer, (l->>'end_verse')::integer);
    if s_order is null then
      select min(canonical_order), max(canonical_order) into s_order, e_order
      from public.bible_verses
      where book_id = b_id
        and (chapter_number, verse_number)
            between ((l->>'start_chapter')::integer, (l->>'start_verse')::integer)
                and ((l->>'end_chapter')::integer, (l->>'end_verse')::integer);
    end if;
    if s_order is null then
      raise exception 'reference % does not exist', l->>'reference_text' using errcode = '22023';
    end if;
    select id into s_id from public.bible_verses where book_id = b_id and canonical_order = s_order;
    select id into e_id from public.bible_verses where book_id = b_id and canonical_order = e_order;

    insert into public.passage_links (owner_id, note_id, block_id, reference_text, origin)
    values (uid, n.id, (l->>'block_id')::uuid, l->>'reference_text', coalesce(l->>'origin', 'editor'))
    on conflict (note_id, block_id) do update set reference_text = excluded.reference_text
    returning id into link_id;
    delete from public.passage_link_ranges where passage_link_id = link_id;
    insert into public.passage_link_ranges (passage_link_id, owner_id, start_verse_id, end_verse_id, start_order, end_order)
    values (link_id, uid, s_id, e_id, s_order, e_order);
  end loop;

  -- revision only on afronden / handmatig / pauze / herstel, and only when something changed
  if p_reason is not null then
    meta := jsonb_build_object('title', n.title, 'note_type', n.note_type, 'status', n.status,
                               'event_date', n.event_date);
    select content_hash, metadata_json into last_hash, last_meta
    from public.note_revisions where note_id = n.id order by revision_number desc limit 1;
    if last_hash is distinct from p_content_hash or last_meta is distinct from meta or p_reason in ('afronden', 'herstel') then
      update public.notes set current_revision = current_revision + 1 where id = n.id returning * into n;
      insert into public.note_revisions
        (note_id, owner_id, revision_number, reason, document_json, metadata_json, content_hash, created_by)
      values (n.id, uid, n.current_revision, p_reason, p_document, meta, p_content_hash, uid);
    end if;
  end if;

  return n;
end;
$$;

create or replace function public.set_note_archived(p_note_id uuid, p_archived boolean)
returns public.notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.notes;
begin
  update public.notes
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end, updated_at = now()
  where id = p_note_id and owner_id = auth.uid()
  returning * into n;
  if n.id is null then raise exception 'note not found' using errcode = '42501'; end if;
  return n;
end;
$$;

/** Notes linked to verses of one chapter, in the translation's own verse numbers (reader dots). */
create or replace function public.notes_for_chapter(p_translation text, p_book text, p_chapter integer)
returns table (verse_number integer, note_id uuid, title text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct split_part(s.segment_key, '.', 3)::integer, n.id, n.title
  from public.translation_segments s
  join public.bible_translations t on t.id = s.translation_id and t.code = p_translation
  join public.verse_mappings m on m.segment_id = s.id
  join public.bible_verses v on v.id = m.canonical_verse_id
  join public.passage_link_ranges r on v.canonical_order between r.start_order and r.end_order
  join public.passage_links pl on pl.id = r.passage_link_id
  join public.notes n on n.id = pl.note_id and n.archived_at is null
  where s.segment_key like p_book || '.' || p_chapter || '.%'
  order by 1;
$$;

revoke all on function public.create_note(text, text, date, jsonb, text) from public, anon;
revoke all on function public.save_note(uuid, integer, text, text, date, jsonb, text, jsonb, jsonb, text, text) from public, anon;
revoke all on function public.set_note_archived(uuid, boolean) from public, anon;
revoke all on function public.notes_for_chapter(text, text, integer) from public, anon;
grant execute on function public.create_note(text, text, date, jsonb, text) to authenticated;
grant execute on function public.save_note(uuid, integer, text, text, date, jsonb, text, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.set_note_archived(uuid, boolean) to authenticated;
grant execute on function public.notes_for_chapter(text, text, integer) to authenticated;
