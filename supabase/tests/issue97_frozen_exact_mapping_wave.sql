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

create temporary table
tmp_issue97_mapping_wave_refresh_expansion_before_build
on commit drop
as
select
  expansion.*,
  (
    select count(*)
    from public.brinesearch_road_identity_mappings mapping
    where mapping.identity_id=expansion.identity_id
      and mapping.mapping_status in ('verified','candidate')
  )::bigint as active_mapping_count,
  (
    select count(*)
    from tmp_issue97_mapping_wave_active_before prior
    join public.brinesearch_road_junctions junction
      on junction.build_id=prior.id
    join public.brinesearch_road_junction_memberships membership
      on membership.junction_id=junction.id
    where prior.state_code='OH'
      and prior.county_code=expansion.county_code
      and membership.identity_id=expansion.identity_id
  )::bigint as observed_old_membership_occurrence_count,
  (
    select count(*)
    from tmp_issue97_mapping_wave_active_before prior
    join public.brinesearch_road_junctions junction
      on junction.build_id=prior.id
    join public.brinesearch_road_junction_memberships membership
      on membership.junction_id=junction.id
    where prior.state_code='OH'
      and prior.county_code=expansion.county_code
      and membership.identity_id=expansion.identity_id
      and membership.road_id is not null
  )::bigint as old_nonnull_road_id_count
from tmp_issue97_frozen_mapping_refresh_expansion expansion
order by expansion.county_code,expansion.identity_id;

do $issue97_frozen_mapping_refresh_expansion_snapshot_assertion$
begin
  if (
       select count(*)
       from tmp_issue97_mapping_wave_refresh_expansion_before_build
     )<>7
     or exists(
       select 1
       from tmp_issue97_mapping_wave_refresh_expansion_before_build snapshot
       join public.brinesearch_roads road on road.id=snapshot.road_id
       where snapshot.active_mapping_count<>0
          or snapshot.observed_old_membership_occurrence_count<>
             snapshot.old_active_membership_occurrence_count
          or snapshot.old_nonnull_road_id_count<>0
          or road.verification_status<>
             snapshot.new_road_verification_status
     )
     or (
       select sum(observed_old_membership_occurrence_count)
       from tmp_issue97_mapping_wave_refresh_expansion_before_build
     )<>267
  then
    raise exception
      'Issue #97 reviewed mapping-refresh expansion pre-build snapshot drifted';
  end if;
end
$issue97_frozen_mapping_refresh_expansion_snapshot_assertion$;

insert into supabase_migrations.schema_migrations(version,statements,name)
values (
  '20260817193212',
  array['rollback-only exact frozen mapping migration body']::text[],
  'issue97_frozen_exact_mapping_wave'
);
\ir ../../ops/issue97-computer-rollout/sql/34-frozen-exact-mapping-wave-route-manifest.sql

-- Freeze the exact Google dependency footprint that the reviewed seven-row
-- machine refresh can invalidate. This reproduces the mapping invalidation
-- trigger's two dependency paths before any builder can replace a receipt with
-- its stale stub.
create temporary table
tmp_issue97_mapping_wave_refresh_expansion_google_before_build
on commit drop
as
with affected as (
  select receipt.pad_id
  from tmp_issue97_frozen_mapping_refresh_expansion expansion
  join private_verification.brinesearch_google_route_receipts_issue97 receipt
    on exists(
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(receipt.manifest->'points','[]'::jsonb)
      ) point
      where point->>'identity_id'=expansion.identity_id::text
         or point->>'road_id'=expansion.road_id::text
    )

  union

  select step.pad_id
  from tmp_issue97_frozen_mapping_refresh_expansion expansion
  join public.brinesearch_pad_roads step
    on step.road_id=expansion.road_id
)
select affected.pad_id,
  pg_catalog.to_jsonb(receipt) as pre_receipt_row,
  pg_catalog.jsonb_build_object(
    'status',pad.brinesearch_google_route_status_issue97,
    'revision',pad.brinesearch_google_route_revision_issue97,
    'structured_route_revision',pad.structured_route_revision,
    'road_sequence_status',pad.road_sequence_status
  ) as pre_pad_state
from (select distinct pad_id from affected) affected
join public.pads pad on pad.id=affected.pad_id
left join private_verification.brinesearch_google_route_receipts_issue97 receipt
  on receipt.pad_id=affected.pad_id
order by affected.pad_id;

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
      from tmp_issue97_frozen_mapping_refresh_expansion)<>7
     or (select count(*)
         from public.brinesearch_road_identity_mappings mapping
         join tmp_issue97_frozen_mapping_refresh_expansion expansion
           on expansion.identity_id=mapping.identity_id
          and expansion.road_id=mapping.road_id
         where mapping.mapping_status='verified')<>7
     or exists(
       select 1
       from tmp_issue97_frozen_mapping_refresh_expansion expansion
       left join public.brinesearch_road_identity_mappings mapping
         on mapping.identity_id=expansion.identity_id
        and mapping.road_id=expansion.road_id
        and mapping.mapping_status='verified'
       where mapping.id is null
          or mapping.mapping_method is distinct from expansion.mapping_method
          or mapping.evidence->>'source_identity_key' is distinct from
             expansion.source_identity_key
          or mapping.evidence->>'route_class' is distinct from
             expansion.road_class
          or mapping.evidence->>'route_token' is distinct from
             expansion.route_number
          or mapping.evidence->>'designation_source' is distinct from
             expansion.designation_source
          or mapping.evidence->>'refresh_scope' is distinct from
             expansion.refresh_scope
          or (mapping.evidence->>'exact_candidate_count')::integer
             is distinct from
             expansion.exact_candidate_count
          or (mapping.evidence->>'ambiguity_held')::boolean
             is distinct from
             expansion.ambiguity_flag
     )
     or exists(
       select 1
       from tmp_issue97_frozen_mapping_refresh_expansion expansion
       join tmp_issue97_mapping_wave_new_builds build
         on build.state_code='OH'
        and build.county_code=expansion.county_code
       left join lateral (
         select
           count(*)::bigint as membership_count,
           count(*) filter(
             where membership.road_id=expansion.road_id
           )::bigint as exact_road_membership_count
         from public.brinesearch_road_junctions junction
         join public.brinesearch_road_junction_memberships membership
           on membership.junction_id=junction.id
         where junction.build_id=build.id
           and membership.identity_id=expansion.identity_id
       ) occurrence on true
       where occurrence.membership_count is distinct from
             expansion.old_active_membership_occurrence_count
          or occurrence.exact_road_membership_count is distinct from
             expansion.old_active_membership_occurrence_count
     )
     or exists(
       select 1
       from public.brinesearch_road_identity_mappings mapping
       join tmp_issue97_frozen_mapping_refresh_expansion expansion
         on expansion.identity_id=mapping.identity_id
       where mapping.mapping_status in ('verified','candidate')
         and (
           mapping.road_id<>expansion.road_id
           or mapping.mapping_status<>expansion.mapping_status
           or mapping.mapping_method<>expansion.mapping_method
         )
     )
  then
    raise exception
      'Issue #97 reviewed exact mapping-refresh expansion changed during graph rebuilds';
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
                 from tmp_issue97_frozen_mapping_refresh_expansion expansion
                 where expansion.identity_id=membership.identity_id
                   and expansion.road_id=membership.road_id
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
                   from tmp_issue97_frozen_mapping_refresh_expansion expansion
                   where expansion.identity_id=membership.identity_id
                     and expansion.road_id=membership.road_id
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
                 from tmp_issue97_frozen_mapping_refresh_expansion expansion
                 where expansion.identity_id=membership.identity_id
                   and expansion.road_id=membership.road_id
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
                   from tmp_issue97_frozen_mapping_refresh_expansion expansion
                   where expansion.identity_id=membership.identity_id
                     and expansion.road_id=membership.road_id
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
            from tmp_issue97_frozen_mapping_refresh_expansion expansion
            where expansion.identity_id=membership.identity_id
              and expansion.road_id=membership.road_id
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
            from tmp_issue97_frozen_mapping_refresh_expansion expansion
            where expansion.identity_id=membership.identity_id
              and expansion.road_id=membership.road_id
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
      coalesce(snapshot.pad_id,live.pad_id) as pad_id,
      case
        when snapshot.pad_id is null then 'added'
        when live.pad_id is null then 'missing'
        else 'changed'
      end as difference_kind,
      pg_catalog.to_jsonb(snapshot) as prior_semantic,
      pg_catalog.to_jsonb(live) as new_semantic
    from tmp_issue97_mapping_wave_post_migration_target_receipts snapshot
    full join (
      select receipt.*
      from private_verification.brinesearch_google_route_receipts_issue97 receipt
      join tmp_issue97_frozen_mapping_expected_google_pads expected
        on expected.pad_id=receipt.pad_id
    ) live using(pad_id)
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
      message='Issue #97 rollback rehearsal target Google receipts changed during dark builds',
      detail=pg_catalog.jsonb_build_object(
        'target_google_receipt_diff_count',v_google_diff_count,
        'target_google_receipt_diff_sample',v_google_diff_sample
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
      where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
        where expected.pad_id=receipt.pad_id))<>
    (select non_target_private_google from tmp_issue97_frozen_mapping_protected_before)
  then
    raise exception using
      message='Issue #97 rollback rehearsal non-target Google receipts changed',
      detail=pg_catalog.jsonb_build_object(
        'expected_non_target_receipt_digest',
          (select non_target_private_google from tmp_issue97_frozen_mapping_protected_before),
        'observed_non_target_receipt_digest',
          (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id),''))
           from private_verification.brinesearch_google_route_receipts_issue97 receipt
           where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
             where expected.pad_id=receipt.pad_id))
      )::text;
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.jsonb_build_object(
      'pad_id',pad.id,'status',pad.brinesearch_google_route_status_issue97,
      'revision',pad.brinesearch_google_route_revision_issue97
    )::text,'|' order by pad.id),''))
      from public.pads pad
      where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
        where expected.pad_id=pad.id))<>
    (select non_target_pad_google from tmp_issue97_frozen_mapping_protected_before)
  then
    raise exception using
      message='Issue #97 rollback rehearsal non-target Google pad state changed',
      detail=pg_catalog.jsonb_build_object(
        'expected_non_target_pad_digest',
          (select non_target_pad_google from tmp_issue97_frozen_mapping_protected_before),
        'observed_non_target_pad_digest',
          (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.jsonb_build_object(
              'pad_id',pad.id,'status',pad.brinesearch_google_route_status_issue97,
              'revision',pad.brinesearch_google_route_revision_issue97
            )::text,'|' order by pad.id),''))
           from public.pads pad
           where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
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
