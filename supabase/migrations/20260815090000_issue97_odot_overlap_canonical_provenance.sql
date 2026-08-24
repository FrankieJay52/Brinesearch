-- GitHub #97 -- canonical-grid ODOT overlap provenance and release generation r2.
--
-- The r1 builder correctly substituted exact PRIMARY_OVERLAP_ID primary geometry
-- into temporary Ohio topology, but attached the immutable pair receipt by
-- intersecting raw pair geometry with a final shared card built on the 1e-7
-- canonical grid. Belmont proved that frame mismatch can produce a valid shared
-- graph with an empty ODOT receipt set. This forward-only migration leaves the
-- installed 22-file release history and every historical graph row untouched.
-- It binds pair receipts through the existing exact canonical coverage relation,
-- adds a fail-closed admitted-versus-persisted pair-set postcondition, and starts
-- an independently receipted r2 builder generation.

-- Match builder lock order: graph lanes, ingest scopes, then mapping refresh.
do $issue97_odot_canonical_lock$
declare scope record;
begin
  for scope in
    select state_code,county_code
    from public.brinesearch_road_graph_counties
    where active
    order by state_code,county_code
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:graph:'||scope.state_code||':'||scope.county_code
    ));
  end loop;
  for scope in
    select dataset_id,state_code,county_code
    from public.brinesearch_road_source_dataset_counties
    where active and ingest_enabled
    order by dataset_id,state_code,county_code
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:ingest:'||scope.dataset_id::text||':'||scope.county_code
    ));
  end loop;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );
end
$issue97_odot_canonical_lock$;

lock table private_verification.brinesearch_issue97_graph_release_generations
  in access exclusive mode;
lock table private_verification.brinesearch_issue97_graph_release_qualifications
  in access exclusive mode;

create temporary table issue97_odot_canonical_before on commit drop as
select
  public.brinesearch_issue97_cutover_active() as cutover_active,
  (select count(*) from public.brinesearch_road_graph_builds) as build_count,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||pg_catalog.to_jsonb(build)::text,'|' order by build.id
  ),'')) from public.brinesearch_road_graph_builds build) as build_state_digest,
  (select count(*) from public.brinesearch_road_graph_builds where status='staging') as staging_count,
  (select count(*) from public.brinesearch_road_junctions) as junction_count,
  (select count(*) from public.brinesearch_road_junction_anchors) as anchor_count,
  (select count(*) from public.brinesearch_road_junction_memberships) as membership_count,
  (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)
    as reconciliation_count,
  (select count(*) from private_verification.brinesearch_google_route_receipts_issue97)
    as google_receipt_count,
  (select count(*) from public.brinesearch_driver_google_routes_public) as public_google_count,
  (select count(*) from private_verification.brinesearch_issue97_verification_reports)
    as verification_report_count,
  (select count(*) from private_verification.brinesearch_issue97_release_manifests)
    as release_manifest_count,
  (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifests)
    as state_manifest_count,
  (select pg_catalog.to_jsonb(generation)
   from private_verification.brinesearch_issue97_graph_release_generations generation
   where generation.generation_key='issue97-release-20260814-r1') as r1_generation,
  (select pg_catalog.to_jsonb(qualification)
   from private_verification.brinesearch_issue97_graph_release_qualifications qualification
   join public.brinesearch_road_graph_builds build on build.id=qualification.build_id
   where qualification.generation_key='issue97-release-20260814-r1'
     and build.state_code='WV' and build.county_code='OHI' and build.status='active')
    as r1_ohi_qualification,
  (select pg_catalog.pg_get_constraintdef(constraint_row.oid)
   from pg_catalog.pg_constraint constraint_row
   where constraint_row.conrelid=
       'private_verification.brinesearch_issue97_graph_release_qualifications'::pg_catalog.regclass
     and constraint_row.contype='p') as qualification_primary_key,
  (select trigger_row.tgenabled
   from pg_catalog.pg_trigger trigger_row
   where trigger_row.tgrelid=
       'private_verification.brinesearch_issue97_graph_release_generations'::pg_catalog.regclass
     and trigger_row.tgname='brinesearch_issue97_graph_release_generation_immutable'
     and not trigger_row.tgisinternal) as generation_trigger_enabled,
  (select pg_catalog.pg_get_triggerdef(trigger_row.oid)
   from pg_catalog.pg_trigger trigger_row
   where trigger_row.tgrelid=
       'private_verification.brinesearch_issue97_graph_release_generations'::pg_catalog.regclass
     and trigger_row.tgname='brinesearch_issue97_graph_release_generation_immutable'
     and not trigger_row.tgisinternal) as generation_trigger_definition,
  (select trigger_row.tgenabled
   from pg_catalog.pg_trigger trigger_row
   where trigger_row.tgrelid=
       'private_verification.brinesearch_issue97_graph_release_qualifications'::pg_catalog.regclass
     and trigger_row.tgname='brinesearch_issue97_graph_release_qualification_immutable'
     and not trigger_row.tgisinternal) as qualification_trigger_enabled,
  (select pg_catalog.pg_get_triggerdef(trigger_row.oid)
   from pg_catalog.pg_trigger trigger_row
   where trigger_row.tgrelid=
       'private_verification.brinesearch_issue97_graph_release_qualifications'::pg_catalog.regclass
     and trigger_row.tgname='brinesearch_issue97_graph_release_qualification_immutable'
     and not trigger_row.tgisinternal) as qualification_trigger_definition,
  generation_table.relowner as generation_table_owner,
  generation_table.relacl as generation_table_acl,
  generation_table.relrowsecurity as generation_table_rls,
  generation_table.relforcerowsecurity as generation_table_force_rls,
  qualification_table.relowner as qualification_table_owner,
  qualification_table.relacl as qualification_table_acl,
  qualification_table.relrowsecurity as qualification_table_rls,
  qualification_table.relforcerowsecurity as qualification_table_force_rls,
  proc.proowner as builder_owner,
  proc.proacl as builder_acl,
  proc.prosecdef as builder_security_definer,
  proc.provolatile as builder_volatility,
  proc.proconfig as builder_config,
  proc.prolang as builder_language
from pg_catalog.pg_proc proc
cross join pg_catalog.pg_class generation_table
cross join pg_catalog.pg_class qualification_table
where proc.oid=
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  and generation_table.oid=
    'private_verification.brinesearch_issue97_graph_release_generations'::pg_catalog.regclass
  and qualification_table.oid=
    'private_verification.brinesearch_issue97_graph_release_qualifications'::pg_catalog.regclass;

do $issue97_odot_canonical_preflight$
declare
  v_before issue97_odot_canonical_before%rowtype;
  v_ohi record;
  v_required integer;
  v_current integer;
  v_release_versions text[]:=array[
    '20260814074500','20260814160000','20260814160050','20260814161000',
    '20260814161100','20260814161200','20260814161300','20260814161400',
    '20260814161500','20260814162000','20260814163000','20260814163050',
    '20260814163100','20260814163200','20260814163250','20260814163300',
    '20260814163400','20260814164000','20260814164100','20260814164200',
    '20260814164250','20260814164300'
  ];
begin
  select * into strict v_before from issue97_odot_canonical_before;
  if v_before.cutover_active then
    raise exception 'Issue #97 ODOT canonical hotfix requires global cutover OFF';
  end if;
  if v_before.staging_count<>0 then
    raise exception 'Issue #97 ODOT canonical hotfix refuses a staging graph build';
  end if;
  if exists(
    select 1 from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
      and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'
  ) then
    raise exception 'Issue #97 ODOT canonical hotfix refuses an active graph builder';
  end if;
  if v_before.reconciliation_count<>0 or v_before.public_google_count<>0
     or v_before.google_receipt_count<>9
     or v_before.verification_report_count<>0 or v_before.release_manifest_count<>0
     or v_before.state_manifest_count<>0 then
    raise exception 'Issue #97 ODOT canonical hotfix requires the reviewed pre-release checkpoint';
  end if;
  select count(*)::integer,
    count(*) filter(where private_verification.brinesearch_issue97_dataset_scope_current(
      scope.dataset_id,scope.state_code,scope.county_code
    ))::integer
  into v_required,v_current
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset on dataset.id=scope.dataset_id
  where scope.active and scope.ingest_enabled and scope.required_for_graph
    and dataset.active and scope.state_code='OH';
  if v_required<>38 or v_current<>38 then
    raise exception 'Issue #97 ODOT canonical hotfix requires Ohio source scopes 38/38 current; found %/%',
      v_current,v_required;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
      where version=any(v_release_versions))<>22
     or exists(select 1 from supabase_migrations.schema_migrations
       where version='20260815090000') then
    raise exception 'Issue #97 ODOT canonical hotfix requires exact installed base 22 and no hotfix history row';
  end if;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
     ))<>'e0528f257f3c1b6d40341b735f284f1d' then
    raise exception 'Issue #97 ODOT canonical hotfix expected r1 builder e0528f25';
  end if;
  if (select count(*) from private_verification.brinesearch_issue97_graph_release_generations
      where active and generation_key='issue97-release-20260814-r1'
        and algorithm_version='issue97-authoritative-topology-v2'
        and builder_definition_md5='e0528f257f3c1b6d40341b735f284f1d'
        and supplemental_mapper_md5='4dd8a572b153d795163cf38a41ea9d1f'
        and source_content_contract=
          'captured-run-content+authoritative-name+supplemental-map-v2')<>1
     or (select count(*) from private_verification.brinesearch_issue97_graph_release_generations
         where active)<>1
     or exists(select 1 from private_verification.brinesearch_issue97_graph_release_generations
         where generation_key='issue97-release-20260815-r2') then
    raise exception 'Issue #97 ODOT canonical hotfix requires sole exact active r1 and absent r2';
  end if;
  if v_before.qualification_primary_key<>'PRIMARY KEY (build_id)'
     or exists(select 1 from pg_catalog.pg_constraint constraint_row
       where constraint_row.confrelid=
         'private_verification.brinesearch_issue97_graph_release_qualifications'::pg_catalog.regclass) then
    raise exception 'Issue #97 ODOT canonical hotfix qualification-key contract changed';
  end if;
  if v_before.generation_trigger_enabled<>'O'
     or v_before.generation_trigger_definition not like
       '%EXECUTE FUNCTION private_verification.brinesearch_issue97_reject_release_receipt_mutation()%'
     or (select count(*) from pg_catalog.pg_trigger trigger_row
         where trigger_row.tgrelid=
           'private_verification.brinesearch_issue97_graph_release_generations'::pg_catalog.regclass
           and not trigger_row.tgisinternal)<>1 then
    raise exception 'Issue #97 ODOT canonical hotfix generation immutability trigger changed';
  end if;
  if v_before.qualification_trigger_enabled<>'O'
     or v_before.qualification_trigger_definition not like
       '%EXECUTE FUNCTION private_verification.brinesearch_issue97_reject_release_receipt_mutation()%'
     or (select count(*) from pg_catalog.pg_trigger trigger_row
         where trigger_row.tgrelid=
           'private_verification.brinesearch_issue97_graph_release_qualifications'::pg_catalog.regclass
           and not trigger_row.tgisinternal)<>1
     or not v_before.generation_table_rls or not v_before.generation_table_force_rls
     or not v_before.qualification_table_rls or not v_before.qualification_table_force_rls then
    raise exception 'Issue #97 ODOT canonical hotfix qualification immutability/RLS changed';
  end if;
  if (select count(*) from pg_catalog.pg_index index_row
      join pg_catalog.pg_class index_class on index_class.oid=index_row.indexrelid
      where index_row.indrelid=
          'private_verification.brinesearch_issue97_graph_release_generations'::pg_catalog.regclass
        and index_class.relname='brinesearch_issue97_one_active_graph_release_generation_idx'
        and index_row.indisunique and index_row.indisvalid and index_row.indisready
        and pg_catalog.pg_get_expr(index_row.indpred,index_row.indrelid)='active')<>1 then
    raise exception 'Issue #97 ODOT canonical hotfix one-active generation index changed';
  end if;

  select build.id,build.graph_digest,build.source_revision_digest,
    qualification.mapping_snapshot_digest,qualification.source_content_digest,
    qualification.authoritative_name_input_digest,qualification.supplemental_input_digest,
    qualification.qualification_digest
  into strict v_ohi
  from public.brinesearch_road_graph_builds build
  join private_verification.brinesearch_issue97_graph_release_qualifications qualification
    on qualification.build_id=build.id
   and qualification.generation_key='issue97-release-20260814-r1'
   and qualification.active
  where build.id='44d1d8dd-9f1f-4455-bd14-739f933c78ee'::uuid
    and build.state_code='WV' and build.county_code='OHI' and build.status='active'
    and build.graph_digest='a14358e638db5d01ca2ac07fef35e357'
    and build.source_revision_digest='06f8d4f4ea6396058342178ecb159b6c'
    and build.point_junction_count=2587 and build.shared_segment_count=61
    and build.membership_count=5977
    and coalesce((build.details->>'held_junction_count')::integer,-1)=513;
  if not private_verification.brinesearch_issue97_graph_build_release_current(v_ohi.id)
     or v_ohi.source_content_digest is distinct from
       private_verification.brinesearch_issue97_graph_source_content_digest(v_ohi.id)
     or v_ohi.authoritative_name_input_digest is distinct from
       private_verification.brinesearch_issue97_graph_name_input_digest(v_ohi.id)
     or v_ohi.supplemental_input_digest is distinct from
       private_verification.brinesearch_issue97_graph_supplemental_input_digest(v_ohi.id)
     or v_ohi.qualification_digest is distinct from pg_catalog.md5(
       v_ohi.id::text||':issue97-release-20260814-r1:'||v_ohi.graph_digest||':'||
       v_ohi.source_revision_digest||':'||v_ohi.mapping_snapshot_digest||':'||
       v_ohi.source_content_digest||':'||v_ohi.authoritative_name_input_digest||':'||
       v_ohi.supplemental_input_digest
     ) then
    raise exception 'Issue #97 ODOT canonical hotfix OHI r1 qualification is not exact/current';
  end if;
  if (select count(*) from public.brinesearch_road_graph_builds build
      where build.id='adfcc2c9-e9e9-463c-9f49-a2d2a329f1de'::uuid
        and build.state_code='OH' and build.county_code='NOB'
        and build.status='validated' and build.activated_at is null
        and build.graph_digest='d510e153634e51fa0966f2756598cd6c'
        and private_verification.brinesearch_issue97_graph_build_release_current(build.id))<>1
     or (select count(*) from public.brinesearch_road_graph_builds build
      where build.id='1998882b-0874-40bc-befd-72e2ffabd9b4'::uuid
        and build.state_code='OH' and build.county_code='BEL'
        and build.status='validated' and build.activated_at is null
        and build.graph_digest='22bd977096f259de44ade8f636cfc4cd'
        and private_verification.brinesearch_issue97_graph_build_release_current(build.id))<>1
     or exists(select 1 from public.brinesearch_road_graph_builds build
       where build.state_code='OH' and build.county_code='STA'
         and build.status='validated' and build.activated_at is null
         and private_verification.brinesearch_issue97_graph_build_release_current(build.id)) then
    raise exception 'Issue #97 ODOT canonical hotfix canary checkpoint changed';
  end if;
end
$issue97_odot_canonical_preflight$;

do $issue97_odot_canonical_builder_patch$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.md5(v_definition)<>'e0528f257f3c1b6d40341b735f284f1d' then
    raise exception 'Issue #97 ODOT canonical builder patch predecessor changed: %',
      pg_catalog.md5(v_definition);
  end if;
  v_patched:=v_definition;

  v_old:=$old$        where pair.secondary_identity_id=any(s.identity_ids)
          and pair.primary_identity_id=any(s.identity_ids)
          and extensions.st_intersects(pair.topology_geom,s.geom)
          and extensions.st_length(
            extensions.st_collectionextract(
              extensions.st_intersection(pair.topology_geom,s.geom),2
            )::extensions.geography
          )>0.02$old$;
  v_new:=$new$        where pair.secondary_identity_id=any(s.identity_ids)
          and pair.primary_identity_id=any(s.identity_ids)
          and exists(
            select 1
            from tmp_issue97_shared_segment_coverage coverage
            where coverage.geom_key=s.geom_key
              and coverage.identity_ids=s.identity_ids
              and coverage.identity_id=pair.secondary_identity_id
              and coverage.source_segment_id=pair.secondary_segment_id
              and coverage.source_segment_key=pair.secondary_segment_key
          )
          and exists(
            select 1
            from tmp_issue97_shared_segment_coverage coverage
            where coverage.geom_key=s.geom_key
              and coverage.identity_ids=s.identity_ids
              and coverage.identity_id=pair.primary_identity_id
              and coverage.source_segment_id=pair.primary_segment_id
              and coverage.source_segment_key=pair.primary_segment_key
          )$new$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 ODOT canonical provenance anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  v_old:=$old$  where junction.build_id=v_build
    and junction.stable_junction_key=
      'junction:shared:'||v_state||':'||shared.identity_ids::text||':'||shared.geom_key;

  -- A source-scoped name transition is an event on one physical road identity,$old$;
  v_new:=$new$  where junction.build_id=v_build
    and junction.stable_junction_key=
      'junction:shared:'||v_state||':'||shared.identity_ids::text||':'||shared.geom_key;

  -- Persisted verified ODOT pair provenance must exactly equal every exact
  -- target-county pair admitted to the temporary topology lane. A mismatch is
  -- a builder failure, never a later rollout-verifier surprise.
  if v_state='OH' then
    declare
      v_odot_missing integer;
      v_odot_extra integer;
      v_odot_first_missing text;
      v_odot_first_extra text;
    begin
      with expected as (
        select distinct pair.secondary_source_record_id,
          pair.primary_source_record_id,pair.secondary_segment_key,
          pair.primary_segment_key,pair.overlap_inverse_ind
        from tmp_issue97_odot_overlap_pairs pair
        join tmp_issue97_target_segments target
          on target.id=pair.secondary_segment_id
      ), observed as (
        select distinct
          value->>'secondary_source_record_id' as secondary_source_record_id,
          value->>'primary_source_record_id' as primary_source_record_id,
          value->>'secondary_source_segment_key' as secondary_segment_key,
          value->>'primary_source_segment_key' as primary_segment_key,
          value->>'overlap_inverse_ind' as overlap_inverse_ind
        from public.brinesearch_road_junctions junction
        cross join lateral pg_catalog.jsonb_array_elements(
          coalesce(junction.source_provenance->'odot_authoritative_overlap_pairs','[]'::jsonb)
        ) evidence(value)
        where junction.build_id=v_build
          and junction.junction_type='shared_segment'
          and junction.verification_status='verified'
          and value->>'topology_geometry_source'='odot_primary_overlap'
          and value->>'persistent_secondary_geometry_unchanged'='true'
      ), delta as (
        select 'missing'::text as kind,missing.* from (
          select * from expected except select * from observed
        ) missing
        union all
        select 'extra'::text as kind,extra.* from (
          select * from observed except select * from expected
        ) extra
      )
      select count(*) filter(where kind='missing')::integer,
        count(*) filter(where kind='extra')::integer,
        min(secondary_source_record_id||'->'||primary_source_record_id)
          filter(where kind='missing'),
        min(secondary_source_record_id||'->'||primary_source_record_id)
          filter(where kind='extra')
      into v_odot_missing,v_odot_extra,v_odot_first_missing,v_odot_first_extra
      from delta;

      if v_odot_missing<>0 or v_odot_extra<>0 then
        raise exception 'Issue #97 ODOT overlap provenance set mismatch: missing %, extra %, first missing %, first extra %',
          v_odot_missing,v_odot_extra,v_odot_first_missing,v_odot_first_extra
          using errcode='55000';
      end if;
    end;
  end if;

  -- A source-scoped name transition is an event on one physical road identity,$new$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 ODOT canonical set-equality anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  if v_patched like '%extensions.st_intersects(pair.topology_geom,s.geom)%'
     or v_patched like '%extensions.st_intersection(pair.topology_geom,s.geom)%'
     or v_patched not like '%coverage.source_segment_id=pair.secondary_segment_id%'
     or v_patched not like '%coverage.source_segment_id=pair.primary_segment_id%'
     or v_patched not like '%ODOT overlap provenance set mismatch%'
     or v_patched like '%similarity(%' or v_patched like '%<->%' then
    raise exception 'Issue #97 ODOT canonical builder did not preserve exact no-guess semantics';
  end if;
  if pg_catalog.md5(v_patched)<>'06705f5b35a6d37151bb2c0dc5ade9bd' then
    raise exception 'Issue #97 ODOT canonical generated builder hash changed: %',
      pg_catalog.md5(v_patched);
  end if;
  execute v_patched;
end
$issue97_odot_canonical_builder_patch$;

-- One historical build may have one immutable qualification per generation.
alter table private_verification.brinesearch_issue97_graph_release_qualifications
  drop constraint brinesearch_issue97_graph_release_qualifications_pkey;
alter table private_verification.brinesearch_issue97_graph_release_qualifications
  add constraint brinesearch_issue97_graph_release_qualifications_pkey
  primary key(build_id,generation_key);

do $issue97_odot_canonical_generation_transition$
declare v_rows integer;
begin
  -- Disable only the named row-receipt trigger while changing the lifecycle bit.
  -- Transactional DDL restores it automatically if any statement fails.
  execute 'alter table private_verification.brinesearch_issue97_graph_release_generations disable trigger brinesearch_issue97_graph_release_generation_immutable';
  update private_verification.brinesearch_issue97_graph_release_generations
  set active=false
  where generation_key='issue97-release-20260814-r1' and active
    and builder_definition_md5='e0528f257f3c1b6d40341b735f284f1d';
  get diagnostics v_rows=row_count;
  if v_rows<>1 then
    raise exception 'Issue #97 ODOT canonical r1 deactivation changed % rows',v_rows;
  end if;

  insert into private_verification.brinesearch_issue97_graph_release_generations(
    generation_key,algorithm_version,builder_definition_md5,supplemental_mapper_md5,
    county_manifest_count,county_manifest_digest,source_scope_manifest_count,
    source_scope_manifest_digest,source_content_contract,review_details,active,activated_at
  )
  select 'issue97-release-20260815-r2',algorithm_version,
    '06705f5b35a6d37151bb2c0dc5ade9bd',supplemental_mapper_md5,
    county_manifest_count,county_manifest_digest,source_scope_manifest_count,
    source_scope_manifest_digest,source_content_contract,
    review_details||pg_catalog.jsonb_build_object(
      'reviewed_by','ChatGPT controlled Issue #97 canonical ODOT provenance correction',
      'reviewed_at','2026-08-15T09:00:00Z',
      'audit_baseline_sha','7653c4235e8f0028d3fc4f7376a0fa79fbae1a05',
      'predecessor_generation','issue97-release-20260814-r1',
      'predecessor_builder_md5','e0528f257f3c1b6d40341b735f284f1d',
      'bel_exact_offset_pair','2025_000000000270433->2025_000000000269543',
      'odot_pair_attachment','exact tmp_issue97_shared_segment_coverage segment IDs and keys',
      'odot_pair_set_postcondition','admitted target pairs exactly equal verified persisted provenance',
      'persistent_odot_geometry_rewritten',false,
      'name_or_nearest_matching_used',false,
      'historical_build_rows_rewritten',false,
      'historical_release_receipt_fields_rewritten',false
    ),true,pg_catalog.clock_timestamp()
  from private_verification.brinesearch_issue97_graph_release_generations
  where generation_key='issue97-release-20260814-r1' and not active;
  get diagnostics v_rows=row_count;
  if v_rows<>1 then
    raise exception 'Issue #97 ODOT canonical r2 insert changed % rows',v_rows;
  end if;
  execute 'alter table private_verification.brinesearch_issue97_graph_release_generations enable trigger brinesearch_issue97_graph_release_generation_immutable';
end
$issue97_odot_canonical_generation_transition$;

do $issue97_odot_canonical_ohi_qualification$
declare
  v_old record;
  v_rows integer;
begin
  select qualification.* into strict v_old
  from private_verification.brinesearch_issue97_graph_release_qualifications qualification
  join public.brinesearch_road_graph_builds build on build.id=qualification.build_id
  where qualification.generation_key='issue97-release-20260814-r1'
    and qualification.active and build.id='44d1d8dd-9f1f-4455-bd14-739f933c78ee'::uuid
    and build.state_code='WV' and build.county_code='OHI' and build.status='active';

  insert into private_verification.brinesearch_issue97_graph_release_qualifications(
    build_id,generation_key,graph_digest,source_revision_digest,mapping_snapshot_digest,
    source_content_digest,authoritative_name_input_digest,supplemental_input_digest,
    qualification_digest,review_details,active,qualified_at
  ) values(
    v_old.build_id,'issue97-release-20260815-r2',v_old.graph_digest,
    v_old.source_revision_digest,v_old.mapping_snapshot_digest,v_old.source_content_digest,
    v_old.authoritative_name_input_digest,v_old.supplemental_input_digest,
    pg_catalog.md5(
      v_old.build_id::text||':issue97-release-20260815-r2:'||v_old.graph_digest||':'||
      v_old.source_revision_digest||':'||v_old.mapping_snapshot_digest||':'||
      v_old.source_content_digest||':'||v_old.authoritative_name_input_digest||':'||
      v_old.supplemental_input_digest
    ),
    v_old.review_details||pg_catalog.jsonb_build_object(
      'reviewed_by','ChatGPT controlled Issue #97 r2 OHI compatibility carry-forward',
      'reviewed_at','2026-08-15T09:00:00Z',
      'evidence','r2 changes only Ohio ODOT canonical provenance attachment and its fail-closed postcondition; unchanged active WV/OHI graph remains bound to all six live input digests',
      'predecessor_generation','issue97-release-20260814-r1',
      'historical_qualification_rewritten',false,
      'ohio_only_builder_change',true
    ),true,pg_catalog.clock_timestamp()
  );
  get diagnostics v_rows=row_count;
  if v_rows<>1 then
    raise exception 'Issue #97 ODOT canonical OHI r2 qualification changed % rows',v_rows;
  end if;
end
$issue97_odot_canonical_ohi_qualification$;

do $issue97_odot_canonical_verify$
declare
  v_before issue97_odot_canonical_before%rowtype;
  v_proc record;
  v_r1 jsonb;
  v_r1_qualification jsonb;
begin
  select * into strict v_before from issue97_odot_canonical_before;
  select proc.proowner,proc.proacl,proc.prosecdef,proc.provolatile,proc.proconfig,proc.prolang
  into strict v_proc from pg_catalog.pg_proc proc
  where proc.oid=
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure;

  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
     ))<>'06705f5b35a6d37151bb2c0dc5ade9bd' then
    raise exception 'Issue #97 ODOT canonical installed builder hash mismatch';
  end if;
  if v_proc.proowner is distinct from v_before.builder_owner
     or v_proc.proacl is distinct from v_before.builder_acl
     or v_proc.prosecdef is distinct from v_before.builder_security_definer
     or v_proc.provolatile is distinct from v_before.builder_volatility
     or v_proc.proconfig is distinct from v_before.builder_config
     or v_proc.prolang is distinct from v_before.builder_language then
    raise exception 'Issue #97 ODOT canonical migration changed builder metadata or ACL';
  end if;
  if exists(
    select 1 from pg_catalog.pg_class relation
    where (relation.oid=
        'private_verification.brinesearch_issue97_graph_release_generations'::pg_catalog.regclass
      and (relation.relowner is distinct from v_before.generation_table_owner
        or relation.relacl is distinct from v_before.generation_table_acl
        or relation.relrowsecurity is distinct from v_before.generation_table_rls
        or relation.relforcerowsecurity is distinct from v_before.generation_table_force_rls))
       or (relation.oid=
        'private_verification.brinesearch_issue97_graph_release_qualifications'::pg_catalog.regclass
      and (relation.relowner is distinct from v_before.qualification_table_owner
        or relation.relacl is distinct from v_before.qualification_table_acl
        or relation.relrowsecurity is distinct from v_before.qualification_table_rls
        or relation.relforcerowsecurity is distinct from v_before.qualification_table_force_rls))
  ) then
    raise exception 'Issue #97 ODOT canonical migration changed release table owner/ACL/RLS';
  end if;
  if (select count(*) from private_verification.brinesearch_issue97_graph_release_generations
      where active and generation_key='issue97-release-20260815-r2'
        and builder_definition_md5='06705f5b35a6d37151bb2c0dc5ade9bd')<>1
     or (select count(*) from private_verification.brinesearch_issue97_graph_release_generations
         where active)<>1
     or private_verification.brinesearch_issue97_active_graph_release_generation()
       <>'issue97-release-20260815-r2'
     or not private_verification.brinesearch_issue97_release_manifest_current() then
    raise exception 'Issue #97 ODOT canonical r2 generation is not exact/current';
  end if;

  select pg_catalog.to_jsonb(generation) into strict v_r1
  from private_verification.brinesearch_issue97_graph_release_generations generation
  where generation.generation_key='issue97-release-20260814-r1';
  if (v_r1-'active') is distinct from (v_before.r1_generation-'active')
     or (v_r1->>'active')::boolean then
    raise exception 'Issue #97 ODOT canonical migration rewrote the historical r1 receipt';
  end if;
  if (select trigger_row.tgenabled
      from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid=
          'private_verification.brinesearch_issue97_graph_release_generations'::pg_catalog.regclass
        and trigger_row.tgname='brinesearch_issue97_graph_release_generation_immutable'
        and not trigger_row.tgisinternal)<>'O'
     or (select pg_catalog.pg_get_triggerdef(trigger_row.oid)
         from pg_catalog.pg_trigger trigger_row
         where trigger_row.tgrelid=
             'private_verification.brinesearch_issue97_graph_release_generations'::pg_catalog.regclass
           and trigger_row.tgname='brinesearch_issue97_graph_release_generation_immutable'
           and not trigger_row.tgisinternal)
       is distinct from v_before.generation_trigger_definition then
    raise exception 'Issue #97 ODOT canonical generation immutability trigger was not restored';
  end if;
  if (select trigger_row.tgenabled
      from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid=
          'private_verification.brinesearch_issue97_graph_release_qualifications'::pg_catalog.regclass
        and trigger_row.tgname='brinesearch_issue97_graph_release_qualification_immutable'
        and not trigger_row.tgisinternal)<>'O'
     or (select pg_catalog.pg_get_triggerdef(trigger_row.oid)
         from pg_catalog.pg_trigger trigger_row
         where trigger_row.tgrelid=
             'private_verification.brinesearch_issue97_graph_release_qualifications'::pg_catalog.regclass
           and trigger_row.tgname='brinesearch_issue97_graph_release_qualification_immutable'
           and not trigger_row.tgisinternal)
       is distinct from v_before.qualification_trigger_definition then
    raise exception 'Issue #97 ODOT canonical qualification immutability trigger changed';
  end if;
  if (select pg_catalog.pg_get_constraintdef(constraint_row.oid)
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid=
          'private_verification.brinesearch_issue97_graph_release_qualifications'::pg_catalog.regclass
        and constraint_row.contype='p')<>'PRIMARY KEY (build_id, generation_key)' then
    raise exception 'Issue #97 ODOT canonical qualification primary key is not generation-scoped';
  end if;
  select pg_catalog.to_jsonb(qualification) into strict v_r1_qualification
  from private_verification.brinesearch_issue97_graph_release_qualifications qualification
  where qualification.build_id='44d1d8dd-9f1f-4455-bd14-739f933c78ee'::uuid
    and qualification.generation_key='issue97-release-20260814-r1';
  if v_r1_qualification is distinct from v_before.r1_ohi_qualification
     or (select count(*) from private_verification.brinesearch_issue97_graph_release_qualifications
         where build_id='44d1d8dd-9f1f-4455-bd14-739f933c78ee'::uuid
           and generation_key='issue97-release-20260815-r2' and active)<>1
     or (select count(*) from private_verification.brinesearch_issue97_graph_release_qualifications
         where generation_key='issue97-release-20260815-r2')<>1
     or not private_verification.brinesearch_issue97_graph_build_release_current(
       '44d1d8dd-9f1f-4455-bd14-739f933c78ee'::uuid
     ) then
    raise exception 'Issue #97 ODOT canonical OHI compatibility receipt changed or is not r2-current';
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds build
      where build.details->>'release_generation_key'='issue97-release-20260815-r2') then
    raise exception 'Issue #97 ODOT canonical migration stamped a historical build as r2';
  end if;
  if private_verification.brinesearch_issue97_graph_build_release_current(
       'adfcc2c9-e9e9-463c-9f49-a2d2a329f1de'::uuid
     ) or private_verification.brinesearch_issue97_graph_build_release_current(
       '1998882b-0874-40bc-befd-72e2ffabd9b4'::uuid
     ) then
    raise exception 'Issue #97 ODOT canonical migration silently grandfathered an r1 Ohio canary';
  end if;

  if public.brinesearch_issue97_cutover_active() is distinct from v_before.cutover_active
     or (select count(*) from public.brinesearch_road_graph_builds) is distinct from v_before.build_count
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       build.id::text||':'||pg_catalog.to_jsonb(build)::text,'|' order by build.id
     ),'')) from public.brinesearch_road_graph_builds build)
       is distinct from v_before.build_state_digest
     or (select count(*) from public.brinesearch_road_graph_builds where status='staging')
       is distinct from v_before.staging_count
     or (select count(*) from public.brinesearch_road_junctions) is distinct from v_before.junction_count
     or (select count(*) from public.brinesearch_road_junction_anchors) is distinct from v_before.anchor_count
     or (select count(*) from public.brinesearch_road_junction_memberships)
       is distinct from v_before.membership_count
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)
       is distinct from v_before.reconciliation_count
     or (select count(*) from private_verification.brinesearch_google_route_receipts_issue97)
       is distinct from v_before.google_receipt_count
     or (select count(*) from public.brinesearch_driver_google_routes_public)
       is distinct from v_before.public_google_count
     or (select count(*) from private_verification.brinesearch_issue97_verification_reports)
       is distinct from v_before.verification_report_count
     or (select count(*) from private_verification.brinesearch_issue97_release_manifests)
       is distinct from v_before.release_manifest_count
     or (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifests)
       is distinct from v_before.state_manifest_count then
    raise exception 'Issue #97 ODOT canonical migration changed protected release/graph state';
  end if;
end
$issue97_odot_canonical_verify$;

comment on function public.brinesearch_issue97_rebuild_county_graph(text,text) is
  'Issue #97 authoritative county graph builder, release generation r2. Ohio PRIMARY_OVERLAP_ID provenance is attached only through exact canonical-grid source coverage, and every admitted target pair must exactly equal verified persisted pair provenance before validation. Persistent source geometry is unchanged; fuzzy/name/nearest topology selection remains forbidden.';
