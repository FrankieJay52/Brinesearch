\set ON_ERROR_STOP on
\pset pager off
\timing on

select pg_catalog.upper(:'issue97_state') state_code,pg_catalog.upper(:'issue97_county') county_code
\gset issue97_scope_

select
  exists(select 1 from public.brinesearch_road_graph_counties c where c.active
    and c.state_code=:'issue97_scope_state_code' and c.county_code=:'issue97_scope_county_code') as footprint_ok,
  not exists(select 1 from public.brinesearch_road_graph_builds b
    where b.state_code=:'issue97_scope_state_code' and b.county_code=:'issue97_scope_county_code'
      and b.status in ('active','validated')
      and private_verification.brinesearch_issue97_graph_build_release_current(b.id)) as no_release_current_build,
  not public.brinesearch_issue97_cutover_active() as cutover_off,
  not exists(select 1 from public.brinesearch_road_graph_builds where status='staging') as no_staging,
  not exists(select 1 from pg_catalog.pg_stat_activity a where a.pid<>pg_catalog.pg_backend_pid()
    and a.state in ('active','idle in transaction','idle in transaction (aborted)')
    and a.query ilike '%brinesearch_issue97_rebuild_county_graph%') as no_builder
\gset issue97_gate_

\if :issue97_gate_footprint_ok
\else
  do $fail$ begin raise exception 'Issue #97 release county build: unknown county'; end $fail$;
\endif
\if :issue97_gate_no_release_current_build
\else
  do $fail$ begin raise exception 'Issue #97 release county build: a release-current active/validated graph already exists'; end $fail$;
\endif
\if :issue97_gate_cutover_off
\else
  do $fail$ begin raise exception 'Issue #97 release county build: cutover is active'; end $fail$;
\endif
\if :issue97_gate_no_staging
\else
  do $fail$ begin raise exception 'Issue #97 release county build: staging graph exists'; end $fail$;
\endif
\if :issue97_gate_no_builder
\else
  do $fail$ begin raise exception 'Issue #97 release county build: another builder is active'; end $fail$;
\endif

begin;
set local statement_timeout='90min';
set local lock_timeout='2min';
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
  'brinesearch:issue97:graph:'||:'issue97_scope_state_code'||':'||:'issue97_scope_county_code'
));
select not public.brinesearch_issue97_cutover_active()
  and not exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
  and not exists(select 1 from public.brinesearch_road_graph_builds b
    where b.state_code=:'issue97_scope_state_code' and b.county_code=:'issue97_scope_county_code'
      and b.status in ('active','validated')
      and private_verification.brinesearch_issue97_graph_build_release_current(b.id))
  as build_guard_ready
\gset issue97_gate_
\if :issue97_gate_build_guard_ready
\else
  do $fail$ begin raise exception 'Issue #97 release transactional build guard failed'; end $fail$;
\endif
select public.brinesearch_issue97_rebuild_county_graph(
  :'issue97_scope_state_code',:'issue97_scope_county_code'
) as build_result
\gset issue97_
commit;

select exists(select 1 from public.brinesearch_road_graph_builds b
  where b.state_code=:'issue97_scope_state_code' and b.county_code=:'issue97_scope_county_code'
    and b.status='validated' and b.activated_at is null
    and private_verification.brinesearch_issue97_graph_build_release_current(b.id))
  and not public.brinesearch_issue97_cutover_active()
  and not exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
  as postbuild_pass
\gset issue97_
\if :issue97_postbuild_pass
\else
  do $fail$ begin raise exception 'Issue #97 release county build did not produce one validated release-current dark graph'; end $fail$;
\endif
\echo 'Release-current validated dark build:'
\echo :issue97_build_result
