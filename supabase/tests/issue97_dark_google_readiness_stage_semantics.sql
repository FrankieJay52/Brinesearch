-- GitHub #97 — executable rollback-only private/dark Google and route-stage regression.
-- Installs the proposed forward migration only inside this transaction. No graph,
-- route, receipt, pad, cutover or publication change survives the final ROLLBACK.
\set ON_ERROR_STOP on
\pset pager off
\timing on

begin;
set local statement_timeout='20min';
set local lock_timeout='2min';

create temporary table tmp_issue97_dark_global_baseline on commit drop as
select
  public.brinesearch_issue97_cutover_active() as cutover_active,
  (select count(*) from public.brinesearch_driver_google_routes_public) as public_rows,
  (select count(*) from private_verification.brinesearch_google_route_receipts_issue97) as private_rows,
  (select count(*) from private_verification.brinesearch_route_reconciliation_receipts_issue97) as route_receipts,
  (select max(updated_at) from private_verification.brinesearch_route_reconciliation_receipts_issue97) as latest_route_receipt;

create temporary table tmp_issue97_dark_fixture_baseline on commit drop as
select p.id,p.legacy_id,p.brinesearch_google_route_status_issue97,
  p.brinesearch_google_route_revision_issue97,
  (select count(*) from public.brinesearch_driver_google_routes_public pub where pub.pad_id=p.id) as public_rows
from public.pads p
where p.legacy_id in (
  'ascent--cologie','ascent--bakos','ascent--liggett','eog--west',
  'gulfport--gehrig','eqt--walking-tall'
);

\ir ../migrations/20260817010000_issue97_dark_google_readiness_stage_semantics.sql

do $issue97_dark_google_acl_assertions$
declare
  v_signature text;
  v_role text;
begin
  foreach v_signature in array array[
    'private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text)',
    'private_verification.brinesearch_issue97_transition_google_dependency(uuid)',
    'private_verification.brinesearch_issue97_hold_google_route_dark(uuid,bigint,text,jsonb,text)',
    'private_verification.brinesearch_issue97_refresh_google_route_transition_dark(uuid)',
    'private_verification.brinesearch_issue97_transition_google_dark_current(uuid)',
    'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)',
    'private_verification.brinesearch_issue97_transition_google_current(uuid)',
    'private_verification.brinesearch_issue97_refresh_google_routes_dark(uuid)',
    'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)'
  ] loop
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if pg_catalog.has_function_privilege(v_role,v_signature,'EXECUTE') then
        raise exception 'Issue #97 private function % remains executable by %',v_signature,v_role;
      end if;
    end loop;
  end loop;
  if pg_catalog.has_function_privilege(
       'anon','public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(uuid)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(uuid)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(uuid)','EXECUTE'
     ) then
    raise exception 'Issue #97 public dark pipeline ACL is not service-only';
  end if;
end
$issue97_dark_google_acl_assertions$;

create or replace function pg_temp.issue97_assert(p_ok boolean,p_message text)
returns void language plpgsql set search_path='' as $$
begin
  if not coalesce(p_ok,false) then raise exception '%',p_message; end if;
end
$$;

-- Serialize with the reviewed Ohio/source/mapping lanes before any rollback-only
-- fixture mutation. These locks are transaction-scoped and released by ROLLBACK.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:ohio-state-release')
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:route-corpus',97)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

-- CURRENT source semantics are dataset_scope_current + newest verified run in
-- the exact dataset/state/county scope. The production schema has no
-- last_success_run_id column, and this regression intentionally does not revive
-- that stale contract.
create temporary table tmp_issue97_active_source_run_semantics on commit drop as
with graph_runs as (
  select distinct
    (source_entry.value->>'run_id')::uuid as graph_run_id,
    (source_entry.value->>'dataset_id')::uuid as dataset_id,
    source_entry.value->>'state_code' as state_code,
    source_entry.value->>'county_code' as county_code
  from public.brinesearch_road_graph_builds build
  cross join lateral pg_catalog.jsonb_array_elements(
    build.details->'source_run_vector'
  ) source_entry(value)
  where build.status='active' and build.state_code='OH'
), evaluated as (
  select graph_runs.*,
    private_verification.brinesearch_issue97_dataset_scope_current(
      dataset_id,state_code,county_code
    ) as scope_current,
    private_verification.brinesearch_issue97_current_verified_run_id(
      dataset_id,state_code,county_code
    ) as helper_run_id,
    (
      select run.id
      from public.brinesearch_road_source_ingest_runs run
      where run.dataset_id=graph_runs.dataset_id
        and run.state_code=graph_runs.state_code
        and run.county_code=graph_runs.county_code
        and private_verification.brinesearch_issue97_ingest_run_verified(run.id)
      order by run.started_at desc,run.id desc
      limit 1
    ) as newest_verified_run_id,
    (
      select run.id
      from public.brinesearch_road_source_ingest_runs run
      where run.dataset_id=graph_runs.dataset_id
        and run.state_code=graph_runs.state_code
        and run.county_code=graph_runs.county_code
      order by run.started_at desc,run.id desc
      limit 1
    ) as newest_attempt_run_id,
    (
      select count(*)
      from public.brinesearch_road_source_ingest_runs run
      where run.dataset_id=graph_runs.dataset_id
        and run.state_code=graph_runs.state_code
        and run.county_code=graph_runs.county_code
        and private_verification.brinesearch_issue97_ingest_run_verified(run.id)
    )::integer as verified_run_count
  from graph_runs
)
select * from evaluated;

select pg_temp.issue97_assert(
  (select count(*) from pg_temp.tmp_issue97_active_source_run_semantics)=41
  and (select count(*) from pg_temp.tmp_issue97_active_source_run_semantics
       where scope_current)=41
  and (select count(*) from pg_temp.tmp_issue97_active_source_run_semantics
       where graph_run_id=newest_verified_run_id)=41
  and (select count(*) from pg_temp.tmp_issue97_active_source_run_semantics
       where graph_run_id=newest_attempt_run_id)=41
  and (select count(*) from pg_temp.tmp_issue97_active_source_run_semantics
       where helper_run_id=newest_verified_run_id)=41
  and (select count(*) from pg_temp.tmp_issue97_active_source_run_semantics
       where verified_run_count>1)=5,
  'Issue #97 active Ohio source-run vector is not exact/current/newest-verified'
);
select pg_temp.issue97_assert(
  private_verification.brinesearch_issue97_current_verified_run_id(
    (select dataset_id from pg_temp.tmp_issue97_active_source_run_semantics order by dataset_id limit 1),
    'ZZ','ZZZ'
  ) is null,
  'Issue #97 source helper escaped its exact dataset/state/county scope'
);

create temporary table tmp_issue97_source_false_fixture on commit drop as
select dataset_id,state_code,county_code,newest_verified_run_id
from pg_temp.tmp_issue97_active_source_run_semantics
where verified_run_count>1 and state_code='OH'
order by dataset_id,county_code
limit 1;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
  'brinesearch:issue97:ingest:'||
  (select dataset_id::text from pg_temp.tmp_issue97_source_false_fixture)||':'||
  (select county_code from pg_temp.tmp_issue97_source_false_fixture)
));
savepoint issue97_source_scope_not_current;
update public.brinesearch_road_source_ingest_runs run set
  status='failed',
  details=pg_catalog.jsonb_set(
    run.details,'{source_snapshot,object_id_set_digest}',
    pg_catalog.to_jsonb('00000000000000000000000000000000'::text),true
  )
where run.id=(select newest_verified_run_id from pg_temp.tmp_issue97_source_false_fixture);
select pg_temp.issue97_assert(
  not private_verification.brinesearch_issue97_dataset_scope_current(
    (select dataset_id from pg_temp.tmp_issue97_source_false_fixture),
    (select state_code from pg_temp.tmp_issue97_source_false_fixture),
    (select county_code from pg_temp.tmp_issue97_source_false_fixture)
  )
  and private_verification.brinesearch_issue97_current_verified_run_id(
    (select dataset_id from pg_temp.tmp_issue97_source_false_fixture),
    (select state_code from pg_temp.tmp_issue97_source_false_fixture),
    (select county_code from pg_temp.tmp_issue97_source_false_fixture)
  ) is null,
  'Issue #97 source helper did not return NULL for a transaction-local noncurrent scope'
);
rollback to savepoint issue97_source_scope_not_current;
release savepoint issue97_source_scope_not_current;

-- Projection, dependency, release-state and all affected-table trigger functions
-- must be transaction-only SQL. Any network/NOTIFY/autonomous escape blocks the
-- synthetic cutover-on proof before it can run.
do $issue97_no_external_side_effects$
declare
  v_unsafe integer;
begin
  with reachable_functions(oid) as (
    select function_oid
    from pg_catalog.unnest(array[
      'public.brinesearch_issue97_cutover_active()'::pg_catalog.regprocedure::oid,
      'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)'::pg_catalog.regprocedure::oid,
      'private_verification.brinesearch_issue97_transition_google_current(uuid)'::pg_catalog.regprocedure::oid,
      'private_verification.brinesearch_issue97_transition_google_dark_current(uuid)'::pg_catalog.regprocedure::oid,
      'private_verification.brinesearch_issue97_transition_google_dependency(uuid)'::pg_catalog.regprocedure::oid,
      'private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text)'::pg_catalog.regprocedure::oid,
      'private_verification.brinesearch_issue97_dataset_scope_current(uuid,text,text)'::pg_catalog.regprocedure::oid,
      'private_verification.brinesearch_issue97_ingest_run_verified(uuid)'::pg_catalog.regprocedure::oid,
      'private_verification.brinesearch_issue97_graph_build_release_current_contextual(uuid)'::pg_catalog.regprocedure::oid,
      'private_verification.brinesearch_issue97_mapping_fingerprint(uuid)'::pg_catalog.regprocedure::oid,
      'private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(uuid)'::pg_catalog.regprocedure::oid,
      'private_verification.brinesearch_issue97_pad_safety_facts(uuid)'::pg_catalog.regprocedure::oid,
      'private_verification.brinesearch_issue97_route_data_blocked(uuid)'::pg_catalog.regprocedure::oid
    ]::oid[]) function_oid
    union
    select trigger.tgfoid
    from pg_catalog.pg_trigger trigger
    join pg_catalog.pg_class relation on relation.oid=trigger.tgrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where not trigger.tgisinternal and (
      (namespace.nspname='public' and relation.relname in (
        'pads','brinesearch_driver_google_routes_public',
        'brinesearch_issue97_release_state','brinesearch_road_source_ingest_runs'
      )) or
      (namespace.nspname='private_verification' and relation.relname in (
        'brinesearch_google_route_receipts_issue97',
        'brinesearch_google_route_refresh_queue_issue97'
      ))
    )
  )
  select count(*) into v_unsafe
  from reachable_functions reachable
  where pg_catalog.pg_get_functiondef(reachable.oid) ~* (
    'pg_notify|(^|[^a-z])notify([^a-z]|$)|pg_net|net[.]http|extensions[.]http|'
    'http_(get|post)|webhook|dblink|lo_export|copy[[:space:]].*program'
  );
  if v_unsafe<>0 then
    raise exception 'Issue #97 synthetic cutover proof found % externally escaping functions',v_unsafe;
  end if;
end
$issue97_no_external_side_effects$;

create temporary table tmp_issue97_dark_ready_results on commit drop as
select p.legacy_id,
  private_verification.brinesearch_issue97_refresh_google_route_transition_dark(p.id) as result
from public.pads p
where p.legacy_id in ('ascent--cologie','ascent--bakos')
order by p.legacy_id;

do $issue97_dark_ready_assertions$
declare
  v_fixture record;
begin
  if (select count(*) from pg_temp.tmp_issue97_dark_ready_results)<>2
     or exists(
       select 1 from pg_temp.tmp_issue97_dark_ready_results
       where result->>'status'<>'ready'
          or result->>'publication_mode'<>'private_dark'
          or coalesce((result->>'public_projected')::boolean,true)
     ) then
    raise exception 'Issue #97 Cologie/BAKOS private dark generation did not return ready';
  end if;

  for v_fixture in
    select p.id,p.legacy_id,r.*
    from public.pads p
    join private_verification.brinesearch_google_route_receipts_issue97 r on r.pad_id=p.id
    where p.legacy_id in ('ascent--cologie','ascent--bakos')
  loop
    if v_fixture.status<>'ready' or v_fixture.hold_reason is not null
       or v_fixture.evidence->>'manifest_mode'<>'transition_geometry'
       or v_fixture.evidence->>'publication_mode'<>'private_dark'
       or coalesce((v_fixture.evidence->>'public_projected')::boolean,true)
       or v_fixture.manifest->>'publication_mode'<>'private_dark'
       or coalesce((v_fixture.manifest->>'public_projected')::boolean,true)
       or not coalesce((v_fixture.evidence->>'no_guess')::boolean,false)
       or coalesce(v_fixture.evidence->>'source_dependency_digest','') !~ '^[0-9a-f]{32}$'
       or coalesce(v_fixture.evidence->>'graph_dependency_digest','') !~ '^[0-9a-f]{32}$'
       or coalesce(v_fixture.evidence->>'mapping_dependency_digest','') !~ '^[0-9a-f]{32}$'
       or coalesce(v_fixture.evidence->>'safety_digest','') !~ '^[0-9a-f]{32}$'
       or v_fixture.manifest->>'source_dependency_digest'<>
          v_fixture.evidence->>'source_dependency_digest'
       or v_fixture.manifest->>'graph_dependency_digest'<>
          v_fixture.evidence->>'graph_dependency_digest'
       or v_fixture.manifest->>'mapping_dependency_digest'<>
          v_fixture.evidence->>'mapping_dependency_digest'
       or v_fixture.manifest->>'safety_digest'<>
          v_fixture.evidence->>'safety_digest'
       or not private_verification.brinesearch_issue97_transition_google_dark_current(v_fixture.id)
    then
      raise exception 'Issue #97 % private dark receipt is not exact/current',v_fixture.legacy_id;
    end if;
  end loop;

  if public.brinesearch_issue97_cutover_active()
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>
        (select public_rows from pg_temp.tmp_issue97_dark_global_baseline)
     or exists(
       select 1
       from pg_temp.tmp_issue97_dark_fixture_baseline baseline
       join public.pads p on p.id=baseline.id
       where p.brinesearch_google_route_status_issue97 is distinct from
               baseline.brinesearch_google_route_status_issue97
          or p.brinesearch_google_route_revision_issue97 is distinct from
               baseline.brinesearch_google_route_revision_issue97
          or (select count(*) from public.brinesearch_driver_google_routes_public pub
              where pub.pad_id=p.id)<>baseline.public_rows
     ) then
    raise exception 'Issue #97 private dark generation changed cutover/public projection/pad readiness';
  end if;
end
$issue97_dark_ready_assertions$;

-- The public projection is separately cutover-gated and must not alter the ready
-- private receipt when cutover is off.
create temporary table tmp_issue97_projection_off_result on commit drop as
select private_verification.brinesearch_issue97_refresh_google_route_transition(p.id) as result
from public.pads p where p.legacy_id='ascent--cologie';
select pg_temp.issue97_assert(
  (select result->>'hold_reason'='issue97_cutover_not_active'
     and not coalesce((result->>'public_projected')::boolean,true)
   from pg_temp.tmp_issue97_projection_off_result)
  and (select r.status='ready'
       from private_verification.brinesearch_google_route_receipts_issue97 r
       join public.pads p on p.id=r.pad_id where p.legacy_id='ascent--cologie')
  and (select count(*) from public.brinesearch_driver_google_routes_public)=
      (select public_rows from pg_temp.tmp_issue97_dark_global_baseline),
  'Issue #97 cutover-off public projection did not refuse without weakening private evidence'
);

-- Fully exact private manifests make both late-stage fixtures dark-ready without
-- publication. The route receipt consumes the strict dark-current predicate.
select private_verification.brinesearch_issue97_refresh_route_receipt(r.id)
from public.brinesearch_route_prep r
join public.pads p on p.id=r.pad_id
where p.legacy_id in ('ascent--cologie','ascent--bakos')
  and r.active and r.route_group='primary';
select pg_temp.issue97_assert(
  (select count(*)
   from private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
   join public.pads p on p.id=rr.pad_id
   where p.legacy_id in ('ascent--cologie','ascent--bakos')
     and rr.route_status='route_ready' and rr.stage='ready'
     and coalesce((rr.evidence->>'dark_google_manifest_current')::boolean,false))=2,
  'Issue #97 exact Cologie/BAKOS routes did not reach private dark-ready stage'
);

-- Zero occurrences and non-ready Route Prep states must stay upstream.
select private_verification.brinesearch_issue97_refresh_route_receipt(r.id)
from public.brinesearch_route_prep r
join public.pads p on p.id=r.pad_id
where p.legacy_id in ('ascent--liggett','eog--west','gulfport--gehrig')
  and r.active and r.route_group='primary';
do $issue97_zero_occurrence_stage_assertions$
begin
  if (select count(*)
      from private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
      join public.pads p on p.id=rr.pad_id
      where p.legacy_id in ('ascent--liggett','eog--west','gulfport--gehrig')
        and rr.road_occurrence_count=0
        and rr.route_status='needs_review'
        and rr.stage='identity_reconciliation'
        and 'no_saved_road_occurrences'=any(rr.exception_reasons)
        and not ('google_route_manifest_not_ready'=any(rr.exception_reasons)))<>3 then
    raise exception 'Issue #97 zero-occurrence Route Prep cases fell through to Google stage';
  end if;
  if not exists(
      select 1 from private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
      join public.pads p on p.id=rr.pad_id
      where p.legacy_id='ascent--liggett'
        and 'route_prep_needs_sequence_rebuild'=any(rr.exception_reasons))
     or not exists(
      select 1 from private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
      join public.pads p on p.id=rr.pad_id
      where p.legacy_id='eog--west'
        and 'route_prep_needs_gps_review'=any(rr.exception_reasons))
  then
    raise exception 'Issue #97 Route Prep issue codes were not preserved';
  end if;
end
$issue97_zero_occurrence_stage_assertions$;

-- Stage ladder: held identity -> identity; missing canonical -> canonical;
-- missing exact geometry -> exact_geometry; held dark manifest -> google_manifest.
savepoint issue97_stage_held_identity;
update private_verification.brinesearch_route_occurrence_receipts_issue97 o set
  resolution_status='held',hold_reason='rollback_stage_fixture',resolved_at=null
from public.pads p
where o.pad_id=p.id and p.legacy_id='ascent--cologie' and o.occurrence_index=1;
select private_verification.brinesearch_issue97_refresh_route_receipt(r.id)
from public.brinesearch_route_prep r join public.pads p on p.id=r.pad_id
where p.legacy_id='ascent--cologie' and r.active and r.route_group='primary';
select pg_temp.issue97_assert(
  (select rr.stage='identity_reconciliation'
   from private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
   join public.pads p on p.id=rr.pad_id where p.legacy_id='ascent--cologie'),
  'Issue #97 held occurrence did not remain identity stage'
);
rollback to savepoint issue97_stage_held_identity;
release savepoint issue97_stage_held_identity;

savepoint issue97_stage_canonical;
update private_verification.brinesearch_route_occurrence_receipts_issue97 o set
  canonical_road_id=null,mapping_fingerprint=null
from public.pads p
where o.pad_id=p.id and p.legacy_id='ascent--cologie' and o.occurrence_index=1;
select private_verification.brinesearch_issue97_refresh_route_receipt(r.id)
from public.brinesearch_route_prep r join public.pads p on p.id=r.pad_id
where p.legacy_id='ascent--cologie' and r.active and r.route_group='primary';
select pg_temp.issue97_assert(
  (select rr.stage='canonical_mapping'
   from private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
   join public.pads p on p.id=rr.pad_id where p.legacy_id='ascent--cologie'),
  'Issue #97 resolved identity missing canonical mapping did not stop at canonical stage'
);
rollback to savepoint issue97_stage_canonical;
release savepoint issue97_stage_canonical;

savepoint issue97_stage_geometry;
delete from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
using public.pads p
where g.pad_id=p.id and p.legacy_id='ascent--cologie' and g.occurrence_index=2;
select private_verification.brinesearch_issue97_refresh_route_receipt(r.id)
from public.brinesearch_route_prep r join public.pads p on p.id=r.pad_id
where p.legacy_id='ascent--cologie' and r.active and r.route_group='primary';
select pg_temp.issue97_assert(
  (select rr.stage='exact_geometry'
   from private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
   join public.pads p on p.id=rr.pad_id where p.legacy_id='ascent--cologie'),
  'Issue #97 mapped route missing geometry did not stop at exact-geometry stage'
);
rollback to savepoint issue97_stage_geometry;
release savepoint issue97_stage_geometry;

savepoint issue97_stage_google;
update private_verification.brinesearch_google_route_receipts_issue97 r set
  status='held',hold_reason='rollback_stage_fixture',manifest_digest=null,dependency_digest=null,
  manifest=manifest||pg_catalog.jsonb_build_object('route_ready',false,'status','held')
from public.pads p where r.pad_id=p.id and p.legacy_id='ascent--cologie';
select private_verification.brinesearch_issue97_refresh_route_receipt(r.id)
from public.brinesearch_route_prep r join public.pads p on p.id=r.pad_id
where p.legacy_id='ascent--cologie' and r.active and r.route_group='primary';
select pg_temp.issue97_assert(
  (select rr.stage='google_manifest'
     and 'google_route_manifest_not_ready'=any(rr.exception_reasons)
   from private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
   join public.pads p on p.id=rr.pad_id where p.legacy_id='ascent--cologie'),
  'Issue #97 exact route with held private manifest did not stop at Google stage'
);
rollback to savepoint issue97_stage_google;
release savepoint issue97_stage_google;

-- Exact dependency drift must hold, never guess. Each mutation is rollback-only.
savepoint issue97_stale_graph;
update private_verification.brinesearch_route_transition_receipts_issue97 t set
  graph_digest='00000000000000000000000000000000'
from public.pads p where t.pad_id=p.id and p.legacy_id='ascent--cologie' and t.boundary_index=1;
select pg_temp.issue97_assert(
  (select private_verification.brinesearch_issue97_refresh_google_route_transition_dark(p.id)->>'status'='held'
   from public.pads p where p.legacy_id='ascent--cologie'),
  'Issue #97 stale graph dependency did not hold dark manifest'
);
rollback to savepoint issue97_stale_graph;
release savepoint issue97_stale_graph;

savepoint issue97_stale_source;
update private_verification.brinesearch_route_occurrence_receipts_issue97 o set
  source_digest='00000000000000000000000000000000'
from public.pads p where o.pad_id=p.id and p.legacy_id='ascent--cologie' and o.occurrence_index=1;
select pg_temp.issue97_assert(
  (select private_verification.brinesearch_issue97_refresh_google_route_transition_dark(p.id)->>'status'='held'
   from public.pads p where p.legacy_id='ascent--cologie'),
  'Issue #97 stale source dependency did not hold dark manifest'
);
rollback to savepoint issue97_stale_source;
release savepoint issue97_stale_source;

savepoint issue97_stale_mapping;
update private_verification.brinesearch_route_occurrence_receipts_issue97 o set
  mapping_fingerprint='00000000000000000000000000000000'
from public.pads p where o.pad_id=p.id and p.legacy_id='ascent--cologie' and o.occurrence_index=1;
select pg_temp.issue97_assert(
  (select private_verification.brinesearch_issue97_refresh_google_route_transition_dark(p.id)->>'status'='held'
   from public.pads p where p.legacy_id='ascent--cologie'),
  'Issue #97 stale mapping dependency did not hold dark manifest'
);
rollback to savepoint issue97_stale_mapping;
release savepoint issue97_stale_mapping;

savepoint issue97_stale_geometry;
update private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g set
  road_geometry_digest='00000000000000000000000000000000'
from public.pads p where g.pad_id=p.id and p.legacy_id='ascent--cologie' and g.occurrence_index=2;
select pg_temp.issue97_assert(
  (select private_verification.brinesearch_issue97_refresh_google_route_transition_dark(p.id)->>'status'='held'
   from public.pads p where p.legacy_id='ascent--cologie'),
  'Issue #97 stale geometry dependency did not hold dark manifest'
);
rollback to savepoint issue97_stale_geometry;
release savepoint issue97_stale_geometry;

-- Missing and multiple active-primary route preps are explicit private holds.
select pg_temp.issue97_assert(
  (select private_verification.brinesearch_issue97_refresh_google_route_transition_dark(p.id)->>'hold_reason'=
      'active_primary_route_prep_missing'
   from public.pads p
   where not coalesce(p.list_only,false)
     and not exists(select 1 from public.brinesearch_route_prep r
       where r.pad_id=p.id and r.active and r.route_group='primary')
   order by p.id limit 1),
  'Issue #97 missing active primary route did not hold'
);

savepoint issue97_multiple_primary;
with fixture as (
  select alternate.id
  from public.brinesearch_route_prep primary_route
  join public.brinesearch_route_prep alternate
    on alternate.pad_id=primary_route.pad_id and alternate.active
   and alternate.route_group='alternate'
  where primary_route.active and primary_route.route_group='primary'
  order by primary_route.pad_id,alternate.id limit 1
)
update public.brinesearch_route_prep r set route_group='primary',variant_index=99
from fixture where r.id=fixture.id;
select pg_temp.issue97_assert(
  (select private_verification.brinesearch_issue97_refresh_google_route_transition_dark(p.id)->>'hold_reason'=
      'multiple_active_primary_route_preps'
   from public.pads p
   where (select count(*) from public.brinesearch_route_prep r
          where r.pad_id=p.id and r.active and r.route_group='primary')>1
   order by p.id limit 1),
  'Issue #97 multiple active primary routes did not hold'
);
rollback to savepoint issue97_multiple_primary;
release savepoint issue97_multiple_primary;

-- Exercise the real cutover-on public projection branch under one nested
-- rollback boundary. The uncommitted release-state update is invisible to
-- every other PostgreSQL session under MVCC, and the enclosing transaction
-- still ends with the single terminal outer ROLLBACK below.
create temporary table tmp_issue97_cologie_private_projection_baseline on commit drop as
select p.id as pad_id,r.route_revision,r.manifest_digest,r.dependency_digest,r.manifest
from public.pads p
join private_verification.brinesearch_google_route_receipts_issue97 r on r.pad_id=p.id
where p.legacy_id='ascent--cologie';

savepoint issue97_projection_cutover_on;
update public.brinesearch_issue97_release_state set
  cutover_at=pg_catalog.clock_timestamp(),
  review_details=coalesce(review_details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
    'rollback_only_issue97_test','dark-google-cutover-on-projection'
  ),
  updated_at=pg_catalog.clock_timestamp()
where singleton;
select pg_temp.issue97_assert(
  public.brinesearch_issue97_cutover_active(),
  'Issue #97 rollback fixture did not enable transaction-local cutover'
);

create temporary table tmp_issue97_projection_insert_result on commit drop as
select private_verification.brinesearch_issue97_refresh_google_route_transition(p.id) as result
from public.pads p where p.legacy_id='ascent--cologie';
select pg_temp.issue97_assert(
  (select result->>'status'='ready'
          and coalesce((result->>'public_projected')::boolean,false)
   from pg_temp.tmp_issue97_projection_insert_result)
  and (
    select pub.route_revision=receipt.route_revision
      and pub.source_revision=route.updated_at
      and pub.manifest=receipt.manifest
      and pub.manifest->>'manifest_digest'=receipt.manifest_digest
      and pub.manifest->>'dependency_digest'=receipt.dependency_digest
      and pad.brinesearch_google_route_status_issue97='ready'
      and pad.brinesearch_google_route_revision_issue97=receipt.route_revision
    from public.pads pad
    join private_verification.brinesearch_google_route_receipts_issue97 receipt
      on receipt.pad_id=pad.id
    join public.brinesearch_driver_google_routes_public pub on pub.pad_id=pad.id
    join public.brinesearch_route_prep route
      on route.id=(receipt.manifest->>'route_prep_id')::uuid
    where pad.legacy_id='ascent--cologie'
  )
  and (select count(*) from public.brinesearch_driver_google_routes_public)=
      (select public_rows+1 from pg_temp.tmp_issue97_dark_global_baseline)
  and (
    select private_verification.brinesearch_issue97_transition_google_current(p.id)
       and public.brinesearch_issue97_google_route_current(p.id)
    from public.pads p where p.legacy_id='ascent--cologie'
  ),
  'Issue #97 cutover-on Cologie insert did not copy the exact private manifest/currentness'
);

-- Prove ON CONFLICT update replaces a stale public projection exactly, without
-- duplication or a type/meaning change to source_revision (route updated_at).
update public.brinesearch_driver_google_routes_public pub set
  route_revision=0,
  source_revision='2000-01-01 00:00:00+00'::timestamptz,
  manifest=pg_catalog.jsonb_set(
    pub.manifest||pg_catalog.jsonb_build_object('stale_rollback_fixture',true),
    '{route_revision}',pg_catalog.to_jsonb(0::bigint),true
  )
from public.pads p where pub.pad_id=p.id and p.legacy_id='ascent--cologie';
create temporary table tmp_issue97_projection_update_result on commit drop as
select private_verification.brinesearch_issue97_refresh_google_route_transition(p.id) as result
from public.pads p where p.legacy_id='ascent--cologie';
select pg_temp.issue97_assert(
  (select result->>'status'='ready'
          and coalesce((result->>'public_projected')::boolean,false)
   from pg_temp.tmp_issue97_projection_update_result)
  and (
    select count(*)=1
      and min(pub.route_revision)=min(receipt.route_revision)
      and min(pub.source_revision)=min(route.updated_at)
      and pg_catalog.bool_and(pub.manifest=receipt.manifest)
    from public.pads pad
    join private_verification.brinesearch_google_route_receipts_issue97 receipt
      on receipt.pad_id=pad.id
    join public.brinesearch_driver_google_routes_public pub on pub.pad_id=pad.id
    join public.brinesearch_route_prep route
      on route.id=(receipt.manifest->>'route_prep_id')::uuid
    where pad.legacy_id='ascent--cologie'
  )
  and (
    select private_verification.brinesearch_issue97_transition_google_current(p.id)
    from public.pads p where p.legacy_id='ascent--cologie'
  ),
  'Issue #97 public projection update did not replace the stale row exactly once'
);

-- Every critical public-currentness dependency is independently negative.
savepoint issue97_public_current_private_manifest_digest;
update private_verification.brinesearch_google_route_receipts_issue97 receipt set
  manifest_digest='00000000000000000000000000000000'
from public.pads p where receipt.pad_id=p.id and p.legacy_id='ascent--cologie';
select pg_temp.issue97_assert(
  (select not private_verification.brinesearch_issue97_transition_google_current(p.id)
   from public.pads p where p.legacy_id='ascent--cologie'),
  'Issue #97 public currentness accepted a changed private manifest digest'
);
rollback to savepoint issue97_public_current_private_manifest_digest;
release savepoint issue97_public_current_private_manifest_digest;

savepoint issue97_public_current_dependency_digest;
update private_verification.brinesearch_google_route_receipts_issue97 receipt set
  dependency_digest='00000000000000000000000000000000'
from public.pads p where receipt.pad_id=p.id and p.legacy_id='ascent--cologie';
select pg_temp.issue97_assert(
  (select not private_verification.brinesearch_issue97_transition_google_current(p.id)
   from public.pads p where p.legacy_id='ascent--cologie'),
  'Issue #97 public currentness accepted a changed dependency digest'
);
rollback to savepoint issue97_public_current_dependency_digest;
release savepoint issue97_public_current_dependency_digest;

savepoint issue97_public_current_route_revision;
update public.brinesearch_driver_google_routes_public pub set
  route_revision=route_revision+1,
  manifest=pg_catalog.jsonb_set(
    pub.manifest,'{route_revision}',pg_catalog.to_jsonb(pub.route_revision+1),true
  )
from public.pads p where pub.pad_id=p.id and p.legacy_id='ascent--cologie';
select pg_temp.issue97_assert(
  (select not private_verification.brinesearch_issue97_transition_google_current(p.id)
   from public.pads p where p.legacy_id='ascent--cologie'),
  'Issue #97 public currentness accepted a changed public route revision'
);
rollback to savepoint issue97_public_current_route_revision;
release savepoint issue97_public_current_route_revision;

savepoint issue97_public_current_manifest;
update public.brinesearch_driver_google_routes_public pub set
  manifest=manifest||pg_catalog.jsonb_build_object('rollback_tamper',true)
from public.pads p where pub.pad_id=p.id and p.legacy_id='ascent--cologie';
select pg_temp.issue97_assert(
  (select not private_verification.brinesearch_issue97_transition_google_current(p.id)
   from public.pads p where p.legacy_id='ascent--cologie'),
  'Issue #97 public currentness accepted a changed public manifest'
);
rollback to savepoint issue97_public_current_manifest;
release savepoint issue97_public_current_manifest;

savepoint issue97_public_current_private_dependency;
update private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence set
  source_digest='00000000000000000000000000000000'
from public.pads p
where occurrence.pad_id=p.id and p.legacy_id='ascent--cologie'
  and occurrence.occurrence_index=1;
select pg_temp.issue97_assert(
  (select not private_verification.brinesearch_issue97_transition_google_current(p.id)
   from public.pads p where p.legacy_id='ascent--cologie'),
  'Issue #97 public currentness accepted a stale private dependency'
);
rollback to savepoint issue97_public_current_private_dependency;
release savepoint issue97_public_current_private_dependency;

-- Once a public row exists, stale private evidence deletes/holds the public
-- projection and never constructs a fallback route.
savepoint issue97_projection_stale_private;
update private_verification.brinesearch_google_route_receipts_issue97 receipt set
  status='held',hold_reason='rollback_stale_private_fixture',
  manifest_digest=null,dependency_digest=null,
  manifest=manifest||pg_catalog.jsonb_build_object('status','held','route_ready',false)
from public.pads p where receipt.pad_id=p.id and p.legacy_id='ascent--cologie';
create temporary table tmp_issue97_projection_stale_result on commit drop as
select private_verification.brinesearch_issue97_refresh_google_route_transition(p.id) as result
from public.pads p where p.legacy_id='ascent--cologie';
select pg_temp.issue97_assert(
  (select result->>'status'='held'
          and not coalesce((result->>'public_projected')::boolean,true)
          and result->>'hold_reason' is not null
   from pg_temp.tmp_issue97_projection_stale_result)
  and not exists(
    select 1 from public.brinesearch_driver_google_routes_public pub
    join public.pads p on p.id=pub.pad_id where p.legacy_id='ascent--cologie'
  )
  and (select p.brinesearch_google_route_status_issue97='held'
       from public.pads p where p.legacy_id='ascent--cologie'),
  'Issue #97 stale private evidence did not remove/hold public projection'
);
rollback to savepoint issue97_projection_stale_private;
release savepoint issue97_projection_stale_private;

-- A bad route reference is a per-pad hold, never a STRICT exception that can
-- abort the multi-pad projection batch. Each case restores the exact private
-- receipt and proves normal projection still succeeds afterward.
create or replace function pg_temp.issue97_assert_projection_route_hold(
  p_case text,p_route_prep_id uuid
)
returns void language plpgsql set search_path='' as $$
declare
  v_baseline record;
  v_base_manifest jsonb;
  v_manifest jsonb;
  v_digest text;
  v_result jsonb;
begin
  select * into strict v_baseline
  from pg_temp.tmp_issue97_cologie_private_projection_baseline;
  v_base_manifest:=(v_baseline.manifest-'manifest_digest')||
    pg_catalog.jsonb_build_object('route_prep_id',p_route_prep_id);
  v_digest:=pg_catalog.md5(v_base_manifest::text);
  v_manifest:=v_base_manifest||pg_catalog.jsonb_build_object('manifest_digest',v_digest);
  update private_verification.brinesearch_google_route_receipts_issue97 set
    manifest=v_manifest,manifest_digest=v_digest
  where pad_id=v_baseline.pad_id;
  v_result:=private_verification.brinesearch_issue97_refresh_google_route_transition(
    v_baseline.pad_id
  );
  if v_result->>'status'<>'held'
     or v_result->>'hold_reason'<>'private_dark_google_manifest_route_not_current'
     or coalesce((v_result->>'public_projected')::boolean,true)
     or exists(select 1 from public.brinesearch_driver_google_routes_public
               where pad_id=v_baseline.pad_id) then
    raise exception 'Issue #97 projection route case % did not fail closed: %',p_case,v_result;
  end if;
  update private_verification.brinesearch_google_route_receipts_issue97 set
    manifest=v_baseline.manifest,manifest_digest=v_baseline.manifest_digest
  where pad_id=v_baseline.pad_id;
  v_result:=private_verification.brinesearch_issue97_refresh_google_route_transition(
    v_baseline.pad_id
  );
  if v_result->>'status'<>'ready'
     or not coalesce((v_result->>'public_projected')::boolean,false)
     or not private_verification.brinesearch_issue97_transition_google_current(
       v_baseline.pad_id
     ) then
    raise exception 'Issue #97 projection route case % did not restore exact projection: %',
      p_case,v_result;
  end if;
end
$$;
select pg_temp.issue97_assert(
  not exists(select 1 from public.brinesearch_route_prep
             where id='00000000-0000-0000-0000-000000000097'::uuid),
  'Issue #97 fixed missing-route fixture unexpectedly exists'
);
select pg_temp.issue97_assert_projection_route_hold(
  'missing','00000000-0000-0000-0000-000000000097'::uuid
);
select pg_temp.issue97_assert_projection_route_hold(
  'inactive',(select id from public.brinesearch_route_prep where not active order by id limit 1)
);
select pg_temp.issue97_assert_projection_route_hold(
  'wrong_pad',(
    select route.id from public.brinesearch_route_prep route
    join public.pads pad on pad.id=route.pad_id
    where pad.legacy_id='ascent--bakos' and route.active and route.route_group='primary'
    order by route.id limit 1
  )
);
select pg_temp.issue97_assert_projection_route_hold(
  'non_primary',(
    select id from public.brinesearch_route_prep
    where active and route_group<>'primary' order by id limit 1
  )
);

select 'CUTOVER_ON_COLOGIE_PROJECTION' as fixture,
  p.legacy_id,receipt.route_revision,pub.source_revision,
  receipt.manifest_digest,receipt.dependency_digest,
  private_verification.brinesearch_issue97_transition_google_current(p.id) as public_current,
  public.brinesearch_issue97_google_route_current(p.id) as public_wrapper_current
from public.pads p
join private_verification.brinesearch_google_route_receipts_issue97 receipt on receipt.pad_id=p.id
join public.brinesearch_driver_google_routes_public pub on pub.pad_id=p.id
where p.legacy_id='ascent--cologie';

rollback to savepoint issue97_projection_cutover_on;
release savepoint issue97_projection_cutover_on;
select pg_temp.issue97_assert(
  not public.brinesearch_issue97_cutover_active()
  and (select count(*) from public.brinesearch_driver_google_routes_public)=
      (select public_rows from pg_temp.tmp_issue97_dark_global_baseline)
  and (
    select receipt.manifest=baseline.manifest
       and receipt.manifest_digest=baseline.manifest_digest
       and receipt.dependency_digest=baseline.dependency_digest
    from pg_temp.tmp_issue97_cologie_private_projection_baseline baseline
    join private_verification.brinesearch_google_route_receipts_issue97 receipt
      on receipt.pad_id=baseline.pad_id
  ),
  'Issue #97 synthetic cutover-on projection did not roll back to dark baseline'
);

-- WALKING TALL and all no-guess constraints stay untouched by the semantic fix.
select private_verification.brinesearch_issue97_refresh_route_receipt(r.id)
from public.brinesearch_route_prep r join public.pads p on p.id=r.pad_id
where p.legacy_id='eqt--walking-tall' and r.active and r.route_group='primary';
select pg_temp.issue97_assert(
  (select rr.stage='exact_geometry'
   from private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
   join public.pads p on p.id=rr.pad_id where p.legacy_id='eqt--walking-tall'),
  'Issue #97 WALKING TALL must remain at exact geometry'
);
select pg_temp.issue97_assert(
  (select count(*) from private_verification.brinesearch_route_occurrence_receipts_issue97
    where resolution_method in ('name_only','fuzzy_name','nearest_road','route_number_only'))=0
  and (select count(*) from private_verification.brinesearch_route_transition_receipts_issue97
    where resolution_method in ('name_only','fuzzy_name','nearest_road','closest_anchor','route_number_only'))=0
  and (select count(*) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97
    where geometry_method in ('name_only','fuzzy_name','nearest_road','nearest_point','route_number_only'))=0,
  'Issue #97 rollback regression observed a forbidden no-guess method'
);

select 'COLOGIE' as fixture,p.legacy_id,r.status,r.hold_reason,r.manifest_digest,
  r.dependency_digest,r.evidence
from public.pads p
join private_verification.brinesearch_google_route_receipts_issue97 r on r.pad_id=p.id
where p.legacy_id='ascent--cologie';
select 'BAKOS' as fixture,p.legacy_id,r.status,r.hold_reason,r.manifest_digest,
  r.dependency_digest,r.evidence
from public.pads p
join private_verification.brinesearch_google_route_receipts_issue97 r on r.pad_id=p.id
where p.legacy_id='ascent--bakos';

select pg_temp.issue97_assert(
  not public.brinesearch_issue97_cutover_active()
  and (select count(*) from public.brinesearch_driver_google_routes_public)=
      (select public_rows from pg_temp.tmp_issue97_dark_global_baseline),
  'Issue #97 regression changed cutover or public Google routes before rollback'
);

rollback;
