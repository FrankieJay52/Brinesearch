-- GitHub #97 — name-change detection performance with consumed endpoint/name materialization.
--
-- Belmont reaches tmp_issue97_name_changes and times out in the original
-- same-identity segment-pair scan plus repeated boundary geography checks and
-- correlated authoritative-name laterals. This patch changes only candidate/name
-- evaluation. The final name-change meaning and downstream temp-table contract
-- remain identical.
--
-- Semantics preserved exactly:
--   * same authoritative identity and distinct segment ordering;
--   * exact 0.03 metre endpoint/boundary evidence;
--   * exact ST_Intersection(ST_Boundary(...),ST_Boundary(...)) point evidence;
--   * segment-scoped active authoritative names with valid_from/valid_to;
--   * official > signed > other, then id precedence;
--   * normalized_name <> normalized_name (NULL remains fail-closed);
--   * owner-scope rule;
--   * authoritative from/to source-measure scaling;
--   * grouping by identity + rounded 7-decimal coordinate;
--   * source_segment_keys and name_event_ids remain arrays;
--   * deterministic raw_geom selection by ST_AsEWKB;
--   * <=0.001 source_measure convergence;
--   * no fuzzy, nearest-road, name-only, or proximity identity proof.

do $issue97_patch_name_change_endpoint_materialization$
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

  if v_definition like '%issue97_name_change_endpoint_candidates%'
     and v_definition like '%tmp_issue97_segment_preferred_names%'
  then
    return;
  end if;

  if (pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition,v_start,'')))
      / pg_catalog.length(v_start) <> 1
  then
    raise exception 'Issue #97 name-change create anchor changed or is not unique';
  end if;

  v_start_pos := pg_catalog.strpos(v_definition,v_start);
  if v_start_pos < 1 then
    raise exception 'Issue #97 name-change create anchor missing';
  end if;

  v_end_rel := pg_catalog.strpos(pg_catalog.substr(v_definition,v_start_pos),v_end_marker);
  if v_end_rel < 1 then
    raise exception 'Issue #97 name-change terminating anchor missing';
  end if;
  v_end_pos := v_start_pos + v_end_rel + pg_catalog.length(v_end_marker) - 2;

  v_new_block := $new$
  -- Issue #97 performance: materialize every exact boundary endpoint once.
  -- ST_Dump(ST_Boundary(...)) preserves the original boundary-point semantics
  -- even if a future source scope contains multipart linear geometry.
  drop table if exists pg_temp.tmp_issue97_segment_endpoints;
  create temporary table tmp_issue97_segment_endpoints on commit drop as
  select
    s.id as segment_id,
    s.identity_id,
    s.source_segment_key,
    s.state_code,
    s.county_code,
    s.geom as segment_geom,
    s.from_measure,
    s.to_measure,
    (endpoint_dump).geom as endpoint_geom,
    extensions.st_expand((endpoint_dump).geom,0.00005) as endpoint_expand
  from tmp_issue97_segments s
  cross join lateral extensions.st_dump(
    extensions.st_collectionextract(extensions.st_boundary(s.geom),1)
  ) endpoint_dump;
  create index tmp_issue97_segment_endpoints_identity_segment_idx
    on tmp_issue97_segment_endpoints(identity_id,segment_id);
  create index tmp_issue97_segment_endpoints_geom_idx
    on tmp_issue97_segment_endpoints using gist(endpoint_geom);
  create index tmp_issue97_segment_endpoints_expand_idx
    on tmp_issue97_segment_endpoints using gist(endpoint_expand);
  analyze tmp_issue97_segment_endpoints;

  -- Resolve the exact preferred segment-scoped name once per source segment.
  drop table if exists pg_temp.tmp_issue97_segment_preferred_names;
  create temporary table tmp_issue97_segment_preferred_names on commit drop as
  select distinct on (n.identity_id,n.source_segment_key)
    n.identity_id,
    n.source_segment_key,
    n.id as name_event_id,
    n.road_name,
    n.normalized_name
  from public.brinesearch_authoritative_road_names n
  where n.active
    and n.source_segment_key is not null
    and (n.valid_from is null or n.valid_from<=now())
    and (n.valid_to is null or n.valid_to>now())
    and n.identity_id in (select distinct identity_id from tmp_issue97_segments)
  order by n.identity_id,n.source_segment_key,
    case n.name_type when 'official' then 0 when 'signed' then 1 else 2 end,
    n.id;
  create unique index tmp_issue97_segment_preferred_names_key_idx
    on tmp_issue97_segment_preferred_names(identity_id,source_segment_key);
  analyze tmp_issue97_segment_preferred_names;

  create temporary table tmp_issue97_name_changes on commit drop as
  with issue97_name_change_endpoint_candidates as (
    -- Reduce to one segment pair after an index-friendly boundary-endpoint
    -- candidate test. The exact 0.03 m geography test remains authoritative.
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
    )
  ), changes as (
    select p.identity_id,p.left_state_code as state_code,p.left_county_code as county_code,
      p.left_segment_key,p.right_segment_key,
      na.name_event_id as left_name_event_id,nb.name_event_id as right_name_event_id,
      na.road_name as left_name,nb.road_name as right_name,
      (d).geom as raw_geom,
      case when p.left_from_measure is not null and p.left_to_measure is not null
        and extensions.geometrytype(extensions.st_linemerge(p.left_geom))='LINESTRING' then
        p.left_from_measure+(p.left_to_measure-p.left_from_measure)*extensions.st_linelocatepoint(
          extensions.st_linemerge(p.left_geom),extensions.st_closestpoint(p.left_geom,(d).geom)
        ) end as left_measure,
      case when p.right_from_measure is not null and p.right_to_measure is not null
        and extensions.geometrytype(extensions.st_linemerge(p.right_geom))='LINESTRING' then
        p.right_from_measure+(p.right_to_measure-p.right_from_measure)*extensions.st_linelocatepoint(
          extensions.st_linemerge(p.right_geom),extensions.st_closestpoint(p.right_geom,(d).geom)
        ) end as right_measure
    from issue97_name_change_endpoint_candidates p
    cross join lateral extensions.st_dump(extensions.st_collectionextract(
      extensions.st_intersection(
        extensions.st_boundary(p.left_geom),extensions.st_boundary(p.right_geom)
      ),1
    )) d
    join tmp_issue97_segment_preferred_names na
      on na.identity_id=p.identity_id and na.source_segment_key=p.left_segment_key
    join tmp_issue97_segment_preferred_names nb
      on nb.identity_id=p.identity_id and nb.source_segment_key=p.right_segment_key
    where na.normalized_name<>nb.normalized_name
      and pg_catalog.least(
        p.left_state_code||':'||p.left_county_code,
        p.right_state_code||':'||p.right_county_code
      )=v_state||':'||v_county
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
    ||v_new_block
    ||pg_catalog.substr(v_definition,v_end_pos+1);
  execute v_definition;
end
$issue97_patch_name_change_endpoint_materialization$;

do $issue97_verify_name_change_endpoint_materialization$
declare
  v_definition text;
  v_start_pos integer;
  v_end_rel integer;
  v_region text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  v_start_pos := pg_catalog.strpos(v_definition,'drop table if exists pg_temp.tmp_issue97_segment_endpoints');
  if v_start_pos<1 then
    raise exception 'Issue #97 optimized name-change region missing';
  end if;
  v_end_rel := pg_catalog.strpos(
    pg_catalog.substr(v_definition,v_start_pos),
    'insert into public.brinesearch_road_junctions('
  );
  if v_end_rel<1 then
    raise exception 'Issue #97 name-change downstream boundary missing';
  end if;
  v_region := pg_catalog.substr(v_definition,v_start_pos,v_end_rel-1);

  if v_region not like '%from tmp_issue97_segment_endpoints le%'
     or v_region not like '%tmp_issue97_segment_preferred_names na%'
     or v_region not like '%tmp_issue97_segment_preferred_names nb%'
     or v_region not like '%0.03%'
     or v_region not like '%extensions.st_intersection(%extensions.st_boundary(p.left_geom)%extensions.st_boundary(p.right_geom)%'
     or v_region not like '%na.normalized_name<>nb.normalized_name%'
     or v_region not like '%array_agg(distinct left_segment_key order by left_segment_key)||%'
     or v_region not like '%array_agg(distinct left_name_event_id order by left_name_event_id)||%'
     or v_region not like '%array_agg(raw_geom order by extensions.st_asewkb(raw_geom)::text)%'
     or v_region not like '%extensions.geometrytype(extensions.st_linemerge(p.left_geom))=''LINESTRING''%'
     or v_region not like '%extensions.st_linelocatepoint(%'
     or v_region not like '%extensions.st_closestpoint(%'
     or v_region not like '%pg_catalog.round(extensions.st_x(raw_geom)::numeric,7)%'
     or v_region not like '%pg_catalog.abs(g.left_measure-g.right_measure)<=0.001%'
     or v_region like '%join lateral (%select n.id,n.road_name,n.normalized_name%'
  then
    raise exception 'Issue #97 optimized name-change contract did not install cleanly';
  end if;
end
$issue97_verify_name_change_endpoint_materialization$;