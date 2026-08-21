\set ON_ERROR_STOP on
\pset pager off
\timing on

-- One outer transaction. This regression/rehearsal never commits.
begin;
set local statement_timeout='90min';
set local lock_timeout='2min';

do $issue97_frozen_mapping_rehearsal_preflight$
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version='20260817193212')<>0
     or (select count(*) from public.brinesearch_road_identity_mappings
         where evidence->>'migration'='issue97_frozen_exact_mapping_wave')<>0
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
     ))<>'06705f5b35a6d37151bb2c0dc5ade9bd'
     or (select count(*) from public.brinesearch_road_graph_builds
         where state_code='OH' and status='active')<>19
     or (select count(*) from public.brinesearch_road_source_dataset_counties scope
         where scope.state_code='OH' and scope.active and scope.ingest_enabled
           and private_verification.brinesearch_issue97_dataset_scope_current(
             scope.dataset_id,scope.state_code,scope.county_code))<>38
     or (select count(*)
         from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
         join public.brinesearch_route_prep route on route.id=receipt.route_prep_id
         join public.pads pad on pad.id=route.pad_id
         where route.active and route.route_group in ('primary','alternate')
           and pad.state='Ohio' and not coalesce(pad.list_only,false))<>806
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or public.brinesearch_issue97_cutover_active()
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0
  then
    raise exception 'Issue #97 frozen mapping rollback rehearsal preflight failed';
  end if;
end
$issue97_frozen_mapping_rehearsal_preflight$;

create temporary table tmp_issue97_mapping_wave_existing_builds on commit drop as
select id from public.brinesearch_road_graph_builds;

create temporary table tmp_issue97_mapping_wave_active_before on commit drop as
select * from public.brinesearch_road_graph_builds
where state_code='OH' and status='active';

create temporary table tmp_issue97_mapping_wave_active_children_before on commit drop as
select build.id build_id,
  pg_catalog.md5(coalesce((select pg_catalog.string_agg(pg_catalog.to_jsonb(junction)::text,'|' order by junction.id)
    from public.brinesearch_road_junctions junction where junction.build_id=build.id),'')) junctions,
  pg_catalog.md5(coalesce((select pg_catalog.string_agg(pg_catalog.to_jsonb(membership)::text,'|' order by membership.id)
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
    where junction.build_id=build.id),'')) memberships,
  pg_catalog.md5(coalesce((select pg_catalog.string_agg(pg_catalog.to_jsonb(anchor)::text,'|' order by anchor.id)
    from public.brinesearch_road_junction_anchors anchor
    join public.brinesearch_road_junctions junction on junction.id=anchor.junction_id
    where junction.build_id=build.id),'')) anchors
from tmp_issue97_mapping_wave_active_before build;

create temporary table tmp_issue97_mapping_wave_route_state_before on commit drop as
select
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(candidate)::text,'|' order by candidate.route_prep_step_id,candidate.identity_id,candidate.candidate_basis),''))
    from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate) candidates,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),''))
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt) occurrences,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id),''))
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt) routes,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.boundary_index),''))
    from private_verification.brinesearch_route_transition_receipts_issue97 receipt) transitions,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),''))
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt) geometry,
  (select count(*) from public.brinesearch_driver_google_routes_public) public_google,
  public.brinesearch_issue97_cutover_active() cutover,
  (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs) global_reconciliation;

\ir ../migrations/20260817193212_issue97_frozen_exact_mapping_wave.sql

do $issue97_frozen_mapping_google_postprocessor_assertions$
begin
  if (select count(*) from tmp_issue97_frozen_mapping_expected_google_pads)<>3
     or (select pg_catalog.md5(pg_catalog.string_agg(pad_id::text,'|' order by pad_id))
         from tmp_issue97_frozen_mapping_expected_google_pads)
       <>'5cd68da6e31fa7bf5b59bca9935f96f2'
     or exists(
       select 1
       from tmp_issue97_frozen_mapping_expected_google_pads expected
       left join private_verification.brinesearch_google_route_receipts_issue97 receipt
         on receipt.pad_id=expected.pad_id
       left join public.pads pad on pad.id=expected.pad_id
       where receipt.status is distinct from 'stale'
          or receipt.hold_reason is distinct from 'road_identity_mapping_changed'
          or receipt.manifest_version is distinct from 'issue97-google-v1'
          or receipt.manifest->>'manifest_version' is distinct from 'issue97-google-v1'
          or receipt.manifest->>'route_ready' is distinct from 'false'
          or receipt.manifest->>'status' is distinct from 'stale'
          or receipt.manifest->>'pad_id' is distinct from expected.pad_id::text
          or receipt.manifest->>'route_revision' is distinct from receipt.route_revision::text
          or receipt.manifest_digest is not null
          or receipt.dependency_digest is not null
          or not exists(
            select 1 from tmp_issue97_frozen_mapping_targets target
            where target.identity_id::text=receipt.evidence->>'identity_id'
              and target.road_id::text=receipt.evidence->>'road_id'
          )
          or not (
            exists(select 1 from public.brinesearch_pad_roads step
              where step.pad_id=expected.pad_id
                and step.road_id::text=receipt.evidence->>'road_id')
            or exists(
              select 1 from pg_catalog.jsonb_array_elements(
                coalesce(expected.pre_receipt_row->'manifest'->'points','[]'::jsonb)
              ) point
              where point->>'identity_id'=receipt.evidence->>'identity_id'
                 or point->>'road_id'=receipt.evidence->>'road_id'
            )
          )
          or pad.brinesearch_google_route_status_issue97 is distinct from 'stale'
          or pad.brinesearch_google_route_revision_issue97 is distinct from receipt.route_revision
          or pad.structured_route_revision is distinct from expected.structured_route_revision
          or pad.road_sequence_status is distinct from expected.road_sequence_status
     )
     or (select count(*) from private_verification.brinesearch_google_route_receipts_issue97 receipt
         join tmp_issue97_frozen_mapping_expected_google_pads expected
           on expected.pad_id=receipt.pad_id)<>3
     or exists(
       select 1
       from tmp_issue97_frozen_mapping_google_immediate_receipts snapshot
       full join (
         select receipt.*
         from private_verification.brinesearch_google_route_receipts_issue97 receipt
         join tmp_issue97_frozen_mapping_expected_google_pads expected
           on expected.pad_id=receipt.pad_id
       ) live using(pad_id)
       where pg_catalog.to_jsonb(live) is distinct from pg_catalog.to_jsonb(snapshot)
     )
     or exists(
       select 1
       from tmp_issue97_frozen_mapping_google_immediate_pads snapshot
       full join (
         select pad.id,pad.brinesearch_google_route_status_issue97,
           pad.brinesearch_google_route_revision_issue97
         from public.pads pad
         join tmp_issue97_frozen_mapping_expected_google_pads expected
           on expected.pad_id=pad.id
       ) live using(id)
       where pg_catalog.to_jsonb(live) is distinct from pg_catalog.to_jsonb(snapshot)
     )
     or exists(select 1 from private_verification.brinesearch_google_route_refresh_queue_issue97)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id),''))
         from private_verification.brinesearch_google_route_receipts_issue97 receipt
         where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
           where expected.pad_id=receipt.pad_id))<>
       (select non_target_private_google from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.jsonb_build_object(
         'pad_id',pad.id,'status',pad.brinesearch_google_route_status_issue97,
         'revision',pad.brinesearch_google_route_revision_issue97
       )::text,'|' order by pad.id),''))
         from public.pads pad
         where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
           where expected.pad_id=pad.id))<>
       (select non_target_pad_google from tmp_issue97_frozen_mapping_protected_before)
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0
     or public.brinesearch_issue97_cutover_active()
  then
    raise exception 'Issue #97 rollback rehearsal post-processor Google contract failed';
  end if;
end
$issue97_frozen_mapping_google_postprocessor_assertions$;

create temporary table tmp_issue97_mapping_wave_post_migration_target_receipts on commit drop as
select receipt.*
from tmp_issue97_frozen_mapping_expected_google_pads expected
join private_verification.brinesearch_google_route_receipts_issue97 receipt
  on receipt.pad_id=expected.pad_id
order by receipt.pad_id;

create temporary table tmp_issue97_mapping_wave_post_migration_target_pads on commit drop as
select pad.id,pad.brinesearch_google_route_status_issue97,
  pad.brinesearch_google_route_revision_issue97
from tmp_issue97_frozen_mapping_expected_google_pads expected
join public.pads pad on pad.id=expected.pad_id
order by pad.id;

do $issue97_frozen_mapping_post_migration_google_snapshot_assertion$
begin
  if (select count(*) from tmp_issue97_mapping_wave_post_migration_target_receipts)<>3
     or (select count(*) from tmp_issue97_mapping_wave_post_migration_target_pads)<>3
  then
    raise exception 'Issue #97 rollback rehearsal post-processor Google contract failed';
  end if;
end
$issue97_frozen_mapping_post_migration_google_snapshot_assertion$;

create temporary table
tmp_issue97_mapping_wave_reviewed_mappings_before_build
on commit drop
as
select mapping.*
from public.brinesearch_road_identity_mappings mapping
join tmp_issue97_frozen_mapping_targets target
  on target.identity_id=mapping.identity_id
 and target.road_id=mapping.road_id
where mapping.mapping_status='verified'
  and mapping.mapping_method='manual_reviewed_source_evidence'
  and mapping.evidence->>'migration'=
    'issue97_frozen_exact_mapping_wave'
order by mapping.identity_id,mapping.road_id;

do $issue97_frozen_mapping_reviewed_snapshot_assertion$
begin
  if (
    select count(*)
    from tmp_issue97_mapping_wave_reviewed_mappings_before_build
  )<>46
  then
    raise exception
      'Issue #97 reviewed frozen mapping snapshot count drifted';
  end if;
end
$issue97_frozen_mapping_reviewed_snapshot_assertion$;

-- Snapshot the complete normalized active machine-mapping state for every
-- active Ohio identity in the eight-county build scope. This is deliberately
-- broader than the frozen 42 identities so an unlisted refresh transition
-- cannot hide outside the reviewed contract.
create temporary table
tmp_issue97_mapping_wave_machine_scope_before_build
on commit drop
as
select
  identity.id as identity_id,
  identity.county_code,
  identity.source_identity_key,
  identity.road_class,
  identity.route_system,
  identity.route_number,
  identity.route_suffix,
  identity.route_fraction,
  identity.route_extension,
  verified.road_id as effective_road_id,
  verified.mapping_status,
  verified.mapping_method,
  verified.evidence as mapping_evidence,
  case
    when verified.evidence->>'exact_candidate_count' ~ '^[0-9]+$'
      then (verified.evidence->>'exact_candidate_count')::integer
  end as exact_candidate_count,
  case
    when verified.evidence->>'ambiguity_held' in ('true','false')
      then (verified.evidence->>'ambiguity_held')::boolean
  end as ambiguity_flag,
  verified.evidence->>'refresh_scope' as refresh_scope,
  case when verified.id is null then null else
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'designation_source',verified.evidence->>'designation_source',
      'road_source_record_id',verified.evidence->>'road_source_record_id',
      'migration',verified.evidence->>'migration',
      'evidence_basis',verified.evidence->>'evidence_basis',
      'exact_method',verified.evidence->>'exact_method'
    ))
  end as evidence_source
from public.brinesearch_authoritative_road_identities identity
join tmp_issue97_mapping_wave_active_before county
  on county.state_code='OH'
 and county.county_code=identity.county_code
left join public.brinesearch_road_identity_mappings verified
  on verified.identity_id=identity.id
 and verified.mapping_status='verified'
where identity.active
  and identity.state_code='OH'
order by identity.id;

create temporary table
tmp_issue97_mapping_wave_machine_mappings_before_build
on commit drop
as
select
  scope.identity_id,
  scope.county_code,
  scope.source_identity_key,
  coalesce(machine.mapping_state,'[]'::jsonb) as mapping_state
from tmp_issue97_mapping_wave_machine_scope_before_build scope
left join lateral (
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'road_id',mapping.road_id,
      'mapping_status',mapping.mapping_status,
      'mapping_method',mapping.mapping_method,
      'exact_candidate_count',case
        when mapping.evidence->>'exact_candidate_count' ~ '^[0-9]+$'
          then (mapping.evidence->>'exact_candidate_count')::integer
      end,
      'ambiguity_flag',case
        when mapping.evidence->>'ambiguity_held' in ('true','false')
          then (mapping.evidence->>'ambiguity_held')::boolean
      end,
      'refresh_scope',mapping.evidence->>'refresh_scope',
      'evidence_source',pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
          'designation_source',mapping.evidence->>'designation_source',
          'road_source_record_id',mapping.evidence->>'road_source_record_id',
          'migration',mapping.evidence->>'migration',
          'evidence_basis',mapping.evidence->>'evidence_basis',
          'exact_method',mapping.evidence->>'exact_method'
        )
      )
    ) order by mapping.road_id,mapping.mapping_status,mapping.mapping_method
  ) as mapping_state
  from public.brinesearch_road_identity_mappings mapping
  where mapping.identity_id=scope.identity_id
    and mapping.mapping_method in (
      'exact_source_record_id','exact_route_designation'
    )
    and mapping.mapping_status in ('verified','candidate')
) machine on true
order by scope.identity_id;

create temporary table
tmp_issue97_mapping_wave_refresh_contract_before_build
on commit drop
as
select
  contract.*,
  mapping_state.active_mapping_count,
  mapping_state.exact_prior_mapping_count,
  old_memberships.observed_old_membership_occurrence_count,
  old_memberships.old_nonnull_road_id_count,
  old_memberships.old_exact_road_id_count
from tmp_issue97_frozen_mapping_refresh_contract contract
left join lateral (
  select
    count(*)::bigint as active_mapping_count,
    count(*) filter(
      where mapping.road_id=contract.prior_road_id
        and mapping.mapping_status=contract.prior_mapping_status
        and mapping.mapping_method=contract.prior_mapping_method
    )::bigint as exact_prior_mapping_count
  from public.brinesearch_road_identity_mappings mapping
  where mapping.identity_id=contract.identity_id
    and mapping.mapping_status in ('verified','candidate')
) mapping_state on true
left join lateral (
  select
    count(*)::bigint as observed_old_membership_occurrence_count,
    count(*) filter(where membership.road_id is not null)::bigint
      as old_nonnull_road_id_count,
    count(*) filter(where membership.road_id=contract.road_id)::bigint
      as old_exact_road_id_count
  from tmp_issue97_mapping_wave_active_before prior
  join public.brinesearch_road_junctions junction
    on junction.build_id=prior.id
  join public.brinesearch_road_junction_memberships membership
    on membership.junction_id=junction.id
  where prior.state_code='OH'
    and prior.county_code=contract.county_code
    and membership.identity_id=contract.identity_id
) old_memberships on true
order by contract.county_code,contract.identity_id,contract.road_id;

do $issue97_frozen_mapping_refresh_contract_snapshot_assertion$
begin
  if (
       select count(*)
       from tmp_issue97_mapping_wave_refresh_contract_before_build
     )<>42
     or (
       select count(*)
       from tmp_issue97_mapping_wave_refresh_contract_before_build
       where raw_transition_class='NULL_TO_NONNULL'
     )<>35
     or (
       select count(*)
       from tmp_issue97_mapping_wave_refresh_contract_before_build
       where raw_transition_class='UNCHANGED_OR_INVALID'
     )<>7
     or exists(
       select 1
       from tmp_issue97_mapping_wave_refresh_contract_before_build snapshot
       where snapshot.observed_old_membership_occurrence_count is distinct from
               snapshot.old_active_membership_occurrence_count
          or (
            snapshot.raw_transition_class='NULL_TO_NONNULL'
            and (
              snapshot.active_mapping_count<>0
              or snapshot.exact_prior_mapping_count<>0
              or snapshot.old_nonnull_road_id_count<>0
              or snapshot.old_exact_road_id_count<>0
            )
          )
          or (
            snapshot.raw_transition_class='UNCHANGED_OR_INVALID'
            and (
              snapshot.active_mapping_count<>1
              or snapshot.exact_prior_mapping_count<>1
              or snapshot.old_nonnull_road_id_count is distinct from
                 snapshot.old_active_membership_occurrence_count
              or snapshot.old_exact_road_id_count is distinct from
                 snapshot.old_active_membership_occurrence_count
            )
          )
     )
     or (
       select sum(observed_old_membership_occurrence_count)
       from tmp_issue97_mapping_wave_refresh_contract_before_build
     )<>1126
     or (
       select sum(observed_old_membership_occurrence_count)
       from tmp_issue97_mapping_wave_refresh_contract_before_build
       where raw_transition_class='NULL_TO_NONNULL'
     )<>1066
     or (
       select sum(observed_old_membership_occurrence_count)
       from tmp_issue97_mapping_wave_refresh_contract_before_build
       where raw_transition_class='UNCHANGED_OR_INVALID'
     )<>60
  then
    raise exception
      'Issue #97 complete mapping-refresh contract pre-build snapshot drifted';
  end if;
end
$issue97_frozen_mapping_refresh_contract_snapshot_assertion$;

insert into supabase_migrations.schema_migrations(version,statements,name)
values (
  '20260817193212',
  array['rollback-only exact frozen mapping migration body']::text[],
  'issue97_frozen_exact_mapping_wave'
);
\ir ../../ops/issue97-computer-rollout/sql/34-frozen-exact-mapping-wave-route-manifest.sql

-- Freeze the exact nine-pad Google dependency footprint for the reviewed
-- all-eight machine-refresh contract. The queue is produced by mapping-row
-- invalidations, so the reviewed pad set is pinned directly before any builder
-- changes receipts.
create temporary table
tmp_issue97_mapping_wave_refresh_expansion_google_before_build
on commit drop
as
with expected(
  pad_id,
  expected_evidence_identity_id,
  expected_evidence_road_id,
  expected_receipt_route_revision
) as (
  values
    ('69c63442-de05-4d15-95da-07da587bc070'::uuid,
     'e78dcae3-372f-4cf6-9bdd-a3773b21a50e'::uuid,
     '01bad0cc-614e-42b7-9db9-22bf6410c849'::uuid,0::bigint),
    ('6ef0746f-341a-4d29-9399-a81cfbec11e8'::uuid,
     'ebbc1392-345c-882e-2708-6ecc27a76f3c'::uuid,
     'cdcfd114-42c5-4478-9251-eac57a70e528'::uuid,0::bigint),
    ('75600d0c-17b8-488b-96c9-4b7b8ffc8b1b'::uuid,
     '542490a4-ba6f-02af-0209-37ad6257a962'::uuid,
     '52b08bc7-9b54-4b8d-a833-f903fc298f7b'::uuid,0::bigint),
    ('b6dae008-74d4-4976-9c72-fba7ae349c50'::uuid,
     'ebbc1392-345c-882e-2708-6ecc27a76f3c'::uuid,
     'cdcfd114-42c5-4478-9251-eac57a70e528'::uuid,0::bigint),
    ('b7526e45-0b33-4988-ae1c-0a4140971f8e'::uuid,
     '542490a4-ba6f-02af-0209-37ad6257a962'::uuid,
     '52b08bc7-9b54-4b8d-a833-f903fc298f7b'::uuid,0::bigint),
    ('d7898e8c-1bb6-48f8-b5e0-87bc1898420e'::uuid,
     '9acadc48-c230-5e7b-6f2a-0a77f86f625c'::uuid,
     'bbfacbaf-86be-4818-8541-61a697c71199'::uuid,1::bigint),
    ('e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid,
     'ebbc1392-345c-882e-2708-6ecc27a76f3c'::uuid,
     'cdcfd114-42c5-4478-9251-eac57a70e528'::uuid,0::bigint),
    ('f896d00c-da26-41b6-bf5b-e9d91afbdbc6'::uuid,
     'e78dcae3-372f-4cf6-9bdd-a3773b21a50e'::uuid,
     '01bad0cc-614e-42b7-9db9-22bf6410c849'::uuid,0::bigint),
    ('fcbf5085-4ba2-496d-9c20-516e8b52f9bd'::uuid,
     'e78dcae3-372f-4cf6-9bdd-a3773b21a50e'::uuid,
     '01bad0cc-614e-42b7-9db9-22bf6410c849'::uuid,0::bigint)
)
select expected.pad_id,
  expected.expected_evidence_identity_id,
  expected.expected_evidence_road_id,
  expected.expected_receipt_route_revision,
  pg_catalog.to_jsonb(receipt) as pre_receipt_row,
  pg_catalog.jsonb_build_object(
    'status',pad.brinesearch_google_route_status_issue97,
    'revision',pad.brinesearch_google_route_revision_issue97,
    'structured_route_revision',pad.structured_route_revision,
    'road_sequence_status',pad.road_sequence_status
  ) as pre_pad_state
from expected
join public.pads pad on pad.id=expected.pad_id
left join private_verification.brinesearch_google_route_receipts_issue97 receipt
  on receipt.pad_id=expected.pad_id
order by expected.pad_id;

create temporary table
tmp_issue97_mapping_wave_refresh_expansion_google_unchanged_before
on commit drop
as
select
  (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id
    ),''))
    from private_verification.brinesearch_google_route_receipts_issue97 receipt
    where not exists(
      select 1
      from tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected
      where expected.pad_id=receipt.pad_id
    )
  ) as receipt_digest,
  (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.jsonb_build_object(
        'pad_id',pad.id,
        'status',pad.brinesearch_google_route_status_issue97,
        'revision',pad.brinesearch_google_route_revision_issue97
      )::text,
      '|' order by pad.id
    ),''))
    from public.pads pad
    where not exists(
      select 1
      from tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected
      where expected.pad_id=pad.id
    )
  ) as pad_digest;

do $issue97_frozen_mapping_refresh_expansion_google_snapshot_assertion$
begin
  if (
       select count(*)
       from tmp_issue97_mapping_wave_refresh_expansion_google_before_build
     )<>9
     or (
       select pg_catalog.md5(
         pg_catalog.string_agg(pad_id::text,'|' order by pad_id)
       )
       from tmp_issue97_mapping_wave_refresh_expansion_google_before_build
     )<>'450948793c57a9a1535139fac4974792'
     or (
       select pg_catalog.md5(pg_catalog.string_agg(
         pad_id::text||':'||
         expected_evidence_identity_id::text||':'||
         expected_evidence_road_id::text||':'||
         expected_receipt_route_revision::text,
         '|' order by pad_id
       ))
       from tmp_issue97_mapping_wave_refresh_expansion_google_before_build
     )<>'5a75e5c4c34805b7dc2fdf8d0534a4f6'
     or (
       select count(*)
       from tmp_issue97_mapping_wave_refresh_expansion_google_unchanged_before
     )<>1
     or exists(
       select 1
       from tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected
       where not (
            exists(
              select 1
              from public.brinesearch_pad_roads step
              where step.pad_id=expected.pad_id
                and step.road_id=expected.expected_evidence_road_id
            )
            or exists(
              select 1
              from pg_catalog.jsonb_array_elements(
                coalesce(
                  expected.pre_receipt_row->'manifest'->'points',
                  '[]'::jsonb
                )
              ) point
              where point->>'identity_id'=
                    expected.expected_evidence_identity_id::text
                 or point->>'road_id'=
                    expected.expected_evidence_road_id::text
            )
          )
     )
  then
    raise exception
      'Issue #97 reviewed mapping-refresh Google dependency set drifted';
  end if;
end
$issue97_frozen_mapping_refresh_expansion_google_snapshot_assertion$;

create temporary table tmp_issue97_mapping_wave_build_results(
  build_order integer primary key,
  county_code text not null unique,
  result jsonb not null
) on commit drop;

-- Repeated-call temp-table guard. The pinned builder creates
-- tmp_issue97_point_corroboration with ON COMMIT DROP, and its internal
-- repeated-call cleanup drops every other builder temp table but omits that
-- one. ON COMMIT DROP does not run when a builder call returns; it waits for
-- the end of this single outer transaction. This rehearsal invokes the builder
-- repeatedly inside that one transaction, so the caller clears only this
-- session-local table before each fixed invocation; otherwise the second county
-- fails with SQLSTATE 42P07. Dropping the table also drops its temporary index
-- tmp_issue97_point_corroboration_key_idx. The guard changes no durable builder
-- or production state and leaves the pinned builder definition untouched.
-- issue97-point-corroboration-repeated-call-guard
-- Exact serial rebuild plan. No automatic retry and no other state/county input.
drop table if exists pg_temp.tmp_issue97_point_corroboration;
insert into tmp_issue97_mapping_wave_build_results values
  (1,'BEL',public.brinesearch_issue97_rebuild_county_graph('OH','BEL'));
drop table if exists pg_temp.tmp_issue97_point_corroboration;
insert into tmp_issue97_mapping_wave_build_results values
  (2,'CAR',public.brinesearch_issue97_rebuild_county_graph('OH','CAR'));
drop table if exists pg_temp.tmp_issue97_point_corroboration;
insert into tmp_issue97_mapping_wave_build_results values
  (3,'COL',public.brinesearch_issue97_rebuild_county_graph('OH','COL'));
drop table if exists pg_temp.tmp_issue97_point_corroboration;
insert into tmp_issue97_mapping_wave_build_results values
  (4,'GUE',public.brinesearch_issue97_rebuild_county_graph('OH','GUE'));
drop table if exists pg_temp.tmp_issue97_point_corroboration;
insert into tmp_issue97_mapping_wave_build_results values
  (5,'HAS',public.brinesearch_issue97_rebuild_county_graph('OH','HAS'));
drop table if exists pg_temp.tmp_issue97_point_corroboration;
insert into tmp_issue97_mapping_wave_build_results values
  (6,'JEF',public.brinesearch_issue97_rebuild_county_graph('OH','JEF'));
drop table if exists pg_temp.tmp_issue97_point_corroboration;
insert into tmp_issue97_mapping_wave_build_results values
  (7,'MOE',public.brinesearch_issue97_rebuild_county_graph('OH','MOE'));
drop table if exists pg_temp.tmp_issue97_point_corroboration;
insert into tmp_issue97_mapping_wave_build_results values
  (8,'NOB',public.brinesearch_issue97_rebuild_county_graph('OH','NOB'));

create temporary table tmp_issue97_mapping_wave_new_builds on commit drop as
select build.*
from tmp_issue97_mapping_wave_build_results result
join public.brinesearch_road_graph_builds build
  on build.id=(result.result->>'build_id')::uuid
 and build.state_code='OH'
 and build.county_code=result.county_code;

create temporary table
tmp_issue97_mapping_wave_machine_scope_after_build
on commit drop
as
select
  identity.id as identity_id,
  identity.county_code,
  identity.source_identity_key,
  identity.road_class,
  identity.route_system,
  identity.route_number,
  identity.route_suffix,
  identity.route_fraction,
  identity.route_extension,
  verified.road_id as effective_road_id,
  verified.mapping_status,
  verified.mapping_method,
  verified.evidence as mapping_evidence,
  case
    when verified.evidence->>'exact_candidate_count' ~ '^[0-9]+$'
      then (verified.evidence->>'exact_candidate_count')::integer
  end as exact_candidate_count,
  case
    when verified.evidence->>'ambiguity_held' in ('true','false')
      then (verified.evidence->>'ambiguity_held')::boolean
  end as ambiguity_flag,
  verified.evidence->>'refresh_scope' as refresh_scope,
  case when verified.id is null then null else
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'designation_source',verified.evidence->>'designation_source',
      'road_source_record_id',verified.evidence->>'road_source_record_id',
      'migration',verified.evidence->>'migration',
      'evidence_basis',verified.evidence->>'evidence_basis',
      'exact_method',verified.evidence->>'exact_method'
    ))
  end as evidence_source
from public.brinesearch_authoritative_road_identities identity
join tmp_issue97_mapping_wave_active_before county
  on county.state_code='OH'
 and county.county_code=identity.county_code
left join public.brinesearch_road_identity_mappings verified
  on verified.identity_id=identity.id
 and verified.mapping_status='verified'
where identity.active
  and identity.state_code='OH'
order by identity.id;

create temporary table
tmp_issue97_mapping_wave_machine_mappings_after_build
on commit drop
as
select
  scope.identity_id,
  scope.county_code,
  scope.source_identity_key,
  coalesce(machine.mapping_state,'[]'::jsonb) as mapping_state
from tmp_issue97_mapping_wave_machine_scope_after_build scope
left join lateral (
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'road_id',mapping.road_id,
      'mapping_status',mapping.mapping_status,
      'mapping_method',mapping.mapping_method,
      'exact_candidate_count',case
        when mapping.evidence->>'exact_candidate_count' ~ '^[0-9]+$'
          then (mapping.evidence->>'exact_candidate_count')::integer
      end,
      'ambiguity_flag',case
        when mapping.evidence->>'ambiguity_held' in ('true','false')
          then (mapping.evidence->>'ambiguity_held')::boolean
      end,
      'refresh_scope',mapping.evidence->>'refresh_scope',
      'evidence_source',pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
          'designation_source',mapping.evidence->>'designation_source',
          'road_source_record_id',mapping.evidence->>'road_source_record_id',
          'migration',mapping.evidence->>'migration',
          'evidence_basis',mapping.evidence->>'evidence_basis',
          'exact_method',mapping.evidence->>'exact_method'
        )
      )
    ) order by mapping.road_id,mapping.mapping_status,mapping.mapping_method
  ) as mapping_state
  from public.brinesearch_road_identity_mappings mapping
  where mapping.identity_id=scope.identity_id
    and mapping.mapping_method in (
      'exact_source_record_id','exact_route_designation'
    )
    and mapping.mapping_status in ('verified','candidate')
) machine on true
order by scope.identity_id;

create temporary table
tmp_issue97_mapping_wave_changed_machine_mappings
on commit drop
as
select
  coalesce(prior.identity_id,live.identity_id) as identity_id,
  coalesce(live.county_code,prior.county_code) as county_code,
  coalesce(live.source_identity_key,prior.source_identity_key)
    as source_identity_key,
  coalesce(prior.mapping_state,'[]'::jsonb) as prior_mapping_state,
  coalesce(live.mapping_state,'[]'::jsonb) as final_mapping_state
from tmp_issue97_mapping_wave_machine_mappings_before_build prior
full join tmp_issue97_mapping_wave_machine_mappings_after_build live
  using(identity_id)
where coalesce(prior.mapping_state,'[]'::jsonb)
      is distinct from coalesce(live.mapping_state,'[]'::jsonb)
order by county_code,identity_id;

create temporary table
tmp_issue97_mapping_wave_post_machine_candidates
on commit drop
as
with raw as (
  select
    mapping.identity_id,
    mapping.mapping_status,
    mapping.mapping_method,
    mapping.evidence,
    case
      when mapping.evidence->>'exact_candidate_count' ~ '^[0-9]+$'
        then (mapping.evidence->>'exact_candidate_count')::integer
    end as exact_candidate_count,
    case
      when mapping.evidence->>'ambiguity_held' in ('true','false')
        then (mapping.evidence->>'ambiguity_held')::boolean
    end as ambiguity_flag,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'designation_source',mapping.evidence->>'designation_source',
      'road_source_record_id',mapping.evidence->>'road_source_record_id',
      'migration',mapping.evidence->>'migration',
      'evidence_basis',mapping.evidence->>'evidence_basis',
      'exact_method',mapping.evidence->>'exact_method'
    )) as evidence_source
  from public.brinesearch_road_identity_mappings mapping
  join tmp_issue97_mapping_wave_machine_scope_after_build identity
    on identity.identity_id=mapping.identity_id
  where mapping.mapping_method in (
    'exact_source_record_id','exact_route_designation'
  )
    and mapping.mapping_status in ('verified','candidate')
), sources as (
  select distinct identity_id,evidence_source
  from raw
)
select
  raw.identity_id,
  count(*)::integer as active_machine_mapping_rows,
  max(raw.exact_candidate_count) as exact_candidate_count,
  pg_catalog.bool_or(raw.ambiguity_flag) as ambiguity_flag,
  min(raw.evidence->>'refresh_scope') as refresh_scope,
  pg_catalog.array_agg(
    distinct raw.mapping_status order by raw.mapping_status
  ) as mapping_statuses,
  pg_catalog.array_agg(
    distinct raw.mapping_method order by raw.mapping_method
  ) as mapping_methods,
  (
    select pg_catalog.jsonb_agg(
      source.evidence_source order by source.evidence_source::text
    )
    from sources source
    where source.identity_id=raw.identity_id
  ) as evidence_sources
from raw
group by raw.identity_id;

create temporary table
tmp_issue97_mapping_wave_machine_mapping_transitions
on commit drop
as
with paired as (
  select
    coalesce(prior.identity_id,live.identity_id) as identity_id,
    coalesce(live.county_code,prior.county_code) as county_code,
    coalesce(live.source_identity_key,prior.source_identity_key)
      as source_identity_key,
    coalesce(live.road_class,prior.road_class) as road_class,
    coalesce(live.route_system,prior.route_system) as route_system,
    coalesce(live.route_number,prior.route_number) as route_number,
    coalesce(live.route_suffix,prior.route_suffix) as route_suffix,
    coalesce(live.route_fraction,prior.route_fraction) as route_fraction,
    coalesce(live.route_extension,prior.route_extension) as route_extension,
    prior.effective_road_id as prior_road_id,
    live.effective_road_id as new_road_id,
    prior.mapping_status as prior_mapping_status,
    live.mapping_status as new_mapping_status,
    prior.mapping_method as prior_mapping_method,
    live.mapping_method as new_mapping_method,
    prior.exact_candidate_count as prior_exact_candidate_count,
    live.exact_candidate_count as new_verified_exact_candidate_count,
    prior.ambiguity_flag as prior_ambiguity_flag,
    live.ambiguity_flag as new_verified_ambiguity_flag,
    prior.refresh_scope as prior_refresh_scope,
    live.refresh_scope as new_verified_refresh_scope,
    prior.evidence_source as prior_evidence_source,
    live.evidence_source as new_verified_evidence_source
  from tmp_issue97_mapping_wave_machine_scope_before_build prior
  full join tmp_issue97_mapping_wave_machine_scope_after_build live
    using(identity_id)
), changed as (
  select paired.*
  from paired
  where (
    paired.prior_road_id,
    paired.prior_mapping_status,
    paired.prior_mapping_method,
    paired.prior_exact_candidate_count,
    paired.prior_ambiguity_flag,
    paired.prior_refresh_scope,
    paired.prior_evidence_source
  ) is distinct from (
    paired.new_road_id,
    paired.new_mapping_status,
    paired.new_mapping_method,
    paired.new_verified_exact_candidate_count,
    paired.new_verified_ambiguity_flag,
    paired.new_verified_refresh_scope,
    paired.new_verified_evidence_source
  )
)
select
  changed.county_code,
  changed.identity_id,
  changed.source_identity_key,
  changed.road_class,
  changed.route_system,
  changed.route_number,
  changed.route_suffix,
  changed.route_fraction,
  changed.route_extension,
  changed.prior_road_id,
  changed.new_road_id,
  changed.prior_mapping_status,
  changed.new_mapping_status,
  changed.prior_mapping_method,
  changed.new_mapping_method,
  coalesce(
    changed.new_verified_exact_candidate_count,
    candidates.exact_candidate_count,
    candidates.active_machine_mapping_rows,
    0
  )::integer as exact_candidate_count,
  coalesce(
    changed.new_verified_ambiguity_flag,
    candidates.ambiguity_flag,
    candidates.active_machine_mapping_rows>1,
    false
  ) as ambiguity_flag,
  coalesce(
    changed.new_verified_refresh_scope,
    candidates.refresh_scope,
    changed.prior_refresh_scope
  ) as refresh_scope,
  coalesce(
    changed.new_verified_evidence_source,
    case when candidates.evidence_sources is null then null
      else pg_catalog.jsonb_build_object(
        'candidate_evidence_sources',candidates.evidence_sources
      )
    end,
    changed.prior_evidence_source
  ) as designation_evidence_source,
  candidates.mapping_statuses as post_machine_mapping_statuses,
  candidates.mapping_methods as post_machine_mapping_methods,
  candidates.active_machine_mapping_rows,
  changed.prior_road_id is distinct from changed.new_road_id
    as verified_road_resolution_changed,
  exists(
    select 1
    from tmp_issue97_frozen_mapping_targets target
    where target.identity_id=changed.identity_id
  ) as identity_is_among_reviewed_46,
  changed.prior_road_id is not null and exists(
    select 1
    from tmp_issue97_frozen_mapping_targets target
    where target.road_id=changed.prior_road_id
  ) as prior_road_is_among_reviewed_37,
  changed.new_road_id is not null and exists(
    select 1
    from tmp_issue97_frozen_mapping_targets target
    where target.road_id=changed.new_road_id
  ) as new_road_is_among_reviewed_37,
  coalesce(old_occurrences.occurrence_count,0)::bigint
    as old_active_graph_membership_occurrence_count,
  case
    when family.basis_count=0 then 'not_in_frozen_37'
    when family.basis_count=1 then family.evidence_basis
    else 'mixed'
  end as frozen_target_evidence_family,
  road.verification_status as new_road_verification_status,
  road.source_method as new_road_source_method,
  case
    when changed.prior_road_id is null
     and changed.new_road_id is not null
      then 'NULL_TO_NONNULL'
    when changed.prior_road_id is not null
     and changed.new_road_id is null
      then 'NONNULL_TO_NULL'
    when changed.prior_road_id is not null
     and changed.new_road_id is not null
     and changed.prior_road_id<>changed.new_road_id
      then 'NONNULL_TO_DIFFERENT_NONNULL'
    else 'UNCHANGED_OR_INVALID'
  end as transition_class
from changed
left join tmp_issue97_mapping_wave_post_machine_candidates candidates
  on candidates.identity_id=changed.identity_id
left join lateral (
  select count(*)::bigint as occurrence_count
  from tmp_issue97_mapping_wave_active_before build
  join public.brinesearch_road_junctions junction
    on junction.build_id=build.id
  join public.brinesearch_road_junction_memberships membership
    on membership.junction_id=junction.id
  where build.state_code='OH'
    and build.county_code=changed.county_code
    and membership.identity_id=changed.identity_id
) old_occurrences on true
left join public.brinesearch_roads road
  on road.id=changed.new_road_id
left join lateral (
  select
    count(distinct target.evidence_basis)::integer as basis_count,
    min(target.evidence_basis) as evidence_basis
  from tmp_issue97_frozen_mapping_targets target
  where target.road_id=changed.new_road_id
) family on true
order by changed.county_code,changed.identity_id,
  changed.prior_road_id nulls first,changed.new_road_id nulls first;

create temporary table
tmp_issue97_mapping_wave_expected_machine_mapping_transitions
on commit drop
as
select
  contract.county_code,
  contract.identity_id,
  contract.source_identity_key,
  identity.road_class,
  identity.route_system,
  identity.route_number,
  identity.route_suffix,
  identity.route_fraction,
  identity.route_extension,
  contract.prior_road_id,
  contract.road_id as new_road_id,
  contract.prior_mapping_status,
  contract.final_mapping_status as new_mapping_status,
  contract.prior_mapping_method,
  contract.final_mapping_method as new_mapping_method,
  contract.exact_candidate_count,
  contract.ambiguity_flag,
  contract.refresh_scope,
  contract.evidence_source as designation_evidence_source,
  array[contract.final_mapping_status]::text[]
    as post_machine_mapping_statuses,
  array[contract.final_mapping_method]::text[]
    as post_machine_mapping_methods,
  1::integer as active_machine_mapping_rows,
  contract.prior_road_id is distinct from contract.road_id
    as verified_road_resolution_changed,
  contract.reviewed_identity_46 as identity_is_among_reviewed_46,
  contract.prior_road_reviewed_37
    as prior_road_is_among_reviewed_37,
  contract.final_road_reviewed_37 as new_road_is_among_reviewed_37,
  contract.old_active_membership_occurrence_count
    as old_active_graph_membership_occurrence_count,
  case when contract.final_road_reviewed_37
    then 'exact_route_designation'
    else 'not_in_frozen_37'
  end as frozen_target_evidence_family,
  'verified'::text as new_road_verification_status,
  case when contract.final_road_reviewed_37
    then 'issue97_frozen_exact_mapping_wave'
    else 'issue97_harrison_exact_authoritative_identity_repair'
  end as new_road_source_method,
  contract.raw_transition_class as transition_class
from tmp_issue97_frozen_mapping_refresh_contract contract
join public.brinesearch_authoritative_road_identities identity
  on identity.id=contract.identity_id
order by contract.county_code,contract.identity_id,
  contract.prior_road_id nulls first,contract.road_id nulls first;

create temporary table
tmp_issue97_mapping_wave_refresh_contract_after_build
on commit drop
as
select
  contract.*,
  mapping.id as mapping_id,
  mapping.road_id as observed_mapping_road_id,
  mapping.mapping_status as observed_mapping_status,
  mapping.mapping_method as observed_mapping_method,
  mapping.evidence as observed_mapping_evidence,
  active_mappings.active_mapping_count,
  memberships.membership_count,
  memberships.exact_road_membership_count
from tmp_issue97_frozen_mapping_refresh_contract contract
left join public.brinesearch_road_identity_mappings mapping
  on mapping.identity_id=contract.identity_id
 and mapping.road_id=contract.road_id
 and mapping.mapping_status='verified'
left join lateral (
  select count(*)::bigint as active_mapping_count
  from public.brinesearch_road_identity_mappings active
  where active.identity_id=contract.identity_id
    and active.mapping_status in ('verified','candidate')
) active_mappings on true
left join lateral (
  select
    count(*)::bigint as membership_count,
    count(*) filter(
      where membership.road_id=contract.road_id
    )::bigint as exact_road_membership_count
  from tmp_issue97_mapping_wave_new_builds build
  join public.brinesearch_road_junctions junction
    on junction.build_id=build.id
  join public.brinesearch_road_junction_memberships membership
    on membership.junction_id=junction.id
  where build.state_code='OH'
    and build.county_code=contract.county_code
    and membership.identity_id=contract.identity_id
) memberships on true
order by contract.county_code,contract.identity_id,contract.road_id;

do $issue97_frozen_mapping_refresh_expansion_google_queue_assertion$
declare
  v_queue_count bigint;
  v_queue_pad_digest text;
  v_queue_sample jsonb := '[]'::jsonb;
begin
  select count(*),
    pg_catalog.md5(pg_catalog.string_agg(queue.pad_id::text,'|' order by queue.pad_id)),
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'pad_id',queue.pad_id,
          'reason',queue.reason
        ) order by queue.pad_id
      ),
      '[]'::jsonb
    )
  into v_queue_count,v_queue_pad_digest,v_queue_sample
  from private_verification.brinesearch_google_route_refresh_queue_issue97 queue;

  if v_queue_count<>9
     or v_queue_pad_digest<>'450948793c57a9a1535139fac4974792'
     or exists(
       select 1
       from tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected
       full join private_verification.brinesearch_google_route_refresh_queue_issue97 queue
         on queue.pad_id=expected.pad_id
       where expected.pad_id is null
          or queue.pad_id is null
          or queue.reason is distinct from 'road_identity_mapping_changed'
     )
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0
     or public.brinesearch_issue97_cutover_active()
  then
    raise exception using
      message=
        'Issue #97 reviewed mapping-refresh Google queue contract drifted',
      detail=pg_catalog.jsonb_build_object(
        'expected_queue_count',9,
        'observed_queue_count',v_queue_count,
        'expected_queue_pad_digest','450948793c57a9a1535139fac4974792',
        'observed_queue_pad_digest',v_queue_pad_digest,
        'queue_sample',v_queue_sample,
        'public_google_route_count',
          (select count(*) from public.brinesearch_driver_google_routes_public),
        'cutover_active',public.brinesearch_issue97_cutover_active()
      )::text;
  end if;
end
$issue97_frozen_mapping_refresh_expansion_google_queue_assertion$;

\echo ISSUE97_REVIEWED_REFRESH_GOOGLE_QUEUE|9|450948793c57a9a1535139fac4974792

-- Exercise exactly the pending commit-time events while the outer rehearsal
-- remains rollback-only. Cutover is already proven OFF and public projection
-- remains fail-closed below.
set constraints
  private_verification.brinesearch_issue97_google_route_refresh_deferred
  immediate;
set constraints
  private_verification.brinesearch_issue97_google_route_refresh_deferred
  deferred;

do $issue97_frozen_mapping_refresh_expansion_google_postprocess_assertion$
declare
  v_postprocess_diff_count bigint := 0;
  v_postprocess_diff_sample jsonb := '[]'::jsonb;
begin
  with differences as (
    select
      expected.pad_id,
      expected.expected_evidence_identity_id,
      expected.expected_evidence_road_id,
      expected.expected_receipt_route_revision,
      pg_catalog.to_jsonb(receipt) as actual_receipt,
      pg_catalog.jsonb_build_object(
        'status',pad.brinesearch_google_route_status_issue97,
        'revision',pad.brinesearch_google_route_revision_issue97,
        'structured_route_revision',pad.structured_route_revision,
        'road_sequence_status',pad.road_sequence_status
      ) as actual_pad_state
    from tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected
    left join private_verification.brinesearch_google_route_receipts_issue97 receipt
      on receipt.pad_id=expected.pad_id
    left join public.pads pad on pad.id=expected.pad_id
    where (
      pg_catalog.to_jsonb(receipt)-'generated_at'-'updated_at'-'evidence'
    ) is distinct from pg_catalog.jsonb_build_object(
      'pad_id',expected.pad_id,
      'route_revision',expected.expected_receipt_route_revision,
      'status','stale',
      'hold_reason','road_identity_mapping_changed',
      'manifest_version','issue97-google-v1',
      'manifest_digest',null,
      'dependency_digest',null,
      'manifest',pg_catalog.jsonb_build_object(
        'manifest_version','issue97-google-v1',
        'route_ready',false,
        'status','stale',
        'pad_id',expected.pad_id,
        'route_revision',expected.expected_receipt_route_revision
      )
    )
       or receipt.generated_at is distinct from
          pg_catalog.transaction_timestamp()
       or receipt.updated_at is distinct from
          pg_catalog.transaction_timestamp()
       -- The receipt evidence names ONE mapping row among several that can
       -- each legitimately invalidate this pad. Which one the deferred
       -- processor records depends on how many counties the wave rebuilt, so
       -- it is a witness, not a fixed value, and pinning it fails closed for
       -- the wrong reason. Assert the invariant the witness must satisfy,
       -- using the same structural form the migration already applies to the
       -- reviewed target pads: exactly an identity/road pair, that pair is a
       -- live verified machine-owned mapping, and it genuinely binds to this
       -- pad. issue97-google-evidence-witness-invariant
       or receipt.evidence is null
       or (
            select count(*)
            from pg_catalog.jsonb_object_keys(receipt.evidence)
          )<>2
       or receipt.evidence->>'identity_id' is null
       or receipt.evidence->>'road_id' is null
       or not exists(
            select 1
            from public.brinesearch_road_identity_mappings mapping
            where mapping.identity_id::text=receipt.evidence->>'identity_id'
              and mapping.road_id::text=receipt.evidence->>'road_id'
              and mapping.mapping_status='verified'
              and mapping.mapping_method in (
                'exact_source_record_id','exact_route_designation'
              )
          )
       or not (
            exists(
              select 1
              from public.brinesearch_pad_roads step
              where step.pad_id=expected.pad_id
                and step.road_id::text=receipt.evidence->>'road_id'
            )
            or exists(
              select 1
              from pg_catalog.jsonb_array_elements(
                coalesce(
                  expected.pre_receipt_row->'manifest'->'points','[]'::jsonb
                )
              ) point
              where point->>'identity_id'=receipt.evidence->>'identity_id'
                 or point->>'road_id'=receipt.evidence->>'road_id'
            )
          )
       or pg_catalog.jsonb_build_object(
            'status',pad.brinesearch_google_route_status_issue97,
            'revision',pad.brinesearch_google_route_revision_issue97,
            'structured_route_revision',pad.structured_route_revision,
            'road_sequence_status',pad.road_sequence_status
          ) is distinct from (
            expected.pre_pad_state||pg_catalog.jsonb_build_object(
              'status','stale',
              'revision',expected.expected_receipt_route_revision
            )
          )
  )
  select
    coalesce(max(sample.total_count),0)::bigint,
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(sample)-'total_count'
        order by sample.pad_id
      ),
      '[]'::jsonb
    )
  into v_postprocess_diff_count,v_postprocess_diff_sample
  from (
    select differences.*,count(*) over() as total_count
    from differences
    order by pad_id
    limit 50
  ) sample;

  if v_postprocess_diff_count<>0
     or exists(
       select 1
       from private_verification.brinesearch_google_route_refresh_queue_issue97
     )
     or (select count(*)
         from public.brinesearch_driver_google_routes_public)<>0
     or public.brinesearch_issue97_cutover_active()
  then
    raise exception using
      message=
        'Issue #97 reviewed mapping-refresh Google postprocessor contract drifted',
      detail=pg_catalog.jsonb_build_object(
        'postprocess_diff_count',v_postprocess_diff_count,
        'postprocess_diff_sample',v_postprocess_diff_sample,
        'google_refresh_queue_count',
          (select count(*)
           from private_verification.brinesearch_google_route_refresh_queue_issue97),
        'public_google_route_count',
          (select count(*)
           from public.brinesearch_driver_google_routes_public),
        'cutover_active',public.brinesearch_issue97_cutover_active()
      )::text;
  end if;
end
$issue97_frozen_mapping_refresh_expansion_google_postprocess_assertion$;

\echo ISSUE97_REVIEWED_REFRESH_GOOGLE_POSTPROCESS_PASS|9|5a75e5c4c34805b7dc2fdf8d0534a4f6

select
  'ISSUE97_REVIEWED_REFRESH_GOOGLE_POSTPROCESS|'||
  pg_catalog.jsonb_build_object(
    'queue_count',
      (select count(*)
       from private_verification.brinesearch_google_route_refresh_queue_issue97),
    'public_google_route_count',
      (select count(*) from public.brinesearch_driver_google_routes_public),
    'cutover_active',public.brinesearch_issue97_cutover_active(),
    'pads',
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'pad_id',expected.pad_id,
            'pre_receipt',expected.pre_receipt_row,
            'post_receipt',pg_catalog.to_jsonb(receipt),
            'pre_pad_state',expected.pre_pad_state,
            'post_pad_state',pg_catalog.jsonb_build_object(
              'status',pad.brinesearch_google_route_status_issue97,
              'revision',pad.brinesearch_google_route_revision_issue97,
              'structured_route_revision',pad.structured_route_revision,
              'road_sequence_status',pad.road_sequence_status
            )
          ) order by expected.pad_id
        )
        from tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected
        join public.pads pad on pad.id=expected.pad_id
        left join private_verification.brinesearch_google_route_receipts_issue97 receipt
          on receipt.pad_id=expected.pad_id
      )
  )::text;

do $issue97_frozen_mapping_rebuild_assertions$
declare
  v_expected_target_membership_count constant bigint := 1565;
  v_observed_target_membership_count bigint;
  v_road_id_mismatch_count bigint;
  v_count_diff_sample jsonb := '[]'::jsonb;
  v_road_id_mismatch_sample jsonb := '[]'::jsonb;
  v_junction_semantic_diff_count bigint := 0;
  v_membership_semantic_diff_count bigint := 0;
  v_anchor_semantic_diff_count bigint := 0;
  v_non_target_membership_diff_count bigint := 0;
  v_junction_semantic_diff_sample jsonb := '[]'::jsonb;
  v_membership_semantic_diff_sample jsonb := '[]'::jsonb;
  v_anchor_semantic_diff_sample jsonb := '[]'::jsonb;
  v_non_target_membership_diff_sample jsonb := '[]'::jsonb;
  v_google_diff_count bigint := 0;
  v_google_diff_sample jsonb := '[]'::jsonb;
begin
  if (
       select count(*)
       from tmp_issue97_mapping_wave_reviewed_mappings_before_build
     )<>46
     or (
       select count(*)
       from public.brinesearch_road_identity_mappings mapping
       join tmp_issue97_frozen_mapping_targets target
         on target.identity_id=mapping.identity_id
        and target.road_id=mapping.road_id
     )<>46
     or exists(
       select 1
       from tmp_issue97_mapping_wave_reviewed_mappings_before_build snapshot
       full join (
         select mapping.*
         from public.brinesearch_road_identity_mappings mapping
         join tmp_issue97_frozen_mapping_targets target
           on target.identity_id=mapping.identity_id
          and target.road_id=mapping.road_id
       ) live using(id)
       where pg_catalog.to_jsonb(live)
             is distinct from pg_catalog.to_jsonb(snapshot)
     )
  then
    raise exception
      'Issue #97 reviewed frozen mappings changed during graph rebuilds';
  end if;

  if (select count(*)
      from tmp_issue97_frozen_mapping_refresh_contract)<>42
     or (select count(*)
         from tmp_issue97_mapping_wave_changed_machine_mappings)<>42
     or exists(
       select 1
       from tmp_issue97_mapping_wave_changed_machine_mappings changed
       full join tmp_issue97_frozen_mapping_refresh_contract contract
         using(identity_id)
       where changed.identity_id is null
          or contract.identity_id is null
          or changed.county_code is distinct from contract.county_code
          or changed.source_identity_key is distinct from
             contract.source_identity_key
     )
     or (select count(*)
         from tmp_issue97_mapping_wave_machine_mapping_transitions)<>42
     or (select count(*)
         from tmp_issue97_mapping_wave_expected_machine_mapping_transitions)
        <>42
     or exists(
       select 1
       from tmp_issue97_mapping_wave_machine_mapping_transitions actual
       full join
         tmp_issue97_mapping_wave_expected_machine_mapping_transitions expected
         using(identity_id)
       where pg_catalog.to_jsonb(actual)
             is distinct from pg_catalog.to_jsonb(expected)
     )
     or exists(
       select 1
       from tmp_issue97_mapping_wave_machine_mapping_transitions transition
       where transition.transition_class in (
               'NONNULL_TO_NULL','NONNULL_TO_DIFFERENT_NONNULL'
             )
          or transition.new_mapping_status is distinct from 'verified'
          or transition.exact_candidate_count is distinct from 1
          or transition.ambiguity_flag
          or transition.active_machine_mapping_rows is distinct from 1
          or transition.post_machine_mapping_statuses is distinct from
             array['verified']::text[]
          or transition.refresh_scope is distinct from
             'OH:'||transition.county_code
          or (
            transition.transition_class='NULL_TO_NONNULL'
            and transition.prior_road_id is not null
          )
          or (
            transition.transition_class='UNCHANGED_OR_INVALID'
            and not (
              transition.prior_road_id=transition.new_road_id
              and transition.prior_mapping_status='verified'
              and transition.new_mapping_status='verified'
              and transition.prior_mapping_method=
                  'exact_route_designation'
              and transition.new_mapping_method='exact_source_record_id'
            )
          )
     )
     or (select pg_catalog.md5(pg_catalog.string_agg(
           identity_id::text,',' order by identity_id
         ))
         from tmp_issue97_mapping_wave_machine_mapping_transitions)
        <>'043d969160dded7b9ff3526b6b09b752'
     or (select pg_catalog.md5(pg_catalog.string_agg(
           new_road_id::text,',' order by new_road_id
         ))
         from (
           select distinct new_road_id
           from tmp_issue97_mapping_wave_machine_mapping_transitions
         ) roads)
        <>'fd835556c06d4b067ca01ff8329a5d1c'
     or (select pg_catalog.md5(pg_catalog.string_agg(
           identity_id::text||'|'||coalesce(new_road_id::text,'<NULL>'),
           ',' order by identity_id,new_road_id
         ))
         from tmp_issue97_mapping_wave_machine_mapping_transitions)
        <>'cf20cef7b1f18ea57afbfee9a6f5202e'
     or (select pg_catalog.md5(pg_catalog.string_agg(
           pg_catalog.to_jsonb(transition)::text,
           '|' order by transition.county_code,transition.identity_id,
             transition.prior_road_id nulls first,
             transition.new_road_id nulls first
         ))
         from tmp_issue97_mapping_wave_machine_mapping_transitions transition)
        <>'0b89d8b7f7969a95b6d94f270cd81ccc'
     or (select count(*)
         from tmp_issue97_mapping_wave_refresh_contract_after_build)<>42
     or exists(
       select 1
       from tmp_issue97_mapping_wave_refresh_contract_after_build snapshot
       join public.brinesearch_authoritative_road_identities identity
         on identity.id=snapshot.identity_id
       where snapshot.mapping_id is null
          or snapshot.active_mapping_count<>1
          or snapshot.observed_mapping_road_id is distinct from snapshot.road_id
          or snapshot.observed_mapping_status is distinct from
             snapshot.final_mapping_status
          or snapshot.observed_mapping_method is distinct from
             snapshot.final_mapping_method
          or snapshot.observed_mapping_evidence->>'source_identity_key'
               is distinct from snapshot.source_identity_key
          or snapshot.observed_mapping_evidence->>'refresh_scope'
               is distinct from snapshot.refresh_scope
          or (snapshot.observed_mapping_evidence->>'exact_candidate_count')
               ::integer is distinct from snapshot.exact_candidate_count
          or (snapshot.observed_mapping_evidence->>'ambiguity_held')
               ::boolean is distinct from snapshot.ambiguity_flag
          or (
            snapshot.final_mapping_method='exact_route_designation'
            and (
              snapshot.observed_mapping_evidence->>'designation_source'
                is distinct from
                snapshot.evidence_source->>'designation_source'
              or snapshot.observed_mapping_evidence->>'designation_source'
                is distinct from 'identity_exact_components'
              or snapshot.observed_mapping_evidence->>'route_class'
                is distinct from identity.road_class
              or snapshot.observed_mapping_evidence->>'route_number'
                is distinct from identity.route_number
              or snapshot.observed_mapping_evidence->>'route_suffix'
                is distinct from identity.route_suffix
              or snapshot.observed_mapping_evidence->>'route_fraction'
                is distinct from identity.route_fraction
              or snapshot.observed_mapping_evidence->>'route_extension'
                is distinct from identity.route_extension
              or snapshot.observed_mapping_evidence->>'designation_not_name'
                is distinct from 'true'
              or snapshot.observed_mapping_evidence
                   ->>'no_fuzzy_or_spatial_matching' is distinct from 'true'
            )
          )
          or (
            snapshot.final_mapping_method='exact_source_record_id'
            and (
              snapshot.observed_mapping_evidence->>'road_source_record_id'
                is distinct from
                snapshot.evidence_source->>'road_source_record_id'
              or snapshot.observed_mapping_evidence
                   ->>'state_and_jurisdiction_checked' is distinct from 'true'
              or snapshot.observed_mapping_evidence->>'no_name_matching'
                   is distinct from 'true'
            )
          )
          or snapshot.membership_count is distinct from
             snapshot.old_active_membership_occurrence_count
          or snapshot.exact_road_membership_count is distinct from
             snapshot.old_active_membership_occurrence_count
     )
     or (select sum(membership_count)
         from tmp_issue97_mapping_wave_refresh_contract_after_build)<>1126
     or (select sum(membership_count)
         from tmp_issue97_mapping_wave_refresh_contract_after_build
         where raw_transition_class='NULL_TO_NONNULL')<>1066
     or (select sum(membership_count)
         from tmp_issue97_mapping_wave_refresh_contract_after_build
         where raw_transition_class='UNCHANGED_OR_INVALID')<>60
  then
    raise exception
      'Issue #97 complete Ohio machine mapping-refresh contract changed during graph rebuilds';
  end if;

  if (select count(*) from tmp_issue97_mapping_wave_build_results)<>8
     or (select pg_catalog.array_agg(county_code order by build_order) from tmp_issue97_mapping_wave_build_results)
       is distinct from array['BEL','CAR','COL','GUE','HAS','JEF','MOE','NOB']::text[]
     or (select count(*) from tmp_issue97_mapping_wave_new_builds)<>8
     or exists(select 1 from tmp_issue97_mapping_wave_build_results result
       where result.result->>'status'<>'validated'
         or coalesce((result.result->>'active')::boolean,true))
     or exists(select 1 from public.brinesearch_road_graph_builds build
       where not exists(select 1 from tmp_issue97_mapping_wave_existing_builds old where old.id=build.id)
         and not exists(select 1 from tmp_issue97_mapping_wave_new_builds pinned where pinned.id=build.id))
     or (select pg_catalog.array_agg(county_code order by county_code) from tmp_issue97_mapping_wave_new_builds)
       is distinct from array['BEL','CAR','COL','GUE','HAS','JEF','MOE','NOB']::text[]
     or exists(select 1 from tmp_issue97_mapping_wave_new_builds build
       where build.status<>'validated' or build.activated_at is not null
         or build.details->>'release_generation_key'<>'issue97-release-20260815-r2'
         or build.details->>'release_builder_md5'<>'06705f5b35a6d37151bb2c0dc5ade9bd')
     -- Exact identity-to-road mappings are part of the builder's registry_digest.
     -- The frozen 46-mapping install must therefore change mapping_snapshot_digest,
     -- registry_digest, source_revision_digest, and graph_digest. The authoritative
     -- source_run_vector and source_vector_version must remain unchanged, as must
     -- source/topology cardinalities and all semantic topology except the reviewed
     -- membership road_id values.
     or exists(select 1 from tmp_issue97_mapping_wave_new_builds build
       join tmp_issue97_mapping_wave_active_before prior using(state_code,county_code)
       where build.graph_digest
               is not distinct from prior.graph_digest

         or build.details->>'mapping_snapshot_digest'
               is not distinct from
               prior.details->>'mapping_snapshot_digest'

         or build.details->>'registry_digest'
               is not distinct from
               prior.details->>'registry_digest'

         or build.source_revision_digest
               is not distinct from
               prior.source_revision_digest

         or build.details->'source_run_vector'
               is distinct from
               prior.details->'source_run_vector'

         or build.details->>'source_vector_version'
               is distinct from
               prior.details->>'source_vector_version'

         or build.source_segment_count
               is distinct from prior.source_segment_count

         or build.identity_count
               is distinct from prior.identity_count

         or build.point_junction_count
               is distinct from prior.point_junction_count

         or build.shared_segment_count
               is distinct from prior.shared_segment_count

         or build.membership_count
               is distinct from prior.membership_count)
     or exists(select 1 from tmp_issue97_mapping_wave_active_before prior
        join public.brinesearch_road_graph_builds current on current.id=prior.id
        where pg_catalog.to_jsonb(current) is distinct from pg_catalog.to_jsonb(prior))
     or exists(select 1 from tmp_issue97_mapping_wave_active_children_before prior
        join public.brinesearch_road_graph_builds build on build.id=prior.build_id
        where prior.junctions<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(junction)::text,'|' order by junction.id),''))
          from public.brinesearch_road_junctions junction where junction.build_id=build.id)
          or prior.memberships<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(membership)::text,'|' order by membership.id),''))
            from public.brinesearch_road_junction_memberships membership
            join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
            where junction.build_id=build.id)
          or prior.anchors<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(anchor)::text,'|' order by anchor.id),''))
            from public.brinesearch_road_junction_anchors anchor
            join public.brinesearch_road_junctions junction on junction.id=anchor.junction_id
            where junction.build_id=build.id))
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
  then
    raise exception 'Issue #97 exact eight-county dark rebuild contract failed';
  end if;

  select count(*)
  into v_observed_target_membership_count
  from public.brinesearch_road_junction_memberships membership
  join public.brinesearch_road_junctions junction
    on junction.id=membership.junction_id
  join tmp_issue97_mapping_wave_new_builds build
    on build.id=junction.build_id
  join tmp_issue97_frozen_mapping_targets target
    on target.identity_id=membership.identity_id;

  select count(*)
  into v_road_id_mismatch_count
  from public.brinesearch_road_junction_memberships membership
  join public.brinesearch_road_junctions junction
    on junction.id=membership.junction_id
  join tmp_issue97_mapping_wave_new_builds build
    on build.id=junction.build_id
  join tmp_issue97_frozen_mapping_targets target
    on target.identity_id=membership.identity_id
  where membership.road_id is distinct from target.road_id;

  with expected as (
    select
      prior.county_code,
      membership.identity_id,
      count(*)::bigint as membership_count
    from tmp_issue97_mapping_wave_active_before prior
    join public.brinesearch_road_junctions junction
      on junction.build_id=prior.id
    join public.brinesearch_road_junction_memberships membership
      on membership.junction_id=junction.id
    join tmp_issue97_frozen_mapping_targets target
      on target.identity_id=membership.identity_id
    group by
      prior.county_code,
      membership.identity_id
  ),
  observed as (
    select
      build.county_code,
      membership.identity_id,
      count(*)::bigint as membership_count
    from tmp_issue97_mapping_wave_new_builds build
    join public.brinesearch_road_junctions junction
      on junction.build_id=build.id
    join public.brinesearch_road_junction_memberships membership
      on membership.junction_id=junction.id
    join tmp_issue97_frozen_mapping_targets target
      on target.identity_id=membership.identity_id
    group by
      build.county_code,
      membership.identity_id
  ),
  differences as (
    select
      coalesce(expected.county_code,observed.county_code)
        as county_code,
      coalesce(expected.identity_id,observed.identity_id)
        as identity_id,
      coalesce(expected.membership_count,0)
        as expected_count,
      coalesce(observed.membership_count,0)
        as observed_count
    from expected
    full join observed
      using(county_code,identity_id)
    where expected.membership_count
          is distinct from observed.membership_count
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(sample)
      order by sample.county_code,sample.identity_id
    ),
    '[]'::jsonb
  )
  into v_count_diff_sample
  from (
    select *
    from differences
    order by county_code,identity_id
    limit 50
  ) sample;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(sample)
      order by
        sample.county_code,
        sample.stable_junction_key,
        sample.identity_id
    ),
    '[]'::jsonb
  )
  into v_road_id_mismatch_sample
  from (
    select
      build.county_code,
      junction.stable_junction_key,
      membership.identity_id,
      target.road_id as expected_road_id,
      membership.road_id as actual_road_id
    from tmp_issue97_mapping_wave_new_builds build
    join public.brinesearch_road_junctions junction
      on junction.build_id=build.id
    join public.brinesearch_road_junction_memberships membership
      on membership.junction_id=junction.id
    join tmp_issue97_frozen_mapping_targets target
      on target.identity_id=membership.identity_id
    where membership.road_id is distinct from target.road_id
    order by
      build.county_code,
      junction.stable_junction_key,
      membership.identity_id
    limit 50
  ) sample;

  if v_observed_target_membership_count
     <>v_expected_target_membership_count
  then
    raise exception using
      message=
        'Issue #97 rebuilt graph target-membership count drifted',
      detail=pg_catalog.jsonb_build_object(
        'expected_target_membership_count',
          v_expected_target_membership_count,
        'observed_target_membership_count',
          v_observed_target_membership_count,
        'road_id_mismatch_count',
          v_road_id_mismatch_count,
        'count_diff_sample',
          v_count_diff_sample
      )::text;
  end if;

  if v_road_id_mismatch_count<>0
  then
    raise exception using
      message=
        'Issue #97 rebuilt graph target-membership road IDs mismatched',
      detail=pg_catalog.jsonb_build_object(
        'expected_target_membership_count',
          v_expected_target_membership_count,
        'observed_target_membership_count',
          v_observed_target_membership_count,
        'road_id_mismatch_count',
          v_road_id_mismatch_count,
        'road_id_mismatch_sample',
          v_road_id_mismatch_sample
      )::text;
  end if;

  -- Rebuild output may use different row UUIDs and timestamps. Compare each
  -- semantic topology family independently so a rollback can report the exact
  -- changed rows. The only permitted membership change is the exact target
  -- identity -> road_id value.
  if exists(
       select 1 from tmp_issue97_mapping_wave_active_before prior
       join tmp_issue97_mapping_wave_new_builds build using(state_code,county_code)
       where (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
           junction.stable_junction_key||':'||(pg_catalog.to_jsonb(junction)
             -'id'-'build_id'-'graph_digest'-'created_at'-'updated_at')::text,
           '|' order by junction.stable_junction_key),''))
         from public.brinesearch_road_junctions junction where junction.build_id=prior.id)
       <>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
           junction.stable_junction_key||':'||(pg_catalog.to_jsonb(junction)
             -'id'-'build_id'-'graph_digest'-'created_at'-'updated_at')::text,
           '|' order by junction.stable_junction_key),''))
          from public.brinesearch_road_junctions junction where junction.build_id=build.id)
      )
  then
    with pairs as (
      select
        prior.county_code,
        prior.id as prior_build_id,
        build.id as new_build_id
      from tmp_issue97_mapping_wave_active_before prior
      join tmp_issue97_mapping_wave_new_builds build
        using(state_code,county_code)
    ),
    prior_rows as (
      select
        pairs.county_code,
        junction.stable_junction_key,
        true as row_present,
        pg_catalog.to_jsonb(junction)
          -'id'-'build_id'-'graph_digest'-'created_at'-'updated_at'
          as semantic_row
      from pairs
      join public.brinesearch_road_junctions junction
        on junction.build_id=pairs.prior_build_id
    ),
    new_rows as (
      select
        pairs.county_code,
        junction.stable_junction_key,
        true as row_present,
        pg_catalog.to_jsonb(junction)
          -'id'-'build_id'-'graph_digest'-'created_at'-'updated_at'
          as semantic_row
      from pairs
      join public.brinesearch_road_junctions junction
        on junction.build_id=pairs.new_build_id
    ),
    differences as (
      select
        coalesce(prior_rows.county_code,new_rows.county_code)
          as county_code,
        coalesce(
          prior_rows.stable_junction_key,
          new_rows.stable_junction_key
        ) as stable_junction_key,
        case
          when prior_rows.row_present is null then 'added'
          when new_rows.row_present is null then 'missing'
          else 'changed'
        end as difference_kind,
        prior_rows.semantic_row as prior_semantic,
        new_rows.semantic_row as new_semantic
      from prior_rows
      full join new_rows
        using(county_code,stable_junction_key)
      where prior_rows.semantic_row
            is distinct from new_rows.semantic_row
    )
    select
      (select count(*) from differences),
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(sample)
            order by sample.county_code,sample.stable_junction_key
          )
          from (
            select
              county_code,
              stable_junction_key,
              difference_kind,
              prior_semantic,
              new_semantic
            from differences
            order by county_code,stable_junction_key
            limit 50
          ) sample
        ),
        '[]'::jsonb
      )
    into
      v_junction_semantic_diff_count,
      v_junction_semantic_diff_sample;

    raise exception using
      message='Issue #97 rebuilt graph junction semantics changed',
      detail=pg_catalog.jsonb_build_object(
        'junction_semantic_diff_count',
          v_junction_semantic_diff_count,
        'junction_semantic_diff_sample',
          v_junction_semantic_diff_sample
      )::text;
  end if;

  if exists(
       select 1 from tmp_issue97_mapping_wave_active_before prior
       join tmp_issue97_mapping_wave_new_builds build using(state_code,county_code)
       where (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
           junction.stable_junction_key||':'||(pg_catalog.to_jsonb(membership)
             -'id'-'junction_id'-'road_id'-'created_at'-'updated_at')::text,
           '|' order by junction.stable_junction_key,
             (pg_catalog.to_jsonb(membership)-'id'-'junction_id'-'road_id'-'created_at'-'updated_at')::text),''))
         from public.brinesearch_road_junction_memberships membership
         join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
         where junction.build_id=prior.id)
       <>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
           junction.stable_junction_key||':'||(pg_catalog.to_jsonb(membership)
             -'id'-'junction_id'-'road_id'-'created_at'-'updated_at')::text,
           '|' order by junction.stable_junction_key,
             (pg_catalog.to_jsonb(membership)-'id'-'junction_id'-'road_id'-'created_at'-'updated_at')::text),''))
         from public.brinesearch_road_junction_memberships membership
         join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
         where junction.build_id=build.id)
     )
  then
    with pairs as (
      select
        prior.county_code,
        prior.id as prior_build_id,
        build.id as new_build_id
      from tmp_issue97_mapping_wave_active_before prior
      join tmp_issue97_mapping_wave_new_builds build
        using(state_code,county_code)
    ),
    prior_rows as (
      select
        pairs.county_code,
        junction.stable_junction_key,
        membership.identity_id,
        membership.membership_role,
        true as row_present,
        pg_catalog.to_jsonb(membership)
          -'id'-'junction_id'-'road_id'-'created_at'-'updated_at'
          as semantic_row
      from pairs
      join public.brinesearch_road_junctions junction
        on junction.build_id=pairs.prior_build_id
      join public.brinesearch_road_junction_memberships membership
        on membership.junction_id=junction.id
    ),
    new_rows as (
      select
        pairs.county_code,
        junction.stable_junction_key,
        membership.identity_id,
        membership.membership_role,
        true as row_present,
        pg_catalog.to_jsonb(membership)
          -'id'-'junction_id'-'road_id'-'created_at'-'updated_at'
          as semantic_row
      from pairs
      join public.brinesearch_road_junctions junction
        on junction.build_id=pairs.new_build_id
      join public.brinesearch_road_junction_memberships membership
        on membership.junction_id=junction.id
    ),
    differences as (
      select
        coalesce(prior_rows.county_code,new_rows.county_code)
          as county_code,
        coalesce(
          prior_rows.stable_junction_key,
          new_rows.stable_junction_key
        ) as stable_junction_key,
        coalesce(prior_rows.identity_id,new_rows.identity_id)
          as identity_id,
        coalesce(prior_rows.membership_role,new_rows.membership_role)
          as membership_role,
        exists(
          select 1
          from tmp_issue97_frozen_mapping_targets target
          where target.identity_id=coalesce(
            prior_rows.identity_id,
            new_rows.identity_id
          )
        ) as is_frozen_target,
        case
          when prior_rows.row_present is null then 'added'
          when new_rows.row_present is null then 'missing'
          else 'changed'
        end as difference_kind,
        prior_rows.semantic_row as prior_semantic,
        new_rows.semantic_row as new_semantic
      from prior_rows
      full join new_rows
        using(
          county_code,
          stable_junction_key,
          identity_id,
          membership_role
        )
      where prior_rows.semantic_row
            is distinct from new_rows.semantic_row
    )
    select
      (select count(*) from differences),
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(sample)
            order by
              sample.county_code,
              sample.stable_junction_key,
              sample.identity_id,
              sample.membership_role
          )
          from (
            select
              county_code,
              stable_junction_key,
              identity_id,
              membership_role,
              is_frozen_target,
              difference_kind,
              prior_semantic,
              new_semantic
            from differences
            order by
              county_code,
              stable_junction_key,
              identity_id,
              membership_role
            limit 50
          ) sample
        ),
        '[]'::jsonb
      )
    into
      v_membership_semantic_diff_count,
      v_membership_semantic_diff_sample;

    raise exception using
      message=
        'Issue #97 rebuilt graph membership semantics changed beyond reviewed road IDs',
      detail=pg_catalog.jsonb_build_object(
        'membership_semantic_diff_count',
          v_membership_semantic_diff_count,
        'membership_semantic_diff_sample',
          v_membership_semantic_diff_sample
      )::text;
  end if;

  if exists(
       select 1 from tmp_issue97_mapping_wave_active_before prior
       join tmp_issue97_mapping_wave_new_builds build using(state_code,county_code)
       where (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
           junction.stable_junction_key||':'||(pg_catalog.to_jsonb(anchor)
             -'id'-'junction_id'-'created_at'-'updated_at')::text,
           '|' order by junction.stable_junction_key,anchor.anchor_key),''))
         from public.brinesearch_road_junction_anchors anchor
         join public.brinesearch_road_junctions junction on junction.id=anchor.junction_id
         where junction.build_id=prior.id)
       <>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
           junction.stable_junction_key||':'||(pg_catalog.to_jsonb(anchor)
             -'id'-'junction_id'-'created_at'-'updated_at')::text,
           '|' order by junction.stable_junction_key,anchor.anchor_key),''))
         from public.brinesearch_road_junction_anchors anchor
         join public.brinesearch_road_junctions junction on junction.id=anchor.junction_id
         where junction.build_id=build.id)
     )
  then
    with pairs as (
      select
        prior.county_code,
        prior.id as prior_build_id,
        build.id as new_build_id
      from tmp_issue97_mapping_wave_active_before prior
      join tmp_issue97_mapping_wave_new_builds build
        using(state_code,county_code)
    ),
    prior_rows as (
      select
        pairs.county_code,
        junction.stable_junction_key,
        anchor.anchor_key,
        true as row_present,
        pg_catalog.to_jsonb(anchor)
          -'id'-'junction_id'-'created_at'-'updated_at'
          as semantic_row
      from pairs
      join public.brinesearch_road_junctions junction
        on junction.build_id=pairs.prior_build_id
      join public.brinesearch_road_junction_anchors anchor
        on anchor.junction_id=junction.id
    ),
    new_rows as (
      select
        pairs.county_code,
        junction.stable_junction_key,
        anchor.anchor_key,
        true as row_present,
        pg_catalog.to_jsonb(anchor)
          -'id'-'junction_id'-'created_at'-'updated_at'
          as semantic_row
      from pairs
      join public.brinesearch_road_junctions junction
        on junction.build_id=pairs.new_build_id
      join public.brinesearch_road_junction_anchors anchor
        on anchor.junction_id=junction.id
    ),
    differences as (
      select
        coalesce(prior_rows.county_code,new_rows.county_code)
          as county_code,
        coalesce(
          prior_rows.stable_junction_key,
          new_rows.stable_junction_key
        ) as stable_junction_key,
        coalesce(prior_rows.anchor_key,new_rows.anchor_key)
          as anchor_key,
        case
          when prior_rows.row_present is null then 'added'
          when new_rows.row_present is null then 'missing'
          else 'changed'
        end as difference_kind,
        prior_rows.semantic_row as prior_semantic,
        new_rows.semantic_row as new_semantic
      from prior_rows
      full join new_rows
        using(county_code,stable_junction_key,anchor_key)
      where prior_rows.semantic_row
            is distinct from new_rows.semantic_row
    )
    select
      (select count(*) from differences),
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(sample)
            order by
              sample.county_code,
              sample.stable_junction_key,
              sample.anchor_key
          )
          from (
            select
              county_code,
              stable_junction_key,
              anchor_key,
              difference_kind,
              prior_semantic,
              new_semantic
            from differences
            order by county_code,stable_junction_key,anchor_key
            limit 50
          ) sample
        ),
        '[]'::jsonb
      )
    into
      v_anchor_semantic_diff_count,
      v_anchor_semantic_diff_sample;

    raise exception using
      message='Issue #97 rebuilt graph anchor semantics changed',
      detail=pg_catalog.jsonb_build_object(
        'anchor_semantic_diff_count',
          v_anchor_semantic_diff_count,
        'anchor_semantic_diff_sample',
          v_anchor_semantic_diff_sample
      )::text;
  end if;

  if exists(
       select 1 from tmp_issue97_mapping_wave_active_before prior
       join tmp_issue97_mapping_wave_new_builds build using(state_code,county_code)
       where (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
           junction.stable_junction_key||':'||(
             (pg_catalog.to_jsonb(membership)
               -'id'-'junction_id'-'created_at'-'updated_at')
             ||pg_catalog.jsonb_build_object(
               'road_id',
               case when exists(
                 select 1
                 from tmp_issue97_frozen_mapping_refresh_contract contract
                 where contract.identity_id=membership.identity_id
                   and contract.road_id=membership.road_id
                   and contract.raw_transition_class='NULL_TO_NONNULL'
                   and contract.prior_road_id is null
               ) then null else membership.road_id end
             )
           )::text,
           '|' order by junction.stable_junction_key,
             (
               (pg_catalog.to_jsonb(membership)
                 -'id'-'junction_id'-'created_at'-'updated_at')
               ||pg_catalog.jsonb_build_object(
                 'road_id',
                 case when exists(
                   select 1
                 from tmp_issue97_frozen_mapping_refresh_contract contract
                 where contract.identity_id=membership.identity_id
                   and contract.road_id=membership.road_id
                   and contract.raw_transition_class='NULL_TO_NONNULL'
                   and contract.prior_road_id is null
                 ) then null else membership.road_id end
               )
             )::text),''))
         from public.brinesearch_road_junction_memberships membership
         join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
         where junction.build_id=prior.id
           and not exists(select 1 from tmp_issue97_frozen_mapping_targets target
             where target.identity_id=membership.identity_id))
       <>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
           junction.stable_junction_key||':'||(
             (pg_catalog.to_jsonb(membership)
               -'id'-'junction_id'-'created_at'-'updated_at')
             ||pg_catalog.jsonb_build_object(
               'road_id',
               case when exists(
                 select 1
                 from tmp_issue97_frozen_mapping_refresh_contract contract
                 where contract.identity_id=membership.identity_id
                   and contract.road_id=membership.road_id
                   and contract.raw_transition_class='NULL_TO_NONNULL'
                   and contract.prior_road_id is null
               ) then null else membership.road_id end
             )
           )::text,
           '|' order by junction.stable_junction_key,
             (
               (pg_catalog.to_jsonb(membership)
                 -'id'-'junction_id'-'created_at'-'updated_at')
               ||pg_catalog.jsonb_build_object(
                 'road_id',
                 case when exists(
                   select 1
                 from tmp_issue97_frozen_mapping_refresh_contract contract
                 where contract.identity_id=membership.identity_id
                   and contract.road_id=membership.road_id
                   and contract.raw_transition_class='NULL_TO_NONNULL'
                   and contract.prior_road_id is null
                 ) then null else membership.road_id end
               )
             )::text),''))
         from public.brinesearch_road_junction_memberships membership
         join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
          where junction.build_id=build.id
            and not exists(select 1 from tmp_issue97_frozen_mapping_targets target
              where target.identity_id=membership.identity_id))
      )
  then
    with pairs as (
      select
        prior.county_code,
        prior.id as prior_build_id,
        build.id as new_build_id
      from tmp_issue97_mapping_wave_active_before prior
      join tmp_issue97_mapping_wave_new_builds build
        using(state_code,county_code)
    ),
    prior_rows as (
      select
        pairs.county_code,
        junction.stable_junction_key,
        membership.identity_id,
        membership.membership_role,
        membership.road_id,
        true as row_present,
        (
          pg_catalog.to_jsonb(membership)
            -'id'-'junction_id'-'created_at'-'updated_at'
        )||pg_catalog.jsonb_build_object(
          'road_id',
          case when exists(
            select 1
            from tmp_issue97_frozen_mapping_refresh_contract contract
            where contract.identity_id=membership.identity_id
              and contract.road_id=membership.road_id
              and contract.raw_transition_class='NULL_TO_NONNULL'
              and contract.prior_road_id is null
          ) then null else membership.road_id end
        ) as semantic_row
      from pairs
      join public.brinesearch_road_junctions junction
        on junction.build_id=pairs.prior_build_id
      join public.brinesearch_road_junction_memberships membership
        on membership.junction_id=junction.id
      where not exists(
        select 1
        from tmp_issue97_frozen_mapping_targets target
        where target.identity_id=membership.identity_id
      )
    ),
    new_rows as (
      select
        pairs.county_code,
        junction.stable_junction_key,
        membership.identity_id,
        membership.membership_role,
        membership.road_id,
        true as row_present,
        (
          pg_catalog.to_jsonb(membership)
            -'id'-'junction_id'-'created_at'-'updated_at'
        )||pg_catalog.jsonb_build_object(
          'road_id',
          case when exists(
            select 1
            from tmp_issue97_frozen_mapping_refresh_contract contract
            where contract.identity_id=membership.identity_id
              and contract.road_id=membership.road_id
              and contract.raw_transition_class='NULL_TO_NONNULL'
              and contract.prior_road_id is null
          ) then null else membership.road_id end
        ) as semantic_row
      from pairs
      join public.brinesearch_road_junctions junction
        on junction.build_id=pairs.new_build_id
      join public.brinesearch_road_junction_memberships membership
        on membership.junction_id=junction.id
      where not exists(
        select 1
        from tmp_issue97_frozen_mapping_targets target
        where target.identity_id=membership.identity_id
      )
    ),
    differences as (
      select
        coalesce(prior_rows.county_code,new_rows.county_code)
          as county_code,
        coalesce(
          prior_rows.stable_junction_key,
          new_rows.stable_junction_key
        ) as stable_junction_key,
        coalesce(prior_rows.identity_id,new_rows.identity_id)
          as identity_id,
        coalesce(prior_rows.membership_role,new_rows.membership_role)
          as membership_role,
        case
          when prior_rows.row_present is null then 'added'
          when new_rows.row_present is null then 'missing'
          else 'changed'
        end as difference_kind,
        prior_rows.road_id as prior_road_id,
        new_rows.road_id as new_road_id,
        prior_rows.semantic_row as prior_semantic,
        new_rows.semantic_row as new_semantic
      from prior_rows
      full join new_rows
        using(
          county_code,
          stable_junction_key,
          identity_id,
          membership_role
        )
      where prior_rows.semantic_row
            is distinct from new_rows.semantic_row
    )
    select
      (select count(*) from differences),
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(sample)
            order by
              sample.county_code,
              sample.stable_junction_key,
              sample.identity_id,
              sample.membership_role
          )
          from (
            select
              county_code,
              stable_junction_key,
              identity_id,
              membership_role,
              difference_kind,
              prior_road_id,
              new_road_id,
              prior_semantic,
              new_semantic
            from differences
            order by
              county_code,
              stable_junction_key,
              identity_id,
              membership_role
            limit 50
          ) sample
        ),
        '[]'::jsonb
      )
    into
      v_non_target_membership_diff_count,
      v_non_target_membership_diff_sample;

    raise exception using
      message=
        'Issue #97 rebuilt graph non-target membership semantics changed',
      detail=pg_catalog.jsonb_build_object(
        'non_target_membership_diff_count',
          v_non_target_membership_diff_count,
        'non_target_membership_diff_sample',
          v_non_target_membership_diff_sample
      )::text;
  end if;

  if exists(select 1 from tmp_issue97_mapping_wave_new_builds build
       where not private_verification.brinesearch_issue97_graph_build_release_current(build.id))
  then
    raise exception 'Issue #97 rebuilt dark graph is not fully release-current';
  end if;

  if exists(select 1 from tmp_issue97_mapping_wave_new_builds build
       where build.status<>'validated' or build.activated_at is not null)
     or exists(select 1 from tmp_issue97_mapping_wave_active_before old_build
       join public.brinesearch_road_graph_builds current on current.id=old_build.id
       where current.status<>'active'
         or current.activated_at is distinct from old_build.activated_at)
  then
    raise exception 'Issue #97 candidate build lane activated or replaced a graph';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(candidate)::text,'|' order by candidate.route_prep_step_id,candidate.identity_id,candidate.candidate_basis),'')) from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate)<>(select candidates from tmp_issue97_mapping_wave_route_state_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt)<>(select occurrences from tmp_issue97_mapping_wave_route_state_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt)<>(select routes from tmp_issue97_mapping_wave_route_state_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.boundary_index),'')) from private_verification.brinesearch_route_transition_receipts_issue97 receipt)<>(select transitions from tmp_issue97_mapping_wave_route_state_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt)<>(select geometry from tmp_issue97_mapping_wave_route_state_before)
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>(select global_reconciliation from tmp_issue97_mapping_wave_route_state_before)
     or exists(select 1 from public.brinesearch_road_graph_builds where state_code in ('WV','PA')
       and details->>'release_generation_key'='issue97-release-20260815-r2')
  then
    raise exception 'Issue #97 rollback rehearsal changed route/public/cutover/WV/PA state';
  end if;

  if (select count(*) from tmp_issue97_mapping_wave_post_migration_target_receipts)<>3
     or (select count(*) from tmp_issue97_mapping_wave_post_migration_target_pads)<>3
  then
    raise exception using
      message='Issue #97 rollback rehearsal Google target snapshot cardinality changed',
      detail=pg_catalog.jsonb_build_object(
        'target_receipt_snapshot_count',
          (select count(*) from tmp_issue97_mapping_wave_post_migration_target_receipts),
        'target_pad_snapshot_count',
          (select count(*) from tmp_issue97_mapping_wave_post_migration_target_pads)
      )::text;
  end if;

  select
    (select count(*)
     from private_verification.brinesearch_google_route_refresh_queue_issue97),
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(sample)
          order by sample.pad_id
        )
        from (
          select queue.pad_id,queue.reason
          from private_verification.brinesearch_google_route_refresh_queue_issue97 queue
          order by queue.pad_id
          limit 50
        ) sample
      ),
      '[]'::jsonb
    )
  into v_google_diff_count,v_google_diff_sample;

  if v_google_diff_count<>0
  then
    raise exception using
      message='Issue #97 rollback rehearsal Google refresh queue is not empty after dark builds',
      detail=pg_catalog.jsonb_build_object(
        'google_refresh_queue_count',v_google_diff_count,
        'google_refresh_queue_sample',v_google_diff_sample
      )::text;
  end if;

  if (select count(*) from public.brinesearch_driver_google_routes_public)<>0
     or public.brinesearch_issue97_cutover_active()
  then
    raise exception using
      message='Issue #97 rollback rehearsal public Google or cutover state changed',
      detail=pg_catalog.jsonb_build_object(
        'public_google_route_count',
          (select count(*) from public.brinesearch_driver_google_routes_public),
        'cutover_active',public.brinesearch_issue97_cutover_active()
      )::text;
  end if;

  with differences as (
    select
      target.pad_id,
      expected.expected_evidence_identity_id,
      expected.expected_evidence_road_id,
      expected.expected_receipt_route_revision,
      pg_catalog.to_jsonb(receipt) as actual_receipt
    from tmp_issue97_frozen_mapping_expected_google_pads target
    left join tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected
      on expected.pad_id=target.pad_id
    left join private_verification.brinesearch_google_route_receipts_issue97 receipt
      on receipt.pad_id=target.pad_id
    where expected.pad_id is null
       or (
         pg_catalog.to_jsonb(receipt)-'generated_at'-'updated_at'-'evidence'
       ) is distinct from pg_catalog.jsonb_build_object(
         'pad_id',expected.pad_id,
         'route_revision',expected.expected_receipt_route_revision,
         'status','stale',
         'hold_reason','road_identity_mapping_changed',
         'manifest_version','issue97-google-v1',
         'manifest_digest',null,
         'dependency_digest',null,
         'manifest',pg_catalog.jsonb_build_object(
           'manifest_version','issue97-google-v1',
           'route_ready',false,
           'status','stale',
           'pad_id',expected.pad_id,
           'route_revision',expected.expected_receipt_route_revision
         )
       )
       or receipt.generated_at is distinct from
          pg_catalog.transaction_timestamp()
       or receipt.updated_at is distinct from
          pg_catalog.transaction_timestamp()
       -- Same witness rule as the postprocessor contract: the recorded
       -- identity/road pair is one of several legitimate invalidation causes
       -- and shifts with rebuild scope, so assert what it must satisfy rather
       -- than which one it happens to be.
       -- issue97-google-evidence-witness-invariant
       or receipt.evidence is null
       or (
            select count(*)
            from pg_catalog.jsonb_object_keys(receipt.evidence)
          )<>2
       or receipt.evidence->>'identity_id' is null
       or receipt.evidence->>'road_id' is null
       or not exists(
            select 1
            from public.brinesearch_road_identity_mappings mapping
            where mapping.identity_id::text=receipt.evidence->>'identity_id'
              and mapping.road_id::text=receipt.evidence->>'road_id'
              and mapping.mapping_status='verified'
              and mapping.mapping_method in (
                'exact_source_record_id','exact_route_designation'
              )
          )
       or not (
            exists(
              select 1
              from public.brinesearch_pad_roads step
              where step.pad_id=target.pad_id
                and step.road_id::text=receipt.evidence->>'road_id'
            )
            or exists(
              select 1
              from pg_catalog.jsonb_array_elements(
                coalesce(
                  expected.pre_receipt_row->'manifest'->'points','[]'::jsonb
                )
              ) point
              where point->>'identity_id'=receipt.evidence->>'identity_id'
                 or point->>'road_id'=receipt.evidence->>'road_id'
            )
          )
  )
  select
    (select count(*) from differences),
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(sample)
          order by sample.pad_id
        )
        from (
          select * from differences order by pad_id limit 50
        ) sample
      ),
      '[]'::jsonb
    )
  into v_google_diff_count,v_google_diff_sample;

  if v_google_diff_count<>0
  then
    raise exception using
      message='Issue #97 rollback rehearsal target Google receipt postprocessor contract changed',
      detail=pg_catalog.jsonb_build_object(
        'target_google_receipt_contract_diff_count',v_google_diff_count,
        'target_google_receipt_contract_diff_sample',v_google_diff_sample
      )::text;
  end if;

  with differences as (
    select
      coalesce(snapshot.id,live.id) as pad_id,
      case
        when snapshot.id is null then 'added'
        when live.id is null then 'missing'
        else 'changed'
      end as difference_kind,
      pg_catalog.to_jsonb(snapshot) as prior_semantic,
      pg_catalog.to_jsonb(live) as new_semantic
    from tmp_issue97_mapping_wave_post_migration_target_pads snapshot
    full join (
      select pad.id,pad.brinesearch_google_route_status_issue97,
        pad.brinesearch_google_route_revision_issue97
      from public.pads pad
      join tmp_issue97_frozen_mapping_expected_google_pads expected
        on expected.pad_id=pad.id
    ) live using(id)
    where pg_catalog.to_jsonb(live) is distinct from pg_catalog.to_jsonb(snapshot)
  )
  select
    (select count(*) from differences),
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(sample)
          order by sample.pad_id
        )
        from (
          select * from differences order by pad_id limit 50
        ) sample
      ),
      '[]'::jsonb
    )
  into v_google_diff_count,v_google_diff_sample;

  if v_google_diff_count<>0
  then
    raise exception using
      message='Issue #97 rollback rehearsal target Google pad state changed during dark builds',
      detail=pg_catalog.jsonb_build_object(
        'target_google_pad_diff_count',v_google_diff_count,
        'target_google_pad_diff_sample',v_google_diff_sample
      )::text;
  end if;

  select
    count(*),
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'pad_id',expected.pad_id,
          'receipt_status',receipt.status,
          'receipt_hold_reason',receipt.hold_reason,
          'manifest_route_ready',receipt.manifest->>'route_ready',
          'manifest_status',receipt.manifest->>'status',
          'pad_google_status',pad.brinesearch_google_route_status_issue97,
          'pad_google_revision',pad.brinesearch_google_route_revision_issue97,
          'receipt_route_revision',receipt.route_revision,
          'structured_route_revision',pad.structured_route_revision,
          'expected_structured_route_revision',expected.structured_route_revision,
          'road_sequence_status',pad.road_sequence_status,
          'expected_road_sequence_status',expected.road_sequence_status
        )
        order by expected.pad_id
      ),
      '[]'::jsonb
    )
  into v_google_diff_count,v_google_diff_sample
  from tmp_issue97_frozen_mapping_expected_google_pads expected
  left join private_verification.brinesearch_google_route_receipts_issue97 receipt
    on receipt.pad_id=expected.pad_id
  left join public.pads pad on pad.id=expected.pad_id
  where receipt.status is distinct from 'stale'
     or receipt.hold_reason is distinct from 'road_identity_mapping_changed'
     or receipt.manifest->>'route_ready' is distinct from 'false'
     or receipt.manifest->>'status' is distinct from 'stale'
     or pad.brinesearch_google_route_status_issue97 is distinct from 'stale'
     or pad.brinesearch_google_route_revision_issue97 is distinct from receipt.route_revision
     or pad.structured_route_revision is distinct from expected.structured_route_revision
     or pad.road_sequence_status is distinct from expected.road_sequence_status;

  if v_google_diff_count<>0
  then
    raise exception using
      message='Issue #97 rollback rehearsal target Google stale-state contract changed',
      detail=pg_catalog.jsonb_build_object(
        'target_google_stale_state_diff_count',v_google_diff_count,
        'target_google_stale_state_diff_sample',v_google_diff_sample
      )::text;
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id),''))
      from private_verification.brinesearch_google_route_receipts_issue97 receipt
      where not exists(select 1 from tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected
        where expected.pad_id=receipt.pad_id))<>
    (select receipt_digest
     from tmp_issue97_mapping_wave_refresh_expansion_google_unchanged_before)
  then
    raise exception using
      message='Issue #97 rollback rehearsal non-target Google receipts changed',
      detail=pg_catalog.jsonb_build_object(
        'expected_non_target_receipt_digest',
          (select receipt_digest
           from tmp_issue97_mapping_wave_refresh_expansion_google_unchanged_before),
        'observed_non_target_receipt_digest',
          (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id),''))
           from private_verification.brinesearch_google_route_receipts_issue97 receipt
           where not exists(select 1 from tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected
             where expected.pad_id=receipt.pad_id))
      )::text;
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.jsonb_build_object(
      'pad_id',pad.id,'status',pad.brinesearch_google_route_status_issue97,
      'revision',pad.brinesearch_google_route_revision_issue97
    )::text,'|' order by pad.id),''))
      from public.pads pad
      where not exists(select 1 from tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected
        where expected.pad_id=pad.id))<>
    (select pad_digest
     from tmp_issue97_mapping_wave_refresh_expansion_google_unchanged_before)
  then
    raise exception using
      message='Issue #97 rollback rehearsal non-target Google pad state changed',
      detail=pg_catalog.jsonb_build_object(
        'expected_non_target_pad_digest',
          (select pad_digest
           from tmp_issue97_mapping_wave_refresh_expansion_google_unchanged_before),
        'observed_non_target_pad_digest',
          (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.jsonb_build_object(
              'pad_id',pad.id,'status',pad.brinesearch_google_route_status_issue97,
              'revision',pad.brinesearch_google_route_revision_issue97
            )::text,'|' order by pad.id),''))
           from public.pads pad
           where not exists(select 1 from tmp_issue97_mapping_wave_refresh_expansion_google_before_build expected
             where expected.pad_id=pad.id))
      )::text;
  end if;

  if (select count(*) from pg_catalog.pg_trigger trigger
      join pg_catalog.pg_class relation on relation.oid=trigger.tgrelid
      join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='private_verification'
        and relation.relname='brinesearch_google_route_refresh_queue_issue97'
        and trigger.tgname='brinesearch_issue97_google_route_refresh_deferred'
        and not trigger.tgisinternal and trigger.tgenabled='O'
        and trigger.tgdeferrable and trigger.tginitdeferred)<>1
  then
    raise exception using
      message='Issue #97 rollback rehearsal deferred Google trigger contract changed',
      detail=pg_catalog.jsonb_build_object(
        'matching_deferred_trigger_count',
          (select count(*) from pg_catalog.pg_trigger trigger
           join pg_catalog.pg_class relation on relation.oid=trigger.tgrelid
           join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
           where namespace.nspname='private_verification'
             and relation.relname='brinesearch_google_route_refresh_queue_issue97'
             and trigger.tgname='brinesearch_issue97_google_route_refresh_deferred'
             and not trigger.tgisinternal and trigger.tgenabled='O'
             and trigger.tgdeferrable and trigger.tginitdeferred)
      )::text;
  end if;
end
$issue97_frozen_mapping_rebuild_assertions$;

-- These exact IDs/digests are the only acceptable future candidate pins.
-- Activation/reconciliation remains prohibited until this eight-row result is
-- copied into a new repository-only checkpoint and independently audited.
select build.county_code,build.id build_id,build.graph_digest,
  build.details->>'mapping_snapshot_digest' mapping_snapshot_digest,
  build.status,build.activated_at,true requires_repository_pin
from tmp_issue97_mapping_wave_new_builds build order by build.county_code;

rollback;
