-- GitHub #97 -- Guernsey/Harrison OGRIP endpoint planner support.
--
-- Production rollback rehearsal proved the unchanged r2 graph builder was
-- rescanning the county OGRIP endpoint population until the SQL transport's
-- 95-second connection limit. These county-scoped expression indexes mirror
-- the already-released Vinton planner fix. They do not change graph semantics,
-- tolerances, identities, mappings, routes, Google output, or cutover state.

set local statement_timeout = '15min';
set local lock_timeout = '5s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:gue-has-endpoint-index-install')
);

create temporary table tmp_issue97_gue_has_index_before on commit drop as
select
  pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  )) as builder_md5,
  private_verification.brinesearch_issue97_active_graph_release_generation()
    as active_generation,
  (select count(*) from public.brinesearch_road_graph_builds) as build_count,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||pg_catalog.to_jsonb(build)::text,'|' order by build.id
  ),'')) from public.brinesearch_road_graph_builds build) as build_digest,
  (select count(*) from public.brinesearch_road_junctions) as junction_count,
  (select count(*) from public.brinesearch_road_junction_anchors) as anchor_count,
  (select count(*) from public.brinesearch_road_junction_memberships) as membership_count,
  (select count(*) from public.brinesearch_roads) as road_count,
  (select count(*) from public.brinesearch_road_identity_mappings) as mapping_count,
  (select count(*) from public.brinesearch_route_prep_steps) as route_step_count,
  (select count(*) from private_verification.brinesearch_route_reconciliation_receipts_issue97)
    as route_receipt_count,
  (select count(*) from private_verification.brinesearch_route_occurrence_receipts_issue97)
    as occurrence_receipt_count,
  (select count(*) from private_verification.brinesearch_google_route_receipts_issue97)
    as google_receipt_count,
  (select count(*) from public.brinesearch_driver_google_routes_public)
    as public_google_count,
  (select cutover_at from public.brinesearch_issue97_release_state where singleton)
    as cutover_at,
  (select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97)
    as queue_count,
  (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)
    as reconciliation_count,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    snapshot.snapshot_id::text||':'||snapshot.source_revision::text||':'||snapshot.row_count::text||':'||
      snapshot.searchable_count::text||':'||snapshot.content_sha256||':'||snapshot.publication_state,
    '|' order by snapshot.snapshot_id
  ),'')) from public.brinesearch_directory_snapshots_v18 snapshot)
    as directory_digest;

do $issue97_gue_has_index_preflight$
declare
  v_before tmp_issue97_gue_has_index_before%rowtype;
begin
  select * into strict v_before from tmp_issue97_gue_has_index_before;

  if v_before.builder_md5<>'06705f5b35a6d37151bb2c0dc5ade9bd'
     or v_before.active_generation<>'issue97-release-20260815-r2' then
    raise exception 'Issue #97 GUE/HAS endpoint index builder/generation changed: %/%',
      v_before.builder_md5,v_before.active_generation;
  end if;

  if exists(
    select 1 from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
      and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'
  ) then
    raise exception 'Issue #97 GUE/HAS endpoint index install refuses an active graph builder';
  end if;

  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or (select count(*) from public.brinesearch_road_graph_builds
         where state_code='OH' and status='active')<>19
     or (select count(*) from public.brinesearch_road_graph_builds
         where state_code='WV' and status='active')<>1
     or not exists(
       select 1 from public.brinesearch_road_graph_builds
       where id='44245144-3e39-45fe-907b-95e2b01b9c32'
         and state_code='OH' and county_code='GUE' and status='active'
         and graph_digest='d7a43bacbf54794d4e92d9e8ceca2e28'
         and source_revision_digest='b0cc4e8e3aaa7121cc39cc7935189664'
     )
     or not exists(
       select 1 from public.brinesearch_road_graph_builds
       where id='0870470a-11f8-4f33-8af3-08d6849d5f34'
         and state_code='OH' and county_code='HAS' and status='active'
         and graph_digest='fc53a1492a3eecab78a524dbadcddfe8'
         and source_revision_digest='ece929162c9063ea35a6a276de59a940'
     ) then
    raise exception 'Issue #97 GUE/HAS endpoint index graph checkpoint changed';
  end if;

  if (select count(*) from public.brinesearch_authoritative_supplemental_centerlines
      where active and state_code='OH' and county_code='GUE')<>5603
     or (select count(*) from public.brinesearch_authoritative_supplemental_centerlines
      where active and state_code='OH' and county_code='HAS')<>3191 then
    raise exception 'Issue #97 GUE/HAS active OGRIP source population changed';
  end if;

  if pg_catalog.to_regclass('public.brinesearch_supp_gue_start_geog_issue97_idx') is not null
     or pg_catalog.to_regclass('public.brinesearch_supp_gue_end_geog_issue97_idx') is not null
     or pg_catalog.to_regclass('public.brinesearch_supp_has_start_geog_issue97_idx') is not null
     or pg_catalog.to_regclass('public.brinesearch_supp_has_end_geog_issue97_idx') is not null
     or exists(select 1 from supabase_migrations.schema_migrations
       where version='20260824074500') then
    raise exception 'Issue #97 GUE/HAS endpoint index migration is already present or partial';
  end if;

  if v_before.public_google_count<>0 or v_before.cutover_at is not null
     or v_before.queue_count<>0 or v_before.reconciliation_count<>0 then
    raise exception 'Issue #97 GUE/HAS endpoint index authority baseline changed';
  end if;
end
$issue97_gue_has_index_preflight$;

create index brinesearch_supp_gue_start_geog_issue97_idx
on public.brinesearch_authoritative_supplemental_centerlines
using gist((
  extensions.st_startpoint(extensions.st_linemerge(geom))::extensions.geography
))
where active and state_code='OH' and county_code='GUE';

create index brinesearch_supp_gue_end_geog_issue97_idx
on public.brinesearch_authoritative_supplemental_centerlines
using gist((
  extensions.st_endpoint(extensions.st_linemerge(geom))::extensions.geography
))
where active and state_code='OH' and county_code='GUE';

create index brinesearch_supp_has_start_geog_issue97_idx
on public.brinesearch_authoritative_supplemental_centerlines
using gist((
  extensions.st_startpoint(extensions.st_linemerge(geom))::extensions.geography
))
where active and state_code='OH' and county_code='HAS';

create index brinesearch_supp_has_end_geog_issue97_idx
on public.brinesearch_authoritative_supplemental_centerlines
using gist((
  extensions.st_endpoint(extensions.st_linemerge(geom))::extensions.geography
))
where active and state_code='OH' and county_code='HAS';

do $issue97_verify_gue_has_endpoint_indexes$
declare
  v_before tmp_issue97_gue_has_index_before%rowtype;
  v_index record;
  v_seen integer:=0;
  v_expected_expression text;
  v_expected_predicate text;
begin
  select * into strict v_before from tmp_issue97_gue_has_index_before;

  for v_index in
    select index_class.relname,
      pg_catalog.pg_get_expr(index_row.indexprs,index_row.indrelid) as expression,
      pg_catalog.pg_get_expr(index_row.indpred,index_row.indrelid) as predicate,
      access_method.amname,index_row.indisvalid,index_row.indisready,index_row.indrelid
    from pg_catalog.pg_index index_row
    join pg_catalog.pg_class index_class on index_class.oid=index_row.indexrelid
    join pg_catalog.pg_am access_method on access_method.oid=index_class.relam
    where index_class.relname in (
      'brinesearch_supp_gue_start_geog_issue97_idx',
      'brinesearch_supp_gue_end_geog_issue97_idx',
      'brinesearch_supp_has_start_geog_issue97_idx',
      'brinesearch_supp_has_end_geog_issue97_idx'
    )
  loop
    v_seen:=v_seen+1;
    v_expected_expression:=case when pg_catalog.strpos(v_index.relname,'_start_')>0
      then '(st_startpoint(st_linemerge(geom)))::geography'
      else '(st_endpoint(st_linemerge(geom)))::geography' end;
    v_expected_predicate:=case when pg_catalog.strpos(v_index.relname,'_gue_')>0
      then '(active AND (state_code = ''OH''::text) AND (county_code = ''GUE''::text))'
      else '(active AND (state_code = ''OH''::text) AND (county_code = ''HAS''::text))' end;

    if v_index.amname<>'gist'
       or v_index.indrelid<>
         'public.brinesearch_authoritative_supplemental_centerlines'::pg_catalog.regclass
       or v_index.expression<>v_expected_expression
       or v_index.predicate<>v_expected_predicate
       or not v_index.indisvalid or not v_index.indisready then
      raise exception 'Issue #97 GUE/HAS endpoint index definition mismatch: %',v_index.relname;
    end if;
  end loop;
  if v_seen<>4 then
    raise exception 'Issue #97 GUE/HAS endpoint index install expected four indexes, found %',v_seen;
  end if;

  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
     )) is distinct from v_before.builder_md5
     or private_verification.brinesearch_issue97_active_graph_release_generation()
       is distinct from v_before.active_generation
     or (select count(*) from public.brinesearch_road_graph_builds)<>v_before.build_count
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       build.id::text||':'||pg_catalog.to_jsonb(build)::text,'|' order by build.id
     ),'')) from public.brinesearch_road_graph_builds build) is distinct from v_before.build_digest
     or (select count(*) from public.brinesearch_road_junctions)<>v_before.junction_count
     or (select count(*) from public.brinesearch_road_junction_anchors)<>v_before.anchor_count
     or (select count(*) from public.brinesearch_road_junction_memberships)<>v_before.membership_count
     or (select count(*) from public.brinesearch_roads)<>v_before.road_count
     or (select count(*) from public.brinesearch_road_identity_mappings)<>v_before.mapping_count
     or (select count(*) from public.brinesearch_route_prep_steps)<>v_before.route_step_count
     or (select count(*) from private_verification.brinesearch_route_reconciliation_receipts_issue97)
       <>v_before.route_receipt_count
     or (select count(*) from private_verification.brinesearch_route_occurrence_receipts_issue97)
       <>v_before.occurrence_receipt_count
     or (select count(*) from private_verification.brinesearch_google_route_receipts_issue97)
       <>v_before.google_receipt_count
     or (select count(*) from public.brinesearch_driver_google_routes_public)
       <>v_before.public_google_count
     or (select cutover_at from public.brinesearch_issue97_release_state where singleton)
       is distinct from v_before.cutover_at
     or (select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97)
       <>v_before.queue_count
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)
       <>v_before.reconciliation_count
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       snapshot.snapshot_id::text||':'||snapshot.source_revision::text||':'||snapshot.row_count::text||':'||
         snapshot.searchable_count::text||':'||snapshot.content_sha256||':'||snapshot.publication_state,
       '|' order by snapshot.snapshot_id
     ),'')) from public.brinesearch_directory_snapshots_v18 snapshot)
       is distinct from v_before.directory_digest then
    raise exception 'Issue #97 GUE/HAS endpoint indexes changed protected production state';
  end if;
end
$issue97_verify_gue_has_endpoint_indexes$;

comment on index public.brinesearch_supp_gue_start_geog_issue97_idx is
  'Issue #97 GUE-only planner support for unchanged exact 0.03 m OGRIP start-endpoint corroboration.';
comment on index public.brinesearch_supp_gue_end_geog_issue97_idx is
  'Issue #97 GUE-only planner support for unchanged exact 0.03 m OGRIP end-endpoint corroboration.';
comment on index public.brinesearch_supp_has_start_geog_issue97_idx is
  'Issue #97 HAS-only planner support for unchanged exact 0.03 m OGRIP start-endpoint corroboration.';
comment on index public.brinesearch_supp_has_end_geog_issue97_idx is
  'Issue #97 HAS-only planner support for unchanged exact 0.03 m OGRIP end-endpoint corroboration.';

select pg_catalog.jsonb_build_object(
  'issue',97,
  'scope','GUE/HAS OGRIP endpoint planner support',
  'indexesCreated',4,
  'builderMd5','06705f5b35a6d37151bb2c0dc5ade9bd',
  'graphSemanticsChanged',false,
  'graphRowsChanged',false,
  'routeRowsChanged',false,
  'publicGoogleRows',(select count(*) from public.brinesearch_driver_google_routes_public),
  'cutoverAt',(select cutover_at from public.brinesearch_issue97_release_state where singleton)
) as issue97_index_result;
