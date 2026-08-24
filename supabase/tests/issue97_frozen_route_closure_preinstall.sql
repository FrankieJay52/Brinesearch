\set ON_ERROR_STOP on
\pset pager off
\timing on

-- Read-only pre-install proof for the exact 412-route closure. The included
-- contract is one CTE-only SELECT and creates no temporary or durable objects.
begin isolation level repeatable read read only;
set local statement_timeout='15min';
set local lock_timeout='2min';

do $issue97_frozen_route_closure_preinstall$
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version='20260817193212')<>0
     or (select count(*) from public.brinesearch_road_identity_mappings
         where evidence->>'migration'='issue97_frozen_exact_mapping_wave')<>0
     or (select count(*) from public.brinesearch_road_graph_builds
         where state_code='OH' and status='active')<>19
     or (select count(*) from public.brinesearch_road_source_dataset_counties scope
         where scope.state_code='OH' and scope.active and scope.ingest_enabled
           and private_verification.brinesearch_issue97_dataset_scope_current(
             scope.dataset_id,scope.state_code,scope.county_code))<>38
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0
     or public.brinesearch_issue97_cutover_active()
     or exists(select 1 from pg_catalog.pg_stat_activity
       where pid<>pg_catalog.pg_backend_pid()
         and application_name like 'brinesearch-issue97-%'
         and state<>'idle') then
    raise exception 'Issue #97 exact closure pre-install safety pins drifted';
  end if;
end
$issue97_frozen_route_closure_preinstall$;

\ir ../../ops/issue97-computer-rollout/sql/34-frozen-exact-mapping-wave-route-manifest.sql

rollback;
