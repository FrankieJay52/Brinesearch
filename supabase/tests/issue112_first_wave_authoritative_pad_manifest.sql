-- Run against a non-production database after applying the Issue #112 migration.
-- This test is read-only and leaves the test database unchanged.

begin read only;

do $issue112_test$
declare
  v_target_ids uuid[] := array[
    '46b82718-a6ca-437a-a2c6-f50c3f57c552'::uuid,
    '518659d9-bca2-47b0-b294-3141ba679fc4'::uuid,
    '8ed9b8f8-33f6-4701-a4a4-4849d4b8c254'::uuid
  ];
begin
  if (select pg_catalog.count(*) from public.pads where id = any(v_target_ids)) <> 3 then
    raise exception 'Issue #112 test failed: private rows missing';
  end if;

  if (select pg_catalog.count(*) from public.public_pad_detail where id = any(v_target_ids)) <> 3 then
    raise exception 'Issue #112 test failed: projection rows missing';
  end if;

  if (select pg_catalog.count(*) from public.pad_verification_status where pad_id = any(v_target_ids)) <> 3 then
    raise exception 'Issue #112 test failed: verification rows missing';
  end if;

  if exists (
    select 1 from public.pads p
    where p.id = any(v_target_ids)
      and (
        p.address is not null
        or p.latitude is not null
        or p.longitude is not null
        or p.property_number is not null
        or p.written_directions is not null
        or p.directions_clear is not null
        or p.structured_road_sequence is not null
      )
  ) then
    raise exception 'Issue #112 test failed: held driver/route field was populated';
  end if;

  if (select pg_catalog.count(*) from public.pads)
     <> (select pg_catalog.count(*) from public.public_pad_detail) then
    raise exception 'Issue #112 test failed: projection parity mismatch';
  end if;
end
$issue112_test$;

rollback;
