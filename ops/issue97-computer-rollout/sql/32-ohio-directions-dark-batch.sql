\set ON_ERROR_STOP on
\pset pager off
\timing on

-- Ohio-only post-activation dark route preparation. This intentionally does not
-- run the global saved-road reconciliation, Google publication, graph activation
-- or global cutover. Every Ohio non-list-only pad is processed against exactly
-- one active release-current graph in each of the 19 registered Ohio counties.

begin read only;
set local statement_timeout='15min';

do $issue97_ohio_direction_preflight$
declare
  v_manifest record;
  v_counties integer;
  v_sources integer;
  v_current_sources integer;
  v_pads integer;
  v_pad_digest text;
begin
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Issue #97 Ohio dark directions require global cutover OFF';
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 Ohio dark directions refuse a staging graph';
  end if;
  if exists(select 1 from pg_catalog.pg_stat_activity activity
      where activity.pid<>pg_catalog.pg_backend_pid()
        and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
        and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%') then
    raise exception 'Issue #97 Ohio dark directions refuse an active graph builder';
  end if;

  select manifest.* into strict v_manifest
  from private_verification.brinesearch_issue97_state_candidate_manifests manifest
  where manifest.id='c41f5320-1273-470c-a316-28b42211d697'::uuid
    and manifest.manifest_key='issue97-ohio-r2-final-candidate'
    and manifest.state_code='OH' and manifest.member_count=19
    and manifest.generation_key='issue97-release-20260815-r2'
    and manifest.manifest_digest='9763dc5bb626da71881b7381ed28a436';
  if not private_verification.brinesearch_issue97_state_candidate_manifest_current(v_manifest.id)
     or v_manifest.review_details->>'global_cutover_authorized'<>'false'
     or v_manifest.review_details->>'ohio_non_list_only_pad_count'<>'940'
     or v_manifest.review_details->>'ohio_pad_scope_digest'<>'9867f2352ac1b7276d057a83edd95d5f'
     or (select count(*)
       from private_verification.brinesearch_issue97_state_candidate_manifest_members member
       join public.brinesearch_road_graph_builds build
         on build.id=(member.member_value->>'build_id')::uuid
        and build.state_code='OH' and build.county_code=member.member_value->>'county_code'
        and build.graph_digest=member.member_value->>'graph_digest'
        and build.status='active'
        and private_verification.brinesearch_issue97_graph_build_release_current(build.id)
       where member.manifest_id=v_manifest.id)<>19 then
    raise exception 'Issue #97 Ohio dark directions require the exact current 19-member audited Ohio activation manifest';
  end if;

  select count(*)::integer into v_counties
  from public.brinesearch_road_graph_counties county
  where county.active and county.state_code='OH'
    and (select count(*) from public.brinesearch_road_graph_builds build
      where build.state_code='OH' and build.county_code=county.county_code
        and build.status='active'
        and private_verification.brinesearch_issue97_graph_build_release_current(build.id))=1;
  if v_counties<>19 then
    raise exception 'Issue #97 Ohio dark directions require 19/19 active release-current Ohio graphs; found %',v_counties;
  end if;

  select count(*)::integer,
    count(*) filter(where private_verification.brinesearch_issue97_dataset_scope_current(
      scope.dataset_id,scope.state_code,scope.county_code
    ))::integer
  into v_sources,v_current_sources
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset
    on dataset.id=scope.dataset_id and dataset.active
  where scope.active and scope.ingest_enabled and scope.required_for_graph
    and scope.state_code='OH';
  if v_sources<>38 or v_current_sources<>38 then
    raise exception 'Issue #97 Ohio dark directions require Ohio source scopes 38/38 current; found %/%',
      v_current_sources,v_sources;
  end if;

  select count(*)::integer,pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pad.id::text||':'||pad.legacy_id,'|' order by pad.id
  ),'')) into v_pads,v_pad_digest
  from public.pads pad
  where pad.state='Ohio' and coalesce(pad.list_only,false)=false;
  if v_pads<>940 or v_pad_digest<>'9867f2352ac1b7276d057a83edd95d5f' then
    raise exception 'Issue #97 reviewed Ohio pad scope changed; expected 940 / 9867f2352ac1b7276d057a83edd95d5f found % / %',
      v_pads,v_pad_digest;
  end if;
  if (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0 then
    raise exception 'Issue #97 Ohio dark directions require global saved-road reconciliation and public Google projection still dark';
  end if;
end
$issue97_ohio_direction_preflight$;

-- Exact non-Ohio graph/receipt snapshot. The postcheck recomputes these digests
-- rather than relying on timestamps, and also compares them to the manifest's
-- immutable pre-activation baseline.
select pg_catalog.md5(coalesce(pg_catalog.string_agg(
  build.id::text||':'||build.state_code||':'||build.county_code||':'||build.status||':'||
    coalesce(build.activated_at::text,'')||':'||coalesce(build.graph_digest,'')||':'||build.details::text,
  '|' order by build.id
),'')) as non_ohio_graph_digest,
(select pg_catalog.md5(pg_catalog.concat_ws('|',
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id,receipt.occurrence_index
    ),''))
   from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
   join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id,receipt.boundary_index
    ),''))
   from private_verification.brinesearch_route_transition_receipts_issue97 receipt
   join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id,receipt.occurrence_index
    ),''))
   from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
   join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id
    ),''))
   from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
   join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania'))
))) as non_ohio_route_digest
from public.brinesearch_road_graph_builds build
where build.state_code in ('WV','PA')
\gset issue97_before_

select manifest.review_details->>'non_ohio_graph_digest'=:'issue97_before_non_ohio_graph_digest'
    and manifest.review_details->>'non_ohio_route_digest'=:'issue97_before_non_ohio_route_digest'
    as matches_manifest_baseline
from private_verification.brinesearch_issue97_state_candidate_manifests manifest
where manifest.id='c41f5320-1273-470c-a316-28b42211d697'::uuid
  and manifest.manifest_key='issue97-ohio-r2-final-candidate'
  and manifest.state_code='OH' and manifest.member_count=19
  and manifest.generation_key='issue97-release-20260815-r2'
  and manifest.manifest_digest='9763dc5bb626da71881b7381ed28a436'
\gset issue97_before_manifest_

\if :issue97_before_manifest_matches_manifest_baseline
\else
  do $fail$ begin raise exception 'Issue #97 non-Ohio state changed after the audited Ohio manifest'; end $fail$;
\endif

rollback;

begin;
set local statement_timeout='90min';
set local lock_timeout='2min';

do $issue97_ohio_direction_batch$
declare
  pad_row record;
  v_manifest record;
  v_cache jsonb;
  v_processed integer:=0;
  v_pads integer;
  v_pad_digest text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:ohio-state-release')
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('brinesearch:issue97:route-corpus',97)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );

  select manifest.* into strict v_manifest
  from private_verification.brinesearch_issue97_state_candidate_manifests manifest
  where manifest.id='c41f5320-1273-470c-a316-28b42211d697'::uuid
    and manifest.manifest_key='issue97-ohio-r2-final-candidate'
    and manifest.state_code='OH' and manifest.member_count=19
    and manifest.generation_key='issue97-release-20260815-r2'
    and manifest.manifest_digest='9763dc5bb626da71881b7381ed28a436';
  select count(*)::integer,pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pad.id::text||':'||pad.legacy_id,'|' order by pad.id
  ),'')) into v_pads,v_pad_digest
  from public.pads pad
  where pad.state='Ohio' and coalesce(pad.list_only,false)=false;

  if v_manifest.review_details->>'global_cutover_authorized'<>'false'
     or v_manifest.review_details->>'ohio_non_list_only_pad_count'<>'940'
     or v_manifest.review_details->>'ohio_pad_scope_digest'<>'9867f2352ac1b7276d057a83edd95d5f'
     or v_pads<>940 or v_pad_digest<>'9867f2352ac1b7276d057a83edd95d5f'
     or public.brinesearch_issue97_cutover_active()
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 Ohio dark direction execution guard failed';
  end if;

  -- Prepare one immutable, exact-manifest release-current snapshot before the
  -- 940-pad loop. Corpus/solver/transition consumers reuse it; an unknown build
  -- is false and cannot become route truth mid-transaction.
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
  if v_cache->>'manifest_id'<>v_manifest.id::text
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
     or coalesce(v_cache->>'manifest_member_digest','') !~ '^[0-9a-f]{32}$'
     or coalesce(v_cache->>'cache_member_digest','') !~ '^[0-9a-f]{32}$'
     or v_cache->>'full_predicate_evaluation_count'<>'19'
     or (select count(*)
       from pg_temp.tmp_issue97_graph_release_current_cache_context context
       where context.manifest_id=v_manifest.id
         and context.manifest_digest='9763dc5bb626da71881b7381ed28a436'
         and context.state_code='OH'
         and context.generation_key='issue97-release-20260815-r2'
         and context.member_count=19
         and context.source_scope_count=38
         and context.manifest_member_digest=v_cache->>'manifest_member_digest'
         and context.cache_member_digest=v_cache->>'cache_member_digest'
         and context.full_predicate_evaluation_count=19
         and context.cache_scope='exact_state_manifest'
         and context.cache_miss_policy='fail_closed')<>1
     or (select count(*) from pg_temp.tmp_issue97_graph_release_current_cache)<>19
     or exists(
       select 1 from pg_temp.tmp_issue97_graph_release_current_cache cache
       where not cache.current
     ) then
    raise exception 'Issue #97 Ohio exact manifest-bound cache preparation failed';
  end if;

  for pad_row in
    select pad.id
    from public.pads pad
    where pad.state='Ohio' and coalesce(pad.list_only,false)=false
    order by pad.id
  loop
    perform public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(pad_row.id);
    v_processed:=v_processed+1;
  end loop;
  if v_processed<>940 then
    raise exception 'Issue #97 Ohio dark direction batch processed % pads; expected 940',v_processed;
  end if;
end
$issue97_ohio_direction_batch$;

-- Verify all isolation and dark-state invariants before committing the batch.
with manifest as (
  select * from private_verification.brinesearch_issue97_state_candidate_manifests
  where id='c41f5320-1273-470c-a316-28b42211d697'::uuid
    and manifest_key='issue97-ohio-r2-final-candidate'
    and state_code='OH' and member_count=19
    and generation_key='issue97-release-20260815-r2'
    and manifest_digest='9763dc5bb626da71881b7381ed28a436'
), current_non_ohio as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||build.state_code||':'||build.county_code||':'||build.status||':'||
      coalesce(build.activated_at::text,'')||':'||coalesce(build.graph_digest,'')||':'||build.details::text,
    '|' order by build.id
  ),'')) as graph_digest,
  (select pg_catalog.md5(pg_catalog.concat_ws('|',
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id,receipt.occurrence_index
    ),''))
   from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
   join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id,receipt.boundary_index
    ),''))
   from private_verification.brinesearch_route_transition_receipts_issue97 receipt
   join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id,receipt.occurrence_index
    ),''))
   from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
   join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id
    ),''))
   from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
   join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania'))
  ))) as route_digest
  from public.brinesearch_road_graph_builds build where build.state_code in ('WV','PA')
), ohio_receipts as (
  select count(distinct receipt.pad_id)::integer as receipt_pads,
    count(*) filter(where receipt.route_status='route_ready')::integer as route_ready,
    count(*) filter(where receipt.route_status='needs_review')::integer as needs_review,
    count(*) filter(where receipt.route_status='stale')::integer as stale
  from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
  join public.brinesearch_route_prep route on route.id=receipt.route_prep_id
    and route.active and route.route_group='primary'
  join public.pads pad on pad.id=receipt.pad_id
  where pad.state='Ohio' and coalesce(pad.list_only,false)=false
)
select current_non_ohio.graph_digest=:'issue97_before_non_ohio_graph_digest'
    and current_non_ohio.graph_digest=manifest.review_details->>'non_ohio_graph_digest'
    as non_ohio_graph_unchanged,
  current_non_ohio.route_digest=:'issue97_before_non_ohio_route_digest'
    and current_non_ohio.route_digest=manifest.review_details->>'non_ohio_route_digest'
    as non_ohio_routes_unchanged,
  private_verification.brinesearch_issue97_state_candidate_manifest_current(manifest.id)
    as manifest_current,
  not public.brinesearch_issue97_cutover_active() as cutover_off,
  not exists(select 1 from public.brinesearch_road_graph_builds where status='staging') as no_staging,
  (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)=0
    as global_reconciliation_dark,
  (select count(*) from public.brinesearch_driver_google_routes_public)=0 as public_google_dark,
  pg_catalog.jsonb_build_object('active_primary_receipt_pads',ohio_receipts.receipt_pads,
    'route_ready',ohio_receipts.route_ready,'needs_review',ohio_receipts.needs_review,
    'stale',ohio_receipts.stale) as ohio_receipt_summary
from current_non_ohio cross join manifest cross join ohio_receipts
\gset issue97_after_

\if :issue97_after_non_ohio_graph_unchanged
\else
  do $fail$ begin raise exception 'Issue #97 Ohio dark direction batch changed non-Ohio graph state'; end $fail$;
\endif
\if :issue97_after_non_ohio_routes_unchanged
\else
  do $fail$ begin raise exception 'Issue #97 Ohio dark direction batch changed non-Ohio route receipts'; end $fail$;
\endif
\if :issue97_after_manifest_current
\else
  do $fail$ begin raise exception 'Issue #97 Ohio dark direction batch invalidated the Ohio state manifest'; end $fail$;
\endif
\if :issue97_after_cutover_off
\else
  do $fail$ begin raise exception 'Issue #97 Ohio dark direction batch changed global cutover'; end $fail$;
\endif
\if :issue97_after_no_staging
\else
  do $fail$ begin raise exception 'Issue #97 Ohio dark direction batch left a staging graph'; end $fail$;
\endif
\if :issue97_after_global_reconciliation_dark
\else
  do $fail$ begin raise exception 'Issue #97 Ohio dark direction batch ran global saved-road reconciliation'; end $fail$;
\endif
\if :issue97_after_public_google_dark
\else
  do $fail$ begin raise exception 'Issue #97 Ohio dark direction batch populated public Google routes before cutover'; end $fail$;
\endif

commit;
\echo :issue97_after_ohio_receipt_summary
\echo 'Issue #97 Ohio-only dark direction reconciliation completed for 940 pads; exact state manifest remains current; non-Ohio graph/routes unchanged; global reconciliation, Google publication and cutover remain dark.'
