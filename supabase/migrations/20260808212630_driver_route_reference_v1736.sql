-- BrineSearch V17.3.6 pad-card intelligence refresh.
-- Preserves the finalized V17.3.5 mileage audit while exposing a safe known
-- approach road for source-omission rows whose mileage remains unverified.
-- Research-only, no-route, and conflict details remain withheld.

create or replace function private_verification.refresh_driver_route_reference_internal()
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,private_verification
as $function$
declare
  inserted_count integer;
begin
  if to_regclass('private_verification.anchor_mileage_pads_20260808') is null then
    raise exception 'Private anchor/mileage staging table is unavailable';
  end if;

  if exists (
    select 1 from private_verification.anchor_mileage_pads_20260808
    where final_candidate_status is null
  ) then
    raise exception 'Driver route-reference audit still contains unresolved records';
  end if;

  delete from public.brinesearch_driver_route_reference;

  insert into public.brinesearch_driver_route_reference (
    pad_id,legacy_id,anchor_name,anchor_kind,distance_miles,display_distance,status,
    distance_mode,reference_point,source_label,source_version,route_hash,is_stale,updated_at
  )
  select
    p.pad_id,
    p.legacy_id,
    case
      when p.final_candidate_status in (
        'ready_for_publish','ready_for_publish_qualified','ready_range_for_publish',
        'ready_directly_off_anchor_no_numeric','ready_on_anchor_no_mileage_needed','ready_on_anchor_reference_marker',
        'final_distance_unavailable_source_omission'
      ) then nullif(btrim(p.selected_anchor_text),'')
      else null
    end as anchor_name,
    case
      when p.final_candidate_status in (
        'ready_for_publish','ready_for_publish_qualified','ready_range_for_publish',
        'ready_directly_off_anchor_no_numeric','ready_on_anchor_no_mileage_needed','ready_on_anchor_reference_marker',
        'final_distance_unavailable_source_omission'
      ) then
        case
          when p.selected_anchor_text ~* '(^|[^A-Z0-9])I[- ]?[0-9]{1,3}([^0-9]|$)' or p.selected_anchor_text ~* 'INTERSTATE' then 'interstate'
          when p.selected_anchor_text ~* '(^|[^A-Z0-9])US[- ]?[0-9]{1,3}([^0-9]|$)' then 'us_route'
          when p.selected_anchor_text ~* '\b(CR[- /]?[0-9]|COUNTY (ROAD|RD|ROUTE)|COUNTY HWY|COUNTY HIGHWAY)\b' then 'county_road'
          when p.selected_anchor_text ~* '\b(TR[- /]?[0-9]|TOWNSHIP (ROAD|RD|HWY|HIGHWAY)|TWP[- /]?[0-9])\b' then 'township_road'
          when p.selected_anchor_text ~* '(^|[^A-Z0-9])(OH|WV|PA)[- ]?[0-9]{1,4}([^0-9]|$)' or p.selected_anchor_text ~* '\bSR[- ]?[0-9]{1,4}\b' then 'state_route'
          when br.road_type='interstate' then 'interstate'
          when br.road_type='us_route' then 'us_route'
          when br.road_type='state_route' then 'state_route'
          when br.road_type='county' then 'county_road'
          when br.road_type='township' then 'township_road'
          when br.road_type='local' then 'local_public_road'
          when p.selected_anchor_kind in ('interstate','us_route','state_route') then 'verified_named_road'
          else nullif(btrim(p.selected_anchor_kind),'')
        end
      else null
    end as anchor_kind,
    case when p.final_candidate_status='ready_for_publish' then p.anchor_distance_miles else null end,
    case
      when p.final_candidate_status='ready_range_for_publish' then
        regexp_replace(
          regexp_replace(coalesce(nullif(p.selected_anchor_evidence->>'display_mileage',''),'Saved mileage range'),'([0-9]+)\.0–','\1–','g'),
          '–([0-9]+)\.0','–\1','g'
        )
      when p.final_candidate_status='ready_for_publish_qualified' then
        coalesce(nullif(p.selected_anchor_evidence->>'display_distance_text',''),'Saved qualified distance')
      when p.final_candidate_status='ready_on_anchor_no_mileage_needed' then 'On this road'
      when p.final_candidate_status='ready_on_anchor_reference_marker' then
        coalesce(nullif(p.selected_anchor_evidence->>'display_distance_text',''),nullif(p.anchor_reference_point,''),'Route marker')
      when p.final_candidate_status='ready_directly_off_anchor_no_numeric' then 'Directly off this road'
      when p.final_candidate_status='ready_for_publish' and p.anchor_distance_miles is not null
        and lower(coalesce(p.distance_status,'')) like '%slightly%' then
        'a little over '||trim(trailing '.' from trim(trailing '0' from to_char(round(p.anchor_distance_miles,2),'FM999990.00')))||' mi'
      when p.final_candidate_status='ready_for_publish' and p.anchor_distance_miles is not null then
        (case
          when lower(coalesce(p.distance_status,'')) like '%approx%'
            or lower(coalesce(p.distance_source,'')) like '%approx%'
          then '≈ ' else '' end)
        ||trim(trailing '.' from trim(trailing '0' from to_char(round(p.anchor_distance_miles,2),'FM999990.00')))||' mi'
      when p.final_candidate_status='final_reference_only_not_driver_distance' then 'No verified driving mileage'
      when p.final_candidate_status='final_distance_unavailable_source_omission' then 'Mileage not verified'
      when p.final_candidate_status='final_distance_source_ambiguous' then 'Mileage source ambiguous — not published'
      when p.final_candidate_status='final_distance_source_conflict' then 'Mileage conflict — not published'
      when p.final_candidate_status like 'final_no_route_evidence%' then 'No verified route'
      when p.final_candidate_status like 'blocked%' then 'Route conflict — do not use'
      else 'Mileage not verified'
    end as display_distance,
    case
      when p.final_candidate_status='ready_range_for_publish' then 'verified_range'
      when p.final_candidate_status='ready_for_publish_qualified' then 'verified_approximate'
      when p.final_candidate_status='ready_on_anchor_no_mileage_needed' then 'located_on_anchor'
      when p.final_candidate_status='ready_on_anchor_reference_marker' then 'route_marker'
      when p.final_candidate_status='ready_directly_off_anchor_no_numeric' then 'direct_on_anchor'
      when p.final_candidate_status='ready_for_publish' and (
        lower(coalesce(p.distance_status,'')) like '%approx%'
        or lower(coalesce(p.distance_status,'')) like '%slightly%'
        or lower(coalesce(p.distance_source,'')) like '%approx%'
      ) then 'verified_approximate'
      when p.final_candidate_status='ready_for_publish' then 'verified_distance'
      when p.final_candidate_status='final_reference_only_not_driver_distance' then 'research_only'
      when p.final_candidate_status like 'final_distance%' then 'distance_unavailable'
      when p.final_candidate_status like 'final_no_route_evidence%' then 'no_route_evidence'
      when p.final_candidate_status like 'blocked%' then 'blocked_conflict'
      else 'distance_unavailable'
    end as status,
    case
      when p.final_candidate_status in (
        'ready_for_publish','ready_for_publish_qualified','ready_range_for_publish',
        'ready_directly_off_anchor_no_numeric','ready_on_anchor_no_mileage_needed','ready_on_anchor_reference_marker'
      ) then nullif(btrim(p.distance_mode),'')
      when p.final_candidate_status='final_distance_unavailable_source_omission'
        and nullif(btrim(p.selected_anchor_text),'') is not null then 'known_anchor_mileage_unavailable'
      else null
    end as distance_mode,
    case
      when p.final_candidate_status in (
        'ready_for_publish','ready_for_publish_qualified','ready_range_for_publish',
        'ready_directly_off_anchor_no_numeric','ready_on_anchor_no_mileage_needed','ready_on_anchor_reference_marker',
        'final_distance_unavailable_source_omission'
      )
       and nullif(btrim(coalesce(p.anchor_reference_point,'')),'') is not null
       and p.anchor_reference_point !~* '(landmark|cemetery|church|school|house|bar|mcdonald|pilot|rest area|turnaround|ballfield|sportsman|storage unit|saved route-reference point|saved entry/reference|selected anchor|primary saved route)'
      then btrim(p.anchor_reference_point)
      else null
    end as reference_point,
    case
      when p.final_candidate_status='ready_range_for_publish' then 'Saved haul directions + verified road identity'
      when p.final_candidate_status='ready_for_publish_qualified' then 'Saved qualified distance from driver directions'
      when p.final_candidate_status in ('ready_directly_off_anchor_no_numeric','ready_on_anchor_no_mileage_needed','ready_on_anchor_reference_marker') then 'Saved route + verified road reference'
      when p.final_candidate_status='ready_for_publish' and lower(coalesce(p.distance_source,'')) like '%geometry%' then 'Official road geometry + saved route'
      when p.final_candidate_status='ready_for_publish' and lower(coalesce(p.distance_source,'')) like '%official%' then 'Saved haul directions + official road data'
      when p.final_candidate_status='ready_for_publish' then 'Saved haul directions'
      when p.final_candidate_status='final_reference_only_not_driver_distance' then 'Research only — not a driving route'
      when p.final_candidate_status='final_distance_unavailable_source_omission' and p.selected_anchor_road_id is not null then 'Verified road reference; mileage unavailable'
      when p.final_candidate_status='final_distance_unavailable_source_omission' then 'Known route reference; mileage unavailable'
      when p.final_candidate_status='final_distance_source_ambiguous' then 'Mileage source ambiguous — review required'
      when p.final_candidate_status='final_distance_source_conflict' then 'Mileage source conflict — review required'
      when p.final_candidate_status like 'final_no_route_evidence%' then 'No verified route evidence'
      when p.final_candidate_status like 'blocked%' then 'Route conflict — review required'
      else 'BrineSearch route review'
    end as source_label,
    '20260808-v1736',
    md5(concat_ws(E'\x1f',
      coalesce(b.company,''),coalesce(b.state,''),coalesce(b.county,''),
      coalesce(b.latitude::text,''),coalesce(b.longitude::text,''),
      coalesce(b.structured_road_sequence,''),coalesce(b.written_directions,''),coalesce(b.directions_clear,'')
    )),
    false,
    now()
  from private_verification.anchor_mileage_pads_20260808 p
  join public.pads b on b.id=p.pad_id
  left join public.brinesearch_roads br on br.id=p.selected_anchor_road_id;

  get diagnostics inserted_count=row_count;

  if inserted_count<>1173 then
    raise exception 'Expected 1173 driver route-reference records, inserted %',inserted_count;
  end if;

  if exists (
    select 1 from public.brinesearch_driver_route_reference
    where status in ('research_only','no_route_evidence','blocked_conflict')
      and (anchor_name is not null or distance_miles is not null or reference_point is not null)
  ) then
    raise exception 'Private/non-driving route details leaked into public route-reference rows';
  end if;

  if exists (
    select 1 from public.brinesearch_driver_route_reference
    where status='distance_unavailable' and distance_miles is not null
  ) then
    raise exception 'Unverified mileage leaked into distance-unavailable rows';
  end if;

  return inserted_count;
end
$function$;

revoke all on function private_verification.refresh_driver_route_reference_internal() from public,anon,authenticated;
grant execute on function private_verification.refresh_driver_route_reference_internal() to service_role;

select private_verification.refresh_driver_route_reference_internal();

notify pgrst,'reload schema';

do $assertions$
declare
  total_count integer;
  numeric_count integer;
  unavailable_with_anchor integer;
  mismatch_count integer;
begin
  select count(*) into total_count from public.brinesearch_driver_route_reference;
  if total_count<>1173 then raise exception 'Unexpected public row count %',total_count; end if;

  select count(*) into numeric_count
  from public.brinesearch_driver_route_reference
  where distance_miles is not null;
  if numeric_count<>678 then raise exception 'Expected 678 numeric driver distances, found %',numeric_count; end if;

  select count(*) into unavailable_with_anchor
  from public.brinesearch_driver_route_reference
  where status='distance_unavailable' and anchor_name is not null;
  if unavailable_with_anchor<>317 then raise exception 'Expected 317 useful unavailable anchors, found %',unavailable_with_anchor; end if;

  select count(*) into mismatch_count
  from public.brinesearch_driver_route_reference
  where anchor_name is not null and (
    (anchor_name ~* '(^|[^A-Z0-9])I[- ]?[0-9]{1,3}([^0-9]|$)' and anchor_kind<>'interstate')
    or (anchor_name ~* '(^|[^A-Z0-9])US[- ]?[0-9]{1,3}([^0-9]|$)' and anchor_kind<>'us_route')
    or (anchor_name ~* '\b(CR[- /]?[0-9]|COUNTY (ROAD|RD|ROUTE)|COUNTY HWY|COUNTY HIGHWAY)\b' and anchor_kind<>'county_road')
    or (anchor_name ~* '\b(TR[- /]?[0-9]|TOWNSHIP (ROAD|RD|HWY|HIGHWAY)|TWP[- /]?[0-9])\b' and anchor_kind<>'township_road')
  );
  if mismatch_count<>0 then raise exception 'Obvious road-kind mismatches remain: %',mismatch_count; end if;

  if exists(select 1 from public.brinesearch_driver_route_reference where is_stale) then
    raise exception 'Stale route references remain after refresh';
  end if;

  if exists (
    select 1 from public.brinesearch_driver_route_reference
    where status in ('research_only','no_route_evidence','blocked_conflict')
      and (anchor_name is not null or distance_miles is not null or reference_point is not null)
  ) then
    raise exception 'Private/non-driving details are visible after V17.3.6 refresh';
  end if;
end
$assertions$;
