-- GitHub #97 — authoritative occurrence geometry instead of legacy canonical centerline dependency.
--
-- Cologie proved that exact road identity + exact junction graph can be complete while
-- the older brinesearch_roads.centerline_geojson field is still empty. Route geometry
-- must therefore come from the authoritative #97 source identity layer, while the
-- canonical road id remains the route-facing identity. For multipart source identities
-- (for example US-250), never pick an arbitrary component: exact start/end coordinates
-- must select one and only one continuous authoritative component.

create or replace function private_verification.brinesearch_issue97_authoritative_identity_geometry(
  p_identity_id uuid
)
returns extensions.geometry
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_identity record;
  v_geom extensions.geometry;
begin
  select i.* into v_identity
  from public.brinesearch_authoritative_road_identities i
  where i.id=p_identity_id and i.active;
  if not found then return null; end if;
  if not private_verification.brinesearch_issue97_identity_route_usable(
    v_identity.public_access_status,v_identity.drivable_status,v_identity.road_class
  ) then return null; end if;
  if not private_verification.brinesearch_issue97_dataset_scope_current(
    v_identity.dataset_id,v_identity.state_code,v_identity.county_code
  ) then return null; end if;

  select extensions.st_linemerge(
    extensions.st_unaryunion(extensions.st_collect(s.geom))
  ) into v_geom
  from private_verification.brinesearch_issue97_authoritative_road_segments_internal s
  where s.identity_id=p_identity_id
    and s.active and s.geom is not null
    and s.public_access_status='public'
    and s.drivable_status='drivable';

  if v_geom is null or extensions.st_isempty(v_geom)
     or extensions.st_dimension(v_geom)<>1
     or not extensions.st_isvalid(v_geom)
     or not extensions.st_coveredby(v_geom,extensions.st_makeenvelope(-180,-90,180,90,4326)) then
    return null;
  end if;
  return v_geom;
end
$$;

create or replace function private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
  p_identity_id uuid
)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    s.source_segment_key||':'||coalesce(s.source_digest,''),',' order by s.source_segment_key
  ),''))
  from private_verification.brinesearch_issue97_authoritative_road_segments_internal s
  where s.identity_id=p_identity_id and s.active and s.geom is not null
    and s.public_access_status='public' and s.drivable_status='drivable'
$$;

create or replace function private_verification.brinesearch_issue97_clip_exact_authoritative_occurrence(
  p_identity_id uuid,
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
  v_digest text;
begin
  if p_start is null or p_end is null
     or extensions.geometrytype(p_start)<>'POINT' or extensions.geometrytype(p_end)<>'POINT'
     or extensions.st_srid(p_start)<>4326 or extensions.st_srid(p_end)<>4326 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','invalid_exact_boundary');
  end if;
  if not exists(
    select 1
    from public.brinesearch_road_identity_mappings m
    join public.brinesearch_roads r on r.id=m.road_id
    where m.identity_id=p_identity_id and m.road_id=p_road_id
      and m.mapping_status='verified' and r.verification_status='verified'
      and not coalesce(r.candidate_only,false)
  ) then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','verified_identity_to_canonical_mapping_missing');
  end if;

  v_master:=private_verification.brinesearch_issue97_authoritative_identity_geometry(p_identity_id);
  v_digest:=private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(p_identity_id);
  if v_master is null or nullif(v_digest,'') is null then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','authoritative_identity_geometry_missing_or_stale');
  end if;

  select count(*) into v_component_count
  from (
    select (d).geom
    from (select extensions.st_dump(extensions.st_linemerge(v_master)) d) q
  ) parts
  where extensions.geometrytype(parts.geom)='LINESTRING'
    and extensions.st_isvalid(parts.geom) and extensions.st_issimple(parts.geom)
    and extensions.st_dwithin(parts.geom::extensions.geography,p_start::extensions.geography,1)
    and extensions.st_dwithin(parts.geom::extensions.geography,p_end::extensions.geography,1);
  if v_component_count=0 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','boundaries_not_on_one_authoritative_component');
  end if;
  if v_component_count>1 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','ambiguous_authoritative_components','component_count',v_component_count);
  end if;

  select parts.geom into strict v_line
  from (
    select (d).geom
    from (select extensions.st_dump(extensions.st_linemerge(v_master)) d) q
  ) parts
  where extensions.geometrytype(parts.geom)='LINESTRING'
    and extensions.st_isvalid(parts.geom) and extensions.st_issimple(parts.geom)
    and extensions.st_dwithin(parts.geom::extensions.geography,p_start::extensions.geography,1)
    and extensions.st_dwithin(parts.geom::extensions.geography,p_end::extensions.geography,1);

  v_start_snap:=extensions.st_closestpoint(v_line,p_start);
  v_end_snap:=extensions.st_closestpoint(v_line,p_end);
  v_start_distance:=extensions.st_distance(p_start::extensions.geography,v_start_snap::extensions.geography);
  v_end_distance:=extensions.st_distance(p_end::extensions.geography,v_end_snap::extensions.geography);
  if v_start_distance>1 or v_end_distance>1 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','boundary_outside_authoritative_tolerance',
      'start_distance_m',round(v_start_distance::numeric,3),'end_distance_m',round(v_end_distance::numeric,3));
  end if;

  v_start_fraction:=extensions.st_linelocatepoint(v_line,v_start_snap);
  v_end_fraction:=extensions.st_linelocatepoint(v_line,v_end_snap);
  if pg_catalog.abs(v_start_fraction-v_end_fraction)<1e-12 then
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

  -- Preserve the already-verified exact graph/pad coordinates as the published
  -- endpoints; source geometry support is still required within one metre.
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
     or not extensions.st_coveredby(v_clip,extensions.st_buffer(v_line::extensions.geography,1)::extensions.geometry) then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','clip_outside_authoritative_support');
  end if;

  v_miles:=round((extensions.st_length(v_clip::extensions.geography)/1609.344)::numeric,6);
  if v_miles<=0 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','zero_length_step');
  end if;
  return pg_catalog.jsonb_build_object(
    'resolved',true,'identity_id',p_identity_id,'road_id',p_road_id,
    'start_coordinate',private_verification.brinesearch_issue97_geometry_point_json(extensions.st_startpoint(v_clip)),
    'end_coordinate',private_verification.brinesearch_issue97_geometry_point_json(extensions.st_endpoint(v_clip)),
    'clipped_geometry',v_clip_geojson,'miles',v_miles,
    'geometry_status','snapped_intersections',
    'geometry_source','authoritative_identity_component_issue97',
    'road_geometry_digest',v_digest,
    'selection_uses_name_similarity',false,'selection_uses_nearest_road',false
  );
end
$$;

-- Transition receipts: keep exact identity + canonical-road membership as the
-- route identity proof, but use current authoritative identity geometry instead
-- of requiring the legacy canonical centerline field to be populated.
do $issue97_patch_transition_authoritative_geometry$
declare
  v_definition text;
  v_old_gate text:=$oldgate$
    elsif v_left.centerline_geojson is null or v_right.centerline_geojson is null
       or coalesce(v_left.canonical_geometry_status,'') not in (
         'official_centerline_loaded','field_confirmed_centerline','owner_verified_complete'
       ) or coalesce(v_right.canonical_geometry_status,'') not in (
         'official_centerline_loaded','field_confirmed_centerline','owner_verified_complete'
       ) then
      v_hold:='canonical_geometry_missing_or_not_publishable';
    else
$oldgate$;
  v_new_gate text:=$newgate$
    else
$newgate$;
  v_old_geom text:=$oldgeom$
      begin
        v_left_geom:=extensions.st_setsrid(
          extensions.st_geomfromgeojson(v_left.centerline_geojson::text),4326
        );
        v_right_geom:=extensions.st_setsrid(
          extensions.st_geomfromgeojson(v_right.centerline_geojson::text),4326
        );
      exception when others then
        v_left_geom:=null;v_right_geom:=null;
      end;
      if v_left_geom is null or v_right_geom is null
         or extensions.st_isempty(v_left_geom) or extensions.st_isempty(v_right_geom)
         or not extensions.st_isvalid(v_left_geom) or not extensions.st_isvalid(v_right_geom)
         or not extensions.st_issimple(v_left_geom) or not extensions.st_issimple(v_right_geom) then
        v_hold:='canonical_geometry_invalid';
      else
$oldgeom$;
  v_new_geom text:=$newgeom$
      v_left_geom:=private_verification.brinesearch_issue97_authoritative_identity_geometry(v_left.identity_id);
      v_right_geom:=private_verification.brinesearch_issue97_authoritative_identity_geometry(v_right.identity_id);
      if v_left_geom is null or v_right_geom is null
         or extensions.st_isempty(v_left_geom) or extensions.st_isempty(v_right_geom)
         or not extensions.st_isvalid(v_left_geom) or not extensions.st_isvalid(v_right_geom)
         or extensions.st_dimension(v_left_geom)<>1 or extensions.st_dimension(v_right_geom)<>1 then
        v_hold:='authoritative_identity_geometry_missing_or_invalid';
      else
$newgeom$;
  v_old_outer text:=$oldouter$
      begin
        v_outer_geom:=extensions.st_setsrid(
          extensions.st_geomfromgeojson(v_left.centerline_geojson::text),4326
        );
      exception when others then
        continue;
      end;
$oldouter$;
  v_new_outer text:=$newouter$
      v_outer_geom:=private_verification.brinesearch_issue97_authoritative_identity_geometry(v_left.identity_id);
      if v_outer_geom is null then continue; end if;
$newouter$;
  v_gate_count integer;v_geom_count integer;v_outer_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_transition_receipts(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  v_gate_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_gate,'')))/pg_catalog.length(v_old_gate);
  v_geom_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_geom,'')))/pg_catalog.length(v_old_geom);
  v_outer_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_outer,'')))/pg_catalog.length(v_old_outer);
  if v_gate_count<>1 or v_geom_count<>1 or v_outer_count<>1 then
    raise exception 'Issue #97 authoritative transition geometry patch changed unexpectedly: gate=% geom=% outer=%',v_gate_count,v_geom_count,v_outer_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old_gate,v_new_gate);
  v_definition:=pg_catalog.replace(v_definition,v_old_geom,v_new_geom);
  v_definition:=pg_catalog.replace(v_definition,v_old_outer,v_new_outer);
  execute v_definition;
end
$issue97_patch_transition_authoritative_geometry$;

-- Occurrence geometry: use the same authoritative identity component/digest for
-- clipping and for the final pad-on-road proof. Canonical road id remains stored.
do $issue97_patch_occurrence_authoritative_geometry$
declare
  v_definition text;
  v_old_digest text:=$olddigest$
    v_road_digest:=case when v_road.centerline_geojson is null then null else md5(v_road.centerline_geojson::text) end;
$olddigest$;
  v_new_digest text:=$newdigest$
    v_road_digest:=private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(v_occ.identity_id);
$newdigest$;
  v_old_final text:=$oldfinal$
        if v_pad_point is null then v_hold:='verified_pad_gps_missing_or_invalid';
        elsif v_road.centerline_geojson is null then v_hold:='final_road_geometry_missing';
        else
          begin v_master:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_road.centerline_geojson::text),4326);
          exception when others then v_master:=null; end;
          if v_master is null or not extensions.st_dwithin(v_master::extensions.geography,v_pad_point::extensions.geography,1) then
            v_hold:='verified_pad_gps_not_on_final_canonical_geometry';
          else v_end:=v_pad_point; end if;
        end if;
$oldfinal$;
  v_new_final text:=$newfinal$
        if v_pad_point is null then v_hold:='verified_pad_gps_missing_or_invalid';
        else
          v_master:=private_verification.brinesearch_issue97_authoritative_identity_geometry(v_occ.identity_id);
          if v_master is null or not extensions.st_dwithin(v_master::extensions.geography,v_pad_point::extensions.geography,1) then
            v_hold:='verified_pad_gps_not_on_final_authoritative_geometry';
          else v_end:=v_pad_point; end if;
        end if;
$newfinal$;
  v_old_clip text:='v_clip:=private_verification.brinesearch_issue97_clip_exact_road_occurrence(v_occ.canonical_road_id,v_start,v_end);';
  v_new_clip text:='v_clip:=private_verification.brinesearch_issue97_clip_exact_authoritative_occurrence(v_occ.identity_id,v_occ.canonical_road_id,v_start,v_end);';
  v_digest_count integer;v_final_count integer;v_clip_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_route_geometry(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  v_digest_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_digest,'')))/pg_catalog.length(v_old_digest);
  v_final_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_final,'')))/pg_catalog.length(v_old_final);
  v_clip_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_clip,'')))/pg_catalog.length(v_old_clip);
  if v_digest_count<>1 or v_final_count<>1 or v_clip_count<>1 then
    raise exception 'Issue #97 authoritative occurrence geometry patch changed unexpectedly: digest=% final=% clip=%',v_digest_count,v_final_count,v_clip_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old_digest,v_new_digest);
  v_definition:=pg_catalog.replace(v_definition,v_old_final,v_new_final);
  v_definition:=pg_catalog.replace(v_definition,v_old_clip,v_new_clip);
  execute v_definition;
end
$issue97_patch_occurrence_authoritative_geometry$;

revoke all on function private_verification.brinesearch_issue97_authoritative_identity_geometry(uuid)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(uuid)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_clip_exact_authoritative_occurrence(uuid,uuid,extensions.geometry,extensions.geometry)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_refresh_transition_receipts(uuid)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_refresh_route_geometry(uuid)
from public,anon,authenticated,service_role;

comment on function private_verification.brinesearch_issue97_clip_exact_authoritative_occurrence(uuid,uuid,extensions.geometry,extensions.geometry) is
  'Issue #97 exact occurrence clip. Canonical road id remains route-facing, but current authoritative identity segments provide geometry. Both exact boundaries must identify one unique continuous simple component; no name/nearest-road component selection is allowed.';
