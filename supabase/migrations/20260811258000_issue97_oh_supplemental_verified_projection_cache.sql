-- GitHub #97 — Ohio OGRIP verified-only projection cache hardening.
--
-- Belmont County has 8,514 OGRIP centerlines. After exact identity mapping became
-- fast, the name-event stage still projected and buffered every named source row,
-- including rows already held as unmatched. The endpoint-projection materializer
-- does not need a source buffer. Cache only current-generation centerlines that
-- already have a verified exact identity mapping and project each geometry once.

do $issue97_patch_oh_verified_projection_cache$
declare
  v_definition text;
  v_old text:='create temporary table tmp_issue97_oh_supp_centerline_proj on commit drop as
  select c.id as centerline_id,c.source_feature_key,c.source_record_id,c.source_digest,
    c.name_events,c.municipality_left,c.municipality_right,
    extensions.st_transform(c.geom,3857) as geom_3857,
    extensions.st_buffer(extensions.st_transform(c.geom,3857),0.25) as buffer_3857
  from public.brinesearch_authoritative_supplemental_centerlines c
  where c.dataset_id=v_run.dataset_id and c.state_code=''OH''
    and c.county_code=v_run.county_code and c.active
    and pg_catalog.jsonb_array_length(coalesce(c.name_events,''[]''::jsonb))>0;';
  v_new text:='create temporary table tmp_issue97_oh_supp_centerline_proj on commit drop as
  select c.id as centerline_id,c.source_feature_key,c.source_record_id,c.source_digest,
    c.name_events,c.municipality_left,c.municipality_right,
    extensions.st_transform(c.geom,3857) as geom_3857
  from public.brinesearch_authoritative_supplemental_centerlines c
  where c.dataset_id=v_run.dataset_id and c.state_code=''OH''
    and c.county_code=v_run.county_code and c.active and c.last_ingest_run_id=p_run_id
    and pg_catalog.jsonb_array_length(coalesce(c.name_events,''[]''::jsonb))>0
    and exists(
      select 1 from public.brinesearch_supplemental_centerline_identity_mappings m
      where m.centerline_id=c.id and m.dataset_id=v_run.dataset_id
        and m.state_code=''OH'' and m.county_code=v_run.county_code
        and m.active and m.mapping_status=''verified''
    );';
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 Ohio verified projection-cache block changed unexpectedly: % matches',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_oh_verified_projection_cache$;

revoke all on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)
from public,anon,authenticated,service_role;

comment on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid) is
  'Issue #97 internal Ohio OGRIP materializer. Current-generation source rows are mapped fail-closed first; only verified exact mappings are projected for name-event intervals, and endpoint projection avoids buffered source geometry. Name-only and nearest-road matching remain prohibited.';
