-- GitHub #97 — Ohio OGRIP name-overlap endpoint projection hardening.
--
-- Belmont County contains 8,514 OGRIP centerlines. Even after projected geometry
-- caching and direct ODOT primary-key lookups, repeatedly intersecting each matched
-- ODOT segment with a 0.25 m buffered OGRIP centerline exceeded the production
-- statement timeout. Identity equivalence has already been proven upstream by exact
-- geometry coverage, so derive each target-segment name interval from endpoint
-- containment/projection against that verified pair and materialize the exact ODOT
-- LineSubstring. No road names or nearest-road search enter the mapping decision.

do $issue97_patch_oh_overlap_endpoint_projection$
declare
  v_definition text;
  v_start integer;
  v_finish integer;
  v_replacement text:=$replacement$
create temporary table tmp_issue97_oh_supp_overlap on commit drop as
with pairs as (
  select c.centerline_id,m.identity_id,o.segment_key,
    c.source_feature_key,c.source_record_id,c.source_digest,c.name_events,
    c.municipality_left,c.municipality_right,o.ctl_begin,o.ctl_end,
    extensions.st_linemerge(c.geom_3857) as source_line,
    extensions.st_linemerge(o.geom_3857) as target_line
  from tmp_issue97_oh_supp_centerline_proj c
  join public.brinesearch_supplemental_centerline_identity_mappings m
    on m.centerline_id=c.centerline_id and m.dataset_id=v_run.dataset_id
   and m.state_code='OH' and m.county_code=v_run.county_code
   and m.active and m.mapping_status='verified'
  join tmp_issue97_oh_supp_odot_proj o on o.identity_id=m.identity_id
    and o.segment_key=any(m.source_segment_keys)
), endpoints as (
  select p.*,
    extensions.st_startpoint(p.source_line) as source_start,
    extensions.st_endpoint(p.source_line) as source_end,
    extensions.st_startpoint(p.target_line) as target_start,
    extensions.st_endpoint(p.target_line) as target_end
  from pairs p
  where extensions.geometrytype(p.source_line)='LINESTRING'
    and extensions.geometrytype(p.target_line)='LINESTRING'
), projected as (
  select e.*,
    extensions.st_dwithin(e.source_start,e.target_line,0.25) as source_start_on_target,
    extensions.st_dwithin(e.source_end,e.target_line,0.25) as source_end_on_target,
    extensions.st_dwithin(e.target_start,e.source_line,0.25) as target_start_on_source,
    extensions.st_dwithin(e.target_end,e.source_line,0.25) as target_end_on_source,
    extensions.st_linelocatepoint(e.target_line,
      extensions.st_closestpoint(e.target_line,e.source_start)) as source_start_fraction,
    extensions.st_linelocatepoint(e.target_line,
      extensions.st_closestpoint(e.target_line,e.source_end)) as source_end_fraction
  from endpoints e
), fractions as (
  select p.*,
    case
      when p.source_start_on_target and p.source_end_on_target
        then least(p.source_start_fraction,p.source_end_fraction)
      when p.target_start_on_source and p.target_end_on_source then 0.0
      when p.source_start_on_target and p.target_start_on_source then 0.0
      when p.source_end_on_target and p.target_start_on_source then 0.0
      when p.source_start_on_target and p.target_end_on_source then p.source_start_fraction
      when p.source_end_on_target and p.target_end_on_source then p.source_end_fraction
    end as start_fraction,
    case
      when p.source_start_on_target and p.source_end_on_target
        then greatest(p.source_start_fraction,p.source_end_fraction)
      when p.target_start_on_source and p.target_end_on_source then 1.0
      when p.source_start_on_target and p.target_start_on_source then p.source_start_fraction
      when p.source_end_on_target and p.target_start_on_source then p.source_end_fraction
      when p.source_start_on_target and p.target_end_on_source then 1.0
      when p.source_end_on_target and p.target_end_on_source then 1.0
    end as end_fraction
  from projected p
), resolved as (
  select f.*,
    extensions.st_linesubstring(f.target_line,
      greatest(0.0,least(1.0,f.start_fraction)),
      greatest(0.0,least(1.0,f.end_fraction))) as overlap_geom
  from fractions f
  where f.start_fraction is not null and f.end_fraction is not null
    and f.end_fraction>f.start_fraction
)
select r.centerline_id,r.identity_id,r.segment_key,
  r.source_feature_key,r.source_record_id,r.source_digest,r.name_events,
  r.municipality_left,r.municipality_right,r.ctl_begin,r.ctl_end,
  extensions.st_asgeojson(extensions.st_transform(r.overlap_geom,4326),15)::jsonb as overlap_geojson,
  r.start_fraction,r.end_fraction
from resolved r
where not extensions.st_isempty(r.overlap_geom)
  and extensions.st_length(r.overlap_geom)>0;
$replacement$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  v_start:=pg_catalog.strpos(v_definition,
    'create temporary table tmp_issue97_oh_supp_overlap on commit drop as');
  v_finish:=pg_catalog.strpos(v_definition,
    'create index tmp_issue97_oh_supp_overlap_identity_idx',v_start);
  if v_start=0 or v_finish=0 or v_finish<=v_start then
    raise exception 'Issue #97 Ohio supplemental overlap block changed unexpectedly';
  end if;
  v_definition:=pg_catalog.substr(v_definition,1,v_start-1)
    ||v_replacement||pg_catalog.substr(v_definition,v_finish);
  execute v_definition;
end
$issue97_patch_oh_overlap_endpoint_projection$;

revoke all on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)
from public,anon,authenticated,service_role;

comment on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid) is
  'Issue #97 internal Ohio OGRIP materializer. Exact identity equivalence is proved upstream without road names; name-event intervals are then derived only across already-verified OGRIP/ODOT source-segment pairs using endpoint containment/projection and exact ODOT LineSubstring geometry. Nearest-road matching remains prohibited.';
