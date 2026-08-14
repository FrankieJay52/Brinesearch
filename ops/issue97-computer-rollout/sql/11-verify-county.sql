\set ON_ERROR_STOP on
\pset pager off
\timing on

begin read only;
set transaction isolation level repeatable read;
set local statement_timeout='15min';

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

\set issue97_summary_pass false
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
), provenance_integrity as (
  select candidate.id,
    not exists(
      select 1
      from public.brinesearch_road_junction_memberships membership
      join public.brinesearch_road_junctions junction
        on junction.id=membership.junction_id
      where junction.build_id=candidate.id
        and membership.approach_data ? 'raw_source_measure'
        and (
          membership.approach_data->>'source_measure_normalized' is null
          or (
            membership.approach_data->>'source_measure_normalized'
          )::boolean is distinct from (
            (membership.approach_data->>'raw_source_measure')::numeric
              is distinct from membership.source_measure
          )
        )
    )
    and not exists(
      select 1
      from public.brinesearch_road_junctions junction
      join public.brinesearch_road_junction_memberships membership
        on membership.junction_id=junction.id
      join public.brinesearch_authoritative_road_identities identity
        on identity.id=membership.identity_id
      where junction.build_id=candidate.id
        and junction.junction_type='shared_segment'
        and (
          pg_catalog.jsonb_typeof(
            junction.source_provenance->'source_segment_keys_by_identity'
          ) is distinct from 'object'
          or (
            select array_agg(map_key.key order by map_key.key)
            from pg_catalog.jsonb_object_keys(
              junction.source_provenance->'source_segment_keys_by_identity'
            ) map_key(key)
          ) is distinct from (
            select array_agg(
              expected.identity_id::text order by expected.identity_id::text
            )
            from public.brinesearch_road_junction_memberships expected
            where expected.junction_id=junction.id
          )
          or junction.source_provenance->'source_segment_keys_by_identity'
               ->membership.identity_id::text
             is distinct from pg_catalog.to_jsonb(membership.source_segment_keys)
          or pg_catalog.cardinality(membership.source_segment_keys)=0
          or (
            nullif(
              membership.approach_data->>'chosen_source_segment_key',''
            ) is null
            and not coalesce(
              (membership.approach_data->>'source_measure_conflict')::boolean,
              false
            )
          )
          or (
            nullif(
              membership.approach_data->>'chosen_source_segment_key',''
            ) is not null
            and not (
              membership.approach_data->>'chosen_source_segment_key'
                =any(membership.source_segment_keys)
            )
          )
          or exists(
            select 1
            from unnest(membership.source_segment_keys) source_key(value)
            where not exists(
              select 1
              from public.brinesearch_authoritative_road_segments segment
              where segment.identity_id=membership.identity_id
                and segment.source_segment_key=source_key.value
                and segment.active
                and extensions.st_length(
                  extensions.st_collectionextract(extensions.st_intersection(
                    extensions.st_snaptogrid(segment.geom,0.0000001),
                    junction.geom
                  ),2)::extensions.geography
                )>0.02
            )
          )
          or (
            nullif(
              membership.approach_data->>'chosen_source_segment_key',''
            ) is not null
            and not exists(
            select 1
            from public.brinesearch_authoritative_road_segments chosen
            where chosen.identity_id=identity.id
              and chosen.source_segment_key=
                membership.approach_data->>'chosen_source_segment_key'
              and chosen.active
              and extensions.st_coveredby(
                extensions.st_startpoint(extensions.st_linemerge(junction.geom)),
                extensions.st_snaptogrid(chosen.geom,0.0000001)
              )
            )
          )
          or coalesce((
            select extensions.st_length(
              extensions.st_collectionextract(extensions.st_unaryunion(
                extensions.st_collect(extensions.st_collectionextract(
                  extensions.st_intersection(
                    extensions.st_snaptogrid(segment.geom,0.0000001),
                    junction.geom
                  ),2
                ))
              ),2)::extensions.geography
            )
            from public.brinesearch_authoritative_road_segments segment
            where segment.identity_id=membership.identity_id
              and segment.source_segment_key=any(membership.source_segment_keys)
              and segment.active
          ),0)<extensions.st_length(junction.geom::extensions.geography)-0.01
          or (
            coalesce(
              (membership.approach_data->>'source_measure_conflict')::boolean,
              false
            )
            and junction.verification_status<>'held'
          )
          or (
            membership.approach_data->>'measure_method'
              ='authoritative_linear_measure'
            and (
              membership.source_measure is null
              or membership.distance_along_road_m is distinct from
                membership.source_measure*1609.344
            )
          )
        )
    ) as pass
  from candidate
)
select candidate.id as validated_build_id,
  private_verification.brinesearch_issue97_graph_build_sources_current(candidate.id)
    as sources_current,
  child_counts.junction_rows,child_counts.anchor_rows,child_counts.membership_rows,
  child_counts.member_identities,candidate.graph_digest,
  candidate.details->>'mapping_snapshot_version' as mapping_snapshot_version,
  candidate.details->>'mapping_snapshot_digest' as mapping_snapshot_digest,
  true as pass
from candidate join child_counts using(id) join recomputed using(id)
join provenance_integrity using(id)
where recomputed.graph_digest=candidate.graph_digest
  and recomputed.point_junction_count=candidate.point_junction_count
  and recomputed.shared_segment_count=candidate.shared_segment_count
  and child_counts.membership_rows=candidate.membership_count
  and provenance_integrity.pass
  and private_verification.brinesearch_issue97_graph_build_sources_current(
    candidate.id
  )
\gset issue97_summary_

\if :issue97_summary_pass
  \echo 'County graph/digest/receipt summary: PASS build' :issue97_summary_validated_build_id
\else
  \echo 'County graph/digest/receipt summary failed'
  do $issue97_county_summary_failed$
  begin
    raise exception 'Issue #97 county graph/digest/receipt summary failed';
  end
  $issue97_county_summary_failed$;
\endif

with candidate as (
  select build.id,build.state_code,build.county_code
  from public.brinesearch_road_graph_builds build
  where build.state_code=:'issue97_scope_state_code'
    and build.county_code=:'issue97_scope_county_code'
    and build.status='validated'
  order by build.completed_at desc nulls last,build.started_at desc,build.id desc
  limit 1
), shared_targets as materialized (
  select candidate.state_code as build_state_code,
    candidate.county_code as build_county_code,
    junction.id as junction_id,junction.geom,junction.source_provenance,
    junction.verification_status,junction.confidence,
    membership.id as membership_id,membership.identity_id,
    membership.source_segment_keys,membership.source_measure,
    membership.distance_along_road_m,membership.approach_data
  from candidate
  join public.brinesearch_road_junctions junction
    on junction.build_id=candidate.id and junction.junction_type='shared_segment'
  join public.brinesearch_road_junction_memberships membership
    on membership.junction_id=junction.id and membership.membership_role='shared'
  join public.brinesearch_authoritative_road_identities identity
    on identity.id=membership.identity_id and identity.active
   and identity.drivable_status in ('drivable','non_drivable')
   and identity.public_access_status in ('public','private','access')
), shared_identities as materialized (
  select distinct target.identity_id
  from shared_targets target
), target_segments as materialized (
  select segment.id,segment.identity_id,segment.source_segment_key,
    segment.from_measure,segment.to_measure,segment.geom
  from candidate
  join private_verification.brinesearch_issue97_authoritative_road_segments_internal segment
    on segment.state_code=candidate.state_code
   and segment.county_code=candidate.county_code
   and segment.active
   and segment.drivable_status in ('drivable','non_drivable')
   and segment.public_access_status in ('public','private','access')
  join public.brinesearch_authoritative_road_identities identity
    on identity.id=segment.identity_id and identity.active
   and identity.drivable_status in ('drivable','non_drivable')
   and identity.public_access_status in ('public','private','access')
), external_segments as materialized (
  select distinct on(segment.id)
    segment.id,segment.identity_id,segment.source_segment_key,
    segment.from_measure,segment.to_measure,segment.geom
  from target_segments target_segment
  cross join shared_identities shared
  cross join candidate
  cross join lateral (
    select source.*
    from private_verification.brinesearch_issue97_authoritative_road_segments_internal source
    where source.identity_id=shared.identity_id and source.active
      and source.drivable_status in ('drivable','non_drivable')
      and source.public_access_status in ('public','private','access')
      and (
        source.state_code<>candidate.state_code
        or source.county_code<>candidate.county_code
      )
      and extensions.st_dwithin(
        source.geom::extensions.geography,
        target_segment.geom::extensions.geography,1
      )
    offset 0
  ) segment
  order by segment.id
), build_segments as materialized (
  select segment.id,segment.identity_id,segment.source_segment_key,
    segment.from_measure,segment.to_measure,segment.geom
  from target_segments segment
  join shared_identities shared using(identity_id)
  union all
  select segment.id,segment.identity_id,segment.source_segment_key,
    segment.from_measure,segment.to_measure,segment.geom
  from external_segments segment
), shared_candidate_base as materialized (
  select target.membership_id,target.geom,
    segment.id as source_segment_id,segment.source_segment_key,
    segment.from_measure,segment.to_measure,segment.geom as source_geom,
    extensions.st_snaptogrid(segment.geom,0.0000001) as canonical_source_geom,
    extensions.st_startpoint(extensions.st_linemerge(target.geom)) as shared_start
  from shared_targets target
  join build_segments segment
    on segment.identity_id=target.identity_id
   and segment.geom OPERATOR(extensions.&&)
       extensions.st_expand(target.geom,0.0000001)
), shared_overlap_candidates as materialized (
  select candidate.*,extensions.st_collectionextract(
    extensions.st_intersection(candidate.canonical_source_geom,candidate.geom),2
  ) as overlap_geom
  from shared_candidate_base candidate
  where extensions.st_intersects(candidate.canonical_source_geom,candidate.geom)
), shared_measured as materialized (
  select candidate.*,
    extensions.st_length(candidate.overlap_geom::extensions.geography)
      as overlap_length_m,
    extensions.st_length(candidate.source_geom::extensions.geography)
      as source_length_m,
    extensions.st_coveredby(
      candidate.shared_start,candidate.canonical_source_geom
    ) as covers_shared_start,
    case
      when extensions.st_coveredby(
        candidate.shared_start,candidate.canonical_source_geom
      ) and extensions.geometrytype(
        extensions.st_linemerge(candidate.source_geom)
      )='LINESTRING' then extensions.st_linelocatepoint(
        extensions.st_linemerge(candidate.source_geom),
        extensions.st_closestpoint(candidate.source_geom,candidate.shared_start)
      )
    end as fraction
  from shared_overlap_candidates candidate
  where extensions.st_length(candidate.overlap_geom::extensions.geography)>0.02
), shared_annotated as materialized (
  select measured.*,
    count(*) filter(where measured.covers_shared_start) over (
      partition by measured.membership_id
    )::integer as start_candidate_count,
    count(*) filter(where measured.covers_shared_start
      and measured.fraction is not null
      and measured.from_measure is not null
      and measured.to_measure is not null
    ) over (partition by measured.membership_id)::integer
      as measured_start_candidate_count,
    min((measured.from_measure+(measured.to_measure-measured.from_measure)*
      measured.fraction)::numeric) filter(where measured.covers_shared_start
      and measured.fraction is not null
      and measured.from_measure is not null
      and measured.to_measure is not null
    ) over (partition by measured.membership_id) as start_measure_min,
    max((measured.from_measure+(measured.to_measure-measured.from_measure)*
      measured.fraction)::numeric) filter(where measured.covers_shared_start
      and measured.fraction is not null
      and measured.from_measure is not null
      and measured.to_measure is not null
    ) over (partition by measured.membership_id) as start_measure_max
  from shared_measured measured
), shared_ranked as materialized (
  select annotated.*,pg_catalog.row_number() over (
    partition by annotated.membership_id
    order by (
      annotated.covers_shared_start and (
        annotated.start_candidate_count=1
        or annotated.measured_start_candidate_count=1
        or (annotated.measured_start_candidate_count>1
          and annotated.start_measure_max-annotated.start_measure_min
            <=0.0000001)
      )
    ) desc,
    (annotated.fraction is not null and annotated.from_measure is not null
      and annotated.to_measure is not null) desc,
    annotated.overlap_length_m desc,annotated.from_measure nulls last,
    annotated.source_segment_key,annotated.source_segment_id
  )::integer as choice_rank
  from shared_annotated annotated
), shared_summary as materialized (
  select target.membership_id,
    coalesce(array_agg(distinct ranked.source_segment_key
      order by ranked.source_segment_key) filter(
        where ranked.source_segment_key is not null
      ),'{}'::text[]) as expected_source_segment_keys,
    coalesce(max(ranked.start_candidate_count),0)::integer
      as start_candidate_count,
    coalesce(max(ranked.measured_start_candidate_count),0)::integer
      as measured_start_candidate_count,
    max(ranked.start_measure_min) as start_measure_min,
    max(ranked.start_measure_max) as start_measure_max,
    coalesce(extensions.st_length(extensions.st_collectionextract(
      extensions.st_unaryunion(extensions.st_collect(ranked.overlap_geom)),2
    )::extensions.geography),0) as covered_length_m
  from shared_targets target
  left join shared_ranked ranked on ranked.membership_id=target.membership_id
  group by target.membership_id
), shared_choice as materialized (
  select ranked.*
  from shared_ranked ranked
  where ranked.choice_rank=1 and ranked.covers_shared_start
    and (
      ranked.start_candidate_count=1
      or (ranked.measured_start_candidate_count=1
        and ranked.fraction is not null and ranked.from_measure is not null
        and ranked.to_measure is not null)
      or (ranked.measured_start_candidate_count>1
        and ranked.start_measure_max-ranked.start_measure_min<=0.0000001
        and ranked.fraction is not null and ranked.from_measure is not null
        and ranked.to_measure is not null)
    )
), shared_segment_totals as materialized (
  select shared.identity_id,count(segment.id)::integer as segment_count
  from shared_identities shared
  left join build_segments segment using(identity_id)
  group by shared.identity_id
), shared_choice_values as materialized (
  select choice.*,
    case when choice.from_measure is not null and choice.to_measure is not null
      then choice.from_measure+(choice.to_measure-choice.from_measure)*choice.fraction
    end as raw_source_measure,
    private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
      choice.source_segment_key,
      case when choice.from_measure is not null and choice.to_measure is not null
        then choice.from_measure+(choice.to_measure-choice.from_measure)*choice.fraction
      end
    ) as normalized_source_measure
  from shared_choice choice
), expected_shared as materialized (
  select target.*,summary.expected_source_segment_keys,
    summary.start_candidate_count,summary.measured_start_candidate_count,
    summary.covered_length_m,
    summary.start_candidate_count>1 and (
      summary.measured_start_candidate_count=0
      or (summary.measured_start_candidate_count>1
        and summary.start_measure_max-summary.start_measure_min>0.0000001)
    ) as source_measure_conflict,
    choice.source_segment_key as expected_chosen_segment_key,
    choice.raw_source_measure as expected_raw_source_measure,
    choice.normalized_source_measure as expected_source_measure,
    case
      when choice.from_measure is not null and choice.to_measure is not null
        then choice.normalized_source_measure*1609.344
      when totals.segment_count=1 and choice.fraction is not null
        then (choice.fraction*choice.source_length_m)::numeric
    end as expected_distance_along_road_m,
    case
      when choice.from_measure is not null and choice.to_measure is not null
        then 'authoritative_linear_measure'
      when totals.segment_count=1 and choice.fraction is not null
        then 'single_source_feature_geometry'
      else 'ambiguous'
    end as expected_measure_method
  from shared_targets target
  join shared_summary summary using(membership_id)
  join shared_segment_totals totals on totals.identity_id=target.identity_id
  left join shared_choice_values choice using(membership_id)
), expected_shared_cards as materialized (
  select expected.junction_id,
    pg_catalog.jsonb_object_agg(
      expected.identity_id::text,
      pg_catalog.to_jsonb(expected.expected_source_segment_keys)
      order by expected.identity_id::text
    ) as expected_source_segment_keys_by_identity,
    coalesce(pg_catalog.bool_or(expected.source_measure_conflict),false)
      as source_measure_conflict
  from expected_shared expected
  group by expected.junction_id
)
select
  exists(select 1 from candidate) as validated_exists,
  coalesce((select private_verification.brinesearch_issue97_graph_build_sources_current(id)
    from candidate),false) as validated_current,
  true as graph_integrity,
  coalesce((
    select not exists(
      select 1
      from expected_shared expected
      join expected_shared_cards expected_card
        on expected_card.junction_id=expected.junction_id
      where expected.source_segment_keys is distinct from
              expected.expected_source_segment_keys
        or pg_catalog.cardinality(expected.expected_source_segment_keys)=0
        or expected.start_candidate_count=0
        or expected.covered_length_m<
             extensions.st_length(expected.geom::extensions.geography)-0.01
        or expected.source_provenance->'source_segment_keys_by_identity'
             is distinct from
               expected_card.expected_source_segment_keys_by_identity
        or (expected.approach_data->>'source_start_candidate_count')::integer
             is distinct from expected.start_candidate_count
        or (
             expected.approach_data
               ->>'measured_source_start_candidate_count'
           )::integer is distinct from expected.measured_start_candidate_count
        or coalesce((
             expected.approach_data->>'source_measure_conflict'
           )::boolean,false) is distinct from expected.source_measure_conflict
        or nullif(
             expected.approach_data->>'chosen_source_segment_key',''
           ) is distinct from expected.expected_chosen_segment_key
        or expected.source_measure is distinct from expected.expected_source_measure
        or expected.distance_along_road_m is distinct from
             expected.expected_distance_along_road_m
        or expected.approach_data->>'measure_method'
             is distinct from expected.expected_measure_method
        or case
          when expected.expected_chosen_segment_key like 'WV:WVDOT:SEGMENT:%'
            and expected.expected_raw_source_measure is not null then
            not (expected.approach_data ? 'raw_source_measure')
            or not (expected.approach_data ? 'source_measure_normalized')
            or not (
              expected.approach_data
                ? 'endpoint_measure_normalization_bound_miles'
            )
            or (
              expected.approach_data->>'raw_source_measure'
            )::numeric is distinct from
              expected.expected_raw_source_measure::numeric
            or (
              expected.approach_data->>'source_measure_normalized'
            )::boolean is distinct from (
              expected.expected_raw_source_measure::numeric
                is distinct from expected.expected_source_measure
            )
            or (
              expected.approach_data
                ->>'endpoint_measure_normalization_bound_miles'
            )::numeric is distinct from 0.0000001::numeric
          else
            expected.approach_data ? 'raw_source_measure'
            or expected.approach_data ? 'source_measure_normalized'
            or expected.approach_data
                 ? 'endpoint_measure_normalization_bound_miles'
          end
        or expected.source_provenance->>'source_coverage_proof'
             is distinct from 'exact_canonical_grid_line_intersection'
        or (
             expected.source_provenance->>'source_coverage_grid_degrees'
           )::numeric is distinct from 0.0000001::numeric
        or coalesce((
             expected.source_provenance->>'source_measure_conflict'
           )::boolean,false) is distinct from
             expected_card.source_measure_conflict
        or (
             expected.source_provenance
               ->>'source_measure_conflict_bound_miles'
           )::numeric is distinct from 0.0000001::numeric
        or expected.verification_status is distinct from case
          when coalesce((
            expected.source_provenance->>'grade_conflict'
          )::boolean,false) or expected_card.source_measure_conflict
          then 'held' else 'verified' end
        or expected.confidence is distinct from case
          when coalesce((
            expected.source_provenance->>'grade_conflict'
          )::boolean,false) or expected_card.source_measure_conflict
          then 'held' else 'authoritative' end
    )
    from candidate
  ),false) as provenance_integrity,
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
  do $issue97_county_verify_failed$
  begin
    raise exception 'Issue #97 county validated-dark verification failed';
  end
  $issue97_county_verify_failed$;
\endif
\if :issue97_gate_validated_current
\else
  \echo 'Newest validated build is not source/mapping current'
  do $issue97_county_verify_failed$
  begin
    raise exception 'Issue #97 county validated-dark verification failed';
  end
  $issue97_county_verify_failed$;
\endif
\if :issue97_gate_graph_integrity
\else
  \echo 'Validated graph digest/count integrity failed'
  do $issue97_county_verify_failed$
  begin
    raise exception 'Issue #97 county validated-dark verification failed';
  end
  $issue97_county_verify_failed$;
\endif
\if :issue97_gate_provenance_integrity
\else
  \echo 'Validated graph measure/shared provenance integrity failed'
  do $issue97_county_verify_failed$
  begin
    raise exception 'Issue #97 county validated-dark verification failed';
  end
  $issue97_county_verify_failed$;
\endif
\if :issue97_gate_no_staging_build
\else
  \echo 'Staging graph state exists'
  do $issue97_county_verify_failed$
  begin
    raise exception 'Issue #97 county validated-dark verification failed';
  end
  $issue97_county_verify_failed$;
\endif
\if :issue97_gate_cutover_off
\else
  \echo 'Global cutover changed unexpectedly'
  do $issue97_county_verify_failed$
  begin
    raise exception 'Issue #97 county validated-dark verification failed';
  end
  $issue97_county_verify_failed$;
\endif
\if :issue97_gate_frozen_counties_current
\else
  \echo 'BEL/JEF/NOB frozen currentness changed'
  do $issue97_county_verify_failed$
  begin
    raise exception 'Issue #97 county validated-dark verification failed';
  end
  $issue97_county_verify_failed$;
\endif

commit;

-- Repeatable read keeps the deep reconstruction internally coherent. Re-open
-- a fresh snapshot before PASS so a concurrent staging/cutover/source change
-- cannot be hidden by that earlier snapshot.
begin read only;
set local statement_timeout='2min';
select
  exists(
    select 1
    from public.brinesearch_road_graph_builds build
    where build.id=:'issue97_summary_validated_build_id'::uuid
      and build.state_code=:'issue97_scope_state_code'
      and build.county_code=:'issue97_scope_county_code'
      and build.status='validated' and build.activated_at is null
      and private_verification.brinesearch_issue97_graph_build_sources_current(
        build.id
      )
      and build.id=(
        select latest.id
        from public.brinesearch_road_graph_builds latest
        where latest.state_code=:'issue97_scope_state_code'
          and latest.county_code=:'issue97_scope_county_code'
          and latest.status='validated'
        order by latest.completed_at desc nulls last,
          latest.started_at desc,latest.id desc
        limit 1
      )
  )
  and not exists(
    select 1 from public.brinesearch_road_graph_builds where status='staging'
  )
  and not public.brinesearch_issue97_cutover_active()
  and (
    select count(*)
    from public.brinesearch_road_graph_builds build
    where build.state_code='OH' and build.county_code in ('BEL','JEF','NOB')
      and build.status='active'
      and private_verification.brinesearch_issue97_graph_build_sources_current(
        build.id
      )
  )=3
  and not exists(
    select 1
    from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in (
        'active','idle in transaction','idle in transaction (aborted)'
      )
      and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'
  ) as pass
\gset issue97_post_

\if :issue97_post_pass
\else
  \echo 'Fresh post-verification state check failed'
  do $issue97_county_postcheck_failed$
  begin
    raise exception 'Issue #97 county post-verification state check failed';
  end
  $issue97_county_postcheck_failed$;
\endif
commit;
\echo 'County validated-dark verification: PASS'
