-- GitHub #97 — Ohio OGRIP projected ODOT cache primary-key join hardening.
--
-- The cached overlap materializer still joined source_segment_key to the ODOT
-- catalog by concatenating the indexed roadway_inventory_id. On larger counties
-- that prevented a direct primary-key lookup and could exceed the production
-- statement timeout while building tmp_issue97_oh_supp_odot_proj. Normalize the
-- deterministic source key once into a tiny temp key set, then join directly to
-- brinesearch_odot_road_catalog.roadway_inventory_id. Mapping semantics remain
-- exact/source-ID based; road names and nearest-road matching remain prohibited.

do $issue97_patch_oh_odot_pk_join$
declare
  v_definition text;
  v_old_drop text:='drop table if exists pg_temp.tmp_issue97_oh_supp_centerline_proj;
  drop table if exists pg_temp.tmp_issue97_oh_supp_odot_proj;
  drop table if exists pg_temp.tmp_issue97_oh_supp_overlap;';
  v_new_drop text:='drop table if exists pg_temp.tmp_issue97_oh_supp_centerline_proj;
  drop table if exists pg_temp.tmp_issue97_oh_supp_odot_keys;
  drop table if exists pg_temp.tmp_issue97_oh_supp_odot_proj;
  drop table if exists pg_temp.tmp_issue97_oh_supp_overlap;';
  v_old_proj text:='create temporary table tmp_issue97_oh_supp_odot_proj on commit drop as
  select distinct m.identity_id,segment_key,o.ctl_begin,o.ctl_end,
    extensions.st_transform(o.geom,3857) as geom_3857
  from public.brinesearch_supplemental_centerline_identity_mappings m
  cross join lateral unnest(m.source_segment_keys) segment_key
  join public.brinesearch_odot_road_catalog o
    on segment_key=''OH:ODOT:SEGMENT:''||o.roadway_inventory_id
   and o.county_code=v_source_county and o.source_active and o.geom is not null
   and not extensions.st_isempty(o.geom) and extensions.st_isvalid(o.geom)
   and extensions.st_issimple(o.geom) and extensions.st_dimension(o.geom)=1
  where m.dataset_id=v_run.dataset_id and m.state_code=''OH''
    and m.county_code=v_run.county_code and m.active and m.mapping_status=''verified'';
  create index tmp_issue97_oh_supp_odot_proj_key_idx
    on tmp_issue97_oh_supp_odot_proj(identity_id,segment_key);
  analyze tmp_issue97_oh_supp_odot_proj;';
  v_new_proj text:='create temporary table tmp_issue97_oh_supp_odot_keys on commit drop as
  select distinct m.identity_id,k.segment_key,
    pg_catalog.substr(k.segment_key,17) as roadway_inventory_id
  from public.brinesearch_supplemental_centerline_identity_mappings m
  cross join lateral unnest(m.source_segment_keys) as k(segment_key)
  where m.dataset_id=v_run.dataset_id and m.state_code=''OH''
    and m.county_code=v_run.county_code and m.active and m.mapping_status=''verified''
    and k.segment_key like ''OH:ODOT:SEGMENT:%'';
  create unique index tmp_issue97_oh_supp_odot_keys_identity_segment_idx
    on tmp_issue97_oh_supp_odot_keys(identity_id,segment_key);
  create index tmp_issue97_oh_supp_odot_keys_roadway_idx
    on tmp_issue97_oh_supp_odot_keys(roadway_inventory_id);
  analyze tmp_issue97_oh_supp_odot_keys;

  create temporary table tmp_issue97_oh_supp_odot_proj on commit drop as
  select k.identity_id,k.segment_key,o.ctl_begin,o.ctl_end,
    extensions.st_transform(o.geom,3857) as geom_3857
  from tmp_issue97_oh_supp_odot_keys k
  join public.brinesearch_odot_road_catalog o
    on o.roadway_inventory_id=k.roadway_inventory_id
   and o.county_code=v_source_county and o.source_active and o.geom is not null
   and not extensions.st_isempty(o.geom) and extensions.st_isvalid(o.geom)
   and extensions.st_issimple(o.geom) and extensions.st_dimension(o.geom)=1;
  create index tmp_issue97_oh_supp_odot_proj_key_idx
    on tmp_issue97_oh_supp_odot_proj(identity_id,segment_key);
  analyze tmp_issue97_oh_supp_odot_proj;';
  v_drop_count integer;
  v_proj_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  v_drop_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_drop,'')))
    /pg_catalog.length(v_old_drop);
  v_proj_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_proj,'')))
    /pg_catalog.length(v_old_proj);
  if v_drop_count<>1 or v_proj_count<>1 then
    raise exception 'Issue #97 Ohio OGRIP PK-join patch changed unexpectedly: drop=% proj=%',v_drop_count,v_proj_count;
  end if;

  v_definition:=pg_catalog.replace(v_definition,v_old_drop,v_new_drop);
  v_definition:=pg_catalog.replace(v_definition,v_old_proj,v_new_proj);
  execute v_definition;
end
$issue97_patch_oh_odot_pk_join$;

revoke all on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)
from public,anon,authenticated,service_role;

comment on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid) is
  'Issue #97 internal Ohio OGRIP materializer. Verified source_segment_keys are normalized once and joined directly to the indexed ODOT roadway_inventory_id before projected overlap/name-event expansion; name-only and nearest-road matching remain prohibited.';
