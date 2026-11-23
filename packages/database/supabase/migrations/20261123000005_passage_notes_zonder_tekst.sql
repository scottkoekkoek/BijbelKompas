-- Ronde 3 §1 (zoeken op Joh 16:12–14): notes linked to a passage must show at that passage, also
-- when the chosen translation has no text for it (HSV/NBV21 are reference only, ADR-005).
-- passage_notes resolved the range only through the translation's own text, so without text it
-- found nothing. Now it falls back to canonical numbering, exactly like saving a link does
-- (save_note_blocks). Same output; drafts in the trash and archived notes stay out (ADR-019).
create or replace function public.passage_notes(
  p_translation text, p_book text, p_chapter integer, p_start_verse integer, p_end_verse integer
) returns table (
  note_id uuid, title text, note_type text, updated_at timestamptz,
  block_id uuid, reference_text text, snippet text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with own as (
    select min(v.canonical_order) s, max(v.canonical_order) e
    from public.translation_segments s
    join public.bible_translations t on t.id = s.translation_id and t.code = p_translation
    join public.verse_mappings m on m.segment_id = s.id
    join public.bible_verses v on v.id = m.canonical_verse_id
    where s.segment_key like p_book || '.' || p_chapter || '.%'
      and split_part(s.segment_key, '.', 3)::integer between p_start_verse and p_end_verse
  ), canonical as (
    select min(v.canonical_order) s, max(v.canonical_order) e
    from public.bible_verses v
    join public.bible_books b on b.id = v.book_id and b.book_code = p_book
    join public.bible_canons c on c.id = b.canon_id and c.code = 'PROT66'
    where v.chapter_number = p_chapter and v.verse_number between p_start_verse and p_end_verse
  ), wanted as (
    select coalesce(o.s, c.s) s, case when o.s is null then c.e else o.e end e from own o, canonical c
  )
  select * from (
  select distinct on (n.id, pl.block_id)
    n.id, n.title, n.note_type, n.updated_at, pl.block_id, pl.reference_text,
    left(case when nb.block_type = 'bibleReference'
              then coalesce((select x.plain_text from public.note_blocks x
                             where x.note_id = n.id and x.position = nb.position + 1), '')
              else nb.plain_text end, 240)
  from wanted w
  join public.passage_link_ranges r on r.start_order <= w.e and r.end_order >= w.s
  join public.passage_links pl on pl.id = r.passage_link_id
  join public.notes n on n.id = pl.note_id and n.archived_at is null and n.deleted_at is null
  left join public.note_blocks nb on nb.note_id = n.id and nb.block_id = pl.block_id
  where w.s is not null
  order by n.id, pl.block_id
  ) found
  order by found.updated_at desc, found.block_id
  limit 100;
$$;
