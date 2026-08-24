-- GitHub #97 — compact Ohio supplemental alias provenance.
--
-- Large Ohio OGRIP counties can create many segment-scoped name rows. The exact
-- ODOT segment key, CTL measures, source digest, and overlap fractions already
-- preserve where each alias applies. Storing the full overlap GeoJSON again inside
-- every name-row provenance duplicates geometry payload and can exceed the normal
-- production statement timeout during bulk upsert. Keep compact exact provenance
-- and stop serializing duplicated overlap geometry. Matching semantics do not change.

do $issue97_patch_oh_compact_name_provenance$
declare
  v_definition text;
  v_old_overlap text:='extensions.st_asgeojson(extensions.st_transform(r.overlap_geom,4326),15)::jsonb as overlap_geojson,
  r.start_fraction,r.end_fraction';
  v_new_overlap text:='null::jsonb as overlap_geojson,
  r.start_fraction,r.end_fraction';
  v_old_provenance text:='''target_overlap'',o.overlap_geojson,
      ''target_overlap_fraction'',pg_catalog.jsonb_build_array(';
  v_new_provenance text:='''target_overlap_geometry_stored'',false,
      ''target_overlap_fraction'',pg_catalog.jsonb_build_array(';
  v_overlap_count integer;
  v_provenance_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  v_overlap_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_overlap,'')))
    /pg_catalog.length(v_old_overlap);
  v_provenance_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_provenance,'')))
    /pg_catalog.length(v_old_provenance);
  if v_overlap_count<>1 or v_provenance_count<>1 then
    raise exception 'Issue #97 Ohio compact-name patch changed unexpectedly: overlap=% provenance=%',v_overlap_count,v_provenance_count;
  end if;

  v_definition:=pg_catalog.replace(v_definition,v_old_overlap,v_new_overlap);
  v_definition:=pg_catalog.replace(v_definition,v_old_provenance,v_new_provenance);
  execute v_definition;
end
$issue97_patch_oh_compact_name_provenance$;

revoke all on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)
from public,anon,authenticated,service_role;

comment on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid) is
  'Issue #97 internal Ohio OGRIP materializer. Alias provenance keeps exact source digest, ODOT segment key, CTL interval, and overlap fractions without duplicating overlap GeoJSON into every name row. Name/nearest-road matching remains prohibited.';
