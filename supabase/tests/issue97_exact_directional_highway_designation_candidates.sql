\set ON_ERROR_STOP on
\pset pager off
\timing on

begin;
set local statement_timeout='15min';
set local lock_timeout='2min';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:ohio-state-release'));
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97));
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:route-corpus',97));
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation'));
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh'));

create temporary table tmp_issue97_directional_baseline on commit drop as
select
  (select count(*) from public.brinesearch_driver_google_routes_public) as public_rows,
  public.brinesearch_issue97_cutover_active() as cutover_active,
  (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs) as reconciliation_runs,
  (select count(*) from public.brinesearch_road_graph_builds where status='staging') as staging,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(build)::text,'|' order by build.id
  ),'')) from public.brinesearch_road_graph_builds build) as graph_digest;

\ir ../migrations/20260817030000_issue97_exact_directional_highway_designation_candidates.sql

select pg_catalog.set_config(
  'brinesearch.issue97_expected_state_manifest_id',
  'c41f5320-1273-470c-a316-28b42211d697',true);
select pg_catalog.set_config(
  'brinesearch.issue97_expected_state_manifest_digest',
  '9763dc5bb626da71881b7381ed28a436',true);
select pg_catalog.set_config('brinesearch.issue97_expected_state_code','OH',true);
select pg_catalog.set_config(
  'brinesearch.issue97_expected_generation_key','issue97-release-20260815-r2',true);
select pg_catalog.set_config('brinesearch.issue97_expected_member_count','19',true);

create temporary table tmp_issue97_directional_cache on commit drop as
select private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(
  'c41f5320-1273-470c-a316-28b42211d697'::uuid,
  '9763dc5bb626da71881b7381ed28a436','OH','issue97-release-20260815-r2',19
) as receipt;

create or replace function pg_temp.issue97_assert(p_condition boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then raise exception '%',p_message; end if;
end
$$;

select pg_temp.issue97_assert(
  (select receipt->>'release_current_count'='19'
      and receipt->>'source_scope_count'='38'
      and receipt->>'cache_scope'='exact_state_manifest'
      and receipt->>'cache_miss_policy'='fail_closed'
   from pg_temp.tmp_issue97_directional_cache),
  'Issue #97 directional-designation test did not prepare the exact Ohio cache');

create temporary table tmp_issue97_directional_targets on commit drop as
with zeroes as (
  select receipt.route_prep_step_id,receipt.route_prep_id,pad.legacy_id,
    step.normalized_text,
    private_verification.brinesearch_issue97_normalize_route_token(step.normalized_text) token,
    step.step_kind
  from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
  join public.brinesearch_route_prep_steps step on step.id=receipt.route_prep_step_id
  join public.brinesearch_route_prep route
    on route.id=receipt.route_prep_id and route.active and route.route_group='primary'
  join public.pads pad on pad.id=route.pad_id
  where pad.state='Ohio' and receipt.hold_reason='no_authoritative_identity_candidate'
), parsed as (
  select zeroes.*,parts[1] prefix,nullif(pg_catalog.ltrim(parts[2],'0'),'') route_number
  from zeroes
  cross join lateral pg_catalog.regexp_match(
    zeroes.token,'^(i|ir|us|oh|sr)[[:space:]]+0*([0-9]+)([nsew])$'
  ) parts
  where zeroes.step_kind in ('interstate','us_route','state_route')
)
select parsed.*
from parsed
where exists(
  select 1
  from public.brinesearch_authoritative_road_identities identity
  where identity.active and identity.state_code='OH'
    and private_verification.brinesearch_issue97_dataset_scope_current(
      identity.dataset_id,identity.state_code,identity.county_code)
    and identity.drivable_status='drivable'
    and identity.public_access_status in ('public','access')
    and identity.road_class=parsed.step_kind
    and identity.route_system=case
      when parsed.prefix in ('i','ir') then 'IR'
      when parsed.prefix='us' then 'US' else 'SR' end
    and nullif(pg_catalog.ltrim(identity.route_number,'0'),'')=parsed.route_number
);

select pg_temp.issue97_assert(
  (select count(*) from pg_temp.tmp_issue97_directional_targets)=12
  and (select count(distinct route_prep_id) from pg_temp.tmp_issue97_directional_targets)=10
  and (select pg_catalog.md5(pg_catalog.string_agg(
       route_prep_step_id::text,'|' order by route_prep_step_id))
       from pg_temp.tmp_issue97_directional_targets)='e3527d5eef906ec822400212ad98e79f'
  and (select pg_catalog.md5(pg_catalog.string_agg(route_prep_id::text,'|' order by route_prep_id))
       from (select distinct route_prep_id from pg_temp.tmp_issue97_directional_targets) routes)
      ='6709f40e85e47d5683774f3a4316beb8',
  'Issue #97 exact 12-occurrence / 10-route directional cohort drifted');

select private_verification.brinesearch_issue97_refresh_occurrence_candidate(
  route_prep_step_id)
from pg_temp.tmp_issue97_directional_targets
order by route_prep_step_id;

select private_verification.brinesearch_issue97_resolve_route_identity_path(route_prep_id)
from (select distinct route_prep_id from pg_temp.tmp_issue97_directional_targets) routes
order by route_prep_id;

select private_verification.brinesearch_issue97_refresh_route_receipt(route_prep_id)
from (select distinct route_prep_id from pg_temp.tmp_issue97_directional_targets) routes
order by route_prep_id;

select pg_temp.issue97_assert(
  not exists(
    select 1 from pg_temp.tmp_issue97_directional_targets target
    join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
      on receipt.route_prep_step_id=target.route_prep_step_id
    where receipt.candidate_count=0
      or receipt.hold_reason='no_authoritative_identity_candidate'
  ) and not exists(
    select 1 from pg_temp.tmp_issue97_directional_targets target
    where not exists(
      select 1
      from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
      where candidate.route_prep_step_id=target.route_prep_step_id
        and candidate.candidate_basis='exact_authoritative_designation_candidate'
        and candidate.evidence->>'proof'=
          'exact directional highway system/class/number candidate'
        and candidate.evidence->>'travel_direction' in ('n','s','e','w')
    )
  ),
  'Issue #97 exact directional designations did not become graph-path candidates');

create temporary table tmp_issue97_directional_negatives on commit drop as
select step.id as route_prep_step_id,pad.legacy_id,step.normalized_text
from public.pads pad
join public.brinesearch_route_prep route
  on route.pad_id=pad.id and route.active and route.route_group='primary'
join public.brinesearch_route_prep_steps step
  on step.route_prep_id=route.id and step.active
where (pad.legacy_id,step.normalized_text) in (
  ('ascent--cesario','OH-1'),
  ('gulfport--duvall','US-800'),
  ('gulfport--schumacher','I-79'),
  ('eog--peckens','SR-22')
);

select pg_temp.issue97_assert(
  (select count(*) from pg_temp.tmp_issue97_directional_negatives)=4,
  'Issue #97 invalid/non-directional highway negative fixtures drifted');

select private_verification.brinesearch_issue97_refresh_occurrence_candidate(
  route_prep_step_id)
from pg_temp.tmp_issue97_directional_negatives
order by route_prep_step_id;

select pg_temp.issue97_assert(
  not exists(
    select 1 from pg_temp.tmp_issue97_directional_negatives negative
    join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
      on receipt.route_prep_step_id=negative.route_prep_step_id
    where receipt.candidate_count<>0
      or receipt.hold_reason<>'no_authoritative_identity_candidate'
  ),
  'Issue #97 invalid OH-1/US-800/I-79/SR-22 negative gained a candidate');

select pg_temp.issue97_assert(
  not exists(
    select 1 from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    join public.pads pad on pad.id=receipt.pad_id
    where pad.state='Ohio' and receipt.resolution_method in
      ('name_only','fuzzy_name','nearest_road','route_number_only')
  )
  and (select count(*) from public.brinesearch_driver_google_routes_public)=
      (select public_rows from pg_temp.tmp_issue97_directional_baseline)
  and public.brinesearch_issue97_cutover_active()=
      (select cutover_active from pg_temp.tmp_issue97_directional_baseline)
  and (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)=
      (select reconciliation_runs from pg_temp.tmp_issue97_directional_baseline)
  and (select count(*) from public.brinesearch_road_graph_builds where status='staging')=
      (select staging from pg_temp.tmp_issue97_directional_baseline)
  and (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(build)::text,'|' order by build.id),''))
       from public.brinesearch_road_graph_builds build)=
      (select graph_digest from pg_temp.tmp_issue97_directional_baseline),
  'Issue #97 directional-designation regression changed protected state or no-guess behavior');

rollback;

