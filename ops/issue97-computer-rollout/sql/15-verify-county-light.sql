\set ON_ERROR_STOP on
\pset pager off
\timing on

begin read only;
set transaction isolation level repeatable read;
set local statement_timeout='2min';

select pg_catalog.upper(:'issue97_state') as state_code,
  pg_catalog.upper(:'issue97_county') as county_code
\gset issue97_scope_

\set issue97_light_pass false

with candidate as (
  select build.*
  from public.brinesearch_road_graph_builds build
  where build.state_code=:'issue97_scope_state_code'
    and build.county_code=:'issue97_scope_county_code'
    and build.status='validated'
    and build.activated_at is null
  order by build.completed_at desc nulls last,build.started_at desc,build.id desc
  limit 1
), recomputed as (
  select candidate.id,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      junction.stable_junction_key||':'||junction.graph_digest,
      ',' order by junction.stable_junction_key
    ),'')) as graph_digest,
    count(*) filter(where junction.junction_type<>'shared_segment')::integer
      as point_junction_count,
    count(*) filter(where junction.junction_type='shared_segment')::integer
      as shared_segment_count,
    count(*) filter(where junction.verification_status='held')::integer
      as held_junction_count
  from candidate
  join public.brinesearch_road_junctions junction
    on junction.build_id=candidate.id
  group by candidate.id
), child_counts as (
  select candidate.id,
    (
      select count(*)::integer
      from public.brinesearch_road_junction_memberships membership
      join public.brinesearch_road_junctions junction
        on junction.id=membership.junction_id
      where junction.build_id=candidate.id
    ) as membership_count,
    (
      select count(*)::integer
      from public.brinesearch_road_junction_anchors anchor
      join public.brinesearch_road_junctions junction
        on junction.id=anchor.junction_id
      where junction.build_id=candidate.id
    ) as anchor_count
  from candidate
), result as (
  select candidate.id as validated_build_id,
    private_verification.brinesearch_issue97_graph_build_sources_current(candidate.id)
      as sources_and_mapping_current,
    recomputed.graph_digest=candidate.graph_digest as graph_digest_match,
    recomputed.point_junction_count=candidate.point_junction_count as point_count_match,
    recomputed.shared_segment_count=candidate.shared_segment_count as shared_count_match,
    child_counts.membership_count=candidate.membership_count as membership_count_match,
    recomputed.held_junction_count=coalesce(
      (candidate.details->>'held_junction_count')::integer,0
    ) as held_count_match,
    recomputed.held_junction_count,
    child_counts.anchor_count,
    not public.brinesearch_issue97_cutover_active() as cutover_off,
    not exists(
      select 1
      from public.brinesearch_road_graph_builds staging
      where staging.state_code=candidate.state_code
        and staging.county_code=candidate.county_code
        and staging.status='staging'
    ) as no_staging,
    nullif(candidate.details->>'mapping_snapshot_digest','') is not null
      as mapping_receipt_present
  from candidate
  join recomputed using(id)
  join child_counts using(id)
)
select coalesce((
    select sources_and_mapping_current
      and graph_digest_match
      and point_count_match
      and shared_count_match
      and membership_count_match
      and held_count_match
      and cutover_off
      and no_staging
      and mapping_receipt_present
    from result
  ),false) as pass,
  (select validated_build_id from result) as validated_build_id,
  coalesce((select sources_and_mapping_current from result),false)
    as sources_and_mapping_current,
  coalesce((select graph_digest_match from result),false) as graph_digest_match,
  coalesce((select point_count_match from result),false) as point_count_match,
  coalesce((select shared_count_match from result),false) as shared_count_match,
  coalesce((select membership_count_match from result),false) as membership_count_match,
  coalesce((select held_count_match from result),false) as held_count_match,
  coalesce((select held_junction_count from result),0) as held_junction_count,
  coalesce((select anchor_count from result),0) as anchor_count,
  coalesce((select cutover_off from result),false) as cutover_off,
  coalesce((select no_staging from result),false) as no_staging,
  coalesce((select mapping_receipt_present from result),false) as mapping_receipt_present
\gset issue97_light_

\if :issue97_light_pass
  \echo 'Issue #97 lightweight dark-build verification: PASS build' :issue97_light_validated_build_id
  \echo '  sources/mapping current:' :issue97_light_sources_and_mapping_current
  \echo '  graph digest/counts:' :issue97_light_graph_digest_match :issue97_light_point_count_match :issue97_light_shared_count_match :issue97_light_membership_count_match
  \echo '  held count match / held junctions / anchors:' :issue97_light_held_count_match :issue97_light_held_junction_count :issue97_light_anchor_count
  \echo '  cutover off / no staging:' :issue97_light_cutover_off :issue97_light_no_staging
\else
  do $issue97_light_verify_failed$
  begin
    raise exception 'Issue #97 lightweight county dark-build verification failed';
  end
  $issue97_light_verify_failed$;
\endif

commit;
