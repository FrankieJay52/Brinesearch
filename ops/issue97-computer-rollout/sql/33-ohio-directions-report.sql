\set ON_ERROR_STOP on
\pset pager off
\timing on

begin read only;
set local statement_timeout='5min';

with ohio_pads as (
  select id,legacy_id,pad_name,company
  from public.pads
  where state='Ohio' and coalesce(list_only,false)=false
), primary_routes as (
  select route.*
  from public.brinesearch_route_prep route
  join ohio_pads pad on pad.id=route.pad_id
  where route.active and route.route_group='primary'
), receipt_rows as (
  select receipt.*
  from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
  join ohio_pads pad on pad.id=receipt.pad_id
), transition_rows as (
  select receipt.*
  from private_verification.brinesearch_route_transition_receipts_issue97 receipt
  join ohio_pads pad on pad.id=receipt.pad_id
), geometry_rows as (
  select receipt.*
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
  join ohio_pads pad on pad.id=receipt.pad_id
), occurrence_rows as (
  select receipt.*
  from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
  join ohio_pads pad on pad.id=receipt.pad_id
)
select pg_catalog.jsonb_pretty(pg_catalog.jsonb_build_object(
  'observational_only',true,
  'state','Ohio',
  'checked_at',pg_catalog.clock_timestamp(),
  'cutover_active',public.brinesearch_issue97_cutover_active(),
  'registered_counties',(select count(*) from public.brinesearch_road_graph_counties where active and state_code='OH'),
  'active_release_current_graphs',(select count(*) from public.brinesearch_road_graph_builds build
    where build.state_code='OH' and build.status='active'
      and private_verification.brinesearch_issue97_graph_build_release_current(build.id)),
  'non_list_only_pads',(select count(*) from ohio_pads),
  'pads_with_one_active_primary_route',(select count(*) from (
    select pad.id from ohio_pads pad
    left join primary_routes route on route.pad_id=pad.id
    group by pad.id having count(route.id)=1
  ) q),
  'pads_with_route_receipt',(select count(distinct pad_id) from receipt_rows),
  'route_ready_receipts',(select count(*) from receipt_rows where route_status='route_ready'),
  'held_route_receipts',(select count(*) from receipt_rows where route_status<>'route_ready'),
  'occurrences',(select count(*) from occurrence_rows),
  'resolved_occurrences',(select count(*) from occurrence_rows where resolution_status='resolved'),
  'held_occurrences',(select count(*) from occurrence_rows where resolution_status<>'resolved'),
  'transitions',(select count(*) from transition_rows),
  'resolved_transitions',(select count(*) from transition_rows where status='resolved'),
  'held_transitions',(select count(*) from transition_rows where status='held'),
  'geometry_receipts',(select count(*) from geometry_rows),
  'resolved_geometry',(select count(*) from geometry_rows where status='resolved'),
  'held_geometry',(select count(*) from geometry_rows where status<>'resolved'),
  'transition_holds_by_reason',coalesce((select pg_catalog.jsonb_object_agg(hold_reason,cnt order by hold_reason)
    from (select hold_reason,count(*) cnt from transition_rows where status='held' group by hold_reason) q),'{}'::jsonb),
  'occurrence_holds_by_reason',coalesce((select pg_catalog.jsonb_object_agg(hold_reason,cnt order by hold_reason)
    from (select hold_reason,count(*) cnt from occurrence_rows where resolution_status<>'resolved' group by hold_reason) q),'{}'::jsonb),
  'geometry_holds_by_reason',coalesce((select pg_catalog.jsonb_object_agg(hold_reason,cnt order by hold_reason)
    from (select hold_reason,count(*) cnt from geometry_rows where status<>'resolved' group by hold_reason) q),'{}'::jsonb),
  'public_google_rows',(select count(*) from public.brinesearch_driver_google_routes_public),
  'google_expected_before_global_cutover',0
)) as issue97_ohio_direction_readiness;

-- Highest-value real-world Ohio checks after the batch.
select pad.legacy_id,pad.pad_name,route.variant_index,route.readiness_status,
  receipt.route_status,receipt.stage,receipt.road_occurrence_count,
  receipt.resolved_occurrence_count,receipt.held_occurrence_count,
  receipt.canonical_mapping_count,receipt.exact_geometry_count,
  receipt.exception_reasons
from public.pads pad
left join public.brinesearch_route_prep route
  on route.pad_id=pad.id and route.active and route.route_group='primary'
left join private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
  on receipt.route_prep_id=route.id
where pad.legacy_id in ('ascent--cologie')
   or pad.pad_name='WALKING TALL'
order by pad.legacy_id,route.variant_index;

-- Actionable Ohio exception queue only; no WV/PA rows.
select pad.legacy_id,pad.pad_name,pad.company,receipt.route_status,receipt.stage,
  receipt.held_occurrence_count,receipt.exception_reasons
from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
join public.pads pad on pad.id=receipt.pad_id
where pad.state='Ohio' and coalesce(pad.list_only,false)=false
  and receipt.route_status<>'route_ready'
order by receipt.held_occurrence_count desc,pad.company,pad.pad_name
limit 200;

commit;
