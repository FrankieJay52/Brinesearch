-- Manual rollback for Issue #112 first-wave pad additions.
-- Refuses to delete rows that no longer exactly retain the prepared identity,
-- held-location state, and Issue #112 provenance marker.

begin;

do $issue112_rollback$
declare
  v_pads_before bigint;
  v_public_before bigint;
  v_deleted bigint;
  v_target_ids uuid[] := array[
    '46b82718-a6ca-437a-a2c6-f50c3f57c552'::uuid,
    '518659d9-bca2-47b0-b294-3141ba679fc4'::uuid,
    '8ed9b8f8-33f6-4701-a4a4-4849d4b8c254'::uuid
  ];
begin
  perform pg_catalog.set_config('lock_timeout', '5s', true);
  perform pg_catalog.set_config('statement_timeout', '30s', true);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue112:first-wave')
  );

  lock table public.pads in share row exclusive mode;
  lock table public.pad_verification_status in share row exclusive mode;
  lock table public.public_pad_detail in share row exclusive mode;

  select pg_catalog.count(*) into v_pads_before from public.pads;
  select pg_catalog.count(*) into v_public_before from public.public_pad_detail;

  if v_pads_before <> v_public_before then
    raise exception 'Issue #112 rollback refused: pads/public projection count mismatch';
  end if;

  if (
    select pg_catalog.count(*) from public.pads p where p.id = any(v_target_ids)
  ) <> 3 then
    raise exception 'Issue #112 rollback refused: expected all three target UUIDs';
  end if;

  if exists (
    select 1
    from public.pads p
    where p.id = any(v_target_ids)
      and (
        p.legacy_id not in ('ascent--ezekiel', 'ascent--lasso', 'ascent--shugert-daddy')
        or p.company <> 'Ascent'
        or p.state <> 'Ohio'
        or p.record_type <> 'pad'
        or p.address is not null
        or p.latitude is not null
        or p.longitude is not null
        or p.property_number is not null
        or p.written_directions is not null
        or p.directions_clear is not null
        or p.structured_road_sequence is not null
        or p.import_source <> 'Issue #112 first-wave authoritative reconciliation'
        or p.extra_data->'issue112_first_wave'->>'manifest_version' <> '1'
      )
  ) then
    raise exception 'Issue #112 rollback refused: a target row changed after preparation';
  end if;

  if (
    select pg_catalog.count(*)
    from public.pad_verification_status s
    where s.pad_id = any(v_target_ids)
  ) <> 3 then
    raise exception 'Issue #112 rollback refused: expected three target verification rows';
  end if;

  delete from public.pad_verification_status s
  where s.pad_id = any(v_target_ids);

  get diagnostics v_deleted = row_count;
  if v_deleted <> 3 then
    raise exception 'Issue #112 rollback verification deletion mismatch: %', v_deleted;
  end if;

  delete from public.pads p
  where p.id = any(v_target_ids);

  get diagnostics v_deleted = row_count;
  if v_deleted <> 3 then
    raise exception 'Issue #112 rollback pad deletion mismatch: %', v_deleted;
  end if;

  if exists (select 1 from public.pads p where p.id = any(v_target_ids))
     or exists (select 1 from public.public_pad_detail d where d.id = any(v_target_ids))
     or exists (select 1 from public.pad_verification_status s where s.pad_id = any(v_target_ids)) then
    raise exception 'Issue #112 rollback postcondition failed: target residue remains';
  end if;

  if (select pg_catalog.count(*) from public.pads) <> v_pads_before - 3
     or (select pg_catalog.count(*) from public.public_pad_detail) <> v_public_before - 3 then
    raise exception 'Issue #112 rollback postcondition failed: unexpected count delta';
  end if;

  if (select pg_catalog.count(*) from public.pads)
     <> (select pg_catalog.count(*) from public.public_pad_detail) then
    raise exception 'Issue #112 rollback postcondition failed: projection parity lost';
  end if;
end
$issue112_rollback$;

commit;
