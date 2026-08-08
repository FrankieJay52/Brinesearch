-- The August 3 API-token audit intentionally preserves deleted/merged pad UUIDs.
-- Current live-well matching must only treat tokens attached to a current public.pads row as proof.
do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'private_verification.stage_live_odnr_horizontal_wells_batch(bigint,integer)'::regprocedure
  ) into v_def;

  v_old:='join private_verification.pad_api_tokens_20260803 t on t.api_digits=r.normalized_facts->>''api'' where r.last_import_run_id=v_run_id';
  v_new:='join private_verification.pad_api_tokens_20260803 t on t.api_digits=r.normalized_facts->>''api'' join public.pads current_pad on current_pad.id=t.pad_id where r.last_import_run_id=v_run_id';

  if position(v_old in v_def)=0 then
    raise exception 'Expected saved-API join was not found in live horizontal-well importer';
  end if;

  execute replace(v_def,v_old,v_new);
end
$patch$;

comment on function private_verification.stage_live_odnr_horizontal_wells_batch(bigint,integer) is
  'Stages current ODNR horizontal wells. Exact saved-API matches are restricted to current public.pads records; stale audit-token UUIDs remain preserved but are not treated as current match proof.';
