\set ON_ERROR_STOP on
\pset pager off
\timing on

begin;
set local statement_timeout='15min';
set local lock_timeout='2min';

do $issue97_terminal_test_locks$
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
end
$issue97_terminal_test_locks$;

create temporary table tmp_issue97_terminal_global_baseline on commit drop as
select
  (select count(*) from public.brinesearch_driver_google_routes_public) as public_rows,
  public.brinesearch_issue97_cutover_active() as cutover_active,
  (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs) as reconciliation_runs,
  (select count(*) from public.brinesearch_road_graph_builds where status='staging') as staging,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||build.status||':'||coalesce(build.graph_digest,'')||':'||
      coalesce(build.activated_at::text,''),'|' order by build.id
  ),'')) from public.brinesearch_road_graph_builds build) as graph_digest;

\ir ../migrations/20260817020000_issue97_terminal_private_access_path_isolation.sql

select pg_catalog.set_config(
  'brinesearch.issue97_expected_state_manifest_id',
  'c41f5320-1273-470c-a316-28b42211d697',true
);
select pg_catalog.set_config(
  'brinesearch.issue97_expected_state_manifest_digest',
  '9763dc5bb626da71881b7381ed28a436',true
);
select pg_catalog.set_config(
  'brinesearch.issue97_expected_state_code','OH',true
);
select pg_catalog.set_config(
  'brinesearch.issue97_expected_generation_key',
  'issue97-release-20260815-r2',true
);
select pg_catalog.set_config(
  'brinesearch.issue97_expected_member_count','19',true
);

create temporary table tmp_issue97_terminal_cache on commit drop as
select private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(
  'c41f5320-1273-470c-a316-28b42211d697'::uuid,
  '9763dc5bb626da71881b7381ed28a436','OH',
  'issue97-release-20260815-r2',19
) as receipt;

create or replace function pg_temp.issue97_assert(p_condition boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception '%',p_message;
  end if;
end
$$;

select pg_temp.issue97_assert(
  (select receipt->>'release_current_count'='19'
      and receipt->>'source_scope_count'='38'
      and receipt->>'cache_scope'='exact_state_manifest'
      and receipt->>'cache_miss_policy'='fail_closed'
    from pg_temp.tmp_issue97_terminal_cache),
  'Issue #97 terminal-access regression did not prepare the exact Ohio manifest cache'
);

create temporary table tmp_issue97_terminal_fixtures on commit drop as
select pad.legacy_id,pad.id as pad_id,route.id as route_prep_id,
  terminal.id as terminal_step_id
from public.pads pad
join public.brinesearch_route_prep route
  on route.pad_id=pad.id and route.active and route.route_group='primary'
left join lateral (
  select step.id
  from public.brinesearch_route_prep_steps step
  where step.route_prep_id=route.id and step.active
    and step.step_kind='private_segment'
  order by step.step_order desc,step.id desc
  limit 1
) terminal on true
where pad.legacy_id in (
  'ascent--sadler','swn--holliday-unit','ascent--coleman','eog--woodland'
);

select pg_temp.issue97_assert(
  (select count(*) from pg_temp.tmp_issue97_terminal_fixtures)=4
  and (select count(*) from pg_temp.tmp_issue97_terminal_fixtures
       where legacy_id in ('ascent--sadler','swn--holliday-unit')
         and private_verification.brinesearch_issue97_terminal_private_access_destination(
           terminal_step_id
         ))=2
  and (select not private_verification.brinesearch_issue97_terminal_private_access_destination(
       terminal_step_id)
       from pg_temp.tmp_issue97_terminal_fixtures where legacy_id='eog--woodland'),
  'Issue #97 exact Pad/Lease classifiers or Access Road negative fixture drifted'
);

-- A named private road is not the generic terminal placeholder. It remains a
-- normal authoritative private/access identity problem and blocks path search.
savepoint issue97_named_private_negative;
update public.brinesearch_route_prep_steps step set
  raw_text='Smith Lease Road',normalized_text='Smith Lease Road'
from pg_temp.tmp_issue97_terminal_fixtures fixture
where fixture.legacy_id='ascent--sadler' and step.id=fixture.terminal_step_id;
select pg_temp.issue97_assert(
  (select not private_verification.brinesearch_issue97_terminal_private_access_destination(
     terminal_step_id)
   from pg_temp.tmp_issue97_terminal_fixtures where legacy_id='ascent--sadler'),
  'Issue #97 named private road was misclassified as a generic terminal destination'
);
select public.brinesearch_issue97_reconcile_route_corpus(fixture.pad_id)
from pg_temp.tmp_issue97_terminal_fixtures fixture
where fixture.legacy_id='ascent--sadler';
select pg_temp.issue97_assert(
  (select receipt.hold_reason='no_authoritative_private_or_access_identity_candidate'
   from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
   join pg_temp.tmp_issue97_terminal_fixtures fixture
     on fixture.terminal_step_id=receipt.route_prep_step_id
   where fixture.legacy_id='ascent--sadler')
  and not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    join pg_temp.tmp_issue97_terminal_fixtures fixture
      on fixture.route_prep_id=receipt.route_prep_id
    where fixture.legacy_id='ascent--sadler'
      and receipt.route_prep_step_id<>fixture.terminal_step_id
      and receipt.resolution_status='resolved'
  ),
  'Issue #97 named private road negative did not fail closed before public path resolution'
);
rollback to savepoint issue97_named_private_negative;
release savepoint issue97_named_private_negative;

-- An explicit saved road/source binding must also keep a generic-looking label
-- out of the terminal-placeholder lane.
savepoint issue97_bound_private_negative;
update public.brinesearch_route_prep_steps step set road_id=(
  select prior.road_id
  from public.brinesearch_route_prep_steps prior
  where prior.route_prep_id=step.route_prep_id and prior.active
    and prior.road_id is not null
  order by prior.step_order desc limit 1
)
from pg_temp.tmp_issue97_terminal_fixtures fixture
where fixture.legacy_id='ascent--sadler' and step.id=fixture.terminal_step_id;
select pg_temp.issue97_assert(
  (select not private_verification.brinesearch_issue97_terminal_private_access_destination(
     terminal_step_id)
   from pg_temp.tmp_issue97_terminal_fixtures where legacy_id='ascent--sadler'),
  'Issue #97 explicitly bound private step was misclassified as a generic terminal destination'
);
rollback to savepoint issue97_bound_private_negative;
release savepoint issue97_bound_private_negative;

-- GPS is not part of terminal classification and cannot select a road identity.
savepoint issue97_terminal_gps_negative;
update public.pads pad set latitude=pad.latitude+0.0001
from pg_temp.tmp_issue97_terminal_fixtures fixture
where fixture.legacy_id='ascent--sadler' and pad.id=fixture.pad_id;
select private_verification.brinesearch_issue97_refresh_occurrence_candidate(
  fixture.terminal_step_id
)
from pg_temp.tmp_issue97_terminal_fixtures fixture
where fixture.legacy_id='ascent--sadler';
select pg_temp.issue97_assert(
  (select receipt.hold_reason='terminal_private_access_destination_requires_authoritative_geometry'
      and receipt.identity_id is null and receipt.candidate_count=0
      and receipt.evidence->>'pad_gps_selects_road_identity'='false'
   from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
   join pg_temp.tmp_issue97_terminal_fixtures fixture
     on fixture.terminal_step_id=receipt.route_prep_step_id
   where fixture.legacy_id='ascent--sadler'),
  'Issue #97 changed pad GPS influenced terminal road-identity disposition'
);
rollback to savepoint issue97_terminal_gps_negative;
release savepoint issue97_terminal_gps_negative;

-- Real current Pad and Lease Road fixtures: the exact public prefix must resolve
-- only through the unique authoritative graph path. The terminal evidence stays
-- explicit and held pending source-backed access geometry.
create temporary table tmp_issue97_terminal_positive_results on commit drop as
select fixture.legacy_id,
  public.brinesearch_issue97_reconcile_route_corpus(fixture.pad_id) as result
from pg_temp.tmp_issue97_terminal_fixtures fixture
where fixture.legacy_id in ('ascent--sadler','swn--holliday-unit')
order by fixture.legacy_id;

select fixture.legacy_id,receipt.occurrence_index,receipt.raw_text,
  receipt.resolution_status,receipt.resolution_method,receipt.hold_reason,
  receipt.candidate_count,receipt.identity_id,
  receipt.evidence->>'solver' as solver,
  receipt.evidence->>'disposition' as disposition,
  receipt.evidence->>'terminal_private_access_destinations_excluded' as terminal_excluded
from pg_temp.tmp_issue97_terminal_fixtures fixture
join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
  on receipt.route_prep_id=fixture.route_prep_id
where fixture.legacy_id in ('ascent--sadler','swn--holliday-unit')
order by fixture.legacy_id,receipt.occurrence_index;

select fixture.legacy_id,receipt.route_status,receipt.stage,
  receipt.held_occurrence_count,receipt.exception_reasons,receipt.evidence
from pg_temp.tmp_issue97_terminal_fixtures fixture
join private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
  on receipt.route_prep_id=fixture.route_prep_id
where fixture.legacy_id in ('ascent--sadler','swn--holliday-unit')
order by fixture.legacy_id;

do $issue97_terminal_positive_assertions$
declare
  v_fixture record;
begin
  for v_fixture in
    select * from pg_temp.tmp_issue97_terminal_fixtures
    where legacy_id in ('ascent--sadler','swn--holliday-unit')
  loop
    if not private_verification.brinesearch_issue97_terminal_private_access_destination(
         v_fixture.terminal_step_id
       )
       or (select count(*)
           from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
           where receipt.route_prep_id=v_fixture.route_prep_id
             and receipt.route_prep_step_id<>v_fixture.terminal_step_id
             and receipt.resolution_status='resolved'
             and receipt.resolution_method in (
               'route_graph_unique_identity_path','explicit_authoritative_source_receipt'
             )
             and receipt.identity_id is not null)<>
          (select count(*)
           from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
           where receipt.route_prep_id=v_fixture.route_prep_id
             and receipt.route_prep_step_id<>v_fixture.terminal_step_id)
       or not exists(
         select 1
         from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
         where receipt.route_prep_step_id=v_fixture.terminal_step_id
           and receipt.resolution_status='held'
           and receipt.hold_reason=
             'terminal_private_access_destination_requires_authoritative_geometry'
           and receipt.identity_id is null and receipt.canonical_road_id is null
           and receipt.candidate_count=0
           and receipt.evidence->>'disposition'='terminal_private_access_destination'
           and receipt.evidence->>'participates_in_authoritative_road_path'='false'
           and receipt.evidence->>'retained_route_evidence'='true'
       )
       or not exists(
         select 1
         from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
         where receipt.route_prep_id=v_fixture.route_prep_id
           and receipt.route_status='needs_review'
           and receipt.stage='identity_reconciliation'
           and receipt.held_occurrence_count=1
       )
    then
      raise exception 'Issue #97 % terminal-access/public-prefix assertion failed',
        v_fixture.legacy_id;
    end if;
  end loop;
end
$issue97_terminal_positive_assertions$;

-- An existing genuinely ambiguous public route has no generic terminal and
-- must remain ambiguous; this change cannot turn ambiguity into a guess.
select public.brinesearch_issue97_reconcile_route_corpus(fixture.pad_id)
from pg_temp.tmp_issue97_terminal_fixtures fixture
where fixture.legacy_id='ascent--coleman';
select pg_temp.issue97_assert(
  (select count(*)
   from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
   join pg_temp.tmp_issue97_terminal_fixtures fixture
     on fixture.route_prep_id=receipt.route_prep_id
   where fixture.legacy_id='ascent--coleman'
     and receipt.hold_reason='authoritative_route_identity_path_ambiguous')=3
  and (select count(*)
       from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
       join pg_temp.tmp_issue97_terminal_fixtures fixture
         on fixture.route_prep_id=receipt.route_prep_id
       where fixture.legacy_id='ascent--coleman'
         and private_verification.brinesearch_issue97_terminal_private_access_destination(
           receipt.route_prep_step_id
         ))=0,
  'Issue #97 genuine authoritative public-path ambiguity was weakened'
);

select pg_temp.issue97_assert(
  not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    join public.pads pad on pad.id=receipt.pad_id
    where pad.state='Ohio' and receipt.resolution_method in
      ('name_only','fuzzy_name','nearest_road','route_number_only')
  )
  and not exists(
    select 1
    from private_verification.brinesearch_route_transition_receipts_issue97 receipt
    join public.pads pad on pad.id=receipt.pad_id
    where pad.state='Ohio' and receipt.resolution_method in
      ('name_only','fuzzy_name','nearest_road','route_number_only','closest_anchor')
  )
  and not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
    join public.pads pad on pad.id=receipt.pad_id
    where pad.state='Ohio' and receipt.geometry_method in
      ('name_only','fuzzy_name','nearest_road','nearest_point','route_number_only')
  ),
  'Issue #97 terminal-access regression introduced a forbidden resolution method'
);

select pg_temp.issue97_assert(
  (select count(*) from public.brinesearch_driver_google_routes_public)=
    (select public_rows from pg_temp.tmp_issue97_terminal_global_baseline)
  and public.brinesearch_issue97_cutover_active()=
    (select cutover_active from pg_temp.tmp_issue97_terminal_global_baseline)
  and (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)=
    (select reconciliation_runs from pg_temp.tmp_issue97_terminal_global_baseline)
  and (select count(*) from public.brinesearch_road_graph_builds where status='staging')=
    (select staging from pg_temp.tmp_issue97_terminal_global_baseline)
  and (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||build.status||':'||coalesce(build.graph_digest,'')||':'||
      coalesce(build.activated_at::text,''),'|' order by build.id
  ),'')) from public.brinesearch_road_graph_builds build)=
    (select graph_digest from pg_temp.tmp_issue97_terminal_global_baseline),
  'Issue #97 terminal-access regression changed protected graph/public/release state'
);

select pg_catalog.jsonb_pretty(pg_catalog.jsonb_build_object(
  'result','PASS',
  'positive_fixtures',(select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(result)
    order by legacy_id) from pg_temp.tmp_issue97_terminal_positive_results result),
  'generic_terminal_disposition',
    'terminal_private_access_destination_requires_authoritative_geometry',
  'named_private_negative',true,
  'bound_private_negative',true,
  'gps_identity_selection',false,
  'genuine_public_ambiguity_preserved',true,
  'public_google_rows',(select count(*) from public.brinesearch_driver_google_routes_public),
  'cutover_active',public.brinesearch_issue97_cutover_active()
));

rollback;
