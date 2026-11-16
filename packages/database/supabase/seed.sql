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
