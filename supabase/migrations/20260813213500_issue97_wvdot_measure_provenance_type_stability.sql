-- GitHub #97 — make WVDOT graph provenance type- and snap-grid-stable.
--
-- The first production-dark WV/OHI generation exposed two provenance defects:
--
-- 1. ST_LineLocatePoint returns double precision while stored WVDOT M values are
--    numeric. The calculated raw measure deliberately remains double precision,
--    but mixed-type IS DISTINCT FROM marks unchanged persisted values as
--    normalized unless both sides are compared at the numeric storage boundary.
-- 2. Shared linework is deliberately built on a 1e-7-degree snap grid, but the
--    later source-segment recovery compares that snapped linework to unsnapped
--    segments. The exact line-intersection length then collapses to zero, leaving
--    shared source keys and measures empty.
-- The resulting OHI generation is validated but inactive. It must remain as
-- immutable rejected audit history and must never be activated.
--
-- This forward migration replaces only the effective graph builder, using exact
-- definition anchors and preserving its owner/ACL/security metadata. It carries
-- one exact canonical-grid coverage relation from final shared cards into both
-- junction and membership provenance, and compares raw/stored measures at the
-- numeric storage boundary without changing interpolation arithmetic. It then
-- rejects exactly the known inactive OHI generation under its complete
-- digest/count/defect guard.
-- It changes no source, mapping, junction, anchor, membership, active graph, route,
-- Google publication, or global-cutover row.

-- Freeze every registered county build lane before replacing the shared builder
-- or transitioning the audited inactive generation to rejected history.
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

create temporary table issue97_wvdot_provenance_before on commit drop as
select
  public.brinesearch_issue97_cutover_active() as cutover_active,
  (select count(*) from public.brinesearch_road_graph_builds) as build_count,
  (select count(*) from public.brinesearch_road_graph_builds where status='staging')
    as staging_count,
  (select count(*) from public.brinesearch_road_junctions) as junction_count,
  (select count(*) from public.brinesearch_road_junction_anchors) as anchor_count,
  (select count(*) from public.brinesearch_road_junction_memberships) as membership_count,
  pg_catalog.pg_get_functiondef(proc.oid) as builder_definition,
  proc.proowner as builder_owner,
  proc.proacl as builder_acl
from pg_catalog.pg_proc proc
where proc.oid=
  'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure;

do $issue97_verify_failed_ohi_generation$
declare
  v_build public.brinesearch_road_graph_builds%rowtype;
  v_flagged_total bigint;
  v_flagged_true bigint;
  v_false_positive bigint;
  v_semantic_true bigint;
  v_false_negative bigint;
  v_shared_junctions bigint;
  v_shared_memberships bigint;
  v_shared_json_null bigint;
  v_shared_empty_keys bigint;
  v_shared_missing_choice bigint;
  v_shared_null_measure bigint;
  v_shared_null_distance bigint;
begin
  if (select cutover_active from issue97_wvdot_provenance_before)
     or (select staging_count from issue97_wvdot_provenance_before)<>0 then
    raise exception 'Issue #97 provenance repair requires cutover off and zero staging builds';
  end if;
  if (select count(*) from public.brinesearch_road_graph_builds
      where state_code='WV' and county_code='OHI')<>1 then
    raise exception 'Issue #97 provenance repair requires exactly one audited OHI generation';
  end if;

  select build.* into strict v_build
  from public.brinesearch_road_graph_builds build
  where build.id='6573d51a-700a-458c-9d6e-c0d22c0e4201'::uuid;

  if v_build.state_code<>'WV' or v_build.county_code<>'OHI'
     or v_build.status<>'validated' or v_build.activated_at is not null
     or v_build.source_revision_digest<>'06f8d4f4ea6396058342178ecb159b6c'
     or v_build.graph_digest<>'17d4c2f6e3ae231f66abbb38b83268bc'
     or v_build.algorithm_version<>'issue97-authoritative-topology-v2'
     or v_build.source_segment_count<>1835 or v_build.identity_count<>1773
     or v_build.point_junction_count<>2587 or v_build.shared_segment_count<>61
     or v_build.membership_count<>5977
     or v_build.details->>'held_junction_count'<>'500'
     or v_build.details->>'mapping_snapshot_digest'<>'eeb91b6a932d331fce2dc5e5a25e3590'
     or not private_verification.brinesearch_issue97_graph_build_sources_current(v_build.id)
     or (select count(*) from public.brinesearch_road_junctions
         where build_id=v_build.id)<>2648
     or (select count(*) from public.brinesearch_road_junction_anchors anchor
         join public.brinesearch_road_junctions junction on junction.id=anchor.junction_id
         where junction.build_id=v_build.id)<>2709
     or (select count(*) from public.brinesearch_road_junction_memberships membership
         join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
         where junction.build_id=v_build.id)<>5977
     or exists(select 1 from public.brinesearch_pad_roads
         where junction_build_id=v_build.id)
     or exists(select 1 from public.brinesearch_route_review_segments
         where junction_build_id=v_build.id) then
    raise exception 'Issue #97 audited OHI generation identity, currentness, or row contract changed';
  end if;

  select
    count(*) filter(where membership.approach_data ? 'raw_source_measure'),
    count(*) filter(where membership.approach_data->>'source_measure_normalized'='true'),
    count(*) filter(where membership.approach_data->>'source_measure_normalized'='true'
      and (membership.approach_data->>'raw_source_measure')::numeric
        is not distinct from membership.source_measure),
    count(*) filter(where membership.approach_data->>'source_measure_normalized'='true'
      and (membership.approach_data->>'raw_source_measure')::numeric
        is distinct from membership.source_measure),
    count(*) filter(where membership.approach_data->>'source_measure_normalized'='false'
      and (membership.approach_data->>'raw_source_measure')::numeric
        is distinct from membership.source_measure),
    count(distinct junction.id) filter(where junction.junction_type='shared_segment'),
    count(*) filter(where junction.junction_type='shared_segment'),
    count(distinct junction.id) filter(where junction.junction_type='shared_segment'
      and junction.source_provenance->'source_segment_keys_by_identity'='null'::jsonb),
    count(*) filter(where junction.junction_type='shared_segment'
      and pg_catalog.cardinality(membership.source_segment_keys)=0),
    count(*) filter(where junction.junction_type='shared_segment'
      and nullif(membership.approach_data->>'chosen_source_segment_key','') is null),
    count(*) filter(where junction.junction_type='shared_segment'
      and membership.source_measure is null),
    count(*) filter(where junction.junction_type='shared_segment'
      and membership.distance_along_road_m is null)
  into v_flagged_total,v_flagged_true,v_false_positive,v_semantic_true,v_false_negative,
    v_shared_junctions,v_shared_memberships,v_shared_json_null,v_shared_empty_keys,
    v_shared_missing_choice,v_shared_null_measure,v_shared_null_distance
  from public.brinesearch_road_junctions junction
  join public.brinesearch_road_junction_memberships membership
    on membership.junction_id=junction.id
  where junction.build_id=v_build.id;

  if v_flagged_total<>5842 or v_flagged_true<>5508
     or v_false_positive<>4689 or v_semantic_true<>819 or v_false_negative<>0
     or v_shared_junctions<>61 or v_shared_memberships<>135
     or v_shared_json_null<>61 or v_shared_empty_keys<>135
     or v_shared_missing_choice<>135 or v_shared_null_measure<>135
     or v_shared_null_distance<>135 then
    raise exception 'Issue #97 audited OHI provenance defect signature changed';
  end if;
end
$issue97_verify_failed_ohi_generation$;

do $issue97_patch_wvdot_graph_provenance$
declare
  v_definition text;
  v_patched text;
  v_count integer;
  v_start_pos integer;
  v_end_rel integer;
  v_end_pos integer;
  v_drop_old constant text:=
    '  drop table if exists pg_temp.tmp_issue97_shared;';
  v_drop_new constant text:=$new$  drop table if exists pg_temp.tmp_issue97_shared;
  drop table if exists pg_temp.tmp_issue97_shared_segment_coverage;$new$;
  v_coverage_old constant text:=$old$  from dumped
  where extensions.st_length(geom::extensions.geography)>0.02;

  -- Shared geometry is one logical connection card with two anchors.$old$;
  v_coverage_new constant text:=$new$  from dumped
  where extensions.st_length(geom::extensions.geography)>0.02;

  -- Associate every final card with exact contributing source segments on the
  -- same canonical grid that created the card. This relation is the sole source
  -- for junction provenance, membership keys, start-measure choice and
  -- validation; no proximity or name evidence participates.
  create temporary table tmp_issue97_shared_segment_coverage on commit drop as
  with candidate_base as materialized (
    select s.geom_key,s.identity_ids,s.geom as shared_geom,
      extensions.st_startpoint(extensions.st_linemerge(s.geom)) as shared_start,
      member.identity_id,seg.id as source_segment_id,
      seg.source_segment_key,seg.from_measure,seg.to_measure,
      seg.geom as source_geom,
      extensions.st_snaptogrid(seg.geom,0.0000001) as canonical_source_geom
    from tmp_issue97_shared s
    cross join lateral unnest(s.identity_ids) member(identity_id)
    join tmp_issue97_segments seg on seg.identity_id=member.identity_id
      and seg.geom OPERATOR(extensions.&&) extensions.st_expand(s.geom,0.0000001)
  ), overlap_candidates as materialized (
    select base.*,
      extensions.st_collectionextract(extensions.st_intersection(
        base.canonical_source_geom,base.shared_geom
      ),2) as overlap_geom
    from candidate_base base
    where extensions.st_intersects(base.canonical_source_geom,base.shared_geom)
  ), measured as (
    select candidate.*,
      extensions.st_length(candidate.overlap_geom::extensions.geography)
        as overlap_length_m,
      extensions.st_length(candidate.shared_geom::extensions.geography)
        as shared_length_m,
      extensions.st_length(candidate.source_geom::extensions.geography)
        as source_length_m,
      extensions.st_coveredby(
        candidate.shared_start,candidate.canonical_source_geom
      ) as covers_shared_start,
      case
        when extensions.st_coveredby(
          candidate.shared_start,candidate.canonical_source_geom
        )
        and extensions.geometrytype(
          extensions.st_linemerge(candidate.source_geom)
        )='LINESTRING'
        then extensions.st_linelocatepoint(
          extensions.st_linemerge(candidate.source_geom),
          extensions.st_closestpoint(
            candidate.source_geom,candidate.shared_start
          )
        )
      end as fraction
    from overlap_candidates candidate
    where extensions.st_length(candidate.overlap_geom::extensions.geography)>0.02
  ), annotated as (
    select measured.*,
      count(*) filter(where measured.covers_shared_start) over (
        partition by measured.geom_key,measured.identity_ids,measured.identity_id
      )::integer as start_candidate_count,
      count(*) filter(where measured.covers_shared_start
        and measured.fraction is not null
        and measured.from_measure is not null
        and measured.to_measure is not null
      ) over (
        partition by measured.geom_key,measured.identity_ids,measured.identity_id
      )::integer as measured_start_candidate_count,
      min((
        measured.from_measure+
          (measured.to_measure-measured.from_measure)*measured.fraction
      )::numeric) filter(where measured.covers_shared_start
        and measured.fraction is not null
        and measured.from_measure is not null
        and measured.to_measure is not null
      ) over (
        partition by measured.geom_key,measured.identity_ids,measured.identity_id
      ) as start_measure_min,
      max((
        measured.from_measure+
          (measured.to_measure-measured.from_measure)*measured.fraction
      )::numeric) filter(where measured.covers_shared_start
        and measured.fraction is not null
        and measured.from_measure is not null
        and measured.to_measure is not null
      ) over (
        partition by measured.geom_key,measured.identity_ids,measured.identity_id
      ) as start_measure_max
    from measured
  )
  select annotated.*,
    pg_catalog.row_number() over (
      partition by annotated.geom_key,annotated.identity_ids,annotated.identity_id
      order by
        (
          annotated.covers_shared_start
          and (
            annotated.start_candidate_count=1
            or annotated.measured_start_candidate_count=1
            or (
              annotated.measured_start_candidate_count>1
              and annotated.start_measure_max-annotated.start_measure_min
                <=0.0000001
            )
          )
        ) desc,
        (
          annotated.fraction is not null
          and annotated.from_measure is not null
          and annotated.to_measure is not null
        ) desc,
        annotated.overlap_length_m desc,
        annotated.from_measure nulls last,
        annotated.source_segment_key,
        annotated.source_segment_id
    )::integer as choice_rank
  from annotated;
  create unique index tmp_issue97_shared_segment_coverage_key_idx
    on tmp_issue97_shared_segment_coverage(
      geom_key,identity_ids,identity_id,source_segment_key
    );
  create index tmp_issue97_shared_segment_coverage_card_idx
    on tmp_issue97_shared_segment_coverage(geom_key,identity_ids,identity_id);
  analyze tmp_issue97_shared_segment_coverage;

  -- Shared geometry is one logical connection card with two anchors.$new$;
  v_provenance_old constant text:=$old$      'source_segment_keys_by_identity',(
        select pg_catalog.jsonb_object_agg(coverage.identity_id::text,
          pg_catalog.to_jsonb(coverage.source_segment_keys) order by coverage.identity_id::text)
        from (
          select seg.identity_id,
            array_agg(distinct seg.source_segment_key order by seg.source_segment_key)
              as source_segment_keys
          from tmp_issue97_segments seg
          where seg.identity_id=any(s.identity_ids)
            and extensions.st_intersects(seg.geom,s.geom)
            and extensions.st_length(
              extensions.st_collectionextract(extensions.st_intersection(seg.geom,s.geom),2)
                ::extensions.geography
            )>0.02
          group by seg.identity_id
        ) coverage
      ),$old$;
  v_provenance_new constant text:=$new$      'source_segment_keys_by_identity',(
        select pg_catalog.jsonb_object_agg(coverage.identity_id::text,
          pg_catalog.to_jsonb(coverage.source_segment_keys)
          order by coverage.identity_id::text)
        from (
          select exact_coverage.identity_id,
            array_agg(
              distinct exact_coverage.source_segment_key
              order by exact_coverage.source_segment_key
            ) as source_segment_keys
          from tmp_issue97_shared_segment_coverage exact_coverage
          where exact_coverage.geom_key=s.geom_key
            and exact_coverage.identity_ids=s.identity_ids
          group by exact_coverage.identity_id
        ) coverage
      ),$new$;
  v_shared_insert_old constant text:=$old$  from tmp_issue97_shared s;

  -- A source-scoped name transition is an event on one physical road identity,$old$;
  v_shared_insert_new constant text:=$new$  from tmp_issue97_shared s;

  -- Incompatible measured source segments at the same canonical shared start
  -- retain complete exact key provenance but cannot publish an arbitrary
  -- measure choice. Hold that card explicitly for review.
  update public.brinesearch_road_junctions junction set
    source_provenance=junction.source_provenance||pg_catalog.jsonb_build_object(
      'source_coverage_proof','exact_canonical_grid_line_intersection',
      'source_coverage_grid_degrees',0.0000001,
      'source_measure_conflict',measure_status.source_measure_conflict,
      'source_measure_conflict_bound_miles',0.0000001
    ),
    confidence=case
      when shared.grade_conflict or measure_status.source_measure_conflict
        then 'held'
      else 'authoritative'
    end,
    verification_status=case
      when shared.grade_conflict or measure_status.source_measure_conflict
        then 'held'
      else 'verified'
    end
  from tmp_issue97_shared shared
  cross join lateral (
    select coalesce(pg_catalog.bool_or(
      coverage.start_candidate_count>1
      and (
        coverage.measured_start_candidate_count=0
        or (
          coverage.measured_start_candidate_count>1
          and coverage.start_measure_max-coverage.start_measure_min>0.0000001
        )
      )
    ),false) as source_measure_conflict
    from tmp_issue97_shared_segment_coverage coverage
    where coverage.geom_key=shared.geom_key
      and coverage.identity_ids=shared.identity_ids
  ) measure_status
  where junction.build_id=v_build
    and junction.stable_junction_key=
      'junction:shared:'||v_state||':'||shared.identity_ids::text||':'||shared.geom_key;

  -- A source-scoped name transition is an event on one physical road identity,$new$;
  v_shared_values_start constant text:=
    'create temporary table tmp_issue97_shared_values on commit drop as';
  v_shared_values_end constant text:=
    'insert into public.brinesearch_road_junction_memberships(';
  v_shared_values_new constant text:=$new$create temporary table tmp_issue97_shared_values on commit drop as
  select shared.geom_key,shared.geom,shared.identity_ids,member.identity_id,
    coalesce(member_segments.source_segment_keys,'{}'::text[]) as source_segment_keys,
    choice.source_segment_key as chosen_segment_key,choice.fraction,
    case when choice.from_measure is not null and choice.to_measure is not null
      then choice.from_measure+
        (choice.to_measure-choice.from_measure)*choice.fraction
      end as raw_source_measure,
    private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
      choice.source_segment_key,
      case when choice.from_measure is not null and choice.to_measure is not null
        then choice.from_measure+
          (choice.to_measure-choice.from_measure)*choice.fraction
      end
    ) as source_measure,
    case when choice.from_measure is not null and choice.to_measure is not null then
      private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
        choice.source_segment_key,
        choice.from_measure+
          (choice.to_measure-choice.from_measure)*choice.fraction
      )*1609.344
      when totals.segment_count=1 and choice.fraction is not null
        then choice.fraction*choice.source_length_m
      else null
    end as distance_along_road_m,
    case when choice.from_measure is not null and choice.to_measure is not null
      then 'authoritative_linear_measure'
      when totals.segment_count=1 and choice.fraction is not null
        then 'single_source_feature_geometry'
      else 'ambiguous'
    end as measure_method,
    coverage_status.start_candidate_count,
    coverage_status.measured_start_candidate_count,
    coverage_status.source_measure_conflict
  from tmp_issue97_shared shared
  cross join lateral unnest(shared.identity_ids) member(identity_id)
  left join lateral (
    select array_agg(
      distinct coverage.source_segment_key order by coverage.source_segment_key
    ) as source_segment_keys
    from tmp_issue97_shared_segment_coverage coverage
    where coverage.geom_key=shared.geom_key
      and coverage.identity_ids=shared.identity_ids
      and coverage.identity_id=member.identity_id
  ) member_segments on true
  left join lateral (
    select coverage.source_segment_key,coverage.from_measure,coverage.to_measure,
      coverage.source_length_m,coverage.fraction
    from tmp_issue97_shared_segment_coverage coverage
    where coverage.geom_key=shared.geom_key
      and coverage.identity_ids=shared.identity_ids
      and coverage.identity_id=member.identity_id
      and coverage.choice_rank=1
      and coverage.covers_shared_start
      and (
        coverage.start_candidate_count=1
        or (
          coverage.measured_start_candidate_count=1
          and coverage.fraction is not null
          and coverage.from_measure is not null
          and coverage.to_measure is not null
        )
        or (
          coverage.measured_start_candidate_count>1
          and coverage.start_measure_max-coverage.start_measure_min<=0.0000001
          and coverage.fraction is not null
          and coverage.from_measure is not null
          and coverage.to_measure is not null
        )
      )
    limit 1
  ) choice on true
  left join lateral (
    select max(coverage.start_candidate_count)::integer as start_candidate_count,
      max(coverage.measured_start_candidate_count)::integer
        as measured_start_candidate_count,
      coalesce(pg_catalog.bool_or(
        coverage.start_candidate_count>1
        and (
          coverage.measured_start_candidate_count=0
          or (
            coverage.measured_start_candidate_count>1
            and coverage.start_measure_max-coverage.start_measure_min>0.0000001
          )
        )
      ),false) as source_measure_conflict
    from tmp_issue97_shared_segment_coverage coverage
    where coverage.geom_key=shared.geom_key
      and coverage.identity_ids=shared.identity_ids
      and coverage.identity_id=member.identity_id
  ) coverage_status on true
  left join lateral (
    select count(*)::integer as segment_count
    from tmp_issue97_segments segment
    where segment.identity_id=member.identity_id
  ) totals on true;

  $new$;
  v_shared_approach_old constant text:=$old$      'shared_end',extensions.st_asgeojson(extensions.st_endpoint(extensions.st_linemerge(v.geom)),15)::jsonb,
      'measure_method',v.measure_method,'chosen_source_segment_key',v.chosen_segment_key
    )$old$;
  v_shared_approach_new constant text:=$new$      'shared_end',extensions.st_asgeojson(extensions.st_endpoint(extensions.st_linemerge(v.geom)),15)::jsonb,
      'measure_method',v.measure_method,'chosen_source_segment_key',v.chosen_segment_key,
      'source_start_candidate_count',v.start_candidate_count,
      'measured_source_start_candidate_count',v.measured_start_candidate_count,
      'source_measure_conflict',v.source_measure_conflict
    )$new$;
  v_point_flag_old constant text:=
    'case when v.chosen_segment_key like ''WV:WVDOT:SEGMENT:%'' then';
  v_point_flag_new constant text:=
    'case when v.chosen_segment_key like ''WV:WVDOT:SEGMENT:%'' '||
    'and v.raw_source_measure is not null then';
  v_name_flag_old constant text:=
    'case when n.source_segment_keys[1] like ''WV:WVDOT:SEGMENT:%'' then';
  v_name_flag_new constant text:=
    'case when n.source_segment_keys[1] like ''WV:WVDOT:SEGMENT:%'' '||
    'and n.source_measure is not null then';
  v_raw_compare_old constant text:=
    'v.raw_source_measure is distinct from v.source_measure';
  v_raw_compare_new constant text:=
    'v.raw_source_measure::numeric is distinct from v.source_measure';
  v_name_compare_old constant text:=$old$n.source_measure is distinct from
          private_verification.brinesearch_issue97_normalize_wvdot_membership_measure($old$;
  v_name_compare_new constant text:=$new$n.source_measure::numeric is distinct from
          private_verification.brinesearch_issue97_normalize_wvdot_membership_measure($new$;
  v_validation_old constant text:=$old$  ) then raise exception 'Issue #97 graph validation found a duplicate point inside a shared occurrence'; end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg($old$;
  v_validation_new constant text:=$new$  ) then raise exception 'Issue #97 graph validation found a duplicate point inside a shared occurrence'; end if;

  -- Every identity must cover the full final card on the canonical topology
  -- grid. Exact positive-length intersection is the proof; proximity is never
  -- accepted as a substitute.
  if exists(
    select 1
    from tmp_issue97_shared shared
    cross join lateral unnest(shared.identity_ids) member(identity_id)
    left join tmp_issue97_shared_segment_coverage coverage
      on coverage.geom_key=shared.geom_key
     and coverage.identity_ids=shared.identity_ids
     and coverage.identity_id=member.identity_id
    group by shared.geom_key,shared.identity_ids,shared.geom,member.identity_id
    having count(coverage.source_segment_key)=0
      or coalesce(extensions.st_length(
        extensions.st_collectionextract(extensions.st_unaryunion(
          extensions.st_collect(coverage.overlap_geom)
        ),2)::extensions.geography
      ),0)<extensions.st_length(shared.geom::extensions.geography)-0.01
  ) then
    raise exception 'Issue #97 shared source coverage does not span a final card';
  end if;

  if exists(
    select 1
    from tmp_issue97_shared shared
    join public.brinesearch_road_junctions junction
      on junction.build_id=v_build
     and junction.stable_junction_key=
       'junction:shared:'||v_state||':'||shared.identity_ids::text||':'||shared.geom_key
    cross join lateral unnest(shared.identity_ids) member(identity_id)
    join tmp_issue97_shared_values expected
      on expected.geom_key=shared.geom_key
     and expected.identity_ids=shared.identity_ids
     and expected.identity_id=member.identity_id
    left join public.brinesearch_road_junction_memberships membership
      on membership.junction_id=junction.id
     and membership.identity_id=member.identity_id
     and membership.membership_role='shared'
    where membership.id is null
      or membership.source_segment_keys is distinct from
           expected.source_segment_keys
      or nullif(
           membership.approach_data->>'chosen_source_segment_key',''
         ) is distinct from expected.chosen_segment_key
      or membership.source_measure is distinct from expected.source_measure
      or membership.distance_along_road_m is distinct from
           expected.distance_along_road_m::numeric
      or membership.approach_data->>'measure_method'
           is distinct from expected.measure_method
      or (membership.approach_data->>'source_start_candidate_count')::integer
           is distinct from expected.start_candidate_count
      or (
           membership.approach_data->>'measured_source_start_candidate_count'
         )::integer is distinct from expected.measured_start_candidate_count
      or coalesce((
           membership.approach_data->>'source_measure_conflict'
         )::boolean,false) is distinct from expected.source_measure_conflict
      or case
        when expected.chosen_segment_key like 'WV:WVDOT:SEGMENT:%'
          and expected.raw_source_measure is not null then
          not (membership.approach_data ? 'raw_source_measure')
          or not (membership.approach_data ? 'source_measure_normalized')
          or not (
            membership.approach_data
              ? 'endpoint_measure_normalization_bound_miles'
          )
          or (membership.approach_data->>'raw_source_measure')::double precision
               is distinct from expected.raw_source_measure
          or (
            membership.approach_data->>'source_measure_normalized'
          )::boolean is distinct from (
            expected.raw_source_measure::numeric
              is distinct from expected.source_measure
          )
          or (
            membership.approach_data
              ->>'endpoint_measure_normalization_bound_miles'
          )::numeric is distinct from 0.0000001::numeric
        else
          membership.approach_data ? 'raw_source_measure'
          or membership.approach_data ? 'source_measure_normalized'
          or membership.approach_data
               ? 'endpoint_measure_normalization_bound_miles'
        end
      or pg_catalog.jsonb_typeof(
        junction.source_provenance->'source_segment_keys_by_identity'
      ) is distinct from 'object'
      or (
        select array_agg(map_key.key order by map_key.key)
        from pg_catalog.jsonb_object_keys(
          junction.source_provenance->'source_segment_keys_by_identity'
        ) map_key(key)
      ) is distinct from (
        select array_agg(expected.identity_id::text order by expected.identity_id::text)
        from unnest(shared.identity_ids) expected(identity_id)
      )
      or junction.source_provenance->'source_segment_keys_by_identity'
           ->member.identity_id::text
         is distinct from pg_catalog.to_jsonb(membership.source_segment_keys)
      or pg_catalog.cardinality(membership.source_segment_keys)=0
      or (
        nullif(membership.approach_data->>'chosen_source_segment_key','') is null
        and not coalesce(
          (membership.approach_data->>'source_measure_conflict')::boolean,false
        )
      )
      or (
        nullif(membership.approach_data->>'chosen_source_segment_key','') is not null
        and (
          not (
            membership.approach_data->>'chosen_source_segment_key'
              =any(membership.source_segment_keys)
          )
          or not exists(
            select 1
            from tmp_issue97_shared_segment_coverage chosen
            where chosen.geom_key=shared.geom_key
              and chosen.identity_ids=shared.identity_ids
              and chosen.identity_id=member.identity_id
              and chosen.source_segment_key=
                membership.approach_data->>'chosen_source_segment_key'
              and chosen.choice_rank=1
              and chosen.covers_shared_start
          )
        )
      )
      or not (junction.source_provenance ? 'source_measure_conflict')
      or not (
        junction.source_provenance ? 'source_measure_conflict_bound_miles'
      )
      or coalesce((
        junction.source_provenance->>'source_measure_conflict'
      )::boolean,false) is distinct from (
        select coalesce(pg_catalog.bool_or(value.source_measure_conflict),false)
        from tmp_issue97_shared_values value
        where value.geom_key=shared.geom_key
          and value.identity_ids=shared.identity_ids
      )
      or (
        junction.source_provenance->>'source_measure_conflict_bound_miles'
      )::numeric is distinct from 0.0000001::numeric
      or junction.verification_status is distinct from case
        when shared.grade_conflict or exists(
          select 1
          from tmp_issue97_shared_values value
          where value.geom_key=shared.geom_key
            and value.identity_ids=shared.identity_ids
            and value.source_measure_conflict
        ) then 'held'
        else 'verified'
      end
      or junction.confidence is distinct from case
        when shared.grade_conflict or exists(
          select 1
          from tmp_issue97_shared_values value
          where value.geom_key=shared.geom_key
            and value.identity_ids=shared.identity_ids
            and value.source_measure_conflict
        ) then 'held'
        else 'authoritative'
      end
  ) then
    raise exception 'Issue #97 shared provenance map, choice, or hold contract failed';
  end if;

  if exists(
    select 1
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction
      on junction.id=membership.junction_id
    where junction.build_id=v_build
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
  ) then
    raise exception 'Issue #97 WVDOT normalization flag disagrees with persisted measures';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg($new$;
begin
  select before.builder_definition into strict v_definition
  from issue97_wvdot_provenance_before before;

  if pg_catalog.md5(v_definition)<>'38d17ac7bad41b9a0caec91fbd326e94' then
    raise exception 'Issue #97 WVDOT/shared provenance builder definition changed';
  end if;
  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(
        v_definition,
        'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(',
        ''
      )))/pg_catalog.length(
        'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure('
      )<>7
     or (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(
        v_definition,
        'private_verification.brinesearch_issue97_wvdot_name_measure_contains(',
        ''
      )))/pg_catalog.length(
        'private_verification.brinesearch_issue97_wvdot_name_measure_contains('
      )<>3 then
    raise exception 'Issue #97 WVDOT builder helper call surface changed';
  end if;

  v_patched:=v_definition;

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_drop_old,'')
  ))/pg_catalog.length(v_drop_old);
  if v_count<>1 then
    raise exception 'Issue #97 shared coverage drop anchor changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_drop_old,v_drop_new);

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_coverage_old,'')
  ))/pg_catalog.length(v_coverage_old);
  if v_count<>1 then
    raise exception 'Issue #97 final shared-card anchor changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_coverage_old,v_coverage_new);

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_provenance_old,'')
  ))/pg_catalog.length(v_provenance_old);
  if v_count<>1 then
    raise exception 'Issue #97 shared junction provenance anchor changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_provenance_old,v_provenance_new);

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_shared_insert_old,'')
  ))/pg_catalog.length(v_shared_insert_old);
  if v_count<>1 then
    raise exception 'Issue #97 shared junction insert anchor changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_shared_insert_old,v_shared_insert_new);

  v_start_pos:=pg_catalog.strpos(v_patched,v_shared_values_start);
  v_end_rel:=pg_catalog.strpos(
    pg_catalog.substr(v_patched,v_start_pos),v_shared_values_end
  );
  if v_start_pos<1 or v_end_rel<1
     or pg_catalog.strpos(
       pg_catalog.substr(
         v_patched,v_start_pos+pg_catalog.length(v_shared_values_start)
       ),
       v_shared_values_start
     )>0 then
    raise exception 'Issue #97 shared membership block anchors changed';
  end if;
  v_end_pos:=v_start_pos+v_end_rel-1;
  v_patched:=pg_catalog.substr(v_patched,1,v_start_pos-1)||
    v_shared_values_new||pg_catalog.substr(v_patched,v_end_pos);

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_shared_approach_old,'')
  ))/pg_catalog.length(v_shared_approach_old);
  if v_count<>1 then
    raise exception 'Issue #97 shared approach provenance anchor changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(
    v_patched,v_shared_approach_old,v_shared_approach_new
  );

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_point_flag_old,'')
  ))/pg_catalog.length(v_point_flag_old);
  if v_count<>2 then
    raise exception 'Issue #97 WVDOT membership provenance anchors changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_point_flag_old,v_point_flag_new);

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_name_flag_old,'')
  ))/pg_catalog.length(v_name_flag_old);
  if v_count<>1 then
    raise exception 'Issue #97 WVDOT name provenance anchor changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_name_flag_old,v_name_flag_new);

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_raw_compare_old,'')
  ))/pg_catalog.length(v_raw_compare_old);
  if v_count<>2 then
    raise exception 'Issue #97 WVDOT raw comparison anchors changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_raw_compare_old,v_raw_compare_new);

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_name_compare_old,'')
  ))/pg_catalog.length(v_name_compare_old);
  if v_count<>1 then
    raise exception 'Issue #97 WVDOT name comparison anchor changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_name_compare_old,v_name_compare_new);

  v_count:=(pg_catalog.length(v_patched)-pg_catalog.length(
    pg_catalog.replace(v_patched,v_validation_old,'')
  ))/pg_catalog.length(v_validation_old);
  if v_count<>1 then
    raise exception 'Issue #97 graph validation insertion anchor changed: %',v_count;
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_validation_old,v_validation_new);

  execute v_patched;
end
$issue97_patch_wvdot_graph_provenance$;

do $issue97_reject_audited_ohi_generation$
declare
  v_rows integer;
begin
  update public.brinesearch_road_graph_builds build set
    status='rejected',
    details=build.details||pg_catalog.jsonb_build_object(
      'activation_status','rejected_provenance_audit',
      'rejected_at',pg_catalog.clock_timestamp(),
      'rejected_by_migration','20260813213500_issue97_wvdot_measure_provenance_type_stability',
      'rejection_reasons',pg_catalog.jsonb_build_array(
        'wvdot_measure_normalization_provenance_type_instability',
        'shared_segment_source_coverage_snap_grid_mismatch'
      ),
      'replacement_required',true
    )
  where build.id='6573d51a-700a-458c-9d6e-c0d22c0e4201'::uuid
    and build.status='validated' and build.activated_at is null
    and build.graph_digest='17d4c2f6e3ae231f66abbb38b83268bc';
  get diagnostics v_rows=row_count;
  if v_rows<>1 then
    raise exception 'Issue #97 audited OHI generation was not rejected exactly once';
  end if;
end
$issue97_reject_audited_ohi_generation$;

do $issue97_verify_wvdot_graph_provenance$
declare
  v_before issue97_wvdot_provenance_before%rowtype;
  v_proc record;
  v_definition text;
begin
  select * into strict v_before from issue97_wvdot_provenance_before;
  select pg_catalog.pg_get_functiondef(proc.oid) as definition,
    proc.proowner,proc.proacl,proc.prosecdef,proc.provolatile,proc.proconfig,
    language.lanname,owner.rolname
  into strict v_proc
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_language language on language.oid=proc.prolang
  join pg_catalog.pg_roles owner on owner.oid=proc.proowner
  where proc.oid=
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure;
  v_definition:=v_proc.definition;

  if pg_catalog.md5(v_definition)<>'39ca43fc16878fa7d6c2b70f4c6a48d3'
     or v_definition not like '%tmp_issue97_shared_segment_coverage%'
     or v_definition not like '%exact_canonical_grid_line_intersection%'
     or v_definition not like '%source_coverage_grid_degrees%'
     or v_definition not like '%choice_rank=1%'
     or v_definition not like '%shared source coverage does not span a final card%'
     or v_definition not like '%shared provenance map, choice, or hold contract failed%'
     or v_definition not like '%WVDOT normalization flag disagrees with persisted measures%'
     or (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(
       v_definition,
       'v.raw_source_measure::numeric is distinct from v.source_measure',
       ''
     )))/pg_catalog.length(
       'v.raw_source_measure::numeric is distinct from v.source_measure'
     )<>2
     or (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(
       v_definition,
       'n.source_measure::numeric is distinct from',
       ''
     )))/pg_catalog.length('n.source_measure::numeric is distinct from')<>1
     or v_definition like '%c.fraction::numeric%'
     or v_definition like '%choice.fraction::numeric%'
     or v_definition like '%extensions.st_intersects(seg.geom,s.geom)%'
     or v_definition like '%extensions.st_intersection(seg.geom,s.geom)%' then
    raise exception 'Issue #97 WVDOT/shared provenance builder replacement did not persist';
  end if;

  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(
        v_definition,
        'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(',
        ''
      )))/pg_catalog.length(
        'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure('
      )<>7
     or (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(
        v_definition,
        'private_verification.brinesearch_issue97_wvdot_name_measure_contains(',
        ''
      )))/pg_catalog.length(
        'private_verification.brinesearch_issue97_wvdot_name_measure_contains('
      )<>3 then
    raise exception 'Issue #97 provenance repair changed WVDOT helper call counts';
  end if;

  if v_proc.lanname<>'plpgsql' or not v_proc.prosecdef or v_proc.provolatile<>'v'
     or not (v_proc.proconfig @> array['search_path=""'])
     or v_proc.rolname<>'postgres'
     or v_proc.proowner is distinct from v_before.builder_owner
     or v_proc.proacl is distinct from v_before.builder_acl
     or pg_catalog.has_function_privilege(
       'anon','public.brinesearch_issue97_rebuild_county_graph(text,text)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_issue97_rebuild_county_graph(text,text)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_issue97_rebuild_county_graph(text,text)','EXECUTE'
     ) then
    raise exception 'Issue #97 provenance repair changed builder metadata or ACL';
  end if;

  -- Reproduce the builder's fixed float8 runtime boundary. Raw interpolation
  -- remains double precision, while the truth flag compares both persisted
  -- values as numeric. Only the bounded negative WVDOT endpoint normalizes.
  if pg_catalog.pg_typeof(
       (-0.000000027168425731360912)::numeric+
         (0.14300000248476863::numeric-
          (-0.000000027168425731360912)::numeric)*1::double precision
     ) is distinct from 'double precision'::pg_catalog.regtype
     or (
       (
         (-0.000000027168425731360912)::numeric+
           (0.14300000248476863::numeric-
            (-0.000000027168425731360912)::numeric)*1::double precision
       )::numeric is distinct from
       private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
         'WV:WVDOT:SEGMENT:fixture',
         (-0.000000027168425731360912)::numeric+
           (0.14300000248476863::numeric-
            (-0.000000027168425731360912)::numeric)*1::double precision
       )
     )
     or not (
       ((-0.000000027168425731360912)::double precision)::numeric
         is distinct from
       private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
         'WV:WVDOT:SEGMENT:fixture',
         (-0.000000027168425731360912)::double precision
       )
     ) then
    raise exception 'Issue #97 type-stable normalization provenance behavior changed';
  end if;

  -- Reproduce the snapped shared-line source association: raw exact intersection
  -- is zero, while the same 1e-7-degree grid used to construct shared linework
  -- recovers a positive exact line overlap. This is not a proximity/name match.
  if extensions.st_length(extensions.st_collectionextract(extensions.st_intersection(
       extensions.st_geomfromtext('LINESTRING(-80.71326351 40.08363887,-80.71298951 40.08555887)',4326),
       extensions.st_geomfromtext('LINESTRING(-80.7132635 40.0836389,-80.7129895 40.0855589)',4326)
     ),2)::extensions.geography)<>0
     or extensions.st_length(extensions.st_collectionextract(extensions.st_intersection(
       extensions.st_snaptogrid(
         extensions.st_geomfromtext('LINESTRING(-80.71326351 40.08363887,-80.71298951 40.08555887)',4326),
         0.0000001
       ),
       extensions.st_geomfromtext('LINESTRING(-80.7132635 40.0836389,-80.7129895 40.0855589)',4326)
     ),2)::extensions.geography)<=0.02 then
    raise exception 'Issue #97 shared snap-grid source association behavior changed';
  end if;

  if public.brinesearch_issue97_cutover_active() is distinct from v_before.cutover_active
     or (select count(*) from public.brinesearch_road_graph_builds)
          is distinct from v_before.build_count
     or (select count(*) from public.brinesearch_road_graph_builds where status='staging')
          is distinct from v_before.staging_count
     or (select count(*) from public.brinesearch_road_junctions)
          is distinct from v_before.junction_count
     or (select count(*) from public.brinesearch_road_junction_anchors)
          is distinct from v_before.anchor_count
     or (select count(*) from public.brinesearch_road_junction_memberships)
          is distinct from v_before.membership_count
     or (select count(*) from public.brinesearch_road_graph_builds
         where id='6573d51a-700a-458c-9d6e-c0d22c0e4201'::uuid
           and status='rejected' and activated_at is null
           and graph_digest='17d4c2f6e3ae231f66abbb38b83268bc'
           and details->>'activation_status'='rejected_provenance_audit'
           and details->>'replacement_required'='true')<>1
     or exists(select 1 from public.brinesearch_road_graph_builds
         where state_code='WV' and county_code='OHI'
           and status in ('staging','validated','active')) then
    raise exception 'Issue #97 provenance repair changed graph data/cutover beyond guarded rejection';
  end if;
end
$issue97_verify_wvdot_graph_provenance$;

comment on function public.brinesearch_issue97_rebuild_county_graph(text,text) is
  'Issue #97 service-only immutable v2 graph rebuild. WVDOT raw measures retain float8 interpolation with numeric-boundary truth flags; final shared cards carry exact source coverage on the identical canonical grid and hold incompatible start measures. It produces a validated generation only; a separate impact-aware activation is mandatory.';
