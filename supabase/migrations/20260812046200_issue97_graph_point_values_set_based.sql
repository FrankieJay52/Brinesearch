-- GitHub #97 — set-based tmp_issue97_point_values V2 (fail-closed + identity contract).
--
-- Belmont times out on tmp_issue97_point_values because correlated laterals scan
-- tmp_issue97_segments for every point-junction identity membership and repeat
-- both expensive geometry work and segment counts.
--
-- Semantics preserved exactly:
--   * source_segment_keys = i.source_segment_keys
--   * is_identity_terminus = i.is_identity_terminus
--   * every point-node x point-identity base row survives even with no chosen segment
--   * exact geography ST_DWithin tolerance: 1 m when has_at_grade, else 0.03 m
--   * chosen order: from_measure NULLS LAST, source_segment_key
--   * exact fraction, source-measure, distance, and measure-method contracts
--   * no nearest-road, fuzzy, name-only, or topology changes.

do $issue97_patch_point_values_set_based_v2$
declare
  v_definition text;
  v_start constant text := 'create temporary table tmp_issue97_point_values on commit drop as';
  v_end_marker constant text := ') totals on true;';
  v_start_pos integer;
  v_end_rel integer;
  v_end_pos integer;
  v_new_block text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition like '%issue97_point_values_base%'
     and v_definition like '%tmp_issue97_identity_segment_counts%'
  then
    return;
  end if;

  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_start,'')))
     / pg_catalog.length(v_start) <> 1 then
    raise exception 'Issue #97 point-values create anchor changed or is not unique';
  end if;

  v_start_pos := pg_catalog.strpos(v_definition,v_start);
  if v_start_pos < 1 then
    raise exception 'Issue #97 point-values create anchor missing';
  end if;

  v_end_rel := pg_catalog.strpos(pg_catalog.substr(v_definition,v_start_pos),v_end_marker);
  if v_end_rel < 1 then
    raise exception 'Issue #97 point-values terminating lateral anchor missing';
  end if;
  v_end_pos := v_start_pos + v_end_rel + pg_catalog.length(v_end_marker) - 2;

  v_new_block := $new$
  -- Issue #97 performance: materialize segment counts once per identity.
  drop table if exists pg_temp.tmp_issue97_identity_segment_counts;
  create temporary table tmp_issue97_identity_segment_counts on commit drop as
  select identity_id,count(*)::integer as segment_count
  from tmp_issue97_segments
  group by identity_id;
  create unique index tmp_issue97_identity_segment_counts_key_idx
    on tmp_issue97_identity_segment_counts(identity_id);
  analyze tmp_issue97_identity_segment_counts;

  create temporary table tmp_issue97_point_values on commit drop as
  with issue97_point_values_base as (
    -- Complete fail-closed base population: do not drop unresolved point/identity rows.
    select
      p.candidate_key,
      i.identity_id,
      i.source_segment_keys,
      i.is_identity_terminus,
      p.geom as point_geom,
      p.has_at_grade,
      case when p.has_at_grade then 1::double precision else 0.03::double precision end as tol_m,
      -- Conservative candidate-only envelope. Across configured OH/WV/PA latitudes,
      -- 0.00005 degrees is several metres in both axes, safely wider than the
      -- authoritative maximum 1 m geography tolerance below.
      extensions.st_expand(p.geom,0.00005) as point_expand
    from tmp_issue97_point_nodes p
    join tmp_issue97_point_identity i on i.candidate_key=p.candidate_key
  ), bbox_hits as (
    select
      b.candidate_key,b.identity_id,b.point_geom,b.tol_m,
      s.source_segment_key,s.geom as segment_geom,s.from_measure,s.to_measure
    from issue97_point_values_base b
    join tmp_issue97_segments s
      on s.identity_id=b.identity_id
     and s.geom OPERATOR(extensions.&&) b.point_expand
  ), survivors as (
    select h.*,
      extensions.st_length(h.segment_geom::extensions.geography) as length_m
    from bbox_hits h
    where extensions.st_dwithin(
      h.segment_geom::extensions.geography,
      h.point_geom::extensions.geography,
      h.tol_m
    )
  ), measured as (
    select s.*,
      case when extensions.geometrytype(extensions.st_linemerge(s.segment_geom))='LINESTRING'
        then extensions.st_linelocatepoint(
          extensions.st_linemerge(s.segment_geom),
          extensions.st_closestpoint(s.segment_geom,s.point_geom)
        ) else 0 end as fraction
    from survivors s
  ), ranked as (
    select m.*,
      pg_catalog.row_number() over (
        partition by m.candidate_key,m.identity_id
        order by m.from_measure nulls last,m.source_segment_key
      ) as rn
    from measured m
  ), chosen as (
    select * from ranked where rn=1
  )
  select
    b.candidate_key,
    b.identity_id,
    b.source_segment_keys,
    b.is_identity_terminus,
    c.source_segment_key as chosen_segment_key,
    c.fraction,
    case when c.from_measure is not null and c.to_measure is not null
      then c.from_measure+(c.to_measure-c.from_measure)*c.fraction end as source_measure,
    case
      when c.from_measure is not null and c.to_measure is not null
        then (c.from_measure+(c.to_measure-c.from_measure)*c.fraction)*1609.344
      when sc.segment_count=1 then c.fraction*c.length_m
      else null
    end as distance_along_road_m,
    case when c.from_measure is not null and c.to_measure is not null then 'authoritative_linear_measure'
      when sc.segment_count=1 then 'single_source_feature_geometry'
      else 'ambiguous' end as measure_method
  from issue97_point_values_base b
  left join chosen c
    on c.candidate_key=b.candidate_key and c.identity_id=b.identity_id
  left join tmp_issue97_identity_segment_counts sc on sc.identity_id=b.identity_id;
  $new$;

  v_definition := pg_catalog.overlay(
    v_definition placing v_new_block from v_start_pos for (v_end_pos-v_start_pos+1)
  );
  execute v_definition;
end
$issue97_patch_point_values_set_based_v2$;

do $issue97_verify_point_values_set_based_v2$
declare
  v_definition text;
  v_start_pos integer;
  v_end_rel integer;
  v_region text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  v_start_pos := pg_catalog.strpos(v_definition,'drop table if exists pg_temp.tmp_issue97_identity_segment_counts');
  if v_start_pos<1 then
    raise exception 'Issue #97 optimized point-values region missing';
  end if;
  v_end_rel := pg_catalog.strpos(
    pg_catalog.substr(v_definition,v_start_pos),
    'drop table if exists pg_temp.tmp_issue97_point_membership_names'
  );
  if v_end_rel<1 then
    raise exception 'Issue #97 point-values downstream boundary missing';
  end if;
  v_region := pg_catalog.substr(v_definition,v_start_pos,v_end_rel-1);

  if v_region not like '%issue97_point_values_base%'
     or v_region not like '%i.source_segment_keys%'
     or v_region not like '%i.is_identity_terminus%'
     or v_region not like '%left join chosen c%'
     or v_region not like '%s.geom OPERATOR(extensions.&&) b.point_expand%'
     or v_region not like '%case when p.has_at_grade then 1%else 0.03%end%'
     or v_region not like '%extensions.st_dwithin(%'
     or v_region not like '%order by m.from_measure nulls last,m.source_segment_key%'
     or v_region not like '%extensions.geometrytype(extensions.st_linemerge(s.segment_geom))=''LINESTRING''%'
     or v_region not like '%extensions.st_linelocatepoint(%'
     or v_region not like '%extensions.st_closestpoint(%'
     or v_region not like '%*1609.344%'
     or v_region not like '%authoritative_linear_measure%'
     or v_region not like '%single_source_feature_geometry%'
     or v_region not like '%ambiguous%'
  then
    raise exception 'Issue #97 optimized point-values contract did not install cleanly';
  end if;

  if v_region like '%similarity(%'
     or v_region like '%nearest_road%'
     or v_region like '%fuzzy_name%'
     or v_region like '%name_only%'
  then
    raise exception 'Issue #97 point-values optimization introduced forbidden semantics';
  end if;
end
$issue97_verify_point_values_set_based_v2$;
