begin;
set local statement_timeout='3min';
set local lock_timeout='5s';

do $v18_company_road_schema_contract$
declare
  v_publisher text;
  v_authorizer text;
  v_projection text;
  v_cached_projection text;
  v_driver text;
  v_page text;
  v_withdraw text;
  v_hash text;
  v_hash_after_mutation text;
  v_hash_definition text;
  v_owner_authority text;
  v_ordinal_constraint text;
  v_directory_snapshot_id uuid;
  v_historical_release_id uuid:=pg_catalog.gen_random_uuid();
  v_trigger_relations text[];
  v_expected_relations text[]:=array[
    'private_verification.brinesearch_driver_safety_facts_issue69',
    'private_verification.brinesearch_google_route_receipts_issue97',
    'private_verification.brinesearch_issue97_graph_release_generations',
    'private_verification.brinesearch_issue97_graph_release_qualifications',
    'private_verification.brinesearch_route_occurrence_geometry_receipts_issue97',
    'private_verification.brinesearch_route_occurrence_receipts_issue97',
    'private_verification.brinesearch_route_reconciliation_receipts_issue97',
    'private_verification.brinesearch_route_transition_receipts_issue97',
    'public.brinesearch_authoritative_external_road_segments',
    'public.brinesearch_authoritative_road_identities',
    'public.brinesearch_authoritative_road_names',
    'public.brinesearch_authoritative_segment_identity_assignments',
    'public.brinesearch_authoritative_supplemental_centerlines',
    'public.brinesearch_directory_snapshot_rows_v18',
    'public.brinesearch_directory_snapshots_v18',
    'public.brinesearch_odot_road_catalog',
    'public.brinesearch_road_graph_builds',
    'public.brinesearch_road_graph_counties',
    'public.brinesearch_road_identity_mappings',
    'public.brinesearch_road_junction_anchors',
    'public.brinesearch_road_junction_memberships',
    'public.brinesearch_road_junctions',
    'public.brinesearch_road_source_dataset_counties',
    'public.brinesearch_road_source_datasets',
    'public.brinesearch_road_source_ingest_pages',
    'public.brinesearch_road_source_ingest_runs',
    'public.brinesearch_roads',
    'public.brinesearch_route_prep',
    'public.brinesearch_route_prep_steps',
    'public.brinesearch_supplemental_centerline_dispositions',
    'public.brinesearch_supplemental_centerline_identity_mappings',
    'public.pad_verification_status',
    'public.pads',
    'public.public_pad_detail'
  ]::text[];
begin
  if not exists(
    select 1 from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname='brinesearch_company_road_overlay_snapshots_v18'
      and relation.relkind='r'
      and relation.relrowsecurity and relation.relforcerowsecurity
  ) or not exists(
    select 1 from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname='brinesearch_company_road_overlay_rows_v18'
      and relation.relkind='r'
      and relation.relrowsecurity and relation.relforcerowsecurity
  ) or not exists(
    select 1 from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='private_verification'
      and relation.relname='brinesearch_v18_company_road_overlay_releases'
      and relation.relkind='r'
      and relation.relrowsecurity and relation.relforcerowsecurity
  ) then
    raise exception 'V18 company-road overlay/release tables are missing FORCE RLS';
  end if;

  if pg_catalog.has_table_privilege(
       'anon','public.brinesearch_company_road_overlay_snapshots_v18','SELECT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated','public.brinesearch_company_road_overlay_rows_v18','SELECT'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.brinesearch_company_road_overlay_rows_v18','INSERT'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'private_verification.brinesearch_v18_company_road_overlay_releases',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'private_verification.brinesearch_v18_company_road_overlay_releases',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'private_verification.brinesearch_v18_company_road_overlay_releases',
       'INSERT'
     )
     or exists(
       select 1 from pg_catalog.pg_policy policy
       where policy.polrelid in (
         'public.brinesearch_company_road_overlay_snapshots_v18'::pg_catalog.regclass,
         'public.brinesearch_company_road_overlay_rows_v18'::pg_catalog.regclass
          ,'private_verification.brinesearch_v18_company_road_overlay_releases'::
            pg_catalog.regclass
       )
     ) then
    raise exception 'V18 company-road tables gained a direct browser/service path';
  end if;

  if not pg_catalog.has_function_privilege(
       'anon',
       'public.brinesearch_v18_company_road_overlay_page(uuid,text,integer,integer)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.brinesearch_v18_company_road_overlay_page(uuid,text,integer,integer)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.brinesearch_v18_authorize_company_road_overlay_release()',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.brinesearch_v18_authorize_company_road_overlay_release()',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'public.brinesearch_v18_authorize_company_road_overlay_release()',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'private_verification.brinesearch_v18_company_road_authority_definition_sha256()',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'private_verification.brinesearch_v18_company_road_authority_definition_sha256()',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'private_verification.brinesearch_v18_company_road_authority_definition_sha256()',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'private_verification.brinesearch_v18_owner_authority_current(uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'private_verification.brinesearch_v18_owner_authority_current(uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'private_verification.brinesearch_v18_owner_authority_current(uuid)',
       'EXECUTE'
     ) then
    raise exception 'V18 company-road RPC privilege boundary changed';
  end if;

  v_publisher:=pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()'::
      pg_catalog.regprocedure
    ),'[[:space:]]+','','g'));
  v_authorizer:=pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.pg_get_functiondef(
    'public.brinesearch_v18_authorize_company_road_overlay_release()'::
      pg_catalog.regprocedure
    ),'[[:space:]]+','','g'));
  v_projection:=pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_exact_route_projection(uuid,integer)'::
      pg_catalog.regprocedure
    ),'[[:space:]]+','','g'));
  v_cached_projection:=pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)'::
      pg_catalog.regprocedure
    ),'[[:space:]]+','','g'));
  v_driver:=pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.pg_get_functiondef(
    'public.brinesearch_v18_driver_pad_status(uuid)'::pg_catalog.regprocedure
    ),'[[:space:]]+','','g'));
  v_page:=pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.pg_get_functiondef(
    'public.brinesearch_v18_company_road_overlay_page(uuid,text,integer,integer)'::
      pg_catalog.regprocedure
    ),'[[:space:]]+','','g'));
  v_withdraw:=pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change()'::
      pg_catalog.regprocedure
    ),'[[:space:]]+','','g'));
  v_hash_definition:=pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_company_road_authority_definition_sha256()'::
      pg_catalog.regprocedure
    ),'[[:space:]]+','','g'));
  v_owner_authority:=pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_owner_authority_current(uuid)'::
      pg_catalog.regprocedure
    ),'[[:space:]]+','','g'));
  select pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.pg_get_constraintdef(constraint_row.oid,true),
    '[[:space:]]+','','g'
  )) into strict v_ordinal_constraint
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid=
    'public.brinesearch_company_road_overlay_rows_v18'::pg_catalog.regclass
    and constraint_row.conname=
      'brinesearch_company_road_overlay_row_ordinal_v18_check';
  if v_publisher not ilike '%securitydefiner%'
     or v_publisher not ilike '%setsearch_pathto''''%'
     or v_publisher ilike '%brinesearch_v18_driver_pad_status%'
     or v_publisher not ilike '%withprojectionasmaterialized%'
     or v_publisher not ilike '%brinesearch_v18_exact_route_projection%'
     or v_publisher not ilike '%ifv_candidate_route_count>5000%'
     or v_publisher not ilike '%v_prequalified_route_count>1000%'
     or v_publisher not ilike '%v_eligible_route_count<>v_prequalified_route_count%'
     or v_publisher not ilike '%v_scope_cache_count<>v_source_scope_count%'
     or v_publisher not ilike '%droptableifexistspg_temp.tmp_issue97_scope_current_cache%'
     or v_publisher not ilike '%brinesearch_v18_exact_route_projection_cached%'
     or v_publisher ilike '%brinesearch_v18_exact_route_projection(candidate%'
     or v_publisher not ilike '%selectrelease.*intostrictv_release%'
     or v_publisher not ilike '%release.approval_state=''approved''%'
     or v_publisher not ilike '%release.directory_snapshot_id=v_directory.snapshot_id%'
     or v_publisher not ilike '%release.authority_definition_sha256=v_authority_hash%'
     or v_publisher not ilike '%release.approved_at<=pg_catalog.clock_timestamp()%'
     or v_publisher not ilike '%release.expires_at>pg_catalog.clock_timestamp()%'
     or v_publisher not ilike
       '%private_verification.brinesearch_v18_owner_authority_current(v_release.approved_by)%'
     or v_publisher not ilike '%v_generated_at:=pg_catalog.clock_timestamp()%'
     or v_publisher not ilike '%v_publish_at:=pg_catalog.clock_timestamp()%'
     or pg_catalog.strpos(
       v_publisher,'v_generated_at:=pg_catalog.clock_timestamp()'
     )<=pg_catalog.strpos(v_publisher,'brinesearch:v18:company-road-overlay')
     or v_publisher not ilike
       '%selectsnapshot.*intostrictv_final_directory%snapshot.snapshot_id=v_directory.snapshot_id%snapshot.publication_state=''current''%snapshot.retained_untilisnull%'
     or v_publisher not ilike
       '%v_final_directory.source_revision<>v_directory.source_revision%'
     or v_publisher not ilike
       '%v_final_directory.content_sha256isdistinctfromv_directory.content_sha256%'
     or v_publisher not ilike
       '%v_final_authority_hash:=private_verification.brinesearch_v18_company_road_authority_definition_sha256()%'
     or v_publisher not ilike
       '%v_final_authority_hashisdistinctfromv_authority_hash%'
     or v_publisher not ilike
       '%v_release.directory_snapshot_id<>v_final_directory.snapshot_id%'
     or v_publisher not ilike
       '%v_release.authority_definition_sha256<>v_final_authority_hash%'
     or v_publisher not ilike '%v_release.approved_at>v_publish_at%'
     or v_publisher not ilike '%v_release.expires_at<=v_publish_at%'
     or v_publisher not ilike
       '%v_generated_at,v_generated_at,''withdrawn'',null%'
     or v_publisher not ilike
       '%setpublication_state=''current'',retained_until=null,published_at=v_publish_at%'
     or pg_catalog.strpos(
       v_publisher,
       'v_final_authority_hash:=private_verification.brinesearch_v18_company_road_authority_definition_sha256()'
     )>=pg_catalog.strpos(
       v_publisher,'v_publish_at:=pg_catalog.clock_timestamp()'
     )
     or pg_catalog.strpos(
       v_publisher,'v_publish_at:=pg_catalog.clock_timestamp()'
     )>=pg_catalog.strpos(
       v_publisher,
       'setpublication_state=''current'',retained_until=null,published_at=v_publish_at'
     )
     or v_publisher not ilike '%v_consume_at:=pg_catalog.clock_timestamp()%'
     or pg_catalog.strpos(
       v_publisher,
       'setpublication_state=''current'',retained_until=null,published_at=v_publish_at'
     )>=pg_catalog.strpos(
       v_publisher,'v_consume_at:=pg_catalog.clock_timestamp()'
     )
     or v_publisher not ilike '%v_max_selection_row_count>10000%'
     or v_publisher not ilike '%v_max_selection_point_count>250000%'
     or v_publisher not ilike
       '%pg_catalog.sum(extensions.st_npoints(row.part_geometry))%'
     or v_publisher not ilike '%setapproval_state=''consumed''%'
     or v_publisher not ilike '%consumed_at=v_consume_at%'
     or v_publisher not ilike
       '%authority_definition_sha256=v_final_authority_hash%'
     or v_publisher not ilike '%expires_at>v_consume_at%'
     or v_publisher not ilike
       '%private_verification.brinesearch_v18_owner_authority_current(approved_by)%'
     or v_publisher not ilike '%v_release_consumed_count<>1%'
     or v_publisher not ilike '%brinesearch_issue97_prepare_graph_release_current_cache%'
     or v_publisher not ilike '%brinesearch_issue97_dataset_scope_current_cached%'
     or v_publisher not ilike '%google.status=''ready''andgoogle.hold_reasonisnull%'
     or v_publisher not ilike '%approved_by_default%'
     or v_publisher not ilike '%candidate_only%'
     or v_publisher not ilike '%public_access_status=''public''%'
     or v_publisher not ilike '%drivable_status=''drivable''%'
     or v_publisher not ilike '%st_unaryunion%'
     or v_publisher not ilike '%st_intersection%'
     or v_publisher ilike '%structured_route_steps%'
     or v_publisher ilike '%name_only%'
     or v_publisher ilike '%fuzzy_name%'
     or v_publisher ilike '%nearest_road%' then
    raise exception 'V18 company-road publisher authority/dedupe boundary changed';
  end if;
  if v_authorizer not ilike '%securitydefiner%'
     or v_authorizer not ilike '%setsearch_pathto''''%'
     or v_authorizer not ilike '%auth.uid()%'
     or v_authorizer not ilike
       '%notprivate_verification.brinesearch_v18_owner_authority_current(v_actor)%'
     or v_authorizer not ilike '%snapshot.publication_state=''current''%'
     or v_authorizer not ilike '%v_approved_at:=pg_catalog.clock_timestamp()%'
     or v_authorizer not ilike
       '%v_expires_at:=v_approved_at+interval''15minutes''%'
     or pg_catalog.strpos(
       v_authorizer,'v_approved_at:=pg_catalog.clock_timestamp()'
     )<=pg_catalog.strpos(
       v_authorizer,'brinesearch:v18:company-road-overlay'
     )
     or v_authorizer not ilike '%insertintoprivate_verification.brinesearch_v18_company_road_overlay_releases%'
     or v_authorizer not ilike '%approval_state=''withdrawn''%'
     or v_authorizer ilike '%p_directory_snapshot_id%'
     or v_authorizer ilike '%p_authority_definition_sha256%' then
    raise exception 'V18 company-road owner release boundary changed';
  end if;
  if (pg_catalog.length(v_authorizer)-pg_catalog.length(pg_catalog.replace(
       v_authorizer,
       'private_verification.brinesearch_v18_owner_authority_current(v_actor)',
       ''
     )))/pg_catalog.length(
       'private_verification.brinesearch_v18_owner_authority_current(v_actor)'
     )<>2
     or not exists(
       select 1 from pg_catalog.pg_proc procedure
       where procedure.oid=
         'private_verification.brinesearch_v18_owner_authority_current(uuid)'::pg_catalog.regprocedure
         and procedure.provolatile='v'
     )
     or v_owner_authority not ilike '%securitydefiner%'
     or v_owner_authority not ilike '%setsearch_pathto''''%'
     or v_owner_authority not ilike '%frompublic.editor_accounts%'
     or v_owner_authority not ilike '%joinauth.users%'
     or v_owner_authority not ilike '%email_confirmed_atisnotnull%'
     or v_owner_authority not ilike '%''owner''=any%'
     or v_owner_authority not ilike '%account.role=''owner''%' then
    raise exception 'V18 fresh owner authority boundary changed';
  end if;
  if v_projection not ilike '%brinesearch_issue97_dataset_scope_current(%'
     or v_projection ilike '%brinesearch_issue97_dataset_scope_current_cached(%'
     or v_cached_projection not ilike '%brinesearch_issue97_dataset_scope_current_cached(%'
     or v_cached_projection ilike '%brinesearch_issue97_dataset_scope_current(%'
     or v_driver not ilike '%brinesearch_v18_exact_route_projection(%'
     or v_driver ilike '%brinesearch_v18_exact_route_projection_cached(%' then
    raise exception 'V18 company-road public/bulk currentness separation changed';
  end if;
  if not exists(
       select 1 from pg_catalog.pg_proc procedure
       where procedure.oid=
         'public.brinesearch_v18_company_road_overlay_page(uuid,text,integer,integer)'::pg_catalog.regprocedure
         and procedure.provolatile='v'
     )
     or v_page not ilike '%securitydefiner%'
     or v_page not ilike '%setsearch_pathto''''%'
     or v_page not ilike '%p_limit>500%'
     or v_page not ilike '%row.ordinal>p_after_ordinal%'
     or v_page not ilike '%v_snapshot.available_companies%'
     or v_page not ilike '%directorysnapshotid%'
     or v_page ilike '%array_agg(distinctrow.selection_key%'
     or v_page ilike '% offset %'
     or v_page not ilike '%invalid_company%'
     or v_page not ilike
       '%snapshot.retained_until>pg_catalog.statement_timestamp()%'
     or v_page not ilike '%authority_definition_sha256%'
     or v_page ilike '%hold_reason%'
     or v_page ilike '%graph_digest%'
     or v_page ilike '%route_prep_id%'
     or v_page ilike '%canonical_road_id%'
     or v_page ilike '%identity_id%' then
    raise exception 'V18 company-road page bound or private output changed';
  end if;
  if v_withdraw not ilike '%returnstrigger%'
     or v_withdraw not ilike '%securitydefiner%'
     or v_withdraw not ilike
       '%publication_statein(''current'',''retained'')%'
     or v_withdraw ilike '%retained_until<=%'
     or pg_catalog.strpos(
       v_withdraw,'brinesearch:v18:directory-snapshot'
     )=0
     or pg_catalog.strpos(
       v_withdraw,'brinesearch:v18:directory-snapshot'
     )>pg_catalog.strpos(
       v_withdraw,'brinesearch:v18:company-road-overlay'
     )
     or v_withdraw ilike '%insertinto%'
     or v_withdraw ilike '%deletefrom%'
     or v_withdraw ilike '%execute%' then
    raise exception 'V18 company-road invalidation gained writer scope';
  end if;

  if v_ordinal_constraint not ilike '%ordinal>=1%ordinal<=10000%'
     or exists(
       select 1
       from (values
         ('public.brinesearch_v18_authorize_company_road_overlay_release()'::
           pg_catalog.regprocedure),
         ('private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()'::
           pg_catalog.regprocedure),
         ('private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change()'::
           pg_catalog.regprocedure),
         ('public.brinesearch_v18_company_road_overlay_page(uuid,text,integer,integer)'::
           pg_catalog.regprocedure)
       ) required(procedure_oid)
       join pg_catalog.pg_proc procedure on procedure.oid=required.procedure_oid
       where not exists(
         select 1 from pg_catalog.unnest(procedure.proconfig) config(setting)
         where config.setting like 'statement_timeout=%'
           and config.setting<>'statement_timeout=0'
       ) or not exists(
         select 1 from pg_catalog.unnest(procedure.proconfig) config(setting)
         where config.setting like 'lock_timeout=%'
           and config.setting<>'lock_timeout=0'
       )
     ) then
    raise exception 'V18 company-road finite device/timeout contract changed';
  end if;

  if not exists(
       select 1 from pg_catalog.pg_proc procedure
       where procedure.oid=
         'private_verification.brinesearch_v18_company_road_authority_definition_sha256()'::pg_catalog.regprocedure
         and procedure.provolatile='v'
     )
     or v_hash_definition not ilike '%securitydefiner%'
     or v_hash_definition not ilike '%setsearch_pathto''''%'
     or v_hash_definition not ilike
       '%private_verification.brinesearch_v18_company_road_authority_definition_sha256()%'
     or v_hash_definition not ilike
       '%public.brinesearch_v18_authorize_company_road_overlay_release()%'
     or v_hash_definition not ilike
       '%private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()%'
     or v_hash_definition not ilike
       '%private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change()%'
     or v_hash_definition not ilike
       '%public.brinesearch_v18_company_road_overlay_page(uuid,text,integer,integer)%'
     or v_hash_definition not ilike
       '%private_verification.brinesearch_v18_owner_authority_current(uuid)%'
     or v_hash_definition not ilike '%auth.users%'
     or v_hash_definition not ilike '%public.editor_accounts%'
     or v_hash_definition not ilike
       '%private_verification.brinesearch_issue97_authoritative_road_segments_internal%'
     or v_hash_definition not ilike '%pg_catalog.pg_get_functiondef%'
     or v_hash_definition not ilike '%procedure.proacl%'
     or v_hash_definition not ilike '%relation.relrowsecurity%'
     or v_hash_definition not ilike '%relation.relforcerowsecurity%'
     or v_hash_definition not ilike '%relation.reloptions%'
     or v_hash_definition not ilike '%relation.relacl%'
     or v_hash_definition not ilike '%pg_catalog.pg_get_constraintdef%'
     or v_hash_definition not ilike '%pg_catalog.pg_policy%'
     or v_hash_definition not ilike '%pg_catalog.pg_get_triggerdef%'
     or v_hash_definition not ilike '%pg_catalog.pg_get_viewdef%' then
    raise exception 'V18 company-road canonical authority digest narrowed';
  end if;

  select pg_catalog.array_agg(
    namespace.nspname||'.'||relation.relname
    order by namespace.nspname,relation.relname
  ) into v_trigger_relations
  from pg_catalog.pg_trigger trigger
  join pg_catalog.pg_class relation on relation.oid=trigger.tgrelid
  join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
  join pg_catalog.pg_proc proc on proc.oid=trigger.tgfoid
  join pg_catalog.pg_namespace proc_namespace
    on proc_namespace.oid=proc.pronamespace
  where trigger.tgname='brinesearch_v18_company_road_overlay_invalidate'
    and not trigger.tgisinternal
    and trigger.tgenabled='O'
    and proc_namespace.nspname='private_verification'
    and proc.proname=
      'brinesearch_v18_withdraw_company_road_overlay_on_source_change'
    and pg_catalog.pg_get_function_identity_arguments(proc.oid)=''
    and trigger.tgnargs=0 and trigger.tgqual is null
    and (trigger.tgtype&1)=0
    and (trigger.tgtype&2)=0
    and (trigger.tgtype&4)=4
    and (trigger.tgtype&8)=8
    and (trigger.tgtype&16)=16
    and (trigger.tgtype&32)=32
    and (trigger.tgtype&64)=0;
  if v_trigger_relations is distinct from v_expected_relations then
    raise exception 'V18 company-road exhaustive invalidation set changed: %',
      v_trigger_relations;
  end if;

  v_hash:=private_verification.
    brinesearch_v18_company_road_authority_definition_sha256();
  if v_hash!~'^[0-9a-f]{64}$' then
    raise exception 'V18 company-road authority definition hash failed';
  end if;

  execute
    'alter function private_verification.'||
    'brinesearch_v18_refresh_company_road_overlay_snapshot() '||
    'set statement_timeout to ''13min''';
  v_hash_after_mutation:=private_verification.
    brinesearch_v18_company_road_authority_definition_sha256();
  if v_hash_after_mutation is not distinct from v_hash then
    raise exception 'V18 authority digest ignored publisher definition mutation';
  end if;
  execute
    'alter function private_verification.'||
    'brinesearch_v18_refresh_company_road_overlay_snapshot() '||
    'set statement_timeout to ''14min''';
  v_hash_after_mutation:=private_verification.
    brinesearch_v18_company_road_authority_definition_sha256();
  if v_hash_after_mutation is distinct from v_hash then
    raise exception 'V18 authority digest did not restore deterministically';
  end if;

  select snapshot.snapshot_id into strict v_directory_snapshot_id
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.publication_state='current';
  insert into private_verification.brinesearch_v18_company_road_overlay_releases(
    release_id,directory_snapshot_id,authority_definition_sha256,
    approval_state,approved_by,approved_at,expires_at,
    consumed_at,withdrawn_at,overlay_snapshot_id,approval_receipt_sha256
  ) values(
    v_historical_release_id,v_directory_snapshot_id,v_hash,'withdrawn',
    pg_catalog.gen_random_uuid(),
    pg_catalog.statement_timestamp()-interval '2 hours',
    pg_catalog.statement_timestamp()-interval '1 hour 45 minutes',
    null,pg_catalog.statement_timestamp()-interval '1 hour 30 minutes',null,
    pg_catalog.repeat('d',64)
  );
  if exists(
    select 1
    from private_verification.brinesearch_v18_company_road_overlay_releases
    where approval_state='approved'
  ) then
    raise exception 'V18 company-road migration installed an unauthorized release';
  end if;
  if not exists(
    select 1
    from private_verification.brinesearch_v18_company_road_overlay_releases
    where release_id=v_historical_release_id
      and approval_state='withdrawn'
      and withdrawn_at is not null
  ) then
    raise exception 'V18 historical release proof was not retained';
  end if;
  if not private_verification.brinesearch_v18_company_road_geometry_is_safe(
    '{"type":"LineString","coordinates":[[-77.95,39.45],[-77.90,39.45]]}'::jsonb
  )
     or private_verification.brinesearch_v18_company_road_geometry_is_safe(
       '{"type":"LineString","coordinates":[[-100,39],[-99,39]]}'::jsonb
     )
     or private_verification.brinesearch_v18_company_road_geometry_is_safe(
       '{"type":"Point","coordinates":[-77.95,39.45]}'::jsonb
     ) then
    raise exception 'V18 company-road service-area geometry guard failed';
  end if;
end;
$v18_company_road_schema_contract$;

do $v18_company_road_synthetic_seed$
declare
  v_directory_snapshot_id uuid;
  v_snapshot_id uuid:='10000000-0000-4000-8000-000000000018'::uuid;
  v_expired_snapshot_id uuid:='20000000-0000-4000-8000-000000000018'::uuid;
  v_retained_snapshot_id uuid:='21000000-0000-4000-8000-000000000018'::uuid;
  v_hash text;
begin
  select snapshot.snapshot_id into strict v_directory_snapshot_id
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.publication_state='current';
  v_hash:=private_verification.
    brinesearch_v18_company_road_authority_definition_sha256();

  update public.brinesearch_company_road_overlay_snapshots_v18
  set publication_state='withdrawn',retained_until=null
  where publication_state='current';

  insert into public.brinesearch_company_road_overlay_snapshots_v18(
    snapshot_id,directory_snapshot_id,schema_version,source_revision,
    generated_at,published_at,publication_state,retained_until,row_count,
    all_row_count,company_row_count,company_count,
    available_companies,authority_definition_sha256,content_sha256
  ) values(
    v_snapshot_id,v_directory_snapshot_id,1,900000001,
    pg_catalog.statement_timestamp(),pg_catalog.statement_timestamp(),
    'current',null,3,1,2,2,array['Alpha Energy','Beta Energy'],
    v_hash,pg_catalog.repeat('a',64)
  ),(
    v_expired_snapshot_id,v_directory_snapshot_id,1,900000000,
    pg_catalog.statement_timestamp()-interval '2 hours',
    pg_catalog.statement_timestamp()-interval '2 hours',
    'retained',pg_catalog.statement_timestamp()-interval '1 hour',
    3,1,2,2,array['Alpha Energy','Beta Energy'],
    v_hash,pg_catalog.repeat('b',64)
  ),(
    v_retained_snapshot_id,v_directory_snapshot_id,1,899999999,
    pg_catalog.statement_timestamp()-interval '5 minutes',
    pg_catalog.statement_timestamp()-interval '5 minutes',
    'retained',pg_catalog.statement_timestamp()+interval '10 minutes',
    3,1,2,2,array['Alpha Energy','Beta Energy'],
    v_hash,pg_catalog.repeat('e',64)
  );

  insert into public.brinesearch_company_road_overlay_rows_v18(
    snapshot_id,selection_kind,selection_key,ordinal,display_names,
    verified_designations,company_labels,state_codes,county_names,
    geometry,length_miles
  ) values
  (
    v_snapshot_id,'all','',1,array['Shepherdstown Road'],array['CR 64'],
    array['Alpha Energy','Beta Energy'],array['WV'],array['Berkeley'],
    '{"type":"LineString","coordinates":[[-77.95,39.45],[-77.90,39.45]]}'::jsonb,
    2.650000
  ),
  (
    v_snapshot_id,'company','Alpha Energy',1,
    array['Shepherdstown Road'],array['CR 64'],array['Alpha Energy'],
    array['WV'],array['Berkeley'],
    '{"type":"LineString","coordinates":[[-77.95,39.45],[-77.925,39.45]]}'::jsonb,
    1.325000
  ),
  (
    v_snapshot_id,'company','Beta Energy',1,
    array['Shepherdstown Road'],array['CR 64'],array['Beta Energy'],
    array['WV'],array['Berkeley'],
    '{"type":"LineString","coordinates":[[-77.925,39.45],[-77.90,39.45]]}'::jsonb,
    1.325000
  );

  insert into public.brinesearch_company_road_overlay_rows_v18(
    snapshot_id,selection_kind,selection_key,ordinal,display_names,
    verified_designations,company_labels,state_codes,county_names,
    geometry,length_miles
  )
  select v_expired_snapshot_id,row.selection_kind,row.selection_key,row.ordinal,
    row.display_names,row.verified_designations,row.company_labels,
    row.state_codes,row.county_names,row.geometry,row.length_miles
  from public.brinesearch_company_road_overlay_rows_v18 row
  where row.snapshot_id=v_snapshot_id;

  insert into public.brinesearch_company_road_overlay_rows_v18(
    snapshot_id,selection_kind,selection_key,ordinal,display_names,
    verified_designations,company_labels,state_codes,county_names,
    geometry,length_miles
  )
  select v_retained_snapshot_id,row.selection_kind,row.selection_key,row.ordinal,
    row.display_names,row.verified_designations,row.company_labels,
    row.state_codes,row.county_names,row.geometry,row.length_miles
  from public.brinesearch_company_road_overlay_rows_v18 row
  where row.snapshot_id=v_snapshot_id;
end;
$v18_company_road_synthetic_seed$;

set local role anon;

do $v18_company_road_public_page_contract$
declare
  v_all jsonb;
  v_company jsonb;
  v_retained jsonb;
  v_directory_snapshot_id uuid;
  v_snapshot_id uuid:='10000000-0000-4000-8000-000000000018'::uuid;
  v_expired_snapshot_id uuid:='20000000-0000-4000-8000-000000000018'::uuid;
  v_retained_snapshot_id uuid:='21000000-0000-4000-8000-000000000018'::uuid;
begin
  select snapshot.snapshot_id into strict v_directory_snapshot_id
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.publication_state='current';
  v_all:=public.brinesearch_v18_company_road_overlay_page(null,null,0,1);
  if v_all ? 'error'
     or v_all#>>'{selection,kind}'<>'all'
     or v_all#>'{selection,company}' is distinct from 'null'::jsonb
     or v_all#>>'{snapshot,snapshotId}'<>v_snapshot_id::text
     or v_all#>>'{snapshot,directorySnapshotId}'<>v_directory_snapshot_id::text
     or v_all#>>'{snapshot,rowCount}'<>'1'
     or pg_catalog.jsonb_array_length(v_all->'availableCompanies')<>2
     or pg_catalog.jsonb_array_length(v_all->'rows')<>1
     or v_all#>>'{rows,0,companyLabel}' is not null
     or pg_catalog.jsonb_array_length(v_all#>'{rows,0,companies}')<>2
     or v_all#>>'{rows,0,displayNames,0}'<>'Shepherdstown Road'
     or v_all#>>'{rows,0,verifiedDesignations,0}'<>'CR 64'
     or v_all#>>'{rows,0,geometry,type}'<>'LineString'
     or v_all#>>'{page,complete}'<>'true' then
    raise exception 'V18 All approved-road page failed: %',v_all;
  end if;

  v_company:=public.brinesearch_v18_company_road_overlay_page(
    v_snapshot_id,'Alpha Energy',0,1
  );
  if v_company ? 'error'
     or v_company#>>'{selection,kind}'<>'company'
     or v_company#>>'{selection,company}'<>'Alpha Energy'
     or pg_catalog.jsonb_array_length(v_company->'rows')<>1
     or v_company#>>'{rows,0,companyLabel}'<>'Alpha Energy'
     or v_company#>>'{rows,0,companies,0}'<>'Alpha Energy'
     or v_company#>>'{page,complete}'<>'true' then
    raise exception 'V18 exact company approved-road page failed: %',v_company;
  end if;

  v_retained:=public.brinesearch_v18_company_road_overlay_page(
    v_retained_snapshot_id,null,0,1
  );
  if v_retained ? 'error'
     or v_retained#>>'{snapshot,snapshotId}'<>v_retained_snapshot_id::text
     or pg_catalog.jsonb_array_length(v_retained->'rows')<>1 then
    raise exception 'V18 ordinary retained snapshot was not readable: %',v_retained;
  end if;

  if public.brinesearch_v18_company_road_overlay_page(
       v_snapshot_id,'alpha energy',0,250
     )->>'error'<>'invalid_company'
     or public.brinesearch_v18_company_road_overlay_page(
       v_snapshot_id,' Alpha Energy',0,250
     )->>'error'<>'invalid_company'
     or public.brinesearch_v18_company_road_overlay_page(
       v_snapshot_id,'Missing Energy',0,250
     )->>'error'<>'invalid_company'
     or public.brinesearch_v18_company_road_overlay_page(
       v_snapshot_id,null,-1,250
     )->>'error'<>'invalid_cursor'
     or public.brinesearch_v18_company_road_overlay_page(
       v_snapshot_id,null,2,250
     )->>'error'<>'invalid_cursor'
     or public.brinesearch_v18_company_road_overlay_page(
       v_snapshot_id,null,0,501
     )->>'error'<>'invalid_limit'
     or public.brinesearch_v18_company_road_overlay_page(
       v_expired_snapshot_id,null,0,250
     )->>'error'<>'snapshot_expired' then
    raise exception 'V18 company-road rejected-input/retention contract failed';
  end if;

  if v_all::text~*'(routePrepId|roadId|identityId|graphBuildId|holdReason|receiptDigest|dependencyDigest|graphDigest|manifestDigest|padId)'
     or v_company::text~*'(routePrepId|roadId|identityId|graphBuildId|holdReason|receiptDigest|dependencyDigest|graphDigest|manifestDigest|padId)'
     or v_retained::text~*'(routePrepId|roadId|identityId|graphBuildId|holdReason|receiptDigest|dependencyDigest|graphDigest|manifestDigest|padId)' then
    raise exception 'V18 company-road public response leaked private authority';
  end if;
end;
$v18_company_road_public_page_contract$;

reset role;

do $v18_company_road_invalidation_contract$
declare
  v_response jsonb;
  v_directory_snapshot_id uuid;
  v_hash text;
  v_release_id uuid:='30000000-0000-4000-8000-000000000018'::uuid;
begin
  select snapshot.snapshot_id into strict v_directory_snapshot_id
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.publication_state='current';
  v_hash:=private_verification.
    brinesearch_v18_company_road_authority_definition_sha256();
  insert into private_verification.brinesearch_v18_company_road_overlay_releases(
    release_id,directory_snapshot_id,authority_definition_sha256,
    approval_state,approved_by,approved_at,expires_at,
    consumed_at,withdrawn_at,overlay_snapshot_id,approval_receipt_sha256
  ) values(
    v_release_id,v_directory_snapshot_id,v_hash,'approved',
    '40000000-0000-4000-8000-000000000018'::uuid,
    pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp()+interval '15 minutes',
    null,null,null,pg_catalog.repeat('c',64)
  );
  -- Statement-level triggers fire even for a zero-row source statement. The
  -- transaction rolls back, so the live directory and overlay are unchanged.
  update public.brinesearch_directory_snapshot_rows_v18
  set updated_at=updated_at
  where false;
  if exists(
    select 1 from public.brinesearch_company_road_overlay_snapshots_v18
    where publication_state in ('current','retained')
  ) then
    raise exception
      'V18 company-road source mutation did not withdraw current and retained';
  end if;
  if not exists(
    select 1
    from private_verification.brinesearch_v18_company_road_overlay_releases
    where release_id=v_release_id and approval_state='withdrawn'
      and withdrawn_at is not null and consumed_at is null
      and overlay_snapshot_id is null
  ) then
    raise exception 'V18 company-road source mutation did not revoke pending release';
  end if;
  v_response:=public.brinesearch_v18_company_road_overlay_page(null,null,0,250);
  if v_response->>'error'<>'overlay_unavailable' then
    raise exception 'V18 company-road page did not fail closed after invalidation: %',
      v_response;
  end if;
end;
$v18_company_road_invalidation_contract$;

rollback;
