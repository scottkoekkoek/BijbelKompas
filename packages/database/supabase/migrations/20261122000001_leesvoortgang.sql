-- Feature 6: personal reading progress (ADR-015). Only adds.
-- Progress is kept per canonical verse, so it is the same in every translation. Only an explicit
-- "mark as read" changes it: opening, scrolling or "Verder lezen" never do.

create table public.read_verses (
  owner_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  verse_id uuid not null references public.bible_verses (id) on delete cascade,
  read_at  timestamptz not null default now(),
  primary key (owner_id, verse_id)
);
revoke all on public.read_verses from anon, authenticated;
grant select on public.read_verses to authenticated;
alter table public.read_verses enable row level security;
create policy "read_verses: owner reads" on public.read_verses for select to authenticated using (owner_id = (select auth.uid()));

/**
 * Marks verses as read or unread. A whole chapter (p_start 1, p_end >= 999) covers every canonical
 * verse of that chapter; a selection is mapped from the translation's verse numbers. Marking twice
 * or overlapping counts each verse once. Returns how many verses changed.
 */
create or replace function public.reading_mark(
  p_translation text, p_book text, p_chapter integer, p_start integer, p_end integer, p_read boolean
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s integer;
  e integer;
  b_id uuid;
  n integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_chapter < 1 or p_start < 1 or p_end < p_start then raise exception 'invalid verses' using errcode = '22023'; end if;
  select b.id into b_id from public.bible_books b join public.bible_canons c on c.id = b.canon_id and c.code = 'PROT66'
   where b.book_code = p_book;
  if b_id is null then raise exception 'unknown book' using errcode = '22023'; end if;
  if p_start = 1 and p_end >= 999 then
    select min(canonical_order), max(canonical_order) into s, e from public.bible_verses
     where book_id = b_id and chapter_number = p_chapter;
  else
    select r.s_order, r.e_order into s, e from private.resolve_passage(p_translation, p_book, p_chapter, p_start, p_chapter, p_end) r;
  end if;
  if s is null then raise exception 'no such verses' using errcode = '22023'; end if;
  if p_read then
    insert into public.read_verses (owner_id, verse_id)
    select uid, v.id from public.bible_verses v where v.book_id = b_id and v.canonical_order between s and e
    on conflict do nothing;
  else
    delete from public.read_verses r using public.bible_verses v
     where r.owner_id = uid and v.id = r.verse_id and v.book_id = b_id and v.canonical_order between s and e;
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.reading_mark(text, text, integer, integer, integer, boolean) from public, anon;
grant execute on function public.reading_mark(text, text, integer, integer, integer, boolean) to authenticated;

/** Per chapter of a book: how many canonical verses it has and how many of them are read. */
create or replace function public.reading_chapters(p_book text)
returns table (chapter integer, total integer, read integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.chapter_number::integer, count(*)::integer, count(r.verse_id)::integer
  from public.bible_verses v
  join public.bible_books b on b.id = v.book_id and b.book_code = p_book
  join public.bible_canons c on c.id = b.canon_id and c.code = 'PROT66'
  left join public.read_verses r on r.verse_id = v.id and r.owner_id = (select auth.uid())
  group by v.chapter_number
  order by v.chapter_number;
$$;
revoke all on function public.reading_chapters(text) from public, anon;
grant execute on function public.reading_chapters(text) to authenticated;

/** Per book with any progress: chapters read completely, and chapters started. */
create or replace function public.reading_books()
returns table (book_code text, chapters_read integer, chapters_started integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with progress as (
    select v.book_id, v.chapter_number, count(*) as read
    from public.read_verses r
    join public.bible_verses v on v.id = r.verse_id
    where r.owner_id = (select auth.uid())
    group by v.book_id, v.chapter_number
  ),
  totals as (
    select v.book_id, v.chapter_number, count(*) as total
    from public.bible_verses v
    where (v.book_id, v.chapter_number) in (select book_id, chapter_number from progress)
    group by v.book_id, v.chapter_number
  )
  select b.book_code, (count(*) filter (where p.read = t.total))::integer, count(*)::integer
  from progress p
  join totals t on t.book_id = p.book_id and t.chapter_number = p.chapter_number
  join public.bible_books b on b.id = p.book_id
  group by b.book_code;
$$;
revoke all on function public.reading_books() from public, anon;
grant execute on function public.reading_books() to authenticated;

/** The verses of a chapter that are read, in this translation's numbering (all mapped verses read). */
create or replace function public.reading_verses(p_translation text, p_book text, p_chapter integer)
returns table (verse integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select split_part(s.segment_key, '.', 3)::integer
  from public.translation_segments s
  join public.bible_translations t on t.id = s.translation_id and t.code = p_translation
  join public.verse_mappings m on m.segment_id = s.id
  left join public.read_verses r on r.verse_id = m.canonical_verse_id and r.owner_id = (select auth.uid())
  where s.segment_key like p_book || '.' || p_chapter || '.%'
  group by s.segment_key
  having count(*) = count(r.verse_id)
  order by 1;
$$;
revoke all on function public.reading_verses(text, text, integer) from public, anon;
grant execute on function public.reading_verses(text, text, integer) to authenticated;

/**
 * The first verse of a book (chapter, then verse order) that is not read yet, or of one chapter
 * when p_chapter is given. Nothing when all are read.
 */
create or replace function public.reading_next(p_book text, p_chapter integer default null)
returns table (chapter integer, verse integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.chapter_number::integer, v.verse_number::integer
  from public.bible_verses v
  join public.bible_books b on b.id = v.book_id and b.book_code = p_book
  join public.bible_canons c on c.id = b.canon_id and c.code = 'PROT66'
  where (p_chapter is null or v.chapter_number = p_chapter)
    and not exists (select 1 from public.read_verses r where r.verse_id = v.id and r.owner_id = (select auth.uid()))
  order by v.canonical_order
  limit 1;
$$;
revoke all on function public.reading_next(text, integer) from public, anon;
grant execute on function public.reading_next(text, integer) to authenticated;
