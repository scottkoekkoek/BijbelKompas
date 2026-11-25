-- Ronde 4 (review 24 november, ADR-020): pilot safety and an AI limit per account.
-- Adds and redefines functions; nothing is wiped.
--
-- 1. Only the server can close an AI job. The server passes the sha-256 of a random token when it
--    reserves a job and the token itself when it finishes it. A signed-in browser never sees the token
--    (the hash lives in the private schema), so it can no longer finish a server's job at € 0 and so
--    slip past its own or the pilot budget. A job reserved without a hash (tests, old callers) stays
--    finishable without one; such a job never makes a provider call.
-- 2. A second request for a job that the server is still running gets "busy" (55P03) instead of the
--    same job, so a double tap no longer pays twice. A server job left half-way for more than ten
--    minutes (a crashed function) is closed as failed at its reserved cost, and a new attempt may start.
-- 3. A recovery link no longer blocks deleting its account (its CHECK clashed with ON DELETE SET NULL).
-- 4. An administrator can set an AI limit per account; without one the default from app_settings counts.

-- 1 + 2 -----------------------------------------------------------------------------------------
create table private.ai_job_tokens (
  job_id     uuid primary key references public.ai_jobs (id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$')
);
revoke all on private.ai_job_tokens from public, anon, authenticated;

-- 4 ---------------------------------------------------------------------------------------------
create table public.ai_user_limits (
  user_id    uuid primary key references public.profiles (user_id) on delete cascade,
  limit_eur  numeric(10, 2) not null check (limit_eur >= 0 and limit_eur <= 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
revoke all on public.ai_user_limits from anon, authenticated;
grant select on public.ai_user_limits to authenticated;
alter table public.ai_user_limits enable row level security;
-- you see your own limit; administrators see all limits (no usage, no content)
create policy "ai_user_limits: own or admin" on public.ai_user_limits for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_app_admin()));

/** The monthly limit that applies to an account: its own one, otherwise the default. */
create or replace function private.ai_user_limit(p_user uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce((select l.limit_eur from public.ai_user_limits l where l.user_id = p_user),
                  (select s.ai_user_limit_eur from public.app_settings s where s.id))::numeric;
$$;
revoke all on function private.ai_user_limit(uuid) from public, anon, authenticated;

/** Admin only: sets (or with null removes) the AI limit of one account, in euros per month. */
create or replace function public.pilot_set_user_ai_limit(p_user uuid, p_limit numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_app_admin() then raise exception 'administrators only' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where user_id = p_user) then raise exception 'no such account' using errcode = '22023'; end if;
  if p_limit is null then
    delete from public.ai_user_limits where user_id = p_user;
    return;
  end if;
  if p_limit < 0 or p_limit > 100 then raise exception 'limit out of range' using errcode = '22023'; end if;
  insert into public.ai_user_limits (user_id, limit_eur, updated_by)
  values (p_user, round(p_limit, 2), auth.uid())
  on conflict (user_id) do update set limit_eur = excluded.limit_eur, updated_at = now(), updated_by = excluded.updated_by;
end;
$$;
revoke all on function public.pilot_set_user_ai_limit(uuid, numeric) from public, anon;
grant execute on function public.pilot_set_user_ai_limit(uuid, numeric) to authenticated;

drop function public.ai_budget();
/** This month's budget of the signed-in account (its own limit or the default) and of the pilot. */
create function public.ai_budget()
returns table (month date, limit_eur numeric, stop_at_eur numeric, used_eur numeric, enabled boolean,
               pilot_limit_eur numeric, pilot_stop_at_eur numeric, pilot_used_eur numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select private.ai_month(), private.ai_user_limit(auth.uid()), round(private.ai_user_limit(auth.uid()) * 0.9, 2)::numeric,
         coalesce((select sum(coalesce(u.actual_eur, u.reserved_eur)) from public.ai_usage u
                   where u.owner_id = (select auth.uid()) and u.billing_month = private.ai_month()), 0)::numeric,
         coalesce((select p.ai_enabled from public.user_preferences p where p.user_id = (select auth.uid())), false),
         s.ai_pilot_limit_eur::numeric, round(s.ai_pilot_limit_eur * 0.9, 2)::numeric, private.ai_pilot_used()
    from public.app_settings s
   where (select auth.uid()) is not null;
$$;
revoke all on function public.ai_budget() from public, anon;
grant execute on function public.ai_budget() to authenticated;

drop function public.ai_reserve(text, text, numeric, text, text, uuid, integer);
/**
 * Reserves the estimated cost before any AI work starts. As before: refuses when AI is off (42501), at
 * 90% of the account's limit or of the pilot budget (53400), and the same key gives back a finished job.
 * New: p_finish_hash (the server's token hash) makes the job closable only with that token, and an
 * unfinished server job with the same key answers 55P03 (busy) or, after ten minutes, is closed as failed.
 */
create function public.ai_reserve(
  p_job_type text, p_key text, p_estimate numeric, p_provider text, p_model text,
  p_note_id uuid default null, p_revision integer default null, p_finish_hash text default null
) returns public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  j public.ai_jobs;
  s public.app_settings;
  used numeric;
  lim numeric;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not coalesce((select ai_enabled from public.user_preferences where user_id = uid), false) then
    raise exception 'AI is switched off' using errcode = '42501';
  end if;
  if p_estimate is null or p_estimate <= 0 or p_estimate > 1 then
    raise exception 'estimate out of range' using errcode = '22023';
  end if;
  if p_finish_hash is not null and p_finish_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash' using errcode = '22023';
  end if;
  if p_note_id is not null and not exists (select 1 from public.notes where id = p_note_id and owner_id = uid) then
    raise exception 'note not found' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_budget:pilot', 0));
  select * into j from public.ai_jobs where owner_id = uid and idempotency_key = p_key;
  if j.id is not null then
    if j.status = 'gereserveerd' and p_finish_hash is not null then
      if j.created_at > now() - interval '10 minutes' then
        raise exception 'AI job busy' using errcode = '55P03';
      end if;
      -- left half-way (the server stopped): counts as failed at its reserved cost
      update public.ai_jobs set status = 'mislukt', actual_cost_eur = estimated_cost_eur, completed_at = now()
       where id = j.id returning * into j;
      update public.ai_usage set actual_eur = reserved_eur where job_id = j.id;
    end if;
    return j;
  end if;
  select * into s from public.app_settings where id;
  lim := private.ai_user_limit(uid);
  select coalesce(sum(coalesce(actual_eur, reserved_eur)), 0) into used
    from public.ai_usage where owner_id = uid and billing_month = private.ai_month();
  if used + p_estimate > round(lim * 0.9, 2) then
    raise exception 'AI budget reached' using errcode = '53400';
  end if;
  if private.ai_pilot_used() + p_estimate > round(s.ai_pilot_limit_eur * 0.9, 2) then
    raise exception 'AI pilot budget reached' using errcode = '53400';
  end if;
  insert into public.ai_jobs (owner_id, job_type, idempotency_key, note_id, source_revision, provider, model, estimated_cost_eur)
  values (uid, p_job_type, p_key, p_note_id, p_revision, p_provider, p_model, p_estimate)
  returning * into j;
  insert into public.ai_usage (owner_id, job_id, billing_month, provider, reserved_eur)
  values (uid, j.id, private.ai_month(), p_provider, p_estimate);
  if p_finish_hash is not null then
    insert into private.ai_job_tokens (job_id, token_hash) values (j.id, p_finish_hash);
  end if;
  return j;
end;
$$;
revoke all on function public.ai_reserve(text, text, numeric, text, text, uuid, integer, text) from public, anon;
grant execute on function public.ai_reserve(text, text, numeric, text, text, uuid, integer, text) to authenticated;

drop function public.ai_finish(uuid, boolean, numeric);
/** Finishes a reserved job with its real cost. A server job (one with a token hash) needs its token. */
create function public.ai_finish(p_job_id uuid, p_ok boolean, p_actual numeric, p_token text default null)
returns public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  j public.ai_jobs;
  h text;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into j from public.ai_jobs where id = p_job_id and owner_id = uid for update;
  if j.id is null then raise exception 'job not found' using errcode = '42501'; end if;
  select token_hash into h from private.ai_job_tokens where job_id = j.id;
  if h is not null and (p_token is null or encode(extensions.digest(p_token, 'sha256'), 'hex') <> h) then
    raise exception 'only the server can finish this job' using errcode = '42501';
  end if;
  if j.status <> 'gereserveerd' then return j; end if;
  if p_actual is null or p_actual < 0 or p_actual > 1 then raise exception 'cost out of range' using errcode = '22023'; end if;
  update public.ai_jobs
     set status = case when p_ok then 'klaar' else 'mislukt' end, actual_cost_eur = p_actual, completed_at = now()
   where id = j.id returning * into j;
  update public.ai_usage set actual_eur = p_actual where job_id = j.id;
  return j;
end;
$$;
revoke all on function public.ai_finish(uuid, boolean, numeric, text) from public, anon;
grant execute on function public.ai_finish(uuid, boolean, numeric, text) to authenticated;

-- 3 ---------------------------------------------------------------------------------------------
-- A recovery link belongs to its account: it goes with it. An invitation keeps its row (user_id set
-- null), so the history of who was invited stays. Deleting an administrator no longer wipes the
-- links they made.
alter table public.pilot_invitations drop constraint pilot_invitations_check1;
alter table public.pilot_invitations add constraint pilot_invitations_herstel_user
  check (kind = 'uitnodiging' or user_id is not null or used_at is not null or revoked_at is not null);
alter table public.pilot_invitations alter column created_by drop not null;
alter table public.pilot_invitations drop constraint pilot_invitations_created_by_fkey;
alter table public.pilot_invitations add constraint pilot_invitations_created_by_fkey
  foreign key (created_by) references public.profiles (user_id) on delete set null;

/** Before an account goes: its open recovery links are closed, so the CHECK above always holds. */
create or replace function private.pilot_close_links_of_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pilot_invitations set revoked_at = coalesce(revoked_at, now())
   where user_id = old.id and used_at is null;
  return old;
end;
$$;
revoke all on function private.pilot_close_links_of_user() from public, anon, authenticated;
create trigger pilot_close_links_before_delete before delete on auth.users
  for each row execute function private.pilot_close_links_of_user();

-- the account list in Beheer: plus the AI limit; notes in the trash no longer count
drop function public.pilot_accounts();
create function public.pilot_accounts()
returns table (user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, banned_until timestamptz,
               is_admin boolean, notes integer, ai_limit_eur numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_app_admin() then raise exception 'administrators only' using errcode = '42501'; end if;
  return query
  select u.id, u.email::text, u.created_at, u.last_sign_in_at, u.banned_until,
         exists (select 1 from public.app_admins a where a.user_id = u.id),
         (select count(*)::integer from public.notes n where n.owner_id = u.id and n.deleted_at is null),
         (select l.limit_eur from public.ai_user_limits l where l.user_id = u.id)
  from auth.users u
  order by u.created_at;
end;
$$;
revoke all on function public.pilot_accounts() from public, anon;
grant execute on function public.pilot_accounts() to authenticated;

-- 5. Reading progress comes back from an export ------------------------------------------------
/** Marks verses (canonical "BOOK.chapter.verse") as read for the signed-in owner. Only adds. */
create or replace function public.import_read_verses(p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p is null or jsonb_typeof(p) <> 'array' then raise exception 'invalid list' using errcode = '22023'; end if;
  if jsonb_array_length(p) > 40000 then raise exception 'list too long' using errcode = '22023'; end if;
  insert into public.read_verses (owner_id, verse_id)
  select uid, v.id
    from jsonb_array_elements_text(p) as x (ref)
    join public.bible_books b on b.book_code = split_part(x.ref, '.', 1)
    join public.bible_canons c on c.id = b.canon_id and c.code = 'PROT66'
    join public.bible_verses v on v.book_id = b.id
     and v.chapter_number = nullif(split_part(x.ref, '.', 2), '')::integer
     and v.verse_number = nullif(split_part(x.ref, '.', 3), '')::integer
   where x.ref ~ '^[1-3]?[A-Z]{2,3}\.[0-9]{1,3}\.[0-9]{1,3}$'
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.import_read_verses(jsonb) from public, anon;
grant execute on function public.import_read_verses(jsonb) to authenticated;
