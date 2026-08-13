\set ON_ERROR_STOP on
\pset pager off
\timing on

with required_scopes as (
  select scope.dataset_id,scope.state_code,scope.county_code
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset on dataset.id=scope.dataset_id
  where scope.active and scope.ingest_enabled and scope.required_for_graph and dataset.active
)
select
  not public.brinesearch_issue97_cutover_active() as cutover_off,
  (select count(*) from required_scopes)=114
    and not exists(
      select 1 from required_scopes scope
      where not private_verification.brinesearch_issue97_dataset_scope_current(
        scope.dataset_id,scope.state_code,scope.county_code
      )
    ) as all_sources_current,
  (select count(*) from public.brinesearch_road_graph_counties where active)=39
    and not exists(
      select 1 from public.brinesearch_road_graph_counties county
      where county.active and (
        select count(*) from public.brinesearch_road_graph_builds build
        where build.state_code=county.state_code and build.county_code=county.county_code
          and build.status='active'
          and private_verification.brinesearch_issue97_graph_build_sources_current(build.id)
      )<>1
    )
    and not exists(
      select 1 from public.brinesearch_road_graph_builds build
      left join public.brinesearch_road_graph_counties county
        on county.state_code=build.state_code and county.county_code=build.county_code
        and county.active
      where build.status='active' and county.state_code is null
    )
    as all_graphs_active_current,
  not exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
    as no_staging_build
\gset issue97_gate_

\if :issue97_gate_cutover_off
\else
  \echo 'Global cutover must remain off for dark direction preparation'
  \quit 3
\endif
\if :issue97_gate_all_sources_current
\else
  \echo 'All 114 source scopes must be current'
  \quit 3
\endif
\if :issue97_gate_all_graphs_active_current
\else
  \echo 'All 39 county graphs must be active and source-current'
  \quit 3
\endif
\if :issue97_gate_no_staging_build
\else
  \echo 'A staging graph exists; refusing directions batch'
  \quit 3
\endif

begin;
set local statement_timeout='60min';
set local lock_timeout='2min';
select 1 / case when not public.brinesearch_issue97_cutover_active()
  and not exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
  and (select count(*) from public.brinesearch_road_graph_counties where active)=39
  and not exists(
    select 1 from public.brinesearch_road_graph_counties county
    where county.active and (
      select count(*) from public.brinesearch_road_graph_builds build
      where build.state_code=county.state_code and build.county_code=county.county_code
        and build.status='active'
        and private_verification.brinesearch_issue97_graph_build_sources_current(build.id)
    )<>1
  ) then 1 else 0 end as fail_closed_direction_guard;
select public.brinesearch_issue97_refresh_saved_road_reconciliation()
  as saved_road_reconciliation
\gset issue97_
select public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(null)
  as dark_direction_pipeline
\gset issue97_
commit;

select not public.brinesearch_issue97_cutover_active()
  and not exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
  as post_direction_pass
\gset issue97_
\if :issue97_post_direction_pass
\else
  \echo 'Post-direction cutover/staging state changed unexpectedly'
  \quit 4
\endif

\echo 'Saved-road reconciliation:'
\echo :issue97_saved_road_reconciliation
\echo 'Dark direction pipeline (no Google publication/cutover):'
\echo :issue97_dark_direction_pipeline
