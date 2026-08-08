-- Run several live-well checkpoints while preserving the 50-record transaction boundary.
-- This is a procedure (not a function) so it can commit after each completed source batch.
create or replace procedure private_verification.run_live_odnr_horizontal_well_batches(
  p_batch_count integer default 5,
  p_limit integer default 50
)
language plpgsql
security invoker
as $driver$
declare
  v_after bigint;
  v_result jsonb;
  v_records integer;
  v_iteration integer;
begin
  if p_batch_count<1 or p_batch_count>10 then
    raise exception 'p_batch_count must be between 1 and 10';
  end if;
  if p_limit<1 or p_limit>50 then
    raise exception 'p_limit must be between 1 and 50';
  end if;

  for v_iteration in 1..p_batch_count loop
    select coalesce((source_metadata->>'horizontal_last_object_id_staged')::bigint,0)
      into v_after
    from private_verification.public_data_sources
    where source_key='oh_odnr_live_wells';

    v_result:=private_verification.stage_live_odnr_horizontal_wells_batch(v_after,p_limit);
    v_records:=coalesce((v_result->>'records_staged')::integer,0);

    commit;

    if v_records=0 then
      exit;
    end if;
  end loop;
end
$driver$;

revoke all on procedure private_verification.run_live_odnr_horizontal_well_batches(integer,integer)
  from public,anon,authenticated;
grant execute on procedure private_verification.run_live_odnr_horizontal_well_batches(integer,integer)
  to service_role;
