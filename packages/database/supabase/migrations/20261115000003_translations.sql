-- 0003 translations: translations, segments, verse mappings, rights (BK-006, afspraak 2 + 5)
-- Rights are stored per translation. Protected translations (HSV, NBV21) are reference-only:
-- the app shows the reference and a link to an external site, never the text.

create table public.bible_translations (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique check (code ~ '^[A-Z0-9_]{2,20}$'),
  name                  text not null,
  language              text not null default 'nl',
  canon_id              uuid not null references public.bible_canons (id),
  rights_status         text not null
                        check (rights_status in ('public_domain', 'licensed', 'reference_only', 'test_fixture')),
  offline_allowed       boolean not null default false,
  ai_processing_allowed boolean not null default false,
  attribution           text,
  external_url          text check (external_url is null or external_url ~ '^https://'),
  license_expires_at    timestamptz,
  enabled               boolean not null default false,
  created_at            timestamptz not null default now(),
  -- reference-only translations can never be cached offline or sent to AI
  constraint reference_only_has_no_rights check (
    rights_status <> 'reference_only' or (not offline_allowed and not ai_processing_allowed)
  )
);

create table public.translation_segments (
  id              uuid primary key default gen_random_uuid(),
  translation_id  uuid not null references public.bible_translations (id) on delete cascade,
  segment_key     text not null,          -- e.g. 'GEN.1.1' in the translation's own numbering
  reference_label text not null,          -- e.g. 'Genesis 1:1'
  text            text not null,
  display_order   integer not null,
  unique (translation_id, segment_key),
  unique (translation_id, display_order)
);

-- Many-to-many between a translation's segments and canonical verses.
-- Start simple: 'exact' for one-to-one; other types mark known differences.
create table public.verse_mappings (
  segment_id         uuid not null references public.translation_segments (id) on delete cascade,
  canonical_verse_id uuid not null references public.bible_verses (id),
  mapping_type       text not null default 'exact'
                     check (mapping_type in ('exact', 'partial', 'merged', 'split', 'uncertain')),
  primary key (segment_id, canonical_verse_id)
);
create index verse_mappings_verse_idx on public.verse_mappings (canonical_verse_id);

-- No text may be stored for reference-only translations.
create or replace function private.check_segment_rights()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  status text;
begin
  select rights_status into status from public.bible_translations where id = new.translation_id;
  if status = 'reference_only' then
    raise exception 'translation % is reference-only; storing text is not allowed', new.translation_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger translation_segments_rights_check
before insert or update on public.translation_segments
for each row execute function private.check_segment_rights();

-- A translation cannot become reference-only while it still holds text.
create or replace function private.check_translation_rights_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rights_status = 'reference_only'
     and exists (select 1 from public.translation_segments where translation_id = new.id) then
    raise exception 'translation % still has text; remove it before marking reference-only', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger bible_translations_rights_change
before update of rights_status on public.bible_translations
for each row execute function private.check_translation_rights_change();

-- preferences may point at a translation
alter table public.user_preferences
  add constraint user_preferences_default_translation_fk
  foreign key (default_translation_id) references public.bible_translations (id) on delete set null;

-- reference data: protected translations as reference-only ---------------
-- External sites to be verified in Sprint 2 (ADR-004).
insert into public.bible_translations
  (code, name, language, canon_id, rights_status, attribution, external_url, enabled)
select v.code, v.name, 'nl', c.id, 'reference_only', v.attribution, v.external_url, true
from public.bible_canons c
cross join (values
  ('HSV',   'Herziene Statenvertaling',  'Herziene Statenvertaling © Stichting HSV', 'https://www.debijbel.nl'),
  ('NBV21', 'Nieuwe Bijbelvertaling 2021', 'NBV21 © Nederlands-Vlaams Bijbelgenootschap', 'https://www.debijbel.nl')
) as v (code, name, attribution, external_url)
where c.code = 'PROT66';

-- privileges + RLS ---------------------------------------------------------
revoke all on public.bible_translations, public.translation_segments, public.verse_mappings
  from anon, authenticated;
grant select on public.bible_translations, public.translation_segments, public.verse_mappings
  to authenticated;

alter table public.bible_translations enable row level security;
alter table public.translation_segments enable row level security;
alter table public.verse_mappings enable row level security;

create policy "translations: signed-in read enabled" on public.bible_translations
  for select to authenticated using (enabled);

create policy "segments: signed-in read when text is allowed" on public.translation_segments
  for select to authenticated using (
    exists (
      select 1 from public.bible_translations t
      where t.id = translation_id
        and t.enabled
        and t.rights_status in ('public_domain', 'licensed', 'test_fixture')
        and (t.license_expires_at is null or t.license_expires_at > now())
    )
  );

create policy "mappings: signed-in read when segment visible" on public.verse_mappings
  for select to authenticated using (
    exists (select 1 from public.translation_segments s where s.id = segment_id)
  );
