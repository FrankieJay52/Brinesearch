-- GitHub #97 — automatic exact occurrence geography after identity + junction proof.
--
-- Route Prep sequences use their first road as the highway/road origin anchor:
-- ready_for_road_matching routes carry a highway anchor and no first-step turn
-- or mileage. The origin occurrence is therefore pinned to the first exact
-- transition without inventing upstream travel. Every later occurrence is a
-- true traveled road leg clipped only between exact #97 graph boundaries. The
-- final verified pad GPS is accepted as the final road endpoint only when it is
-- actually supported by that exact canonical Road Manager geometry within the
-- same 1 m tolerance used by #69. Otherwise the route is held for endpoint QA.

create table private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 (
  route_prep_step_id uuid primary key references public.brinesearch_route_prep_steps(id) on delete cascade,
  route_prep_id uuid not null references public.brinesearch_route_prep(id) on delete cascade,
  pad_id uuid not null references public.pads(id) on delete cascade,
  route_group text not null,
  variant_index integer not null,
  occurrence_index integer not null,
  source_step_order integer not null,
  occurrence_role text not null,
  identity_id uuid not null references public.brinesearch_authoritative_road_identities(id) on delete restrict,
  road_id uuid not null references public.brinesearch_roads(id) on delete restrict,
  status text not null,
  geometry_method text,
  hold_reason text,
  start_coordinate extensions.geometry(Point,4326),
  end_coordinate extensions.geometry(Point,4326),
  step_geometry extensions.geometry(LineString,4326),
  geometry_miles numeric(12,6),
  outbound_turn text,
  inbound_turn text,
  turn_source text,
  turn_delta_degrees numeric(9,3),
  road_geometry_digest text,
  start_transition_digest text,
  end_transition_digest text,
  pad_coordinate_digest text,
  dependency_digest text not null,
  evidence jsonb not null default '{}'::jsonb,
  receipt_digest text not null,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(route_prep_id,occurrence_index),
  constraint brinesearch_route_occurrence_geometry_role_issue97_check
    check(occurrence_role in ('origin_anchor','traveled')),
  constraint brinesearch_route_occurrence_geometry_status_issue97_check
    check(status in ('resolved','held','stale')),
  constraint brinesearch_route_occurrence_geometry_method_issue97_check
    check(coalesce(geometry_method,'') not in ('name_only','fuzzy_name','nearest_road','nearest_point','route_number_only')),
  constraint brinesearch_route_occurrence_geometry_resolved_issue97_check check(
    status<>'resolved' or (
      start_coordinate is not null and end_coordinate is not null
      and resolved_at is not null and road_geometry_digest is not null
      and (
        (occurrence_role='origin_anchor' and step_geometry is null and geometry_miles=0)
        or
        (occurrence_role='traveled' and step_geometry is not null and geometry_miles>0
          and outbound_turn is not null and inbound_turn is not null)
      )
    )
  ),
  constraint brinesearch_route_occurrence_geometry_held_issue97_check
    check(status<>'held' or nullif(hold_reason,'') is not null),
  constraint brinesearch_route_occurrence_geometry_digest_issue97_check
    check(dependency_digest~'^[0-9a-f]{32}$' and receipt_digest~'^[0-9a-f]{32}$')
);

create index brinesearch_route_occurrence_geometry_status_issue97_idx
on private_verification.brinesearch_route_occurrence_geometry_receipts_issue97(status,hold_reason);
create index brinesearch_route_occurrence_geometry_pad_issue97_idx
on private_verification.brinesearch_route_occurrence_geometry_receipts_issue97(pad_id,route_group,variant_index,occurrence_index);

create table private_verification.brinesearch_route_occurrence_geometry_history_issue97 (
  id bigint generated always as identity primary key,
  route_prep_step_id uuid not null,
  route_prep_id uuid not null,
  pad_id uuid not null,
  route_group text not null,
  variant_index integer not null,
  occurrence_index integer not null,
  source_step_order integer not null,
  occurrence_role text not null,
  identity_id uuid not null,
  road_id uuid not null,
  status text not null,
  geometry_method text,
  hold_reason text,
  start_coordinate jsonb,
  end_coordinate jsonb,
  step_geometry jsonb,
  geometry_miles numeric(12,6),
  outbound_turn text,
  inbound_turn text,
  turn_source text,
  turn_delta_degrees numeric(9,3),
  road_geometry_digest text,
  start_transition_digest text,
  end_transition_digest text,
  pad_coordinate_digest text,
  dependency_digest text not null,
  evidence jsonb not null,
  receipt_digest text not null,
  recorded_at timestamptz not null default now(),
  unique(route_prep_step_id,receipt_digest)
);

alter table private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 enable row level security;
alter table private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 force row level security;
alter table private_verification.brinesearch_route_occurrence_geometry_history_issue97 enable row level security;
alter table private_verification.brinesearch_route_occurrence_geometry_history_issue97 force row level security;
revoke all on private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 from public,anon,authenticated,service_role;
revoke all on private_verification.brinesearch_route_occurrence_geometry_history_issue97 from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_geometry_point_json(p_point extensions.geometry)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select case when p_point is null then null else
    pg_catalog.jsonb_build_array(extensions.st_x(p_point),extensions.st_y(p_point)) end
$$;

create or replace function private_verification.brinesearch_issue97_clip_exact_road_occurrence(
  p_road_id uuid,
  p_start extensions.geometry,
  p_end extensions.geometry
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_road record;
  v_master extensions.geometry;
  v_line extensions.geometry;
  v_start_snap extensions.geometry;
  v_end_snap extensions.geometry;
  v_start_fraction double precision;
  v_end_fraction double precision;
  v_clip extensions.geometry;
  v_clip_geojson jsonb;
  v_component_count integer:=0;
  v_start_distance double precision;
  v_end_distance double precision;
  v_miles numeric;
begin
  if p_start is null or p_end is null
     or extensions.geometrytype(p_start)<>'POINT' or extensions.geometrytype(p_end)<>'POINT'
     or extensions.st_srid(p_start)<>4326 or extensions.st_srid(p_end)<>4326 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','invalid_exact_boundary');
  end if;
  select r.* into v_road from public.brinesearch_roads r where r.id=p_road_id;
  if not found or coalesce(v_road.candidate_only,false) then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','road_manager_road_not_publishable');
  end if;
  if coalesce(v_road.geometry_status,'') not in (
    'official_centerline_loaded','field_confirmed_centerline','owner_verified_complete'
  ) then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','road_geometry_not_complete');
  end if;
  if v_road.centerline_geojson is null then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','road_geometry_missing');
  end if;
  begin
    v_master:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_road.centerline_geojson::text),4326);
  exception when others then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','road_geometry_invalid');
  end;
  if extensions.st_isempty(v_master)
     or extensions.geometrytype(v_master) not in ('LINESTRING','MULTILINESTRING')
     or not extensions.st_isvalid(v_master) or not extensions.st_issimple(v_master)
     or not extensions.st_coveredby(v_master,extensions.st_makeenvelope(-180,-90,180,90,4326)) then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','road_geometry_invalid');
  end if;

  select count(*) into v_component_count
  from (select (d).geom from (select extensions.st_dump(extensions.st_linemerge(v_master)) d) q) parts
  where extensions.geometrytype(parts.geom)='LINESTRING'
    and extensions.st_isvalid(parts.geom) and extensions.st_issimple(parts.geom)
    and extensions.st_dwithin(parts.geom::extensions.geography,p_start::extensions.geography,1)
    and extensions.st_dwithin(parts.geom::extensions.geography,p_end::extensions.geography,1);
  if v_component_count=0 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','boundaries_not_on_one_continuous_road_component');
  end if;
  if v_component_count>1 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','ambiguous_continuous_road_components','component_count',v_component_count);
  end if;
  select parts.geom into strict v_line
  from (select (d).geom from (select extensions.st_dump(extensions.st_linemerge(v_master)) d) q) parts
  where extensions.geometrytype(parts.geom)='LINESTRING'
    and extensions.st_isvalid(parts.geom) and extensions.st_issimple(parts.geom)
    and extensions.st_dwithin(parts.geom::extensions.geography,p_start::extensions.geography,1)
    and extensions.st_dwithin(parts.geom::extensions.geography,p_end::extensions.geography,1);

  v_start_snap:=extensions.st_closestpoint(v_line,p_start);
  v_end_snap:=extensions.st_closestpoint(v_line,p_end);
  v_start_distance:=extensions.st_distance(p_start::extensions.geography,v_start_snap::extensions.geography);
  v_end_distance:=extensions.st_distance(p_end::extensions.geography,v_end_snap::extensions.geography);
  if v_start_distance>1 or v_end_distance>1 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','boundary_outside_publisher_tolerance',
      'start_distance_m',round(v_start_distance::numeric,3),'end_distance_m',round(v_end_distance::numeric,3));
  end if;
  v_start_fraction:=extensions.st_linelocatepoint(v_line,v_start_snap);
  v_end_fraction:=extensions.st_linelocatepoint(v_line,v_end_snap);
  if abs(v_start_fraction-v_end_fraction)<1e-12 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','zero_length_step');
  end if;
  if v_start_fraction<v_end_fraction then
    v_clip:=extensions.st_linesubstring(v_line,v_start_fraction,v_end_fraction);
  else
    v_clip:=extensions.st_reverse(extensions.st_linesubstring(v_line,v_end_fraction,v_start_fraction));
  end if;
  if v_clip is null or extensions.st_isempty(v_clip) or extensions.st_npoints(v_clip)<2 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','clip_failed');
  end if;
  v_clip:=extensions.st_setpoint(v_clip,0,p_start);
  v_clip:=extensions.st_setpoint(v_clip,extensions.st_npoints(v_clip)-1,p_end);
  begin
    v_clip_geojson:=extensions.st_asgeojson(v_clip,15)::jsonb;
    v_clip:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_clip_geojson::text),4326);
  exception when others then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','clip_precision_canonicalization_failed');
  end;
  if not extensions.st_isvalid(v_clip) or not extensions.st_issimple(v_clip)
     or extensions.st_equals(extensions.st_startpoint(v_clip),extensions.st_endpoint(v_clip))
     or not extensions.st_coveredby(v_clip,extensions.st_buffer(v_master::extensions.geography,1)::extensions.geometry) then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','clip_outside_road_manager_support');
  end if;
  v_miles:=round((extensions.st_length(v_clip::extensions.geography)/1609.344)::numeric,6);
  if v_miles<=0 then return pg_catalog.jsonb_build_object('resolved',false,'reason','zero_length_step'); end if;
  return pg_catalog.jsonb_build_object(
    'resolved',true,'road_id',p_road_id,'start_coordinate',private_verification.brinesearch_issue97_geometry_point_json(extensions.st_startpoint(v_clip)),
    'end_coordinate',private_verification.brinesearch_issue97_geometry_point_json(extensions.st_endpoint(v_clip)),
    'clipped_geometry',v_clip_geojson,'miles',v_miles,
    'geometry_status','snapped_intersections','geometry_source','road_manager_clip_issue69_equivalent',
    'road_geometry_digest',md5(v_road.centerline_geojson::text)
  );
end
$$;

create or replace function private_verification.brinesearch_issue97_normalize_saved_turn(p_maneuver text)
returns text
language sql
immutable
set search_path=''
as $$
  select case pg_catalog.lower(coalesce(p_maneuver,''))
    when 'turn_left' then 'left'
    when 'turn_right' then 'right'
    when 'continue' then 'continue'
    when 'straight' then 'continue'
    when 'follow' then 'continue'
    when 'stay_left' then 'left'
    when 'stay_right' then 'right'
    else null end
$$;

create or replace function private_verification.brinesearch_issue97_reverse_turn(p_turn text)
returns text
language sql
immutable
set search_path=''
as $$
  select case p_turn when 'left' then 'right' when 'right' then 'left'
    when 'continue' then 'continue' else null end
$$;

create or replace function private_verification.brinesearch_issue97_geometry_turn(
  p_previous extensions.geometry,
  p_current extensions.geometry
)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  v_prev_n integer;v_curr_n integer;v_in double precision;v_out double precision;
  v_delta double precision;v_turn text;
begin
  if p_previous is null or p_current is null
     or extensions.geometrytype(p_previous)<>'LINESTRING' or extensions.geometrytype(p_current)<>'LINESTRING' then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','missing_adjacent_traveled_geometry');
  end if;
  v_prev_n:=extensions.st_npoints(p_previous);v_curr_n:=extensions.st_npoints(p_current);
  if v_prev_n<2 or v_curr_n<2 then return pg_catalog.jsonb_build_object('resolved',false,'reason','insufficient_turn_geometry'); end if;
  v_in:=extensions.st_azimuth(extensions.st_pointn(p_previous,v_prev_n-1),extensions.st_pointn(p_previous,v_prev_n));
  v_out:=extensions.st_azimuth(extensions.st_pointn(p_current,1),extensions.st_pointn(p_current,2));
  if v_in is null or v_out is null then return pg_catalog.jsonb_build_object('resolved',false,'reason','turn_azimuth_unavailable'); end if;
  v_delta:=degrees(v_out-v_in);
  while v_delta>180 loop v_delta:=v_delta-360; end loop;
  while v_delta<=-180 loop v_delta:=v_delta+360; end loop;
  if abs(v_delta)<=20 then v_turn:='continue';
  elsif v_delta<=-45 then v_turn:='left';
  elsif v_delta>=45 then v_turn:='right';
  else return pg_catalog.jsonb_build_object('resolved',false,'reason','turn_angle_ambiguous','delta_degrees',round(v_delta::numeric,3)); end if;
  return pg_catalog.jsonb_build_object('resolved',true,'turn',v_turn,'delta_degrees',round(v_delta::numeric,3));
end
$$;

revoke all on function private_verification.brinesearch_issue97_geometry_point_json(extensions.geometry) from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_clip_exact_road_occurrence(uuid,extensions.geometry,extensions.geometry) from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_normalize_saved_turn(text) from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_reverse_turn(text) from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_geometry_turn(extensions.geometry,extensions.geometry) from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_write_geometry_history(p_step_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into private_verification.brinesearch_route_occurrence_geometry_history_issue97(
    route_prep_step_id,route_prep_id,pad_id,route_group,variant_index,occurrence_index,source_step_order,
    occurrence_role,identity_id,road_id,status,geometry_method,hold_reason,start_coordinate,end_coordinate,
    step_geometry,geometry_miles,outbound_turn,inbound_turn,turn_source,turn_delta_degrees,road_geometry_digest,
    start_transition_digest,end_transition_digest,pad_coordinate_digest,dependency_digest,evidence,receipt_digest
  )
  select route_prep_step_id,route_prep_id,pad_id,route_group,variant_index,occurrence_index,source_step_order,
    occurrence_role,identity_id,road_id,status,geometry_method,hold_reason,
    private_verification.brinesearch_issue97_geometry_point_json(start_coordinate),
    private_verification.brinesearch_issue97_geometry_point_json(end_coordinate),
    case when step_geometry is null then null else extensions.st_asgeojson(step_geometry,15)::jsonb end,
    geometry_miles,outbound_turn,inbound_turn,turn_source,turn_delta_degrees,road_geometry_digest,
    start_transition_digest,end_transition_digest,pad_coordinate_digest,dependency_digest,evidence,receipt_digest
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97
  where route_prep_step_id=p_step_id
  on conflict(route_prep_step_id,receipt_digest) do nothing;
end
$$;
revoke all on function private_verification.brinesearch_issue97_write_geometry_history(uuid) from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_refresh_route_geometry(p_route_prep_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_route record;v_pad record;v_count integer:=0;v_i integer;v_occ record;v_road record;
  v_start_transition record;v_end_transition record;v_start extensions.geometry;v_end extensions.geometry;
  v_pad_point extensions.geometry;v_master extensions.geometry;v_clip jsonb;v_step_geom extensions.geometry;
  v_prev_geom extensions.geometry;v_turn_json jsonb;v_saved_maneuver text;v_saved_turn text;v_turn text;v_reverse text;
  v_delta numeric;v_turn_source text;v_hold text;v_role text;v_method text;v_miles numeric;v_road_digest text;
  v_start_digest text;v_end_digest text;v_pad_digest text;v_dependency text;v_evidence jsonb;v_receipt text;
begin
  select p.* into strict v_route from public.brinesearch_route_prep p where p.id=p_route_prep_id;
  select pad.* into strict v_pad from public.pads pad where pad.id=v_route.pad_id;
  delete from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 where route_prep_id=p_route_prep_id;
  if not v_route.active then return pg_catalog.jsonb_build_object('status','stale'); end if;
  select count(*) into v_count from private_verification.brinesearch_route_occurrence_receipts_issue97 where route_prep_id=p_route_prep_id;
  if v_route.readiness_status<>'ready_for_road_matching' then
    return pg_catalog.jsonb_build_object('status','held','reason','route_prep_not_ready_for_road_matching');
  end if;
  if v_count<2 then return pg_catalog.jsonb_build_object('status','held','reason','single_or_empty_road_sequence_requires_explicit_endpoints'); end if;
  if exists(select 1 from private_verification.brinesearch_route_occurrence_receipts_issue97 r where r.route_prep_id=p_route_prep_id and (r.resolution_status<>'resolved' or r.canonical_road_id is null)) then
    return pg_catalog.jsonb_build_object('status','held','reason','authoritative_occurrence_identity_incomplete');
  end if;
  if (select count(*) from private_verification.brinesearch_route_transition_receipts_issue97 t where t.route_prep_id=p_route_prep_id and t.status='resolved')<>v_count-1 then
    return pg_catalog.jsonb_build_object('status','held','reason','exact_transition_receipts_incomplete');
  end if;
  if nullif(btrim(coalesce(v_route.highway_anchor_text,'')),'') is null then
    return pg_catalog.jsonb_build_object('status','held','reason','origin_highway_anchor_missing');
  end if;

  if v_pad.latitude between -90 and 90 and v_pad.longitude between -180 and 180 then
    v_pad_point:=extensions.st_setsrid(extensions.st_makepoint(v_pad.longitude,v_pad.latitude),4326);
    v_pad_digest:=md5(pg_catalog.concat_ws('|',v_pad.longitude::text,v_pad.latitude::text));
  else
    v_pad_point:=null;v_pad_digest:=null;
  end if;

  for v_i in 1..v_count loop
    select r.*,s.distance_miles,s.turn_direction into strict v_occ
    from private_verification.brinesearch_route_occurrence_receipts_issue97 r
    join public.brinesearch_route_prep_steps s on s.id=r.route_prep_step_id
    where r.route_prep_id=p_route_prep_id and r.occurrence_index=v_i;
    select road.* into strict v_road from public.brinesearch_roads road where road.id=v_occ.canonical_road_id;
    v_road_digest:=case when v_road.centerline_geojson is null then null else md5(v_road.centerline_geojson::text) end;
    v_start:=null;v_end:=null;v_step_geom:=null;v_miles:=null;v_hold:=null;v_turn:=null;v_reverse:=null;
    v_delta:=null;v_turn_source:=null;v_start_digest:=null;v_end_digest:=null;v_method:=null;v_evidence:='{}'::jsonb;

    if v_i=1 then
      select * into strict v_end_transition from private_verification.brinesearch_route_transition_receipts_issue97 where route_prep_id=p_route_prep_id and boundary_index=1 and status='resolved';
      if v_occ.distance_miles is not null and v_occ.distance_miles>0 or nullif(btrim(coalesce(v_occ.turn_direction,'')),'') is not null then
        v_hold:='origin_occurrence_contains_travel_evidence_requires_explicit_start';
        v_role:='origin_anchor';v_start:=v_end_transition.coordinate;v_end:=v_end_transition.coordinate;
      else
        v_role:='origin_anchor';v_start:=v_end_transition.coordinate;v_end:=v_end_transition.coordinate;
        v_miles:=0;v_method:='origin_anchor_exact_first_transition';v_end_digest:=v_end_transition.receipt_digest;
      end if;
    else
      v_role:='traveled';
      select * into strict v_start_transition from private_verification.brinesearch_route_transition_receipts_issue97 where route_prep_id=p_route_prep_id and boundary_index=v_i-1 and status='resolved';
      v_start:=v_start_transition.coordinate;v_start_digest:=v_start_transition.receipt_digest;
      if v_i<v_count then
        select * into strict v_end_transition from private_verification.brinesearch_route_transition_receipts_issue97 where route_prep_id=p_route_prep_id and boundary_index=v_i and status='resolved';
        v_end:=v_end_transition.coordinate;v_end_digest:=v_end_transition.receipt_digest;
      else
        if v_pad_point is null then v_hold:='verified_pad_gps_missing_or_invalid';
        elsif v_road.centerline_geojson is null then v_hold:='final_road_geometry_missing';
        else
          begin v_master:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_road.centerline_geojson::text),4326);
          exception when others then v_master:=null; end;
          if v_master is null or not extensions.st_dwithin(v_master::extensions.geography,v_pad_point::extensions.geography,1) then
            v_hold:='verified_pad_gps_not_on_final_canonical_geometry';
          else v_end:=v_pad_point; end if;
        end if;
      end if;

      if v_hold is null then
        v_clip:=private_verification.brinesearch_issue97_clip_exact_road_occurrence(v_occ.canonical_road_id,v_start,v_end);
        if not coalesce((v_clip->>'resolved')::boolean,false) then v_hold:='clip_'||coalesce(v_clip->>'reason','failed');
        else
          v_step_geom:=extensions.st_setsrid(extensions.st_geomfromgeojson((v_clip->'clipped_geometry')::text),4326);
          v_miles:=(v_clip->>'miles')::numeric;v_method:='issue69_equivalent_exact_component_clip';
        end if;
      end if;

      if v_hold is null then
        select d.maneuver_class into v_saved_maneuver from public.brinesearch_direction_step_intelligence d
        where d.pad_id=v_route.pad_id and d.step_order=v_occ.source_step_order limit 1;
        v_saved_turn:=private_verification.brinesearch_issue97_normalize_saved_turn(coalesce(v_occ.turn_direction,v_saved_maneuver));
        if v_i=2 then
          if v_saved_turn is null then v_hold:='origin_turn_direction_not_authoritative';
          else v_turn:=v_saved_turn;v_turn_source:='saved_direction_step_intelligence'; end if;
        else
          select step_geometry into v_prev_geom from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97
          where route_prep_id=p_route_prep_id and occurrence_index=v_i-1 and status='resolved' and occurrence_role='traveled';
          v_turn_json:=private_verification.brinesearch_issue97_geometry_turn(v_prev_geom,v_step_geom);
          if not coalesce((v_turn_json->>'resolved')::boolean,false) then v_hold:='geometry_'||coalesce(v_turn_json->>'reason','turn_unresolved');
          else
            v_turn:=v_turn_json->>'turn';v_delta=(v_turn_json->>'delta_degrees')::numeric;v_turn_source:='exact_adjacent_step_geometry';
            if v_saved_turn is not null and v_saved_turn<>v_turn then v_hold:='geometry_turn_conflicts_saved_direction'; end if;
          end if;
        end if;
        if v_hold is null then v_reverse:=private_verification.brinesearch_issue97_reverse_turn(v_turn); end if;
      end if;
    end if;

    v_dependency:=md5(pg_catalog.concat_ws('|',v_occ.receipt_digest,v_road_digest,coalesce(v_start_digest,''),coalesce(v_end_digest,''),coalesce(v_pad_digest,''),coalesce(v_method,''),coalesce(v_hold,''),coalesce(v_turn,''),coalesce(v_reverse,'')));
    v_evidence:=v_evidence||pg_catalog.jsonb_build_object('occurrence_role',v_role,'road_geometry_status',v_road.geometry_status,'saved_maneuver',v_saved_maneuver,'turn_source',v_turn_source,'clip_receipt',coalesce(v_clip,'{}'::jsonb),'pad_endpoint_tolerance_m',case when v_i=v_count then 1 else null end,'selection_uses_nearest_road',false,'selection_uses_name_similarity',false);
    v_receipt:=md5(pg_catalog.concat_ws('|',v_dependency,case when v_hold is null then 'resolved' else 'held' end,coalesce(v_hold,''),coalesce(v_miles::text,''),coalesce(v_turn,''),coalesce(v_evidence::text,'{}')));

    insert into private_verification.brinesearch_route_occurrence_geometry_receipts_issue97(
      route_prep_step_id,route_prep_id,pad_id,route_group,variant_index,occurrence_index,source_step_order,occurrence_role,identity_id,road_id,status,geometry_method,hold_reason,start_coordinate,end_coordinate,step_geometry,geometry_miles,outbound_turn,inbound_turn,turn_source,turn_delta_degrees,road_geometry_digest,start_transition_digest,end_transition_digest,pad_coordinate_digest,dependency_digest,evidence,receipt_digest,resolved_at
    ) values(v_occ.route_prep_step_id,p_route_prep_id,v_route.pad_id,v_route.route_group,v_route.variant_index,v_i,v_occ.source_step_order,v_role,v_occ.identity_id,v_occ.canonical_road_id,case when v_hold is null then 'resolved' else 'held' end,v_method,v_hold,v_start,v_end,v_step_geom,coalesce(v_miles,case when v_role='origin_anchor' and v_hold is null then 0 else null end),v_turn,v_reverse,v_turn_source,v_delta,v_road_digest,v_start_digest,v_end_digest,v_pad_digest,v_dependency,v_evidence,v_receipt,case when v_hold is null then now() else null end);
    perform private_verification.brinesearch_issue97_write_geometry_history(v_occ.route_prep_step_id);
  end loop;

  return pg_catalog.jsonb_build_object('route_prep_id',p_route_prep_id,'occurrences',v_count,
    'resolved',(select count(*) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 where route_prep_id=p_route_prep_id and status='resolved'),
    'held',(select count(*) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 where route_prep_id=p_route_prep_id and status='held'),
    'holds_by_reason',coalesce((select jsonb_object_agg(hold_reason,cnt order by hold_reason) from (select hold_reason,count(*) cnt from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 where route_prep_id=p_route_prep_id and status='held' group by hold_reason) q),'{}'::jsonb));
end
$$;
revoke all on function private_verification.brinesearch_issue97_refresh_route_geometry(uuid) from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_geometry_metrics_json()
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'geometry_receipts',(select count(*) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g join public.brinesearch_route_prep p on p.id=g.route_prep_id where p.active),
 'resolved_geometry_occurrences',(select count(*) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g join public.brinesearch_route_prep p on p.id=g.route_prep_id where p.active and g.status='resolved'),
 'held_geometry_occurrences',(select count(*) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g join public.brinesearch_route_prep p on p.id=g.route_prep_id where p.active and g.status='held'),
 'resolved_traveled_legs',(select count(*) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g join public.brinesearch_route_prep p on p.id=g.route_prep_id where p.active and g.status='resolved' and g.occurrence_role='traveled'),
 'holds_by_reason',coalesce((select jsonb_object_agg(hold_reason,cnt order by hold_reason) from (select g.hold_reason,count(*) cnt from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g join public.brinesearch_route_prep p on p.id=g.route_prep_id where p.active and g.status='held' group by g.hold_reason) q),'{}'::jsonb),
 'forbidden_method_count',(select count(*) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 where geometry_method in ('name_only','fuzzy_name','nearest_road','nearest_point','route_number_only'))
)
$$;
revoke all on function private_verification.brinesearch_issue97_geometry_metrics_json() from public,anon,authenticated,service_role;

create or replace function public.brinesearch_issue97_run_all_pad_routing_pipeline(p_pad_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_identity jsonb;v_route record;v_routes integer:=0;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97));
  v_identity:=public.brinesearch_issue97_reconcile_route_corpus(p_pad_id);
  for v_route in select id from public.brinesearch_route_prep where active and (p_pad_id is null or pad_id=p_pad_id) order by pad_id,route_group,variant_index,id loop
    perform private_verification.brinesearch_issue97_refresh_transition_receipts(v_route.id);
    perform private_verification.brinesearch_issue97_refresh_route_geometry(v_route.id);
    perform private_verification.brinesearch_issue97_refresh_route_receipt(v_route.id);
    v_routes:=v_routes+1;
  end loop;
  return v_identity||private_verification.brinesearch_issue97_transition_metrics_json()||private_verification.brinesearch_issue97_geometry_metrics_json()||jsonb_build_object('pipeline_routes_processed',v_routes);
end
$$;
revoke all on function public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid) from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid) to service_role;

create or replace function public.brinesearch_issue97_geometry_metrics()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not public.is_brinesearch_editor(auth.uid()) then raise exception 'Road Manager editor access is required'; end if; return private_verification.brinesearch_issue97_geometry_metrics_json(); end
$$;
revoke all on function public.brinesearch_issue97_geometry_metrics() from public,anon;
grant execute on function public.brinesearch_issue97_geometry_metrics() to authenticated;

create or replace function public.brinesearch_issue97_geometry_exception_queue(p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,200),500));v_rows jsonb;
begin
 if not public.is_brinesearch_editor(auth.uid()) then raise exception 'Road Manager editor access is required'; end if;
 select coalesce(jsonb_agg(item order by item->>'company',item->>'pad_name',(item->>'variant_index')::integer,(item->>'occurrence_index')::integer),'[]'::jsonb) into v_rows from (
  select jsonb_build_object('route_prep_step_id',g.route_prep_step_id,'route_prep_id',g.route_prep_id,'pad_id',g.pad_id,'pad_name',p.pad_name,'company',p.company,'state',p.state,'route_group',g.route_group,'variant_index',g.variant_index,'occurrence_index',g.occurrence_index,'source_step_order',g.source_step_order,'occurrence_role',g.occurrence_role,'road_id',g.road_id,'identity_id',g.identity_id,'hold_reason',g.hold_reason,'start_coordinate',private_verification.brinesearch_issue97_geometry_point_json(g.start_coordinate),'end_coordinate',private_verification.brinesearch_issue97_geometry_point_json(g.end_coordinate),'evidence',g.evidence) item
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g join public.pads p on p.id=g.pad_id join public.brinesearch_route_prep rp on rp.id=g.route_prep_id and rp.active where g.status='held' order by p.company,p.pad_name,g.variant_index,g.occurrence_index limit v_limit
 ) q;
 return jsonb_build_object('metrics',private_verification.brinesearch_issue97_geometry_metrics_json(),'geometry_exceptions',v_rows,'manual_map_editor_role','review_exception_qa_only');
end
$$;
revoke all on function public.brinesearch_issue97_geometry_exception_queue(integer) from public,anon;
grant execute on function public.brinesearch_issue97_geometry_exception_queue(integer) to authenticated;

comment on function public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid) is
  'Issue #97 service-only automatic route pipeline: exact identities, exact physical transitions, then exact occurrence geometry/mileage. It never opens browser/manual geometry construction.';
comment on function public.brinesearch_issue97_geometry_exception_queue(integer) is
  'Issue #97 editor-only geography hold queue. Final pad endpoints not proven on the exact final canonical road remain exceptions rather than nearest-road guesses.';
