-- GitHub #97 — add the missing geography index to the county builder's
-- all-segment temp table.
--
-- PA/WAS reached the former whole-builder timeout late in the build. Bounded
-- production EXPLAIN ANALYZE probes then isolated a semantics-preserving planner
-- defect: the PennDOT at-grade and point-membership phases join with
-- ST_DWithin(...::geography, ...::geography, ...), while tmp_issue97_segments
-- had only a geometry GiST and identity B-tree index. PostgreSQL therefore could
-- not use a matching geography index for those exact-distance joins.
--
-- This patch adds only:
--   * GiST ((geom::extensions.geography))
--   * ANALYZE tmp_issue97_segments
--
-- It changes no topology predicate, tolerance, source scope, identity rule,
-- provenance rule, graph key/digest input, hold behavior, activation state,
-- global cutover, route data, or persistent graph row.

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

create temporary table issue97_graph_temp_geography_before on commit drop as
select
  public.brinesearch_issue97_cutover_active() as cutover_active,
  (select count(*) from public.brinesearch_road_graph_builds) as build_count,
  (select count(*) from public.brinesearch_road_graph_builds where status='staging')
    as staging_count,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||build.status||':'||
    coalesce(build.activated_at::text,'')||':'||
    coalesce(build.source_revision_digest,'')||':'||
    coalesce(build.graph_digest,'')||':'||build.details::text,
    ',' order by build.id
  ),'')) from public.brinesearch_road_graph_builds build) as build_state_digest,
  (select count(*) from public.brinesearch_road_junctions) as junction_count,
  (select count(*) from public.brinesearch_road_junction_anchors) as anchor_count,
  (select count(*) from public.brinesearch_road_junction_memberships)
    as membership_count,
  pg_catalog.pg_get_functiondef(proc.oid) as builder_definition,
  proc.proowner as builder_owner,
  proc.proacl as builder_acl,
  proc.prosecdef as builder_security_definer,
  proc.provolatile as builder_volatility,
  proc.proconfig as builder_config,
  proc.prolang as builder_language
from pg_catalog.pg_proc proc
where proc.oid=
  'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure;

do $issue97_patch_graph_temp_geography_index$
declare
  v_definition text;
  v_patched text;
  v_count integer;
  v_old constant text:=$old$  create index tmp_issue97_segments_geom_idx on tmp_issue97_segments using gist(geom);
  create index tmp_issue97_segments_identity_idx on tmp_issue97_segments(identity_id);$old$;
  v_new constant text:=$new$  create index tmp_issue97_segments_geom_idx on tmp_issue97_segments using gist(geom);
  create index tmp_issue97_segments_geog_idx
    on tmp_issue97_segments using gist((geom::extensions.geography));
  create index tmp_issue97_segments_identity_idx on tmp_issue97_segments(identity_id);
  analyze tmp_issue97_segments;$new$;
begin
  select pg_catalog.pg_get_functiondef(proc.oid) into strict v_definition
  from pg_catalog.pg_proc proc
  where proc.oid=
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure;

  if pg_catalog.md5(v_definition)<>'c5d54a4d839df79eff99f4dfd4b0b780' then
    raise exception 'Issue #97 graph builder definition changed before temp-geography patch';
  end if;

  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old,'')
  ))/pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 temp-segment index anchor changed: %',v_count;
  end if;

  v_patched:=pg_catalog.replace(v_definition,v_old,v_new);
  if v_patched=v_definition then
    raise exception 'Issue #97 temp-segment geography patch made no change';
  end if;

  execute v_patched;
end
$issue97_patch_graph_temp_geography_index$;

do $issue97_verify_graph_temp_geography_index$
declare
  v_before issue97_graph_temp_geography_before%rowtype;
  v_proc record;
  v_definition text;
  v_expected text;
  v_old constant text:=$old$  create index tmp_issue97_segments_geom_idx on tmp_issue97_segments using gist(geom);
  create index tmp_issue97_segments_identity_idx on tmp_issue97_segments(identity_id);$old$;
  v_new constant text:=$new$  create index tmp_issue97_segments_geom_idx on tmp_issue97_segments using gist(geom);
  create index tmp_issue97_segments_geog_idx
    on tmp_issue97_segments using gist((geom::extensions.geography));
  create index tmp_issue97_segments_identity_idx on tmp_issue97_segments(identity_id);
  analyze tmp_issue97_segments;$new$;
begin
  select * into strict v_before
  from issue97_graph_temp_geography_before;

  select
    pg_catalog.pg_get_functiondef(proc.oid) as definition,
    proc.proowner,proc.proacl,proc.prosecdef,proc.provolatile,proc.proconfig,
    proc.prolang
  into strict v_proc
  from pg_catalog.pg_proc proc
  where proc.oid=
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure;

  v_definition:=v_proc.definition;
  v_expected:=pg_catalog.replace(v_before.builder_definition,v_old,v_new);

  if v_definition is distinct from v_expected
     or pg_catalog.md5(v_definition)<>'06c4b57ff9056b96137b9aaf4f4b856d'
     or (
       pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(
         v_definition,'create index tmp_issue97_segments_geog_idx',''
       ))
     )/pg_catalog.length('create index tmp_issue97_segments_geog_idx')<>1
     or (
       pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(
         v_definition,
         'on tmp_issue97_segments using gist((geom::extensions.geography));',
         ''
       ))
     )/pg_catalog.length(
       'on tmp_issue97_segments using gist((geom::extensions.geography));'
     )<>1
     or (
       pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(
         v_definition,'analyze tmp_issue97_segments;',''
       ))
     )/pg_catalog.length('analyze tmp_issue97_segments;')<>1 then
    raise exception 'Issue #97 temp geography index replacement did not persist exactly';
  end if;

  if v_proc.proowner is distinct from v_before.builder_owner
     or v_proc.proacl is distinct from v_before.builder_acl
     or v_proc.prosecdef is distinct from v_before.builder_security_definer
     or v_proc.provolatile is distinct from v_before.builder_volatility
     or v_proc.proconfig is distinct from v_before.builder_config
     or v_proc.prolang is distinct from v_before.builder_language then
    raise exception 'Issue #97 graph builder metadata or ACL changed';
  end if;

  if public.brinesearch_issue97_cutover_active()
     or v_before.cutover_active
     or (select count(*) from public.brinesearch_road_graph_builds)
          is distinct from v_before.build_count
     or (select count(*) from public.brinesearch_road_graph_builds where status='staging')
          is distinct from v_before.staging_count
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
          build.id::text||':'||build.status||':'||
          coalesce(build.activated_at::text,'')||':'||
          coalesce(build.source_revision_digest,'')||':'||
          coalesce(build.graph_digest,'')||':'||build.details::text,
          ',' order by build.id
        ),'')) from public.brinesearch_road_graph_builds build)
          is distinct from v_before.build_state_digest
     or (select count(*) from public.brinesearch_road_junctions)
          is distinct from v_before.junction_count
     or (select count(*) from public.brinesearch_road_junction_anchors)
          is distinct from v_before.anchor_count
     or (select count(*) from public.brinesearch_road_junction_memberships)
          is distinct from v_before.membership_count then
    raise exception 'Issue #97 temp geography migration changed graph or release state';
  end if;
end
$issue97_verify_graph_temp_geography_index$;

comment on function public.brinesearch_issue97_rebuild_county_graph(text,text) is
  'Issue #97 authoritative county graph builder. Exact topology/provenance contract unchanged. The all-segment temp table carries matching geometry and geography GiST indexes plus ANALYZE so exact ST_DWithin geography joins remain index-driven on large PA counties. SECURITY DEFINER with fixed empty search_path; service_role only.';
