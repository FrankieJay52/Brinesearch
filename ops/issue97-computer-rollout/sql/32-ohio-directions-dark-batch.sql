\set ON_ERROR_STOP on
\pset pager off
\timing on

-- Ohio-only post-activation dark route preparation. This intentionally does not
-- run the global saved-road reconciliation, Google publication, graph activation
-- or global cutover. Every Ohio non-list-only pad is processed against exactly
-- one active release-current graph in each of the 19 registered Ohio counties.

begin read only;
set local statement_timeout='5min';

do $issue97_ohio_direction_preflight$
declare
  v_counties integer;
  v_sources integer;
  v_current_sources integer;
  v_pads integer;
begin
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Issue #97 Ohio dark directions require global cutover OFF';
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 Ohio dark directions refuse a staging graph';
  end if;
  if exists(select 1 from pg_catalog.pg_stat_activity activity
      where activity.pid<>pg_catalog.pg_backend_pid()
        and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
        and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%') then
    raise exception 'Issue #97 Ohio dark directions refuse an active graph builder';
  end if;

  select count(*)::integer into v_counties
  from public.brinesearch_road_graph_counties county
  where county.active and county.state_code='OH'
    and (select count(*) from public.brinesearch_road_graph_builds build
      where build.state_code='OH' and build.county_code=county.county_code
        and build.status='active'
        and private_verification.brinesearch_issue97_graph_build_release_current(build.id))=1;
  if v_counties<>19 then
    raise exception 'Issue #97 Ohio dark directions require 19/19 active release-current Ohio graphs; found %',v_counties;
  end if;

  select count(*)::integer,
    count(*) filter(where private_verification.brinesearch_issue97_dataset_scope_current(
      scope.dataset_id,scope.state_code,scope.county_code
    ))::integer
  into v_sources,v_current_sources
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset
    on dataset.id=scope.dataset_id and dataset.active
  where scope.active and scope.ingest_enabled and scope.required_for_graph
    and scope.state_code='OH';
  if v_sources<>38 or v_current_sources<>38 then
    raise exception 'Issue #97 Ohio dark directions require Ohio source scopes 38/38 current; found %/%',
      v_current_sources,v_sources;
  end if;

  select count(*)::integer into v_pads
  from public.pads pad
  where pad.state='Ohio' and coalesce(pad.list_only,false)=false;
  if v_pads<>939 then
    raise exception 'Issue #97 reviewed Ohio non-list-only pad denominator changed; expected 939 found %',v_pads;
  end if;
end
$issue97_ohio_direction_preflight$;

rollback;

begin;
set local statement_timeout='90min';
set local lock_timeout='2min';

do $issue97_ohio_direction_batch$
declare
  pad_row record;
  v_processed integer:=0;
begin
  if public.brinesearch_issue97_cutover_active()
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 Ohio dark direction execution guard failed';
  end if;

  for pad_row in
    select pad.id
    from public.pads pad
    where pad.state='Ohio' and coalesce(pad.list_only,false)=false
    order by pad.id
  loop
    perform public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(pad_row.id);
    v_processed:=v_processed+1;
  end loop;
  if v_processed<>939 then
    raise exception 'Issue #97 Ohio dark direction batch processed % pads; expected 939',v_processed;
  end if;
end
$issue97_ohio_direction_batch$;

commit;

begin read only;
set local statement_timeout='5min';

do $issue97_ohio_direction_postcheck$
begin
  if public.brinesearch_issue97_cutover_active()
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0 then
    raise exception 'Issue #97 Ohio dark direction batch changed cutover/staging/public Google state';
  end if;
  if exists(
    select 1 from public.pads pad
    where pad.state<>'Ohio'
      and exists(
        select 1
        from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
        where receipt.pad_id=pad.id
          and receipt.updated_at>=pg_catalog.transaction_timestamp()-interval '5 minutes'
      )
  ) then
    raise exception 'Issue #97 Ohio dark direction batch touched a non-Ohio route receipt';
  end if;
end
$issue97_ohio_direction_postcheck$;

commit;
\echo 'Issue #97 Ohio-only dark direction reconciliation completed for 939 pads; Google/public cutover remains dark.'
