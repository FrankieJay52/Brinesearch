-- GitHub #97 - bind the graph builder's measured WVDOT values at runtime.
--
-- ST_LineLocatePoint returns double precision. PostgreSQL therefore types the
-- builder's numeric M-value interpolation as double precision, while the
-- canonical helpers installed by 20260812046800 accept numeric. The float8 to
-- numeric cast is assignment-only, so the first OHI dark build failed before
-- graph rows could become durable.
--
-- This forward-only repair leaves the builder, source rows, identities,
-- topology, and release state unchanged. It adds exact private overloads that
-- cast once at the helper boundary and delegate to the canonical numeric
-- implementations.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:graph:WV:OHI')
);

create temporary table issue97_wvdot_runtime_dispatch_before on commit drop as
select
  pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) as builder_definition,
  public.brinesearch_issue97_cutover_active() as cutover_active,
  (select pg_catalog.count(*)
   from public.brinesearch_road_graph_builds build
   where build.state_code='WV' and build.county_code='OHI') as ohi_build_count,
  (select pg_catalog.count(*)
   from public.brinesearch_road_graph_builds build
   where build.status='staging') as staging_build_count;

do $issue97_preflight_wvdot_runtime_dispatch$
declare
  v_builder_definition text;
  v_normalize_call_count integer;
  v_contains_call_count integer;
begin
  select snapshot.builder_definition
  into v_builder_definition
  from pg_temp.issue97_wvdot_runtime_dispatch_before snapshot;

  if (select snapshot.cutover_active
      from pg_temp.issue97_wvdot_runtime_dispatch_before snapshot)
     or (select snapshot.ohi_build_count
         from pg_temp.issue97_wvdot_runtime_dispatch_before snapshot)<>0
     or (select snapshot.staging_build_count
         from pg_temp.issue97_wvdot_runtime_dispatch_before snapshot)<>0
  then
    raise exception 'Issue #97 runtime-dispatch repair requires cutover off, zero OHI builds, and zero staging builds';
  end if;

  if pg_catalog.to_regprocedure(
       'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,numeric)'
     ) is null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,numeric,numeric,numeric)'
     ) is null
  then
    raise exception 'Issue #97 canonical numeric WVDOT helpers are missing';
  end if;

  if pg_catalog.to_regprocedure(
       'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)'
     ) is not null
  then
    raise exception 'Issue #97 double-precision WVDOT runtime overloads already exist';
  end if;

  v_normalize_call_count:=(
    pg_catalog.length(v_builder_definition)-pg_catalog.length(pg_catalog.replace(
      v_builder_definition,
      'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(',
      ''
    ))
  )/pg_catalog.length(
    'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure('
  );
  v_contains_call_count:=(
    pg_catalog.length(v_builder_definition)-pg_catalog.length(pg_catalog.replace(
      v_builder_definition,
      'private_verification.brinesearch_issue97_wvdot_name_measure_contains(',
      ''
    ))
  )/pg_catalog.length(
    'private_verification.brinesearch_issue97_wvdot_name_measure_contains('
  );

  if v_normalize_call_count<>7 or v_contains_call_count<>3
     or v_builder_definition not like '%from_measure+(c.to_measure-c.from_measure)*c.fraction%'
     or v_builder_definition not like '%from_measure+(choice.to_measure-choice.from_measure)*choice.fraction%'
     or v_builder_definition not like '%c.chosen_segment_key,c.raw_source_measure,n.from_measure,n.to_measure%'
     or v_builder_definition not like '%v.chosen_segment_key,v.raw_source_measure,n.from_measure,n.to_measure%'
  then
    raise exception 'Issue #97 effective graph-builder runtime call sites changed: normalize %, contains %',
      v_normalize_call_count,v_contains_call_count;
  end if;
end
$issue97_preflight_wvdot_runtime_dispatch$;

create function private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
  p_source_segment_key text,
  p_raw_measure double precision
)
returns numeric
language sql
immutable
set search_path=''
as $$
  select private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
    p_source_segment_key,
    p_raw_measure::numeric
  )
$$;

create function private_verification.brinesearch_issue97_wvdot_name_measure_contains(
  p_source_segment_key text,
  p_source_measure double precision,
  p_from_measure numeric,
  p_to_measure numeric
)
returns boolean
language sql
immutable
set search_path=''
as $$
  select private_verification.brinesearch_issue97_wvdot_name_measure_contains(
    p_source_segment_key,
    p_source_measure::numeric,
    p_from_measure,
    p_to_measure
  )
$$;

revoke all on function private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)
from public,anon,authenticated,service_role;

do $issue97_verify_wvdot_runtime_dispatch$
declare
  v_from_measure numeric:=0::numeric;
  v_to_measure numeric:=(-0.000000054336851462721824)::numeric;
  v_fraction double precision:=0.5::double precision;
  v_runtime_measure double precision;
  v_builder_definition_after text;
  v_signature text;
  v_role text;
begin
  v_runtime_measure:=v_from_measure+(v_to_measure-v_from_measure)*v_fraction;

  if pg_catalog.pg_typeof(
       v_from_measure+(v_to_measure-v_from_measure)*v_fraction
     ) is distinct from 'double precision'::pg_catalog.regtype
     or pg_catalog.pg_typeof(
       private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
         'WV:WVDOT:SEGMENT:typed-runtime',v_runtime_measure
       )
     ) is distinct from 'numeric'::pg_catalog.regtype
  then
    raise exception 'Issue #97 runtime-dispatch regression fixture no longer exercises float8 to numeric binding';
  end if;

  if private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
       'WV:WVDOT:SEGMENT:typed-runtime',v_runtime_measure
     ) is distinct from 0::numeric
     or private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
       'WV:WVDOT:SEGMENT:typed-runtime',(-0.0000001000001)::double precision
     ) is distinct from ((-0.0000001000001)::double precision)::numeric
     or private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
       'OH:ODOT:SEGMENT:typed-runtime',v_runtime_measure
     ) is distinct from v_runtime_measure::numeric
     or private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
       'WV:WVDOT:SEGMENT:numeric-regression',(-0.000000027168425731360912)::numeric
     ) is distinct from 0::numeric
  then
    raise exception 'Issue #97 typed WVDOT normalization overload changed canonical numeric semantics';
  end if;

  if not private_verification.brinesearch_issue97_wvdot_name_measure_contains(
       'WV:WVDOT:SEGMENT:typed-runtime',
       0.14300003076286521::double precision,0::numeric,0.143::numeric
     )
     or private_verification.brinesearch_issue97_wvdot_name_measure_contains(
       'WV:WVDOT:SEGMENT:typed-runtime',
       0.1430001000001::double precision,0::numeric,0.143::numeric
     )
     or private_verification.brinesearch_issue97_wvdot_name_measure_contains(
       'PA:PENNDOT:SEGMENT:typed-runtime',
       0.14300003::double precision,0::numeric,0.143::numeric
     )
     or not private_verification.brinesearch_issue97_wvdot_name_measure_contains(
       'WV:WVDOT:SEGMENT:numeric-regression',
       0.14300003076286521::numeric,0::numeric,0.143::numeric
     )
     or private_verification.brinesearch_issue97_wvdot_name_measure_contains(
       'WV:WVDOT:SEGMENT:typed-null',
       null::double precision,0::numeric,0.143::numeric
     ) is not false
  then
    raise exception 'Issue #97 typed WVDOT name containment is broader or narrower than the canonical numeric helper';
  end if;

  foreach v_signature in array array[
    'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)',
    'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)'
  ] loop
    if pg_catalog.to_regprocedure(v_signature) is null then
      raise exception 'Issue #97 runtime overload is missing: %',v_signature;
    end if;
    if not exists(
      select 1
      from pg_catalog.pg_proc proc
      join pg_catalog.pg_namespace namespace on namespace.oid=proc.pronamespace
      where proc.oid=pg_catalog.to_regprocedure(v_signature)
        and namespace.nspname='private_verification'
        and proc.prolang=(select language.oid from pg_catalog.pg_language language
                          where language.lanname='sql')
        and proc.provolatile='i'
        and not proc.prosecdef
        and proc.proconfig @> array['search_path=""']
        and pg_catalog.pg_get_userbyid(proc.proowner)='postgres'
    ) then
      raise exception 'Issue #97 runtime overload metadata is not immutable, invoker-only, owner-controlled, and search-path-fixed: %',v_signature;
    end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if pg_catalog.has_function_privilege(v_role,v_signature,'EXECUTE') then
        raise exception 'Issue #97 runtime overload execution leaked to %: %',v_role,v_signature;
      end if;
    end loop;
  end loop;

  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_builder_definition_after;

  if v_builder_definition_after is distinct from (
       select snapshot.builder_definition
       from pg_temp.issue97_wvdot_runtime_dispatch_before snapshot
     )
     or public.brinesearch_issue97_cutover_active() is distinct from (
       select snapshot.cutover_active
       from pg_temp.issue97_wvdot_runtime_dispatch_before snapshot
     )
     or (select pg_catalog.count(*)
         from public.brinesearch_road_graph_builds build
         where build.state_code='WV' and build.county_code='OHI') is distinct from (
       select snapshot.ohi_build_count
       from pg_temp.issue97_wvdot_runtime_dispatch_before snapshot
     )
     or (select pg_catalog.count(*)
         from public.brinesearch_road_graph_builds build
         where build.status='staging') is distinct from (
       select snapshot.staging_build_count
       from pg_temp.issue97_wvdot_runtime_dispatch_before snapshot
     )
  then
    raise exception 'Issue #97 runtime-dispatch repair changed builder, graph, staging, or cutover state';
  end if;
end
$issue97_verify_wvdot_runtime_dispatch$;

comment on function private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision) is
  'Issue #97 runtime binding overload for float8 graph measures; delegates to the canonical private numeric normalizer.';
comment on function private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric) is
  'Issue #97 runtime binding overload for float8 graph measures; delegates to the canonical private numeric containment helper.';
