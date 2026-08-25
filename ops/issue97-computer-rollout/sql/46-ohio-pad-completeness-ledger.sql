\set ON_ERROR_STOP on
\pset pager off
\timing on

-- Read-only, no-guess inventory for every Ohio pad exposed by the current V18
-- directory snapshot. This query reports authority gaps; it does not reconcile,
-- activate, publish, refresh, or modify any route, graph, Google, pad, or source
-- record.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='2s';

with current_snapshot as (
  select snapshot.*
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.publication_state='current'
  order by snapshot.source_revision desc
  limit 1
), ohio_pad_scope as (
  select row.*
  from public.brinesearch_directory_snapshot_rows_v18 row
  join current_snapshot snapshot on snapshot.snapshot_id=row.snapshot_id
  where row.state='Ohio' and row.record_type='pad'
), active_route_counts as (
  select route.pad_id,
    count(*) filter(where route.route_group='primary')::integer as primary_count,
    count(*) filter(where route.route_group='alternate')::integer as alternate_count
  from public.brinesearch_route_prep route
  join ohio_pad_scope scope on scope.pad_id=route.pad_id
  where route.active
  group by route.pad_id
), primary_route as (
  select distinct on (route.pad_id) route.*
  from public.brinesearch_route_prep route
  join ohio_pad_scope scope on scope.pad_id=route.pad_id
  where route.active and route.route_group='primary'
  order by route.pad_id,route.variant_index,route.id
), ledger as (
  select
    scope.pad_id,
    scope.legacy_id,
    scope.company,
    scope.pad_name,
    scope.county,
    scope.township,
    coalesce(pad.list_only,false) as list_only,
    (pad.latitude is not null and pad.longitude is not null) as has_gps,
    (directions.pad_id is not null
      and nullif(pg_catalog.btrim(directions.directions_clear),'') is not null)
      as has_reviewed_directions,
    (nullif(pg_catalog.btrim(scope.structured_road_sequence),'') is not null)
      as has_structured_sequence,
    coalesce(counts.primary_count,0) as active_primary_count,
    coalesce(counts.alternate_count,0) as active_alternate_count,
    route.readiness_status as primary_readiness,
    coalesce(route.issue_codes,'{}'::text[]) as primary_issue_codes,
    receipt.route_status,
    receipt.stage as route_stage,
    coalesce(receipt.road_occurrence_count,0) as road_occurrence_count,
    coalesce(receipt.resolved_occurrence_count,0) as resolved_occurrence_count,
    coalesce(receipt.held_occurrence_count,0) as held_occurrence_count,
    coalesce(receipt.canonical_mapping_count,0) as canonical_mapping_count,
    coalesce(receipt.exact_geometry_count,0) as exact_geometry_count,
    coalesce(receipt.exception_reasons,'{}'::text[]) as route_exception_reasons,
    google.status as private_google_status,
    google.hold_reason as private_google_hold_reason,
    (public_google.pad_id is not null) as public_google_published
  from ohio_pad_scope scope
  join public.pads pad on pad.id=scope.pad_id
  left join public.brinesearch_driver_directions_public directions
    on directions.pad_id=scope.pad_id
  left join active_route_counts counts on counts.pad_id=scope.pad_id
  left join primary_route route on route.pad_id=scope.pad_id
  left join private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    on receipt.route_prep_id=route.id
  left join private_verification.brinesearch_google_route_receipts_issue97 google
    on google.pad_id=scope.pad_id
  left join public.brinesearch_driver_google_routes_public public_google
    on public_google.pad_id=scope.pad_id
)
select pg_catalog.jsonb_build_object(
  'snapshot',(select pg_catalog.jsonb_build_object(
    'snapshot_id',snapshot_id,
    'source_revision',source_revision,
    'row_count',row_count,
    'searchable_count',searchable_count,
    'content_sha256',content_sha256
  ) from current_snapshot),
  'checked_at',pg_catalog.clock_timestamp(),
  'summary',pg_catalog.jsonb_build_object(
    'ohio_pad_count',(select count(*) from ledger),
    'gps_complete',(select count(*) from ledger where has_gps),
    'gps_missing',(select count(*) from ledger where not has_gps),
    'reviewed_directions_present',(select count(*) from ledger where has_reviewed_directions),
    'reviewed_directions_missing',(select count(*) from ledger where not has_reviewed_directions),
    'structured_sequence_present',(select count(*) from ledger where has_structured_sequence),
    'structured_sequence_missing',(select count(*) from ledger where not has_structured_sequence),
    'active_primary_route_present',(select count(*) from ledger where active_primary_count>0),
    'active_primary_route_missing',(select count(*) from ledger where active_primary_count=0),
    'route_ready',(select count(*) from ledger where route_status='route_ready'),
    'route_not_ready',(select count(*) from ledger where route_status is distinct from 'route_ready'),
    'private_google_ready',(select count(*) from ledger where private_google_status='ready'),
    'private_google_held',(select count(*) from ledger where private_google_status='held'),
    'private_google_stale',(select count(*) from ledger where private_google_status='stale'),
    'private_google_absent',(select count(*) from ledger where private_google_status is null),
    'public_google_published',(select count(*) from ledger where public_google_published)
  ),
  'rows',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ledger)
    order by company,pad_name,pad_id) from ledger),'[]'::jsonb)
) as ohio_pad_ledger;

rollback;
