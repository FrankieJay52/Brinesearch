\set ON_ERROR_STOP on
\pset pager off
\timing on

begin read only;
set local statement_timeout='2min';

select pg_catalog.upper(:'issue97_state') as state_code,
  pg_catalog.upper(:'issue97_county') as county_code
\gset issue97_scope_

select build.id,build.state_code,build.county_code,build.county_name,build.status,
  private_verification.brinesearch_issue97_graph_build_sources_current(build.id)
    as sources_current,
  build.source_revision_digest,build.graph_digest,build.algorithm_version,
  build.source_segment_count,build.identity_count,build.point_junction_count,
  build.shared_segment_count,build.membership_count,
  build.details->>'held_junction_count' as held_junction_count,
  build.started_at,build.completed_at,build.activated_at
from public.brinesearch_road_graph_builds build
where build.state_code=:'issue97_scope_state_code'
  and build.county_code=:'issue97_scope_county_code'
order by build.started_at desc,build.id desc;

with candidate as (
  select build.*
  from public.brinesearch_road_graph_builds build
  where build.state_code=:'issue97_scope_state_code'
    and build.county_code=:'issue97_scope_county_code'
    and build.status='validated'
  order by build.completed_at desc nulls last,build.started_at desc,build.id desc
  limit 1
), child_counts as (
  select candidate.id,
    count(distinct junction.id)::integer as junction_rows,
    count(distinct anchor.id)::integer as anchor_rows,
    count(distinct membership.id)::integer as membership_rows,
    count(distinct membership.identity_id)::integer as member_identities
  from candidate
  left join public.brinesearch_road_junctions junction on junction.build_id=candidate.id
  left join public.brinesearch_road_junction_anchors anchor on anchor.junction_id=junction.id
  left join public.brinesearch_road_junction_memberships membership on membership.junction_id=junction.id
  group by candidate.id
), recomputed as (
  select candidate.id,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      junction.stable_junction_key||':'||junction.graph_digest,','
      order by junction.stable_junction_key
    ),'')) as graph_digest,
    count(*) filter(where junction.junction_type<>'shared_segment')::integer
      as point_junction_count,
    count(*) filter(where junction.junction_type='shared_segment')::integer
      as shared_segment_count
  from candidate
  join public.brinesearch_road_junctions junction on junction.build_id=candidate.id
  group by candidate.id
)
select candidate.id as validated_build_id,
  private_verification.brinesearch_issue97_graph_build_sources_current(candidate.id)
    as sources_current,
  child_counts.junction_rows,child_counts.anchor_rows,child_counts.membership_rows,
  child_counts.member_identities,candidate.graph_digest,
  candidate.details->>'mapping_snapshot_version' as mapping_snapshot_version,
  candidate.details->>'mapping_snapshot_digest' as mapping_snapshot_digest
from candidate join child_counts using(id) join recomputed using(id)
where recomputed.graph_digest=candidate.graph_digest
  and recomputed.point_junction_count=candidate.point_junction_count
  and recomputed.shared_segment_count=candidate.shared_segment_count
  and child_counts.membership_rows=candidate.membership_count;

with candidate as (
  select build.id
  from public.brinesearch_road_graph_builds build
  where build.state_code=:'issue97_scope_state_code'
    and build.county_code=:'issue97_scope_county_code'
    and build.status='validated'
  order by build.completed_at desc nulls last,build.started_at desc,build.id desc
  limit 1
)
select
  exists(select 1 from candidate) as validated_exists,
  coalesce((select private_verification.brinesearch_issue97_graph_build_sources_current(id)
    from candidate),false) as validated_current,
  coalesce((
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      junction.stable_junction_key||':'||junction.graph_digest,','
      order by junction.stable_junction_key
    ),''))=candidate_build.graph_digest
      and count(*) filter(where junction.junction_type<>'shared_segment')::integer
        =candidate_build.point_junction_count
      and count(*) filter(where junction.junction_type='shared_segment')::integer
        =candidate_build.shared_segment_count
      and (select count(*) from public.brinesearch_road_junction_memberships membership
        join public.brinesearch_road_junctions member_junction
          on member_junction.id=membership.junction_id
        where member_junction.build_id=candidate_build.id)=candidate_build.membership_count
    from candidate
    join public.brinesearch_road_graph_builds candidate_build on candidate_build.id=candidate.id
    join public.brinesearch_road_junctions junction on junction.build_id=candidate.id
    group by candidate_build.id
  ),false) as graph_integrity,
  not exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
    as no_staging_build,
  not public.brinesearch_issue97_cutover_active() as cutover_off,
  (select count(*) from public.brinesearch_road_graph_builds build
    where build.state_code='OH' and build.county_code in ('BEL','JEF','NOB')
      and build.status='active'
      and private_verification.brinesearch_issue97_graph_build_sources_current(build.id))=3
    as frozen_counties_current
\gset issue97_gate_

\if :issue97_gate_validated_exists
\else
  \echo 'No validated inactive county build exists'
  rollback;
  \quit 3
\endif
\if :issue97_gate_validated_current
\else
  \echo 'Newest validated build is not source/mapping current'
  rollback;
  \quit 3
\endif
\if :issue97_gate_graph_integrity
\else
  \echo 'Validated graph digest/count integrity failed'
  rollback;
  \quit 3
\endif
\if :issue97_gate_no_staging_build
\else
  \echo 'Staging graph state exists'
  rollback;
  \quit 3
\endif
\if :issue97_gate_cutover_off
\else
  \echo 'Global cutover changed unexpectedly'
  rollback;
  \quit 3
\endif
\if :issue97_gate_frozen_counties_current
\else
  \echo 'BEL/JEF/NOB frozen currentness changed'
  rollback;
  \quit 3
\endif

commit;
\echo 'County validated-dark verification: PASS'
