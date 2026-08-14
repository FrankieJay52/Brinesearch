-- GitHub #97 — dark candidate release verification.
-- Run only after release migrations are installed. This test never activates a
-- graph and never requires global cutover. It verifies only validated candidates
-- stamped by the active release generation; historical validated builds are not
-- silently treated as candidates for this release.
begin transaction read only;
set local statement_timeout='15min';
set local lock_timeout='5s';

do $issue97_dark_candidates$
declare
  v_registered integer;
  v_candidates integer;
  v_missing integer;
  v_bad integer;
  v_generation text;
begin
  if public.brinesearch_issue97_cutover_active() then
    raise exception '#97 dark candidate release test requires cutover OFF';
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception '#97 dark candidate release test refuses a staging graph';
  end if;

  select count(*)::integer into v_registered
  from public.brinesearch_road_graph_counties where active;
  if v_registered<>39 then raise exception '#97 expected 39 registered counties, found %',v_registered; end if;

  v_generation:=private_verification.brinesearch_issue97_active_graph_release_generation();
  if nullif(v_generation,'') is null then
    raise exception '#97 active graph release generation is missing';
  end if;

  with latest as (
    select distinct on(state_code,county_code) b.*
    from public.brinesearch_road_graph_builds b
    where b.status='validated'
      and b.details->>'release_generation_key'=v_generation
    order by state_code,county_code,completed_at desc nulls last,started_at desc,id desc
  )
  select count(*)::integer into v_candidates from latest;

  -- This suite is useful at the two-canary checkpoint: every candidate stamped
  -- for this release must be current, but old validated historical generations
  -- are intentionally ignored rather than failing the candidate set.
  with latest as (
    select distinct on(state_code,county_code) b.*
    from public.brinesearch_road_graph_builds b
    where b.status='validated'
      and b.details->>'release_generation_key'=v_generation
    order by state_code,county_code,completed_at desc nulls last,started_at desc,id desc
  )
  select count(*)::integer into v_bad
  from latest b
  where not private_verification.brinesearch_issue97_graph_build_release_current(b.id)
     or b.activated_at is not null
     or coalesce(b.graph_digest,'')!~'^[0-9a-f]{32}$'
     or coalesce(b.source_revision_digest,'')!~'^[0-9a-f]{32}$'
     or b.graph_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
          j.stable_junction_key||':'||j.graph_digest,',' order by j.stable_junction_key
        ),'')) from public.brinesearch_road_junctions j where j.build_id=b.id)
     or b.point_junction_count<>(select count(*) from public.brinesearch_road_junctions j
          where j.build_id=b.id and j.junction_type<>'shared_segment')
     or b.shared_segment_count<>(select count(*) from public.brinesearch_road_junctions j
          where j.build_id=b.id and j.junction_type='shared_segment')
     or b.membership_count<>(select count(*) from public.brinesearch_road_junction_memberships m
          join public.brinesearch_road_junctions j on j.id=m.junction_id where j.build_id=b.id)
     or exists(select 1 from public.brinesearch_road_junction_memberships m
          join public.brinesearch_road_junctions j on j.id=m.junction_id
          where j.build_id=b.id and j.junction_type='shared_segment'
            and pg_catalog.cardinality(m.source_segment_keys)=0)
     or exists(select 1 from public.brinesearch_road_junctions j
          where j.build_id=b.id and j.junction_type='shared_segment'
            and pg_catalog.jsonb_typeof(j.source_provenance->'source_segment_keys_by_identity') is distinct from 'object')
     or exists(select 1 from public.brinesearch_road_junction_memberships m
          join public.brinesearch_road_junctions j on j.id=m.junction_id
          where j.build_id=b.id and m.approach_data ? 'raw_source_measure'
            and (m.approach_data->>'source_measure_normalized')::boolean is distinct from
              ((m.approach_data->>'raw_source_measure')::numeric is distinct from m.source_measure));
  if v_bad<>0 then
    raise exception '#97 % active-release validated dark candidates failed release/digest/provenance verification',v_bad;
  end if;

  with latest as (
    select distinct on(state_code,county_code) b.*
    from public.brinesearch_road_graph_builds b
    where b.status='validated'
      and b.details->>'release_generation_key'=v_generation
    order by state_code,county_code,completed_at desc nulls last,started_at desc,id desc
  )
  select count(*)::integer into v_missing from latest b
  where coalesce(private_verification.brinesearch_issue97_graph_source_content_digest(b.id),'')!~'^[0-9a-f]{32}$';
  if v_missing<>0 then raise exception '#97 validated candidate source-content receipt is incomplete'; end if;
end
$issue97_dark_candidates$;

-- Execute the repaired transition dependency against every currently materialized
-- transition pad. A schema-drifted function fails here even when it returns NULL
-- because a graph is intentionally dark/stale.
do $issue97_transition_dependency_exec$
declare r record; v_dependency text;
begin
  for r in
    select distinct pad_id
    from private_verification.brinesearch_route_transition_receipts_issue97
    order by pad_id
  loop
    v_dependency:=private_verification.brinesearch_issue97_transition_google_dependency(r.pad_id);
    if v_dependency is not null and v_dependency!~'^[0-9a-f]{32}$' then
      raise exception '#97 transition dependency returned a non-digest value for %: %',r.pad_id,v_dependency;
    end if;
  end loop;
end
$issue97_transition_dependency_exec$;

rollback;
