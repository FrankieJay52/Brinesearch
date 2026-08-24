\set ON_ERROR_STOP on
\pset pager off
\timing on

-- Fixed-scope recovery/status only. Safe after an error or client disconnect.
begin isolation level repeatable read read only;
set local statement_timeout='15min';

with manifest as (
  select * from private_verification.brinesearch_issue97_state_candidate_manifests
  where manifest_key='issue97-ohio-r2-final-candidate'
), ohio_builds as (
  select build.county_code,build.id,build.status,build.graph_digest,
    build.activated_at,build.details->>'activation_status' as activation_status,
    private_verification.brinesearch_issue97_graph_build_sources_current(build.id) as source_current,
    private_verification.brinesearch_issue97_graph_build_release_current(build.id) as release_current
  from public.brinesearch_road_graph_builds build
  where build.id in (
    '8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb','24ffa531-0e69-4625-a137-da52020e6fd0',
    '5ee5f97b-447f-41d3-946a-68a8b28d8367','c9f50b03-4328-4d8b-9995-4dc8bc85dd01',
    '7c979743-72e4-42a2-a6a9-006a369168c0','84568854-3257-46b7-8581-374dc620ef16',
    '542c35d5-a9ba-4b43-8a64-63a66f6b29e2','cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4',
    '360472bf-cb96-4ba7-b2fe-efa04e230f69','e1cb9c50-f2ec-486a-ba9c-2b4c0fcaf048',
    'ab9f4083-d572-4d9d-8e0a-28ebb77517e7','98ae1835-1064-4c18-a8a7-9a9e570e212d',
    '70f30495-860a-4199-9360-8e880f3b515b','c645a8bf-a920-432a-a341-a7b60d9cfd49',
    '67541fad-5cf2-4483-b0f6-f4060197fda9','3c94b14c-9d9e-41ec-a897-b754dab6d8dd',
    'fd6fdfff-f23f-42cc-a633-64448bd9d044','785f5277-369c-4ae3-ba80-31411745e46d',
    '90982f30-8a06-4a53-8b4b-9efd5d9042bf'
  )
), non_ohio as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||build.state_code||':'||build.county_code||':'||build.status||':'||
      coalesce(build.activated_at::text,'')||':'||coalesce(build.graph_digest,'')||':'||build.details::text,
    '|' order by build.id
  ),'')) as graph_digest,
  (select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.boundary_index),'')) from private_verification.brinesearch_route_transition_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania'))
  ))) as route_digest
  from public.brinesearch_road_graph_builds build where build.state_code in ('WV','PA')
)
select pg_catalog.jsonb_pretty(pg_catalog.jsonb_build_object(
  'checked_at',pg_catalog.clock_timestamp(),
  'manifest',coalesce((select pg_catalog.jsonb_build_object(
    'id',id,'digest',manifest_digest,'git_sha',git_sha,'member_count',member_count,
    'current',private_verification.brinesearch_issue97_state_candidate_manifest_current(id),
    'created_at',created_at
  ) from manifest),'null'::pg_catalog.jsonb),
  'selected_builds',(select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ohio_builds)
    order by county_code) from ohio_builds),
  'selected_active',(select count(*) from ohio_builds where status='active'),
  'selected_validated',(select count(*) from ohio_builds where status='validated'),
  'non_ohio_graph_digest',(select graph_digest from non_ohio),
  'non_ohio_route_digest',(select route_digest from non_ohio),
  'non_ohio_matches_manifest',coalesce((select
    non_ohio.graph_digest=manifest.review_details->>'non_ohio_graph_digest'
    and non_ohio.route_digest=manifest.review_details->>'non_ohio_route_digest'
    from non_ohio cross join manifest),false),
  'cutover',public.brinesearch_issue97_cutover_active(),
  'staging',(select count(*) from public.brinesearch_road_graph_builds where status='staging'),
  'builder_sessions',(select count(*) from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
      and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'),
  'saved_road_reconciliation_runs',(select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs),
  'ohio_route_receipt_pads',(select count(distinct receipt.pad_id)
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    join public.pads pad on pad.id=receipt.pad_id
    where pad.state='Ohio' and coalesce(pad.list_only,false)=false),
  'public_google_routes',(select count(*) from public.brinesearch_driver_google_routes_public)
)) as issue97_ohio_release_status;

rollback;
