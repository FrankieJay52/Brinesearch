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
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
     ))<>'06705f5b35a6d37151bb2c0dc5ade9bd'
     or (select count(*) from public.brinesearch_road_graph_builds
         where state_code='OH' and status='active')<>19
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
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id),''))
    from private_verification.brinesearch_google_route_receipts_issue97 receipt) private_google,
  (select count(*) from public.brinesearch_driver_google_routes_public) public_google,
  public.brinesearch_issue97_cutover_active() cutover,
  (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs) global_reconciliation;

\ir ../migrations/20260817193212_issue97_frozen_exact_mapping_wave.sql
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
from public.brinesearch_road_graph_builds build
where not exists(select 1 from tmp_issue97_mapping_wave_existing_builds old where old.id=build.id);

do $issue97_frozen_mapping_rebuild_assertions$
begin
  if (select count(*) from tmp_issue97_mapping_wave_build_results)<>8
     or (select pg_catalog.array_agg(county_code order by build_order) from tmp_issue97_mapping_wave_build_results)
       is distinct from array['BEL','CAR','COL','GUE','HAS','JEF','MOE','NOB']::text[]
     or (select count(*) from tmp_issue97_mapping_wave_new_builds)<>8
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

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(candidate)::text,'|' order by candidate.route_prep_step_id,candidate.identity_id,candidate.candidate_basis),'')) from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate)<>(select candidates from tmp_issue97_mapping_wave_route_state_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt)<>(select occurrences from tmp_issue97_mapping_wave_route_state_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt)<>(select routes from tmp_issue97_mapping_wave_route_state_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.boundary_index),'')) from private_verification.brinesearch_route_transition_receipts_issue97 receipt)<>(select transitions from tmp_issue97_mapping_wave_route_state_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt)<>(select geometry from tmp_issue97_mapping_wave_route_state_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id),'')) from private_verification.brinesearch_google_route_receipts_issue97 receipt)<>(select private_google from tmp_issue97_mapping_wave_route_state_before)
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>(select public_google from tmp_issue97_mapping_wave_route_state_before)
     or public.brinesearch_issue97_cutover_active()<>(select cutover from tmp_issue97_mapping_wave_route_state_before)
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>(select global_reconciliation from tmp_issue97_mapping_wave_route_state_before)
     or exists(select 1 from public.brinesearch_road_graph_builds where state_code in ('WV','PA')
       and details->>'release_generation_key'='issue97-release-20260815-r2')
  then
    raise exception 'Issue #97 rollback rehearsal changed route/public/cutover/WV/PA state';
  end if;
end
$issue97_frozen_mapping_rebuild_assertions$;

select build.county_code,build.id build_id,build.graph_digest,
  build.details->>'mapping_snapshot_digest' mapping_snapshot_digest,
  build.status,build.activated_at
from tmp_issue97_mapping_wave_new_builds build order by build.county_code;

rollback;
