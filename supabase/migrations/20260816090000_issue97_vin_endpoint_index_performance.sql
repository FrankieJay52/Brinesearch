-- GitHub #97 -- Vinton OGRIP endpoint-corroboration planner fix.
--
-- The r2 builder and its exact 0.03 m endpoint/set-equality contract are
-- unchanged. Production profiling proved that the two Ohio-wide endpoint GiST
-- indexes were not selected for Vinton's county-scoped joins: the plan rescanned
-- every active VIN OGRIP centerline once per candidate and again in the
-- conflicting-extra-identity anti-join. These narrowly scoped partial indexes
-- make the existing predicates indexable without changing builder SQL, source
-- truth, topology, tolerances, mappings, graph rows, release receipts or routes.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:vin-endpoint-index-install')
);

create temporary table issue97_vin_endpoint_index_before on commit drop as
select
  public.brinesearch_issue97_cutover_active() as cutover_active,
  (select count(*) from public.brinesearch_road_graph_builds) as build_count,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||pg_catalog.to_jsonb(build)::text,'|' order by build.id
  ),'')) from public.brinesearch_road_graph_builds build) as build_state_digest,
  (select count(*) from public.brinesearch_road_junctions) as junction_count,
  (select count(*) from public.brinesearch_road_junction_anchors) as anchor_count,
  (select count(*) from public.brinesearch_road_junction_memberships) as membership_count,
  (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)
    as reconciliation_count,
  (select count(*) from private_verification.brinesearch_google_route_receipts_issue97)
    as google_receipt_count,
  (select count(*) from public.brinesearch_driver_google_routes_public)
    as public_google_count,
  pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  )) as builder_md5,
  private_verification.brinesearch_issue97_active_graph_release_generation()
    as active_generation;

do $issue97_vin_endpoint_index_preflight$
declare
  v_before issue97_vin_endpoint_index_before%rowtype;
  v_required integer;
  v_current integer;
  v_car_current_mapping_digest text;
  v_release_versions text[]:=array[
    '20260814074500','20260814160000','20260814160050','20260814161000',
    '20260814161100','20260814161200','20260814161300','20260814161400',
    '20260814161500','20260814162000','20260814163000','20260814163050',
    '20260814163100','20260814163200','20260814163250','20260814163300',
    '20260814163400','20260814164000','20260814164100','20260814164200',
    '20260814164250','20260814164300'
  ];
begin
  select * into strict v_before from issue97_vin_endpoint_index_before;

  if v_before.cutover_active
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
  then
    raise exception 'Issue #97 VIN endpoint index install requires cutover OFF and staging zero';
  end if;
  if exists(
    select 1 from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
      and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'
  ) then
    raise exception 'Issue #97 VIN endpoint index install refuses an active graph builder';
  end if;
  if v_before.builder_md5<>'06705f5b35a6d37151bb2c0dc5ade9bd'
     or v_before.active_generation<>'issue97-release-20260815-r2'
     or (select count(*) from private_verification.brinesearch_issue97_graph_release_generations
         where active and generation_key='issue97-release-20260815-r2'
           and builder_definition_md5='06705f5b35a6d37151bb2c0dc5ade9bd')<>1
  then
    raise exception 'Issue #97 VIN endpoint index install builder/generation changed';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
      where version=any(v_release_versions))<>22
     or (select count(*) from supabase_migrations.schema_migrations
         where version='20260815090000')<>1
     or exists(select 1 from supabase_migrations.schema_migrations
         where version='20260816090000')
  then
    raise exception 'Issue #97 VIN endpoint index install requires base 22/22, r2 hotfix 1/1 and VIN index 0/1';
  end if;
  if v_before.reconciliation_count<>0 or v_before.public_google_count<>0
     or v_before.google_receipt_count<>9 then
    raise exception 'Issue #97 VIN endpoint index install requires reconciliation/publication unchanged';
  end if;

  select count(*)::integer,
    count(*) filter(where private_verification.brinesearch_issue97_dataset_scope_current(
      scope.dataset_id,scope.state_code,scope.county_code
    ))::integer
  into v_required,v_current
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset
    on dataset.id=scope.dataset_id and dataset.active
  where scope.active and scope.ingest_enabled and scope.required_for_graph
    and scope.state_code='OH';
  if v_required<>38 or v_current<>38 then
    raise exception 'Issue #97 VIN endpoint index install requires Ohio source scopes 38/38 current; found %/%',
      v_current,v_required;
  end if;

  if (select count(*) from public.brinesearch_road_graph_builds build
      where build.details->>'release_generation_key'='issue97-release-20260815-r2'
        and build.status='validated' and build.activated_at is null)<>17
     or (select count(*) from public.brinesearch_road_graph_builds build
      where build.details->>'release_generation_key'='issue97-release-20260815-r2'
        and build.status='validated' and build.activated_at is null
        and private_verification.brinesearch_issue97_graph_build_release_current(build.id))<>16
     or exists(select 1 from public.brinesearch_road_graph_builds build
      where build.details->>'release_generation_key'='issue97-release-20260815-r2'
        and (build.status<>'validated' or build.activated_at is not null))
  then
    raise exception 'Issue #97 VIN endpoint index install requires exact 17 inactive r2 / 16 current checkpoint';
  end if;
  if (select count(*) from public.brinesearch_road_graph_builds build
      where build.id='5420c208-163b-4514-9b34-0a1a96a43e47'::uuid
        and build.state_code='OH' and build.county_code='CAR'
        and build.status='validated' and build.activated_at is null
        and build.graph_digest='e9f4ed56bb2b1308b8b9913a751c78f5'
        and build.details->>'mapping_snapshot_digest'='00c7ac96038083e8765439bcf1c034b2'
        and not private_verification.brinesearch_issue97_graph_build_release_current(build.id))<>1
  then
    raise exception 'Issue #97 VIN endpoint index install CAR fail-closed checkpoint changed';
  end if;
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    current_map.identity_id::text||':'||current_map.fingerprint,
    ',' order by current_map.identity_id
  ),''))
  into v_car_current_mapping_digest
  from (
    select identities.identity_id,
      pg_catalog.md5(pg_catalog.concat_ws('|',
        identities.identity_id::text,
        coalesce(mapping.road_id::text,'unmapped'),
        coalesce(mapping.mapping_method,''),
        coalesce(private_verification.brinesearch_issue97_graph_mapping_evidence(
          mapping.mapping_method,mapping.evidence
        )::text,''),
        coalesce(road.canonical_name,''),
        coalesce(road.state,''),
        coalesce(road.county,''),
        coalesce(road.township,''),
        coalesce(road.road_type,''),
        coalesce(road.route_number,''),
        coalesce(road.source_record_id,''),
        coalesce(road.verification_status,''),
        coalesce(road.candidate_only::text,''),
        coalesce(road.geometry_status,''),
        coalesce(pg_catalog.md5(road.centerline_geojson::text),'')
      )) as fingerprint
    from (
      select distinct membership.identity_id
      from public.brinesearch_road_junction_memberships membership
      join public.brinesearch_road_junctions junction
        on junction.id=membership.junction_id
      where junction.build_id='5420c208-163b-4514-9b34-0a1a96a43e47'::uuid
    ) identities
    left join public.brinesearch_road_identity_mappings mapping
      on mapping.identity_id=identities.identity_id
     and mapping.mapping_status='verified'
    left join public.brinesearch_roads road on road.id=mapping.road_id
  ) current_map;
  if v_car_current_mapping_digest<>'a2a49ac4f11baa703f05a493cf331c35' then
    raise exception 'Issue #97 VIN endpoint index install CAR current mapping digest changed: %',
      v_car_current_mapping_digest;
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds build
      where build.details->>'release_generation_key'='issue97-release-20260815-r2'
        and build.state_code='OH' and build.county_code in ('VIN','WAS'))
  then
    raise exception 'Issue #97 VIN endpoint index install requires VIN unbuilt and WAS unstarted in r2';
  end if;

  if pg_catalog.to_regclass(
       'public.brinesearch_supp_vin_start_geog_issue97_idx'
     ) is not null
     or pg_catalog.to_regclass(
       'public.brinesearch_supp_vin_end_geog_issue97_idx'
     ) is not null
  then
    raise exception 'Issue #97 VIN endpoint indexes already exist without migration history';
  end if;
end
$issue97_vin_endpoint_index_preflight$;

create index brinesearch_supp_vin_start_geog_issue97_idx
on public.brinesearch_authoritative_supplemental_centerlines
using gist((
  extensions.st_startpoint(extensions.st_linemerge(geom))::extensions.geography
))
where active and state_code='OH' and county_code='VIN';

create index brinesearch_supp_vin_end_geog_issue97_idx
on public.brinesearch_authoritative_supplemental_centerlines
using gist((
  extensions.st_endpoint(extensions.st_linemerge(geom))::extensions.geography
))
where active and state_code='OH' and county_code='VIN';

do $issue97_verify_vin_endpoint_indexes$
declare
  v_before issue97_vin_endpoint_index_before%rowtype;
  v_index record;
  v_seen integer:=0;
begin
  select * into strict v_before from issue97_vin_endpoint_index_before;

  for v_index in
    select index_class.relname,
      pg_catalog.pg_get_expr(index_row.indexprs,index_row.indrelid) as expression,
      pg_catalog.pg_get_expr(index_row.indpred,index_row.indrelid) as predicate,
      access_method.amname,index_row.indisvalid,index_row.indisready,
      index_row.indrelid
    from pg_catalog.pg_index index_row
    join pg_catalog.pg_class index_class on index_class.oid=index_row.indexrelid
    join pg_catalog.pg_am access_method on access_method.oid=index_class.relam
    where index_class.relname in (
      'brinesearch_supp_vin_start_geog_issue97_idx',
      'brinesearch_supp_vin_end_geog_issue97_idx'
    )
  loop
    v_seen:=v_seen+1;
    if v_index.amname<>'gist'
       or v_index.indrelid<>
         'public.brinesearch_authoritative_supplemental_centerlines'::pg_catalog.regclass
       or v_index.predicate<>'(active AND (state_code = ''OH''::text) AND (county_code = ''VIN''::text))'
       or not v_index.indisvalid or not v_index.indisready
       or (v_index.relname='brinesearch_supp_vin_start_geog_issue97_idx'
         and v_index.expression<>'(st_startpoint(st_linemerge(geom)))::geography')
       or (v_index.relname='brinesearch_supp_vin_end_geog_issue97_idx'
         and v_index.expression<>'(st_endpoint(st_linemerge(geom)))::geography')
    then
      raise exception 'Issue #97 VIN endpoint index definition mismatch: %',v_index.relname;
    end if;
  end loop;
  if v_seen<>2 then
    raise exception 'Issue #97 VIN endpoint index install expected 2 exact indexes, found %',v_seen;
  end if;

  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
     )) is distinct from v_before.builder_md5
     or private_verification.brinesearch_issue97_active_graph_release_generation()
       is distinct from v_before.active_generation
     or public.brinesearch_issue97_cutover_active() is distinct from v_before.cutover_active
     or (select count(*) from public.brinesearch_road_graph_builds)<>v_before.build_count
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       build.id::text||':'||pg_catalog.to_jsonb(build)::text,'|' order by build.id
     ),'')) from public.brinesearch_road_graph_builds build)
       is distinct from v_before.build_state_digest
     or (select count(*) from public.brinesearch_road_junctions)<>v_before.junction_count
     or (select count(*) from public.brinesearch_road_junction_anchors)<>v_before.anchor_count
     or (select count(*) from public.brinesearch_road_junction_memberships)<>v_before.membership_count
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)
       <>v_before.reconciliation_count
     or (select count(*) from private_verification.brinesearch_google_route_receipts_issue97)
       <>v_before.google_receipt_count
     or (select count(*) from public.brinesearch_driver_google_routes_public)
       <>v_before.public_google_count
  then
    raise exception 'Issue #97 VIN endpoint index install changed protected production state';
  end if;
end
$issue97_verify_vin_endpoint_indexes$;

comment on index public.brinesearch_supp_vin_start_geog_issue97_idx is
  'Issue #97 VIN-only planner support for the unchanged exact 0.03 m OGRIP start-endpoint corroboration predicate.';
comment on index public.brinesearch_supp_vin_end_geog_issue97_idx is
  'Issue #97 VIN-only planner support for the unchanged exact 0.03 m OGRIP end-endpoint corroboration predicate.';
