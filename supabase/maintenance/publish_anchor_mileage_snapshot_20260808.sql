-- BrineSearch V17.3.5 anchor-mileage snapshot publisher.
-- Run only after the private 2026-08-08 anchor/mileage audit has zero unresolved
-- rows and the public schema migration has been applied.
--
-- This intentionally publishes only driver-safe outcomes. Unavailable mileage,
-- reference-only coordinate research, review evidence and conflicts stay private.

insert into public.public_pad_anchor_mileage(
  pad_id,legacy_id,pad_name,company,anchor_label,distance_miles,distance_text,distance_kind,target_text,
  reference_point,source_label,distance_mode,route_hash,is_stale,verified_at,updated_at
)
select
  s.pad_id,s.legacy_id,s.pad_name,s.company,btrim(s.selected_anchor_text),
  case when s.final_candidate_status='ready_for_publish' then s.anchor_distance_miles else null end,
  case
    when s.final_candidate_status='ready_range_for_publish' then
      regexp_replace(regexp_replace(coalesce(s.selected_anchor_evidence->>'display_mileage','Saved range'),'([0-9]+)\\.0–','\\1–','g'),'–([0-9]+)\\.0','–\\1','g')
    when s.final_candidate_status in ('ready_for_publish_qualified','ready_on_anchor_reference_marker') then coalesce(s.selected_anchor_evidence->>'display_distance_text','Saved reference')
    when s.final_candidate_status='ready_directly_off_anchor_no_numeric' then 'DIRECT'
    when s.final_candidate_status='ready_on_anchor_no_mileage_needed' then 'ON ROAD'
    when s.distance_status='saved_distance_slightly_over_reference' then 'a little over '||trim(trailing '.' from trim(trailing '0' from to_char(round(s.anchor_distance_miles,2),'FM999990.00')))||' mi'
    when s.distance_status ilike '%approximate%' then '≈ '||trim(trailing '.' from trim(trailing '0' from to_char(round(s.anchor_distance_miles,2),'FM999990.00')))||' mi'
    else trim(trailing '.' from trim(trailing '0' from to_char(round(s.anchor_distance_miles,2),'FM999990.00')))||' mi'
  end,
  case
    when s.final_candidate_status='ready_range_for_publish' then 'range'
    when s.final_candidate_status='ready_for_publish_qualified' then 'qualified'
    when s.final_candidate_status='ready_on_anchor_reference_marker' then 'marker'
    when s.final_candidate_status='ready_directly_off_anchor_no_numeric' then 'direct'
    when s.final_candidate_status='ready_on_anchor_no_mileage_needed' then 'on_road'
    when s.distance_status='saved_distance_slightly_over_reference' then 'qualified'
    when s.distance_status ilike '%approximate%' then 'approximate'
    when s.distance_status ilike '%geometry%' then 'measured'
    else 'saved'
  end,
  case
    when s.final_candidate_status='ready_directly_off_anchor_no_numeric' then 'pad/access directly off this road'
    when s.final_candidate_status='ready_on_anchor_no_mileage_needed' then 'saved pad/access is on this road'
    when s.final_candidate_status='ready_on_anchor_reference_marker' then 'saved access marker'
    when coalesce(s.distance_mode,'') ilike '%lease%' then 'to lease/access'
    else 'to pad/access'
  end,
  case
    when nullif(btrim(coalesce(s.anchor_reference_point,'')),'') is null then null
    when s.anchor_reference_point ~* '(landmark|cemetery|church|school|house|bar|mcdonald|pilot|rest area|turnaround|ballfield|sportsman|storage unit|saved route-reference point|saved entry/reference|selected anchor|primary saved route)' then null
    else s.anchor_reference_point
  end,
  case
    when coalesce(s.distance_source,'') ilike '%official%' or coalesce(s.distance_status,'') ilike '%geometry%' then 'Official road data + saved route'
    else 'Saved driver directions'
  end,
  s.distance_mode,
  md5(concat_ws(E'\\x1f',
    coalesce(b.company,''),coalesce(b.state,''),coalesce(b.county,''),
    coalesce(b.latitude::text,''),coalesce(b.longitude::text,''),
    coalesce(b.structured_road_sequence,''),coalesce(b.written_directions,''),coalesce(b.directions_clear,'')
  )),
  false,now(),now()
from private_verification.anchor_mileage_pads_20260808 s
join public.pads b on b.id=s.pad_id
where s.final_candidate_status in (
  'ready_for_publish','ready_for_publish_qualified','ready_range_for_publish',
  'ready_on_anchor_no_mileage_needed','ready_on_anchor_reference_marker','ready_directly_off_anchor_no_numeric'
)
  and nullif(btrim(s.selected_anchor_text),'') is not null
on conflict (pad_id) do update set
  legacy_id=excluded.legacy_id,pad_name=excluded.pad_name,company=excluded.company,
  anchor_label=excluded.anchor_label,distance_miles=excluded.distance_miles,distance_text=excluded.distance_text,
  distance_kind=excluded.distance_kind,target_text=excluded.target_text,reference_point=excluded.reference_point,
  source_label=excluded.source_label,distance_mode=excluded.distance_mode,route_hash=excluded.route_hash,
  is_stale=false,verified_at=excluded.verified_at,updated_at=excluded.updated_at;

-- Remove a public row if its latest private audit outcome is no longer safe to publish.
delete from public.public_pad_anchor_mileage pub
where not exists (
  select 1
  from private_verification.anchor_mileage_pads_20260808 s
  where s.pad_id=pub.pad_id
    and s.final_candidate_status in (
      'ready_for_publish','ready_for_publish_qualified','ready_range_for_publish',
      'ready_on_anchor_no_mileage_needed','ready_on_anchor_reference_marker','ready_directly_off_anchor_no_numeric'
    )
    and nullif(btrim(s.selected_anchor_text),'') is not null
);

do $assert$
declare
  total integer;
  unresolved integer;
begin
  select count(*) into unresolved
  from private_verification.anchor_mileage_pads_20260808
  where final_candidate_status is null;
  if unresolved<>0 then raise exception 'Private mileage audit still has % unresolved records',unresolved; end if;

  select count(*) into total from public.public_pad_anchor_mileage where not is_stale;
  if total<>743 then raise exception 'Expected 743 current public anchor rows, got %',total; end if;

  if exists(select 1 from public.public_pad_anchor_mileage where distance_text in ('0 mi','0.0 mi','≈ 0 mi')) then
    raise exception 'Misleading zero-mile display remains';
  end if;
end
$assert$;
