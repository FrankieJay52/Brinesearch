-- GitHub #69 — no-guess draft geometry helpers.
--
-- These owner-only helpers do NOT publish a route. They provide the browser with
-- spatially grounded boundary candidates and clipping operations so the final
-- brinesearch_publish_structured_route RPC can remain the atomic validation and
-- publication boundary.
--
-- Important: road-name similarity is intentionally absent. Inputs are Road
-- Manager road IDs + explicit map coordinates. Different-road boundaries come
-- only from stored Road Manager vertices that are within 1 meter on both roads.
-- All functions remain SECURITY INVOKER and do not require access to the private
-- verification schema.

create or replace function public.brinesearch_route_step_snap_point(
  p_road_id uuid,
  p_near_coordinate jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_road record;
  v_master extensions.geometry;
  v_near extensions.geometry;
  v_snapped extensions.geometry;
  v_distance_m double precision;
  v_lng double precision;
  v_lat double precision;
begin
  if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access is required to snap route geometry' using errcode='42501';
  end if;
  if p_near_coordinate is null
     or pg_catalog.jsonb_typeof(p_near_coordinate) <> 'array'
     or pg_catalog.jsonb_array_length(p_near_coordinate) < 2 then
    raise exception 'Coordinate must be [longitude, latitude]';
  end if;
  begin
    v_lng := (p_near_coordinate->>0)::double precision;
    v_lat := (p_near_coordinate->>1)::double precision;
  exception when others then
    raise exception 'Coordinate must contain numeric longitude and latitude';
  end;
  if v_lng not between -180 and 180 or v_lat not between -90 and 90 then
    raise exception 'Coordinate is outside valid longitude/latitude bounds';
  end if;
  v_near:=extensions.st_setsrid(extensions.st_makepoint(v_lng,v_lat),4326);

  select r.* into v_road from public.brinesearch_roads r where r.id=p_road_id;
  if not found or coalesce(v_road.candidate_only,false) then
    raise exception 'Road Manager road is not publishable';
  end if;
  if coalesce(v_road.geometry_status,'') not in (
    'official_centerline_loaded','field_confirmed_centerline','owner_verified_complete'
  ) then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','road_geometry_not_complete','road_id',p_road_id
    );
  end if;
  if v_road.centerline_geojson is null then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','road_geometry_missing','road_id',p_road_id);
  end if;
  begin
    v_master:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_road.centerline_geojson::text),4326);
  exception when others then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','road_geometry_invalid','road_id',p_road_id);
  end;
  if extensions.st_isempty(v_master)
     or extensions.geometrytype(v_master) not in ('LINESTRING','MULTILINESTRING')
     or not extensions.st_isvalid(v_master)
     or not extensions.st_coveredby(v_master,extensions.st_makeenvelope(-180,-90,180,90,4326)) then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','road_geometry_invalid','road_id',p_road_id);
  end if;
  v_snapped:=extensions.st_closestpoint(v_master,v_near);
  v_distance_m:=extensions.st_distance(v_near::extensions.geography,v_snapped::extensions.geography);
  if v_distance_m>50 then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','tap_too_far_from_road','road_id',p_road_id,
      'distance_m',pg_catalog.round(v_distance_m::numeric,2)
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'resolved',true,
    'road_id',p_road_id,
    'road_name',v_road.canonical_name,
    'coordinate',pg_catalog.jsonb_build_array(extensions.st_x(v_snapped),extensions.st_y(v_snapped)),
    'distance_m',pg_catalog.round(v_distance_m::numeric,2),
    'geometry_source','road_manager_centerline_issue69'
  );
end;
$$;

revoke all on function public.brinesearch_route_step_snap_point(uuid,jsonb) from public,anon;
grant execute on function public.brinesearch_route_step_snap_point(uuid,jsonb) to authenticated;

comment on function public.brinesearch_route_step_snap_point(uuid,jsonb) is
  'Issue #69 owner helper. Snaps an explicit map tap to one Road Manager road; never chooses a road by name.';

create or replace function public.brinesearch_route_step_boundary_candidates(
  p_left_road_id uuid,
  p_right_road_id uuid,
  p_near_coordinate jsonb default null,
  p_limit integer default 8
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_left record;
  v_right record;
  v_left_geom extensions.geometry;
  v_right_geom extensions.geometry;
  v_near extensions.geometry:=null;
  v_candidates jsonb:='[]'::jsonb;
  v_count integer:=0;
  v_all_count integer:=0;
  v_limit integer:=greatest(1,least(coalesce(p_limit,8),20));
  v_lng double precision;
  v_lat double precision;
  v_split extensions.geometry;
  v_distance double precision;
begin
  if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access is required to resolve route intersections' using errcode='42501';
  end if;
  select r.* into v_left from public.brinesearch_roads r where r.id=p_left_road_id;
  select r.* into v_right from public.brinesearch_roads r where r.id=p_right_road_id;
  if v_left.id is null or v_right.id is null then raise exception 'Road Manager road not found'; end if;
  if coalesce(v_left.candidate_only,false) or coalesce(v_right.candidate_only,false) then
    raise exception 'Candidate-only roads cannot define a published route boundary';
  end if;
  if coalesce(v_left.geometry_status,'') not in (
       'official_centerline_loaded','field_confirmed_centerline','owner_verified_complete'
     ) or coalesce(v_right.geometry_status,'') not in (
       'official_centerline_loaded','field_confirmed_centerline','owner_verified_complete'
     ) then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','road_geometry_not_complete',
      'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,'candidates','[]'::jsonb
    );
  end if;
  if v_left.centerline_geojson is null or v_right.centerline_geojson is null then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','road_geometry_missing',
      'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,'candidates','[]'::jsonb
    );
  end if;
  begin
    v_left_geom:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_left.centerline_geojson::text),4326);
    v_right_geom:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_right.centerline_geojson::text),4326);
  exception when others then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','road_geometry_invalid',
      'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,'candidates','[]'::jsonb
    );
  end;
  if extensions.st_isempty(v_left_geom) or extensions.st_isempty(v_right_geom)
     or extensions.geometrytype(v_left_geom) not in ('LINESTRING','MULTILINESTRING')
     or extensions.geometrytype(v_right_geom) not in ('LINESTRING','MULTILINESTRING')
     or not extensions.st_isvalid(v_left_geom) or not extensions.st_isvalid(v_right_geom)
     or not extensions.st_coveredby(v_left_geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
     or not extensions.st_coveredby(v_right_geom,extensions.st_makeenvelope(-180,-90,180,90,4326)) then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','road_geometry_invalid',
      'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,'candidates','[]'::jsonb
    );
  end if;

  if p_near_coordinate is not null then
    if pg_catalog.jsonb_typeof(p_near_coordinate) <> 'array'
       or pg_catalog.jsonb_array_length(p_near_coordinate) < 2 then
      raise exception 'Coordinate must be [longitude, latitude]';
    end if;
    begin
      v_lng := (p_near_coordinate->>0)::double precision;
      v_lat := (p_near_coordinate->>1)::double precision;
    exception when others then
      raise exception 'Coordinate must contain numeric longitude and latitude';
    end;
    if v_lng not between -180 and 180 or v_lat not between -90 and 90 then
      raise exception 'Coordinate is outside valid longitude/latitude bounds';
    end if;
    v_near:=extensions.st_setsrid(extensions.st_makepoint(v_lng,v_lat),4326);
  end if;

  -- Consecutive occurrences of the same Road Manager road are separate route
  -- occurrences. The Owner must explicitly choose their split point.
  if p_left_road_id=p_right_road_id then
    if v_near is null then
      return pg_catalog.jsonb_build_object(
        'resolved',false,'reason','same_road_split_requires_explicit_point',
        'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,'candidates','[]'::jsonb
      );
    end if;
    v_split:=extensions.st_closestpoint(v_left_geom,v_near);
    v_distance:=extensions.st_distance(v_near::extensions.geography,v_split::extensions.geography);
    if v_distance>50 then
      return pg_catalog.jsonb_build_object(
        'resolved',false,'reason','tap_too_far_from_same_road',
        'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,
        'distance_m',pg_catalog.round(v_distance::numeric,2),'candidates','[]'::jsonb
      );
    end if;
    v_candidates:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'coordinate',pg_catalog.jsonb_build_array(extensions.st_x(v_split),extensions.st_y(v_split)),
      'kind','same_road_explicit_split','distance_to_tap_m',pg_catalog.round(v_distance::numeric,2)
    ));
    return pg_catalog.jsonb_build_object(
      'resolved',true,'ambiguous',false,'same_road',true,
      'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,
      'candidates',v_candidates
    );
  end if;

  -- Different roads: a geometric crossing alone is insufficient. At least one
  -- stored vertex on EACH Road Manager centerline must be within 1 meter. The
  -- common boundary is the left-road vertex; the clip helper preserves that
  -- exact shared coordinate on both adjacent step geometries while requiring it
  -- to remain inside the same 1 m publisher tolerance on the right road.
  with left_points as (
    select (dp).geom as geom from extensions.st_dumppoints(v_left_geom) dp
  ), right_points as (
    select (dp).geom as geom from extensions.st_dumppoints(v_right_geom) dp
  ), grouped as (
    select
      extensions.st_x(l.geom) as lng,
      extensions.st_y(l.geom) as lat,
      pg_catalog.min(extensions.st_distance(l.geom::extensions.geography,r.geom::extensions.geography)) as node_gap_m,
      case when v_near is null then null::double precision
           else pg_catalog.min(extensions.st_distance(l.geom::extensions.geography,v_near::extensions.geography)) end as near_m
    from left_points l
    join right_points r
      on extensions.st_dwithin(l.geom::extensions.geography,r.geom::extensions.geography,1)
    group by extensions.st_x(l.geom),extensions.st_y(l.geom)
  )
  select
    pg_catalog.count(*) filter (where v_near is null or near_m<=50),
    pg_catalog.count(*)
  into v_count,v_all_count
  from grouped;

  with left_points as (
    select (dp).geom as geom from extensions.st_dumppoints(v_left_geom) dp
  ), right_points as (
    select (dp).geom as geom from extensions.st_dumppoints(v_right_geom) dp
  ), grouped as (
    select
      extensions.st_x(l.geom) as lng,
      extensions.st_y(l.geom) as lat,
      pg_catalog.min(extensions.st_distance(l.geom::extensions.geography,r.geom::extensions.geography)) as node_gap_m,
      case when v_near is null then null::double precision
           else pg_catalog.min(extensions.st_distance(l.geom::extensions.geography,v_near::extensions.geography)) end as near_m
    from left_points l
    join right_points r
      on extensions.st_dwithin(l.geom::extensions.geography,r.geom::extensions.geography,1)
    group by extensions.st_x(l.geom),extensions.st_y(l.geom)
  ), ranked as (
    select * from grouped
    where v_near is null or near_m<=50
    order by near_m asc nulls last,node_gap_m asc,lng,lat
    limit v_limit
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'coordinate',pg_catalog.jsonb_build_array(lng,lat),
      'kind','shared_road_manager_node',
      'node_gap_m',pg_catalog.round(node_gap_m::numeric,3),
      'distance_to_tap_m',case when near_m is null then null else pg_catalog.round(near_m::numeric,2) end
    ) order by near_m asc nulls last,node_gap_m asc),'[]'::jsonb)
  into v_candidates
  from ranked;

  return pg_catalog.jsonb_build_object(
    'resolved',v_count>0,
    'ambiguous',v_count>1,
    'same_road',false,
    'reason',case
      when v_count=0 and v_all_count>0 and v_near is not null then 'no_shared_road_manager_node_near_tap'
      when v_count=0 then 'no_shared_road_manager_node'
      else null
    end,
    'candidate_count',v_count,
    'candidates_truncated',v_count>pg_catalog.jsonb_array_length(v_candidates),
    'left_road_id',p_left_road_id,
    'right_road_id',p_right_road_id,
    'left_road_name',v_left.canonical_name,
    'right_road_name',v_right.canonical_name,
    'candidates',v_candidates
  );
end;
$$;

revoke all on function public.brinesearch_route_step_boundary_candidates(uuid,uuid,jsonb,integer) from public,anon;
grant execute on function public.brinesearch_route_step_boundary_candidates(uuid,uuid,jsonb,integer) to authenticated;

comment on function public.brinesearch_route_step_boundary_candidates(uuid,uuid,jsonb,integer) is
  'Issue #69 owner helper. Returns actual shared Road Manager node candidates for adjacent road IDs; same-road repeats require an explicit split tap.';

create or replace function public.brinesearch_route_step_clip(
  p_road_id uuid,
  p_start_coordinate jsonb,
  p_end_coordinate jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_road record;
  v_master extensions.geometry;
  v_start extensions.geometry;
  v_end extensions.geometry;
  v_line extensions.geometry;
  v_start_snap extensions.geometry;
  v_end_snap extensions.geometry;
  v_start_distance double precision;
  v_end_distance double precision;
  v_start_fraction double precision;
  v_end_fraction double precision;
  v_clip extensions.geometry;
  v_miles numeric;
  v_start_lng double precision;
  v_start_lat double precision;
  v_end_lng double precision;
  v_end_lat double precision;
  v_component_count integer:=0;
  v_clip_geojson jsonb;
begin
  if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access is required to clip route geometry' using errcode='42501';
  end if;

  if p_start_coordinate is null or pg_catalog.jsonb_typeof(p_start_coordinate) <> 'array'
     or pg_catalog.jsonb_array_length(p_start_coordinate) < 2
     or p_end_coordinate is null or pg_catalog.jsonb_typeof(p_end_coordinate) <> 'array'
     or pg_catalog.jsonb_array_length(p_end_coordinate) < 2 then
    raise exception 'Start and end coordinates must be [longitude, latitude]';
  end if;
  begin
    v_start_lng := (p_start_coordinate->>0)::double precision;
    v_start_lat := (p_start_coordinate->>1)::double precision;
    v_end_lng := (p_end_coordinate->>0)::double precision;
    v_end_lat := (p_end_coordinate->>1)::double precision;
  exception when others then
    raise exception 'Start and end coordinates must contain numeric longitude and latitude';
  end;
  if v_start_lng not between -180 and 180 or v_end_lng not between -180 and 180
     or v_start_lat not between -90 and 90 or v_end_lat not between -90 and 90 then
    raise exception 'Start or end coordinate is outside valid longitude/latitude bounds';
  end if;
  v_start:=extensions.st_setsrid(extensions.st_makepoint(v_start_lng,v_start_lat),4326);
  v_end:=extensions.st_setsrid(extensions.st_makepoint(v_end_lng,v_end_lat),4326);

  select r.* into v_road from public.brinesearch_roads r where r.id=p_road_id;
  if not found or coalesce(v_road.candidate_only,false) then
    raise exception 'Road Manager road is not publishable';
  end if;
  if coalesce(v_road.geometry_status,'') not in (
    'official_centerline_loaded','field_confirmed_centerline','owner_verified_complete'
  ) then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','road_geometry_not_complete','road_id',p_road_id
    );
  end if;
  if v_road.centerline_geojson is null then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','road_geometry_missing','road_id',p_road_id);
  end if;
  begin
    v_master:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_road.centerline_geojson::text),4326);
  exception when others then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','road_geometry_invalid','road_id',p_road_id);
  end;
  if extensions.st_isempty(v_master)
     or extensions.geometrytype(v_master) not in ('LINESTRING','MULTILINESTRING')
     or not extensions.st_isvalid(v_master)
     or not extensions.st_coveredby(v_master,extensions.st_makeenvelope(-180,-90,180,90,4326)) then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','road_geometry_invalid','road_id',p_road_id);
  end if;

  -- Choose one continuous Road Manager component that supports BOTH boundaries.
  -- Never bridge disconnected pieces of a road merely because they share one
  -- name/road record.
  select pg_catalog.count(*) into v_component_count
  from (
    select (dumped).geom
    from (
      select extensions.st_dump(extensions.st_linemerge(v_master)) as dumped
    ) q
  ) d
  where extensions.geometrytype(d.geom)='LINESTRING'
    and extensions.st_isvalid(d.geom)
    and extensions.st_issimple(d.geom)
    and extensions.st_dwithin(d.geom::extensions.geography,v_start::extensions.geography,1)
    and extensions.st_dwithin(d.geom::extensions.geography,v_end::extensions.geography,1);

  if v_component_count=0 then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','boundaries_not_on_one_continuous_road_component','road_id',p_road_id
    );
  end if;
  if v_component_count>1 then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','ambiguous_continuous_road_components','road_id',p_road_id,
      'component_count',v_component_count
    );
  end if;

  select d.geom into v_line
  from (
    select (dumped).geom
    from (
      select extensions.st_dump(extensions.st_linemerge(v_master)) as dumped
    ) q
  ) d
  where extensions.geometrytype(d.geom)='LINESTRING'
    and extensions.st_isvalid(d.geom)
    and extensions.st_issimple(d.geom)
    and extensions.st_dwithin(d.geom::extensions.geography,v_start::extensions.geography,1)
    and extensions.st_dwithin(d.geom::extensions.geography,v_end::extensions.geography,1);

  v_start_snap:=extensions.st_closestpoint(v_line,v_start);
  v_end_snap:=extensions.st_closestpoint(v_line,v_end);
  v_start_distance:=extensions.st_distance(v_start::extensions.geography,v_start_snap::extensions.geography);
  v_end_distance:=extensions.st_distance(v_end::extensions.geography,v_end_snap::extensions.geography);
  if v_start_distance>1 or v_end_distance>1 then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','boundary_outside_publisher_tolerance','road_id',p_road_id,
      'start_distance_m',pg_catalog.round(v_start_distance::numeric,3),
      'end_distance_m',pg_catalog.round(v_end_distance::numeric,3)
    );
  end if;

  v_start_fraction:=extensions.st_linelocatepoint(v_line,v_start_snap);
  v_end_fraction:=extensions.st_linelocatepoint(v_line,v_end_snap);
  if pg_catalog.abs(v_start_fraction-v_end_fraction)<1e-12 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','zero_length_step','road_id',p_road_id);
  end if;
  if v_start_fraction<v_end_fraction then
    v_clip:=extensions.st_linesubstring(v_line,v_start_fraction,v_end_fraction);
  else
    v_clip:=extensions.st_reverse(extensions.st_linesubstring(v_line,v_end_fraction,v_start_fraction));
  end if;
  if v_clip is null or extensions.st_isempty(v_clip) or extensions.st_npoints(v_clip)<2 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','clip_failed','road_id',p_road_id);
  end if;

  -- Preserve the exact shared boundary coordinate supplied by the topology
  -- resolver. For adjacent different roads this can be up to 1 m from one road's
  -- own stored vertex; using the SAME coordinate as both step endpoints is what
  -- makes route continuity exact. The canonical publisher independently checks
  -- the same 1 m Road Manager support buffer and stored-node rule.
  v_clip:=extensions.st_setpoint(v_clip,0,v_start);
  v_clip:=extensions.st_setpoint(v_clip,extensions.st_npoints(v_clip)-1,v_end);

  -- One 15-digit GeoJSON round trip defines the canonical coordinate precision.
  -- Boundary arrays, stored geometry and mileage are all derived from this same
  -- representation so interpolated anchors remain exactly equal after reload.
  begin
    v_clip_geojson:=extensions.st_asgeojson(v_clip,15)::jsonb;
    v_clip:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_clip_geojson::text),4326);
  exception when others then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','clip_precision_canonicalization_failed','road_id',p_road_id
    );
  end;

  if not extensions.st_isvalid(v_clip)
     or not extensions.st_issimple(v_clip)
     or extensions.st_equals(extensions.st_startpoint(v_clip),extensions.st_endpoint(v_clip))
     or not extensions.st_coveredby(
       v_clip,
       extensions.st_buffer(v_master::extensions.geography,1)::extensions.geometry
     ) then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','clip_outside_road_manager_support','road_id',p_road_id);
  end if;

  v_miles:=pg_catalog.round((extensions.st_length(v_clip::extensions.geography)/1609.344)::numeric,6);
  if v_miles<=0 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','zero_length_step','road_id',p_road_id);
  end if;

  return pg_catalog.jsonb_build_object(
    'resolved',true,
    'road_id',p_road_id,
    'road_name',v_road.canonical_name,
    'aliases',pg_catalog.to_jsonb(coalesce(v_road.aliases,'{}'::text[])),
    'start_coordinate',pg_catalog.jsonb_build_array(extensions.st_x(extensions.st_startpoint(v_clip)),extensions.st_y(extensions.st_startpoint(v_clip))),
    'end_coordinate',pg_catalog.jsonb_build_array(extensions.st_x(extensions.st_endpoint(v_clip)),extensions.st_y(extensions.st_endpoint(v_clip))),
    'clipped_geometry',v_clip_geojson,
    'miles',v_miles,
    'geometry_status','snapped_intersections',
    'geometry_source','road_manager_clip_issue69',
    'geometry_source_record_id',v_road.source_record_id
  );
end;
$$;

revoke all on function public.brinesearch_route_step_clip(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.brinesearch_route_step_clip(uuid,jsonb,jsonb) to authenticated;

comment on function public.brinesearch_route_step_clip(uuid,jsonb,jsonb) is
  'Issue #69 owner helper. Clips one continuous Road Manager line component between exact shared boundaries and derives mileage; never chooses a road or occurrence by name.';
