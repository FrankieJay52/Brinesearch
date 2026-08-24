-- GitHub #97 — Ohio authoritative road-component construction performance.
--
-- Mahoning County has 8,477 ODOT source rows. The original exact component rule
-- self-joined every valid segment pair inside each NLF/jurisdiction/route-type
-- group before applying CTL/endpoint continuity, which exceeded the production
-- statement timeout. Preserve the same rule by materializing two endpoints per
-- valid segment, indexing source measure + geography, generating only endpoint
-- candidate edges, then running the same transitive component walk over those
-- exact edges. No road names, nearest-road heuristics, or relaxed distances enter
-- component identity.

do $issue97_patch_oh_components$
declare
  v_definition text;
  v_start integer;
  v_finish integer;
  v_replacement text:=$replacement$
drop table if exists pg_temp.tmp_issue97_oh_component_segments;
drop table if exists pg_temp.tmp_issue97_oh_valid_segments;
drop table if exists pg_temp.tmp_issue97_oh_endpoints;
drop table if exists pg_temp.tmp_issue97_oh_endpoint_edges;
drop table if exists pg_temp.tmp_issue97_oh_component_labels;

create temporary table tmp_issue97_oh_valid_segments on commit drop as
select c.*
from public.brinesearch_odot_road_catalog c
join public.brinesearch_road_graph_counties gc
  on gc.state_code='OH' and gc.source_county_code=c.county_code and gc.active
where c.source_active and c.nlf_id is not null and c.geom is not null
  and not extensions.st_isempty(c.geom) and extensions.st_isvalid(c.geom)
  and extensions.st_issimple(c.geom) and extensions.st_dimension(c.geom)=1
  and extensions.st_coveredby(c.geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
  and (v_county is null or c.county_code=v_county);
create unique index tmp_issue97_oh_valid_segments_id_idx
  on tmp_issue97_oh_valid_segments(roadway_inventory_id);
analyze tmp_issue97_oh_valid_segments;

create temporary table tmp_issue97_oh_endpoints on commit drop as
select s.roadway_inventory_id,s.nlf_id,s.jurisdiction_code,s.route_type,
  case when coalesce(s.attributes->>'Z_LEVEL',s.attributes->>'ELEMENTLEV','')~'^-?[0-9]+$'
    then coalesce(s.attributes->>'Z_LEVEL',s.attributes->>'ELEMENTLEV')::integer end as z_level,
  'begin'::text as endpoint_role,s.ctl_begin as source_measure,
  extensions.st_startpoint(s.geom) as geom
from tmp_issue97_oh_valid_segments s
union all
select s.roadway_inventory_id,s.nlf_id,s.jurisdiction_code,s.route_type,
  case when coalesce(s.attributes->>'Z_LEVEL',s.attributes->>'ELEMENTLEV','')~'^-?[0-9]+$'
    then coalesce(s.attributes->>'Z_LEVEL',s.attributes->>'ELEMENTLEV')::integer end,
  'end'::text,s.ctl_end,extensions.st_endpoint(s.geom)
from tmp_issue97_oh_valid_segments s;
create index tmp_issue97_oh_endpoints_measure_idx
  on tmp_issue97_oh_endpoints(nlf_id,jurisdiction_code,route_type,source_measure);
create index tmp_issue97_oh_endpoints_geog_idx
  on tmp_issue97_oh_endpoints using gist((geom::extensions.geography));
analyze tmp_issue97_oh_endpoints;

create temporary table tmp_issue97_oh_endpoint_edges(
  left_id text not null,
  right_id text not null,
  primary key(left_id,right_id)
) on commit drop;

-- Both endpoint measures exist: retain the original <= 0.001 CTL + <= 0.75 m
-- physical endpoint rule. The indexed measure range removes the quadratic scan.
insert into tmp_issue97_oh_endpoint_edges(left_id,right_id)
select distinct least(a.roadway_inventory_id,b.roadway_inventory_id),
  greatest(a.roadway_inventory_id,b.roadway_inventory_id)
from tmp_issue97_oh_endpoints a
join tmp_issue97_oh_endpoints b
  on a.roadway_inventory_id<b.roadway_inventory_id
 and a.nlf_id=b.nlf_id
 and coalesce(a.jurisdiction_code,'?')=coalesce(b.jurisdiction_code,'?')
 and coalesce(a.route_type,'?')=coalesce(b.route_type,'?')
 and a.source_measure is not null
 and b.source_measure between a.source_measure-0.001 and a.source_measure+0.001
where (a.z_level is null or b.z_level is null or a.z_level=b.z_level)
  and extensions.st_dwithin(
    a.geom::extensions.geography,b.geom::extensions.geography,0.75
  );

-- If either endpoint lacks CTL, retain the original exact <= 0.03 m fallback.
-- The tiny bbox is only an indexed coarse superset; ST_DWithin remains decisive.
insert into tmp_issue97_oh_endpoint_edges(left_id,right_id)
select distinct least(a.roadway_inventory_id,b.roadway_inventory_id),
  greatest(a.roadway_inventory_id,b.roadway_inventory_id)
from tmp_issue97_oh_endpoints a
join tmp_issue97_oh_endpoints b
  on a.roadway_inventory_id<b.roadway_inventory_id
 and a.nlf_id=b.nlf_id
 and coalesce(a.jurisdiction_code,'?')=coalesce(b.jurisdiction_code,'?')
 and coalesce(a.route_type,'?')=coalesce(b.route_type,'?')
 and (a.source_measure is null or b.source_measure is null)
 and a.geom OPERATOR(extensions.&&) extensions.st_expand(b.geom,0.000002)
where (a.z_level is null or b.z_level is null or a.z_level=b.z_level)
  and extensions.st_dwithin(
    a.geom::extensions.geography,b.geom::extensions.geography,0.03
  )
on conflict do nothing;
create index tmp_issue97_oh_endpoint_edges_left_idx on tmp_issue97_oh_endpoint_edges(left_id);
create index tmp_issue97_oh_endpoint_edges_right_idx on tmp_issue97_oh_endpoint_edges(right_id);
analyze tmp_issue97_oh_endpoint_edges;

create temporary table tmp_issue97_oh_component_labels on commit drop as
with recursive directed_edges as (
  select left_id as from_id,right_id as to_id from tmp_issue97_oh_endpoint_edges
  union all
  select right_id,left_id from tmp_issue97_oh_endpoint_edges
), component_walk(root_id,member_id) as (
  select roadway_inventory_id,roadway_inventory_id from tmp_issue97_oh_valid_segments
  union
  select w.root_id,e.to_id
  from component_walk w join directed_edges e on e.from_id=w.member_id
)
select member_id,min(root_id) as component_seed
from component_walk group by member_id;
create unique index tmp_issue97_oh_component_labels_member_idx
  on tmp_issue97_oh_component_labels(member_id);
analyze tmp_issue97_oh_component_labels;

create temporary table tmp_issue97_oh_component_segments on commit drop as
with components as (
  select s.*,
    dense_rank() over(partition by s.county_code,s.nlf_id order by l.component_seed)::integer as component_number,
    l.component_seed
  from tmp_issue97_oh_valid_segments s
  join tmp_issue97_oh_component_labels l on l.member_id=s.roadway_inventory_id
), missing_geometry as (
  select c.*,null::integer as component_number,c.roadway_inventory_id as component_seed
  from public.brinesearch_odot_road_catalog c
  join public.brinesearch_road_graph_counties gc
    on gc.state_code='OH' and gc.source_county_code=c.county_code and gc.active
  where c.source_active and c.nlf_id is not null and (
      c.geom is null or extensions.st_isempty(c.geom) or not extensions.st_isvalid(c.geom)
      or not extensions.st_issimple(c.geom) or extensions.st_dimension(c.geom)<>1
      or not extensions.st_coveredby(c.geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
    )
    and (v_county is null or c.county_code=v_county)
), unassigned_source_records as (
  select c.*,null::integer as component_number,c.roadway_inventory_id as component_seed
  from public.brinesearch_odot_road_catalog c
  join public.brinesearch_road_graph_counties gc
    on gc.state_code='OH' and gc.source_county_code=c.county_code and gc.active
  where c.source_active and c.nlf_id is null
    and (v_county is null or c.county_code=v_county)
), all_segments as (
  select * from components
  union all select * from missing_geometry
  union all select * from unassigned_source_records
), component_counts as (
  select county_code,nlf_id,count(distinct component_seed)::integer as component_count
  from all_segments group by county_code,nlf_id
)
select x.*,
  case when x.nlf_id is null then 'OH:ODOT:UNASSIGNED:'||x.roadway_inventory_id
    when cc.component_count=1 then 'OH:ODOT:NLF:'||x.nlf_id
    else 'OH:ODOT:NLF:'||x.nlf_id||':COMP:'||x.component_seed end as component_identity_key,
  private_verification.brinesearch_issue97_uuid(
    case when x.nlf_id is null then 'OH:ODOT:UNASSIGNED:'||x.roadway_inventory_id
      when cc.component_count=1 then 'OH:ODOT:NLF:'||x.nlf_id
      else 'OH:ODOT:NLF:'||x.nlf_id||':COMP:'||x.component_seed end
  ) as component_identity_id
from all_segments x
join component_counts cc on cc.county_code=x.county_code and cc.nlf_id is not distinct from x.nlf_id;
$replacement$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_oh_identities(text)'::pg_catalog.regprocedure
  ) into v_definition;
  v_start:=pg_catalog.strpos(v_definition,
    'drop table if exists pg_temp.tmp_issue97_oh_component_segments;');
  v_finish:=pg_catalog.strpos(v_definition,
    'create index tmp_issue97_oh_component_segments_identity_idx');
  if v_start=0 or v_finish=0 or v_finish<=v_start then
    raise exception 'Issue #97 Ohio identity component block changed unexpectedly';
  end if;
  v_definition:=pg_catalog.substr(v_definition,1,v_start-1)
    ||v_replacement||pg_catalog.substr(v_definition,v_finish);
  execute v_definition;
end
$issue97_patch_oh_components$;

revoke all on function public.brinesearch_issue97_refresh_oh_identities(text)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_refresh_oh_identities(text)
to service_role;

comment on function public.brinesearch_issue97_refresh_oh_identities(text) is
  'Issue #97 Ohio authoritative identity refresh. NLF connected components use indexed endpoint candidates with the original CTL/physical-distance/Z-level rules, avoiding quadratic all-segment pair scans; names remain excluded from identity construction.';
