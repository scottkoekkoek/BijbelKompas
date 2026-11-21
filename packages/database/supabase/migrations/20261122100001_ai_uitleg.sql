-- AI-uitleg bij geselecteerde verzen (ADR-017). Only adds; nothing here sends anything anywhere.
-- Only the text of a translation with ai_processing_allowed may go to an AI provider. The
-- Statenvertaling (1888, public domain; transcription CC0, ADR-005) gets that right now, by the
-- owner's choice. HSV/NBV21 stay reference_only and can never get it (constraint of migration 0003).

update public.bible_translations set ai_processing_allowed = true where code = 'SV';

alter table public.ai_jobs drop constraint ai_jobs_job_type_check;
alter table public.ai_jobs add constraint ai_jobs_job_type_check
  check (job_type in ('analyse', 'vraag', 'indexeren', 'uitleg'));

-- explanations of verses (derived data: not in the export, never changes a note) -------------------
create table public.ai_explanations (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (user_id) on delete cascade,
  job_id           uuid not null unique references public.ai_jobs (id) on delete cascade,
  translation_code text not null check (translation_code ~ '^[A-Z0-9_]{2,20}$'),
  -- the explained verses, in the translation's own numbering, e.g. {GEN.1.1, GEN.1.2}
  segment_keys     text[] not null check (cardinality(segment_keys) between 1 and 50),
  passage_label    text not null check (char_length(passage_label) between 1 and 120),
  explanation      text not null check (char_length(explanation) between 1 and 6000),
  -- [{"reference": "Johannes 1:1", "reason": "..."}]: suggestions to look up, not checked texts
  cross_references jsonb not null default '[]'
                   check (jsonb_typeof(cross_references) = 'array' and jsonb_array_length(cross_references) <= 10),
  model_version    text not null,
  created_at       timestamptz not null default now()
);
create index ai_explanations_owner_idx on public.ai_explanations (owner_id, created_at desc);
revoke all on public.ai_explanations from anon, authenticated;
grant select on public.ai_explanations to authenticated;
alter table public.ai_explanations enable row level security;
create policy "ai_explanations: owner reads" on public.ai_explanations for select to authenticated
  using (owner_id = (select auth.uid()));

/**
 * Stores the explanation of a reserved 'uitleg' job. Refused unless the translation may be processed
 * by AI and every explained verse exists in it. Cross-references are kept as plain suggestions.
 */
create or replace function public.ai_add_explanation(
  p_job_id uuid, p_translation text, p_keys text[], p_label text, p_explanation text, p_cross jsonb
) returns public.ai_explanations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  j public.ai_jobs;
  t public.bible_translations;
  r jsonb;
  xrefs jsonb := '[]'::jsonb;
  e public.ai_explanations;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into j from public.ai_jobs where id = p_job_id and owner_id = uid;
  if j.id is null or j.status <> 'gereserveerd' or j.job_type <> 'uitleg' then
    raise exception 'job not open' using errcode = '42501';
  end if;
  select * into t from public.bible_translations where code = p_translation and enabled;
  if t.id is null or not t.ai_processing_allowed then
    raise exception 'translation may not be processed by AI' using errcode = '42501';
  end if;
  if p_keys is null or cardinality(p_keys) not between 1 and 50
     or (select count(*) from public.translation_segments s where s.translation_id = t.id and s.segment_key = any (p_keys))
        <> (select count(distinct k) from unnest(p_keys) k) then
    raise exception 'unknown verses' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_cross, '[]'::jsonb)) <> 'array' then raise exception 'invalid cross references' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_cross, '[]'::jsonb)) limit 10 loop
    continue when jsonb_typeof(r) <> 'object' or btrim(coalesce(r->>'reference', '')) = '';
    xrefs := xrefs || jsonb_build_array(jsonb_build_object(
      'reference', left(btrim(r->>'reference'), 60), 'reason', left(btrim(coalesce(r->>'reason', '')), 300)));
  end loop;
  insert into public.ai_explanations (owner_id, job_id, translation_code, segment_keys, passage_label, explanation, cross_references, model_version)
  values (uid, j.id, t.code, p_keys, left(btrim(p_label), 120), left(coalesce(nullif(btrim(p_explanation), ''), '-'), 6000), xrefs, j.provider || '/' || j.model)
  returning * into e;
  return e;
end;
$$;
revoke all on function public.ai_add_explanation(uuid, text, text[], text, text, jsonb) from public, anon;
grant execute on function public.ai_add_explanation(uuid, text, text[], text, text, jsonb) to authenticated;
