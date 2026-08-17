\set ON_ERROR_STOP on
\pset pager off
\timing on

-- Observational-only Ohio post-reconciliation report. The installed exact-cache
-- helper creates transaction-local ON COMMIT DROP tables, so PostgreSQL cannot
-- declare this transaction READ ONLY. The lane is instead rollback-only, and
-- static enforcement forbids every durable mutation. It prepares one exact-
-- manifest snapshot, reuses it for every graph-currentness metric, and never
-- invokes reconciliation, publication, activation, cutover, or the global cache.
begin isolation level repeatable read;
set local statement_timeout='15min';
set local lock_timeout='2min';

do $issue97_ohio_report_preflight$
declare
  v_manifest record;
  v_pads integer;
  v_pad_digest text;
  v_cache jsonb;
  v_verified jsonb;
begin
  select manifest.* into strict v_manifest
  from private_verification.brinesearch_issue97_state_candidate_manifests manifest
  where manifest.id='c41f5320-1273-470c-a316-28b42211d697'::uuid
    and manifest.manifest_key='issue97-ohio-r2-final-candidate'
    and manifest.manifest_digest='9763dc5bb626da71881b7381ed28a436'
    and manifest.state_code='OH'
    and manifest.generation_key='issue97-release-20260815-r2'
    and manifest.member_count=19
    and manifest.review_details->>'global_cutover_authorized'='false'
    and manifest.review_details->>'ohio_non_list_only_pad_count'='940'
    and manifest.review_details->>'ohio_pad_scope_digest'='9867f2352ac1b7276d057a83edd95d5f';

  select count(*)::integer,pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pad.id::text||':'||pad.legacy_id,'|' order by pad.id
  ),'')) into v_pads,v_pad_digest
  from public.pads pad
  where pad.state='Ohio' and coalesce(pad.list_only,false)=false;

  if v_pads<>940 or v_pad_digest<>'9867f2352ac1b7276d057a83edd95d5f'
     or public.brinesearch_issue97_cutover_active()
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0
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
    raise exception 'Issue #97 Ohio readiness report exact dark-state preflight failed';
  end if;

  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_state_manifest_id',v_manifest.id::text,true
  );
  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_state_manifest_digest',v_manifest.manifest_digest,true
  );
  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_state_code',v_manifest.state_code,true
  );
  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_generation_key',v_manifest.generation_key,true
  );
  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_member_count',v_manifest.member_count::text,true
  );

  v_cache:=private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(
    v_manifest.id,v_manifest.manifest_digest,v_manifest.state_code,
    v_manifest.generation_key,v_manifest.member_count
  );
  if v_cache->>'manifest_id'<>'c41f5320-1273-470c-a316-28b42211d697'
     or v_cache->>'manifest_digest'<>'9763dc5bb626da71881b7381ed28a436'
     or v_cache->>'state_code'<>'OH'
     or v_cache->>'generation_key'<>'issue97-release-20260815-r2'
     or v_cache->>'member_count'<>'19'
     or v_cache->>'release_current_count'<>'19'
     or v_cache->>'source_scope_count'<>'38'
     or v_cache->>'cache_scope'<>'exact_state_manifest'
     or v_cache->>'cache_miss_policy'<>'fail_closed'
     or v_cache->>'global_cutover_authorized'<>'false'
     or v_cache->>'reused'<>'false'
     or v_cache->>'full_predicate_evaluation_count'<>'19'
     or coalesce(v_cache->>'manifest_member_digest','') !~ '^[0-9a-f]{32}$'
     or coalesce(v_cache->>'cache_member_digest','') !~ '^[0-9a-f]{32}$'
     or coalesce(v_cache->>'preparation_token','') !~ '^[0-9a-f]{32}$' then
    raise exception 'Issue #97 Ohio report exact state-manifest cache preparation failed';
  end if;

  v_verified:=private_verification.brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest(
    v_manifest.id,v_manifest.manifest_digest,v_manifest.state_code,
    v_manifest.generation_key,v_manifest.member_count
  );
  if v_verified->>'reused'<>'true'
     or v_verified->>'manifest_id'<>v_cache->>'manifest_id'
     or v_verified->>'manifest_digest'<>v_cache->>'manifest_digest'
     or v_verified->>'manifest_member_digest'<>v_cache->>'manifest_member_digest'
     or v_verified->>'cache_member_digest'<>v_cache->>'cache_member_digest'
     or v_verified->>'preparation_token'<>v_cache->>'preparation_token'
     or v_verified->>'full_predicate_evaluation_count'<>'19'
     or (select count(*)
       from pg_temp.tmp_issue97_graph_release_current_cache_context context
       where context.manifest_id='c41f5320-1273-470c-a316-28b42211d697'::uuid
         and context.manifest_digest='9763dc5bb626da71881b7381ed28a436'
         and context.state_code='OH'
         and context.generation_key='issue97-release-20260815-r2'
         and context.member_count=19
         and context.source_scope_count=38
         and context.manifest_member_digest=v_cache->>'manifest_member_digest'
         and context.cache_member_digest=v_cache->>'cache_member_digest'
         and context.full_predicate_evaluation_count=19
         and context.cache_scope='exact_state_manifest'
         and context.cache_miss_policy='fail_closed'
         and context.preparation_token=v_cache->>'preparation_token')<>1
     or (select count(*) from pg_temp.tmp_issue97_graph_release_current_cache)<>19
     or exists(select 1 from pg_temp.tmp_issue97_graph_release_current_cache cache
       where not cache.current) then
    raise exception 'Issue #97 Ohio report exact state-manifest cache validation failed';
  end if;
end
$issue97_ohio_report_preflight$;

with ohio_pads as (
  select id,legacy_id,pad_name,company,brinesearch_google_route_status_issue97
  from public.pads
  where state='Ohio' and coalesce(list_only,false)=false
), active_routes as (
  select route.*
  from public.brinesearch_route_prep route
  join ohio_pads pad on pad.id=route.pad_id
  where route.active and route.route_group in ('primary','alternate')
), primary_routes as (
  select * from active_routes where route_group='primary'
), alternate_routes as (
  select * from active_routes where route_group='alternate'
), all_receipt_rows as (
  select receipt.*,route.route_group as active_route_group
  from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
  join active_routes route on route.id=receipt.route_prep_id
), primary_receipt_rows as (
  select receipt.*
  from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
  join primary_routes route on route.id=receipt.route_prep_id
), alternate_receipt_rows as (
  select receipt.*
  from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
  join alternate_routes route on route.id=receipt.route_prep_id
), occurrence_rows as (
  select receipt.*
  from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
  join primary_routes route on route.id=receipt.route_prep_id
), transition_rows as (
  select receipt.*
  from private_verification.brinesearch_route_transition_receipts_issue97 receipt
  join primary_routes route on route.id=receipt.route_prep_id
), geometry_rows as (
  select receipt.*
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
  join primary_routes route on route.id=receipt.route_prep_id
), repeated_road_routes as (
  select distinct route_prep_id
  from (
    select route_prep_id,canonical_road_id
    from occurrence_rows
    where resolution_status='resolved' and canonical_road_id is not null
    group by route_prep_id,canonical_road_id
    having count(*)>1
  ) repeated
), primary_exception_reasons as (
  select reason,count(*)::integer as cnt
  from primary_receipt_rows receipt
  cross join lateral pg_catalog.unnest(coalesce(receipt.exception_reasons,'{}'::text[])) reason
  group by reason
)
select pg_catalog.jsonb_pretty(pg_catalog.jsonb_build_object(
  'observational_only',true,
  'state','Ohio',
  'checked_at',pg_catalog.clock_timestamp(),
  'manifest_id','c41f5320-1273-470c-a316-28b42211d697',
  'manifest_digest','9763dc5bb626da71881b7381ed28a436',
  'generation_key','issue97-release-20260815-r2',
  'manifest_member_count',19,
  'cutover_active',public.brinesearch_issue97_cutover_active(),
  'active_release_current_graphs',(select count(*)
    from pg_temp.tmp_issue97_graph_release_current_cache cache
    join public.brinesearch_road_graph_builds build on build.id=cache.build_id
    where cache.current and build.state_code='OH' and build.status='active'),
  'required_source_scopes',38,
  'current_source_scopes',38,
  'non_list_only_pads',(select count(*) from ohio_pads),
  'pads_with_active_primary_route',(select count(distinct pad_id) from primary_routes),
  'pads_without_active_primary_route',(select count(*) from ohio_pads pad where not exists(
    select 1 from primary_routes route where route.pad_id=pad.id
  )),
  'primary_routes_missing_current_receipt',(select count(*) from primary_routes route where not exists(
    select 1 from primary_receipt_rows receipt where receipt.route_prep_id=route.id
  )),
  'total_reconciliation_receipts',(select count(*) from all_receipt_rows),
  'primary_reconciliation_receipts',(select count(*) from primary_receipt_rows),
  'alternate_reconciliation_receipts',(select count(*) from alternate_receipt_rows),
  'alternate_receipt_pads',(select count(distinct pad_id) from alternate_receipt_rows),
  'primary_route_ready_receipts',(select count(*) from primary_receipt_rows where route_status='route_ready'),
  'primary_needs_review_receipts',(select count(*) from primary_receipt_rows where route_status='needs_review'),
  'primary_stale_receipts',(select count(*) from primary_receipt_rows where route_status='stale'),
  'alternate_route_ready_receipts',(select count(*) from alternate_receipt_rows where route_status='route_ready'),
  'alternate_needs_review_receipts',(select count(*) from alternate_receipt_rows where route_status='needs_review'),
  'alternate_stale_receipts',(select count(*) from alternate_receipt_rows where route_status='stale'),
  'primary_occurrences',(select count(*) from occurrence_rows),
  'primary_resolved_occurrences',(select count(*) from occurrence_rows where resolution_status='resolved'),
  'primary_held_occurrences',(select count(*) from occurrence_rows where resolution_status<>'resolved'),
  'occurrence_holds_by_reason',coalesce((select pg_catalog.jsonb_object_agg(hold_reason,cnt order by hold_reason)
    from (select hold_reason,count(*) cnt from occurrence_rows
      where resolution_status<>'resolved' group by hold_reason) q),'{}'::jsonb),
  'primary_transitions',(select count(*) from transition_rows),
  'primary_resolved_transitions',(select count(*) from transition_rows where status='resolved'),
  'primary_held_transitions',(select count(*) from transition_rows where status='held'),
  'transition_holds_by_reason',coalesce((select pg_catalog.jsonb_object_agg(hold_reason,cnt order by hold_reason)
    from (select hold_reason,count(*) cnt from transition_rows
      where status='held' group by hold_reason) q),'{}'::jsonb),
  'primary_geometry_receipts',(select count(*) from geometry_rows),
  'primary_resolved_geometry',(select count(*) from geometry_rows where status='resolved'),
  'primary_held_geometry',(select count(*) from geometry_rows where status<>'resolved'),
  'geometry_holds_by_reason',coalesce((select pg_catalog.jsonb_object_agg(hold_reason,cnt order by hold_reason)
    from (select hold_reason,count(*) cnt from geometry_rows
      where status<>'resolved' group by hold_reason) q),'{}'::jsonb),
  'primary_stage_counts',coalesce((select pg_catalog.jsonb_object_agg(stage,cnt order by stage)
    from (select stage,count(*) cnt from primary_receipt_rows group by stage) q),'{}'::jsonb),
  'primary_exception_reason_counts',coalesce((select pg_catalog.jsonb_object_agg(reason,cnt order by reason)
    from primary_exception_reasons),'{}'::jsonb),
  'repeated_road_routes',(select count(*) from repeated_road_routes),
  'shared_segment_sequence_transitions',(select count(*) from transition_rows
    where resolution_method='shared_segment_sequence_context'),
  'no_guess_proof',pg_catalog.jsonb_build_object(
    'occurrence_name_only',(select count(*) from occurrence_rows where resolution_method='name_only'),
    'occurrence_fuzzy_name',(select count(*) from occurrence_rows where resolution_method='fuzzy_name'),
    'occurrence_nearest_road',(select count(*) from occurrence_rows where resolution_method='nearest_road'),
    'occurrence_route_number_only',(select count(*) from occurrence_rows where resolution_method='route_number_only'),
    'transition_name_only',(select count(*) from transition_rows where resolution_method='name_only'),
    'transition_fuzzy_name',(select count(*) from transition_rows where resolution_method='fuzzy_name'),
    'transition_nearest_road',(select count(*) from transition_rows where resolution_method='nearest_road'),
    'transition_closest_anchor',(select count(*) from transition_rows where resolution_method='closest_anchor'),
    'transition_route_number_only',(select count(*) from transition_rows where resolution_method='route_number_only'),
    'geometry_name_only',(select count(*) from geometry_rows where geometry_method='name_only'),
    'geometry_fuzzy_name',(select count(*) from geometry_rows where geometry_method='fuzzy_name'),
    'geometry_nearest_road',(select count(*) from geometry_rows where geometry_method='nearest_road'),
    'geometry_nearest_point',(select count(*) from geometry_rows where geometry_method='nearest_point'),
    'geometry_route_number_only',(select count(*) from geometry_rows where geometry_method='route_number_only')
  ),
  'google_readiness_state',coalesce((select pg_catalog.jsonb_object_agg(
    coalesce(brinesearch_google_route_status_issue97,'not_evaluated'),cnt
    order by coalesce(brinesearch_google_route_status_issue97,'not_evaluated'))
    from (select brinesearch_google_route_status_issue97,count(*) cnt from ohio_pads
      group by brinesearch_google_route_status_issue97) google_status),'{}'::jsonb),
  'public_google_rows',(select count(*) from public.brinesearch_driver_google_routes_public),
  'global_saved_road_reconciliation_runs',(select count(*)
    from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)
)) as issue97_ohio_direction_readiness;

-- Highest-value real-world Ohio fixtures after the committed dark reconciliation.
select pad.legacy_id,pad.pad_name,route.route_group,route.variant_index,route.readiness_status,
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
  and (pad.legacy_id='ascent--cologie' or pad.pad_name='WALKING TALL')
order by pad.legacy_id,route.variant_index;

-- Complete Ohio exception queue: every active primary/alternate route without a
-- route-ready receipt, plus an explicit pad-scope row for each of the 282 pads
-- that has no active primary route. There is intentionally no LIMIT.
with ohio_pads as (
  select * from public.pads
  where state='Ohio' and coalesce(list_only,false)=false
), active_routes as (
  select route.* from public.brinesearch_route_prep route
  join ohio_pads pad on pad.id=route.pad_id
  where route.active and route.route_group in ('primary','alternate')
), primary_routes as (
  select * from active_routes where route_group='primary'
), exceptions as (
  select 'route'::text as queue_scope,pad.legacy_id,pad.pad_name,pad.company,
    route.route_group,route.variant_index,
    coalesce(receipt.route_status,'unresolved') as route_status,
    coalesce(receipt.stage,'missing_current_receipt') as stage,
    coalesce(receipt.held_occurrence_count,0) as held_occurrence_count,
    coalesce(receipt.exception_reasons,array['missing_current_receipt']::text[]) as exception_reasons
  from ohio_pads pad
  join active_routes route on route.pad_id=pad.id
  left join private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    on receipt.route_prep_id=route.id
  where receipt.route_status is null or receipt.route_status<>'route_ready'
  union all
  select 'pad'::text,pad.legacy_id,pad.pad_name,pad.company,
    'primary'::text,null::integer,'unresolved','no_active_primary_route',
    0,array['no_active_primary_route']::text[]
  from ohio_pads pad
  where not exists(select 1 from primary_routes route where route.pad_id=pad.id)
)
select * from exceptions
order by queue_scope,held_occurrence_count desc,company,pad_name,route_group,variant_index;

rollback;
