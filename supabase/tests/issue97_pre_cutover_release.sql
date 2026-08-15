-- GitHub #97 — pre-cutover production authorization gate.
-- This suite requires all exact release manifests plus one current persisted
-- final verification report, while requiring cutover to remain OFF.
begin transaction read only;
set local statement_timeout='15min';
set local lock_timeout='5s';

do $issue97_pre_cutover$
declare
  v_count integer;
  v_report_count integer;
  v_baseline record;
  v_reconcile record;
  v_child jsonb;
begin
  if public.brinesearch_issue97_cutover_active() then
    raise exception '#97 pre-cutover suite requires cutover OFF';
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception '#97 pre-cutover suite refuses staging graphs';
  end if;
  if not private_verification.brinesearch_issue97_release_manifest_current() then
    raise exception '#97 reviewed 39-county/114-scope release manifest changed';
  end if;

  -- Exact corrected pad-county footprint from the reviewed #97 scope migration:
  -- Meigs/Vinton/Lewis are in; the stale Holmes/Licking/WV-Harrison WIP rows are not.
  with expected(state_code,county_code) as (values
    ('OH','ATH'),('OH','BEL'),('OH','CAR'),('OH','COL'),('OH','COS'),('OH','GUE'),
    ('OH','HAS'),('OH','JEF'),('OH','MAH'),('OH','MEG'),('OH','MOE'),('OH','MUS'),
    ('OH','NOB'),('OH','POR'),('OH','STA'),('OH','TRU'),('OH','TUS'),('OH','VIN'),('OH','WAS'),
    ('WV','BRO'),('WV','DOD'),('WV','LEW'),('WV','MAR'),('WV','MSH'),('WV','MON'),
    ('WV','OHI'),('WV','RIT'),('WV','TYL'),('WV','WET'),
    ('PA','ALL'),('PA','ARM'),('PA','BEA'),('PA','BRA'),('PA','BUT'),('PA','FAY'),
    ('PA','GRE'),('PA','IND'),('PA','WAS'),('PA','WES')
  ), actual as (
    select b.state_code,b.county_code,count(*)::integer as active_count,
      count(*) filter(where private_verification.brinesearch_issue97_graph_build_release_current(b.id))::integer as current_count
    from public.brinesearch_road_graph_builds b
    where b.status='active'
    group by b.state_code,b.county_code
  )
  select count(*)::integer into v_count
  from expected e full join actual a using(state_code,county_code)
  where e.state_code is null or a.state_code is null
     or a.active_count<>1 or a.current_count<>1;
  if v_count<>0 then
    raise exception '#97 exact 39-county active release-current manifest is incomplete';
  end if;

  if (select count(*) from public.brinesearch_road_graph_builds where status='active')<>39 then
    raise exception '#97 unexpected extra active graph outside reviewed county set';
  end if;

  with required as (
    select s.dataset_id,s.state_code,s.county_code
    from public.brinesearch_road_source_dataset_counties s
    join public.brinesearch_road_source_datasets d on d.id=s.dataset_id
    where s.active and s.ingest_enabled and s.required_for_graph and d.active
  )
  select count(*)::integer into v_count from required;
  if v_count<>114 or exists(
    select 1 from required r
    where not private_verification.brinesearch_issue97_dataset_scope_current(
      r.dataset_id,r.state_code,r.county_code
    )
  ) then
    raise exception '#97 exact 114 required source scopes are not current';
  end if;

  select * into strict v_baseline
  from private_verification.brinesearch_issue97_saved_road_release_baseline
  where singleton;
  if v_baseline.expected_occurrence_count<>16118
     or v_baseline.expected_inventory_digest<>'420725ad5d8c93a60f13c5ddb3b4f1c1' then
    raise exception '#97 reviewed saved-road baseline is not the approved 16,118 manifest';
  end if;

  select * into v_reconcile
  from private_verification.brinesearch_issue97_saved_road_reconciliation_runs
  where status='complete'
  order by completed_at desc,id desc limit 1;
  if not found then raise exception '#97 complete saved-road reconciliation is missing'; end if;
  v_child:=private_verification.brinesearch_issue97_saved_road_child_receipt(v_reconcile.id);
  if (v_child->>'occurrence_count')::integer<>v_baseline.expected_occurrence_count
     or v_child->>'inventory_digest'<>v_baseline.expected_inventory_digest
     or (v_child->>'route_critical_held_count')::integer<>0
     or (v_child->>'forbidden_resolution_count')::integer<>0
     or v_reconcile.source_digest<>private_verification.brinesearch_issue97_saved_road_source_digest() then
    raise exception '#97 saved-road reconciliation is not release-complete';
  end if;

  -- The database must resolve exactly one immutable report whose candidate,
  -- active, source and route manifests still match the locked production state.
  select count(*)::integer into v_report_count
  from private_verification.brinesearch_issue97_verification_reports report
  where private_verification.brinesearch_issue97_verification_report_current(report.report_digest);
  if v_report_count<>1 then
    raise exception '#97 pre-cutover requires exactly one current persisted final verification report; found %',
      v_report_count;
  end if;

  if pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_issue97_activate_cutover_without_google_routes(jsonb)','EXECUTE'
     ) or pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_publish_structured_route_issue97_without_google(uuid,uuid,jsonb,bigint)','EXECUTE'
     ) then
    raise exception '#97 internal cutover/publisher bypass remains executable';
  end if;

  -- Public Google route projection must still be dark before cutover.
  if exists(select 1 from public.brinesearch_driver_google_routes_public) then
    raise exception '#97 public Google route projection is populated before cutover';
  end if;
end
$issue97_pre_cutover$;

rollback;
