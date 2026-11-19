-- Sprint 9: comparing translations, highlights, offline Bible text (BK-011, BK-013, BK-014; AT-09; ADR-010).
-- Only adds. Nothing existing is changed or deleted.

-- comparing two translations ---------------------------------------------------------------------
/**
 * BK-011 / AT-09: chapter p_chapter of translation p_a, verse by verse, with the text of p_b that
 * covers the same canonical verses. The two may number verses differently, so p_b can return
 * several segments (or one segment for several rows). `uncertain` marks every row where the match
 * is not one-to-one or a mapping is not 'exact'. Security invoker: RLS decides which text is
 * readable, so a reference-only translation never returns text.
 */
create or replace function public.compare_chapter(p_a text, p_b text, p_book text, p_chapter integer)
returns table (a_key text, a_text text, b_keys text[], b_texts text[], uncertain boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with a as (
    select s.id, s.segment_key, s.text, s.display_order
    from public.translation_segments s
    join public.bible_translations t on t.id = s.translation_id and t.code = p_a
    where s.segment_key like p_book || '.' || p_chapter || '.%'
  ),
  a_verses as (
    select a.id, m.canonical_verse_id, m.mapping_type from a join public.verse_mappings m on m.segment_id = a.id
  ),
  b as (
    select distinct av.id as a_id, s.id, s.segment_key, s.text, s.display_order, m.mapping_type,
           (select count(*) from public.verse_mappings m2 where m2.segment_id = s.id) as spans
    from a_verses av
    join public.verse_mappings m on m.canonical_verse_id = av.canonical_verse_id
    join public.translation_segments s on s.id = m.segment_id
    join public.bible_translations t on t.id = s.translation_id and t.code = p_b
  )
  select a.segment_key, a.text,
         coalesce((select array_agg(b.segment_key order by b.display_order) from (select distinct segment_key, display_order from b where b.a_id = a.id) b), '{}'),
         coalesce((select array_agg(b.text order by b.display_order) from (select distinct segment_key, text, display_order from b where b.a_id = a.id) b), '{}'),
         (select count(distinct b.id) from b where b.a_id = a.id) <> 1
           or exists (select 1 from b where b.a_id = a.id and (b.mapping_type <> 'exact' or b.spans <> 1))
           or exists (select 1 from a_verses av where av.id = a.id and av.mapping_type <> 'exact')
           or (select count(*) from a_verses av where av.id = a.id) <> 1
  from a
  order by a.display_order;
$$;
revoke all on function public.compare_chapter(text, text, text, integer) from public, anon;
grant execute on function public.compare_chapter(text, text, text, integer) to authenticated;

-- highlights ---------------------------------------------------------------------------------------
-- Stored as a canonical verse range, so a highlight shows in every translation (BK-013).
create table public.highlights (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  label         text not null check (char_length(label) between 1 and 200),
  translation   text not null check (char_length(translation) between 1 and 20),
  book          text not null check (char_length(book) between 2 and 10),
  start_chapter integer not null check (start_chapter >= 1),
  start_verse   integer not null check (start_verse >= 1),
  end_chapter   integer not null check (end_chapter >= 1),
  end_verse     integer not null check (end_verse >= 1),
  start_order   integer not null,
  end_order     integer not null,
  color         text not null default 'geel' check (color in ('geel', 'groen', 'blauw', 'roze')),
  annotation    text not null default '' check (char_length(annotation) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (start_order <= end_order)
);
create index highlights_owner_order_idx on public.highlights (owner_id, start_order, end_order);

create or replace function private.touch_highlight()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger highlights_touch before update on public.highlights
  for each row execute function private.touch_highlight();
revoke all on function private.touch_highlight() from public, anon, authenticated;

/** Highlights a passage (in the translation's own numbering). The same passage twice: one highlight, new color. */
create or replace function public.add_highlight(p_passage jsonb, p_color text, p_annotation text default '')
returns public.highlights
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r record;
  h public.highlights;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(p_passage) <> 'object' then raise exception 'invalid passage' using errcode = '22023'; end if;
  if (select count(*) from public.highlights where owner_id = uid) >= 20000 then
    raise exception 'too many highlights' using errcode = '22023';
  end if;
  select * into r from private.resolve_passage(
    p_passage->>'translation', p_passage->>'book',
    (p_passage->>'startChapter')::integer, (p_passage->>'startVerse')::integer,
    (p_passage->>'endChapter')::integer, (p_passage->>'endVerse')::integer);
  if r.s_order is null then raise exception 'reference does not exist' using errcode = '22023'; end if;
  select * into h from public.highlights where owner_id = uid and start_order = r.s_order and end_order = r.e_order;
  if h.id is not null then
    update public.highlights set color = p_color, annotation = coalesce(p_annotation, '') where id = h.id returning * into h;
    return h;
  end if;
  insert into public.highlights
    (owner_id, label, translation, book, start_chapter, start_verse, end_chapter, end_verse, start_order, end_order, color, annotation)
  values (uid, left(p_passage->>'label', 200), p_passage->>'translation', p_passage->>'book',
          (p_passage->>'startChapter')::integer, (p_passage->>'startVerse')::integer,
          (p_passage->>'endChapter')::integer, (p_passage->>'endVerse')::integer,
          r.s_order, r.e_order, p_color, coalesce(p_annotation, ''))
  returning * into h;
  return h;
end;
$$;
revoke all on function public.add_highlight(jsonb, text, text) from public, anon;
grant execute on function public.add_highlight(jsonb, text, text) to authenticated;

/** Removes one of the owner's highlights (the app has no DELETE right, ADR-008). */
create or replace function public.remove_highlight(p_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with gone as (delete from public.highlights where id = p_id and owner_id = (select auth.uid()) returning 1)
  select exists (select 1 from gone);
$$;
revoke all on function public.remove_highlight(uuid) from public, anon;
grant execute on function public.remove_highlight(uuid) to authenticated;

/** The owner's highlights touching a chapter, with the verse numbers they cover in this translation. */
create or replace function public.chapter_highlights(p_translation text, p_book text, p_chapter integer)
returns table (id uuid, label text, color text, annotation text, verses integer[])
language sql
stable
security invoker
set search_path = ''
as $$
  select h.id, h.label, h.color, h.annotation,
         array_agg(distinct split_part(s.segment_key, '.', 3)::integer order by split_part(s.segment_key, '.', 3)::integer)
  from public.translation_segments s
  join public.bible_translations t on t.id = s.translation_id and t.code = p_translation
  join public.verse_mappings m on m.segment_id = s.id
  join public.bible_verses v on v.id = m.canonical_verse_id
  join public.highlights h on v.canonical_order between h.start_order and h.end_order
  where s.segment_key like p_book || '.' || p_chapter || '.%'
  group by h.id, h.label, h.color, h.annotation, h.start_order
  order by h.start_order;
$$;
revoke all on function public.chapter_highlights(text, text, integer) from public, anon;
grant execute on function public.chapter_highlights(text, text, integer) to authenticated;

revoke all on public.highlights from anon, authenticated;
grant select on public.highlights to authenticated;
grant update (color, annotation) on public.highlights to authenticated;
alter table public.highlights enable row level security;
create policy "highlights: owner reads" on public.highlights
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "highlights: owner updates" on public.highlights
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- import (ADR-009): highlights from an export come back too --------------------------------------
create or replace function public.import_highlights(p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r jsonb;
  res record;
  added integer := 0;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p, '[]'::jsonb)) <> 'array' then raise exception 'invalid input' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    select * into res from private.resolve_passage(r->>'translation', r->>'book',
      (r->>'start_chapter')::integer, (r->>'start_verse')::integer, (r->>'end_chapter')::integer, (r->>'end_verse')::integer);
    continue when res.s_order is null;
    continue when exists (select 1 from public.highlights where owner_id = uid and start_order = res.s_order and end_order = res.e_order);
    insert into public.highlights
      (owner_id, label, translation, book, start_chapter, start_verse, end_chapter, end_verse, start_order, end_order, color, annotation, created_at)
    values (uid, left(r->>'label', 200), r->>'translation', r->>'book',
            (r->>'start_chapter')::integer, (r->>'start_verse')::integer, (r->>'end_chapter')::integer, (r->>'end_verse')::integer,
            res.s_order, res.e_order, coalesce(r->>'color', 'geel'), left(coalesce(r->>'annotation', ''), 500),
            least(coalesce((r->>'created_at')::timestamptz, now()), now()));
    added := added + 1;
  end loop;
  return added;
end;
$$;
revoke all on function public.import_highlights(jsonb) from public, anon;
grant execute on function public.import_highlights(jsonb) to authenticated;
