-- Local/CI seed only. Never run against production.
-- Contains ONLY fictitious, clearly marked test data (spec §0, §12).

insert into public.bible_translations
  (code, name, language, canon_id, rights_status, offline_allowed, ai_processing_allowed, attribution, enabled)
select 'TEST', 'Testvertaling (fictief)', 'nl', id, 'test_fixture', true, false,
       'Fictieve testtekst, geen echte Bijbelvertaling', true
from public.bible_canons where code = 'PROT66';

-- three canonical verses of Genesis 1 so mappings can be tested
insert into public.bible_verses (canon_id, book_id, chapter_number, verse_number, canonical_order)
select b.canon_id, b.id, 1, v.n, 1000000 + v.n
from public.bible_books b
cross join (values (1), (2), (3)) as v (n)
where b.book_code = 'GEN';

insert into public.translation_segments (translation_id, segment_key, reference_label, text, display_order)
select t.id, 'GEN.1.' || v.n, 'Genesis 1:' || v.n, '[TESTTEKST] Fictieve regel ' || v.n || '.', v.n
from public.bible_translations t
cross join (values (1), (2), (3)) as v (n)
where t.code = 'TEST';

insert into public.verse_mappings (segment_id, canonical_verse_id, mapping_type)
select s.id, bv.id, 'exact'
from public.translation_segments s
join public.bible_translations t on t.id = s.translation_id and t.code = 'TEST'
join public.bible_books b on b.book_code = 'GEN'
join public.bible_verses bv on bv.book_id = b.id and bv.chapter_number = 1
  and 'GEN.1.' || bv.verse_number = s.segment_key;
