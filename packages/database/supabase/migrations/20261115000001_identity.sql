-- 0001 identity: profiles, preferences, devices (BK-005, BK-006)
-- Every personal row has an owner; RLS restricts each row to that owner (afspraak 4).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- profiles -----------------------------------------------------------------
create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 100),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- user_preferences ---------------------------------------------------------
create table public.user_preferences (
  user_id                uuid primary key references public.profiles (user_id) on delete cascade,
  default_translation_id uuid, -- FK added in translations migration
  ai_enabled             boolean not null default false,
  auto_analysis          boolean not null default false,
  theme                  text not null default 'system' check (theme in ('system', 'light', 'dark')),
  bible_font_size        smallint not null default 18 check (bible_font_size between 16 and 24),
  editor_preferences     jsonb not null default '{}'::jsonb check (jsonb_typeof(editor_preferences) = 'object'),
  offline_recent_limit   integer not null default 30 check (offline_recent_limit between 0 and 200),
  updated_at             timestamptz not null default now(),
  -- auto analysis only makes sense when AI is on
  constraint auto_analysis_requires_ai check (not auto_analysis or ai_enabled)
);

create trigger user_preferences_updated_at
before update on public.user_preferences
for each row execute function private.set_updated_at();

-- devices ------------------------------------------------------------------
create table public.devices (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (user_id) on delete cascade,
  device_label text not null check (char_length(device_label) between 1 and 100),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz
);
create index devices_owner_idx on public.devices (owner_id);

-- create profile + preferences for every new auth user -------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- privileges: start from nothing, grant only what the app needs -----------
revoke all on public.profiles, public.user_preferences, public.devices from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select on public.user_preferences to authenticated;
grant update (default_translation_id, ai_enabled, auto_analysis, theme, bible_font_size,
              editor_preferences, offline_recent_limit)
  on public.user_preferences to authenticated;

grant select, insert on public.devices to authenticated;
grant update (device_label, last_seen_at, revoked_at) on public.devices to authenticated;

-- row level security -------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.devices enable row level security;

create policy "profiles: owner reads" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()) and deleted_at is null);
create policy "profiles: owner updates" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null)
  with check (user_id = (select auth.uid()));

create policy "preferences: owner reads" on public.user_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "preferences: owner updates" on public.user_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "devices: owner reads" on public.devices
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "devices: owner registers" on public.devices
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "devices: owner updates" on public.devices
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
