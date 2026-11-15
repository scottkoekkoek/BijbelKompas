-- 0004 backfill: users created before migration 0001 ran (e.g. the owner's account,
-- added in the dashboard before the first deploy) never fired the signup trigger.
-- Give every existing auth user a profile and default preferences. Idempotent.

insert into public.profiles (user_id)
select u.id from auth.users u
where not exists (select 1 from public.profiles p where p.user_id = u.id);

insert into public.user_preferences (user_id)
select p.user_id from public.profiles p
where not exists (select 1 from public.user_preferences up where up.user_id = p.user_id);
