begin read only;
set local statement_timeout='2min';
set local lock_timeout='5s';

do $v18_schema_contract$
declare
  v_snapshot record;
  v_columns text[];
  v_view_options text[];
  v_driver_definition text;
  v_owner_definition text;
  v_projection_definition text;
  v_google_classifier_definition text;
  v_publisher_definition text;
  v_withdraw_definition text;
  v_snapshot_policy text;
  v_row_policy text;
begin
  if pg_catalog.to_regclass('public.brinesearch_directory_snapshots_v18') is null
     or pg_catalog.to_regclass('public.brinesearch_directory_snapshot_rows_v18') is null
     or pg_catalog.to_regclass('public.brinesearch_directory_current_v18') is null then
    raise exception 'V18 directory relations are missing';
  end if;
  if pg_catalog.to_regprocedure(
       'public.brinesearch_v18_directory_page(uuid,integer,integer)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.brinesearch_v18_driver_pad_status(uuid)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.brinesearch_v18_owner_pad_status(uuid)'
     ) is null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_refresh_directory_snapshot()'
     ) is null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_exact_route_projection(uuid,integer)'
     ) is null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_public_google_status(boolean,boolean,text,text)'
     ) is null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change()'
     ) is null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_safe_directory_text(text,text)'
     ) is null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_safe_directory_array(text[],text,integer)'
     ) is null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_valid_right_continuation(text,text,text,text,integer,jsonb,text,text,uuid)'
     ) is null then
    raise exception 'V18 directory/status functions are missing';
  end if;

  if not exists(
       select 1 from pg_catalog.pg_class relation
       where relation.oid='public.brinesearch_directory_snapshots_v18'::pg_catalog.regclass
         and relation.relrowsecurity and relation.relforcerowsecurity
     )
     or not exists(
       select 1 from pg_catalog.pg_class relation
       where relation.oid='public.brinesearch_directory_snapshot_rows_v18'::pg_catalog.regclass
         and relation.relrowsecurity and relation.relforcerowsecurity
     ) then
    raise exception 'V18 public snapshot tables are not FORCE RLS';
  end if;

  if (select count(*) from pg_catalog.pg_policy policy
      where policy.polrelid='public.brinesearch_directory_snapshots_v18'::pg_catalog.regclass
        and policy.polcmd='r')<>1
     or (select count(*) from pg_catalog.pg_policy policy
      where policy.polrelid='public.brinesearch_directory_snapshot_rows_v18'::pg_catalog.regclass
        and policy.polcmd='r')<>1 then
    raise exception 'V18 public snapshot SELECT policy set changed';
  end if;

  select pg_catalog.pg_get_expr(policy.polqual,policy.polrelid)
  into strict v_snapshot_policy
  from pg_catalog.pg_policy policy
  where policy.polrelid='public.brinesearch_directory_snapshots_v18'::pg_catalog.regclass
    and policy.polcmd='r';
  select pg_catalog.pg_get_expr(policy.polqual,policy.polrelid)
  into strict v_row_policy
  from pg_catalog.pg_policy policy
  where policy.polrelid='public.brinesearch_directory_snapshot_rows_v18'::pg_catalog.regclass
    and policy.polcmd='r';
  if v_snapshot_policy not ilike '%retained_until%statement_timestamp()%'
     or v_row_policy not ilike '%retained_until%statement_timestamp()%' then
    raise exception 'V18 retained-snapshot expiry is not enforced by both RLS policies';
  end if;

  if not pg_catalog.has_table_privilege(
       'anon','public.brinesearch_directory_snapshots_v18','SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'authenticated','public.brinesearch_directory_snapshot_rows_v18','SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'anon','public.brinesearch_directory_current_v18','SELECT'
     )
     or pg_catalog.has_table_privilege(
       'anon','public.brinesearch_directory_snapshots_v18','INSERT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated','public.brinesearch_directory_snapshot_rows_v18','UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.brinesearch_directory_snapshots_v18','DELETE'
     ) then
    raise exception 'V18 snapshot table ACL is not SELECT-only';
  end if;

  select relation.reloptions into v_view_options
  from pg_catalog.pg_class relation
  where relation.oid='public.brinesearch_directory_current_v18'::pg_catalog.regclass;
  if not coalesce('security_invoker=true'=any(v_view_options),false)
     or not coalesce('security_barrier=true'=any(v_view_options),false) then
    raise exception 'V18 current snapshot view lost invoker/barrier security';
  end if;

  if not pg_catalog.has_function_privilege(
       'anon','public.brinesearch_v18_directory_page(uuid,integer,integer)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'anon','public.brinesearch_v18_driver_pad_status(uuid)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon','public.brinesearch_v18_owner_pad_status(uuid)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_v18_owner_pad_status(uuid)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'private_verification.brinesearch_v18_refresh_directory_snapshot()',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'private_verification.brinesearch_v18_refresh_directory_snapshot()',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'private_verification.brinesearch_v18_exact_route_projection(uuid,integer)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'private_verification.brinesearch_v18_exact_route_projection(uuid,integer)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'private_verification.brinesearch_v18_public_google_status(boolean,boolean,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'private_verification.brinesearch_v18_public_google_status(boolean,boolean,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change()',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'private_verification.brinesearch_v18_safe_directory_text(text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'private_verification.brinesearch_v18_safe_directory_array(text[],text,integer)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'private_verification.brinesearch_v18_valid_right_continuation(text,text,text,text,integer,jsonb,text,text,uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'private_verification.brinesearch_v18_valid_right_continuation(text,text,text,text,integer,jsonb,text,text,uuid)',
       'EXECUTE'
     ) then
    raise exception 'V18 function ACL boundary is incorrect';
  end if;

  if not pg_catalog.has_schema_privilege(
       'service_role','private_verification','USAGE'
     )
     or pg_catalog.has_schema_privilege(
       'service_role','private_verification','CREATE'
     )
     or pg_catalog.has_schema_privilege(
       'anon','private_verification','USAGE'
     )
     or pg_catalog.has_schema_privilege(
       'authenticated','private_verification','USAGE'
     ) then
    raise exception 'V18 private schema least-privilege boundary is incorrect';
  end if;

  if exists(
    select 1
    from pg_catalog.pg_proc procedure
    cross join lateral pg_catalog.aclexplode(coalesce(
      procedure.proacl,pg_catalog.acldefault('f',procedure.proowner)
    )) acl
    where procedure.oid in (
      'public.brinesearch_v18_directory_page(uuid,integer,integer)'::pg_catalog.regprocedure,
      'public.brinesearch_v18_driver_pad_status(uuid)'::pg_catalog.regprocedure,
      'public.brinesearch_v18_owner_pad_status(uuid)'::pg_catalog.regprocedure,
      'private_verification.brinesearch_v18_refresh_directory_snapshot()'::pg_catalog.regprocedure,
      'private_verification.brinesearch_v18_exact_route_projection(uuid,integer)'::pg_catalog.regprocedure,
      'private_verification.brinesearch_v18_public_google_status(boolean,boolean,text,text)'::pg_catalog.regprocedure,
      'private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change()'::pg_catalog.regprocedure,
      'private_verification.brinesearch_v18_safe_directory_text(text,text)'::pg_catalog.regprocedure,
      'private_verification.brinesearch_v18_safe_directory_array(text[],text,integer)'::pg_catalog.regprocedure,
      'private_verification.brinesearch_v18_valid_right_continuation(text,text,text,text,integer,jsonb,text,text,uuid)'::pg_catalog.regprocedure
    )
      and acl.grantee=0 and acl.privilege_type='EXECUTE'
  ) then
    raise exception 'V18 function EXECUTE leaked through PUBLIC';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_v18_driver_pad_status(uuid)'::pg_catalog.regprocedure
  ) into v_driver_definition;
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_v18_owner_pad_status(uuid)'::pg_catalog.regprocedure
  ) into v_owner_definition;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_exact_route_projection(uuid,integer)'::pg_catalog.regprocedure
  ) into v_projection_definition;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_public_google_status(boolean,boolean,text,text)'::pg_catalog.regprocedure
  ) into v_google_classifier_definition;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_refresh_directory_snapshot()'::pg_catalog.regprocedure
  ) into v_publisher_definition;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change()'::pg_catalog.regprocedure
  ) into v_withdraw_definition;

  if v_driver_definition not ilike '%security definer%'
     or v_driver_definition not ilike '%set search_path TO ''''%'
     or v_driver_definition not ilike '%brinesearch_issue97_google_route_current%'
     or v_driver_definition not ilike '%exact_geometry_count%road_occurrence_count%'
     or v_driver_definition not ilike '%v_receipt.route_status=''route_ready''%'
     or v_driver_definition not ilike '%v_receipt.stage=''ready''%'
     or v_driver_definition not ilike
       '%v_receipt.source_sequence_hash=v_route.source_sequence_hash%'
     or v_driver_definition not ilike '%brinesearch_v18_exact_route_projection%'
     or v_driver_definition not ilike '%brinesearch_v18_public_google_status%'
     or v_driver_definition not ilike '%v_route_publishable:=true%'
     or v_driver_definition not ilike
       '%when v_route_publishable%then v_public_geometry%'
     or v_driver_definition not ilike
       '%when v_route_publishable%then v_public_steps%'
     or v_driver_definition not ilike
       '%v_route_exact and v_graph_state=''active_current''%and v_destination_available%'
     or v_driver_definition not ilike '%v_pad.latitude between 37 and 43%'
     or v_driver_definition not ilike '%v_pad.longitude between -84 and -74%'
     or v_driver_definition ilike '%transition_google_dark_current%'
     or v_driver_definition ilike '%holdReason%'
     or v_driver_definition ilike '%manifestDigest%'
     or v_driver_definition ilike '%dependencyDigest%'
     or v_driver_definition ilike '%buildId%'
     or v_driver_definition ilike '%graphDigest%' then
    raise exception 'V18 public driver status safety contract changed';
  end if;

  if exists(
       select 1 from pg_catalog.pg_proc procedure
       where procedure.oid=
         'private_verification.brinesearch_v18_exact_route_projection(uuid,integer)'::pg_catalog.regprocedure
         and procedure.prosecdef
     )
     or v_projection_definition not ilike '%set search_path TO ''''%'
     or v_projection_definition not ilike '%brinesearch_route_occurrence_receipts_issue97%'
     or v_projection_definition not ilike
       '%brinesearch_route_occurrence_geometry_receipts_issue97%'
     or v_projection_definition not ilike '%brinesearch_route_transition_receipts_issue97%'
     or v_projection_definition not ilike '%gps_verified%'
     or v_projection_definition not ilike '%pad_latitude not between 37 and 43%'
     or v_projection_definition not ilike '%pad_longitude not between -84 and -74%'
     or v_projection_definition not ilike '%v_expected_dependency%'
     or v_projection_definition not ilike '%v_receipt.receipt_digest%'
     or v_projection_definition not ilike '%geometry.start_transition_digest%'
     or v_projection_definition not ilike '%geometry.end_transition_digest%'
     or v_projection_definition not ilike '%shared_segment_sequence_context%'
     or v_projection_definition not ilike '%shared_segment_sequence%A->B->A%'
      or v_projection_definition not ilike '%''shared_begin''%'
      or v_projection_definition not ilike '%''shared_end''%'
      or v_projection_definition not ilike
        '%brinesearch_v18_valid_right_continuation%'
      or v_projection_definition not ilike
        '%v_right_authority_count<>v_right_semantic_count%'
      or v_projection_definition not ilike
        '%v_right_semantic_mismatch<>0%'
      or v_projection_definition not ilike '%junction_type=''name_change''%'
     or v_projection_definition not ilike '%''name_change''%'
     or v_projection_definition not ilike '%''type'',''FeatureCollection''%'
     or v_projection_definition not ilike '%''stepOrder''%'
     or v_projection_definition not ilike '%p_expected_occurrence_count>256%'
     or v_projection_definition not ilike '%v_total_geometry_points>100000%'
     or v_projection_definition not ilike '%not between 2 and 2000%'
     or v_projection_definition not ilike '%pg_column_size(v_projection)>8388608%'
     or v_projection_definition ilike '%structured_route_steps%'
     or v_projection_definition ilike '%selection_uses_name_similarity''=''true%'
     or v_projection_definition ilike '%selection_uses_nearest_road''=''true%' then
    raise exception 'V18 exact receipt-to-public projection contract changed';
  end if;

  if exists(
       select 1 from pg_catalog.pg_proc procedure
       where procedure.oid=
         'private_verification.brinesearch_v18_public_google_status(boolean,boolean,text,text)'::pg_catalog.regprocedure
         and procedure.prosecdef
     )
     or v_google_classifier_definition not ilike '%set search_path TO ''''%'
     or v_google_classifier_definition not ilike
       '%p_route_state=''held'' or p_graph_state=''held''%'
     or v_google_classifier_definition not ilike '%''publicState'',''held''%'
     or v_google_classifier_definition not ilike
       '%''safeReason'',''public_route_or_graph_authority_held''%'
     or v_google_classifier_definition ilike '%google_route_receipts%'
     or v_google_classifier_definition ilike '%hold_reason%'
     or v_google_classifier_definition ilike '%manifest%'
     or v_google_classifier_definition ilike '%receipt%' then
    raise exception 'V18 sanitized public Google held classifier changed';
  end if;

  if not exists(
       select 1 from pg_catalog.pg_proc procedure
       where procedure.oid=
         'public.brinesearch_v18_driver_pad_status(uuid)'::pg_catalog.regprocedure
         and exists(select 1
           from pg_catalog.unnest(procedure.proconfig) as config(setting)
           where config.setting like 'statement_timeout=%'
             and config.setting<>'statement_timeout=0')
         and exists(select 1
           from pg_catalog.unnest(procedure.proconfig) as config(setting)
           where config.setting like 'lock_timeout=%'
             and config.setting<>'lock_timeout=0')
     )
     or not exists(
       select 1 from pg_catalog.pg_proc procedure
       where procedure.oid=
         'private_verification.brinesearch_v18_refresh_directory_snapshot()'::pg_catalog.regprocedure
         and exists(select 1
           from pg_catalog.unnest(procedure.proconfig) as config(setting)
           where config.setting like 'statement_timeout=%'
             and config.setting<>'statement_timeout=0')
         and exists(select 1
           from pg_catalog.unnest(procedure.proconfig) as config(setting)
           where config.setting like 'lock_timeout=%'
             and config.setting<>'lock_timeout=0')
     ) then
    raise exception 'V18 public/publisher finite timeout contract changed';
  end if;

  if v_publisher_definition not ilike '%retained_until%interval ''15 minutes''%'
     or v_publisher_definition not ilike '%brinesearch_v18_safe_directory_text%'
     or v_publisher_definition not ilike '%brinesearch_v18_safe_directory_array%'
     or v_publisher_definition not ilike
       '%regexp_split_to_table(%ordered.well_name%'
     or v_publisher_definition not ilike
       '%regexp_split_to_table(%ordered.api%'
     or v_publisher_definition not ilike
       '%regexp_split_to_table(%ordered.property_number%'
     or v_publisher_definition not ilike '%ordered.latitude between 37 and 43%'
     or v_publisher_definition not ilike '%ordered.longitude between -84 and -74%'
     or v_publisher_definition not ilike '%unsafe required pad name%'
     or v_publisher_definition not ilike
       '%publication_state=''withdrawn''%retained_until=null%'
     or v_withdraw_definition not ilike '%security definer%'
     or v_withdraw_definition not ilike '%set search_path TO ''''%'
     or v_withdraw_definition not ilike '%pg_advisory_xact_lock%'
     or v_withdraw_definition not ilike '%publication_state%''current''%''retained''%'
     or v_withdraw_definition ilike '%retained_until<=%'
     or v_withdraw_definition ilike '%brinesearch_v18_refresh_directory_snapshot%'
     or v_withdraw_definition ilike '%public.pads%'
     or v_withdraw_definition ilike '%public.public_pad_detail%' then
    raise exception 'V18 snapshot refresh/withdrawal contract changed';
  end if;

  if private_verification.brinesearch_v18_safe_directory_text(
       'Belmont County','county'
     ) is distinct from 'Belmont County'
     or private_verification.brinesearch_v18_safe_directory_text(
       pg_catalog.repeat('Belmont, ',130),'county'
     ) is not null
     or private_verification.brinesearch_v18_safe_directory_text(
       E'Belmont\nCounty','county'
     ) is not null
     or private_verification.brinesearch_v18_safe_directory_text(
       'turn right onto road','well_name'
     ) is not null
     or private_verification.brinesearch_v18_safe_directory_text(
       'updated note 123','property_number'
     ) is not null
     or private_verification.brinesearch_v18_safe_directory_array(
       array(select 'Well-'||value::text from pg_catalog.generate_series(1,33) value),
       'well_name',32
     )<>'{}'::text[]
     or private_verification.brinesearch_v18_safe_directory_array(
       array(select split.value from pg_catalog.regexp_split_to_table(
         'Alpha 1 | Beta 2',E'\\s*\\|\\s*'
       ) split(value)),
       'well_name',32
     )<>array['Alpha 1','Beta 2']::text[]
     or private_verification.brinesearch_v18_safe_directory_array(
       array(select split.value from pg_catalog.regexp_split_to_table(
         '34-013-23456 | 34-013-2-3456-00-00',E'\\s*\\|\\s*'
       ) split(value)),
       'api',32
     )<>array['34-013-2-3456-00-00','34-013-23456']::text[]
     or private_verification.brinesearch_v18_safe_directory_array(
       array['Well 1','turn right onto road']::text[],'well_name',32
     )<>array['Well 1']::text[] then
    raise exception 'V18 deterministic live optional-field quarantine changed';
  end if;

  if not exists(
    select 1 from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid=
      'public.brinesearch_directory_snapshot_rows_v18'::pg_catalog.regclass
      and constraint_row.conname=
        'brinesearch_directory_snapshot_rows_v18_public_shape_check'
      and constraint_row.convalidated
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%brinesearch_v18_safe_directory_text%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%brinesearch_v18_safe_directory_array%'
  ) then
    raise exception 'V18 public snapshot row shape constraint is missing';
  end if;

  if (select count(*)
      from pg_catalog.pg_trigger trigger
      where trigger.tgname='brinesearch_v18_directory_snapshot_invalidate'
        and trigger.tgrelid in (
          'public.pads'::pg_catalog.regclass,
          'public.public_pad_detail'::pg_catalog.regclass,
          'public.pad_verification_status'::pg_catalog.regclass,
          'public.brinesearch_driver_route_reference'::pg_catalog.regclass
        )
        and not trigger.tgisinternal
        and trigger.tgenabled='O'
        and trigger.tgfoid=
          'private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change()'::pg_catalog.regprocedure
        and (trigger.tgtype::integer & 1)=0
        and (trigger.tgtype::integer & 2)=0
        and (trigger.tgtype::integer & 4)=4
        and (trigger.tgtype::integer & 8)=8
        and (trigger.tgtype::integer & 16)=16
        and (trigger.tgtype::integer & 32)=32
     )<>4
     or (select count(*) from pg_catalog.pg_trigger trigger
       where trigger.tgname='brinesearch_v18_directory_snapshot_invalidate'
         and not trigger.tgisinternal)<>4 then
    raise exception 'V18 exhaustive statement-level source invalidation trigger set changed';
  end if;
  if v_owner_definition not ilike '%security definer%'
     or v_owner_definition not ilike '%set search_path TO ''''%'
     or v_owner_definition not ilike '%auth.uid()%'
     or v_owner_definition not ilike '%is_brinesearch_owner%'
     or v_owner_definition not ilike '%transition_google_dark_current%'
     or v_owner_definition not ilike '%googlePrivate%'
     or v_owner_definition not ilike '%publicProjected%' then
    raise exception 'V18 owner diagnostic authorization/status split changed';
  end if;

  select * into strict v_snapshot
  from public.brinesearch_directory_snapshots_v18
  where publication_state='current';
  if v_snapshot.retained_until is not null
     or v_snapshot.row_count<>v_snapshot.searchable_count
     or v_snapshot.row_count<>(
       select count(*) from public.brinesearch_directory_snapshot_rows_v18 row
       where row.snapshot_id=v_snapshot.snapshot_id
     )
     or v_snapshot.row_count<>(
       select count(distinct row.pad_id)
       from public.brinesearch_directory_snapshot_rows_v18 row
       where row.snapshot_id=v_snapshot.snapshot_id
     )
     or (select min(row.ordinal)
       from public.brinesearch_directory_snapshot_rows_v18 row
       where row.snapshot_id=v_snapshot.snapshot_id)<>1
     or (select max(row.ordinal)
       from public.brinesearch_directory_snapshot_rows_v18 row
       where row.snapshot_id=v_snapshot.snapshot_id)<>v_snapshot.row_count
     or v_snapshot.content_sha256!~'^[0-9a-f]{64}$' then
    raise exception 'V18 current snapshot identity/count/digest contract failed';
  end if;

  if not exists(
       select 1 from pg_catalog.pg_indexes index_row
       where index_row.schemaname='public'
         and index_row.indexname=
           'brinesearch_directory_snapshot_rows_v18_legacy_identity_idx'
         and index_row.indexdef ilike '%unique index%'
         and index_row.indexdef ilike '%snapshot_id, legacy_id%'
         and index_row.indexdef ilike '%where (legacy_id is not null)%'
     )
     or v_publisher_definition not ilike
       '%where row.legacy_id is not null%group by row.legacy_id%having count(*)>1%'
     or exists(
       select 1
       from public.brinesearch_directory_snapshot_rows_v18 row
       where row.snapshot_id=v_snapshot.snapshot_id and row.legacy_id is not null
       group by row.legacy_id
       having count(*)>1
     ) then
    raise exception 'V18 ambiguous legacy identity uniqueness contract failed';
  end if;

  if not exists(
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid=
      'public.brinesearch_directory_snapshots_v18'::pg_catalog.regclass
      and constraint_row.conname=
        'brinesearch_directory_snapshots_v18_retention_check'
      and constraint_row.convalidated
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%retained_until%publication_state%retained%'
  ) then
    raise exception 'V18 retained-until state constraint is missing or invalid';
  end if;

  if not (v_snapshot.type_counts ?& array['pad','disposal','other'])
     or (select count(*) from pg_catalog.jsonb_object_keys(
       v_snapshot.type_counts
     ))<>3
     or not (v_snapshot.coordinate_counts ?& array[
       'verifiedDriverEntrance','missingDriverEntrance','heldDriverEntrance'
     ])
     or (select count(*) from pg_catalog.jsonb_object_keys(
       v_snapshot.coordinate_counts
     ))<>3
     or coalesce((v_snapshot.type_counts->>'pad')::integer,-1)<>(
       select count(*) from public.brinesearch_directory_snapshot_rows_v18 row
       where row.snapshot_id=v_snapshot.snapshot_id and row.record_type='pad'
     )
     or coalesce((v_snapshot.type_counts->>'disposal')::integer,-1)<>(
       select count(*) from public.brinesearch_directory_snapshot_rows_v18 row
       where row.snapshot_id=v_snapshot.snapshot_id and row.record_type='disposal'
     )
     or coalesce((v_snapshot.type_counts->>'other')::integer,-1)<>(
       select count(*) from public.brinesearch_directory_snapshot_rows_v18 row
       where row.snapshot_id=v_snapshot.snapshot_id and row.record_type='other'
     )
     or coalesce((
       v_snapshot.coordinate_counts->>'verifiedDriverEntrance'
     )::integer,-1)<>(
       select count(*) from public.brinesearch_directory_snapshot_rows_v18 row
       where row.snapshot_id=v_snapshot.snapshot_id and row.coordinate_state='verified'
     )
     or coalesce((
       v_snapshot.coordinate_counts->>'missingDriverEntrance'
     )::integer,-1)<>(
       select count(*) from public.brinesearch_directory_snapshot_rows_v18 row
       where row.snapshot_id=v_snapshot.snapshot_id and row.coordinate_state='missing'
     )
     or coalesce((
       v_snapshot.coordinate_counts->>'heldDriverEntrance'
     )::integer,-1)<>(
       select count(*) from public.brinesearch_directory_snapshot_rows_v18 row
       where row.snapshot_id=v_snapshot.snapshot_id and row.coordinate_state='held'
     ) then
    raise exception 'V18 snapshot metadata counts disagree with snapshot rows';
  end if;

  if exists(
    select 1 from public.brinesearch_directory_snapshot_rows_v18 row
    where row.snapshot_id=v_snapshot.snapshot_id and (
      (row.coordinate_state='verified' and (
        row.driver_latitude is null or row.driver_longitude is null
        or row.driver_latitude not between 37 and 43
        or row.driver_longitude not between -84 and -74
        or (row.driver_latitude=0 and row.driver_longitude=0)
      ))
      or (row.coordinate_state<>'verified' and (
        row.driver_latitude is not null or row.driver_longitude is not null
      ))
    )
  ) then
    raise exception 'V18 snapshot contains a null/partial/zero or unverified driver pin';
  end if;

  select pg_catalog.array_agg(column_name order by ordinal_position)
  into v_columns
  from information_schema.columns
  where table_schema='public' and table_name='brinesearch_directory_current_v18';
  if v_columns is null or v_columns && array[
    'hold_reason','manifest_digest','dependency_digest','graph_digest','build_id'
  ]::text[] then
    raise exception 'V18 current public directory view leaked a private column';
  end if;
end;
$v18_schema_contract$;

do $v18_public_google_held_contract$
declare
  v_case record;
  v_actual jsonb;
begin
  for v_case in
    select *
    from (values
      ('ready_precedence', true, true, 'held'::text, 'held'::text,
       pg_catalog.jsonb_build_object('publicState','ready')),
      ('stale_precedence', false, true, 'held', 'held',
       pg_catalog.jsonb_build_object(
         'publicState','stale','safeReason','published_google_route_is_stale'
       )),
      ('route_held', false, false, 'held', 'active_current',
       pg_catalog.jsonb_build_object(
         'publicState','held',
         'safeReason','public_route_or_graph_authority_held'
       )),
      ('graph_held', false, false, 'unavailable', 'held',
       pg_catalog.jsonb_build_object(
         'publicState','held',
         'safeReason','public_route_or_graph_authority_held'
       )),
      ('not_published', false, false, 'ready', 'active_current',
       pg_catalog.jsonb_build_object(
         'publicState','not_published',
         'safeReason','approved_google_route_not_published'
       )),
      ('unavailable', false, false, 'stale', 'stale',
       pg_catalog.jsonb_build_object(
         'publicState','unavailable','safeReason','exact_route_not_ready'
       )),
      ('null_fail_closed', null::boolean, null::boolean, null::text, null::text,
       pg_catalog.jsonb_build_object(
         'publicState','unavailable','safeReason','exact_route_not_ready'
       ))
    ) as cases(
      fixture_name,public_current,public_exists,route_state,graph_state,expected
    )
  loop
    v_actual:=private_verification.brinesearch_v18_public_google_status(
      v_case.public_current,
      v_case.public_exists,
      v_case.route_state,
      v_case.graph_state
    );
    if v_actual is distinct from v_case.expected then
      raise exception 'V18 public Google truth table % changed: expected %, got %',
        v_case.fixture_name,v_case.expected,v_actual;
    end if;
    if v_actual->>'publicState'='held'
       and v_actual::text~*'(holdreason|hold_reason|receipt|manifest|private)' then
      raise exception 'V18 generic public Google held state leaked evidence: %',
        v_actual;
    end if;
  end loop;

  if private_verification.brinesearch_v18_exact_route_projection(
       pg_catalog.gen_random_uuid(),257
     ) is not null then
    raise exception 'V18 public exact projection accepted an oversized route';
  end if;
end;
$v18_public_google_held_contract$;

set local role anon;

do $v18_page_contract$
declare
  v_page jsonb;
  v_last_page jsonb;
  v_snapshot_id uuid;
  v_row_count integer;
begin
  v_page:=public.brinesearch_v18_directory_page(null,0,1);
  if v_page->>'schemaVersion'<>'1'
     or v_page ? 'error'
     or pg_catalog.jsonb_array_length(v_page->'rows')<>1
     or not (v_page->'snapshot' ? 'retainedUntil')
     or v_page#>'{snapshot,retainedUntil}' is distinct from 'null'::jsonb
     or v_page#>>'{page,afterOrdinal}'<>'0'
     or v_page#>>'{page,nextAfterOrdinal}'<>'1' then
    raise exception 'V18 first immutable directory page failed: %',v_page;
  end if;
  v_snapshot_id:=(v_page#>>'{snapshot,snapshotId}')::uuid;
  v_row_count:=(v_page#>>'{snapshot,rowCount}')::integer;
  v_last_page:=public.brinesearch_v18_directory_page(
    v_snapshot_id,greatest(v_row_count-1,0),1000
  );
  if v_last_page#>>'{snapshot,snapshotId}'<>v_snapshot_id::text
     or v_last_page#>>'{page,complete}'<>'true' then
    raise exception 'V18 pinned final page failed: %',v_last_page;
  end if;
  if public.brinesearch_v18_directory_page(v_snapshot_id,-1,1000)->>'error'
       <>'invalid_cursor'
     or public.brinesearch_v18_directory_page(v_snapshot_id,0,1001)->>'error'
       <>'invalid_limit'
     or public.brinesearch_v18_directory_page(
       '00000000-0000-0000-0000-000000000001'::uuid,0,1000
     )->>'error'<>'snapshot_expired' then
    raise exception 'V18 directory page rejected-input contract failed';
  end if;
end;
$v18_page_contract$;

do $v18_public_status_contract$
declare
  v_pad_id uuid;
  v_status jsonb;
  v_geometry jsonb;
begin
  select row.pad_id into v_pad_id
  from public.brinesearch_directory_current_v18 row
  order by row.ordinal
  limit 1;
  v_status:=public.brinesearch_v18_driver_pad_status(v_pad_id);
  if v_status is null
     or v_status->>'padId'<>v_pad_id::text
     or not v_status ?& array['recordRevision','statusRevision','route','graph','google','destination']
     or pg_catalog.jsonb_typeof(v_status#>'{route,steps}')<>'array'
     or not (v_status->'route' ? 'geometry')
     or not (v_status->'route' ? 'writtenDirections')
     or v_status#>'{route,writtenDirections}'<>'null'::jsonb
     or v_status ?| array[
       'googlePrivate','routeReceipt','graphAuthority','holdReason',
       'manifestDigest','dependencyDigest','buildId','graphDigest'
     ]
     or v_status->'google' ?| array[
       'privateCurrent','holdReason','manifestDigest','dependencyDigest'
     ]
     or v_status->'graph' ?| array['buildId','graphDigest','sourceRevisionDigest'] then
    raise exception 'V18 public status shape or private boundary failed: %',v_status;
  end if;

  v_geometry:=v_status#>'{route,geometry}';
  if (v_status#>>'{route,state}')<>'ready'
     and (
       pg_catalog.jsonb_array_length(v_status#>'{route,steps}')<>0
       or v_geometry is distinct from 'null'::jsonb
     ) then
    raise exception 'V18 non-ready route leaked structured steps/geometry: %',v_status;
  end if;
  if v_status#>>'{route,state}'='ready'
     and (
       v_status#>>'{graph,state}'<>'active_current'
       or v_status#>>'{destination,available}'<>'true'
       or v_status#>>'{destination,role}'<>'driver_entrance'
     ) then
    raise exception 'V18 ready route lacks active/current graph or verified entrance: %',
      v_status;
  end if;
  if exists(
    select 1 from pg_catalog.jsonb_array_elements(
      v_status#>'{route,steps}'
    ) with ordinality public_step(value,ordinality)
    where pg_catalog.jsonb_typeof(public_step.value)<>'object'
      or not (public_step.value ?& array[
        'order','kind','displayName','verifiedDesignations',
        'instruction','distanceMiles'
      ])
      or (select count(*) from pg_catalog.jsonb_object_keys(
        public_step.value
      ))<>6
      or (public_step.value->>'order')::integer<>public_step.ordinality::integer
      or public_step.value->>'kind' not in (
        'turn','continue','shared_begin','shared_end','name_change'
      )
      or pg_catalog.jsonb_typeof(
        public_step.value->'verifiedDesignations'
      )<>'array'
  ) then
    raise exception 'V18 public route step shape/order/kind contract failed: %',v_status;
  end if;
  if v_geometry is distinct from 'null'::jsonb then
    if v_status#>>'{route,state}'<>'ready'
       or v_status#>>'{graph,state}'<>'active_current'
       or v_geometry->>'type'<>'FeatureCollection'
       or (select count(*) from pg_catalog.jsonb_object_keys(v_geometry))<>2
       or not (v_geometry ?& array['type','features'])
       or pg_catalog.jsonb_typeof(v_geometry->'features')<>'array'
       or pg_catalog.jsonb_array_length(v_geometry->'features')<1
       or pg_catalog.jsonb_array_length(v_geometry->'features')<>
         pg_catalog.jsonb_array_length(v_status#>'{route,steps}')
       or exists(
         select 1
         from pg_catalog.jsonb_array_elements(v_geometry->'features')
           with ordinality feature(value,ordinality)
         where pg_catalog.jsonb_typeof(feature.value)<>'object'
           or (select count(*) from pg_catalog.jsonb_object_keys(
             feature.value
           ))<>3
           or not (feature.value ?& array['type','properties','geometry'])
           or feature.value->>'type'<>'Feature'
           or pg_catalog.jsonb_typeof(feature.value->'properties')<>'object'
           or (select count(*) from pg_catalog.jsonb_object_keys(
             feature.value->'properties'
           ))<>1
           or not (feature.value->'properties' ? 'stepOrder')
           or feature.value#>>'{properties,stepOrder}'
             !~'^[1-9][0-9]{0,8}$'
           or (feature.value#>>'{properties,stepOrder}')::integer
             <>feature.ordinality::integer
           or pg_catalog.jsonb_typeof(feature.value->'geometry')<>'object'
           or (select count(*) from pg_catalog.jsonb_object_keys(
             feature.value->'geometry'
           ))<>2
           or not (feature.value->'geometry' ?& array['type','coordinates'])
           or feature.value#>>'{geometry,type}'
             not in ('LineString','MultiLineString')
           or pg_catalog.jsonb_typeof(
              feature.value#>'{geometry,coordinates}'
            )<>'array'
           or extensions.st_srid(extensions.st_setsrid(
             extensions.st_geomfromgeojson((feature.value->'geometry')::text),4326
           ))<>4326
           or extensions.st_isempty(extensions.st_setsrid(
             extensions.st_geomfromgeojson((feature.value->'geometry')::text),4326
           ))
           or not extensions.st_isvalid(extensions.st_setsrid(
             extensions.st_geomfromgeojson((feature.value->'geometry')::text),4326
           ))
           or not extensions.st_coveredby(
             extensions.st_setsrid(
               extensions.st_geomfromgeojson((feature.value->'geometry')::text),4326
             ),
             extensions.st_makeenvelope(-180,-90,180,90,4326)
           )
       ) then
      raise exception 'V18 public route geometry boundary failed: %',v_status;
    end if;
  end if;

end;
$v18_public_status_contract$;

reset role;

do $v18_non_ready_receipt_contract$
declare
  v_pad_id uuid;
  v_status jsonb;
begin
  select route.pad_id into v_pad_id
  from public.brinesearch_route_prep route
  join private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    on receipt.route_prep_id=route.id
  join public.public_pad_detail detail on detail.id=route.pad_id
  where route.active and route.route_group='primary'
    and (receipt.route_status<>'route_ready' or receipt.stage<>'ready')
  order by route.pad_id
  limit 1;
  if found then
    v_status:=public.brinesearch_v18_driver_pad_status(v_pad_id);
    if v_status#>>'{route,state}'='ready'
       or pg_catalog.jsonb_array_length(v_status#>'{route,steps}')<>0
       or v_status#>'{route,geometry}' is distinct from 'null'::jsonb then
      raise exception 'V18 non-ready/stale receipt became publishable: %',v_status;
    end if;
  end if;
end;
$v18_non_ready_receipt_contract$;

do $v18_exact_transition_semantics_contract$
declare
  v_pair record;
  v_right record;
  v_change record;
  v_status jsonb;
begin
  select first.route_prep_id,first.pad_id,
    first.boundary_index as begin_boundary,
    second.boundary_index as end_boundary
  into v_pair
  from private_verification.brinesearch_route_transition_receipts_issue97 first
  join private_verification.brinesearch_route_transition_receipts_issue97 second
    on second.route_prep_id=first.route_prep_id
    and second.boundary_index=first.boundary_index+1
    and second.junction_id=first.junction_id
    and second.graph_build_id=first.graph_build_id
    and second.anchor_id<>first.anchor_id
  join public.brinesearch_road_junctions junction
    on junction.id=first.junction_id
    and junction.junction_type='shared_segment'
    and junction.verification_status='verified'
  where first.status='resolved' and second.status='resolved'
    and first.resolution_method='shared_segment_sequence_context'
    and second.resolution_method='shared_segment_sequence_context'
    and first.evidence->>'shared_segment_sequence'='A->B->A'
    and second.evidence->>'shared_segment_sequence'='A->B->A'
  order by first.route_prep_id,first.boundary_index
  limit 1;
  if found then
    v_status:=public.brinesearch_v18_driver_pad_status(v_pair.pad_id);
    if v_status#>>'{route,state}'='ready' and (
      (v_status#>'{route,steps}')->(v_pair.begin_boundary-1)->>'kind'
        is distinct from 'shared_begin'
      or (v_status#>'{route,steps}')->(v_pair.end_boundary-1)->>'kind'
        is distinct from 'shared_end'
    ) then
      raise exception 'V18 exact A-B-A shared entry/exit semantics changed: %',v_status;
    end if;
  end if;

  select transition.route_prep_id,transition.pad_id,transition.boundary_index,
    transition.status,transition.hold_reason,transition.anchor_role,
    transition.candidate_count,transition.evidence,transition.receipt_digest,
    transition.dependency_digest,transition.anchor_id,junction.junction_type
  into v_right
  from private_verification.brinesearch_route_transition_receipts_issue97 transition
  join public.brinesearch_road_junctions junction
    on junction.id=transition.junction_id
    and junction.build_id=transition.graph_build_id
    and junction.junction_type='shared_segment'
    and junction.verification_status='verified'
  where transition.status='resolved' and transition.hold_reason is null
    and transition.resolution_method=
      'shared_segment_right_continuation_context'
    and transition.anchor_role in ('shared_start','shared_end')
    and transition.evidence->>'shared_segment_sequence'='A->B'
    and transition.evidence->>'selection_uses_exact_right_identity'='true'
    and transition.evidence->>'selection_uses_route_sequence'='true'
    and transition.evidence->>'selection_uses_name_similarity'='false'
    and transition.evidence->>'selection_uses_nearest_road'='false'
  order by transition.route_prep_id,transition.boundary_index
  limit 1;
  if found then
    if not private_verification.brinesearch_v18_valid_right_continuation(
         v_right.status,v_right.hold_reason,v_right.junction_type,
         v_right.anchor_role,v_right.candidate_count,v_right.evidence,
         v_right.receipt_digest,v_right.dependency_digest,v_right.anchor_id
       ) then
      raise exception 'V18 selected right-continuation fixture is not valid';
    end if;
    if private_verification.brinesearch_v18_valid_right_continuation(
         v_right.status,v_right.hold_reason,v_right.junction_type,
         v_right.anchor_role,v_right.candidate_count,
         v_right.evidence-'selection_uses_exact_right_identity',
         v_right.receipt_digest,v_right.dependency_digest,v_right.anchor_id
       )
       or private_verification.brinesearch_v18_valid_right_continuation(
         v_right.status,v_right.hold_reason,v_right.junction_type,
         v_right.anchor_role,v_right.candidate_count,
         pg_catalog.jsonb_set(
           v_right.evidence,'{selection_uses_route_sequence}','null'::jsonb,true
         ),
         v_right.receipt_digest,v_right.dependency_digest,v_right.anchor_id
       ) then
      raise exception
        'V18 right-continuation validator accepted missing/NULL evidence';
    end if;
    v_status:=public.brinesearch_v18_driver_pad_status(v_right.pad_id);
    if v_status#>>'{route,state}'='ready'
       and (v_status#>'{route,steps}')->(v_right.boundary_index-1)->>'kind'
         is distinct from 'shared_end' then
      raise exception 'V18 exact A-B right-continuation shared exit changed: %',
        v_status;
    end if;
  end if;

  select transition.route_prep_id,transition.pad_id,transition.boundary_index
  into v_change
  from private_verification.brinesearch_route_transition_receipts_issue97 transition
  join public.brinesearch_road_junctions junction
    on junction.id=transition.junction_id
    and junction.build_id=transition.graph_build_id
    and junction.junction_type='name_change'
    and junction.verification_status='verified'
  where transition.status='resolved' and transition.hold_reason is null
  order by transition.route_prep_id,transition.boundary_index
  limit 1;
  if found then
    v_status:=public.brinesearch_v18_driver_pad_status(v_change.pad_id);
    if v_status#>>'{route,state}'='ready'
       and (v_status#>'{route,steps}')->(v_change.boundary_index-1)->>'kind'
         is distinct from 'name_change' then
      raise exception 'V18 exact junction name-change semantic changed: %',v_status;
    end if;
  end if;
end;
$v18_exact_transition_semantics_contract$;

do $v18_verified_entrance_gate_contract$
declare
  v_pad_id uuid;
  v_status jsonb;
begin
  select route.pad_id into v_pad_id
  from public.brinesearch_route_prep route
  join private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    on receipt.route_prep_id=route.id
  left join public.pad_verification_status verification
    on verification.pad_id=route.pad_id
  join public.public_pad_detail detail on detail.id=route.pad_id
  where route.active and route.route_group='primary' and route.variant_index=1
    and receipt.route_status='route_ready' and receipt.stage='ready'
    and not coalesce(verification.gps_verified,false)
  order by route.pad_id
  limit 1;
  if found then
    v_status:=public.brinesearch_v18_driver_pad_status(v_pad_id);
    if v_status#>>'{route,state}'='ready'
       or pg_catalog.jsonb_array_length(v_status#>'{route,steps}')<>0
       or v_status#>'{route,geometry}' is distinct from 'null'::jsonb then
      raise exception 'V18 unverified driver entrance published exact route data: %',v_status;
    end if;
  end if;
end;
$v18_verified_entrance_gate_contract$;

do $v18_cologie_split_state_contract$
declare
  v_status jsonb;
  v_cologie uuid:='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid;
begin
  -- If the known Cologie fixture is present while global cutover is off, its
  -- private-ready receipt must still not surface as public Google ready.
  if exists(select 1 from public.public_pad_detail where id=v_cologie)
     and not public.brinesearch_issue97_cutover_active() then
    v_status:=public.brinesearch_v18_driver_pad_status(v_cologie);
    if v_status is null
       or v_status#>>'{google,publicState}'='ready'
       or v_status->'google' ? 'privateCurrent' then
      raise exception 'Cologie private readiness leaked into public status: %',v_status;
    end if;
    if v_status#>>'{route,state}'='ready'
       and v_status#>>'{google,publicState}'<>'not_published' then
      raise exception 'Cologie ready route did not remain publicly unpublished: %',v_status;
    end if;
  end if;
end;
$v18_cologie_split_state_contract$;

set local role authenticated;

do $v18_owner_auth_contract$
declare
  v_denied boolean:=false;
begin
  begin
    perform public.brinesearch_v18_owner_pad_status(
      'e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
    );
  exception when sqlstate '42501' then
    v_denied:=true;
  end;
  if not v_denied then
    raise exception 'V18 owner diagnostics accepted an unauthenticated actor';
  end if;
end;
$v18_owner_auth_contract$;

reset role;

rollback;
