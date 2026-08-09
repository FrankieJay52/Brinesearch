-- BrineSearch V17.3.12 — repair official Jefferson County road identities that
-- were allowed to diverge between nearby pads by inferred direction intelligence.
-- Official Jefferson County road references:
--   CR-22 = Steubenville Street
--   CR-23 = Bloomingdale-Smithfield-Chandler Road
--   CR-26 = Fernwood-Bloomingdale Road
-- This migration changes road identity only; it does not invent mileage.

update public.brinesearch_direction_step_intelligence d
set road_key='CR-22',
    primary_road='CR-22',
    local_road_name=case
      when concat_ws(' ',d.local_road_name,d.display_road,d.evidence->>'instruction') ~* '\m(East|E)[[:space:]._-]+Steubenville\M'
        then 'E Steubenville St'
      else 'Steubenville St'
    end,
    display_road='CR-22 / '||case
      when concat_ws(' ',d.local_road_name,d.display_road,d.evidence->>'instruction') ~* '\m(East|E)[[:space:]._-]+Steubenville\M'
        then 'E Steubenville St'
      else 'Steubenville St'
    end,
    evidence=coalesce(d.evidence,'{}'::jsonb)||jsonb_build_object(
      'official_road_identity','Jefferson County CR-22 / Steubenville Street',
      'official_road_identity_method','v17.3.12 county-road reconciliation'),
    refreshed_at=now()
from public.pads p
where d.pad_id=p.id
  and lower(coalesce(p.state,'')) in ('ohio','oh')
  and regexp_replace(lower(coalesce(p.county,'')),'[[:space:]]+county$','')='jefferson'
  and concat_ws(' ',d.local_road_name,d.display_road,d.evidence->>'instruction')
      ~* '\mSteubenville[[:space:]._-]+(St|Street)\M';

update public.brinesearch_direction_step_intelligence d
set road_key='CR-23',
    primary_road='CR-23',
    local_road_name=case
      when concat_ws(' ',d.local_road_name,d.display_road,d.evidence->>'instruction') ~* '\mHigh[[:space:]._-]+(St|Street)\M'
        then 'High St'
      else 'Bloomingdale-Smithfield-Chandler Rd'
    end,
    display_road='CR-23 / '||case
      when concat_ws(' ',d.local_road_name,d.display_road,d.evidence->>'instruction') ~* '\mHigh[[:space:]._-]+(St|Street)\M'
        then 'High St'
      else 'Bloomingdale-Smithfield-Chandler Rd'
    end,
    evidence=coalesce(d.evidence,'{}'::jsonb)||jsonb_build_object(
      'official_road_identity','Jefferson County CR-23 / Bloomingdale-Smithfield-Chandler Road',
      'official_road_identity_method','v17.3.12 county-road reconciliation'),
    refreshed_at=now()
from public.pads p
where d.pad_id=p.id
  and lower(coalesce(p.state,'')) in ('ohio','oh')
  and regexp_replace(lower(coalesce(p.county,'')),'[[:space:]]+county$','')='jefferson'
  and concat_ws(' ',d.local_road_name,d.display_road,d.evidence->>'instruction')
      ~* 'Bloomingdale[[:space:]._-]*Smithfield[[:space:]._-]*(Chandl|Chandler)';

update public.brinesearch_direction_step_intelligence d
set road_key='CR-26',
    primary_road='CR-26',
    local_road_name='Fernwood-Bloomingdale Rd',
    display_road='CR-26 / Fernwood-Bloomingdale Rd',
    evidence=coalesce(d.evidence,'{}'::jsonb)||jsonb_build_object(
      'official_road_identity','Jefferson County CR-26 / Fernwood-Bloomingdale Road',
      'official_road_identity_method','v17.3.12 county-road reconciliation'),
    refreshed_at=now()
from public.pads p
where d.pad_id=p.id
  and lower(coalesce(p.state,'')) in ('ohio','oh')
  and regexp_replace(lower(coalesce(p.county,'')),'[[:space:]]+county$','')='jefferson'
  and concat_ws(' ',d.local_road_name,d.display_road,d.evidence->>'instruction')
      ~* 'Fernwood[[:space:]._-]*Bloomingdale[[:space:]._-]+(Rd|Road)';

with road_context as (
  select d.pad_id,d.step_order,
         lag(d.road_key) over(partition by d.pad_id order by d.step_order) as prev_road_key,
         lead(d.road_key) over(partition by d.pad_id order by d.step_order) as next_road_key
  from public.brinesearch_direction_step_intelligence d
  join public.pads p on p.id=d.pad_id
  where lower(coalesce(p.state,'')) in ('ohio','oh')
    and regexp_replace(lower(coalesce(p.county,'')),'[[:space:]]+county$','')='jefferson'
)
update public.brinesearch_direction_step_intelligence d
set prev_road_key=c.prev_road_key,
    next_road_key=c.next_road_key,
    same_road_continuation=coalesce(
      d.road_key is not null
      and d.road_key=c.prev_road_key
      and d.maneuver_class in ('turn_left','turn_right','stay_left','stay_right'),
      false),
    refreshed_at=now()
from road_context c
where d.pad_id=c.pad_id and d.step_order=c.step_order;
