-- Sprint 12: questions to your own notes with checkable sources, and outdated suggestions
-- (BK-042, BK-043, BK-046; AT-11, AT-17; ADR-013). Still no AI provider: nothing is sent anywhere.
-- Only adds and replaces functions; no data is removed.

-- outdated suggestions (BK-046) ------------------------------------------------------------------
-- A suggestion remembers the text of both notes it was made from (content hash). When either note
-- changes, an open suggestion is shown as outdated; a new analysis then marks it 'verouderd'.
alter table public.ai_suggestions add column source_hash text, add column target_hash text;
alter table public.ai_suggestions drop constraint ai_suggestions_status_check;
alter table public.ai_suggestions add constraint ai_suggestions_status_check
  check (status in ('voorgesteld', 'geaccepteerd', 'uitgesteld', 'afgewezen', 'verouderd'));

/**
 * Suggestions that involve a note (as source or as target), with whether one of the two notes has
 * changed since. Invoker: RLS limits it to the signed-in owner.
 */
create or replace function public.ai_note_suggestions(p_note_id uuid)
returns table (
  id uuid, suggestion_type text, status text, title text, rationale text, source_note_id uuid,
  target_note_id uuid, model_version text, created_at timestamptz, stale boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.suggestion_type, s.status, s.title, s.rationale, s.source_note_id, s.target_note_id,
         s.model_version, s.created_at,
         (s.source_hash is not null and s.source_hash is distinct from sd.content_hash)
           or (s.target_hash is not null and s.target_hash is distinct from td.content_hash) as stale
  from public.ai_suggestions s
  left join public.note_documents sd on sd.note_id = s.source_note_id
  left join public.note_documents td on td.note_id = s.target_note_id
  where s.source_note_id = p_note_id or s.target_note_id = p_note_id
  order by s.created_at desc
  limit 100;
$$;
revoke all on function public.ai_note_suggestions(uuid) from public, anon;
grant execute on function public.ai_note_suggestions(uuid) to authenticated;

/**
 * As in Sprint 11, plus: the text versions of both notes are stored with each suggestion, and open
 * suggestions of this note whose text has changed become 'verouderd' (BK-046). A link that was
 * outdated may be proposed again; a link the owner accepted, postponed or rejected is never repeated.
 */
create or replace function public.ai_add_suggestions(p_job_id uuid, p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  j public.ai_jobs;
  r jsonb;
  target uuid;
  added integer := 0;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into j from public.ai_jobs where id = p_job_id and owner_id = uid;
  if j.id is null or j.status <> 'gereserveerd' or j.job_type <> 'analyse' or j.note_id is null then
    raise exception 'job not open' using errcode = '42501';
  end if;
  if jsonb_typeof(p) <> 'array' then raise exception 'invalid suggestions' using errcode = '22023'; end if;

  update public.ai_suggestions s set status = 'verouderd', decided_at = now()
   where s.owner_id = uid and s.status = 'voorgesteld'
     and (s.source_note_id = j.note_id or s.target_note_id = j.note_id)
     and ((s.source_hash is not null and s.source_hash is distinct from (select content_hash from public.note_documents where note_id = s.source_note_id))
       or (s.target_hash is not null and s.target_hash is distinct from (select content_hash from public.note_documents where note_id = s.target_note_id)));

  for r in select * from jsonb_array_elements(p) limit 20 loop
    target := case when r->>'targetNoteId' ~ '^[0-9a-f-]{36}$' then (r->>'targetNoteId')::uuid end;
    continue when r->>'type' = 'verband' and not exists (
      select 1 from public.notes where id = target and owner_id = uid and id <> j.note_id);
    continue when r->>'type' not in ('verband', 'onderwerp', 'vraag');
    continue when r->>'type' = 'verband' and exists (
      select 1 from public.ai_suggestions where owner_id = uid and suggestion_type = 'verband' and status <> 'verouderd'
        and ((source_note_id = j.note_id and target_note_id = target) or (source_note_id = target and target_note_id = j.note_id)));
    insert into public.ai_suggestions
      (owner_id, job_id, source_note_id, source_revision, suggestion_type, target_note_id, title, rationale, evidence,
       model_version, source_hash, target_hash)
    values (uid, j.id, j.note_id, coalesce(j.source_revision, 0), r->>'type', case when r->>'type' = 'verband' then target end,
            left(coalesce(nullif(r->>'title', ''), 'Voorstel'), 200), left(coalesce(nullif(r->>'rationale', ''), '-'), 1000),
            case when jsonb_typeof(r->'evidence') = 'array' then r->'evidence' else '[]'::jsonb end, j.provider || '/' || j.model,
            (select content_hash from public.note_documents where note_id = j.note_id),
            case when r->>'type' = 'verband' then (select content_hash from public.note_documents where note_id = target) end);
    added := added + 1;
  end loop;
  return added;
end;
$$;

-- questions to your notes (BK-042, BK-043, AT-11) ---------------------------------------------------
create table public.ai_answers (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (user_id) on delete cascade,
  job_id        uuid not null unique references public.ai_jobs (id) on delete cascade,
  question      text not null check (char_length(question) between 2 and 500),
  answer        text not null check (char_length(answer) between 1 and 4000),
  -- true when the answer has no checked source: then it must say so, and never invent one
  uncertain     boolean not null,
  -- [{noteId, blockId, revision, blockHash, quote}]: each one checked against the owner's own blocks
  sources       jsonb not null default '[]' check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 10),
  model_version text not null,
  created_at    timestamptz not null default now(),
  check (uncertain or jsonb_array_length(sources) > 0)
);
create index ai_answers_owner_idx on public.ai_answers (owner_id, created_at desc);
revoke all on public.ai_answers from anon, authenticated;
grant select on public.ai_answers to authenticated;
alter table public.ai_answers enable row level security;
create policy "ai_answers: owner reads" on public.ai_answers for select to authenticated using (owner_id = (select auth.uid()));

/**
 * The fragments a question may be answered from: blocks of the owner's own, not archived notes
 * that contain the words (the same keyword search as BK-034). Nothing outside the account.
 */
create or replace function public.ai_fragments(p_query text, p_limit integer default 12)
returns table (note_id uuid, block_id uuid, title text, revision integer, block_hash text, plain_text text, rank real)
language sql
stable
security definer -- private.search_query; the owner filter below is explicit
set search_path = ''
as $$
  with q as (select private.search_query(p_query) as tsq)
  select n.id, b.block_id, n.title, n.current_revision, b.content_hash, left(b.plain_text, 1500),
         ts_rank(b.search_vector, q.tsq)
  from public.notes n
  join public.note_blocks b on b.note_id = n.id
  cross join q
  where n.owner_id = (select auth.uid()) and n.archived_at is null
    and q.tsq is not null and b.search_vector @@ q.tsq
  order by ts_rank(b.search_vector, q.tsq) desc, n.updated_at desc, b.position
  limit least(greatest(coalesce(p_limit, 12), 1), 30);
$$;
revoke all on function public.ai_fragments(text, integer) from public, anon;
grant execute on function public.ai_fragments(text, integer) to authenticated;

/**
 * Stores the answer of a reserved question job. Every source is checked here: the block must be in
 * one of the owner's notes, and a quote must literally be in that block. Anything else is dropped,
 * and an answer left without any source is stored as uncertain (AT-11: no invented sources).
 */
create or replace function public.ai_add_answer(p_job_id uuid, p_question text, p_answer text, p_uncertain boolean, p_sources jsonb)
returns public.ai_answers
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  j public.ai_jobs;
  r jsonb;
  b record;
  checked jsonb := '[]'::jsonb;
  quote text;
  a public.ai_answers;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into j from public.ai_jobs where id = p_job_id and owner_id = uid;
  if j.id is null or j.status <> 'gereserveerd' or j.job_type <> 'vraag' then
    raise exception 'job not open' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_sources, '[]'::jsonb)) <> 'array' then raise exception 'invalid sources' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) limit 10 loop
    continue when not (r->>'noteId' ~ '^[0-9a-f-]{36}$' and r->>'blockId' ~ '^[0-9a-f-]{36}$');
    select n.id as note_id, n.current_revision, bl.block_id, bl.content_hash, bl.plain_text into b
      from public.note_blocks bl join public.notes n on n.id = bl.note_id
     where bl.note_id = (r->>'noteId')::uuid and bl.block_id = (r->>'blockId')::uuid and n.owner_id = uid;
    continue when b.note_id is null;
    quote := left(btrim(coalesce(r->>'quote', '')), 300);
    continue when quote = '' or position(quote in b.plain_text) = 0;
    continue when checked @> jsonb_build_array(jsonb_build_object('blockId', b.block_id));
    checked := checked || jsonb_build_array(jsonb_build_object(
      'noteId', b.note_id, 'blockId', b.block_id, 'revision', b.current_revision, 'blockHash', b.content_hash, 'quote', quote));
  end loop;
  -- without a single checked source the provider's text is not kept: it could not be checked
  insert into public.ai_answers (owner_id, job_id, question, answer, uncertain, sources, model_version)
  values (uid, j.id, left(btrim(p_question), 500),
          case when jsonb_array_length(checked) = 0
               then 'Hierover vond ik niets controleerbaars in je notities. Er is daarom geen antwoord en geen bron gegeven.'
               else left(coalesce(nullif(btrim(p_answer), ''), '-'), 4000) end,
          coalesce(p_uncertain, true) or jsonb_array_length(checked) = 0, checked, j.provider || '/' || j.model)
  returning * into a;
  return a;
end;
$$;
revoke all on function public.ai_add_answer(uuid, text, text, boolean, jsonb) from public, anon;
grant execute on function public.ai_add_answer(uuid, text, text, boolean, jsonb) to authenticated;
