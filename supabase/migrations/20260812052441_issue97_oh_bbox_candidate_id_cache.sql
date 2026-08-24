-- GitHub #97 — keep Ohio OGRIP bbox candidates ID-only to bound temporary disk.
--
-- Muskingum's OGRIP feed is mostly missing NLF IDs (989/1000 in a rollback sample).
-- The exact matcher correctly falls back to geometry, but the prior temporary bbox
-- table duplicated source + target geometry in both 4326 and 3857 for every nearby
-- candidate. In dense areas that can exhaust temporary disk even when the final
-- verified mapping set is modest. Preserve exactly the same bbox + 0.25 m proof,
-- but materialize only IDs in the candidate table and join geometry back for the
-- exact proof. Split NLF-present and NLF-missing paths so each can use its indexes.

do $issue97_patch_oh_bbox_id_cache$
declare
  v_definition text;
  v_old text:=$old$
  create temporary table tmp_issue97_oh_map_bbox_candidates on commit drop as
  select c.centerline_id,o.identity_id,c.geom as source_geom,c.geom_3857 as source_geom_3857,
    o.source_segment_key,o.geom as target_segment_geom,o.geom_3857 as target_segment_geom_3857
  from tmp_issue97_oh_map_source c
  join tmp_issue97_oh_map_odot o
    on (c.nlf_id is null or o.nlf_id=c.nlf_id)
   and o.geom OPERATOR(extensions.&&) extensions.st_expand(c.geom,0.00001);
  create index tmp_issue97_oh_map_bbox_centerline_idx on tmp_issue97_oh_map_bbox_candidates(centerline_id,identity_id);
  analyze tmp_issue97_oh_map_bbox_candidates;
  insert into public.brinesearch_supplemental_centerline_identity_mappings(
    centerline_id,dataset_id,state_code,county_code,identity_id,mapping_status,mapping_method,source_segment_keys,evidence,ingest_run_id,active
  )
  with candidate_segments as (
    select centerline_id,identity_id,source_geom_3857,source_segment_key,target_segment_geom_3857
    from tmp_issue97_oh_map_bbox_candidates
    where extensions.st_dwithin(source_geom::extensions.geography,target_segment_geom::extensions.geography,0.25)
  ), candidate_geometry as (
$old$;
  v_new text:=$new$
  create unique index tmp_issue97_oh_map_source_id_idx on tmp_issue97_oh_map_source(centerline_id);
  create unique index tmp_issue97_oh_map_odot_segment_idx on tmp_issue97_oh_map_odot(identity_id,source_segment_key);

  create temporary table tmp_issue97_oh_map_bbox_candidates on commit drop as
  select c.centerline_id,o.identity_id,o.source_segment_key
  from tmp_issue97_oh_map_source c
  join tmp_issue97_oh_map_odot o
    on c.nlf_id is not null and o.nlf_id=c.nlf_id
   and o.geom OPERATOR(extensions.&&) extensions.st_expand(c.geom,0.00001)
  union all
  select c.centerline_id,o.identity_id,o.source_segment_key
  from tmp_issue97_oh_map_source c
  join tmp_issue97_oh_map_odot o
    on c.nlf_id is null
   and o.geom OPERATOR(extensions.&&) extensions.st_expand(c.geom,0.00001);
  create index tmp_issue97_oh_map_bbox_centerline_idx on tmp_issue97_oh_map_bbox_candidates(centerline_id,identity_id);
  create index tmp_issue97_oh_map_bbox_segment_idx on tmp_issue97_oh_map_bbox_candidates(identity_id,source_segment_key);
  analyze tmp_issue97_oh_map_bbox_candidates;
  insert into public.brinesearch_supplemental_centerline_identity_mappings(
    centerline_id,dataset_id,state_code,county_code,identity_id,mapping_status,mapping_method,source_segment_keys,evidence,ingest_run_id,active
  )
  with candidate_segments as (
    select b.centerline_id,b.identity_id,c.geom_3857 as source_geom_3857,
      b.source_segment_key,o.geom_3857 as target_segment_geom_3857
    from tmp_issue97_oh_map_bbox_candidates b
    join tmp_issue97_oh_map_source c on c.centerline_id=b.centerline_id
    join tmp_issue97_oh_map_odot o
      on o.identity_id=b.identity_id and o.source_segment_key=b.source_segment_key
    where extensions.st_dwithin(c.geom::extensions.geography,o.geom::extensions.geography,0.25)
  ), candidate_geometry as (
$new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 Ohio ID-only bbox candidate patch changed unexpectedly: matches=%',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_oh_bbox_id_cache$;

revoke all on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)
from public,anon,authenticated,service_role;

comment on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid) is
  'Issue #97 internal Ohio OGRIP materializer. Bbox candidates are ID-only to bound temporary disk; NLF-present and NLF-missing paths are separated, then the same exact 0.25 m source/ODOT geometry proof runs after joining geometry back. Name/nearest-road mapping remains prohibited.';
