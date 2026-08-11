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

create or replace function private_verification.brinesearch_issue69_point(p_coordinate jsonb)
returns extensions.geometry
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_lng double precision;
  v_lat double precision;
begin
  if p_coordinate is null
     or pg_catalog.jsonb_typeof(p_coordinate) <> 'array'
     or pg_catalog.jsonb_array_length(p_coordinate) < 2 then
    raise exception 'Coordinate must be [longitude, latitude]';
  end if;
  begin
    v_lng := (p_coordinate->>0)::double precision;
    v_lat := (p_coordinate->>1)::double precision;
  exception when others then
    raise exception 'Coordinate must contain numeric longitude and latitude';
  end;
  if v_lng not between -180 and 180 or v_lat not between -90 and 90 then
    raise exception 'Coordinate is outside valid longitude/latitude bounds';
  end if;
  return extensions.st_setsrid(extensions.st_makepoint(v_lng,v_lat),4326);
end;
$$;

revoke all on function private_verification.brinesearch_issue69_point(jsonb)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue69_point(jsonb)
to service_role;

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
begin
  if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access is required to snap route geometry' using errcode='42501';
  end if;
  select r.* into v_road from public.brinesearch_roads r where r.id=p_road_id;
  if not found or coalesce(v_road.candidate_only,false) then
    raise exception 'Road Manager road is not publishable';
  end if;
  if v_road.centerline_geojson is null then
    return jsonb_build_object('resolved',false,'reason','road_geometry_missing','road_id',p_road_id);
  end if;
  begin
    v_master:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_road.centerline_geojson::text),4326);
  exception when others then
    return jsonb_build_object('resolved',false,'reason','road_geometry_invalid','road_id',p_road_id);
  end;
  if extensions.st_isempty(v_master)
     or extensions.geometrytype(v_master) not in ('LINESTRING','MULTILINESTRING') then
    return jsonb_build_object('resolved',false,'reason','road_geometry_invalid','road_id',p_road_id);
  end if;
  v_near:=private_verification.brinesearch_issue69_point(p_near_coordinate);
  v_snapped:=extensions.st_closestpoint(v_master,v_near);
  v_distance_m:=extensions.st_distance(v_near::extensions.geography,v_snapped::extensions.geography);
  if v_distance_m>50 then
    return jsonb_build_object(
      'resolved',false,'reason','tap_too_far_from_road','road_id',p_road_id,
      'distance_m',round(v_distance_m::numeric,2)
    );
  end if;
  return jsonb_build_object(
    'resolved',true,
    'road_id',p_road_id,
    'road_name',v_road.canonical_name,
    'coordinate',jsonb_build_array(extensions.st_x(v_snapped),extensions.st_y(v_snapped)),
    'distance_m',round(v_distance_m::numeric,2),
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
  v_limit integer:=greatest(1,least(coalesce(p_limit,8),20));
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
  if v_left.centerline_geojson is null or v_right.centerline_geojson is null then
    return jsonb_build_object(
      'resolved',false,'reason','road_geometry_missing',
      'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,'candidates','[]'::jsonb
    );
  end if;
  begin
    v_left_geom:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_left.centerline_geojson::text),4326);
    v_right_geom:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_right.centerline_geojson::text),4326);
  exception when others then
    return jsonb_build_object(
      'resolved',false,'reason','road_geometry_invalid',
      'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,'candidates','[]'::jsonb
    );
  end;
  if p_near_coordinate is not null then
    v_near:=private_verification.brinesearch_issue69_point(p_near_coordinate);
  end if;

  -- Consecutive occurrences of the same road are deliberately not collapsed.
  -- The Owner's tap defines the explicit split point, projected onto that road.
  if p_left_road_id=p_right_road_id then
    if v_near is null then
      return jsonb_build_object(
        'resolved',false,'reason','same_road_split_requires_explicit_point',
        'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,'candidates','[]'::jsonb
      );
    end if;
    declare
      v_split extensions.geometry:=extensions.st_closestpoint(v_left_geom,v_near);
      v_distance double precision:=extensions.st_distance(v_near::extensions.geography,v_split::extensions.geography);
    begin
      if v_distance>50 then
        return jsonb_build_object(
          'resolved',false,'reason','tap_too_far_from_same_road',
          'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,
          'distance_m',round(v_distance::numeric,2),'candidates','[]'::jsonb
        );
      end if;
      v_candidates:=jsonb_build_array(jsonb_build_object(
        'coordinate',jsonb_build_array(extensions.st_x(v_split),extensions.st_y(v_split)),
        'kind','same_road_explicit_split','distance_to_tap_m',round(v_distance::numeric,2)
      ));
      return jsonb_build_object(
        'resolved',true,'ambiguous',false,'same_road',true,
        'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,
        'candidates',v_candidates
      );
    end;
  end if;

  -- Different roads: a crossing alone is insufficient. Match stored vertices on
  -- both Road Manager centerlines within the same 1 m tolerance enforced by the
  -- canonical publisher. This avoids bridge/overpass crossings being invented as
  -- intersections merely because two lines geometrically cross.
  with left_points as (
    select (dp).geom as geom from extensions.st_dumppoints(v_left_geom) dp
  ), right_points as (
    select (dp).geom as geom from extensions.st_dumppoints(v_right_geom) dp
  ), grouped as (
    select
      extensions.st_x(l.geom) as lng,
      extensions.st_y(l.geom) as lat,
      min(extensions.st_distance(l.geom::extensions.geography,r.geom::extensions.geography)) as node_gap_m,
      case when v_near is null then null::double precision
           else min(extensions.st_distance(l.geom::extensions.geography,v_near::extensions.geography)) end as near_m
    from left_points l
    join right_points r
      on extensions.st_dwithin(l.geom::extensions.geography,r.geom::extensions.geography,1)
    group by extensions.st_x(l.geom),extensions.st_y(l.geom)
  ), ranked as (
    select * from grouped
    order by near_m asc nulls last,node_gap_m asc,lng,lat
    limit v_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'coordinate',jsonb_build_array(lng,lat),
      'kind','shared_road_manager_node',
      'node_gap_m',round(node_gap_m::numeric,3),
      'distance_to_tap_m',case when near_m is null then null else round(near_m::numeric,2) end
    ) order by near_m asc nulls last,node_gap_m asc),'[]'::jsonb),
    count(*)
  into v_candidates,v_count
  from ranked;

  return jsonb_build_object(
    'resolved',v_count>0,
    'ambiguous',v_count>1,
    'same_road',false,
    'reason',case when v_count=0 then 'no_shared_road_manager_node' else null end,
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
begin
  if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access is required to clip route geometry' using errcode='42501';
  end if;
  select r.* into v_road from public.brinesearch_roads r where r.id=p_road_id;
  if not found or coalesce(v_road.candidate_only,false) then raise exception 'Road Manager road is not publishable'; end if;
  if v_road.centerline_geojson is null then
    return jsonb_build_object('resolved',false,'reason','road_geometry_missing','road_id',p_road_id);
  end if;
  begin
    v_master:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_road.centerline_geojson::text),4326);
  exception when others then
    return jsonb_build_object('resolved',false,'reason','road_geometry_invalid','road_id',p_road_id);
  end;
  v_start:=private_verification.brinesearch_issue69_point(p_start_coordinate);
  v_end:=private_verification.brinesearch_issue69_point(p_end_coordinate);

  -- Choose one continuous Road Manager component that supports BOTH boundaries.
  -- Never bridge disconnected pieces of a road merely because the name/road ID is
  -- the same.
  select d.geom into v_line
  from (
    select (dumped).geom
    from (
      select extensions.st_dump(extensions.st_linemerge(v_master)) as dumped
    ) q
  ) d
  where extensions.geometrytype(d.geom)='LINESTRING'
    and extensions.st_dwithin(d.geom::extensions.geography,v_start::extensions.geography,5)
    and extensions.st_dwithin(d.geom::extensions.geography,v_end::extensions.geography,5)
  order by
    extensions.st_distance(d.geom::extensions.geography,v_start::extensions.geography)
    + extensions.st_distance(d.geom::extensions.geography,v_end::extensions.geography)
  limit 1;

  if v_line is null then
    return jsonb_build_object(
      'resolved',false,'reason','boundaries_not_on_one_continuous_road_component','road_id',p_road_id
    );
  end if;

  v_start_snap:=extensions.st_closestpoint(v_line,v_start);
  v_end_snap:=extensions.st_closestpoint(v_line,v_end);
  v_start_distance:=extensions.st_distance(v_start::extensions.geography,v_start_snap::extensions.geography);
  v_end_distance:=extensions.st_distance(v_end::extensions.geography,v_end_snap::extensions.geography);
  if v_start_distance>5 or v_end_distance>5 then
    return jsonb_build_object(
      'resolved',false,'reason','boundary_too_far_from_road','road_id',p_road_id,
      'start_distance_m',round(v_start_distance::numeric,2),
      'end_distance_m',round(v_end_distance::numeric,2)
    );
  end if;

  v_start_fraction:=extensions.st_linelocatepoint(v_line,v_start_snap);
  v_end_fraction:=extensions.st_linelocatepoint(v_line,v_end_snap);
  if abs(v_start_fraction-v_end_fraction)<1e-12 then
    return jsonb_build_object('resolved',false,'reason','zero_length_step','road_id',p_road_id);
  end if;
  if v_start_fraction<v_end_fraction then
    v_clip:=extensions.st_linesubstring(v_line,v_start_fraction,v_end_fraction);
  else
    v_clip:=extensions.st_reverse(extensions.st_linesubstring(v_line,v_end_fraction,v_start_fraction));
  end if;
  if v_clip is null or extensions.st_isempty(v_clip) or extensions.st_npoints(v_clip)<2 then
    return jsonb_build_object('resolved',false,'reason','clip_failed','road_id',p_road_id);
  end if;
  v_miles:=round((extensions.st_length(v_clip::extensions.geography)/1609.344)::numeric,6);
  if v_miles<=0 then return jsonb_build_object('resolved',false,'reason','zero_length_step','road_id',p_road_id); end if;

  return jsonb_build_object(
    'resolved',true,
    'road_id',p_road_id,
    'road_name',v_road.canonical_name,
    'aliases',to_jsonb(coalesce(v_road.aliases,'{}'::text[])),
    'start_coordinate',jsonb_build_array(extensions.st_x(extensions.st_startpoint(v_clip)),extensions.st_y(extensions.st_startpoint(v_clip))),
    'end_coordinate',jsonb_build_array(extensions.st_x(extensions.st_endpoint(v_clip)),extensions.st_y(extensions.st_endpoint(v_clip))),
    'clipped_geometry',extensions.st_asgeojson(v_clip,9)::jsonb,
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
  'Issue #69 owner helper. Clips one continuous Road Manager line component between two explicit boundaries and derives mileage; never chooses a road or occurrence by name.';
