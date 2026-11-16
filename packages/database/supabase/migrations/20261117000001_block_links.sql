-- Sprint 6: verses linked to any text block (BK-030, BK-031, BK-032; AT-02, AT-03).
--
-- The links live in the note document (each block's `passages`), which stays authoritative;
-- passage_links/passage_link_ranges remain derived indexes. Only save_note changes: a block can now
-- carry several passages (one range each). No table changes, nothing is deleted.

/**
 * Saves a note. p_blocks: [{block_id, block_type, plain_text, position, content_hash}]
 * p_links: [{block_id, reference_text, origin, translation, book, start_chapter, start_verse,
 *            end_chapter, end_verse}] in the translation's own numbering.
 * p_reason null = autosave (no revision). p_status 'afgerond' completes the note.
 * p_sermon (Sprint 4) {speaker, organization, series, service_type} as names; null = leave as is.
 * Sprint 6 (BK-030): several p_links for one block_id become several ranges of that block's link.
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
  r_order smallint;
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

    -- Sprint 6: one link per block, one range per passage (a block may name several passages)
    insert into public.passage_links (owner_id, note_id, block_id, reference_text, origin)
    values (uid, n.id, (l->>'block_id')::uuid, l->>'reference_text', coalesce(l->>'origin', 'editor'))
    on conflict (note_id, block_id) do update
      set reference_text = left(public.passage_links.reference_text || '; ' || excluded.reference_text, 200)
    returning id into link_id;
    select count(*) into r_order from public.passage_link_ranges where passage_link_id = link_id;
    insert into public.passage_link_ranges
      (passage_link_id, owner_id, start_verse_id, end_verse_id, start_order, end_order, range_order)
    values (link_id, uid, s_id, e_id, s_order, e_order, r_order);
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

grant execute on function public.save_note(uuid, integer, text, text, date, jsonb, text, jsonb, jsonb, text, text, jsonb) to authenticated;
revoke all on function public.save_note(uuid, integer, text, text, date, jsonb, text, jsonb, jsonb, text, text, jsonb) from public, anon;

/**
 * BK-031: the owner's notes linked to a verse range, with the linked block, newest first.
 * For a Bible reference block the snippet is the text right after it (what was written about it).
 */
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
  with wanted as (
    select min(v.canonical_order) s, max(v.canonical_order) e
    from public.translation_segments s
    join public.bible_translations t on t.id = s.translation_id and t.code = p_translation
    join public.verse_mappings m on m.segment_id = s.id
    join public.bible_verses v on v.id = m.canonical_verse_id
    where s.segment_key like p_book || '.' || p_chapter || '.%'
      and split_part(s.segment_key, '.', 3)::integer between p_start_verse and p_end_verse
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
  join public.notes n on n.id = pl.note_id and n.archived_at is null
  left join public.note_blocks nb on nb.note_id = n.id and nb.block_id = pl.block_id
  where w.s is not null
  order by n.id, pl.block_id
  ) found
  order by found.updated_at desc, found.block_id
  limit 100;
$$;

revoke all on function public.passage_notes(text, text, integer, integer, integer) from public, anon;
grant execute on function public.passage_notes(text, text, integer, integer, integer) to authenticated;
