\set ON_ERROR_STOP on
\pset pager off
\timing on

begin read only;
set local statement_timeout='2min';

select pg_catalog.upper(:'issue97_state') as state_code,
  pg_catalog.upper(:'issue97_county') as county_code
\gset issue97_scope_

select pg_catalog.clock_timestamp() as checked_at,
  public.brinesearch_issue97_cutover_active() as global_cutover_active;

select activity.pid,activity.application_name,activity.state,
  activity.xact_start,activity.query_start,
  pg_catalog.left(activity.query,240) as query
from pg_catalog.pg_stat_activity activity
where activity.pid<>pg_catalog.pg_backend_pid()
  and (activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'
    or activity.application_name='brinesearch-issue97-computer-rollout')
order by activity.query_start;

select build.id,build.status,
  private_verification.brinesearch_issue97_graph_build_sources_current(build.id)
    as sources_current,
  build.graph_digest,build.source_revision_digest,
  build.source_segment_count,build.identity_count,build.point_junction_count,
  build.shared_segment_count,build.membership_count,
  build.started_at,build.completed_at,build.activated_at
from public.brinesearch_road_graph_builds build
where build.state_code=:'issue97_scope_state_code'
  and build.county_code=:'issue97_scope_county_code'
order by build.started_at desc,build.id desc;

select build.id as build_id,build.status,
  count(distinct junction.id)::integer as junction_rows,
  count(distinct anchor.id)::integer as anchor_rows,
  count(distinct membership.id)::integer as membership_rows
from public.brinesearch_road_graph_builds build
left join public.brinesearch_road_junctions junction on junction.build_id=build.id
left join public.brinesearch_road_junction_anchors anchor on anchor.junction_id=junction.id
left join public.brinesearch_road_junction_memberships membership on membership.junction_id=junction.id
where build.state_code=:'issue97_scope_state_code'
  and build.county_code=:'issue97_scope_county_code'
group by build.id,build.status,build.started_at
order by build.started_at desc,build.id desc;

commit;
