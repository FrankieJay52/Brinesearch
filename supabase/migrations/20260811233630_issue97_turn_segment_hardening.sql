-- GitHub #97 — exact #69 boundary preservation can leave an almost-identical
-- source vertex immediately beside the forced exact start/end coordinate. Turn
-- bearings must use the first meaningful road segment, not a sub-meter numeric
-- artifact. Skip vertices until the road is at least 2 m from the junction.

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
  v_prev_n integer;v_curr_n integer;v_i integer;
  v_prev_from extensions.geometry;v_prev_to extensions.geometry;
  v_curr_from extensions.geometry;v_curr_to extensions.geometry;
  v_in double precision;v_out double precision;v_delta double precision;v_turn text;
begin
  if p_previous is null or p_current is null
     or extensions.geometrytype(p_previous)<>'LINESTRING'
     or extensions.geometrytype(p_current)<>'LINESTRING'
     or extensions.st_srid(p_previous)<>4326 or extensions.st_srid(p_current)<>4326 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','missing_adjacent_traveled_geometry');
  end if;
  v_prev_n:=extensions.st_npoints(p_previous);v_curr_n:=extensions.st_npoints(p_current);
  if v_prev_n<2 or v_curr_n<2 then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','insufficient_turn_geometry');
  end if;

  v_prev_to:=extensions.st_pointn(p_previous,v_prev_n);
  v_prev_from:=null;
  for v_i in reverse v_prev_n-1..1 loop
    if extensions.st_distance(
      extensions.st_pointn(p_previous,v_i)::extensions.geography,
      v_prev_to::extensions.geography
    )>=2 then
      v_prev_from:=extensions.st_pointn(p_previous,v_i);
      exit;
    end if;
  end loop;

  v_curr_from:=extensions.st_pointn(p_current,1);
  v_curr_to:=null;
  for v_i in 2..v_curr_n loop
    if extensions.st_distance(
      v_curr_from::extensions.geography,
      extensions.st_pointn(p_current,v_i)::extensions.geography
    )>=2 then
      v_curr_to:=extensions.st_pointn(p_current,v_i);
      exit;
    end if;
  end loop;

  if v_prev_from is null or v_curr_to is null then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','meaningful_turn_segment_unavailable');
  end if;
  v_in:=extensions.st_azimuth(v_prev_from,v_prev_to);
  v_out:=extensions.st_azimuth(v_curr_from,v_curr_to);
  if v_in is null or v_out is null then
    return pg_catalog.jsonb_build_object('resolved',false,'reason','turn_azimuth_unavailable');
  end if;
  v_delta:=degrees(v_out-v_in);
  while v_delta>180 loop v_delta:=v_delta-360; end loop;
  while v_delta<=-180 loop v_delta:=v_delta+360; end loop;
  if abs(v_delta)<=20 then v_turn:='continue';
  elsif v_delta<=-45 then v_turn:='left';
  elsif v_delta>=45 then v_turn:='right';
  else
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','turn_angle_ambiguous',
      'delta_degrees',round(v_delta::numeric,3),
      'minimum_heading_segment_m',2
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'resolved',true,'turn',v_turn,'delta_degrees',round(v_delta::numeric,3),
    'minimum_heading_segment_m',2,
    'selection_uses_nearest_road',false
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_geometry_turn(extensions.geometry,extensions.geometry)
from public,anon,authenticated,service_role;
