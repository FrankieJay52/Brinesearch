-- GitHub #97 — Ohio OGRIP exact-identity mapping performance hardening.
--
-- Belmont County has 8,514 OGRIP centerlines. OGRIP itself publishes `nlfid`, the
-- authoritative route-linkage identifier also carried by ODOT. Use that official
-- identifier to narrow ODOT candidates whenever it is present, then retain the
-- existing exact geometry + exact segment-assignment proof. If OGRIP publishes an
-- NLF that is absent from the current ODOT county snapshot, hold it rather than
-- falling back to a different road. Rows with no NLF may still use exact geometry.
--
-- Also remove redundant ST_Intersection work from the final containment proof.
-- Once one geometry is fully covered by the other's 0.25 m buffer, exact overlap
-- length is the contained geometry's length; no name or nearest-road inference is
-- introduced.

do $issue97_patch_oh_nlf_mapping$
declare
  v_definition text;
  v_old_join text:='join public.brinesearch_odot_road_catalog o
      on o.county_code=v_source_county and o.source_active and o.geom is not null
     and not extensions.st_isempty(o.geom) and extensions.st_isvalid(o.geom)
     and extensions.st_issimple(o.geom) and extensions.st_dimension(o.geom)=1
     and extensions.st_coveredby(o.geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
     and o.geom OPERATOR(extensions.&&) extensions.st_expand(c.geom,0.00001)
     and extensions.st_dwithin(c.geom::extensions.geography,o.geom::extensions.geography,0.25)';
  v_new_join text:='join public.brinesearch_odot_road_catalog o
      on o.county_code=v_source_county and o.source_active and o.geom is not null
     and not extensions.st_isempty(o.geom) and extensions.st_isvalid(o.geom)
     and extensions.st_issimple(o.geom) and extensions.st_dimension(o.geom)=1
     and extensions.st_coveredby(o.geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
     and (
       nullif(pg_catalog.btrim(c.attributes->>''nlfid''),'''') is null
       or o.nlf_id=nullif(pg_catalog.btrim(c.attributes->>''nlfid''),'''')
     )
     and o.geom OPERATOR(extensions.&&) extensions.st_expand(c.geom,0.00001)
     and extensions.st_dwithin(c.geom::extensions.geography,o.geom::extensions.geography,0.25)';
  v_old_exact text:='exact_matches as (
    select centerline_id,identity_id,source_segment_keys,
      greatest(
        extensions.st_distance(extensions.st_startpoint(extensions.st_linemerge(extensions.st_transform(source_geom,3857))),target_geom),
        extensions.st_distance(extensions.st_endpoint(extensions.st_linemerge(extensions.st_transform(source_geom,3857))),target_geom)
      ) as max_endpoint_distance_m,
      extensions.st_length(extensions.st_intersection(
        extensions.st_transform(source_geom,3857),extensions.st_buffer(target_geom,0.25)
      ))/nullif(extensions.st_length(extensions.st_transform(source_geom,3857)),0) as source_coverage,
      extensions.st_length(extensions.st_intersection(
        extensions.st_transform(source_geom,3857),extensions.st_buffer(target_geom,0.25)
      )) as overlap_length_m,
      extensions.st_coveredby(extensions.st_transform(source_geom,3857),extensions.st_buffer(target_geom,0.25)) as source_fully_covered,
      extensions.st_coveredby(target_geom,extensions.st_buffer(extensions.st_transform(source_geom,3857),0.25)) as target_fully_covered
    from candidate_geometry
    where extensions.geometrytype(extensions.st_linemerge(extensions.st_transform(source_geom,3857)))=''LINESTRING''
  )';
  v_new_exact text:='projected_matches as (
    select centerline_id,identity_id,source_segment_keys,
      extensions.st_linemerge(extensions.st_transform(source_geom,3857)) as source_line,
      target_geom,
      extensions.st_buffer(target_geom,0.25) as target_buffer
    from candidate_geometry
    where extensions.geometrytype(extensions.st_linemerge(extensions.st_transform(source_geom,3857)))=''LINESTRING''
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
  )';
  v_join_count integer;
  v_exact_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  v_join_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_join,'')))
    /pg_catalog.length(v_old_join);
  v_exact_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_exact,'')))
    /pg_catalog.length(v_old_exact);
  if v_join_count<>1 or v_exact_count<>1 then
    raise exception 'Issue #97 Ohio NLF mapping patch changed unexpectedly: join=% exact=%',v_join_count,v_exact_count;
  end if;

  v_definition:=pg_catalog.replace(v_definition,v_old_join,v_new_join);
  v_definition:=pg_catalog.replace(v_definition,v_old_exact,v_new_exact);
  execute v_definition;
end
$issue97_patch_oh_nlf_mapping$;

revoke all on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)
from public,anon,authenticated,service_role;

comment on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid) is
  'Issue #97 internal Ohio OGRIP materializer. Official OGRIP nlfid narrows ODOT candidates when present, exact geometry + exact segment assignments prove equivalence, and published-but-unmatched NLF values fail closed. Road-name and nearest-road matching remain prohibited.';
