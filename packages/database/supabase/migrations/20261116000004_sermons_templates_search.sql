-- 0008 sermon details, templates and keyword search (Sprint 4: BK-019, BK-020, BK-034, BK-035, BK-038)
--
-- * Every personal table has owner_id + RLS.
-- * Sermon details are saved through save_note, so they share its version check (never silently
--   overwrite) and are part of every revision's metadata.
-- * Templates are only a starting structure: changing a template never changes existing notes.
-- * Search indexes are derived (generated columns / expression indexes); the document JSON stays
--   authoritative. Keyword search needs no AI and costs nothing.

-- sermon metadata ---------------------------------------------------------------
create table public.speakers (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (user_id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  normalized_name text generated always as (lower(btrim(name))) stored,
  notes           text check (char_length(notes) <= 1000),
  created_at      timestamptz not null default now(),
  unique (owner_id, normalized_name)
);

create table public.organizations (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (user_id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  normalized_name text generated always as (lower(btrim(name))) stored,
  location        text check (char_length(location) <= 120),
  created_at      timestamptz not null default now(),
  unique (owner_id, normalized_name)
);

-- A simple list of series names for now; may later become a collection of type 'preekserie'.
create table public.sermon_series (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (user_id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  normalized_name text generated always as (lower(btrim(name))) stored,
  created_at      timestamptz not null default now(),
  unique (owner_id, normalized_name)
);

create table public.sermon_details (
  note_id         uuid primary key references public.notes (id) on delete cascade,
  owner_id        uuid not null references public.profiles (user_id) on delete cascade,
  speaker_id      uuid references public.speakers (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  series_id       uuid references public.sermon_series (id) on delete set null,
  service_type    text check (char_length(service_type) between 1 and 60),
  updated_at      timestamptz not null default now()
);
create index sermon_details_speaker_idx on public.sermon_details (owner_id, speaker_id);

-- details may only point at the owner's own speakers / organizations / series
create or replace function private.check_sermon_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select owner_id from public.notes where id = new.note_id) is distinct from new.owner_id
     or (new.speaker_id is not null and (select owner_id from public.speakers where id = new.speaker_id) is distinct from new.owner_id)
     or (new.organization_id is not null and (select owner_id from public.organizations where id = new.organization_id) is distinct from new.owner_id)
     or (new.series_id is not null and (select owner_id from public.sermon_series where id = new.series_id) is distinct from new.owner_id)
  then
    raise exception 'sermon details must belong to one owner' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger sermon_details_owner
  before insert or update on public.sermon_details
  for each row execute function private.check_sermon_owner();

-- {speaker, organization, series, service_type}: trimmed, empty -> null, length-checked
create or replace function private.clean_sermon(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  r jsonb := '{}'::jsonb;
  k text;
  v text;
begin
  foreach k in array array['speaker', 'organization', 'series', 'service_type'] loop
    if p ? k and jsonb_typeof(p -> k) not in ('string', 'null') then
      raise exception 'invalid sermon field %', k using errcode = '22023';
    end if;
    v := nullif(btrim(p ->> k), '');
    if char_length(v) > (case when k = 'service_type' then 60 else 120 end) then
      raise exception 'sermon field % too long', k using errcode = '22023';
    end if;
    r := r || jsonb_build_object(k, v);
  end loop;
  return r;
end;
$$;

create or replace function private.sermon_json(p_note_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'speaker', (select s.name from public.speakers s where s.id = d.speaker_id),
    'organization', (select o.name from public.organizations o where o.id = d.organization_id),
    'series', (select r.name from public.sermon_series r where r.id = d.series_id),
    'service_type', d.service_type)
  from (select 1) one
  left join public.sermon_details d on d.note_id = p_note_id;
$$;

-- names are matched case-insensitively and created on first use
create or replace function private.store_sermon(p_note_id uuid, p_owner uuid, p jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  c jsonb := private.clean_sermon(p);
  sp uuid;
  org uuid;
  ser uuid;
begin
  if c ->> 'speaker' is not null then
    insert into public.speakers (owner_id, name) values (p_owner, c ->> 'speaker')
    on conflict (owner_id, normalized_name) do update set name = public.speakers.name
    returning id into sp;
  end if;
  if c ->> 'organization' is not null then
    insert into public.organizations (owner_id, name) values (p_owner, c ->> 'organization')
    on conflict (owner_id, normalized_name) do update set name = public.organizations.name
    returning id into org;
  end if;
  if c ->> 'series' is not null then
    insert into public.sermon_series (owner_id, name) values (p_owner, c ->> 'series')
    on conflict (owner_id, normalized_name) do update set name = public.sermon_series.name
    returning id into ser;
  end if;
  insert into public.sermon_details (note_id, owner_id, speaker_id, organization_id, series_id, service_type, updated_at)
  values (p_note_id, p_owner, sp, org, ser, c ->> 'service_type', now())
  on conflict (note_id) do update set
    speaker_id = excluded.speaker_id, organization_id = excluded.organization_id,
    series_id = excluded.series_id, service_type = excluded.service_type, updated_at = now();
end;
$$;

-- save_note gains p_sermon (the old signature is replaced, not overloaded)
drop function public.save_note(uuid, integer, text, text, date, jsonb, text, jsonb, jsonb, text, text);

/**
 * Saves a note. p_blocks: [{block_id, block_type, plain_text, position, content_hash}]
 * p_links: [{block_id, reference_text, origin, translation, book, start_chapter, start_verse,
 *            end_chapter, end_verse}] in the translation's own numbering.
 * p_reason null = autosave (no revision). p_status 'afgerond' completes the note.
 * p_sermon (Sprint 4) {speaker, organization, series, service_type} as names; null = leave as is.
 */
create or replace function public.save_note(
  p_note_id uuid, p_base_version integer, p_title text, p_note_type text, p_event_date date,
  p_document jsonb, p_content_hash text, p_blocks jsonb, p_links jsonb,
  p_reason text default null, p_status text default null, p_sermon jsonb default null
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
  if p_sermon is not null and jsonb_typeof(p_sermon) <> 'object' then
    raise exception 'invalid sermon details' using errcode = '22023';
  end if;
  select * into d from public.note_documents where note_id = n.id;

  if p_base_version <> n.document_version then
    -- Idempotent retry: the same content was already stored by an earlier attempt.
    if d.content_hash = p_content_hash and n.title = coalesce(p_title, '') and n.note_type = p_note_type
       and n.event_date is not distinct from p_event_date and p_reason is null and p_status is null
       and (p_sermon is null or private.sermon_json(n.id) = private.clean_sermon(p_sermon)) then
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

  if p_sermon is not null then
    perform private.store_sermon(n.id, uid, p_sermon);
  end if;

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
                               'event_date', n.event_date, 'sermon', private.sermon_json(n.id));
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

revoke all on function public.save_note(uuid, integer, text, text, date, jsonb, text, jsonb, jsonb, text, text, jsonb) from public, anon;
grant execute on function public.save_note(uuid, integer, text, text, date, jsonb, text, jsonb, jsonb, text, text, jsonb) to authenticated;
revoke all on function private.clean_sermon(jsonb), private.sermon_json(uuid), private.store_sermon(uuid, uuid, jsonb) from public, anon, authenticated;

-- templates -------------------------------------------------------------------------
-- template_json: {"parts": [{"kind": "kop"|"alinea"|"citaat"|"bijbelverwijzing"|"vraag"|"toepassing"|"gebed", "text": "..."}]}
create or replace function private.valid_template(t jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(t) = 'object'
     and jsonb_typeof(t -> 'parts') = 'array'
     and jsonb_array_length(t -> 'parts') between 1 and 50
     and not exists (
       select 1 from jsonb_array_elements(t -> 'parts') p
       where jsonb_typeof(p) <> 'object'
          or not (p ->> 'kind') = any (array['kop', 'alinea', 'citaat', 'bijbelverwijzing', 'vraag', 'toepassing', 'gebed'])
          or jsonb_typeof(coalesce(p -> 'text', '""'::jsonb)) <> 'string'
          or char_length(coalesce(p ->> 'text', '')) > 500
     );
$$;

create table public.note_templates (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 100),
  note_type        text not null default 'vrij'
                   check (note_type in ('preek', 'overdenking', 'bijbelstudie', 'gebed', 'vrij')),
  description      text not null default '' check (char_length(description) <= 500),
  template_json    jsonb not null check (private.valid_template(template_json)),
  template_version integer not null default 1 check (template_version >= 1),
  is_default       boolean not null default false,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index note_templates_owner_idx on public.note_templates (owner_id, archived_at, name);
create unique index note_templates_one_default_idx on public.note_templates (owner_id, note_type)
  where is_default and archived_at is null;

-- every content change bumps the version; owner and creation time can never change
create or replace function private.touch_template()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.template_json is distinct from old.template_json or new.name is distinct from old.name
     or new.note_type is distinct from old.note_type or new.description is distinct from old.description then
    new.template_version := old.template_version + 1;
  else
    new.template_version := old.template_version;
  end if;
  return new;
end;
$$;
create trigger note_templates_touch
  before update on public.note_templates
  for each row execute function private.touch_template();

-- privileges -------------------------------------------------------------------------
revoke all on public.speakers, public.organizations, public.sermon_series, public.sermon_details,
  public.note_templates from anon, authenticated;
grant select on public.speakers, public.organizations, public.sermon_series, public.sermon_details to authenticated;
grant select on public.note_templates to authenticated;  -- no deletes: templates are archived
grant insert (owner_id, name, note_type, description, template_json, is_default) on public.note_templates to authenticated;
grant update (name, note_type, description, template_json, is_default, archived_at) on public.note_templates to authenticated;

alter table public.speakers enable row level security;
alter table public.organizations enable row level security;
alter table public.sermon_series enable row level security;
alter table public.sermon_details enable row level security;
alter table public.note_templates enable row level security;

create policy "speakers: owner reads" on public.speakers
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "organizations: owner reads" on public.organizations
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "sermon series: owner reads" on public.sermon_series
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "sermon details: owner reads" on public.sermon_details
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "templates: owner reads" on public.note_templates
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "templates: owner inserts" on public.note_templates
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "templates: owner updates" on public.note_templates
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- keyword search ----------------------------------------------------------------------
alter table public.note_blocks
  add column search_vector tsvector generated always as (to_tsvector('dutch'::regconfig, plain_text)) stored;
create index note_blocks_search_idx on public.note_blocks using gin (search_vector);
create index notes_title_search_idx on public.notes using gin (to_tsvector('dutch'::regconfig, title));
create index translation_segments_search_idx on public.translation_segments
  using gin (to_tsvector('dutch'::regconfig, text));

-- 'herder lam' -> 'herder':* & 'lam':*  (prefix match per word; only letters and digits survive,
-- so user input can never change the query syntax). Null when nothing searchable remains.
create or replace function private.search_query(p text)
returns tsquery
language sql
immutable
set search_path = ''
as $$
  select case when count(*) = 0 then null
              else to_tsquery('dutch'::regconfig, string_agg(quote_literal(w) || ':*', ' & ')) end
  from (
    select w from regexp_split_to_table(lower(left(coalesce(p, ''), 200)), '[^[:alnum:]]+') w
    where w <> '' limit 8
  ) words;
$$;

/**
 * One result per note: the best matching block (or the title), newest event first within equal rank.
 * Highlights are marked with U+0001 / U+0002 so the app can render them without trusting HTML.
 * security definer (it uses private helpers), so the owner filter below is explicit and comes
 * before any ranking: only the signed-in owner's notes are ever searched.
 */
create or replace function public.search_notes(
  p_query text,
  p_type text default null,
  p_status text default null,
  p_from date default null,
  p_to date default null,
  p_book text default null,
  p_speaker text default null,
  p_archived boolean default false,
  p_limit integer default 50
) returns table (
  note_id uuid, title text, note_type text, status text, event_date date, updated_at timestamptz,
  block_id uuid, snippet text, rank real
)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (select private.search_query(p_query) as tsq),
  mine as (
    select n.* from public.notes n
    where n.owner_id = (select auth.uid())
      and (case when p_archived then n.archived_at is not null else n.archived_at is null end)
      and (p_type is null or n.note_type = p_type)
      and (p_status is null or n.status = p_status)
      and (p_from is null or coalesce(n.event_date, n.created_at::date) >= p_from)
      and (p_to is null or coalesce(n.event_date, n.created_at::date) <= p_to)
      and (p_book is null or exists (
        select 1 from public.passage_links pl
        join public.passage_link_ranges r on r.passage_link_id = pl.id
        join public.bible_verses v on v.id = r.start_verse_id
        join public.bible_books b on b.id = v.book_id
        where pl.note_id = n.id and b.book_code = p_book))
      and (p_speaker is null or exists (
        select 1 from public.sermon_details d join public.speakers s on s.id = d.speaker_id
        where d.note_id = n.id and s.normalized_name = lower(btrim(p_speaker))))
  ),
  hits as (
    select m.id as note_id, b.block_id, b.position,
           ts_rank(b.search_vector, q.tsq) as rank,
           ts_headline('dutch'::regconfig, b.plain_text, q.tsq,
             'StartSel=' || chr(1) || ', StopSel=' || chr(2) || ', MaxWords=30, MinWords=12, MaxFragments=1') as snippet
    from mine m
    join public.note_blocks b on b.note_id = m.id
    cross join q
    where b.search_vector @@ q.tsq
    union all
    select m.id, null::uuid, -1,
           ts_rank(to_tsvector('dutch'::regconfig, m.title), q.tsq) * 2,
           ts_headline('dutch'::regconfig, m.title, q.tsq, 'StartSel=' || chr(1) || ', StopSel=' || chr(2) || ', HighlightAll=true')
    from mine m cross join q
    where to_tsvector('dutch'::regconfig, m.title) @@ q.tsq
  ),
  best as (
    select distinct on (note_id) note_id, block_id, snippet, rank,
           sum(rank) over (partition by note_id) as total
    from hits
    order by note_id, (block_id is null), rank desc, position
  )
  select m.id, m.title, m.note_type, m.status, m.event_date, m.updated_at, best.block_id,
         case when best.block_id is null then '' else best.snippet end, best.total::real
  from best join mine m on m.id = best.note_id
  order by best.total desc, m.updated_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

/** Verses of one translation that contain the words; only translations whose text may be shown. */
create or replace function public.search_bible(p_translation text, p_query text, p_limit integer default 50)
returns table (segment_key text, book_code text, book_name text, chapter integer, verse integer, snippet text, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (select private.search_query(p_query) as tsq),
  t as (
    select id from public.bible_translations
    where code = p_translation and enabled and rights_status <> 'reference_only'
  ),
  found as (
    select s.segment_key, s.text, s.display_order, count(*) over () as total
    from public.translation_segments s, q, t
    where s.translation_id = t.id
      and to_tsvector('dutch'::regconfig, s.text) @@ q.tsq
  )
  select f.segment_key, b.book_code, b.name, split_part(f.segment_key, '.', 2)::integer,
         split_part(f.segment_key, '.', 3)::integer,
         ts_headline('dutch'::regconfig, f.text, q.tsq,
           'StartSel=' || chr(1) || ', StopSel=' || chr(2) || ', HighlightAll=true'),
         f.total
  from found f
  cross join q
  join public.bible_books b on b.book_code = split_part(f.segment_key, '.', 1)
  join public.bible_canons c on c.id = b.canon_id and c.code = 'PROT66'
  order by b.book_order, f.display_order
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke all on function private.search_query(text) from public, anon, authenticated;
revoke all on function public.search_notes(text, text, text, date, date, text, text, boolean, integer) from public, anon;
grant execute on function public.search_notes(text, text, text, date, date, text, text, boolean, integer) to authenticated;
revoke all on function public.search_bible(text, text, integer) from public, anon;
grant execute on function public.search_bible(text, text, integer) to authenticated;
