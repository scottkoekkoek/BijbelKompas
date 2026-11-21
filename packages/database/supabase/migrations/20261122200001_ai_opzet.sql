-- AI-opzet en samenvatting van een afgeronde notitie (ADR-018). Only adds; nothing is sent anywhere.
-- The outline is a proposal next to the note: it never changes the note. The owner can copy it or
-- save it as a NEW note (through the normal create_note route).

alter table public.ai_jobs drop constraint ai_jobs_job_type_check;
alter table public.ai_jobs add constraint ai_jobs_job_type_check
  check (job_type in ('analyse', 'vraag', 'indexeren', 'uitleg', 'opzet'));

create table public.ai_outlines (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (user_id) on delete cascade,
  job_id          uuid not null unique references public.ai_jobs (id) on delete cascade,
  note_id         uuid not null references public.notes (id) on delete cascade,
  source_revision integer not null,
  -- the text version the outline was made from (to show "verouderd" after a change)
  content_hash    text not null,
  summary         text not null check (char_length(summary) between 1 and 2000),
  main_thought    text not null check (char_length(main_thought) between 1 and 500),
  -- [{"heading": "...", "details": ["...", ...]}]
  points          jsonb not null default '[]' check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) <= 12),
  application     text not null default '' check (char_length(application) <= 2000),
  model_version   text not null,
  created_at      timestamptz not null default now()
);
create index ai_outlines_note_idx on public.ai_outlines (owner_id, note_id, created_at desc);
revoke all on public.ai_outlines from anon, authenticated;
grant select on public.ai_outlines to authenticated;
alter table public.ai_outlines enable row level security;
create policy "ai_outlines: owner reads" on public.ai_outlines for select to authenticated
  using (owner_id = (select auth.uid()));

/** Stores the outline of a reserved 'opzet' job for one of the owner's own notes. */
create or replace function public.ai_add_outline(
  p_job_id uuid, p_summary text, p_main_thought text, p_points jsonb, p_application text
) returns public.ai_outlines
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  j public.ai_jobs;
  n public.notes;
  hash text;
  r jsonb;
  d jsonb;
  details jsonb;
  pts jsonb := '[]'::jsonb;
  o public.ai_outlines;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into j from public.ai_jobs where id = p_job_id and owner_id = uid;
  if j.id is null or j.status <> 'gereserveerd' or j.job_type <> 'opzet' or j.note_id is null then
    raise exception 'job not open' using errcode = '42501';
  end if;
  select * into n from public.notes where id = j.note_id and owner_id = uid;
  if n.id is null then raise exception 'note not found' using errcode = '42501'; end if;
  select content_hash into hash from public.note_documents where note_id = n.id;
  if jsonb_typeof(coalesce(p_points, '[]'::jsonb)) <> 'array' then raise exception 'invalid points' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) limit 12 loop
    continue when jsonb_typeof(r) <> 'object' or btrim(coalesce(r->>'heading', '')) = '';
    details := '[]'::jsonb;
    if jsonb_typeof(r->'details') = 'array' then
      for d in select * from jsonb_array_elements(r->'details') limit 8 loop
        continue when jsonb_typeof(d) <> 'string' or btrim(d #>> '{}') = '';
        details := details || jsonb_build_array(left(btrim(d #>> '{}'), 400));
      end loop;
    end if;
    pts := pts || jsonb_build_array(jsonb_build_object('heading', left(btrim(r->>'heading'), 200), 'details', details));
  end loop;
  insert into public.ai_outlines (owner_id, job_id, note_id, source_revision, content_hash, summary, main_thought, points, application, model_version)
  values (uid, j.id, n.id, coalesce(j.source_revision, n.current_revision), coalesce(hash, ''),
          left(coalesce(nullif(btrim(p_summary), ''), '-'), 2000), left(coalesce(nullif(btrim(p_main_thought), ''), '-'), 500),
          pts, left(btrim(coalesce(p_application, '')), 2000), j.provider || '/' || j.model)
  returning * into o;
  return o;
end;
$$;
revoke all on function public.ai_add_outline(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.ai_add_outline(uuid, text, text, jsonb, text) to authenticated;
