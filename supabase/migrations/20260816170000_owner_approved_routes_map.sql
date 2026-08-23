-- GitHub Issue #108 — Owner-only interactive Approved Routes Map.
-- First release is read-only. This migration creates no competing road identity or topology data.
-- Exact authoritative identity is the feature key; route-use is candidate evidence only.

create or replace function public.owner_approved_routes_map_viewport(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_zoom integer default 10,
  p_state text default null,
  p_county text default null,
  p_road_classes text[] default null,
  p_statuses text[] default null,
  p_search text default null,
  p_pad_id uuid default null,
  p_limit integer default 800
) returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_bbox extensions.geometry;
  v_limit integer := greatest(25,least(coalesce(p_limit,800),800));
  v_zoom integer := greatest(0,least(coalesce(p_zoom,10),19));
  v_tolerance double precision;
  v_result jsonb;
begin
  if not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'owner access required' using errcode='42501';
  end if;
  if p_west is null or p_south is null or p_east is null or p_north is null
     or p_west < -180 or p_east > 180 or p_south < -85.05112878 or p_north > 85.05112878
     or p_west >= p_east or p_south >= p_north then
    raise exception 'invalid map bounds' using errcode='22023';
  end if;
  if v_zoom < 8 then
    return pg_catalog.jsonb_build_object('type','FeatureCollection','features','[]'::jsonb,'pads','[]'::jsonb,'zoom_required',8,'truncated',false);
  end if;
  if (p_east-p_west) > (case when v_zoom>=12 then 1.2 else 3.5 end)
     or (p_north-p_south) > (case when v_zoom>=12 then 0.9 else 2.5 end) then
    raise exception 'map bounds too large for zoom level' using errcode='22023';
  end if;
  v_bbox := extensions.st_makeenvelope(p_west,p_south,p_east,p_north,4326);
  v_tolerance := case when v_zoom>=16 then 0 when v_zoom>=14 then 0.00001 when v_zoom>=12 then 0.00004 when v_zoom>=10 then 0.00012 else 0.0003 end;

  with odot_spatial as materialized (
    select c.roadway_inventory_id,c.county_code,c.geom
    from public.brinesearch_odot_road_catalog c
    where c.geom is not null and c.source_active
      and c.geom operator(extensions.&&) v_bbox
      and extensions.st_intersects(c.geom,v_bbox)
  ), spatial_segments as materialized (
    select a.identity_id,c.geom
    from odot_spatial c
    join public.brinesearch_road_graph_counties gc
      on gc.state_code='OH' and gc.source_county_code=c.county_code and gc.active
    join public.brinesearch_authoritative_segment_identity_assignments a
      on a.dataset_id=private_verification.brinesearch_issue97_uuid('dataset:oh_odot_tims_road_inventory')
     and a.source_segment_key='OH:ODOT:SEGMENT:'||c.roadway_inventory_id and a.active
    union all
    select s.identity_id,s.geom
    from public.brinesearch_authoritative_external_road_segments s
    where s.active and s.geom is not null
      and s.geom operator(extensions.&&) v_bbox
      and extensions.st_intersects(s.geom,v_bbox)
  ), spatial_ids as materialized (
    select distinct identity_id from spatial_segments
  ), base as materialized (
    select i.id,i.dataset_id,i.display_name,i.normalized_name,i.road_class,i.route_system,i.route_number,
      i.state_code,i.county_code,i.county_name,i.township,i.municipality,
      i.public_access_status,i.drivable_status,i.truck_status,i.source_identity_key,
      d.source_agency,d.source_dataset,d.source_version,
      private_verification.brinesearch_issue97_dataset_scope_current(i.dataset_id,i.state_code,i.county_code) as source_current
    from spatial_ids x
    join public.brinesearch_authoritative_road_identities i on i.id=x.identity_id and i.active
    join public.brinesearch_road_source_datasets d on d.id=i.dataset_id and d.active
    where (p_state is null or i.state_code=upper(p_state))
      and (p_county is null or i.county_code=upper(p_county) or i.county_name ilike '%'||p_county||'%')
      and (coalesce(pg_catalog.array_length(p_road_classes,1),0)=0 or i.road_class=any(p_road_classes))
      and (p_search is null or pg_catalog.btrim(p_search)='' or i.normalized_name % lower(pg_catalog.btrim(p_search))
           or i.display_name ilike '%'||pg_catalog.btrim(p_search)||'%'
           or pg_catalog.concat_ws(' ',i.route_system,i.route_number) ilike '%'||pg_catalog.btrim(p_search)||'%')
  ), canonical as materialized (
    select distinct on (m.identity_id) m.identity_id,r.id as road_id,r.canonical_name,
      r.low_bridge,r.weight_limit,r.construction,r.gate,r.narrow,r.steep_grade,r.one_lane,r.seasonal
    from base b
    join public.brinesearch_road_identity_mappings m on m.identity_id=b.id and m.mapping_status='verified'
    join public.brinesearch_roads r on r.id=m.road_id
    order by m.identity_id,m.verified_at desc nulls last,m.updated_at desc,m.id
  ), usage_rows as materialized (
    select m.identity_id,s.id as step_id,rp.pad_id
    from base b
    join public.brinesearch_road_identity_mappings m on m.identity_id=b.id and m.mapping_status='verified'
    join public.brinesearch_route_prep_steps s on s.road_id=m.road_id and s.active
    join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
    where p_pad_id is null or rp.pad_id=p_pad_id
  ), usage as materialized (
    select identity_id,count(distinct step_id)::integer occurrence_count,count(distinct pad_id)::integer pad_count
    from usage_rows group by identity_id
  ), classified as materialized (
    select b.*,c.road_id,c.canonical_name,coalesce(u.occurrence_count,0) as occurrence_count,coalesce(u.pad_count,0) as pad_count,
      case
        when not b.source_current then 'held'
        when lower(coalesce(b.public_access_status,'held')) in ('private','nonpublic','non_public','blocked','restricted','prohibited') then 'restricted'
        when lower(coalesce(b.drivable_status,'held')) in ('non_drivable','nondrivable','blocked','restricted','prohibited') then 'restricted'
        when coalesce(c.low_bridge,false) or coalesce(c.weight_limit,false) or coalesce(c.construction,false) or coalesce(c.gate,false) then 'restricted'
        when lower(coalesce(b.public_access_status,'held')) <> 'public' then 'held'
        when lower(coalesce(b.drivable_status,'held')) <> 'drivable' then 'held'
        when coalesce(c.narrow,false) or coalesce(c.steep_grade,false) or coalesce(c.one_lane,false) or coalesce(c.seasonal,false) then 'held'
        when b.road_class in ('interstate','us_route','state_route') then 'approved_by_policy'
        when b.truck_status='official_truck_route' then 'explicitly_approved'
        when coalesce(u.occurrence_count,0)>0 then 'candidate'
        else 'reference_only'
      end as approval_status
    from base b left join canonical c on c.identity_id=b.id left join usage u on u.identity_id=b.id
  ), picked as materialized (
    select * from classified c
    where c.source_current
      and (p_pad_id is null or c.occurrence_count>0)
      and (coalesce(pg_catalog.array_length(p_statuses,1),0)=0 or c.approval_status=any(p_statuses))
    order by case c.approval_status when 'restricted' then 1 when 'held' then 2 when 'explicitly_approved' then 3 when 'approved_by_policy' then 4 when 'candidate' then 5 else 6 end,
             c.display_name,c.id
    limit v_limit+1
  ), bounded as materialized (
    select * from picked limit v_limit
  ), features as materialized (
    select b.id,
      pg_catalog.jsonb_build_object(
        'type','Feature',
        'geometry',extensions.st_asgeojson(
          case when v_tolerance=0 then extensions.st_collect(extensions.st_intersection(s.geom,v_bbox))
               else extensions.st_simplifypreservetopology(extensions.st_collect(extensions.st_intersection(s.geom,v_bbox)),v_tolerance) end,6
        )::jsonb,
        'properties',pg_catalog.jsonb_build_object(
          'identity_id',b.id,'canonical_road_id',b.road_id,'display_name',b.display_name,'canonical_name',b.canonical_name,
          'route_designation',nullif(pg_catalog.concat_ws(' ',b.route_system,b.route_number),''),'road_class',b.road_class,
          'state_code',b.state_code,'county_code',b.county_code,'county_name',b.county_name,'township',b.township,'municipality',b.municipality,
          'approval_status',b.approval_status,'occurrence_count',b.occurrence_count,'pad_count',b.pad_count,
          'source_identity_key',b.source_identity_key,'source_agency',b.source_agency,'source_dataset',b.source_dataset,'source_version',b.source_version
        )
      ) as feature
    from bounded b join spatial_segments s on s.identity_id=b.id
    group by b.id,b.road_id,b.display_name,b.canonical_name,b.route_system,b.route_number,b.road_class,b.state_code,b.county_code,b.county_name,b.township,b.municipality,
      b.approval_status,b.occurrence_count,b.pad_count,b.source_identity_key,b.source_agency,b.source_dataset,b.source_version
  ), pad_markers as (
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('pad_id',p.id,'pad_name',p.pad_name,'company',p.company,'lat',p.lat,'lng',p.lng) order by p.company,p.pad_name),'[]'::jsonb) as rows
    from public.pads p where p_pad_id is not null and p.id=p_pad_id
  )
  select pg_catalog.jsonb_build_object(
    'type','FeatureCollection','features',coalesce((select pg_catalog.jsonb_agg(feature order by feature->'properties'->>'display_name') from features),'[]'::jsonb),
    'pads',(select rows from pad_markers),'truncated',(select count(*)>v_limit from picked),'limit',v_limit,'zoom',v_zoom
  ) into v_result;
  return v_result;
end
$$;

create or replace function public.owner_approved_routes_map_road_detail(p_identity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_result jsonb;
begin
  if not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'owner access required' using errcode='42501';
  end if;
  if p_identity_id is null then
    raise exception 'identity required' using errcode='22023';
  end if;

  with base as materialized (
    select i.*,d.source_agency,d.source_dataset,d.source_version,
      d.source_timestamp as dataset_source_timestamp,d.fetched_at as dataset_fetched_at,
      private_verification.brinesearch_issue97_dataset_scope_current(i.dataset_id,i.state_code,i.county_code) as source_current
    from public.brinesearch_authoritative_road_identities i
    join public.brinesearch_road_source_datasets d on d.id=i.dataset_id and d.active
    where i.id=p_identity_id and i.active
  ), canonical as materialized (
    select distinct on (m.identity_id) m.identity_id,r.*
    from public.brinesearch_road_identity_mappings m
    join public.brinesearch_roads r on r.id=m.road_id
    where m.identity_id=p_identity_id and m.mapping_status='verified'
    order by m.identity_id,m.verified_at desc nulls last,m.updated_at desc,m.id
  ), mapping_count as materialized (
    select count(distinct m.road_id)::integer verified_road_count
    from public.brinesearch_road_identity_mappings m
    where m.identity_id=p_identity_id and m.mapping_status='verified'
  ), geom_segments as materialized (
    select c.geom
    from public.brinesearch_authoritative_segment_identity_assignments a
    join public.brinesearch_odot_road_catalog c
      on a.source_segment_key='OH:ODOT:SEGMENT:'||c.roadway_inventory_id
     and c.source_active and c.geom is not null
    where a.identity_id=p_identity_id and a.active
    union all
    select s.geom
    from public.brinesearch_authoritative_external_road_segments s
    where s.identity_id=p_identity_id and s.active and s.geom is not null
  ), geom as materialized (
    select extensions.st_extent(s.geom) as extent,count(*)::integer as segment_count
    from geom_segments s
  ), aliases as materialized (
    select coalesce(pg_catalog.jsonb_agg(distinct n.road_name order by n.road_name),'[]'::jsonb) rows
    from public.brinesearch_authoritative_road_names n
    where n.identity_id=p_identity_id and n.active
      and (n.valid_from is null or n.valid_from<=pg_catalog.now())
      and (n.valid_to is null or n.valid_to>pg_catalog.now())
  ), pads_used as materialized (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'pad_id',x.pad_id,'pad_name',x.pad_name,'company',x.company,
          'occurrence_count',x.occurrence_count
        ) order by x.company,x.pad_name
      ),'[]'::jsonb
    ) rows,
      coalesce(sum(x.occurrence_count),0)::integer occurrence_count
    from (
      select rp.pad_id,rp.pad_name,rp.company,count(*)::integer occurrence_count
      from public.brinesearch_road_identity_mappings m
      join public.brinesearch_route_prep_steps s on s.road_id=m.road_id and s.active
      join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
      where m.identity_id=p_identity_id and m.mapping_status='verified'
      group by rp.pad_id,rp.pad_name,rp.company
    ) x
  ), current_build as materialized (
    select gb.*
    from base b
    join public.brinesearch_road_graph_builds gb
      on gb.state_code=b.state_code and gb.county_code=b.county_code and gb.status='active'
    where private_verification.brinesearch_issue97_graph_build_release_current(gb.id)
    order by gb.activated_at desc nulls last
    limit 1
  ), junction_base as materialized (
    select distinct j.id,j.display_id,j.geom
    from current_build gb
    join public.brinesearch_road_junctions j on j.build_id=gb.id
    join public.brinesearch_road_junction_memberships mine
      on mine.junction_id=j.id and mine.identity_id=p_identity_id
    where j.junction_type<>'shared_segment'
      and extensions.st_geometrytype(j.geom)='ST_Point'
  ), junction_count as materialized (
    select count(*)::integer total from junction_base
  ), junction_rows as materialized (
    select jb.id,jb.display_id,
      extensions.st_y(jb.geom)::double precision lat,
      extensions.st_x(jb.geom)::double precision lng,
      coalesce(connected.rows,'[]'::jsonb) connected_roads
    from (
      select * from junction_base order by display_id,id limit 100
    ) jb
    left join lateral (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'identity_id',x.identity_id,
          'display_name',x.display_name,
          'road_name_at_junction',x.road_name_at_junction,
          'route_system',x.route_system,
          'route_number',x.route_number,
          'route_designation',nullif(pg_catalog.concat_ws(' ',x.route_system,x.route_number),''),
          'road_class',x.road_class,
          'state_code',x.state_code,
          'county_code',x.county_code,
          'county_name',x.county_name,
          'township',x.township,
          'municipality',x.municipality,
          'source_identity_key',x.source_identity_key
        ) order by x.display_name,x.state_code,x.county_code,x.identity_id
      ) rows
      from (
        select distinct other.identity_id,
          oi.display_name,other.road_name_at_junction,
          oi.route_system,oi.route_number,oi.road_class,
          oi.state_code,oi.county_code,oi.county_name,oi.township,oi.municipality,
          oi.source_identity_key
        from public.brinesearch_road_junction_memberships other
        join public.brinesearch_authoritative_road_identities oi
          on oi.id=other.identity_id and oi.active
        where other.junction_id=jb.id and other.identity_id<>p_identity_id
      ) x
    ) connected on true
  ), junctions as materialized (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'junction_id',id,'display_id',display_id,'lat',lat,'lng',lng,
          'connected_roads',connected_roads
        ) order by display_id,id
      ),'[]'::jsonb
    ) rows
    from junction_rows
  ), classified as materialized (
    select b.*,c.id as road_id,c.canonical_name,mc.verified_road_count,
      c.low_bridge,c.weight_limit,c.construction,c.gate,
      c.narrow,c.steep_grade,c.one_lane,c.seasonal,
      coalesce(pu.occurrence_count,0) occurrence_count,
      case
        when pg_catalog.lower(coalesce(b.public_access_status,'held')) in ('private','nonpublic','non_public','blocked','restricted','prohibited') then 'restricted'
        when pg_catalog.lower(coalesce(b.drivable_status,'held')) in ('non_drivable','nondrivable','blocked','restricted','prohibited') then 'restricted'
        when coalesce(c.low_bridge,false) or coalesce(c.weight_limit,false)
          or coalesce(c.construction,false) or coalesce(c.gate,false) then 'restricted'
        when not b.source_current or g.segment_count=0 or mc.verified_road_count>1 then 'held'
        when pg_catalog.lower(coalesce(b.public_access_status,'held'))<>'public'
          or pg_catalog.lower(coalesce(b.drivable_status,'held'))<>'drivable' then 'held'
        when coalesce(c.narrow,false) or coalesce(c.steep_grade,false)
          or coalesce(c.one_lane,false) or coalesce(c.seasonal,false) then 'held'
        when b.road_class in ('interstate','us_route','state_route') and not (
          nullif(pg_catalog.btrim(b.route_number),'') is not null and (
            (b.road_class='interstate' and b.route_system in ('1','IR'))
            or (b.road_class='us_route' and b.route_system in ('2','US'))
            or (b.road_class='state_route' and b.route_system in ('3','SR','PennDOT NLF'))
          )
        ) then 'held'
        when nullif(pg_catalog.btrim(b.route_number),'') is not null and (
          (b.road_class='interstate' and b.route_system in ('1','IR'))
          or (b.road_class='us_route' and b.route_system in ('2','US'))
          or (b.road_class='state_route' and b.route_system in ('3','SR','PennDOT NLF'))
        ) then 'approved_by_policy'
        when b.road_class in ('county','township','municipal','local')
          and b.truck_status='official_truck_route' then 'explicitly_approved'
        when coalesce(pu.occurrence_count,0)>0 then 'candidate'
        else 'reference_only'
      end approval_status
    from base b
    left join canonical c on c.identity_id=b.id
    cross join pads_used pu
    cross join geom g
    cross join mapping_count mc
  )
  select pg_catalog.jsonb_build_object(
    'identity_id',c.id,'canonical_road_id',c.road_id,'display_name',c.display_name,'canonical_name',c.canonical_name,
    'source_identity_key',c.source_identity_key,'aliases',(select rows from aliases),
    'route_system',c.route_system,'route_number',c.route_number,
    'route_designation',nullif(pg_catalog.concat_ws(' ',c.route_system,c.route_number),''),'road_class',c.road_class,
    'state_code',c.state_code,'county_code',c.county_code,'county_name',c.county_name,'township',c.township,'municipality',c.municipality,
    'source_agency',c.source_agency,'source_dataset',c.source_dataset,'source_version',c.source_version,'source_record_ids',c.source_record_ids,
    'source_current',c.source_current,'approval_status',c.approval_status,
    'mapping_conflict',c.verified_road_count>1,
    'approval_basis',case c.approval_status
      when 'approved_by_policy' then 'Exact current structured Interstate/U.S./state route identity is approved by standing policy; exact restrictions override.'
      when 'explicitly_approved' then 'Exact current local identity has official_truck_route evidence.'
      when 'candidate' then 'Current saved route use exists, but exact positive truck approval is absent.'
      when 'restricted' then 'Exact access, drivable, or verified canonical restriction evidence overrides approval.'
      when 'held' then 'Exact identity, currentness, structured route identity, geometry, or safety state is unresolved or held.'
      else 'Controlled-source context only; this road is not approved.'
    end,
    'public_access_status',c.public_access_status,'drivable_status',c.drivable_status,'truck_status',c.truck_status,
    'restriction_summary',nullif(pg_catalog.concat_ws(', ',
      case when pg_catalog.lower(coalesce(c.public_access_status,'')) in ('private','nonpublic','non_public','blocked','restricted','prohibited') then 'private/nonpublic or prohibited' end,
      case when pg_catalog.lower(coalesce(c.drivable_status,'')) in ('non_drivable','nondrivable','blocked','restricted','prohibited') then 'non-drivable or prohibited' end,
      case when c.low_bridge then 'low bridge' end,case when c.weight_limit then 'weight restriction' end,
      case when c.construction then 'construction/closure' end,case when c.gate then 'gate/blocked' end,
      case when c.narrow then 'narrow road hold' end,case when c.steep_grade then 'steep grade hold' end,
      case when c.one_lane then 'one lane hold' end,case when c.seasonal then 'seasonal hold' end
    ),''),
    'hold_summary',nullif(pg_catalog.concat_ws(', ',
      case when not c.source_current then 'source scope is stale' end,
      case when g.segment_count=0 then 'exact geometry is unavailable' end,
      case when c.verified_road_count>1 then 'conflicting verified canonical mappings' end,
      case when c.road_class in ('interstate','us_route','state_route') and not (
        nullif(pg_catalog.btrim(c.route_number),'') is not null and (
          (c.road_class='interstate' and c.route_system in ('1','IR'))
          or (c.road_class='us_route' and c.route_system in ('2','US'))
          or (c.road_class='state_route' and c.route_system in ('3','SR','PennDOT NLF'))
        )
      ) then 'structured policy-route identity is incomplete or conflicting' end
    ),''),
    'geometry_status',case
      when g.segment_count=0 then 'held — exact geometry unavailable'
      when not c.source_current then 'held — source scope stale'
      else 'exact current authoritative geometry'
    end,
    'geometry_segment_count',g.segment_count,
    'bounds',case when g.extent is null then null else pg_catalog.jsonb_build_object('west',extensions.st_xmin(extensions.box3d(g.extent)),'south',extensions.st_ymin(extensions.box3d(g.extent)),'east',extensions.st_xmax(extensions.box3d(g.extent)),'north',extensions.st_ymax(extensions.box3d(g.extent))) end,
    'pads',(select rows from pads_used),
    'known_physical_junctions',(select total from junction_count),
    'junctions_truncated',(select total>100 from junction_count),
    'junctions',(select rows from junctions),
    'graph_summary',(select case when id is null then null else pg_catalog.concat('build ',id,' · ',algorithm_version,' · activated ',activated_at) end from current_build),
    'verification_date',greatest(c.last_seen_at,c.dataset_fetched_at,c.dataset_source_timestamp)
  ) into v_result from classified c cross join geom g;
  if v_result is null then
    raise exception 'road identity not found' using errcode='P0002';
  end if;
  return v_result;
end
$$;

create or replace function public.owner_approved_routes_map_pad_options()
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare v_result jsonb;
begin
  if not public.is_brinesearch_owner(auth.uid()) then raise exception 'owner access required' using errcode='42501'; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'pad_id',p.id,'pad_name',p.pad_name,'company',p.company,'state',p.state,
    'lat',p.latitude,'lng',p.longitude
  ) order by p.company,p.pad_name),'[]'::jsonb)
  into v_result from public.pads p where exists(select 1 from public.brinesearch_route_prep rp where rp.pad_id=p.id and rp.active);
  return v_result;
end
$$;

revoke all on function public.owner_approved_routes_map_viewport(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text,uuid,integer) from public, anon;
revoke all on function public.owner_approved_routes_map_road_detail(uuid) from public, anon;
revoke all on function public.owner_approved_routes_map_pad_options() from public, anon;
grant execute on function public.owner_approved_routes_map_viewport(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text,uuid,integer) to authenticated;
grant execute on function public.owner_approved_routes_map_road_detail(uuid) to authenticated;
grant execute on function public.owner_approved_routes_map_pad_options() to authenticated;

comment on function public.owner_approved_routes_map_viewport(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text,uuid,integer) is 'Issue #108 owner-only bounded read-only map viewport over exact current BrineSearch authoritative road identities.';
comment on function public.owner_approved_routes_map_road_detail(uuid) is 'Issue #108 owner-only sanitized exact road identity details, route-use evidence, and release-current junctions.';
comment on function public.owner_approved_routes_map_pad_options() is 'Issue #108 owner-only pad selector for read-only Approved Routes Map.';
