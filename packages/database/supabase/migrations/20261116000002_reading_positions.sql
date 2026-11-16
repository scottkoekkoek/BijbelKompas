-- 0006 reading position: where the owner stopped reading (Sprint 2, "verder lezen").
-- One row per owner. Personal data: owner_id + RLS, no DELETE for the app (row goes with the account).

create table public.reading_positions (
  owner_id       uuid primary key references public.profiles (user_id) on delete cascade,
  translation_id uuid not null references public.bible_translations (id),
  book_id        uuid not null references public.bible_books (id),
  chapter_number smallint not null check (chapter_number >= 1),
  updated_at     timestamptz not null default now()
);

create or replace function private.check_reading_position()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_chapter smallint;
begin
  select chapter_count into max_chapter from public.bible_books where id = new.book_id;
  if new.chapter_number > max_chapter then
    raise exception 'chapter % exceeds chapter_count %', new.chapter_number, max_chapter
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger reading_positions_check
  before insert or update on public.reading_positions
  for each row execute function private.check_reading_position();

revoke all on public.reading_positions from anon, authenticated;
grant select, insert on public.reading_positions to authenticated;
grant update (owner_id, translation_id, book_id, chapter_number) on public.reading_positions to authenticated;

alter table public.reading_positions enable row level security;

create policy "reading: owner reads" on public.reading_positions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "reading: owner inserts" on public.reading_positions
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "reading: owner updates" on public.reading_positions
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
