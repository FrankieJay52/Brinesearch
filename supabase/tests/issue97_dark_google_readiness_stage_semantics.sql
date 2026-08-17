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
