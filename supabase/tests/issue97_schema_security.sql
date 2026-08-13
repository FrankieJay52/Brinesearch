-- GitHub #97 post-migration schema, ACL and effective-function regression.
-- Safe on production: read-only and rolled back.
begin transaction read only;
set local lock_timeout='5s';
set local statement_timeout='120s';

do $issue97_schema_security$
declare
  relation_name text;
  function_signature text;
  definition text;
  inner_definition text;
  v_count integer;
  v_duplicate_count integer;
  v_digest text;
  v_counts jsonb;
  v_baseline record;
begin
  foreach relation_name in array array[
    'public.brinesearch_road_graph_counties',
    'public.brinesearch_road_source_datasets',
    'public.brinesearch_road_source_dataset_counties',
    'public.brinesearch_authoritative_road_identities',
    'public.brinesearch_authoritative_road_names',
    'public.brinesearch_road_source_ingest_runs',
    'public.brinesearch_road_source_ingest_pages',
    'public.brinesearch_authoritative_external_road_segments',
    'public.brinesearch_authoritative_road_nodes',
    'public.brinesearch_authoritative_supplemental_centerlines',
    'public.brinesearch_supplemental_centerline_identity_mappings',
    'public.brinesearch_supplemental_centerline_dispositions',
    'public.brinesearch_road_identity_mappings',
    'public.brinesearch_road_graph_builds',
    'public.brinesearch_road_junctions',
    'public.brinesearch_road_junction_anchors',
    'public.brinesearch_road_junction_memberships',
    'public.brinesearch_issue97_release_state',
    'public.brinesearch_authoritative_segment_identity_assignments',
    'private_verification.brinesearch_issue97_saved_road_reconciliation_runs',
    'private_verification.brinesearch_issue97_saved_road_release_baseline',
    'private_verification.brinesearch_issue97_saved_road_reconciliation',
    'private_verification.brinesearch_google_route_receipts_issue97',
    'private_verification.brinesearch_google_route_refresh_queue_issue97'
  ] loop
    if pg_catalog.to_regclass(relation_name) is null then
      raise exception '#97 relation is missing: %',relation_name;
    end if;
    if not exists(select 1 from pg_catalog.pg_class c
      where c.oid=pg_catalog.to_regclass(relation_name)
        and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception '#97 FORCE RLS is missing: %',relation_name;
    end if;
    if pg_catalog.has_table_privilege('anon',relation_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or pg_catalog.has_table_privilege('authenticated',relation_name,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception '#97 raw/table mutation privilege leaked: %',relation_name;
    end if;
    if pg_catalog.has_table_privilege('service_role',relation_name,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception '#97 service role bypasses controlled RPCs on %',relation_name;
    end if;
  end loop;

  if pg_catalog.has_table_privilege('anon','public.brinesearch_odot_road_catalog','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     or pg_catalog.has_table_privilege('authenticated','public.brinesearch_odot_road_catalog','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     or pg_catalog.has_table_privilege('service_role','public.brinesearch_odot_road_catalog','INSERT,UPDATE,DELETE,TRUNCATE') then
    raise exception '#97 ODOT raw catalog is not controlled-loader-only';
  end if;

  foreach function_signature in array array[
    'public.brinesearch_issue97_source_snapshot(text,text)',
    'public.brinesearch_issue97_begin_ingest(text,text,integer,jsonb)',
    'public.brinesearch_issue97_ingest_page(uuid,integer,integer)',
    'public.brinesearch_issue97_finalize_ingest(uuid,jsonb)',
    'public.brinesearch_issue97_fail_ingest(uuid,text,jsonb)',
    'public.brinesearch_issue97_refresh_exact_mappings()',
    'public.brinesearch_issue97_set_reviewed_identity_mapping(uuid,uuid,text,jsonb)',
    'public.brinesearch_issue97_rebuild_county_graph(text,text)',
    'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)',
    'public.brinesearch_issue97_refresh_saved_road_reconciliation()',
    'public.brinesearch_issue97_activate_cutover(jsonb)',
    'public.brinesearch_issue97_refresh_google_routes(uuid)',
    'public.brinesearch_issue97_google_route_current(uuid)',
    'public.brinesearch_authoritative_road_registry()',
    'public.brinesearch_authoritative_road_search(text,text,text,text,text,text,jsonb,integer)',
    'public.brinesearch_authoritative_road_detail(uuid)',
    'public.brinesearch_authoritative_road_connections(uuid,jsonb,integer)',
    'public.brinesearch_authoritative_road_connection_pair(uuid,uuid)',
    'public.brinesearch_authoritative_identities_for_road(uuid)',
    'public.brinesearch_authoritative_road_connections_for_canonical(uuid,jsonb,integer)',
    'public.brinesearch_route_step_boundary_candidates(uuid,uuid,jsonb,integer)',
    'public.brinesearch_get_structured_route_steps(uuid)',
    'public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)'
  ] loop
    if pg_catalog.to_regprocedure(function_signature) is null then
      raise exception '#97 function is missing: %',function_signature;
    end if;
  end loop;

  foreach function_signature in array array[
    'private_verification.brinesearch_issue97_graph_mapping_evidence(text,jsonb)',
    'private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2(uuid)',
    'private_verification.brinesearch_issue97_refresh_exact_mappings_non_oh(text,text)',
    'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,numeric)',
    'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)',
    'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,numeric,numeric,numeric)',
    'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)'
  ] loop
    if pg_catalog.to_regprocedure(function_signature) is null then
      raise exception '#97 private infrastructure function is missing: %',function_signature;
    end if;
    if pg_catalog.has_function_privilege('anon',function_signature,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',function_signature,'EXECUTE')
       or pg_catalog.has_function_privilege('service_role',function_signature,'EXECUTE') then
      raise exception '#97 private infrastructure function execution leaked: %',function_signature;
    end if;
    if function_signature in (
         'private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,double precision)',
         'private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,double precision,numeric,numeric)'
       ) and not exists(
         select 1
         from pg_catalog.pg_proc proc
         join pg_catalog.pg_namespace namespace on namespace.oid=proc.pronamespace
         join pg_catalog.pg_language language on language.oid=proc.prolang
         where proc.oid=pg_catalog.to_regprocedure(function_signature)
           and namespace.nspname='private_verification'
           and language.lanname='sql'
           and proc.provolatile='i'
           and not proc.prosecdef
           and proc.proconfig @> array['search_path=""']
           and pg_catalog.pg_get_userbyid(proc.proowner)='postgres'
       ) then
      raise exception '#97 WVDOT runtime overload metadata changed: %',function_signature;
    end if;
  end loop;

  if exists(select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where (p.proname like 'brinesearch_issue97%'
        or p.proname like 'brinesearch_authoritative_road%'
        or p.proname in ('brinesearch_route_step_boundary_candidates',
          'brinesearch_get_structured_route_steps','brinesearch_publish_structured_route'))
      and n.nspname in ('public','private_verification') and p.prosecdef
      and not coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']) then
    raise exception '#97 SECURITY DEFINER function lacks fixed empty search_path';
  end if;

  foreach function_signature in array array[
    'public.brinesearch_authoritative_road_registry()',
    'public.brinesearch_authoritative_road_search(text,text,text,text,text,text,jsonb,integer)',
    'public.brinesearch_authoritative_road_detail(uuid)',
    'public.brinesearch_authoritative_road_connections(uuid,jsonb,integer)',
    'public.brinesearch_authoritative_road_connection_pair(uuid,uuid)',
    'public.brinesearch_authoritative_identities_for_road(uuid)',
    'public.brinesearch_authoritative_road_connections_for_canonical(uuid,jsonb,integer)',
    'public.brinesearch_route_step_boundary_candidates(uuid,uuid,jsonb,integer)',
    'public.brinesearch_get_structured_route_steps(uuid)',
    'public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)'
  ] loop
    if not pg_catalog.has_function_privilege('authenticated',function_signature,'EXECUTE') then
      raise exception '#97 authenticated bounded RPC grant is missing: %',function_signature;
    end if;
    if pg_catalog.has_function_privilege('anon',function_signature,'EXECUTE') then
      raise exception '#97 anonymous function execution leaked: %',function_signature;
    end if;
  end loop;

  foreach function_signature in array array[
    'public.brinesearch_issue97_begin_ingest(text,text,integer,jsonb)',
    'public.brinesearch_issue97_ingest_page(uuid,integer,integer)',
    'public.brinesearch_issue97_finalize_ingest(uuid,jsonb)',
    'public.brinesearch_issue97_set_reviewed_identity_mapping(uuid,uuid,text,jsonb)',
    'public.brinesearch_issue97_rebuild_county_graph(text,text)',
    'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)',
    'public.brinesearch_issue97_refresh_saved_road_reconciliation()',
    'public.brinesearch_issue97_activate_cutover(jsonb)',
    'public.brinesearch_issue97_refresh_google_routes(uuid)'
  ] loop
    if not pg_catalog.has_function_privilege('service_role',function_signature,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',function_signature,'EXECUTE')
       or pg_catalog.has_function_privilege('anon',function_signature,'EXECUTE') then
      raise exception '#97 service-only function ACL failed: %',function_signature;
    end if;
  end loop;

  if pg_catalog.to_regclass('public.brinesearch_driver_google_routes_public') is null
     or not exists(select 1 from pg_catalog.pg_class c
       where c.oid='public.brinesearch_driver_google_routes_public'::regclass
         and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception '#97 public Google route projection is missing FORCE RLS';
  end if;
  if not pg_catalog.has_table_privilege('anon','public.brinesearch_driver_google_routes_public','SELECT')
     or not pg_catalog.has_table_privilege('authenticated','public.brinesearch_driver_google_routes_public','SELECT')
     or pg_catalog.has_table_privilege('anon','public.brinesearch_driver_google_routes_public','INSERT,UPDATE,DELETE,TRUNCATE')
     or pg_catalog.has_table_privilege('authenticated','public.brinesearch_driver_google_routes_public','INSERT,UPDATE,DELETE,TRUNCATE')
     or not exists(select 1 from pg_catalog.pg_policies p
       where p.schemaname='public' and p.tablename='brinesearch_driver_google_routes_public'
         and p.policyname='brinesearch_driver_google_routes_public_read_issue97') then
    raise exception '#97 public Google route projection ACL/policy is incomplete';
  end if;
  if not pg_catalog.has_function_privilege(
       'anon','public.brinesearch_issue97_google_route_current(uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_issue97_google_route_current(uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_issue97_google_route_current(uuid)','EXECUTE') then
    raise exception '#97 current-route predicate ACL is incomplete';
  end if;
  if exists(
    select 1
    from pg_catalog.pg_proc function_row
    cross join lateral pg_catalog.aclexplode(
      coalesce(function_row.proacl,pg_catalog.acldefault('f',function_row.proowner))
    ) acl
    where function_row.oid=
      'public.brinesearch_issue97_google_route_current(uuid)'::regprocedure
      and acl.grantee=0 and acl.privilege_type='EXECUTE'
  ) then
    raise exception '#97 generic PUBLIC execution leaked on current-route dispatcher';
  end if;
  if pg_catalog.to_regprocedure(
       'public.brinesearch_issue97_google_route_current_published_core(uuid)'
     ) is null
     or pg_catalog.has_function_privilege(
       'anon','public.brinesearch_issue97_google_route_current_published_core(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_issue97_google_route_current_published_core(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_issue97_google_route_current_published_core(uuid)','EXECUTE') then
    raise exception '#97 published-core route predicate remains directly executable';
  end if;
  if not exists(
       select 1
       from pg_catalog.pg_policy policy
       join pg_catalog.pg_depend dependency
         on dependency.classid='pg_catalog.pg_policy'::regclass
         and dependency.objid=policy.oid
         and dependency.refclassid='pg_catalog.pg_proc'::regclass
       where policy.polrelid='public.brinesearch_driver_google_routes_public'::regclass
         and policy.polname='brinesearch_driver_google_routes_public_read_issue97'
         and dependency.refobjid=
           'public.brinesearch_issue97_google_route_current(uuid)'::regprocedure
     )
     or exists(
       select 1
       from pg_catalog.pg_policy policy
       join pg_catalog.pg_depend dependency
         on dependency.classid='pg_catalog.pg_policy'::regclass
         and dependency.objid=policy.oid
         and dependency.refclassid='pg_catalog.pg_proc'::regclass
       where policy.polrelid='public.brinesearch_driver_google_routes_public'::regclass
         and policy.polname='brinesearch_driver_google_routes_public_read_issue97'
         and dependency.refobjid=
           'public.brinesearch_issue97_google_route_current_published_core(uuid)'::regprocedure
     ) then
    raise exception '#97 public Google-route policy is not bound only to the final dispatcher';
  end if;

  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.brinesearch_route_step_boundary_candidates(uuid,uuid,jsonb,integer)')
  ) into definition;
  if position('brinesearch_road_junction_anchors' in definition)=0
     or position('brinesearch_road_junction_memberships' in definition)=0
     or position('brinesearch_issue97_graph_build_sources_current' in definition)=0
     or position('st_dumppoints' in pg_catalog.lower(definition))>0 then
    raise exception '#97 effective boundary candidate RPC is not authoritative-graph-only';
  end if;
  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)')
  ) into definition;
  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.brinesearch_publish_structured_route_issue97_without_google(uuid,uuid,jsonb,bigint)'
    )
  ) into inner_definition;
  if position('brinesearch_publish_structured_route_issue97_without_google' in definition)=0
     or position('brinesearch_issue97_refresh_google_route' in definition)=0
     or position('entry_junction_anchor_id' in inner_definition)=0
     or position('brinesearch_issue97_graph_build_sources_current' in inner_definition)=0
     or position('st_dumppoints' in pg_catalog.lower(inner_definition))>0 then
    raise exception '#97 effective structured publisher has a geometry-proximity bypass';
  end if;
  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.brinesearch_get_structured_route_steps(uuid)')
  ) into definition;
  if position('entry_junction_id' in definition)=0 or position('junction_digest' in definition)=0 then
    raise exception '#97 structured getter does not round-trip graph provenance';
  end if;

  select count(*) into v_count from public.brinesearch_road_graph_counties where active;
  if v_count<>39 then raise exception '#97 schema security expected 39 active counties, found %',v_count; end if;
  select count(*) into v_count
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets d on d.id=scope.dataset_id and d.active
  where scope.active and scope.required_for_graph and scope.ingest_enabled;
  if v_count<>114 then raise exception '#97 schema security expected 114 required source scopes, found %',v_count; end if;

  if not exists(select 1 from pg_catalog.pg_indexes
      where schemaname='public' and indexname='brinesearch_junction_memberships_identity_order_idx')
     or not exists(select 1 from pg_catalog.pg_indexes
      where schemaname='public' and indexname='brinesearch_graph_build_scope_history_issue97_idx')
     or not exists(select 1 from pg_catalog.pg_indexes
      where schemaname='public' and indexname='brinesearch_nodes_finalize_issue97_idx') then
    raise exception '#97 graph/source ordering indexes are incomplete';
  end if;
end
$issue97_schema_security$;

rollback;
