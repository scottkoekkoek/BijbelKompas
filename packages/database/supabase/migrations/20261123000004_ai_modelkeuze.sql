-- Ronde 3 §4 + §6: AI-model per gebruiker en een gedeeld pilotbudget (ADR-019).
-- Only adds and redefines two functions. Nothing here sends anything anywhere.
--
-- * user_preferences.ai_model: the model the user picked. The app only uses it when the server
--   still allows that model; otherwise it falls back to the default (and says so in Instellingen).
-- * app_settings: one row with the budget per account per month and the shared pilot budget for
--   all accounts together. Only an app admin can change it. New paid work stops at 90% of either.
-- * ai_budget() now also returns the shared pilot budget; ai_reserve() checks both limits.
-- Budgets keep running across model changes: usage is counted per month, not per model.

alter table public.user_preferences
  add column ai_model text check (ai_model is null or ai_model ~ '^[a-z0-9][a-z0-9.-]{0,79}$');
grant update (ai_model) on public.user_preferences to authenticated;

create table public.app_settings (
  id                 boolean primary key default true check (id),
  ai_user_limit_eur  numeric(10, 2) not null default 5.00 check (ai_user_limit_eur >= 0 and ai_user_limit_eur <= 100),
  ai_pilot_limit_eur numeric(10, 2) not null default 25.00 check (ai_pilot_limit_eur >= 0 and ai_pilot_limit_eur <= 1000),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id) on delete set null
);
insert into public.app_settings (id) values (true) on conflict do nothing;
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;
alter table public.app_settings enable row level security;
-- holds no personal data: every signed-in account may read the limits that apply to it
create policy "app_settings: signed in reads" on public.app_settings for select to authenticated using (true);

/** Admin only (pilot): sets both monthly limits in euros. */
create or replace function public.pilot_set_ai_budget(p_user_limit numeric, p_pilot_limit numeric)
returns public.app_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.app_settings;
begin
  if not public.is_app_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  if p_user_limit is null or p_pilot_limit is null or p_user_limit < 0 or p_user_limit > 100
     or p_pilot_limit < 0 or p_pilot_limit > 1000 then
    raise exception 'limit out of range' using errcode = '22023';
  end if;
  update public.app_settings
     set ai_user_limit_eur = round(p_user_limit, 2), ai_pilot_limit_eur = round(p_pilot_limit, 2),
         updated_at = now(), updated_by = auth.uid()
   where id returning * into s;
  return s;
end;
$$;
revoke all on function public.pilot_set_ai_budget(numeric, numeric) from public, anon;
grant execute on function public.pilot_set_ai_budget(numeric, numeric) to authenticated;

/** Used by the whole pilot this month (all accounts; only a sum, never whose usage). */
create or replace function private.ai_pilot_used()
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(coalesce(u.actual_eur, u.reserved_eur)), 0)::numeric
    from public.ai_usage u where u.billing_month = private.ai_month();
$$;
revoke all on function private.ai_pilot_used() from public, anon, authenticated;

drop function public.ai_budget();
/**
 * BK-045 + pilot: this month's budget of the signed-in account and of the pilot as a whole.
 * New paid work stops at 90% of a limit, so a job whose real cost is a bit higher than estimated
 * still stays under it. With the defaults this is the familiar €5 / €4,50.
 */
create function public.ai_budget()
returns table (month date, limit_eur numeric, stop_at_eur numeric, used_eur numeric, enabled boolean,
               pilot_limit_eur numeric, pilot_stop_at_eur numeric, pilot_used_eur numeric)
language sql
stable
security definer -- the account's own rows (auth.uid()) plus one total for the pilot
set search_path = ''
as $$
  select private.ai_month(), s.ai_user_limit_eur::numeric, round(s.ai_user_limit_eur * 0.9, 2)::numeric,
         coalesce((select sum(coalesce(u.actual_eur, u.reserved_eur)) from public.ai_usage u
                   where u.owner_id = (select auth.uid()) and u.billing_month = private.ai_month()), 0)::numeric,
         coalesce((select p.ai_enabled from public.user_preferences p where p.user_id = (select auth.uid())), false),
         s.ai_pilot_limit_eur::numeric, round(s.ai_pilot_limit_eur * 0.9, 2)::numeric, private.ai_pilot_used()
    from public.app_settings s
   where (select auth.uid()) is not null;
$$;
revoke all on function public.ai_budget() from public, anon;
grant execute on function public.ai_budget() to authenticated;

/**
 * Reserves the estimated cost before any AI work starts (BK-044, BK-045, AT-12). Refuses when AI is
 * off (42501), when the account's budget would pass 90% (53400 'AI budget reached') or when the
 * shared pilot budget would (53400 'AI pilot budget reached'). The same idempotency key gives back
 * the same job, so a retry never pays twice.
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
  s public.app_settings;
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
  -- one reservation at a time for the whole pilot, so two requests cannot both squeeze under a limit
  perform pg_advisory_xact_lock(hashtextextended('ai_budget:pilot', 0));
  select * into j from public.ai_jobs where owner_id = uid and idempotency_key = p_key;
  if j.id is not null then return j; end if;
  select * into s from public.app_settings where id;
  select coalesce(sum(coalesce(actual_eur, reserved_eur)), 0) into used
    from public.ai_usage where owner_id = uid and billing_month = private.ai_month();
  if used + p_estimate > round(s.ai_user_limit_eur * 0.9, 2) then
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
  return j;
end;
$$;
