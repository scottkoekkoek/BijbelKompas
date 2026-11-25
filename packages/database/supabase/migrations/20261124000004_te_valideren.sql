-- Ronde 4 (ADR-020): the features to validate with testers. Additive only.
--   D1  gespreksvragen bij een afgeronde notitie (AI, a proposal next to the note, never in it)
--   B4  toepassingen terugzien: a status and a short look back per "Toepassing" block
--   C2  a reading plan with "Vandaag lezen", without streak pressure

-- D1 ------------------------------------------------------------------------------------------
alter table public.ai_jobs drop constraint ai_jobs_job_type_check;
alter table public.ai_jobs add constraint ai_jobs_job_type_check
  check (job_type in ('analyse', 'vraag', 'indexeren', 'uitleg', 'opzet', 'gespreksvragen'));

create table public.ai_discussion_questions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (user_id) on delete cascade,
  job_id          uuid not null unique references public.ai_jobs (id) on delete cascade,
  note_id         uuid not null references public.notes (id) on delete cascade,
  source_revision integer not null,
  content_hash    text not null,
  -- ["vraag 1", "vraag 2", ...]
  questions       jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 8),
  model_version   text not null,
  created_at      timestamptz not null default now()
);
create index ai_discussion_note_idx on public.ai_discussion_questions (owner_id, note_id, created_at desc);
revoke all on public.ai_discussion_questions from anon, authenticated;
grant select on public.ai_discussion_questions to authenticated;
alter table public.ai_discussion_questions enable row level security;
create policy "ai_discussion: owner reads" on public.ai_discussion_questions for select to authenticated
  using (owner_id = (select auth.uid()));

/** Stores the questions of a reserved 'gespreksvragen' job for one of the owner's own notes. */
create or replace function public.ai_add_discussion(p_job_id uuid, p_questions jsonb)
returns public.ai_discussion_questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  j public.ai_jobs;
  n public.notes;
  hash text;
  q jsonb;
  qs jsonb := '[]'::jsonb;
  r public.ai_discussion_questions;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into j from public.ai_jobs where id = p_job_id and owner_id = uid;
  if j.id is null or j.status <> 'gereserveerd' or j.job_type <> 'gespreksvragen' or j.note_id is null then
    raise exception 'job not open' using errcode = '42501';
  end if;
  select * into n from public.notes where id = j.note_id and owner_id = uid;
  if n.id is null then raise exception 'note not found' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_questions, 'null'::jsonb)) <> 'array' then raise exception 'invalid questions' using errcode = '22023'; end if;
  for q in select * from jsonb_array_elements(p_questions) limit 8 loop
    continue when jsonb_typeof(q) <> 'string' or btrim(q #>> '{}') = '';
    qs := qs || jsonb_build_array(left(btrim(q #>> '{}'), 400));
  end loop;
  if jsonb_array_length(qs) = 0 then raise exception 'no questions' using errcode = '22023'; end if;
  select content_hash into hash from public.note_documents where note_id = n.id;
  insert into public.ai_discussion_questions (owner_id, job_id, note_id, source_revision, content_hash, questions, model_version)
  values (uid, j.id, n.id, coalesce(j.source_revision, n.current_revision), coalesce(hash, ''), qs, j.provider || '/' || j.model)
  returning * into r;
  return r;
end;
$$;
revoke all on function public.ai_add_discussion(uuid, jsonb) from public, anon;
grant execute on function public.ai_add_discussion(uuid, jsonb) to authenticated;

-- B4 ------------------------------------------------------------------------------------------
-- The note itself never changes: the status and look back live next to it, per block.
create table public.application_reviews (
  owner_id   uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  note_id    uuid not null references public.notes (id) on delete cascade,
  block_id   uuid not null,
  status     text not null default 'open' check (status in ('open', 'gedaan', 'losgelaten')),
  reflection text not null default '' check (char_length(reflection) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (note_id, block_id)
);
create index application_reviews_owner_idx on public.application_reviews (owner_id, updated_at desc);
revoke all on public.application_reviews from anon, authenticated;
grant select, insert on public.application_reviews to authenticated;
grant update (status, reflection, updated_at) on public.application_reviews to authenticated;
alter table public.application_reviews enable row level security;
create policy "applications: owner reads" on public.application_reviews for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "applications: owner writes own notes" on public.application_reviews for insert to authenticated
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.notes n where n.id = note_id and n.owner_id = (select auth.uid())));
create policy "applications: owner updates" on public.application_reviews for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- C2 ------------------------------------------------------------------------------------------
-- One plan at a time. days_done counts the days read in order; being behind is fine (no streak).
create table public.reading_plans (
  owner_id   uuid primary key default auth.uid() references public.profiles (user_id) on delete cascade,
  plan_key   text not null check (plan_key in ('nt90', 'psalmen-spreuken')),
  started_on date not null default current_date,
  days_done  integer not null default 0 check (days_done between 0 and 400),
  updated_at timestamptz not null default now()
);
revoke all on public.reading_plans from anon, authenticated;
grant select, insert on public.reading_plans to authenticated;
grant update (days_done, updated_at) on public.reading_plans to authenticated;
alter table public.reading_plans enable row level security;
create policy "plans: owner reads" on public.reading_plans for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "plans: owner inserts" on public.reading_plans for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "plans: owner updates" on public.reading_plans for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- No direct DELETE for the app (house rule): starting another plan and stopping go through these.
create or replace function public.reading_plan_start(p_plan text, p_today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_plan not in ('nt90', 'psalmen-spreuken') or p_today is null then raise exception 'invalid plan' using errcode = '22023'; end if;
  insert into public.reading_plans (owner_id, plan_key, started_on, days_done)
  values (auth.uid(), p_plan, p_today, 0)
  on conflict (owner_id) do update set plan_key = excluded.plan_key, started_on = excluded.started_on, days_done = 0, updated_at = now();
end;
$$;
revoke all on function public.reading_plan_start(text, date) from public, anon;
grant execute on function public.reading_plan_start(text, date) to authenticated;

create or replace function public.reading_plan_stop()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.reading_plans where owner_id = auth.uid();
$$;
revoke all on function public.reading_plan_stop() from public, anon;
grant execute on function public.reading_plan_stop() to authenticated;
