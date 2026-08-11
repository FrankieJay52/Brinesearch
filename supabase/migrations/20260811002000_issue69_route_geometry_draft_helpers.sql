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
     or not extensions.st_issimple(v_master)
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
     or not extensions.st_issimple(v_left_geom) or not extensions.st_issimple(v_right_geom)
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
     or not extensions.st_issimple(v_master)
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

-- ---------------------------------------------------------------------------
-- Canonical route revision, Road Manager geometry provenance and #81-safe
-- public driver-safety context.
-- ---------------------------------------------------------------------------

alter table public.pads
  add column if not exists structured_route_revision bigint not null default 0,
  add column if not exists driver_safety_context jsonb not null default '[]'::jsonb;

update public.pads p
set structured_route_revision=greatest(
  p.structured_route_revision,
  coalesce((
    select pg_catalog.max(pr.route_revision)
    from public.brinesearch_pad_roads pr
    where pr.pad_id=p.id and pr.route_group='primary' and pr.route_variant_index=0
  ),0),
  coalesce((
    select pg_catalog.max(case
      when step.value->>'route_revision' ~ '^[0-9]+$'
        then (step.value->>'route_revision')::bigint
      else 0 end)
    from pg_catalog.jsonb_array_elements(p.structured_route_steps) step(value)
  ),0)
)
where p.structured_route_revision is distinct from greatest(
  p.structured_route_revision,
  coalesce((
    select pg_catalog.max(pr.route_revision)
    from public.brinesearch_pad_roads pr
    where pr.pad_id=p.id and pr.route_group='primary' and pr.route_variant_index=0
  ),0),
  coalesce((
    select pg_catalog.max(case
      when step.value->>'route_revision' ~ '^[0-9]+$'
        then (step.value->>'route_revision')::bigint
      else 0 end)
    from pg_catalog.jsonb_array_elements(p.structured_route_steps) step(value)
  ),0)
);

alter table public.pads
  drop constraint if exists pads_structured_route_revision_nonnegative_issue69;
alter table public.pads
  add constraint pads_structured_route_revision_nonnegative_issue69
  check (structured_route_revision>=0);

alter table public.pads
  drop constraint if exists pads_driver_safety_context_array_issue69;
alter table public.pads
  add constraint pads_driver_safety_context_array_issue69
  check (pg_catalog.jsonb_typeof(driver_safety_context)='array');

alter table public.public_pad_detail
  add column if not exists driver_safety_context jsonb not null default '[]'::jsonb;
alter table public.public_pad_detail
  drop constraint if exists public_pad_detail_driver_safety_context_array_issue69;
alter table public.public_pad_detail
  add constraint public_pad_detail_driver_safety_context_array_issue69
  check (pg_catalog.jsonb_typeof(driver_safety_context)='array');

alter table public.brinesearch_pad_roads
  add column if not exists road_geometry_digest text,
  add column if not exists road_geometry_checked_at timestamptz,
  add column if not exists road_source_method text;
alter table public.brinesearch_route_review_segments
  add column if not exists road_geometry_digest text,
  add column if not exists road_geometry_checked_at timestamptz,
  add column if not exists road_source_method text;

alter table public.brinesearch_pad_roads
  drop constraint if exists brinesearch_pad_roads_geometry_provenance_issue69;
alter table public.brinesearch_pad_roads
  add constraint brinesearch_pad_roads_geometry_provenance_issue69
  check (
    geometry_version=0
    or (
      road_geometry_digest ~ '^[0-9a-f]{32}$'
      and nullif(pg_catalog.btrim(coalesce(geometry_source,'')),'') is not null
    )
  );

alter table public.brinesearch_route_review_segments
  drop constraint if exists brinesearch_route_segments_geometry_provenance_issue69;
alter table public.brinesearch_route_review_segments
  add constraint brinesearch_route_segments_geometry_provenance_issue69
  check (
    geometry_version=0
    or (
      road_geometry_digest ~ '^[0-9a-f]{32}$'
      and nullif(pg_catalog.btrim(coalesce(geometry_source,'')),'') is not null
    )
  );

create table if not exists private_verification.brinesearch_driver_safety_facts_issue69 (
  id uuid primary key default gen_random_uuid(),
  pad_id uuid not null references public.pads(id) on delete cascade,
  context_key text not null,
  route_step_id uuid,
  road_id uuid references public.brinesearch_roads(id) on delete restrict,
  display_order smallint not null default 0,
  category text not null check (category in (
    'curfew','route_restriction','truck_prohibition','cb_callout','unsigned_road',
    'narrow_road','one_lane','gate_access','weight_limit','speed_limit',
    'road_hazard','temporary_closure'
  )),
  direction_scope text not null default 'both'
    check (direction_scope in ('both','outbound','inbound','pad_access')),
  driver_text text not null,
  publication_status text not null default 'draft'
    check (publication_status in ('draft','private_hold','verified_public','retired')),
  effective_from date,
  effective_until date,
  source_kind text not null check (source_kind in (
    'existing_public_directions','owner_field_verification','operator_policy',
    'official_notice','verified_road_manager'
  )),
  source_record_id text not null,
  source_revision text not null,
  source_text_digest text not null,
  source_excerpt_digest text not null,
  verification_method text not null,
  verified_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint brinesearch_driver_safety_context_key_issue69 unique(pad_id,context_key),
  constraint brinesearch_driver_safety_occurrence_pair_issue69 check (
    (route_step_id is null and road_id is null)
    or (route_step_id is not null and road_id is not null)
  ),
  constraint brinesearch_driver_safety_text_issue69 check (
    pg_catalog.length(pg_catalog.btrim(driver_text)) between 3 and 300
    and driver_text=pg_catalog.btrim(driver_text)
    and driver_text !~ E'[\\r\\n]'
    and driver_text !~* 'https?://|www\\.'
    and driver_text !~* '^\\s*[0-9]+\\.\\s'
    and driver_text !~* '\\m[0-9]+(?:\\.[0-9]+)?\\s*(?:mi|mile|miles)\\M'
    and (
      driver_text !~* '\\m(?:turn|take|continue|merge)\\s+(?:left|right|straight|onto)\\M'
      or (
        category in ('route_restriction','truck_prohibition')
        and driver_text ~* '\\m(?:do not|must not|never|prohibited|restriction)\\M'
      )
    )
  ),
  constraint brinesearch_driver_safety_dates_issue69 check (
    effective_until is null or effective_from is null or effective_until>=effective_from
  ),
  constraint brinesearch_driver_safety_provenance_issue69 check (
    nullif(pg_catalog.btrim(source_record_id),'') is not null
    and nullif(pg_catalog.btrim(source_revision),'') is not null
    and source_text_digest ~ '^[0-9a-f]{64}$'
    and source_excerpt_digest ~ '^[0-9a-f]{64}$'
    and nullif(pg_catalog.btrim(verification_method),'') is not null
    and (publication_status<>'verified_public' or verified_at is not null)
  )
);

create index if not exists brinesearch_driver_safety_active_pad_issue69_idx
  on private_verification.brinesearch_driver_safety_facts_issue69(pad_id,display_order,id)
  where publication_status='verified_public';
create index if not exists brinesearch_driver_safety_route_step_issue69_idx
  on private_verification.brinesearch_driver_safety_facts_issue69(route_step_id)
  where route_step_id is not null;
create index if not exists brinesearch_driver_safety_road_issue69_idx
  on private_verification.brinesearch_driver_safety_facts_issue69(road_id)
  where road_id is not null;

alter table private_verification.brinesearch_driver_safety_facts_issue69 enable row level security;
alter table private_verification.brinesearch_driver_safety_facts_issue69 force row level security;
revoke all on private_verification.brinesearch_driver_safety_facts_issue69
from public,anon,authenticated;
grant select,insert,update,delete on private_verification.brinesearch_driver_safety_facts_issue69
to service_role;

comment on table private_verification.brinesearch_driver_safety_facts_issue69 is
  'Issue #69/#81 private canonical, category-allowlisted public driver-safety facts. Route notes/review evidence are never promoted automatically.';

create or replace function private_verification.brinesearch_sanitize_public_safety_context_issue69(
  p_context jsonb
)
returns jsonb
language sql
immutable
security invoker
set search_path=''
as $$
  select coalesce(
    private_verification.brinesearch_public_object_array_issue73(
      p_context,
      array[
        'safety_fact_id','category','driver_text','direction_scope',
        'route_step_id','road_id','effective_from','effective_until','source_revision'
      ]::text[]
    ),
    '[]'::jsonb
  )
$$;

revoke all on function
  private_verification.brinesearch_sanitize_public_safety_context_issue69(jsonb)
from public,anon,authenticated;
grant execute on function
  private_verification.brinesearch_sanitize_public_safety_context_issue69(jsonb)
to service_role;

create or replace function private_verification.brinesearch_sanitize_pad_snapshot_issue73()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.structured_route_steps:=
    private_verification.brinesearch_sanitize_public_route_steps_issue73(new.structured_route_steps);
  new.driver_safety_context:=
    private_verification.brinesearch_sanitize_public_safety_context_issue69(new.driver_safety_context);
  return new;
end;
$$;

revoke all on function private_verification.brinesearch_sanitize_pad_snapshot_issue73()
from public,anon,authenticated;
drop trigger if exists pads_sanitize_public_route_snapshot_issue73 on public.pads;
create trigger pads_sanitize_public_route_snapshot_issue73
before insert or update of structured_route_steps,driver_safety_context on public.pads
for each row execute function private_verification.brinesearch_sanitize_pad_snapshot_issue73();

create or replace view private_verification.public_pad_projection_source
with (security_invoker=true,security_barrier=true)
as
select
  p.id,p.legacy_id,p.record_number,p.company,p.state,p.pad_name,p.record_type,
  p.address,p.latitude,p.longitude,p.county,p.township,p.well_name,p.api,
  p.property_number,p.structured_road_sequence,p.written_directions,
  p.road_sequence_status,p.road_sequence_reviewed_date,
  p.road_sequence_final_cleanup_date,p.verification_status,p.operating_status,
  null::text as import_source,null::text as import_status,p.research_status,
  null::text as research_note,'[]'::jsonb as research_sources,p.research_date,
  p.list_only,null::text as research_method,null::text as research_notes,
  p.number_of_road_steps,'[]'::jsonb as source_workbook_rows,
  '[]'::jsonb as alternate_locations,null::text as last_updated_by,
  null::timestamptz as last_updated_date,null::text as audit_source,
  null::boolean as audit_verified,
  private_verification.brinesearch_sanitize_public_extra_data_issue73(p.extra_data) as extra_data,
  null::uuid as created_by,null::uuid as updated_by,p.created_at,p.updated_at,
  p.directions_clear,null::text as directions_clear_method,
  p.directions_clear_updated_at,null::uuid as directions_clear_updated_by,
  p.well_entries,
  private_verification.brinesearch_sanitize_public_route_steps_issue73(
    p.structured_route_steps
  ) as structured_route_steps,
  private_verification.brinesearch_sanitize_public_safety_context_issue69(
    p.driver_safety_context
  ) as driver_safety_context
from public.pads p;

revoke all on private_verification.public_pad_projection_source
from public,anon,authenticated;
grant select on private_verification.public_pad_projection_source to service_role;

create or replace function private_verification.brinesearch_sanitize_public_pad_detail_issue73()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.extra_data:=
    private_verification.brinesearch_sanitize_public_extra_data_issue73(new.extra_data);
  new.structured_route_steps:=
    private_verification.brinesearch_sanitize_public_route_steps_issue73(new.structured_route_steps);
  new.driver_safety_context:=
    private_verification.brinesearch_sanitize_public_safety_context_issue69(new.driver_safety_context);
  return new;
end;
$$;

revoke all on function private_verification.brinesearch_sanitize_public_pad_detail_issue73()
from public,anon,authenticated;
drop trigger if exists public_pad_detail_sanitize_route_notes_issue73
  on public.public_pad_detail;
create trigger public_pad_detail_sanitize_route_notes_issue73
before insert or update of extra_data,structured_route_steps,driver_safety_context
on public.public_pad_detail
for each row execute function
  private_verification.brinesearch_sanitize_public_pad_detail_issue73();

alter table public.pads
  drop constraint if exists pads_public_safety_snapshot_canonical_issue69;
alter table public.pads
  add constraint pads_public_safety_snapshot_canonical_issue69 check (
    driver_safety_context=
      private_verification.brinesearch_sanitize_public_safety_context_issue69(driver_safety_context)
  );
alter table public.public_pad_detail
  drop constraint if exists public_pad_detail_safety_snapshot_canonical_issue69;
alter table public.public_pad_detail
  add constraint public_pad_detail_safety_snapshot_canonical_issue69 check (
    driver_safety_context=
      private_verification.brinesearch_sanitize_public_safety_context_issue69(driver_safety_context)
  );

-- The authenticated legacy editor may maintain only unresolved version-0 route
-- rows. Version-1 exact rows are written solely by the owner-gated definer RPC.
drop policy if exists pad_roads_editor_insert on public.brinesearch_pad_roads;
create policy pad_roads_editor_insert on public.brinesearch_pad_roads
  for insert to authenticated
  with check (
    (public.is_brinesearch_editor((select auth.uid())) or public.is_brinesearch_owner((select auth.uid())))
    and geometry_version=0
  );
drop policy if exists pad_roads_editor_update on public.brinesearch_pad_roads;
create policy pad_roads_editor_update on public.brinesearch_pad_roads
  for update to authenticated
  using (
    (public.is_brinesearch_editor((select auth.uid())) or public.is_brinesearch_owner((select auth.uid())))
    and geometry_version=0
  )
  with check (
    (public.is_brinesearch_editor((select auth.uid())) or public.is_brinesearch_owner((select auth.uid())))
    and geometry_version=0
  );
drop policy if exists pad_roads_editor_delete on public.brinesearch_pad_roads;
create policy pad_roads_editor_delete on public.brinesearch_pad_roads
  for delete to authenticated
  using (
    (public.is_brinesearch_editor((select auth.uid())) or public.is_brinesearch_owner((select auth.uid())))
    and geometry_version=0
  );

create or replace function private_verification.brinesearch_guard_exact_route_road_geometry_issue69()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if (
    old.centerline_geojson is distinct from new.centerline_geojson
    or old.geometry_status is distinct from new.geometry_status
    or old.geometry_checked_at is distinct from new.geometry_checked_at
    or old.source_method is distinct from new.source_method
    or old.source_record_id is distinct from new.source_record_id
  ) and exists (
    select 1 from public.brinesearch_pad_roads pr
    where pr.road_id=old.id and pr.geometry_version=1
  ) then
    raise exception 'Road Manager geometry is referenced by an exact route; unpublish/republish affected occurrences before changing it'
      using errcode='55000';
  end if;
  return new;
end;
$$;

revoke all on function
  private_verification.brinesearch_guard_exact_route_road_geometry_issue69()
from public,anon,authenticated,service_role;
drop trigger if exists brinesearch_guard_exact_route_road_geometry_issue69
  on public.brinesearch_roads;
create trigger brinesearch_guard_exact_route_road_geometry_issue69
before update of centerline_geojson,geometry_status,geometry_checked_at,source_method,source_record_id
on public.brinesearch_roads
for each row execute function
  private_verification.brinesearch_guard_exact_route_road_geometry_issue69();

create or replace function private_verification.brinesearch_guard_structured_pad_route_fields_issue69()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if pg_catalog.jsonb_typeof(old.structured_route_steps)='array'
     and pg_catalog.jsonb_array_length(old.structured_route_steps)>0
     and (
       old.structured_road_sequence is distinct from new.structured_road_sequence
       or old.directions_clear is distinct from new.directions_clear
       or old.structured_route_steps is distinct from new.structured_route_steps
       or old.driver_safety_context is distinct from new.driver_safety_context
       or old.structured_route_revision is distinct from new.structured_route_revision
     )
     and (
       new.structured_route_revision<>old.structured_route_revision+1
       or pg_catalog.jsonb_typeof(new.structured_route_steps)<>'array'
       or pg_catalog.jsonb_array_length(new.structured_route_steps)=0
     ) then
    raise exception 'Structured route fields are managed only by brinesearch_publish_structured_route'
      using errcode='55000';
  end if;
  return new;
end;
$$;

revoke all on function
  private_verification.brinesearch_guard_structured_pad_route_fields_issue69()
from public,anon,authenticated,service_role;
drop trigger if exists brinesearch_guard_structured_pad_route_fields_issue69
  on public.pads;
create trigger brinesearch_guard_structured_pad_route_fields_issue69
before update of structured_road_sequence,directions_clear,structured_route_steps,
  driver_safety_context,structured_route_revision
on public.pads
for each row execute function
  private_verification.brinesearch_guard_structured_pad_route_fields_issue69();

create or replace function public.brinesearch_get_structured_route_steps(p_pad_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_steps jsonb;
  v_revision bigint;
  v_review_id uuid;
  v_sequence text;
  v_directions text;
  v_safety jsonb;
  v_canonical_count integer:=0;
  v_exact_count integer:=0;
begin
  if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access is required to load structured route geometry' using errcode='42501';
  end if;

  select
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'route_step_id',pr.route_step_id,
      'step_order',pr.step_order,
      'step_index',pr.step_order-1,
      'road_id',pr.road_id,
      'road_name',r.canonical_name,
      'aliases',pg_catalog.to_jsonb(pr.step_aliases),
      'start_coordinate',pg_catalog.jsonb_build_array(
        extensions.st_x(pr.start_point),extensions.st_y(pr.start_point)
      ),
      'end_coordinate',pg_catalog.jsonb_build_array(
        extensions.st_x(pr.end_point),extensions.st_y(pr.end_point)
      ),
      'clipped_geometry',extensions.st_asgeojson(pr.step_geometry,15)::jsonb,
      'miles',pr.distance_miles,
      'turn_direction',pr.turn_direction,
      'inbound_turn',pr.inbound_turn,
      'instruction',pr.instruction,
      'note',pr.step_note,
      'geometry_source',pr.geometry_source,
      'geometry_source_record_id',pr.geometry_source_record_id,
      'geometry_status',pr.geometry_status,
      'geometry_version',pr.geometry_version,
      'road_geometry_digest',pr.road_geometry_digest,
      'road_geometry_checked_at',pr.road_geometry_checked_at,
      'road_source_method',pr.road_source_method,
      'route_revision',pr.route_revision
    ) order by pr.step_order) filter (
      where pr.id is not null and pr.geometry_version=1 and pr.step_geometry is not null
    ),'[]'::jsonb),
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where pr.geometry_version=1 and pr.step_geometry is not null
    )::integer,
    min(pr.published_review_id::text)::uuid
  into v_steps,v_canonical_count,v_exact_count,v_review_id
  from public.brinesearch_pad_roads pr
  join public.brinesearch_roads r on r.id=pr.road_id
  where pr.pad_id=p_pad_id
    and pr.route_group='primary'
    and pr.route_variant_index=0;

  select
    p.structured_route_revision,p.structured_road_sequence,p.directions_clear,
    p.driver_safety_context
  into v_revision,v_sequence,v_directions,v_safety
  from public.pads p
  where p.id=p_pad_id;
  if not found then raise exception 'Pad not found'; end if;

  return pg_catalog.jsonb_build_object(
    'route_revision',v_revision,
    'review_id',v_review_id,
    'canonical_step_count',v_canonical_count,
    'exact_step_count',v_exact_count,
    'structured_sequence',v_sequence,
    'directions_clear',v_directions,
    'driver_safety_context',coalesce(v_safety,'[]'::jsonb),
    'safety_revision',pg_catalog.md5(coalesce(v_safety,'[]'::jsonb)::text),
    'structured_route_steps',v_steps,
    'steps',v_steps
  );
end;
$$;

revoke all on function public.brinesearch_get_structured_route_steps(uuid)
from public,anon;
grant execute on function public.brinesearch_get_structured_route_steps(uuid)
to authenticated;

create or replace function public.brinesearch_publish_structured_route(
  p_pad_id uuid,
  p_review_id uuid,
  p_steps jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_pad record;
  v_review_id uuid;
  v_current_revision bigint;
  v_next_revision bigint;
  v_step jsonb;
  v_clip_result jsonb;
  v_canonical_steps jsonb:='[]'::jsonb;
  v_index integer:=0;
  v_count integer;
  v_road record;
  v_geometry extensions.geometry;
  v_master_geometry extensions.geometry;
  v_previous_master_geometry extensions.geometry:=null;
  v_start extensions.geometry;
  v_end extensions.geometry;
  v_previous_end extensions.geometry:=null;
  v_previous_road_id uuid:=null;
  v_step_id uuid;
  v_road_id uuid;
  v_seen_step_ids uuid[]:='{}'::uuid[];
  v_road_ids uuid[]:='{}'::uuid[];
  v_has_shared_pair boolean;
  v_miles numeric;
  v_turn text;
  v_inbound_turn text;
  v_instruction text;
  v_sequence text;
  v_directions text;
  v_total numeric;
  v_public_steps jsonb;
  v_public_safety jsonb:='[]'::jsonb;
  v_safety_text text:='';
begin
  if v_actor is null or not public.is_brinesearch_owner(v_actor) then
    raise exception 'Owner access is required to publish structured routes' using errcode='42501';
  end if;
  if p_expected_revision is null then
    raise exception 'Expected route revision is required' using errcode='22023';
  end if;
  if p_steps is null or pg_catalog.jsonb_typeof(p_steps)<>'array'
     or pg_catalog.jsonb_array_length(p_steps)=0 then
    raise exception 'Structured route must contain at least one step' using errcode='22023';
  end if;
  if pg_catalog.jsonb_array_length(p_steps)>250
     or pg_catalog.pg_column_size(p_steps)>5242880 then
    raise exception 'Structured route exceeds the publication safety limit' using errcode='22023';
  end if;

  select p.* into v_pad
  from public.pads p
  where p.id=p_pad_id
  for update;
  if not found then raise exception 'Pad not found'; end if;
  v_current_revision:=v_pad.structured_route_revision;
  if p_expected_revision<>v_current_revision then
    raise exception 'Route changed after it was loaded; reload before publishing' using errcode='40001';
  end if;
  v_next_revision:=v_current_revision+1;
  v_count:=pg_catalog.jsonb_array_length(p_steps);

  -- Validate occurrence/order/turn identity first, then lock every referenced
  -- Road Manager row in deterministic UUID order before reading any geometry.
  for v_step in select value from pg_catalog.jsonb_array_elements(p_steps)
  loop
    v_index:=v_index+1;
    if pg_catalog.jsonb_typeof(v_step)<>'object' then
      raise exception 'Structured step % must be an object',v_index using errcode='22023';
    end if;
    begin
      if coalesce((v_step->>'step_order')::integer,0)<>v_index then
        raise exception 'Structured step order must be contiguous at step %',v_index using errcode='22023';
      end if;
      v_step_id:=nullif(v_step->>'route_step_id','')::uuid;
      v_road_id:=nullif(v_step->>'road_id','')::uuid;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Step % has an invalid order, occurrence ID or Road Manager road ID',v_index using errcode='22023';
    end;
    if v_step_id is null or v_road_id is null then
      raise exception 'Step % requires an occurrence ID and Road Manager road ID',v_index using errcode='22023';
    end if;
    if v_step_id=any(v_seen_step_ids) then
      raise exception 'Step % repeats occurrence ID %',v_index,v_step_id using errcode='22023';
    end if;
    v_seen_step_ids:=pg_catalog.array_append(v_seen_step_ids,v_step_id);
    if not v_road_id=any(v_road_ids) then
      v_road_ids:=pg_catalog.array_append(v_road_ids,v_road_id);
    end if;

    v_turn:=nullif(v_step->>'turn_direction','');
    v_inbound_turn:=nullif(v_step->>'inbound_turn','');
    if v_index=1 and v_turn is not null then
      raise exception 'Step 1 must not have an outbound entry turn' using errcode='22023';
    end if;
    if v_index>1 and v_turn is null then
      raise exception 'Step % requires an outbound turn instruction',v_index using errcode='22023';
    end if;
    if v_index=v_count and v_inbound_turn is not null then
      raise exception 'Final outbound step is the reverse-route start and must not have an inbound entry turn' using errcode='22023';
    end if;
    if v_index<v_count and v_inbound_turn is null then
      raise exception 'Step % requires an explicit reverse-route turn instruction',v_index using errcode='22023';
    end if;
    if v_turn is not null and v_turn not in (
      'left','right','straight','slight_left','slight_right','merge_left','merge_right','arrive'
    ) then
      raise exception 'Step % has an invalid outbound turn instruction',v_index using errcode='22023';
    end if;
    if v_inbound_turn is not null and v_inbound_turn not in (
      'left','right','straight','slight_left','slight_right','merge_left','merge_right','arrive'
    ) then
      raise exception 'Step % has an invalid reverse-route turn instruction',v_index using errcode='22023';
    end if;
  end loop;

  if exists (
    select 1 from public.brinesearch_pad_roads pr
    where pr.route_step_id=any(v_seen_step_ids) and pr.pad_id<>p_pad_id
  ) then
    raise exception 'A route occurrence ID already belongs to another pad' using errcode='23505';
  end if;

  perform r.id
  from public.brinesearch_roads r
  where r.id=any(v_road_ids)
  order by r.id
  for share;
  if (select pg_catalog.count(*) from public.brinesearch_roads r where r.id=any(v_road_ids))
     <>pg_catalog.cardinality(v_road_ids) then
    raise exception 'One or more Road Manager road IDs do not exist' using errcode='22023';
  end if;

  perform f.id
  from private_verification.brinesearch_driver_safety_facts_issue69 f
  where f.pad_id=p_pad_id
    and f.publication_status in ('private_hold','verified_public')
    and (f.effective_from is null or f.effective_from<=current_date)
    and (f.effective_until is null or f.effective_until>=current_date)
  order by f.id
  for share;
  if exists (
    select 1
    from private_verification.brinesearch_driver_safety_facts_issue69 f
    where f.pad_id=p_pad_id and f.publication_status='private_hold'
      and (f.effective_from is null or f.effective_from<=current_date)
      and (f.effective_until is null or f.effective_until>=current_date)
  ) then
    raise exception 'Verified driver-safety context requires explicit release review before structured publishing'
      using errcode='55000';
  end if;

  -- Server-derive every traveled occurrence from road ID + exact boundaries.
  -- Client geometry, mileage, aliases, source and status are preview-only and
  -- never enter canonical rows.
  v_index:=0;
  for v_step in select value from pg_catalog.jsonb_array_elements(p_steps)
  loop
    v_index:=v_index+1;
    v_step_id:=(v_step->>'route_step_id')::uuid;
    v_road_id:=(v_step->>'road_id')::uuid;
    select r.* into strict v_road
    from public.brinesearch_roads r
    where r.id=v_road_id;

    v_clip_result:=public.brinesearch_route_step_clip(
      v_road_id,v_step->'start_coordinate',v_step->'end_coordinate'
    );
    if coalesce((v_clip_result->>'resolved')::boolean,false) is not true then
      raise exception 'Step % geometry unresolved: %',v_index,
        coalesce(v_clip_result->>'reason','unknown') using errcode='22023';
    end if;
    begin
      v_geometry:=extensions.st_setsrid(
        extensions.st_geomfromgeojson((v_clip_result->'clipped_geometry')::text),4326
      );
      v_start:=extensions.st_startpoint(v_geometry);
      v_end:=extensions.st_endpoint(v_geometry);
      v_master_geometry:=extensions.st_setsrid(
        extensions.st_geomfromgeojson(v_road.centerline_geojson::text),4326
      );
    exception when others then
      raise exception 'Step % server-derived geometry could not be parsed',v_index using errcode='22023';
    end;
    if extensions.geometrytype(v_geometry)<>'LINESTRING'
       or extensions.st_isempty(v_geometry)
       or extensions.st_npoints(v_geometry)<2
       or not extensions.st_isvalid(v_geometry)
       or not extensions.st_issimple(v_geometry)
       or extensions.st_equals(v_start,v_end) then
      raise exception 'Step % server-derived geometry is invalid',v_index using errcode='22023';
    end if;
    v_miles:=pg_catalog.round(
      (extensions.st_length(v_geometry::extensions.geography)/1609.344)::numeric,6
    );
    if v_miles<=0 then
      raise exception 'Step % server-derived mileage is zero',v_index using errcode='22023';
    end if;
    if v_previous_end is not null and not extensions.st_equals(v_previous_end,v_start) then
      raise exception 'Step % is not exactly continuous with the preceding occurrence',v_index using errcode='22023';
    end if;

    if v_previous_master_geometry is not null and v_previous_road_id<>v_road_id then
      select exists (
        select 1
        from extensions.st_dumppoints(v_previous_master_geometry) lp
        join extensions.st_dumppoints(v_master_geometry) rp
          on extensions.st_dwithin(
            (lp).geom::extensions.geography,(rp).geom::extensions.geography,1
          )
        where pg_catalog.round(extensions.st_x((lp).geom)::numeric,15)=
              pg_catalog.round(extensions.st_x(v_start)::numeric,15)
          and pg_catalog.round(extensions.st_y((lp).geom)::numeric,15)=
              pg_catalog.round(extensions.st_y(v_start)::numeric,15)
      ) into v_has_shared_pair;
      if not coalesce(v_has_shared_pair,false) then
        raise exception 'Step % boundary is not one exact shared Road Manager node pair',v_index using errcode='22023';
      end if;
    end if;

    v_turn:=nullif(v_step->>'turn_direction','');
    v_inbound_turn:=nullif(v_step->>'inbound_turn','');
    v_canonical_steps:=v_canonical_steps||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'route_step_id',v_step_id,
        'step_order',v_index,
        'road_id',v_road_id,
        'road_name',v_road.canonical_name,
        'aliases',pg_catalog.to_jsonb(coalesce(v_road.aliases,'{}'::text[])),
        'start_coordinate',v_clip_result->'start_coordinate',
        'end_coordinate',v_clip_result->'end_coordinate',
        'clipped_geometry',v_clip_result->'clipped_geometry',
        'miles',v_miles,
        'turn_direction',v_turn,
        'inbound_turn',v_inbound_turn,
        'private_step_note',nullif(v_step->>'note',''),
        'geometry_source','road_manager_clip_issue69',
        'geometry_source_record_id',v_road.source_record_id,
        'geometry_status','snapped_intersections',
        'road_geometry_digest',pg_catalog.md5(v_road.centerline_geojson::text),
        'road_geometry_checked_at',v_road.geometry_checked_at,
        'road_source_method',v_road.source_method
      )
    );
    v_previous_end:=v_end;
    v_previous_master_geometry:=v_master_geometry;
    v_previous_road_id:=v_road_id;
  end loop;

  if exists (
    select 1
    from private_verification.brinesearch_driver_safety_facts_issue69 f
    where f.pad_id=p_pad_id and f.publication_status='verified_public'
      and (f.effective_from is null or f.effective_from<=current_date)
      and (f.effective_until is null or f.effective_until>=current_date)
      and f.route_step_id is not null
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(v_canonical_steps) s(value)
        where (s.value->>'route_step_id')::uuid=f.route_step_id
          and (s.value->>'road_id')::uuid=f.road_id
      )
  ) then
    raise exception 'An occurrence-bound driver-safety fact no longer matches this route; reassign or retire it before publishing'
      using errcode='55000';
  end if;

  if p_review_id is not null then
    select rr.id into v_review_id
    from public.brinesearch_route_reviews rr
    where rr.id=p_review_id and rr.pad_id=p_pad_id
    for update;
    if not found then raise exception 'Route review does not belong to this pad'; end if;
  else
    select rr.id into v_review_id
    from public.brinesearch_route_reviews rr
    where rr.pad_id=p_pad_id
    for update;
    if not found then
      insert into public.brinesearch_route_reviews(
        pad_id,legacy_id,pad_name,company,state,pad_latitude,pad_longitude,
        source_quality,status,route_scope,candidate_kind,candidate_route,evidence,
        field_verification_status
      ) values (
        p_pad_id,v_pad.legacy_id,v_pad.pad_name,v_pad.company,v_pad.state,
        v_pad.latitude,v_pad.longitude,'sequence_only','owner_review','unknown',
        'none','[]'::jsonb,
        pg_catalog.jsonb_build_object('method','owner_structured_route_steps_issue69'),
        'pending'
      ) returning id into v_review_id;
    end if;
  end if;

  delete from public.brinesearch_pad_roads
  where pad_id=p_pad_id and route_group='primary' and route_variant_index=0;

  for v_step in select value from pg_catalog.jsonb_array_elements(v_canonical_steps)
  loop
    v_index:=(v_step->>'step_order')::integer;
    v_geometry:=extensions.st_setsrid(
      extensions.st_geomfromgeojson((v_step->'clipped_geometry')::text),4326
    );
    v_turn:=nullif(v_step->>'turn_direction','');
    v_instruction:=case
      when v_index=1 then 'Take '
      when v_turn='left' then 'Turn left on '
      when v_turn='right' then 'Turn right on '
      when v_turn='slight_left' then 'Slight left on '
      when v_turn='slight_right' then 'Slight right on '
      when v_turn='merge_left' then 'Merge left onto '
      when v_turn='merge_right' then 'Merge right onto '
      when v_turn='arrive' then 'Arrive via '
      else 'Continue on '
    end||v_step->>'road_name';

    insert into public.brinesearch_pad_roads(
      pad_id,road_id,route_group,step_order,instruction,distance_miles,step_note,
      route_variant_index,turn_direction,distance_source,distance_status,
      source_details,match_confidence,route_step_id,step_geometry,step_aliases,
      geometry_source,geometry_source_record_id,geometry_status,geometry_version,
      inbound_turn,route_revision,published_review_id,road_geometry_digest,
      road_geometry_checked_at,road_source_method,created_by,updated_by
    ) values (
      p_pad_id,(v_step->>'road_id')::uuid,'primary',v_index,v_instruction,
      (v_step->>'miles')::numeric,nullif(v_step->>'private_step_note',''),0,v_turn,
      'clipped_step_geometry','map_measured',
      pg_catalog.jsonb_build_object(
        'method','owner_structured_route_steps_issue69',
        'published_at',pg_catalog.now(),
        'route_revision',v_next_revision,
        'road_geometry_digest',v_step->>'road_geometry_digest',
        'road_source_method',v_step->>'road_source_method'
      ),
      1,(v_step->>'route_step_id')::uuid,v_geometry,
      array(select value from pg_catalog.jsonb_array_elements_text(v_step->'aliases')),
      'road_manager_clip_issue69',nullif(v_step->>'geometry_source_record_id',''),
      'snapped_intersections',1,nullif(v_step->>'inbound_turn',''),
      v_next_revision,v_review_id,v_step->>'road_geometry_digest',
      nullif(v_step->>'road_geometry_checked_at','')::timestamptz,
      nullif(v_step->>'road_source_method',''),v_actor,v_actor
    );
  end loop;

  delete from public.brinesearch_route_review_segments where review_id=v_review_id;
  insert into public.brinesearch_route_review_segments(
    review_id,outbound_order,inbound_order,road_id,road_name,official_road_name,
    route_type,route_number,miles,outbound_turn,inbound_turn,source_level,
    source_agency,source_url,source_record_id,is_state_route,confidence,evidence,
    route_step_id,step_geometry,step_aliases,geometry_source,
    geometry_source_record_id,geometry_status,geometry_version,
    road_geometry_digest,road_geometry_checked_at,road_source_method
  )
  select
    v_review_id,pr.step_order,v_count-pr.step_order+1,pr.road_id,
    r.canonical_name,r.canonical_name,
    case r.road_type
      when 'interstate' then 'I' when 'us_route' then 'US'
      when 'state_route' then case lower(pg_catalog.btrim(coalesce(r.state,v_pad.state,'')))
        when 'ohio' then 'OH' when 'oh' then 'OH'
        when 'pennsylvania' then 'PA' when 'pa' then 'PA'
        when 'west virginia' then 'WV' when 'wv' then 'WV'
        else upper(nullif(pg_catalog.btrim(coalesce(r.state,v_pad.state,'')),'')) end
      when 'county' then 'CR' when 'township' then 'TR' else upper(r.road_type)
    end,
    r.route_number,pr.distance_miles,pr.turn_direction,pr.inbound_turn,
    'owner_verified',r.source_agency,r.source_url,r.source_record_id,
    r.road_type='state_route','owner_confirmed',
    pg_catalog.jsonb_build_object(
      'method','owner_structured_route_steps_issue69','route_revision',v_next_revision,
      'road_geometry_digest',pr.road_geometry_digest
    ),
    pr.route_step_id,pr.step_geometry,pr.step_aliases,pr.geometry_source,
    pr.geometry_source_record_id,pr.geometry_status,1,pr.road_geometry_digest,
    pr.road_geometry_checked_at,pr.road_source_method
  from public.brinesearch_pad_roads pr
  join public.brinesearch_roads r on r.id=pr.road_id
  where pr.pad_id=p_pad_id and pr.route_group='primary' and pr.route_variant_index=0
  order by pr.step_order;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'route_step_id',pr.route_step_id,
    'step_order',pr.step_order,
    'step_index',pr.step_order-1,
    'road_id',pr.road_id,
    'road_name',r.canonical_name,
    'aliases',pg_catalog.to_jsonb(pr.step_aliases),
    'start_coordinate',pg_catalog.jsonb_build_array(
      extensions.st_x(pr.start_point),extensions.st_y(pr.start_point)
    ),
    'end_coordinate',pg_catalog.jsonb_build_array(
      extensions.st_x(pr.end_point),extensions.st_y(pr.end_point)
    ),
    'clipped_geometry',extensions.st_asgeojson(pr.step_geometry,15)::jsonb,
    'miles',pr.distance_miles,
    'turn_direction',pr.turn_direction,
    'inbound_turn',pr.inbound_turn,
    'instruction',pr.instruction,
    'geometry_status',pr.geometry_status,
    'geometry_version',pr.geometry_version,
    'route_revision',pr.route_revision
  ) order by pr.step_order),'[]'::jsonb)
  into v_public_steps
  from public.brinesearch_pad_roads pr
  join public.brinesearch_roads r on r.id=pr.road_id
  where pr.pad_id=p_pad_id and pr.route_group='primary'
    and pr.route_variant_index=0 and pr.geometry_version=1;

  select
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'safety_fact_id',f.id,
        'category',f.category,
        'driver_text',f.driver_text,
        'direction_scope',f.direction_scope,
        'route_step_id',f.route_step_id,
        'road_id',f.road_id,
        'effective_from',f.effective_from,
        'effective_until',f.effective_until,
        'source_revision',f.source_revision
      )
    ) order by f.display_order,f.id),'[]'::jsonb),
    coalesce(pg_catalog.string_agg('- '||f.driver_text,E'\n' order by f.display_order,f.id),'')
  into v_public_safety,v_safety_text
  from private_verification.brinesearch_driver_safety_facts_issue69 f
  where f.pad_id=p_pad_id and f.publication_status='verified_public'
    and f.verified_at is not null
    and (f.effective_from is null or f.effective_from<=current_date)
    and (f.effective_until is null or f.effective_until>=current_date);

  select
    pg_catalog.string_agg(r.canonical_name,' → ' order by pr.step_order),
    pg_catalog.string_agg(
      pr.step_order::text||'. '||pr.instruction||' — '||
      trim(trailing '.' from trim(
        trailing '0' from pg_catalog.to_char(pr.distance_miles,'FM999990.00')
      ))||' mi',
      E'\n' order by pr.step_order
    ),
    pg_catalog.sum(pr.distance_miles)
  into v_sequence,v_directions,v_total
  from public.brinesearch_pad_roads pr
  join public.brinesearch_roads r on r.id=pr.road_id
  where pr.pad_id=p_pad_id and pr.route_group='primary' and pr.route_variant_index=0;

  v_directions:='Road sequence reference:'||E'\n'||v_sequence||
    E'\n\nStep-by-step directions:\n'||v_directions;
  if v_safety_text<>'' then
    v_directions:=v_directions||E'\n\nDriver safety information:\n'||v_safety_text;
  end if;

  update public.brinesearch_route_reviews rr
  set structured_sequence_snapshot=v_sequence,
      source_directions_snapshot=v_directions,
      source_quality='clear',candidate_kind='none',state_route_name=null,
      state_route_distance_feet=null,no_guess_reason=null,
      candidate_route=v_public_steps,
      evidence=coalesce(rr.evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'method','owner_structured_route_steps_issue69',
        'route_revision',v_next_revision,'published_at',pg_catalog.now(),
        'safety_revision',pg_catalog.md5(v_public_safety::text)
      ),
      measured_total_miles=v_total,status='approved',
      route_scope=case when exists(
        select 1 from public.brinesearch_pad_roads pr
        join public.brinesearch_roads r on r.id=pr.road_id
        where pr.pad_id=p_pad_id and pr.route_group='primary'
          and pr.route_variant_index=0
          and r.road_type in ('county','township','local','access')
      ) then 'local_roads' else 'state_route_only' end,
      field_verification_status='confirmed',reviewed_by=v_actor,
      reviewed_at=pg_catalog.now(),approved_at=pg_catalog.now(),updated_at=pg_catalog.now()
  where rr.id=v_review_id;

  update public.pads
  set structured_road_sequence=v_sequence,
      structured_route_steps=v_public_steps,
      structured_route_revision=v_next_revision,
      driver_safety_context=v_public_safety,
      directions_clear=v_directions,
      directions_clear_method='owner_structured_route_steps_issue69',
      directions_clear_updated_at=pg_catalog.now(),
      directions_clear_updated_by=v_actor,
      road_sequence_status='owner_verified',
      road_sequence_reviewed_date=current_date,
      number_of_road_steps=v_count,
      last_updated_by='BrineSearch Owner',last_updated_date=pg_catalog.now(),
      updated_by=v_actor,updated_at=pg_catalog.now()
  where id=p_pad_id;

  return public.brinesearch_get_structured_route_steps(p_pad_id);
end;
$$;

revoke all on function
  public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)
from public,anon,authenticated;
grant execute on function
  public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)
to authenticated;

comment on function public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint) is
  'Issue #69 sole owner publication boundary. Server-clips exact occurrences from locked complete Road Manager geometry, derives mileage/provenance, preserves verified allowlisted driver safety, and atomically updates revisioned route rows/cards.';

-- Explicit #81 public-safety golden inventory. These clauses were individually
-- reviewed from the narrow four-column public directions view. The migration
-- aborts on any revision, full-text digest or exact-clause drift; it never scans
-- arbitrary notes/evidence or promotes keyword matches automatically.
drop table if exists pg_temp.issue69_safety_seed;
create temporary table issue69_safety_seed (
  seed_order integer generated always as identity,
  legacy_id text not null,
  context_key text not null,
  category text not null,
  direction_scope text not null,
  driver_text text not null,
  source_revision text not null,
  source_sha256 text not null
) on commit drop;

insert into pg_temp.issue69_safety_seed(
  legacy_id,context_key,category,direction_scope,driver_text,source_revision,source_sha256
) values
('ascent--coffield','truck-prohibition-1','truck_prohibition','both','Truck restriction: the saved directions explicitly say do not use Little McMahon Creek Rd / Route 279.','2026-08-08 03:32:45.301022+00','996ddb39cfe7297a9f67176b6b12c5b8872cdbd48595366218635cae23d6690e'),
('ascent--cross-creek','curfew-1','curfew','both','Curfew note from the saved field directions: Bloomingdale 22A to High St / High St restrictions are listed as 6:20–6:50 AM, 8:25–9:10 AM, 2:10–2:30 PM, and 3:30–4:30 PM.','2026-08-08 03:30:38.123255+00','b51ccd5c74732a40cff3c70710d801dda48f9bb089fe10ed08393842a677c24f'),
('ascent--cypress','truck-prohibition-1','truck_prohibition','both','Truck restriction: all traffic must use Route 250, not Route 9.','2026-08-08 03:39:04.515234+00','337fec61bc478dcf5bc46142a44e058855d65a6503b6233576e4c0e0bfb9a452'),
('ascent--debaser','narrow-road-1','narrow_road','both','Cross the narrow bridge.','2026-08-08 03:31:08.925476+00','8222482e7e32ede016eee0466a3a868424ec6958691b2711a33a5794b0ead46c'),
('ascent--exeter','cb-callout-1','cb_callout','both','Truck note: the saved directions say this is a narrow road and to make call-outs from Route 331.','2026-08-08 03:31:40.243277+00','11d94052b136e3eb25eba74c14aa853200524e3022354d9de81534c39cdfb610'),
('ascent--henderson','truck-prohibition-1','truck_prohibition','inbound','Truck warning: do not approach southbound on OH-9.','2026-08-08 03:18:30.375697+00','c8c3fdda548270f00b962cebd720f502171afe61f34ced37abc295174fb92007'),
('ascent--jackalope','one-lane-1','one_lane','both','The saved field directions note a one-lane bridge.','2026-08-08 03:22:26.289416+00','39300dd895636bc55e4c5f2d02551f5cd17f9feda18086fbccaa7f427315d636'),
('ascent--jones','truck-prohibition-1','truck_prohibition','both','Truck restriction: do not use County Road 21.','2026-08-08 03:40:05.618427+00','eb85ad84ef9ac2d3981f24c6de5c4df0151387237aa852e4c0558e8acbe5e98f'),
('ascent--lodge','one-lane-1','one_lane','both','Cross Cox Rd and the one-lane bridge.','2026-08-08 03:35:28.71036+00','692f7245eee94c81bdbbb402e410548bfb258a08f8ff6530978d943f22072b7b'),
('ascent--omaits','truck-prohibition-1','truck_prohibition','both','Truck restriction: County Road 8 past TR-118 is not a bonded route for trucks traveling to or from SR-152. The saved directions warn drivers may be ticketed if they use it.','2026-08-08 03:36:39.392539+00','3cb1a4feea78c07e7eb4cd8a9d1409dcbbfa5a014f8c5596b6a4f17c34488d34'),
('ascent--ruth','speed-limit-1','speed_limit','both','Stop at the 5 mph sign','2026-08-08 05:42:34.083831+00','8cb84e8a8dc719617bf2aa5666d9d285f17d05a17f91c2908b5dd7c87635a278'),
('ascent--ruth','cb-callout-1','cb_callout','both','call out on CB channel 27.','2026-08-08 05:42:34.083831+00','8cb84e8a8dc719617bf2aa5666d9d285f17d05a17f91c2908b5dd7c87635a278'),
('ascent--tarbert','unsigned-road-1','unsigned_road','both','The saved field directions note Moore Rd is unmarked','2026-08-08 03:25:13.504338+00','cbf2839971817e68b2cc896d0eb8695eae9151d8d544ed60272f5e460fceff35'),
('cnx--wfn-2','speed-limit-1','speed_limit','both','Gravel Roads are 15 mph','2026-08-09 08:56:52.046205+00','ef44a842a980ca253b29c5881766217260aef3f20b70c633f5b8042294106e88'),
('cnx--wfn-2','curfew-1','curfew','both','Curfew: 6:45- 730 am. 315 pm.- 420 pm','2026-08-09 08:56:52.046205+00','ef44a842a980ca253b29c5881766217260aef3f20b70c633f5b8042294106e88'),
('disposals--mud-master','cb-callout-1','cb_callout','pad_access','CB channel 1.','2026-08-09 08:56:52.046205+00','c72d930d9d2066f2b67fd30eeda17d72eb04a2b81bfef05f707e3f4d73d53711'),
('eclipse--rolland-unit','cb-callout-1','cb_callout','inbound','cb channel 35','2026-08-09 08:56:52.046205+00','9f947570dfc0c8c92ea360ba22beab172f7a64d79de524536db722d17c8ed141'),
('eclipse--sawyers','cb-callout-1','cb_callout','both','CB channel 19 escort in and out','2026-08-09 08:56:52.046205+00','5f23d114f3da9631824c8004c196b97a00da17be3a97bc05ee5abb7c8ec31943'),
('eog--bears','cb-callout-1','cb_callout','both','CB channel 13.','2026-08-08 07:39:31.013294+00','0b1baa60a906c0c31d79a83866ac6b69fb625fbb13c17bc9dd69e09174c4adf8'),
('eog--guthrie','route-restriction-1','route_restriction','inbound','Do not use Eslik Rd from US-250; the saved directions say it is being watched for well traffic.','2026-08-08 07:41:41.584238+00','ed2eb15fd01159248cb5e6aff938bdea552870eec97bc017b70998c7638852b3'),
('eqt--dragons-breath','curfew-1','curfew','both','CURFEW 6- 7AM','2026-08-09 08:56:52.046205+00','9213c8ac0b370f5df2d8db91b0aa73ecc3d5f551c5ae9d46a8bfbcda501a479a'),
('eqt--dream-weaver','cb-callout-1','cb_callout','both','CB 33','2026-08-09 08:56:52.046205+00','86bfec2e6ca2f9735af8126b35a80bdb12b60fa62508ead441c0af27c3c414e5'),
('eqt--dream-weaver','curfew-1','curfew','both','Curfew 6:00a - 7:00a 2:45p - 3:45 m-f','2026-08-09 08:56:52.046205+00','86bfec2e6ca2f9735af8126b35a80bdb12b60fa62508ead441c0af27c3c414e5'),
('eqt--skyhawk','curfew-1','curfew','both','AM Curfew is 7:00am to 7:20am & 8:00am to 8:30am PM Curfew is 2:20pm to 2:45pm & 3:30pm to 3:50pm','2026-08-09 08:56:52.046205+00','a70f6d0e42d67df08be5b29120e9793ecad606ae15474e6d63d05ae16b029d9c'),
('expand--alan-h-degarmo','curfew-1','curfew','both','School Curfew 6:40-6:50AM 8:00-8:20AM 3:20-3:50PM 4:10-4:30PM','2026-08-09 08:56:52.046205+00','8d28930bde2849c6abadfe60b00d2c45b6b029917be3bded475c69309cb486e4'),
('expand--albert-hohman','curfew-1','curfew','both','School Curfew 6:00-7:30AM 3:30-5:00PM','2026-08-09 08:56:52.046205+00','e2cb1481688c7ab626a16d9d7fe79c761bdca7350cc9976814bc2820d2fa9cee'),
('expand--alice-edge','curfew-1','curfew','both','School Curfew 6:17-6:30AM 7:55-8:35AM 2:50-4:03PM','2026-08-09 08:56:52.046205+00','3af8687ad4fb126a02b660b9fff9da38e58ee3f889c685969948d8ba58d75050'),
('expand--altman','curfew-1','curfew','both','School Curfew M,T,T,F 6:30-8:00AM 3:30-5:00PM Wed 7:30-9:00AM 3:30-5:00PM','2026-08-09 08:56:52.046205+00','3204a649bf2cbe11e67751a359021ec15b4f8c84a7843b8da6d3e0e3a10ecf88'),
('expand--alton-stern','curfew-1','curfew','both','School Curfew M,T,T,F 6:30-8:00AM 3:30-5:00PM Wed 7:30-9:00AM 3:30-5:00PM','2026-08-09 08:56:52.046205+00','82e5105bbb709e5bfbd6c5624a80f8cea7296e1888237a822e51a21b765f0949'),
('expand--arthur-waryck','curfew-1','curfew','both','School Curfew M,T,T,F 6:30-8:00AM 3:30-5:00PM Wed 7:30-9:00AM 3:30-5:00PM','2026-08-09 08:56:52.046205+00','eb69e29623ecf8ff0906b173ab1bb6ba16dcdb817b52dd6cc3b07ad4d5e6140d'),
('expand--b-w-edge','curfew-1','curfew','both','School Curfew M,T,T,F 6:30-8:00AM 3:30-5:00PM Wed 7:30-9:00AM 3:30-5:00PM','2026-08-09 08:56:52.046205+00','b14bc8e1090d1f0c73489fb1d0e6a3270e0f08d6534c78fbb6642631757bf283'),
('expand--charles-jamison','curfew-1','curfew','both','School Curfew M,T,T,F 6:30-8:00AM 3:30-5:00PM Wed 7:30-9:00AM 3:30-5:00PM','2026-08-09 08:56:52.046205+00','6952df4c28c0e847812eafde375d665e21d7c52976c9b91111399a7752ee2882'),
('expand--esther-weeks','one-lane-1','one_lane','both','The saved directions describe Oklahoma Rd as gravel/dirt and single lane','2026-08-09 22:26:29.553451+00','07e4a7a0f1cae6e7c52c852cbd5d910bfcda321f49f4c8adad64f3ecb5e4d9f5'),
('expand--mcfrederick-k-up-blt','route-restriction-1','route_restriction','inbound','NOT RECOMMENDED APPROACH FROM NORTH VIA OH 26 SOUTH','2026-08-09 08:56:52.046205+00','9ac8929667ee0bb84a31ecd74cf137fbc78bc8340ec11fd9add4b56c42bb5d9a'),
('expand--mcfrederick-k-up-blt','road-hazard-1','road_hazard','outbound','6&7 AXLES WILL BOTTOM OUT WHENEVER LEAVING','2026-08-09 08:56:52.046205+00','9ac8929667ee0bb84a31ecd74cf137fbc78bc8340ec11fd9add4b56c42bb5d9a'),
('expand--timmy-minch','curfew-1','curfew','both','Curfew: 5:45–6:45 AM, 7:35–8:35 AM, 2:45–3:45 PM, and 4:05–4:30 PM.','2026-08-10 23:43:37.119866+00','cc3155f511e9c10b64b7e25a575ef40ebb65a6c36673e54f1d787f32c9166cbc'),
('expand--van-aston','curfew-1','curfew','both','Curfew: M,T,T,F 6:30–8:00 AM and 3:30–5:00 PM; Wed 7:30–9:00 AM and 3:30–5:00 PM.','2026-08-10 23:39:00.116325+00','ec0debf114fe8961e128e7cdd215e0d96d68b3a000fcb307a669e6200a37f07e'),
('expand--van-aston','unsigned-road-1','unsigned_road','both','Brushy Run Rd is unsigned.','2026-08-10 23:39:00.116325+00','ec0debf114fe8961e128e7cdd215e0d96d68b3a000fcb307a669e6200a37f07e'),
('gulfport--miklovic','cb-callout-1','cb_callout','both','CB Chanel 12 There are 5 call out points inbound and outbound','2026-08-09 08:56:52.046205+00','a30edbf230226b785b792437170465eb57fbe6eef4cdecb9d3a11dd5a94a9888'),
('gulfport--thompson-south','road-hazard-1','road_hazard','inbound','this route has 10 percent grade.','2026-08-09 08:56:52.046205+00','6cfdf06b11558ade6a4bf562c0b0ade2ef0e4cb645aace7db8dececb6ada9877'),
('gulfport--warrick','truck-prohibition-1','truck_prohibition','inbound','Route 9 is not recommend for large trucks','2026-08-09 08:56:52.046205+00','b868146e0904a91c9fab43273e47a20624d81a18e64b6dab1fbceabd5c2f7e01'),
('gulfport--whitacre-702','route-restriction-1','route_restriction','both','DO NOT USE GPS','2026-08-09 08:56:52.046205+00','c92e47f837763adb54f3144478e82839d58aef7aafaaaa4673a926500e14b8b3'),
('hilcorp--elkrun-johnston','route-restriction-1','route_restriction','inbound','DO NOT ENTER PINE HOLLOW FROM ROUTE 7!!!!','2026-08-09 08:56:52.046205+00','c7f115f4cd6ddebeab978513fd4c369365fdb1f5780678c62bfdc9636090204d'),
('hilcorp--fairfield-phoenix','gate-access-1','gate_access','pad_access','THIS SITE REQUIRES JSA, sign in or no entry safety on site at gate.','2026-08-09 08:56:52.046205+00','0bda7c657c08688b7dbe09428b880b40035cf67aa3a8b74fdd924fd8fb3dbc07'),
('infinity--gray-well-pad','route-restriction-1','route_restriction','inbound','DO NOT ENTER FROM US-22 HEADING SOUTH ON FAIRGROUND ROAD!!!!','2026-08-09 08:56:52.046205+00','25f1f6b948086dbf83927d7adc574831f980b337f4246fe000c6b2c9d01df109'),
('infinity--hn-sto','cb-callout-1','cb_callout','pad_access','Cb Channel 32','2026-08-09 08:56:52.046205+00','c2abd775e615eaaecf3fd2ab0695abd04c71a10a2eb779fd62bd97772276ce37'),
('range--bird-run','truck-prohibition-1','truck_prohibition','inbound','Big trucks not allowed to get off 70 West, Jefferson Ave exit','2026-08-09 08:56:52.046205+00','64bc6a4561cc9d4ff8e288c67a1cccf93d05dc644725fc22117b7509adb8bd28'),
('swn--benard-mcculey','curfew-1','curfew','both','Bus curfew 6:15 -8:45 am 2:20 -4:15 pm','2026-08-09 08:56:52.046205+00','349ff15bd6fc09b8547ced803d0b8cd31cae37e24359d38dd1bcc1f6f61afc18'),
('swn--circosta-unit','cb-callout-1','cb_callout','both','CB Channel 26 on Cochran Hill','2026-08-09 08:56:52.046205+00','32be0a7c41e64e93bbd857e64ad18c8a9b44562d6fabab66c7db5c137f5b5f9a'),
('swn--david-stalder','curfew-1','curfew','both','School bus black out times for vehicles with more than 2 axles (including 2 axle trucks with trailers) Benwood and Goddard - 7:15am to 8:00am and 2:30pm to 4:00pm.','2026-08-09 08:56:52.046205+00','1a4898adb85b8f8c2a3d627618f8463b4f4af5ae2b59694b883f6006359ac9af'),
('swn--david-stalder','road-hazard-1','road_hazard','both','WARNING - SHARP CURVES ON SR 225','2026-08-09 08:56:52.046205+00','1a4898adb85b8f8c2a3d627618f8463b4f4af5ae2b59694b883f6006359ac9af'),
('swn--dmc-east','truck-prohibition-1','truck_prohibition','both','NO TRUCKS ALLOWED IN TOWN OF CLAYSVILLE','2026-08-09 08:56:52.046205+00','91b5c2d31a075eca15c0820e7cd2e5fe90178460bbd8e9612859ae4803061683'),
('swn--hayes-cgf','cb-callout-1','cb_callout','inbound','CB Channel 10 after leaving 265','2026-08-09 08:56:52.046205+00','e0c24abaec2e37b1eec840a65780ca7cc591942b7609910fd7a6bd7c001a9f8b'),
('swn--holliday-unit','cb-callout-1','cb_callout','both','CB Channel 26 on Cochran Hill road','2026-08-09 08:56:52.046205+00','f2d9746e4d7a7a5579988518e411f88684f9ab9086d537a5087c47c9bdfa3f8a'),
('swn--roth','speed-limit-1','speed_limit','both','Speed limit 15mph','2026-08-09 08:56:52.046205+00','6b48c2941dc88734e0c419c459a08c081596fe0b8b9cf1740caa051db982817f'),
('swn--roth-drilling','curfew-1','curfew','both','Curfew. - 630 to 8am - 2pm to 4pm','2026-08-09 08:56:52.046205+00','2dc88ddae6f8c2fa31a9982b9696044ebdc3a32728b92dbae5928b0da03d9082'),
('swn--roy-riggle-ohi','cb-callout-1','cb_callout','both','CB CH 19','2026-08-09 08:56:52.046205+00','d425976ab386f4c9f5b42b711366a39de71a03411625b176cb7e458c3908b13f');

do $issue69_safety_assert$
declare
  v_category_counts jsonb;
begin
  if (select pg_catalog.count(*) from pg_temp.issue69_safety_seed)<>57
     or (select pg_catalog.count(distinct legacy_id) from pg_temp.issue69_safety_seed)<>51 then
    raise exception 'Issue #69 safety inventory count drift';
  end if;
  select pg_catalog.jsonb_object_agg(category,fact_count order by category)
  into v_category_counts
  from (
    select category,pg_catalog.count(*)::integer as fact_count
    from pg_temp.issue69_safety_seed group by category
  ) counts;
  if v_category_counts<>jsonb_build_object(
    'cb_callout',13,'curfew',18,'gate_access',1,'narrow_road',1,'one_lane',3,
    'road_hazard',3,'route_restriction',5,'speed_limit',3,
    'truck_prohibition',8,'unsigned_road',2
  ) then
    raise exception 'Issue #69 safety category count drift: %',v_category_counts;
  end if;
  if exists (
    select 1
    from pg_temp.issue69_safety_seed s
    left join public.brinesearch_driver_directions_public d on d.legacy_id=s.legacy_id
    where d.pad_id is null or d.directions_clear is null
       or d.source_revision::text<>s.source_revision
       or encode(extensions.digest(pg_catalog.convert_to(d.directions_clear,'UTF8'),'sha256'),'hex')<>s.source_sha256
       or (
         (pg_catalog.length(d.directions_clear)-pg_catalog.length(pg_catalog.replace(d.directions_clear,s.driver_text,'')))
         /nullif(pg_catalog.length(s.driver_text),0)
       )<>1
  ) then
    raise exception 'Issue #69 safety inventory source/revision/clause drift';
  end if;
  if (
    select pg_catalog.count(*)
    from public.brinesearch_driver_directions_public d
    join (select distinct legacy_id from pg_temp.issue69_safety_seed) s
      on s.legacy_id=d.legacy_id
  )<>51 then
    raise exception 'Issue #69 safety inventory source cardinality drift';
  end if;
end;
$issue69_safety_assert$;

insert into private_verification.brinesearch_driver_safety_facts_issue69(
  pad_id,context_key,display_order,category,direction_scope,driver_text,
  publication_status,source_kind,source_record_id,source_revision,
  source_text_digest,source_excerpt_digest,verification_method,verified_at
)
select
  d.pad_id,s.context_key,
  pg_catalog.row_number() over(partition by s.legacy_id order by s.seed_order)::smallint,
  s.category,s.direction_scope,s.driver_text,'verified_public',
  'existing_public_directions',s.legacy_id,s.source_revision,s.source_sha256,
  encode(extensions.digest(pg_catalog.convert_to(s.driver_text,'UTF8'),'sha256'),'hex'),
  'issue69_reviewed_golden_inventory_20260811',pg_catalog.now()
from pg_temp.issue69_safety_seed s
join public.brinesearch_driver_directions_public d on d.legacy_id=s.legacy_id;

-- Credential-like access codes remain private holds. No code value is copied
-- into this public repository or the new public snapshot. Publishing one of
-- these pads fails closed until an Owner/operator explicitly authorizes or
-- retires the hold in a separate reviewed workflow.
drop table if exists pg_temp.issue69_safety_hold_seed;
create temporary table issue69_safety_hold_seed (
  legacy_id text primary key,
  source_revision text not null,
  source_sha256 text not null
) on commit drop;

insert into pg_temp.issue69_safety_hold_seed(legacy_id,source_revision,source_sha256) values
('ascent--albatross','2026-08-08 03:29:16.257343+00','3e470334984b0b40554e3721d2c6f179418a4fbe82ac5224d61e9fe5e596f5fb'),
('ascent--marquard','2026-08-08 03:35:28.71036+00','add4b9b7948df1ec145c68be17832ca62f101177bf7b385cd94161c218581431'),
('gulfport--arnold','2026-08-09 08:56:52.046205+00','a08e31f5078af4c32e708e4eae7c9b1b6ba2b3643eae5475fe8528afdeefac31'),
('gulfport--barton','2026-08-09 08:56:52.046205+00','7b4ccc1d8ce94428270b01570cdad95d953461e71196e408ca457e4ea24dbb06'),
('gulfport--charlotte','2026-08-09 08:56:52.046205+00','1c9bc794a1fadf0d4c0e8dfd11e4b4157ddab9668e00c25c7582037a184d3098'),
('gulfport--dornon','2026-08-09 08:56:52.046205+00','789eb3b908f566b91d9836ff37ed947eda3b50563034cb03b1a73cc14ad7ad46'),
('gulfport--dorsey','2026-08-09 08:56:52.046205+00','35986662706fd224f404e2b18961223f57f06476a1fc8ba1cf73e8d0ed592be6'),
('gulfport--fankhauser','2026-08-09 08:56:52.046205+00','091ed5fa8e8c237df9826360448aaa55f17481384d5a82a1f85f91bbf04b1a9f'),
('gulfport--followay','2026-08-09 08:56:52.046205+00','ac9d34949aca5f9c4c540ae32941bc2ad3ecffe48aa35f8230490bec3262be71'),
('gulfport--gary','2026-08-09 08:56:52.046205+00','14d759d238713accd4ea17160dc4d1710b0622622b05cf525c648fff117375a5'),
('gulfport--gary-greene','2026-08-09 08:56:52.046205+00','c82e7d9ef7651714e2a5143bf41ffad5c128bfd1f874a7134b8500fd6db6bb99'),
('gulfport--gehrig','2026-08-09 08:56:52.046205+00','677e1f984e5f24fe7b86e6b65341a82137e8cc361d24615871b7c552552e98b9'),
('gulfport--george','2026-08-09 08:56:52.046205+00','0e7176854ed736f40865e1da12f281cdf7238fce644d660e5d6eef9fb495984c'),
('gulfport--howell','2026-08-09 08:56:52.046205+00','6d1577974d61553e10cf04228025b559fed61e301ad6ade71b73ff429ebf24b6'),
('gulfport--john','2026-08-09 08:56:52.046205+00','da32c76f5edbf73edf1dc117dacf7dd29a5a0056165bb0c5a32dfb83307907a0'),
('gulfport--lance','2026-08-09 08:56:52.046205+00','d7794896fbffcb5aba762565954478f66de538003fcbad8357df574a03ddc929'),
('gulfport--lepley','2026-08-09 08:56:52.046205+00','833d77cb2347d0344f000afbab8732228569e29cc390c77c4d26e86ee35efefb'),
('gulfport--mckeegan','2026-08-09 08:56:52.046205+00','a78823c22b8354c7e3511fc80c57e05489fba7c2b86bc6e179c9ee8dfda4722b'),
('gulfport--neal','2026-08-09 08:56:52.046205+00','b878db699c265d847e5ca24288acede55dc2bba5cf10cad12441ddf0136e7a11'),
('gulfport--norma','2026-08-09 08:56:52.046205+00','97da1d1a4614c33bc2da5f74979eda0ba6d65e2c6d86d6982b3ec640e2d387d7'),
('gulfport--paulus','2026-08-09 08:56:52.046205+00','4942a57b06cb58755f049aa081ec60c416b0c28ec87c285b373a0465e8878911'),
('gulfport--ridgetop','2026-08-09 08:56:52.046205+00','4f44533f75b7181ce3aa323cf96b17753c885869fd281e36de838af3dd7b7232'),
('gulfport--robert','2026-08-09 08:56:52.046205+00','dc1c8f0acfbb5c478aa68a6d2ea5d5b9ecca838c64c2c0ba4dbd34d81c1ac7ea'),
('gulfport--schubert','2026-08-09 08:56:52.046205+00','f24a7f6d1e61247868820ab8990c62b7a90f108b0f0e46b598a75d615479f88f'),
('gulfport--schumacher','2026-08-09 08:56:52.046205+00','6b1947bf12425d493ba98ce55101a6976b6043aec692178c07bdfb85e061419d'),
('gulfport--shannon','2026-08-09 08:56:52.046205+00','ca455ce30debdaac5063d2f012a557e9cdca378005fd489a8970c5a180f831f6'),
('gulfport--shimble','2026-08-09 08:56:52.046205+00','5cea8088f25b4e14dd95e67c99fd0b869fa56c616d3f65ac679c2fd3edd21d4e'),
('gulfport--shriver','2026-08-09 08:56:52.046205+00','c3bc5e29ac815496da9ee4222dc59679753a3d8e5b5d9c1f62bfe6030c67cd05'),
('gulfport--starr','2026-08-09 08:56:52.046205+00','7511db3f5a52a371ddbb8b7d5f3ea48448c1f6cacb0f1f441a13a383a62bb5cd'),
('gulfport--starvaggi','2026-08-09 08:56:52.046205+00','44e8be2700d156d3de7fb400aea09d1f5356543561de63ccec2f38dd4d85df54'),
('gulfport--stephens','2026-08-09 08:56:52.046205+00','e651026c9f01a9549a5362cf768386de55016439e9cf69102d0ce488f3a7b183'),
('gulfport--sunset','2026-08-09 08:56:52.046205+00','9a01f1ca6e4fcbda57c390c4bc15e93d3fdde3bbe52fa8013bc2d7acfba01550'),
('gulfport--thompson-south','2026-08-09 08:56:52.046205+00','6cfdf06b11558ade6a4bf562c0b0ade2ef0e4cb645aace7db8dececb6ada9877'),
('gulfport--tiger','2026-08-09 08:56:52.046205+00','5d37470c90a6e10e7f1db28133b52829691a47081ffa01406eee507c152c3617'),
('gulfport--ward','2026-08-09 08:56:52.046205+00','e1bddd7585efea426c2acbeb218a2edeef6c026164b7c4f62de57424adab5b0a'),
('gulfport--ware','2026-08-09 08:56:52.046205+00','afe4e4380b392d67e2f8975c30173f7623701351c20d7eee19174fc2c8e7ef83'),
('gulfport--warrick','2026-08-09 08:56:52.046205+00','b868146e0904a91c9fab43273e47a20624d81a18e64b6dab1fbceabd5c2f7e01'),
('gulfport--watkins','2026-08-09 08:56:52.046205+00','d864fe369faca6384127e293689c3ee77694a0e0d216b5752bd6c3a9941cdd34'),
('gulfport--westhawk','2026-08-09 08:56:52.046205+00','12cc2d55fd1dc82003ac804b6ca614d554e2cacec4848a130b099db6e9ec1752'),
('gulfport--white','2026-08-09 08:56:52.046205+00','c577b2663f6ce73136bcf98e871377eddb205702712fc36f582c73093bdc996b');

do $issue69_hold_assert$
begin
  if (select pg_catalog.count(*) from pg_temp.issue69_safety_hold_seed)<>40 then
    raise exception 'Issue #69 access-credential hold count drift';
  end if;
  if exists (
    select 1
    from pg_temp.issue69_safety_hold_seed s
    left join public.brinesearch_driver_directions_public d on d.legacy_id=s.legacy_id
    where d.pad_id is null or d.directions_clear is null
       or d.source_revision::text<>s.source_revision
       or encode(extensions.digest(pg_catalog.convert_to(d.directions_clear,'UTF8'),'sha256'),'hex')<>s.source_sha256
  ) then
    raise exception 'Issue #69 access-credential hold source/revision drift';
  end if;
end;
$issue69_hold_assert$;

insert into private_verification.brinesearch_driver_safety_facts_issue69(
  pad_id,context_key,display_order,category,direction_scope,driver_text,
  publication_status,source_kind,source_record_id,source_revision,
  source_text_digest,source_excerpt_digest,verification_method
)
select
  d.pad_id,'access-credential-review-hold',32000,'gate_access','pad_access',
  'Access credential requires explicit Owner/operator authorization before structured republish.',
  'private_hold','existing_public_directions',s.legacy_id,s.source_revision,
  s.source_sha256,s.source_sha256,'issue69_private_access_credential_hold_20260811'
from pg_temp.issue69_safety_hold_seed s
join public.brinesearch_driver_directions_public d on d.legacy_id=s.legacy_id;

-- Route-dependent, corrupted, dynamic or otherwise non-separable safety text
-- also fails closed. These source rows remain private review holds until an
-- exact occurrence/source decision is made; the publisher never guesses a
-- replacement fact or silently drops the existing public warning.
drop table if exists pg_temp.issue69_safety_review_hold_seed;
create temporary table issue69_safety_review_hold_seed (
  legacy_id text primary key,
  source_revision text not null,
  source_sha256 text not null
) on commit drop;

insert into pg_temp.issue69_safety_review_hold_seed(
  legacy_id,source_revision,source_sha256
) values
('antero--fuller','2026-08-09 08:56:52.046205+00','de90c3b12437b006bbc9414ab12e5a566dc0a9fd47069184533053d906c05bef'),
('antero--j-anderson','2026-08-09 08:56:52.046205+00','529f29a3f8539635f2ead33f481bc76632d077f21412146557092cf487e5ac07'),
('antero--monroe','2026-08-09 08:56:52.046205+00','544efdcd98a1601cb4b948513be87dcd6df376600476c3ee4436bc69bdef65e8'),
('antero--roe','2026-08-09 08:56:52.046205+00','fb60896c07328806b1242c5288d08ba5951c7615bd2b5442bad3ce8477987d23'),
('antero--urban','2026-08-09 08:56:52.046205+00','963059563cdeb7fed5175b5a476cac14584a214471bac299ada3442b7f443922'),
('ascent--collectors','2026-08-08 03:16:48.985092+00','78f4914f9efe65045408675118ebf44f5bd53e39cc95335ca2654252f9d439a4'),
('ascent--crowell','2026-08-08 03:30:38.123255+00','6c0c24ed74c770259211845a7accf408d19fe1368f775c8942a81b1567c68514'),
('ascent--gabriel','2026-08-08 05:44:51.07988+00','6b8587ee43fcfd77ebfa2fe8d65f914f787e31d20359a244d3e1bacc2d749a40'),
('ascent--harr','2026-08-08 03:18:30.375697+00','c0bae2e1460bf9dd10a2a41393523bb17ffd0efa2af1724dddc29e41970ec9cd'),
('ascent--kaldor','2026-08-08 03:20:22.348206+00','6e1f8b1bd47fa58e97be3540a4fac6d9c17026df3a1b06f393e37ba9bc913550'),
('ascent--kemper','2026-08-08 03:22:26.289416+00','b192d0a1637276db1031f09206fd21e6a9350568c56617688111d5b386b63897'),
('ascent--noelle','2026-08-08 03:36:07.218594+00','0a1438e417fb589b132310423143bf5b698cf7293516553b2ef67e2c40017c59'),
('ascent--sherwood','2026-08-08 03:42:55.658418+00','f5bfb0004fb2ebf12bc2fb697646e7344777166c36d47583152ae7c16e58799d'),
('eog--dulkoski','2026-08-08 07:40:07.730284+00','497bbd1f0ee1ada15c0a3827fcd8b8c59b932c2db16ea58007036152592df8e0'),
('eog--pearley','2026-08-08 07:43:54.752972+00','e12bd1c8c44b3c89b8a5203a6f89f100924d1f96a2c8e29818d85f1b95c0774b'),
('expand--betty-schafer','2026-08-09 08:56:52.046205+00','e41137ae616f8bcc27a2d28c2066e28e21f98d930085d4fd191f31b2874fe41c'),
('expand--gary-kestner','2026-08-09 08:56:52.046205+00','ca94d38ad4b95c24338c55c0009582904bfb1872e41f6d84164f56b22fa5a20d'),
('expand--mark-hickman','2026-08-09 08:56:52.046205+00','20693c59f24794968b61602185435404d0c36a87876c9c8ac287fcbdd1e869ec'),
('expand--mcfrederick-k-up-blt','2026-08-09 08:56:52.046205+00','9ac8929667ee0bb84a31ecd74cf137fbc78bc8340ec11fd9add4b56c42bb5d9a'),
('expand--michael-ratcliffe','2026-08-09 08:56:52.046205+00','524f85220845a69d028aea01c29bedb4e9b28e97a45ce4ea47ed2a0ad3a19f16'),
('expand--thelma-hays','2026-08-09 08:56:52.046205+00','3f37427009bf1fe5e74ee6f58585bc99d25ddc83fe8d2afeecf039b2380a0bce'),
('expand--william-rodgers','2026-08-09 08:56:52.046205+00','3358fa99d21d56b0ac351336cb2b03e9f20225ba45d6f900bfef100e21f980a3'),
('gulfport--starvaggi','2026-08-09 08:56:52.046205+00','44e8be2700d156d3de7fb400aea09d1f5356543561de63ccec2f38dd4d85df54'),
('gulfport--whitacre-702','2026-08-09 08:56:52.046205+00','c92e47f837763adb54f3144478e82839d58aef7aafaaaa4673a926500e14b8b3'),
('lola--sculptor','2026-08-09 08:56:52.046205+00','96b96f6c6fb5e9aa42a25b9e0c4c6df42dcba3d363c778497754b28f6681d745'),
('range--bernard-schultz','2026-08-09 08:56:52.046205+00','553363c5161c8d7bba31e835c1280df926e2e2148198528aa5651709fffb74eb'),
('swn--benard-mcculey','2026-08-09 08:56:52.046205+00','349ff15bd6fc09b8547ced803d0b8cd31cae37e24359d38dd1bcc1f6f61afc18'),
('swn--dmc-east','2026-08-09 08:56:52.046205+00','91b5c2d31a075eca15c0820e7cd2e5fe90178460bbd8e9612859ae4803061683'),
('swn--roy-riggle-ohi','2026-08-09 08:56:52.046205+00','d425976ab386f4c9f5b42b711366a39de71a03411625b176cb7e458c3908b13f');

do $issue69_review_hold_assert$
begin
  if (select pg_catalog.count(*) from pg_temp.issue69_safety_review_hold_seed)<>29 then
    raise exception 'Issue #69 unresolved safety review hold count drift';
  end if;
  if exists (
    select 1
    from pg_temp.issue69_safety_review_hold_seed s
    left join public.brinesearch_driver_directions_public d on d.legacy_id=s.legacy_id
    where d.pad_id is null or d.directions_clear is null
       or d.source_revision::text<>s.source_revision
       or encode(extensions.digest(pg_catalog.convert_to(d.directions_clear,'UTF8'),'sha256'),'hex')<>s.source_sha256
  ) or (
    select pg_catalog.count(*)
    from public.brinesearch_driver_directions_public d
    join pg_temp.issue69_safety_review_hold_seed s on s.legacy_id=d.legacy_id
  )<>29 then
    raise exception 'Issue #69 unresolved safety review hold source/revision drift';
  end if;
end;
$issue69_review_hold_assert$;

insert into private_verification.brinesearch_driver_safety_facts_issue69(
  pad_id,context_key,display_order,category,direction_scope,driver_text,
  publication_status,source_kind,source_record_id,source_revision,
  source_text_digest,source_excerpt_digest,verification_method
)
select
  d.pad_id,'unresolved-safety-context-review-hold',31999,'road_hazard','both',
  'Driver-safety context requires exact occurrence or source review before structured republish.',
  'private_hold','existing_public_directions',s.legacy_id,s.source_revision,
  s.source_sha256,s.source_sha256,'issue69_private_unresolved_safety_context_hold_20260811'
from pg_temp.issue69_safety_review_hold_seed s
join public.brinesearch_driver_directions_public d on d.legacy_id=s.legacy_id;

do $issue69_acl_assert$
declare
  v_options text[];
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid='public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)'::pg_catalog.regprocedure
      and p.prosecdef
      and p.proconfig @> array['search_path=']::text[]
      and pg_catalog.pg_get_userbyid(p.proowner)='postgres'
  ) then
    raise exception 'Issue #69 publisher must be postgres-owned SECURITY DEFINER with an empty search path';
  end if;
  if pg_catalog.has_function_privilege(
       'anon','public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)','EXECUTE'
     )
     or exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))
       ) acl
       where p.oid='public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)'::pg_catalog.regprocedure
         and acl.grantee=0 and acl.privilege_type='EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)','EXECUTE'
     ) then
    raise exception 'Issue #69 publisher ACL invariant failed';
  end if;
  if pg_catalog.has_table_privilege(
       'anon','private_verification.brinesearch_driver_safety_facts_issue69','SELECT'
     ) or pg_catalog.has_table_privilege(
       'authenticated','private_verification.brinesearch_driver_safety_facts_issue69','SELECT'
     ) then
    raise exception 'Issue #69 private safety facts became publicly readable';
  end if;
  select c.reloptions into v_options
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private_verification' and c.relname='public_pad_projection_source';
  if not coalesce('security_invoker=true'=any(v_options),false)
     or not coalesce('security_barrier=true'=any(v_options),false) then
    raise exception 'Issue #69 changed the #73/#81 projection security options';
  end if;
end;
$issue69_acl_assert$;
