-- GitHub #97 — Ohio OGRIP exact-mapping candidate cache hardening.
--
-- Belmont County has 8,514 OGRIP source centerlines and only a handful of rows
-- with OGRIP NLF identifiers. The exact mapping stage was discovering spatial
-- candidates and running the 0.25 m geography proof in one large base-table join,
-- exceeding the normal production statement timeout. Materialize the current-run
-- source rows and current ODOT source/identity assignments once, use indexed NLF +
-- bounding-box discovery to create a small candidate cache, then run the existing
-- exact 0.25 m geodesic proof only on those candidates. Road names and nearest-road
-- matching remain prohibited; mapping evidence and fail-closed semantics are unchanged.

do $issue97_patch_oh_mapping_candidate_cache$
declare
  v_definition text;
  v_start integer;
  v_relative_finish integer;
  v_finish integer;
  v_replacement text:=$replacement$
  drop table if exists pg_temp.tmp_issue97_oh_map_source;
  drop table if exists pg_temp.tmp_issue97_oh_map_odot;
  drop table if exists pg_temp.tmp_issue97_oh_map_bbox_candidates;

  create temporary table tmp_issue97_oh_map_source on commit drop as
  select c.id as centerline_id,c.geom,
    extensions.st_transform(c.geom,3857) as geom_3857,
    nullif(pg_catalog.btrim(c.attributes->>'nlfid'),'') as nlf_id
  from public.brinesearch_authoritative_supplemental_centerlines c
  where c.dataset_id=v_run.dataset_id and c.state_code='OH'
    and c.county_code=v_run.county_code and c.active and c.last_ingest_run_id=p_run_id
    and extensions.st_issimple(c.geom);
  create index tmp_issue97_oh_map_source_geom_idx
    on tmp_issue97_oh_map_source using gist(geom);
  create index tmp_issue97_oh_map_source_nlf_idx
    on tmp_issue97_oh_map_source(nlf_id) where nlf_id is not null;
  analyze tmp_issue97_oh_map_source;

  create temporary table tmp_issue97_oh_map_odot on commit drop as
  select o.roadway_inventory_id,o.nlf_id,o.geom,
    extensions.st_transform(o.geom,3857) as geom_3857,
    a.identity_id,
    'OH:ODOT:SEGMENT:'||o.roadway_inventory_id as source_segment_key
  from public.brinesearch_odot_road_catalog o
  join public.brinesearch_authoritative_segment_identity_assignments a
    on a.dataset_id=v_odot_dataset
   and a.source_segment_key='OH:ODOT:SEGMENT:'||o.roadway_inventory_id
   and a.active
  where o.county_code=v_source_county and o.source_active and o.geom is not null
    and not extensions.st_isempty(o.geom) and extensions.st_isvalid(o.geom)
    and extensions.st_issimple(o.geom) and extensions.st_dimension(o.geom)=1
    and extensions.st_coveredby(o.geom,extensions.st_makeenvelope(-180,-90,180,90,4326));
  create index tmp_issue97_oh_map_odot_geom_idx
    on tmp_issue97_oh_map_odot using gist(geom);
  create index tmp_issue97_oh_map_odot_nlf_idx
    on tmp_issue97_oh_map_odot(nlf_id) where nlf_id is not null;
  create index tmp_issue97_oh_map_odot_identity_idx
    on tmp_issue97_oh_map_odot(identity_id,source_segment_key);
  analyze tmp_issue97_oh_map_odot;

  create temporary table tmp_issue97_oh_map_bbox_candidates on commit drop as
  select c.centerline_id,o.identity_id,c.geom as source_geom,
    c.geom_3857 as source_geom_3857,o.source_segment_key,
    o.geom as target_segment_geom,o.geom_3857 as target_segment_geom_3857
  from tmp_issue97_oh_map_source c
  join tmp_issue97_oh_map_odot o
    on (c.nlf_id is null or o.nlf_id=c.nlf_id)
   and o.geom OPERATOR(extensions.&&) extensions.st_expand(c.geom,0.00001);
  create index tmp_issue97_oh_map_bbox_centerline_idx
    on tmp_issue97_oh_map_bbox_candidates(centerline_id,identity_id);
  analyze tmp_issue97_oh_map_bbox_candidates;

  insert into public.brinesearch_supplemental_centerline_identity_mappings(
    centerline_id,dataset_id,state_code,county_code,identity_id,
    mapping_status,mapping_method,source_segment_keys,evidence,ingest_run_id,active
  )
  with candidate_segments as (
    select centerline_id,identity_id,source_geom_3857,
      source_segment_key,target_segment_geom_3857
    from tmp_issue97_oh_map_bbox_candidates
    where extensions.st_dwithin(
      source_geom::extensions.geography,
      target_segment_geom::extensions.geography,
      0.25
    )
  ), candidate_geometry as (
    select centerline_id,identity_id,
      array_agg(distinct source_segment_key order by source_segment_key) as source_segment_keys,
      (array_agg(source_geom_3857 order by source_segment_key))[1] as source_geom,
      extensions.st_unaryunion(extensions.st_collect(target_segment_geom_3857)) as target_geom
    from candidate_segments group by centerline_id,identity_id
  ), projected_matches as (
    select centerline_id,identity_id,source_segment_keys,
      extensions.st_linemerge(source_geom) as source_line,
      target_geom,
      extensions.st_buffer(target_geom,0.25) as target_buffer
    from candidate_geometry
    where extensions.geometrytype(extensions.st_linemerge(source_geom))='LINESTRING'
  ), containment as (
    select centerline_id,identity_id,source_segment_keys,source_line,target_geom,
      extensions.st_buffer(source_line,0.25) as source_buffer,target_buffer,
      extensions.st_length(source_line) as source_length_m,
      extensions.st_length(target_geom) as target_length_m,
      extensions.st_coveredby(source_line,target_buffer) as source_fully_covered
    from projected_matches
  ), exact_matches as (
    select centerline_id,identity_id,source_segment_keys,
      greatest(
        extensions.st_distance(extensions.st_startpoint(source_line),target_geom),
        extensions.st_distance(extensions.st_endpoint(source_line),target_geom)
      ) as max_endpoint_distance_m,
      case when source_fully_covered then 1.0
        when extensions.st_coveredby(target_geom,source_buffer)
          then least(1.0,target_length_m/nullif(source_length_m,0))
        else 0.0 end as source_coverage,
      case when source_fully_covered then source_length_m
        when extensions.st_coveredby(target_geom,source_buffer) then target_length_m
        else 0.0 end as overlap_length_m,
      source_fully_covered,
      extensions.st_coveredby(target_geom,source_buffer) as target_fully_covered
    from containment
  )
  select centerline_id,v_run.dataset_id,'OH',v_run.county_code,identity_id,
    'verified','exact_geometry_coverage',source_segment_keys,
    pg_catalog.jsonb_build_object(
      'max_endpoint_distance_m',max_endpoint_distance_m,'source_coverage',source_coverage,
      'overlap_length_m',overlap_length_m,'source_fully_covered',source_fully_covered,
      'target_fully_covered',target_fully_covered,'buffer_tolerance_m',0.25,
      'name_used_for_mapping',false,'nearest_road_used_for_mapping',false,
      'many_to_many_preserved',true,'containment_direction_preserved',true,
      'candidate_source','indexed source/ODOT bbox cache + exact 0.25 m geodesic proof'
    ),p_run_id,true
  from exact_matches
  where overlap_length_m>=0.5 and (source_fully_covered or target_fully_covered)
  on conflict(centerline_id,identity_id) do update set
    mapping_status=excluded.mapping_status,mapping_method=excluded.mapping_method,
    source_segment_keys=excluded.source_segment_keys,evidence=excluded.evidence,
    ingest_run_id=excluded.ingest_run_id,active=true,updated_at=now();
$replacement$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  v_start:=pg_catalog.strpos(
    v_definition,
    'insert into public.brinesearch_supplemental_centerline_identity_mappings('
  );
  if v_start=0 then
    raise exception 'Issue #97 Ohio mapping insert start marker is missing';
  end if;
  v_relative_finish:=pg_catalog.strpos(
    pg_catalog.substr(v_definition,v_start),
    'get diagnostics v_mapping_count=row_count;'
  );
  if v_relative_finish=0 then
    raise exception 'Issue #97 Ohio mapping insert finish marker is missing';
  end if;
  v_finish:=v_start+v_relative_finish-1;

  v_definition:=pg_catalog.substr(v_definition,1,v_start-1)
    ||v_replacement
    ||pg_catalog.substr(v_definition,v_finish);
  execute v_definition;
end
$issue97_patch_oh_mapping_candidate_cache$;

revoke all on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)
from public,anon,authenticated,service_role;

comment on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid) is
  'Issue #97 internal Ohio OGRIP materializer. Current-run OGRIP and current ODOT assignment rows are cached once; indexed NLF/bbox discovery narrows candidates before the unchanged exact 0.25 m geodesic coverage proof. Names and nearest-road matching remain prohibited.';
