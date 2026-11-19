-- Local/CI seed only. Never run against production.
-- Contains ONLY fictitious, clearly marked test data (spec §0, §12).

insert into public.bible_translations
  (code, name, language, canon_id, rights_status, offline_allowed, ai_processing_allowed, attribution, enabled)
select 'TEST', 'Testvertaling (fictief)', 'nl', id, 'test_fixture', true, false,
       'Fictieve testtekst, geen echte Bijbelvertaling', true
from public.bible_canons where code = 'PROT66';

-- Canonical verses come from migration 0005; the test text uses Genesis 1:1-3 and 2:1-2.
insert into public.translation_segments (translation_id, segment_key, reference_label, text, display_order)
select t.id, 'GEN.' || v.c || '.' || v.n, 'Genesis ' || v.c || ':' || v.n,
       '[TESTTEKST] Fictieve regel ' || v.c || '.' || v.n || '.', v.c * 1000 + v.n
from public.bible_translations t
cross join (values (1, 1), (1, 2), (1, 3), (2, 1), (2, 2)) as v (c, n)
where t.code = 'TEST';

insert into public.verse_mappings (segment_id, canonical_verse_id, mapping_type)
select s.id, bv.id, 'exact'
from public.translation_segments s
join public.bible_translations t on t.id = s.translation_id and t.code = 'TEST'
join public.bible_books b on b.book_code = 'GEN'
join public.bible_verses bv on bv.book_id = b.id
  and 'GEN.' || bv.chapter_number || '.' || bv.verse_number = s.segment_key;

-- Sprint 9 (BK-011, AT-09): a second fictitious text with a DIFFERENT verse division, to test comparing.
-- TEST2 Genesis 1:1 covers canonical 1:1-2 (merged); TEST2 1:2 is canonical 1:3. Not allowed offline (BK-014).
insert into public.bible_translations
  (code, name, language, canon_id, rights_status, offline_allowed, ai_processing_allowed, attribution, enabled)
select 'TEST2', 'Tweede testvertaling (fictief)', 'nl', id, 'test_fixture', false, false,
       'Fictieve testtekst met andere versindeling, geen echte Bijbelvertaling', true
from public.bible_canons where code = 'PROT66';

insert into public.translation_segments (translation_id, segment_key, reference_label, text, display_order)
select t.id, 'GEN.' || v.c || '.' || v.n, 'Genesis ' || v.c || ':' || v.n,
       '[TESTTEKST 2] Andere regel ' || v.c || '.' || v.n || '.', v.c * 1000 + v.n
from public.bible_translations t
cross join (values (1, 1), (1, 2), (2, 1), (2, 2)) as v (c, n)
where t.code = 'TEST2';

insert into public.verse_mappings (segment_id, canonical_verse_id, mapping_type)
select s.id, bv.id, v.kind
from public.translation_segments s
join public.bible_translations t on t.id = s.translation_id and t.code = 'TEST2'
join (values ('GEN.1.1', 1, 1, 'merged'), ('GEN.1.1', 1, 2, 'merged'), ('GEN.1.2', 1, 3, 'exact'),
             ('GEN.2.1', 2, 1, 'exact'), ('GEN.2.2', 2, 2, 'exact')) as v (seg, c, n, kind) on v.seg = s.segment_key
join public.bible_books b on b.book_code = 'GEN'
join public.bible_verses bv on bv.book_id = b.id and bv.chapter_number = v.c and bv.verse_number = v.n;
