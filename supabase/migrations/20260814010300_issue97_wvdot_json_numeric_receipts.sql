-- GitHub #97 — make WVDOT raw-measure JSON receipts independent of
-- extra_float_digits.
--
-- The builder's raw interpolation remains double precision. PostgreSQL's
-- float8-to-numeric cast intentionally supplies the canonical storage-boundary
-- value used by the WVDOT helper. Writing the float8 directly to jsonb,
-- however, depends on extra_float_digits: production uses 0 while a stock
-- PostgreSQL 17 session uses 1. The same value can therefore lose round-trip
-- digits in production or retain more digits than the persisted numeric
-- source_measure elsewhere.
--
-- Serialize the raw receipt explicitly at the numeric boundary in the point,
-- shared and name-change paths, compare the shared receipt at that same
-- boundary, and keep both mixed numeric/geometry distance CASE expressions
-- numeric before persistence. This changes no interpolation, topology, source
-- data, graph row, release state, activation state, or global-cutover state.

do $issue97_lock_graph_builder_lanes$
declare
  scope record;
begin
  for scope in
    select county.state_code,county.county_code
    from public.brinesearch_road_graph_counties county
    where county.active
    order by county.state_code,county.county_code
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:graph:'||scope.state_code||':'||scope.county_code
    ));
  end loop;
end
$issue97_lock_graph_builder_lanes$;

create temporary table issue97_wvdot_json_receipt_before on commit drop as
select
  public.brinesearch_issue97_cutover_active() as cutover_active,
  (select count(*) from public.brinesearch_road_graph_builds) as build_count,
  (select count(*) from public.brinesearch_road_graph_builds where status='staging')
    as staging_count,
  (select count(*) from public.brinesearch_road_junctions) as junction_count,
  (select count(*) from public.brinesearch_road_junction_anchors) as anchor_count,
  (select count(*) from public.brinesearch_road_junction_memberships) as membership_count,
  pg_catalog.pg_get_functiondef(proc.oid) as builder_definition,
  proc.proowner as builder_owner,
  proc.proacl as builder_acl
from pg_catalog.pg_proc proc
where proc.oid=
  'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure;

do $issue97_patch_wvdot_json_receipts$
declare
  v_definition text;
  v_patched text;
  v_count integer;
  v_value_receipt_old constant text:=$old$      'raw_source_measure',v.raw_source_measure,$old$;
  v_value_receipt_new constant text:=$new$      'raw_source_measure',v.raw_source_measure::numeric,$new$;
  v_name_receipt_old constant text:=$old$      'raw_source_measure',n.source_measure,$old$;
  v_name_receipt_new constant text:=$new$      'raw_source_measure',n.source_measure::numeric,$new$;
  v_shared_check_old constant text:=$old$          or (membership.approach_data->>'raw_source_measure')::double precision
               is distinct from expected.raw_source_measure$old$;
  v_shared_check_new constant text:=$new$          or (membership.approach_data->>'raw_source_measure')::numeric
               is distinct from expected.raw_source_measure::numeric$new$;
  v_point_distance_old constant text:=$old$      when sc.segment_count=1 then c.fraction*c.length_m else null end as distance_along_road_m,$old$;
  v_point_distance_new constant text:=$new$      when sc.segment_count=1 then (c.fraction*c.length_m)::numeric else null end as distance_along_road_m,$new$;
  v_shared_distance_old constant text:=$old$      when totals.segment_count=1 and choice.fraction is not null
        then choice.fraction*choice.source_length_m$old$;
  v_shared_distance_new constant text:=$new$      when totals.segment_count=1 and choice.fraction is not null
        then (choice.fraction*choice.source_length_m)::numeric$new$;
begin
  select pg_catalog.pg_get_functiondef(proc.oid) into strict v_definition
  from pg_catalog.pg_proc proc
  where proc.oid=
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure;

  if pg_catalog.md5(v_definition)<>'39ca43fc16878fa7d6c2b70f4c6a48d3' then
    raise exception 'Issue #97 WVDOT JSON receipt builder definition changed';
  end if;

  v_patched:=v_definition;

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_value_receipt_old,'')
  ))/pg_catalog.length(v_value_receipt_old);
  if v_count<>2 then
    raise exception 'Issue #97 WVDOT point/shared JSON receipt anchors changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(
    v_patched,v_value_receipt_old,v_value_receipt_new
  );

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_name_receipt_old,'')
  ))/pg_catalog.length(v_name_receipt_old);
  if v_count<>1 then
    raise exception 'Issue #97 WVDOT name JSON receipt anchor changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(
    v_patched,v_name_receipt_old,v_name_receipt_new
  );

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_shared_check_old,'')
  ))/pg_catalog.length(v_shared_check_old);
  if v_count<>1 then
    raise exception 'Issue #97 shared raw-receipt validation anchor changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_shared_check_old,v_shared_check_new);

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_point_distance_old,'')
  ))/pg_catalog.length(v_point_distance_old);
  if v_count<>1 then
    raise exception 'Issue #97 point numeric-distance anchor changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(
    v_patched,v_point_distance_old,v_point_distance_new
  );

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_shared_distance_old,'')
  ))/pg_catalog.length(v_shared_distance_old);
  if v_count<>1 then
    raise exception 'Issue #97 shared numeric-distance anchor changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(
    v_patched,v_shared_distance_old,v_shared_distance_new
  );

  execute v_patched;
end
$issue97_patch_wvdot_json_receipts$;

do $issue97_verify_wvdot_json_receipts$
declare
  v_before issue97_wvdot_json_receipt_before%rowtype;
  v_proc record;
  v_definition text;
  v_extra_float_digits text;
  v_direct_zero text;
  v_direct_one text;
  v_numeric_zero text;
  v_numeric_one text;
begin
  select * into strict v_before from issue97_wvdot_json_receipt_before;
  select pg_catalog.pg_get_functiondef(proc.oid) as definition,
    proc.proowner,proc.proacl,proc.prosecdef,proc.provolatile,proc.proconfig,
    language.lanname,owner.rolname
  into strict v_proc
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_language language on language.oid=proc.prolang
  join pg_catalog.pg_roles owner on owner.oid=proc.proowner
  where proc.oid=
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure;
  v_definition:=v_proc.definition;

  if pg_catalog.md5(v_definition)<>'c5d54a4d839df79eff99f4dfd4b0b780'
     or (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(
       v_definition,
       '''raw_source_measure'',v.raw_source_measure::numeric',
       ''
     )))/pg_catalog.length(
       '''raw_source_measure'',v.raw_source_measure::numeric'
     )<>2
     or (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(
       v_definition,
       '''raw_source_measure'',n.source_measure::numeric',
       ''
     )))/pg_catalog.length(
       '''raw_source_measure'',n.source_measure::numeric'
     )<>1
     or v_definition not like
       '%(membership.approach_data->>''raw_source_measure'')::numeric%'
     or v_definition not like
       '%is distinct from expected.raw_source_measure::numeric%'
     or v_definition not like
       '%(c.fraction*c.length_m)::numeric%'
     or v_definition not like
       '%(choice.fraction*choice.source_length_m)::numeric%'
     or v_definition like
       '%''raw_source_measure'',v.raw_source_measure,%'
     or v_definition like
       '%''raw_source_measure'',n.source_measure,%' then
    raise exception 'Issue #97 numeric JSON receipt replacement did not persist';
  end if;

  if v_proc.rolname<>'postgres' or v_proc.lanname<>'plpgsql'
     or not v_proc.prosecdef or v_proc.provolatile<>'v'
     or v_proc.proconfig is distinct from array['search_path=""']::text[]
     or v_proc.proowner is distinct from v_before.builder_owner
     or v_proc.proacl is distinct from v_before.builder_acl then
    raise exception 'Issue #97 builder metadata or ACL changed';
  end if;

  if public.brinesearch_issue97_cutover_active()
     or v_before.cutover_active
     or (select count(*) from public.brinesearch_road_graph_builds)
          is distinct from v_before.build_count
     or (select count(*) from public.brinesearch_road_graph_builds where status='staging')
          is distinct from v_before.staging_count
     or (select count(*) from public.brinesearch_road_junctions)
          is distinct from v_before.junction_count
     or (select count(*) from public.brinesearch_road_junction_anchors)
          is distinct from v_before.anchor_count
     or (select count(*) from public.brinesearch_road_junction_memberships)
          is distinct from v_before.membership_count then
    raise exception 'Issue #97 JSON receipt migration changed graph or release state';
  end if;

  if pg_catalog.jsonb_build_object(
       'raw',0.12907884220427324::double precision::numeric
     )->>'raw'<>'0.129078842204273'
     or (
       pg_catalog.jsonb_build_object(
         'raw',0.12907884220427324::double precision::numeric
       )->>'raw'
     )::numeric is distinct from 0.12907884220427324::double precision::numeric
     or not (
       pg_catalog.jsonb_build_object(
         'raw',(-0.0000000271684257313609)::double precision::numeric
       )->>'raw'
     )::numeric is distinct from 0::numeric then
    raise exception 'Issue #97 numeric JSON receipt behavior changed';
  end if;

  v_extra_float_digits:=pg_catalog.current_setting('extra_float_digits');
  perform pg_catalog.set_config('extra_float_digits','0',true);
  v_direct_zero:=pg_catalog.jsonb_build_object(
    'raw',0.12907884220427324::double precision
  )->>'raw';
  v_numeric_zero:=pg_catalog.jsonb_build_object(
    'raw',0.12907884220427324::double precision::numeric
  )->>'raw';
  perform pg_catalog.set_config('extra_float_digits','1',true);
  v_direct_one:=pg_catalog.jsonb_build_object(
    'raw',0.12907884220427324::double precision
  )->>'raw';
  v_numeric_one:=pg_catalog.jsonb_build_object(
    'raw',0.12907884220427324::double precision::numeric
  )->>'raw';
  perform pg_catalog.set_config(
    'extra_float_digits',v_extra_float_digits,true
  );
  if v_direct_zero is not distinct from v_direct_one
     or v_numeric_zero is distinct from v_numeric_one
     or v_numeric_zero<>'0.129078842204273' then
    raise exception 'Issue #97 JSON receipt still depends on extra_float_digits';
  end if;
end
$issue97_verify_wvdot_json_receipts$;

comment on function public.brinesearch_issue97_rebuild_county_graph(text,text) is
  'Issue #97 authoritative county graph builder. Raw interpolation remains float8; WVDOT JSON receipts cross an explicit numeric boundary so provenance is independent of extra_float_digits. Shared provenance is derived once from exact 1e-7-grid line coverage, with deterministic start choice and fail-closed M conflicts. SECURITY DEFINER with fixed empty search_path; service_role only.';
