-- Sprint 8: put an export back (AT-15, ADR-009).
--
-- * Only ADDS. Something that already exists in the account (same id) is skipped, never changed,
--   so importing the same export twice changes nothing the second time.
-- * An id that belongs to ANOTHER account gets a new id; nothing about that other row is revealed.
-- * Everything belongs to the signed-in user (auth.uid()), whatever the file says.
-- * Revisions stay immutable: they can only be added to a note created by an import, within a day,
--   after the ones it already has, and never changed afterwards.
-- * Note indexes (blocks, verse links) are derived again from the document through save_note.

alter table public.notes add column imported_at timestamptz;

/**
 * One note of an export (without its revisions). p_note uses the export's field names.
 * Returns the id the note has in this account and whether it already existed (skipped).
 */
create or replace function public.import_note(
  p_note jsonb, p_content_hash text, p_blocks jsonb, p_links jsonb, p_sermon jsonb
) returns table (old_id uuid, new_id uuid, skipped boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  src uuid := (p_note->>'id')::uuid;
  nid uuid := src;
  who uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(p_note) <> 'object' or jsonb_typeof(p_note->'document') <> 'object' then
    raise exception 'invalid note' using errcode = '22023';
  end if;
  select n.owner_id into who from public.notes n where n.id = src;
  if who = uid then
    return query select src, src, true;
    return;
  elsif who is not null then
    nid := gen_random_uuid();
  end if;

  insert into public.notes (id, owner_id, title, note_type, status, event_date, created_at, completed_at, archived_at, imported_at)
  values (
    nid, uid, coalesce(p_note->>'title', ''), coalesce(p_note->>'noteType', 'vrij'), coalesce(p_note->>'status', 'concept'),
    (p_note->>'eventDate')::date,
    least(coalesce((p_note->>'createdAt')::timestamptz, now()), now()),
    case when p_note->>'status' = 'afgerond' then least(coalesce((p_note->>'completedAt')::timestamptz, now()), now()) end,
    least((p_note->>'archivedAt')::timestamptz, now()),
    now()
  );
  insert into public.note_documents (note_id, owner_id, document_json, content_hash)
  values (nid, uid, p_note->'document', p_content_hash);
  -- derive blocks, verse links and sermon details exactly like a normal save (no revision)
  perform public.save_note(nid, 1, coalesce(p_note->>'title', ''), coalesce(p_note->>'noteType', 'vrij'),
    (p_note->>'eventDate')::date, p_note->'document', p_content_hash, p_blocks, p_links, null, null, p_sermon);
  return query select src, nid, false;
end;
$$;
revoke all on function public.import_note(jsonb, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_note(jsonb, text, jsonb, jsonb, jsonb) to authenticated;

/**
 * Revisions of a note that this import just created. They are added in order after the ones the
 * note already has; numbers it already has are skipped, so a retry is safe. Number, reason, date
 * and content come from the export.
 */
create or replace function public.import_revisions(p_note_id uuid, p_revisions jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n public.notes;
  r jsonb;
  num integer;
  added integer := 0;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into n from public.notes where id = p_note_id for update;
  if n.id is null or n.owner_id <> uid then raise exception 'note not found' using errcode = '42501'; end if;
  if n.imported_at is null or n.imported_at < now() - interval '1 day' then
    raise exception 'revisions can only be added right after an import' using errcode = '42501';
  end if;
  if jsonb_typeof(p_revisions) <> 'array' then raise exception 'invalid revisions' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(p_revisions) loop
    num := (r->>'number')::integer;
    if num is null then raise exception 'revision without number' using errcode = '22023'; end if;
    continue when num <= n.current_revision; -- already there (a retry): skip, never change it
    if jsonb_typeof(r->'document') <> 'object' or jsonb_typeof(coalesce(r->'metadata', '{}'::jsonb)) <> 'object'
       or octet_length((r->'document')::text) > 1000000 then
      raise exception 'invalid revision %', num using errcode = '22023';
    end if;
    insert into public.note_revisions
      (note_id, owner_id, revision_number, reason, document_json, metadata_json, content_hash, created_by, created_at)
    values (n.id, uid, num, r->>'reason', r->'document', coalesce(r->'metadata', '{}'::jsonb),
            left(coalesce(r->>'contentHash', ''), 128), uid, least(coalesce((r->>'createdAt')::timestamptz, now()), now()));
    n.current_revision := num;
    added := added + 1;
  end loop;
  update public.notes set current_revision = n.current_revision where id = n.id;
  return added;
end;
$$;
revoke all on function public.import_revisions(uuid, jsonb) from public, anon;
grant execute on function public.import_revisions(uuid, jsonb) to authenticated;

/**
 * Collections, research questions and templates of an export. p_note_map: {"old note id": "id here"}
 * (from import_note). Rows whose id already exists in this account are skipped; links to notes that
 * are not in the map, and passages that do not resolve, are left out. Returns counts per kind.
 */
create or replace function public.import_extras(p jsonb, p_note_map jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r jsonb;
  who uuid;
  new_id uuid;
  ids jsonb := '{}'::jsonb;   -- old collection/question id -> id here (only rows added now)
  known jsonb := '{}'::jsonb; -- old collection/question id -> id here (added or already there)
  res record;
  c_added integer := 0; c_items integer := 0; q_added integer := 0; q_links integer := 0; t_added integer := 0;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(p) <> 'object' or jsonb_typeof(coalesce(p_note_map, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid input' using errcode = '22023';
  end if;

  -- collections: first without parents, then the parents (so the order in the file does not matter)
  for r in select * from jsonb_array_elements(coalesce(p->'collections', '[]'::jsonb)) loop
    select c.owner_id into who from public.collections c where c.id = (r->>'id')::uuid;
    if who = uid then
      known := known || jsonb_build_object(r->>'id', r->>'id');
      continue;
    end if;
    new_id := case when who is null then (r->>'id')::uuid else gen_random_uuid() end;
    insert into public.collections (id, owner_id, name, collection_type, description, created_at, archived_at)
    values (new_id, uid, r->>'name', coalesce(r->>'collection_type', 'dossier'), coalesce(r->>'description', ''),
            least(coalesce((r->>'created_at')::timestamptz, now()), now()), least((r->>'archived_at')::timestamptz, now()));
    ids := ids || jsonb_build_object(r->>'id', new_id);
    known := known || jsonb_build_object(r->>'id', new_id);
    c_added := c_added + 1;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p->'collections', '[]'::jsonb)) loop
    if ids ? (r->>'id') and r->>'parent_id' is not null and known ? (r->>'parent_id') then
      update public.collections set parent_id = (known->>(r->>'parent_id'))::uuid where id = (ids->>(r->>'id'))::uuid;
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p->'collectionItems', '[]'::jsonb)) loop
    continue when not (ids ? (r->>'collection_id')) or not (p_note_map ? (r->>'note_id'));
    insert into public.collection_items (collection_id, note_id, owner_id, position, created_at)
    values ((ids->>(r->>'collection_id'))::uuid, (p_note_map->>(r->>'note_id'))::uuid, uid,
            greatest(coalesce((r->>'position')::integer, 0), 0), least(coalesce((r->>'created_at')::timestamptz, now()), now()))
    on conflict do nothing;
    c_items := c_items + 1;
  end loop;

  -- research questions (resolved_at follows the status, see touch_question)
  for r in select * from jsonb_array_elements(coalesce(p->'questions', '[]'::jsonb)) loop
    select q.owner_id into who from public.questions q where q.id = (r->>'id')::uuid;
    continue when who = uid;
    new_id := case when who is null then (r->>'id')::uuid else gen_random_uuid() end;
    insert into public.questions (id, owner_id, title, description, status, answer, created_at)
    values (new_id, uid, r->>'title', coalesce(r->>'description', ''), coalesce(r->>'status', 'open'),
            coalesce(r->>'answer', ''), least(coalesce((r->>'created_at')::timestamptz, now()), now()));
    ids := ids || jsonb_build_object(r->>'id', new_id);
    q_added := q_added + 1;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p->'questionNotes', '[]'::jsonb)) loop
    continue when not (ids ? (r->>'question_id')) or not (p_note_map ? (r->>'note_id'));
    insert into public.question_notes (question_id, note_id, owner_id)
    values ((ids->>(r->>'question_id'))::uuid, (p_note_map->>(r->>'note_id'))::uuid, uid)
    on conflict do nothing;
    q_links := q_links + 1;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p->'questionPassages', '[]'::jsonb)) loop
    continue when not (ids ? (r->>'question_id'));
    select * into res from private.resolve_passage(r->>'translation', r->>'book',
      (r->>'start_chapter')::integer, (r->>'start_verse')::integer, (r->>'end_chapter')::integer, (r->>'end_verse')::integer);
    continue when res.s_order is null;
    insert into public.question_passages
      (question_id, owner_id, label, translation, book, start_chapter, start_verse, end_chapter, end_verse, start_order, end_order)
    values ((ids->>(r->>'question_id'))::uuid, uid, left(r->>'label', 200), r->>'translation', r->>'book',
            (r->>'start_chapter')::integer, (r->>'start_verse')::integer, (r->>'end_chapter')::integer, (r->>'end_verse')::integer,
            res.s_order, res.e_order)
    on conflict do nothing;
    q_links := q_links + 1;
  end loop;

  -- own templates (a default template in the file never replaces the current default)
  for r in select * from jsonb_array_elements(coalesce(p->'templates', '[]'::jsonb)) loop
    select t.owner_id into who from public.note_templates t where t.id = (r->>'id')::uuid;
    continue when who = uid;
    insert into public.note_templates (id, owner_id, name, note_type, description, template_json, archived_at, created_at)
    values (case when who is null then (r->>'id')::uuid else gen_random_uuid() end, uid, r->>'name',
            coalesce(r->>'note_type', 'vrij'), coalesce(r->>'description', ''), r->'template_json',
            least((r->>'archived_at')::timestamptz, now()), least(coalesce((r->>'created_at')::timestamptz, now()), now()));
    t_added := t_added + 1;
  end loop;

  return jsonb_build_object('collections', c_added, 'collectionItems', c_items, 'questions', q_added,
                            'questionLinks', q_links, 'templates', t_added);
end;
$$;
revoke all on function public.import_extras(jsonb, jsonb) from public, anon;
grant execute on function public.import_extras(jsonb, jsonb) to authenticated;
