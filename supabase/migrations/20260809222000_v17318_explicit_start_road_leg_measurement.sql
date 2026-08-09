-- BrineSearch V17.3.18
-- Extend safe road-leg measurement to first legs only when the saved instruction
-- names an explicit numbered starting highway (for example: From OH-7, take
-- OH-150...). Town/city-only origins are intentionally not measured.

do $$
begin
  if to_regprocedure('public.brinesearch_measure_safe_oh_road_legs_v17318_base(uuid)') is null
     and to_regprocedure('public.brinesearch_measure_safe_oh_road_legs(uuid)') is not null then
    execute 'alter function public.brinesearch_measure_safe_oh_road_legs(uuid) rename to brinesearch_measure_safe_oh_road_legs_v17318_base';
  end if;
end
$$;

create or replace function public.brinesearch_measure_safe_oh_road_legs(p_pad_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare total_count integer:=0; inserted_count integer:=0;
begin
  total_count:=public.brinesearch_measure_safe_oh_road_legs_v17318_base(p_pad_id);

  with src as (
    select d.pad_id,p.legacy_id,p.county,d.step_order,d.road_key,d.next_road_key,
      upper((regexp_match(d.evidence->>'instruction','^From[[:space:]]+((?:I|US|OH|SR)-[0-9]+)','i'))[1]) start_key
    from public.brinesearch_direction_step_intelligence d
    join public.pads p on p.id=d.pad_id
    where d.pad_id=p_pad_id and p.state='Ohio'
      and d.road_key is not null and (d.distance_miles is null or d.distance_miles<=0)
      and d.prev_road_key is null and d.next_road_key is not null
      and d.evidence->>'instruction' ~* '^From[[:space:]]+(?:I|US|OH|SR)-[0-9]+'
  ), geom as (
    select *,public.brinesearch_odot_road_geom(county,start_key) sg,
      public.brinesearch_odot_road_geom(county,road_key) rg,
      public.brinesearch_odot_road_geom(county,next_road_key) ng
    from src
    where start_key is not null and start_key<>road_key and road_key<>next_road_key
  ), pts as (
    select *,st_distance(rg::geography,sg::geography) start_gap_m,
      st_distance(rg::geography,ng::geography) next_gap_m,
      st_closestpoint(rg,sg) sp,st_closestpoint(rg,ng) ep
    from geom where sg is not null and rg is not null and ng is not null
  ), lines as (
    select p.*,l.geom line
    from pts p
    cross join lateral (
      select d.geom from st_dump(p.rg) d
      where geometrytype(d.geom)='LINESTRING'
      order by st_distance(d.geom,p.sp)+st_distance(d.geom,p.ep) limit 1
    ) l
  ), measured as (
    select *,abs(st_linelocatepoint(line,sp)-st_linelocatepoint(line,ep))
      *(st_length(line::geography)/1609.344) miles
    from lines
  ), safe as (
    select * from measured
    where start_gap_m<=100 and next_gap_m<=100 and miles between 0.03 and 40
      and not exists (
        select 1 from public.brinesearch_pad_measured_road_segments e
        where e.pad_id=measured.pad_id and upper(e.road_key)=upper(measured.road_key)
          and e.usable and e.measurement_scope='historical_pad_total'
      )
  )
  insert into public.brinesearch_pad_measured_road_segments(
    pad_id,legacy_id,segment_order,road_key,measured_miles,display_distance,
    measurement_method,confidence,connector_gap_miles,usable,rejection_reason,
    source_measurement_at,source_evidence,measurement_scope,source_step_order,updated_at
  )
  select pad_id,legacy_id,step_order,upper(road_key),round(miles::numeric,2),
    '≈ '||trim(to_char(round(miles::numeric,2),'FM999990.00'))||' mi',
    'official_centerline_explicit_start_to_next_road',
    case when start_gap_m<=30 and next_gap_m<=30 then .95 else .88 end,
    round(((start_gap_m+next_gap_m)/1609.344)::numeric,3),true,null,now(),
    jsonb_build_object(
      'source','Ohio DOT Road Inventory centerlines',
      'scope','first road bounded by explicit saved starting highway and next road',
      'start_road',start_key,'road',road_key,'next_road',next_road_key,
      'start_geometry_gap_m',round(start_gap_m::numeric,1),
      'next_geometry_gap_m',round(next_gap_m::numeric,1),
      'road_miles',round(miles::numeric,2),
      'safety','Saved instruction must begin with explicit I/US/OH/SR route; both geometry boundaries <=100 m; town-only origins excluded'
    ),
    'direction_road_leg',step_order,now()
  from safe
  on conflict (pad_id,measurement_scope,segment_order) do update
    set road_key=excluded.road_key,measured_miles=excluded.measured_miles,
        display_distance=excluded.display_distance,measurement_method=excluded.measurement_method,
        confidence=excluded.confidence,connector_gap_miles=excluded.connector_gap_miles,
        usable=excluded.usable,rejection_reason=excluded.rejection_reason,
        source_measurement_at=excluded.source_measurement_at,source_evidence=excluded.source_evidence,
        source_step_order=excluded.source_step_order,updated_at=now();
  get diagnostics inserted_count=row_count;
  return total_count+inserted_count;
end
$$;
revoke all on function public.brinesearch_measure_safe_oh_road_legs(uuid) from public,anon,authenticated;

-- Apply the extension to current Ohio candidates.
do $$
declare r record;
begin
  for r in
    select distinct d.pad_id
    from public.brinesearch_direction_step_intelligence d
    join public.pads p on p.id=d.pad_id
    where p.state='Ohio' and d.road_key is not null
      and (d.distance_miles is null or d.distance_miles<=0)
  loop
    begin perform public.brinesearch_measure_safe_oh_road_legs(r.pad_id);
    exception when others then null;
    end;
  end loop;
end
$$;
