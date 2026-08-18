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
       join private_verification.brinesearch_google_route_receipts_issue97 receipt
         on receipt.pad_id=expected.pad_id
       join public.pads pad on pad.id=expected.pad_id
       where receipt.status is distinct from 'held'
          or receipt.hold_reason is distinct from 'issue97_cutover_not_active'
          or receipt.manifest->>'route_ready' is distinct from 'false'
          or receipt.manifest->>'status' is distinct from 'held'
          or pad.brinesearch_google_route_status_issue97 is distinct from 'held'
          or pad.brinesearch_google_route_revision_issue97 is distinct from receipt.route_revision
          or pad.structured_route_revision is distinct from expected.structured_route_revision
          or pad.road_sequence_status is distinct from expected.road_sequence_status
     )
     or (select count(*) from private_verification.brinesearch_google_route_receipts_issue97 receipt
         join tmp_issue97_frozen_mapping_expected_google_pads expected
           on expected.pad_id=receipt.pad_id)<>3
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

insert into supabase_migrations.schema_migrations(version,statements,name)
values (
  '20260817193212',
  array['rollback-only exact frozen mapping migration body']::text[],
  'issue97_frozen_exact_mapping_wave'
);
\ir ../../ops/issue97-computer-rollout/sql/34-frozen-exact-mapping-wave-route-manifest.sql

create temporary table tmp_issue97_mapping_wave_build_results(
  build_order integer primary key,
  county_code text not null unique,
  result jsonb not null
) on commit drop;

-- Exact serial rebuild plan. No automatic retry and no other state/county input.
insert into tmp_issue97_mapping_wave_build_results values
  (1,'BEL',public.brinesearch_issue97_rebuild_county_graph('OH','BEL'));
insert into tmp_issue97_mapping_wave_build_results values
  (2,'CAR',public.brinesearch_issue97_rebuild_county_graph('OH','CAR'));
insert into tmp_issue97_mapping_wave_build_results values
  (3,'COL',public.brinesearch_issue97_rebuild_county_graph('OH','COL'));
insert into tmp_issue97_mapping_wave_build_results values
  (4,'GUE',public.brinesearch_issue97_rebuild_county_graph('OH','GUE'));
insert into tmp_issue97_mapping_wave_build_results values
  (5,'HAS',public.brinesearch_issue97_rebuild_county_graph('OH','HAS'));
insert into tmp_issue97_mapping_wave_build_results values
  (6,'JEF',public.brinesearch_issue97_rebuild_county_graph('OH','JEF'));
insert into tmp_issue97_mapping_wave_build_results values
  (7,'MOE',public.brinesearch_issue97_rebuild_county_graph('OH','MOE'));
insert into tmp_issue97_mapping_wave_build_results values
  (8,'NOB',public.brinesearch_issue97_rebuild_county_graph('OH','NOB'));

create temporary table tmp_issue97_mapping_wave_new_builds on commit drop as
select build.*
from tmp_issue97_mapping_wave_build_results result
join public.brinesearch_road_graph_builds build
  on build.id=(result.result->>'build_id')::uuid
 and build.state_code='OH'
 and build.county_code=result.county_code;

do $issue97_frozen_mapping_rebuild_assertions$
begin
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
      or exists(select 1 from tmp_issue97_mapping_wave_new_builds build
        join tmp_issue97_mapping_wave_active_before prior using(state_code,county_code)
        where build.graph_digest=prior.graph_digest
          or build.details->>'mapping_snapshot_digest'=prior.details->>'mapping_snapshot_digest'
          or build.source_revision_digest<>prior.source_revision_digest
          or build.source_segment_count<>prior.source_segment_count
          or build.identity_count<>prior.identity_count
          or build.point_junction_count<>prior.point_junction_count
         or build.shared_segment_count<>prior.shared_segment_count
         or build.membership_count<>prior.membership_count)
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

  if (select count(*) from public.brinesearch_road_junction_memberships membership
      join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
      join tmp_issue97_mapping_wave_new_builds build on build.id=junction.build_id
      join public.brinesearch_road_identity_mappings mapping
        on mapping.identity_id=membership.identity_id and mapping.mapping_status='verified'
      where mapping.evidence->>'migration'='issue97_frozen_exact_mapping_wave'
        and membership.road_id=mapping.road_id)<>1565
     or exists(select 1 from public.brinesearch_road_junction_memberships membership
       join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
       join tmp_issue97_mapping_wave_new_builds build on build.id=junction.build_id
       join public.brinesearch_road_identity_mappings mapping
         on mapping.identity_id=membership.identity_id and mapping.mapping_status='verified'
       where mapping.evidence->>'migration'='issue97_frozen_exact_mapping_wave'
         and membership.road_id is distinct from mapping.road_id)
  then
    raise exception 'Issue #97 rebuilt graph memberships did not capture the exact 46 mappings';
  end if;

  -- Rebuild output may use different row UUIDs and timestamps. Compare the
  -- semantic topology as multisets keyed by the stable junction key. The only
  -- permitted membership change is the exact target identity -> road_id value.
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
       or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
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
       or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
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
     or exists(
       select 1 from tmp_issue97_mapping_wave_active_before prior
       join tmp_issue97_mapping_wave_new_builds build using(state_code,county_code)
       where (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
           junction.stable_junction_key||':'||(pg_catalog.to_jsonb(membership)
             -'id'-'junction_id'-'created_at'-'updated_at')::text,
           '|' order by junction.stable_junction_key,
             (pg_catalog.to_jsonb(membership)-'id'-'junction_id'-'created_at'-'updated_at')::text),''))
         from public.brinesearch_road_junction_memberships membership
         join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
         where junction.build_id=prior.id
           and not exists(select 1 from tmp_issue97_frozen_mapping_targets target
             where target.identity_id=membership.identity_id))
       <>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
           junction.stable_junction_key||':'||(pg_catalog.to_jsonb(membership)
             -'id'-'junction_id'-'created_at'-'updated_at')::text,
           '|' order by junction.stable_junction_key,
             (pg_catalog.to_jsonb(membership)-'id'-'junction_id'-'created_at'-'updated_at')::text),''))
         from public.brinesearch_road_junction_memberships membership
         join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
         where junction.build_id=build.id
           and not exists(select 1 from tmp_issue97_frozen_mapping_targets target
             where target.identity_id=membership.identity_id))
     )
  then
    raise exception 'Issue #97 rebuilt graph changed source topology beyond exact mapping road IDs';
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
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>(select public_google from tmp_issue97_mapping_wave_route_state_before)
     or public.brinesearch_issue97_cutover_active()<>(select cutover from tmp_issue97_mapping_wave_route_state_before)
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>(select global_reconciliation from tmp_issue97_mapping_wave_route_state_before)
     or exists(select 1 from public.brinesearch_road_graph_builds where state_code in ('WV','PA')
       and details->>'release_generation_key'='issue97-release-20260815-r2')
  then
    raise exception 'Issue #97 rollback rehearsal changed route/public/cutover/WV/PA state';
  end if;

  if exists(select 1 from private_verification.brinesearch_google_route_refresh_queue_issue97)
     or exists(
       select 1 from tmp_issue97_frozen_mapping_google_postprocessor postprocessor
       left join private_verification.brinesearch_google_route_receipts_issue97 receipt
         on receipt.pad_id=postprocessor.pad_id
       left join public.pads pad on pad.id=postprocessor.pad_id
       join tmp_issue97_frozen_mapping_expected_google_pads expected
         on expected.pad_id=postprocessor.pad_id
       where pg_catalog.to_jsonb(receipt) is distinct from postprocessor.receipt_row
          or pad.brinesearch_google_route_status_issue97 is distinct from postprocessor.pad_google_status
          or pad.brinesearch_google_route_revision_issue97 is distinct from postprocessor.pad_google_revision
          or pad.structured_route_revision is distinct from expected.structured_route_revision
          or pad.road_sequence_status is distinct from expected.road_sequence_status
          or receipt.status='ready'
          or pad.brinesearch_google_route_status_issue97='ready'
     )
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
     or (select count(*) from pg_catalog.pg_trigger trigger
         join pg_catalog.pg_class relation on relation.oid=trigger.tgrelid
         join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
         where namespace.nspname='private_verification'
           and relation.relname='brinesearch_google_route_refresh_queue_issue97'
           and trigger.tgname='brinesearch_issue97_google_route_refresh_deferred'
           and not trigger.tgisinternal and trigger.tgenabled='O'
           and trigger.tgdeferrable and trigger.tginitdeferred)<>1
  then
    raise exception 'Issue #97 rollback rehearsal Google state changed during dark builds';
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
