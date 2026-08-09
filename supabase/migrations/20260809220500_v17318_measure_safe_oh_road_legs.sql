-- BrineSearch V17.3.18
-- Recover additional road-by-road mileage only where the road segment is bounded
-- by exact ODOT centerline context. Saved direction mileage still wins in the UI.
-- This never measures a first road from an unspecified town/origin, never uses
-- straight-line distance as road mileage, and never publishes rejected geometry.

alter table public.brinesearch_pad_measured_road_segments
  add column if not exists measurement_scope text not null default 'historical_pad_total',
  add column if not exists source_step_order integer;

update public.brinesearch_pad_measured_road_segments
set measurement_scope='historical_pad_total'
where measurement_scope is null or btrim(measurement_scope)='';

alter table public.brinesearch_pad_measured_road_segments
  drop constraint if exists brinesearch_pad_measured_road_segments_pad_id_segment_order_key;

create unique index if not exists brinesearch_pad_measured_road_segments_scope_order_uidx
  on public.brinesearch_pad_measured_road_segments(pad_id,measurement_scope,segment_order);

create index if not exists brinesearch_pad_measured_road_segments_step_idx
  on public.brinesearch_pad_measured_road_segments(pad_id,source_step_order);

-- Keep the historical pad-total extraction isolated so future refreshes cannot
-- delete the new direct road-leg measurements.
create or replace function public.brinesearch_sync_pad_measured_road_segments(p_pad_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare inserted_count integer := 0;
begin
  delete from public.brinesearch_pad_measured_road_segments
  where pad_id=p_pad_id and measurement_scope='historical_pad_total';

  insert into public.brinesearch_pad_measured_road_segments(
    pad_id,legacy_id,segment_order,road_key,measured_miles,display_distance,
    measurement_method,confidence,connector_gap_miles,usable,rejection_reason,
    source_measurement_at,source_evidence,measurement_scope,source_step_order,updated_at
  )
  select
    m.pad_id,m.legacy_id,s.ordinality::integer,upper(btrim(s.segment->>'road')),
    (s.segment->>'miles')::numeric,
    '≈ '||trim(to_char((s.segment->>'miles')::numeric,'FM999990.00'))||' mi',
    m.method,m.confidence,m.connector_gap_miles,
    (m.method='official_centerline_pad_specific'
      and coalesce(m.confidence,0)>=0.80
      and coalesce(m.connector_gap_miles,0)<=1.0
      and coalesce(m.connector_gap_miles,0)/nullif(m.measured_miles,0)<=0.20),
    case
      when m.method<>'official_centerline_pad_specific' then 'measurement withheld by prior mileage audit'
      when coalesce(m.confidence,0)<0.80 then 'measurement confidence below publish threshold'
      when coalesce(m.connector_gap_miles,0)>1.0 then 'unmapped connector exceeds 1 mile'
      when coalesce(m.connector_gap_miles,0)/nullif(m.measured_miles,0)>0.20 then 'unmapped connector exceeds 20 percent of route'
      else null end,
    m.measured_at,
    jsonb_build_object(
      'source','brinesearch_pad_mileage_measurements.evidence.segments',
      'segment',s.segment,
      'pad_total_miles',m.measured_miles,
      'connector_gap_miles',m.connector_gap_miles,
      'measurement_evidence',m.evidence
    ),
    'historical_pad_total',null,now()
  from public.brinesearch_pad_mileage_measurements m
  cross join lateral jsonb_array_elements(coalesce(m.evidence->'segments','[]'::jsonb)) with ordinality as s(segment,ordinality)
  where m.pad_id=p_pad_id
    and nullif(btrim(s.segment->>'road'),'') is not null
    and nullif(btrim(s.segment->>'miles'),'') is not null
    and (s.segment->>'miles')::numeric>0;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end
$$;
revoke all on function public.brinesearch_sync_pad_measured_road_segments(uuid) from public,anon,authenticated;

create or replace function public.brinesearch_measure_safe_oh_road_legs(p_pad_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare inserted_count integer := 0; total_count integer := 0;
begin
  delete from public.brinesearch_pad_measured_road_segments
  where pad_id=p_pad_id and measurement_scope='direction_road_leg';

  -- Middle road: previous road -> current road -> next road. Both boundaries
  -- must be present in ODOT geometry and within 100 m of the current road.
  with src as (
    select d.pad_id,p.legacy_id,p.county,d.step_order,d.road_key,d.prev_road_key,d.next_road_key,
      public.brinesearch_odot_road_geom(p.county,d.road_key) rg,
      public.brinesearch_odot_road_geom(p.county,d.prev_road_key) pg,
      public.brinesearch_odot_road_geom(p.county,d.next_road_key) ng
    from public.brinesearch_direction_step_intelligence d
    join public.pads p on p.id=d.pad_id
    where d.pad_id=p_pad_id and p.state='Ohio'
      and d.road_key is not null
      and (d.distance_miles is null or d.distance_miles<=0)
      and d.prev_road_key is not null and d.next_road_key is not null
      and d.road_key<>d.prev_road_key and d.road_key<>d.next_road_key
  ), pts as (
    select *,st_distance(rg::geography,pg::geography) prev_gap_m,
      st_distance(rg::geography,ng::geography) next_gap_m,
      st_closestpoint(rg,pg) sp,st_closestpoint(rg,ng) ep
    from src where rg is not null and pg is not null and ng is not null
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
    where prev_gap_m<=100 and next_gap_m<=100 and miles between 0.03 and 40
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
    'official_centerline_neighbor_intersections',
    case when prev_gap_m<=30 and next_gap_m<=30 then 0.95 else 0.88 end,
    round(((prev_gap_m+next_gap_m)/1609.344)::numeric,3),true,null,now(),
    jsonb_build_object(
      'source','Ohio DOT Road Inventory centerlines',
      'scope','road leg bounded by previous and next road',
      'previous_road',prev_road_key,'road',road_key,'next_road',next_road_key,
      'previous_geometry_gap_m',round(prev_gap_m::numeric,1),
      'next_geometry_gap_m',round(next_gap_m::numeric,1),
      'road_miles',round(miles::numeric,2),
      'safety','Both neighboring road geometries required; boundary gaps <=100 m; no straight-line road mileage'
    ),
    'direction_road_leg',step_order,now()
  from safe;
  get diagnostics inserted_count=row_count; total_count:=total_count+inserted_count;

  -- Last numbered/public road before the pad. Measure only the road centerline
  -- from its previous-road intersection to the point on that road nearest the
  -- saved pad coordinate. The pad-to-road connector is NOT added to road miles
  -- and must be <=0.25 mi.
  with src as (
    select d.pad_id,p.legacy_id,p.county,d.step_order,d.road_key,d.prev_road_key,
      public.brinesearch_odot_road_geom(p.county,d.road_key) rg,
      public.brinesearch_odot_road_geom(p.county,d.prev_road_key) pg,
      st_setsrid(st_makepoint(p.longitude,p.latitude),4326) padpt
    from public.brinesearch_direction_step_intelligence d
    join public.pads p on p.id=d.pad_id
    where d.pad_id=p_pad_id and p.state='Ohio'
      and d.road_key is not null
      and (d.distance_miles is null or d.distance_miles<=0)
      and d.prev_road_key is not null and d.next_road_key is null
      and d.road_key<>d.prev_road_key
      and p.latitude is not null and p.longitude is not null
  ), pts as (
    select *,st_distance(rg::geography,pg::geography) prev_gap_m,
      st_distance(rg::geography,padpt::geography)/1609.344 connector_miles,
      st_closestpoint(rg,pg) sp,st_closestpoint(rg,padpt) ep
    from src where rg is not null and pg is not null
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
    where prev_gap_m<=100 and connector_miles<=0.25 and miles between 0.03 and 40
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
    'official_centerline_previous_road_to_pad',
    case when prev_gap_m<=30 and connector_miles<=0.10 then 0.92 else 0.84 end,
    round(connector_miles::numeric,3),true,null,now(),
    jsonb_build_object(
      'source','Ohio DOT Road Inventory centerlines',
      'scope','last road from previous-road intersection toward saved pad coordinate',
      'previous_road',prev_road_key,'road',road_key,
      'previous_geometry_gap_m',round(prev_gap_m::numeric,1),
      'pad_to_road_connector_miles',round(connector_miles::numeric,3),
      'road_miles',round(miles::numeric,2),
      'safety','Pad connector <=0.25 mi and excluded from road mileage; no straight-line distance substituted for road mileage'
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
  get diagnostics inserted_count=row_count; total_count:=total_count+inserted_count;
  return total_count;
end
$$;
revoke all on function public.brinesearch_measure_safe_oh_road_legs(uuid) from public,anon,authenticated;

-- Recompute only Ohio pads that currently have a missing-distance road step.
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

-- Return at most one accepted measurement per road key. A direct direction-leg
-- measurement is preferred over a historical pad-total segment when both exist.
create or replace function public.brinesearch_pad_measured_road_segments(p_pad_id uuid)
returns table(
  segment_order integer,
  road_key text,
  distance_miles numeric,
  distance_label text,
  confidence numeric,
  measurement_method text
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  with ranked as (
    select s.*,
      row_number() over(partition by upper(s.road_key)
        order by case when s.measurement_scope='direction_road_leg' then 0 else 1 end,
                 coalesce(s.confidence,0) desc,s.updated_at desc,s.id desc) rn
    from public.brinesearch_pad_measured_road_segments s
    where s.pad_id=p_pad_id and s.usable
  )
  select coalesce(source_step_order,segment_order),road_key,measured_miles,display_distance,
         confidence,measurement_method
  from ranked where rn=1
  order by coalesce(source_step_order,segment_order),road_key
$$;
revoke all on function public.brinesearch_pad_measured_road_segments(uuid) from public,anon,authenticated;
grant execute on function public.brinesearch_pad_measured_road_segments(uuid) to anon,authenticated;
