\set ON_ERROR_STOP on
\pset pager off
\timing on

select pg_catalog.upper(:'issue97_state') as state_code,
  pg_catalog.upper(:'issue97_county') as county_code
\gset issue97_scope_

select
  exists(
    select 1 from public.brinesearch_road_graph_counties county
    where county.active
      and county.state_code=:'issue97_scope_state_code'
      and county.county_code=:'issue97_scope_county_code'
  ) as footprint_ok,
  (:'issue97_scope_state_code'||':'||:'issue97_scope_county_code')
    not in ('OH:BEL','OH:JEF','OH:NOB') as not_frozen_scope,
  not exists(
    select 1 from public.brinesearch_road_graph_builds build
    where build.state_code=:'issue97_scope_state_code'
      and build.county_code=:'issue97_scope_county_code'
      and build.status in ('active','validated')
      and private_verification.brinesearch_issue97_graph_build_sources_current(build.id)
  ) as no_current_build,
  not public.brinesearch_issue97_cutover_active() as cutover_off,
  not exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
    as no_staging_build,
  not exists(
    select 1 from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in (
        'active','idle in transaction','idle in transaction (aborted)'
      )
      and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'
  ) as no_other_builder
\gset issue97_gate_

\if :issue97_gate_footprint_ok
\else
  \echo 'Unknown/inactive graph county; refusing build'
  do $issue97_build_gate_failed$ begin
    raise exception 'Issue #97 county build gate failed';
  end $issue97_build_gate_failed$;
\endif
\if :issue97_gate_not_frozen_scope
\else
  \echo 'BEL/JEF/NOB are frozen; refusing rebuild'
  do $issue97_build_gate_failed$ begin
    raise exception 'Issue #97 county build gate failed';
  end $issue97_build_gate_failed$;
\endif
\if :issue97_gate_no_current_build
\else
  \echo 'A current active/validated graph already exists; refusing duplicate build'
  do $issue97_build_gate_failed$ begin
    raise exception 'Issue #97 county build gate failed';
  end $issue97_build_gate_failed$;
\endif
\if :issue97_gate_cutover_off
\else
  \echo 'Global #97 cutover is active; refusing build'
  do $issue97_build_gate_failed$ begin
    raise exception 'Issue #97 county build gate failed';
  end $issue97_build_gate_failed$;
\endif
\if :issue97_gate_no_staging_build
\else
  \echo 'A staging graph exists; refusing build'
  do $issue97_build_gate_failed$ begin
    raise exception 'Issue #97 county build gate failed';
  end $issue97_build_gate_failed$;
\endif
\if :issue97_gate_no_other_builder
\else
  \echo 'Another county rebuild is active; refusing build'
  do $issue97_build_gate_failed$ begin
    raise exception 'Issue #97 county build gate failed';
  end $issue97_build_gate_failed$;
\endif

begin;
set local statement_timeout='15min';
set local lock_timeout='2min';
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
  'brinesearch:issue97:graph:'||:'issue97_scope_state_code'||':'||:'issue97_scope_county_code'
));
select not public.brinesearch_issue97_cutover_active()
  and not exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
  and not exists(
    select 1 from public.brinesearch_road_graph_builds build
    where build.state_code=:'issue97_scope_state_code'
      and build.county_code=:'issue97_scope_county_code'
      and build.status in ('active','validated')
      and private_verification.brinesearch_issue97_graph_build_sources_current(build.id)
  ) as build_guard_ready
\gset issue97_gate_
\if :issue97_gate_build_guard_ready
\else
  \echo 'Transactional build guard failed; rolling back without a build'
  do $issue97_build_gate_failed$ begin
    raise exception 'Issue #97 transactional county build guard failed';
  end $issue97_build_gate_failed$;
\endif
select public.brinesearch_issue97_rebuild_county_graph(
  :'issue97_scope_state_code',:'issue97_scope_county_code'
) as build_result
\gset issue97_
commit;

select not public.brinesearch_issue97_cutover_active()
  and not exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
  and exists(
    select 1 from public.brinesearch_road_graph_builds build
    where build.state_code=:'issue97_scope_state_code'
      and build.county_code=:'issue97_scope_county_code'
      and build.status='validated'
      and private_verification.brinesearch_issue97_graph_build_sources_current(build.id)
  ) as postbuild_pass
\gset issue97_
\if :issue97_postbuild_pass
\else
  \echo 'Post-build production state is not one validated/current dark graph'
  do $issue97_build_postcheck_failed$ begin
    raise exception 'Issue #97 county build postcheck failed';
  end $issue97_build_postcheck_failed$;
\endif

\echo 'Validated dark-build result:'
\echo :issue97_build_result
