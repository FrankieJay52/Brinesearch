\set ON_ERROR_STOP on
\pset pager off
\timing on

begin read only;
set local statement_timeout='5min';

select pg_catalog.jsonb_pretty(pg_catalog.jsonb_build_object(
  'observational_only',true,
  'checked_at',pg_catalog.clock_timestamp(),
  'cutover_active',public.brinesearch_issue97_cutover_active(),
  'registered_counties',(select count(*) from public.brinesearch_road_graph_counties where active),
  'active_graphs',(select count(*) from public.brinesearch_road_graph_builds where status='active'),
  'active_current_graphs',(select count(*) from public.brinesearch_road_graph_builds build
    where build.status='active'
      and private_verification.brinesearch_issue97_graph_build_sources_current(build.id)),
  'staging_graphs',(select count(*) from public.brinesearch_road_graph_builds where status='staging'),
  'active_direction_pipeline_sessions',(select count(*) from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid() and activity.state='active'
      and (activity.query ilike '%brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core%'
        or activity.query ilike '%brinesearch_issue97_refresh_saved_road_reconciliation%')),
  'route_corpus',private_verification.brinesearch_issue97_route_corpus_metrics_json(),
  'transitions',private_verification.brinesearch_issue97_transition_metrics_json(),
  'geometry',private_verification.brinesearch_issue97_geometry_metrics_json(),
  'phase1_integrity',private_verification.brinesearch_issue97_phase1_release_gate(),
  'google_accounting',public.brinesearch_issue97_google_route_readiness_report(),
  'rollout_complete',false,
  'completion_authority',
    'observational report only; final audited release checkpoint must determine completion',
  'remaining_non_database_release_gates',pg_catalog.jsonb_build_array(
    'named fixture audit',
    'shared corridor fingerprint and outlier QA',
    'automatic driver-facing direction materialization',
    'independent final read-only audit and live verification'
  )
)) as issue97_direction_readiness;

select pad.legacy_id,route.active,route.route_group,route.variant_index,
  route.readiness_status,route.source_sequence_hash,
  receipt.route_status,receipt.stage,receipt.road_occurrence_count,
  receipt.resolved_occurrence_count,receipt.held_occurrence_count,
  receipt.exception_reasons
from public.pads pad
left join public.brinesearch_route_prep route on route.pad_id=pad.id and route.active
left join private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
  on receipt.route_prep_id=route.id
where pad.legacy_id in (
  'ascent--cooper','ascent--noelle','eclipse--dale-yoder-unit',
  'swn--rayle-coal','expand--rayle-coal-company'
)
order by pad.legacy_id,route.route_group,route.variant_index;

commit;
