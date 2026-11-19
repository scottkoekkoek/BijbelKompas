-- Sprint 11: the AI foundation, without any AI provider (BK-039, BK-041, BK-044, BK-045; AT-10, AT-12, AT-17; ADR-012).
-- Only adds. Nothing here sends anything anywhere: these are the budget, the jobs and the suggestions
-- that an AI provider will later fill. Suggestions never change a note; accepting one only marks it.

-- jobs -----------------------------------------------------------------------------------------
create table public.ai_jobs (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  job_type           text not null check (job_type in ('analyse', 'vraag', 'indexeren')),
  status             text not null default 'gereserveerd' check (status in ('gereserveerd', 'klaar', 'mislukt')),
  idempotency_key    text not null check (char_length(idempotency_key) between 1 and 200),
  note_id            uuid references public.notes (id) on delete set null,
  source_revision    integer,
  provider           text not null check (char_length(provider) between 1 and 40),
  model              text not null check (char_length(model) between 1 and 80),
  attempts           integer not null default 1 check (attempts >= 1),
  estimated_cost_eur numeric(10, 4) not null check (estimated_cost_eur > 0 and estimated_cost_eur <= 1),
  actual_cost_eur    numeric(10, 4) check (actual_cost_eur >= 0 and actual_cost_eur <= 1),
  created_at         timestamptz not null default now(),
  completed_at       timestamptz,
  unique (owner_id, idempotency_key),
  check ((status = 'gereserveerd') = (completed_at is null))
);
create index ai_jobs_owner_idx on public.ai_jobs (owner_id, created_at desc);

-- usage per calendar month (Europe/Amsterdam) ----------------------------------------------------
create table public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (user_id) on delete cascade,
  job_id        uuid not null unique references public.ai_jobs (id) on delete cascade,
  billing_month date not null check (extract(day from billing_month) = 1),
  provider      text not null,
  reserved_eur  numeric(10, 4) not null check (reserved_eur >= 0),
  actual_eur    numeric(10, 4) check (actual_eur >= 0),
  currency      text not null default 'EUR' check (currency = 'EUR'),
  recorded_at   timestamptz not null default now()
);
create index ai_usage_owner_month_idx on public.ai_usage (owner_id, billing_month);

-- suggestions (never active until the owner accepts one) ------------------------------------------
create table public.ai_suggestions (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (user_id) on delete cascade,
  job_id           uuid not null references public.ai_jobs (id) on delete cascade,
  source_note_id   uuid not null references public.notes (id) on delete cascade,
  source_revision  integer not null,
  suggestion_type  text not null check (suggestion_type in ('verband', 'onderwerp', 'vraag')),
  target_note_id   uuid references public.notes (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  rationale        text not null check (char_length(rationale) between 1 and 1000),
  evidence         jsonb not null default '[]' check (jsonb_typeof(evidence) = 'array'),
  model_version    text not null,
  status           text not null default 'voorgesteld' check (status in ('voorgesteld', 'geaccepteerd', 'uitgesteld', 'afgewezen')),
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  check ((suggestion_type = 'verband') = (target_note_id is not null)),
  check (target_note_id is null or target_note_id <> source_note_id),
  check ((status = 'voorgesteld') = (decided_at is null))
);
create index ai_suggestions_source_idx on public.ai_suggestions (owner_id, source_note_id, status);

-- rights: reading only; every change goes through the functions below ----------------------------
revoke all on public.ai_jobs, public.ai_usage, public.ai_suggestions from anon, authenticated;
grant select on public.ai_jobs, public.ai_usage, public.ai_suggestions to authenticated;
alter table public.ai_jobs enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_suggestions enable row level security;
create policy "ai_jobs: owner reads" on public.ai_jobs for select to authenticated using (owner_id = (select auth.uid()));
create policy "ai_usage: owner reads" on public.ai_usage for select to authenticated using (owner_id = (select auth.uid()));
create policy "ai_suggestions: owner reads" on public.ai_suggestions for select to authenticated using (owner_id = (select auth.uid()));

/** The budget month: the first day of the current month in Dutch time. */
create or replace function private.ai_month(p_at timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', p_at at time zone 'Europe/Amsterdam')::date;
$$;
revoke all on function private.ai_month(timestamptz) from public, anon, authenticated;

/**
 * BK-045: the €5 budget of this month. New paid work stops at the safety threshold (€4,50), so a
 * job whose real cost is a bit higher than estimated still stays under €5.
 */
create or replace function public.ai_budget()
returns table (month date, limit_eur numeric, stop_at_eur numeric, used_eur numeric, enabled boolean)
language sql
stable
security definer -- only ever the signed-in owner's own rows (auth.uid())
set search_path = ''
as $$
  select private.ai_month(), 5.00::numeric, 4.50::numeric,
         coalesce((select sum(coalesce(u.actual_eur, u.reserved_eur)) from public.ai_usage u
                   where u.owner_id = (select auth.uid()) and u.billing_month = private.ai_month()), 0)::numeric,
         coalesce((select p.ai_enabled from public.user_preferences p where p.user_id = (select auth.uid())), false);
$$;
revoke all on function public.ai_budget() from public, anon;
grant execute on function public.ai_budget() to authenticated;

/**
 * Reserves the estimated cost before any AI work starts (BK-044, BK-045, AT-12). Refuses when AI is
 * off (42501) or when the budget would pass the safety threshold (53400). The same idempotency key
 * gives back the same job, so a retry never pays twice.
 */
create or replace function public.ai_reserve(
  p_job_type text, p_key text, p_estimate numeric, p_provider text, p_model text,
  p_note_id uuid default null, p_revision integer default null
) returns public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  j public.ai_jobs;
  used numeric;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not coalesce((select ai_enabled from public.user_preferences where user_id = uid), false) then
    raise exception 'AI is switched off' using errcode = '42501';
  end if;
  if p_estimate is null or p_estimate <= 0 or p_estimate > 1 then
    raise exception 'estimate out of range' using errcode = '22023';
  end if;
  if p_note_id is not null and not exists (select 1 from public.notes where id = p_note_id and owner_id = uid) then
    raise exception 'note not found' using errcode = '42501';
  end if;
  -- one reservation at a time per owner, so two requests cannot both squeeze under the limit
  perform pg_advisory_xact_lock(hashtextextended('ai_budget:' || uid::text, 0));
  select * into j from public.ai_jobs where owner_id = uid and idempotency_key = p_key;
  if j.id is not null then return j; end if;
  select coalesce(sum(coalesce(actual_eur, reserved_eur)), 0) into used
    from public.ai_usage where owner_id = uid and billing_month = private.ai_month();
  if used + p_estimate > 4.50 then
    raise exception 'AI budget reached' using errcode = '53400';
  end if;
  insert into public.ai_jobs (owner_id, job_type, idempotency_key, note_id, source_revision, provider, model, estimated_cost_eur)
  values (uid, p_job_type, p_key, p_note_id, p_revision, p_provider, p_model, p_estimate)
  returning * into j;
  insert into public.ai_usage (owner_id, job_id, billing_month, provider, reserved_eur)
  values (uid, j.id, private.ai_month(), p_provider, p_estimate);
  return j;
end;
$$;
revoke all on function public.ai_reserve(text, text, numeric, text, text, uuid, integer) from public, anon;
grant execute on function public.ai_reserve(text, text, numeric, text, text, uuid, integer) to authenticated;

/**
 * Finishes a reserved job with its real cost. A failed job also records what it cost. The real cost
 * can never be lower than nothing and is recorded once; a finished job stays as it is.
 */
create or replace function public.ai_finish(p_job_id uuid, p_ok boolean, p_actual numeric)
returns public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  j public.ai_jobs;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into j from public.ai_jobs where id = p_job_id and owner_id = uid for update;
  if j.id is null then raise exception 'job not found' using errcode = '42501'; end if;
  if j.status <> 'gereserveerd' then return j; end if;
  if p_actual is null or p_actual < 0 or p_actual > 1 then raise exception 'cost out of range' using errcode = '22023'; end if;
  update public.ai_jobs
     set status = case when p_ok then 'klaar' else 'mislukt' end, actual_cost_eur = p_actual, completed_at = now()
   where id = j.id returning * into j;
  update public.ai_usage set actual_eur = p_actual where job_id = j.id;
  return j;
end;
$$;
revoke all on function public.ai_finish(uuid, boolean, numeric) from public, anon;
grant execute on function public.ai_finish(uuid, boolean, numeric) to authenticated;

/**
 * Stores the suggestions of a reserved analysis job. Only notes of the owner can be source or
 * target; anything else in the provider's answer is dropped (AT-17: whatever a note says, the
 * output can only become a suggestion). Returns how many were stored.
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
  for r in select * from jsonb_array_elements(p) limit 20 loop
    target := case when r->>'targetNoteId' ~ '^[0-9a-f-]{36}$' then (r->>'targetNoteId')::uuid end;
    continue when r->>'type' = 'verband' and not exists (
      select 1 from public.notes where id = target and owner_id = uid and id <> j.note_id);
    continue when r->>'type' not in ('verband', 'onderwerp', 'vraag');
    -- the same link that is already there (whatever its status) is not proposed again
    continue when r->>'type' = 'verband' and exists (
      select 1 from public.ai_suggestions where owner_id = uid and suggestion_type = 'verband'
        and ((source_note_id = j.note_id and target_note_id = target) or (source_note_id = target and target_note_id = j.note_id)));
    insert into public.ai_suggestions
      (owner_id, job_id, source_note_id, source_revision, suggestion_type, target_note_id, title, rationale, evidence, model_version)
    values (uid, j.id, j.note_id, coalesce(j.source_revision, 0), r->>'type', case when r->>'type' = 'verband' then target end,
            left(coalesce(nullif(r->>'title', ''), 'Voorstel'), 200), left(coalesce(nullif(r->>'rationale', ''), '-'), 1000),
            case when jsonb_typeof(r->'evidence') = 'array' then r->'evidence' else '[]'::jsonb end, j.provider || '/' || j.model);
    added := added + 1;
  end loop;
  return added;
end;
$$;
revoke all on function public.ai_add_suggestions(uuid, jsonb) from public, anon;
grant execute on function public.ai_add_suggestions(uuid, jsonb) to authenticated;

/** BK-041: the owner accepts, postpones or rejects a suggestion. Notes are never touched. */
create or replace function public.ai_decide(p_id uuid, p_status text)
returns public.ai_suggestions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.ai_suggestions;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_status not in ('geaccepteerd', 'uitgesteld', 'afgewezen', 'voorgesteld') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update public.ai_suggestions
     set status = p_status, decided_at = case when p_status = 'voorgesteld' then null else now() end
   where id = p_id and owner_id = auth.uid()
  returning * into s;
  if s.id is null then raise exception 'suggestion not found' using errcode = '42501'; end if;
  return s;
end;
$$;
revoke all on function public.ai_decide(uuid, text) from public, anon;
grant execute on function public.ai_decide(uuid, text) to authenticated;

/**
 * Other notes of the owner that are linked to the same Bible verses as this note, with the
 * reference that overlaps. This is what an analysis may look at: nothing outside the account.
 */
create or replace function public.ai_candidates(p_note_id uuid)
returns table (note_id uuid, title text, reference text)
language sql
stable
security invoker
set search_path = ''
as $$
  select x.note_id, x.title, x.reference
  from (
    select distinct on (o.id) o.id as note_id, o.title, ol.reference_text as reference, o.updated_at
    from public.passage_links l
    join public.passage_link_ranges r on r.passage_link_id = l.id
    join public.passage_link_ranges orr on orr.start_order <= r.end_order and orr.end_order >= r.start_order
    join public.passage_links ol on ol.id = orr.passage_link_id and ol.note_id <> l.note_id
    join public.notes o on o.id = ol.note_id and o.archived_at is null
    where l.note_id = p_note_id
    order by o.id, ol.reference_text
  ) x
  order by x.updated_at desc -- the most recent notes first
  limit 50;
$$;
revoke all on function public.ai_candidates(uuid) from public, anon;
grant execute on function public.ai_candidates(uuid) to authenticated;
