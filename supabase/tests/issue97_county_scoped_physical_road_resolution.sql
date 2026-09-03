\set ON_ERROR_STOP on
\pset pager off
\timing on

-- This database-bound regression is transactional. It applies the Gate 2
-- migration, exercises the narrowed resolver contract, rolls it back, proves
-- the old functions return byte-for-byte, then reapplies once more and rolls
-- back again. It is intended for an isolated development/rehearsal database.

select pg_catalog.md5(pg_catalog.pg_get_functiondef(
  'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::
    pg_catalog.regprocedure
)) as before_occurrence_md5 \gset
select pg_catalog.md5(pg_catalog.pg_get_functiondef(
  'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)'::
    pg_catalog.regprocedure
)) as before_route_md5 \gset

\if :'before_occurrence_md5' != '0f139df2a01f68722958ff10f1dd6f49'
  \error 'Issue #97 Gate 2 test baseline occurrence function drifted'
\endif
\if :'before_route_md5' != '8283a543bf42f939296d32e5e5a92b4f'
  \error 'Issue #97 Gate 2 test baseline route-receipt function drifted'
\endif

begin;
set local statement_timeout='15min';
set local lock_timeout='2min';

\ir ../migrations/20260903193000_issue97_county_scoped_physical_road_resolution.sql

create or replace function pg_temp.issue97_assert(p_condition boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception '%',p_message;
  end if;
end
$$;

-- Contract/order checks: explicit source and >50 bail must stay ahead of the
-- new county pass. Gate 3 route receipt must remain byte-identical.
select pg_temp.issue97_assert(
  pg_catalog.strpos(pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  ),'if v_source_key is not null then')>0
  and pg_catalog.strpos(pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  ),'if v_source_key is not null then')
    < pg_catalog.strpos(pg_catalog.pg_get_functiondef(
      'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
    ),'brinesearch_issue97_county_scope_candidate_set')
  and pg_catalog.strpos(pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  ),'v_candidate_count>50')
    < pg_catalog.strpos(pg_catalog.pg_get_functiondef(
      'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
    ),'brinesearch_issue97_county_scope_candidate_set'),
  'Issue #97 Gate 2 moved county scoping ahead of an existing stronger/safety gate'
);

select pg_temp.issue97_assert(
  pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)'::pg_catalog.regprocedure
  ))=:'before_route_md5',
  'Issue #97 Gate 2 changed the Gate 3 route-ready contract'
);

select pg_temp.issue97_assert(
  pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_county_scope_candidate_set(uuid)'::pg_catalog.regprocedure
  ) not like '%nearest_road%true%'
  and pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_county_scope_candidate_set(uuid)'::pg_catalog.regprocedure
  ) not like '%provider_geometry%true%'
  and pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_county_scope_candidate_set(uuid)'::pg_catalog.regprocedure
  ) not like '%normalized_name=%'
  and pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_county_scope_candidate_set(uuid)'::pg_catalog.regprocedure
  ) like '%road.verification_status=''verified''%'
  and pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_county_scope_candidate_set(uuid)'::pg_catalog.regprocedure
  ) like '%not road.candidate_only%',
  'Issue #97 Gate 2 physical-road grouping escaped verified canonical-road authority'
);

-- Choose a real Belmont step solely as a foreign-key-safe fixture container.
-- Candidate rows are replaced inside savepoints and the enclosing transaction
-- rolls everything back.
create temporary table tmp_gate2_belmont_fixture on commit drop as
select step.id as step_id,route.id as route_prep_id,pad.id as pad_id
from public.brinesearch_route_prep_steps step
join public.brinesearch_route_prep route on route.id=step.route_prep_id and route.active
join public.pads pad on pad.id=route.pad_id
where step.active
  and private_verification.brinesearch_issue97_route_state_code(pad.state)='OH'
  and pg_catalog.lower(pg_catalog.btrim(pad.county))='belmont'
  and step.step_kind in (
    'interstate','us_route','state_route','county_road','township_road','local_road','private_segment'
  )
order by route.id,step.step_order,step.id
limit 1;

select pg_temp.issue97_assert(
  (select count(*) from pg_temp.tmp_gate2_belmont_fixture)=1,
  'Issue #97 Gate 2 Belmont fixture is unavailable'
);

-- Frozen reviewed evidence already maps the C/N SR-7 identity variants to one
-- verified canonical road. This proves one physical road must not cause an
-- arbitrary authoritative identity selection.
select pg_temp.issue97_assert(
  (select count(*)
   from public.brinesearch_authoritative_road_identities identity
   join public.brinesearch_road_identity_mappings mapping
     on mapping.identity_id=identity.id and mapping.mapping_status='verified'
   join public.brinesearch_roads road
     on road.id=mapping.road_id and road.verification_status='verified'
      and not road.candidate_only
   where identity.id in (
     '32151137-5710-e8d5-f106-83f5059b1d1d'::uuid,
     '54c74ce8-54b5-69c9-f8ef-2bc5a59e6a3e'::uuid
   )
     and identity.active and identity.state_code='OH' and identity.county_code='BEL'
     and mapping.road_id='7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c'::uuid)=2,
  'Issue #97 frozen Belmont SR-7 C/N physical-road evidence drifted'
);

savepoint gate2_multi_identity_same_road;
delete from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
using pg_temp.tmp_gate2_belmont_fixture fixture
where candidate.route_prep_step_id=fixture.step_id;

insert into private_verification.brinesearch_route_occurrence_candidates_issue97(
  route_prep_step_id,identity_id,canonical_road_id,candidate_basis,strong_proof,
  source_identity_key,source_digest,mapping_fingerprint,evidence
)
select fixture.step_id,identity.id,mapping.road_id,
  'exact_authoritative_designation_candidate',false,
  identity.source_identity_key,identity.source_digest,
  private_verification.brinesearch_issue97_mapping_fingerprint(identity.id),
  pg_catalog.jsonb_build_object('fixture','gate2_same_physical_road_identity_variants')
from pg_temp.tmp_gate2_belmont_fixture fixture
cross join public.brinesearch_authoritative_road_identities identity
join public.brinesearch_road_identity_mappings mapping
  on mapping.identity_id=identity.id and mapping.mapping_status='verified'
where identity.id in (
  '32151137-5710-e8d5-f106-83f5059b1d1d'::uuid,
  '54c74ce8-54b5-69c9-f8ef-2bc5a59e6a3e'::uuid
);

create temporary table tmp_gate2_multi_result on commit drop as
select private_verification.brinesearch_issue97_county_scope_candidate_set(
  fixture.step_id
) as result
from pg_temp.tmp_gate2_belmont_fixture fixture;

select pg_temp.issue97_assert(
  (select result->>'scope_status'='physical_road_unique_identity_variant_unresolved'
      and result->>'resolution_eligible'='false'
      and (result->>'post_scope_identity_count')::integer=2
      and (result->>'mapped_identity_count')::integer=2
      and (result->>'physical_road_count')::integer=1
      and result->>'canonical_road_id'='7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c'
      and pg_catalog.jsonb_array_length(result->'physical_road_group_members')=2
   from pg_temp.tmp_gate2_multi_result),
  'Issue #97 Gate 2 arbitrarily selected an ODOT identity variant for one physical road'
);
rollback to savepoint gate2_multi_identity_same_road;
release savepoint gate2_multi_identity_same_road;

-- With one county-scoped authoritative identity and one verified canonical road,
-- the helper may mark the occurrence as eligible for the new direct resolver.
savepoint gate2_unique_identity;
delete from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
using pg_temp.tmp_gate2_belmont_fixture fixture
where candidate.route_prep_step_id=fixture.step_id;

insert into private_verification.brinesearch_route_occurrence_candidates_issue97(
  route_prep_step_id,identity_id,canonical_road_id,candidate_basis,strong_proof,
  source_identity_key,source_digest,mapping_fingerprint,evidence
)
select fixture.step_id,identity.id,mapping.road_id,
  'exact_authoritative_designation_candidate',false,
  identity.source_identity_key,identity.source_digest,
  private_verification.brinesearch_issue97_mapping_fingerprint(identity.id),
  pg_catalog.jsonb_build_object('fixture','gate2_unique_identity')
from pg_temp.tmp_gate2_belmont_fixture fixture
cross join public.brinesearch_authoritative_road_identities identity
join public.brinesearch_road_identity_mappings mapping
  on mapping.identity_id=identity.id and mapping.mapping_status='verified'
where identity.id='54c74ce8-54b5-69c9-f8ef-2bc5a59e6a3e'::uuid;

select pg_temp.issue97_assert(
  (select result->>'scope_status'='direct_identity_safe'
      and result->>'resolution_eligible'='true'
      and result->>'identity_id'='54c74ce8-54b5-69c9-f8ef-2bc5a59e6a3e'
      and result->>'canonical_road_id'='7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c'
   from (
     select private_verification.brinesearch_issue97_county_scope_candidate_set(
       fixture.step_id
     ) result
     from pg_temp.tmp_gate2_belmont_fixture fixture
   ) evaluated),
  'Issue #97 Gate 2 did not recognize one exact county-scoped identity/physical road'
);
rollback to savepoint gate2_unique_identity;
release savepoint gate2_unique_identity;

-- Null county is fail-closed and must not prune the existing candidate set.
savepoint gate2_null_county;
create temporary table tmp_gate2_null_before on commit drop as
select fixture.step_id,fixture.pad_id,
  (select count(distinct candidate.identity_id)
   from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
   where candidate.route_prep_step_id=fixture.step_id) as candidate_count
from pg_temp.tmp_gate2_belmont_fixture fixture;
update public.pads pad set county=null
from pg_temp.tmp_gate2_belmont_fixture fixture
where pad.id=fixture.pad_id;

select pg_temp.issue97_assert(
  (select result->>'scope_status'='null_or_blank_pad_county'
      and result->>'resolution_eligible'='false'
      and (result->>'post_scope_identity_count')::integer=before.candidate_count
      and (select count(distinct candidate.identity_id)
           from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
           where candidate.route_prep_step_id=before.step_id)=before.candidate_count
   from pg_temp.tmp_gate2_null_before before
   cross join lateral (
     select private_verification.brinesearch_issue97_county_scope_candidate_set(
       before.step_id
     ) result
   ) evaluated),
  'Issue #97 Gate 2 null county guessed or pruned candidates'
);
rollback to savepoint gate2_null_county;
release savepoint gate2_null_county;

-- Washington County must be scoped by STATE + county. Use real active PA and OH
-- identities and a real PA Washington route step; an injected Ohio candidate
-- must be removed while the PA candidate survives.
create temporary table tmp_gate2_washington_fixture on commit drop as
with pa_step as (
  select step.id as step_id,route.pad_id
  from public.brinesearch_route_prep_steps step
  join public.brinesearch_route_prep route on route.id=step.route_prep_id and route.active
  join public.pads pad on pad.id=route.pad_id
  where step.active
    and private_verification.brinesearch_issue97_route_state_code(pad.state)='PA'
    and pg_catalog.lower(pg_catalog.btrim(pad.county))='washington'
    and step.step_kind in (
      'interstate','us_route','state_route','county_road','township_road','local_road','private_segment'
    )
  order by route.id,step.step_order,step.id
  limit 1
), pa_identity as (
  select identity.id
  from public.brinesearch_authoritative_road_identities identity
  join public.brinesearch_road_graph_counties county
    on county.active and county.state_code='PA' and county.county_code=identity.county_code
   and pg_catalog.lower(pg_catalog.btrim(county.county_name))='washington'
  where identity.active and identity.state_code='PA'
    and identity.drivable_status='drivable'
  order by identity.source_identity_key
  limit 1
), oh_identity as (
  select identity.id
  from public.brinesearch_authoritative_road_identities identity
  join public.brinesearch_road_graph_counties county
    on county.active and county.state_code='OH' and county.county_code=identity.county_code
   and pg_catalog.lower(pg_catalog.btrim(county.county_name))='washington'
  where identity.active and identity.state_code='OH'
    and identity.drivable_status='drivable'
  order by identity.source_identity_key
  limit 1
)
select pa_step.step_id,pa_step.pad_id,
  pa_identity.id as pa_identity_id,oh_identity.id as oh_identity_id
from pa_step cross join pa_identity cross join oh_identity;

select pg_temp.issue97_assert(
  (select count(*) from pg_temp.tmp_gate2_washington_fixture)=1,
  'Issue #97 Gate 2 Washington County PA/OH fixture is unavailable'
);

savepoint gate2_washington_state_scope;
delete from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
using pg_temp.tmp_gate2_washington_fixture fixture
where candidate.route_prep_step_id=fixture.step_id;

insert into private_verification.brinesearch_route_occurrence_candidates_issue97(
  route_prep_step_id,identity_id,canonical_road_id,candidate_basis,strong_proof,
  source_identity_key,source_digest,mapping_fingerprint,evidence
)
select fixture.step_id,identity.id,mapping.road_id,
  'exact_authoritative_name_candidate',false,
  identity.source_identity_key,identity.source_digest,
  private_verification.brinesearch_issue97_mapping_fingerprint(identity.id),
  pg_catalog.jsonb_build_object('fixture','gate2_state_plus_county')
from pg_temp.tmp_gate2_washington_fixture fixture
join public.brinesearch_authoritative_road_identities identity
  on identity.id in (fixture.pa_identity_id,fixture.oh_identity_id)
left join public.brinesearch_road_identity_mappings mapping
  on mapping.identity_id=identity.id and mapping.mapping_status='verified';

select private_verification.brinesearch_issue97_county_scope_candidate_set(fixture.step_id)
from pg_temp.tmp_gate2_washington_fixture fixture;

select pg_temp.issue97_assert(
  (select count(*)
   from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
   join pg_temp.tmp_gate2_washington_fixture fixture on fixture.step_id=candidate.route_prep_step_id
   where candidate.identity_id=fixture.oh_identity_id)=0
  and
  (select count(*)
   from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
   join pg_temp.tmp_gate2_washington_fixture fixture on fixture.step_id=candidate.route_prep_step_id
   where candidate.identity_id=fixture.pa_identity_id)=1,
  'Issue #97 Gate 2 Washington County PA scope leaked an Ohio identity'
);
rollback to savepoint gate2_washington_state_scope;
release savepoint gate2_washington_state_scope;

-- Existing source-bound resolutions are protected by ordering: county helper is
-- absent from the explicit source branch and the migration never rewrites an
-- already-resolved receipt by itself.
select pg_temp.issue97_assert(
  not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    where receipt.resolution_status='resolved'
      and receipt.resolution_method='county_scoped_exact_road'
  ),
  'Issue #97 Gate 2 migration mutated receipts merely by being applied'
);

-- Gate 3 contract stop: full route-ready continues to mean no held occurrence.
select pg_temp.issue97_assert(
  pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)'::pg_catalog.regprocedure
  ) like '%v_held>0 or v_resolved<>v_occurrences%'
  and exists(
    select 1
    from private_verification.brinesearch_v18_named_approach_releases release
    where release.final_leg_mode='google_to_saved_gps_unapproved'
      and release.evidence->>'fullRouteReadinessClaimed'='false'
  ),
  'Issue #97 Gate 3 full-route contract or named-core precedent drifted'
);

select pg_catalog.jsonb_pretty(pg_catalog.jsonb_build_object(
  'result','PASS',
  'migration','20260903193000_issue97_county_scoped_physical_road_resolution',
  'explicit_source_priority_preserved',true,
  'candidate_over_50_bail_preserved',true,
  'null_county_fail_closed',true,
  'state_plus_county_scope',true,
  'one_physical_road_multi_identity_not_arbitrarily_selected',true,
  'verified_canonical_mapping_only',true,
  'gate3_route_ready_unchanged',true
));

rollback;

-- Rollback proof: old function bodies return exactly and helper disappears.
select pg_catalog.md5(pg_catalog.pg_get_functiondef(
  'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
)) as rolled_back_occurrence_md5 \gset
select pg_catalog.md5(pg_catalog.pg_get_functiondef(
  'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)'::pg_catalog.regprocedure
)) as rolled_back_route_md5 \gset

\if :'rolled_back_occurrence_md5' != :'before_occurrence_md5'
  \error 'Issue #97 Gate 2 rollback did not restore occurrence resolver exactly'
\endif
\if :'rolled_back_route_md5' != :'before_route_md5'
  \error 'Issue #97 Gate 2 rollback changed route receipt'
\endif

begin;
set local statement_timeout='15min';
set local lock_timeout='2min';
\ir ../migrations/20260903193000_issue97_county_scoped_physical_road_resolution.sql

select case
  when pg_catalog.to_regprocedure(
    'private_verification.brinesearch_issue97_county_scope_candidate_set(uuid)'
  ) is null then pg_catalog.pg_catalog.raise_exception('Gate 2 helper absent after reapply')
  else true
end;

select pg_catalog.md5(pg_catalog.pg_get_functiondef(
  'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)'::pg_catalog.regprocedure
)) as reapplied_route_md5 \gset
\if :'reapplied_route_md5' != :'before_route_md5'
  \error 'Issue #97 Gate 2 reapply changed Gate 3 route receipt'
\endif

rollback;

select 'PASS: Issue #97 Gate 2 apply / rollback / reapply transaction regression' as result;
