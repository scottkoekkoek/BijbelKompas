-- Ronde 3 §6: closed pilot for more than one person. Only adds; nothing existing changes.
-- * Public signup stays off ([auth] enable_signup = false). New accounts exist only through an
--   invitation: an administrator makes a link that expires and can be revoked; the server (with
--   the secret key, never in the browser) creates the account when the link is used.
-- * Every personal table already has owner_id + RLS, so each account has its own workspace. The
--   Bible catalogue stays shared.
-- * An administrator is a row in app_admins. Only the database owner (migration or SQL editor)
--   can add one; the app can never make someone an administrator.

create table public.app_admins (
  user_id    uuid primary key references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on public.app_admins from anon, authenticated;
grant select on public.app_admins to authenticated;
alter table public.app_admins enable row level security;
-- you can only see whether YOU are an administrator
create policy "app_admins: own row" on public.app_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- Until now the app had exactly one user (ADR-000, afspraak 4): that is the owner, who becomes the
-- first administrator. With more (or no) users nobody is chosen; see docs/runbooks/pilot.md.
insert into public.app_admins (user_id)
select user_id from public.profiles
where (select count(*) from public.profiles) = 1;

-- in public (not private): RLS policies run with the caller's rights, and the private schema stays
-- closed to signed-in users. It only ever answers for the caller.
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

-- invitations and recovery links --------------------------------------------------------------
create table public.pilot_invitations (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'uitnodiging' check (kind in ('uitnodiging', 'herstel')),
  email       text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and email like '%_@_%'),
  -- only the sha-256 of the token is stored; the link itself is shown once to the administrator
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by  uuid not null references public.profiles (user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  used_at     timestamptz,
  -- the account it made (uitnodiging) or is for (herstel)
  user_id     uuid references auth.users (id) on delete set null,
  check (expires_at > created_at and expires_at <= created_at + interval '30 days'),
  check (kind = 'uitnodiging' or user_id is not null)
);
create index pilot_invitations_created_idx on public.pilot_invitations (created_at desc);
revoke all on public.pilot_invitations from anon, authenticated;
grant select on public.pilot_invitations to authenticated;
alter table public.pilot_invitations enable row level security;
create policy "pilot_invitations: administrators read" on public.pilot_invitations for select to authenticated
  using ((select public.is_app_admin()));

/** An administrator makes an invitation (or a recovery link for an existing account). */
create or replace function public.pilot_create_invitation(p_email text, p_days integer, p_token_hash text, p_kind text default 'uitnodiging')
returns public.pilot_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mail text := lower(btrim(coalesce(p_email, '')));
  target uuid;
  i public.pilot_invitations;
begin
  if uid is null or not public.is_app_admin() then raise exception 'administrators only' using errcode = '42501'; end if;
  if p_days is null or p_days < 1 or p_days > 30 then raise exception 'validity out of range' using errcode = '22023'; end if;
  if p_kind not in ('uitnodiging', 'herstel') then raise exception 'invalid kind' using errcode = '22023'; end if;
  select id into target from auth.users where lower(email) = mail;
  if p_kind = 'uitnodiging' and target is not null then raise exception 'account exists' using errcode = '23505'; end if;
  if p_kind = 'herstel' and target is null then raise exception 'no such account' using errcode = '22023'; end if;
  -- one open link per address and kind: a new one replaces the old one
  update public.pilot_invitations set revoked_at = now()
   where email = mail and kind = p_kind and used_at is null and revoked_at is null;
  insert into public.pilot_invitations (kind, email, token_hash, created_by, expires_at, user_id)
  values (p_kind, mail, p_token_hash, uid, now() + make_interval(days => p_days), target)
  returning * into i;
  return i;
end;
$$;

create or replace function public.pilot_revoke_invitation(p_id uuid)
returns public.pilot_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.pilot_invitations;
begin
  if auth.uid() is null or not public.is_app_admin() then raise exception 'administrators only' using errcode = '42501'; end if;
  update public.pilot_invitations set revoked_at = coalesce(revoked_at, now())
   where id = p_id and used_at is null
  returning * into i;
  if i.id is null then raise exception 'invitation not open' using errcode = '22023'; end if;
  return i;
end;
$$;

/** The accounts of the pilot, for administrators: no content, only what is needed to manage access. */
create or replace function public.pilot_accounts()
returns table (user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, banned_until timestamptz,
               is_admin boolean, notes integer)
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
         (select count(*)::integer from public.notes n where n.owner_id = u.id)
  from auth.users u
  order by u.created_at;
end;
$$;

-- Used only by the server with the secret key while a link is redeemed (never by a browser).
/** Takes an open, unexpired link for this address, atomically, so it can be used only once. */
create or replace function public.pilot_claim_invitation(p_token_hash text, p_email text)
returns public.pilot_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.pilot_invitations;
begin
  update public.pilot_invitations set used_at = now()
   where token_hash = p_token_hash and email = lower(btrim(coalesce(p_email, '')))
     and used_at is null and revoked_at is null and expires_at > now()
  returning * into i;
  if i.id is null then raise exception 'invitation not valid' using errcode = '42501'; end if;
  return i;
end;
$$;

/** Puts a claimed link back when creating the account failed, or records the account it made. */
create or replace function public.pilot_finish_invitation(p_id uuid, p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.pilot_invitations
     set used_at = case when p_user_id is null then null else used_at end,
         user_id = coalesce(p_user_id, user_id)
   where id = p_id;
$$;

/** What the link page may show before anything is typed: only whether the link can still be used. */
create or replace function public.pilot_invitation_state(p_token_hash text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when used_at is not null then 'gebruikt'
                when revoked_at is not null then 'ingetrokken'
                when expires_at <= now() then 'verlopen'
                else kind end
    from public.pilot_invitations where token_hash = p_token_hash), 'onbekend');
$$;

revoke all on function public.pilot_create_invitation(text, integer, text, text) from public, anon;
revoke all on function public.pilot_revoke_invitation(uuid) from public, anon;
revoke all on function public.pilot_accounts() from public, anon;
revoke all on function public.pilot_claim_invitation(text, text) from public, anon, authenticated;
revoke all on function public.pilot_finish_invitation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pilot_invitation_state(text) from public, anon, authenticated;
grant execute on function public.pilot_create_invitation(text, integer, text, text) to authenticated;
grant execute on function public.pilot_revoke_invitation(uuid) to authenticated;
grant execute on function public.pilot_accounts() to authenticated;
grant execute on function public.pilot_claim_invitation(text, text) to service_role;
grant execute on function public.pilot_finish_invitation(uuid, uuid) to service_role;
grant execute on function public.pilot_invitation_state(text) to service_role;

/** Ends every open session of an account whose access is closed (server with the secret key only). */
create or replace function public.pilot_end_sessions(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;
revoke all on function public.pilot_end_sessions(uuid) from public, anon, authenticated;
grant execute on function public.pilot_end_sessions(uuid) to service_role;
