-- GitHub #97 — materialize name-change candidates as a real temp table (Belmont).
--
-- Production EXPLAIN (ANALYZE, BUFFERS) proved the endpoint candidate and
-- preferred-name materialization stages are not the dominant cost. The
-- tmp_issue97_name_changes CTE plan repeatedly rescans candidate/preferred-name
-- rows (~15M rejected combinations and ~1.94M temp-block reads).
--
-- This patch is semantics-neutral: it materializes the already exact endpoint
-- candidates as an analyzed/indexed TEMP TABLE before the two exact preferred-
-- name joins. All topology, name, measure, grouping, array, and fail-closed
-- contracts remain unchanged.

do $issue97_patch_name_change_candidate_temp_table$
declare
  v_definition text;
  v_start constant text := 'create temporary table tmp_issue97_name_changes on commit drop as';
  v_end_marker constant text := 'from grouped g;';
  v_start_pos integer;
  v_end_rel integer;
  v_end_pos integer;
  v_new_block text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition like '%tmp_issue97_name_change_candidates%'
     and v_definition like '%tmp_issue97_name_change_candidates_left_idx%'
  then
    return;
  end if;

  if (pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_start, '')))
     / pg_catalog.length(v_start) <> 1 then
    raise exception 'Issue #97 name-change create anchor changed or is not unique';
  end if;

  v_start_pos := pg_catalog.strpos(v_definition, v_start);
  if v_start_pos < 1 then
    raise exception 'Issue #97 name-change create anchor missing';
  end if;

  v_end_rel := pg_catalog.strpos(pg_catalog.substr(v_definition, v_start_pos), v_end_marker);
  if v_end_rel < 1 then
    raise exception 'Issue #97 name-change terminating anchor missing';
  end if;
  v_end_pos := v_start_pos + v_end_rel + pg_catalog.length(v_end_marker) - 1;

  v_new_block := $new$
  -- Materialize the exact endpoint candidate set so PostgreSQL has real stats
  -- and indexes for the subsequent exact segment-name joins.
  drop table if exists pg_temp.tmp_issue97_name_change_candidates;
  create temporary table tmp_issue97_name_change_candidates on commit drop as
  select distinct
    le.segment_id as left_segment_id,
    re.segment_id as right_segment_id,
    le.identity_id,
    le.source_segment_key as left_segment_key,
    re.source_segment_key as right_segment_key,
    le.state_code as left_state_code,
    le.county_code as left_county_code,
    re.state_code as right_state_code,
    re.county_code as right_county_code,
    le.segment_geom as left_geom,
    re.segment_geom as right_geom,
    le.from_measure as left_from_measure,
    le.to_measure as left_to_measure,
    re.from_measure as right_from_measure,
    re.to_measure as right_to_measure
  from tmp_issue97_segment_endpoints le
  join tmp_issue97_segment_endpoints re
    on re.identity_id=le.identity_id
   and le.segment_id::text<re.segment_id::text
   and le.endpoint_geom OPERATOR(extensions.&&) re.endpoint_expand
  where extensions.st_dwithin(
    le.endpoint_geom::extensions.geography,
    re.endpoint_geom::extensions.geography,
    0.03
  );

  create index tmp_issue97_name_change_candidates_left_idx
    on tmp_issue97_name_change_candidates(identity_id,left_segment_key);
  create index tmp_issue97_name_change_candidates_right_idx
    on tmp_issue97_name_change_candidates(identity_id,right_segment_key);
  create index tmp_issue97_name_change_candidates_pair_idx
    on tmp_issue97_name_change_candidates(left_segment_id,right_segment_id);
  analyze tmp_issue97_name_change_candidates;

  create temporary table tmp_issue97_name_changes on commit drop as
  with named as (
    select p.identity_id,p.left_state_code as state_code,p.left_county_code as county_code,
      p.left_segment_key,p.right_segment_key,
      p.left_geom,p.right_geom,p.left_from_measure,p.left_to_measure,
      p.right_from_measure,p.right_to_measure,
      na.name_event_id as left_name_event_id,nb.name_event_id as right_name_event_id,
      na.road_name as left_name,nb.road_name as right_name,
      na.normalized_name as left_normalized_name,nb.normalized_name as right_normalized_name
    from tmp_issue97_name_change_candidates p
    join tmp_issue97_segment_preferred_names na
      on na.identity_id=p.identity_id and na.source_segment_key=p.left_segment_key
    join tmp_issue97_segment_preferred_names nb
      on nb.identity_id=p.identity_id and nb.source_segment_key=p.right_segment_key
    where na.normalized_name<>nb.normalized_name
      and pg_catalog.least(
        p.left_state_code||':'||p.left_county_code,
        p.right_state_code||':'||p.right_county_code
      )=v_state||':'||v_county
  ), changes as (
    select n.identity_id,n.state_code,n.county_code,
      n.left_segment_key,n.right_segment_key,
      n.left_name_event_id,n.right_name_event_id,
      n.left_name,n.right_name,
      (d).geom as raw_geom,
      case when n.left_from_measure is not null and n.left_to_measure is not null
        and extensions.geometrytype(extensions.st_linemerge(n.left_geom))='LINESTRING' then
        n.left_from_measure+(n.left_to_measure-n.left_from_measure)*extensions.st_linelocatepoint(
          extensions.st_linemerge(n.left_geom),extensions.st_closestpoint(n.left_geom,(d).geom)
        ) end as left_measure,
      case when n.right_from_measure is not null and n.right_to_measure is not null
        and extensions.geometrytype(extensions.st_linemerge(n.right_geom))='LINESTRING' then
        n.right_from_measure+(n.right_to_measure-n.right_from_measure)*extensions.st_linelocatepoint(
          extensions.st_linemerge(n.right_geom),extensions.st_closestpoint(n.right_geom,(d).geom)
        ) end as right_measure
    from named n
    cross join lateral extensions.st_dump(extensions.st_collectionextract(
      extensions.st_intersection(
        extensions.st_boundary(n.left_geom),extensions.st_boundary(n.right_geom)
      ),1
    )) d
  ), grouped as (
    select identity_id,
      pg_catalog.round(extensions.st_x(raw_geom)::numeric,7) as lng,
      pg_catalog.round(extensions.st_y(raw_geom)::numeric,7) as lat,
      (array_agg(raw_geom order by extensions.st_asewkb(raw_geom)::text))[1] as raw_geom,
      array_agg(distinct left_segment_key order by left_segment_key)||
        array_agg(distinct right_segment_key order by right_segment_key) as source_segment_keys,
      min(left_name) as left_name,min(right_name) as right_name,
      array_agg(distinct left_name_event_id order by left_name_event_id)||
        array_agg(distinct right_name_event_id order by right_name_event_id) as name_event_ids,
      min(left_measure) as left_measure,min(right_measure) as right_measure
    from changes group by identity_id,
      pg_catalog.round(extensions.st_x(raw_geom)::numeric,7),
      pg_catalog.round(extensions.st_y(raw_geom)::numeric,7)
  )
  select g.*,
    extensions.st_setsrid(extensions.st_makepoint(g.lng::double precision,g.lat::double precision),4326) as geom,
    case when g.left_measure is not null and g.right_measure is not null
      and pg_catalog.abs(g.left_measure-g.right_measure)<=0.001
      then (g.left_measure+g.right_measure)/2 end as source_measure
  from grouped g;
  $new$;

  v_definition := pg_catalog.substr(v_definition,1,v_start_pos-1)
    || v_new_block
    || pg_catalog.substr(v_definition,v_end_pos+1);

  if v_definition not like '%tmp_issue97_name_change_candidates%'
     or v_definition not like '%tmp_issue97_name_change_candidates_left_idx%'
     or v_definition not like '%from tmp_issue97_name_change_candidates p%'
  then
    raise exception 'Issue #97 name-change candidate temp table rewrite did not install';
  end if;

  execute v_definition;
end
$issue97_patch_name_change_candidate_temp_table$;

do $issue97_verify_name_change_candidate_temp_table$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition not like '%tmp_issue97_name_change_candidates%'
     or v_definition not like '%tmp_issue97_name_change_candidates_left_idx%'
     or v_definition not like '%tmp_issue97_name_change_candidates_right_idx%'
     or v_definition not like '%analyze tmp_issue97_name_change_candidates%'
     or v_definition not like '%from tmp_issue97_name_change_candidates p%'
     or v_definition not like '%tmp_issue97_segment_preferred_names na%'
     or v_definition not like '%tmp_issue97_segment_preferred_names nb%'
  then
    raise exception 'Issue #97 name-change candidate temp table contract missing';
  end if;

  if v_definition not like '%0.03%'
     or v_definition not like '%st_dwithin%'
     or v_definition not like '%st_intersection%'
     or v_definition not like '%st_boundary%'
     or v_definition not like '%normalized_name<>%'
     or v_definition not like '%st_asewkb%'
     or v_definition not like '%geometrytype(%'
     or v_definition not like '%0.001%'
     or v_definition not like '%array_agg(distinct%'
  then
    raise exception 'Issue #97 name-change candidate temp table lost a live contract token';
  end if;

  if v_definition like '%similarity(%'
     or v_definition like '%nearest_road%'
     or v_definition like '%fuzzy_name%'
     or v_definition like '%name_only%'
  then
    raise exception 'Issue #97 name-change candidate temp table must not introduce forbidden semantics';
  end if;
end
$issue97_verify_name_change_candidate_temp_table$;
