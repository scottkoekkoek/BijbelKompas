-- Ronde 4 (ADR-020), pilot start: feedback from inside the app (V9) and a one-time welcome (V8).
-- Deleting an account (V10) needs no new table: every personal row already cascades from
-- auth.users, which the database test "account verwijderen" checks table by table.

-- 1. Feedback. A tester writes and reads their own; an administrator reads all of it.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 4000),
  page text check (page is null or (char_length(page) <= 300 and page like '/%')),
  viewport text check (viewport is null or viewport ~ '^[0-9]{2,5}x[0-9]{2,5}$'),
  created_at timestamptz not null default now()
);
create index feedback_created_idx on public.feedback (created_at desc);
create index feedback_owner_idx on public.feedback (owner_id);
alter table public.feedback enable row level security;

revoke all on public.feedback from anon, authenticated;
grant select, insert on public.feedback to authenticated;

create policy "feedback: owner writes own" on public.feedback
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "feedback: owner or admin reads" on public.feedback
  for select to authenticated using (owner_id = (select auth.uid()) or (select public.is_app_admin()));

-- The administrator sees who wrote it (e-mail), never anyone's notes.
create or replace function public.pilot_feedback(p_limit int default 100)
returns table (id uuid, email text, message text, page text, viewport text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'alleen een beheerder' using errcode = '42501';
  end if;
  return query
    select f.id, u.email::text, f.message, f.page, f.viewport, f.created_at
    from public.feedback f join auth.users u on u.id = f.owner_id
    order by f.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;
revoke all on function public.pilot_feedback(int) from public, anon;
grant execute on function public.pilot_feedback(int) to authenticated;

-- 2. Welcome card: shown once, until the owner closes it.
alter table public.user_preferences add column welcome_dismissed_at timestamptz;
grant update (welcome_dismissed_at) on public.user_preferences to authenticated;

-- 3. Is this the only administrator? Then the account cannot delete itself (nobody would be left
--    to manage the pilot).
create or replace function public.pilot_is_last_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
     and (select count(*) from public.app_admins) = 1;
$$;
revoke all on function public.pilot_is_last_admin() from public, anon;
grant execute on function public.pilot_is_last_admin() to authenticated;
