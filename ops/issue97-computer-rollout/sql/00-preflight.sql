\set ON_ERROR_STOP on
\pset pager off
\timing on

begin read only;
set local statement_timeout='2min';

select pg_catalog.jsonb_pretty(pg_catalog.jsonb_build_object(
  'checked_at',pg_catalog.clock_timestamp(),
  'database',pg_catalog.current_database(),
  'current_user',current_user,
  'application_name',pg_catalog.current_setting('application_name'),
  'backend_pid',pg_catalog.pg_backend_pid(),
  'server_version',pg_catalog.current_setting('server_version'),
  'statement_timeout',pg_catalog.current_setting('statement_timeout'),
  'transaction_read_only',pg_catalog.current_setting('transaction_read_only')
)) as connection;

with required_scopes as (
  select scope.dataset_id,scope.state_code,scope.county_code
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset on dataset.id=scope.dataset_id
  where scope.active and scope.ingest_enabled and scope.required_for_graph and dataset.active
), graph_summary as (
  select
    (select count(*) from public.brinesearch_road_graph_counties where active)::integer
      as registered_counties,
    count(*) filter(where build.status='active')::integer as active_graphs,
    count(*) filter(where build.status='active'
      and private_verification.brinesearch_issue97_graph_build_sources_current(build.id))::integer
      as active_current_graphs,
    count(*) filter(where build.status='staging')::integer as staging_graphs
  from public.brinesearch_road_graph_builds build
), source_summary as (
  select count(*)::integer as required_scopes,
    count(*) filter(where private_verification.brinesearch_issue97_dataset_scope_current(
      dataset_id,state_code,county_code
    ))::integer as current_scopes
  from required_scopes
), frozen_summary as (
  select count(*)::integer as active_rows,
    count(*) filter(where private_verification.brinesearch_issue97_graph_build_sources_current(build.id))::integer
      as current_rows
  from public.brinesearch_road_graph_builds build
  where build.state_code='OH' and build.county_code in ('BEL','JEF','NOB')
    and build.status='active'
), policy_summary as (
  select exists(
    select 1
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_depend dependency
      on dependency.classid='pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency.objid=policy.oid
      and dependency.refclassid='pg_catalog.pg_proc'::pg_catalog.regclass
    where policy.polrelid='public.brinesearch_driver_google_routes_public'::pg_catalog.regclass
      and policy.polname='brinesearch_driver_google_routes_public_read_issue97'
      and dependency.refobjid=
        'public.brinesearch_issue97_google_route_current(uuid)'::pg_catalog.regprocedure
  ) and not exists(
    select 1
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_depend dependency
      on dependency.classid='pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency.objid=policy.oid
      and dependency.refclassid='pg_catalog.pg_proc'::pg_catalog.regclass
    where policy.polrelid='public.brinesearch_driver_google_routes_public'::pg_catalog.regclass
      and policy.polname='brinesearch_driver_google_routes_public_read_issue97'
      and dependency.refobjid=
        'public.brinesearch_issue97_google_route_current_published_core(uuid)'::pg_catalog.regprocedure
  ) as dispatcher_bound
), active_build_sessions as (
  select count(*)::integer as session_count
  from pg_catalog.pg_stat_activity activity
  where activity.pid<>pg_catalog.pg_backend_pid()
    and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
    and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'
), wvdot_runtime_summary as (
  select
    pg_catalog.to_regprocedure(
      'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)'
    ) is not null
    and exists(
      select 1
      from pg_catalog.pg_proc proc
      join pg_catalog.pg_namespace namespace on namespace.oid=proc.pronamespace
      join pg_catalog.pg_language language on language.oid=proc.prolang
      where proc.oid=pg_catalog.to_regprocedure(
          'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)'
        )
        and namespace.nspname='private_verification'
        and language.lanname='sql'
        and proc.provolatile='i'
        and not proc.prosecdef
        and proc.proconfig @> array['search_path=""']
        and pg_catalog.pg_get_userbyid(proc.proowner)='postgres'
    )
    and exists(
      select 1
      from pg_catalog.pg_proc proc
      join pg_catalog.pg_namespace namespace on namespace.oid=proc.pronamespace
      join pg_catalog.pg_language language on language.oid=proc.prolang
      where proc.oid=pg_catalog.to_regprocedure(
          'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)'
        )
        and namespace.nspname='private_verification'
        and language.lanname='sql'
        and proc.provolatile='i'
        and not proc.prosecdef
        and proc.proconfig @> array['search_path=""']
        and pg_catalog.pg_get_userbyid(proc.proowner)='postgres'
    )
    and pg_catalog.to_regprocedure(
      'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)'
    ) is not null
    and not pg_catalog.has_function_privilege(
      'anon',
      'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)',
      'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'authenticated',
      'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)',
      'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'service_role',
      'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)',
      'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'anon',
      'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)',
      'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'authenticated',
      'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)',
      'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'service_role',
      'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)',
      'EXECUTE'
    ) as helpers_ready,
    pg_catalog.pg_typeof(
      0::numeric+
        ((-0.000000054336851462721824)::numeric-0::numeric)*0.5::double precision
    )='double precision'::pg_catalog.regtype
    and private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
      'WV:WVDOT:SEGMENT:preflight',
      0::numeric+
        ((-0.000000054336851462721824)::numeric-0::numeric)*0.5::double precision
    )=0::numeric
    and private_verification.brinesearch_issue97_wvdot_name_measure_contains(
      'WV:WVDOT:SEGMENT:preflight',
      0.14300003076286521::double precision,0::numeric,0.143::numeric
    )
    and not private_verification.brinesearch_issue97_wvdot_name_measure_contains(
      'WV:WVDOT:SEGMENT:preflight',
      0.1430001000001::double precision,0::numeric,0.143::numeric
    ) as typed_calls_pass
), builder_contract as (
  select
    pg_catalog.md5(pg_catalog.pg_get_functiondef(proc.oid))
      ='39ca43fc16878fa7d6c2b70f4c6a48d3'
    and pg_catalog.pg_get_functiondef(proc.oid)
      like '%tmp_issue97_shared_segment_coverage%'
    and pg_catalog.pg_get_functiondef(proc.oid)
      like '%exact_canonical_grid_line_intersection%'
    and pg_catalog.pg_get_functiondef(proc.oid)
      like '%v.raw_source_measure::numeric is distinct from v.source_measure%'
    and pg_catalog.pg_get_functiondef(proc.oid)
      like '%n.source_measure::numeric is distinct from%'
    and pg_catalog.pg_get_functiondef(proc.oid) not like '%fraction::numeric%'
      as provenance_ready
  from pg_catalog.pg_proc proc
  where proc.oid=
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
)
select
  not public.brinesearch_issue97_cutover_active() as cutover_off,
  graph_summary.*,
  source_summary.*,
  frozen_summary.active_rows as frozen_active_rows,
  frozen_summary.current_rows as frozen_current_rows,
  policy_summary.dispatcher_bound as google_policy_dispatcher_bound,
  active_build_sessions.session_count as active_build_sessions,
  wvdot_runtime_summary.helpers_ready as wvdot_float8_helpers_ready,
  wvdot_runtime_summary.typed_calls_pass as wvdot_float8_typed_calls_pass,
  builder_contract.provenance_ready as builder_provenance_ready,
  pg_catalog.has_function_privilege(
    current_user,'public.brinesearch_issue97_rebuild_county_graph(text,text)','EXECUTE'
  ) as can_execute_builder,
  pg_catalog.has_function_privilege(
    current_user,'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)','EXECUTE'
  ) as can_execute_activation
from graph_summary,source_summary,frozen_summary,policy_summary,active_build_sessions,
  wvdot_runtime_summary,builder_contract;

with required_scopes as (
  select scope.dataset_id,scope.state_code,scope.county_code
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset on dataset.id=scope.dataset_id
  where scope.active and scope.ingest_enabled and scope.required_for_graph and dataset.active
), checks as (
  select
    not public.brinesearch_issue97_cutover_active() as cutover_off,
    (select count(*) from required_scopes)=114 as source_scope_count_exact,
    not exists(
      select 1 from required_scopes scope
      where not private_verification.brinesearch_issue97_dataset_scope_current(
        scope.dataset_id,scope.state_code,scope.county_code
      )
    ) as all_sources_current,
    (select count(*) from public.brinesearch_road_graph_counties where active)=39
      as graph_footprint_exact,
    not exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
      as no_staging_builds,
    (select count(*) from public.brinesearch_road_graph_builds build
      where build.state_code='OH' and build.county_code in ('BEL','JEF','NOB')
        and build.status='active'
        and private_verification.brinesearch_issue97_graph_build_sources_current(build.id))=3
      as frozen_counties_current,
    not exists(
      select 1 from pg_catalog.pg_stat_activity activity
      where activity.pid<>pg_catalog.pg_backend_pid()
        and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
        and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'
    ) as no_active_build_session,
    pg_catalog.has_function_privilege(
      current_user,'public.brinesearch_issue97_rebuild_county_graph(text,text)','EXECUTE'
    ) as builder_acl,
    pg_catalog.has_function_privilege(
      'anon','public.brinesearch_issue97_google_route_current(uuid)','EXECUTE'
    ) and pg_catalog.has_function_privilege(
      'authenticated','public.brinesearch_issue97_google_route_current(uuid)','EXECUTE'
    ) and pg_catalog.has_function_privilege(
      'service_role','public.brinesearch_issue97_google_route_current(uuid)','EXECUTE'
    ) and not pg_catalog.has_function_privilege(
      'anon','public.brinesearch_issue97_google_route_current_published_core(uuid)','EXECUTE'
    ) and not pg_catalog.has_function_privilege(
      'authenticated','public.brinesearch_issue97_google_route_current_published_core(uuid)','EXECUTE'
    ) and not pg_catalog.has_function_privilege(
      'service_role','public.brinesearch_issue97_google_route_current_published_core(uuid)','EXECUTE'
    ) as google_predicate_acl,
    pg_catalog.to_regprocedure(
      'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)'
    ) is not null
    and exists(
      select 1
      from pg_catalog.pg_proc proc
      join pg_catalog.pg_namespace namespace on namespace.oid=proc.pronamespace
      join pg_catalog.pg_language language on language.oid=proc.prolang
      where proc.oid=pg_catalog.to_regprocedure(
          'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)'
        )
        and namespace.nspname='private_verification'
        and language.lanname='sql'
        and proc.provolatile='i'
        and not proc.prosecdef
        and proc.proconfig @> array['search_path=""']
        and pg_catalog.pg_get_userbyid(proc.proowner)='postgres'
    )
    and exists(
      select 1
      from pg_catalog.pg_proc proc
      join pg_catalog.pg_namespace namespace on namespace.oid=proc.pronamespace
      join pg_catalog.pg_language language on language.oid=proc.prolang
      where proc.oid=pg_catalog.to_regprocedure(
          'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)'
        )
        and namespace.nspname='private_verification'
        and language.lanname='sql'
        and proc.provolatile='i'
        and not proc.prosecdef
        and proc.proconfig @> array['search_path=""']
        and pg_catalog.pg_get_userbyid(proc.proowner)='postgres'
    )
    and pg_catalog.to_regprocedure(
      'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)'
    ) is not null
    and not pg_catalog.has_function_privilege(
      'anon',
      'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)',
      'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'authenticated',
      'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)',
      'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'service_role',
      'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)',
      'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'anon',
      'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)',
      'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'authenticated',
      'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)',
      'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'service_role',
      'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)',
      'EXECUTE'
    )
    and pg_catalog.pg_typeof(
      0::numeric+
        ((-0.000000054336851462721824)::numeric-0::numeric)*0.5::double precision
    )='double precision'::pg_catalog.regtype
    and private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
      'WV:WVDOT:SEGMENT:preflight',
      0::numeric+
        ((-0.000000054336851462721824)::numeric-0::numeric)*0.5::double precision
    )=0::numeric
    and private_verification.brinesearch_issue97_wvdot_name_measure_contains(
      'WV:WVDOT:SEGMENT:preflight',
      0.14300003076286521::double precision,0::numeric,0.143::numeric
    )
    and not private_verification.brinesearch_issue97_wvdot_name_measure_contains(
      'WV:WVDOT:SEGMENT:preflight',
      0.1430001000001::double precision,0::numeric,0.143::numeric
    ) as wvdot_float8_runtime,
    exists(
      select 1
      from pg_catalog.pg_proc proc
      where proc.oid=
        'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
        and pg_catalog.md5(pg_catalog.pg_get_functiondef(proc.oid))
          ='39ca43fc16878fa7d6c2b70f4c6a48d3'
        and pg_catalog.pg_get_functiondef(proc.oid)
          like '%tmp_issue97_shared_segment_coverage%'
        and pg_catalog.pg_get_functiondef(proc.oid)
          like '%exact_canonical_grid_line_intersection%'
        and pg_catalog.pg_get_functiondef(proc.oid)
          like '%v.raw_source_measure::numeric is distinct from v.source_measure%'
        and pg_catalog.pg_get_functiondef(proc.oid)
          like '%n.source_measure::numeric is distinct from%'
        and pg_catalog.pg_get_functiondef(proc.oid) not like '%fraction::numeric%'
    ) as builder_provenance_contract,
    exists(
      select 1
      from pg_catalog.pg_policy policy
      join pg_catalog.pg_depend dependency
        on dependency.classid='pg_catalog.pg_policy'::pg_catalog.regclass
        and dependency.objid=policy.oid
        and dependency.refclassid='pg_catalog.pg_proc'::pg_catalog.regclass
      where policy.polrelid='public.brinesearch_driver_google_routes_public'::pg_catalog.regclass
        and policy.polname='brinesearch_driver_google_routes_public_read_issue97'
        and dependency.refobjid=
          'public.brinesearch_issue97_google_route_current(uuid)'::pg_catalog.regprocedure
    ) and not exists(
      select 1
      from pg_catalog.pg_policy policy
      join pg_catalog.pg_depend dependency
        on dependency.classid='pg_catalog.pg_policy'::pg_catalog.regclass
        and dependency.objid=policy.oid
        and dependency.refclassid='pg_catalog.pg_proc'::pg_catalog.regclass
      where policy.polrelid='public.brinesearch_driver_google_routes_public'::pg_catalog.regclass
        and policy.polname='brinesearch_driver_google_routes_public_read_issue97'
        and dependency.refobjid=
          'public.brinesearch_issue97_google_route_current_published_core(uuid)'::pg_catalog.regprocedure
    ) as dispatcher_policy
)
select bool_and(value) as ready
from checks
cross join lateral (values
  (cutover_off),(source_scope_count_exact),(all_sources_current),(graph_footprint_exact),
  (no_staging_builds),(frozen_counties_current),(no_active_build_session),
  (builder_acl),(google_predicate_acl),(wvdot_float8_runtime),
  (builder_provenance_contract),(dispatcher_policy)
) gate(value)
\gset issue97_

\if :issue97_ready
  \echo 'Issue #97 computer preflight: PASS'
\else
  \echo 'Issue #97 computer preflight: FAIL — no write was attempted'
  do $issue97_preflight_failed$
  begin
    raise exception 'Issue #97 computer preflight failed; no write was attempted';
  end
  $issue97_preflight_failed$;
\endif

commit;
