\set ON_ERROR_STOP on
\pset pager off
\timing on

begin isolation level repeatable read read only;
set local statement_timeout='5min';

do $issue97_ohio_report_preflight$
declare
  v_manifest record;
  v_pads integer;
  v_pad_digest text;
begin
  select manifest.* into strict v_manifest
  from private_verification.brinesearch_issue97_state_candidate_manifests manifest
  where manifest.manifest_key='issue97-ohio-r2-final-candidate'
    and manifest.state_code='OH' and manifest.member_count=19
    and manifest.generation_key='issue97-release-20260815-r2';
  select count(*)::integer,pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pad.id::text||':'||pad.legacy_id,'|' order by pad.id
  ),'')) into v_pads,v_pad_digest
  from public.pads pad
  where pad.state='Ohio' and coalesce(pad.list_only,false)=false;
  if not private_verification.brinesearch_issue97_state_candidate_manifest_current(v_manifest.id)
     or (select count(*)
       from private_verification.brinesearch_issue97_state_candidate_manifest_members member
       join public.brinesearch_road_graph_builds build
         on build.id=(member.member_value->>'build_id')::uuid
        and build.state_code='OH'
        and build.county_code=member.member_value->>'county_code'
        and build.graph_digest=member.member_value->>'graph_digest'
        and build.status='active'
        and private_verification.brinesearch_issue97_graph_build_release_current(build.id)
       where member.manifest_id=v_manifest.id)<>19
     or v_pads<>940 or v_pad_digest<>'9867f2352ac1b7276d057a83edd95d5f'
     or public.brinesearch_issue97_cutover_active()
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0
     or (select count(*) from public.pads where legacy_id='ascent--cologie')<>1
     or (select count(*) from public.pads where pad_name='WALKING TALL')<>1
     or exists(select 1
       from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
       join public.pads pad on pad.id=receipt.pad_id
       where pad.state='Ohio' and receipt.resolution_method in
         ('name_only','fuzzy_name','nearest_road','route_number_only'))
     or exists(select 1
       from private_verification.brinesearch_route_transition_receipts_issue97 receipt
       join public.pads pad on pad.id=receipt.pad_id
       where pad.state='Ohio' and receipt.resolution_method in
         ('name_only','fuzzy_name','nearest_road','route_number_only','closest_anchor'))
     or exists(select 1
       from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
       join public.pads pad on pad.id=receipt.pad_id
       where pad.state='Ohio' and receipt.geometry_method in
         ('name_only','fuzzy_name','nearest_road','nearest_point','route_number_only')) then
    raise exception 'Issue #97 Ohio readiness report preflight failed';
  end if;
end
$issue97_ohio_report_preflight$;

with ohio_pads as (
  select id,legacy_id,pad_name,company,brinesearch_google_route_status_issue97,
    brinesearch_google_route_hold_reason_issue97
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
  join primary_routes route on route.id=receipt.route_prep_id
), transition_rows as (
  select receipt.*
  from private_verification.brinesearch_route_transition_receipts_issue97 receipt
  join primary_routes route on route.id=receipt.route_prep_id
), geometry_rows as (
  select receipt.*
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
  join primary_routes route on route.id=receipt.route_prep_id
), occurrence_rows as (
  select receipt.*
  from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
  join primary_routes route on route.id=receipt.route_prep_id
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
  'pads_without_active_primary_route',(select count(*) from ohio_pads pad
    where not exists(select 1 from primary_routes route where route.pad_id=pad.id)),
  'pads_with_route_receipt',(select count(distinct pad_id) from receipt_rows),
  'route_ready',(select count(distinct pad_id) from receipt_rows where route_status='route_ready'),
  'held',(select count(distinct pad_id) from receipt_rows where route_status='needs_review'),
  'route_ready_receipts',(select count(*) from receipt_rows where route_status='route_ready'),
  'held_route_receipts',(select count(*) from receipt_rows where route_status='needs_review'),
  'unresolved',(select count(*) from ohio_pads pad where
    not exists(select 1 from primary_routes route where route.pad_id=pad.id)
    or not exists(select 1 from receipt_rows receipt where receipt.pad_id=pad.id)
    or exists(select 1 from receipt_rows receipt where receipt.pad_id=pad.id
      and receipt.route_status='stale')),
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
  'repeated_road_routes',(select count(*) from (
    select route_prep_id,canonical_road_id from occurrence_rows
    where resolution_status='resolved' and canonical_road_id is not null
    group by route_prep_id,canonical_road_id having count(*)>1
  ) repeated),
  'shared_segment_sequence_transitions',(select count(*) from transition_rows
    where resolution_method='shared_segment_sequence_context'),
  'no_guess_proof',pg_catalog.jsonb_build_object(
    'name_only_occurrences',(select count(*) from occurrence_rows
      where resolution_method='name_only'),
    'nearest_road_occurrences',(select count(*) from occurrence_rows
      where resolution_method='nearest_road'),
    'fuzzy_occurrences',(select count(*) from occurrence_rows
      where resolution_method='fuzzy_name'),
    'name_similarity_transitions',(select count(*) from transition_rows
      where resolution_method in ('name_only','fuzzy_name')),
    'nearest_road_transitions',(select count(*) from transition_rows
      where resolution_method in ('nearest_road','closest_anchor')),
    'forbidden_geometry_methods',(select count(*) from geometry_rows
      where geometry_method in ('name_only','fuzzy_name','nearest_road','nearest_point','route_number_only'))
  ),
  'google_readiness_state',coalesce((select pg_catalog.jsonb_object_agg(
    brinesearch_google_route_status_issue97,cnt order by brinesearch_google_route_status_issue97)
    from (select brinesearch_google_route_status_issue97,count(*) cnt from ohio_pads
      group by brinesearch_google_route_status_issue97) google_status),'{}'::jsonb),
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
where pad.state='Ohio' and coalesce(pad.list_only,false)=false
  and (pad.legacy_id in ('ascent--cologie') or pad.pad_name='WALKING TALL')
order by pad.legacy_id,route.variant_index;

-- Actionable Ohio exception queue only; no WV/PA rows.
with ohio_pads as (
  select * from public.pads
  where state='Ohio' and coalesce(list_only,false)=false
), primary_routes as (
  select route.* from public.brinesearch_route_prep route
  join ohio_pads pad on pad.id=route.pad_id
  where route.active and route.route_group='primary'
), exceptions as (
  select pad.legacy_id,pad.pad_name,pad.company,
    coalesce(receipt.route_status,'unresolved') as route_status,
    coalesce(receipt.stage,'missing_current_receipt') as stage,
    coalesce(receipt.held_occurrence_count,0) as held_occurrence_count,
    coalesce(receipt.exception_reasons,array['missing_current_receipt']::text[]) as exception_reasons
  from ohio_pads pad
  join primary_routes route on route.pad_id=pad.id
  left join private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    on receipt.route_prep_id=route.id
  where receipt.route_status is null or receipt.route_status<>'route_ready'
  union all
  select pad.legacy_id,pad.pad_name,pad.company,'unresolved','no_active_primary_route',
    0,array['no_active_primary_route']::text[]
  from ohio_pads pad
  where not exists(select 1 from primary_routes route where route.pad_id=pad.id)
)
select * from exceptions
order by held_occurrence_count desc,company,pad_name;

commit;
