-- 0002 bible_core: canon, books, canonical verses (BK-006, afspraak 5)
-- Canonical verse identity is independent of any translation. Translations map onto it.

create table public.bible_canons (
  id   uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_]{2,20}$'),
  name text not null
);

create table public.bible_books (
  id            uuid primary key default gen_random_uuid(),
  canon_id      uuid not null references public.bible_canons (id),
  book_code     text not null check (book_code ~ '^[1-3]?[A-Z]{2,3}$'),
  book_order    smallint not null check (book_order >= 1),
  name          text not null,
  testament     text not null check (testament in ('OT', 'NT')),
  chapter_count smallint not null check (chapter_count >= 1),
  unique (canon_id, book_code),
  unique (canon_id, book_order),
  unique (id, canon_id) -- target for the composite FK below
);

create table public.bible_verses (
  id              uuid primary key default gen_random_uuid(),
  canon_id        uuid not null,
  book_id         uuid not null,
  chapter_number  smallint not null check (chapter_number >= 1),
  verse_number    smallint not null check (verse_number >= 1),
  canonical_order integer not null,
  -- a verse can only belong to a book of the same canon
  foreign key (book_id, canon_id) references public.bible_books (id, canon_id),
  unique (canon_id, book_id, chapter_number, verse_number),
  unique (canon_id, canonical_order)
);

create or replace function private.check_verse_chapter()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_chapter smallint;
begin
  select chapter_count into max_chapter from public.bible_books where id = new.book_id;
  if new.chapter_number > max_chapter then
    raise exception 'chapter % exceeds chapter_count % of book %', new.chapter_number, max_chapter, new.book_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger bible_verses_chapter_check
before insert or update on public.bible_verses
for each row execute function private.check_verse_chapter();

-- reference data: Protestant 66-book canon ---------------------------------
insert into public.bible_canons (code, name) values ('PROT66', 'Protestantse canon (66 boeken)');

insert into public.bible_books (canon_id, book_code, book_order, name, testament, chapter_count)
select c.id, v.book_code, v.book_order, v.name, v.testament, v.chapter_count
from public.bible_canons c
cross join (values
  ('GEN', 1, 'Genesis', 'OT', 50),
  ('EXO', 2, 'Exodus', 'OT', 40),
  ('LEV', 3, 'Leviticus', 'OT', 27),
  ('NUM', 4, 'Numeri', 'OT', 36),
  ('DEU', 5, 'Deuteronomium', 'OT', 34),
  ('JOS', 6, 'Jozua', 'OT', 24),
  ('JDG', 7, 'Richteren', 'OT', 21),
  ('RUT', 8, 'Ruth', 'OT', 4),
  ('1SA', 9, '1 Samuël', 'OT', 31),
  ('2SA', 10, '2 Samuël', 'OT', 24),
  ('1KI', 11, '1 Koningen', 'OT', 22),
  ('2KI', 12, '2 Koningen', 'OT', 25),
  ('1CH', 13, '1 Kronieken', 'OT', 29),
  ('2CH', 14, '2 Kronieken', 'OT', 36),
  ('EZR', 15, 'Ezra', 'OT', 10),
  ('NEH', 16, 'Nehemia', 'OT', 13),
  ('EST', 17, 'Esther', 'OT', 10),
  ('JOB', 18, 'Job', 'OT', 42),
  ('PSA', 19, 'Psalmen', 'OT', 150),
  ('PRO', 20, 'Spreuken', 'OT', 31),
  ('ECC', 21, 'Prediker', 'OT', 12),
  ('SNG', 22, 'Hooglied', 'OT', 8),
  ('ISA', 23, 'Jesaja', 'OT', 66),
  ('JER', 24, 'Jeremia', 'OT', 52),
  ('LAM', 25, 'Klaagliederen', 'OT', 5),
  ('EZK', 26, 'Ezechiël', 'OT', 48),
  ('DAN', 27, 'Daniël', 'OT', 12),
  ('HOS', 28, 'Hosea', 'OT', 14),
  ('JOL', 29, 'Joël', 'OT', 3),
  ('AMO', 30, 'Amos', 'OT', 9),
  ('OBA', 31, 'Obadja', 'OT', 1),
  ('JON', 32, 'Jona', 'OT', 4),
  ('MIC', 33, 'Micha', 'OT', 7),
  ('NAM', 34, 'Nahum', 'OT', 3),
  ('HAB', 35, 'Habakuk', 'OT', 3),
  ('ZEP', 36, 'Sefanja', 'OT', 3),
  ('HAG', 37, 'Haggai', 'OT', 2),
  ('ZEC', 38, 'Zacharia', 'OT', 14),
  ('MAL', 39, 'Maleachi', 'OT', 4),
  ('MAT', 40, 'Mattheüs', 'NT', 28),
  ('MRK', 41, 'Markus', 'NT', 16),
  ('LUK', 42, 'Lukas', 'NT', 24),
  ('JHN', 43, 'Johannes', 'NT', 21),
  ('ACT', 44, 'Handelingen', 'NT', 28),
  ('ROM', 45, 'Romeinen', 'NT', 16),
  ('1CO', 46, '1 Korinthe', 'NT', 16),
  ('2CO', 47, '2 Korinthe', 'NT', 13),
  ('GAL', 48, 'Galaten', 'NT', 6),
  ('EPH', 49, 'Efeze', 'NT', 6),
  ('PHP', 50, 'Filippenzen', 'NT', 4),
  ('COL', 51, 'Kolossenzen', 'NT', 4),
  ('1TH', 52, '1 Thessalonicenzen', 'NT', 5),
  ('2TH', 53, '2 Thessalonicenzen', 'NT', 3),
  ('1TI', 54, '1 Timotheüs', 'NT', 6),
  ('2TI', 55, '2 Timotheüs', 'NT', 4),
  ('TIT', 56, 'Titus', 'NT', 3),
  ('PHM', 57, 'Filemon', 'NT', 1),
  ('HEB', 58, 'Hebreeën', 'NT', 13),
  ('JAS', 59, 'Jakobus', 'NT', 5),
  ('1PE', 60, '1 Petrus', 'NT', 5),
  ('2PE', 61, '2 Petrus', 'NT', 3),
  ('1JN', 62, '1 Johannes', 'NT', 5),
  ('2JN', 63, '2 Johannes', 'NT', 1),
  ('3JN', 64, '3 Johannes', 'NT', 1),
  ('JUD', 65, 'Judas', 'NT', 1),
  ('REV', 66, 'Openbaring', 'NT', 22)
) as v (book_code, book_order, name, testament, chapter_count)
where c.code = 'PROT66';

-- privileges + RLS: read-only reference data for signed-in users -----------
revoke all on public.bible_canons, public.bible_books, public.bible_verses from anon, authenticated;
grant select on public.bible_canons, public.bible_books, public.bible_verses to authenticated;

alter table public.bible_canons enable row level security;
alter table public.bible_books enable row level security;
alter table public.bible_verses enable row level security;

create policy "canons: signed-in read" on public.bible_canons for select to authenticated using (true);
create policy "books: signed-in read" on public.bible_books for select to authenticated using (true);
create policy "verses: signed-in read" on public.bible_verses for select to authenticated using (true);
