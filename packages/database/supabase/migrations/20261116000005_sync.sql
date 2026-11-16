-- 0009 offline sync (Sprint 5: BK-025, BK-027, BK-028; ADR-006)
--
-- * Every change made on a device is an operation with a unique operation id. Sending the same
--   operation twice changes the server once (AT-07); the stored outcome is returned again.
-- * A note created offline gets its id on the device, so it reaches the server exactly once (AT-01).
-- * Conflicts are never resolved by overwriting: the operation is recorded as 'conflict' and the
--   device keeps its text (as a conflict copy, ADR-000).
-- * Personal tables have owner_id + RLS; the app can only read them. Writes go through functions.

-- public.devices exists since 0001 (owner-only RLS); devices are registered via register_device below.

create table public.sync_operations (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (user_id) on delete cascade,
  device_id      uuid not null references public.devices (id) on delete cascade,
  operation_id   uuid not null,
  note_id        uuid not null,
  operation_type text not null check (operation_type in ('create', 'save')),
  base_version   integer,
  status         text not null check (status in ('accepted', 'conflict', 'rejected')),
  result_version integer,
  created_at     timestamptz not null default now(),
  unique (device_id, operation_id)
);
create index sync_operations_owner_idx on public.sync_operations (owner_id, created_at desc);

revoke all on public.sync_operations from anon, authenticated;
grant select on public.sync_operations to authenticated;
alter table public.sync_operations enable row level security;
create policy "sync operations: owner reads" on public.sync_operations
  for select to authenticated using (owner_id = (select auth.uid()));

/** Registers this device for the signed-in owner (idempotent). Another owner's device id is refused. */
create or replace function public.register_device(p_device_id uuid, p_label text default 'Apparaat')
returns public.devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d public.devices;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.devices (id, owner_id, device_label)
  values (p_device_id, uid, left(coalesce(nullif(btrim(p_label), ''), 'Apparaat'), 100))
  on conflict (id) do update set last_seen_at = now()
    where public.devices.owner_id = uid
  returning * into d;
  if d.id is null then raise exception 'device belongs to someone else' using errcode = '42501'; end if;
  if d.revoked_at is not null then raise exception 'device revoked' using errcode = '42501'; end if;
  return d;
end;
$$;

/**
 * Applies one operation from a device, exactly once.
 * Returns {"status": "accepted"|"duplicate"|"conflict"|"rejected", "original": <first status for a
 * duplicate>, "message": <for rejected>, "note": <the note row as it is now, if visible>}.
 * 'create' makes the note with the device's id and then saves the content; 'save' is save_note.
 */
create or replace function public.sync_apply(
  p_device_id uuid, p_operation_id uuid, p_type text, p_note_id uuid, p_base_version integer,
  p_title text, p_note_type text, p_event_date date, p_document jsonb, p_content_hash text,
  p_blocks jsonb, p_links jsonb, p_reason text default null, p_status text default null,
  p_sermon jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  dev public.devices;
  op public.sync_operations;
  n public.notes;
  outcome text := 'accepted';
  msg text;
  base integer := p_base_version;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into dev from public.devices where id = p_device_id;
  if dev.id is null or dev.owner_id <> uid or dev.revoked_at is not null then
    raise exception 'unknown device' using errcode = '42501';
  end if;
  if p_type not in ('create', 'save') then raise exception 'invalid operation type' using errcode = '22023'; end if;

  -- already applied: answer the same way again, change nothing
  select * into op from public.sync_operations where device_id = p_device_id and operation_id = p_operation_id;
  if op.id is not null then
    select * into n from public.notes where id = op.note_id and owner_id = uid;
    return jsonb_build_object('status', 'duplicate', 'original', op.status,
                              'note', case when n.id is null then null else to_jsonb(n) end);
  end if;

  begin
    if p_type = 'create' then
      if exists (select 1 from public.notes where id = p_note_id) then
        raise exception 'note id already in use' using errcode = '40001';
      end if;
      insert into public.notes (id, owner_id, title, note_type, event_date)
      values (p_note_id, uid, coalesce(p_title, ''), coalesce(p_note_type, 'vrij'), p_event_date);
      insert into public.note_documents (note_id, owner_id, document_json, content_hash)
      values (p_note_id, uid, '{"type":"doc","content":[]}'::jsonb, 'nieuw');
      base := 1;
    end if;
    select * into n from public.save_note(p_note_id, base, p_title, p_note_type, p_event_date, p_document,
      p_content_hash, p_blocks, p_links, p_reason, p_status, p_sermon);
  exception
    when sqlstate '40001' then
      outcome := 'conflict';
    when sqlstate '22023' or sqlstate '23514' or sqlstate '22P02' or sqlstate '23502' then
      outcome := 'rejected';
      msg := sqlerrm;
  end;

  if outcome <> 'accepted' then
    select * into n from public.notes where id = p_note_id and owner_id = uid;
  end if;
  -- an operation on someone else's note is refused outright (and not recorded)
  if outcome = 'conflict' and p_type = 'save' and n.id is null then
    raise exception 'note not found' using errcode = '42501';
  end if;

  insert into public.sync_operations
    (owner_id, device_id, operation_id, note_id, operation_type, base_version, status, result_version)
  values (uid, p_device_id, p_operation_id, p_note_id, p_type, p_base_version, outcome, n.document_version);
  update public.devices set last_seen_at = now() where id = p_device_id;

  return jsonb_build_object('status', outcome, 'message', msg,
                            'note', case when n.id is null then null else to_jsonb(n) end);
end;
$$;

revoke all on function public.register_device(uuid, text) from public, anon;
grant execute on function public.register_device(uuid, text) to authenticated;
revoke all on function public.sync_apply(uuid, uuid, text, uuid, integer, text, text, date, jsonb, text, jsonb, jsonb, text, text, jsonb) from public, anon;
grant execute on function public.sync_apply(uuid, uuid, text, uuid, integer, text, text, date, jsonb, text, jsonb, jsonb, text, text, jsonb) to authenticated;

-- pulling changes: cheap ordered summaries by (updated_at, id)
create index notes_owner_sync_idx on public.notes (owner_id, updated_at, id);
